const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { readFluentField } = require('../helpers/fluent-source.cjs');

function embeddedScript(path, marker) {
    const source = fs.readFileSync(path, 'utf8');
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    let script;
    function visit(node) {
        if (ts.isNoSubstitutionTemplateLiteral(node) && node.text.includes(marker)) {
            script = node.text;
        }
        if (ts.isPropertyAssignment(node) && (ts.isTemplateExpression(node.initializer)
            || (ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'Now.include'))) {
            const included = readFluentField(path, node.name.getText(ast));
            if (included.includes(marker)) script = included;
        }
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(script, `embedded script containing ${marker}`);
    return script;
}

const html = embeddedScript(
    'src/fluent/generated/client-development/ui-script/sys_ui_script_9996546a8327321070b8b5dfeeaad317.now.ts',
    'function _formatHtml'
);
const htmlContext = vm.createContext({});
vm.runInContext(
    html.slice(html.indexOf('    var VOID_ELEMENTS ='), html.indexOf('    // Extends Monaco')) +
    html.slice(html.indexOf('    /* HTML Formatting'), html.indexOf('    // LinkedEditingRangeProvider')),
    htmlContext
);

test('HTML formatting preserves textarea and pre content and is stable', () => {
    for (const [source, expected] of [
        ['<textarea></textarea>', '<textarea></textarea>\n'],
        ['<div><textarea></textarea></div>', '<div>\n    <textarea></textarea>\n</div>\n'],
        ['<textarea>\nfirst\n\nsecond\n</textarea>', '<textarea>\nfirst\n\nsecond\n</textarea>\n'],
        ['<pre> x </pre>', '<pre> x </pre>\n']
    ]) {
        const once = htmlContext._formatHtml(source, { tabSize: 4, insertSpaces: true });
        assert.equal(once, expected);
        assert.equal(htmlContext._formatHtml(once, { tabSize: 4, insertSpaces: true }), expected);
    }
});

test('HTML formatting preserves quoted values, raw bodies and inline text', () => {
    for (const source of [
        '<div title="it\'s  fine" ng-if="c.x > 1 && c.y < 2"></div>',
        '<div title="first\n  second"></div>',
        '<script>const message = `first\n  second`;</script>',
        '<style>div::after { content: "a  b"; }</style>',
        '<script></script>', '<style></style>',
        '<textarea>unfinished  text', '<pre>unfinished  text',
        '<textarea>literal </textarea-other> text</textarea>',
        '<span>A</span><!-- comment --><span>B</span>'
    ]) {
        const expected = /<\/(div|script|style|textarea|span)>$/.test(source) ? source + '\n' : source;
        const once = htmlContext._formatHtml(source, {});
        assert.equal(once, expected);
        assert.equal(htmlContext._formatHtml(once, {}), once);
    }
    const inline = htmlContext._formatHtml('<span class="x"\n      title="test">Hello</span>', {});
    assert.match(inline, /title="test">Hello<\/span>/);
    const nestedInline = htmlContext._formatHtml('<span>Go <a href="x"\n title="test">here</a></span>', {});
    assert.match(nestedInline, /\n {12}title="test">here<\/a><\/span>/);
    assert.equal(htmlContext._formatHtml(nestedInline, {}), nestedInline);
});

test('HTML closing tags follow typing offsets and ignore self-closing tags and quoted text', () => {
    let attach;
    const context = vm.createContext({
        WeakSet, VOID_ELEMENTS: { input: 1 }, _htmlEditorsWithHandlers: new WeakSet(),
        _htmlAutoCloseTagsEnabled: true,
        monaco: { KeyCode: { Enter: 3 }, editor: { onDidCreateEditor(handler) { attach = handler; } } }
    });
    vm.runInContext(html.slice(html.indexOf('    function _getHtmlTagContext'),
        html.indexOf('    // Returns { typed, range } when the cursor is inside a class=')), context);
    vm.runInContext(html.slice(html.indexOf('    function _isAngularObjectAttribute'),
        html.indexOf('    function _makeIndent')), context);
    vm.runInContext(html.slice(html.indexOf('        _attachHtmlEditor = function (editor)'),
        html.indexOf('        // 6. HTML document formatting')), context);
    function typeGreaterThan(value, offset = value.length - 1) {
        let changed, edit;
        const model = {
            getLanguageId: () => 'html',
            getValue: () => value,
            getOffsetAt: position => position.column - 1,
            getPositionAt: index => ({ lineNumber: 1, column: index + 1 }),
            getValueInRange: range => value.slice(range.startColumn - 1, range.endColumn - 1)
        };
        attach({
            onDidChangeModelContent(callback) { changed = callback; }, onKeyDown() {},
            getModel: () => model,
            getPosition: () => ({ lineNumber: 1, column: offset + 1 }),
            executeEdits(source, edits) { edit = edits[0]; }, setPosition() {}
        });
        changed({ changes: [{ text: '>', rangeOffset: offset }] });
        return edit;
    }
    assert.equal(typeGreaterThan('<div>').text, '</div>');
    assert.equal(typeGreaterThan('<my-widget />'), undefined);
    assert.equal(typeGreaterThan('<input>'), undefined);
    assert.equal(typeGreaterThan('<div ng-if="c.x >'), undefined);
    assert.equal(typeGreaterThan('<script>const text = "<div>'), undefined);
    assert.equal(typeGreaterThan('<div></div>', 4), undefined);
    assert.equal(typeGreaterThan('<div>\n</DIV>', 4), undefined);
});

test('HTML declarations finish formatting without hanging', () => {
    htmlContext.input = '<!DOCTYPE html>\n<div></div>';
    vm.runInContext('output = _formatHtml(input, {})', htmlContext, { timeout: 200 });
    assert.equal(htmlContext.output, '<!DOCTYPE html>\n<div></div>\n');
});

test('multiline Angular class and style expressions align under their opening delimiter', () => {
    const source = '<div ng-if="test">\n    <span ng-class="{\n    \'test\': true,\n    \'test2\': false\n    }"\n          required>\n    </span>\n</div>';
    const expected = '<div ng-if="test">\n    <span ng-class="{\n' +
        ' '.repeat(24) + '\'test\': true,\n' +
        ' '.repeat(24) + '\'test2\': false\n' +
        ' '.repeat(20) + '}"\n          required>\n    </span>\n</div>\n';
    const once = htmlContext._formatHtml(source, { tabSize: 4, insertSpaces: true });
    assert.equal(once, expected);
    assert.equal(htmlContext._formatHtml(once, { tabSize: 4, insertSpaces: true }), once);

    for (const attribute of ['ng-style', 'data-ng-class', 'ng-class-even', 'x-ng-class-odd']) {
        const nested = `<span ${attribute}="{\n 'text': 'a  b { c',\n 'nested': {\n 'enabled': true\n }\n}">text</span>`;
        const formatted = htmlContext._formatHtml(nested, { tabSize: 2 });
        assert.match(formatted, /'text': 'a  b \{ c'/);
        assert.equal(htmlContext._formatHtml(formatted, { tabSize: 2 }), formatted);
        assert.match(formatted, /\n +\}\">text<\/span>/);
    }
    const literal = '<div title="{\n    literal  text\n}"></div>';
    assert.equal(htmlContext._formatHtml(literal, {}), literal + '\n');
    const encoded = '<span ng-class="{\n \'label\': &#39;a { b&#39;\n}">text</span>';
    const encodedOnce = htmlContext._formatHtml(encoded, {});
    assert.match(encodedOnce, /&#39;a \{ b&#39;/);
    assert.equal(htmlContext._formatHtml(encodedOnce, {}), encodedOnce);
    const tabbedArray = '<div>\n\t<span ng-class="[\n \'first\',\n {\n \'second\': true\n }\n]">\n\t</span>\n</div>';
    const arrayOnce = htmlContext._formatHtml(tabbedArray, { insertSpaces: false, tabSize: 4 });
    assert.match(arrayOnce, /\t<span ng-class="\[\n {24}'first',/);
    assert.equal(htmlContext._formatHtml(arrayOnce, { insertSpaces: false, tabSize: 4 }), arrayOnce);
});

test('HTML formatter returns no edit for stable text and a narrow edit for changes', () => {
    let provider;
    const monaco = {
        Range: function (startLineNumber, startColumn, endLineNumber, endColumn) {
            Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
        },
        languages: { registerDocumentFormattingEditProvider(language, value) {
            assert.equal(language, 'html');
            provider = value;
        } }
    };
    const context = vm.createContext({ monaco, _formatHtml: htmlContext._formatHtml });
    vm.runInContext(html.slice(html.indexOf('        // 6. HTML document formatting'),
        html.indexOf('        // 7. Linked editing')), context);
    context._registerFormattingProvider(monaco);
    function model(value) {
        return {
            getValue: () => value,
            getPositionAt(offset) {
                const before = value.slice(0, offset).split('\n');
                return { lineNumber: before.length, column: before.at(-1).length + 1 };
            }
        };
    }
    assert.equal(provider.provideDocumentFormattingEdits(model('<textarea></textarea>\n'), {}).length, 0);
    const edits = provider.provideDocumentFormattingEdits(model('<textarea></textarea>'), {});
    assert.equal(edits.length, 1);
    assert.equal(edits[0].range.startColumn, 22);
    assert.equal(edits[0].range.endColumn, 22);
    assert.equal(edits[0].text, '\n');
});

test('HTML Enter aligns attributes and following siblings when handlers attach after editor creation', () => {
    let createdHandler;
    const context = vm.createContext({
        WeakSet,
        VOID_ELEMENTS: { input: 1, br: 1 },
        _htmlEditorsWithHandlers: new WeakSet(),
        _htmlAutoCloseTagsEnabled: true,
        monaco: { KeyCode: { Enter: 3 }, editor: {
            EditorOption: { autoIndent: 1, readOnly: 2 },
            onDidCreateEditor(handler) { createdHandler = handler; }
        } }
    });
    vm.runInContext(html.slice(html.indexOf('    function _getHtmlTagContext'),
        html.indexOf('    // Returns { typed, range } when the cursor is inside a class=')), context);
    vm.runInContext(html.slice(html.indexOf('    function _isAngularObjectAttribute'),
        html.indexOf('    function _makeIndent')), context);
    vm.runInContext(html.slice(html.indexOf('        _attachHtmlEditor = function (editor)'),
        html.indexOf('        // 6. HTML document formatting')), context);

    function pressEnter(value, options = {}) {
        const callbacks = [];
        const lines = value.split('\n');
        function offsetAt(position) {
            let offset = position.column - 1;
            for (let i = 0; i < position.lineNumber - 1; i++) offset += lines[i].length + 1;
            return offset;
        }
        const model = {
            getLanguageId: () => 'html',
            getValueInRange: range => value.slice(offsetAt({ lineNumber: range.startLineNumber,
                column: range.startColumn }), offsetAt({ lineNumber: range.endLineNumber,
                column: range.endColumn })),
            getPositionAt(offset) {
                const prefix = value.slice(0, offset).split('\n');
                return { lineNumber: prefix.length, column: prefix.at(-1).length + 1 };
            },
            getLineContent: lineNumber => lines[lineNumber - 1],
            getOptions: () => ({ tabSize: 4, insertSpaces: true })
        };
        let edit, position;
        const editor = {
            onDidChangeModelContent() {},
            onKeyDown(callback) { callbacks.push(callback); },
            getModel: () => model,
            getDomNode: () => null,
            getPosition: () => model.getPositionAt(options.offset ?? value.length),
            getOption: key => key === 1 ? (options.autoIndent ?? 4) : !!options.readOnly,
            getSelections: () => Array.from({ length: options.cursors ?? 1 },
                () => ({ isEmpty: () => !options.selected })),
            executeEdits(source, edits) { edit = edits[0]; },
            setPosition(value) { position = value; }
        };
        createdHandler(editor);
        context._attachHtmlEditor(editor);
        assert.equal(callbacks.length, 1);
        callbacks[0]({ keyCode: 3, preventDefault() {}, stopPropagation() {} });
        return { edit, position };
    }

    assert.equal(pressEnter('<div').edit.text, '\n     ');
    const indented = pressEnter('\t<div class="x"');
    assert.equal(indented.edit.text, '\n         ');
    assert.equal(indented.position.column, 10);
    const sibling = pressEnter('<textarea ng-if="c"\n          class="test"\n          required></textarea>');
    assert.equal(sibling.edit.text, '\n');
    assert.equal(sibling.position.column, 1);
    const nestedSibling = pressEnter('  <textarea ng-if="c"\n            required></textarea>');
    assert.equal(nestedSibling.edit.text, '\n  ');
    assert.equal(nestedSibling.position.column, 3);
    assert.equal(pressEnter('  <input\n          required>').edit.text, '\n  ');
    assert.equal(pressEnter('<div>').edit.text, '\n    ');
    assert.equal(pressEnter('  <div\n       class="x">').edit.text, '\n      ');
    const pair = '  <div\n       class="x"></div>';
    assert.equal(pressEnter(pair, { offset: pair.indexOf('</div>') }).edit.text, '\n      \n  ');
    assert.equal(pressEnter('<div ng-if="a > b && a < c"').edit.text, '\n     ');
    assert.equal(pressEnter('<div title="it\'s fine"').edit.text, '\n     ');
    assert.equal(pressEnter('<div', { autoIndent: 0 }).edit, undefined);
    assert.equal(pressEnter('<div', { cursors: 2 }).edit, undefined);
    assert.equal(pressEnter('<div', { selected: true }).edit, undefined);
    assert.equal(pressEnter('<div', { readOnly: true }).edit, undefined);
    assert.equal(pressEnter('<textarea>literal <div></div>').edit, undefined);
    assert.equal(pressEnter('  <script>const tag = "<script>";</script>').edit.text, '\n  ');
    const angular = pressEnter('    <span ng-class="{');
    assert.equal(angular.edit.text, '\n' + ' '.repeat(24));
    assert.equal(angular.position.column, 25);
    const angularPair = '    <span ng-class="{}">';
    assert.equal(pressEnter(angularPair, { offset: angularPair.indexOf('}') }).edit.text,
        '\n' + ' '.repeat(24) + '\n' + ' '.repeat(20));
    assert.equal(pressEnter('<div title="{').edit, undefined);
    assert.equal(pressEnter('<span ng-class="{ \'text\': \'literal').edit, undefined);
});

const page = embeddedScript(
    'src/fluent/generated/other/sys-ui-page/sys_ui_page_8b2e70458373fe1070b8b5dfeeaad35e.now.ts',
    'function _removeLeadingCssRuleGaps'
);
const cssContext = vm.createContext({ monaco: { Range: function (
    startLineNumber, startColumn, endLineNumber, endColumn
) { Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn }); } } });
vm.runInContext(page.slice(page.indexOf('                function _removeLeadingCssRuleGaps'),
    page.indexOf('                // Calls the TypeScript worker')), cssContext);

test('CSS and SCSS formatting removes only the gap before a first nested rule', () => {
    const formatted = 'ul {\n\n    li {\n        color: red;\n    }\n\n    li:first-of-type {\n        font-weight: 600;\n    }\n}';
    assert.equal(cssContext._removeLeadingCssRuleGaps(formatted),
        'ul {\n    li {\n        color: red;\n    }\n\n    li:first-of-type {\n        font-weight: 600;\n    }\n}');
    assert.equal(cssContext._removeLeadingCssRuleGaps('ul {\n\n    color: red;\n}'),
        'ul {\n\n    color: red;\n}');
    assert.equal(cssContext._removeLeadingCssRuleGaps('ul {\n\n    li,\n    a {\n        color: red;\n    }\n}'),
        'ul {\n    li,\n    a {\n        color: red;\n    }\n}');
});

test('CSS and SCSS formatting keeps existing same-line block comments', () => {
    const before = '.parent {\n  color:red; /* colour */\n  .child { /* nested */\n    width:1px;\n  }\n}';
    const formatted = '.parent {\n    color: red;\n    /* colour */\n    .child {\n        /* nested */\n        width: 1px;\n    }\n}';
    const restored = cssContext._restoreInlineCssComments(before, formatted);
    assert.match(restored, /color: red; \/\* colour \*\//);
    assert.match(restored, /\.child \{ \/\* nested \*\//);
    assert.doesNotMatch(restored, /\n\s*\/\* (colour|nested) \*\//);
});

test('CSS post-format correction edits only the changed span', () => {
    const before = 'ul {\n\n    li {\n        color: red;\n    }\n}';
    const after = cssContext._removeLeadingCssRuleGaps(before);
    const model = { getPositionAt(offset) {
        const prefix = before.slice(0, offset).split('\n');
        return { lineNumber: prefix.length, column: prefix.at(-1).length + 1 };
    } };
    let edit;
    cssContext._applyCssFormattingEdit({ executeEdits(source, edits) {
        edit = edits[0];
    } }, model, before, after);
    assert.equal(edit.range.startLineNumber, 2);
    assert.equal(edit.range.endLineNumber, 3);
    assert.equal(edit.text, '');
});

test('JavaScript document and paste formatting align block comments without changing literals', async () => {
    const providers = {};
    let value;
    const host = {
        getScriptFileNames: () => ['test.js'], getScriptVersion: () => '0',
        getScriptSnapshot: file => file === 'test.js' ? ts.ScriptSnapshot.fromString(value) : undefined,
        getCurrentDirectory: () => '', getCompilationSettings: () => ({ allowJs: true }),
        getDefaultLibFileName: () => '', fileExists: () => true, readFile: () => '', readDirectory: () => []
    };
    let service;
    const monaco = {
        Range: class { constructor(a, b, c, d) { Object.assign(this, { startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d }); } },
        languages: {
            typescript: { getJavaScriptWorker: () => Promise.resolve(() => service) },
            registerDocumentFormattingEditProvider: (language, provider) => { providers.document = provider; },
            registerDocumentRangeFormattingEditProvider: (language, provider) => { providers.range = provider; }
        },
        editor: { tokenize(text) {
            const temp = ts.createLanguageService({ ...host, getScriptSnapshot: file => file === 'test.js' ? ts.ScriptSnapshot.fromString(text) : undefined });
            const comments = temp.getSyntacticClassifications('test.js', { start: 0, length: text.length }).filter(item => item.classificationType === 'comment');
            let offset = 0;
            const result = text.split('\n').map(line => {
                const tokens = [{ offset: 0, type: '' }];
                for (const comment of comments) {
                    const start = Math.max(offset, comment.textSpan.start);
                    const end = Math.min(offset + line.length, comment.textSpan.start + comment.textSpan.length);
                    if (start < end) tokens.push({ offset: start - offset, type: 'comment.js' }, { offset: end - offset, type: '' });
                }
                offset += line.length + 1;
                return tokens.sort((a, b) => a.offset - b.offset);
            });
            temp.dispose();
            return result;
        } }
    };
    const context = vm.createContext({ window: { monaco }, monaco, $scope: { userPrefs: { tabSize: 4, insertSpaceBeforeFuncParen: false } }, _jsFormattingProviderRegistered: false });
    vm.runInContext(page.slice(page.indexOf('                function _registerJsFormattingProvider'), page.indexOf('                function initEditorForPane')), context);
    context._registerJsFormattingProvider();
    function model() {
        return {
            uri: { toString: () => 'test.js' }, getValue: () => value, getVersionId: () => 1, isDisposed: () => false,
            getLanguageId: () => 'javascript',
            getOffsetAt: pos => value.split('\n').slice(0, pos.lineNumber - 1).reduce((sum, line) => sum + line.length + 1, 0) + pos.column - 1,
            getPositionAt: offset => { const lines = value.slice(0, offset).split('\n'); return { lineNumber: lines.length, column: lines.at(-1).length + 1 }; }
        };
    }
    async function format(range) {
        service = ts.createLanguageService(host);
        const m = model();
        const edits = range ? await providers.range.provideDocumentRangeFormattingEdits(m, range, { insertSpaces: true }) : await providers.document.provideDocumentFormattingEdits(m, { insertSpaces: true });
        for (const edit of edits) value = value.slice(0, m.getOffsetAt({ lineNumber: edit.range.startLineNumber, column: edit.range.startColumn })) + edit.text + value.slice(m.getOffsetAt({ lineNumber: edit.range.endLineNumber, column: edit.range.endColumn }));
        service.dispose();
        return edits;
    }
    for (const paste of [false, true]) {
        value = "(function() {\n    /*\n    * original\n    */\n    function original() {}\n\n    /*\n        *\n        * test\n        */\n    function goHello() {\n        console.log('hi');\n    }\n})();";
        const range = { startLineNumber: 7, startColumn: 5, endLineNumber: 14, endColumn: 6 };
        await format(paste ? range : undefined);
        assert.match(value, /    \/\*\n    \*\n    \* test\n    \*\//);
        const stable = value;
        assert.equal((await format(paste ? range : undefined)).length, 0);
        assert.equal(value, stable);
    }
    value = '(function() {\n    /**\n     * description\n     *   indented detail\n     */\n    const text = `/*\n        * literal\n        */`;\n})();';
    await format();
    assert.match(value, /     \*   indented detail/);
    assert.match(value, /`\/\*\n        \* literal\n        \*\/`/);
    value = '(function() {\n    /*\n        * outside selection\n        */\n    const x=1;\n})();';
    await format({ startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: 15 });
    assert.match(value, /        \* outside selection/);
});

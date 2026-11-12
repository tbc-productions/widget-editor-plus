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
vm.runInContext('this.INLINE_ELEMENTS = INLINE_ELEMENTS; this.VOID_ELEMENTS = VOID_ELEMENTS;', htmlContext);

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

test('HTML formatting indents block content inside inline elements and keeps tag structure', () => {
    const options = { tabSize: 4, insertSpaces: true };
    for (const [source, expected] of [
        ['<a href="#"><div>card</div></a>', '<a href="#">\n    <div>card</div>\n</a>\n'],
        ['<span><script>x()</script></span>', '<span>\n    <script>x()</script>\n</span>\n'],
        ['<div><input type="text"></input><p>x</p></div>', '<div>\n    <input type="text"></input>\n    <p>x</p>\n</div>\n'],
        ['<ul><li>a<li>b</ul>', '<ul>\n    <li>\n        a\n    <li>\n        b\n</ul>\n'],
        ['<div><p>x</p></section></div>', '<div>\n    <p>x</p>\n    </section>\n</div>\n'],
        ['<div class="a"\n     id="b"\n>\n</div>', '<div class="a"\n     id="b">\n</div>\n'],
        ['<input type="text"\n   ng-model="c.x"\n   />', '<input type="text"\n       ng-model="c.x" />\n'],
        ['<div><script>\n  run();\n</script></div>', '<div>\n    <script>\n  run();\n    </script>\n</div>\n'],
        ['<div>\r\n  <pre>a\r\nb</pre>\r\n</div>\r\n', '<div>\n    <pre>a\nb</pre>\n</div>\n'],
        ['<![CDATA[ a > b ]]><p>x</p>', '<![CDATA[ a > b ]]>\n<p>x</p>\n']
    ]) {
        const once = htmlContext._formatHtml(source, options);
        assert.equal(once, expected);
        assert.equal(htmlContext._formatHtml(once, options), expected);
    }
});

test('HTML formatting keeps comment layout, Angular expressions and rendered spacing', () => {
    const options = { tabSize: 4, insertSpaces: true };
    for (const [source, expected] of [
        ['<div>\n<!--\n<ul>\n    <li>old</li>\n\n</ul>\n-->\n</div>', '<div>\n    <!--\n    <ul>\n        <li>old</li>\n\n    </ul>\n    -->\n</div>\n'],
        ['  <!-- first\n       second -->', '<!-- first\n     second -->\n'],
        ['<p>{{ c.count <c.limit }} of {{ c.total>0 }}</p>', '<p>{{ c.count <c.limit }} of {{ c.total>0 }}</p>\n'],
        ['<p>{{ c.pad  +  \'a  b\' }}   text</p>', '<p>{{ c.pad  +  \'a  b\' }} text</p>\n'],
        ['<p>one<span>\ntwo</span>three</p>', '<p>\n    one<span>\n        two</span>three\n</p>\n'],
        ['<div>\n\n    text\n</div>', '<div>\n\n    text\n</div>\n']
    ]) {
        const once = htmlContext._formatHtml(source, options);
        assert.equal(once, expected);
        assert.equal(htmlContext._formatHtml(once, options), expected);
    }
});

test('HTML formatting of generated markup is stable and never changes content or inline spacing', () => {
    let seed = 20261112;
    const random = limit => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % limit; };
    const pick = list => list[random(list.length)];
    const gap = () => pick(['', '', '', ' ', '\n', '\n\n', '  \n  ', '\t', '\r\n']);
    const attributes = () => pick(['', '', ' class="a b"', ' ng-if="c.x > 1"', ' class="a"\n   id="b"',
        '\n  ng-class="{\n \'a\': b,\n   \'c\': d\n}"', ' title=\'x "y"\'', ' disabled', ' ng-repeat="i in c.list"\n ng-click="c.go(i)"\n']);
    function node(depth) {
        const kind = random(20);
        if (depth > 5 || kind < 5) return pick(['text', 'two  words', '{{c.x}}', '{{ a < b }}', '&nbsp;', 'a\nb', 'x > y', '1 < 2']);
        if (kind < 6) return '<' + pick(['br', 'input', 'img', 'hr']) + attributes() + pick(['>', '/>', ' />']);
        if (kind < 7) return pick(['<!-- c -->', '<!--\n  multi\n    line\n-->', '<!-- a\n     b -->']);
        if (kind < 8) return pick(['<pre>  a\n   b </pre>', '<textarea>\n t </textarea>', '<script>\n  var a = "<div>";\n</script>', '<style>.a{b:c}</style>']);
        const name = kind < 14 ? pick(['div', 'p', 'ul', 'li', 'section', 'table', 'tr', 'td', 'my-el', 'option'])
            : pick(['span', 'a', 'b', 'i', 'button', 'label']);
        let markup = '<' + name + attributes() + '>';
        for (let child = random(4); child > 0; child--) markup += gap() + node(depth + 1);
        return markup + gap() + (random(12) ? '</' + name + '>' : '');
    }
    const inlineFlow = token => token.type === 'text' || (token.type === 'tag' &&
        (htmlContext.INLINE_ELEMENTS[token.tagName] || htmlContext.VOID_ELEMENTS[token.tagName]));
    const tokens = text => htmlContext._tokenizeHtmlForFormat(text, 4).filter(token => token.type !== 'preserved');
    for (let sample = 0; sample < 1500; sample++) {
        let source = '';
        for (let roots = 1 + random(3); roots > 0; roots--) source += node(0) + gap();
        for (const insertSpaces of [true, false]) {
            const options = { tabSize: 4, insertSpaces };
            const once = htmlContext._formatHtml(source, options);
            assert.equal(htmlContext._formatHtml(once, options), once, 'stable: ' + JSON.stringify(source));
            assert.equal(once.replace(/\s+/g, ''), source.replace(/\s+/g, ''), 'content: ' + JSON.stringify(source));
            assert.ok(!once.includes('\r'), 'line endings: ' + JSON.stringify(source));
            const before = tokens(source.replace(/\r\n?/g, '\n')), after = tokens(once);
            assert.equal(after.length, before.length, 'structure: ' + JSON.stringify(source));
            for (let i = 1; i < before.length; i++) {
                if (inlineFlow(before[i]) && inlineFlow(before[i - 1])) {
                    assert.equal(!!after[i].hadSpace, !!before[i].hadSpace, 'spacing: ' + JSON.stringify(source));
                }
            }
        }
    }
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
    assert.equal(provider.provideDocumentFormattingEdits(model('<div>\r\n    <p>a</p>\r\n</div>\r\n'), {}).length, 0);
    const windows = provider.provideDocumentFormattingEdits(model('<div>\r\n<p>a</p>\r\n</div>\r\n'), {});
    assert.deepEqual({ ...windows[0].range }, { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 });
    assert.equal(windows[0].text, '    ');
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
    let edit;
    const editor = { executeEdits(source, edits) { edit = edits[0]; } };
    cssContext._applyCssFormattingEdit(editor, before, after);
    assert.equal(edit.range.startLineNumber, 2);
    assert.equal(edit.range.endLineNumber, 3);
    assert.equal(edit.text, '');
    edit = undefined;
    cssContext._applyCssFormattingEdit(editor, after, after);
    assert.equal(edit, undefined);
});

test('CSS post-format corrections handle Windows line endings', () => {
    assert.equal(cssContext._removeLeadingCssRuleGaps('ul {\r\n\r\n    li {\r\n        color: red;\r\n    }\r\n}'),
        'ul {\n    li {\n        color: red;\n    }\n}');
    const restored = cssContext._restoreInlineCssComments('a {\r\n  color:red; /* colour */\r\n}',
        'a {\r\n    color: red;\r\n    /* colour */\r\n}');
    assert.equal(restored, 'a {\n    color: red; /* colour */\n}');
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
    let service, workerRequests = 0, models = [];
    const monaco = {
        Range: class { constructor(a, b, c, d) { Object.assign(this, { startLineNumber: a, startColumn: b, endLineNumber: c, endColumn: d }); } },
        languages: {
            // The first refusal mirrors a worker that is still loading when the editor is created.
            typescript: { getJavaScriptWorker: () => workerRequests++ ? Promise.resolve(() => service) : Promise.reject(new Error('JavaScript not registered!')) },
            registerDocumentFormattingEditProvider: (language, provider) => { providers.document = provider; },
            registerDocumentRangeFormattingEditProvider: (language, provider) => { providers.range = provider; },
            registerOnTypeFormattingEditProvider: (language, provider) => { providers.type = provider; }
        },
        editor: { getModels: () => models, tokenize(text) {
            const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
            const comments = [];
            for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
                if (kind === ts.SyntaxKind.MultiLineCommentTrivia || kind === ts.SyntaxKind.SingleLineCommentTrivia) {
                    comments.push({ start: scanner.getTokenStart(), end: scanner.getTokenEnd() });
                }
            }
            let offset = 0;
            return text.split('\n').map(line => {
                const tokens = [{ offset: 0, type: '' }];
                for (const comment of comments) {
                    const start = Math.max(offset, comment.start);
                    const end = Math.min(offset + line.length, comment.end);
                    if (start < end) tokens.push({ offset: start - offset, type: 'comment.js' }, { offset: end - offset, type: '' });
                }
                offset += line.length + 1;
                return tokens.sort((a, b) => a.offset - b.offset);
            });
        } }
    };
    const userPrefs = { tabSize: 4, insertSpaceBeforeFuncParen: false };
    const context = vm.createContext({ window: { monaco }, monaco, $scope: { userPrefs }, _jsFormattingProviderRegistered: {}, setTimeout: callback => setImmediate(callback) });
    vm.runInContext(page.slice(page.indexOf('                function _minimalFormattingEdit'), page.indexOf('                function initEditorForPane')), context);
    await context._registerJsFormattingProvider();
    assert.equal(workerRequests, 0, 'the worker is not requested before a JavaScript editor exists');
    assert.equal(providers.document, undefined);
    models = [{ getLanguageId: () => 'javascript' }];
    await context._registerJsFormattingProvider();
    assert.ok(providers.document, 'registration survives a worker that is not ready yet');
    function model() {
        return {
            uri: { toString: () => 'test.js' }, getValue: () => value, getVersionId: () => 1, isDisposed: () => false,
            getLanguageId: () => 'javascript',
            getOffsetAt: pos => value.split('\n').slice(0, pos.lineNumber - 1).reduce((sum, line) => sum + line.length + 1, 0) + pos.column - 1,
            getPositionAt: offset => { const lines = value.slice(0, offset).split('\n'); return { lineNumber: lines.length, column: lines.at(-1).length + 1 }; }
        };
    }
    async function format(range, insertSpaces = true) {
        service = ts.createLanguageService(host);
        const m = model();
        const edits = range ? await providers.range.provideDocumentRangeFormattingEdits(m, range, { insertSpaces }) : await providers.document.provideDocumentFormattingEdits(m, { insertSpaces });
        for (const edit of edits) value = value.slice(0, m.getOffsetAt({ lineNumber: edit.range.startLineNumber, column: edit.range.startColumn })) + edit.text + value.slice(m.getOffsetAt({ lineNumber: edit.range.endLineNumber, column: edit.range.endColumn }));
        service.dispose();
        return edits;
    }
    for (const paste of [false, true]) {
        value = "(function() {\n    /*\n    * original\n    */\n    function original() {}\n\n    /*\n        *\n        * test\n        */\n    function goHello() {\n        console.log('hi');\n    }\n})();";
        const range = { startLineNumber: 7, startColumn: 5, endLineNumber: 14, endColumn: 6 };
        await format(paste ? range : undefined);
        assert.match(value, /    \/\*\n     \*\n     \* test\n     \*\//);
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
    for (const opening of ['/*', '/**']) {
        for (const closing of ['', '\n*/']) {
            value = opening + '\n* description' + closing;
            await format();
            assert.equal(value, opening + '\n * description' + (closing ? '\n */' : ''));
            assert.equal((await format()).length, 0, 'block comment alignment is stable');
        }
    }
    const pasted = {
        '/**\n         * Does a thing.\n\n         * @param {string} a - A.\n         */\nfunction inner(a) {}':
            '    /**\n     * Does a thing.\n\n     * @param {string} a - A.\n     */\n    function inner(a) {}',
        '/** Does a thing.\n         * @param {string} a - A.\n         */\nfunction inner(a) {}':
            '    /** Does a thing.\n     * @param {string} a - A.\n     */\n    function inner(a) {}',
        '/*\n         Does a thing.\n           Detail.\n         */\nfunction inner(a) {}':
            '    /*\n       Does a thing.\n         Detail.\n     */\n    function inner(a) {}'
    };
    for (const [clip, expected] of Object.entries(pasted)) {
        for (const column of [1, 5]) {
            value = 'function outer() {\n' + ' '.repeat(column - 1) + clip + '\n}';
            const lines = value.split('\n');
            await format({ startLineNumber: 2, startColumn: column, endLineNumber: lines.length - 1, endColumn: lines.at(-2).length + 1 });
            assert.equal(value, 'function outer() {\n' + expected + '\n}');
            assert.equal((await format()).length, 0, 'pasted block comment alignment is stable');
        }
    }
    value = 'function example() {\n\t/*\n\t* description\n\t*/\n\treturn "a\tb";\n}';
    await format();
    assert.equal(value, 'function example() {\n    /*\n     * description\n     */\n    return "a\tb";\n}');
    value = 'function example() {\n\tconst text = `first\n\tliteral tab\n`;\n\treturn text;\n}';
    await format();
    assert.match(value, /\n    const text/);
    assert.match(value, /`first\n\tliteral tab\n`/);
    value = 'function example() {\n    return 1;\n}';
    await format(undefined, false);
    assert.match(value, /\n\treturn 1;/, 'tab indentation remains available when spaces are disabled');

    value = 'function example() {\r\n/*\r\n* description\r\n*/\r\nreturn  1;\r\n}\r\n';
    const windowsEdits = await format();
    value = value.replace(/\r?\n/g, '\r\n');
    assert.equal(value, 'function example() {\r\n    /*\r\n     * description\r\n     */\r\n    return 1;\r\n}\r\n');
    assert.ok(!windowsEdits[0].text.includes('\r'));
    assert.equal((await format()).length, 0, 'Windows line endings are stable');

    value = 'function example() {\n    /*\n        * runs past the selection\n        */\n    return 1;\n}';
    await format({ startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 30 });
    assert.match(value, /\n        \* runs past the selection\n        \*\//);

    assert.deepEqual([...providers.type.autoFormatTriggerCharacters], [';', '}', '\n']);
    async function type(source) {
        value = source;
        service = ts.createLanguageService(host);
        const m = model();
        const position = m.getPositionAt(value.length);
        const edits = await providers.type.provideOnTypeFormattingEdits(m, position, value.at(-1), { insertSpaces: true });
        for (const edit of [...edits].reverse()) value = value.slice(0, m.getOffsetAt({ lineNumber: edit.range.startLineNumber, column: edit.range.startColumn })) + edit.text + value.slice(m.getOffsetAt({ lineNumber: edit.range.endLineNumber, column: edit.range.endColumn }));
        service.dispose();
    }
    await type('var run = function() {\nreturn  1;\n}');
    assert.equal(value, 'var run = function() {\n    return 1;\n}', 'typing matches Format Document');
    await format();
    assert.equal(value, 'var run = function() {\n    return 1;\n}');
    userPrefs.insertSpaceBeforeFuncParen = true;
    await type('var run = function() {\nreturn  1;\n}');
    assert.equal(value, 'var run = function () {\n    return 1;\n}');
});

test('editor creation, preference updates and formatting keep editor and model indentation consistent', async () => {
    const ast = ts.createSourceFile('editor.js', page, ts.ScriptTarget.Latest, true);
    let wrapper, editorOptions;
    function find(node) {
        if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'monacoEditors[pane.key]' && ts.isObjectLiteralExpression(node.right)) wrapper = node.right.getText(ast);
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'initEditorForPane') {
            function findOptions(child) {
                if (ts.isCallExpression(child) && child.expression.getText(ast) === 'monaco.editor.create') editorOptions = child.arguments[1].getText(ast);
                ts.forEachChild(child, findOptions);
            }
            findOptions(node);
        }
        ts.forEachChild(node, find);
    }
    find(ast);
    assert.ok(wrapper); assert.ok(editorOptions);
    const bootstrap = fs.readFileSync('src/fluent/generated/client-development/ui-script/monaco_plus_bootstrap.js', 'utf8');
    const bootstrapAst = ts.createSourceFile('bootstrap.js', bootstrap, ts.ScriptTarget.Latest, true);
    let mergePrefs;
    function findMerge(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === '_mergePrefsIntoOptions') mergePrefs = node.getText(bootstrapAst);
        ts.forEachChild(node, findMerge);
    }
    findMerge(bootstrapAst);
    for (const spaces of [false, true]) {
        for (const fail of [false, true]) {
            const editor = {}, model = {};
            let optionsAtFormat;
            const context = vm.createContext({
                $scope: { userPrefs: { formatTabsToSpaces: spaces, tabSize: 4 } },
                isJs: true, lang: 'javascript', value: '\tcode', readOnly: false,
                _buildFontFamily: () => '', _resolveMonacoTheme: () => 'vs',
                ed: { updateOptions: opts => Object.assign(editor, opts), getModel: () => ({
                    updateOptions: opts => Object.assign(model, opts), isDisposed: () => false, getLanguageId: () => 'javascript',
                }), getAction: () => ({ run: () => {
                    optionsAtFormat = { editor: editor.insertSpaces, model: model.insertSpaces };
                    return fail ? Promise.reject(new Error('Worker failed')) : Promise.resolve();
                } }) },
            });
            vm.runInContext('wrapper = ' + wrapper + '; options = ' + editorOptions + ';' + mergePrefs, context);
            assert.equal(context.options.insertSpaces, spaces);
            assert.equal(context.options.detectIndentation, false);
            const shared = context._mergePrefsIntoOptions(context.$scope.userPrefs, { detectIndentation: true });
            assert.equal(shared.insertSpaces, spaces); assert.equal(shared.detectIndentation, false);
            context.wrapper.format(spaces);
            await new Promise(resolve => setImmediate(resolve));
            assert.deepEqual(optionsAtFormat, { editor: spaces, model: spaces });
            assert.equal(editor.insertSpaces, spaces); assert.equal(model.insertSpaces, spaces);
            context.$scope.userPrefs.formatTabsToSpaces = !spaces;
            context.$scope.userPrefs.tabSize = 2;
            context.wrapper.updateOptions({ insertSpaces: !spaces, tabSize: 2 });
            assert.equal(editor.insertSpaces, !spaces); assert.equal(model.insertSpaces, !spaces);
            assert.equal(model.tabSize, 2);
        }
    }
});

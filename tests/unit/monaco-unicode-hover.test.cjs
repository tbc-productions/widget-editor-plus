const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { readFluentField } = require('../helpers/fluent-source.cjs');

const path = 'src/fluent/generated/client-development/ui-script/sys_ui_script_ca35f99983f7725070b8b5dfeeaad31e.now.ts';
const script = readFluentField(path, 'script');

function setup() {
    const providers = {}, calls = [];
    const monaco = {
        languages: { registerHoverProvider(language, provider) { calls.push(language); providers[language] = provider; } },
        Range: function (startLineNumber, startColumn, endLineNumber, endColumn) {
            Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
        }
    };
    const context = { _ensureMonacoCss() {}, _ensureHoverCodeColorFix() {} };
    vm.createContext(context);
    vm.runInContext(script.slice(script.indexOf('    var _unicodeHoverMonaco'), script.indexOf('    var _coreLoadPromise')), context);
    context.registerUnicodeHover(monaco);
    return { calls, context, monaco, hover(line, column, language = 'json') {
        return providers[language].provideHover({ getLineContent: () => line, getLanguageId: () => language }, { lineNumber: 2, column });
    } };
}

test('Unicode hovers register once per Monaco instance for JSON and JavaScript languages', () => {
    const { calls, context, monaco } = setup();
    context.registerUnicodeHover(monaco);
    assert.deepEqual(calls, ['json', 'jsonc', 'javascript', 'typescript']);
    context.registerUnicodeHover(null);
    context.registerUnicodeHover({});
});

test('hover matches only the escape under the pointer and includes its code point', () => {
    const { hover } = setup();
    const line = String.raw`{"marker":"\u21aa", "currency":"\u20ac"}`;
    const start = line.indexOf('\\u21aa');
    for (let i = start; i < start + 6; i++) {
        const result = hover(line, i + 1);
        assert.equal(result.contents[0].value, '**Unicode preview:** ↪\n\nU+21AA');
        assert.equal(result.range.startColumn, start + 1);
        assert.equal(result.range.endColumn, start + 7);
    }
    assert.equal(hover(line, start), null);
    assert.equal(hover(line, start + 7), null);
    assert.equal(hover(line, line.indexOf('currency') + 1), null);
    assert.equal(hover(line, line.indexOf('\\u20ac') + 2).contents[0].value, '**Unicode preview:** €\n\nU+20AC');
});

test('either half of a surrogate pair previews one emoji across the complete range', () => {
    const { hover } = setup();
    const line = String.raw`"\ud83c\udd95"`;
    for (let column = 2; column < 14; column++) {
        const result = hover(line, column);
        assert.equal(result.contents[0].value, '**Unicode preview:** 🆕\n\nU+1F195');
        assert.equal(result.range.startColumn, 2);
        assert.equal(result.range.endColumn, 14);
    }
});

test('literal backslashes and malformed or unpaired escapes have no preview', () => {
    const { hover } = setup();
    for (const line of [String.raw`"\\u21aa"`, String.raw`"\uZZZZ"`, String.raw`"\u123"`, String.raw`"\ud800"`, String.raw`"\udc00"`]) {
        for (let column = 1; column <= line.length; column++) assert.equal(hover(line, column), null, line);
    }
    assert.equal(hover(String.raw`"\\\u21aa"`, 4).contents[0].value, '**Unicode preview:** ↪\n\nU+21AA');
});

test('braced code points work for JavaScript but are not treated as JSON escapes', () => {
    const { hover } = setup();
    for (const language of ['javascript', 'typescript']) {
        assert.equal(hover(String.raw`"\u{1F600}"`, 3, language).contents[0].value, '**Unicode preview:** 😀\n\nU+1F600');
        assert.equal(hover(String.raw`"\u{110000}"`, 3, language), null);
        assert.equal(hover(String.raw`"\u{D800}"`, 3, language), null);
    }
    for (const language of ['json', 'jsonc']) assert.equal(hover(String.raw`"\u{1F600}"`, 3, language), null);
});

test('preview is safe plain Markdown, while whitespace and control characters are labelled', () => {
    const { hover } = setup();
    for (const [escape, expected] of [['\\u000a', 'LINE FEED'], ['\\u0020', 'SPACE'], ['\\u200d', 'ZERO WIDTH JOINER'], ['\\u202e', 'Non\\-printing character'], ['\\u0026', '&amp;'], ['\\u003c', '&lt;'], ['\\u0060', '\\`']]) {
        const result = hover('"' + escape + '"', 3);
        assert.ok(result.contents[0].value.startsWith('**Unicode preview:** ' + expected + '\n\nU+'));
        assert.equal(result.contents[0].isTrusted, false);
        assert.equal(result.contents[0].supportHtml, false);
    }
});

test('keycap escapes preview the whole visible character from either component', () => {
    const { hover } = setup();
    for (const line of [String.raw`"1\ufe0f\u20e3"`, String.raw`"\u0031\ufe0f\u20e3"`]) {
        for (let column = 2; column < line.length; column++) {
            const result = hover(line, column);
            assert.ok(result, line + ' column ' + column);
            assert.equal(result.contents[0].value, '**Unicode preview:** 1️⃣\n\nU+0031 U+FE0F U+20E3');
            assert.equal(result.range.startColumn, 2);
            assert.equal(result.range.endColumn, line.length);
        }
    }
    assert.match(hover(String.raw`"\ufe0f"`, 3).contents[0].value, /EMOJI VARIATION SELECTOR/);
});

test('standalone Unicode hover registration installs native Monaco styles once', () => {
    const elements = [];
    const window = { _snBlobWorkerPatchInstalled: true, document: {
        querySelector: () => elements.find(node => node.href === '/monacoIncludes.cssx'),
        getElementById: id => elements.find(node => node.id === id),
        createElement: tagName => ({ tagName }),
        head: { appendChild: node => elements.push(node) }
    } };
    vm.runInNewContext(script, { window });
    const monaco = { languages: { registerHoverProvider() {} } };
    window.SNMonacoPlusBootstrap.registerUnicodeHover(monaco);
    window.SNMonacoPlusBootstrap.registerUnicodeHover(monaco);
    assert.equal(elements.length, 2);
    assert.equal(elements[0].rel, 'stylesheet');
    assert.equal(elements[0].href, '/monacoIncludes.cssx');
    assert.equal(elements[1].id, 'sn-monaco-plus-hover-code-fix');
});

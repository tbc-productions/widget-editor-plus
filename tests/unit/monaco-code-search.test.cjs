const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/fluent/generated/client-development/ui-script/monaco_plus_core.js', 'utf8');
const start = source.indexOf('                monaco.editor.addEditorAction({');
const end = source.indexOf('                if (global.SNMonacoPlusBootstrap', start);

function setup() {
    let action;
    const opened = [];
    vm.runInNewContext(source.slice(start, end), {
        monaco: { editor: { addEditorAction(value) { action = value; } } },
        global: { open(...args) { opened.push(args); } },
    });
    return { action, opened };
}

test('shared Monaco action searches selected text using the verified Code Search+ page', () => {
    const { action, opened } = setup();
    assert.equal(action.label, 'Find in Code Search+');
    assert.equal(action.precondition, 'editorHasSelection');
    assert.equal(action.contextMenuGroupId, 'navigation');
    const selection = { isEmpty: () => false };
    const query = 'api.get("a&b+#?=c");\n// café ↪';
    action.run({
        getModel: () => ({ getValueInRange(range) { assert.equal(range, selection); return '  ' + query + '  '; } }),
        getSelection: () => selection,
    });
    assert.equal(opened.length, 1);
    const [url, target, features] = opened[0];
    const navigation = new URL(url, 'https://instance.test');
    assert.equal(navigation.pathname, '/nav_to.do');
    assert.equal(navigation.searchParams.size, 1);
    const parsed = new URL(navigation.searchParams.get('uri'), 'https://instance.test');
    assert.equal(parsed.pathname, '/ui_page.do');
    const keys = fs.readFileSync('src/fluent/generated/keys.ts', 'utf8');
    const pageId = keys.match(/id: '([a-f0-9]{32})'\s+key: \{\s+name: 'widget_editor_code_search'/)[1];
    assert.equal(parsed.searchParams.get('sys_id'), pageId);
    assert.equal(parsed.searchParams.get('q'), query);
    assert.equal(parsed.searchParams.size, 2);
    assert.equal(target, '_blank');
    assert.equal(features, 'noopener');
});

test('Code Search+ does not open without a model or meaningful selection', () => {
    const { action, opened } = setup();
    for (const [model, selection] of [
        [null, { isEmpty: () => false }],
        [{}, null],
        [{}, { isEmpty: () => true }],
        [{ getValueInRange: () => ' \n\t ' }, { isEmpty: () => false }],
    ]) {
        action.run({ getModel: () => model, getSelection: () => selection });
    }
    assert.equal(opened.length, 0);
});

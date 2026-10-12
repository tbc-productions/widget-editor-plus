const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const file = 'src/fluent/generated/other/sys-ui-page/widget_editor_plus.client.js';
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

function loadFunction(context, name) {
    let found;
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
        if (
            ts.isFunctionExpression(node) &&
            ts.isBinaryExpression(node.parent) &&
            node.parent.left.getText(ast) === '$scope.' + name
        )
            found = node;
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(found, name);
    vm.runInContext('var ' + name + ' = ' + found.getText(ast) + ';', context);
    return context[name];
}

test('editor focus waits for the helper and does not activate a pane after focus moves or it closes', async () => {
    let callback;
    function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'ed.onDidFocusEditorText')
            callback = node.arguments[0];
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(callback);
    for (const state of ['focused', 'blurred', 'closed']) {
        let ready;
        const calls = [];
        const context = vm.createContext({
            window: {
                SNMonacoPlusBootstrap: {
                    ensureCoreLoaded: () =>
                        new Promise((resolve) => {
                            ready = resolve;
                        }),
                },
            },
            ed: {
                getModel: () => (state === 'closed' ? null : { id: 'client' }),
                hasTextFocus: () => state === 'focused',
            },
            _jsScriptKind: 'client',
        });
        vm.runInContext('(' + callback.getText(ast) + ')()', context);
        assert.deepEqual(calls, []);
        ready({ notifyScriptContextFocus: (...args) => calls.push(args) });
        await Promise.resolve();
        assert.deepEqual(calls, state === 'focused' ? [['client', 'client']] : []);
    }
});

test('name checks ignore stale replies, including replies during debounce and after clearing the name', async () => {
    const pending = [],
        timers = [];
    const timeout = (callback) => timers.push(callback);
    timeout.cancel = () => {};
    const context = vm.createContext({
        $scope: {},
        $timeout: timeout,
        _paneIdDebounceMap: {},
        monacoEditors: {},
        ajax: () => new Promise((resolve) => pending.push(resolve)),
    });
    loadFunction(context, 'checkPaneId');
    const changed = loadFunction(context, 'onPaneIdChange');
    const pane = {
        key: 'provider',
        recordType: 'provider',
        recordId: 'available',
    };
    changed(pane);
    timers.pop()();
    pane.recordId = 'taken';
    changed(pane);
    pending[0]({ success: true, exists: false });
    await Promise.resolve();
    assert.equal(pane.editorUnlocked, false);
    assert.equal(pane.idChecking, true);
    timers.pop()();
    pending[1]({ success: true, exists: true });
    await Promise.resolve();
    assert.equal(pane.idError, 'ID already exists');
    pane.recordId = 'another';
    changed(pane);
    timers.pop()();
    pane.recordId = '';
    changed(pane);
    pending[2]({ success: true, exists: false });
    await Promise.resolve();
    assert.equal(pane.editorUnlocked, false);
    assert.equal(pane.idChecking, false);
});

test('failed name validation leaves the editor locked and explains the failure', async () => {
    const context = vm.createContext({
        monacoEditors: {},
        ajax: async () => ({ success: false, error: 'Access denied' }),
    });
    const check = loadFunction(context, 'checkPaneId');
    const pane = { recordId: 'name', recordType: 'template' };
    check(pane);
    await Promise.resolve();
    assert.equal(pane.editorUnlocked, false);
    assert.equal(pane.idError, 'Access denied');
});

test('failed related-pane saves retain unsaved content, display the error and never close the pane', async () => {
    for (const recordType of ['script_include', 'template', 'provider']) {
        let closed = false;
        const context = vm.createContext({
            SYS_ID: 'widget',
            monacoEditors: {},
            ajax: async () => ({ success: false, error: 'Write failed' }),
        });
        const save = loadFunction(context, 'saveExtraPane');
        const pane = {
            key: 'pane',
            recordType,
            recordId: 'test',
            sys_id: 'record',
            dirty: true,
            content: 'unsaved',
            lastServerContent: 'saved',
        };
        save(pane, () => {
            closed = true;
        });
        await Promise.resolve();
        assert.equal(pane.saveError, 'Write failed');
        assert.equal(pane.dirty, true);
        assert.equal(pane.content, 'unsaved');
        assert.equal(pane.lastServerContent, 'saved');
        assert.equal(pane._pendingSaveContent, undefined);
        assert.equal(closed, false);
    }
});

test('failed field saves retain dirty state and show an error while dirty', async () => {
    const context = vm.createContext({
        SYS_ID: 'widget',
        $scope: { widget: {} },
        monacoEditors: {},
        _selfSavingFields: {},
        ajax: async () => ({ success: false, error: 'Write failed' }),
    });
    const save = loadFunction(context, 'savePaneField');
    const pane = { key: 'script', field: 'script', dirty: true };
    save(pane);
    await Promise.resolve();
    assert.equal(pane.saveError, 'Write failed');
    assert.equal(pane.dirty, true);
    const html = fs.readFileSync(file.replace('.client.js', '.html'), 'utf8');
    const expression = html.match(/class="we-pane-save-error" ng-if="([^"]+)"/)[1].replace(/&amp;/g, '&');
    assert.equal(vm.runInNewContext(expression, { item: pane }), 'Write failed');
});

test('ES12 failure restores the saved setting instead of reporting a new ES12 record', async () => {
    const applied = [];
    const context = vm.createContext({
        SYS_ID: 'widget',
        $scope: { widget: { es12: true }, es12RecordExists: false },
        _es12Enabled: false,
        _applyEsVersion: (value) => applied.push(value),
        ajax: async () => ({ success: false, error: 'Write failed' }),
    });
    loadFunction(context, 'saveEs12')();
    await Promise.resolve();
    assert.equal(context.$scope.widget.es12, false);
    assert.equal(context.$scope.es12RecordExists, false);
    assert.equal(context.$scope.saveError, 'Write failed');
    assert.deepEqual(applied, []);
});

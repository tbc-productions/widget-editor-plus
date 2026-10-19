const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus.client.js', 'utf8');
const sync = source.slice(source.indexOf('function _acceptCompareSave('), source.indexOf('// No version_id in the URL'));
const origin = 'https://example.service-now.com';
const recordId = 'a'.repeat(32);

function editor(value) { return { value, getValue() { return this.value; }, setValue(value) { this.value = value; } }; }
function harness() {
    const fields = ['template', 'css', 'client_script', 'script', 'link'];
    const iframe = { contentWindow: {} }, listeners = {}, writes = [], requests = [], timers = [];
    const scope = { recordTable: 'sp_widget', widget: { sys_id: recordId, name: 'Before', description: 'Local description' },
        coreEditorDefs: fields.map(field => ({ key: 'pane-' + field, field })),
        headerDirty: { name: true, description: true }, versionDiffModal: { open: true },
        $applyAsync() {}, $apply(fn) { fn(); } };
    const ctx = { $scope: scope, originalValues: {}, lastServerValues: {}, originalHeader: { name: 'Before', description: 'Saved description', custom: 'Before', controller_as: 'c' },
        monacoEditors: {}, paneMap: {}, _selfSavingFields: {}, _draftJson: { option_schema: { base: '{}', value: '{"local":true}' } },
        _optionSchemaEditor: editor('{"local":true}'), _demoDataEditor: null,
        _hasProperJsonObjectValue: value => !!Object.keys(JSON.parse(value)).length,
        _writeLocalDraft: cleanup => writes.push(cleanup),
        $timeout: (fn, delay) => timers.push({ fn, delay }),
        ajax: (name, params) => { requests.push({ name, params }); return Promise.resolve({ success: true, versions: ['new version'] }); },
        document: { querySelector: () => iframe },
        window: { location: { origin }, addEventListener: (name, fn) => { listeners[name] = fn; } } };
    for (const field of fields) {
        scope.widget[field] = ctx.originalValues[field] = ctx.lastServerValues[field] = 'before ' + field;
        ctx.paneMap['pane-' + field] = { dirty: true, saveError: 'Old error', externalChange: { serverVal: 'old' } };
        if (field !== 'link') ctx.monacoEditors['pane-' + field] = editor('local ' + field);
    }
    ctx.paneMap.related = { dirty: true }; ctx.monacoEditors.related = editor('unrelated local edit');
    vm.runInNewContext(sync, ctx);
    const event = (data, overrides = {}) => ({ origin, source: iframe.contentWindow, data: { type: 'we-diff-saved', table: 'sp_widget', recordId, values: { template: 'merged' }, ...data }, ...overrides });
    return { scope, ctx, iframe, writes, requests, timers, receive: listeners.message, event };
}

test('saving in Compare+ updates every core field, hidden panes, headers and JSON drafts without losing other edits', async () => {
    const h = harness();
    const values = Object.fromEntries(h.scope.coreEditorDefs.map(def => [def.field, 'merged ' + def.field]));
    Object.assign(values, { name: 'Merged name', custom: 'Merged custom', controller_as: '', option_schema: '{"merged":true}', demo_data: '{}' });
    h.receive(h.event({ values, sys_updated_on: 'now', sys_updated_by: 'editor' }));
    for (const def of h.scope.coreEditorDefs) {
        assert.equal(h.scope.widget[def.field], values[def.field]);
        assert.equal(h.ctx.originalValues[def.field], values[def.field]);
        assert.equal(h.ctx.lastServerValues[def.field], values[def.field]);
        if (h.ctx.monacoEditors[def.key]) assert.equal(h.ctx.monacoEditors[def.key].getValue(), values[def.field]);
        assert.equal(h.ctx.paneMap[def.key].dirty, false);
        assert.equal(h.ctx.paneMap[def.key].externalChange, null);
        assert.equal(h.ctx.paneMap[def.key].saveError, null);
    }
    assert.equal(h.scope.widget.name, 'Merged name'); assert.equal(h.ctx.originalHeader.name, 'Merged name');
    assert.equal(h.ctx.originalHeader.custom, 'Merged custom'); assert.equal(h.ctx.originalHeader.controller_as, 'c');
    assert.equal(h.scope.headerDirty.name, false); assert.equal(h.scope.widget.sys_updated_on, 'now');
    assert.equal(h.scope.widget.sys_updated_by, 'editor');
    assert.equal(h.ctx._optionSchemaEditor.getValue(), values.option_schema);
    assert.equal(h.ctx._draftJson.option_schema.base, values.option_schema);
    assert.equal(h.ctx._draftJson.option_schema.value, values.option_schema);
    assert.equal(h.scope.widget.option_schema_has_value, true); assert.equal(h.scope.widget.demo_data_has_value, false);
    assert.equal(h.scope.widget.description, 'Local description'); assert.equal(h.scope.headerDirty.description, true);
    assert.equal(h.ctx.originalHeader.description, 'Saved description');
    assert.equal(h.ctx.monacoEditors.related.getValue(), 'unrelated local edit'); assert.equal(h.ctx.paneMap.related.dirty, true);
    assert.deepEqual(h.writes, [true]);
    await Promise.resolve();
    assert.deepEqual(h.scope.versions, ['new version']);
    assert.equal(h.requests[0].name, 'getVersions'); assert.equal(h.requests[0].params.sys_id, recordId);
    h.ctx._selfSavingFields.template = 'a newer save'; h.timers.forEach(timer => timer.fn());
    assert.equal(h.ctx._selfSavingFields.template, 'a newer save'); assert.equal(h.ctx._selfSavingFields.css, undefined);
});

test('Compare+ updates generic record panes and keeps the primary display name baseline consistent', () => {
    const h = harness(); h.scope.recordTable = 'sys_ui_script'; h.scope.isWidgetRecord = false; h.scope.recordPrimaryField = 'id';
    h.ctx.originalHeader.id = 'before';
    h.receive(h.event({ table: 'sys_ui_script', values: { id: 'merged_id', script: 'merged script' } }));
    assert.equal(h.ctx.monacoEditors['pane-script'].getValue(), 'merged script');
    assert.equal(h.scope.widget.id, 'merged_id'); assert.equal(h.ctx.originalHeader.id, 'merged_id');
    assert.equal(h.scope.widget.name, 'merged_id'); assert.equal(h.ctx.originalHeader.name, 'merged_id');
    assert.equal(h.scope.headerDirty.name, false);
});

test('saved notifications require the active iframe, matching origin and record, current view and string values', () => {
    for (const change of [
        h => h.event({}, { origin: 'https://other.example' }), h => h.event({}, { source: {} }),
        h => h.event({ table: 'sys_ui_script' }), h => h.event({ recordId: 'b'.repeat(32) }),
        h => h.event({ values: null }), h => h.event({ values: [] }), h => h.event({ values: { template: 1 } }),
        h => { h.scope.versionDiffModal.open = false; return h.event({}); },
        h => { h.scope.isVersionView = true; return h.event({}); },
        h => { h.ctx.document.querySelector = () => null; return h.event({}); },
    ]) {
        const h = harness(); h.receive(change(h));
        assert.equal(h.scope.widget.template, 'before template'); assert.equal(h.ctx.monacoEditors['pane-template'].getValue(), 'local template');
        assert.equal(h.writes.length, 0); assert.equal(h.requests.length, 0);
    }
});

test('an actual Compare+ iframe refreshes every editor through Angular without a nested digest or a page reload', async () => {
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.route(origin + '/editor', route => route.fulfill({ contentType: 'text/html', body: '<div id="fixture"><span ng-bind="widget.name"></span><iframe class="we-diff-iframe" srcdoc="Compare+"></iframe></div>' }));
        await page.goto(origin + '/editor');
        await page.addScriptTag({ content: fs.readFileSync(require.resolve('angular/angular.min.js'), 'utf8') });
        await page.evaluate(({ sync, recordId }) => {
            angular.module('compareSyncTest', []).run(function ($rootScope, $timeout, $q) {
                const $scope = $rootScope;
                Object.assign($scope, { recordTable: 'sp_widget', widget: { sys_id: recordId, name: 'Before' }, headerDirty: {}, versionDiffModal: { open: true },
                    coreEditorDefs: ['template', 'css', 'client_script', 'script', 'link'].map(field => ({ field, key: 'pane-' + field })) });
                const originalHeader = { name: 'Before' }, originalValues = {}, lastServerValues = {}, paneMap = {}, monacoEditors = {}, _selfSavingFields = {}, _draftJson = {};
                let _optionSchemaEditor = null, _demoDataEditor = null;
                const _hasProperJsonObjectValue = () => false, _writeLocalDraft = () => {};
                const ajax = () => $q.resolve({ success: true, versions: ['saved version'] });
                for (const def of $scope.coreEditorDefs) {
                    originalValues[def.field] = 'before'; paneMap[def.key] = { dirty: true };
                    monacoEditors[def.key] = { value: 'before', getValue() { return this.value; }, setValue(value) {
                        this.value = value;
                        $scope.$apply(() => { paneMap[def.key].dirty = this.value !== originalValues[def.field]; });
                    } };
                }
                eval(sync);
                window.editorState = { scope: $scope, originalValues, paneMap, monacoEditors };
            });
            angular.bootstrap(document.getElementById('fixture'), ['compareSyncTest']);
        }, { sync, recordId });
        const child = page.frames().find(frame => frame.parentFrame());
        await child.evaluate(({ recordId, origin }) => {
            window.parent.postMessage({ type: 'we-diff-saved', table: 'sp_widget', recordId,
                values: { template: 'merged HTML', css: 'merged CSS', client_script: 'merged client', script: 'merged server', link: 'merged link', name: 'Merged name' },
                sys_updated_on: 'now', sys_updated_by: 'editor' }, origin);
        }, { recordId, origin });
        await page.getByText('Merged name', { exact: true }).waitFor();
        const state = await page.evaluate(() => {
            const { scope, originalValues, paneMap, monacoEditors } = editorState;
            return { values: Object.fromEntries(scope.coreEditorDefs.map(def => [def.field, monacoEditors[def.key].getValue()])),
                originalValues, clean: Object.values(paneMap).every(pane => !pane.dirty), versions: scope.versions };
        });
        assert.deepEqual(state.values, { template: 'merged HTML', css: 'merged CSS', client_script: 'merged client', script: 'merged server', link: 'merged link' });
        assert.deepEqual(state.originalValues, state.values); assert.equal(state.clean, true);
        assert.deepEqual(state.versions, ['saved version']); assert.equal(page.url(), origin + '/editor');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});

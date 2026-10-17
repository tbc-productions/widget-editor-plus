const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = 'src/fluent/generated/';
const script = fs.readFileSync(root + 'other/sys-ui-page/widget_editor_assistant.client.js', 'utf8');
const serverScript = fs.readFileSync(root + 'server-development/script-include/sys_script_include_widget_editor_assistant.server.js', 'utf8');

function client(extra = {}) {
    const ctrl = { previousVersionRecords: {}, related: [], rows: [], visibleRows: [],
        primary: { table: 'sp_widget', sysId: 'primary' }, updateSets: [],
        isExportBlocked: table => table === 'blocked', rowSizeBytes: {}, ...extra };
    const context = { ctrl, Blob, angular: { noop() {} }, $timeout: fn => fn(),
        rowKey: row => row.table + ':' + row.sys_id,
        runPool: async (rows, worker) => Promise.all(rows.map(worker)),
        ajax: async () => ({ success: true, found: true, payload: 'old' }),
        rebuildGraph() {}, ...extra.context };
    vm.createContext(context);
    vm.runInContext(script.slice(script.indexOf('ctrl.canIncludePreviousVersion ='), script.indexOf('// Graph-only aggregation:')), context);
    vm.runInContext(script.slice(script.indexOf('var _pendingPreviousVersionFetches ='), script.indexOf('ctrl.generateXml = async')), context);
    return { ctrl, context };
}

test('individual history loads only for requested records and contributes to the visible token estimate', async () => {
    const primary = { table: 'sp_widget', sys_id: 'primary', checked: true };
    const other = { table: 'sp_widget', sys_id: 'other', checked: true };
    const member = { table: 'sp_widget', sys_id: 'member', checked: true, updateSetSysId: 'set' };
    const calls = [];
    const { ctrl, context } = client({ visibleRows: [primary, other, member],
        context: { ajax: async (method, params) => { calls.push({ method, ...params }); return { success: true, found: true, payload: '12345678' }; } } });
    ctrl.saveSelections = () => {};
    ctrl.toggleRecordPreviousVersion(primary);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sys_id, 'primary');
    assert.equal(calls[0].before, '');
    assert.equal(ctrl.includesPreviousVersion(member), undefined);
    assert.equal(primary.previousVersionBytes, 8);

    vm.runInContext(script.slice(script.indexOf('ctrl.rawTokenCount ='), script.indexOf('ctrl.estimatedTokens =')), context);
    ctrl.rowSizeBytes = { 'sp_widget:primary': 40, 'sp_widget:other': 40, 'sp_widget:member': 40 };
    assert.equal(ctrl.rawTokenCount(), 32);
    assert.equal(ctrl.sizesPending(), false);
    assert.equal(ctrl.tokenLoadFraction(), 1);
    ctrl.toggleRecordPreviousVersion(primary);
    assert.equal(ctrl.rawTokenCount(), 30);
    ctrl.toggleRecordPreviousVersion(primary);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1, 'successful snapshots are reused');
    for (const row of [{ table: 'blocked' }, { table: 'sys_db_object' }, member]) {
        assert.equal(ctrl.canIncludePreviousVersion(row), false);
    }
});

test('failed history can be retried and a record changed during lookup cannot receive the old snapshot', async () => {
    const row = { table: 'sp_widget', sys_id: 'first', checked: true };
    let resolve;
    const { ctrl, context } = client({ visibleRows: [row], context: { ajax: () => new Promise(done => { resolve = done; }) } });
    ctrl.saveSelections = () => {};
    ctrl.previousVersionRecords['sp_widget:first'] = true;
    const pending = context.refreshPreviousVersions([row]);
    row.sys_id = 'second';
    resolve({ success: true, found: true, payload: 'wrong record' });
    await pending;
    assert.equal(row.previousVersion, undefined);
    context.ajax = async () => { throw Error('Unavailable'); };
    ctrl.previousVersionRecords['sp_widget:second'] = true;
    await context.refreshPreviousVersions([row]);
    assert.equal(row.previousVersionError, true);
    assert.equal(ctrl.previousVersionsCalculating(), false);
    ctrl.toggleRecordPreviousVersion(row);
    context.ajax = async () => ({ success: true, found: false });
    ctrl.toggleRecordPreviousVersion(row);
    await new Promise(done => setImmediate(done));
    assert.equal(row.previousVersionError, false);
    assert.equal(row.isNewInUpdateSet, false);
});

test('individual history choices are persisted separately from the update set option and restored for the primary', async () => {
    let stored;
    const { ctrl, context } = client({ context: {
        localStorage: { setItem: (_key, value) => { stored = value; }, getItem: () => stored },
        storageKey: () => 'selection', dismissedSuggestionKeys: {}, $q: { resolve: () => Promise.resolve() },
        validateRowsNeedingLabel: () => Promise.resolve(),
    } });
    vm.runInContext(script.slice(script.indexOf('ctrl.saveSelections ='), script.indexOf('// Re-resolves label/tableLabel/updatedOn')), context);
    ctrl.previousVersionRecords['sp_widget:primary'] = true;
    ctrl.saveSelections();
    ctrl.previousVersionRecords = {};
    await context.loadStoredSelections();
    assert.equal(ctrl.previousVersionRecords['sp_widget:primary'], true);
    assert.equal(ctrl.includePreviousUpdates, false);
});

test('previous snapshot lookup skips the latest update only without an update set cutoff and respects blocked or missing records', () => {
    for (const scenario of ['individual', 'cutoff', 'missing-history', 'blocked', 'unreadable']) {
        const queries = [];
        const updates = scenario === 'missing-history' ? ['latest'] : ['latest', 'earlier'];
        let index = -1;
        const context = { Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
            Object: { extendsObject: (_, methods) => methods }, gs: { getProperty: () => '' },
            GlideRecordSecure: function (table) {
                this.isValid = () => true;
                this.get = () => scenario !== 'unreadable';
                this.addQuery = (...args) => queries.push(args);
                this.orderByDesc = this.query = () => {};
                this.setLimit = limit => queries.push(['limit', limit]);
                this.next = () => !!updates[++index];
                this.getValue = field => field === 'payload' ? updates[index] : '';
                this.getDisplayValue = () => '';
            } };
        vm.createContext(context);
        vm.runInContext(serverScript, context);
        const api = context.WidgetEditorAssistantAjax.prototype;
        api.getParameter = name => ({ table: 'sp_widget', sys_id: 'record', before: scenario === 'cutoff' ? '2026-01-01' : '' })[name];
        api._isTableExportBlocked = () => scenario === 'blocked';
        api._answer = result => result;
        const result = api.getPreviousUpdateXml();
        if (scenario === 'blocked' || scenario === 'unreadable') {
            assert.equal(result.success, false);
            assert.deepEqual(queries, []);
        } else if (scenario === 'missing-history') assert.equal(result.found, false);
        else {
            assert.equal(result.payload, scenario === 'cutoff' ? 'latest' : 'earlier');
            assert.ok(queries.some(query => query[0] === 'limit' && query[1] === (scenario === 'cutoff' ? 1 : 2)));
            assert.equal(queries.some(query => query[0] === 'sys_created_on'), scenario === 'cutoff');
        }
    }
});

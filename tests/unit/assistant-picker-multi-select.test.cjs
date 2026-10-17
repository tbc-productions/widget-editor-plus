const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFluentField } = require('../helpers/fluent-source.cjs');

const path = 'src/fluent/generated/other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts';
const script = readFluentField(path, 'clientScript');

test('record picker adds several records from one table and toggles selected records off', () => {
    let saves = 0;
    const ctrl = {
        lookup: { open: true, mode: 'add', chosenTable: 'sp_widget', tableLabel: 'Widget' },
        primary: { table: '', sysId: '' },
        related: [],
        saveSelections() { saves++; },
        closeLookup() { this.lookup.open = false; },
        removeRow(row) { this.related = this.related.filter(item => item !== row); this.saveSelections(); },
    };
    const context = {
        ctrl,
        rebuildRows() {},
        discoverGraphLinks() {},
        $timeout() {},
    };
    vm.createContext(context);
    vm.runInContext(script.slice(script.indexOf('function filterOutSelectedRecords('), script.indexOf('function loadRecords(')), context);
    vm.runInContext(script.slice(script.indexOf('ctrl.chooseRecord ='), script.indexOf('// Update Set Picker', script.indexOf('ctrl.chooseRecord ='))), context);

    const first = { sys_id: 'widget-1', label: 'First widget' };
    const second = { sys_id: 'widget-2', label: 'Second widget' };
    ctrl.chooseRecord(first);
    ctrl.chooseRecord(second);
    ctrl.chooseRecord(first);

    assert.equal(ctrl.lookup.open, true);
    assert.deepEqual(ctrl.related.map(row => row.sys_id), ['widget-2']);
    assert.equal(saves, 3);
    assert.equal(ctrl.isRecordSelected(first), false);
    ctrl.chooseRecord(first);
    assert.deepEqual(ctrl.related.map(row => row.sys_id), ['widget-2', 'widget-1']);
    assert.equal(context.filterOutSelectedRecords([first, second]).length, 2);
});

test('initial primary record keeps the picker open for more records, and can be toggled off', async () => {
    let finishPrimary;
    const primaryLoaded = new Promise(resolve => { finishPrimary = resolve; });
    const ctrl = {
        lookup: { open: true, mode: 'primary', chosenTable: 'sp_widget', tableLabel: 'Widget' },
        primary: { table: '', sysId: '' },
        related: [],
        saveSelections() {},
        closeLookup() { this.lookup.open = false; },
    };
    const context = {
        ctrl,
        rebuildRows() {},
        discoverGraphLinks() {},
        updatePrimaryUrl() {},
        clearPrimaryUrl() {},
        loadPrimaryContext: () => primaryLoaded,
        rowKey: row => row.table + ':' + row.sys_id,
        recordLinks: {},
        graphLinksScanned: {}, graphLinkRequests: {}, graphLinksGeneration: 0,
        dismissedSuggestionKeys: {},
        _scannedScriptKeys: {},
    };
    vm.createContext(context);
    vm.runInContext(script.slice(script.indexOf('ctrl.isRecordSelected ='), script.indexOf('function loadRecords(')), context);
    vm.runInContext(script.slice(script.indexOf('ctrl.chooseRecord ='), script.indexOf('// Update Set Picker', script.indexOf('ctrl.chooseRecord ='))), context);

    const first = { sys_id: 'widget-1', label: 'First widget' };
    const second = { sys_id: 'widget-2', label: 'Second widget' };
    ctrl.chooseRecord(first);
    assert.equal(ctrl.lookup.open, true);
    assert.equal(ctrl.lookup.mode, 'add');
    assert.equal(ctrl.isRecordSelected(first), true);
    ctrl.chooseRecord(second);
    assert.equal(ctrl.related.length, 0);
    finishPrimary();
    await primaryLoaded;
    await new Promise(resolve => setImmediate(resolve));
    ctrl.chooseRecord(second);
    assert.deepEqual(ctrl.related.map(row => row.sys_id), ['widget-2']);
    ctrl.chooseRecord(first);
    assert.equal(ctrl.primary.sysId, '');
    assert.deepEqual(ctrl.related.map(row => row.sys_id), ['widget-2']);
    assert.equal(ctrl.lookup.open, true);
});

test('primary picker removal protects the embedded host and preserves surviving relationships', () => {
    for (const embedded of [true, false]) {
        const primary = { table: 'sp_widget', sys_id: 'host', primary: true };
        const manual = { table: 'sp_widget', sys_id: 'manual', manual: true };
        const member = { table: 'sp_widget', sys_id: 'member', updateSetSysId: 'set-1' };
        const suggested = { table: 'sp_widget', sys_id: 'suggested', suggested: true };
        let saves = 0, cleared = 0, rebuilds = 0;
        const scans = [];
        const ctrl = {
            embeddedInModal: embedded,
            lookup: { mode: 'add', chosenTable: 'sp_widget' },
            primary: { table: 'sp_widget', sysId: 'host' },
            related: [primary, manual, member, suggested],
            saveSelections() { saves++; },
        };
        const context = {
            ctrl,
            rowKey: row => row.table + ':' + row.sys_id,
            clearPrimaryUrl() { cleared++; },
            rebuildRows() { rebuilds++; },
            discoverGraphLinks(rows) { scans.push(rows); },
            recordLinks: {
                retained: { source: 'sp_widget:manual', target: 'sp_widget:member' },
                fromHost: { source: 'sp_widget:host', target: 'sp_widget:manual' },
                toSuggestion: { source: 'sp_widget:member', target: 'sp_widget:suggested' },
            },
            graphLinksScanned: {}, graphLinkRequests: {}, graphLinksGeneration: 0,
            dismissedSuggestionKeys: {}, _scannedScriptKeys: {},
        };
        vm.createContext(context);
        vm.runInContext(script.slice(script.indexOf('function removePrimaryFromPicker('), script.indexOf('function loadRecords(')), context);
        vm.runInContext(script.slice(script.indexOf('ctrl.chooseRecord ='), script.indexOf('// Update Set Picker', script.indexOf('ctrl.chooseRecord ='))), context);
        ctrl.chooseRecord({ sys_id: 'host' });

        if (embedded) {
            assert.equal(ctrl.primary.sysId, 'host');
            assert.deepEqual(ctrl.related, [primary, manual, member, suggested]);
            assert.deepEqual(Object.keys(context.recordLinks), ['retained', 'fromHost', 'toSuggestion']);
            assert.equal(saves + cleared + rebuilds + scans.length, 0);
            assert.equal(context.graphLinksGeneration, 0);
        } else {
            assert.equal(ctrl.primary.sysId, '');
            assert.deepEqual(ctrl.related, [manual, member]);
            assert.deepEqual(Object.keys(context.recordLinks), ['retained']);
            assert.equal(saves, 1);
            assert.equal(cleared, 1);
            assert.equal(rebuilds, 1);
            assert.deepEqual(scans, [[manual, member]]);
            assert.equal(context.graphLinksGeneration, 1);
        }
    }
});

test('update set picker accepts multiple sets and toggles an added set off', async () => {
    const requests = [];
    const resolvers = {};
    const scans = [];
    let saves = 0;
    const ctrl = {
        usPicker: { open: true, pending: {}, error: '' },
        updateSets: [],
        related: [],
        primary: { table: '', sysId: '' },
        includePreviousUpdates: false,
        addingUpdateSet: false,
        saveSelections() { saves++; },
    };
    const context = {
        ctrl,
        ajax(_action, params) {
            requests.push(params.update_set);
            return new Promise(resolve => { resolvers[params.update_set] = resolve; });
        },
        rebuildRows() {},
        discoverGraphLinks(rows) { scans.push(rows.map(row => row.sys_id)); },
    };
    vm.createContext(context);
    vm.runInContext(script.slice(script.indexOf('ctrl.isUpdateSetSelected ='), script.indexOf('ctrl.removeUpdateSet =')), context);
    vm.runInContext(script.slice(script.indexOf('ctrl.removeUpdateSet ='), script.indexOf('// Drops every row this update set added')), context);

    const first = { sys_id: 'set-1', name: 'First set' };
    const second = { sys_id: 'set-2', name: 'Second set' };
    ctrl.chooseUpdateSet(first);
    ctrl.chooseUpdateSet(first);
    ctrl.chooseUpdateSet(second);
    assert.deepEqual(requests, ['set-1', 'set-2']);
    assert.equal(ctrl.addingUpdateSet, true);
    assert.equal(ctrl.usPicker.open, true);

    resolvers['set-1']({ success: true, members: [{ table: 'sp_widget', sys_id: 'widget-1', label: 'First widget' }] });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ctrl.addingUpdateSet, true);
    resolvers['set-2']({ success: true, members: [{ table: 'sp_widget', sys_id: 'widget-2', label: 'Second widget' }] });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(ctrl.usPicker.open, true);
    assert.deepEqual(ctrl.updateSets.map(set => set.sys_id), ['set-1', 'set-2']);
    assert.deepEqual(ctrl.related.map(row => row.sys_id), ['widget-1', 'widget-2']);
    assert.equal(ctrl.addingUpdateSet, false);
    assert.equal(saves, 2);
    assert.deepEqual(scans, [['widget-1'], ['widget-1', 'widget-2']]);
    ctrl.chooseUpdateSet(first);
    assert.deepEqual(ctrl.updateSets.map(set => set.sys_id), ['set-2']);
    assert.deepEqual(ctrl.related.map(row => row.sys_id), ['widget-2']);
    assert.deepEqual(requests, ['set-1', 'set-2']);
});

test('update-set records gain graph edges without adding suggested records', async () => {
    const first = { table: 'sp_widget', sys_id: 'widget-1', label: 'Widget', checked: true, updateSetSysId: 'set-1' };
    const second = { table: 'sp_angular_provider', sys_id: 'provider-1', label: 'Provider', checked: true, updateSetSysId: 'set-1' };
    const requests = [];
    let linkedProvider = 'provider-1';
    const ctrl = {
        related: [first], rows: [first], viewMode: 'graph',
        isExportBlocked: () => false, includesPreviousVersion: () => false, canIncludePreviousVersion: () => false, includePreviousUpdates: false, embeddedInModal: false,
    };
    const context = {
        ctrl,
        recordLinks: {}, graphLinksScanned: {}, graphLinkRequests: {}, graphLinksGeneration: 0, graphLinkScansPending: 0,
        rowKey: row => row.table + ':' + row.sys_id,
        tableLabel: table => table,
        rowMatchesActiveFilter: () => true,
        runPool: async (rows, worker) => Promise.all(rows.map(worker)),
        ajax: async (_action, params) => {
            requests.push(params.sys_id);
            return { success: true, related: params.sys_id === 'widget-1'
                ? [{ table: 'sp_angular_provider', sys_id: linkedProvider, category: 'Provider' },
                    { table: 'sys_script_include', sys_id: 'outside', category: 'Script Include' }]
                : [] };
        },
        $timeout: callback => callback(),
    };
    vm.createContext(context);
    vm.runInContext(script.slice(script.indexOf('function groupGraphChoices('), script.indexOf('ctrl.setViewMode =')), context);
    vm.runInContext(script.slice(script.indexOf('function discoverGraphLinks('), script.indexOf('// Scans table/sysId')), context);

    await context.discoverGraphLinks(ctrl.related);
    assert.equal(ctrl.graph.edges.length, 0);
    ctrl.related.push(second);
    ctrl.rows = ctrl.related;
    await context.discoverGraphLinks(ctrl.related);
    assert.deepEqual(requests, ['widget-1', 'provider-1']);
    assert.equal(ctrl.related.length, 2);
    assert.deepEqual(Array.from(ctrl.graph.edges, edge => edge.key), ['sp_widget:widget-1>sp_angular_provider:provider-1']);
    await context.discoverGraphLinks(ctrl.related);
    assert.equal(requests.length, 2, 'unchanged records are not rescanned');
    linkedProvider = 'provider-2';
    await context.discoverGraphLinks([first], true);
    assert.equal(ctrl.graph.edges.length, 0, 'refresh removes stale relationships');
});

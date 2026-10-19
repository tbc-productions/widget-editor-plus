const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { chromium } = require('@playwright/test');
const { readFluentField } = require('../helpers/fluent-source.cjs');

const root = 'src/fluent/generated/';
const uiPath = root + 'other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts';
const script = readFluentField(uiPath, 'clientScript');
const id = number => number.toString(16).padStart(32, '0');

function server(preferences) {
    const queries = [], reads = [];
    const context = {
        Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        Object: { extendsObject: (_, methods) => methods },
        gs: { getUserID: () => 'current-user', getProperty: (_name, fallback) => fallback },
        GlideRecordSecure: function (table) {
            const conditions = [];
            let current, rows = [];
            this.addQuery = (...args) => { conditions.push(args); queries.push([table, ...args]); };
            this.orderBy = this.setLimit = () => {};
            this.query = () => {
                rows = preferences.filter(pref => pref.user === 'current-user' &&
                    conditions.some(([field, operator, value]) => field === 'name' && operator === 'IN' && value.split(',').includes(pref.name)))
                    .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 1);
            };
            this.next = () => !!(current = rows.shift());
            this.getValue = field => current[field];
            this.isValid = () => table !== 'retired_table';
            this.get = sysId => { reads.push([table, sysId]); return sysId !== id(5); };
            this.canRead = () => table !== 'denied_table';
            this.getDisplayValue = field => field ? '19/10/2026' : 'Current ' + table;
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(root + 'server-development/script-include/sys_script_include_widget_editor_assistant.server.js', 'utf8'), context);
    const api = context.WidgetEditorAssistantAjax.prototype;
    api._answer = value => JSON.parse(JSON.stringify(value));
    api._getTableLabel = table => table === 'sp_widget' ? 'Widget' : 'Script Include';
    api._isTableExportBlocked = table => table === 'blocked_table';
    return { api, queries, reads };
}

function preference(value, name = 'monaco_plus.user_prefs', user = 'current-user') {
    return { name, user, value: typeof value === 'string' ? value : JSON.stringify(value) };
}

test('Recent uses the current user history in order, resolves current labels and excludes unavailable records', () => {
    const prefs = { recentRecords: [
        { table: 'sys_script_include', sys_id: id(1) },
        { table: 'sp_widget', sys_id: id(2) },
        { table: 'sp_widget', sys_id: id(2) },
        { table: 'blocked_table', sys_id: id(3) },
        { table: 'denied_table', sys_id: id(4) },
        { table: 'sp_widget', sys_id: id(5) },
        { table: 'retired_table', sys_id: id(6) },
        { table: 'bad.table', sys_id: id(7) },
        { table: 'sp_widget', sys_id: 'invalid' },
    ], recentWidgets: [id(2), id(8)] };
    const saved = preference(prefs);
    const { api, queries, reads } = server([
        preference({ recentWidgets: [id(99)] }, 'monaco_plus.user_prefs', 'other-user'),
        preference({ recentWidgets: [id(98)] }, 'widget_editor.visible_editors'), saved,
    ]);
    const result = api.getRecentRecords();
    assert.equal(result.success, true);
    assert.deepEqual(result.records.map(row => [row.table, row.sys_id]), [
        ['sys_script_include', id(1)], ['sp_widget', id(2)], ['sp_widget', id(8)],
    ]);
    assert.equal(result.records[0].label, 'Current sys_script_include');
    assert.equal(result.records[0].tableLabel, 'Script Include');
    assert.equal(result.records[0].updatedOn, '19/10/2026');
    assert.ok(queries.some(query => query[1] === 'user' && query[2] === 'current-user'));
    assert.ok(!reads.some(([table]) => table === 'blocked_table' || table === 'bad.table'));
    assert.equal(saved.value, JSON.stringify(prefs), 'history is read without saving preferences');
});

test('Recent supports legacy widget preferences, stays bounded and handles missing or malformed history', () => {
    const legacy = server([preference({ recentWidgets: Array.from({ length: 15 }, (_, index) => id(index + 20)) }, 'widget_editor.visible_editors')]);
    assert.equal(legacy.api.getRecentRecords().records.length, 10);
    for (const value of [{}, { recentRecords: [null, {}, { sys_id: id(1) }], recentWidgets: {} }, 'null']) {
        assert.deepEqual(server([preference(value)]).api.getRecentRecords(), { success: true, records: [] });
    }
    assert.deepEqual(server([]).api.getRecentRecords(), { success: true, records: [] });
    assert.deepEqual(server([preference('{broken')]).api.getRecentRecords(), { success: false, records: [] });
});

const pickerHelpers = script.slice(script.indexOf('function filterOutSelectedRecords('), script.indexOf('function loadRecords('));
const chooseRecord = script.slice(script.indexOf('ctrl.chooseRecord ='), script.indexOf('// Update Set Picker', script.indexOf('ctrl.chooseRecord =')));
const loadRecent = script.slice(script.indexOf('var _recentRequestId ='), script.indexOf('function resetLookupResults('));
const historyControls = script.slice(script.indexOf('ctrl.toggleRecentHistory ='), script.indexOf('var _recentRequestId ='));

test('returning to table selection restores history unless it was explicitly hidden, including new picker openings', () => {
    const ctrl = { lookup: { showRecent: true, recentManuallyHidden: false }, loadRecentRecords() {} };
    const context = { ctrl, resetLookupResults() {}, loadRecords() {} };
    vm.createContext(context);
    vm.runInContext(historyControls + script.slice(script.indexOf('ctrl.openLookup ='), script.indexOf('ctrl.onModalBackdropClick =')), context);
    for (const manuallyHidden of [false, true]) {
        ctrl.lookup.showRecent = true;
        ctrl.lookup.recentManuallyHidden = false;
        if (manuallyHidden) ctrl.toggleRecentHistory();
        ctrl.lookup.showRecent = false;
        ctrl.backToTables();
        assert.equal(ctrl.lookup.showRecent, !manuallyHidden);
        ctrl.closeLookup();
        ctrl.openLookup('add');
        assert.equal(ctrl.lookup.showRecent, !manuallyHidden);
        const row = { table: 'sp_widget', tableLabel: 'Widget', sys_id: id(1) };
        ctrl.openLookupForRow(row, 'record');
        assert.equal(ctrl.lookup.showRecent, false);
        ctrl.openLookupForRow(row, 'table');
        assert.equal(ctrl.lookup.showRecent, !manuallyHidden);
    }
    ctrl.toggleRecentHistory();
    ctrl.backToTables();
    assert.equal(ctrl.lookup.showRecent, true, 'explicitly reopening history restores the default');
});

test('Recent selections toggle across tables and retain the target when replacing a record', () => {
    const widget = { table: 'sp_widget', sys_id: id(1), label: 'Widget', tableLabel: 'Widget' };
    const include = { table: 'sys_script_include', sys_id: id(1), label: 'Helper', tableLabel: 'Script Include' };
    const ctrl = {
        lookup: { mode: 'add', chosenTable: 'sys_ui_page', tableLabel: 'UI Page' }, primary: {}, related: [],
        saveSelections() {}, removeRow(row) { this.related = this.related.filter(item => item !== row); },
    };
    const context = { ctrl, rowKey: row => row.table + ':' + row.sys_id, rebuildRows() {}, discoverGraphLinks() {} };
    vm.createContext(context);
    vm.runInContext(pickerHelpers + chooseRecord, context);
    ctrl.chooseRecord(widget);
    ctrl.chooseRecord(include);
    assert.equal(ctrl.related.length, 2);
    assert.equal(ctrl.lookup.chosenTable, 'sys_ui_page', 'recent selections preserve the main record search');
    assert.equal(ctrl.lookup.tableLabel, 'UI Page');
    assert.ok(ctrl.isRecordSelected(widget));
    ctrl.chooseRecord(widget);
    assert.equal(ctrl.isRecordSelected(widget), false);
    assert.equal(ctrl.isRecordSelected(include), true);
    assert.equal(ctrl.related[0].tableLabel, 'Script Include');
    ctrl.lookup.mode = 'edit';
    assert.deepEqual(context.filterOutSelectedRecords([widget, include]), [widget]);
    ctrl.lookup.targetRow = include;
    assert.deepEqual(context.filterOutSelectedRecords([widget, include]), [widget, include]);
});

test('Recent loading reports failures, retries, and ignores a response from an earlier opening', async () => {
    const requests = [];
    const ctrl = { lookup: { mode: 'add' } };
    const context = { ctrl, ajax: () => new Promise((resolve, reject) => requests.push({ resolve, reject })), filterOutSelectedRecords: rows => rows };
    vm.createContext(context);
    vm.runInContext(loadRecent, context);
    const first = ctrl.loadRecentRecords(), second = ctrl.loadRecentRecords();
    requests[1].resolve({ success: true, records: [{ label: 'Latest' }] });
    await second;
    requests[0].resolve({ success: true, records: [{ label: 'Stale' }] });
    await first;
    assert.equal(ctrl.lookup.recentRecords[0].label, 'Latest');
    const failure = ctrl.loadRecentRecords();
    requests[2].reject(new Error('Offline'));
    await failure;
    assert.equal(ctrl.lookup.recentLoading, false);
    assert.match(ctrl.lookup.recentError, /could not be loaded/);
    const retry = ctrl.loadRecentRecords();
    requests[3].resolve({ success: true, records: [] });
    await retry;
    assert.equal(ctrl.lookup.recentError, '');
});

test('Recent pane toggles, scrolls independently and supports keyboard selection on desktop and narrow screens', async () => {
    const html = readFluentField(uiPath, 'html');
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    const modal = html.slice(html.indexOf('<!-- Table and Record Lookup Modal'), html.indexOf('<!-- Update Set Lookup Modal'));
    const angularSource = fs.readFileSync(require.resolve('angular/angular.min.js'), 'utf8');
    const keyboard = script.slice(script.indexOf('function focusFirstItem('), script.indexOf('ctrl.chooseTable ='));
    const chooseTable = script.slice(script.indexOf('ctrl.chooseTable ='), script.indexOf('ctrl.recordSecondaryText ='));
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [390, 1280]) {
            const page = await browser.newPage({ viewport: { width, height: 800 } });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setContent(`<style>${css}*{box-sizing:border-box}body{margin:0;font:16px Arial}.btn{padding:6px 12px}.we-table-chips .btn{font:inherit}</style><div id="fixture" ng-controller="Picker as ctrl">${modal}</div>`);
            await page.addScriptTag({ content: angularSource });
            await page.evaluate(({ keyboard, chooseRecord, pickerHelpers, chooseTable, historyControls }) => {
                angular.module('fixture', []).controller('Picker', function () {
                    const ctrl = this;
                    const rowKey = row => row.table + ':' + row.sys_id;
                    const rebuildRows = () => {}, discoverGraphLinks = () => {};
                    const loadRecords = () => { ctrl.lookup.recordResults = []; };
                    ctrl.lookup = { open: true, showRecent: true, step: 'table', mode: 'add', tableQuery: '', commonTables: Array.from({ length: 20 }, (_, i) => ({ name: 'table_' + i, label: 'Popular table ' + i })), recentRecords: Array.from({ length: 10 }, (_, i) => ({ table: i % 2 ? 'sys_script_include' : 'sp_widget', sys_id: String(i), tableLabel: i % 2 ? 'Script Include' : 'Widget', label: i ? 'Long recent record name '.repeat(6) : 'Announcements' })) };
                    ctrl.primary = {}; ctrl.related = []; ctrl.favouriteTables = [{ name: 'sp_widget', label: 'Widget' }];
                    ctrl.tableIconClass = () => ''; ctrl.saveSelections = () => {};
                    ctrl.removeRow = row => { ctrl.related = ctrl.related.filter(item => item !== row); };
                    ctrl.closeLookup = () => { ctrl.lookup.open = false; };
                    ctrl.onTableQueryChange = () => {};
                    eval(pickerHelpers + chooseRecord + keyboard + chooseTable + historyControls);
                    window.picker = ctrl;
                });
                angular.bootstrap(document.getElementById('fixture'), ['fixture']);
            }, { keyboard, chooseRecord, pickerHelpers, chooseTable, historyControls });
            const pane = page.getByRole('region', { name: 'Recent records' });
            const recent = pane.locator('.we-picker-item');
            const history = page.getByRole('button', { name: 'History', exact: true });
            const mainBounds = await page.locator('.we-picker-col-main').boundingBox();
            const paneBounds = await pane.boundingBox();
            if (width > 640) assert.ok(paneBounds.x >= mainBounds.x + mainBounds.width - 1, 'history sits on the right');
            else assert.ok(paneBounds.y >= mainBounds.y + mainBounds.height - 1, 'narrow screens stack the panes');
            assert.equal(await recent.count(), 10);
            await history.click();
            assert.equal(await pane.count(), 0);
            assert.equal(await history.getAttribute('aria-expanded'), 'false');
            const collapsed = await page.locator('.we-picker-box').boundingBox();
            await history.click();
            assert.equal(await history.getAttribute('aria-expanded'), 'true');
            if (width > 640) assert.ok((await page.locator('.we-picker-box').boundingBox()).width > collapsed.width);
            await page.getByPlaceholder('Search by table…').fill('script');
            assert.equal(await pane.count(), 1, 'history remains available during table search');
            await recent.first().focus();
            await page.keyboard.press('Enter');
            assert.equal(await recent.first().getAttribute('aria-pressed'), 'true');
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Space');
            assert.equal(await recent.nth(1).getAttribute('aria-pressed'), 'true');
            assert.equal(await recent.first().getAttribute('aria-pressed'), 'true');
            await page.screenshot({ path: `/tmp/assistant-recent-pane-${width}.png` });
            const mainScroll = await page.locator('.we-picker-col-main .we-picker-list').evaluate(el => el.scrollTop);
            await recent.last().focus();
            const bounds = await recent.last().boundingBox();
            const done = await page.getByRole('button', { name: 'Done', exact: true }).boundingBox();
            assert.ok(bounds.y + bounds.height <= done.y, 'the last recent record scrolls above the footer');
            assert.equal(await page.locator('.we-picker-col-main .we-picker-list').evaluate(el => el.scrollTop), mainScroll);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await page.evaluate(() => {
                angular.element(document.getElementById('fixture')).scope().$apply(() => {
                    window.picker.chooseTable({ name: 'sys_ui_page', label: 'UI Page' });
                });
            });
            assert.equal(await pane.count(), 0, 'selecting a table automatically closes history');
            assert.equal(await history.getAttribute('aria-expanded'), 'false');
            await page.getByRole('button', { name: 'Back to Tables', exact: true }).click();
            assert.equal(await pane.count(), 1, 'returning to tables automatically reopens history');
            await history.click();
            await page.getByPlaceholder('Search by table…').fill('');
            await page.getByRole('button', { name: 'Widget', exact: true }).click();
            await page.getByRole('button', { name: 'Back to Tables', exact: true }).click();
            assert.equal(await pane.count(), 0, 'explicitly hidden history stays closed on return');
            await page.getByRole('button', { name: 'Widget', exact: true }).click();
            await history.click();
            await recent.first().click();
            assert.equal(await page.evaluate(() => window.picker.lookup.chosenTable), 'sp_widget');
            assert.equal(await pane.count(), 1, 'history remains available during record search');
            await page.evaluate(() => {
                angular.element(document.getElementById('fixture')).scope().$apply(() => { window.picker.lookup.recentRecords = []; });
            });
            assert.equal(await page.getByText('No recent records available', { exact: true }).count(), 1);
            assert.deepEqual(errors, []);
            await page.close();
        }
    } finally { await browser.close(); }
});

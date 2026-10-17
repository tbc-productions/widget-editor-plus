const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_ajax.server.js', 'utf8');
const id = 'a'.repeat(32);
function harness(table, options = {}) {
    const queries = [], creditChecks = [];
    const context = vm.createContext({
        Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        gs: { getProperty: (_, fallback) => fallback, hasRole: role => role === 'admin' && options.admin !== false },
        global: { WidgetEditorCreditAjax: function () { this._fields = table => { creditChecks.push(table); return options.code === false ? [] : [{ name: 'script' }]; }; } },
        GlideRecord: function (name) {
            queries.push(name);
            this.get = () => options.valid !== false;
            this.initialize = () => {};
            this.addQuery = this.orderBy = this.addNotNullQuery = this.query = () => {};
            this.next = () => false;
            this.getClassDisplayValue = () => table;
        },
        GlideRecordSecure: function (name) {
            queries.push(name);
            this.isValid = () => options.valid !== false;
            this.get = () => options.exists !== false;
            this.canRead = () => options.readable !== false;
            this.initialize = () => {};
            this.addQuery = this.orderBy = this.setLimit = this.query = () => {};
            let next = false;
            this.next = () => ((name === 'sys_ui_element' && options.layout !== false) || (name === 'sys_update_xml' && options.history !== false)) && !next && (next = true);
            this.getValue = () => 'name';
            this.getClassDisplayValue = () => table;
        },
    });
    vm.runInContext('Object.extendsObject = (_, methods) => methods;', context);
    vm.runInContext(source, context);
    const api = context.WidgetEditorAjax.prototype;
    let result, answers = 0;
    api.getParameter = name => ({ table, record_id: options.id || id }[name]);
    // AbstractAjaxProcessor.setAnswer does not return the JSON it writes.
    api.setAnswer = value => { result = JSON.parse(value); answers++; };
    api.getAppDrawerContext();
    assert.equal(answers, 1);
    return { api, result, queries, creditChecks };
}

test('drawer compatibility reuses editor profiles, Compare layouts and Credit code fields', () => {
    for (const table of ['sp_widget', 'sys_script_include', 'sp_css', 'sys_ui_script', 'sp_angular_provider', 'sys_ui_page', 'sp_ng_template']) {
        const { result } = harness(table);
        assert.deepEqual(result, { success: true, apps: { assistant: true, 'widget-editor': true, compare: true, credit: true } });
    }
    assert.deepEqual(harness('incident', { code: false }).result.apps, { assistant: true, 'widget-editor': false, compare: true, credit: false });
    assert.deepEqual(harness('sys_script', { layout: false }).result.apps, { assistant: true, 'widget-editor': false, compare: false, credit: true });
    assert.equal(harness('sys_script_include', { history: false }).result.apps.credit, false);
    const h = harness('sys_script_include', { admin: false });
    assert.deepEqual(h.result.apps, { assistant: true, 'widget-editor': true, compare: true });
    assert.deepEqual(h.creditChecks, []);
    h.api.DIFF_ALLOWED_TABLES = ['sp_widget'];
    assert.equal(h.api._getDiffFieldDefs('sys_script_include').success, false);
});

test('invalid, deleted and unreadable records never carry context to another app', () => {
    for (const [table, options] of [
        ['sp_widget', { id: 'bad' }], ['bad&injection', {}], ['__proto__', { valid: false }],
        ['missing_table', { valid: false }], ['sp_widget', { exists: false }], ['sp_widget', { readable: false }],
    ]) {
        const h = harness(table, options);
        assert.deepEqual(h.result, { success: true, apps: {} });
        assert.deepEqual(h.creditChecks, []);
        assert.equal(h.queries.includes('sys_ui_element'), false);
        if (options.id === 'bad' || table.includes('&')) assert.equal(h.queries.length, 0);
    }
});

test('AI Assistant accepts drawer record parameters as its primary record and keeps primary changes in the URL', async () => {
    const ts = require('typescript');
    const script = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_assistant.client.js', 'utf8');
    const ast = ts.createSourceFile('assistant.js', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const functions = {};
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && ['init', 'updatePrimaryUrl', 'clearPrimaryUrl'].includes(node.name?.text)) functions[node.name.text] = node.getText(ast);
        ts.forEachChild(node, visit);
    }
    visit(ast);
    const url = new URL('https://instance.test/ui_page.do?sys_id=584ed242cd934914bffa4b0bb3fb2974&record_table=sys_script_include&record_sys_id=' + id);
    let address = url.href, loaded;
    const ctrl = {};
    const context = vm.createContext({
        ctrl, URL,
        window: { WE_ASSISTANT_CONFIG: { table: url.searchParams.get('record_table'), sysId: url.searchParams.get('record_sys_id') }, location: { href: address }, history: { replaceState: (_, __, href) => { address = href; context.window.location.href = href; } } },
        loadFavouriteTables() {}, loadFavouriteGroups() {}, loadViewMode() {}, loadTokenConfig() {},
        ajax: async () => ({ success: true, label: 'Example', tableLabel: 'Script Includes' }),
        loadPrimaryContext: () => { loaded = { ...ctrl.primary }; return Promise.resolve(); },
        rebuildRows() {}, tableLabel: table => table,
    });
    vm.runInContext(Object.values(functions).join('\n') + '\ninit();', context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(loaded.table, 'sys_script_include');
    assert.equal(loaded.sysId, id);
    assert.equal(loaded.label, 'Example');
    assert.equal(ctrl.loadingInitial, false);
    context.updatePrimaryUrl('sys_ui_page', 'b'.repeat(32));
    assert.equal(new URL(address).searchParams.get('record_table'), 'sys_ui_page');
    assert.equal(new URL(address).searchParams.get('record_sys_id'), 'b'.repeat(32));
    context.clearPrimaryUrl();
    assert.equal(new URL(address).searchParams.has('record_sys_id'), false);
});

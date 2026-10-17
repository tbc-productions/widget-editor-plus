const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const server = fs.readFileSync(
    'src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_ajax.server.js',
    'utf8'
);
const client = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus.client.js', 'utf8');
const id = 'a'.repeat(32);
const supported = [
    'sp_widget',
    'sys_script_include',
    'sp_css',
    'sys_ui_script',
    'sp_angular_provider',
    'sys_ui_page',
    'sp_ng_template',
];

function serverHarness(table = 'sys_ui_page', options = {}) {
    const params = { record_table: table, sys_id: id, ...options.params };
    const row = {
        name: 'Example',
        id: 'example.html',
        active: '1',
        global: '0',
        client_callable: '0',
        sandbox_callable: '0',
        direct: '0',
        access: 'all',
        ui_type: '0',
        category: 'general',
        type: 'factory',
        script: 'saved script',
        html: 'saved html',
        client_script: 'saved client',
        processing_script: 'saved processing',
        css: 'saved css',
        template: 'saved template',
        description: 'Description',
        sp_widget: 'b'.repeat(32),
        api_name: 'global.Example',
        sys_scope: 'global',
        sys_policy: '',
        sys_updated_on: '2026-10-17 00:00:00',
        ...options.row,
    };
    const calls = [],
        writes = [];
    function Record(name) {
        calls.push(name);
        let current = row,
            cursor = 0;
        const filters = {};
        this.get = () => options.exists !== false;
        this.getTableName = () => name;
        this.getUniqueValue = () => id;
        this.canRead = () => options.canRead !== false;
        this.canCreate = () => options.canCreate !== false;
        this.canWrite = () => options.canWrite !== false;
        this.newRecord = () => {
            for (const field of ['name', 'id', 'script', 'html', 'client_script', 'processing_script', 'css', 'template', 'description', 'api_name']) row[field] = '';
            Object.assign(row, options.defaults || {});
        };
        this.isValidField = (field) => Object.hasOwn(row, field);
        this.getValue = (field) => current[field] ?? null;
        this.getDisplayValue = (field) => field === 'sys_policy' && options.policyDisplay !== undefined ? options.policyDisplay : (field === 'sp_widget' ? 'Parent widget' : String(current[field] || ''));
        this.getElement = (field) => ({
            canRead: () => !(options.noRead || []).includes(field),
            canWrite: () => !(options.noWrite || []).includes(field),
            isMandatory: () => (options.mandatory || []).includes(field),
            getED: () => ({ getLength: () => options.maxLength || 1000000 }),
        });
        this.addQuery = (field, value) => {
            filters[field] = value;
            return { addOrCondition() {} };
        };
        this.orderBy = this.chooseWindow = () => {};
        this.query = () => {
            cursor = 0;
        };
        this.next = () => {
            if (name === 'sys_choice') {
                const values =
                    {
                        type: ['directive', 'factory', 'service'],
                        category: ['general', 'catalog'],
                        access: ['all', 'scope'],
                        ui_type: ['0', '1', '10'],
                    }[filters.element] || [];
                if (cursor >= values.length) return false;
                current = { value: values[cursor], label: values[cursor++] };
                return true;
            }
            return cursor++ < (options.listCount || 1);
        };
        this.setValue = (field, value) => {
            writes.push([field, value]);
            row[field] = value;
        };
        this.update = () => {
            writes.push(['update']);
            return options.failUpdate ? null : id;
        };
        this.insert = () => {
            writes.push(['insert']);
            return options.failInsert ? null : id;
        };
    }
    const context = vm.createContext({
        Class: { create: () => function () {} },
        AbstractAjaxProcessor: {},
        gs: { getProperty: (_, fallback) => fallback },
        GlideRecordSecure: Record,
        GlideRecord: Record,
    });
    vm.runInContext('Object.extendsObject = function (_, methods) { return methods; };', context);
    vm.runInContext(server, context);
    const api = context.WidgetEditorAjax.prototype;
    api.getParameter = (name) => params[name];
    api._answer = (answer) => JSON.parse(JSON.stringify(answer));
    return { api, params, row, calls, writes };
}

test('the editor exposes exactly the seven agreed types and rejects other tables before querying', () => {
    const h = serverHarness();
    assert.deepEqual(
        h.api.getEditorRecordTypes().types.map((type) => type.table),
        supported
    );
    for (const table of ['sys_user', '__proto__', 'constructor', 'sys_script']) {
        const rejected = serverHarness(table);
        for (const action of ['getWidget', 'getWidgetDefaults', 'saveWidget', 'saveField', 'getEditorRecords'])
            assert.equal(rejected.api[action]().success, false);
        assert.deepEqual(rejected.calls, []);
    }
});

test('all six additional types load their own code fields and preserve field permissions', () => {
    for (const table of supported.slice(1)) {
        const h = serverHarness(table, { noWrite: ['description'] });
        const result = h.api.getWidget();
        assert.equal(result.success, true, table);
        const profile = h.api._getEditorProfiles()[table];
        assert.deepEqual(
            result.core_editor_defs.map((def) => def.field),
            Array.from(
                profile.fields.filter((def) => def.language),
                (def) => def.name
            )
        );
        assert.equal(result.primary_field, profile.primary);
        if (table === 'sp_ng_template') {
            assert.equal(result.widget.name, 'example.html');
            assert.equal(
                result.additional_widget_fields.find((def) => def.name === 'sp_widget').displayValue,
                'Parent widget'
            );
            assert.equal(result.additional_widget_fields.find((def) => def.name === 'sp_widget').canWrite, false);
        }
        const description = result.additional_widget_fields.find((def) => def.name === 'description');
        if (description) assert.equal(description.canWrite, false);
    }
    const h = serverHarness('sys_ui_page', { noRead: ['processing_script'] });
    const result = h.api.getWidget();
    assert.equal(result.widget.processing_script, undefined);
    assert.equal(
        result.core_editor_defs.some((def) => def.field === 'processing_script'),
        false
    );
    const defs = serverHarness('sys_ui_page').api.getWidget().core_editor_defs;
    assert.equal(defs.find((def) => def.field === 'processing_script').scriptKind, 'server');
    assert.equal(defs.find((def) => def.field === 'client_script').scriptKind, 'client');
    assert.equal(serverHarness('sys_ui_script').api.getWidget().core_editor_defs[0].scriptKind, 'client');
});

test('record metadata returns protection policy labels only when the field is readable', () => {
    for (const table of supported.slice(1)) {
        for (const [value, label] of [['protected', 'Protected'], ['read', 'Read-only']]) {
            const result = serverHarness(table, { row: { sys_policy: value }, policyDisplay: label }).api.getWidget();
            assert.equal(result.widget.sys_policy, value);
            assert.equal(result.widget.sys_policy_display, label);
            assert.equal(result.widget.canWrite, false);
        }
        const hidden = serverHarness(table, { row: { sys_policy: 'protected' }, noRead: ['sys_policy'], policyDisplay: 'Protected' }).api.getWidget();
        assert.equal(hidden.widget.sys_policy, undefined);
        assert.equal(hidden.widget.sys_policy_display, undefined);
    }
});

test('saving one code field preserves the other fields for every additional type', () => {
    for (const table of supported.slice(1)) {
        const h = serverHarness(table);
        const field = h.api._getEditorProfiles()[table].fields.find((def) => def.language).name;
        const previous = { ...h.row };
        Object.assign(h.params, { field, value: 'edited', original: JSON.stringify({ [field]: h.row[field] }) });
        assert.equal(h.api.saveField().success, true, table);
        assert.deepEqual(h.writes, [[field, 'edited'], ['update']]);
        assert.deepEqual(h.row, { ...previous, [field]: 'edited' });
    }
});

test('all six new record types load defaults without inserting and create only on explicit Save', () => {
    for (const table of supported.slice(1)) {
        const h = serverHarness(table, { params: { sys_id: '' } });
        const defaults = h.api.getWidgetDefaults();
        assert.equal(defaults.success, true, table);
        assert.equal(defaults.widget.sys_id, '');
        assert.deepEqual(h.writes, []);
        const primary = defaults.primary_field, field = defaults.core_editor_defs[0].field;
        Object.assign(h.params, { new_record: 'true', data: JSON.stringify({ [primary]: 'New record', [field]: 'new code' }) });
        const result = h.api.saveWidget();
        assert.equal(result.success, true, table);
        assert.equal(result.sys_id, id);
        assert.equal(result.created_record.widget[primary], 'New record');
        assert.deepEqual(h.writes.filter(write => write[0] === 'insert'), [['insert']]);
        assert.equal(h.row[field], 'new code');
        Object.assign(h.params, { sys_id: id, new_record: '', field, value: 'updated code', original: JSON.stringify({ [field]: 'new code' }) });
        assert.equal(h.api.saveField().success, true);
        assert.equal(h.row[field], 'updated code');
        assert.equal(h.writes.filter(write => write[0] === 'insert').length, 1);
    }
});

test('new records enforce create and field permissions and reject missing required values', () => {
    for (const options of [
        { canCreate: false },
        { noWrite: ['html'] },
        { params: { data: JSON.stringify({ html: 'code' }) } },
        { params: { data: JSON.stringify({ name: 'New', sys_scope: 'other' }) } },
        { params: { new_record: '' } },
        { params: { sys_id: id } },
    ]) {
        const h = serverHarness('sys_ui_page', { ...options, params: {
            sys_id: '', new_record: 'true', data: JSON.stringify({ name: 'New', html: 'code' }), ...options.params,
        } });
        assert.equal(h.api.saveWidget().success, false, JSON.stringify(options));
        assert.deepEqual(h.writes, []);
    }
    const denied = serverHarness('sys_ui_page', { canCreate: false });
    assert.equal(denied.api.getWidgetDefaults().success, false);
    assert.deepEqual(denied.writes, []);
    const failed = serverHarness('sys_ui_page', { failInsert: true, params: { sys_id: '', new_record: 'true', data: JSON.stringify({ name: 'New' }) } });
    assert.equal(failed.api.saveWidget().success, false);
});

test('record saves validate every field before writing, reject stale values and retain server content on errors', () => {
    for (const options of [
        { params: { sys_id: '' } },
        { params: { sys_id: 'invalid' } },
        { params: { data: '{' } },
        { params: { data: '[]' } },
        { params: { original: '{}' } },
        { params: { original: JSON.stringify({ html: 'stale' }) } },
        { params: { data: JSON.stringify({ html: 'edited', sys_scope: 'other' }) } },
        {
            params: {
                data: JSON.stringify({ html: 'edited', category: 'invalid' }),
                original: JSON.stringify({ html: 'saved html', category: 'general' }),
            },
        },
        { params: { data: JSON.stringify({ name: '' }), original: JSON.stringify({ name: 'Example' }) } },
        { params: { data: JSON.stringify({ direct: 'true' }), original: JSON.stringify({ direct: false }) } },
        { noWrite: ['html'] },
        { noRead: ['html'] },
        { noRead: ['name'] },
        { canRead: false },
        { canWrite: false },
        { row: { sys_policy: 'read' } },
        { maxLength: 3 },
    ]) {
        const h = serverHarness('sys_ui_page', {
            ...options,
            params: {
                data: JSON.stringify({ html: 'edited' }),
                original: JSON.stringify({ html: 'saved html' }),
                ...options.params,
            },
        });
        assert.equal(h.api.saveWidget().success, false, JSON.stringify(options));
        assert.deepEqual(h.writes, [], JSON.stringify(options));
        assert.equal(h.row.html, 'saved html');
    }
    const h = serverHarness('sp_ng_template', {
        params: { field: 'sp_widget', value: 'c'.repeat(32), original: JSON.stringify({ sp_widget: 'b'.repeat(32) }) },
    });
    assert.equal(h.api.saveField().success, false);
    assert.deepEqual(h.writes, []);
});

test('boolean and choice saves use platform values and failed updates never report success', () => {
    const h = serverHarness('sys_ui_page', {
        params: {
            data: JSON.stringify({ direct: true, category: 'catalog' }),
            original: JSON.stringify({ direct: false, category: 'general' }),
        },
    });
    assert.equal(h.api.saveWidget().success, true);
    assert.deepEqual(h.writes, [['direct', '1'], ['category', 'catalog'], ['update']]);
    const failed = serverHarness('sys_ui_page', {
        failUpdate: true,
        params: { field: 'html', value: 'edited', original: JSON.stringify({ html: 'saved html' }) },
    });
    assert.equal(failed.api.saveField().success, false);
});

test('Script Include sandbox saves respect field access and preserve the script', () => {
    for (const noWrite of [[], ['sandbox_callable']]) {
        const h = serverHarness('sys_script_include', { noWrite, params: {
            field: 'sandbox_callable', value: 'true', original: JSON.stringify({ sandbox_callable: false }),
        } });
        const field = h.api.getWidget().additional_widget_fields.find(def => def.name === 'sandbox_callable');
        assert.equal(field.type, 'boolean');
        assert.equal(field.canWrite, !noWrite.length);
        assert.equal(h.api.saveField().success, !noWrite.length);
        assert.equal(h.row.sandbox_callable, noWrite.length ? '0' : '1');
        assert.equal(h.row.script, 'saved script');
    }
});

test('record picker does not return technical table names as record identifiers', () => {
    for (const table of supported.slice(1)) {
        const h = serverHarness(table);
        const result = h.api.getEditorRecords();
        assert.equal(result.widgets[0].table, table);
        assert.equal(result.widgets[0].id, '');
        assert.equal(result.widgets[0].name, h.row[h.api._getEditorProfiles()[table].primary]);
    }
});

test('picker paging continues past unreadable display fields and rejects invalid history IDs', () => {
    for (const noRead of [[], ['name']]) {
        const h = serverHarness('sys_ui_page', { listCount: 3, noRead });
        h.api.RECORD_LIMIT = 2;
        const result = h.api.getEditorRecords();
        assert.equal(result.widgets.length, noRead.length ? 0 : 2);
        assert.equal(result.has_more, true);
        assert.equal(result.next_offset, 2);
    }
    const h = serverHarness('sys_ui_page', { params: { sys_ids: 'invalid,^ORactive=true' } });
    assert.deepEqual(h.api.getEditorRecords().widgets, []);
    const rejected = serverHarness('sys_ui_page', { params: { field: '__proto__', value: 'bad', original: '{}' } });
    assert.equal(rejected.api.saveField().success, false);
    assert.deepEqual(rejected.writes, []);
});

const ast = ts.createSourceFile('editor.js', client, ts.ScriptTarget.Latest, true);
function clientFunction(name, context) {
    let found;
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(found, name);
    vm.runInContext(found.getText(ast), context);
    return context[name];
}

test('picker type icons preserve widget, read-only, ServiceNow and deprecated icons', () => {
    const context = vm.createContext({ $scope: {} });
    const start = client.indexOf('                $scope.widgetPickerIconClass =');
    vm.runInContext(client.slice(start, client.indexOf('                function _handleListSearchKeydown', start)), context);
    const icon = context.$scope.widgetPickerIconClass;
    for (const [table, expected] of [
        ['sys_script_include', 'icon-document-code'], ['sp_css', 'icon-marker'],
        ['sys_ui_script', 'icon-code'], ['sp_angular_provider', 'icon-console'],
        ['sys_ui_page', 'icon-application-generic'], ['sp_ng_template', 'icon-layout'],
        ['sp_widget', 'icon-script'], [undefined, 'icon-script'], ['__proto__', 'icon-script'],
    ]) {
        assert.equal(icon({ table, canWrite: true }), expected);
        assert.equal(icon({ table, canWrite: false }), 'icon-locked');
        assert.equal(icon({ table, canWrite: false, servicenow: true }), 'icon-brand-now');
        assert.equal(icon({ table, canWrite: false, servicenow: true, deprecated: true }), 'icon-error');
    }
    assert.equal(icon(null), 'icon-script');
});

test('New stays in the current tab and waits for save or discard before navigating', async () => {
    let dirty = false, discardAllowed = true, response = { success: true }, calls = 0;
    const scope = { pendingNewWidget: false, recordTypes: supported.map(table => ({ table })) };
    const context = vm.createContext({
        $scope: scope, RECORD_TABLE: 'sys_script_include', SYS_ID: id,
        window: { location: { href: '' } }, _bypassUnloadWarning: false,
        hasUnsavedChanges: () => dirty, _discardPageDraft: () => discardAllowed,
        _buildSavePayload: () => ({ name: 'Current record' }),
        _acceptWidgetSave: () => { dirty = false; },
        ajax: async () => { calls++; return response; },
        buildWidgetEditorUrl: (_id, table) => '/ui_page.do?sys_id=page-id' + (table === 'sp_widget' ? '' : '&record_table=' + table),
    });
    const start = client.indexOf('                function navigateToNewWidget(');
    vm.runInContext(client.slice(start, client.indexOf('                $scope.openWidgetPickerModal =', start)), context);
    for (const table of supported) {
        const expected = context.buildWidgetEditorUrl('', table) + '&new=1';
        dirty = false;
        scope.newRecord(table);
        assert.equal(context.window.location.href, expected);
        dirty = true;
        context.window.location.href = '';
        context._bypassUnloadWarning = false;
        scope.newRecord(table);
        assert.equal(scope.pendingNewWidget, table);
        assert.equal(context.window.location.href, '');
        scope.cancelNewWidget();
        assert.equal(scope.pendingNewWidget, false);
        assert.equal(dirty, true);
        scope.newRecord(table);
        discardAllowed = false;
        scope.discardAndNewWidget();
        assert.equal(context.window.location.href, '');
        assert.equal(scope.pendingNewWidget, table);
        discardAllowed = true;
        scope.discardAndNewWidget();
        assert.equal(context.window.location.href, expected);
        assert.equal(context._bypassUnloadWarning, true);
        context.window.location.href = '';
        scope.newRecord(table);
        response = { success: false, error: 'Save rejected' };
        await scope.saveAndNewWidget();
        assert.equal(context.window.location.href, '');
        assert.equal(scope.pendingNewWidget, table);
        assert.equal(scope.saveError, 'Save rejected');
        assert.equal(dirty, true);
        response = { success: true };
        await scope.saveAndNewWidget();
        assert.equal(context.window.location.href, expected);
        assert.equal(scope.pendingNewWidget, false);
    }
    context.window.location.href = '';
    scope.newRecord('sys_user');
    assert.equal(context.window.location.href, '');
    dirty = true;
    scope.newRecord('sys_ui_page');
    let finish;
    const before = calls;
    context.ajax = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
    const saving = scope.saveAndNewWidget();
    scope.saveAndNewWidget();
    scope.cancelNewWidget();
    scope.discardAndNewWidget();
    assert.equal(scope.pendingNewWidget, 'sys_ui_page');
    assert.equal(calls, before + 1);
    finish({ success: false });
    await saving;
    assert.equal(scope.savingBeforeNewRecord, false);
    context.ajax = () => Promise.reject(new Error('Network unavailable'));
    await scope.saveAndNewWidget();
    assert.equal(scope.saveError, 'Network unavailable');
    assert.equal(context.window.location.href, '');
    context.ajax = async () => ({ success: true });
    context._acceptWidgetSave = () => {};
    await scope.saveAndNewWidget();
    assert.match(scope.saveError, /still have unsaved changes/);
    assert.equal(context.window.location.href, '');
    scope.isNewWidget = true;
    await scope.saveAndNewWidget();
    assert.match(context.window.location.href, /record_table=sys_ui_page&new=1/);
    assert.equal(context._bypassUnloadWarning, true);
});

test('non-widget payloads contain only changed writable fields and preserve false booleans', () => {
    const context = vm.createContext({
        $scope: {
            isWidgetRecord: false,
            widget: { html: 'old', client_script: 'old', name: 'new', direct: false, sp_widget: 'parent' },
            coreEditorDefs: [
                { key: 'html', field: 'html' },
                { key: 'client_script', field: 'client_script', readOnly: true },
            ],
            additionalWidgetFields: [
                { name: 'name', type: 'string', canWrite: true },
                { name: 'direct', type: 'boolean', canWrite: true },
                { name: 'sp_widget', canWrite: false },
            ],
        },
        monacoEditors: { html: { getValue: () => 'new html' }, client_script: { getValue: () => 'read only' } },
        originalValues: { html: 'old', client_script: 'old' },
        originalHeader: { name: 'old', direct: true },
        _normaliseExtraWidgetFieldValue: (def, value) => (def.type === 'boolean' ? !!value : value || ''),
    });
    const payload = clientFunction('_buildSavePayload', context)();
    assert.deepEqual(JSON.parse(JSON.stringify(payload)), { html: 'new html', name: 'new', direct: false });
});

test('non-widget save acceptance does not clear other fields or newer typing', () => {
    let cleanup = false;
    const pane = { dirty: true };
    const context = vm.createContext({
        $scope: { isWidgetRecord: false, recordPrimaryField: 'name', headerDirty: {}, widget: { name: 'Name', html: 'newer typing' } },
        originalValues: { html: 'old html', client_script: 'old client' },
        lastServerValues: {},
        originalHeader: { name: 'Name' },
        paneMap: { html: pane },
        monacoEditors: { html: { getValue: () => 'newer typing' } },
        _writeLocalDraft: () => {
            cleanup = true;
        },
    });
    clientFunction('_acceptWidgetSave', context)({ html: 'submitted' });
    assert.equal(context.originalValues.html, 'submitted');
    assert.equal(context.originalValues.client_script, 'old client');
    assert.equal(pane.dirty, true);
    assert.equal(cleanup, true);
});

test('record links and draft keys include the table while legacy widget keys remain unchanged', () => {
    const scope = { recordTable: 'sys_ui_page', currentUserId: 'user' };
    const context = vm.createContext({
        $scope: scope,
        SYS_ID: id,
        window: { location: { pathname: '/ui_page.do' }, WE_CONFIG: { widgetPageSysId: 'page-id' } },
    });
    const url = clientFunction('buildWidgetEditorUrl', context)(id, 'sys_ui_page');
    assert.equal(new URL(url, 'https://example.test').searchParams.get('record_table'), 'sys_ui_page');
    assert.equal(new URL(url, 'https://example.test').searchParams.get('record_sys_id'), id);
    assert.equal(new URL(url, 'https://example.test').searchParams.has('widget_id'), false);
    const widgetUrl = new URL(context.buildWidgetEditorUrl(id, 'sp_widget'), 'https://example.test');
    assert.equal(widgetUrl.searchParams.get('widget_id'), id);
    assert.equal(widgetUrl.searchParams.has('record_table'), false);
    const prefix = clientFunction('_draftPrefix', context);
    assert.equal(prefix(), 'we_local_draft:v1:user:sys_ui_page:' + id + ':');
    scope.recordTable = 'sp_widget';
    assert.equal(prefix(), 'we_local_draft:v1:user:' + id + ':');
});

test('saving non-widget preferences preserves the widget layout without storing a record layout', () => {
    const scope = {
        isWidgetRecord: false,
        coreEditorDefs: [{ key: 'script', visible: true }],
        userPrefs: {
            editorOrder: ['script'], editorVisibility: { script: false },
        },
        widgetEditorLayout: { script: true, client_script: false, order: ['client_script', 'script'] },
    };
    const context = vm.createContext({ $scope: scope, RECORD_TABLE: 'sys_script_include', angular: { copy: structuredClone } });
    const prefs = JSON.parse(JSON.stringify(clientFunction('_buildUserPrefsBlob', context)()));
    assert.equal(prefs.script, true);
    assert.equal(prefs.client_script, false);
    assert.deepEqual(prefs.order, ['client_script', 'script']);
    assert.equal(prefs.recordEditorLayouts, undefined);
});

test('preference import leaves non-widget panes unchanged and stages the widget layout separately', () => {
    const scope = {
        isWidgetRecord: false, coreEditorDefs: [{ key: 'html' }, { key: 'client_script' }],
        userPrefsEdit: { editors: [{ key: 'html', visible: true }, { key: 'client_script', visible: true }] },
        widgetEditorLayout: { script: false },
    };
    const context = vm.createContext({ $scope: scope, RECORD_TABLE: 'sys_ui_page', angular: { copy: structuredClone },
        _validAutosaveInterval: () => false, _validDraftRetentionDays: () => false,
    });
    clientFunction('_applyPrefsBlobToEdit', context)({
        script: true, order: ['script', 'link'],
        recentRecords: [{ table: 'sys_ui_page', sys_id: id }, { table: 'sp_css', sys_id: 'invalid' }],
    });
    assert.deepEqual(Array.from(scope.userPrefsEdit.editors, pane => [pane.key, pane.visible]), [['html', true], ['client_script', true]]);
    assert.deepEqual(scope.widgetEditorLayout, { script: false });
    assert.equal(scope.userPrefsEdit.widgetEditorLayout.script, true);
    assert.deepEqual(Array.from(scope.userPrefsEdit.recentRecords, entry => entry.table), ['sys_ui_page']);
});

function browserFixture() {
    const html = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus.html', 'utf8');
    const markup = (html.match(/<style>[\s\S]*?<\/style>/)[0] + html.match(/<main[\s\S]*?<\/main>/)[0])
        .replace('ng-app="widgetEditor"', '')
        .replace(/<\/?j:if\b[^>]*>/g, '');
    let initEditors;
    function find(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'initAllEditors') initEditors = node;
        ts.forEachChild(node, find);
    }
    find(ast);
    // Exercise the real controller and template without the instance's Monaco bundle.
    const browserClient = client.slice(0, initEditors.body.pos) + '{}' + client.slice(initEditors.body.end);
    return { markup, browserClient };
}

async function checkDescriptionSizing(page, selector) {
    const textarea = page.locator(selector);
    const original = await textarea.inputValue();
    await page.waitForFunction(selector => {
        const element = document.querySelector(selector);
        return element.clientHeight >= element.scrollHeight;
    }, selector);
    assert.equal(await textarea.evaluate(element => getComputedStyle(element).resize), 'vertical');
    await textarea.fill('Short description');
    await page.waitForFunction(selector => document.querySelector(selector).offsetHeight < 100, selector);
    const shortHeight = await textarea.evaluate(element => element.offsetHeight);
    await textarea.fill(Array(80).fill('A description line').join('\n'));
    await page.waitForFunction(selector => {
        const element = document.querySelector(selector);
        return Math.abs(element.getBoundingClientRect().height - innerHeight * 0.65) < 2;
    }, selector);
    assert.ok(await textarea.evaluate(element => element.scrollHeight > element.clientHeight));
    assert.equal(await textarea.evaluate(element => getComputedStyle(element).overflowY), 'auto');
    await textarea.fill(Array(8).fill('A description line').join('\n'));
    await page.waitForFunction(({ selector, shortHeight }) => {
        const element = document.querySelector(selector);
        return element.offsetHeight > shortHeight && element.offsetHeight < innerHeight * 0.65 && element.scrollHeight <= element.clientHeight;
    }, { selector, shortHeight });
    const box = await textarea.boundingBox();
    await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 3, box.y + box.height + 77, { steps: 5 });
    await page.mouse.up();
    assert.ok(await textarea.evaluate(element => element.offsetHeight) > box.height + 50);
    assert.ok(Math.abs((await textarea.boundingBox()).width - box.width) < 1);
    await textarea.fill(original);
}

test('the real Angular page preserves widgets and opens and saves the six additional types', async () => {
    const { chromium } = require('@playwright/test');
    const { markup, browserClient } = browserFixture();
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await page.route('https://instance.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const types = serverHarness().api.getEditorRecordTypes().types;
        for (const table of supported) {
            await page.goto('https://instance.test/editor-fixture');
            await page.setContent(markup);
            await page.addStyleTag({ content: ':root { --now-color_chrome--brand-5: 3, 45, 62; --now-color--neutral-0: 255, 255, 255; --now-color_background--secondary: 242, 247, 248; --now-color_text--primary: 29, 49, 56; --now-modal--border-radius: 6px; --now-dropdown-list_search--background-color--hover: 224, 238, 241; } input[type=checkbox].checkbox { display:block; margin:10px 0; } button:not(.btn) { padding:10px !important; border:1px solid #ccc !important; border-radius:4px !important; min-height:32px !important; background:#eee !important; }' });
            const fixture = table === 'sp_widget' ? { success: true, additional_widget_fields: [], widget: {
                sys_id: id, name: 'Example', id: 'example', description: Array(20).fill('Saved description line').join('\n'), template: 'saved html', css: '', client_script: '', script: '', link: '', canWrite: true,
            } } : serverHarness(table, { row: { description: Array(20).fill('Saved description line').join('\n') } }).api.getWidget();
            await page.evaluate(({ table, id, fixture, types }) => {
                window.WE_CONFIG = { record_table: table, sys_id: id, widgetPageSysId: 'page-id' };
                window.require = () => {};
                window.calls = [];
                window.openedRecords = [];
                window.open = (...args) => window.openedRecords.push(args);
                Object.defineProperty(navigator, 'clipboard', { value: { writeText: text => window.copiedUrl = text }, configurable: true });
                window.GlideAjax = function () {
                    const params = {};
                    this.addParam = (name, value) => params[name] = value;
                    this.getXML = callback => {
                        window.calls.push(params);
                        const action = params.sysparm_name;
                        if (action === 'saveWidget') sessionStorage.setItem('lastSaveBeforeNew', JSON.stringify(params));
                        const answer = action === 'saveWidget' && window.failNextSave ? (window.failNextSave = false, { success: false, error: 'Save rejected' }) : action === 'getWidget' ? fixture
                            : action === 'getEditorRecordTypes' ? { success: true, types }
                            : action === 'getUserPrefs' ? { success: true, value: JSON.stringify({ showRecentlyOpenedWidgets: false }) }
                            : action === 'getEditorRecords' ? { success: true, widgets: [{ table: params.record_table, sys_id: id, name: 'Example', canWrite: true }], total: 1 }
                            : { success: true, name: fixture.widget.name, versions: [], templates: [], providers: [], dependencies: [], choices: [], widgets: [] };
                        const respond = () => callback({ responseXML: { documentElement: { getAttribute: () => JSON.stringify(answer) } } });
                        if (action === 'getWidget') window.finishRecordLoad = respond;
                        else respond();
                    };
                };
            }, { table, id, fixture, types });
            await page.addScriptTag({ path: require.resolve('angular/angular.js') });
            await page.addScriptTag({ content: browserClient });
            await page.evaluate(() => {
                angular.bootstrap(document.querySelector('main'), ['widgetEditor']);
                window.editorScope = angular.element(document.querySelector('main')).scope();
            });
            if (table !== 'sp_widget')
                assert.equal((await page.locator('.we-loading').innerText()).trim(), 'Loading ' + fixture.record_label + '…');
            assert.equal(await page.locator('.we-alert-pills-row').isVisible(), false, table);
            await page.evaluate(() => finishRecordLoad());
            await page.waitForFunction(() => !editorScope.loading);
            assert.equal(await page.evaluate(() => editorScope.loadError), null, table);
            assert.equal(await page.locator('.we-alert-pills-row').isVisible(), true, table);
            for (const state of [{ loadError: 'Record unavailable' }, { showPicker: true }]) {
                await page.evaluate(state => editorScope.$apply(() => Object.assign(editorScope, state)), state);
                assert.equal(await page.locator('.we-alert-pills-row').isVisible(), false, table);
                await page.evaluate(() => editorScope.$apply(() => { editorScope.loadError = null; editorScope.showPicker = false; }));
            }
            assert.equal(await page.locator('.we-alert-pills-row').isVisible(), true, table);
            assert.equal(await page.locator('.we-record-name').innerText(), fixture.widget[fixture.primary_field || 'name'], table);
            assert.equal(await page.locator('.we-alert-pills-row').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(3, 45, 62)');
            assert.deepEqual(await page.locator('.we-record-name').evaluate(element => {
                const style = getComputedStyle(element);
                return [style.fontSize, style.fontWeight, style.color];
            }), ['18px', '600', 'rgb(255, 255, 255)']);
            if (table === 'sp_widget') {
                const headerTop = await page.locator('.we-header').evaluate(element => element.getBoundingClientRect().top);
                assert.ok(await page.locator('.we-alert-pills-row').evaluate(element => element.getBoundingClientRect().height >= 35));
                await page.evaluate(() => editorScope.$apply(() => { editorScope.canWriteWidget = false; }));
                assert.equal(await page.locator('.we-header').evaluate(element => element.getBoundingClientRect().top), headerTop);
                await page.evaluate(() => editorScope.$apply(() => { editorScope.canWriteWidget = true; }));
                assert.equal(await page.locator('.we-header').evaluate(element => element.getBoundingClientRect().top), headerTop);
                assert.equal(await page.locator('.we-info-icon[title="More fields"]').evaluate(element => element.classList.contains('icon-arrow-down-rounded')), true);
                await page.locator('.we-info-icon[title="More fields"]').press('Enter');
                assert.equal(await page.locator('.we-info-icon[title="More fields"]').evaluate(element => element.classList.contains('icon-arrow-up-rounded') && !element.classList.contains('icon-arrow-down-rounded')), true);
                await checkDescriptionSizing(page, '#widget-description');
                await page.locator('#widget-name').click();
                assert.equal(await page.locator('.we-info-icon[title="More fields"]').evaluate(element => element.classList.contains('icon-arrow-down-rounded') && !element.classList.contains('icon-arrow-up-rounded')), true);
                assert.equal(await page.locator('#widget-name').inputValue(), 'Example');
                await page.locator('#widget-name').fill('Renamed widget');
                assert.equal(await page.locator('.we-record-name').innerText(), 'Renamed widget');
                await page.getByRole('button', { name: 'Unsaved changes details', exact: true }).click();
                await page.getByRole('button', { name: 'Revert', exact: true }).click();
                assert.equal(await page.getByText('Discard unsaved changes?', { exact: true }).isVisible(), true);
                await page.keyboard.press('Escape');
                await page.waitForFunction(() => !editorScope.showRevertConfirm);
                assert.equal(await page.locator('#widget-name').inputValue(), 'Renamed widget');
                await page.locator('#widget-name').fill('Example');
                assert.equal(await page.getByText('Default editors', { exact: true }).count(), 1);
                assert.equal(await page.locator('button[title="Choose visible editors"]').count(), 1);
                assert.deepEqual(await page.evaluate(() => editorScope.coreEditorDefs.map(def => def.field)), ['template', 'css', 'client_script', 'link', 'script']);
                assert.equal(await page.locator('[ng-click="newRecord()"]').textContent(), 'New Widget');
                for (const [recordType, table] of [['script_include', 'sys_script_include'], ['template', 'sp_ng_template'], ['provider', 'sp_angular_provider']]) {
                    await page.evaluate(({ recordType, id }) => editorScope.$apply(() => {
                        editorScope.visibleItems = [{ key: 'related', type: 'pane', label: 'Related record', recordType, sys_id: id, hasIdInput: recordType !== 'script_include', readOnly: true }];
                    }), { recordType, id });
                    await page.getByRole('button', { name: 'Open in Editor+', exact: true }).click();
                    const opened = await page.evaluate(() => openedRecords.at(-1));
                    const url = new URL(opened[0], 'https://instance.test');
                    assert.equal(url.pathname, '/ui_page.do');
                    assert.equal(url.searchParams.get('record_table'), table);
                    assert.equal(url.searchParams.get('record_sys_id'), id);
                    assert.equal(url.searchParams.has('widget_id'), false);
                    assert.deepEqual(opened.slice(1), ['_blank', 'noopener,noreferrer']);
                }
                await page.evaluate(({ id }) => editorScope.$apply(() => {
                    editorScope.providers = [{ sys_id: id, name: 'Related provider' }];
                    editorScope.templates = [{ sys_id: id, id: 'related.html' }];
                    editorScope.linkProviderResults = [{ sys_id: id, name: 'Available provider' }];
                }), { id });
                const relatedLinks = page.locator('a[title="Open in Editor+"]');
                assert.equal(await relatedLinks.count(), 5);
                for (const link of await relatedLinks.all()) {
                    const url = new URL(await link.getAttribute('href'), 'https://instance.test');
                    assert.ok(['sp_ng_template', 'sp_angular_provider'].includes(url.searchParams.get('record_table')));
                    assert.equal(url.searchParams.get('record_sys_id'), id);
                    assert.equal(await link.getAttribute('target'), '_blank');
                }
                assert.equal(await page.evaluate(() => {
                    let calls = 0;
                    editorScope.newWidget = () => { calls++; };
                    editorScope.newRecord('sp_widget');
                    return calls;
                }), 1);
                continue;
            }
            assert.equal(await page.locator('button[title="Choose visible editors"]').count(), fixture.core_editor_defs.length > 1 ? 1 : 0, table);
            assert.equal(await page.getByText('Default editors', { exact: true }).count(), 0, table);
            const primary = fixture.primary_field;
            assert.equal(await page.locator('#record-field-' + primary).inputValue(), fixture.widget[primary], table);
            const primaryWidth = await page.locator('#record-field-' + primary).evaluate(element => element.getBoundingClientRect().width);
            assert.ok(primaryWidth >= 300 && primaryWidth <= 330, table);
            if (table === 'sys_script_include') {
                const rows = await page.locator('.we-record-field').evaluateAll(fields => fields.map(field => {
                    const label = field.querySelector('label').getBoundingClientRect();
                    const labelRow = field.querySelector('.we-field-label-row').getBoundingClientRect();
                    const control = field.querySelector('input, select').getBoundingClientRect();
                    return { labelTop: label.top, controlTop: control.top, gap: control.top - labelRow.bottom };
                }));
                assert.equal(rows.length, 5);
                for (const row of rows) {
                    assert.ok(Math.abs(row.labelTop - rows[0].labelTop) < 1);
                    assert.ok(Math.abs(row.controlTop - rows[0].controlTop) < 1);
                    assert.equal(row.gap, 2);
                }
            }
            const moreFieldsButton = page.getByRole('button', { name: 'More fields', exact: true });
            assert.equal(await moreFieldsButton.getAttribute('title'), 'More fields');
            assert.equal(await moreFieldsButton.evaluate(element => element.classList.contains('we-info-icon')), true);
            assert.equal(await moreFieldsButton.locator('..').locator('label').getAttribute('for'), 'record-field-' + primary);
            assert.equal(await moreFieldsButton.evaluate(element => element.classList.contains('icon-arrow-down-rounded') ? 1 : 0), 1);
            await moreFieldsButton.press('Enter');
            assert.equal(await moreFieldsButton.getAttribute('aria-expanded'), 'true');
            assert.equal(await moreFieldsButton.evaluate(element => element.classList.contains('icon-arrow-up-rounded') ? 1 : 0), 1);
            assert.equal(await moreFieldsButton.evaluate(element => element.classList.contains('icon-arrow-down-rounded') ? 1 : 0), 0);
            assert.equal(await page.locator('#record-application').isVisible(), true);
            if (table === 'sys_script_include') {
                assert.equal(await page.locator('#record-more-description').isVisible(), true);
                await checkDescriptionSizing(page, '#record-more-description');
                assert.equal(await page.locator('#record-more-api_name').isVisible(), true);
                assert.equal(await page.locator('#record-more-api_name').evaluate(element => element.tagName), 'INPUT');
                assert.equal(await page.locator('#record-more-description').evaluate(element => element.tagName), 'TEXTAREA');
            }
            await page.locator('#record-field-' + primary).click();
            assert.equal(await moreFieldsButton.getAttribute('aria-expanded'), 'false');
            assert.equal(await moreFieldsButton.evaluate(element => element.classList.contains('icon-arrow-down-rounded') ? 1 : 0), 1);
            assert.equal(await moreFieldsButton.evaluate(element => element.classList.contains('icon-arrow-up-rounded') ? 1 : 0), 0);
            if (table === 'sp_ng_template') {
                assert.equal(await page.locator('#record-field-sp_widget').inputValue(), 'Parent widget');
                assert.equal(await page.locator('#record-field-sp_widget').getAttribute('readonly'), 'readonly');
            }
            await page.locator('#record-field-' + primary).fill('Renamed');
            assert.equal(await page.locator('.we-record-name').innerText(), 'Renamed', table);
            if (table === 'sys_script_include' || table === 'sp_ng_template') {
                await page.evaluate(narrow => editorScope.$apply(() => { editorScope.isNarrowLayout = narrow; }), table === 'sp_ng_template');
                await page.getByRole('button', { name: 'Unsaved changes details', exact: true }).click();
                await page.getByRole('button', { name: 'Revert', exact: true }).click();
                assert.equal(await page.getByText('Discard unsaved changes?', { exact: true }).isVisible(), true);
                await page.getByRole('button', { name: 'Cancel', exact: true }).click();
                await page.waitForFunction(() => !editorScope.showRevertConfirm);
                assert.equal(await page.locator('#record-field-' + primary).inputValue(), 'Renamed');
            }
            assert.equal(await page.locator('#record-field-' + primary).locator('..').getByRole('button', { name: 'Save', exact: true }).count(), 0);
            await page.getByRole('button', { name: 'Save', exact: true }).click();
            const code = fixture.core_editor_defs[0].field;
            await page.evaluate(code => editorScope.$apply(() => {
                editorScope.widget[code] = 'edited code';
                editorScope.savePaneField(editorScope.visibleItems.find(pane => pane.field === code));
            }), code);
            const saves = await page.evaluate(() => calls.filter(call => call.sysparm_name === 'saveField'));
            assert.deepEqual(saves.map(call => [call.record_table, call.field, call.value]), [[table, code, 'edited code']]);
            const headerSave = await page.evaluate(() => calls.find(call => call.sysparm_name === 'saveWidget'));
            assert.deepEqual(JSON.parse(headerSave.data), { [primary]: 'Renamed' });
            assert.deepEqual(JSON.parse(headerSave.original), { [primary]: fixture.widget[primary] });
            assert.equal(await page.evaluate(() => editorScope.headerDirty[editorScope.recordPrimaryField]), false, table);
            assert.equal(await page.evaluate(() => editorScope.hasUnsavedChanges()), false, table);
            if (table === 'sys_script_include') {
                const sandbox = page.getByRole('checkbox', { name: 'Sandbox enabled', exact: true });
                assert.equal(await sandbox.isChecked(), false);
                await sandbox.check();
                await page.getByRole('button', { name: 'Save', exact: true }).click();
                const saved = await page.evaluate(() => calls.filter(call => call.sysparm_name === 'saveWidget').at(-1));
                assert.deepEqual(JSON.parse(saved.data), { sandbox_callable: true });
                assert.deepEqual(JSON.parse(saved.original), { sandbox_callable: false });
                assert.equal(await page.evaluate(() => editorScope.hasUnsavedChanges()), false);
            }
            await page.evaluate(() => editorScope.copyWidgetUrl());
            const copied = new URL(await page.evaluate(() => copiedUrl));
            const destination = new URL(copied.searchParams.get('uri'), 'https://instance.test');
            assert.equal(destination.searchParams.has('widget_id'), false, table);
            assert.equal(destination.searchParams.get('record_table'), table);
            assert.equal(destination.searchParams.get('record_sys_id'), id);
            const resetKeys = await page.evaluate(() => {
                editorScope.userPrefsEdit = { editors: editorScope.coreEditorDefs.map(def => ({ key: def.key, visible: false })) };
                editorScope.resetUserPrefsModal();
                return editorScope.userPrefsEdit.editors.map(def => def.key);
            });
            assert.deepEqual(resetKeys, fixture.core_editor_defs.map(def => def.key), table);
            if (table === 'sys_script_include') {
                await page.locator('#record-field-name').fill('Keep these edits');
                await page.evaluate(() => editorScope.$apply(() => editorScope.newRecord('sp_css')));
                const confirm = page.locator('dialog[we-modal-dialog="pendingNewWidget"]');
                assert.equal(await confirm.isVisible(), true);
                assert.equal(await page.evaluate(() => editorScope.pendingNewWidget), 'sp_css');
                await page.evaluate(() => { window.failNextSave = true; });
                await confirm.getByRole('button', { name: 'Save & Continue', exact: true }).click();
                await page.waitForFunction(() => !editorScope.savingBeforeNewRecord);
                assert.equal(await confirm.isVisible(), true);
                assert.match(await confirm.innerText(), /Save rejected/);
                assert.equal(page.url(), 'https://instance.test/editor-fixture');
                await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
                assert.equal(await page.locator('#record-field-name').inputValue(), 'Keep these edits');
                await page.locator('#record-field-name').fill('Renamed');
            }
            await page.evaluate(() => editorScope.$apply(() => {
                editorScope.canWriteWidget = false;
                editorScope.visibleItems.forEach(pane => { if (pane.type === 'pane') pane.readOnly = true; });
            }));
            assert.equal(await page.getByRole('button', { name: 'Read-only access details', exact: true }).count(), 1, table);
            assert.equal(await page.locator('.we-pane-infobar').count(), 0, table);
            if (table === 'sp_css') {
                await page.evaluate(() => editorScope.$apply(() => { editorScope.widgetSysPolicy = 'protected'; editorScope.widgetSysPolicyDisplay = ''; }));
                const policy = page.getByRole('button', { name: 'Policy details', exact: true });
                await policy.hover();
                await page.waitForFunction(() => editorScope.openDropdown === 'alert-syspolicy');
                await policy.click();
                assert.equal(await policy.getAttribute('aria-expanded'), 'true');
                const body = page.locator('[close-key="\'alert-syspolicy\'"] .we-alert-popover-body');
                assert.equal((await body.innerText()).replace(/\s+/g, ' ').trim(), 'Renamed is protected and cannot be edited.');
                await page.evaluate(() => editorScope.$apply(() => { editorScope.widgetSysPolicyDisplay = 'Read-only'; }));
                assert.equal((await body.innerText()).replace(/\s+/g, ' ').trim(), 'Renamed is read-only and cannot be edited.');
                await page.evaluate(() => editorScope.$apply(() => { editorScope.widgetSysPolicyDisplay = ''; editorScope.widget.name = ''; }));
                assert.equal((await body.innerText()).replace(/\s+/g, ' ').trim(), 'This style sheet is protected and cannot be edited.');
                await page.evaluate(() => editorScope.$apply(() => { editorScope.widgetSysPolicy = ''; editorScope.widget.name = 'Renamed'; editorScope.openDropdown = null; }));
            }
            assert.equal(await page.locator('[ng-click="newRecord()"]').textContent(), 'New ' + fixture.record_label);
            await page.evaluate(() => editorScope.newRecord('sys_user'));
            assert.equal(await page.evaluate(() => openedRecords.length), 0);
            await page.evaluate(() => editorScope.$apply(() => editorScope.openWidgetPickerModal()));
            const expectedIcon = {
                sys_script_include: 'icon-document-code', sp_css: 'icon-marker', sys_ui_script: 'icon-code',
                sp_angular_provider: 'icon-console', sys_ui_page: 'icon-application-generic', sp_ng_template: 'icon-layout',
            }[table];
            assert.equal(await page.locator('.we-picker-col-main .we-picker-item-icon i').first().getAttribute('class'), expectedIcon);
            const trigger = page.getByRole('button', { name: /^Record type:/ });
            assert.equal(await page.locator('.we-picker-type').evaluate(element => getComputedStyle(element).marginLeft), '8px');
            const triggerStyle = await trigger.evaluate(element => {
                const style = getComputedStyle(element);
                return [style.borderBottomStyle, style.borderTopWidth, style.paddingTop, style.backgroundColor, style.borderRadius];
            });
            assert.deepEqual(triggerStyle, ['dotted', '0px', '0px', 'rgba(0, 0, 0, 0)', '0px']);
            await trigger.click();
            const menu = page.locator('#we-picker-type-menu');
            const menuStyles = element => {
                const style = getComputedStyle(element);
                return [style.backgroundColor, style.border, style.borderRadius, style.boxShadow, style.minWidth];
            };
            assert.deepEqual(await menu.evaluate(menuStyles), await page.locator('.we-dropdown-menu-right').evaluate(menuStyles));
            const firstOption = menu.getByRole('menuitem').first();
            assert.deepEqual(await firstOption.evaluate(element => {
                const style = getComputedStyle(element);
                return [style.paddingTop, style.paddingRight, style.textDecorationLine, style.color];
            }), ['8px', '12px', 'none', 'rgb(29, 49, 56)']);
            await firstOption.hover();
            assert.equal(await firstOption.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(224, 238, 241)');
            assert.equal(await menu.locator('[aria-current="true"]').innerText(), types.find(type => type.table === table).label);
            assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), types.map(type => type.label).sort((a, b) => a.localeCompare(b)));
            if (table === 'sp_css') {
                await page.evaluate(({ id }) => editorScope.$apply(() => {
                    editorScope.userPrefs.showRecentlyOpenedWidgets = true;
                    editorScope.userPrefs.showOpenHistory = true;
                    editorScope.recentWidgetsResolved = [
                        { table: 'sp_css', sys_id: id, name: 'Recent style', id: '', canWrite: true },
                        { table: 'sp_widget', sys_id: id, name: 'Recent widget', id: 'recent-widget', canWrite: true },
                        { table: 'sys_script_include', sys_id: id, name: 'Read-only include', id: '', canWrite: false },
                    ];
                }), { id });
                const recent = page.locator('.we-picker-col-recent .we-picker-item');
                assert.deepEqual(await recent.nth(0).locator('.we-picker-item-id').allTextContents(), ['Style Sheet']);
                assert.deepEqual(await recent.nth(1).locator('.we-picker-item-id').allTextContents(), ['recent-widget']);
                assert.equal(await recent.nth(0).locator('.we-picker-item-icon i').getAttribute('class'), 'icon-marker');
                assert.equal(await recent.nth(1).locator('.we-picker-item-icon i').getAttribute('class'), 'icon-script');
                assert.equal(await recent.nth(2).locator('.we-picker-item-icon i').getAttribute('class'), 'icon-locked');
                assert.equal(await page.locator('.we-picker-col-main .we-picker-item-id').count(), 0);
            }
            await menu.getByRole('menuitem', { name: 'UI Pages', exact: true }).click();
            await page.waitForFunction(() => calls.some(call => call.sysparm_name === 'getEditorRecords' && call.record_table === 'sys_ui_page'));
            assert.equal(await trigger.textContent(), 'UI Page');
            assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
            await page.waitForFunction(() => document.activeElement.id === 'we-picker-search');
            await trigger.press('ArrowDown');
            await page.waitForFunction(() => document.activeElement.textContent === 'Angular HTML templates');
            await page.keyboard.press('ArrowDown');
            assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Angular Providers');
            await page.keyboard.press('Escape');
            assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
            assert.equal(await page.evaluate(() => editorScope.showWidgetPickerModal), true);
            await trigger.click();
            await page.locator('.we-picker-title-left').click({ position: { x: 2, y: 2 } });
            assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
            if (table === 'sys_script_include') {
                await page.evaluate(() => editorScope.$apply(() => {
                    editorScope.canWriteWidget = true;
                    editorScope.widget.name = 'Saved before New';
                }));
                await page.getByRole('button', { name: '+ New UI Page', exact: true }).click();
                const confirm = page.locator('dialog[we-modal-dialog="pendingNewWidget"]');
                assert.equal(await confirm.isVisible(), true);
                assert.equal(await page.evaluate(() => editorScope.pendingNewWidget), 'sys_ui_page');
                await Promise.all([
                    page.waitForURL(url => url.pathname === '/ui_page.do' && url.searchParams.get('new') === '1'),
                    confirm.getByRole('button', { name: 'Save & Continue', exact: true }).click(),
                ]);
                const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('lastSaveBeforeNew')));
                assert.equal(saved.record_table, 'sys_script_include');
                assert.equal(JSON.parse(saved.data).name, 'Saved before New');
            } else {
                await Promise.all([
                    page.waitForURL(url => url.pathname === '/ui_page.do' && url.searchParams.get('new') === '1'),
                    page.getByRole('button', { name: '+ New UI Page', exact: true }).click(),
                ]);
            }
            const pickerUrl = new URL(page.url());
            assert.equal(pickerUrl.searchParams.get('record_table'), 'sys_ui_page');
            assert.equal(pickerUrl.searchParams.get('new'), '1');
            assert.equal(pickerUrl.searchParams.has('record_sys_id'), false);
            assert.equal(page.context().pages().length, 1);
        }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});

test('new records open directly in Editor+, create on Save and retain newer typing', async () => {
    const { chromium } = require('@playwright/test');
    const { markup, browserClient } = browserFixture();
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const table of supported.slice(1)) {
            await page.goto('about:blank');
            await page.setContent(markup);
            const defaults = serverHarness(table).api.getWidgetDefaults();
            const types = serverHarness().api.getEditorRecordTypes().types;
            await page.evaluate(({ table, defaults, types, id }) => {
                window.WE_CONFIG = { record_table: table, sys_id: '', is_new: true, widgetPageSysId: 'page-id' };
                window.require = () => {};
                window.calls = [];
                history.replaceState = (_state, _title, url) => window.savedUrl = url;
                window.GlideAjax = function () {
                    const params = {};
                    this.addParam = (name, value) => params[name] = value;
                    this.getXML = callback => {
                        window.calls.push(params);
                        const respond = answer => callback({ responseXML: { documentElement: { getAttribute: () => JSON.stringify(answer) } } });
                        if (params.sysparm_name === 'saveWidget') {
                            window.finishCreation = success => {
                                const record = { ...defaults, widget: { ...defaults.widget, ...JSON.parse(params.data), sys_id: id, api_name: 'global.NewRecord' } };
                                respond(success ? { success: true, sys_id: id, created_record: record } : { success: false, error: 'Creation rejected' });
                            };
                        } else if (params.sysparm_name === 'getWidgetDefaults') respond(defaults);
                        else if (params.sysparm_name === 'getEditorRecordTypes') respond({ success: true, types });
                        else if (params.sysparm_name === 'getUserPrefs') respond({ success: true, value: '{}' });
                        else respond({ success: true, versions: [] });
                    };
                };
            }, { table, defaults, types, id });
            await page.addScriptTag({ path: require.resolve('angular/angular.js') });
            await page.addScriptTag({ content: browserClient });
            await page.evaluate(() => {
                angular.bootstrap(document.querySelector('main'), ['widgetEditor']);
                window.editorScope = angular.element(document.querySelector('main')).scope();
            });
            await page.waitForFunction(() => !editorScope.loading);
            assert.equal(await page.evaluate(() => editorScope.loadError), null, table);
            assert.equal(await page.evaluate(() => editorScope.isNewWidget), true);
            assert.equal(await page.evaluate(() => calls.some(call => call.sysparm_name === 'saveWidget' || call.sysparm_name === 'getVersions')), false);
            assert.equal(await page.locator('.we-record-name').innerText(), 'New ' + defaults.record_label, table);
            await page.locator('#record-field-' + defaults.primary_field).fill('NewRecord');
            assert.equal(await page.locator('.we-record-name').innerText(), 'NewRecord', table);
            await page.locator('#record-field-' + defaults.primary_field).fill('');
            assert.equal(await page.locator('.we-record-name').innerText(), 'New ' + defaults.record_label, table);
            await page.locator('#record-field-' + defaults.primary_field).fill('NewRecord');
            await page.getByRole('button', { name: 'Unsaved changes details', exact: true }).click();
            assert.equal(await page.getByRole('button', { name: 'Compare', exact: true }).count(), 0);
            await page.getByRole('button', { name: 'Revert', exact: true }).click();
            assert.equal(await page.getByText('Discard unsaved changes?', { exact: true }).isVisible(), true);
            await page.getByRole('button', { name: 'Cancel', exact: true }).click();
            await page.waitForFunction(() => !editorScope.showRevertConfirm);
            assert.equal(await page.locator('#record-field-' + defaults.primary_field).inputValue(), 'NewRecord');
            const field = defaults.core_editor_defs[0].field;
            await page.evaluate(field => editorScope.$apply(() => { editorScope.widget[field] = 'created code'; }), field);
            const save = page.getByRole('button', { name: 'Save', exact: true });
            await save.click();
            assert.equal(await save.isDisabled(), true);
            await page.evaluate(() => editorScope.$apply(() => editorScope.saveAll()));
            assert.equal(await page.evaluate(() => calls.filter(call => call.sysparm_name === 'saveWidget').length), 1);
            if (table === 'sys_ui_page') {
                await page.evaluate(() => finishCreation(false));
                await page.waitForFunction(() => !editorScope.creatingRecord);
                assert.equal(await page.evaluate(() => editorScope.isNewWidget), true);
                assert.equal(await page.evaluate(field => editorScope.widget[field], field), 'created code');
                assert.equal(await page.evaluate(() => editorScope.saveError), 'Creation rejected');
                await save.click();
            }
            const creation = await page.evaluate(() => calls.filter(call => call.sysparm_name === 'saveWidget').at(-1));
            assert.equal(creation.new_record, 'true');
            assert.equal(creation.sys_id, '');
            assert.equal(JSON.parse(creation.data)[field], 'created code');
            await page.evaluate(field => editorScope.$apply(() => { editorScope.widget[field] = 'newer typing'; }), field);
            await page.evaluate(() => finishCreation(true));
            await page.waitForFunction(() => !editorScope.isNewWidget);
            assert.equal(await page.evaluate(() => editorScope.widget.sys_id), id);
            assert.equal(await page.evaluate(field => editorScope.widget[field], field), 'newer typing');
            assert.equal(await page.evaluate(() => editorScope.hasUnsavedChanges()), true);
            const url = new URL(await page.evaluate(() => savedUrl), 'https://instance.test');
            assert.equal(url.searchParams.get('record_table'), table);
            assert.equal(url.searchParams.get('record_sys_id'), id);
            assert.equal(url.searchParams.has('new'), false);
            assert.equal(url.searchParams.has('widget_id'), false);
            if (table === 'sys_script_include') assert.equal(await page.evaluate(() => editorScope.widget.api_name), 'global.NewRecord');
            await page.evaluate(field => editorScope.$apply(() => editorScope.savePaneField(editorScope.visibleItems.find(pane => pane.field === field))), field);
            const fieldSave = await page.evaluate(() => calls.find(call => call.sysparm_name === 'saveField'));
            assert.equal(fieldSave.sys_id, id);
            assert.equal(fieldSave.new_record, undefined);
            assert.deepEqual(JSON.parse(fieldSave.original), { [field]: 'created code' });
            assert.equal(await page.evaluate(() => editorScope.hasUnsavedChanges()), false);
            assert.equal(await page.evaluate(() => calls.some(call => ['getTemplates', 'getProviders', 'saveEs12'].includes(call.sysparm_name))), false);
        }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
    }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = 'src/fluent/generated/';
const mergeScript = fs.readFileSync(root + 'other/sys-ui-page/widget_editor_merge.js', 'utf8');
const client = fs.readFileSync(root + 'other/sys-ui-page/widget_editor_compare.client.js', 'utf8');
const source = fs.readFileSync(root + 'server-development/script-include/sys_script_include_widget_editor_ajax.server.js', 'utf8');
const context = { window: {} };
vm.runInNewContext(mergeScript, context);
const mergeBlock = context.window.WEMergeEditor.mergeBlock;
const change = (a, b, c, d) => ({ originalStartLineNumber: a, originalEndLineNumber: b, modifiedStartLineNumber: c, modifiedEndLineNumber: d });

test('merge blocks replace, insert and delete only the selected lines, including empty files and end boundaries', () => {
    for (const [from, into, block, expected] of [
        ['a\nnew\nc', 'a\nold\nc', change(2, 2, 2, 2), 'a\nnew\nc'],
        ['new\na', 'a', change(1, 1, 0, 0), 'new\na'],
        ['a\nnew\nb', 'a\nb', change(2, 2, 1, 0), 'a\nnew\nb'],
        ['a\nnew', 'a', change(2, 2, 1, 0), 'a\nnew'],
        ['a\nb', 'a\nremove\nb', change(1, 0, 2, 2), 'a\nb'],
        ['a', 'remove\na', change(0, 0, 1, 1), 'a'],
        ['a', 'a\nremove', change(1, 0, 2, 2), 'a'],
        ['a\n', '', change(1, 2, 0, 0), 'a\n'],
        ['', 'a\n', change(0, 0, 1, 2), ''],
    ]) assert.equal(mergeBlock(from, into, block, '\n'), expected);
    assert.equal(mergeBlock('a\r\nnew\r\nc', 'a\r\nold\r\nc', change(2, 2, 2, 2), '\r\n'), 'a\r\nnew\r\nc');
    const large = Array(150000).fill('line').join('\n');
    assert.equal(mergeBlock(large, '', change(1, 150000, 0, 0), '\n'), large);
});

function server(overrides = {}) {
    const values = { script: 'current script', css: 'current css', sys_policy: '', servicenow: '0', ...overrides.values };
    const writes = [], sets = [];
    const params = { table: 'sp_widget', record_id: 'a'.repeat(32), fields: JSON.stringify({ script: 'merged script', css: 'merged css' }), original: JSON.stringify({ script: 'current script', css: 'current css' }), ...overrides.params };
    const ctx = {
        Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        Object: { extendsObject: (_, methods) => methods, keys: Object.keys, prototype: Object.prototype }, gs: { getProperty: (_name, fallback) => fallback },
        WidgetEditorAssistantAjax: function () { this._getExportEs12Override = () => null; },
        GlideRecord: function () {
            let index = -1;
            const rows = overrides.dictionary || ['script', 'css', 'sys_name'].map(element => ({ element, internal_type: 'string' }));
            this.addQuery = this.addNotNullQuery = this.query = () => {};
            this.next = () => ++index < rows.length;
            this.getValue = name => rows[index][name] || '';
        },
        GlideRecordSecure: function (table) {
            if (table === 'sys_update_xml') {
                this.addQuery = this.orderByDesc = this.setLimit = this.query = () => {};
                this.next = () => false;
                return;
            }
            this.getUniqueValue = () => params.record_id;
            this.get = () => overrides.exists !== false;
            this.canRead = () => overrides.canRead !== false;
            this.canWrite = () => overrides.canWrite !== false;
            this.isValidField = () => true;
            this.getValue = name => values[name];
            this.getDisplayValue = name => name ? (overrides.displayValues || {})[name] || values[name] : values.name || 'Record';
            this.getElement = name => ({ canRead: () => name !== overrides.unreadable, canWrite: () => name !== overrides.readOnly,
                isMandatory: () => name === overrides.mandatory, getED: () => ({ getLength: () => overrides.maxLength || 1000000,
                    getInternalType: () => (overrides.types || {})[name] || 'string' }) });
            this.setValue = (name, value) => { sets.push(name); values[name] = value; };
            this.update = () => { writes.push('update'); return overrides.update !== false; };
        },
    };
    vm.createContext(ctx); vm.runInContext(source, ctx);
    const api = ctx.WidgetEditorAjax.prototype;
    api.getParameter = name => params[name];
    api._answer = result => JSON.parse(JSON.stringify(result));
    api._getDiffFieldDefs = () => overrides.allowed === false ? { success: false, error: 'Table not allowed' } : overrides.defs || {
        success: true, fields: [{ key: 'script', renderAs: 'code' }], extra_fields: [{ key: 'css', renderAs: 'code' }, { key: 'name', renderAs: 'text' }],
    };
    return { api, writes, sets, values };
}

test('Compare saves all staged code fields in one update and returns saved values', () => {
    const h = server();
    const result = h.api.saveMergedFields();
    assert.equal(result.success, true, JSON.stringify(result));
    assert.deepEqual(h.writes, ['update']);
    assert.deepEqual(result.values, { script: 'merged script', css: 'merged css' });
});

test('Compare record metadata reports actual field ACLs and denies unreadable, read-only and non-writable records', () => {
    const h = server({ readOnly: 'sys_name' });
    assert.deepEqual(h.api.getRecordForDiff().record.writable_fields, { script: true, css: true, sys_name: false });
    assert.equal(server({ unreadable: 'css' }).api.getRecordForDiff().record.writable_fields.css, false);
    assert.deepEqual(server({ canWrite: false }).api.getRecordForDiff().record.writable_fields, { script: false, css: false, sys_name: false });
});

test('Compare merges text fields atomically with code and rejects non-text dictionary types', () => {
    const fields = { name: 'Merged name', description: 'Merged description', script: 'merged script', status: 'published' };
    const defs = { success: true, fields: [{ key: 'name', type: 'string' }, { key: 'script', renderAs: 'code' }], extra_fields: [{ key: 'description', type: 'translated_text' }, { key: 'status', type: 'string', renderAs: 'choice' }] };
    const h = server({ defs, values: { name: 'Current name', description: 'Current description', status: 'draft' }, displayValues: { status: 'Published' },
        params: { fields: JSON.stringify(fields), original: JSON.stringify({ name: 'Current name', description: 'Current description', script: 'current script', status: 'draft' }) } });
    const result = h.api.saveMergedFields(); assert.equal(result.success, true);
    assert.deepEqual(result.values, fields);
    assert.equal(result.name, 'Merged name');
    assert.deepEqual(result.display_values, { status: 'Published' });
    assert.deepEqual(h.sets, ['name', 'description', 'script', 'status']); assert.deepEqual(h.writes, ['update']);
    for (const type of ['boolean', 'integer', 'decimal', 'glide_date', 'glide_date_time', 'reference', 'glide_list', 'password2']) {
        const rejected = server({ defs, types: { name: type }, values: { name: 'Current name', description: 'Current description' },
            params: { fields: JSON.stringify(fields), original: JSON.stringify({ name: 'Current name', description: 'Current description', script: 'current script' }) } });
        assert.equal(rejected.api.saveMergedFields().success, false, type);
        assert.deepEqual(rejected.sets, []); assert.deepEqual(rejected.writes, []);
    }
    for (const type of ['string', 'translated_field', 'translated_html', 'properties', 'conditions', 'script_server', 'json'])
        assert.equal(h.api._isMergeableDiffFieldType(type), true, type);
});

test('Compare rejects access violations, protected records, invalid fields and conflicts before changing any field', () => {
    for (const options of [
        { exists: false }, { canRead: false }, { canWrite: false }, { allowed: false },
        { values: { sys_policy: 'protected' } }, { values: { servicenow: '1' } },
        { readOnly: 'css' }, { unreadable: 'script' },
        { values: { css: 'changed elsewhere' } }, { maxLength: 3 },
        { params: { fields: '{bad' } }, { params: { fields: '[]' } },
        { params: { record_id: 'not-a-record' } }, { params: { table: 'bad.table' } },
        { params: { fields: '{}' } },
        { params: { fields: JSON.stringify({ name: 'not code' }), original: JSON.stringify({ name: '' }) } },
        { params: { fields: JSON.stringify({ script: null }) } }, { params: { original: '{}' } },
        { mandatory: 'script', params: { fields: JSON.stringify({ script: '' }) } },
    ]) {
        const h = server(options);
        assert.equal(h.api.saveMergedFields().success, false, JSON.stringify(options));
        assert.deepEqual(h.sets, [], JSON.stringify(options));
        assert.deepEqual(h.writes, [], JSON.stringify(options));
    }
    assert.equal(server({ update: false }).api.saveMergedFields().success, false);
});

function controller() {
    const requests = [], editors = [], listeners = {}, timers = [];
    const ctrl = { merge: null, mergeMode: true, mergeSaving: false, mergeMessage: '', canWrite: true, recordSysPolicy: '', expandedIndex: 0, expandedExtraIndex: null, expandedString: null,
        collapseExpanded() { this.expandedIndex = null; }, collapseExtraExpanded() { this.expandedExtraIndex = null; }, collapseStringExpanded() { this.expandedString = null; },
        scriptFields: [{ key: 'script', label: 'Script', language: 'javascript', isScript: true }, { key: 'css', label: 'CSS', language: 'css', isScript: true }],
        leftFields: { script: 'previous script', css: 'previous css' }, rightFields: { script: 'later script', css: 'later css' } };
    const ctx = { ctrl, _mergedFields: Object.create(null), _mergeEditor: null, _recordData: { writable_fields: { script: true, css: true, extra_script: true, name: true, mode: true }, values: { script: 'current script', css: 'current css' } }, _savedRecordData: null,
        _apply: fn => fn(), _headerHeight: () => 100, _setWrapTop() {}, _langForEditor: value => value, _syncScope() {}, _setupLanguageServices() {},
        document: { getElementById: () => ({ style: {} }) }, tableParam: 'sp_widget', recordId: 'a'.repeat(32),
        $timeout: Object.assign((fn, delay) => { if (!delay) return fn(); const timer = { fn }; timers.push(timer); return timer; }, { cancel() {} }), $scope: { $on() {} },
        _ajax: (name, params, callback) => requests.push({ name, params, callback }),
        window: { monaco: {}, confirm: () => true, addEventListener: (name, handler) => { listeners[name] = handler; }, removeEventListener() {},
            WEMergeEditor: { create: (_container, previous, later, _language, _wrap, changed, initial) => {
                const editor = { previous, later, initial, changed, readOnly: false, disposed: false,
                    canUndo() { return !!this.undoAvailable; }, canRedo() { return !!this.redoAvailable; },
                    undo() { this.undone = true; }, redo() { this.redone = true; },
                    setReadOnly(value) { this.readOnly = value; }, dispose() { this.disposed = true; } };
                editors.push(editor); return editor;
            } } },
    };
    vm.createContext(ctx);
    vm.runInContext(client.slice(client.indexOf('ctrl.hasMergedField ='), client.indexOf('//////// Expand / collapse')), ctx);
    vm.runInContext(client.slice(client.indexOf('ctrl.collapseAnyExpanded ='), client.indexOf('ctrl.expandedFieldLabel =')), ctx);
    return { ctrl, requests, editors, listeners, timers, ctx };
}

test('merge fields start from later, survive switching fields and save together with their original current values', () => {
    const h = controller();
    const messages = [];
    h.ctx.window.parent = { postMessage: (message, origin) => messages.push({ message, origin }) };
    h.ctx.window.location = { origin: 'https://example.service-now.com' };
    h.ctrl.startMerge();
    assert.equal(h.editors[0].initial, 'later script');
    assert.equal(h.editors[0].later, 'later script');
    h.editors[0].changed('combined script'); h.ctrl.endMerge();
    assert.equal(h.editors[0].disposed, true);
    h.ctrl.expandedIndex = 1; h.ctrl.startMerge(); h.editors[1].changed('combined css'); h.ctrl.endMerge();
    h.ctrl.expandedIndex = 0; h.ctrl.startMerge();
    assert.equal(h.editors[2].initial, 'combined script');
    h.ctrl.saveMerges();
    assert.equal(h.requests.length, 0, 'saving is unavailable while a field is being edited');
    h.ctrl.endMerge(); h.ctrl.saveMerges(); h.ctrl.saveMerges();
    assert.equal(h.requests.length, 1, 'duplicate saves are blocked');
    assert.equal(h.editors[2].disposed, true);
    assert.deepEqual(JSON.parse(h.requests[0].params.fields), { script: 'combined script', css: 'combined css' });
    assert.deepEqual(JSON.parse(h.requests[0].params.original), { script: 'current script', css: 'current css' });
    h.requests[0].callback({ success: false, error: 'Conflict' });
    assert.equal(messages.length, 0, 'a failed save cannot change the parent editor');
    assert.equal(h.ctrl.mergeMessage, 'Conflict'); assert.equal(h.ctrl.hasMergeChanges(), true);
    assert.equal(h.ctrl.mergeMode, true, 'a failed save keeps Merge+ active');
    let prevented = false;
    h.listeners.beforeunload({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    h.ctrl.saveMerges();
    h.requests[1].callback({ success: true, values: { script: 'combined script', css: 'combined css' }, name: 'Updated record', display_values: { mode: 'Updated choice' }, sys_updated_on: 'now', sys_updated_by: 'editor' });
    assert.equal(h.ctrl.hasMergeChanges(), false);
    assert.equal(h.ctrl.mergeMode, false, 'a successful save turns Merge+ off');
    assert.equal(h.ctrl.merge, null);
    assert.equal(h.ctx._recordData.values.script, 'combined script');
    assert.equal(h.ctx._recordData.name, 'Updated record'); assert.equal(h.ctx._recordData.display_values.mode, 'Updated choice');
    assert.equal(h.ctrl.mergeMessage, '');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].origin, 'https://example.service-now.com');
    assert.deepEqual(JSON.parse(JSON.stringify(messages[0].message)), {
        type: 'we-diff-saved', table: 'sp_widget', recordId: 'a'.repeat(32),
        values: { script: 'combined script', css: 'combined css' }, sys_updated_on: 'now', sys_updated_by: 'editor',
    });
});

test('finished drafts refresh right-hand comparisons across fields without replacing the later source, and discard restores it', () => {
    const h = controller(), ctx = h.ctx;
    const previewModels = () => ({ original: { setValue(value) { this.value = value; } }, modified: { setValue(value) { this.value = value; } } });
    const mainModels = [previewModels(), previewModels()], extraModel = previewModels();
    h.ctrl.editors = Object.fromEntries(mainModels.map((model, i) => [i, { getModel: () => model }]));
    h.ctrl.extraEditors = { 0: { getModel: () => extraModel } }; h.ctrl.updateEditorHeight = () => {};
    Object.assign(ctx, {
        _fieldDefs: h.ctrl.scriptFields.concat([{ key: 'name', type: 'string', mergeable: true }, { key: 'mode', type: 'string', renderAs: 'choice', mergeable: true }]), _extraFieldDefs: [{ key: 'extra_script', label: 'Extra script', renderAs: 'code' }],
        _allVersionsData: [], _leftIsCurrentSaved: false, _leftVersionData: { fields: { script: 'previous script', css: 'previous css', extra_script: 'previous extra', name: 'Previous name', mode: 'cold' } },
        _rightVersionData: null, _currentLeftId: 'left', _currentRightId: 'current', SITE_TITLE: 'ServiceNow', isEmbedded: false,
        _buildFields: (version, record, defs) => Object.fromEntries(defs.map(f => [f.key, (version ? version.fields : record.values)[f.key] || ''])),
        _buildDisplayFields: fields => fields, _buildRefDisplay: () => ({}), _buildListDisplay: () => ({}),
        _formatDate: value => value, _formatDateFull: value => value, _getVersionsList: () => [], _getEligibleRightVersions: () => [],
        _syncHistoryEntry() {}, setTimeout() {}, _sortFields() {}, _scheduleChangedBelowIndicatorUpdate() {},
        _resolveMonacoTheme: () => 'vs-dark', monaco: { editor: { setTheme() {} } },
        _notifyParentExpand() {},
        _diffLineCounts: (left, right) => ({ left, right }),
    });
    ctx._recordData.canWrite = true; ctx._recordData.values.extra_script = 'current extra';
    ctx._recordData.values.name = 'Current name';
    ctx._recordData.values.mode = 'warm'; ctx._recordData.display_values = { mode: 'Warm' };
    vm.runInContext(client.slice(client.indexOf('function _buildRefDisplay('), client.indexOf('function _buildListDisplay(')), ctx);
    vm.runInContext(client.slice(client.indexOf('function _syncScope()'), client.indexOf('ctrl.canExportXml =')), ctx);
    ctx._syncScope();
    h.ctrl.startMerge(); h.editors[0].changed('merged script'); h.ctrl.endMerge();
    assert.equal(h.ctrl.rightFields.script, 'merged script'); assert.equal(mainModels[0].modified.value, 'merged script');
    assert.equal(mainModels[0].original.value, 'previous script');
    assert.equal(ctx._recordData.values.script, 'current script', 'previewing does not save or change the record baseline');
    h.ctrl.startMerge();
    assert.equal(h.editors[1].initial, 'merged script'); assert.equal(h.editors[1].later, 'current script', 'Merge+ retains the selected later source');
    h.ctrl.endMerge();
    h.ctrl.expandedIndex = 1; h.ctrl.startMerge(); h.editors[2].changed('merged css'); h.ctrl.endMerge();
    assert.equal(mainModels[0].modified.value, 'merged script'); assert.equal(mainModels[1].modified.value, 'merged css');
    h.ctrl.expandedIndex = null; h.ctrl.expandedExtraIndex = 0;
    h.ctrl.startMerge(); h.editors[3].changed('previous extra'); h.ctrl.endMerge();
    assert.equal(extraModel.modified.value, 'previous extra');
    assert.equal(h.ctrl.extraChangedScriptFields[0].key, 'extra_script', 'edited extra fields remain visible even when they match the left version');
    vm.runInContext(client.slice(client.indexOf('ctrl.toggleStringExpand ='), client.indexOf('ctrl.collapseStringExpanded =')), ctx);
    h.ctrl.openStringMerge({ key: 'name', label: 'Name', mergeable: true });
    assert.equal(h.editors[4].initial, 'Current name'); h.editors[4].changed('Merged name'); h.ctrl.endMerge();
    assert.equal(h.ctrl.rightFields.name, 'Merged name'); assert.equal(h.ctrl.rightDisplayFields.name, 'Merged name');
    h.ctrl.openStringMerge({ key: 'mode', label: 'Mode', mergeable: true });
    h.editors[5].changed('cold'); h.ctrl.endMerge();
    assert.equal(h.ctrl.rightRefDisplay.mode, 'cold', 'a pending choice preview does not retain the old display label');
    assert.equal(h.ctrl.canMergeField({ type: 'boolean' }), false); assert.equal(h.ctrl.canMergeField({ type: 'integer' }), false);
    h.ctrl.discardMerges();
    assert.equal(mainModels[0].modified.value, 'current script'); assert.equal(mainModels[1].modified.value, 'current css');
    assert.equal(extraModel.modified.value, 'current extra'); assert.equal(h.ctrl.hasMergeChanges(), false);
    assert.equal(h.ctrl.rightDisplayFields.name, 'Current name');
    assert.equal(h.ctrl.rightRefDisplay.mode, 'Warm [warm]');
});

test('mergeable text fields retain whitespace in both historical and current values', () => {
    const ctx = {};
    vm.createContext(ctx); vm.runInContext(client.slice(client.indexOf('function _buildFields('), client.indexOf('function _buildDisplayFields(')), ctx);
    const defs = [{ key: 'name', renderAs: 'text', mergeable: true }];
    assert.equal(ctx._buildFields({ fields: { name: '  historical\n' } }, null, defs).name, '  historical\n');
    assert.equal(ctx._buildFields(null, { values: { name: '  current\n' } }, defs).name, '  current\n');
});

test('opening the latest saved version does not mark the record as edited', () => {
    const h = controller();
    h.ctx._recordData.values.script = 'later script';
    h.ctrl.startMerge();
    assert.equal(h.editors[0].initial, 'later script');
    assert.equal(h.ctrl.hasMergeChanges(), false);
    h.ctrl.endMerge();
    h.ctrl.startMerge();
    assert.equal(h.editors[1].initial, 'later script');
});

test('merge actions are hidden for unchanged fields and remain available for unsaved drafts', () => {
    const h = controller(), field = h.ctrl.scriptFields[0];
    h.ctrl.rightFields.script = h.ctrl.leftFields.script;
    assert.equal(h.ctrl.canMergeField(field), false); assert.equal(h.ctrl.canStartMerge(), false);
    h.ctrl.startMerge(); assert.equal(h.editors.length, 0);
    h.ctx._mergedFields.script = { original: 'current script', value: 'previous script', later: 'later script' };
    assert.equal(h.ctrl.canMergeField(field), true); assert.equal(h.ctrl.canStartMerge(), true);
    assert.equal(h.ctrl.canMergeField({ key: 'name', mergeable: true }), false);
});

test('field write access is required for code and string merges, including expanded and extra fields', () => {
    const h = controller();
    const text = { key: 'sys_name', label: 'System name', mergeable: true };
    h.ctrl.leftFields.sys_name = 'previous'; h.ctrl.rightFields.sys_name = 'later';
    assert.equal(h.ctrl.canMergeField(text), false);
    h.ctrl.openStringMerge(text); assert.equal(h.editors.length, 0);
    h.ctx._recordData.writable_fields.script = false;
    assert.equal(h.ctrl.canStartMerge(), false); h.ctrl.startMerge(); assert.equal(h.editors.length, 0);
    h.ctx._mergedFields.script = { original: 'current', value: 'merged' };
    assert.equal(h.ctrl.canMergeField(h.ctrl.scriptFields[0]), false, 'existing drafts cannot bypass field ACLs');
    h.ctrl.expandedIndex = null; h.ctrl.expandedString = text;
    assert.equal(h.ctrl.canStartMerge(), false);
    h.ctrl.expandedString = null; h.ctrl.expandedExtraIndex = 0;
    h.ctrl.extraChangedScriptFields = [{ key: 'extra_script', isScript: true, isExtra: true }];
    h.ctx._recordData.writable_fields.extra_script = false;
    assert.equal(h.ctrl.canStartMerge(), false);
    h.ctx._savedRecordData = { canWrite: true, writable_fields: { extra_script: true }, values: {} };
    h.ctrl.extraLeftFields = { extra_script: 'previous' }; h.ctrl.extraRightFields = { extra_script: 'later' };
    assert.equal(h.ctrl.canStartMerge(), true, 'unsaved snapshots use permissions from the current saved record');
    delete h.ctx._savedRecordData.writable_fields;
    assert.equal(h.ctrl.canStartMerge(), false, 'unknown field permissions fail closed');
});

test('saving an unsaved snapshot retains the current record and field permissions', () => {
    const h = controller();
    h.ctx._recordData.canWrite = false; delete h.ctx._recordData.writable_fields;
    h.ctx._savedRecordData = { canWrite: true, writable_fields: { script: true, css: false }, values: { script: 'current script' } };
    h.ctrl.startMerge(); h.ctrl.endMerge(); h.ctrl.saveMerges();
    h.requests[0].callback({ success: true, values: { script: 'merged script' } });
    assert.equal(h.ctx._recordData.canWrite, true);
    assert.equal(h.ctx._recordData.writable_fields.script, true); assert.equal(h.ctx._recordData.writable_fields.css, false);
    h.ctrl.mergeMode = true; h.ctrl.expandedIndex = 1;
    assert.equal(h.ctrl.canStartMerge(), false, 'saving does not make read-only fields mergeable');
});

test('Merge+ requires a changed writable text field, while every field type contributes to differences', () => {
    const h = controller(); h.ctrl.fields = h.ctrl.scriptFields;
    assert.equal(h.ctrl.hasMergeableFields(), true); assert.equal(h.ctrl.hasDifferences(), true);
    h.ctrl.leftFields = { ...h.ctrl.rightFields };
    assert.equal(h.ctrl.hasMergeableFields(), false); assert.equal(h.ctrl.hasDifferences(), false);
    h.ctrl.fields = [{ key: 'sys_name', mergeable: true }, { key: 'active', type: 'boolean' }];
    h.ctrl.leftFields = { sys_name: 'before', active: 'false' }; h.ctrl.rightFields = { sys_name: 'after', active: 'true' };
    assert.equal(h.ctrl.hasMergeableFields(), false); assert.equal(h.ctrl.hasDifferences(), true);
    h.ctrl.fields = [{ key: 'extra_script', isScript: true, isExtra: true }];
    h.ctrl.extraLeftFields = { extra_script: 'same\r\ncode' }; h.ctrl.extraRightFields = { extra_script: 'same\ncode' };
    assert.equal(h.ctrl.hasMergeableFields(), false); assert.equal(h.ctrl.hasDifferences(), false);
    h.ctrl.extraRightFields.extra_script = 'changed';
    assert.equal(h.ctrl.hasMergeableFields(), true); assert.equal(h.ctrl.hasDifferences(), true);
});

test('merge mode is opt-in, requires write access and turns off only after confirmed discard', () => {
    const h = controller(); h.ctrl.mergeMode = false;
    assert.equal(h.ctrl.canEditMerges(), false); h.ctrl.startMerge(); assert.equal(h.editors.length, 0);
    h.ctrl.canWrite = false; h.ctrl.toggleMergeMode(); assert.equal(h.ctrl.mergeMode, false);
    h.ctrl.canWrite = true; h.ctrl.toggleMergeMode(); assert.equal(h.ctrl.mergeMode, true);
    assert.equal(h.editors.length, 1, 'enabling Merge+ immediately opens the expanded field');
    h.ctrl.startMerge(); h.editors[0].changed('merged text');
    h.ctx.window.confirm = () => false; h.ctrl.toggleMergeMode(); assert.equal(h.ctrl.mergeMode, true); assert.notEqual(h.ctrl.merge, null);
    h.ctx.window.confirm = () => true; h.ctrl.toggleMergeMode();
    assert.equal(h.ctrl.mergeMode, false); assert.equal(h.ctrl.merge, null); assert.equal(h.ctrl.hasMergeChanges(), false);
    h.ctrl.toggleMergeMode(); h.ctrl.toggleMergeMode(); assert.equal(h.ctrl.mergeMode, false);
});

test('read-only and protected comparisons cannot start or save a merge, and discard clears staged fields', () => {
    const h = controller();
    for (const [canWrite, policy] of [[false, ''], [true, 'protected']]) {
        h.ctrl.canWrite = canWrite; h.ctrl.recordSysPolicy = policy;
        h.ctrl.startMerge(); h.ctrl.saveMerges();
        assert.equal(h.editors.length, 0); assert.equal(h.requests.length, 0);
    }
    h.ctrl.recordSysPolicy = ''; h.ctrl.startMerge(); h.ctrl.endMerge();
    h.ctrl.discardMerges(); assert.equal(h.ctrl.hasMergeChanges(), false);
    assert.equal(h.ctrl.expandedIndex, null);
});

test('discard collapses every expanded view and undo/redo use the active editor history', () => {
    const h = controller();
    assert.equal(h.ctrl.canUndoMerge(), false); assert.equal(h.ctrl.canRedoMerge(), false);
    h.ctrl.startMerge(); const editor = h.editors[0];
    h.ctrl.undoMerge(); h.ctrl.redoMerge();
    assert.equal(editor.undone, undefined); assert.equal(editor.redone, undefined);
    editor.undoAvailable = true;
    assert.equal(h.ctrl.canUndoMerge(), true); h.ctrl.undoMerge(); assert.equal(editor.undone, true);
    editor.redoAvailable = true;
    assert.equal(h.ctrl.canRedoMerge(), true); h.ctrl.redoMerge(); assert.equal(editor.redone, true);
    h.ctrl.expandedExtraIndex = 0; h.ctrl.expandedString = { key: 'name' };
    h.ctx.window.confirm = () => false; h.ctrl.discardMerges();
    assert.notEqual(h.ctrl.merge, null, 'cancelling discard preserves the editing view');
    h.ctx.window.confirm = () => true; h.ctrl.discardMerges();
    assert.equal(h.ctrl.merge, null); assert.equal(editor.disposed, true);
    assert.equal(h.ctrl.expandedIndex, null); assert.equal(h.ctrl.expandedExtraIndex, null); assert.equal(h.ctrl.expandedString, null);
    assert.equal(h.ctrl.canUndoMerge(), false); assert.equal(h.ctrl.canRedoMerge(), false);
    assert.equal(h.ctrl.hasMergeChanges(), false);
});

test('timed-out saves preserve merged code and late responses cannot clear newer edits', () => {
    const h = controller();
    h.ctrl.startMerge(); h.ctrl.endMerge(); h.ctrl.saveMerges();
    h.timers[0].fn();
    assert.equal(h.ctrl.mergeSaving, false);
    assert.match(h.ctrl.mergeMessage, /timed out/);
    h.ctrl.startMerge(); h.editors[1].changed('newer local edit');
    h.requests[0].callback({ success: true, values: { script: 'previous script' } });
    assert.equal(h.ctrl.hasMergeChanges(), true);
    h.ctrl.endMerge(); h.ctrl.saveMerges();
    assert.equal(JSON.parse(h.requests[1].params.fields).script, 'newer local edit');
});

test('the latest typed value is staged before Angular runs its next digest', () => {
    const h = controller();
    const queued = [];
    h.ctx._apply = fn => queued.push(fn);
    h.ctrl.startMerge();
    h.editors[0].changed('last keystroke');
    h.ctrl.endMerge(); h.ctrl.saveMerges();
    assert.equal(JSON.parse(h.requests[0].params.fields).script, 'last keystroke');
    assert.equal(queued.length, 1);
});

test('another merge field cannot be opened while a record save is pending', () => {
    const h = controller();
    h.ctrl.startMerge(); h.ctrl.endMerge(); h.ctrl.saveMerges();
    h.ctrl.expandedIndex = 1; h.ctrl.startMerge();
    assert.equal(h.ctrl.merge, null);
    assert.equal(h.editors.length, 1);
});

test('closing an embedded comparison requires confirming the loss of unsaved merged fields', () => {
    const editor = fs.readFileSync(root + 'other/sys-ui-page/widget_editor_plus.client.js', 'utf8');
    let closed = 0, approved = false;
    const ctx = { $scope: { versionDiffModal: {} }, document: { querySelector: () => ({ contentWindow: { WE_HAS_UNSAVED_MERGE: () => true } }) },
        window: { confirm: () => approved }, _closeModal(fn) { closed++; fn(); } };
    vm.runInNewContext(editor.slice(editor.indexOf('$scope.closeVersionDiffModal ='), editor.indexOf('$scope.openVersionDiffInNewTab =')), ctx);
    ctx.$scope.closeVersionDiffModal(); assert.equal(closed, 0);
    approved = true; ctx.$scope.closeVersionDiffModal(); assert.equal(closed, 1);
});

test('field merge controls open layout and extra fields directly while preserving earlier edits', () => {
    const h = controller();
    h.ctrl.expandedIndex = null;
    h.ctrl.collapseAnyExpanded = () => { h.ctrl.endMerge(); h.ctrl.expandedIndex = h.ctrl.expandedExtraIndex = null; };
    h.ctrl.toggleExpand = index => { h.ctrl.expandedIndex = index; };
    h.ctrl.toggleExtraExpand = index => { h.ctrl.expandedExtraIndex = index; };
    h.ctrl.extraChangedScriptFields = [{ key: 'extra_script', label: 'Extra script', language: 'javascript', isScript: true, isExtra: true }];
    h.ctrl.extraLeftFields = { extra_script: 'previous extra' }; h.ctrl.extraRightFields = { extra_script: 'later extra' };
    let stopped = false;
    h.ctrl.openMergeField(1, false, { stopPropagation() { stopped = true; } });
    assert.equal(stopped, true); assert.equal(h.editors[0].initial, 'later css');
    h.editors[0].changed('merged css'); h.ctrl.collapseAnyExpanded();
    h.ctrl.openMergeField(0, true);
    assert.equal(h.editors[1].initial, 'later extra');
    assert.equal(h.ctrl.hasMergedField('css'), true);
});

test('merge URLs preserve selected versions and the active field without including draft text', () => {
    const h = controller(), urls = [], parentUrls = [];
    Object.assign(h.ctx, { diffPageSysId: '51ec3d258363b61070b8b5dfeeaad36b', isEmbedded: false });
    h.ctx.window.location = { origin: 'https://instance.test', protocol: 'https:' };
    h.ctx.window.history = { state: { existing: true }, replaceState: (state, _, url) => { assert.equal(state.existing, true); urls.push(url); } };
    h.ctx.window.parent = { history: { replaceState: (_, __, url) => parentUrls.push(url) } };
    vm.runInContext(client.slice(client.indexOf('function _queryString('), client.indexOf('//////// Pure helpers')), h.ctx);
    h.ctrl.leftVersionId = 'b'.repeat(32); h.ctrl.rightVersionId = 'c'.repeat(32);
    h.ctrl.startMerge();
    const direct = new URL(urls.at(-1), 'https://instance.test');
    assert.equal(direct.pathname, '/ui_page.do');
    assert.equal(direct.searchParams.get('sys_id'), h.ctx.diffPageSysId);
    assert.equal(direct.searchParams.get('record_id'), 'a'.repeat(32));
    assert.equal(direct.searchParams.get('table'), 'sp_widget');
    assert.equal(direct.searchParams.get('version_1'), 'b'.repeat(32));
    assert.equal(direct.searchParams.get('version_2'), 'c'.repeat(32));
    assert.equal(direct.searchParams.get('merge_field'), 'script');
    assert.equal(parentUrls.at(-1), h.ctx.window.WE_COMPARE_URL);
    const shared = new URL(new URL(parentUrls.at(-1), 'https://instance.test').searchParams.get('uri'), 'https://instance.test');
    assert.equal(shared.search, direct.search);
    h.editors[0].changed('private unsaved code');
    assert.equal(h.ctx.window.WE_COMPARE_URL.includes('private'), false);
    h.ctrl.endMerge();
    assert.equal(new URL(urls.at(-1), 'https://instance.test').searchParams.has('merge_field'), false);
    h.ctx.isEmbedded = true; h.ctrl.rightVersionId = 'current'; h.ctrl.startMerge();
    const embedded = new URL(urls.at(-1), 'https://instance.test');
    assert.equal(embedded.searchParams.get('da_iframe'), 'true');
    assert.equal(embedded.searchParams.has('version_2'), false, 'Current stays the current record rather than a version lookup');
    assert.equal(new URL(h.ctx.window.WE_COMPARE_URL, 'https://instance.test').searchParams.get('uri').includes('da_iframe'), false);
    assert.equal(parentUrls.length, 2, 'an embedded modal preserves its parent editor URL');
});

test('merge links restore layout, extra and string fields once, and retain permission checks', () => {
    for (const kind of ['layout', 'extra', 'string', 'unknown', 'read-only', 'protected', 'unchanged']) {
        const h = controller();
        h.ctrl.mergeMode = false;
        const field = { ...h.ctrl.scriptFields[0], scriptIndex: 0, isExtra: kind === 'extra' };
        h.ctrl.fields = kind === 'extra' ? [] : [field]; h.ctrl.extraFields = kind === 'extra' ? [field] : [];
        h.ctrl.extraChangedScriptFields = [field]; h.ctrl.extraLeftFields = h.ctrl.leftFields; h.ctrl.extraRightFields = h.ctrl.rightFields;
        h.ctrl.toggleExpand = index => { h.ctrl.expandedIndex = index; };
        h.ctrl.toggleExtraExpand = index => { h.ctrl.expandedExtraIndex = index; };
        h.ctrl.toggleStringExpand = field => { h.ctrl.expandedString = field; };
        h.ctx.mergeField = kind === 'unknown' ? 'missing' : 'script';
        if (kind === 'string') { field.isScript = false; field.mergeable = true; }
        if (kind === 'read-only') h.ctx._recordData.writable_fields.script = false;
        if (kind === 'protected') h.ctrl.recordSysPolicy = 'protected';
        if (kind === 'unchanged') h.ctrl.leftFields.script = h.ctrl.rightFields.script;
        h.ctx._openLinkedMerge();
        assert.equal(h.ctrl.merge?.key, ['layout', 'extra', 'string'].includes(kind) ? 'script' : undefined, kind);
        const count = h.editors.length;
        h.ctx._openLinkedMerge();
        assert.equal(h.editors.length, count, 'the link opens only once');
    }
});

test('the modal opens the active merge link in a new tab and falls back to its original URL', () => {
    const source = fs.readFileSync(root + 'other/sys-ui-page/widget_editor_plus.client.js', 'utf8');
    for (const mergeUrl of ['/nav_to.do?uri=active-merge', undefined]) {
        let opened, closed = false;
        const ctx = { $scope: { versionDiffModal: { rawUrl: '/original' }, closeVersionDiffModal() { closed = true; } },
            document: { querySelector: () => ({ contentWindow: { WE_COMPARE_URL: mergeUrl } }) }, $window: { open: url => { opened = url; } } };
        vm.runInNewContext(source.slice(source.indexOf('$scope.openVersionDiffInNewTab ='), source.indexOf('$scope.collapseDiffEditor =')), ctx);
        ctx.$scope.openVersionDiffInNewTab();
        assert.equal(opened, mergeUrl || '/original');
        assert.equal(closed, true);
    }
});

test('merge view exposes the middle editor above the full-screen diff and saves only after finishing fields', async () => {
    const { chromium } = require('@playwright/test');
    const html = fs.readFileSync(root + 'other/sys-ui-page/widget_editor_compare.html', 'utf8');
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    const header = html.slice(html.indexOf('<div class="dc-header"'), html.indexOf('<div class="dc-body">'));
    const start = html.indexOf('<td ng-if="f.isScript &amp;&amp; !f.isExtra" class="sft-label"');
    const field = html.slice(start, html.indexOf('</td>', start) + 5);
    const simpleCells = html.match(/<td ng-if="!f.isScript"[\s\S]*?<\/td>/g);
    const row = html.match(/<tr class="sft-row" ng-repeat="f in ctrl.fields"[\s\S]*?>/)[0];
    const noDifferences = html.match(/<div class="alert alert-info dc-no-differences"[\s\S]*?<\/div>/)[0];
    const angularSource = fs.readFileSync(require.resolve('angular/angular.min.js'), 'utf8');
    const glue = client.slice(client.indexOf('ctrl.hasMergedField ='), client.indexOf('//////// Expand / collapse'));
    const collapse = client.slice(client.indexOf('ctrl.collapseAnyExpanded ='), client.indexOf('ctrl.expandedFieldLabel ='));
    const align = client.slice(client.indexOf('function _alignVersionColumns()'), client.indexOf('function _getEditorElements('));
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setContent(`<style>${css}body{margin:0;font:16px Arial}.btn{padding:6px 12px}textarea{width:100%;height:100%;box-sizing:border-box}</style>
            <div id="fixture" class="dc-app" ng-controller="MergeTest as ctrl" ng-class="{'dc-app--merging': !!ctrl.merge}">${header}
                <div class="dc-body">${noDifferences}<table><tbody>${row}${field}${simpleCells[0]}${simpleCells[2]}</tr></tbody></table>
                    <div class="da-section" ng-class="{'da-expanded': ctrl.expandedIndex !== null}"><div id="original-diff" class="da-editor-wrap"><div class="monaco-editor" style="visibility:visible;width:100%;height:100%">Original full-screen two-pane diff</div><div id="original-right" style="position:absolute;left:50%;width:50%;height:100%"></div></div></div>
                </div>
            </div>`);
        await page.addScriptTag({ content: angularSource });
        await page.evaluate(() => {
            const disposable = () => ({ dispose() {} });
            window.monaco = { Range: function () {}, editor: {
                createModel(value) {
                    const handlers = [];
                    return { value, handlers, getValue() { return this.value; }, getVersionId: () => 1, getEOL: () => '\n', canUndo() { return this.value !== value; }, canRedo: () => false,
                        getLineCount: () => 1, onDidChangeContent(fn) { handlers.push(fn); return disposable(); }, dispose() {} };
                },
                create(element, options) {
                    const area = document.createElement('textarea'); area.value = options.model.getValue(); area.readOnly = options.readOnly;
                    area.setAttribute('aria-label', options.ariaLabel); element.appendChild(area);
                    area.addEventListener('input', () => { options.model.value = area.value; options.model.handlers.forEach(fn => fn()); });
                    return { focus() { area.focus(); }, getSelection: () => null, onDidChangeCursorSelection: disposable,
                        onDidScrollChange: disposable, onDidLayoutChange: disposable,
                        deltaDecorations: () => [], setModel() {}, dispose() { area.remove(); } };
                },
                createDiffEditor() { return { setModel() {}, onDidUpdateDiff: disposable, dispose() {} }; },
            } };
        });
        await page.addScriptTag({ content: mergeScript });
        await page.evaluate(({ glue, collapse, align }) => {
            angular.module('mergeTest', []).controller('MergeTest', function ($scope, $timeout) {
                const ctrl = this;
                let _mergedFields = Object.create(null), _mergeEditor = null, _savedRecordData = null, _rightVersionData = null, _currentRightId = 'current', _allVersionsData = [];
                const _recordData = { writable_fields: { script: true, css: true, name: true }, values: { script: 'current script', css: 'current css', name: 'Current name' } };
                const tableParam = 'sp_widget', recordId = 'a'.repeat(32);
                const _apply = fn => $scope.$$phase ? fn() : $scope.$apply(fn);
                const _headerHeight = () => document.querySelector('.dc-header').getBoundingClientRect().bottom;
                const _setWrapTop = () => {}, _langForEditor = value => value, _setupLanguageServices = () => {};
                const sourceRight = { script: 'later script', css: 'later css', name: 'Later name', number: '1', unchanged: 'same', sys_name: 'Later system name' };
                const _syncScope = () => { ctrl.rightFields = _mergePreview({ ...sourceRight }); ctrl.rightDisplayFields = ctrl.rightFields; };
                const _ajax = (name, params, callback) => {
                    if (name === 'getVersionsForTable') return callback({ success: true, versions: [] });
                    window.lastSave = { name, params }; window.completeSave = callback;
                };
                ctrl.merge = null; ctrl.mergeMode = false; ctrl.expandedIndex = ctrl.expandedExtraIndex = ctrl.expandedString = null;
                ctrl.canWrite = true; ctrl.recordSysPolicy = ''; ctrl.wordWrap = true;
                ctrl.scriptFields = [{ key: 'script', label: 'Script', language: 'javascript', isScript: true }, { key: 'css', label: 'CSS', language: 'css', isScript: true }];
                ctrl.fields = ctrl.scriptFields.map((field, index) => ({ ...field, isScript: true, isExtra: false, changed: true, scriptIndex: index }));
                ctrl.fields.push({ key: 'sys_name', label: 'System name', renderAs: 'text', mergeable: true }, { key: 'name', label: 'Name', renderAs: 'text', mergeable: true }, { key: 'number', label: 'Number', renderAs: 'text', mergeable: false }, { key: 'unchanged', label: 'Unchanged', renderAs: 'text', mergeable: true });
                ctrl.leftFields = { script: 'previous script', css: 'previous css', name: 'Previous name', number: '0', unchanged: 'same', sys_name: 'Previous system name' }; ctrl.rightFields = { ...sourceRight }; ctrl.rightDisplayFields = ctrl.rightFields;
                ctrl.isChanged = key => ctrl.leftFields[key] !== ctrl.rightFields[key];
                ctrl.editors = { 0: { getModifiedEditor: () => ({ getDomNode: () => document.getElementById('original-right') }) } }; ctrl.extraEditors = {};
                ctrl.leftLabel = () => 'Older version'; ctrl.rightLabel = () => 'Newer version';
                ctrl.expandedFieldLabel = () => 'Record — field';
                ctrl.toggleExpand = index => { ctrl.expandedIndex = index; };
                ctrl.collapseExpanded = () => { ctrl.expandedIndex = null; };
                ctrl.collapseExtraExpanded = () => { ctrl.expandedExtraIndex = null; };
                ctrl.toggleStringExpand = (field, isExtra) => { ctrl.expandedString = { ...field, isExtra }; };
                ctrl.collapseStringExpanded = () => { ctrl.expandedString = null; };
                eval(glue + collapse + align); window.ctrl = ctrl; window.alignVersionColumns = _alignVersionColumns;
            });
            angular.bootstrap(document.getElementById('fixture'), ['mergeTest']);
        }, { glue, collapse, align });
        assert.equal(await page.locator('.sft-row--edited').count(), 0);
        assert.equal(await page.locator('.dc-merge-btn').count(), 0, 'field merge buttons are hidden by default');
        const mode = page.getByRole('button', { name: 'Merge+', exact: true });
        assert.equal(await mode.getAttribute('aria-pressed'), 'false');
        const info = page.locator('.dc-no-differences');
        assert.equal(await info.count(), 0);
        await page.evaluate(() => angular.element(document.getElementById('fixture')).scope().$apply(() => {
            window.previousLeft = ctrl.leftFields; ctrl.leftFields = { ...ctrl.rightFields };
        }));
        assert.equal(await mode.count(), 0, 'identical versions do not offer Merge+');
        assert.equal(await info.innerText(), 'No differences found.');
        assert.equal(await info.locator('.icon-info[aria-hidden="true"]').count(), 1);
        assert.ok(await info.evaluate(el => el.children[1].getBoundingClientRect().left - el.children[0].getBoundingClientRect().right >= 6), 'the info icon has space before the alert text');
        assert.ok((await info.boundingBox()).y >= (await page.locator('.dc-header').boundingBox()).y + (await page.locator('.dc-header').boundingBox()).height);
        assert.ok((await info.boundingBox()).y + (await info.boundingBox()).height <= (await page.locator('table').boundingBox()).y);
        await page.evaluate(() => angular.element(document.getElementById('fixture')).scope().$apply(() => { ctrl.loadingRight = true; }));
        assert.equal(await info.count(), 0, 'loading does not flash a no-differences message');
        await page.evaluate(() => angular.element(document.getElementById('fixture')).scope().$apply(() => {
            ctrl.loadingRight = false; ctrl.leftFields.sys_name = 'read-only difference';
        }));
        assert.equal(await mode.count(), 0, 'read-only differences do not offer Merge+');
        assert.equal(await info.count(), 0, 'read-only differences still count as differences');
        await page.evaluate(() => angular.element(document.getElementById('fixture')).scope().$apply(() => { ctrl.leftFields = window.previousLeft; }));
        await mode.click(); assert.equal(await mode.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.getByRole('button', { name: 'Edit and merge System name', exact: true }).count(), 0, 'read-only text fields have no merge action');
        assert.equal(await page.getByRole('button', { name: 'Edit and merge Number', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Edit and merge Unchanged', exact: true }).count(), 0);
        assert.equal(await page.locator('.dc-merge-btn .icon-console').count(), 0);
        assert.ok(await page.locator('.dc-merge-btn .icon-indent').count() > 0);
        const alignmentError = () => page.evaluate(() => document.querySelector('[aria-label="Right version"]').getBoundingClientRect().left - document.getElementById('original-right').getBoundingClientRect().left);
        await page.evaluate(() => { angular.element(document.getElementById('fixture')).scope().$apply(() => { ctrl.expandedIndex = 0; }); alignVersionColumns(); });
        assert.equal(await page.locator('.dc-collapse-btn').innerText(), 'Collapse');
        assert.ok(Math.abs(await alignmentError()) < 1, 'expanded dropdown aligns with the right editor');
        await page.evaluate(() => { document.getElementById('original-right').style.left = '62%'; alignVersionColumns(); });
        assert.ok(Math.abs(await alignmentError()) < 1, 'alignment follows the split position');
        await page.setViewportSize({ width: 1200, height: 900 }); await page.evaluate(() => alignVersionColumns());
        assert.ok(Math.abs(await alignmentError()) < 1, 'alignment survives a window resize');
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => { document.getElementById('original-right').style.left = '50%'; angular.element(document.getElementById('fixture')).scope().$apply(() => { ctrl.expandedIndex = null; }); });
        await page.getByRole('button', { name: 'Edit and merge Script', exact: true }).click();
        const middle = page.getByRole('textbox', { name: 'Merge+ (editable)', exact: true });
        await middle.waitFor();
        assert.equal(await page.locator('.dc-merge-pane').count(), 3);
        assert.equal(await page.getByRole('textbox', { name: 'Older version (read only)', exact: true }).count(), 1);
        assert.equal(await page.getByRole('textbox', { name: 'Newer version (read only)', exact: true }).count(), 1);
        assert.equal(await middle.inputValue(), 'later script');
        assert.ok(Math.abs((await page.getByRole('button', { name: 'Undo', exact: true }).boundingBox()).x - (await page.locator('.dc-merge-pane').nth(1).boundingBox()).x) < 1, 'undo aligns with the editable middle pane');
        assert.equal(await page.locator('.dc-merge-heading').innerText(), 'Merge+');
        assert.deepEqual((await page.locator('.dc-merge-toolbar button').allTextContents()).slice(0, 2), ['Undo', 'Redo']);
        assert.deepEqual((await page.locator('.dc-merge-toolbar button').allTextContents()).slice(-2), ['Discard edits', 'Finish editing']);
        assert.equal(await middle.getAttribute('readonly'), null);
        assert.equal(await middle.evaluate(el => {
            const rect = el.getBoundingClientRect();
            return !!document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('#dc-merge-editor');
        }), true, 'the editable middle pane is above the original full-screen diff');
        assert.equal(await page.locator('#original-diff').evaluate(el => getComputedStyle(el).display), 'none');
        assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0);
        assert.equal(await page.getByText('Merged fields are unsaved. Save when you have finished.', { exact: true }).count(), 0);
        assert.equal(await page.locator('.dc-merge-legend').count(), 0);
        assert.equal(await page.locator('button:has(.icon-undo-action)').count(), 1);
        assert.equal(await page.locator('button:has(.icon-redo-action)').count(), 1);
        assert.equal(await page.locator('button:has(.icon-check)').count(), 1);
        assert.equal(await page.locator('button:has(.icon-clear)').count(), 1);
        assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), false);
        assert.equal(await page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), false);
        assert.equal(await page.locator('.dc-merge-toolbar button:has(.icon)').evaluateAll(buttons => buttons.every(button => {
            const [icon, label] = button.children;
            return label.getBoundingClientRect().left - icon.getBoundingClientRect().right >= 5;
        })), true, 'button icons have visible spacing before their labels');
        assert.equal(await page.getByRole('button', { name: 'Discard edits', exact: true }).count(), 1);
        await middle.fill('merged script');
        assert.equal(await page.locator('.sft-row--edited').count(), 1);
        assert.equal(await page.locator('.dc-merged-field').count(), 0);
        assert.equal(await page.locator('.sft-row--edited td').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(94, 171, 223, 0.16)');
        assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), true);
        assert.equal(await page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), false);
        await page.getByRole('button', { name: 'Finish editing', exact: true }).click();
        assert.equal(await page.locator('.dc-merge-pane').count(), 0);
        assert.equal(await page.locator('#original-diff').evaluate(el => getComputedStyle(el).display), 'flex');
        assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 1);
        assert.equal(await page.locator('button:has(.icon-save)').count(), 1);
        await page.getByRole('button', { name: 'Edit and merge CSS', exact: true }).click();
        await middle.waitFor();
        await middle.fill('merged css');
        assert.equal(await page.locator('.sft-row--edited').count(), 2);
        assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0);
        await page.getByRole('button', { name: 'Finish editing', exact: true }).click();
        await page.getByRole('button', { name: 'Edit and merge Name', exact: true }).click();
        await middle.waitFor(); assert.equal(await middle.inputValue(), 'Later name');
        await middle.fill('Merged name');
        await page.getByRole('button', { name: 'Finish editing', exact: true }).click();
        assert.equal(await page.getByRole('textbox', { name: 'Name (right)', exact: true }).inputValue(), 'Merged name');
        assert.equal(await page.locator('.sft-row--edited').count(), 3);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        assert.deepEqual(await page.evaluate(() => JSON.parse(lastSave.params.fields)), { script: 'merged script', css: 'merged css', name: 'Merged name' });
        await page.evaluate(() => completeSave({ success: true, values: { script: 'merged script', css: 'merged css', name: 'Merged name' } }));
        assert.equal(await page.locator('.sft-row--edited').count(), 0, 'saved rows no longer have unsaved highlighting');
        assert.equal(await page.getByText('Merged fields saved.', { exact: true }).count(), 0);
        assert.equal(await page.locator('.dc-merge-toolbar').count(), 0);
        assert.equal(await mode.getAttribute('aria-pressed'), 'false');
        assert.equal(await page.locator('.dc-merge-btn').count(), 0);
        await mode.click();
        await page.getByRole('button', { name: 'Edit and merge Name', exact: true }).click();
        await middle.waitFor(); await middle.fill('Another edit');
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Discard edits', exact: true }).click();
        assert.equal(await mode.getAttribute('aria-pressed'), 'false'); assert.equal(await page.locator('.dc-merge-btn').count(), 0);
        assert.equal(await page.locator('.sft-row--edited').count(), 0);
        await page.evaluate(() => angular.element(document.getElementById('fixture')).scope().$apply(() => { ctrl.canWrite = false; }));
        assert.equal(await mode.count(), 0, 'read-only records do not offer merge mode');
        await page.evaluate(() => angular.element(document.getElementById('fixture')).scope().$apply(() => {
            document.documentElement.style.setProperty('--now-color_text--critical', '180, 25, 40');
            ctrl.mergeMessage = 'Field access denied: sys_name';
        }));
        assert.equal(await page.locator('.dc-merge-status').innerText(), 'Field access denied: sys_name');
        assert.equal(await page.locator('.dc-merge-status').evaluate(el => getComputedStyle(el).color), 'rgb(180, 25, 40)');
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});

test('merge origins and overview markers distinguish source and custom lines while block arrows scroll', async () => {
    const { chromium } = require('@playwright/test');
    const html = fs.readFileSync(root + 'other/sys-ui-page/widget_editor_compare.html', 'utf8');
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await page.setContent(`<style>${css}button{min-width:45px;min-height:45px}</style><div style="height:500px" id="merge"></div>`);
        await page.evaluate(() => {
            const disposable = () => ({ dispose() {} });
            window.models = []; window.editors = []; window.diffs = [];
            const offset = (value, line, column) => value.split('\n').slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0) + column - 1;
            window.monaco = { Selection: function (startLineNumber, startColumn, endLineNumber, endColumn) {
                Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
                this.isEmpty = () => startLineNumber === endLineNumber && startColumn === endColumn;
            }, Range: function (startLineNumber, startColumn, endLineNumber, endColumn) {
                Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
            }, editor: {
                OverviewRulerLane: { Full: 7 },
                createModel(value) {
                    const handlers = [];
                    const model = { value, version: 1, getValue() { return this.value; }, getVersionId() { return this.version; },
                        getValueInRange(range) { return this.value.slice(offset(this.value, range.startLineNumber, range.startColumn), offset(this.value, range.endLineNumber, range.endColumn)); },
                        getEOL() { return this.value.includes('\r\n') ? '\r\n' : '\n'; }, getLineCount() { return this.value.split('\n').length; }, getFullModelRange() { return {}; },
                        onDidChangeContent(fn) { handlers.push(fn); return disposable(); },
                        setValue(value) { this.value = value; this.version++; handlers.forEach(fn => fn()); }, dispose() {} };
                    models.push(model); return model;
                },
                create(element, options) {
                    const decorations = new Map();
                    let nextDecoration = 0;
                    const editor = { decorations: [], scroll: 0, selection: new monaco.Selection(1, 1, 1, 1),
                        focus() {}, pushUndoStop() {}, revealLineInCenter() {}, revealPositionInCenter() {},
                        getSelection() { return this.selection; },
                        setSelection(selection) { this.selection = selection; this.selectionChanged?.(); },
                        getPosition() { return { lineNumber: this.selection.endLineNumber, column: this.selection.endColumn }; },
                        executeEdits(_source, edits, cursorState) {
                            const edit = edits[0], value = options.model.getValue(), range = edit.range;
                            if (!range.startLineNumber) { options.model.setValue(edit.text); return; }
                            const before = value.slice(0, offset(value, range.startLineNumber, range.startColumn));
                            const after = value.slice(offset(value, range.endLineNumber, range.endColumn));
                            options.model.setValue(before + edit.text + after);
                            const lines = (before + edit.text).split('\n');
                            this.selection = cursorState([{ range: { getEndPosition: () => ({ lineNumber: lines.length, column: lines.at(-1).length + 1 }) } }])[0];
                        },
                        deltaDecorations(old, values) {
                            old.forEach(id => decorations.delete(id));
                            const ids = values.map(value => { const id = String(++nextDecoration); decorations.set(id, value); return id; });
                            this.decorations = [...decorations.values()];
                            return ids;
                        },
                        getTopForLineNumber: line => (line - 1) * 20, getBottomForLineNumber: line => line * 20,
                        getScrollTop() { return this.scroll; }, onDidScrollChange(fn) { this.scrolled = fn; return disposable(); },
                        onDidChangeCursorSelection(fn) { this.selectionChanged = fn; return disposable(); },
                        onDidLayoutChange: disposable, setModel() {}, dispose() {} };
                    editors.push(editor); return editor;
                },
                createDiffEditor() {
                    const diff = { changes: [], setModel() {}, getLineChanges() { return this.changes; },
                        onDidUpdateDiff(fn) { this.update = fn; return disposable(); }, dispose() {} };
                    diffs.push(diff); return diff;
                },
            } };
        });
        await page.addScriptTag({ content: mergeScript });
        await page.evaluate(() => {
            window.merge = WEMergeEditor.create(document.getElementById('merge'), 'common\nold\nshared\nbase\nend',
                'common\nnew\nshared\nbase\nend', 'plaintext', true, () => {}, 'common\nold\nnew\ncustom\nshared\nbase\nend');
        });
        const fire = async (index, changes) => page.evaluate(({ index, changes }) => {
            diffs[index].changes = changes; diffs[index].update();
        }, { index, changes });
        const origins = index => page.evaluate(index => editors[index].decorations.map(d => [d.range.startLineNumber, d.range.endLineNumber, d.options.className]), index);
        const markers = index => page.evaluate(index => editors[index].decorations.map(d => [d.range.startLineNumber, d.range.endLineNumber, d.options.overviewRuler]), index);
        await fire(0, [change(2, 2, 2, 2)]);
        assert.deepEqual(await origins(0), [[2, 2, 'dc-merge-previous']]);
        assert.deepEqual(await origins(2), [[2, 2, 'dc-merge-later']]);
        assert.deepEqual(await markers(0), [[2, 2, { color: 'rgba(94, 171, 223, 0.85)', position: 7 }]]);
        assert.deepEqual(await markers(2), [[2, 2, { color: 'rgba(126, 177, 101, 0.85)', position: 7 }]]);
        assert.equal(await page.evaluate(() => editors[0].decorations[0].options.hoverMessage.value), 'Older version');
        assert.equal(await page.evaluate(() => editors[2].decorations[0].options.hoverMessage.value), 'Newer version');
        await fire(1, [change(2, 0, 3, 4)]);
        assert.deepEqual(await origins(1), [], 'wait for both comparisons before assigning origins');
        await fire(2, [change(1, 0, 2, 2), change(2, 0, 4, 4)]);
        assert.deepEqual(await origins(1), [[2, 2, 'dc-merge-previous'], [3, 3, 'dc-merge-later'], [4, 4, 'dc-merge-custom']]);
        assert.deepEqual(await markers(1), [
            [2, 2, { color: 'rgba(94, 171, 223, 0.85)', position: 7 }],
            [3, 3, { color: 'rgba(126, 177, 101, 0.85)', position: 7 }],
            [4, 4, { color: 'rgba(172, 152, 246, 0.85)', position: 7 }],
        ]);
        await page.evaluate(() => models[1].setValue('common\ncustom\nend'));
        const oldOrigins = [[2, 2, 'dc-merge-previous'], [3, 3, 'dc-merge-later'], [4, 4, 'dc-merge-custom']];
        assert.deepEqual(await origins(1), oldOrigins, 'typing retains backgrounds while the comparisons run');
        await fire(2, [change(2, 4, 2, 2)]);
        assert.deepEqual(await origins(1), oldOrigins, 'one completed comparison cannot replace the existing colours');
        await fire(1, [change(2, 4, 2, 2)]);
        assert.deepEqual(await origins(1), [[2, 2, 'dc-merge-custom']]);
        const arrow = page.getByRole('button', { name: 'Use older block at line 2', exact: true });
        assert.equal(await arrow.locator('.icon-arrow-right[aria-hidden="true"]').count(), 1);
        assert.equal(await page.locator('.dc-merge-gutter').last().locator('.icon-arrow-left').count() > 0, true);
        assert.deepEqual(await arrow.evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })), { width: 26, height: 24 });
        await page.evaluate(() => { editors[0].scroll = 30; editors[0].scrolled(); });
        assert.equal(await arrow.evaluate(el => el.style.top), '0px', 'a partially visible block keeps its arrow inside the gutter');
        assert.equal(await arrow.evaluate(el => {
            const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }), true, 'the complete arrow is visible and clickable');
        await arrow.press('Enter');
        assert.equal(await page.evaluate(() => merge.getValue()), 'common\nold\nshared\nbase\nend');
        await fire(1, [change(2, 4, 2, 4)]);
        await page.evaluate(() => { editors[0].scroll = 200; editors[0].scrolled(); });
        assert.equal(await arrow.isVisible(), false, 'blocks outside the viewport do not leave stray arrows');
        await fire(1, [change(2, 2, 1, 0)]);
        await fire(2, [change(2, 2, 1, 0)]);
        assert.deepEqual(await origins(1), [], 'deleted source lines do not colour the next result line');
        await page.evaluate(() => {
            editors[0].scroll = 0;
            editors[1].setSelection(new monaco.Selection(2, 1, 3, 1));
            editors[0].setSelection(new monaco.Selection(3, 1, 4, 1));
        });
        const previousSelection = page.getByRole('button', { name: 'Use selected older text', exact: true });
        assert.equal(await previousSelection.locator('.icon-arrow-right').count(), 1);
        assert.equal(await previousSelection.isVisible(), true, 'unchanged source lines can also be selected and merged');
        assert.equal(await arrow.isVisible(), false, 'selection merging replaces the block action while text is selected');
        await previousSelection.press('Enter');
        assert.equal(await page.evaluate(() => merge.getValue()), 'common\nshared\nshared\nbase\nend');
        assert.deepEqual(await page.evaluate(() => editors[1].getPosition()), { lineNumber: 3, column: 1 });
        assert.equal(await page.evaluate(() => editors[1].getSelection().isEmpty()), true);
        await page.evaluate(() => {
            editors[1].setSelection(new monaco.Selection(1, 7, 1, 7));
            editors[2].setSelection(new monaco.Selection(2, 1, 2, 4));
        });
        assert.equal(await page.getByRole('button', { name: 'Use selected newer text', exact: true }).locator('.icon-arrow-left').count(), 1);
        await page.getByRole('button', { name: 'Use selected newer text', exact: true }).click();
        assert.equal(await page.evaluate(() => merge.getValue()), 'commonnew\nshared\nshared\nbase\nend');
        assert.deepEqual(await page.evaluate(() => editors[1].getPosition()), { lineNumber: 1, column: 10 });
        assert.deepEqual(await page.evaluate(() => [models[0].getValue(), models[2].getValue()]), ['common\nold\nshared\nbase\nend', 'common\nnew\nshared\nbase\nend']);
        await page.evaluate(() => editors[0].setSelection(new monaco.Selection(3, 1, 3, 1)));
        assert.equal(await previousSelection.isVisible(), false);
        await page.evaluate(() => models.forEach(model => model.setValue(Array.from({ length: 3000 }, (_, i) => 'line ' + i).join('\n'))));
        await fire(0, [change(2500, 2510, 2500, 2505)]);
        await fire(1, [change(2500, 2510, 2500, 2505)]);
        await fire(2, []);
        assert.deepEqual((await markers(0))[0].slice(0, 2), [2500, 2510]);
        assert.deepEqual((await markers(2))[0].slice(0, 2), [2500, 2505]);
        assert.deepEqual(await markers(1), [[2500, 2505, { color: 'rgba(126, 177, 101, 0.85)', position: 7 }]]);
        await fire(0, []);
        await fire(1, []);
        await fire(2, []);
        for (const index of [0, 1, 2]) assert.deepEqual(await markers(index), [], 'identical panes clear their overview markers');
        const longScript = Array.from({ length: 3000 }, (_, i) => 'line ' + (i + 1)).join('\n');
        await page.evaluate(value => { models[0].setValue('/* Older comment */'); models[1].setValue(value); }, longScript);
        await fire(1, [change(1, 1, 1, 3000)]);
        const wholeScriptArrow = page.getByRole('button', { name: 'Use older block at line 1', exact: true });
        const previews = () => page.evaluate(() => editors[1].decorations.filter(d => d.options.className === 'dc-merge-preview' || d.options.inlineClassName === 'dc-merge-preview').map(d => [d.range.startLineNumber, d.range.endLineNumber]));
        await wholeScriptArrow.hover();
        assert.deepEqual(await previews(), [[1, 3000]], 'preview shows the entire target block, even for a one-line source');
        assert.equal(await page.evaluate(() => merge.getValue()), longScript, 'hover does not edit the result');
        assert.equal(await page.evaluate(() => editors[1].decorations.find(d => d.options.className === 'dc-merge-preview').options.overviewRuler.color), '#e9a331');
        await wholeScriptArrow.dispatchEvent('mouseleave');
        assert.deepEqual(await previews(), []);
        await wholeScriptArrow.focus();
        assert.deepEqual(await previews(), [[1, 3000]], 'keyboard focus previews the same replacement');
        await wholeScriptArrow.evaluate(button => button.blur());
        assert.deepEqual(await previews(), []);
        for (const eol of ['\n', '\r\n']) {
            for (const [endLine, endColumn] of [[2, 7], [3, 1]]) {
                const original = longScript.replace(/\n/g, eol);
                await page.evaluate(({ value, endLine, endColumn }) => {
                    models[1].setValue(value);
                    editors[1].setSelection(new monaco.Selection(2, 1, endLine, endColumn));
                }, { value: original, endLine, endColumn });
                await fire(1, [change(1, 1, 1, 3000)]);
                await wholeScriptArrow.hover();
                assert.deepEqual(await previews(), [[2, endLine]], 'a middle selection overrides the full diff-block preview');
                assert.equal(await page.evaluate(() => editors[1].decorations.find(d => d.options.inlineClassName === 'dc-merge-preview')?.options.isWholeLine), false);
                await wholeScriptArrow.click();
                assert.equal(await page.evaluate(() => merge.getValue()), original.replace('line 2' + eol, '/* Older comment */' + eol), 'copying a block replaces only the selected middle line and retains its line ending');
                assert.equal(await page.evaluate(() => editors[1].getSelection().isEmpty()), true);
                assert.deepEqual(await previews(), []);
            }
        }
        await page.evaluate(() => {
            models[2].setValue('newer block');
            models[1].setValue('prefix keep\nreplace me\nsuffix keep');
            editors[2].setSelection(new monaco.Selection(1, 1, 1, 1));
            editors[1].setSelection(new monaco.Selection(2, 1, 2, 8));
        });
        await fire(2, [change(1, 1, 1, 3)]);
        const selectedNewerBlock = page.getByRole('button', { name: 'Use newer block at line 1', exact: true });
        await selectedNewerBlock.click();
        assert.equal(await page.evaluate(() => merge.getValue()), 'prefix keep\nnewer block me\nsuffix keep', 'newer blocks respect partial middle selections');
        await page.evaluate(() => editors[1].setSelection(new monaco.Selection(1, 1, 1, 7)));
        await fire(2, [change(1, 0, 1, 3)]);
        await selectedNewerBlock.click();
        assert.equal(await page.evaluate(() => merge.getValue()), ' keep\nnewer block me\nsuffix keep', 'a deletion removes only the selected text');
        await page.evaluate(value => models[1].setValue(value), longScript);
        await fire(1, [change(1, 1, 1, 3000)]);
        await wholeScriptArrow.dispatchEvent('mouseenter');
        await page.evaluate(() => models[1].setValue('new typing'));
        assert.deepEqual(await previews(), [], 'editing invalidates the preview and removes the stale arrow');
        assert.equal(await wholeScriptArrow.count(), 0);
        await fire(1, [change(1, 1, 1, 0)]);
        const insertArrow = page.getByRole('button', { name: 'Use older block at line 1', exact: true });
        await insertArrow.dispatchEvent('mouseenter');
        assert.deepEqual(await previews(), [], 'insertion does not highlight existing code as a replacement');
        await fire(2, [change(1, 0, 1, 1)]);
        await page.evaluate(() => editors[2].setSelection(new monaco.Selection(1, 1, 1, 1)));
        const deleteArrow = page.getByRole('button', { name: 'Use newer block at line 1', exact: true });
        await deleteArrow.focus();
        assert.deepEqual(await previews(), [[1, 1]], 'a deletion previews the middle-editor lines being removed');
        await deleteArrow.click();
        assert.equal(await page.evaluate(() => merge.getValue()), '');
        assert.deepEqual(await previews(), [], 'applying the block clears its preview');
        await fire(1, [change(1, 1, 1, 1)]);
        await page.getByRole('button', { name: 'Use older block at line 1', exact: true }).dispatchEvent('mouseenter');
        assert.deepEqual(await previews(), [[1, 1]]);
        await page.evaluate(() => merge.dispose());
        assert.deepEqual(await previews(), [], 'disposing a merge removes preview decorations');
        assert.equal(await page.locator('.dc-merge-pane').count(), 0);
    } finally { await browser.close(); }
});


test('CSS comparison and merge models use SCSS while other language mappings are preserved', () => {
    const ctx = {};
    vm.runInNewContext(client.slice(client.indexOf('function _langForEditor('), client.indexOf('var _snProvidersRegistered')), ctx);
    for (const [input, expected] of [['css', 'scss'], ['sass', 'scss'], ['scss', 'scss'], ['json', 'we-json'], ['javascript', 'javascript'], ['', 'plaintext']]) {
        assert.equal(ctx._langForEditor(input), expected);
    }
});

test('Compare registers SCSS before creating models and loads the shared tokenizer on a limited ServiceNow Monaco bundle', async () => {
    const cssSource = fs.readFileSync(root + 'client-development/ui-script/monaco_language_css.js', 'utf8');
    for (const builtInScss of [false, true]) {
        const languages = [{ id: 'css' }], registrations = [], tokens = {}, initialisations = [];
        if (builtInScss) languages.push({ id: 'scss' });
        const monaco = { languages: {
            getLanguages: () => languages,
            register: language => { registrations.push(language.id); languages.push(language); },
            setLanguageConfiguration() {}, setMonarchTokensProvider: (language, provider) => { tokens[language] = provider; },
            registerCompletionItemProvider() {}, registerHoverProvider() {},
        }, editor: { createModel: (_value, language) => ({ getLanguageId: () => languages.some(item => item.id === language) ? language : 'plaintext' }) } };
        const ctx = { monaco, _registerSnProviders() {}, window: { monaco } };
        ctx.window.SNMonacoPlusBootstrap = { init(config) {
            initialisations.push(config.language);
            if (config.language === 'scss') ctx.window.MONACO_LANGUAGE_CSS.register(monaco);
            return Promise.resolve({});
        } };
        vm.createContext(ctx); vm.runInContext(cssSource, ctx);
        vm.runInContext(client.slice(client.indexOf('var _langServicesSetup ='), client.indexOf('function _langForEditor(')), ctx);
        vm.runInContext(client.slice(client.indexOf('var _mplusInitialized ='), client.indexOf('var recordId =')), ctx);
        ctx._setupLanguageServices(); ctx._setupLanguageServices();
        await Promise.resolve();
        assert.equal(monaco.editor.createModel('$accent: red;', 'scss').getLanguageId(), 'scss', 'SCSS must exist before a model is created');
        assert.ok(tokens.scss, 'the existing shared SCSS tokenizer is loaded');
        assert.equal(tokens.scss.tokenPostfix, '.scss');
        assert.deepEqual(initialisations, ['typescript', 'html', 'scss']);
        assert.equal(registrations.filter(id => id === 'scss').length, builtInScss ? 0 : 1);
    }
});

test('Merge+ prepares language services before creating its editors, even when no comparison editor has opened', () => {
    const h = controller(), calls = [];
    const create = h.ctx.window.WEMergeEditor.create;
    h.ctx._setupLanguageServices = () => calls.push('languages');
    h.ctx.window.WEMergeEditor.create = (...args) => { calls.push('editors'); return create(...args); };
    h.ctrl.startMerge();
    assert.deepEqual(calls, ['languages', 'editors']);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { readFluentField } = require('../helpers/fluent-source.cjs');
const root = 'src/fluent/generated/';
const diffPath = root + 'other/sys-ui-page/sys_ui_page_51ec3d258363b61070b8b5dfeeaad36b.now.ts';
const template = readFluentField;
const fieldComparison = readFluentField(root + 'client-development/ui-script/sys_ui_script_widget_editor_xml_export.now.ts', 'script');

function loadFieldComparison(context) {
    context.window = context.window || {};
    vm.runInNewContext(fieldComparison, context);
    context.annotateFieldChanges = context.window.WE_XML_EXPORT.annotateFieldChanges;
}

function resolver({ exists = true, deleted = false, deletionId = '', es12Value = null } = {}) {
    const id = 'a'.repeat(32);
    const queries = [];
    const context = {
        Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        Object: { extendsObject: (_, methods) => methods },
        gs: { getProperty: () => 'https://example.service-now.com/' },
        GlideRecordSecure: function (table) {
            this.isValid = () => true;
            this.get = () => exists;
            this.addQuery = (...args) => queries.push([table, ...args]);
            this.orderByDesc = this.setLimit = this.query = () => {};
            this.next = () => table === 'sys_es_latest_script' ? es12Value !== null : !!deletionId;
            this.getValue = () => es12Value;
            this.getUniqueValue = () => deletionId;
        }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(root + 'server-development/script-include/sys_script_include_widget_editor_assistant.server.js', 'utf8'), context);
    const instance = context.WidgetEditorAssistantAjax.prototype;
    instance.getParameter = key => ({ table: 'sp_widget', sys_id: id, deleted: String(deleted) })[key];
    instance._answer = result => result;
    return { result: instance.getExportRecordUrl(), queries, id };
}
test('absolute live URL uses the requested navigation encoding', () => {
    const { result, id } = resolver();
    assert.equal(result.url, 'https://example.service-now.com/nav_to.do?uri=sp_widget.do%3Fsys_id%3D' + id);
});
test('deleted records use the deletion row ID, including records deleted after selection', () => {
    for (const deleted of [true, false]) {
        const { result, queries, id } = resolver({ exists: false, deleted, deletionId: 'b'.repeat(32) });
        assert.equal(result.url, 'https://example.service-now.com/nav_to.do?uri=sys_metadata_delete.do%3Fsys_id%3D' + 'b'.repeat(32));
        assert.deepEqual(queries, [['sys_metadata_delete', 'sys_metadata', id]]);
    }
});
test('unavailable deletion rows never produce a guessed URL', () => {
    assert.equal(resolver({ exists: false, deleted: true }).result.url, '');
});
test('Diff export preserves both selected versions and XML-sensitive field content', async () => {
    // A minimal DOM verifies values are assigned as text, independently of a live instance.
    class Element {
        constructor(tag) { this.tagName = tag; this.tag = tag; this.attrs = {}; this.children = []; this.textContent = ''; }
        setAttribute(key, value) { this.attrs[key] = String(value); }
        getAttribute(key) { return this.attrs[key] || null; }
        appendChild(child) { this.children.push(child); }
    }
    let exported;
    const document = {
        implementation: { createDocument: (_, tag) => {
            exported = { documentElement: new Element(tag), createElement: tag => new Element(tag) };
            return exported;
        } },
        createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} }
    };
    const ctrl = { canExportXml: () => true, isSameVersionSelected: () => false, leftVersionId: 'old', rightVersionId: 'current',
        leftLabel: () => 'Previous', rightLabel: () => 'Unsaved', currentIsUnsaved: true };
    const context = { ctrl, document, window: { location: { origin: 'https://example.service-now.com' } },
        tableParam: 'sp_widget', recordId: 'a'.repeat(32),
        _exportLeftValues: { script: '<old>&', empty: '', missing: null, sys_mod_count: '0' },
        _exportRightValues: { script: '<new>&', extra_field: 'included', sys_mod_count: '7' },
        _savedRecordData: null, _recordData: { es12_override: 'enabled' },
        _leftVersionData: { sys_created_on: '2026-01-01' }, _rightVersionData: null,
        Blob: class {}, XMLSerializer: class { serializeToString() { return ''; } },
        URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} } };
    const script = template(diffPath, 'clientScript');
    assert.ok(script, 'client script found');
    const start = script.indexOf('ctrl.exportXml = function');
    const end = script.indexOf('ctrl.revertToLeft = function', start);
    loadFieldComparison(context);
    vm.runInNewContext(script.slice(start, end), context);
    ctrl.exportXml();
    assert.equal(exported.documentElement.tag, 'context_bundle');
    assert.equal(exported.documentElement.attrs.format_version, '2');
    assert.equal(exported.documentElement.attrs.unload, undefined);
    assert.match(exported.documentElement.attrs.generated_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    const notes = exported.documentElement.children.filter(el => el.tag === 'format_notes');
    assert.equal(notes.length, 1);
    assert.ok(notes[0].textContent.includes('ES12'));
    const record = exported.documentElement.children.find(el => el.tag === 'primary_record').children[0];
    assert.equal(record.attrs.es12_override_at_load, 'enabled');
    const [left, right] = record.children;
    assert.equal(left.tag, 'previous_version');
    assert.equal(right.tag, 'current_version');
    assert.equal(right.attrs.unsaved, 'true');
    assert.equal(left.children[0].attrs.record_url, undefined);
    assert.equal(right.children[0].attrs.record_url, undefined);
    assert.ok(record.attrs.record_url);
    assert.equal(record.attrs.es12_description, undefined);
    assert.equal(left.children[0].attrs.sys_mod_count, '0');
    assert.equal(right.children[0].attrs.sys_mod_count, '7');
    assert.equal(left.children[0].children[0].textContent, '<old>&');
    assert.equal(right.children[0].children[0].textContent, '<new>&');
    assert.equal(left.children[0].children[2].attrs.nil, 'true');
    assert.equal(right.children[0].children[1].textContent, 'included');
    assert.equal(left.children[0].children[0].attrs.change, 'modified');
    assert.equal(right.children[0].children[1].attrs.change, 'added');
    assert.equal(left.children[0].children[1].attrs.change, 'removed');
});
test('Diff export is disabled while loading or when a version selection failed', () => {
    const script = template(diffPath, 'clientScript');
    const start = script.indexOf('ctrl.canExportXml = function');
    const end = script.indexOf('ctrl.exportXml = function', start);
    const previous = { fields: {} };
    const ctrl = { leftVersionId: 'old', rightVersionId: 'current', isSameVersionSelected: () => false };
    vm.runInNewContext(script.slice(start, end), {
        ctrl, _leftIsCurrentSaved: false, _leftVersionData: previous,
        _rightVersionData: null, _versionCache: { old: previous }
    });
    assert.equal(ctrl.canExportXml(), true);
    ctrl.loadingLeft = true;
    assert.equal(ctrl.canExportXml(), false);
    ctrl.loadingLeft = false;
    ctrl.leftVersionId = 'failed-selection';
    assert.equal(ctrl.canExportXml(), false);
});

test('Assistant exposes source counters, preserves zero, and marks absent counts unavailable', () => {
    const script = template(root + 'other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts', 'clientScript');
    const start = script.indexOf('function addExportModCount');
    const end = script.indexOf('function redactRecordElement', start);
    const context = {};
    vm.runInNewContext(script.slice(start, end), context);
    for (const count of ['0', '42', null, '']) {
        const el = { attrs: {}, children: count === null ? [] : [{ tagName: 'sys_mod_count', textContent: count }],
            setAttribute(key, value) { this.attrs[key] = value; } };
        context.addExportModCount(el);
        if (count === '0' || count === '42') assert.equal(el.attrs.sys_mod_count, count);
        else assert.equal(el.attrs.sys_mod_count_status, 'unavailable');
    }
    const schema = { attrs: {}, children: [], setAttribute(key, value) { this.attrs[key] = value; } };
    context.addExportModCount(schema, { children: [{ tagName: 'sys_mod_count', textContent: '3' }] });
    assert.equal(schema.attrs.sys_mod_count, '3');
});

test('ES12 overrides distinguish enabled, disabled, missing and unreadable values', () => {
    for (const [es12Value, expected] of [['1', 'enabled'], ['true', 'enabled'], ['0', 'disabled'], ['false', 'disabled'], [null, 'not_found'], ['', 'unavailable']]) {
        assert.equal(resolver({ es12Value }).result.es12Override, expected);
    }
    assert.equal(resolver({ exists: false, deleted: true, deletionId: 'b'.repeat(32), es12Value: '1' }).result.es12Override, 'unavailable');
});
for (const path of [diffPath, root + 'other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts']) {
    test('field comparison handles unchanged, null, redacted, missing and deleted data: ' + path, () => {
        const script = template(path, 'clientScript');
        assert.match(template(path, 'html'), /<g:requires name="widget_editor_xml_export.jsdbx"/);
        assert.match(script, /window.WE_XML_EXPORT.annotateFieldChanges/);
        const context = {};
        loadFieldComparison(context);
        function field(name, text, attrs = {}) {
            return { tagName: name, textContent: text, attrs, children: [],
                getAttribute(key) { return this.attrs[key] || null; },
                setAttribute(key, value) { this.attrs[key] = value; } };
        }
        const left = { children: [field('script', 'same\n'), field('empty', ''), field('nullable', '', { nil: 'true' }), field('hidden', '', { redacted: 'true' }), field('removed', 'old'), field('whitespace', ' x ')] };
        const right = { children: [field('script', 'same\n'), field('empty', ''), field('nullable', ''), field('hidden', ''), field('added', 'new'), field('whitespace', 'x')] };
        context.annotateFieldChanges(left, right, false);
        // A redacted field can't be compared — left unset rather than change="unknown",
        // since redacted="true" on the field already conveys that.
        assert.deepEqual(left.children.map(f => f.attrs.change), ['unchanged', 'unchanged', 'modified', undefined, 'removed', 'modified']);
        assert.equal(right.children[4].attrs.change, 'added');
        // Whole record missing on one side — no per-field change attribute; the enclosing
        // previous_version's status="new" (or the deleted_record fallback) already says why.
        // Fresh fields here since a field already carrying a change attribute from a prior
        // comparison is left untouched, not cleared, when this pass has nothing to say.
        const rightAlone = { children: [field('a', 'x'), field('b', 'y')] };
        context.annotateFieldChanges(null, rightAlone, false);
        assert.ok(rightAlone.children.every(f => f.attrs.change === undefined));
        const leftDeleted = { children: [field('script', 'old'), field('hidden', '', { redacted: 'true' })] };
        context.annotateFieldChanges(leftDeleted, null, true);
        assert.equal(leftDeleted.children[0].attrs.change, 'removed');
        assert.equal(leftDeleted.children[1].attrs.change, undefined);
    });
}
test('Assistant keeps URL/runtime metadata on wrappers and counters on payloads', () => {
    const script = template(root + 'other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts', 'clientScript');
    const start = script.indexOf('function addRecordUrl');
    const end = script.indexOf('var combinedDoc', start);
    const row = { table: 'sp_widget', sys_id: 'a' };
    const context = { exportUrls: { 'sp_widget:a': 'https://example/record' },
        exportEs12: { 'sp_widget:a': 'enabled' }, addExportModCount(el) { el.attrs.sys_mod_count = '4'; } };
    vm.runInNewContext(script.slice(start, end), context);
    function el(tagName) { return { tagName, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; } }; }
    const wrapper = el('record'), payload = el('sp_widget');
    context.addRecordUrl(wrapper, row);
    context.addRecordUrl(payload, row, true);
    assert.equal(wrapper.attrs.record_url, 'https://example/record');
    assert.equal(wrapper.attrs.es12_override_at_export, 'enabled');
    assert.equal(wrapper.attrs.sys_mod_count, undefined);
    assert.equal(payload.attrs.record_url, undefined);
    assert.equal(payload.attrs.es12_override_at_export, undefined);
    assert.equal(payload.attrs.sys_mod_count, '4');
});

// Execute the real Assistant exporter with a minimal DOM and controlled platform responses.
async function exportAssistant(includePreviousUpdates, choiceChecked) {
    class Element {
        constructor(tagName) { this.tagName = tagName; this.attrs = {}; this.children = []; this.textContent = ''; }
        setAttribute(key, value) { this.attrs[key] = String(value); }
        getAttribute(key) { return this.attrs[key] ?? null; }
        appendChild(child) { this.children.push(child); return child; }
    }
    const element = (tag, children = []) => {
        const el = new Element(tag);
        children.forEach(child => el.appendChild(child));
        return el;
    };
    const payload = (table, script) => {
        const field = element('script');
        field.textContent = script;
        return element('record_update', [element(table, [field])]);
    };
    const selected = [
        { table: 'sp_widget', sys_id: 'primary', primary: true, label: 'Primary widget', tableLabel: 'Widget' },
        { table: 'sys_script_include', sys_id: 'related', suggested: true, category: 'Script Include', updateSetSysId: 'current-set', updateSetName: 'Current set',
            previousVersion: { payload: 'previous', updateSetName: 'Earlier & original set', updateSetSysId: 'earlier-set', updatedOn: '2026-01-01' } },
        { table: 'sys_script_include', sys_id: 'isolated' },
        { table: 'sys_script_include', sys_id: 'deleted', updateSetSysId: 'current-set', updateSetAction: 'DELETE' },
        { table: 'blocked_table', sys_id: 'blocked' },
        { table: 'sys_script_include', sys_id: 'failed' },
    ].map(row => ({ ...row, checked: true }));
    if (choiceChecked !== undefined) selected.push({ table: 'sys_choice_set', sys_id: 'choice', checked: choiceChecked });
    const ctrl = { visibleRows: [...selected, { table: 'sp_widget', sys_id: 'unchecked', checked: false }],
        primary: { label: 'Primary' }, updateSets: [], includePreviousUpdates };
    const links = [
        ['sp_widget:primary', 'sys_choice_set:choice', 'Choice'],
        ['sp_widget:primary', 'sys_script_include:related', 'Script Include'],
        ['sys_script_include:related', 'sp_widget:primary', 'Widget'],
        ['sp_widget:primary', 'sp_widget:unchecked', 'Unchecked'],
        ['sp_widget:primary', 'sp_widget:filtered', 'Filtered'],
        ['sp_widget:removed', 'sp_widget:primary', 'Removed'],
    ];
    let exported;
    const document = {
        implementation: { createDocument: (_, tag) => {
            exported = { documentElement: element(tag), createElement: element, importNode: node => node };
            return exported;
        } },
        createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} }
    };
    const context = {
        ctrl, document, window: { location: { origin: 'https://example.service-now.com' } },
        recordLinks: Object.fromEntries(links.map(([source, target, label]) => [source + '>' + target, { source, target, label }])),
        rowKey: row => row.table + ':' + row.sys_id,
        tableLabel: table => ({ sys_script_include: 'Script Include' })[table] || table,
        runPool: async (rows, worker) => Promise.all(rows.map(worker)),
        ajax: async () => ({ success: true, url: 'https://example/record', es12Override: 'enabled' }),
        fetch: async url => {
            if (url.includes('sys_id=failed')) throw new Error('Unavailable');
            return { text: async () => url.startsWith('/sys_choice_set') ? 'choice' : url.startsWith('/sp_widget') ? 'widget' : 'include' };
        },
        DOMParser: class { parseFromString(text) {
            return { documentElement: payload(text === 'choice' ? 'sys_choice_set' : text === 'widget' ? 'sp_widget' : 'sys_script_include', text === 'previous' ? 'old' : 'new') };
        } },
        addExportModCount: el => el.setAttribute('sys_mod_count', '4'),
        redactRecordElement() {}, isTableExportBlocked: table => table === 'blocked_table',
        indentXmlDoc() {}, safeFileNameSegment: text => text, pad: n => String(n).padStart(2, '0'),
        $timeout: fn => fn(), Blob: class {}, XMLSerializer: class { serializeToString() { return ''; } },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }
    };
    const script = template(root + 'other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts', 'clientScript');
    context.fetchExportRecordXml = async row => (await context.fetch('/' + row.table + '.do?sys_id=' + row.sys_id)).text();
    vm.createContext(context);
    loadFieldComparison(context);
    vm.runInContext(script.slice(script.indexOf('ctrl.generateXml = async function'), script.indexOf('function init()', script.indexOf('ctrl.generateXml = async function'))), context);
    await ctrl.generateXml();
    return exported.documentElement;
}

for (const includePreviousUpdates of [false, true]) {
    test('Assistant v3 exports uniform wrappers and selected dependency graph; history=' + includePreviousUpdates, async () => {
        const bundle = await exportAssistant(includePreviousUpdates);
        const child = (el, tag) => el.children.find(node => node.tagName === tag);
        assert.equal(bundle.attrs.format_version, '3');
        assert.equal(child(bundle, 'dependency_graph'), undefined);
        const wrappers = [...child(bundle, 'primary_record').children, ...child(bundle, 'related_records').children];
        assert.equal(wrappers.length, 6);
        const byId = Object.fromEntries(wrappers.map(wrapper => [wrapper.attrs.id, wrapper]));
        for (const wrapper of wrappers) {
            assert.equal(wrapper.tagName, 'record');
            assert.equal(wrapper.attrs.table, wrapper.attrs.id.split(':')[0]);
            assert.ok(child(wrapper, 'current_version'));
            assert.equal(wrapper.attrs.record_url, 'https://example/record');
            assert.equal(wrapper.attrs.es12_override_at_export, 'enabled');
        }
        assert.equal(byId['sp_widget:primary'].attrs.name, 'Primary widget');
        assert.equal(byId['sp_widget:primary'].attrs.table_label, 'Widget');
        assert.equal(byId['sys_script_include:related'].attrs.table_label, 'Script Include');
        assert.equal(byId['blocked_table:blocked'].attrs.table_label, 'blocked_table');
        assert.equal(byId['sp_widget:primary'].attrs.role, 'primary');
        assert.equal(byId['sp_widget:primary'].attrs.reason, undefined);
        assert.equal(byId['sys_script_include:related'].attrs.role, 'related');
        assert.equal(byId['sys_script_include:related'].attrs.reason, 'Script Include');
        assert.equal(byId['sys_script_include:isolated'].attrs.name, 'isolated');
        assert.equal(byId['blocked_table:blocked'].attrs.blocked, 'true');
        assert.equal(byId['sp_widget:primary'].attrs.blocked, undefined);
        assert.equal(byId['sys_script_include:deleted'].attrs.update_set_action, 'DELETE');
        assert.equal(byId['sys_script_include:deleted'].attrs.change_type, 'deleted');
        const graph = child(bundle, 'context_manifest');
        assert.deepEqual(graph.children.map(relationship => ({ ...relationship.attrs })), [
            { source: 'sp_widget:primary', target: 'sys_script_include:related', label: 'Script Include' },
            { source: 'sys_script_include:related', target: 'sp_widget:primary', label: 'Widget' },
        ]);
        for (const relationship of graph.children) {
            assert.equal(relationship.tagName, 'relationship');
            assert.ok(byId[relationship.attrs.source]);
            assert.ok(byId[relationship.attrs.target]);
        }
        assert.ok(byId['sys_script_include:isolated']);
        assert.ok(child(child(byId['sys_script_include:deleted'], 'current_version'), 'deleted_record'));
        assert.ok(child(child(byId['blocked_table:blocked'], 'current_version'), 'blocked_record'));
        assert.equal(child(byId['sys_script_include:failed'], 'current_version').attrs.status, 'unavailable');
        assert.equal(child(byId['sp_widget:primary'], 'previous_version'), undefined);
        const related = byId['sys_script_include:related'];
        const previous = child(related, 'previous_version');
        if (includePreviousUpdates) {
            assert.equal(related.attrs.update_set_name, 'Current set');
            assert.equal(previous.attrs.update_set_name, 'Earlier & original set');
            assert.equal(previous.attrs.update_set_sys_id, 'earlier-set');
            assert.equal(previous.children[0].children[0].attrs.change, 'modified');
            assert.equal(child(related, 'current_version').children[0].children[0].attrs.change, 'modified');
        } else {
            assert.equal(previous, undefined);
        }
    });
}


test('Choice selection controls both record payload and relationship export', async () => {
    for (const checked of [false, true]) {
        const bundle = await exportAssistant(false, checked);
        const related = bundle.children.find(el => el.tagName === 'related_records');
        const choice = related.children.find(el => el.attrs.table === 'sys_choice_set');
        const manifest = bundle.children.find(el => el.tagName === 'context_manifest');
        const relationship = manifest.children.find(el => el.attrs.target === 'sys_choice_set:choice');
        assert.equal(!!choice, checked);
        assert.equal(!!relationship, checked);
        if (checked) {
            assert.equal(choice.children[0].tagName, 'current_version');
            assert.equal(choice.children[0].children[0].tagName, 'sys_choice_set');
        }
    }
});

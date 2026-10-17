const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { readFluentField } = require('../helpers/fluent-source.cjs');
const root = 'src/fluent/generated/';

function server({ blocked = false } = {}) {
    const records = [
        { sys_id: 'one', name: 'incident', element: 'state' },
        { sys_id: 'duplicate', name: 'incident', element: 'state' },
        { sys_id: 'two', name: 'task', element: 'priority' }
    ];
    const queries = [];
    const context = {
        Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        Object: { extendsObject: (_, methods) => methods }, gs: { getProperty: () => '' },
        GlideRecordSecure: function (table) {
            let record, index = -1;
            this.get = id => {
                record = id === 'child' ? { name: 'incident', super_class: 'parent' } : { name: 'task', super_class: '' };
                return true;
            };
            this.addQuery = (...args) => queries.push([table, ...args]);
            this.orderBy = this.query = () => {};
            this.next = () => { record = records[++index]; return !!record; };
            this.getValue = key => record[key] || '';
            this.getUniqueValue = () => record.sys_id;
            this.getDisplayValue = () => '2026-01-01';
        }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(root + 'server-development/script-include/sys_script_include_widget_editor_assistant.server.js', 'utf8'), context);
    const api = context.WidgetEditorAssistantAjax.prototype;
    api.getParameter = key => ({ table: 'sys_db_object', sys_id: 'child' })[key];
    api._answer = result => result;
    api._isTableExportBlocked = table => blocked && table === 'sys_choice_set';
    api._scanDictionaryReferencedTables = () => ['task'];
    api._findReferencedTables = () => [{ table: 'sys_db_object', sys_id: 'parent' }];
    return { api, queries };
}

test('Table suggestions group by table/field and preserve inherited sets and table references', () => {
    const { api, queries } = server();
    const result = api.getSuggestedRelated();
    assert.equal(result.success, true);
    assert.equal(result.related.length, 3);
    assert.equal(result.related[0].table, 'sys_db_object');
    assert.equal(result.related[1].table, 'sys_choice_set');
    assert.equal(result.related[1].sys_id, 'one');
    assert.equal(result.related[1].label, 'incident.state choices');
    assert.equal(result.related[1].category, 'Choice Set');
    assert.equal(result.related[2].category, 'Choice Set (inherited)');
    assert.equal(result.related[2].label, 'task.priority choices');
    assert.deepEqual(queries, [['sys_choice_set', 'name', 'IN', 'incident,task']]);
});

test('Table suggestions respect the Choice export blocklist', () => {
    const { api, queries } = server({ blocked: true });
    assert.equal(api.getSuggestedRelated().related.length, 1);
    assert.equal(queries.length, 0);
});

test('Access Control searches suggest the table named before the field suffix', async () => {
    let aclName = 'kb_knowledge.txt';
    const queries = [];
    const context = {
        Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        Object: { extendsObject: (_, methods) => methods }, gs: { getProperty: () => '' },
        GlideRecordSecure: function (table) {
            let selectedTable = false;
            this.get = () => table === 'sys_security_acl';
            this.getValue = field => table === 'sys_security_acl' ? (field === 'name' ? aclName : '') :
                (field === 'label' ? 'Knowledge' : 'kb_knowledge');
            this.addQuery = (field, operator, value) => {
                queries.push([table, field, operator, value]);
                selectedTable = table === 'sys_db_object' && field === 'name' && value === 'kb_knowledge';
            };
            this.query = () => {};
            this.next = () => {
                if (!selectedTable) return false;
                selectedTable = false;
                return true;
            };
            this.getUniqueValue = () => 'knowledge-table-id';
            this.getDisplayValue = () => '2026-01-01';
        },
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(root + 'server-development/script-include/sys_script_include_widget_editor_assistant.server.js', 'utf8'), context);
    const api = context.WidgetEditorAssistantAjax.prototype;
    api.getParameter = key => ({ table: 'sys_security_acl', sys_id: 'acl-id' })[key];
    api._answer = value => value;
    api._getTableConfig = () => ({ rules: [] });
    api._evaluateRules = () => [];
    api._findRecordReferences = () => [];
    api._findScriptFields = () => [];
    api._findFieldsOfType = () => [];

    const match = api.getSuggestedRelated();
    assert.equal(match.success, true);
    assert.equal(match.related.length, 1);
    assert.equal(match.related[0].table, 'sys_db_object');
    assert.equal(match.related[0].sys_id, 'knowledge-table-id');
    assert.deepEqual(queries, [['sys_db_object', 'name', 'IN', 'kb_knowledge']]);

    const uiPath = root + 'other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts';
    const clientScript = readFluentField(uiPath, 'clientScript');
    const aclRow = { table: 'sys_security_acl', sys_id: 'acl-id', label: 'kb_knowledge.txt' };
    const picker = {
        ctrl: { primary: {}, related: [aclRow] },
        _scannedScriptKeys: {}, _suggestScanDepth: 0, recordLinks: {}, graphLinksScanned: {}, dismissedSuggestionKeys: {},
        NON_GENERIC_SCAN_TABLES: { sys_db_object: true },
        rowKey: row => row.table + ':' + row.sys_id,
        tableLabel: table => table,
        ajax: async () => match,
        $q: { all: values => Promise.all(values) },
    };
    vm.createContext(picker);
    vm.runInContext(clientScript.slice(clientScript.indexOf('function loadSuggested('), clientScript.indexOf('function loadPrimaryContext()')), picker);
    await picker.loadSuggested('sys_security_acl', 'acl-id', 0);
    assert.equal(picker.ctrl.related.length, 2);
    assert.equal(picker.ctrl.related[1].sys_id, 'knowledge-table-id');

    aclName = 'kb_knowledge';
    assert.equal(api.getSuggestedRelated().related.length, 1);
    assert.deepEqual(queries[1], ['sys_db_object', 'name', 'IN', 'kb_knowledge']);

    aclName = 'kb_knowledge.*';
    assert.equal(api.getSuggestedRelated().related.length, 1);
    assert.deepEqual(queries[2], ['sys_db_object', 'name', 'IN', 'kb_knowledge']);

    aclName = 'missing_table.txt';
    assert.equal(api.getSuggestedRelated().related.length, 0);
    assert.deepEqual(queries[3], ['sys_db_object', 'name', 'IN', 'missing_table']);

    aclName = '';
    assert.equal(api.getSuggestedRelated().related.length, 0);
    assert.equal(queries.length, 4);
});

test('Choice suggestions start unchecked, retain user selections, and create graph links', async () => {
    const path = root + 'other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts';
    const script = readFluentField(path, 'clientScript');
    const context = {
        ctrl: { primary: { table: 'sys_db_object', sysId: 'child' }, related: [] },
        _scannedScriptKeys: {}, _suggestScanDepth: 0, recordLinks: {}, graphLinksScanned: {}, dismissedSuggestionKeys: {},
        rowKey: row => row.table + ':' + row.sys_id,
        tableLabel: () => 'Choice Set',
        ajax: async () => ({ success: true, related: [{ table: 'sys_choice_set', sys_id: 'one', label: 'State: New', category: 'Choice Set' }] }),
        $q: { all: values => Promise.all(values) }
    };
    vm.createContext(context);
    vm.runInContext(script.slice(script.indexOf('var NON_GENERIC_SCAN_TABLES'), script.indexOf('// Per-table icon overrides')), context);
    vm.runInContext(script.slice(script.indexOf('function loadSuggested('), script.indexOf('function loadPrimaryContext()')), context);
    await context.loadSuggested();
    assert.equal(context.ctrl.related[0].checked, false);
    assert.equal(context.ctrl.related[0].tableLabel, 'Choice Set');
    assert.equal(context.recordLinks['sys_db_object:child>sys_choice_set:one'].target, 'sys_choice_set:one');
    context.ctrl.related[0].checked = true;
    await context.loadSuggested();
    assert.equal(context.ctrl.related.length, 1);
    assert.equal(context.ctrl.related[0].checked, true);
});


test('A selected Choice Set exports hundreds of values in one group, filtered by its table and field', () => {
    const id = 'a'.repeat(32);
    const queries = [];
    const rows = Array.from({ length: 300 }, (_, n) => ({ value: String(n), label: 'Label & ' + n, language: 'en', inactive: n % 2 ? '1' : '0', dependent_value: 'parent', sequence: String(n) }));
    const context = {
        Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        Object: { extendsObject: (_, methods) => methods }, gs: { getProperty: () => '' },
        GlideRecordSecure: function (table) {
            let row, i = -1;
            this.get = () => { row = { name: 'incident', element: 'state' }; return true; };
            this.getValue = key => row[key] ?? null;
            this.canRead = () => true;
            this.addQuery = (...args) => queries.push([table, ...args]);
            this.orderBy = this.query = () => {};
            this.next = () => { row = rows[++i]; return !!row; };
            this.getUniqueValue = () => String(i);
        }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(root + 'server-development/script-include/sys_script_include_widget_editor_assistant.server.js', 'utf8'), context);
    const api = context.WidgetEditorAssistantAjax.prototype;
    api.getParameter = () => id;
    api._answer = result => result;
    api._isTableExportBlocked = () => false;
    const result = api.getChoiceSetValues();
    assert.equal(result.success, true);
    assert.equal(result.choices.length, 300);
    assert.equal(result.choices[0].value, '0');
    assert.equal(result.choices[1].inactive, '1');
    assert.equal(result.choices[0].dependent_value, 'parent');
    assert.deepEqual(queries, [['sys_choice', 'name', 'incident'], ['sys_choice', 'element', 'state']]);
    api._isTableExportBlocked = table => table === 'sys_choice';
    assert.equal(api.getChoiceSetValues().success, false);
});

test('Choice Set XML nests all values under one payload and marks unavailable lookups', async () => {
    const path = root + 'other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts';
    const script = readFluentField(path, 'clientScript');
    function el(tagName) {
        return { tagName, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild(child) { this.children.push(child); } };
    }
    for (const success of [true, false]) {
        const set = el('sys_choice_set');
        const doc = { documentElement: { querySelector: () => set }, createElement: el };
        const context = {
            fetch: async () => ({ text: async () => 'native XML' }),
            DOMParser: class { parseFromString() { return doc; } },
            XMLSerializer: class { serializeToString(value) { assert.equal(value, doc); return 'enriched XML'; } },
            ajax: async () => ({ success, name: 'incident', element: 'state', choices: Array.from({ length: 300 }, (_, i) => ({ value: String(i), label: 'Label & <' + i + '>' })) })
        };
        vm.createContext(context);
        vm.runInContext(script.slice(script.indexOf('async function fetchExportRecordXml'), script.indexOf('// Exported XML/SCHEMA byte size')), context);
        assert.equal(await context.fetchExportRecordXml({ table: 'sys_choice_set', sys_id: 'set' }), 'enriched XML');
        assert.equal(set.children.length, 1);
        assert.equal(set.children[0].tagName, 'choice_values');
        assert.equal(set.children[0].children.length, success ? 300 : 0);
        if (success) {
            assert.equal(set.children[0].children[0].attrs.value, '0');
            assert.equal(set.children[0].children[0].attrs.label, 'Label & <0>');
        } else assert.equal(set.children[0].attrs.status, 'unavailable');
    }
});

test('Graph groups hundreds of Choice Sets per table and toggles the entire group', () => {
    const path = root + 'other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts';
    const script = readFluentField(path, 'clientScript');
    const parent = { table: 'sys_db_object', sys_id: 'table', primary: true, label: 'Incident', checked: true };
    const choices = Array.from({ length: 200 }, (_, i) => ({ table: 'sys_choice_set', sys_id: 'set' + i,
        choiceTable: 'incident', choiceField: 'field' + i, label: 'incident.field' + i + ' choices', checked: false }));
    const other = { table: 'sys_choice_set', sys_id: 'other', choiceTable: 'task', choiceField: 'state', checked: false };
    const links = Object.fromEntries(choices.map(row => [row.sys_id, { source: 'sys_db_object:table', target: 'sys_choice_set:' + row.sys_id, label: 'Choice Set' }]));
    let saves = 0;
    const context = {
        ctrl: { rows: [parent, ...choices, other], includesPreviousVersion: () => false, canIncludePreviousVersion: () => false, isExportBlocked: () => false, onSelectionChange() { saves++; context.rebuildGraph(); } },
        rowKey: row => row.table + ':' + row.sys_id,
        tableLabel: table => table,
        rowMatchesActiveFilter: () => true,
        recordLinks: links
    };
    vm.createContext(context);
    vm.runInContext(script.slice(script.indexOf('function groupGraphChoices'), script.indexOf('ctrl.setViewMode =')), context);
    vm.runInContext(script.slice(script.indexOf('ctrl.toggleGraphRecord ='), script.indexOf('ctrl.openGraphRecord =')), context);
    context.rebuildGraph();
    assert.equal(context.ctrl.graph.nodes.length, 3);
    assert.equal(context.ctrl.graph.edges.length, 1);
    const group = () => context.ctrl.graph.nodes.find(node => node.row.choiceTable === 'incident');
    assert.equal(group().row.members.length, 200);
    assert.equal(group().fullLabel, 'incident');
    assert.equal(group().row.selectionLabel, '0 / 200 fields included');
    assert.equal(group().dimmed, true);
    assert.equal(context.ctrl.graph.edges[0].target, group().key);
    context.ctrl.toggleGraphRecord(group().row);
    assert.ok(choices.every(row => row.checked));
    assert.equal(other.checked, false);
    assert.equal(group().checked, true);
    assert.equal(group().dimmed, false);
    context.ctrl.toggleGraphRecord(group().row);
    assert.ok(choices.every(row => !row.checked));
    // A partial saved selection is represented honestly; the next click includes all.
    choices[0].checked = true;
    context.rebuildGraph();
    assert.equal(group().row.partiallyChecked, true);
    assert.equal(group().dimmed, false);
    context.ctrl.toggleGraphRecord(group().row);
    assert.ok(choices.every(row => row.checked));
    assert.equal(saves, 3);
    // XML keeps the real graph endpoints, never synthetic group IDs.
    assert.equal(links.set0.target, 'sys_choice_set:set0');
    const actionsContext = {};
    vm.runInNewContext(script.slice(script.indexOf('function actionDefinitions'), script.indexOf('function pillDefinitions')), actionsContext);
    const actions = actionsContext.actionDefinitions(group());
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'toggle');
    assert.equal(actions[0].title, 'Exclude all fields');

    const pillsContext = { ctx: null, scope: context };
    vm.runInNewContext(script.slice(script.indexOf('function pillDefinitions'), script.indexOf('function createPill')), pillsContext);
    const pillLines = pillsContext.pillDefinitions(group());
    const flatPills = pillLines.flat();
    assert.equal(flatPills.length, 200);
    assert.ok(flatPills.every(pill => pill.opacity === 1));
    assert.ok(flatPills.every(pill => pill.label.startsWith('field')));
    assert.equal(flatPills.some(pill => pill.label.includes('fields included')), false);

    // When certain choice sets are de-selected, their pill opacity drops to ~50%
    choices[0].checked = false;
    const partialPills = pillsContext.pillDefinitions(group()).flat();
    const deselectedPill = partialPills.find(p => p.label === 'field0');
    const selectedPill = partialPills.find(p => p.label === 'field1');
    assert.equal(deselectedPill.opacity, 0.5);
    assert.equal(selectedPill.opacity, 1);
    assert.ok(deselectedPill.className.includes('we-pill-choice--deselected'));
});

test('Deselecting a table automatically deselects the table choices for that table', () => {
    const path = root + 'other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts';
    const script = readFluentField(path, 'clientScript');
    const tableRow = { table: 'sys_db_object', sys_id: 'tbl_inc', label: 'Incident', name: 'incident', checked: true };
    const otherTable = { table: 'sys_db_object', sys_id: 'tbl_task', label: 'Task', name: 'task', checked: true };
    const choicesInc = [
        { table: 'sys_choice_set', sys_id: 'inc_state', choiceTable: 'incident', choiceField: 'state', checked: true },
        { table: 'sys_choice_set', sys_id: 'inc_priority', choiceTable: 'incident', choiceField: 'priority', checked: true }
    ];
    const choicesTask = [
        { table: 'sys_choice_set', sys_id: 'task_priority', choiceTable: 'task', choiceField: 'priority', checked: true }
    ];
    const links = {
        'sys_db_object:tbl_inc>sys_choice_set:inc_state': { source: 'sys_db_object:tbl_inc', target: 'sys_choice_set:inc_state' },
        'sys_db_object:tbl_inc>sys_choice_set:inc_priority': { source: 'sys_db_object:tbl_inc', target: 'sys_choice_set:inc_priority' },
        'sys_db_object:tbl_task>sys_choice_set:task_priority': { source: 'sys_db_object:tbl_task', target: 'sys_choice_set:task_priority' }
    };
    const context = {
        ctrl: {
            rows: [tableRow, otherTable, ...choicesInc, ...choicesTask],
            related: [tableRow, otherTable, ...choicesInc, ...choicesTask],
            isExportBlocked: () => false,
            saveSelections: () => {},
            viewMode: 'table'
        },
        rowKey: row => row.table + ':' + row.sys_id,
        recordLinks: links,
        recomputeTypeCounts: () => {},
        ensureEstimatesForVisible: () => {}
    };
    vm.createContext(context);
    vm.runInContext(script.slice(script.indexOf('var _prevTableChecked ='), script.indexOf('ctrl.openGraphRecord =')), context);
    vm.runInContext(script.slice(script.indexOf('ctrl.onSelectionChange ='), script.indexOf('ctrl.updateSetRecordCount =')), context);

    // Both tables and their choices start checked
    assert.ok(choicesInc.every(c => c.checked));
    assert.ok(choicesTask.every(c => c.checked));

    // Toggle/deselect the Incident table via graph toggle or table checkbox
    context.ctrl.toggleGraphRecord(tableRow);
    assert.equal(tableRow.checked, false);
    // Incident table choices must be automatically deselected
    assert.ok(choicesInc.every(c => !c.checked));
    // Task table choices must remain checked
    assert.ok(choicesTask.every(c => c.checked));

    // Re-check an Incident choice
    choicesInc[0].checked = true;
    tableRow.checked = true;
    context.ctrl.onSelectionChange(); // update state tracking
    assert.equal(choicesInc[0].checked, true);

    // Deselect Incident table via table checkbox / onSelectionChange(tableRow)
    tableRow.checked = false;
    context.ctrl.onSelectionChange(tableRow);
    assert.equal(choicesInc[0].checked, false);
    assert.ok(choicesTask.every(c => c.checked));
});

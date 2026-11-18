const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { readFluentField } = require('../helpers/fluent-source.cjs');

const configFile = 'src/fluent/generated/properties/system-property/sys_properties_widget_editor_table_config.now.ts';
const properties = [...fs.readFileSync(configFile, 'utf8').matchAll(/export const (\w+) = Property/g)].map(
    ([, declaration]) => ({
        name: readFluentField(configFile, 'name', declaration),
        value: readFluentField(configFile, 'value', declaration),
    })
);
const source = fs.readFileSync(
    'src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_ajax.server.js',
    'utf8'
);
const recordId = 'a'.repeat(32);

function harness(params, options = {}) {
    const rows = {
        sp_widget: [{ sys_id: recordId }],
        sys_script_include: [{ sys_id: recordId, client_callable: options.clientCallable ? 'true' : 'false' }],
        sys_ui_related_list: [
            { sys_id: 'rl-widget', name: 'sp_widget', view: 'Default view' },
            { sys_id: 'rl-metadata', name: 'sys_metadata', view: 'Default view' },
            ...(options.ownList ? [{ sys_id: 'rl-include', name: 'sys_script_include', view: 'Default view' }] : []),
        ],
        sys_ui_related_list_entry: [
            { list_id: 'rl-widget', position: 0, related_list: 'sp_page.widget' },
            { list_id: 'rl-widget', position: 1, related_list: 'm2m_sp_ng_pro_sp_widget.sp_widget' },
            { list_id: 'rl-metadata', position: 0, related_list: 'sys_ui_action.script_include' },
            { list_id: 'rl-metadata', position: 1, related_list: 'm2m_sp_ng_pro_sp_widget.sp_widget' },
            { list_id: 'rl-metadata', position: 2, related_list: 'REL:rel1' },
            { list_id: 'rl-metadata', position: 3, related_list: 'sys_update_version.name' },
            { list_id: 'rl-metadata', position: 4, related_list: 'sys_hidden.script_include' },
            ...(options.ownEntries || ['sp_page.widget']).map((related_list, position) => ({
                list_id: 'rl-include',
                position,
                related_list,
            })),
        ],
        sys_relationship: [{ sys_id: 'rel1', name: 'Callers', basic_query_from: 'sys_script' }],
        sys_ui_policy: options.policies
            ? [
                  {
                      sys_id: 'policy-show',
                      table: 'sys_script_include',
                      conditions: 'client_callable=true^ORmobile_callable=true^EQ',
                      active: 'true',
                      on_load: 'true',
                      global: 'true',
                      inherit: 'false',
                      reverse_if_false: 'true',
                      order: 100,
                  },
                  {
                      sys_id: 'policy-parent',
                      table: 'sys_metadata',
                      conditions: '',
                      active: 'true',
                      on_load: 'true',
                      global: 'true',
                      inherit: options.inheritParentPolicy ? 'true' : 'false',
                      reverse_if_false: 'false',
                      order: 50,
                  },
                  {
                      sys_id: 'policy-inactive',
                      table: 'sys_script_include',
                      conditions: '',
                      active: 'false',
                      on_load: 'true',
                      global: 'true',
                      inherit: 'false',
                      reverse_if_false: 'false',
                      order: 10,
                  },
              ]
            : [],
        sys_ui_policy_rl_action: [
            { ui_policy: 'policy-show', list: 'REL:rel1', visible: 'true' },
            { ui_policy: 'policy-parent', list: 'sys_ui_action.script_include', visible: 'false' },
            { ui_policy: 'policy-inactive', list: 'm2m_sp_ng_pro_sp_widget.sp_widget', visible: 'false' },
        ],
        sys_ui_list: [{ sys_id: 'list-action', name: 'sys_ui_action', view: '' }],
        sys_ui_list_element: [
            { list_id: 'list-action', position: 0, element: 'name' },
            { list_id: 'list-action', position: 1, element: 'script_include' },
        ],
        sys_ui_action: [
            { sys_id: 'b'.repeat(32), name: 'Run', script_include: recordId, secret: 'x' },
            { sys_id: 'c'.repeat(32), name: 'Other', script_include: 'd'.repeat(32) },
            { sys_id: 'f'.repeat(32), name: 'Apply', script_include: recordId, sys_class_name: 'sys_ui_action_ext' },
        ],
        sys_ui_action_ext: [{ sys_id: 'f'.repeat(32), name: 'Apply', script_include: recordId, order: '7' }],
        sys_ui_section: [
            { sys_id: 'sec-action', name: 'sys_ui_action', view: 'Default view', caption: '' },
            { sys_id: 'sec-ext-popup', name: 'sys_ui_action_ext', 'view.name': 'sys_popup', caption: '' },
        ],
        sys_ui_element: [
            { sys_ui_section: 'sec-action', position: 0, element: 'name' },
            { sys_ui_section: 'sec-action', position: 1, element: '.begin_split' },
            { sys_ui_section: 'sec-action', position: 2, element: 'activity', type: 'formatter' },
            { sys_ui_section: 'sec-action', position: 3, element: 'script_include' },
            { sys_ui_section: 'sec-action', position: 4, element: 'secret' },
            { sys_ui_section: 'sec-ext-popup', position: 0, element: 'order' },
        ],
        sys_script: [{ sys_id: 'e'.repeat(32), name: 'Caller' }],
    };
    const references = { script_include: 'sys_script_include' };
    const evaluated = [];
    const operators = {
        '!=': (actual, value) => actual !== value,
        '<': (actual, value) => actual < value,
        '=': (actual, value) => actual === value,
        '>': (actual, value) => actual > value,
        ISEMPTY: (actual) => actual === '',
        ISNOTEMPTY: (actual) => actual !== '',
        IN: (actual, value) => value.split(',').includes(actual),
        CONTAINS: (actual, value) => actual.includes(value),
        STARTSWITH: (actual, value) => actual.startsWith(value),
    };
    const matcher = (field, op, value) => (row) => operators[op](String(row[field] ?? ''), String(value ?? ''));
    function Secure(table) {
        const filters = [];
        const encoded = [];
        let matches = [],
            cursor = -1,
            limit = Infinity,
            order = null;
        this.isValid = () => table !== 'missing_table';
        this.isValidField = (field) => field !== 'missing_field';
        this.initialize = () => {};
        this.addQuery = (field, op, value) => {
            if (value === undefined) [op, value] = ['=', op];
            const group = [matcher(field, op, value)];
            filters.push((row) => group.some((test) => test(row)));
            encoded.push([field, op, value]);
            return {
                addOrCondition: (orField, orOp, orValue) => {
                    group.push(matcher(orField, orOp, orValue));
                    encoded.push(['OR', orField, orOp, orValue]);
                },
            };
        };
        this.addNullQuery = (field) => this.addQuery(field, 'ISEMPTY', '');
        this.addNotNullQuery = (field) => this.addQuery(field, 'ISNOTEMPTY', '');
        this.addEncodedQuery = (query) => {
            if (query.startsWith('[')) {
                for (const [field, op, value] of JSON.parse(query).filter((part) => part[0] !== 'OR')) {
                    this.addQuery(field, op, value);
                }
                return;
            }
            let condition = null;
            for (const part of query.split('^').filter((term) => term && term !== 'EQ')) {
                const isOr = part.startsWith('OR');
                const [field, value] = (isOr ? part.substring(2) : part).split('=');
                if (isOr && condition) condition.addOrCondition(field, '=', value);
                else condition = this.addQuery(field, '=', value);
            }
        };
        this.getEncodedQuery = () => JSON.stringify(encoded);
        this.orderBy = (field) => {
            order = [field, 1];
        };
        this.orderByDesc = (field) => {
            order = [field, -1];
        };
        this.chooseWindow = () => {};
        this.setLimit = (value) => {
            limit = value;
        };
        this.query = () => {
            matches = (rows[table] || [])
                .filter((row) => filters.every((test) => test(row)))
                .sort((a, b) =>
                    order
                        ? String(a[order[0]]).localeCompare(String(b[order[0]]), undefined, { numeric: true }) *
                          order[1]
                        : (a.position ?? 0) - (b.position ?? 0)
                )
                .slice(0, limit);
            cursor = -1;
        };
        this.next = () => ++cursor < matches.length;
        this.hasNext = () => cursor + 1 < matches.length;
        this.get = (id) => {
            this.addQuery('sys_id', id);
            this.query();
            return this.next();
        };
        this.canRead = () => options.readable !== false;
        this.getValue = (field) => matches[cursor]?.[field] ?? null;
        this.getDisplayValue = (field) => (field ? this.getValue(field) : this.getValue('name'));
        this.getUniqueValue = () => this.getValue('sys_id');
        this.getTableName = () => table;
        this.getRecordClassName = () => this.getValue('sys_class_name') || table;
        this.getClassDisplayValue = () => `${this.getRecordClassName()} label`;
        this.getLabel = () => table;
        this.getRowCount = () => matches.length;
        this.getElement = (field) => ({
            canRead: () => field !== 'secret',
            getLabel: () => field.replace(/_/g, ' '),
            getED: () => ({
                getInternalType: () => (references[field] ? 'reference' : 'string'),
                getReference: () => references[field],
            }),
        });
    }
    const context = vm.createContext({
        AbstractAjaxProcessor: {},
        Class: { create: () => function () {} },
        GlideAggregate: function (table) {
            const gr = new Secure(table);
            this.addQuery = gr.addQuery;
            this.addEncodedQuery = gr.addEncodedQuery;
            this.addAggregate = () => {};
            this.query = gr.query;
            this.next = () => true;
            this.getAggregate = () => String(gr.getRowCount());
        },
        GlideRecord: function (name) {
            if (name !== 'sys_properties') return new Secure(name);
            let cursor = -1;
            this.addQuery = this.orderBy = this.query = () => {};
            this.next = () => ++cursor < properties.length;
            this.getValue = (field) => properties[cursor][field];
        },
        GlideRecordSecure: Secure,
        GlideScopedEvaluator: function () {
            const variables = {};
            this.putVariable = (name, value) => {
                variables[name] = value;
            };
            this.evaluateScript = (record, field) =>
                evaluated.push([record.getUniqueValue(), field, variables.parent.getTableName()]);
        },
        TableUtils: function (table) {
            this.getTables = () => {
                const list = table === 'sys_script_include' ? ['sys_script_include', 'sys_metadata'] : [table];
                return { get: (index) => list[index], size: () => list.length };
            };
        },
        gs: {
            error: () => {},
            getProperty: (name, fallback) =>
                name === 'monaco.plus.widget.related_list_exclusions' ? 'sys_hidden.script_include' : fallback,
            warn: () => {},
        },
    });
    vm.runInContext('Object.extendsObject = (_, methods) => methods;', context);
    vm.runInContext(source, context);
    const api = context.WidgetEditorAjax.prototype;
    let result;
    api.getParameter = (name) => params[name];
    api.setAnswer = (value) => {
        result = JSON.parse(value);
    };
    return {
        call(action, extra = {}) {
            const saved = { ...params };
            Object.assign(params, extra);
            api[action]();
            Object.keys(params).forEach((key) => delete params[key]);
            Object.assign(params, saved);
            return result;
        },
        evaluated,
    };
}

test('non-widget records inherit related lists from their nearest configured table', () => {
    const h = harness({ record_table: 'sys_script_include', sys_id: recordId });
    const definitions = h.call('getRelatedDefinitions');
    assert.equal(definitions.success, true);
    assert.deepEqual(
        definitions.tabs.map((tab) => tab.related_list),
        ['sys_ui_action.script_include', 'm2m_sp_ng_pro_sp_widget.sp_widget', 'REL:rel1']
    );
    const [actions, , relationship] = definitions.tabs;
    assert.equal(actions.count, 2);
    assert.deepEqual(actions.fixed, { label: 'script include', value: recordId });
    assert.equal(relationship.fixed, undefined);
    assert.deepEqual(
        actions.columns.map((column) => column.field),
        ['name'],
        'back-references to the record are hidden'
    );
    assert.equal(relationship.title, 'Callers');
    assert.deepEqual(h.evaluated[0], ['rel1', 'query_with', 'sys_script_include']);

    const data = h.call('getRelatedData', { related_list: 'sys_ui_action.script_include' });
    assert.equal(data.success, true);
    assert.deepEqual(
        data.rows.map((row) => row.name),
        ['Run', 'Apply']
    );
    assert.equal(data.count, 2);
    assert.deepEqual(
        { class: data.rows[1]._class, value: data.rows[1].name__value },
        { class: 'sys_ui_action_ext', value: 'Apply' }
    );
});

test('a table with its own related list configuration does not inherit one', () => {
    const h = harness({ record_table: 'sys_script_include', sys_id: recordId }, { ownList: true });
    assert.deepEqual(
        h.call('getRelatedDefinitions').tabs.map((tab) => tab.related_list),
        ['sp_page.widget']
    );
});

test('widgets keep hiding lists the editor already manages', () => {
    const h = harness({ sys_id: recordId });
    assert.deepEqual(
        h.call('getRelatedDefinitions').tabs.map((tab) => tab.related_list),
        ['sp_page.widget']
    );
    assert.equal(
        h.call('getRelatedData', { related_list: 'm2m_sp_ng_pro_sp_widget.sp_widget' }).error,
        'Related list not available.'
    );
});

test('related data is limited to configured lists on supported, readable records', () => {
    const h = harness({ record_table: 'sys_script_include', sys_id: recordId });
    for (const related_list of [
        'sys_update_version.name',
        'sys_hidden.script_include',
        'sys_script.script',
        'sp_page.widget',
    ]) {
        assert.equal(h.call('getRelatedData', { related_list }).success, false, related_list);
    }
    assert.equal(h.call('getRelatedDefinitions', { record_table: 'incident' }).error, 'Unsupported record type.');
    assert.equal(
        harness({ record_table: 'sys_script_include', sys_id: recordId }, { readable: false }).call(
            'getRelatedDefinitions'
        ).error,
        'Record not found.'
    );
    assert.equal(h.call('getRelatedDefinitions', { sys_id: '' }).error, 'No sys_id provided');
});

test('availability reports whether any related list can be shown', () => {
    const params = { record_table: 'sys_script_include', sys_id: recordId };
    assert.deepEqual(harness({ ...params }).call('hasRelatedLists'), { success: true, available: true });
    const hiddenOnly = harness(
        { ...params },
        { ownList: true, ownEntries: ['sys_update_version.name', 'sys_hidden.script_include', 'missing_table.name'] }
    );
    assert.deepEqual(hiddenOnly.call('hasRelatedLists'), { success: true, available: false });
    assert.deepEqual(harness({ ...params }, { ownList: true, ownEntries: [] }).call('hasRelatedLists'), {
        success: true,
        available: false,
    });
    assert.equal(harness({ ...params }, { readable: false }).call('hasRelatedLists').success, false);
});

test('Related Lists controls only appear when the record has related lists', () => {
    const html = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus.html', 'utf8');
    const controls = html.split('\n').filter((line) => line.includes('openRelatedModal()'));
    assert.equal(controls.length, 2);
    for (const line of controls) assert.match(line, /ng-if="!isVersionView &amp;&amp; hasRelatedLists"/);
    const client = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus.client.js', 'utf8');
    assert.match(client, /\$scope\.hasRelatedLists = false;/);
    assert.match(client, /if \(\$scope\.isNewWidget\) return;\s+_loadRelatedListAvailability\(\);/);
    assert.match(client, /\$scope\.isNewWidget = false;\s+_loadRelatedListAvailability\(\);/);
});

test('related data applies list conditions, keyword search and sorting', () => {
    const h = harness({ record_table: 'sys_script_include', sys_id: recordId });
    const data = (extra) => h.call('getRelatedData', { related_list: 'sys_ui_action.script_include', ...extra });
    const names = (extra) => data(extra).rows.map((row) => row.name);
    const conditions = (list) => ({ conditions: JSON.stringify(list) });

    assert.deepEqual(names({ sort: 'name', sort_dir: 'asc' }), ['Apply', 'Run']);
    assert.deepEqual(names({ sort: 'name', sort_dir: 'desc' }), ['Run', 'Apply']);
    const matching = data(conditions([{ field: 'name', op: '=', value: 'Run' }]));
    assert.deepEqual(
        { count: matching.count, names: matching.rows.map((row) => row.name) },
        { count: 1, names: ['Run'] }
    );
    assert.deepEqual(names(conditions([{ field: 'name', op: '!=', value: 'Run' }])), ['Apply']);
    assert.deepEqual(names(conditions([{ field: 'name', op: 'STARTSWITH', value: 'Ap' }])), ['Apply']);
    assert.deepEqual(names(conditions([{ field: 'name', op: 'LIKE', value: 'pp' }])), ['Apply']);
    assert.deepEqual(names(conditions([{ field: '', op: 'TEXT', value: 'u' }])), ['Run']);
    assert.deepEqual(names(conditions([{ field: 'name', op: 'ISEMPTY', value: '' }])), []);

    for (const extra of [
        conditions([{ field: 'script_include', op: '=', value: recordId }]),
        conditions([{ field: 'name', op: 'IN', value: 'Run' }]),
        conditions([{ field: 'name', op: 'TEXT', value: 'Run' }]),
        conditions({ field: 'name', op: '=', value: 'Run' }),
        { conditions: '{' },
        { sort: 'sys_id', sort_dir: 'asc' },
        { sort: 'name', sort_dir: 'sideways' },
    ]) {
        assert.equal(data(extra).success, false, JSON.stringify(extra));
    }
});

test('related previews show readable form fields for rows in the list', () => {
    const h = harness({ record_table: 'sys_script_include', sys_id: recordId });
    const preview = (row_sys_id, related_list = 'sys_ui_action.script_include') =>
        h.call('getRelatedPreview', { related_list, row_sys_id });

    const run = preview('b'.repeat(32));
    assert.equal(run.success, true);
    assert.equal(run.title, 'sys_ui_action label');
    assert.deepEqual(
        run.fields.map((field) => [field.label, field.value, field.refTable, field.refId]),
        [
            ['name', 'Run', null, ''],
            ['script include', recordId, 'sys_script_include', recordId],
        ]
    );

    const extended = preview('f'.repeat(32));
    assert.deepEqual(
        { fields: extended.fields.map((field) => field.value), table: extended.table },
        { fields: ['7'], table: 'sys_ui_action_ext' }
    );

    assert.equal(preview('c'.repeat(32)).error, 'Record not found.');
    assert.equal(preview('b'.repeat(32), 'sys_update_version.name').error, 'Related list not available.');
    assert.equal(preview('not-a-sys-id').error, 'Missing params');
});

test('related list modal renders classic list controls', () => {
    const html = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus.html', 'utf8');
    const modal = html.slice(
        html.indexOf('<!-- Related Lists Modal -->'),
        html.indexOf('<!-- Widget picker modal -->')
    );
    assert.match(modal, /we-dialog-cancel="cancelRelatedModal\(\)"/);
    assert.match(modal, /tab\.count &gt; 0 \? ' \(' \+ tab\.count \+ '\)' : ''/);
    for (const kind of ['title', 'header', 'row'])
        assert.match(modal, new RegExp(`openRelatedMenu\\(\\$event, '${kind}'`));
    assert.match(modal, /we-contextmenu="openRelatedMenu\(\$event, 'row', relatedModal\.activeTab, col, row\)"/);
    assert.match(modal, /class="btn btn-icon table-btn-lg icon-info list_popup"/);
    assert.match(modal, /class="linked formlink"/);
    assert.match(modal, /No records to display/);
    const css = html.slice(html.indexOf('/* Related Lists Modal */'), html.indexOf('/* User Preferences modal */'));
    assert.doesNotMatch(css, />/, 'Jelly escapes child selectors in UI page styles');

    const client = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus.client.js', 'utf8');
    for (const label of [
        'Show Matching',
        'Filter Out',
        'Show After',
        'Show Before',
        'Copy URL to Clipboard',
        'Copy sys_id',
        'Refresh List',
        'Sort (a to z)',
        'Sort (z to a)',
    ]) {
        assert.ok(client.includes(`label: '${label}'`), label);
    }
});

test('UI policy related list actions hide or show lists for the saved record', () => {
    const tabs = (options) =>
        harness({ record_table: 'sys_script_include', sys_id: recordId }, { policies: true, ...options })
            .call('getRelatedDefinitions')
            .tabs.map((tab) => tab.related_list);

    assert.deepEqual(tabs(), ['sys_ui_action.script_include', 'm2m_sp_ng_pro_sp_widget.sp_widget']);
    assert.deepEqual(tabs({ clientCallable: true }), [
        'sys_ui_action.script_include',
        'm2m_sp_ng_pro_sp_widget.sp_widget',
        'REL:rel1',
    ]);
    assert.deepEqual(tabs({ clientCallable: true, inheritParentPolicy: true }), [
        'm2m_sp_ng_pro_sp_widget.sp_widget',
        'REL:rel1',
    ]);

    const hidden = harness({ record_table: 'sys_script_include', sys_id: recordId }, { policies: true });
    assert.equal(hidden.call('getRelatedData', { related_list: 'REL:rel1' }).error, 'Related list not available.');
    assert.equal(
        hidden.call('getRelatedPreview', { related_list: 'REL:rel1', row_sys_id: 'e'.repeat(32) }).error,
        'Related list not available.'
    );
});

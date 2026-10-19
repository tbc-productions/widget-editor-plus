const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const serverSource = fs.readFileSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_markdown.server.js', 'utf8');
const clientSource = fs.readFileSync('src/fluent/generated/server-development/ui-action/widget_editor_markdown_copy.client.js', 'utf8');

function mockBootstrapModal(node, modals) {
    const handlers = {};
    return {
        one(event, handler) { handlers[event] = handler; return this; },
        modal(command) {
            if (command === 'hide') handlers['hidden.bs.modal']();
            else { modals.push(node); if (handlers['shown.bs.modal']) handlers['shown.bs.modal'](); }
            return this;
        },
    };
}
function modalButton(modal, text) {
    function all(node) { return node.children.flatMap(child => [child, ...all(child)]); }
    return all(modal).find(node => node.tagName === 'BUTTON' && node.textContent === text);
}

function server(extra = {}) {
    const context = {
        Class: { create: () => function () { } },
        AbstractAjaxProcessor: {},
        Object: { keys: Object.keys, create: Object.create, prototype: Object.prototype, extendsObject: (_base, methods) => methods },
        gs: { getProperty: () => 'https://example.service-now.com/', hasRole: () => false, setProperty: () => { throw Error('unexpected write'); } },
        GlideRecordSecure: function () { this.isValid = () => false; this.get = this.next = () => false; this.addQuery = this.setLimit = this.query = () => { }; },
        GlideTableHierarchy: function () { this.getBase = () => ''; },
        ...extra,
    };
    const categoryLinks = [];
    const Record = context.GlideRecordSecure;
    context.GlideRecordSecure = function (table) {
        if (table === 'sys_properties_category') return { get: (_field, name) => name === 'Widget Editor+', getUniqueValue: () => 'widget-editor-category' };
        if (table === 'sys_properties_category_m2m') {
            const fields = {};
            return {
                addQuery: (field, value) => { fields[field] = value; }, setLimit() { }, query() { },
                next: () => categoryLinks.some(link => link.property === fields.property && link.category === fields.category),
                initialize() { }, setValue: (field, value) => { fields[field] = value; },
                insert: () => { categoryLinks.push({ ...fields }); return 'category-link'; }
            };
        }
        const record = new Record(table);
        if (!record.getUniqueValue) record.getUniqueValue = () => 'test-property-id';
        return record;
    };
    vm.createContext(context);
    vm.runInContext(serverSource, context);
    context.gs.getProperty ||= (_, fallback) => fallback;
    vm.runInContext(fs.readFileSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_ajax.server.js', 'utf8'), context);
    context.global = context;
    const api = context.WidgetEditorMarkdownAjax.prototype;
    api.setAnswer = value => JSON.parse(value);
    api.getParameter = () => '';
    return { api, context, categoryLinks };
}

test('forced customer update resolves target from validated name suffix', () => {
    const { api } = server();
    const id = 'a'.repeat(32);
    const target = api._target({ getValue: key => key === 'name' ? 'u_custom_record_' + id : '<record_update />' });
    assert.equal(target.table, 'u_custom_record');
    assert.equal(target.id, id);
    assert.equal(api._target({ getValue: key => key === 'name' ? 'u_custom_record_not-an-id' : '' }), null);
    const payload = '<record_update table="catalog_ui_policy"><catalog_ui_policy action="INSERT_OR_UPDATE"><sys_id>' + id + '</sys_id></catalog_ui_policy></record_update>';
    assert.equal(api._target({ getValue: key => key === 'payload' ? payload : '' }).table, 'catalog_ui_policy');
});

test('reference-valued record display field uses referenced record name', () => {
    const refId = 'b'.repeat(32);
    const { api } = server({
        GlideRecordSecure: function (table) {
            this.isValid = () => table === 'sc_cat_item_producer';
            this.get = id => table === 'sc_cat_item_producer' && id === refId;
            this.getValue = () => '';
            this.getDisplayValue = () => 'Friendly producer';
        },
    });
    api._displayField = () => ({ name: 'catalog_item', reference: 'sc_cat_item_producer' });
    const record = { getValue: () => refId, getDisplayValue: () => refId };
    assert.equal(api._name(record, 'u_record', 'a'.repeat(32), '', ''), 'Friendly producer');
});

test('dictionary updates resolve from the record element without a root table or sys_id in the update name', () => {
    const { api } = server();
    const id = 'a'.repeat(32), companionId = 'b'.repeat(32);
    const payload = '<?xml version="1.0"?><record_update><!-- dictionary -->' +
        '<sys_dictionary action="INSERT_OR_UPDATE" element="u_field" table="u_example">' +
        '<sys_id><![CDATA[' + id + ']]></sys_id></sys_dictionary>' +
        '<sys_app_file><sys_id>' + companionId + '</sys_id></sys_app_file></record_update>';
    const update = value => ({ getValue: key => key === 'payload' ? value : 'sys_dictionary_u_example_u_field' });
    const target = api._target(update(payload));
    assert.equal(target.table, 'sys_dictionary');
    assert.equal(target.id, id);
    assert.equal(api._target(update(payload.replace('<sys_id><![CDATA[' + id + ']]></sys_id>', ''))), null,
        'must not link the companion record when the dictionary ID is missing');
});

test('record element lookup handles long comment runs and an unfinished comment', () => {
    const { api } = server();
    const id = 'a'.repeat(32);
    const update = payload => ({ getValue: key => key === 'payload' ? payload : '' });
    const comments = '<!-- note -->'.repeat(3000);
    const payload = '<record_update>' + comments + '<sys_dictionary><sys_id>' + id + '</sys_id></sys_dictionary></record_update>';
    assert.equal(api._target(update(payload)).table, 'sys_dictionary');
    assert.equal(api._target(update('<record_update>' + comments + '<!-- unfinished')), null);
});

test('Markdown character escaping is disabled by default and can be enabled', () => {
    const context = {};
    vm.createContext(context); vm.runInContext(clientSource, context);
    const punctuation = '\\`*_{}[]()#+.!|<>~-';
    for (const setting of [undefined, false, 'true']) {
        assert.equal(context._weMarkdownEscape(punctuation, setting), punctuation);
        assert.equal(context._weMarkdownEscape(' Widget Editor+ \n u_field ', setting), 'Widget Editor+ u_field');
    }
    assert.equal(context._weMarkdownEscape(punctuation, true), Array.from(punctuation, char => '\\' + char).join(''));
    assert.equal(context._weMarkdownEscape('sys_dictionary u_my__field'), 'sys_dictionary u_my__field');
    assert.equal(context._weMarkdownEscape('_label_ __label__'), '_label_ __label__');
    assert.equal(context._weMarkdownEscape('_label_ __label__', true), '\\_label\\_ \\_\\_label\\_\\_');
    assert.equal(context._weMarkdownEscape('sys_dictionary', true), 'sys\\_dictionary');
    const output = context._weMarkdownText([{
        rows: [{
            table: 'sys_dictionary', id: 'a', type: 'Dictionary', name: 'u_my_field',
            secondary: ['sys_dictionary'], url: '/record'
        }]
    }]);
    assert.ok(output.includes('[u_my_field](/record) (sys_dictionary)'));
});

test('export passes the system property through paging to all rendered text', async () => {
    for (const setting of [undefined, 'false', 'true']) {
        const { api } = server({
            gs: {
                getProperty: (name, fallback) => {
                    if (name.endsWith('markdown_max_list_levels')) return '1';
                    if (name === 'monaco.plus.update_sets.markdown_escape_underscores') return 'true';
                    if (name === 'monaco.plus.update_sets.markdown_escape_characters' && setting !== undefined) return setting;
                    return fallback;
                }
            }
        });
        api._rules = () => ({ groups: [] });
        const page = api._markdownPage({ orderByDesc() { }, chooseWindow() { }, query() { }, next: () => false }, 0);
        assert.equal(page.escapeMarkdown, setting === 'true');
        const copied = [], errors = [];
        const context = { Promise };
        vm.createContext(context); vm.runInContext(clientSource, context);
        context._weMarkdownNotify = (type, message) => { if (type === 'error') errors.push(message); };
        context._weMarkdownAjax = async (_method, params) => ({
            ...page, hasMore: params.offset === 0, nextOffset: 1,
            rows: [{
                table: 'child', id: String(params.offset), name: 'child_name+ [x].\\tail', type: 'child_type+ [x].',
                secondary: ['extra_value+ [x].'], url: '/child_name',
                ancestors: [{ table: 'parent', id: 'p', name: 'parent_name+ [x].', type: 'parent_type+ [x].', url: '/parent_name' }],
                sourceSet: { table: 'sys_update_set', id: 's', name: 'set_name+ [x].', url: '/set_name' }
            }]
        });
        context._weWriteMarkdownClipboard = async value => copied.push(value);
        await context.copyUpdateSetMarkdownPlus({ getTableName: () => 'sys_update_xml', getQuery: () => '' });
        assert.deepEqual(errors, []);
        assert.equal(copied.length, 1);
        for (const [label, escaped] of [
            ['child_name+ [x].\\tail', 'child\\_name\\+ \\[x\\]\\.\\\\tail'],
            ['child_type+ [x].', 'child\\_type\\+ \\[x\\]\\.'],
            ['extra_value+ [x].', 'extra\\_value\\+ \\[x\\]\\.'],
            ['parent_name+ [x].', 'parent\\_name\\+ \\[x\\]\\.'],
            ['parent_type+ [x].', 'parent\\_type\\+ \\[x\\]\\.'],
            ['set_name+ [x].', 'set\\_name\\+ \\[x\\]\\.'],
        ]) {
            assert.ok(copied[0].includes(setting === 'true' ? escaped : label));
        }
        assert.ok(copied[0].includes('](/child_name)'), 'URLs are unchanged');
        assert.ok(!copied[0].split('\n').some(line => /^ +- /.test(line)), 'list limit reaches the clipboard through paging');
        assert.ok(copied[0].includes(setting === 'true' ? '**child\\_type\\+ \\[x\\]\\.**' : '**child_type+ [x].**'));
        if (setting !== 'true') assert.ok(!copied[0].includes('\\_'));
    }
});

test('Markdown emoji survive a script transport that removes supplementary Unicode characters', () => {
    const context = {};
    vm.createContext(context);
    vm.runInContext(clientSource.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''), context);
    const rows = Array.from({ length: 10 }, (_, index) => ({
        table: 'u_record', id: String(index), name: 'Record ' + index, type: 'Records',
        isNew: index !== 0, action: index === 0 ? 'DELETE' : '',
        sourceSet: { table: 'sys_update_set', id: String(index), name: 'Set ' + index, url: '/set/' + index }
    }));
    const output = context._weMarkdownText([{ rows }]);
    assert.ok(output.includes('~~Record 0~~ 🚮 1️⃣'));
    assert.ok(output.includes('Record 9 🆕 🔟'));
    assert.ok(output.includes('🔟 [Set 9](/set/9)'));
});

test('Markdown caps bullet levels and appends record types to flattened records', () => {
    const context = {};
    vm.createContext(context); vm.runInContext(clientSource, context);
    const records = Array.from({ length: 6 }, (_, index) => ({
        table: 'table_' + index, id: String(index), name: 'Record ' + index, type: 'Type ' + index,
        secondary: ['extra_' + index], url: '/record_' + index, inUpdateSet: true,
        isNew: index !== 5, action: index === 5 ? 'DELETE' : ''
    }));
    const loaded = [{ rows: [{ ...records[5], ancestors: records.slice(0, 5) }] }];
    for (const limit of [1, 2, 8, 9, 12, 20]) {
        const output = context._weMarkdownText(loaded, false, limit);
        const bullets = output.split('\n').filter(line => /^\s*- /.test(line));
        assert.ok(bullets.every(line => (line.match(/^ */)[0].length / 2 + 1) <= limit));
        for (let index = 0; index < records.length; index++) {
            const line = bullets.find(line => line.includes('[Record ' + index + ']'));
            assert.ok(line, 'every record is retained');
            const level = Math.min(index * 2 + 2, limit);
            assert.equal(line.match(/^ */)[0].length / 2 + 1, level);
            assert.equal(line.endsWith('**Type ' + index + '**'), index * 2 + 2 >= limit);
        }
    }
    const output = context._weMarkdownText(loaded);
    assert.ok(output.includes('                - [Record 4](/record_4) (extra_4) 🆕 **Type 4**'));
    assert.ok(output.includes('                - ~~[Record 5](/record_5)~~ (extra_5) 🚮 **Type 5**'));
    assert.ok(!output.includes('- **Type 4**'));
    assert.equal(output, context._weMarkdownText(loaded, false, 9));
});

test('Markdown list level property defaults to nine and accepts positive whole numbers', () => {
    for (const [setting, expected] of [[undefined, 9], ['9', 9], ['1', 1], ['8', 8], ['0', 9], ['-1', 9], ['2.5', 9], ['bad', 9]]) {
        const { api } = server({
            gs: {
                getProperty: (name, fallback) =>
                    name.endsWith('markdown_max_list_levels') && setting !== undefined ? setting : fallback
            }
        });
        api._rules = () => ({ groups: [] });
        const page = api._markdownPage({ orderByDesc() { }, chooseWindow() { }, query() { }, next: () => false }, 0);
        assert.equal(page.maxListLevels, expected);
    }
});

test('Markdown indicators support text, custom shortcodes, hidden values and individual set numbers', () => {
    const context = {};
    vm.createContext(context); vm.runInContext(clientSource, context);
    const rows = Array.from({ length: 11 }, (_, index) => ({
        table: 'record', id: String(index), name: 'Record ' + index, type: 'Records',
        isNew: index !== 0, action: index === 0 ? 'DELETE' : '',
        sourceSet: { table: 'sys_update_set', id: String(index), name: 'Set ' + String(index).padStart(2, '0'), url: '/set/' + index }
    }));
    const indicators = { new: ':new:', deleted: 'Deleted', update_set: { '1': ':one:', '2': '', '10': ':keycap_ten:', '11': 'Set 11' } };
    const output = context._weMarkdownText([{ rows }], true, 1, indicators);
    assert.ok(output.includes(':one: [Set 00](/set/0)'));
    assert.ok(output.includes('\n[Set 01](/set/1)\n'));
    assert.ok(output.includes(':keycap_ten: [Set 09](/set/9)'));
    assert.ok(output.includes('Set 11 [Set 10](/set/10)'));
    assert.ok(output.includes('- ~~Record 0~~ Deleted :one: **Records**'));
    assert.ok(output.includes('- Record 1 :new: **Records**'));
    assert.ok(output.includes('- Record 9 :new: :keycap_ten: **Records**'));
    assert.ok(output.includes('- Record 10 :new: Set 11 **Records**'));
    const hidden = context._weMarkdownText([{ rows }], false, 1, { new: '', deleted: '', update_set: {} });
    assert.ok(hidden.includes('- ~~Record 0~~ **Records**'));
    assert.ok(hidden.includes('- Record 1 **Records**'));
    assert.ok(!/[🆕🚮🔟\u20e3]/u.test(hidden));
    assert.equal(context._weMarkdownIndicator({ update_set: {} }, 'update_set', 10), '');
    assert.equal(context._weMarkdownIndicator({ update_set: { '10': '{keycap}' } }, 'update_set', 10), '{keycap}');
    assert.equal(context._weMarkdownIndicator({ new: '✅' }, 'new'), '✅');
});

test('Markdown formatting controls additional fields and both context-only markers', () => {
    const context = {};
    vm.createContext(context); vm.runInContext(clientSource, context);
    const rows = [{table: 'child', id: 'c', name: 'Child', type: 'Children', secondary: ['One', 'Two'],
        ancestors: [{table: 'parent', id: 'p', name: 'Parent', type: 'Parents', url: '/parent', inUpdateSet: false, secondary: ['A', 'B']}]}];
    const render = formatting => context._weMarkdownText([{rows}], false, 9, formatting);
    assert.ok(render().includes('[Parent](/parent) (A, B)'));
    const custom = render({display_field_separator: ' | ', display_field_wrapper: '[]', context_indicator: ':info:'});
    assert.ok(custom.includes(':info: [Parent](/parent) [A | B]'));
    assert.ok(custom.includes('Child [One | Two]'));
    assert.ok(custom.endsWith(':info: For context only - not included in update set.'));
    const hidden = render({display_field_separator: '', display_field_wrapper: '', context_indicator: ''});
    assert.ok(hidden.includes('[Parent](/parent) AB'));
    assert.ok(hidden.includes('Child OneTwo'));
    assert.ok(hidden.endsWith('\n\nFor context only - not included in update set.'));
    assert.ok(!hidden.includes('↪'));
    const {api} = server();
    const config = {display_field_separator: ',', display_field_wrapper: '()', context_indicator: '↪'};
    assert.deepEqual(JSON.parse(JSON.stringify(api._parseMarkdownFormatting(JSON.stringify(config)))), config);
    for (const display_field_wrapper of ['(', 'long', null, 4]) {
        assert.throws(() => api._parseMarkdownFormatting(JSON.stringify({...config, display_field_wrapper})));
    }
});

test('indicator configuration is validated and travels from the property through paging to the clipboard', async () => {
    const config = { new: ':new:', deleted: '', update_set: { '1': ':one:', '10': '', '2': '2' } };
    const { api } = server({
        gs: {
            getProperty: (name, fallback) =>
                name === 'monaco.plus.update_sets.markdown_formatting' ? JSON.stringify(config) : fallback
        }
    });
    assert.deepEqual(JSON.parse(JSON.stringify(api._markdownFormatting())), config);
    for (const invalid of ['null', '[]', '{"new":false}', '{"update_set":{"0":"x"}}', '{"update_set":{"1":null}}', '{"unknown":""}', '{"update_set":{"default":"x"}}', '{"update_set":"x"}', 'bad']) {
        assert.throws(() => api._parseMarkdownFormatting(invalid));
    }
    api._rules = () => ({ groups: [] });
    const page = api._markdownPage({ orderByDesc() { }, chooseWindow() { }, query() { }, next: () => false }, 0);
    const context = { Promise }, copied = [];
    vm.createContext(context); vm.runInContext(clientSource, context);
    context._weMarkdownNotify = (type, message) => { assert.notEqual(type, 'error', message); };
    context._weMarkdownAjax = async (_method, params) => ({
        ...page, hasMore: params.offset === 0, nextOffset: 1,
        rows: [{
            table: 'record', id: String(params.offset), name: 'Record', type: 'Records', isNew: true,
            sourceSet: { table: 'sys_update_set', id: String(params.offset), name: 'Set ' + params.offset, url: '/set' }
        }]
    });
    context._weWriteMarkdownClipboard = async value => copied.push(value);
    await context.copyUpdateSetMarkdownPlus({ getTableName: () => 'sys_update_xml', getQuery: () => '' });
    assert.ok(copied[0].includes('Record :new: :one:'));
    assert.ok(copied[0].includes('Record :new: 2'));
    const invalidApi = server({ gs: { getProperty: () => 'invalid JSON' } }).api;
    assert.deepEqual(JSON.parse(JSON.stringify(invalidApi._markdownFormatting())), null);
});

test('missing reference uses payload display text before the target name', () => {
    const { api } = server();
    api._displayField = () => ({ name: 'catalog_item', reference: 'sc_cat_item' });
    const payload = '<catalog_item display_value="Producer [friendly]">' + 'b'.repeat(32) + '</catalog_item>';
    assert.equal(api._name(null, 'u_record', 'a'.repeat(32), payload, 'Poor target name'), 'Producer [friendly]');
});

test('policy action nests beneath its policy and producer even when they are not updated', () => {
    const producerId = 'a'.repeat(32), policyId = 'b'.repeat(32), actionId = 'c'.repeat(32);
    const rules = {
        groups: [{
            table: 'sc_cat_item_producer', label: 'Record Producers', children: [{
                table: 'catalog_ui_policy', label: 'Catalog UI Policies', field: 'catalog_item', children: [{
                    table: 'catalog_ui_policy_action', label: 'Catalog UI Policy Actions', field: 'ui_policy', children: [],
                }],
            }]
        }]
    };
    const { api } = server();
    api._record = (table, id) => {
        const values = {
            ['catalog_ui_policy_action:' + actionId]: { ui_policy: policyId },
            ['catalog_ui_policy:' + policyId]: { catalog_item: producerId },
            ['sc_cat_item_producer:' + producerId]: {},
        };
        const row = values[table + ':' + id];
        return row ? { getValue: field => row[field] || '' } : null;
    };
    api._name = (_record, table) => table;
    const result = api._ancestors('catalog_ui_policy_action', actionId, '', rules);
    assert.equal(result.type, 'Catalog UI Policy Actions');
    assert.deepEqual(Array.from(result.ancestors, item => item.table), ['sc_cat_item_producer', 'catalog_ui_policy']);
    api._record = (table, id) => table === 'catalog_ui_policy_action' ? { getValue: () => policyId } : null;
    const orphaned = api._ancestors('catalog_ui_policy_action', actionId, '', rules);
    assert.equal(orphaned.ancestors.length, 0);
    assert.equal(orphaned.type, 'catalog_ui_policy_action');
});

test('saveRules rejects non-admin callers before writing', () => {
    const { api } = server();
    assert.deepEqual({ ...api.saveRules() }, { success: false, error: 'Admin role required.' });
});

test('properties API requires admin for reading and editing', () => {
    const { api } = server();
    assert.equal(api.getProperties().error, 'Admin role required.');
    assert.equal(api.saveProperty().error, 'Admin role required.');
});

test('properties API discovers the app namespace and supplies grouping defaults on upgrade', () => {
    let prefix;
    const { api } = server({
        gs: { hasRole: () => true, getProperty: () => '', setProperty: () => { } },
        GlideRecordSecure: function (table) {
            let emitted = false;
            this.addQuery = (_field, operator, value) => { prefix = operator + ':' + value; };
            this.orderBy = this.query = () => { };
            this.next = () => table === 'sys_properties' && !emitted++;
            this.getValue = field => ({
                name: 'monaco.plus.record_limit', value: '500',
                description: 'Record limit', type: 'integer', sys_updated_on: '2026-09-27 01:23:45'
            })[field];
        },
    });
    api._relatedTables = () => [];
    api._tableLabel = table => table;
    const result = api.getProperties();
    assert.equal(prefix, 'STARTSWITH:monaco.plus.update_sets.markdown_groups.');
    assert.equal(result.properties.find(property => property.name === 'monaco.plus.record_limit').value, '500');
    assert.equal(result.properties.find(property => property.name === 'monaco.plus.record_limit').updatedOn, '2026-09-27 01:23:45');
    assert.ok(result.properties.some(property => property.name === 'monaco.plus.update_sets.markdown_groups'));
});

test('properties API edits only existing Widget Editor+ properties', () => {
    const saved = {};
    const { api } = server({
        gs: { hasRole: () => true, getProperty: name => saved[name] || '', setProperty: (name, value) => { saved[name] = value; } },
        GlideRecordSecure: function (table) {
            this.get = (_field, name) => table === 'sys_properties' && name === 'monaco.plus.record_limit';
            this.getValue = field => field === 'type' ? 'integer' : field === 'max_length' ? '4000' : '';
            this.addQuery = this.setLimit = this.query = () => { };
            this.next = () => table === 'sys_dictionary';
        },
    });
    let params = { property_name: 'glide.servlet.uri', property_value: 'bad' };
    api.getParameter = key => params[key];
    assert.equal(api.saveProperty().success, false);
    params = { property_name: 'monaco.plus.update_sets.markdown_groups', property_value: '{}' };
    assert.equal(api.saveProperty().success, false);
    params = { property_name: 'monaco.plus.record_limit', property_value: 'many' };
    assert.equal(api.saveProperty().success, false);
    params.property_value = '250';
    assert.equal(api.saveProperty().value, '250');
    assert.deepEqual(saved, { 'monaco.plus.record_limit': '250' });
});

test('combined hierarchy rejects cycles, duplicate parents and unknown tables before writing', () => {
    const { api, saved } = groupServer();
    for (const config of [{ a: ['b'], b: ['a'] }, { a: ['c'], b: ['c'] }, { a: ['b', 'b'] }, { a: ['a'] }, { a: ['missing'] }]) {
        api.getParameter = () => JSON.stringify(config);
        assert.equal(api.saveRules().success, false);
        assert.deepEqual(saved, {});
    }
});

test('related table discovery excludes scripts, dot walks and unrelated references', () => {
    const fixtures = {
        sys_ui_related_list: [
            { sys_id: 'default', name: 'sc_cat_item', view: 'Default view', sys_user: '' },
            { sys_id: 'personal', name: 'sc_cat_item', view: 'Default view', sys_user: 'someone' },
            { sys_id: 'other', name: 'sc_cat_item', view: 'Other view', sys_user: '' },
        ],
        sys_ui_related_list_entry: [
            { list_id: 'default', related_list: 'catalog_ui_policy.catalog_item' },
            { list_id: 'default', related_list: 'catalog_ui_policy.catalog_item' },
            { list_id: 'default', related_list: 'REL:scripted' },
            { list_id: 'default', related_list: 'child.parent.name' },
            { list_id: 'default', related_list: 'unrelated.owner' },
            { list_id: 'personal', related_list: 'private_table.parent' },
            { list_id: 'other', related_list: 'other_table.parent' },
        ],
        sys_dictionary: [
            { name: 'catalog_ui_policy', element: 'catalog_item', internal_type: 'reference', reference: 'sc_cat_item' },
            { name: 'unrelated', element: 'owner', internal_type: 'reference', reference: 'sys_user' },
        ],
    };
    const { api } = server({
        GlideRecordSecure: function (table) {
            let rows = fixtures[table] || [], index = -1;
            this.addQuery = (field, op, value) => {
                rows = rows.filter(row => op === 'IN' ? value.split(',').includes(row[field]) : row[field] === op);
            };
            this.setLimit = this.query = () => { };
            this.next = () => ++index < rows.length;
            this.getValue = field => rows[index][field];
            this.getUniqueValue = () => rows[index].sys_id;
        }
    });
    api._hierarchyNames = table => [table];
    api._tableLabel = () => 'Catalog policies';
    assert.deepEqual(JSON.parse(JSON.stringify(api._relatedTables('sc_cat_item'))),
        [{ table: 'catalog_ui_policy', field: 'catalog_item', label: 'Catalog policies' }]);
    assert.equal(api.getRelatedTables().error, 'Admin role required.');
});

test('member pages include forced records and validated live or customer-update URLs', () => {
    const setId = 'a'.repeat(32), targetId = 'b'.repeat(32), updateId = 'c'.repeat(32);
    function run(exists) {
        const { api } = server({
            GlideRecordSecure: function (table) {
                this._returned = 0;
                this.isValid = () => true;
                this.get = id => table === 'sys_update_set' ? id === setId : table === 'u_forced_record' && exists && id === targetId;
                this.addQuery = this.orderByDesc = () => { };
                this.chooseWindow = () => { };
                this.query = () => { };
                this.next = () => table === 'sys_update_xml' && !this._returned++;
                this.getUniqueValue = () => updateId;
                this.getValue = field => ({
                    name: 'u_forced_record_' + targetId, payload: '<record_update />',
                    action: 'INSERT_OR_UPDATE', update_set: setId, target_name: 'Forced title'
                })[field] || '';
            }
        });
        api.getParameter = key => ({ set_table: 'sys_update_set', set_id: setId, offset: '0' })[key];
        api._rules = () => ({ groups: [] });
        api._ancestors = () => ({ type: 'Forced Records', ancestors: [] });
        api._name = () => 'Forced title';
        api._isNewUpdate = (action, name, setTable, sourceSetId) => {
            assert.equal(action, 'INSERT_OR_UPDATE');
            assert.equal(name, 'u_forced_record_' + targetId);
            assert.equal(setTable, 'sys_update_set'); assert.equal(sourceSetId, setId);
            return true;
        };
        const result = api.getMemberPage();
        assert.equal(result.success, true);
        assert.equal(result.rows.length, 1);
        assert.equal(result.rows[0].name, 'Forced title');
        assert.equal(result.rows[0].isNew, true);
        return result.rows[0].url;
    }
    assert.equal(run(true), 'https://example.service-now.com/nav_to.do?uri=u_forced_record.do%3Fsys_id%3D' + targetId);
    assert.equal(run(false), 'https://example.service-now.com/nav_to.do?uri=sys_update_xml.do%3Fsys_id%3D' + updateId);
});

test('retrieved update sets return every member across pages', () => {
    const setId = 'a'.repeat(32);
    const updates = Array.from({ length: 101 }, (_, i) => ({
        id: i.toString(16).padStart(32, '0'), target: (i + 101).toString(16).padStart(32, '0'),
    }));
    const { api } = server({
        GlideRecordSecure: function (table) {
            let rows = [], index = 0, start = 0, end = 0;
            this.isValid = () => true;
            this.get = id => table === 'sys_remote_update_set' && id === setId;
            this.addQuery = this.orderByDesc = () => { };
            this.chooseWindow = (from, to) => { start = from; end = to; };
            this.query = () => { rows = updates.slice(start, end); index = 0; };
            this.next = () => table === 'sys_update_xml' && index < rows.length ? (this.row = rows[index++], true) : false;
            this.getUniqueValue = () => this.row.id;
            this.getValue = field => ({ name: 'u_record_' + this.row.target, payload: '<record_update />', target_name: 'Record ' + index })[field] || '';
        }
    });
    api._rules = () => ({ groups: [] });
    api._ancestors = () => ({ type: 'Records', ancestors: [] });
    api._name = (_record, _table, _id, _payload, fallback) => fallback;
    let offset = 0;
    const all = [];
    do {
        api.getParameter = key => ({ set_table: 'sys_remote_update_set', set_id: setId, offset: String(offset) })[key];
        const page = api.getMemberPage();
        assert.equal(page.success, true);
        all.push(...page.rows);
        if (!page.hasMore) break;
        offset = page.nextOffset;
    } while (true);
    assert.equal(all.length, 101);
    assert.equal(new Set(all.map(row => row.updateId)).size, 101);
    assert.equal(all[100].url, 'https://example.service-now.com/nav_to.do?uri=sys_update_xml.do%3Fsys_id%3D' + updates[100].id);
});

test('selected local and retrieved updates resolve to distinct whole sets', () => {
    const localId = 'a'.repeat(32), remoteId = 'b'.repeat(32);
    const localUpdate = 'c'.repeat(32), remoteUpdate = 'd'.repeat(32);
    const { api } = server({
        GlideRecordSecure: function (table) {
            let current = '';
            this.get = id => {
                current = id;
                return table === 'sys_update_xml' ? id === localUpdate || id === remoteUpdate :
                    (table === 'sys_update_set' && id === localId) || (table === 'sys_remote_update_set' && id === remoteId);
            };
            this.getValue = field => table === 'sys_update_xml' ? {
                update_set: current === localUpdate ? localId : '',
                remote_update_set: current === remoteUpdate ? remoteId : '',
            }[field] || '' : field === 'name' ? (table === 'sys_update_set' ? 'Local' : 'Retrieved') : '';
        }
    });
    api.getParameter = key => key === 'update_ids' ? [localUpdate, remoteUpdate, localUpdate].join(',') : '';
    const result = api.getSetsForUpdates();
    assert.equal(result.success, true);
    assert.deepEqual(Array.from(result.sets, set => set.table), ['sys_update_set', 'sys_remote_update_set']);
});

test('Markdown escapes names and renders policy actions under their policy', () => {
    const context = { Promise, navigator: {}, document: {}, alert: () => { }, console };
    vm.createContext(context);
    vm.runInContext(clientSource, context);
    const loaded = [{
        set: { name: 'Set [A]', url: 'https://example/set' }, rows: [{
            table: 'catalog_ui_policy_action', id: 'c', type: 'Catalog UI Policy Actions',
            name: 'Show [field] (now)', url: 'https://example/nav_to.do?uri=action.do%3Fsys_id%3Dc', action: '',
            ancestors: [
                { table: 'sc_cat_item_producer', id: 'a', type: 'Record Producers', name: 'Producer', url: 'https://example/producer' },
                { table: 'catalog_ui_policy', id: 'b', type: 'Catalog UI Policies', name: 'Policy', url: 'https://example/policy' },
            ],
        }]
    }];
    const output = context._weMarkdownText(loaded, true);
    assert.ok(output.includes('- **Record Producers**'));
    assert.ok(output.includes('  - ↪ [Producer](https://example/producer)'));
    assert.ok(output.indexOf('Catalog UI Policies') < output.indexOf('Catalog UI Policy Actions'));
    assert.ok(output.includes('Show \\[field\\] \\(now\\)'));
    assert.ok(output.includes('action.do%3Fsys_id%3Dc'));
});

test('all loaded sets share a single deduplicated Markdown tree', () => {
    const context = { Promise, navigator: {}, document: {}, alert: () => { }, console };
    vm.createContext(context);
    vm.runInContext(clientSource, context);
    const row = { table: 'u_record', id: 'a', type: 'Records', name: 'One', url: 'https://example/one', ancestors: [] };
    const loaded = [
        { set: { name: 'First', url: 'https://example/first' }, rows: [row] },
        { set: { name: 'Second', url: 'https://example/second' }, rows: [row] },
    ];
    assert.equal(context._weMarkdownText(loaded, 'combined').match(/\[One\]/g).length, 1);
    const separate = context._weMarkdownText(loaded, 'separate');
    assert.equal(separate.match(/\[One\]/g).length, 1);
});

test('record types are alphabetical regardless of saved rule order', () => {
    const context = { Promise, navigator: {}, document: {}, alert: () => { }, console };
    vm.createContext(context);
    vm.runInContext(clientSource, context);
    const rows = [
        { table: 'ordinary', id: '1', type: 'A ordinary', name: 'Ordinary', url: '', ancestors: [] },
        { table: 'second', id: '2', type: 'Second rule', typeOrder: 1, name: 'Second', url: '', ancestors: [] },
        { table: 'first', id: '3', type: 'First rule', typeOrder: 0, name: 'First', url: '', ancestors: [] },
    ];
    const output = context._weMarkdownRender(context._weMarkdownTree(rows), 0);
    assert.deepEqual(Array.from(output.filter(line => line.startsWith('- **'))),
        ['- **A ordinary**', '- **First rule**', '- **Second rule**']);
});

test('list export ignores selected rows and parent form IDs and includes fixed filters', async () => {
    const calls = [], copied = [], errors = [];
    const query = 'update_set=' + 'a'.repeat(32) + '^type=Widget';
    const list = {
        getTableName: () => 'sys_update_xml',
        getChecked: () => { throw Error('Selection must not be read'); },
        getQuery: options => { assert.equal(options.fixed, true); return query; },
    };
    const context = {
        Promise, navigator: {}, document: {}, alert: message => errors.push(message),
        g_list: list, rowSysId: 'b'.repeat(32), g_sysId: 'c'.repeat(32),
        GlideUINotification: function (note) { if (note.type === 'error') errors.push(note.text); }, NOW: { CustomEvent: { fireTop: () => { } } }
    };
    vm.createContext(context);
    vm.runInContext(clientSource, context);
    context._weMarkdownAjax = async (method, params) => {
        calls.push({ method, ...params });
        return {
            rows: [{
                table: 'sp_widget', id: String(params.offset), type: 'Widgets',
                name: 'Widget ' + params.offset, url: '', ancestors: []
            }],
            hasMore: params.offset === 0, nextOffset: 100
        };
    };
    context._weWriteMarkdownClipboard = async value => copied.push(value);
    await context.copyUpdateSetMarkdownPlus();
    assert.deepEqual(calls, [
        { method: 'getListPage', list_query: query, offset: 0 },
        { method: 'getListPage', list_query: query, offset: 100 },
    ]);
    assert.match(copied[0], /Widget 0/);
    assert.match(copied[0], /Widget 100/);
    // The Related Links placement has no g_list.
    delete context.g_list;
    context.GlideLists2 = { updates: list };
    await context.copyUpdateSetMarkdownPlus();
    assert.equal(copied.length, 2);
    assert.deepEqual(errors, []);
    delete context.GlideLists2;
    await context.copyUpdateSetMarkdownPlus();
    assert.equal(calls.length, 4, 'missing list must not export the entire table');
    assert.match(errors[0], /list could not be found/);
});

test('filtered list export pages through all matching updates without expanding their sets', () => {
    const setId = 'a'.repeat(32), query = 'update_set=' + setId + '^type=Widget';
    const records = Array.from({ length: 102 }, (_, i) => ({
        id: i.toString(16).padStart(32, '0'), type: i === 101 ? 'Other' : 'Widget',
    }));
    const { api } = server({
        GlideRecordSecure: function (table) {
            if (table === 'sys_update_set') return { get: id => id === setId, getValue: () => 'Filtered set' };
            assert.equal(table, 'sys_update_xml');
            let filter, start, end, rows, index = 0;
            this.addEncodedQuery = value => { filter = value; };
            this.orderByDesc = () => { };
            this.chooseWindow = (from, to) => { start = from; end = to; };
            this.query = () => {
                assert.equal(filter, query);
                rows = records.filter(row => row.type === 'Widget').slice(start, end);
            };
            this.next = () => index < rows.length ? (this.row = rows[index++], true) : false;
            this.getUniqueValue = () => this.row.id;
            this.getValue = field => ({ update_set: setId, target_name: 'Widget', name: 'Widget' })[field] || '';
        }
    });
    api._rules = () => ({ groups: [] });
    api._target = () => null;
    const rows = [];
    for (const offset of [0, 100]) {
        api.getParameter = key => ({ list_query: query, offset: String(offset) })[key];
        const page = api.getListPage();
        assert.equal(page.success, true);
        assert.equal(page.hasMore, offset === 0);
        rows.push(...page.rows);
    }
    assert.equal(rows.length, 101);
    assert.ok(rows.every(row => row.sourceSet.name === 'Filtered set' && row.sourceSet.id === setId));
    assert.equal(new Set(rows.map(row => row.id)).size, 101);
    assert.ok(!rows.some(row => row.id === records[101].id));
    api.getParameter = key => key === 'offset' ? '0' : null;
    assert.equal(api.getListPage().success, false);
});

test('clipboard success and failures use notifications without a fallback', async () => {
    for (const outcome of ['success', 'denied', 'missing', 'throws']) {
        const notifications = [];
        const context = {
            Promise,
            navigator: outcome === 'missing' ? {} : {
                clipboard: {
                    writeText: () => {
                        if (outcome === 'throws') throw Error('Clipboard error');
                        return outcome === 'denied' ? Promise.reject(Error('Not allowed')) : Promise.resolve();
                    }
                }
            },
            document: new Proxy({}, { get() { throw Error('No clipboard DOM fallback allowed'); } }),
            GlideUINotification: function (note) { Object.assign(this, note); },
            NOW: { CustomEvent: { fireTop: (event, note) => notifications.push({ event, ...note }) } },
        };
        vm.createContext(context);
        vm.runInContext(clientSource, context);
        context._weLoadMarkdownList = async () => {
            assert.equal(notifications.length, 1, 'show progress before loading the export');
            assert.equal(notifications[0].event, 'glide:ui_notification.info');
            assert.equal(notifications[0].text, 'Preparing Markdown export… Keep page in focus.');
            return { rows: [{ table: 'sp_widget', id: 'a', type: 'Widgets', name: 'Widget', ancestors: [] }] };
        };
        await context.copyUpdateSetMarkdownPlus({ getTableName: () => 'sys_update_xml', getQuery: () => '' });
        assert.equal(notifications.length, 2);
        const type = outcome === 'success' ? 'info' : 'error';
        assert.equal(notifications[1].event, 'glide:ui_notification.' + type);
        assert.equal(notifications[1].type, type);
        assert.equal(notifications[1].text, outcome === 'success' ? 'Markdown copied to clipboard' :
            'Copy to clipboard failed. Ensure browser permissions allow clipboard access.');
    }
});

test('record markers and global deduplication preserve one canonical parent and latest status', () => {
    const context = { Promise };
    vm.createContext(context);
    vm.runInContext(clientSource, context);
    const parent = { table: 'sp_widget', id: 'p', type: 'Widgets', name: 'Parent', url: '/parent' };
    const rows = [
        { ...parent, ancestors: [], action: 'DELETE', updateId: 'newest' },
        { table: 'sp_ng_template', id: 'c', type: 'Templates', name: 'Child', url: '/child', isNew: true, ancestors: [parent] },
        { ...parent, ancestors: [], action: 'INSERT_OR_UPDATE', updateId: 'older' },
        { table: 'sp_ng_template', id: 'c', type: 'Templates', name: 'Old child', ancestors: [] },
    ];
    const output = context._weMarkdownText([{ rows: rows.slice(0, 2) }, { rows: rows.slice(2) }], 'combined');
    assert.equal((output.match(/\[Parent\]/g) || []).length, 1);
    assert.equal((output.match(/\[Child\]/g) || []).length, 1);
    assert.ok(output.includes('~~[Parent](/parent)~~ 🚮'));
    assert.ok(output.includes('[Child](/child) 🆕'));
    assert.ok(!output.includes('Old child'));
    // Explicit parent updates also win when they follow the child in the list.
    const reversed = context._weMarkdownText([{ rows: [rows[1], rows[0]] }], 'combined');
    assert.equal((reversed.match(/\[Parent\]/g) || []).length, 1);
    assert.ok(reversed.includes('~~[Parent](/parent)~~ 🚮'));
    const annotated = context._weMarkdownRender(context._weMarkdownTree(rows.slice(0, 2).map(row => ({
        ...row, secondary: ['extra', 'details'], setMarkers: [1, 2],
    }))), 0).join('\n');
    assert.ok(annotated.includes('~~[Parent](/parent)~~ (extra, details) 🚮 1️⃣ 2️⃣'));
    assert.ok(annotated.includes('[Child](/child) (extra, details) 🆕 1️⃣ 2️⃣'));
});

test('entirely new branches show one new marker while mixed branches retain individual markers', () => {
    const context = {}; vm.createContext(context); vm.runInContext(clientSource, context);
    const parent = { table: 'parent', id: 'p', type: 'Parents', name: 'Parent', isNew: true };
    const child = { table: 'child', id: 'c', type: 'Children', name: 'Child', isNew: true };
    const grandchild = { table: 'leaf', id: 'g', type: 'Leaves', name: 'Grandchild', isNew: true };
    const sibling = { table: 'other', id: 's', type: 'Others', name: 'Sibling', isNew: true };
    function render(leaf = grandchild, root = parent) {
        return context._weMarkdownRender(context._weMarkdownTree([
            { ...root, ancestors: [] }, { ...child, ancestors: [root], secondary: ['extra'], setMarkers: [1] },
            { ...leaf, ancestors: [root, child] }, { ...sibling, ancestors: [root] },
        ]), 0).join('\n');
    }
    const allNew = render();
    assert.ok(allNew.includes('Parent 🆕'));
    assert.ok(allNew.includes('Child (extra) 1️⃣'));
    assert.equal((allNew.match(/🆕/g) || []).length, 1);
    for (const leaf of [{ ...grandchild, isNew: false }, { ...grandchild, action: 'DELETE' }]) {
        const mixed = render(leaf);
        assert.ok(mixed.includes('Parent 🆕'));
        assert.ok(mixed.includes('Child (extra) 🆕 1️⃣'));
        assert.ok(mixed.includes('Sibling 🆕'));
        if (leaf.action === 'DELETE') assert.ok(mixed.includes('~~Grandchild~~ 🚮'));
    }
    const existingParent = render(grandchild, { ...parent, isNew: false });
    assert.ok(!existingParent.includes('Parent 🆕'));
    assert.ok(existingParent.includes('Child (extra) 🆕 1️⃣'));
    assert.ok(!existingParent.includes('Grandchild 🆕'));
    assert.ok(existingParent.includes('Sibling 🆕'));
});

test('new markers follow the first update set across repeated edits and later sets', () => {
    const captures = [
        { name: 'widget_a', sys_id: '1', sys_created_on: '2026-01-01', update_set: 'original' },
        { name: 'widget_a', sys_id: '2', sys_created_on: '2026-01-02', update_set: 'original' },
        { name: 'widget_a', sys_id: '3', sys_created_on: '2026-01-03', update_set: 'later' },
        { name: 'widget_b', sys_id: '4', sys_created_on: '2026-01-01', remote_update_set: 'imported' },
        { name: 'widget_b', sys_id: '5', sys_created_on: '2026-01-02', update_set: 'local' },
        { name: 'widget_c', sys_id: '6', sys_created_on: '2026-01-01' },
    ];
    let queries = 0;
    const { api } = server({
        GlideRecordSecure: function (table) {
            assert.equal(table, 'sys_update_xml');
            let rows = captures.slice().reverse(), index = -1, limit = Infinity;
            const order = [];
            this.addQuery = (field, value) => { rows = rows.filter(row => row[field] === value); };
            this.orderBy = field => order.push(field);
            this.setLimit = value => { limit = value; };
            this.query = () => {
                queries++; rows.sort((a, b) => {
                    for (const field of order) { const comparison = a[field].localeCompare(b[field]); if (comparison) return comparison; }
                    return 0;
                }); rows = rows.slice(0, limit);
            };
            this.next = () => ++index < rows.length;
            this.getValue = field => rows[index][field] || '';
        }
    });
    assert.equal(api._isNewUpdate('INSERT_OR_UPDATE', 'widget_a', 'sys_update_set', 'original'), true);
    assert.equal(api._isNewUpdate('INSERT_OR_UPDATE', 'widget_a', 'sys_update_set', 'original'), true);
    assert.equal(api._isNewUpdate('INSERT', 'widget_a', 'sys_update_set', 'later'), false);
    assert.equal(queries, 1, 'history is cached per target for each request');
    assert.equal(api._isNewUpdate('DELETE', 'widget_a', 'sys_update_set', 'original'), false);
    assert.equal(api._isNewUpdate('INSERT_OR_UPDATE', 'widget_b', 'sys_remote_update_set', 'imported'), true);
    assert.equal(api._isNewUpdate('INSERT_OR_UPDATE', 'widget_b', 'sys_update_set', 'local'), false);
    assert.equal(api._isNewUpdate('INSERT', 'missing', 'sys_update_set', 'original'), false);
    assert.equal(api._isNewUpdate('INSERT', 'widget_c', 'sys_update_set', 'original'), false);
    assert.equal(api._isNewUpdate('INSERT', 'widget_a', 'sys_update_set', ''), false);
});

test('insert actions cannot bypass the server history decision for new markers', () => {
    const context = {}; vm.createContext(context); vm.runInContext(clientSource, context);
    const output = context._weMarkdownText([{
        rows: [
            { table: 'widget', id: 'a', type: 'Widgets', name: 'Existing', action: 'INSERT', isNew: false },
            { table: 'widget', id: 'b', type: 'Widgets', name: 'New with edits', action: 'INSERT_OR_UPDATE', isNew: true },
        ]
    }]);
    assert.ok(output.includes('Existing'));
    assert.ok(!output.includes('Existing 🆕'));
    assert.ok(output.includes('New with edits 🆕'));
});

test('UI placements and admin-only properties page are declared', () => {
    const copy = fs.readFileSync('src/fluent/generated/server-development/ui-action/sys_ui_action_widget_editor_markdown_copy.now.ts', 'utf8');
    const editor = fs.readFileSync('src/fluent/generated/security/access-control/sys_security_acl_widget_editor_plus_properties.now.ts', 'utf8');
    const page = fs.readFileSync('src/fluent/generated/other/sys-ui-page/sys_ui_page_widget_editor_plus_properties.now.ts', 'utf8');
    const module = fs.readFileSync('src/fluent/generated/user-interface/module/sys_app_module_widget_editor_properties.now.ts', 'utf8');
    const client = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus_properties.client.js', 'utf8');
    const property = fs.readFileSync('src/fluent/generated/properties/system-property/sys_properties_widget_editor_assistant_markdown_groups.now.ts', 'utf8');
    assert.match(copy, /showListChoice: true, showContextMenu: true, showLink: true/);
    assert.match(copy, /roles: \['sp_admin'\]/);
    assert.equal(fs.existsSync('src/fluent/generated/server-development/ui-action/sys_ui_action_widget_editor_markdown_configure.now.ts'), false);
    const menu = fs.readFileSync('src/fluent/generated/user-interface/context-menu/sys_ui_context_menu_widget_editor_markdown.now.ts', 'utf8');
    assert.match(menu, /menu: 'list_header'/);
    assert.match(menu, /table: 'sys_update_xml'/);
    assert.match(menu, /copyUpdateSetMarkdownPlus\(g_list\)/);

    assert.match(editor, /roles: \['admin'\]/);
    assert.match(editor, /gs.hasRole\("admin"\)/);
    assert.equal(fs.existsSync('src/fluent/generated/other/sys-ui-page/sys_ui_page_widget_editor_assistant_markdown_options.now.ts'), false);
    assert.match(page, /widget_editor_plus_properties\.do/);
    const jelly = page.match(/html: `([\s\S]*?)`,\s*clientScript:/)?.[1];
    assert.ok(jelly, 'properties page Jelly markup is declared');
    const styles = jelly.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.doesNotMatch(styles, />|&gt;/,
        'Jelly escapes child combinators in style text; use descendant selectors so header offsets apply');
    assert.doesNotMatch(jelly, /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i,
        'Jelly markup must escape ampersands');
    assert.match(page, /container-fluid wep-app/);
    assert.match(page, /id="wep-nav" class="wep-nav"/);
    assert.match(client, /el\('a', 'btn btn-default wep-feature-pill'\)/);
    assert.match(page, /--now-color_background--primary/);
    assert.match(page, /--now-color_text--primary/);
    assert.match(page, /monaco\.bundle\.min\.jsx/);
    assert.match(page, /textarea\.wep-value\s*\{[^}]*max-height:50vh/s);
    assert.match(page, /textarea\.wep-json-fallback\[hidden\]\s*\{\s*display:none !important;/);
    assert.match(module, /ui_page\.do\?sys_id=47cb4ac08e0d4437b5c0a482d8411e30/);
    assert.match(client, /Widget Editor\+'/);
    assert.match(client, /Assistant\+'/);
    assert.match(client, /Export Markdown\+/);
    assert.match(client, /Code Search\+'/);
    assert.match(client, /saveRules/);
    assert.match(client, /panel panel-default wep-card/);
    assert.match(client, /form-control wep-value/);
    assert.match(client, /panel-title wep-property-name/);
    assert.doesNotMatch(client, /function title\(/);
    assert.match(client, /language: 'json'/);
    assert.match(client, /monaco\.editor\.create\(host/);
    assert.match(client, /input\.scrollHeight/);
    assert.match(client, /window\.innerHeight \* 0\.5/);
    assert.match(property, /write: \['admin'\]/);
});

[false, true].forEach(repair => test(repair ? 'invalid saved hierarchy opens as JSON and can be repaired' : 'JSON property renders one visible editor and grows only to half the viewport', async () => {
    const source = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus_properties.client.js', 'utf8');
    class Node {
        constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.className = ''; this._text = ''; }
        set textContent(value) { this._text = value; this.children = []; }
        get textContent() { return this._text; }
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
        insertBefore(child, before) { child.parentNode = this; this.children.splice(this.children.indexOf(before), 0, child); }
        setAttribute(name, value) { (this.attributes ||= {})[name] = value; }
        getAttribute(name) { return (this.attributes || {})[name]; }
        focus() { }
        remove() { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); }
        querySelector(selector) {
            return selector === 'textarea, [role="textbox"]' ? this.children.find(child => child.tagName === 'TEXTAREA') : null;
        }
        querySelectorAll(selector) {
            const wanted = selector.slice(1), found = [];
            function visit(node) {
                node.children.forEach(child => {
                    if (child.className.split(' ').includes(wanted)) found.push(child);
                    visit(child);
                });
            }
            visit(this);
            return found;
        }
    }
    const roots = Object.fromEntries(['wep-sections', 'wep-nav', 'wep-message', 'wep-search', 'wep-table-options']
        .map(id => [id, new Node('div')]));
    roots['wep-search'].value = '';
    const frames = [], listeners = {}, modals = [];
    const jq = node => mockBootstrapModal(node, modals); jq.fn = { modal() { } };
    let contentHeight = 40, contentChanged, modelChanged, editorValue = '{"color":"red"}';
    const editor = {
        getValue: () => editorValue, setValue(value) { editorValue = value; }, getContentHeight: () => contentHeight,
        onDidChangeModelContent(callback) { modelChanged = callback; }, onDidContentSizeChange: callback => { contentChanged = callback; },
        layout() { }, dispose() { }, onDidFocusEditorText() { }
    };
    const window = {
        $j: jq, innerHeight: 300, location: { origin: 'https://example.service-now.com' },
        requestAnimationFrame: callback => frames.push(callback), addEventListener: (name, callback) => { listeners[name] = callback; },
        getComputedStyle: () => ({ getPropertyValue: () => '255 255 255' }),
        monaco: {
            editor: {
                create: host => {
                    const field = new Node('textarea');
                    field.setAttribute('aria-describedby', 'monaco-help');
                    host.appendChild(field);
                    return editor;
                }
            }
        }
    };
    const document = {
        body: new Node('body'), readyState: 'complete', documentElement: new Node('html'),
        getElementById: id => roots[id], createElement: tag => new Node(tag)
    };
    let savedHierarchy = repair ? { a: ['b'], c: ['b'] } : { a: ['b'] }, lastHierarchySave;
    function GlideAjax() {
        const params = {};
        this.addParam = (name, value) => { params[name] = value; };
        this.getXMLAnswer = callback => {
            let result = { success: true };
            if (params.sysparm_name === 'getProperties') result.properties = [{
                name: 'monaco.plus.css.variables', value: '{"color":"red"}', description: '', type: 'string', updatedOn: '2026-09-27 01:23:45',
            }, {
                name: 'monaco.plus.update_sets.markdown_groups', value: JSON.stringify(savedHierarchy),
                description: 'Update set Markdown grouping rules', type: 'string', updatedByTable: { a: '2026-09-27 02:34:56' },
            }];
            if (params.sysparm_name === 'getRules') {
                const config = params.rules ? JSON.parse(params.rules) : savedHierarchy;
                const { api } = groupServer();
                try { result = { success: true, config, rules: api._buildGroupRules(config) }; }
                catch (error) { result = { success: false, error: error.message }; }
            }
            if (params.sysparm_name === 'saveRules') {
                lastHierarchySave = JSON.parse(params.rules);
                savedHierarchy = lastHierarchySave;
            }
            callback(JSON.stringify(result));
        };
    }
    const context = {
        window, document, GlideAjax, Promise, Blob: function () { }, Worker: function () { }, URL,
        setTimeout, clearTimeout, console
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    await new Promise(resolve => setImmediate(resolve));
    while (frames.length) frames.shift()();
    if (repair) {
        function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
        const hierarchy = roots['wep-sections'].querySelectorAll('.wep-card').find(card => card._prop.name === 'monaco.plus.update_sets.markdown_groups');
        const jsonPanel = hierarchy.querySelectorAll('.wep-hierarchy-json')[0];
        const save = descendants(hierarchy).find(node => node.tagName === 'BUTTON' && node.textContent === 'Save property');
        const revert = descendants(hierarchy).find(node => node.tagName === 'BUTTON' && node.textContent === 'Revert');
        const toggle = descendants(hierarchy).find(node => node.tagName === 'BUTTON' && node.textContent === 'Switch to UI');
        const json = hierarchy.querySelectorAll('.wep-json-fallback')[0];
        assert.equal(jsonPanel.hidden, false);
        assert.deepEqual(JSON.parse(json.value), savedHierarchy);
        assert.equal(save.disabled, true);
        for (const config of [{ a: ['b', 'b'] }, { a: ['b'], c: ['b'] }, { a: ['b'], b: ['a'] }, { a: ['a'] }]) {
            json.value = JSON.stringify(config); json.oninput();
            assert.equal(save.disabled, true);
        }
        json.value = '{"a":["b"],"b":["c"]}'; json.oninput();
        assert.equal(save.disabled, false, 'a child can have children of its own');
        revert.onclick(); await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(JSON.parse(json.value), savedHierarchy);
        assert.equal(revert.hidden, true);
        json.value = '{"a":["b"],"b":["c"]}'; json.oninput();
        toggle.onclick({ preventDefault() { } }); await new Promise(resolve => setImmediate(resolve));
        assert.equal(jsonPanel.hidden, true);
        save.onclick(); modalButton(modals.at(-1), 'Remove').onclick();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(lastHierarchySave, { a: ['b'], b: ['c'] });
        assert.equal(save.disabled, true);
        return;
    }
    assert.deepEqual(roots['wep-sections'].children.map(section => section.getAttribute('data-feature')),
        ['Widget Editor+', 'Assistant+', 'Code Search+', 'Export Markdown+']);
    const card = roots['wep-sections'].querySelectorAll('.wep-card')[0];
    const title = card.querySelectorAll('.wep-property-name')[0];
    const fallback = card.querySelectorAll('.wep-json-fallback')[0];
    const host = card.querySelectorAll('.wep-monaco')[0];
    assert.equal(title.textContent, 'monaco.plus.css.variables');
    const updated = card.querySelectorAll('.wep-updated-pill')[0];
    assert.equal(updated.textContent, 'Updated ' + new Date('2026-09-27T01:23:45Z').toLocaleDateString() + ' ' + new Date('2026-09-27T01:23:45Z').toLocaleTimeString());
    assert.equal(updated.getAttribute('datetime'), '2026-09-27T01:23:45.000Z');
    assert.equal(fallback.hidden, true);
    assert.equal(fallback.style.display, 'none');
    const counter = card.querySelectorAll('.wep-character-count')[0];
    assert.equal(counter.tagName, 'SMALL');
    assert.equal(counter.getAttribute('aria-label'), undefined);
    assert.equal(fallback.getAttribute('aria-describedby'), counter.id);
    assert.equal(host.children[0].getAttribute('aria-describedby'), 'monaco-help ' + counter.id);
    assert.equal(counter.textContent, '15 / 4000');
    editorValue = 'x'.repeat(4001);
    modelChanged();
    assert.equal(counter.textContent, '4001 / 4000');
    assert.match(counter.className, /text-danger/);
    editorValue = '{}';
    modelChanged();
    assert.equal(counter.textContent, '2 / 4000');
    assert.doesNotMatch(counter.className, /text-danger/);

    assert.equal(host.style.height, '76px');
    contentHeight = 260;
    contentChanged();
    assert.equal(host.style.height, '150px');
    window.innerHeight = 800;
    listeners.resize();
    assert.equal(host.style.height, '262px');
    // The hierarchy remains one editor, with the same Save/Revert actions as other properties.
    window.monaco = null;
    const hierarchy = roots['wep-sections'].querySelectorAll('.wep-card').find(card => card._prop.name === 'monaco.plus.update_sets.markdown_groups');
    function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
    const save = descendants(hierarchy).find(node => node.tagName === 'BUTTON' && node.textContent === 'Save property');
    const revert = descendants(hierarchy).find(node => node.tagName === 'BUTTON' && node.textContent === 'Revert');
    assert.ok(save && revert);
    assert.equal(hierarchy.querySelectorAll('.wep-character-count').length, 0);
    assert.equal(hierarchy.querySelectorAll('.wep-updated-pill').length, 0);
    const rowTime = hierarchy.querySelectorAll('.wep-updated-cell')[0].children[0];
    assert.deepEqual(rowTime.children.map(node => node.tagName), ['SPAN', 'BR', 'SPAN']);
    assert.equal(rowTime.children[0].textContent, new Date('2026-09-27T02:34:56Z').toLocaleDateString());
    assert.equal(rowTime.children[2].textContent, new Date('2026-09-27T02:34:56Z').toLocaleTimeString());
    assert.equal(revert.hidden, true);
    assert.equal(descendants(hierarchy).some(node => node.textContent === 'Save hierarchy'), false);
    const toggle = descendants(hierarchy).find(node => node.tagName === 'BUTTON' && node.textContent === 'Switch to JSON');
    toggle.onclick({ preventDefault() { } });
    const json = hierarchy.querySelectorAll('.wep-json-fallback')[0];
    assert.deepEqual(JSON.parse(json.value), { a: ['b'] });
    assert.equal(hierarchy.querySelectorAll('.wep-character-count').length, 0);
    json.value = '{"a":["c"]}'; json.oninput();
    assert.equal(save.disabled, false);
    assert.equal(revert.hidden, false);
    json.value = '{ "a": ["b"] }'; json.oninput();
    assert.equal(revert.hidden, true, 'restoring the saved configuration manually clears changes');
    json.value = '{"a":["c"]}'; json.oninput();
    revert.onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(JSON.parse(json.value), { a: ['b'] });
    assert.equal(hierarchy.querySelectorAll('.wep-character-count').length, 0);
    assert.equal(save.disabled, true);
    assert.equal(revert.hidden, true);
    json.value = '{"b":["c"]}'; json.oninput(); save.onclick();
    assert.equal(lastHierarchySave, undefined);
    assert.equal(modals.length, 1);
    modalButton(modals.at(-1), 'Cancel').onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(lastHierarchySave, undefined);
    assert.equal(save.disabled, false);
    save.onclick(); modalButton(modals.at(-1), 'Remove').onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(lastHierarchySave, { b: ['c'] });
    assert.equal(revert.hidden, true);
    json.value = '{bad'; json.oninput();
    assert.equal(save.disabled, true);
    revert.onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(JSON.parse(json.value), { b: ['c'] });
    json.value = '{"b":["c"],"c":["d"]}'; json.oninput();
    const count = hierarchy.parentNode.querySelectorAll('.wep-section-count')[0];
    assert.equal(count.textContent, '1 property');
    save.onclick(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(count.textContent, '2 properties');

}));


test('export includes only explicitly configured children and ignores cleared properties', () => {
    const { api } = groupServer({ a: '["b"]', b: '', c: '' });
    const calls = [];
    api._referenceField = (parent, child) => { calls.push([parent, child]); return 'parent'; };
    const rules = api._rules();
    assert.deepEqual(Array.from(rules.groups, node => node.table), ['a']);
    assert.deepEqual(Array.from(rules.groups[0].children, node => node.table), ['b']);
    assert.deepEqual(calls, [['a', 'b']]);
});

test('unlisted tables do not inherit grouping from a configured base table', () => {
    const { api } = server();
    api._tableLabel = table => table;
    api._hierarchyNames = () => { throw Error('Unexpected inherited grouping'); };
    const result = api._ancestors('sc_cat_item_producer', 'a'.repeat(32), '', {
        groups: [{ table: 'sc_cat_item', label: 'Catalog Items', children: [] }],
    });
    assert.equal(result.type, 'sc_cat_item_producer');
    assert.equal(result.ancestors.length, 0);
});

test('JSON property saves reject malformed JSON before writing', () => {
    let writes = 0;
    const { api } = server({
        gs: { hasRole: () => true, setProperty: () => { writes++; } },
        GlideRecordSecure: function () {
            this.get = () => true;
            this.getValue = field => field === 'value' ? '{"enabled":true}' : 'string';
        },
    });
    api.getParameter = key => key === 'property_name' ? 'monaco.plus.custom_json' : '{"enabled":';
    assert.equal(api.saveProperty().error, 'Invalid JSON.');
    assert.equal(writes, 0);
});

test('Table hierarchy saves reject malformed JSON before writing', () => {
    let writes = 0;
    const { api } = server({ gs: { hasRole: () => true, setProperty: () => { writes++; } } });
    api.getParameter = () => '{"version":1,"groups":[';
    assert.equal(api.saveRules().success, false);
    assert.equal(writes, 0);
});

test('property values enforce 4000 characters even when dictionary allows more', () => {
    let saved = '', value = 'x'.repeat(4000);
    const { api } = server({
        gs: { hasRole: () => true, setProperty: (_name, text) => { saved = text; }, getProperty: () => saved },
        GlideRecordSecure: function () {
            this.get = this.next = () => true;
            this.getValue = field => field === 'max_length' ? '10000' : field === 'type' ? 'string' : '';
            this.addQuery = this.setLimit = this.query = () => { };
        },
    });
    api.getParameter = key => key === 'property_name' ? 'monaco.plus.example' : value;
    assert.equal(api.saveProperty().success, true);
    assert.equal(saved.length, 4000);
    value += 'x';
    assert.equal(api.saveProperty().error, 'Property value exceeds 4000 characters.');
    assert.equal(saved.length, 4000);
});

test('hierarchy saves individual arrays exceeding 4000 characters', () => {
    const { api, saved } = groupServer();
    api._buildGroupRules = () => ({ groups: [] });
    const children = Array.from({ length: 120 }, (_, i) => 'table_' + String(i).padStart(50, 'a'));
    const config = { a: children, b: children.map(name => name + 'b') };
    assert.ok(JSON.stringify(config).length > 4000);
    api.getParameter = () => JSON.stringify(config);
    assert.equal(api.saveRules().success, true);
    assert.ok(Object.values(saved).every(value => value.length > 4000));
    assert.deepEqual(JSON.parse(saved[api.GROUPS_PREFIX + 'a']), children);
    const snapshot = JSON.stringify(saved);
    api.getParameter = () => JSON.stringify({ a: ['invalid table'] });
    assert.equal(api.saveRules().success, false);
    assert.equal(JSON.stringify(saved), snapshot);
});

function displayServer() {
    const roleId = 'b'.repeat(32);
    const schema = {
        sys_security_acl_role: { sys_user_role: 'sys_user_role', name: '' },
        sys_user_role: { name: '', description: '', secret: '', level: '' }
    };
    const records = {
        sys_security_acl_role: { ['a'.repeat(32)]: { sys_user_role: roleId, name: 'Original' } },
        sys_user_role: { [roleId]: { name: 'Friendly [role]', description: 'Read | write', secret: 'hidden', level: '0' } }
    };
    const config = {
        sys_security_acl_role: {
            display: 'sys_user_role',
            secondary: ['sys_user_role.description', 'sys_user_role.secret', 'sys_user_role.level']
        }
    };
    let writes = 0;
    const result = server({
        gs: {
            hasRole: () => true, getProperty: name => name.endsWith('markdown_display') ? JSON.stringify(config) : '',
            setProperty: () => { writes++; }
        },
        GlideRecordSecure: function (table) {
            let data = {};
            this.addQuery = this.setLimit = this.query = () => { };
            this.next = () => false;
            this.isValid = () => !!schema[table];
            this.isValidField = field => !!schema[table] && field in schema[table];
            this.get = (key, value) => {
                if (table === 'sys_properties') return true;
                data = records[table]?.[key] || {};
                return !!records[table]?.[key];
            };
            this.getElement = field => ({
                canRead: () => field !== 'secret', getED: () => ({
                    getInternalType: () => schema[table][field] ? 'reference' : 'string',
                    getReference: () => schema[table][field],
                })
            });
            this.getValue = field => table === 'sys_properties' ? (field === 'value' ? '{}' : 'string') : data[field] || '';
            this.getDisplayValue = field => table === 'sys_security_acl_role' && field === 'sys_user_role' ? 'Friendly [role]' : data[field] || '';
        },
    });
    return { ...result, writes: () => writes };
}

test('primary fields validate period joins and additional fields validate reference dot walks', () => {
    const { api, writes } = displayServer();
    assert.equal(api._validateDisplayConfig({ sys_security_acl_role: { display: 'sys_user_role.name', secondary: ['name'] } }), '');
    for (const config of [
        { missing_table: { display: 'name' } },
        { sys_security_acl_role: { display: 'missing' } },
        { sys_security_acl_role: { display: 'name.description' } },
        { sys_security_acl_role: { display: 'sys_user_role.missing' } },
        { sys_security_acl_role: { display: 'name', secondary: ['sys_user_role.missing'] } },
        { sys_security_acl_role: { display: 'name', secondary: 'name' } },
    ]) {
        api.getParameter = key => key === 'property_name' ? 'monaco.plus.update_sets.markdown_display' : JSON.stringify(config);
        assert.equal(api.saveProperty().success, false);
    }
    assert.equal(writes(), 0);
    api.getParameter = key => key === 'property_name' ? 'monaco.plus.update_sets.markdown_display' :
        JSON.stringify({ sys_security_acl_role: { display: 'sys_user_role.name', secondary: ['name'] } });
    assert.equal(api.saveProperty().success, true);
    assert.equal(writes(), 2);
});

test('display export resolves additional dot walks securely and preserves secondary order', () => {
    const { api } = displayServer();
    const record = api._record('sys_security_acl_role', 'a'.repeat(32));
    assert.equal(api._name(record, 'sys_security_acl_role', 'a'.repeat(32), '', ''), 'Friendly [role]');
    assert.deepEqual(Array.from(api._secondaryValues(record, 'sys_security_acl_role', '')), ['Read | write', '0']);
    assert.equal(api._configuredValue(null, 'sys_security_acl_role', '<sys_user_role>' + 'b'.repeat(32) + '</sys_user_role>', 'sys_user_role.name'), 'Friendly [role]');
    assert.equal(api._configuredValue(null, 'sys_security_acl_role', '<sys_user_role>' + 'c'.repeat(32) + '</sys_user_role>', 'sys_user_role.name'), '');
    assert.equal(api._configuredValue(null, 'sys_security_acl_role', '<name>Deleted record</name>', 'name'), 'Deleted record');
});

test('Markdown names try ordered display fields before raw values and the normal name fallback', () => {
    const { api } = server();
    api._displayConfig = () => ({ display_value: 'first, second', additional_fields: '' });
    api._fieldPath = (_table, field) => [{ field }];
    api._displayField = () => ({ name: '' });
    let raw = {}, display = {}, readable = true;
    const record = {
        getElement: field => ({ canRead: () => field !== 'first' || readable }),
        getValue: field => raw[field], getDisplayValue: field => field ? display[field] : 'Normal record name'
    };
    function name() { return api._name(record, 'widget', 'id', '', ''); }
    display = { first: 'First', second: 'Second' }; assert.equal(name(), 'First');
    display.first = ''; assert.equal(name(), 'Second');
    raw.first = 'raw first'; assert.equal(name(), 'Second');
    display.second = ''; assert.equal(name(), 'raw first');
    raw = {}; assert.equal(name(), 'Normal record name');
    display = { first: 'Hidden', second: 'Readable' }; readable = false;
    assert.equal(name(), 'Readable');
    assert.equal(api._name(null, 'widget', 'id', '<first>raw first</first><second display_value="Second">raw second</second>', ''), 'Second');
    assert.equal(api._name(null, 'widget', 'id', '<second>raw second</second>', ''), 'raw second');
    assert.equal(api._name(null, 'widget', 'id', '', 'Target name'), 'Target name');
});

test('Variable defaults include type and additional values prefer display text with raw fallback', () => {
    const source = fs.readFileSync('src/fluent/generated/properties/system-property/sys_properties_widget_editor_markdown_display_item_option_new.now.ts', 'utf8');
    const config = JSON.parse(source.match(/value: `([\s\S]*?)`,/)[1]);
    assert.deepEqual(config, { display_value: 'name', additional_fields: 'type' });
    const { api } = server();
    api._displayConfig = () => config;
    api._fieldPath = (_table, field) => [{ field }];
    for (const [raw, display, expected] of [
        ['6', 'Single Line Text', ['Single Line Text']], ['6', '', ['6']],
        ['', 'Display only', ['Display only']], ['', '', []], [null, undefined, []],
        [0, '', ['0']], [false, null, ['false']],
    ]) {
        const record = { getElement: () => ({ canRead: () => true }), getValue: () => raw, getDisplayValue: () => display };
        assert.deepEqual(Array.from(api._secondaryValues(record, 'item_option_new', '')), expected);
    }
    for (const [payload, expected] of [
        ['<type display_value="Single Line Text">6</type>', ['Single Line Text']],
        ['<type>6</type>', ['6']], ['<type></type>', []], ['', []],
    ]) assert.deepEqual(Array.from(api._secondaryValues(null, 'item_option_new', payload)), expected);
});

test('Dictionary primary fields combine securely and skip empty values', () => {
    const source = fs.readFileSync('src/fluent/generated/properties/system-property/sys_properties_widget_editor_markdown_display_sys_dictionary.now.ts', 'utf8');
    const config = JSON.parse(source.match(/value: `([\s\S]*?)`,/)[1]);
    assert.deepEqual(config, { display_value: 'name.element', additional_fields: 'column_label,internal_type' });
    const { api } = server();
    api._displayConfig = () => config;
    api._fieldPath = (_table, field) => ['name', 'element', 'column_label', 'internal_type'].includes(field) ? [{ field }] : null;
    api._displayField = () => ({ name: '' });
    let readable = true, values = { name: 'incident', element: 'short_description' };
    const record = {
        getElement: field => ({ canRead: () => field !== 'element' || readable }),
        getValue: field => values[field], getDisplayValue: field => field ? values[field] : 'Fallback'
    };
    const name = () => api._name(record, 'sys_dictionary', 'id', '', '');
    assert.equal(name(), 'incident.short_description');
    readable = false; assert.equal(name(), 'incident');
    readable = true; values.element = ''; assert.equal(name(), 'incident');
    values = {}; assert.equal(name(), 'Fallback');
    assert.equal(api._name(null, 'sys_dictionary', 'id', '<name>incident</name><element>short_description</element>', ''), 'incident.short_description');
    assert.deepEqual(Array.from(api._secondaryValues(null, 'sys_dictionary',
        '<column_label>Short description</column_label><internal_type display_value="String">string</internal_type>')), ['Short description', 'String']);
    assert.equal(api._validateDisplayConfig({ sys_dictionary: config }), '');
    assert.ok(api._validateDisplayConfig({ sys_dictionary: { ...config, display_separator: 5 } }));
    assert.ok(api._validateDisplayConfig({ sys_dictionary: { ...config, display_value: 'name,missing' } }));
    for (const display_value of ['name.', '.name', 'name..element', 'name.element,']) {
        assert.ok(api._validateDisplayConfig({ sys_dictionary: { ...config, display_value } }));
    }
    assert.deepEqual(JSON.parse(JSON.stringify(api._normaliseDisplayConfig({
        display_value: 'name, element', display_separator: '.', additional_fields: 'column_label'
    }))), { display_value: 'name.element', additional_fields: 'column_label' });
    config.display_value = 'name,element'; values = { name: 'incident', element: 'number' };
    assert.equal(name(), 'incident');
});

test('Instance defaults show the widget only once, including raw and payload fallbacks', () => {
    const source = fs.readFileSync('src/fluent/generated/properties/system-property/sys_properties_widget_editor_markdown_display_sp_instance.now.ts', 'utf8');
    const config = JSON.parse(source.match(/value: `([\s\S]*?)`,/)[1]);
    assert.deepEqual(config, { display_value: 'name,sp_widget', additional_fields: 'sp_widget' });
    const { api } = server();
    api._displayConfig = () => config;
    api._fieldPath = (_table, field) => [{ field }];
    api._displayField = () => ({ name: 'name' });
    let values = { name: 'Instance', sp_widget: 'Widget' }, displays = values;
    const record = {
        getElement: () => ({ canRead: () => true }),
        getValue: field => values[field], getDisplayValue: field => displays[field] || ''
    };
    function render(current, payload = '') {
        const used = [];
        const name = api._name(current, 'sp_instance', 'id', payload, '', 0, used);
        return { name, secondary: Array.from(api._secondaryValues(current, 'sp_instance', payload, used)) };
    }
    assert.deepEqual(render(record), { name: 'Instance', secondary: ['Widget'] });
    values.name = ''; assert.deepEqual(render(record), { name: 'Widget', secondary: [] });
    displays = {}; assert.deepEqual(render(record), { name: 'Widget', secondary: [] });
    assert.deepEqual(render(null, '<sp_widget display_value="Widget">' + 'b'.repeat(32) + '</sp_widget>'),
        { name: 'Widget', secondary: [] });
    values.name = 'Widget'; displays = values;
    assert.deepEqual(render(record), { name: 'Widget', secondary: ['Widget'] }, 'distinct fields with equal text are retained');
});

test('Combined primary fields and additional fields never repeat a field path', () => {
    const { api } = server();
    api._displayConfig = () => ({ display_value: 'name.element.name', additional_fields: 'element,name,label,label,other' });
    api._fieldPath = (_table, field) => [{ field }];
    const payload = '<name>incident</name><element>number</element><label>Number</label><other>Number</other>';
    assert.equal(api._name(null, 'sys_dictionary', 'id', payload, ''), 'incident.number');
    assert.deepEqual(Array.from(api._secondaryValues(null, 'sys_dictionary', payload)), ['Number', 'Number']);
});

test('Normal name fallbacks also exclude their field from additional values', () => {
    const { api } = server();
    api._displayConfig = () => ({ display_value: 'missing', additional_fields: 'title,title,name' });
    api._fieldPath = (_table, field) => [{ field }];
    api._displayField = () => ({ name: 'title' });
    const payload = '<title>Primary</title><name>Additional</name>';
    assert.equal(api._name(null, 'widget', 'id', payload, ''), 'Primary');
    assert.deepEqual(Array.from(api._secondaryValues(null, 'widget', payload)), ['Additional']);
});

test('Markdown includes secondary values on plain context-only and included records', () => {
    const context = { console };
    vm.createContext(context); vm.runInContext(clientSource, context);
    const rows = [{
        table: 'child', id: 'c', type: 'Children', name: 'Child', url: '/child',
        secondary: ['one | two', '<three>'], ancestors: [{
            table: 'parent', id: 'p', type: 'Parents',
            name: 'Parent', url: '/parent', secondary: ['value']
        }]
    }];
    const result = context._weMarkdownRender(context._weMarkdownTree(rows), 0).join('\n');
    assert.ok(result.includes('↪ [Parent](/parent) (value)'));
    assert.ok(result.includes('[Child](/child) (one | two, <three>)'));
    rows[0].ancestors[0].inUpdateSet = true;
    const included = context._weMarkdownRender(context._weMarkdownTree(rows), 0).join('\n');
    assert.ok(included.includes('- [Parent](/parent) (value)'));
    assert.ok(!included.includes('↪'));
});


test('shipped grouping defaults use only child table arrays and stay well below the limit', () => {
    const parents = ['sys_security_acl', 'sys_user_group', 'sc_cat_item_producer', 'sp_widget', 'item_option_new', 'catalog_ui_policy', 'kb_knowledge', 'sp_page', 'sp_container', 'sp_row', 'sp_column', 'sys_ui_policy', 'sp_theme', 'sys_ui_action'];
    const counts = [1, 1, 20, 4, 1, 1, 2, 3, 1, 1, 1, 2, 4, 2];
    parents.forEach((table, index) => {
        const source = fs.readFileSync('src/fluent/generated/properties/system-property/sys_properties_widget_editor_markdown_groups_' + table + '.now.ts', 'utf8');
        const value = source.match(/value: `([\s\S]*?)`,/)[1];
        assert.ok(value.length < 700);
        const children = JSON.parse(value);
        assert.equal(children.length, counts[index]);
        assert.ok(children.every(child => typeof child === 'string'));
    });
});

function groupServer(initial = {}) {
    const prefix = 'monaco.plus.update_sets.markdown_groups.';
    const saved = {};
    const values = Object.fromEntries(Object.entries(initial).map(([table, value]) => [prefix + table, value]));
    const { api } = server({
        gs: { hasRole: () => true, getProperty: name => values[name] || '', setProperty: (name, value) => { saved[name] = value; values[name] = value; } },
        GlideRecordSecure: function (table) {
            let queryPrefix = '', rows = [], index = -1, data = {}, currentName;
            this.addQuery = (_name, op, value) => { queryPrefix = value || ''; };
            this.query = () => { rows = Object.keys(values).filter(name => name.startsWith(queryPrefix)); index = -1; };
            this.orderBy = () => { };
            this.next = () => table === 'sys_properties' && ++index < rows.length;
            this.getValue = field => field === 'name' ? rows[index] : field === 'value' ? values[rows[index]] : '';
            this.get = (_field, name) => { currentName = name; return table === 'sys_db_object' ? name !== 'missing' : Object.hasOwn(values, name); };
            this.deleteRecord = () => { delete values[currentName]; return true; };
            this.initialize = () => { };
            this.setValue = (field, value) => { data[field] = value; };
            this.insert = () => { values[data.name] = data.value; return 'new-id'; };
        },
    });
    api._tableLabel = table => table.toUpperCase();
    api._referenceField = () => 'parent';
    return { api, saved, values };
}

test('saving combined config splits parents, deletes removed properties and creates no leaf property', () => {
    const { api, saved, values } = groupServer({ a: '["b"]', removed: '["c"]' });
    api.getParameter = () => JSON.stringify({ a: ['b'], b: ['c'] });
    assert.equal(api.saveRules().success, true);
    const prefix = api.GROUPS_PREFIX;
    assert.deepEqual(JSON.parse(saved[prefix + 'a']), ['b']);
    assert.deepEqual(JSON.parse(saved[prefix + 'b']), ['c']);
    assert.equal(Object.hasOwn(values, prefix + 'removed'), false);
    assert.equal(Object.hasOwn(values, prefix + 'c'), false);
    const rules = api._rules();
    assert.equal(rules.groups.length, 1);
    assert.equal(rules.groups[0].children[0].children[0].table, 'c');
    const properties = api.getProperties().properties;
    assert.equal(properties.filter(property => property.name === api.RULES_PROPERTY).length, 1);
    assert.equal(properties.filter(property => property.name.startsWith(prefix)).length, 0);
    assert.deepEqual(JSON.parse(properties.find(property => property.name === api.RULES_PROPERTY).value), { a: ['b'], b: ['c'] });
});

test('previewing combined JSON resolves fields without saving', () => {
    const { api, saved } = groupServer({ a: '["b"]' });
    api.getParameter = () => JSON.stringify({ b: ['c'] });
    const result = api.getRules();
    assert.equal(result.success, true);
    assert.equal(result.rules.groups[0].children[0].field, 'parent');
    assert.deepEqual(saved, {});
});

test('table property rows validate before writes, save individually and delete properties', () => {
    const values = {}, writes = [];
    const fields = { widget: ['name', 'script', 'sys_id'], child: ['name', 'parent', 'sys_id'] };
    const { api } = server({
        gs: { hasRole: () => true, setProperty: (name, value) => { values[name] = value; } },
        GlideRecordSecure: function (table) {
            let name, data = {};
            this.get = (_field, value) => { name = value; return table === 'sys_db_object' ? !!fields[value] : Object.hasOwn(values, value); };
            this.isValid = () => !!fields[table];
            this.getLabel = () => 'Example';
            this.isValidField = field => (fields[table] || []).includes(field);
            this.initialize = () => { };
            this.setValue = (key, value) => { data[key] = value; };
            this.insert = this.update = () => { writes.push(data); values[data.name || name] = data.value; return 'id'; };
            this.deleteRecord = () => { delete values[name]; return true; };
        },
    });
    let params = { kind: 'display_fields', table: 'widget', property_value: ' name,script,name ' };
    api.getParameter = name => params[name];
    assert.equal(api.saveTableProperty().success, true);
    assert.equal(values['monaco.plus.code_search.display_fields.widget'], 'name,script');
    for (const change of [{ table: 'missing' }, { property_value: 'name,bad' }, { property_value: 'name,' }]) {
        const original = params; params = { ...params, ...change };
        assert.equal(api.saveTableProperty().success, false); params = original;
    }
    assert.equal(writes.length, 1);
    params = { kind: 'table_config', table: 'widget', description: 'Example', property_value: JSON.stringify({ rules: [{ type: 'child_reference', relatedTable: 'child', relatedField: 'parent', then: [{ type: 'reference_field', sourceField: 'parent', relatedTable: 'widget' }] }], pickerFields: ['name'] }) };
    assert.equal(api.saveTableProperty().success, true);
    assert.equal(writes[1].description, 'Example');
    for (const config of [[], { unknown: [] }, { rules: {} }, { pickerFields: ['bad'] }, { rules: [{ type: 'wrong' }] }, { rules: [{ type: 'token', sourceField: 'script', relatedTable: 'child', pattern: '[' }] }, { rules: [{ type: 'child_reference', relatedTable: 'child', relatedField: 'parent', then: [{ type: 'reference_field', sourceField: 'bad', relatedTable: 'widget' }] }] }]) {
        params.property_value = JSON.stringify(config);
        assert.equal(api.saveTableProperty().success, false, JSON.stringify(config));
    }
    assert.equal(writes.length, 2);
    assert.equal(api.deleteTableProperty().success, true);
    assert.equal(Object.hasOwn(values, 'monaco.plus.assistant.table_config.widget'), false);
    assert.equal(Object.hasOwn(values, 'monaco.plus.code_search.display_fields.widget'), true);
    params = { kind: 'editor_config', table: 'widget', description: 'Editor layout', property_value: JSON.stringify({
        primaryField: 'name', secondaryField: 'sys_id', label: 'Custom Editor', icon: 'icon-mail', allowCreate: true,
        scriptFields: [{ name: 'script', language: 'javascript', scriptKind: 'server' }],
        headerFields: ['name'], additionalFields: [{ name: 'sys_id', readOnly: true }],
    }) };
    assert.equal(api.saveTableProperty().success, true);
    assert.equal(writes.at(-1).description, 'Editor layout');
    assert.ok(Object.hasOwn(values, 'monaco.plus.editor.table_config.widget'));
    assert.equal(JSON.parse(values['monaco.plus.editor.table_config.widget']).label, 'Custom Editor');
    assert.equal(JSON.parse(values['monaco.plus.editor.table_config.widget']).secondaryField, 'sys_id');
    const writesBefore = writes.length;
    for (const change of [{ headerFields: ['name', 'script'] }, { additionalFields: ['missing'] }, { icon: 'bad icon' }, { label: false }, { secondaryField: 'missing' }, { secondaryField: 42 }]) {
        const config = JSON.parse(values['monaco.plus.editor.table_config.widget']);
        params.property_value = JSON.stringify({ ...config, ...change });
        assert.equal(api.saveTableProperty().success, false);
    }
    assert.equal(writes.length, writesBefore);
    params.description = 'x'.repeat(513);
    assert.equal(api.saveTableProperty().success, false);
    assert.equal(api.deleteTableProperty().success, true);
    assert.equal(Object.hasOwn(values, 'monaco.plus.editor.table_config.widget'), false);
    params.kind = 'arbitrary';
    assert.equal(api.deleteTableProperty().success, false);
});

test('table row APIs require admin', () => {
    const { api } = server();
    assert.equal(api.saveTableProperty().success, false);
    assert.equal(api.deleteTableProperty().success, false);
});

test('combined Markdown display saves separate tables, removes omitted tables and migrates legacy only after validation', () => {
    const { api, values, saved } = groupServer();
    api._fieldPath = (_table, field) => field === 'bad' ? null : [{}];
    const prefix = api.DISPLAY_PROPERTY + '.';
    values[api.DISPLAY_PROPERTY] = '{}';
    values[prefix + 'removed'] = '{"display":"name"}';
    const config = { one: { display: 'bad', secondary: Array(350).fill('description') }, two: { display: 'name', secondary: ['name'] } };
    api.getParameter = key => key === 'property_name' ? api.DISPLAY_PROPERTY : JSON.stringify(config);
    assert.equal(api.saveProperty().success, false);
    assert.deepEqual(saved, {});
    config.one.display = 'name';
    config.two.secondary = Array(120).fill('description');
    assert.ok(JSON.stringify(config, null, 4).length > 4000);
    assert.equal(api.saveProperty().success, true);
    const expected = Object.fromEntries(Object.entries(config).map(([table, value]) => [table, { display_value: value.display, additional_fields: value.secondary.join(',') }]));
    assert.ok(values[prefix + 'one'].length > 4000);
    assert.deepEqual(JSON.parse(values[prefix + 'one']), expected.one);
    assert.deepEqual(JSON.parse(values[prefix + 'two']), expected.two);
    assert.equal(Object.hasOwn(values, prefix + 'removed'), false);
    assert.equal(values[api.DISPLAY_PROPERTY], '');
    assert.deepEqual(JSON.parse(JSON.stringify(api._displayConfigs())), expected);
    const properties = api.getProperties().properties;
    assert.equal(properties.filter(p => p.name === api.DISPLAY_PROPERTY).length, 1);
    assert.equal(properties.some(p => p.name.startsWith(prefix)), false);
});

test('property tables render row saves and remove the saved property only after server success', async () => {
    class Node {
        constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.className = ''; this._text = ''; }
        set textContent(value) { this._text = value; this.children = []; }
        get textContent() { return this._text; }
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
        insertBefore(child, before) { child.parentNode = this; this.children.splice(this.children.indexOf(before), 0, child); }
        setAttribute(name, value) { (this.attributes ||= {})[name] = value; }
        getAttribute(name) { return (this.attributes || {})[name]; }
        focus() { }
        remove() { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); }
        querySelector() { return null; }
        querySelectorAll(selector) { return descendants(this).filter(n => n.className.split(' ').includes(selector.slice(1))); }
    }
    function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
    const roots = Object.fromEntries(['wep-sections', 'wep-nav', 'wep-message', 'wep-search'].map(id => [id, new Node('div')]));
    roots['wep-search'].value = '';
    const requests = [], frames = [], pickers = [], modals = [];
    function jq(node) {
        if (node.className === 'modal fade') return mockBootstrapModal(node, modals);
        const picker = {
            node, select2(command, value) {
                if (typeof command === 'object') this.options = command;
                if (command === 'data') node.value = value.id;
                if (command === 'enable') this.enabled = value;
                return this;
            }, on(_event, callback) { this.change = callback; }, off() { }
        };
        pickers.push(picker); return picker;
    }
    jq.fn = { select2() { }, modal() { } };
    let rejectDelete = true;
    function GlideAjax() {
        const params = {}; this.addParam = (key, value) => { params[key] = value; };
        this.getXMLAnswer = callback => {
            requests.push(params);
            if (params.sysparm_name === 'getProperties') callback(JSON.stringify({
                success: true, properties: [
                    { name: 'monaco.plus.code_search.display_fields.widget', value: 'name', description: '', type: 'string' },
                    { name: 'monaco.plus.code_search.display_fields.other', value: 'name', description: '', type: 'string' },
                    { name: 'monaco.plus.assistant.table_config.widget', value: '{"rules":[]}', description: 'Example', type: 'string' },
                    { name: 'monaco.plus.editor.table_config.sys_script_email', value: '{"primaryField":"name","scriptFields":[],"headerFields":["name"],"additionalFields":[]}', description: 'Email scripts', type: 'string' },
                    { name: 'monaco.plus.update_sets.markdown_display', value: '{"widget":{"display_value":"name","additional_fields":"script"}}', description: '', type: 'string' }
                ]
            }));
            else callback(JSON.stringify(params.sysparm_name === 'deleteTableProperty' && rejectDelete ? { success: false, error: 'Denied' } : { success: true, value: params.property_value }));
        };
    }
    const context = {
        window: { $j: jq, innerHeight: 800, requestAnimationFrame: f => frames.push(f), addEventListener() { } },
        document: { body: new Node('body'), readyState: 'complete', getElementById: id => roots[id], createElement: tag => new Node(tag) }, GlideAjax, Promise, setTimeout: () => { }, console
    };
    vm.createContext(context); vm.runInContext(fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus_properties.client.js', 'utf8'), context);
    const tick = () => new Promise(resolve => setImmediate(resolve)); await tick();
    context.window.monaco = {
        editor: {
            create(_host, options) {
                let value = options.value;
                return {
                    getValue: () => value, setValue: v => { value = v; }, onDidFocusEditorText() { }, onDidChangeModelContent() { },
                    onDidContentSizeChange() { }, getContentHeight: () => 100, layout() { }, dispose() { }, updateOptions() { }
                };
            }
        }
    };
    while (frames.length) frames.shift()();
    const cards = roots['wep-sections'].querySelectorAll('.wep-card');
    assert.equal(cards.length, 4);
    const code = cards.find(c => c._prop.kind === 'display_fields'), assistant = cards.find(c => c._prop.kind === 'table_config');
    const editor = cards.find(c => c._prop.kind === 'editor_config');
    assert.equal(editor.parentNode.getAttribute('data-feature'), 'Widget Editor+');
    assert.deepEqual(descendants(editor).filter(n => n.tagName === 'TH').map(n => n.textContent), ['Table', 'Description', 'JSON', 'Actions', 'Updated']);
    const editorJson = descendants(editor).find(n => n.getAttribute('aria-label') === 'JSON');
    editorJson.value = '{}'; editorJson.oninput();
    descendants(editor).find(n => n.getAttribute('aria-label') === 'Save property').onclick(); await tick();
    assert.equal(requests.filter(r => r.sysparm_name === 'saveTableProperty').at(-1).kind, 'editor_config');
    assert.equal(requests.filter(r => r.sysparm_name === 'saveTableProperty').at(-1).table, 'sys_script_email');
    assert.deepEqual(descendants(code).filter(n => n.tagName === 'TH').map(n => n.textContent), ['Table', 'Fields', 'Actions', 'Updated']);
    assert.deepEqual(descendants(assistant).filter(n => n.tagName === 'TH').map(n => n.textContent), ['Table', 'Description', 'JSON', 'Actions', 'Updated']);
    assert.ok(cards.every(c => c._prop.name.endsWith('.*')));
    assert.ok(cards.every(c => c.querySelectorAll('.wep-updated-pill').length === 0));
    const jsonFallback = descendants(assistant).find(n => n.getAttribute('aria-label') === 'JSON');
    assert.ok(jsonFallback.className.includes('wep-json-fallback'));
    assert.equal(jsonFallback.hidden, true); assert.equal(jsonFallback.style.display, 'none');
    assert.equal(assistant.querySelectorAll('.wep-monaco').length, 1);
    assert.equal(pickers.length, 5);
    assert.ok(pickers.every(p => p.node.type === 'hidden' && p.options.query && !p.enabled));
    const markdown = cards.find(c => c._prop.kind === 'markdown_display');
    assert.deepEqual(descendants(markdown).filter(n => n.tagName === 'TH').map(n => n.textContent), ['Table', 'Display fields', 'Additional fields', 'Actions', 'Updated']);
    const displayInput = descendants(markdown).find(n => n.getAttribute('aria-label') === 'Display fields');
    const extraInput = descendants(markdown).find(n => n.getAttribute('aria-label') === 'Additional fields');
    assert.equal(displayInput.tagName, 'INPUT'); assert.equal(extraInput.tagName, 'INPUT');
    displayInput.value = 'name,script'; displayInput.oninput();
    extraInput.value = 'script,name'; extraInput.oninput();
    descendants(markdown).find(n => n.getAttribute('aria-label') === 'Save property').onclick(); await tick();
    assert.equal(requests.filter(r => r.sysparm_name === 'saveTableProperty').at(-1).kind, 'markdown_display');
    assert.deepEqual(JSON.parse(requests.filter(r => r.sysparm_name === 'saveTableProperty').at(-1).property_value), { display_value: 'name,script', additional_fields: 'script,name' });
    assert.equal(descendants(markdown).some(n => n.getAttribute('aria-label') === 'Combine fields'), false);
    assert.equal(descendants(markdown).some(n => n.getAttribute('aria-label') === 'Field separator'), false);
    displayInput.value = 'name.script'; displayInput.oninput();
    descendants(markdown).find(n => n.getAttribute('aria-label') === 'Save property').onclick(); await tick();
    assert.deepEqual(JSON.parse(requests.filter(r => r.sysparm_name === 'saveTableProperty').at(-1).property_value),
        { display_value: 'name.script', additional_fields: 'script,name' });
    extraInput.value = Array(700).fill('script').join(','); extraInput.oninput();
    const markdownSave = descendants(markdown).find(n => n.getAttribute('aria-label') === 'Save property');
    assert.equal(markdownSave.disabled, false);
    assert.equal(markdown.querySelectorAll('.wep-character-count').length, 0);
    assert.equal(displayInput.getAttribute('aria-describedby'), undefined);
    assert.equal(extraInput.getAttribute('aria-describedby'), undefined);
    markdownSave.onclick(); await tick();
    assert.equal(JSON.parse(requests.filter(r => r.sysparm_name === 'saveTableProperty').at(-1).property_value).additional_fields, extraInput.value);
    requests.length = 0;
    const codeCount = code.parentNode.querySelectorAll('.wep-section-count')[0];
    const codeNavCount = roots['wep-nav'].children.find(n => n.getAttribute('data-feature') === 'Code Search+').querySelectorAll('.wep-nav-count')[0];
    assert.equal(codeCount.textContent, '2 properties'); assert.equal(codeNavCount.textContent, '2');
    const row = descendants(code).find(n => n.tagName === 'TBODY').children[0];
    const input = descendants(row).find(n => n.getAttribute('aria-label') === 'Fields');
    assert.equal(input.tagName, 'INPUT');
    const save = descendants(row).find(n => n.getAttribute('aria-label') === 'Save property');
    const remove = descendants(row).find(n => n.getAttribute('aria-label') === 'Remove table');
    input.value = 'name,script'; input.oninput(); save.onclick(); await tick();
    assert.equal(requests.filter(r => r.sysparm_name === 'saveTableProperty').length, 1);
    assert.equal(requests.filter(r => r.sysparm_name === 'saveTableProperty').at(-1).kind, 'display_fields');
    assert.equal(save.disabled, true);
    const beforeDelete = requests.length;
    remove.onclick(); await tick(); assert.equal(requests.length, beforeDelete);
    assert.equal(modals.length, 1);
    assert.equal(modals[0].getAttribute('role'), 'dialog');
    assert.ok(descendants(modals[0]).some(n => n.textContent === 'monaco.plus.code_search.display_fields.widget'));
    modalButton(modals[0], 'Cancel').onclick(); await tick();
    assert.equal(requests.length, beforeDelete); assert.ok(row.parentNode.children.includes(row));
    remove.onclick(); modalButton(modals.at(-1), 'Remove').onclick(); await tick();
    assert.ok(row.parentNode.children.includes(row), 'failed deletion keeps row');
    rejectDelete = false; remove.onclick(); modalButton(modals.at(-1), 'Remove').onclick(); await tick(); assert.equal(row.parentNode.children.includes(row), false);
    const add = descendants(code).find(n => n.tagName === 'BUTTON' && n.textContent === 'Add table');
    add.onclick();
    assert.equal(codeCount.textContent, '1 property'); assert.equal(codeNavCount.textContent, '1');
    const newRow = descendants(code).find(n => n.tagName === 'TBODY').children.at(-1);
    const before = requests.length, modalCount = modals.length;
    descendants(newRow).find(n => n.getAttribute('aria-label') === 'Remove table').onclick();
    assert.equal(requests.length, before);
    assert.equal(modals.length, modalCount);
    assert.equal(codeNavCount.textContent, '1');
    add.onclick();
    const created = descendants(code).find(n => n.tagName === 'TBODY').children.at(-1);
    const tablePicker = pickers.at(-1); tablePicker.node.value = 'new_table'; tablePicker.change();
    const fields = descendants(created).find(n => n.getAttribute('aria-label') === 'Fields'); fields.value = 'name'; fields.oninput();
    descendants(created).find(n => n.getAttribute('aria-label') === 'Save property').onclick(); await tick();
    assert.equal(codeCount.textContent, '2 properties'); assert.equal(codeNavCount.textContent, '2');
});

test('list query preserves fixed filters and related-list constraints using the instance API', () => {
    const context = {}; vm.createContext(context); vm.runInContext(clientSource, context);
    // GlideList2.getQuery accepts one options object; related-list scope is separate.
    function list(filter, fixed, related) {
        return {
            getQuery(options) { return [options.fixed ? fixed : '', filter].filter(Boolean).join('^'); },
            getRelated: () => related ? 'sys_update_xml.update_set' : '',
            getRelatedQuery: () => related,
        };
    }
    const set = 'update_set=' + 'a'.repeat(32);
    assert.equal(context._weMarkdownListQuery(list(set, '', '')), set);
    assert.equal(context._weMarkdownListQuery(list('type=Widget', set, '')), set + '^type=Widget');
    assert.equal(context._weMarkdownListQuery(list('', '', set)), set);
    assert.equal(context._weMarkdownListQuery(list('type=Widget', 'action=DELETE', set)), set + '^action=DELETE^type=Widget');
    assert.equal(context._weMarkdownListQuery(list('type=Widget^NQtype=Business Rule', '', set)), set + '^type=Widget^NQ' + set + '^type=Business Rule');
    assert.equal(context._weMarkdownListQuery(list('target_nameLIKEa^^NQb', '', set)), set + '^target_nameLIKEa^^NQb');
    assert.equal(context._weMarkdownListQuery(list('update_setINa,b', '', '')), 'update_setINa,b');
    assert.equal(context._weMarkdownListQuery(list('', '', '')), '');
    assert.throws(() => context._weMarkdownListQuery({ getQuery: () => '', getRelated: () => 'sys_update_xml.update_set', getRelatedQuery: () => null }), /related-list query is unavailable/);
    assert.throws(() => context._weMarkdownListQuery({ getQuery: () => undefined }), /query is unavailable/);
});

test('list action captures its query before ServiceNow resets g_list and respects the clicked list', async () => {
    const requests = [], errors = [];
    const makeList = query => ({ getTableName: () => 'sys_update_xml', getQuery: () => query });
    const list = makeList('update_set=current'), stale = makeList(''), element = { nodeType: 1 };
    const context = {
        Promise, g_list: list, GlideLists2: { current: list, other: stale },
        GlideList2: { get: source => source === element ? list : null },
        GlideUINotification: function (note) { if (note.type === 'error') errors.push(note.text); }, NOW: { CustomEvent: { fireTop() { } } }
    };
    vm.createContext(context); vm.runInContext(clientSource, context);
    context._weMarkdownAjax = async (_method, params) => { requests.push(params.list_query); return { rows: [{ table: 'sp_widget', id: '1', name: 'Test', type: 'Widget', ancestors: [], secondary: [] }], hasMore: false }; };
    context._weWriteMarkdownClipboard = async () => { };
    const pending = context.copyUpdateSetMarkdownPlus();
    context.g_list = null;
    await pending;
    assert.deepEqual(requests, ['update_set=current']);
    context.g_list = stale;
    await context.copyUpdateSetMarkdownPlus(stale, element);
    assert.deepEqual(requests, ['update_set=current', 'update_set=current']);
    context.g_list = null;
    await context.copyUpdateSetMarkdownPlus();
    assert.equal(requests.length, 2);
    assert.match(errors[0], /list could not be found/);
});

test('Markdown display rows validate fields, save string-based JSON and delete legacy and per-table entries', () => {
    const legacyName = 'monaco.plus.update_sets.markdown_display';
    const values = { [legacyName]: JSON.stringify({ widget: { display: 'name', secondary: ['script'] }, other: { display: 'name', secondary: [] } }) }, writes = [];
    const { api } = server({
        gs: { hasRole: () => true, getProperty: name => values[name] || '', setProperty: (name, value) => { values[name] = value; } },
        GlideRecordSecure: function (table) {
            let name, data = {};
            this.get = (_field, value) => { name = value; return table === 'sys_db_object' ? ['widget', 'other'].includes(value) : Object.hasOwn(values, value); };
            this.initialize = () => { }; this.setValue = (key, value) => { data[key] = value; };
            this.insert = this.update = () => { writes.push(data); values[data.name || name] = data.value; return 'id'; };
            this.deleteRecord = () => { delete values[name]; return true; };
        }
    });
    api._fieldPath = (table, field) => ['widget', 'other'].includes(table) && ['name', 'script', 'owner'].includes(field) ? [{}] : null;
    let params = { kind: 'markdown_display', table: 'widget', property_value: JSON.stringify({ display_value: 'owner.name, name', additional_fields: 'script, name' }) };
    api.getParameter = key => params[key];
    assert.equal(api.saveTableProperty().success, true);
    const name = legacyName + '.widget';
    assert.deepEqual(JSON.parse(values[name]), { display_value: 'owner.name, name', additional_fields: 'script, name' });
    assert.deepEqual(Object.keys(JSON.parse(values[legacyName])), ['other']);
    for (const config of [{ display_value: 'missing', additional_fields: '' }, { display_value: 'name,missing', additional_fields: '' }, { display_value: 'name,', additional_fields: '' }, { display_value: ',name', additional_fields: '' }, { display_value: 'name', additional_fields: 'bad' },
    { display_value: 'name', additional_fields: ['script'] }, { display_value: 'name', additional_fields: 'name,' }, { display_value: 'name', additional_fields: '', unknown: true }]) {
        params.property_value = JSON.stringify(config); assert.equal(api.saveTableProperty().success, false);
    }
    params.table = 'missing'; params.property_value = '{"display_value":"name","additional_fields":""}';
    assert.equal(api.saveTableProperty().success, false); assert.equal(writes.length, 1);
    params.table = 'widget';
    const largeConfig = { display_value: 'name', additional_fields: Array(700).fill('script').join(',') };
    params.property_value = JSON.stringify(largeConfig);
    assert.ok(params.property_value.length > 4000);
    assert.equal(api.saveTableProperty().success, true);
    assert.deepEqual(JSON.parse(values[name]), largeConfig);
    assert.equal(api.deleteTableProperty().success, true); assert.equal(Object.hasOwn(values, name), false);
    params.table = 'other'; assert.equal(api.deleteTableProperty().success, true); assert.equal(values[legacyName], '');
});

test('Knowledge, page and UI policy defaults form one consistent hierarchy', () => {
    const directory = 'src/fluent/generated/properties/system-property/';
    const configs = {};
    for (const file of fs.readdirSync(directory).filter(name => /^sys_properties_widget_editor_markdown_groups_.*\.now\.ts$/.test(name))) {
        const source = fs.readFileSync(directory + file, 'utf8');
        configs[source.match(/name: 'monaco.plus.update_sets.markdown_groups.([^']+)'/)[1]] = JSON.parse(source.match(/value: `([\s\S]*?)`,/)[1]);
    }
    assert.deepEqual(configs.kb_knowledge, ['kb_version', 'kb_knowledge_summary']);
    assert.deepEqual(configs.sp_page, ['sp_container', 'sp_metatag', 'sp_page_title_variable']);
    assert.deepEqual(configs.sys_ui_policy, ['sys_ui_policy_action', 'sys_ui_policy_rl_action']);
    assert.deepEqual(configs.sys_ui_action, ['sys_ui_action_view', 'sys_ui_action_role']);
    const { api } = groupServer();
    const rules = api._buildGroupRules(configs);
    let parent = rules.groups.find(node => node.table === 'sp_page');
    for (const table of ['sp_container', 'sp_row', 'sp_column', 'sp_instance']) {
        parent = parent.children.find(node => node.table === table);
        assert.ok(parent, table);
    }
    const source = fs.readFileSync(directory + 'sys_properties_widget_editor_markdown_display_kb_knowledge.now.ts', 'utf8');
    assert.deepEqual(JSON.parse(source.match(/value: `([\s\S]*?)`,/)[1]), { display_value: 'display_number', additional_fields: 'short_description' });
});

test('property category links reference Widget Editor+ and are not duplicated on repeated saves', () => {
    const { api, categoryLinks } = server();
    api._ensurePropertyCategory({ getUniqueValue: () => 'property-one' });
    api._ensurePropertyCategory({ getUniqueValue: () => 'property-two' });
    api._ensurePropertyCategory({ getUniqueValue: () => 'property-one' });
    assert.deepEqual(categoryLinks.map(link => [link.property, link.category]), [
        ['property-one', 'widget-editor-category'], ['property-two', 'widget-editor-category']
    ]);
});

test('theme defaults include all requested children', () => {
    const source = fs.readFileSync('src/fluent/generated/properties/system-property/sys_properties_widget_editor_markdown_groups_sp_theme.now.ts', 'utf8');
    assert.deepEqual(JSON.parse(source.match(/value: `([\s\S]*?)`,/)[1]), [
        'sp_header_footer', 'm2m_sp_theme_css_include', 'm2m_sp_theme_js_include', 'm2m_sp_theme_sp_theme_variant'
    ]);
});

test('theme header/footer grouping resolves parent-side references from dictionary metadata', () => {
    const { api } = server({
        gs: { hasRole: () => true, getProperty: () => 'https://example.service-now.com/' }, GlideRecordSecure: function (table) {
            const filters = {}; let rows = [], index = -1;
            this.get = () => true;
            this.addQuery = (field, op, value) => { filters[field] = value || op; };
            this.query = () => { rows = table === 'sys_dictionary' && filters.name === 'sp_theme' ? [{ element: 'header', reference: 'sp_header_footer' }, { element: 'footer', reference: 'sp_header_footer' }] : []; };
            this.next = () => ++index < rows.length; this.getValue = field => rows[index][field];
        }
    });
    const related = [];
    api._relatedTables = () => related; api._hierarchyNames = table => [table]; api._tableLabel = table => table;
    api.getParameter = () => 'sp_theme';
    assert.equal(api.getRelatedTables().tables[0].table, 'sp_header_footer');
    assert.equal(related.length, 0, 'picker must not contaminate child-reference metadata');
    const rules = api._buildGroupRules({ sp_theme: ['sp_header_footer'] });
    const child = rules.groups[0].children[0];
    assert.deepEqual(Array.from(child.parentFields), ['footer', 'header']);
    assert.equal(child.field, 'sp_theme.footer, sp_theme.header');
    const themeId = 'a'.repeat(32), headerId = 'b'.repeat(32);
    api._referencingParentId = (table, fields, id) => { assert.equal(table, 'sp_theme'); assert.equal(id, headerId); return themeId; };
    api._record = () => ({ getValue: () => '' }); api._name = (_gr, table) => table; api._secondaryValues = () => [];
    const result = api._ancestors('sp_header_footer', headerId, '', rules);
    assert.equal(result.ancestors[0].table, 'sp_theme'); assert.equal(result.ancestors[0].id, themeId);
});

test('parent-side grouping handles live, shared and deleted themes without using stale captured relationships', () => {
    const first = 'a'.repeat(32), second = 'b'.repeat(32), header = 'c'.repeat(32), setId = 'd'.repeat(32);
    let live = [first], captured = [];
    const { api } = server({
        GlideRecordSecure: function (table) {
            let rows = [], index = -1;
            this.addQuery = () => ({ addOrCondition() { } }); this.orderByDesc = () => { };
            this.query = () => { rows = table === 'sp_theme' ? live.map(id => ({ id })) : captured; };
            this.next = () => ++index < rows.length; this.getUniqueValue = () => rows[index].id; this.getValue = field => rows[index][field];
        }
    });
    const resolve = () => api._referencingParentId('sp_theme', ['header', 'footer'], header, 'sys_update_set', setId);
    assert.equal(resolve(), first);
    live = [first, second]; assert.equal(resolve(), '');
    captured = [{ name: 'sp_theme_' + second, payload: '<header>' + header + '</header>' }];
    assert.equal(resolve(), second, 'prefer the uniquely captured parent');
    live = []; assert.equal(resolve(), second, 'deleted parent can resolve from its update payload');
    captured.unshift({ name: 'sp_theme_' + second, payload: '<header>' + first + '</header>' });
    assert.equal(resolve(), '', 'older captured references must not be used');
    captured = [{ name: 'sp_theme_' + first, payload: '<footer>' + header + '</footer>' }];
    assert.equal(resolve(), first, 'footer references work too');
});

test('Knowledge versions across pages consolidate by article number and retain all version children', () => {
    const context = {};
    vm.createContext(context); vm.runInContext(clientSource, context);
    const article = version => ({
        table: 'kb_knowledge', id: 'article-' + version, type: 'Knowledge',
        name: 'KB0010038 v' + version, url: '/article/' + version, secondary: ['Article description'], inUpdateSet: false,
        consolidation: { key: 'KB0010038', name: 'KB0010038', version: 'KB0010038 v' + version }
    });
    const child = version => ({
        table: 'kb_version', id: 'version-' + version, type: 'Knowledge Version',
        name: version, url: '/version/' + version, ancestors: [article(version)]
    });
    const output = context._weMarkdownText([{ rows: [child('1.0'), child('3.0')] }, { rows: [child('2.0'), child('1.0')] }]);
    assert.equal((output.match(/\[KB0010038\]/g) || []).length, 1);
    assert.ok(output.includes('↪ [KB0010038](/article/3.0) (Article description)'));
    for (const version of ['1.0', '2.0', '3.0']) assert.equal(output.split('](/version/' + version + ')').length - 1, 1);
    assert.equal((output.match(/\*\*Knowledge Version\*\*/g) || []).length, 1);
    const present = article('2.0'); present.inUpdateSet = true;
    const included = context._weMarkdownText([{ rows: [child('1.0'), { ...child('2.0'), ancestors: [present] }, child('3.0')] }]);
    assert.ok(!included.includes('↪'));
    const explicit = context._weMarkdownText([{ rows: [child('1.0'), child('3.0'), { ...article('2.0'), updateId: 'update', ancestors: [] }] }]);
    assert.ok(!explicit.includes('↪'));
});

test('Knowledge consolidation never merges unrelated articles or records without a readable article number', () => {
    const context = {};
    vm.createContext(context); vm.runInContext(clientSource, context);
    const rows = ['a', 'b', 'c', 'd'].map((id, index) => ({
        table: 'kb_knowledge', id, type: 'Knowledge', name: 'Same title', url: '/article/' + id,
        consolidation: index < 2 ? { key: 'KB' + id, name: 'KB' + id, version: '1.0' } : null, ancestors: []
    }));
    const output = context._weMarkdownText([{ rows }]);
    assert.equal((output.match(/\[Same title\]/g) || []).length, 4);
    const { api } = server();
    const calls = [];
    api._configuredValue = (record, table, payload, field) => { calls.push({ record, table, payload, field }); return field === 'number' ? 'KB0010038' : 'KB0010038 v3.0'; };
    assert.deepEqual({ ...api._consolidation(null, 'kb_knowledge', 'captured payload') }, { key: 'KB0010038', name: 'KB0010038', version: 'KB0010038 v3.0' });
    assert.ok(calls.every(call => call.payload === 'captured payload'));
    api._configuredValue = () => '';
    assert.equal(api._consolidation({}, 'kb_knowledge', ''), null);
    assert.equal(api._consolidation({}, 'sp_widget', ''), null);
});

test('live ancestors check membership in the source update set independently of list filtering', () => {
    const { api } = server();
    const parentId = 'a'.repeat(32), childId = 'b'.repeat(32);
    const rules = { groups: [{ table: 'sp_widget', label: 'Widget', children: [{ table: 'sp_ng_template', label: 'Template', field: 'sp_widget', children: [] }] }] };
    api._record = () => ({ getValue: () => parentId });
    api._name = () => 'Parent'; api._secondaryValues = () => [];
    let captured = null;
    api._updateForTarget = (table, id, setTable, setId) => {
        assert.equal(table, 'sp_widget'); assert.equal(id, parentId);
        assert.equal(setTable, 'sys_remote_update_set'); assert.equal(setId, 'source-set'); return captured;
    };
    const ancestors = () => api._ancestors('sp_ng_template', childId, '', rules, 'sys_remote_update_set', 'source-set').ancestors;
    assert.equal(ancestors()[0].inUpdateSet, false);
    let newChecks = 0;
    api._isNewUpdate = (action, name, setTable, setId) => {
        newChecks++;
        assert.equal(name, 'sp_widget_' + parentId);
        assert.equal(setTable, 'sys_remote_update_set'); assert.equal(setId, 'source-set');
        return action !== 'DELETE';
    };
    captured = { id: 'update', payload: '', name: 'Parent', action: 'INSERT_OR_UPDATE' };
    const parent = ancestors()[0];
    assert.equal(parent.inUpdateSet, true); assert.equal(parent.isNew, true);
    assert.equal(newChecks, 1);
    const context = {}; vm.createContext(context); vm.runInContext(clientSource, context);
    function render() {
        return context._weMarkdownText([{
            rows: [{
                table: 'sp_ng_template', id: childId, type: 'Template', name: 'Child', isNew: true, ancestors: ancestors()
            }]
        }]);
    }
    let output = render();
    assert.match(output, /\[Parent\].* 🆕/);
    assert.doesNotMatch(output, /Child 🆕/);
    captured.action = 'DELETE'; output = render();
    assert.match(output, /~~\[Parent\].*~~ 🚮/);
    assert.match(output, /Child 🆕/);

});

test('export includes a linked single set heading without any keycaps', () => {
    const context = {}; vm.createContext(context); vm.runInContext(clientSource, context);
    const set = { table: 'sys_update_set', id: 'a', name: 'Release [one]', url: '/set/a' };
    const row = { table: 'widget', id: 'x', name: 'Widget', type: 'Widgets', url: '/widget/x', sourceSet: set };
    const output = context._weMarkdownText([{ rows: [row, row] }]);
    assert.ok(output.startsWith('[Release [one]](/set/a)\n\n- **Widgets**'));
    assert.ok(!output.includes('\u20E3'));
    assert.equal(output.split('[Widget]').length - 1, 1);
});

test('multiple sets have a stable linked legend and deduplicated records retain every set marker', () => {
    const context = {}; vm.createContext(context); vm.runInContext(clientSource, context);
    const first = { table: 'sys_update_set', id: 'a', name: 'Alpha', url: '/set/a' };
    const second = { table: 'sys_remote_update_set', id: 'b', name: 'Beta', url: '/remote/b' };
    const parent = { table: 'parent', id: 'p', name: 'Parent', type: 'Parents', url: '/parent', inUpdateSet: false };
    const child = { table: 'child', id: 'c', name: 'Child', type: 'Children', url: '/child', ancestors: [parent] };
    const loaded = [{ rows: [{ ...child, sourceSet: second }] }, { rows: [{ ...child, sourceSet: first }] }];
    const output = context._weMarkdownText(loaded);
    assert.ok(output.startsWith('1️⃣ [Alpha](/set/a)\n2️⃣ [Beta](/remote/b)\n\n'));
    assert.ok(output.includes('[Child](/child) 1️⃣ 2️⃣'));
    assert.ok(output.includes('↪ [Parent](/parent)'));
    assert.ok(output.endsWith('\n\n↪ For context only - not included in update set.'));
    assert.equal(output.split('↪ For context only - not included in update set.').length - 1, 1);
    assert.equal(output.split('[Child]').length - 1, 1);
    assert.equal(context._weMarkdownText(loaded), output, 'rendering does not mutate source rows');
    loaded[1].rows[0].ancestors = [{ ...parent, inUpdateSet: true }];
    const included = context._weMarkdownText(loaded);
    assert.ok(included.includes('[Parent](/parent) 1️⃣'));
    assert.ok(!included.includes('↪'));
    assert.equal(context._weMarkdownKeycap(10), '🔟');
    assert.equal(context._weMarkdownKeycap(11), '1️⃣1️⃣');
    assert.equal(context._weMarkdownText([{ rows: [], set: first }]), '');
});

test('GlideAjax JSON responses preserve emoji and Unicode without raw non-ASCII code units', () => {
    const { api } = server();
    const config = { new: '🆕', deleted: '🚮', update_set: { '1': '1️⃣', '10': '🔟' }, context_indicator: '↪' };
    const value = { success: true, indicators: config, properties: [{ value: JSON.stringify(config), description: 'Emoji 🆕' }],
        name: 'Café 中文 👩🏽‍💻', literal: '\\ud83c\\udd95', unpaired: '\ud83c' };
    api.setAnswer = answer => {
        assert.doesNotMatch(answer, /[^\x00-\x7f]/, 'XML answer must contain only ASCII');
        assert.deepEqual(JSON.parse(answer), value);
        return answer;
    };
    assert.match(api._answer(value), /\\ud83c\\udd95/i);
});

test('formatting emoji survive Properties save, property storage and Markdown XML response', async () => {
    const propertyName = 'monaco.plus.update_sets.markdown_formatting';
    const config = { new: '🆕', deleted: '🚮', update_set: { '1': '1️⃣', '10': '🔟' } };
    let saved = '{}', params = {};
    const { api } = server({
        gs: {
            hasRole: () => true,
            setProperty: (name, value) => {
                assert.equal(name, propertyName);
                assert.doesNotMatch(value, /[^\x00-\x7f]/, 'stored formatting must be ASCII');
                saved = value;
            },
            getProperty: (name, fallback) => name === propertyName ? saved : fallback
        },
        GlideRecordSecure: function (table) {
            this.get = () => true;
            this.next = () => false;
            this.addQuery = this.setLimit = this.query = () => {};
            this.getValue = field => field === 'value' ? saved : 'string';
        }
    });
    api.getParameter = key => params[key];
    api.setAnswer = answer => {
        assert.doesNotMatch(answer, /[^\x00-\x7f]/, 'response must survive an ASCII-only transport');
        return answer;
    };
    const source = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus_properties.client.js', 'utf8');
    const context = { Promise, refreshUpdatedTimes() {}, GlideAjax: function () {
        params = {};
        this.addParam = (key, value) => { params[key] = value; };
        this.getXMLAnswer = callback => {
            assert.doesNotMatch(params.property_value, /[^\x00-\x7f]/, 'request must escape emoji before transport');
            callback(api.saveProperty());
        };
    } };
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf('        function ajax('), source.indexOf('        function el(')), context);
    const response = await context.ajax('saveProperty', { property_name: propertyName, property_value: JSON.stringify(config) });
    assert.equal(response.success, true);
    assert.deepEqual(JSON.parse(saved), config);
    assert.deepEqual(JSON.parse(response.value), config);
    // Other callers that send literal emoji must also receive safe storage.
    params = { property_name: propertyName, property_value: JSON.stringify(config) };
    assert.equal(JSON.parse(api.saveProperty()).success, true);
    api._rules = () => ({ groups: [] });
    const page = JSON.parse(api._markdownPage({ orderByDesc() {}, chooseWindow() {}, query() {}, next: () => false }, 0));
    assert.deepEqual(page.indicators, config);
    const client = {};
    vm.createContext(client); vm.runInContext(clientSource, client);
    const markdown = client._weMarkdownText([{ rows: [{ table: 'widget', id: 'a', type: 'Widgets', name: 'Example', isNew: true }] }], false, 9, page.indicators);
    assert.ok(markdown.includes('Example 🆕'));
    assert.ok(!markdown.includes('\\ud83c'));
    params.property_value = JSON.stringify({ new: '🆕'.repeat(340) });
    assert.match(JSON.parse(api.saveProperty()).error, /exceeds 4000 characters/);
    assert.deepEqual(JSON.parse(saved), config, 'escaped-length overflow must not overwrite the property');
});
test('context rows keep linked names and nested parentheses free of automatic italics', () => {
    const context = {};
    vm.createContext(context); vm.runInContext(clientSource, context);
    const description = 'Defining User Criteria for an Article (demo article for a "How to" template and an AQI review)';
    const rows = [{ table: 'kb_version', id: 'v1', type: 'Knowledge Version', name: '1.0', url: '/version', isNew: true,
        ancestors: [{ table: 'kb_knowledge', id: 'article', type: 'Knowledge', name: 'KB0010038',
            url: '/article', secondary: [description], inUpdateSet: false }] }];
    for (const maxLevels of [1, 9]) {
        const output = context._weMarkdownText([{ rows }], false, maxLevels);
        const line = output.split('\n').find(value => value.includes('[KB0010038]'));
        assert.equal(line.trim(), '- ↪ [KB0010038](/article) (' + description + ')' + (maxLevels === 1 ? ' **Knowledge**' : ''));
        assert.ok(output.includes('[1.0](/version) 🆕'));
        assert.ok(output.endsWith('↪ For context only - not included in update set.'));
    }
});

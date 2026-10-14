const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const source = fs.readFileSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_ajax.server.js', 'utf8');
const id = 'a'.repeat(32), companion = 'b'.repeat(32);
function iterator(values) { let index = 0; return { hasNext: () => index < values.length, next: () => values[index++] }; }
function node(value) {
    const name = Object.keys(value).find(key => key !== ':@');
    const children = Array.isArray(value[name]) ? value[name] : [];
    return { getNodeName: () => name, getAttribute: key => (value[':@'] || {})['@_' + key] || null,
        getTextContent: () => name === '#text' ? String(value[name]) : children.map(child => node(child).getTextContent()).join(''),
        getChildNodeIterator: () => iterator(children.map(node)) };
}
function apiFor(payload, entries = [], readable = true, updateName = '') {
    const queries = [];
    const context = {
        Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        Object: { extendsObject: (_base, methods) => methods },
        gs: { getProperty: (_name, fallback) => fallback, error() {} },
        XMLDocument2: function () {
            let parsed;
            this.parseXML = text => {
                if (XMLValidator.validate(text) !== true) throw Error('Invalid XML');
                parsed = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, commentPropName: '#comment' }).parse(text);
            };
            this.getFirstNode = path => path === '/record_update' && parsed.find(value => value.record_update) ? node(parsed.find(value => value.record_update)) : null;
        },
        GlideRecordSecure: function (table) {
            if (table === 'sys_update_xml') return { get: () => readable, getValue: field => field === 'name' ? updateName : payload };
            assert.equal(table, 'sys_dictionary');
            let index = -1;
            this.addQuery = (field, value) => queries.push([field, value]);
            this.setLimit = limit => assert.equal(limit, 2);
            this.query = () => {};
            this.next = () => ++index < entries.length;
            this.getUniqueValue = () => entries[index];
        }
    };
    vm.runInNewContext(source, context);
    const api = context.WidgetEditorAjax.prototype;
    api.getParameter = () => 'update-id';
    api.setAnswer = answer => JSON.parse(answer);
    return { api, queries };
}

test('record URL resolves a dictionary entry from table and element attributes without sys_id', () => {
    const { api, queries } = apiFor('<record_update><sys_dictionary action="INSERT_OR_UPDATE" table="u_example" element="u_field"/><sys_app_file><sys_id>' + companion + '</sys_id></sys_app_file></record_update>', [id]);
    assert.deepEqual(api.getCustomerUpdateTarget(), { success: true, table: 'sys_dictionary', record_id: id });
    assert.deepEqual(queries, [['name', 'u_example'], ['element', 'u_field']]);
});

test('dictionary identity also supports direct name/element fields and collection entries', () => {
    for (const element of ['u_field', '']) {
        const { api, queries } = apiFor('<record_update><sys_dictionary><name>u_example</name><element>' + element + '</element></sys_dictionary></record_update>', [id]);
        assert.equal(api.getCustomerUpdateTarget().record_id, id);
        assert.deepEqual(queries, [['name', 'u_example'], ['element', element]]);
    }
});

test('payload sys_id takes priority and does not require a live dictionary record', () => {
    const { api, queries } = apiFor('<?xml version="1.0"?><record_update><!-- comment --><sys_dictionary action="DELETE" table="u_example" element="u_field"><sys_id><![CDATA[' + id + ']]></sys_id></sys_dictionary></record_update>');
    assert.equal(api.getCustomerUpdateTarget().record_id, id);
    assert.deepEqual(queries, []);
});

test('target record can omit action without selecting a companion or nested sys_id', () => {
    const { api } = apiFor('<record_update table="sp_widget"><sp_widget><sys_id>' + id + '</sys_id></sp_widget><sys_app_file action="INSERT_OR_UPDATE"><sys_id>' + companion + '</sys_id></sys_app_file></record_update>');
    assert.deepEqual(api.getCustomerUpdateTarget(), { success: true, table: 'sp_widget', record_id: id });
    assert.equal(api.getCustomerUpdateWidgetTarget().record_id, id);
    const nested = apiFor('<record_update><sp_widget><field><sys_id>' + companion + '</sys_id></field></sp_widget><sys_app_file action="INSERT_OR_UPDATE"><sys_id>' + companion + '</sys_id></sys_app_file></record_update>');
    assert.equal(nested.api.getCustomerUpdateTarget().success, false);
});

test('unreadable, missing, ambiguous, invalid and malformed targets fail without a guessed URL', () => {
    const dictionary = '<record_update><sys_dictionary table="u_example" element="u_field"/></record_update>';
    for (const entries of [[], [id, companion]]) assert.equal(apiFor(dictionary, entries).api.getCustomerUpdateTarget().success, false);
    assert.equal(apiFor(dictionary, [id], false).api.getCustomerUpdateTarget().error, 'Customer update not found.');
    for (const payload of ['', '<record_update>', '<record_update><sys_dictionary table="bad^ORname=x"/></record_update>', '<record_update><sys_dictionary><sys_id>invalid</sys_id></sys_dictionary></record_update>']) {
        const { api, queries } = apiFor(payload, [id]);
        assert.equal(api.getCustomerUpdateTarget().success, false);
        assert.deepEqual(queries, []);
    }
});

test('forced Knowledge Version updates resolve from their payload without a metadata lookup', () => {
    const { api } = apiFor('<record_update><kb_version action="INSERT_OR_UPDATE"><sys_id>' + id + '</sys_id><version>1.0</version></kb_version></record_update>', [], true, 'kb_version_' + id);
    assert.deepEqual(api.getCustomerUpdateTarget(), { success: true, table: 'kb_version', record_id: id });
});

test('forced updates with sparse payloads use the complete table name and validated sys_id suffix', () => {
    for (const payload of ['', '<record_update/>', '<record_update table="kb_version"/>', '<record_update><kb_version action="INSERT_OR_UPDATE"/></record_update>']) {
        const { api } = apiFor(payload, [], true, 'kb_version_' + id);
        assert.deepEqual(api.getCustomerUpdateTarget(), { success: true, table: 'kb_version', record_id: id });
    }
    assert.equal(apiFor('', [], false, 'kb_version_' + id).api.getCustomerUpdateTarget().success, false);
    for (const updateName of ['kb_version_bad', 'kb_version_' + id + 'extra', 'kb_version^ORname=x_' + id]) {
        assert.equal(apiFor('<record_update/>', [], true, updateName).api.getCustomerUpdateTarget().success, false);
    }
});

test('name fallback cannot override payload identity or bypass a malformed payload', () => {
    const mismatches = ['<record_update table="sp_widget"/>', '<record_update><sp_widget/></record_update>', '<record_update>', '<other/>'];
    for (const payload of mismatches) assert.equal(apiFor(payload, [], true, 'kb_version_' + id).api.getCustomerUpdateTarget().success, false);
    const { api } = apiFor('<record_update><kb_version><sys_id>' + companion + '</sys_id></kb_version></record_update>', [], true, 'kb_version_' + id);
    assert.equal(api.getCustomerUpdateTarget().record_id, companion);
});

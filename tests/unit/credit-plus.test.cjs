const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const source = fs.readFileSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_credit_ajax.server.js', 'utf8');
const recordId = 'a'.repeat(32), ids = ['b', 'c', 'd', 'e'].map(ch => ch.repeat(32));
const iterator = values => { let i = 0; return { hasNext: () => i < values.length, next: () => values[i++] }; };
function xmlNode(value) {
    const name = Object.keys(value).find(key => key !== ':@');
    const children = Array.isArray(value[name]) ? value[name] : [];
    return { getNodeName: () => name, getAttribute: key => value[':@']?.['@_' + key] || null,
        getTextContent: () => name === '#text' ? String(value[name]) : children.map(child => xmlNode(child).getTextContent()).join(''),
        getChildNodeIterator: () => iterator(children.map(xmlNode)) };
}
function payload(code, author = 'original', extra = '') {
    return `<record_update table="sp_widget"><sp_widget action="INSERT_OR_UPDATE"><sys_id>${recordId}</sys_id><sys_updated_by>${author}</sys_updated_by><sys_updated_on>2026-10-01 00:00:00</sys_updated_on><script><![CDATA[${code}]]></script><client_script/><${'description'}>Not script</description>${extra}</sp_widget><sys_app_file><sys_id>${ids[3]}</sys_id><script>Companion code</script></sys_app_file></record_update>`;
}
function update(index, code, extras = {}) {
    const time = '2026-10-' + String(index + 1).padStart(2, '0') + ' 00:00:00';
    const entry = { sys_id: ids[index], name: 'sp_widget_' + recordId, update_set: String(index + 1).repeat(32), sys_updated_on: time, sys_updated_by: 'importer', payload: payload(code, ['original', 'second', 'third'][index]), ...extras };
    entry.payload = entry.payload.replace('2026-10-01 00:00:00', extras.sourceTime === undefined ? time : extras.sourceTime);
    return entry;
}
function harness(entries = [], admin = true, scriptFields = ['script', 'client_script'], updateSets = [], catalog = {}) {
    const queries = [];
    const context = { Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        Object: Object.assign(Object.create(Object), { extendsObject: (_base, methods) => methods }),
        gs: { hasRole: role => role === 'admin' && admin, getProperty: (name, fallback) => catalog.properties?.[name] ?? fallback },
        GlideDateTime: function (value) {
            const time = Date.parse((value || '2026-10-14 12:00:00').replace(' ', 'T') + 'Z');
            this.isValid = () => Number.isFinite(time);
            this.getNumericValue = () => time;
        },
        XMLDocument2: function () {
            let parsed;
            this.parseXML = text => {
                if (XMLValidator.validate(text) !== true) return false;
                parsed = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false }).parse(text);
                return true;
            };
            this.getDocumentElement = () => xmlNode(parsed.find(value => !value['?xml']));
        },
        GlideRecord: function (table) {
            queries.push(table);
            if (table === 'sys_update_set' || table === 'sys_remote_update_set') {
                let current, matches = [], cursor = 0, ids = [];
                this.get = id => { current = updateSets.find(set => set.table === table && set.id === id); return !!current; };
                this.addQuery = (key, operator, value) => { assert.equal(key, 'sys_id'); assert.equal(operator, 'IN'); ids = value.split(','); };
                this.query = () => { matches = updateSets.filter(set => set.table === table && ids.includes(set.id)); };
                this.next = () => { current = matches[cursor++]; return !!current; };
                this.getUniqueValue = () => current.id;
                this.canRead = () => current.readable !== false;
                this.getElement = () => ({ canRead: () => current.nameReadable !== false });
                this.getValue = key => current[key];
                return;
            }
            assert.notEqual(table, 'sys_update_version', 'Credit must not read update versions');
            if (table !== 'sys_update_xml') {
                let current, filtered = [], cursor = 0, start = 0, end = Infinity, order = 'name';
                const filters = [], metadata = (catalog.tables || []).find(entry => entry.name === table);
                const rows = table === 'sys_db_object' ? catalog.tables || [] : catalog.records?.[table] || [];
                const display = catalog.display?.[table] || 'name';
                this.isValid = () => table === 'sp_widget' || !!metadata;
                this.getLabel = () => metadata?.label || 'Widget';
                this.getDisplayName = () => display;
                this.initialize = () => {};
                this.getElements = () => {
                    const elements = [...(catalog.fields?.[table] || scriptFields), 'description'].map(field => {
                        const name = typeof field === 'string' ? field : field.name;
                        return { getName: () => name, getLabel: () => field.label || name, getED: () => ({ getInternalType: () => field.type || (name === 'description' ? 'string' : name === 'client_script' ? 'script_plain' : 'script') }) };
                    });
                    return { size: () => elements.length, get: index => elements[index] };
                };
                this.getValue = key => current[key] || '';
                this.get = id => { current = rows.find(entry => entry.sys_id === id); return !!current; };
                this.getElement = key => ({ canRead: () => current[key + 'Readable'] !== false });
                this.getUniqueValue = () => current.sys_id;
                this.getDisplayValue = () => current[display];
                this.canRead = () => current.readable !== false;
                this.addJoinQuery = () => ({ addCondition() {} });
                this.addQuery = (...args) => { const group = [args]; filters.push(group); return { addOrCondition: (...other) => group.push(other) }; };
                this.orderBy = key => order = key;
                this.chooseWindow = (from, to) => { start = from; end = to; };
                this.query = () => {
                    filtered = rows.filter(entry => groupMatches(entry)).sort((a, b) => String(a[order]).localeCompare(String(b[order]))).slice(start, end);
                };
                const groupMatches = entry => filters.every(group => group.some(([key, op, value]) => value === undefined ? entry[key] === op : op === 'IN' ? value.split(',').includes(String(entry[key])) : op === 'CONTAINS' && String(entry[key] || '').toLowerCase().includes(value.toLowerCase())));
                this.next = () => { current = filtered[cursor++]; return !!current; };
                return;
            }
            const records = entries;
            let current, filtered, i = 0; const filters = [], orders = [];
            this.get = id => { current = records.find(entry => entry.sys_id === id); return !!current && current.readable !== false; };
            this.canRead = () => current.readable !== false;
            this.getElement = name => ({ canRead: () => current[name + 'Readable'] !== false && (name === 'source' ? current.sourceReadable !== false : name === 'payload' ? current.payloadReadable !== false : true), getRefRecord: () => assert.fail('Use source_table and source explicitly') });
            this.getUniqueValue = () => current.sys_id;
            this.getValue = key => current[key] ?? '';
            this.addQuery = (...args) => { const group = [args]; filters.push(group); return { addOrCondition: (...alternative) => group.push(alternative) }; };
            this.orderBy = key => orders.push([key, 1]);
            this.orderByDesc = key => orders.push([key, -1]);
            this.setLimit = limit => this.limit = limit;
            this.query = () => {
                filtered = records.filter(entry => filters.every(group => group.some(([key, op, value]) => value === undefined ? entry[key] === op : entry[key] <= value)))
                    .sort((a, b) => { for (const [key, direction] of orders) { const order = String(a[key] || '').localeCompare(String(b[key] || '')) * direction; if (order) return order; } return 0; }).slice(0, this.limit);
            };
            this.next = () => { current = filtered[i++]; return !!current; };
        }
    };
    vm.runInNewContext(source, context);
    const api = context.WidgetEditorCreditAjax.prototype;
    api.getParameter = name => name === 'sysparm_update' ? entries.at(-1)?.sys_id : '';
    return { api, queries };
}
const plain = result => JSON.parse(JSON.stringify(result));

test('admin guards deny every public entry before querying records', () => {
    const { api, queries } = harness([], false);
    assert.equal(api.canView({}), false);
    assert.equal(JSON.parse(api.validateLaunch()).success, false);
    assert.equal(JSON.parse(api.getCredit()).success, false);
    assert.equal(JSON.parse(api.getComparison()).success, false);
    assert.equal(JSON.parse(api.getStatistics()).success, false);
    assert.equal(JSON.parse(api.getContributors()).success, false);
    assert.equal(JSON.parse(api.getTables()).success, false);
    assert.equal(JSON.parse(api.getRecords()).success, false);
    assert.equal(api.buildUpdate, undefined);
    assert.throws(() => api.getPageDescription(ids[0]), /Administrator/);
    assert.deepEqual(queries, []);
});

test('browser worker retains source attribution across snapshots', () => {
    const engine = browserAnalysis({ max_lines: 50000, diff_work: 20000000 });
    const result = engine.process('credit', {
        success: true, field: 'script', snapshots: [
            { id: ids[0], author: 'original', values: { script: 'var a = 1;\nvar b = 2;' } },
            { id: ids[1], author: 'second', values: { script: ' var a=1;\nvar b = 3;' } },
        ],
    });
    assert.deepEqual(plain(result.lines.map(line => line.update)), [ids[0], ids[1]]);
    assert.deepEqual(plain(result.updates.map(entry => entry.id)), ids.slice(0, 2));
});

test('discovery includes effective inherited script_plain fields', () => {
    const { api } = harness([update(0, 'server();')]);
    const result = JSON.parse(api.getCredit());
    assert.deepEqual(result.fields.map(field => field.name), ['client_script', 'script']);
    assert.equal(api.canView({ getUniqueValue: () => ids[0] }), true);
    assert.equal(harness([update(0, '')], true, []).api.canView({ getUniqueValue: () => ids[0] }), false);
});

test('all supported script field types are discovered with the correct editor language', () => {
    const expected = {
        email_script: 'javascript', html_script: 'html', script: 'javascript', script_client: 'javascript',
        script_plain: 'javascript', script_server: 'javascript', conditions: 'plaintext', condition_string: 'javascript',
        variable_conditions: 'plaintext', workflow_conditions: 'plaintext', html: 'html', html_template: 'html',
        json: 'json', json_translations: 'json',
    };
    const types = Object.keys(expected);
    const fields = types.concat(['string', 'condition', 'css', 'toString']).map(type => ({ name: 'field_' + type, type }));
    const { api } = harness([update(0, 'code();')], true, fields);
    const result = JSON.parse(api.getCredit());
    assert.equal(result.success, true, result.error);
    assert.equal(JSON.parse(api.validateLaunch()).success, true);
    assert.deepEqual(Object.fromEntries(result.fields.map(field => [field.name.slice(6), field.language])), expected);
});

test('customer updates resolve local and retrieved sets directly and respect read access', () => {
    const sets = [{ id: '1'.repeat(32), table: 'sys_update_set', name: 'Original release' }, { id: '2'.repeat(32), table: 'sys_remote_update_set', name: 'Imported release' }];
    const entries = [update(0, 'retained();'), update(1, 'added();', { update_set: '', remote_update_set: sets[1].id })];
    const { api, queries } = harness(entries, true, undefined, sets);
    const result = JSON.parse(api.getCredit());
    assert.deepEqual(result.tableApi.history.map(entry => entry.updateSet), sets);
    assert.equal(queries.includes('sys_update_version'), false);
    for (const inaccessible of [{ update_setReadable: false }, { update_set: 'invalid' }])
        assert.equal(JSON.parse(harness([update(0, 'code();', inaccessible)], true, undefined, sets).api.getCredit()).tableApi.history[0].updateSet, null);
    for (const access of [{ readable: false }, { nameReadable: false }])
        assert.equal(JSON.parse(harness([entries[0]], true, undefined, [{ ...sets[0], ...access }]).api.getCredit()).tableApi.history[0].updateSet, null);
});

test('launch and Credit metadata work with customer updates alone', () => {
    const set = { id: '2'.repeat(32), table: 'sys_update_set', name: 'Feature work' };
    const { api } = harness([update(0, 'old();'), update(1, 'captured();'), update(2, 'future();')], true, undefined, [set]);
    api.getParameter = key => key === 'sysparm_update' ? ids[1] : key === 'sysparm_field' ? 'script' : '';
    assert.equal(JSON.parse(api.validateLaunch()).success, true);
    const result = JSON.parse(api.getCredit());
    assert.equal(result.selected, ids[1]);
    assert.equal(result.lines, undefined);
    assert.equal(result.tableApi.history.length, 3);
    assert.equal(result.tableApi.history[1].updateSet.id, set.id);
    assert.deepEqual(result.updateSets.map(entry => entry.id), ids.slice(0, 3));
    assert.equal(result.updateSets[1].name, 'Feature work');
});

test('Customer Update timestamps order history independently of XML source edit times', () => {
    const entries = [update(2, 'future();', { sys_updated_on: '2026-09-01 00:00:00' }), update(0, 'baseline();', { sys_updated_on: '2026-10-13 00:00:00' }), update(1, 'baseline();\nadded();')];
    const result = JSON.parse(harness(entries).api.getCredit());
    assert.deepEqual(result.tableApi.history.map(entry => entry.id), [ids[2], ids[1], ids[0]]);
    assert.equal(result.updateSets.at(-1).time, '2026-10-13 00:00:00');
});

test('duplicate set names and reverted snapshots retain distinct Customer Update identities', () => {
    const first = update(0, 'baseline();');
    const entries = [first, { ...first, sys_id: ids[3] }, update(1, 'changed();'), update(2, 'baseline();')];
    const result = JSON.parse(harness(entries).api.getCredit());
    assert.equal(result.selected, ids[2]);
    assert.deepEqual(result.tableApi.history.map(entry => entry.id), [ids[0], ids[3], ids[1], ids[2]]);
});

test('absent or unreadable customer updates fail without reading update versions', () => {
    const { api } = harness();
    api.getParameter = () => ids[0];
    assert.match(JSON.parse(api.getCredit()).error, /unavailable/);
    api.getParameter = () => 'invalid';
    assert.match(JSON.parse(api.getCredit()).error, /valid customer update/);
    for (const access of [{ readable: false }, { payloadReadable: false }])
        assert.match(JSON.parse(harness([update(0, 'code();', access)]).api.getCredit()).error, /unavailable or unreadable/);
});

test('initial page description reads customer update metadata without exposing code', () => {
    const entry = update(0, 'historical();', { payload: payload('historical();', 'author', '<name>Historical widget</name>') });
    const { api, queries } = harness([entry]);
    assert.equal(api.getPageDescription(entry.sys_id), 'Historical widget (Widget)');
    assert.deepEqual(queries, ['sys_update_xml', 'sp_widget']);
});

test('XML parser preserves CDATA, decodes entities and ignores companion records', () => {
    const { api } = harness();
    const parsed = api._payload({ getValue: key => key === 'payload' ? payload('if (a < b) {\n  return "&value";\n}', 'user', '<escaped>&lt;tag&gt;&amp;</escaped>') : '' });
    assert.equal(parsed.id, recordId);
    assert.equal(parsed.values.script, 'if (a < b) {\n  return "&value";\n}');
    assert.equal(parsed.values.escaped, '<tag>&');
});

test('malformed, DTD, ambiguous and invalid target payloads fail closed', () => {
    const { api } = harness();
    for (const raw of ['<record_update>', '<!DOCTYPE record_update><record_update/>', payload('x').replace(recordId, 'invalid'), payload('x').replace('</record_update>', `<sp_widget><sys_id>${recordId}</sys_id></sp_widget></record_update>`), payload('x').replace('<script>', '<script>').replace('</sp_widget>', '<script>duplicate</script></sp_widget>')]) {
        assert.throws(() => api._payload({ getValue: key => key === 'payload' ? raw : '' }));
    }
    api.getParameter = () => 'bad';
    assert.match(JSON.parse(api.getCredit()).error, /valid customer update/);
});





test('timestamp ties order deterministically without reading historical payloads', () => {
    const entries = [update(0, 'a();', { sys_created_on: '2026-10-01 01:00:00' }), update(1, 'b();', { sys_updated_on: '2026-10-01 00:00:00', sys_created_on: '2026-10-01 02:00:00' })];
    const { api } = harness(entries.reverse());
    api.getParameter = () => ids[1];
    api._loadEntry = () => assert.fail('Metadata must not load history payloads');
    assert.deepEqual(JSON.parse(api.getCredit()).tableApi.history.map(entry => entry.id), ids.slice(0, 2));
});

test('LCS preserves whitespace and moved functions including repeated delimiters', () => {
    const engine = browserAnalysis({ max_lines: 50000, diff_work: 20000000 });
    const before = ['function alpha() {', '  alphaValue();', '}', 'function beta() {', '  betaValue();', '}'];
    const after = ['function beta() {', ' betaValue();', '}', 'function alpha() {', ' alphaValue();', '}'];
    const map = plain(engine.match(before, after, { remaining: 10000000 }));
    assert.deepEqual(map, [3, 4, 5, 0, 1, 2]);
});

test('unique moved lines retain attribution while copies and reintroduced lines do not reuse origins', () => {
    const engine = browserAnalysis({ max_lines: 50000, diff_work: 20000000 });
    const map = engine.match(['alpha();', 'beta();', 'gamma();'], ['gamma();', 'alpha();', 'beta();', 'alpha();'], { remaining: 10000000 });
    assert.equal(map[0], 2);
    assert.equal(map[3], undefined);
});

test('large sparse diffs work without a quadratic matrix and limits produce partial matching', () => {
    const engine = browserAnalysis({ max_lines: 50000, diff_work: 20000000 });
    const before = Array.from({ length: 12000 }, (_, i) => 'line' + i + '();');
    const after = before.slice(); after[6000] = 'changed();';
    const map = engine.match(before, after, { remaining: 100 });
    assert.equal(map[5999], 5999); assert.equal(map[6000], undefined); assert.equal(map[6001], 6001);
    assert.equal(map.partial, undefined);
    const repeated = engine.match(Array(1000).fill('a();').concat('b();'), ['b();'].concat(Array(1000).fill('a();')), { remaining: 1 });
    assert.equal(repeated.partial, true);
    assert.equal(engine.match([], Array(50001).fill('x'), { remaining: 100 }).partial, true);
});

test('random duplicate-line diffs never reuse origins or match unequal text', () => {
    const engine = browserAnalysis({ max_lines: 50000, diff_work: 20000000 });
    let seed = 41;
    const random = () => (seed = (seed * 16807) % 2147483647);
    for (let run = 0; run < 200; run++) {
        const oldLines = Array.from({ length: random() % 20 }, () => ['a();', 'b();', '}', '', 'c();'][random() % 5]);
        const newLines = Array.from({ length: random() % 20 }, () => [' a(); ', 'b();', '}', '', 'c();'][random() % 5]);
        const map = engine.match(oldLines, newLines, { remaining: 1000000 });
        const matched = [...map].filter(index => index !== undefined);
        assert.equal(new Set(matched).size, matched.length);
        map.forEach((oldIndex, newIndex) => assert.equal(oldLines[oldIndex].replace(/\s/g, ''), newLines[newIndex].replace(/\s/g, '')));
    }
});

test('context-menu selection validates a single selection server-side before opening the page', () => {
    const action = fs.readFileSync('src/fluent/generated/server-development/ui-action/widget_editor_credit.client.js', 'utf8');
    for (const selection of ['', ids[0] + ',' + ids[1], ids[0]]) {
        let calls = 0, opened = '', alert = '';
        const context = { g_list: { getChecked: () => selection }, alert: value => alert = value, g_navigation: { open: value => opened = value },
            GlideAjax: function () { calls++; this.addParam = () => {}; this.getXMLAnswer = callback => callback('{"success":true}'); } };
        vm.runInNewContext(action, context); context.openCreditPlus();
        assert.equal(calls, selection === ids[0] ? 1 : 0);
        assert.equal(!!opened, selection === ids[0]);
        assert.equal(!!alert, selection !== ids[0]);
    }
    let opened = false, message;
    const context = { rowSysId: ids[0], alert: value => message = value, g_navigation: { open: () => opened = true },
        GlideAjax: function () { this.addParam = () => {}; this.getXMLAnswer = callback => callback('{"success":false,"error":"Administrator access is required."}'); } };
    vm.runInNewContext(action, context); context.openCreditPlus();
    assert.equal(opened, false); assert.match(message, /Administrator/);
});

test('context launch uses the clicked row even when other records are checked', () => {
    const action = fs.readFileSync('src/fluent/generated/server-development/ui-action/widget_editor_credit.client.js', 'utf8');
    let requested;
    const context = { rowSysId: ids[0], g_list: { getChecked: () => ids[1] + ',' + ids[2] }, alert: () => assert.fail('Unexpected selection error'),
        g_navigation: { open: url => { assert.ok(url.startsWith('/nav_to.do?uri=')); assert.equal(decodeURIComponent(url.split('uri=')[1]), 'ui_page.do?sys_id=9c5bf170283e4d6394aa639c79936587&sysparm_update=' + ids[0]); } },
        GlideAjax: function () { this.addParam = (key, value) => { if (key === 'sysparm_update') requested = value; }; this.getXMLAnswer = cb => cb('{"success":true}'); } };
    vm.runInNewContext(action, context); context.openCreditPlus();
    assert.equal(requested, ids[0]);
});

test('missing source author/time uses customer update metadata fallback', () => {
    const data = update(0, 'baseline();');
    data.payload = data.payload.replace(/<sys_updated_by>.*?<\/sys_updated_by>/, '').replace(/<sys_updated_on>.*?<\/sys_updated_on>/, '');
    const result = JSON.parse(harness([data]).api.getComparison());
    assert.equal(result.right.sys_created_by, 'importer');
    assert.equal(result.right.sys_created_on, data.sys_updated_on);
});

test('metadata limits retain the selected update and pass browser limits through', () => {
    const properties = { 'monaco.plus.credit.max_updates': '2', 'monaco.plus.credit.max_history_chars': '10' };
    const { api } = harness([update(0, 'old();'), update(1, 'middle();'), update(2, 'current();')], true, undefined, [], { properties });
    api.getParameter = () => ids[0];
    const result = JSON.parse(api.getCredit());
    assert.equal(result.partial, true);
    assert.deepEqual(result.tableApi.history.map(entry => entry.id), ids.slice(0, 3));
    assert.equal(result.tableApi.limits.max_history_chars, 10);
    const invalid = harness([], true, undefined, [], { properties: { 'monaco.plus.credit.max_updates': 'invalid', 'monaco.plus.credit.diff_work': '-1' } }).api._limits();
    assert.equal(invalid.max_updates, 5000); assert.equal(invalid.diff_work, 20000000);
});

test('Credit+ is declared only as an admin list context action', () => {
    const metadata = fs.readFileSync('src/fluent/generated/server-development/ui-action/sys_ui_action_widget_editor_credit.now.ts', 'utf8');
    assert.match(metadata, /list: \{ showContextMenu: true \}/);
    assert.doesNotMatch(metadata, /showBannerButton|showListChoice|form:|openCreditPlusForm/);
    assert.match(metadata, /condition: "gs.hasRole\('admin'\)"/);
    assert.match(metadata, /table: 'sys_update_xml'/);
    assert.match(metadata, /\$id: '28b873b73b36441ab6175ebeacffaab9'[\s\S]*active: false/);
});


test('record navigation resolves the newest Customer Update without update-version history', () => {
    const { api, queries } = harness([update(2, 'newest();', { sys_updated_on: '2026-09-01 00:00:00' }), update(0, 'baseline();', { sys_updated_on: '2026-10-13 00:00:00' }), update(1, 'middle();')]);
    api.getParameter = key => ({ sysparm_table: 'sp_widget', sysparm_record: recordId, sysparm_field: 'script' })[key] || '';
    const result = JSON.parse(api.getCredit());
    assert.equal(result.success, true);
    assert.equal(result.selected, ids[0]);
    assert.equal(result.lines, undefined);
    assert.equal(queries.filter(table => table === 'sys_update_xml').length, 2, 'History metadata query and selected update only');
    for (const params of [{ sysparm_table: 'sp_widget', sysparm_record: 'invalid' }, { sysparm_table: 'sp_widget^ORactive=true', sysparm_record: recordId }]) {
        api.getParameter = key => params[key] || '';
        assert.match(JSON.parse(api.getCredit()).error, /valid table and record/);
    }
    const wrong = harness([update(0, 'wrong();', { payload: payload('wrong();').replace(recordId, ids[3]) })]).api;
    wrong.getParameter = key => ({ sysparm_table: 'sp_widget', sysparm_record: recordId })[key] || '';
    assert.match(JSON.parse(wrong.getCredit()).error, /different record/);
});

test('table picker searches labels and names, includes inherited code fields and paginates', () => {
    const tables = Array.from({ length: 51 }, (_, index) => ({ sys_id: String(index), name: 't_' + String(index).padStart(3, '0'), label: 'Table ' + String(index).padStart(3, '0') }));
    const { api } = harness([], true, [{ name: 'inherited_script', type: 'script_plain' }], [], { tables, fields: { t_007: [] } });
    api.getParameter = () => '';
    const first = JSON.parse(api.getTables());
    assert.equal(first.results.length, 49);
    assert.equal(first.has_more, true);
    assert.equal(first.results.some(item => item.id === 't_007'), false);
    api.getParameter = key => ({ sysparm_page: '2' })[key] || '';
    assert.deepEqual(JSON.parse(api.getTables()).results, [{ id: 't_050', text: 'Table 050' }]);
    api.getParameter = key => ({ sysparm_search: 't_031' })[key] || '';
    assert.deepEqual(JSON.parse(api.getTables()).results, [{ id: 't_031', text: 'Table 031' }]);
    api.getParameter = key => key === 'sysparm_search' ? 'TABLE 030' : '';
    assert.deepEqual(JSON.parse(api.getTables()).results, [{ id: 't_030', text: 'Table 030' }]);
    api.getParameter = key => key === 'sysparm_page' ? '-1' : '';
    assert.equal(JSON.parse(api.getTables()).success, false);
});

test('record picker searches the display field, pages securely and rejects invalid tables', () => {
    const rows = Array.from({ length: 52 }, (_, index) => ({ sys_id: String(index).padStart(32, '0'), title: 'Title ' + String(index).padStart(3, '0'), readable: index !== 0 }));
    const { api } = harness([], true, undefined, [], { records: { sp_widget: rows }, display: { sp_widget: 'title' } });
    api.getParameter = key => ({ sysparm_table: 'sp_widget' })[key] || '';
    const first = JSON.parse(api.getRecords());
    assert.equal(first.results.length, 49);
    assert.equal(first.has_more, true);
    assert.equal(first.results[0].text, 'Title 001');
    api.getParameter = key => ({ sysparm_table: 'sp_widget', sysparm_search: 'title 031' })[key] || '';
    assert.deepEqual(JSON.parse(api.getRecords()).results, [{ id: rows[31].sys_id, text: rows[31].title }]);
    api.getParameter = key => ({ sysparm_table: 'sp_widget', sysparm_page: '2' })[key] || '';
    assert.equal(JSON.parse(api.getRecords()).results.length, 2);
    api.getParameter = key => key === 'sysparm_table' ? 'sp_widget^ORactive=true' : '';
    assert.equal(JSON.parse(api.getRecords()).success, false);
    api.getParameter = key => ({ sysparm_table: 'sp_widget', sysparm_page: '10001' })[key] || '';
    assert.equal(JSON.parse(api.getRecords()).success, false);
});


test('field discovery sorts by label rather than internal field name', () => {
    const fields = [{ name: 'z_code', label: 'Alpha', type: 'script' }, { name: 'a_code', label: 'Zulu', type: 'script' }, { name: 'm_code', label: 'Beta', type: 'script_plain' }];
    const { api } = harness([], true, fields);
    assert.deepEqual(plain(api._fields('sp_widget').map(field => field.name)), ['z_code', 'm_code', 'a_code']);
});

test('collapsed viewer metadata includes authors for every set without calculating or returning code', () => {
    const { api } = harness([update(0, 'secret();'), update(1, 'later();'), update(2, 'future();')]);
    api._match = () => { throw Error('Attribution must be deferred until a field is opened'); };
    api.getParameter = name => ({ sysparm_update: ids[1], sysparm_context: 'true' })[name] || '';
    const result = JSON.parse(api.getCredit());
    assert.equal(result.success, true);
    assert.equal(result.selected, ids[1]);
    assert.deepEqual(result.updateSets.map(set => set.author), ['importer', 'importer', 'importer']);
    assert.equal(result.lines, undefined);
    assert.equal(result.updates, undefined);
    assert.equal(JSON.stringify(result).includes('secret();'), false);
});


test('Compare+ receives adjacent Customer Update snapshots, including local/retrieved sets and baseline', () => {
    const entries = [update(0, 'original();'), update(1, 'changed();'), update(2, 'future();')];
    const { api, queries } = harness(entries);
    api.getParameter = name => name === 'sysparm_update' ? ids[1] : '';
    const result = JSON.parse(api.getComparison());
    assert.equal(result.success, true);
    assert.equal(result.table, 'sp_widget'); assert.equal(result.record, recordId);
    assert.equal(result.left.sys_id, ids[0]); assert.equal(result.right.sys_id, ids[1]);
    assert.equal(result.left.fields.script, 'original();'); assert.equal(result.right.fields.script, 'changed();');
    assert.equal(result.right.sys_created_by, 'second');
    assert.equal(queries.includes('sys_update_version'), false);
    api.getParameter = name => name === 'sysparm_update' ? ids[0] : '';
    const baseline = JSON.parse(api.getComparison());
    assert.equal(baseline.success, true); assert.deepEqual(baseline.left.fields, {});
    assert.equal(baseline.left.sys_id, 'credit_baseline');
    assert.equal(baseline.right.fields.script, 'original();');
});

test('Compare+ rejects missing, unreadable, malformed, ambiguous and mismatched snapshots', () => {
    for (const entries of [
        [update(0, '', { payload: '<broken>' }), update(1, 'new();')],
        [update(0, '', { payload: payload('old();').replace(recordId, 'f'.repeat(32)) }), update(1, 'new();')],
        [update(0, 'old();', { payloadReadable: false }), update(1, 'new();')]
    ]) {
        const { api } = harness(entries); api.getParameter = name => name === 'sysparm_update' ? ids[1] : '';
        assert.equal(JSON.parse(api.getComparison()).success, false);
    }
    const { api } = harness([update(0, 'only();')]); api.getParameter = name => name === 'sysparm_update' ? ids[2] : '';
    assert.equal(JSON.parse(api.getComparison()).success, false);
});

test('Compare+ keeps historical reference display values and does not recover deleted code', () => {
    const entries = [update(0, '', { payload: payload('old();').replace('<script>', '<script>') .replace('</sp_widget>', '<owner display_value="Earlier owner">' + 'f'.repeat(32) + '</owner></sp_widget>') }), update(1, '', { payload: `<record_update table="sp_widget"><sp_widget action="DELETE"><sys_id>${recordId}</sys_id></sp_widget></record_update>` })];
    const { api } = harness(entries); api.getParameter = name => name === 'sysparm_update' ? ids[1] : '';
    const result = JSON.parse(api.getComparison());
    assert.equal(result.success, true); assert.equal(result.left.display_values.owner, 'Earlier owner');
    assert.deepEqual(result.right.fields, {});
});


test('inline comparison selects the requested earlier update from the same record history', () => {
    const { api } = harness([update(0, 'first();'), update(1, 'middle();'), update(2, 'selected();')]);
    api.getParameter = name => ({ sysparm_update: ids[2], sysparm_from_update: ids[0] })[name] || '';
    const result = JSON.parse(api.getComparison());
    assert.equal(result.success, true);
    assert.equal(result.left.fields.script, 'first();'); assert.equal(result.right.fields.script, 'selected();');
    for (const from of [ids[2], 'unknown']) {
        api.getParameter = name => ({ sysparm_update: ids[1], sysparm_from_update: from })[name] || '';
        assert.equal(JSON.parse(api.getComparison()).success, false);
    }
    api.getParameter = name => ({ sysparm_update: ids[1], sysparm_from_update: ids[1] })[name] || '';
    assert.match(JSON.parse(api.getComparison()).error, /different update set/);
});


test('statistics use readable record creation metadata, and do not infer a founder or age', () => {
    const entries = [update(0, 'hello();')];
    const record = { sys_id: recordId, sys_created_by: 'live founder', sys_created_on: '2026-10-02 12:00:01' };
    const get = row => JSON.parse(harness(entries, true, undefined, [], { records: { sp_widget: row ? [row] : [] } }).api.getStatistics());
    assert.equal(get(record).ageDays, 11);
    assert.equal(get(record).founder, 'live founder');
    assert.equal(get(record).creationSource, 'record');
    assert.equal(get({ ...record, sys_created_byReadable: false }).founder, '');
    for (const date of ['', 'bad', '2027-01-01 00:00:00']) assert.equal(get({ ...record, sys_created_on: date }).ageDays, null);
    assert.equal(get(null).ageDays, null); assert.equal(get(null).founder, '');
    assert.equal(get(null).unknownSetCount, 1);
});

test('statistics resolve readable users by exact username for leaders and founder in one query', () => {
    const entries = [update(0, 'one();', { payload: payload('one();', 'user,one', '<sys_created_by>founder</sys_created_by>') }), update(1, 'two();')];
    const users = [
        { sys_id: '1'.repeat(32), user_name: 'user,one' },
        { sys_id: '2'.repeat(32), user_name: 'founder' },
        { sys_id: '3'.repeat(32), user_name: 'second', readable: false },
        { sys_id: '4'.repeat(32), user_name: 'unrelated' }
    ];
    const { api, queries } = harness(entries, true, undefined, [], { records: { sys_user: users } });
    api.getParameter = key => ({ sysparm_update: ids[1], sysparm_authors: '["user,one","second"]' })[key] || '';
    const result = JSON.parse(api.getStatistics());
    assert.equal(result.success, true, result.error);
    assert.equal(result.founderUserId, users[1].sys_id);
    assert.equal(result.creators.find(entry => entry.name === 'user,one').userId, users[0].sys_id);
    assert.equal(result.creators.find(entry => entry.name === 'second').userId, '');
    assert.equal(queries.filter(table => table === 'sys_user').length, 1);
    users[0].user_nameReadable = false;
    assert.equal(JSON.parse(api.getStatistics()).creators.find(entry => entry.name === 'user,one').userId, '');
});

test('missing customer updates return a distinct empty-history code', () => {
    const { api } = harness();
    api.getParameter = key => ({ sysparm_table: 'sp_widget', sysparm_record: recordId, sysparm_context: 'true' })[key] || '';
    assert.equal(JSON.parse(api.getCredit()).errorCode, 'no_customer_updates');
});



test('metadata does not parse historical XML and set counts use IDs instead of display names', () => {
    const entries = [update(0, 'one();'), update(1, 'two();'), update(2, 'three();', {update_set: '2'.repeat(32)})];
    const sets = [1,2].map(i => ({table:'sys_update_set', id:String(i).repeat(32), name:'Same name'}));
    const { api } = harness(entries, true, ['script'], sets);
    const stats = JSON.parse(api.getStatistics());
    assert.equal(stats.updateSetCount, 2); assert.equal(stats.fieldTotals.length, 1);
    api._loadEntry = () => assert.fail('Collapsed metadata must not parse historical XML');
    const context = JSON.parse(api.getCredit());
    assert.equal(context.updateSets.length, 3); assert.equal(context.requestTimeout, 180000);
});

test('Credit Script Include name, ACL and caller metadata stay consistent', () => {
    const metadata = fs.readFileSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_credit_ajax.now.ts','utf8');
    const acl = fs.readFileSync('src/fluent/generated/security/access-control/sys_security_acl_widget_editor_credit.now.ts','utf8');
    assert.match(metadata, /name: 'WidgetEditorCreditAjax'/); assert.match(metadata, /global.WidgetEditorCreditAjax/);
    assert.match(acl, /name: 'WidgetEditorCreditAjax'/);
    const properties = fs.readFileSync('src/fluent/generated/properties/system-property/sys_properties_widget_editor_credit.now.ts','utf8');
    assert.equal((properties.match(/installMethod: 'first install'/g)||[]).length, 7);
    assert.equal((properties.match(/roles: \{ read: \['admin'\], write: \['admin'\] \}/g)||[]).length,7);
});

test('update-set names are fetched in bounded bulk queries instead of one query per snapshot', () => {
    const entries = Array.from({length:501}, (_, i) => update(0, 'same();', {
        sys_id:(i+1000).toString(16).padStart(32,'0'), update_set:(i+2000).toString(16).padStart(32,'0')
    }));
    const sets = entries.map(entry => ({table:'sys_update_set',id:entry.update_set,name:'Default'}));
    const { api, queries } = harness(entries,true,['script'],sets);
    const context = JSON.parse(api.getCredit());
    assert.equal(context.updateSets.length,501);
    assert.equal(queries.filter(table => table === 'sys_update_set').length,2);
    assert.equal(queries.filter(table => table === 'sys_update_xml').length,2);
});

test('moving multiple functions keeps repeated closing delimiters with their original blocks', () => {
    const engine = browserAnalysis({ max_lines: 50000, diff_work: 20000000 });
    const blocks = Array.from({length:8}, (_, i) => ['function f' + i + '() {', '  doWork' + i + '();', '}']);
    const original = blocks.flat();
    for (let shift = 1; shift < blocks.length; shift++) {
        const moved = blocks.slice(shift).concat(blocks.slice(0,shift)).flat();
        const mapping = engine.match(original,moved,{remaining:10000000});
        assert.equal(mapping.filter(index => index !== undefined).length,moved.length);
        mapping.forEach((oldIndex,newIndex) => assert.equal(original[oldIndex],moved[newIndex]));
    }
});

test('repeated-line matching remains complete across 100 large Customer Updates within the default budget', () => {
    const entries = [], history = [];
    for (let revision = 0; revision < 100; revision++) {
        let blocks = Array.from({length:350 + revision % 12}, (_, i) =>
            'function f' + i + '() {\n    return ' + (i + (i % 17 === revision % 17 ? revision : 0)) + ';\n}');
        if (revision % 9 === 0) blocks = blocks.slice(20).concat(blocks.slice(0,20));
        let code = blocks.join('\n');
        if (revision && revision % 13 === 0) code = history[revision - 6];
        else if (revision && revision % 10 === 2) code = history[revision - 1].replace(/    /g,'  ');
        history.push(code);
        entries.push(update(0,code,{sys_id:revision.toString(16).padStart(32,'0'),sys_updated_on:String(revision).padStart(4,'0')}));
    }
    const engine = browserAnalysis({ max_lines: 50000, diff_work: 20000000 });
    const result = engine.process('credit', { field: 'script', snapshots: history.map((code, i) => ({ id: entries[i].sys_id, values: { script: code } })) });
    assert.equal(result.updates.length,100);
    assert.deepEqual(plain(result.warnings),[]);
    assert.equal(result.lines.map(line => line.text).join('\n'),history.at(-1));
    assert.ok(result.lines.every(line => line.update));
});

test('dense repeated-line diffs retain at least the optimal ordered matches without reusing a source', () => {
    const engine = browserAnalysis({ max_lines: 50000, diff_work: 20000000 });
    let seed = 197;
    const random = () => (seed = seed * 16807 % 2147483647);
    for (let run = 0; run < 80; run++) {
        const before = Array.from({length:80 + random() % 30}, () => 'repeat' + random() % 3 + '();');
        const after = Array.from({length:80 + random() % 30}, () => 'repeat' + random() % 3 + '();');
        const lcs = Array(after.length + 1).fill(0);
        for (const line of before) {
            let diagonal = 0;
            for (let j = 1; j <= after.length; j++) {
                const prior = lcs[j];
                lcs[j] = line === after[j-1] ? diagonal + 1 : Math.max(lcs[j],lcs[j-1]);
                diagonal = prior;
            }
        }
        const map = engine.match(before,after,{remaining:2000000});
        const sources = [...map].filter(index => index !== undefined);
        assert.equal(map.partial,undefined);
        assert.ok(sources.length >= lcs.at(-1));
        assert.equal(new Set(sources).size,sources.length);
        map.forEach((i,j) => assert.equal(before[i],after[j]));
    }
});

test('reassigned Customer Updates use their current reference and change the history fingerprint', () => {
    const sets = [{id:'1'.repeat(32),table:'sys_update_set',name:'Original'}, {id:'2'.repeat(32),table:'sys_update_set',name:'Destination'}];
    const entries = [update(0,'one();'),update(1,'one();\ntwo();')];
    const {api} = harness(entries,true,['script'],sets);
    const before = api._historyKey(api._customerUpdates(entries[0].name,ids[1]));
    entries[0].update_set = sets[1].id;
    entries[0].sys_mod_count = '2';
    const result = JSON.parse(api.getCredit());
    assert.equal(result.tableApi.history[0].updateSet.id,sets[1].id);
    assert.equal(result.lines, undefined);
    assert.notEqual(api._historyKey(api._customerUpdates(entries[0].name,ids[1])),before);
});

function browserAnalysis(limits) {
    const context = {};
    vm.runInNewContext(fs.readFileSync('src/fluent/generated/client-development/ui-script/widget_editor_credit_worker.js', 'utf8'),context);
    return new context.CreditAnalysis(limits);
}

test('browser statistics count reverts and preserve missing-history gaps', () => {
    const engine = browserAnalysis({ max_lines: 50000, diff_work: 20000000 });
    function batch(value) {
        return {
            fields: [{ name: 'script' }],
            snapshots: [{ id: ids[0], author: 'a', values: { script: value } }],
            creators: [{ name: 'a', added: 0, removed: 0 }],
            fieldTotals: [{ name: 'Script', added: 0, removed: 0 }],
            added: 0, removed: 0, gaps: 0, partial: false,
        };
    }
    const results = ['one();', 'two();', 'one();'].map(code => engine.process('statistics', batch(code)));
    assert.equal(results.reduce((sum, result) => sum + result.added, 0), 3);
    assert.equal(results.reduce((sum, result) => sum + result.removed, 0), 2);
    assert.equal(engine.process('statistics', batch(null)).partial, true);
    assert.equal(engine.process('statistics', batch('unknown();')).added, 0);
});

test('Table API context supplies authorised ordered IDs, raw set references and limits without history matching',()=>{
    const entries=[update(0,'one();'),update(1,'two();')];
    const {api}=harness(entries);
    api._match=()=>assert.fail('context must not match');
    const context=JSON.parse(api.getCredit());
    assert.equal(context.tableApi.name,'sp_widget_'+recordId);
    assert.deepEqual(Array.from(context.tableApi.history,e=>e.id),entries.map(e=>e.sys_id));
    assert.equal(context.tableApi.history[0].updateSetId,entries[0].update_set);
    assert.equal(context.tableApi.limits.max_history_chars,100000000);
    assert.equal(context.tableApi.history.some(e=>'payload' in e),false);
    assert.match(JSON.parse(harness(entries,false).api.getCredit()).error,/Administrator/);
});

test('statistics context resolves browser contributors without comparing history',()=>{
    const entries=[update(0,'one();'),update(1,'two();')];const {api}=harness(entries);
    api.getParameter=name=>({sysparm_update:entries[1].sys_id,sysparm_context:'true',sysparm_authors:'["original","second"]'})[name]||'';
    api._match=()=>assert.fail('context must not match');
    const stats=JSON.parse(api.getStatistics());
    assert.equal(stats.success,true);assert.equal(stats.added,0);
    assert.equal(stats.snapshots,undefined);assert.equal(stats.nextCursor,undefined);
    assert.equal(stats.destroyers,undefined);assert.equal(stats.creatorSets,undefined);
    assert.deepEqual(stats.creators.map(a=>a.name),['original','second']);
    api.getParameter=name=>({sysparm_update:entries[1].sys_id,sysparm_context:'true',sysparm_authors:'{}'})[name]||'';
    assert.match(JSON.parse(api.getStatistics()).error,/Invalid contributor/);
});

test('whitespace modes distinguish spacing, indentation and trailing whitespace without stale keys', () => {
    const oldLines=['  alpha(  beta );  ', 'gamma();'];
    const newLines=['\talpha( beta );', 'gamma( );'];
    const limits={max_lines:50000,diff_work:20000000};
    for(const [mode,expected] of [['all',[0,1]],['none',[undefined,undefined]],['changes',[0,undefined]],['eol',[undefined,undefined]]]) {
        const engine=browserAnalysis(limits);engine.whitespace=mode;
        const result=engine.match(oldLines,newLines,{remaining:limits.diff_work});
        assert.deepEqual([result[0],result[1]],expected,mode);
    }
    const engine=browserAnalysis(limits);engine.whitespace='eol';
    assert.equal(engine.match(['alpha();  '],['alpha();\t'],{remaining:limits.diff_work})[0],0);
    engine.whitespace='none';
    assert.equal(engine.match(['alpha();  '],['alpha();\t'],{remaining:limits.diff_work})[0],undefined);
    assert.deepEqual(oldLines.slice(),['  alpha(  beta );  ', 'gamma();']);
});


test('statistics metadata skips historical XML when record creation details are readable', () => {
    const record = { sys_id: recordId, sys_created_by: 'founder', sys_created_on: '2026-10-02 00:00:00' };
    const { api } = harness([update(0, 'old();'), update(1, 'new();')], true, undefined, [], {
        records: { sp_widget: [record] },
    });
    api._loadEntry = () => assert.fail('Readable creation details must not parse historical XML');
    api._match = () => assert.fail('Statistics metadata must not match code');
    const stats = JSON.parse(api.getStatistics());
    assert.equal(stats.success, true, stats.error);
    assert.equal(stats.founder, 'founder');
    assert.equal(stats.ageDays, 12);
    assert.equal(stats.creationSource, 'record');
});

test('statistics metadata validates contributors and the fallback creation snapshot', () => {
    const entries = [update(0, 'old();', { payload: payload('old();', 'original',
        '<sys_created_by>founder</sys_created_by><sys_created_on>2026-10-01 00:00:00</sys_created_on>') }), update(1, 'new();')];
    const { api } = harness(entries, true, undefined, [], { properties: { 'monaco.plus.credit.max_updates': '2' } });
    const get = authors => {
        api.getParameter = key => ({ sysparm_update: ids[1], sysparm_authors: authors })[key] || '';
        return JSON.parse(api.getStatistics());
    };
    const stats = get('["original","second","original"]');
    assert.equal(stats.success, true, stats.error);
    assert.equal(stats.founder, 'founder');
    assert.equal(stats.ageDays, 13);
    assert.equal(stats.creationSource, 'snapshot');
    assert.equal(stats.contributorCount, 2);
    assert.equal(stats.creators.every(author => author.added === 0 && author.removed === 0), true);
    for (const authors of ['{}', '[null]', '[1]', JSON.stringify(['x'.repeat(257)]), '["a","b","c","d"]', '['])
        assert.equal(get(authors).success, false);
    entries[0].payload = entries[0].payload.replace(recordId, ids[3]);
    assert.match(get('[]').error, /different records/);
});


test('Credit requests always return Table API metadata and have no server attribution entry point', () => {
    const { api } = harness([update(0, 'secret();'), update(1, 'later();')]);
    api.getParameter = name => ({ sysparm_update: ids[1], sysparm_field: 'script', sysparm_snapshots: 'true', sysparm_cursor: '1' })[name] || '';
    api._loadEntry = () => assert.fail('Credit metadata must not load historical code');
    const result = JSON.parse(api.getCredit());
    assert.equal(result.success, true, result.error);
    assert.deepEqual(result.tableApi.history.map(entry => entry.id), ids.slice(0, 2));
    for (const key of ['lines', 'updates', 'snapshots', 'warnings']) assert.equal(result[key], undefined);
    assert.equal(JSON.stringify(result).includes('secret();'), false);
    for (const method of ['buildUpdate', '_match', '_lines', '_fieldSnapshotBatch', '_codeSnapshot'])
        assert.equal(api[method], undefined);
    assert.equal(fs.existsSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_credit_engine.now.ts'), false);
});


test('Credit+ module opens its verified UI page below Code Search+ and stays admin-only', () => {
    const folder = 'src/fluent/generated/user-interface/module/';
    const modules = fs.readdirSync(folder).filter(name => name.endsWith('.now.ts')).map(name => {
        const metadata = fs.readFileSync(folder + name, 'utf8');
        return { metadata, title: metadata.match(/\n        title: '([^']+)'/)?.[1], order: Number(metadata.match(/order: (\d+)/)?.[1]) };
    }).filter(module => module.title).sort((left, right) => left.order - right.order);
    const searchIndex = modules.findIndex(module => module.title === 'Code Search+');
    const credit = modules[searchIndex + 1];
    assert.equal(credit.title, 'Credit+');
    assert.match(credit.metadata, /roles: \['admin'\]/);
    assert.match(credit.metadata, /override_menu_roles: true/);
    const page = fs.readFileSync('src/fluent/generated/other/sys-ui-page/sys_ui_page_widget_editor_credit.now.ts', 'utf8');
    assert.match(page, /endpoint: 'widget_editor_credit\.do'/);
    const acl = fs.readFileSync('src/fluent/generated/security/access-control/sys_security_acl_widget_editor_credit.now.ts', 'utf8');
    assert.match(acl, /name: 'widget_editor_credit'/);
    const pageId = page.match(/\$id: '([0-9a-f]{32})'/)[1];
    assert.equal(pageId, '9c5bf170283e4d6394aa639c79936587');
    assert.ok(credit.metadata.includes("query: 'ui_page.do?sys_id=" + pageId + "'"));
    assert.equal(new Set(modules.map(module => module.order)).size, modules.length);
});

test('statistics combine username casing and return only readable, valid user photos', () => {
    const photo = '5'.repeat(32), userId = '1'.repeat(32);
    const users = [{ sys_id: userId, user_name: 'ada', photo }];
    const { api } = harness([update(0, 'one();')], true, undefined, [], { records: { sys_user: users } });
    api.getParameter = key => ({ sysparm_update: ids[0], sysparm_authors: '["Ada","ADA","ada"]' })[key] || '';
    let stats = JSON.parse(api.getStatistics());
    assert.equal(stats.success, true, stats.error);
    assert.deepEqual(stats.creators, [{ name: 'ada', added: 0, removed: 0, photo, userId }]);
    users[0].photo = photo + '.iix';
    assert.equal(JSON.parse(api.getStatistics()).creators[0].photo, photo);
    users[0].photoReadable = false;
    assert.equal(JSON.parse(api.getStatistics()).creators[0].photo, '');
    users[0].photoReadable = true; users[0].photo = 'https://example.com/photo';
    assert.equal(JSON.parse(api.getStatistics()).creators[0].photo, '');
});

test('browser activity totals match statistics and combine differently cased contributors', () => {
    const engine = browserAnalysis({ max_lines: 50000, diff_work: 20000000 });
    const stats = engine.process('statistics', {
        fields: [{ name: 'script' }],
        creators: [{ name: 'Ada', added: 0, removed: 0 }, { name: 'ADA', added: 0, removed: 0 }],
        snapshots: ['one();\ntwo();', 'three();', null, 'unknown();', 'known();'].map((code, index) => ({
            id: ids[index % ids.length], time: '2026-01-0' + (index + 1) + ' 00:00:00',
            author: index % 2 ? 'ADA' : 'ada', values: { script: code },
            updateSet: { id: '1'.repeat(32), table: 'sys_update_set', name: 'Release' },
        })),
        fieldTotals: [{ name: 'Script', added: 0, removed: 0 }], added: 0, removed: 0, gaps: 0,
    });
    assert.equal(stats.creators.length, 1);
    assert.equal(stats.creators[0].added, stats.added);
    assert.equal(stats.creators[0].removed, stats.removed);
    assert.equal(stats.activity.reduce((total, point) => total + point.added, 0), stats.added);
    assert.equal(stats.activity.reduce((total, point) => total + point.removed, 0), stats.removed);
    assert.deepEqual(plain(stats.activity.map(point => [point.added, point.removed, point.available])),
        [[2, 0, true], [1, 2, true], [0, 0, false], [0, 0, false], [1, 1, true]]);
    assert.equal(stats.activity[0].updateSet.name, 'Release');
});

test('statistics use readable live-profile avatars ahead of user photos in one batch', () => {
    const userId = '1'.repeat(32), userPhoto = '2'.repeat(32), profilePhoto = '3'.repeat(32);
    const user = { sys_id: userId, user_name: 'ada', photo: userPhoto + '.iix' };
    const profile = { sys_id: '4'.repeat(32), document: userId, photo: profilePhoto + '.iix' };
    const { api, queries } = harness([update(0, 'one();')], true, undefined, [], { records: {
        sys_user: [user], live_profile: [profile, { sys_id: '6'.repeat(32), document: '7'.repeat(32), photo: '8'.repeat(32) + '.iix' }],
    } });
    api.getParameter = key => ({ sysparm_update: ids[0], sysparm_authors: '["Ada","ADA"]' })[key] || '';
    const photo = () => JSON.parse(api.getStatistics()).creators[0].photo;
    assert.equal(photo(), profilePhoto);
    assert.equal(queries.filter(table => table === 'live_profile').length, 1);
    user.photo = '';
    assert.equal(photo(), profilePhoto, 'Live-profile avatars work when the user Photo field is empty');
    user.photo = userPhoto;
    for (const field of ['readable', 'documentReadable', 'photoReadable']) {
        profile[field] = false;
        assert.equal(photo(), userPhoto, 'An unreadable live profile retains the readable user photo');
        delete profile[field];
    }
    profile.photo = 'https://example.com/avatar';
    assert.equal(photo(), userPhoto, 'External image URLs remain rejected');
    user.readable = false;
    assert.equal(photo(), undefined, 'An unreadable contributor is not used to query live-profile photos');
});


test('attribution contributors reuse permission-checked photos without loading history and reject invalid input', () => {
    const userId = '1'.repeat(32), photo = '2'.repeat(32);
    const user = { sys_id: userId, user_name: 'ada', photo: '3'.repeat(32) };
    const profile = { sys_id: '4'.repeat(32), document: userId, photo };
    const { api, queries } = harness([], true, undefined, [], { records: { sys_user: [user], live_profile: [profile] } });
    let names = ['ada', 'ADA', 'missing'];
    api.getParameter = () => JSON.stringify(names);
    let result = JSON.parse(api.getContributors());
    assert.equal(result.success, true);
    assert.deepEqual(result.contributors.ada, { name: 'ada', userId, photo });
    assert.deepEqual(result.contributors.missing, { name: 'missing', userId: '' });
    assert.deepEqual(queries, ['sys_user', 'live_profile']);
    user.readable = false;
    result = JSON.parse(api.getContributors());
    assert.equal(result.contributors.ada.photo, undefined);
    assert.equal(queries.filter(table => table === 'live_profile').length, 1);
    for (names of [{}, [null], ['x'.repeat(257)], Array(5002).fill('ada')]) {
        const count = queries.length;
        assert.equal(JSON.parse(api.getContributors()).success, false);
        assert.equal(queries.length, count);
    }
    api.getParameter = () => 'not JSON';
    assert.equal(JSON.parse(api.getContributors()).success, false);
});

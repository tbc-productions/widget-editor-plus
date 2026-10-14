const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const source = fs.readFileSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_credit.server.js', 'utf8');
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
        GlideRecordSecure: function (table) {
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
                const groupMatches = entry => filters.every(group => group.some(([key, op, value]) => value === undefined ? entry[key] === op : op === 'CONTAINS' && String(entry[key] || '').toLowerCase().includes(value.toLowerCase())));
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
    const api = context.WidgetEditorCredit.prototype;
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
    assert.equal(JSON.parse(api.getTables()).success, false);
    assert.equal(JSON.parse(api.getRecords()).success, false);
    assert.throws(() => api.buildUpdate(ids[0]), /Administrator/);
    assert.throws(() => api.getPageDescription(ids[0]), /Administrator/);
    assert.deepEqual(queries, []);
});

test('selected historical update set excludes newer snapshots and retains source attribution', () => {
    const { api } = harness([update(0, 'var a = 1;\nvar b = 2;'), update(1, ' var a=1;\nvar b = 3;'), update(2, 'future();')]);
    const result = plain(api.buildUpdate(ids[1], 'script'));
    assert.deepEqual(result.lines.map(line => line.update), [ids[0], ids[1]]);
    assert.deepEqual(result.updates.map(entry => entry.id), [ids[0], ids[1]]);
    assert.equal(result.updates[0].author, 'original');
    assert.equal(result.updates[0].time, '2026-10-01 00:00:00');
    assert.deepEqual(result.fields.map(field => field.name), ['client_script', 'script']);
    assert.equal(result.updates[1].code, undefined);
    assert.equal(result.updates[1].before, undefined);
    assert.equal(result.updates[1].removed, undefined);
});

test('discovery includes effective inherited script_plain fields and empty script snapshots', () => {
    const { api } = harness([update(0, 'server();')]);
    const result = api.buildUpdate(ids[0], 'client_script');
    assert.equal(result.lines.length, 0);
    assert.equal(api.canView({ getUniqueValue: () => ids[0] }), true);
    assert.throws(() => api.buildUpdate(ids[0], 'description'), /Choose a script field/);
    assert.equal(harness([update(0, '')], true, []).api.canView({ getUniqueValue: () => ids[0] }), false);
});

test('HTML templates and both JavaScript and encoded condition fields are discovered with their language', () => {
    const types = ['html_template', 'condition_string', 'conditions', 'condition'];
    const fields = types.map(type => ({ name: type, type }));
    const xml = types.map(type => '<' + type + '><![CDATA[' + (type === 'html_template' ? '<p>Template</p>' : type === 'conditions' ? 'active=true^EQ' : 'current.active == true') + ']]></' + type + '>').join('');
    const { api } = harness([update(0, '', { payload: payload('', 'author', xml) })], true, fields);
    assert.equal(JSON.parse(api.validateLaunch()).success, true);
    for (const type of types) {
        const result = api.buildUpdate(ids[0], type);
        assert.equal(result.field, type);
        assert.equal(result.lines.length, 1);
        assert.equal(result.fields.find(field => field.name === type).language, type === 'html_template' ? 'html' : type === 'conditions' ? 'plaintext' : 'javascript');
    }
});

test('customer updates resolve local and retrieved sets directly and respect read access', () => {
    const sets = [{ id: '1'.repeat(32), table: 'sys_update_set', name: 'Original release' }, { id: '2'.repeat(32), table: 'sys_remote_update_set', name: 'Imported release' }];
    const entries = [update(0, 'retained();'), update(1, 'retained();\nadded();', { update_set: '', remote_update_set: sets[1].id })];
    const { api, queries } = harness(entries, true, undefined, sets);
    const result = plain(api.buildUpdate(ids[1], 'script'));
    assert.deepEqual(result.updates.map(entry => entry.updateSet), sets);
    assert.equal(result.lines[0].update, ids[0]);
    assert.equal(queries.includes('sys_update_version'), false);
    for (const inaccessible of [{ update_setReadable: false }, { update_set: 'invalid' }])
        assert.equal(harness([update(0, 'code();', inaccessible)], true, undefined, sets).api.buildUpdate(ids[0], 'script').updates[0].updateSet, null);
    for (const access of [{ readable: false }, { nameReadable: false }])
        assert.equal(harness([entries[0]], true, undefined, [{ ...sets[0], ...access }]).api.buildUpdate(ids[0], 'script').updates[0].updateSet, null);
});

test('launch and credit work with customer updates alone and stop at the selected update set', () => {
    const set = { id: '2'.repeat(32), table: 'sys_update_set', name: 'Feature work' };
    const { api } = harness([update(0, 'old();'), update(1, 'captured();'), update(2, 'future();')], true, undefined, [set]);
    api.getParameter = key => key === 'sysparm_update' ? ids[1] : key === 'sysparm_field' ? 'script' : '';
    assert.equal(JSON.parse(api.validateLaunch()).success, true);
    const result = JSON.parse(api.getCredit());
    assert.equal(result.selected, ids[1]);
    assert.equal(result.lines[0].text, 'captured();');
    assert.equal(result.updates.length, 2);
    assert.equal(result.updates[1].updateSet.id, set.id);
    assert.deepEqual(result.updateSets.map(entry => entry.id), ids.slice(0, 3));
    assert.equal(result.updateSets[1].name, 'Feature work');
});

test('Customer Update timestamps order history independently of XML source edit times', () => {
    const entries = [update(2, 'future();', { sys_updated_on: '2026-09-01 00:00:00' }), update(0, 'baseline();', { sys_updated_on: '2026-10-13 00:00:00' }), update(1, 'baseline();\nadded();')];
    const result = harness(entries).api.buildUpdate(ids[1], 'script');
    assert.deepEqual(plain(result.updates.map(entry => entry.id)), [ids[2], ids[1]]);
    assert.equal(result.lines[0].update, ids[1]);
    assert.equal(result.updateSets.at(-1).time, '2026-10-13 00:00:00');
});

test('duplicate set names and reverted snapshots retain distinct Customer Update identities', () => {
    const first = update(0, 'baseline();');
    const duplicate = { ...first, sys_id: ids[3] };
    const { api } = harness([first, duplicate, update(1, 'baseline();\nnew();')]);
    const result = api.buildUpdate(ids[3], 'script');
    assert.equal(result.selected, ids[3]);
    assert.equal(result.updates.length, 2);
    assert.equal(result.lines[0].update, ids[0]);
    const reverted = harness([first, update(1, 'changed();', { update_set: first.update_set }), update(2, 'baseline();', { update_set: first.update_set })]).api.buildUpdate(ids[2], 'script');
    assert.equal(reverted.updates.length, 3);
    assert.equal(reverted.lines[0].update, ids[2]);
});

test('absent or unreadable customer updates fail without reading update versions', () => {
    assert.throws(() => harness().api.buildUpdate(ids[0]), /unavailable/);
    assert.throws(() => harness().api.buildUpdate('invalid'), /valid customer update/);
    for (const access of [{ readable: false }, { payloadReadable: false }])
        assert.throws(() => harness([update(0, 'code();', access)]).api.buildUpdate(ids[0]), /unavailable or unreadable/);
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
    assert.throws(() => api.buildUpdate('bad'), /valid customer update/);
});

test('empty and absent fields differ; history gaps reset attribution', () => {
    const missing = update(1, '', { payload: payload('').replace('<script><![CDATA[]]></script>', '') });
    const { api } = harness([update(0, 'same();'), missing, update(2, 'same();')]);
    const result = api.buildUpdate(ids[2], 'script');
    assert.equal(result.lines[0].update, ids[2]);
    assert.ok(result.warnings.some(warning => /interrupts/.test(warning)));
    assert.throws(() => api.buildUpdate(ids[1], 'script'), /absent/);
    const empty = harness([update(0, 'same();'), update(1, ''), update(2, 'same();')]).api.buildUpdate(ids[2], 'script');
    assert.equal(empty.lines[0].update, ids[2]);
});

test('deleted snapshots show no code and reset later attribution', () => {
    const deleted = update(1, 'same();', { payload: payload('same();').replace('INSERT_OR_UPDATE', 'DELETE') });
    const { api } = harness([update(0, 'same();'), deleted, update(2, 'same();')]);
    assert.equal(api.buildUpdate(ids[2], 'script').lines[0].update, ids[2]);
    const result = api.buildUpdate(ids[1], 'script');
    assert.equal(result.deleted, true);
    assert.equal(result.lines.length, 0);
    assert.equal(result.updates[1].author, 'importer');
    assert.equal(result.updates[1].time, deleted.sys_updated_on);
});

test('timestamp ties order deterministically and unavailable history does not hide current code', () => {
    const entries = [update(0, 'a();', { sys_created_on: '2026-10-01 01:00:00' }), update(1, 'b();', { sys_updated_on: '2026-10-01 00:00:00', sys_created_on: '2026-10-01 02:00:00' })];
    assert.deepEqual(plain(harness(entries.reverse()).api.buildUpdate(ids[1], 'script').updates.map(entry => entry.id)), ids.slice(0,2));
    assert.equal(harness([update(0, 'a();', { sys_updated_on: '', sys_created_on: '' })]).api.buildUpdate(ids[0], 'script').lines[0].text, 'a();');
    const partial = harness([update(0, 'a();', { payloadReadable: false }), update(1, 'b();')]).api.buildUpdate(ids[1], 'script');
    assert.equal(partial.lines[0].text, 'b();');
    assert.ok(partial.warnings.length);
    assert.throws(() => harness([update(0, 'a', { payload: payload('a').replace(recordId, ids[3]) }), update(1, 'b')]).api.buildUpdate(ids[1], 'script'), /different records/);
});

test('LCS preserves whitespace and moved functions including repeated delimiters', () => {
    const { api } = harness();
    const before = ['function alpha() {', '  alphaValue();', '}', 'function beta() {', '  betaValue();', '}'];
    const after = ['function beta() {', ' betaValue();', '}', 'function alpha() {', ' alphaValue();', '}'];
    const map = plain(api._match(before, after, { remaining: 10000000 }));
    assert.deepEqual(map, [3, 4, 5, 0, 1, 2]);
    const result = harness([update(0, before.join('\n')), update(1, after.join('\n'))]).api.buildUpdate(ids[1], 'script');
    assert.ok(result.lines.every(line => line.update === ids[0]));
});

test('unique moved lines retain attribution while copies and reintroduced lines do not reuse origins', () => {
    const { api } = harness();
    const map = api._match(['alpha();', 'beta();', 'gamma();'], ['gamma();', 'alpha();', 'beta();', 'alpha();'], { remaining: 10000000 });
    assert.equal(map[0], 2);
    assert.equal(map[3], undefined);
    const result = harness([update(0, 'alpha();'), update(1, 'beta();'), update(2, 'alpha();')]).api.buildUpdate(ids[2], 'script');
    assert.equal(result.lines[0].update, ids[2]);
});

test('large sparse diffs work without a quadratic matrix and limits produce partial matching', () => {
    const { api } = harness([update(0, 'a();\r\nb();\r')]);
    assert.deepEqual(plain(api.buildUpdate(ids[0], 'script').lines.map(line => line.text)), ['a();', 'b();', '']);
    const before = Array.from({ length: 12000 }, (_, i) => 'line' + i + '();');
    const after = before.slice(); after[6000] = 'changed();';
    const map = api._match(before, after, { remaining: 100 });
    assert.equal(map[5999], 5999); assert.equal(map[6000], undefined); assert.equal(map[6001], 6001);
    assert.equal(map.partial, undefined);
    const repeated = api._match(Array(1000).fill('a();').concat('b();'), ['b();'].concat(Array(1000).fill('a();')), { remaining: 1 });
    assert.equal(repeated.partial, true);
    assert.equal(api._match([], Array(50001).fill('x'), { remaining: 100 }).partial, true);
});

test('random duplicate-line diffs never reuse origins or match unequal text', () => {
    const { api } = harness();
    let seed = 41;
    const random = () => (seed = (seed * 16807) % 2147483647);
    for (let run = 0; run < 200; run++) {
        const oldLines = Array.from({ length: random() % 20 }, () => ['a();', 'b();', '}', '', 'c();'][random() % 5]);
        const newLines = Array.from({ length: random() % 20 }, () => [' a(); ', 'b();', '}', '', 'c();'][random() % 5]);
        const map = api._match(oldLines, newLines, { remaining: 1000000 });
        const matched = [...map].filter(index => index !== undefined);
        assert.equal(new Set(matched).size, matched.length);
        map.forEach((oldIndex, newIndex) => assert.equal(oldLines[oldIndex].replace(/\s/g, ''), newLines[newIndex].replace(/\s/g, '')));
    }
});

test('context-menu selection validates a single selection server-side before opening the page', () => {
    const action = fs.readFileSync('src/fluent/generated/server-development/ui-action/credit_plus.client.js', 'utf8');
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
    const action = fs.readFileSync('src/fluent/generated/server-development/ui-action/credit_plus.client.js', 'utf8');
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
    const result = harness([data]).api.buildUpdate(ids[0], 'script');
    assert.equal(result.updates[0].author, 'importer');
    assert.equal(result.updates[0].time, data.sys_updated_on);
    assert.deepEqual(plain(result.warnings), []);
});

test('generous configurable limits retain current code with partial attribution', () => {
    const entries = Array.from({ length: 501 }, (_, index) => ({ ...update(0, ''), sys_id: index.toString(16).padStart(32, '0'), update_set: (index + 1000).toString(16).padStart(32, '0') }));
    assert.equal(harness(entries).api.buildUpdate(entries.at(-1).sys_id, 'script').updates.length, 501);
    const properties = { 'monaco.plus.credit.max_updates': '2', 'monaco.plus.credit.max_history_chars': '10' };
    const result = harness([update(0,'old();'),update(1,'middle();'),update(2,'current();')], true, undefined, [], { properties }).api.buildUpdate(ids[2], 'script');
    assert.equal(result.lines[0].text, 'current();'); assert.equal(result.partial, true); assert.ok(result.warnings.length);
    const large = update(0, 'x'.repeat(2100000));
    assert.equal(harness([large]).api.buildUpdate(ids[0], 'script').lines[0].text.length, 2100000);
    const invalid = harness([], true, undefined, [], {properties: { 'monaco.plus.credit.max_updates': 'invalid', 'monaco.plus.credit.diff_work': '-1' }}).api._limits();
    assert.equal(invalid.max_updates, 5000); assert.equal(invalid.diff_work, 20000000);
});

test('attribution responses contain no removed-code history or duplicate snapshot code', () => {
    const result = harness([update(0, 'old();'), update(1, ''), update(2, 'old();')]).api.buildUpdate(ids[2], 'script');
    assert.equal(result.lines[0].update, ids[2]);
    assert.equal(result.removedCount, undefined);
    for (const snapshot of result.updates) for (const key of ['before', 'code', 'removed', 'removedOrigins', 'removedCount', 'added']) assert.equal(snapshot[key], undefined);
});

test('Credit+ is declared only as an admin list context action', () => {
    const metadata = fs.readFileSync('src/fluent/generated/server-development/ui-action/sys_ui_action_credit_plus.now.ts', 'utf8');
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
    assert.equal(result.lines[0].text, 'baseline();');
    assert.equal(queries.filter(table => table === 'sys_update_xml').length, 4, 'Metadata query, selected update and two earlier payloads');
    assert.throws(() => api.buildUpdate('', 'script', 'sp_widget', 'invalid'), /valid table and record/);
    assert.throws(() => api.buildUpdate('', 'script', 'sp_widget^ORactive=true', recordId), /valid table and record/);
    assert.throws(() => harness().api.buildUpdate('', 'script', 'sp_widget', recordId), /No Customer Updates/);
    assert.throws(() => harness([update(0, 'wrong();', { payload: payload('wrong();').replace(recordId, ids[3]) })]).api.buildUpdate('', 'script', 'sp_widget', recordId), /different record/);
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


test('statistics rank all fields and all update sets, count removers, and ignore whitespace and moves', () => {
    const fields = ['script', 'client_script', { name: 'template', label: 'Template', type: 'html_template' }];
    const xml = (script, client, template, author) => payload(script, author, '<template><![CDATA[' + template + ']]></template><sys_created_by>founder</sys_created_by><sys_created_on>2026-10-01 00:00:00</sys_created_on>').replace('<client_script/>', '<client_script><![CDATA[' + client + ']]></client_script>');
    const entries = [
        update(0, '', { payload: xml('a();\nb();', 'c();', '<p/>', 'original') }),
        update(1, '', { payload: xml(' b();\n a();', 'c();\nx();', '', 'bob') }),
        update(2, '', { payload: xml('a();', '', '<q/>', 'alice') }),
        update(3, '', { sys_updated_by: 'bob', payload: xml('a();', '', '<q/>', 'alice').replace('INSERT_OR_UPDATE', 'DELETE') })
    ];
    const sets = entries.map((entry, i) => ({ table: 'sys_update_set', id: entry.update_set, name: 'Set ' + i }));
    const { api } = harness(entries, true, fields, sets);
    api.getParameter = key => key === 'sysparm_update' ? ids[0] : ''; // Older selection still includes the entire history.
    const stats = JSON.parse(api.getStatistics());
    assert.equal(stats.success, true, stats.error);
    assert.equal(stats.added, 6); assert.equal(stats.removed, 6);
    assert.deepEqual(stats.creators.map(entry => [entry.name, entry.added]), [['original', 4], ['alice', 1], ['bob', 1]]);
    assert.deepEqual(stats.destroyers.map(entry => [entry.name, entry.removed]), [['alice', 3], ['bob', 3], ['original', 0]]);
    assert.deepEqual(stats.creatorSets.map(entry => entry.added), [4, 1, 1, 0]);
    assert.deepEqual(stats.destroyerSets.map(entry => entry.removed), [3, 2, 1, 0]);
    assert.equal(stats.updateSetCount, 4); assert.equal(stats.contributorCount, 3);
    assert.equal(stats.fieldCount, 3); assert.equal(stats.founder, 'founder'); assert.equal(stats.ageDays, 13);
    assert.equal(stats.creationSource, 'snapshot'); assert.equal(stats.gaps, 0);
    assert.equal(stats.biggestMakeover.name, 'Set 0');
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

test('statistics skip unavailable snapshots, support ties and report limits as partial', () => {
    const stat = (entries, fields, properties = {}) => JSON.parse(harness(entries, true, fields, [], { properties }).api.getStatistics());
    assert.equal(stat([update(0, 'bad', { payload: '<broken>' }), update(1, 'ok();')]).partial, true);
    assert.equal(stat([update(0, 'a();'), update(1, 'b();', { sys_updated_on: '2026-10-01 00:00:00' })]).success, true);
    assert.equal(stat([update(0, 'a();', { payload: payload('a();').replace(recordId, 'f'.repeat(32)) }), update(1, 'b();')]).success, false);
    assert.equal(stat([update(0, 'x\n'.repeat(5001))]).success, true);
    assert.equal(stat([update(0, 'x\n'.repeat(5001))], ['script'], { 'monaco.plus.credit.max_lines': '100' }).partial, true);
    const result = stat([update(0, 'a();'), update(1, '', { payload: payload('').replace('<script><![CDATA[]]></script>', '') }), update(2, 'a();\nb();')], ['script']);
    assert.equal(result.success, true, result.error); assert.equal(result.gaps, 1);
    assert.equal(result.added, 1); assert.equal(result.removed, 0);
    assert.equal(stat([update(0, '')]).creators[0].added, 0);
});

test('statistics include every user and update set, including zero totals', () => {
    const entries = ids.map((id, index) => update(index, '', { payload: payload('line();\n'.repeat(index + 1), 'author' + index) }));
    const stats = JSON.parse(harness(entries).api.getStatistics());
    assert.equal(stats.success, true, stats.error);
    for (const key of ['creators', 'destroyers', 'creatorSets', 'destroyerSets']) assert.equal(stats[key].length, 4);
    assert.equal(stats.destroyers.every(entry => entry.removed === 0), true);
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

test('statistics batches continue without double-counting and reject changed histories', () => {
    const entries = [update(0, 'a();'), update(1, 'a();\nb();'), update(2, 'b();')];
    const { api } = harness(entries, true, ['script'], [], { properties: { 'monaco.plus.credit.statistics_batch_size': '1' } });
    let cursor = '0', historyKey = '', added = 0, removed = 0, batches = 0;
    do {
        api.getParameter = key => ({ sysparm_update: ids[2], sysparm_cursor: cursor, sysparm_history_key: historyKey })[key] || '';
        const stats = JSON.parse(api.getStatistics());
        assert.equal(stats.success, true, stats.error);
        added += stats.added; removed += stats.removed; batches++;
        cursor = stats.nextCursor; historyKey = stats.historyKey;
    } while (cursor);
    assert.equal(batches, 3); assert.equal(added, 2); assert.equal(removed, 1);
    entries[1].sys_mod_count = '1';
    api.getParameter = key => ({ sysparm_update: ids[2], sysparm_cursor: '1', sysparm_history_key: historyKey })[key] || '';
    assert.match(JSON.parse(api.getStatistics()).error, /changed while loading/);
    api.getParameter = key => ({ sysparm_update: ids[2], sysparm_cursor: '-1' })[key] || '';
    assert.equal(JSON.parse(api.getStatistics()).success, false);
});

test('large histories exceeding the previous 10 MB cap still show code', () => {
    const entries = Array.from({length:6}, (_, i) => update(0, 'run();', {
        sys_id: (100 + i).toString(16).padStart(32, '0'),
        update_set: (200 + i).toString(16).padStart(32, '0'),
        sys_updated_on: '2026-10-0' + (i + 1) + ' 00:00:00',
        payload: payload('run();', 'author', '<notes>' + 'x'.repeat(1800000) + '</notes>')
    }));
    const { api } = harness(entries, true, ['script']);
    const result = api.buildUpdate(entries.at(-1).sys_id, 'script');
    assert.equal(result.lines[0].text, 'run();'); assert.equal(result.lines[0].update, entries[0].sys_id);
    assert.equal(result.warnings.length, 0);
});

test('metadata does not parse historical XML and set counts use IDs instead of display names', () => {
    const entries = [update(0, 'one();'), update(1, 'two();'), update(2, 'three();', {update_set: '2'.repeat(32)})];
    const sets = [1,2].map(i => ({table:'sys_update_set', id:String(i).repeat(32), name:'Same name'}));
    const { api } = harness(entries, true, ['script'], sets);
    const stats = JSON.parse(api.getStatistics());
    assert.equal(stats.updateSetCount, 2); assert.equal(stats.creatorSets.length, 3);
    api._loadEntry = () => assert.fail('Collapsed metadata must not parse historical XML');
    const context = api.buildUpdate(ids[2], '', '', '', true);
    assert.equal(context.updateSets.length, 3); assert.equal(context.requestTimeout, 180000);
});

test('Credit Script Include name, ACL and caller metadata stay consistent', () => {
    const metadata = fs.readFileSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_credit.now.ts','utf8');
    const acl = fs.readFileSync('src/fluent/generated/security/access-control/sys_security_acl_credit_plus.now.ts','utf8');
    assert.match(metadata, /name: 'WidgetEditorCredit'/); assert.match(metadata, /global.WidgetEditorCredit/);
    assert.match(acl, /name: 'WidgetEditorCredit'/);
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
    const context = api.buildUpdate(entries.at(-1).sys_id,'','','',true);
    assert.equal(context.updateSets.length,501);
    assert.equal(queries.filter(table => table === 'sys_update_set').length,2);
    assert.equal(queries.filter(table => table === 'sys_update_xml').length,2);
});

test('moving multiple functions keeps repeated closing delimiters with their original blocks', () => {
    const { api } = harness();
    const blocks = Array.from({length:8}, (_, i) => ['function f' + i + '() {', '  doWork' + i + '();', '}']);
    const original = blocks.flat();
    for (let shift = 1; shift < blocks.length; shift++) {
        const moved = blocks.slice(shift).concat(blocks.slice(0,shift)).flat();
        const mapping = api._match(original,moved,{remaining:10000000});
        assert.equal(mapping.filter(index => index !== undefined).length,moved.length);
        mapping.forEach((oldIndex,newIndex) => assert.equal(original[oldIndex],moved[newIndex]));
    }
});

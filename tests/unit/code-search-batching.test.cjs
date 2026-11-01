const { readUiPageSource } = require('../helpers/fluent-source.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vmModule = require('node:vm');

const serverSource = fs.readFileSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_code_search.server.js', 'utf8');
const pageSource = readUiPageSource('src/fluent/generated/other/sys-ui-page/sys_ui_page_widget_editor_code_search.now.ts');
const configId = 'a'.repeat(32);
const id = n => n.toString(16).padStart(32, '0');
const rows = count => Array.from({ length: count }, (_, i) => ({ sys_id: id(i + 1), script: 'needle', name: `Record ${count - i}` }));

function serverHarness(records, options = {}) {
    const queries = [];
    const reads = [], labelReads = [];
    function matchesQuery(row, encoded) {
        return encoded.split('^NQ').some(branch => {
            const groups = [];
            branch.split('^').filter(Boolean).forEach(part => {
                if (part.startsWith('OR')) groups[groups.length - 1].push(part.slice(2));
                else groups.push([part]);
            });
            return groups.every(group => group.some(condition => {
                const [, field, op, value] = condition.match(/^(\w+?)(CONTAINS|=|>)(.*)$/);
                const actual = String(row[field] || '');
                if (op === 'CONTAINS') return actual.toLowerCase().includes(value.toLowerCase());
                if (op === '>') return actual > value;
                return actual === value;
            }));
        });
    }
    function GlideRecord(table) {
        if (table === 'sn_codesearch_table') {
            let read = false;
            return {
                addQuery() {}, orderBy() {}, query() {},
                next() { if (read) return false; read = true; return true; },
                getUniqueValue() { return configId; },
                getValue(field) { return { table: 'x_script', search_fields: 'script', additional_filter: '' }[field] || ''; }
            };
        }
        let encoded = '', ordering, limit, found = [], index = -1;
        return {
            addQuery(field, op, value) {
                if (value === undefined) { value = op; op = '='; }
                encoded += (encoded ? '^' : '') + field + op + value;
                return { addOrCondition(f, o, v) {
                    if (v === undefined) { v = o; o = '='; }
                    encoded += '^OR' + f + o + v;
                } };
            },
            addEncodedQuery(value) { encoded += (encoded ? '^' : '') + value; },
            getEncodedQuery() { return encoded; },
            orderBy(field) { ordering = field; },
            setLimit(value) { limit = value; },
            query() {
                if (options.onQuery) options.onQuery();
                queries.push({ encoded, ordering, limit });
                found = records.filter(row => matchesQuery(row, encoded));
                if (ordering) found.sort((a, b) => a[ordering].localeCompare(b[ordering]));
                found = found.slice(0, limit);
            },
            next() { if (options.onNext) options.onNext(); return ++index < found.length; },
            isValidField(field) { return records.some(row => field in row); },
            getValue(field) { reads.push({ sysId: found[index].sys_id, field }); return found[index][field] || ''; },
            getDisplayValue(field) { return field ? this.getValue(field) : found[index].name; },
            getUniqueValue() { return found[index].sys_id; },
            getElement(field) { return { getLabel() { labelReads.push(field); return 'Script'; } }; }
        };
    }
    const context = {
        AbstractAjaxProcessor: {}, Class: { create() { return function () {}; } },
        GlideRecord, JSON, encodeURIComponent, Date: options.Date || Date,
        WidgetEditorAjax: function () { this._getEditorProfiles = () => options.editorProfiles || {}; }
    };
    context.Object = Object.create(Object);
    context.Object.extendsObject = (_base, members) => members;
    vmModule.runInNewContext(serverSource, context);
    const instance = new context.WidgetEditorCodeSearchAjax();
    instance._validTable = () => true;
    instance._validFields = () => ['script'];
    instance._validateFilter = () => ({ valid: true });
    instance._getTableDisplayConfig = () => ({ primaryField: '', secondaryFields: [] });
    instance._tableLabel = () => 'Scripts';
    instance._answer = value => JSON.parse(JSON.stringify(value));
    return {
        instance, queries, reads, labelReads,
        search(params = {}) {
            const input = { group_id: 'b'.repeat(32), table_config_id: configId, query: 'needle', batch_size: '25', ...params };
            instance._getParam = name => input[name] === undefined ? '' : String(input[name]);
            return instance.search();
        }
    };
}

test('batches return every record once, including the lookahead row, in stable cursor order', () => {
    const harness = serverHarness(rows(63).reverse());
    const found = [];
    let cursor = '';
    for (const expectedSize of [25, 25, 13]) {
        const batch = harness.search({ cursor });
        assert.equal(batch.success, true);
        assert.equal(batch.results.length, expectedSize);
        found.push(...batch.results.map(row => row.sysId));
        cursor = batch.nextCursor;
    }
    assert.equal(cursor, '');
    assert.equal(new Set(found).size, 63);
    assert.deepEqual(found.sort(), rows(63).map(row => row.sys_id));
    assert.ok(harness.queries.every(query => query.ordering === 'sys_id' && query.limit === 26));
});

test('empty batches advance past rejected candidates and preserve case and secondary filters', () => {
    const records = rows(503);
    records.forEach(row => { row.script = 'NEEDLE allowed'; });
    records[250].script = 'needle excluded';
    records[501].script = 'needle allowed';
    records[502].script = 'needle allowed';
    const harness = serverHarness(records);
    const params = { case_sensitive: 'true', secondary_filters: JSON.stringify([{ operator: 'contains', term: 'allowed' }]) };
    const first = harness.search(params);
    assert.deepEqual(first.results, []);
    assert.equal(JSON.parse(first.nextCursor).sysId, id(250));
    const second = harness.search({ ...params, cursor: first.nextCursor });
    assert.deepEqual(second.results, []);
    assert.equal(JSON.parse(second.nextCursor).scanned, 500);
    const third = harness.search({ ...params, cursor: second.nextCursor });
    assert.deepEqual(third.results.map(row => row.sysId).sort(), [id(502), id(503)]);
    assert.equal(third.nextCursor, '');
    assert.ok(harness.queries.every(query => query.limit === 251));
});

test('the result cap applies across batches and exact boundaries finish without an empty request', () => {
    for (const count of [50, 60]) {
        const harness = serverHarness(rows(count));
        const first = harness.search({ limit: 50 });
        const second = harness.search({ limit: 50, cursor: first.nextCursor });
        assert.equal(first.results.length + second.results.length, 50);
        assert.equal(second.nextCursor, '');
    }
    const harness = serverHarness(rows(600));
    let cursor = '', count = 0;
    do {
        const batch = harness.search({ cursor, batch_size: 1000, limit: 1000 });
        assert.ok(batch.results.length <= 100);
        count += batch.results.length;
        cursor = batch.nextCursor;
    } while (cursor);
    assert.equal(count, 500);
});

test('the cumulative scan budget terminates selective searches with a warning', () => {
    const harness = serverHarness(rows(700));
    harness.instance.MAX_SCAN_ROWS = 500;
    const params = { secondary_filters: JSON.stringify([{ operator: 'contains', term: 'absent' }]) };
    const first = harness.search(params);
    const second = harness.search({ ...params, cursor: first.nextCursor });
    assert.equal(second.nextCursor, '');
    assert.deepEqual(second.results, []);
    assert.match(second.skipped[0], /scan budget exceeded/);
});

test('saved OR branches retain the cursor and active filter while list ordering cannot disturb paging', () => {
    const records = rows(80).map((row, i) => ({ ...row, category: i % 2 ? 'one' : 'two', active: i % 3 ? 'true' : 'false' }));
    const harness = serverHarness(records);
    const params = {
        active_only: 'true',
        overrides: JSON.stringify({ [configId]: { additionalFilter: 'category=one^NQcategory=two^ORDERBYDESCname^EQ' } })
    };
    const found = [];
    let cursor = '';
    do {
        const batch = harness.search({ ...params, cursor });
        found.push(...batch.results.map(row => row.sysId));
        cursor = batch.nextCursor;
    } while (cursor);
    assert.deepEqual(found.sort(), records.filter(row => row.active === 'true').map(row => row.sys_id));
    assert.ok(harness.queries.every(query => !query.encoded.includes('ORDERBY')));
});

test('invalid cursors and ambiguous batch targets fail before querying records', () => {
    const harness = serverHarness(rows(2));
    for (const cursor of ['broken', 'null', '{}', JSON.stringify({ sysId: id(1), scanned: -1, matched: 0 }), JSON.stringify({ sysId: id(1), scanned: 1, matched: 2 })]) {
        assert.equal(harness.search({ cursor }).success, false);
    }
    assert.equal(harness.search({ table_config_id: '' }).success, false);
    assert.equal(harness.search({ batch_size: '1.5' }).success, false);
    assert.equal(harness.queries.length, 0);
});

test('unbatched callers retain the full response behavior', () => {
    const harness = serverHarness(rows(60));
    const result = harness.search({ batch_size: '', table_config_id: '', limit: 40 });
    assert.equal(result.results.length, 40);
    assert.equal(result.nextCursor, '');
});

test('secondary filters and snippets reuse field values and labels within a batch', () => {
    const harness = serverHarness(rows(3));
    let tableLabels = 0;
    harness.instance._tableLabel = () => { tableLabels++; return 'Scripts'; };
    const result = harness.search({ secondary_filters: JSON.stringify([
        { operator: 'contains', term: 'NEEDLE' },
        { operator: 'not_contains', term: 'absent', joiner: 'and' }
    ]) });
    assert.equal(result.results.length, 3);
    assert.deepEqual(harness.reads.filter(read => read.field === 'script').map(read => read.sysId), [id(1), id(2), id(3)]);
    assert.equal(tableLabels, 1);
    assert.deepEqual(harness.labelReads, ['script']);
});

test('processing budgets yield partial or empty batches without losing candidates', () => {
    let clock = 0;
    const records = rows(3);
    records[0].script = 'needle excluded';
    const harness = serverHarness(records, { Date: class extends Date { static now() { return clock; } } });
    const getValue = harness.instance._getSearchValue;
    harness.instance._getSearchValue = function (...args) {
        clock += 300;
        return getValue.apply(this, args);
    };
    const params = { secondary_filters: JSON.stringify([{ operator: 'not_contains', term: 'excluded' }]) };
    const first = harness.search(params);
    assert.deepEqual(first.results, []);
    assert.equal(first.scanned, 1);
    assert.equal(JSON.parse(first.nextCursor).sysId, id(1));
    const second = harness.search({ ...params, cursor: first.nextCursor });
    assert.deepEqual(second.results.map(row => row.sysId), [id(2)]);
    assert.equal(JSON.parse(second.nextCursor).scanned, 2);
    const third = harness.search({ ...params, cursor: second.nextCursor });
    assert.deepEqual(third.results.map(row => row.sysId), [id(3)]);
    assert.equal(third.nextCursor, '');
});

test('batch timings include deferred row reads in query time and separate processing time', () => {
    let clock = 0;
    const harness = serverHarness(rows(1), {
        Date: class extends Date { static now() { return clock; } },
        onQuery() { clock += 40; },
        onNext() { clock += 10; }
    });
    const prepare = harness.instance._prepareSnippetSource;
    harness.instance._prepareSnippetSource = function (value) {
        clock += 15;
        return prepare.call(this, value);
    };
    const result = harness.search();
    assert.equal(result.scanned, 1);
    assert.deepEqual(result.timings, { queryMs: 60, processingMs: 15, totalMs: 75 });
});

function clientHarness(tableCount = 1) {
    const requests = [], notices = [], renders = [];
    const vm = {
        selectedGroupId: 'group', query: 'needle', secondaryFilters: [], activeOnly: true,
        tables: Array.from({ length: tableCount }, (_, i) => ({ sysId: `config${i}`, table: `table${i}`, enabled: true, searchFields: 'script' }))
    };
    const noop = () => {};
    const context = {
        vm, currentSearchGen: 0, tableScrollRequest: 0, TABLE_SEARCH_TIMEOUT_MS: 25000,
        document: { getElementById() { return null; } },
        _disposeAllEditors: noop, updateUrlParam: noop, _updateTablesWithResults: noop,
        _updateGroupedResults() { renders.push(vm.results.slice()); },
        _updateSortedResults: noop, _updateCurrentViewedTable: noop, _requestTransactionCancel: noop,
        notify(message) { notices.push(message); },
        $timeout(fn) { fn(); },
        $q: { when: () => Promise.resolve() },
        ajaxWithTimeout(action, params) {
            return new Promise((resolve, reject) => requests.push({ action, params: { ...params }, resolve, reject }));
        }
    };
    const start = pageSource.indexOf('            vm.runSearch = function () {');
    const end = pageSource.indexOf('            vm.formatDate', start);
    vmModule.runInNewContext(pageSource.slice(start, end), context);
    return { vm, requests, notices, renders };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = (sysId, nextCursor = '') => ({ results: sysId ? [{ sysId, table: 'table0', matches: [] }] : [], nextCursor });

test('the client renders partial results before table completion and snapshots continuation inputs', async () => {
    const h = clientHarness();
    h.vm.runSearch();
    h.vm.query = 'changed';
    h.vm.activeOnly = false;
    h.vm.tables[0].searchFields = 'different';
    h.requests[0].resolve(response('first', 'cursor1'));
    await flush();
    assert.equal(h.vm.results.length, 1);
    assert.equal(h.vm.loading, true);
    assert.equal(h.vm.searchProgress.completed, 0);
    assert.equal(h.renders.at(-1).length, 1);
    assert.equal(h.requests[1].params.cursor, 'cursor1');
    assert.equal(h.requests[1].params.query, 'needle');
    assert.equal(h.requests[1].params.active_only, 'true');
    assert.equal(JSON.parse(h.requests[1].params.overrides).config0.searchFields, 'script');
    h.requests[1].resolve(response('second'));
    await flush();
    assert.equal(h.vm.results.length, 2);
    assert.equal(h.vm.loading, false);
    assert.equal(h.vm.searchProgress.completed, 1);
});

test('all batches for a table finish before the next table starts, including empty batches', async () => {
    const h = clientHarness(2);
    h.vm.runSearch();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].params.table_config_id, 'config0');
    h.requests[0].resolve(response(null, 'cursor1'));
    await flush();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].params.table_config_id, 'config0');
    assert.equal(h.requests[1].params.cursor, 'cursor1');
    assert.equal(h.vm.searchProgress.completed, 0);
    h.requests[1].resolve(response('first', 'cursor2'));
    await flush();
    assert.equal(h.requests.length, 3);
    assert.equal(h.requests[2].params.table_config_id, 'config0');
    assert.equal(h.requests[2].params.cursor, 'cursor2');
    assert.equal(h.vm.results.length, 1);
    assert.equal(h.vm.searchProgress.completed, 0);
    h.requests[2].resolve(response('second'));
    await flush();
    assert.equal(h.requests.length, 4);
    assert.equal(h.requests[3].params.table_config_id, 'config1');
    assert.equal(h.requests[3].params.cursor, '');
    assert.equal(h.vm.results.length, 2);
    assert.equal(h.vm.searchProgress.completed, 1);
    h.requests[3].resolve(response(null));
    await flush();
    assert.equal(h.vm.searchProgress.completed, 2);
    assert.equal(h.vm.loading, false);
});

test('cancellation keeps partial results and ignores late batches without scheduling more work', async () => {
    const h = clientHarness(2);
    h.vm.runSearch();
    h.requests[0].resolve(response('first', 'cursor1'));
    await flush();
    h.vm.cancelSearch();
    h.requests[1].resolve(response('late', 'cursor2'));
    await flush();
    assert.equal(h.requests.length, 2);
    assert.deepEqual(Array.from(h.vm.results, row => row.sysId), ['first']);
    assert.equal(h.vm.loading, false);
});

test('restarting ignores responses from the previous search generation', async () => {
    const h = clientHarness();
    h.vm.runSearch();
    h.vm.runSearch();
    h.requests[0].resolve(response('old', 'cursor1'));
    h.requests[1].resolve(response('new'));
    await flush();
    assert.equal(h.requests.length, 2);
    assert.deepEqual(Array.from(h.vm.results, row => row.sysId), ['new']);
});

test('a later batch failure retains earlier matches and advances to the next table', async () => {
    const h = clientHarness(2);
    h.vm.runSearch();
    h.requests[0].resolve(response('first', 'cursor1'));
    await flush();
    h.requests[1].reject(new Error('Timed out'));
    await flush();
    assert.deepEqual(Array.from(h.vm.results, row => row.sysId), ['first']);
    assert.equal(h.vm.searchProgress.completed, 1);
    assert.equal(h.requests.length, 3);
    assert.equal(h.requests[2].params.table_config_id, 'config1');
    assert.equal(h.vm.loading, true);
    h.requests[2].resolve(response(null));
    await flush();
    assert.equal(h.vm.searchProgress.completed, 2);
    assert.equal(h.vm.loading, false);
    assert.match(h.notices.at(-1), /1 table configuration\(s\) skipped/);
});

test('results for Widget Editor+ record types link to the editor', () => {
    const unsupported = serverHarness(rows(1)).search();
    assert.equal(unsupported.results[0].editorUrl, null);
    const supported = serverHarness(rows(1), { editorProfiles: { x_script: {} } }).search();
    assert.equal(supported.results[0].editorUrl, '/nav_to.do?uri=' + encodeURIComponent(
        'ui_page.do?sys_id=8b2e70458373fe1070b8b5dfeeaad35e&record_table=x_script&record_sys_id=' + id(1)));
    assert.equal((pageSource.match(/ng-if="result\.editorUrl" ng-href="\{\{result\.editorUrl\}\}"/g) || []).length, 2);
    assert.ok(!pageSource.includes('result.isWidget'));
});

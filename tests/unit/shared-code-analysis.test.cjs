const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { chromium } = require('@playwright/test');
const root = 'src/fluent/generated/';
const workerSource = fs.readFileSync(root + 'client-development/ui-script/widget_editor_code_analysis.js', 'utf8');
const serverSource = fs.readFileSync(root + 'server-development/script-include/sys_script_include_widget_editor_assistant.server.js', 'utf8');
const clientSource = fs.readFileSync(root + 'other/sys-ui-page/widget_editor_assistant.client.js', 'utf8');
const coreSource = fs.readFileSync(root + 'client-development/ui-script/monaco_plus_core.js', 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const id = value => value.repeat(32);

function worker() {
    class WorkerGlobalScope {}
    const self = new WorkerGlobalScope();
    const context = vm.createContext({ self, WorkerGlobalScope });
    vm.runInContext(workerSource, context);
    return input => {
        let response;
        self.postMessage = value => { response = value; };
        self.onmessage({ data: { id: 1, input } });
        if (response.error) throw Error(response.error);
        return plain(response.result);
    };
}

function server(records = {}) {
    const queries = [], hierarchy = [];
    const context = vm.createContext({
        Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        Object: { keys: Object.keys, extendsObject: (_, methods) => methods },
        gs: { getProperty: (_, fallback) => fallback, warn() {} },
        GlideTableHierarchy: function (table) { this.getBase = () => { hierarchy.push(table); return ''; }; },
        GlideRecordSecure: function (table) {
            let row, selected = [], index = -1;
            const filters = [];
            this.isValid = () => true;
            this.get = sysId => { row = (records[table] || []).find(item => item.sys_id === sysId && item.readable !== false); return !!row; };
            this.getValue = field => row?.[field] ?? '';
            this.getElement = field => ({ canRead: () => !(row?.unreadableFields || []).includes(field) });
            this.getUniqueValue = () => row.sys_id;
            this.getRecordClassName = () => table;
            this.getDisplayValue = field => field ? this.getValue(field) : row.label || row.name;
            this.addQuery = (...args) => filters.push(args);
            this.addNotNullQuery = field => filters.push([field, 'NOTNULL']);
            this.orderByDesc = () => {};
            this.query = () => {
                queries.push([table, ...filters]);
                selected = (records[table] || []).filter(item => item.readable !== false && filters.every(([field, op, value]) =>
                    op === 'IN' ? value.split(',').includes(String(item[field])) :
                    op === 'NOTNULL' ? !!item[field] : String(item[field]) === String(op)));
            };
            this.next = () => { row = selected[++index]; return !!row; };
        },
    });
    vm.runInContext(serverSource, context);
    const api = Object.create(context.WidgetEditorAssistantAjax.prototype);
    api._answer = value => plain(value);
    const call = (method, rows) => { api.getParameter = key => key === 'records' ? JSON.stringify(rows) : ''; return api[method](); };
    return { api, call, queries, hierarchy };
}

const example = `new Foo(); new global.Bar(); Object.extendsObject(Base, {});
    Foo.run(); new GlideAjax('global.AjaxThing'); gs.include('Extra');
    new GlideRecord('incident'); new GlideAggregate('task');
    gs.getProperty('example.setting'); gs.setProperty('example.setting', 'x');
    gs.eventQueue('example.event'); new sn_ws.RESTMessageV2('Example REST');
    new SOAPMessageV2('Example SOAP'); FlowAPI.executeSubflow('global.example_flow');
    startFlow('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');`;

test('shared worker preserves all Assistant dependency patterns, builtin exclusions and injection discovery', () => {
    const analyse = worker(), { api } = server();
    const clientScript = 'api.controller = function($scope, ExampleService, OtherService) {}';
    const result = analyse({ content: example, clientScript });
    assert.deepEqual(result.scriptIncludes, plain(api._scanReferencedNamesInText(example)));
    assert.deepEqual(result.tables, plain(api._scanReferencedTableNamesInText(example)));
    assert.deepEqual(result.resources, Array.from(api.RESOURCE_SCANS, scan => plain(api._scanCaptures(example, scan.re))));
    assert.deepEqual(result.providers, ['ExampleService', 'OtherService']);
    assert.deepEqual(result.controllerParams, ['$scope', 'ExampleService', 'OtherService']);
    assert.deepEqual(analyse({ content: 'new Foo(); new Foo();' }).scriptIncludes, [{ name: 'Foo', scope: '' }]);
});

test('a real browser worker shares cached jobs and can restart after disposal', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        let loads = 0;
        await page.route('http://analysis.test/**', async route => {
            if (route.request().url().includes('widget_editor_code_analysis.jsdbx')) {
                loads++;
                return route.fulfill({ contentType: 'application/javascript', body: workerSource });
            }
            return route.fulfill({ contentType: 'text/html', body: '<html><head></head><body></body></html>' });
        });
        await page.goto('http://analysis.test/');
        await page.addScriptTag({ content: workerSource });
        const result = await page.evaluate(async () => {
            const input = { content: "new Example(); new GlideRecord('incident');" };
            const first = WECodeAnalysis.analyse(input);
            const shared = first === WECodeAnalysis.analyse(input);
            const parsed = await first;
            WECodeAnalysis.dispose();
            const fresh = await WECodeAnalysis.analyse(input);
            return { shared, parsed, fresh };
        });
        assert.equal(result.shared, true);
        assert.deepEqual(result.parsed.scriptIncludes, [{ name: 'Example', scope: '' }]);
        assert.deepEqual(result.fresh, result.parsed);
        assert.equal(loads, 2);
    } finally { await browser.close(); }
});

test('worker errors and timeouts reject pending jobs, evict failures and allow retry', async () => {
    const instances = [], timers = [];
    class FakeWorker {
        constructor() { instances.push(this); }
        postMessage(value) { this.message = value; }
        terminate() { this.terminated = true; }
    }
    const context = vm.createContext({ Worker: FakeWorker, Map, Promise, Error, setTimeout: cb => { timers.push(cb); return timers.length; }, clearTimeout() {}, addEventListener() {} });
    vm.runInContext(workerSource, context);
    const api = context.WECodeAnalysis;
    const first = api.analyse({ content: 'new Foo();' });
    const rejected = assert.rejects(first, /unavailable/);
    instances[0].onerror();
    await rejected;
    assert.equal(instances[0].terminated, true);
    const next = api.analyse({ content: 'new Foo();' });
    const timedOut = assert.rejects(next, /timed out/);
    timers.at(-1)();
    await timedOut;
    const retry = api.analyse({ content: 'new Foo();' });
    instances[0].onerror(); // A late error from the old worker cannot cancel its replacement.
    instances[2].onmessage({ data: { id: instances[2].message.id, result: { scriptIncludes: [] } } });
    assert.deepEqual(await retry, { scriptIncludes: [] });
});

test('Assistant batches reuse dictionary metadata only inside one request and omit unreadable script fields', () => {
    const records = {
        u_code: [
            { sys_id: id('a'), script: example },
            { sys_id: id('b'), script: 'secret', unreadableFields: ['script'] },
        ],
        sys_dictionary: [{ name: 'u_code', element: 'script', internal_type: 'script' }],
    };
    const { api, call, queries, hierarchy } = server(records);
    const rows = records.u_code.map(row => ({ table: 'u_code', sys_id: row.sys_id }));
    const result = call('getAnalysisSources', rows);
    assert.equal(result.success, true);
    assert.equal(result.results[0].success, true, result.results[0].error);
    assert.equal(result.results[0].analysis.content, example);
    assert.equal(result.results[1].analysis, null);
    assert.equal(queries.filter(query => query[0] === 'sys_dictionary').length, 3);
    assert.deepEqual(hierarchy, ['u_code']);
    assert.equal(api._analysisMetadata, null);
    call('getAnalysisSources', rows);
    assert.equal(queries.filter(query => query[0] === 'sys_dictionary').length, 6);
});

test('Assistant resolves worker candidates with scope preference, readable records and fresh-source fallback', () => {
    const records = {
        u_code: [{ sys_id: id('a'), script: 'new Foo();', sys_scope: 'our-scope', sys_mod_count: '1' }],
        sys_dictionary: [{ name: 'u_code', element: 'script', internal_type: 'script' }],
        sys_script_include: [
            { sys_id: id('b'), name: 'Foo', active: true, api_name: 'global.Foo', sys_scope: 'other-scope' },
            { sys_id: id('c'), name: 'Foo', active: true, api_name: 'x_ours.Foo', sys_scope: 'our-scope' },
            { sys_id: id('d'), name: 'Hidden', active: true, readable: false },
        ],
    };
    const { api, call } = server(records), analyse = worker();
    const row = { table: 'u_code', sys_id: id('a') };
    const source = call('getAnalysisSources', [row]).results[0];
    const result = call('resolveAnalysis', [{ ...row, version: source.analysis.version, analysis: analyse(source.analysis) }]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].related[0].sys_id, id('c'));
    const hidden = analyse({ content: 'new Hidden();' });
    assert.equal(call('resolveAnalysis', [{ ...row, version: source.analysis.version, analysis: hidden }]).results[0].related.length, 0);
    records.u_code[0].script = '';
    records.u_code[0].sys_mod_count = '2';
    const fresh = call('resolveAnalysis', [{ ...row, version: source.analysis.version, analysis: analyse(source.analysis) }]);
    assert.equal(fresh.results[0].replaceRelated, true);
    assert.equal(fresh.results[0].related.length, 0);
    assert.equal(api._analysisMetadata, null);
});

test('Assistant rejects malformed batches and candidates before any lookup', () => {
    const { call, queries } = server();
    for (const rows of [[], Array.from({ length: 11 }, () => ({ table: 'u_code', sys_id: id('a') })), [{ table: '../sys_user', sys_id: id('a') }], [{ table: 'u_code', sys_id: 'invalid' }]]) {
        assert.equal(call('getAnalysisSources', rows).success, false);
    }
    const analysis = worker()({ content: '' });
    analysis.tables = ['incident,sys_user'];
    assert.equal(call('resolveAnalysis', [{ table: 'u_code', sys_id: id('a'), analysis }]).success, false);
    assert.equal(queries.length, 0);
});

function client(request, analyse = worker()) {
    const context = vm.createContext({
        window: { WECodeAnalysis: { analyse: async input => analyse(input) } },
        $scope: { $on() {} },
        $q: { when: value => Promise.resolve(value), defer() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; } },
        $timeout: callback => setTimeout(callback, 0),
        request,
        runPool: async (items, work, concurrency) => {
            let next = 0;
            await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (next < items.length) await work(items[next++]); }));
        },
    });
    const start = clientSource.indexOf('                var analysisQueue');
    vm.runInContext(clientSource.slice(start, clientSource.indexOf('                function request(', start)), context);
    return context;
}

test('Assistant coalesces duplicate scans and sends batches of at most ten records', async () => {
    const calls = [];
    const context = client(async (action, params) => {
        const rows = JSON.parse(params.records);
        calls.push([action, rows.length]);
        return { success: true, results: rows.map(() => action === 'getAnalysisSources' ? { success: true, related: [], analysis: { content: 'new Foo();', version: '1' } } : { success: true, related: [{ table: 'sys_script_include', sys_id: id('f') }] }) };
    });
    const inputs = Array.from({ length: 25 }, (_, i) => ({ table: 'u_code', sys_id: i.toString(16).padStart(32, '0') }));
    const promises = inputs.map(row => context.ajax('getSuggestedRelated', row));
    assert.equal(context.ajax('getSuggestedRelated', inputs[0]), promises[0]);
    const results = await Promise.all(promises);
    assert.ok(results.every(result => result.related[0].sys_id === id('f')));
    assert.deepEqual(calls.filter(call => call[0] === 'getAnalysisSources').map(call => call[1]), [10, 10, 5]);
    assert.equal(calls.length, 6);
});

test('Assistant falls back to server discovery after worker failure and retries later', async () => {
    const calls = [];
    const context = client(async action => {
        calls.push(action);
        return action === 'getAnalysisSources' ? { success: true, results: [{ success: true, related: [], analysis: { content: 'new Foo();' } }] } : { success: true, related: [] };
    }, () => { throw Error('worker failed'); });
    const row = { table: 'u_code', sys_id: id('a') };
    await context.ajax('getSuggestedRelated', row);
    await new Promise(resolve => setTimeout(resolve, 0));
    await context.ajax('getSuggestedRelated', row);
    assert.deepEqual(calls, ['getAnalysisSources', 'getSuggestedRelated', 'getAnalysisSources', 'getSuggestedRelated']);
});

test('XML fetches share overlapping requests, fetch fresh data later and retry failures', async () => {
    let calls = 0, release;
    const context = vm.createContext({ fetch: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
    vm.runInContext(clientSource.slice(clientSource.indexOf('async function fetchExportRecordXml'), clientSource.indexOf('// Exported XML/SCHEMA byte size')), context);
    const row = { table: 'u_code', sys_id: id('a') };
    const first = context.fetchExportRecordXml(row), second = context.fetchExportRecordXml(row);
    assert.equal(calls, 1);
    release({ text: async () => 'current XML' });
    assert.deepEqual(await Promise.all([first, second]), ['current XML', 'current XML']);
    const fresh = context.fetchExportRecordXml(row);
    assert.equal(calls, 2);
    release({ text: async () => 'changed XML' });
    assert.equal(await fresh, 'changed XML');
    context.fetch = async () => { throw Error('offline'); };
    await assert.rejects(context.fetchExportRecordXml(row), /offline/);
    context.fetch = async () => ({ text: async () => 'recovered XML' });
    assert.equal(await context.fetchExportRecordXml(row), 'recovered XML');
});

test('Editor uses shared analysis and deduplicates pending name lookups with retry after failure', async () => {
    const requests = [], checked = [], providers = [];
    const context = vm.createContext({
        window: { monaco: {}, g_ck: 'token', WECodeAnalysis: { analyse: async input => worker()(input) } },
        _siNameMap: {}, _siNameChecks: {}, _siFetched: {}, _SI_SCAN_BUILTINS: {},
        XMLHttpRequest: class {
            constructor() { requests.push(this); }
            open() {} setRequestHeader() {} send() {}
        },
        _fetchSIIntellisense: name => checked.push(name),
        _fetchScannedProviders: names => providers.push(plain(names)),
    });
    vm.runInContext(coreSource.slice(coreSource.indexOf('    function _scanAndFetchSIs('), coreSource.indexOf('    ///////////////////////////////////////////', coreSource.indexOf('    function _scanAndFetchSIs('))), context);
    const providerStart = coreSource.indexOf('    function _scanAndFetchProviders(');
    vm.runInContext(coreSource.slice(providerStart, coreSource.indexOf('    function _fetchScannedProviders(', providerStart)), context);
    await context._scanAndFetchSIs('new Foo();');
    await context._scanAndFetchSIs('new Foo(); new Foo();');
    assert.equal(requests.length, 1);
    requests[0].onloadend(); // Network failure clears pending names.
    await context._scanAndFetchSIs('new Foo();');
    assert.equal(requests.length, 2);
    requests[1].status = 200;
    requests[1].responseText = JSON.stringify({ result: [{ name: 'Foo', sys_id: id('f') }] });
    requests[1].onload(); requests[1].onloadend();
    await context._scanAndFetchSIs('new Foo();');
    assert.equal(requests.length, 2);
    assert.deepEqual(checked, ['Foo']);
    await context._scanAndFetchProviders('api.controller = ($scope, ExampleService) => {};');
    assert.deepEqual(providers, [['$scope', 'ExampleService']]);
});

test('Assistant replaces stale prepared relationships when the source changes during analysis', async () => {
    const context = client(async action => action === 'getAnalysisSources' ? {
        success: true, results: [{ success: true, related: [{ table: 'old_table', sys_id: id('b') }], analysis: { content: '', version: '1' } }],
    } : {
        success: true, results: [{ success: true, replaceRelated: true, related: [{ table: 'new_table', sys_id: id('c') }] }],
    });
    const result = await context.ajax('getSuggestedRelated', { table: 'u_code', sys_id: id('a') });
    assert.deepEqual(plain(result.related), [{ table: 'new_table', sys_id: id('c') }]);
});

test('analysis caches are bounded and changing source always creates a new job', async () => {
    let messages = 0;
    class FakeWorker {
        postMessage(message) {
            messages++;
            this.onmessage({ data: { id: message.id, result: { content: message.input.content } } });
        }
        terminate() {}
    }
    const context = vm.createContext({ Worker: FakeWorker, setTimeout, clearTimeout, addEventListener() {} });
    vm.runInContext(workerSource, context);
    const api = context.WECodeAnalysis;
    const first = api.analyse({ content: 'first' });
    assert.equal(api.analyse({ content: 'first' }), first);
    for (let i = 0; i < 32; i++) await api.analyse({ content: 'source ' + i });
    assert.notEqual(api.analyse({ content: 'first' }), first);
    assert.equal(messages, 34);
    const huge = 'x'.repeat(2 * 1024 * 1024);
    assert.notEqual(api.analyse({ content: huge }), api.analyse({ content: huge }));
    api.dispose();
});

test('slow analysis script loading cannot prevent either app starting, and late loads start it only once', () => {
    const callbacks = [], timers = [];
    let starts = 0;
    const context = vm.createContext({
        window: {}, _initApp: () => starts++,
        _loadScript: (_url, cb) => callbacks.push(cb),
        setTimeout: cb => { timers.push(cb); return timers.length; }, clearTimeout() {},
    });
    const start = clientSource.indexOf('    function _init() {');
    vm.runInContext(clientSource.slice(start, clientSource.indexOf("    if (typeof addAfterPageLoadedEvent", start)), context);
    context._init();
    assert.equal(starts, 0);
    timers[0](); callbacks[0]();
    assert.equal(starts, 1);

    const bootstrap = fs.readFileSync(root + 'client-development/ui-script/monaco_plus_bootstrap.js', 'utf8');
    const urls = [], bootstrapTimers = [], bootstrapCallbacks = [];
    const bootContext = vm.createContext({
        global: { document: {}, SNMonacoPlus: null }, _coreLoadPromise: null,
        CORE_UI_SCRIPT_URL: '/monaco_plus_core.jsdbx',
        setTimeout: cb => { bootstrapTimers.push(cb); return bootstrapTimers.length; }, clearTimeout() {},
        _loadScript: (url, cb) => { urls.push(url); bootstrapCallbacks.push(cb); },
    });
    const bootStart = bootstrap.indexOf('    function ensureCoreLoaded()');
    vm.runInContext(bootstrap.slice(bootStart, bootstrap.indexOf('    /**', bootStart)), bootContext);
    bootContext.ensureCoreLoaded();
    bootstrapTimers[0](); bootstrapCallbacks[0]();
    assert.equal(urls.filter(url => url === '/monaco_plus_core.jsdbx').length, 1);
});

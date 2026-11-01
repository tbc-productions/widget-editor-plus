const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { readFluentField } = require('../helpers/fluent-source.cjs');

const script = readFluentField(
    'src/fluent/generated/client-development/ui-script/sys_ui_script_a424391983f7725070b8b5dfeeaad3cc.now.ts', 'script'
);
const exposed = 'global.SNMonacoPlus = _api;';
assert.ok(script.includes(exposed));

function makeMonaco() {
    const calls = [];
    const libs = { javascriptDefaults: {}, typescriptDefaults: {} };
    function defaults(name) {
        return {
            getCompilerOptions: () => ({}),
            setCompilerOptions() {},
            setDiagnosticsOptions() {},
            setEagerModelSync() {},
            getExtraLibs: () => Object.fromEntries(Object.entries(libs[name]).map(([k, v]) => [k, { content: v }])),
            addExtraLib(content, uri) {
                libs[name][uri] = content;
            },
        };
    }
    const register = (kind) => (lang, provider) => calls.push({ kind, lang, provider });
    return {
        calls,
        libs,
        monaco: {
            languages: {
                typescript: {
                    javascriptDefaults: defaults('javascriptDefaults'),
                    typescriptDefaults: defaults('typescriptDefaults'),
                },
                CompletionItemKind: new Proxy({}, { get: () => 1 }),
                CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
                registerCompletionItemProvider: register('completion'),
                registerHoverProvider: register('hover'),
                registerSignatureHelpProvider: register('signature'),
                registerCodeActionProvider() {},
            },
            editor: { getModels: () => [], onDidCreateModel() {}, addEditorAction() {}, setModelMarkers() {} },
            Range: class {},
            MarkerSeverity: { Warning: 4 },
        },
    };
}

function load() {
    const fake = makeMonaco();
    const context = vm.createContext({
        console: { info() {}, error() {}, warn() {} },
        document: { createElement: () => ({}), head: { appendChild() {} } },
        XMLHttpRequest: class {
            open() {}
            setRequestHeader() {}
            send() {}
        },
        setInterval: (fn, ms) => setInterval(fn, ms).unref(),
        clearInterval,
        setTimeout: (fn, ms) => setTimeout(fn, ms).unref(),
        clearTimeout,
        Promise,
        monaco: fake.monaco,
    });
    context.window = context;
    vm.runInContext(
        script.replace(
            exposed,
            exposed +
                ' global.__we = { jsDocTypeToTs, parseSiDocComment, parseSiMethods, parseSiProperties,' +
                ' parseSiConstants, parseProviderMembers, _registerSiDts, _findGrTable, _getOpenCallContext, _providerDiTypes,' +
                ' _getChoiceValueContext, _pickFieldChoices, registerGrChoiceValueCompletions };'
        ),
        context
    );
    return { we: context.__we, api: context.SNMonacoPlus, fake, context };
}

function makeModel(text) {
    const lines = text.split('\n');
    return {
        getValue: () => text,
        getLineContent: (n) => lines[n - 1],
        getLineMaxColumn: (n) => lines[n - 1].length + 1,
        getValueInRange(r) {
            const part = lines.slice(r.startLineNumber - 1, r.endLineNumber);
            part[part.length - 1] = part[part.length - 1].slice(0, r.endColumn - 1);
            part[0] = part[0].slice(r.startColumn - 1);
            return part.join('\n');
        },
    };
}

function syntaxErrors(dts) {
    const host = ts.createCompilerHost({ noLib: true });
    const original = host.getSourceFile;
    host.getSourceFile = (name, target) =>
        name === 'lib.d.ts' ? ts.createSourceFile(name, dts, target) : original(name, target);
    const program = ts.createProgram(['lib.d.ts'], { noLib: true }, host);
    return program.getSyntacticDiagnostics().map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('JSDoc types convert to valid TypeScript', () => {
    const { we } = load();
    const cases = {
        'Array<string|number>': 'Array<string | number>',
        '?string': 'string | null',
        'string=': 'string',
        Array: 'any[]',
        'Object.<string, number>': 'Record<string, number>',
        'Array.<GlideRecord>': 'GlideRecord[]',
        'Object<string, Array<string|number>>': 'Record<string, Array<string | number>>',
        Promise: 'Promise<any>',
    };
    for (const [input, expected] of Object.entries(cases)) {
        assert.equal(we.jsDocTypeToTs(input), expected, input);
    }
});

test('dotted and defaulted @param tags do not overwrite parent parameters', () => {
    const { we } = load();
    const doc = we.parseSiDocComment(
        "/**\n * @param {Object} options - Settings\n * @param {string} options.name - Record name\n * @param {number} [limit=10] - Max rows\n */"
    );
    assert.equal(doc.params.options.type, '{ /** Record name */ name: string }');
    assert.equal(doc.params.options.description, 'Settings');
    assert.equal(doc.params.limit.optional, true);
    assert.equal(doc.params.limit.description, 'Max rows');
});

const prototypeSi = `var U = Class.create();
/** Settings */
U.MAX = { retries: { count: 3 }, label: 'a;b' };
U.prototype = {
    /** This function returns {string} values. */
    config: {
        retries: 3,
        handler: function () {}
    },
    /**
     * Runs a query.
     * @param {string} table - Table name
     * @returns {number} Row count
     */
    run: function (table = 'incident', limit, { active } = {}, ...rest) {
        var cb = { onDone: function (x) {} };
        return { leaked: 1 };
    },
    arrow: (a) => a,
    shorthand(b) {
        return b;
    },
    type: 'U'
};`;

test('prototype parsing keeps nested members out and handles defaults', () => {
    const { we } = load();
    const methods = plain(we.parseSiMethods(prototypeSi));
    assert.deepEqual(
        methods.map((m) => m.name),
        ['run', 'arrow', 'shorthand']
    );
    const run = methods[0];
    assert.equal(run.signature, 'run(table?: string, limit: any, param2?: Record<string, any>, ...rest: any[]): number');
    assert.deepEqual(run.params, ['table', 'limit', 'param2', 'rest']);
    assert.match(run.jsDoc, /@param table Table name/);
    assert.match(run.jsDoc, /@returns Row count/);

    const props = plain(we.parseSiProperties(prototypeSi, 'U'));
    assert.deepEqual(
        props.map((p) => p.name),
        ['config']
    );
    const constants = plain(we.parseSiConstants(prototypeSi, 'U'));
    assert.deepEqual(constants, [
        { name: 'MAX', tsType: '{ retries: { count: 3 }; label: "a;b" }', documentation: 'Settings' },
    ]);
});

test('ES6 class Script Includes expose methods, constructor and statics', () => {
    const { we } = load();
    const source = `class Util {
    static VERSION = '1.0';
    count = 0;
    /** @param {string} name */
    constructor(name) {
        this.name = name;
    }
    static create() {
        return new Util('x');
    }
    /** Greets. */
    greet(who = 'world') {
        if (who) { return { nested: 1 }; }
    }
}`;
    const methods = plain(we.parseSiMethods(source));
    assert.deepEqual(
        methods.map((m) => [m.name, m.isConstructor, m.isStatic]),
        [
            ['initialize', true, false],
            ['create', false, true],
            ['greet', false, false],
        ]
    );
    assert.equal(methods[0].signature, 'constructor(name: string)');
    assert.deepEqual(plain(we.parseSiConstants(source, 'Util')).map((c) => [c.name, c.tsType]), [['VERSION', '"1.0"']]);
    assert.deepEqual(
        plain(we.parseSiProperties(source, 'Util')).map((p) => p.name),
        ['count', 'name']
    );
});

test('generated Script Include declarations are valid and documented', () => {
    const { we, fake } = load();
    we._registerSiDts(
        'U',
        we.parseSiMethods(prototypeSi),
        [],
        we.parseSiConstants(prototypeSi, 'U'),
        we.parseSiProperties(prototypeSi, 'U')
    );
    const dts = fake.libs.javascriptDefaults['ts:snlib-si-plus-U.d.ts'];
    assert.deepEqual(syntaxErrors(dts), []);
    assert.match(dts, /\/\*\*\n {5}\* Runs a query\./);

    we._registerSiDts('OnlyConstants', [], [], [{ name: 'A', tsType: '1', documentation: '' }], []);
    assert.match(fake.libs.javascriptDefaults['ts:snlib-si-plus-OnlyConstants.d.ts'], /static readonly A: 1;/);
});

test('provider members resolve shorthand exports and service methods', () => {
    const { we } = load();
    const factory = `/* This function builds the factory */
function () {
    /** Loads rows. @param {string} table */
    function load(table, opts = {}) { return { nested: function () {} }; }
    var save = (record) => record;
    return { load, save: save, size: 3 };
}`;
    const parsed = plain(we.parseProviderMembers(factory));
    assert.deepEqual(
        parsed.methods.map((m) => m.signature),
        ['load(table: string, opts?: Record<string, any>): any', 'save(record: any): any']
    );
    assert.deepEqual(
        parsed.properties.map((p) => p.name),
        ['size']
    );

    const service = `function ($http) {
    this.get = function (id) { this.inner = function () {}; };
    this.post = async (body) => body;
}`;
    assert.deepEqual(
        plain(we.parseProviderMembers(service)).methods.map((m) => m.name),
        ['get', 'post']
    );
});

test('GlideRecord lookup uses the nearest declaration and query conditions', () => {
    const { we } = load();
    const model = makeModel(
        [
            "var gr = new GlideRecord('incident');",
            "var subgr = new GlideRecord('task');",
            "var ga = new GlideAggregate('problem');",
            "var qc = gr.addQuery('active', true);",
            "gr = new GlideRecordSecure('sys_user'); gr.",
        ].join('\n')
    );
    assert.equal(we._findGrTable(model, 'gr', { lineNumber: 4, column: 1 }), 'incident');
    assert.equal(we._findGrTable(model, 'gr', { lineNumber: 5, column: 45 }), 'sys_user');
    assert.equal(we._findGrTable(model, 'ga', { lineNumber: 5, column: 1 }), 'problem');
    assert.equal(we._findGrTable(model, 'qc', { lineNumber: 4, column: 1 }), 'incident');
    assert.equal(we._findGrTable(model, 'sub', { lineNumber: 5, column: 1 }), null);
});

test('GlideRecord lookup handles variable names containing a dollar sign', () => {
    const { we } = load();
    const model = makeModel("var $gr = new GlideRecord('incident');\n$gr.");
    assert.equal(we._findGrTable(model, '$gr', { lineNumber: 2, column: 5 }), 'incident');
});

test('UI script sources avoid the dollar-brace sequence the instance strips when serving', () => {
    const dir = path.join(__dirname, '../../src/fluent/generated/client-development/ui-script');
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
        assert.ok(!fs.readFileSync(path.join(dir, file), 'utf8').includes('${'), file);
    }
});

test('choice value context covers query, comparison and element value strings', () => {
    const { we } = load();
    const at = (line) => {
        const cursor = line.indexOf('|');
        const text = line.replace('|', '');
        return plain(we._getChoiceValueContext(makeModel(text), { lineNumber: 1, column: cursor + 1 }));
    };
    const range = (start, end) => ({ endColumn: end, endLineNumber: 1, startColumn: start, startLineNumber: 1 });

    assert.deepEqual(at("gr.addQuery('u_category', 'ha|')"), {
        exclude: [],
        fieldPath: ['u_category'],
        range: range(28, 30),
        varName: 'gr',
    });
    assert.deepEqual(at("gr.addQuery('caller_id.department', '!=', '|')").fieldPath, ['caller_id', 'department']);
    assert.deepEqual(at("gr.addQuery('state', 'IN', '1,2|,3')").range, range(31, 32));
    assert.deepEqual(at("gr.addQuery('state', 'IN', '1,2|,3')").exclude, ['1', '3']);
    assert.deepEqual(at("gr.addQuery('state', 'IN', ['1', '2|', \"3\"])"), {
        exclude: ['1', '3'],
        fieldPath: ['state'],
        range: range(35, 36),
        varName: 'gr',
    });
    assert.deepEqual(at("gr.addQuery('state', 'NOT IN', ['|'])").exclude, []);
    assert.deepEqual(at("gr.addQuery('state', 'NOTIN', [\"7\", \"|\"])").exclude, ['7']);
    assert.equal(at("gr.addQuery('state', '=', ['|'])"), null);
    assert.equal(at("if (gr.state == '|') {}").varName, 'gr');
    assert.deepEqual(at("gr.priority.setValue('|')").fieldPath, ['priority']);
    assert.equal(at("gr.addQuery('state', '1').addOrCondition('|')"), null);
    assert.equal(at("gr.getValue('|')"), null);
});

test('choice picker uses the most specific table and the preferred language', () => {
    const { we } = load();
    const rows = [
        { label: 'New', language: 'en', name: 'task', value: '1' },
        { label: 'Nouveau', language: 'fr', name: 'incident', value: '1' },
        { label: 'New', language: 'en', name: 'incident', value: '1' },
        { label: 'On Hold', language: 'en', name: 'incident', value: '3' },
    ];
    assert.deepEqual(plain(we._pickFieldChoices(rows, ['incident', 'task'], 'fr')), [
        { label: 'Nouveau', value: '1' },
        { label: 'On Hold', value: '3' },
    ]);
    assert.deepEqual(plain(we._pickFieldChoices(rows.slice(0, 1), ['incident', 'task'], 'en')), [
        { label: 'New', value: '1' },
    ]);
});

test('choice value completions suggest values with their labels', async () => {
    const { we, fake, context } = load();
    const urls = [];
    context.XMLHttpRequest = class {
        open(method, url) {
            this.url = decodeURIComponent(url);
            urls.push(this.url);
        }
        setRequestHeader() {}
        send() {
            this.status = 200;
            const result = this.url.includes('sys_db_object')
                ? [{ 'super_class.name': '' }]
                : [
                      { label: 'Hardware', language: 'en', name: 'u_request', value: 'hardware' },
                      { label: 'Software', language: 'en', name: 'u_request', value: 'software' },
                  ];
            this.responseText = JSON.stringify({ result });
            setTimeout(() => this.onload());
        }
    };
    we.registerGrChoiceValueCompletions();
    const provider = fake.calls.find((c) => c.kind === 'completion' && c.lang === 'javascript').provider;
    const text = "var gr = new GlideRecord('u_request');\ngr.addQuery('u_category', '');";
    const result = await provider.provideCompletionItems(makeModel(text), { lineNumber: 2, column: 28 });
    assert.deepEqual(
        plain(result.suggestions.map((s) => [s.label, s.detail, s.insertText])),
        [
            ['hardware', 'Hardware', 'hardware'],
            ['software', 'Software', 'software'],
        ]
    );
    assert.ok(urls.some((u) => u.includes('sys_choice') && u.includes('nameINu_request^element=u_category')));
});

test('signature help finds the open call across nested calls and lines', () => {
    const { we } = load();
    const text = "util.run(gr.getValue('a,b'), { x: 1, y: 2 },\n    other(1, 2), ";
    const model = makeModel(text);
    const call = plain(we._getOpenCallContext(model, { lineNumber: 2, column: text.split('\n')[1].length + 1 }));
    assert.deepEqual(call, { callee: 'util.run', activeParam: 3 });
});

test('JavaScript providers register even when an HTML editor initialises first', async () => {
    const { api, fake } = load();
    api.init({ language: 'html' });
    api.init({ language: 'javascript' });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const jsKinds = new Set(fake.calls.filter((c) => c.lang === 'javascript').map((c) => c.kind));
    assert.deepEqual([...jsKinds].sort(), ['completion', 'hover', 'signature']);
});

test('provider types found before the client definitions load still type controller parameters', () => {
    const { we, api, context } = load();
    api.init({ language: 'html' });
    we._providerDiTypes.wePlusTestFactory = 'wePlusTestFactory';
    let built = null;
    context.MONACO_LANGUAGE_CLIENT_DI = {
        types: {},
        buildApiDts(params) {
            built = params;
            return '';
        },
    };
    api.notifyScriptContextFocus(null, 'client');
    assert.equal(context.MONACO_LANGUAGE_CLIENT_DI.types.wePlusTestFactory, 'wePlusTestFactory');
    assert.equal(built, null);
});

test('saving preferences without a portal clears theme classes; other empty calls keep them', async () => {
    const { api, context } = load();
    api.init({ language: 'html' });
    api.loadHtmlClassIndex({ portalSysId: 'p', portalUrlSuffix: 'sp', themeSysId: 't' });
    context.MONACO_HTML_CLASS_INDEX = [{ name: 'btn' }];
    api.loadHtmlClassIndex({});
    assert.equal(context.MONACO_HTML_CLASS_INDEX.length, 1);
    await api.loadHtmlClassIndex({ clearIfUnset: true });
    assert.equal(context.MONACO_HTML_CLASS_INDEX.length, 0);
});

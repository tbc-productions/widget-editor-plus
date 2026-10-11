const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const { readFluentField } = require('../helpers/fluent-source.cjs');

const script = readFluentField(
    'src/fluent/generated/client-development/ui-script/sys_ui_script_9996546a8327321070b8b5dfeeaad317.now.ts', 'script'
).replace('    window.MONACO_LANGUAGE_HTML = {', `
    window.validation = {
        extract: _extractNgExpressions,
        bindings: _validateProviderBindings,
        parse: _getAngularParse,
        setParse: function (parse) { _angularParse = parse; }
    };
    window.MONACO_LANGUAGE_HTML = {`);
let browser, page;
before(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.addScriptTag({ content: script });
});
after(async () => { await browser?.close(); });

async function expressions(text) {
    return page.evaluate(text => validation.extract(text).map(item => ({
        expression: item.expr,
        source: text.slice(item.exprStart, item.exprStart + item.length),
        error: item.forcedError
    })), text);
}
async function values(text) {
    return (await expressions(text)).map(item => item.expression);
}

test('ordinary attribute names never match Angular directive suffixes', async () => {
    assert.deepEqual(await values('<div data-heading-class="{{data.heading_class}}" heading-if="literal text"></div>'), ['data.heading_class']);
    assert.deepEqual(await values('<div title=\'Example ng-if="a +"\'></div>'), []);
    assert.deepEqual(await values('<div ng-if="ready" title="{{data.title}}"></div>'), ['data.title', 'ready']);
});

test('literal directive values and interpolation-only values are not parsed as expressions', async () => {
    for (const [name, value] of [
        ['ng-message', 'required,custom-error'], ['data-ng-message', 'required custom-error'],
        ['ng-messages-include', '/templates/errors.html'], ['ng-transclude', 'header.slot'],
        ['ng-transclude-slot', 'header slot'], ['ng-csp', 'no-unsafe-eval;no-inline-style'],
        ['ng-controller', 'MyController as vm'], ['ng-list', ', '], ['ng-jq', ''],
        ['ng-switch-when', 'required,custom-error'], ['ng-switch-when-separator', ','],
        ['ng-form', '{{formName}}'], ['ng-href', '/{{data.path}}'],
        ['ng-messages-include', '/{{data.path}}'], ['ng-attr-title', '{{data.title}}']
    ]) {
        assert.deepEqual(await values(`<span ${name}="${value}"></span>`),
            value.includes('{{') ? [value.match(/\{\{(.*?)\}\}/)[1]] : [], name);
    }
    assert.deepEqual(await values('<span ng-messages="form.$error" ng-message-exp="c.keys"></span>'), ['form.$error', 'c.keys']);
});

test('attribute aliases, multiline values and unquoted expressions are scanned', async () => {
    for (const name of ['ng-if', 'data-ng-if', 'x-ng-if', 'ng_if', 'ng:if', 'data_ng_if', 'x:ng:if', 'NG-IF']) {
        assert.deepEqual(await values(`<div ${name}="a +\n b"></div>`), ['a +\n b'], name);
    }
    assert.deepEqual(await values('<div ng-if=c.ready></div>'), ['c.ready']);
    assert.deepEqual(await values('<div title="{{a +\n b}}"></div>'), ['a +\n b']);
    assert.deepEqual(await values('<div ng-if="unfinished'), []);
    assert.deepEqual(await values('{{a<b}} <span ng-if="ready">{{value}}</span>'), ['a<b', 'value', 'ready']);
});

test('entities decode once while diagnostic ranges retain the original source', async () => {
    assert.deepEqual(await expressions('<div ng-if="a &amp;&amp; b" title="{{name === &quot;hello&quot;}}"></div>'), [
        { expression: 'name === "hello"', source: 'name === &quot;hello&quot;', error: undefined },
        { expression: 'a && b', source: 'a &amp;&amp; b', error: undefined }
    ]);
    assert.deepEqual(await values('<div ng-if="&#97; &amp;&amp; &#x62;"></div>'), ['a && b']);
    assert.deepEqual(await values('<div title="&#123;&#123;value&#125;&#125;"></div>'), ['value']);
    assert.deepEqual(await values('<div title="{{\'&amp;quot;\'}}"></div>'), ["'&quot;'"]);
    assert.deepEqual(await values('<div title="{{\'&copy=\'}}"></div>'), ["'&copy='"]);
    assert.deepEqual(await values('{{\'&copy=\'}}'), ["'©='"]);
});

test('comments, raw text and non-bindable subtrees cannot invent active attributes', async () => {
    for (const text of [
        '<!-- <div ng-if="bad +">{{bad +}}</div> -->',
        '<!-- {{bad +}}',
        '<div ng-non-bindable title="{{bad +}}"><div ng-if="bad +"></div>{{bad +}}</div>',
        '<div data-ng-non-bindable><span><div ng-if="bad +"></div></span></div>',
        '<script>var example = \'<div ng-if="bad +">{{bad +}}</div>\';</script>',
        '<style>div::after { content: \'ng-if="bad +"\'; }</style>',
        '<textarea><div ng-if="bad +"></div></textarea>'
    ]) {
        assert.deepEqual(await values(text + '<span ng-if="ready"></span>'), text.includes('<!-- {{') ? [] : ['ready'], text);
    }
    assert.deepEqual(await values('<div ng-non-bindable><input><span>{{bad +}}</span></div>{{ready}}'), ['ready']);
    assert.deepEqual(await values('<textarea>{{text}}</textarea><style>.x { color: {{colour}} }</style>'), ['text', 'colour']);
    assert.deepEqual(await values('<script type="text/ng-template"><span ng-if="ready">{{label}}</span></script>'), ['label', 'ready']);
});

test('repeat, options and pattern grammars keep validation and mapped ranges', async () => {
    assert.deepEqual(await values('<div ng-repeat="item in items | filter:query as results track by item.id"></div>'), ['items | filter:query', 'item.id']);
    assert.deepEqual(await expressions('<div ng-repeat="item&#32;in&#32;items track by item.id"></div>'), [
        { expression: 'items', source: 'items', error: undefined },
        { expression: 'item.id', source: 'item.id', error: undefined }
    ]);
    assert.deepEqual(await values('<select ng-options="item.id as item.label group by item.group disable when item.disabled for item in items track by item.id"></select>'),
        ['item.id', 'item.label', 'item.group', 'item.disabled', 'items', 'item.id']);
    assert.deepEqual(await values('<input ng-pattern="/^a&amp;b$/">'), []);
    assert.match((await expressions('<input ng-pattern="/[/">'))[0].error, /regular expression/i);
    assert.match((await expressions('<div ng-repeat="items"></div>'))[0].error, /item in collection/);
    assert.match((await expressions('<select ng-options="items"></select>'))[0].error, /label for value/);
});

test('expression markers preserve multiline source ranges and genuine parser errors', async () => {
    const result = await page.evaluate(() => {
        validation.setParse(expr => { throw new Error('Rejected: ' + expr); });
        const text = '<div\n ng-if="a &amp;&amp;\n b +"></div>';
        const model = {
            getValue: () => text,
            getPositionAt(offset) {
                const lines = text.slice(0, offset).split('\n');
                return { lineNumber: lines.length, column: lines.at(-1).length + 1 };
            }
        };
        return MONACO_LANGUAGE_HTML.getExpressionMarkers(model, { MarkerSeverity: { Error: 8 } });
    });
    assert.deepEqual(result, [{ startLineNumber: 2, startColumn: 9, endLineNumber: 3, endColumn: 5,
        message: 'AngularJS: Rejected: a &&\n b +', severity: 8 }]);
});

test('provider bindings use the same context, entity decoding and normalised attribute names', async () => {
    const result = await page.evaluate(() => {
        const parsed = [], markers = [];
        validation.setParse(expr => { parsed.push(expr); if (expr === 'bad +') throw new Error('Unexpected end'); });
        MONACO_LANGUAGE_HTML.setProviders([{ type: 'directive', name: 'myCard', script: `function () {
            return { restrict: 'EA', scope: { headingClass: '@', selected: '=', onClick: '&' } };
        }` }]);
        const text = `<!-- <my-card data-selected="bad +"></my-card> -->
            <div ng-non-bindable><my-card data-selected="bad +"></my-card></div>
            <my-card data-heading-class="{{title | customFilter}}" data-selected="a &amp;&amp; b"></my-card>
            <my-card heading-class="{{title}}" x-selected="bad +"></my-card>
            <div my-card data_on_click="act(&quot;yes&quot;)"></div>`;
        validation.bindings({ getPositionAt: offset => ({ lineNumber: 1, column: offset + 1 }) }, text, markers, { MarkerSeverity: { Error: 8 } });
        return { parsed, errors: markers.map(m => ({ message: m.message, source: text.slice(m.startColumn - 1, m.endColumn - 1) })) };
    });
    assert.deepEqual(result.parsed, ['title | customFilter', 'a && b', 'title', 'bad +', 'act("yes")']);
    assert.deepEqual(result.errors, [{ message: 'Invalid AngularJS expression for data-selected: Unexpected end', source: 'bad +' }]);
});

test('both validators share a parser that tolerates unknown widget filters', async () => {
    const result = await page.evaluate(() => {
        validation.setParse(null);
        const modules = [], parsed = [];
        let resolveFilter;
        window.angular = {
            identity: value => value,
            module(name) {
                modules.push(name);
                return { config(config) { config.at(-1)({ decorator(name, decorator) {
                    resolveFilter = decorator.at(-1)(filter => {
                        if (filter === 'known') return value => value.toUpperCase();
                        throw new Error('Unknown provider');
                    });
                } }); } };
            },
            injector(names) {
                if (!names.includes('weExprLintPermissiveFilters')) throw new Error('Missing filter decorator');
                return { get: () => expr => { parsed.push(expr); resolveFilter('widgetFilter'); } };
            }
        };
        const parse = validation.parse();
        const cached = parse === validation.parse();
        const model = { getValue: () => '<my-card data-heading-class="{{title | widgetFilter}}"></my-card>',
            getPositionAt: offset => ({ lineNumber: 1, column: offset + 1 }) };
        const markers = MONACO_LANGUAGE_HTML.getExpressionMarkers(model, { MarkerSeverity: { Error: 8 } });
        validation.bindings(model, model.getValue(), markers, { MarkerSeverity: { Error: 8 } });
        return { modules, cached, parsed, markers, unknown: resolveFilter('widgetFilter')('text'), known: resolveFilter('known')('text') };
    });
    assert.deepEqual(result, { modules: ['weExprLintPermissiveFilters'], cached: true,
        parsed: ['title | widgetFilter', 'title | widgetFilter'], markers: [], unknown: 'text', known: 'TEXT' });
});

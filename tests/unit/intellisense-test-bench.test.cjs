const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const fixture = fs.readFileSync('tests/fixtures/update-sets/intellisense-test-bench.xml', 'utf8');
const file = 'src/fluent/generated/other/sys-ui-page/widget_editor_plus.client.js';
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

function unescapeXml(text) {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&amp;/g, '&');
}

function field(xml, name) {
    const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
    return match ? unescapeXml(match[1]) : '';
}

// Payloads are CDATA records whose own fields would otherwise shadow the update's fields.
const updates = [...fixture.matchAll(/<sys_update_xml action="[^"]*">([\s\S]*?)<\/sys_update_xml>/g)].map(([, xml]) => {
    const payload = /<payload><!\[CDATA\[([\s\S]*?)\]\]><\/payload>/.exec(xml);
    const outer = xml.replace(/<payload>[\s\S]*?<\/payload>/, '');
    return {
        name: field(outer, 'name'),
        payload: payload ? payload[1] : '',
        targetName: field(outer, 'target_name'),
        type: field(outer, 'type'),
    };
});
const widget = updates.find((update) => update.type === 'Widget');

function loadFunction(context, name) {
    let found;
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(found, name);
    vm.runInContext('var ' + name + ' = ' + found.getText(ast) + ';', context);
    return context[name];
}

test('the test bench update set holds the widget, providers and Script Includes', () => {
    assert.equal(field(fixture, 'name'), 'Widget Editor+ IntelliSense test bench');
    const counts = {};
    for (const update of updates) counts[update.type] = (counts[update.type] || 0) + 1;
    assert.deepEqual(counts, {
        'Angular Provider': 2,
        'Angular Provider Widget Relationship': 2,
        Column: 1,
        Container: 1,
        'ES Latest Script': 4,
        Instance: 2,
        Page: 1,
        Row: 1,
        'Script Include': 3,
        Widget: 1,
    });
    assert.deepEqual(
        updates
            .filter((update) => update.type === 'Script Include' || update.type === 'Angular Provider')
            .map((update) => update.targetName)
            .sort(),
        ['WEPlusTestConstants', 'WEPlusTestES6', 'WEPlusTestUtils', 'wePlusTestFactory', 'wePlusTestService']
    );
    assert.doesNotMatch(fixture, /service-now\.com|password|@[\w-]+\.\w+/i);
});

test('the widget links both providers and keeps its numbered checks', () => {
    const widgetSysId = widget.name.replace('sp_widget_', '');
    const providerIds = updates
        .filter((update) => update.type === 'Angular Provider')
        .map((update) => update.name.replace('sp_angular_provider_', ''));
    for (const relationship of updates.filter((update) => update.type === 'Angular Provider Widget Relationship')) {
        assert.equal(field(relationship.payload, 'sp_widget'), widgetSysId);
        assert.ok(providerIds.includes(field(relationship.payload, 'sp_angular_provider')));
    }
    const code = ['template', 'client_script', 'script'].map((name) => field(widget.payload, name)).join('\n');
    const checks = [
        ...new Set([...code.matchAll(/(?:\/\/|<!--)\s*(\d+)\./g)].map(([, number]) => Number(number))),
    ].sort((a, b) => a - b);
    assert.deepEqual(
        checks,
        Array.from({ length: 23 }, (_, index) => index + 1)
    );
});

test('check 23 reads server data only through a c.server.get response', () => {
    const client = field(widget.payload, 'client_script');
    const server = field(widget.payload, 'script');
    assert.match(server, /if \(input && input\.action == 'refreshTotal'\) \{\s*data\.refreshedTotal = /);
    assert.match(
        client,
        /c\.server\.get\(\{ action: 'refreshTotal' \}\)\.then\(\(resp\) => \{\s*c\.refreshedTotal = resp\.data\.refreshedTotal;/
    );
    assert.equal(client.match(/refreshedTotal/g).length, 4, 'only the comment and the response read mention it');
    assert.doesNotMatch(client, /c\.data\.refreshedTotal/);
    assert.doesNotMatch(field(widget.payload, 'template'), /refreshedTotal/);
});

test('widget data checks report nothing for the test bench widget', () => {
    const context = vm.createContext({});
    loadFunction(context, '_blankComments');
    const analyse = loadFunction(context, '_analyseWidgetData');
    const issues = JSON.parse(
        JSON.stringify(
            analyse({
                client: field(widget.payload, 'client_script'),
                controllerAs: field(widget.payload, 'controller_as') || 'c',
                link: field(widget.payload, 'link'),
                server: field(widget.payload, 'script'),
                template: field(widget.payload, 'template'),
            })
        )
    );
    assert.deepEqual(issues, { angularTemplates: [], client: [], link: [], server: [], template: [] });
});

test('the test page shows the test bench widget with the Debug Context Menu embedded', () => {
    const payloadOf = (table) => updates.filter((update) => update.name.startsWith(table + '_')).map((u) => u.payload);
    const [page] = payloadOf('sp_page');
    const [container] = payloadOf('sp_container');
    const [row] = payloadOf('sp_row');
    const [column] = payloadOf('sp_column');
    assert.equal(field(page, 'id'), 'we_plus_test_bench');
    assert.equal(field(container, 'sp_page'), field(page, 'sys_id'));
    assert.equal(field(row, 'sp_container'), field(container, 'sys_id'));
    assert.equal(field(column, 'sp_row'), field(row, 'sys_id'));
    const debugMenu = fs.readFileSync(
        'src/fluent/generated/other/sp-widget/sp_widget_d7ad6f7083f7be1070b8b5dfeeaad39d.now.ts',
        'utf8'
    );
    assert.match(debugMenu, /\$id: Now\.ID\['d7ad6f7083f7be1070b8b5dfeeaad39d'\]/);
    assert.match(debugMenu, /id: 'widget_editor_debug_menu'/);
    const instances = payloadOf('sp_instance')
        .map((payload) => [Number(field(payload, 'order')), field(payload, 'sp_widget'), field(payload, 'sp_column')])
        .sort((a, b) => a[0] - b[0]);
    assert.deepEqual(instances, [
        [1, widget.name.replace('sp_widget_', ''), field(column, 'sys_id')],
        [2, 'd7ad6f7083f7be1070b8b5dfeeaad39d', field(column, 'sys_id')],
    ]);
});

test('the test bench fixture stays out of builds, releases and release update sets', () => {
    const markers = ['intellisense-test-bench', 'fixtures/update-sets', 'we_plus_test_bench', widget.name];
    const scan = (dir) =>
        fs
            .readdirSync(dir, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => require('node:path').join(entry.parentPath, entry.name));
    for (const file of [...scan('src'), ...scan('scripts'), ...scan('.github'), 'package.json', 'now.config.json']) {
        const text = fs.readFileSync(file, 'utf8');
        for (const marker of markers) assert.ok(!text.includes(marker), `${file} references ${marker}`);
    }
    const workflow = fs.readFileSync('.github/workflows/release.yaml', 'utf8');
    const uploads = [...workflow.matchAll(/gh release (?:upload|create) .*/g)].map(([line]) => line);
    assert.ok(uploads.length > 0);
    for (const line of uploads) assert.match(line, / target\/\* /, line);
    assert.match(
        fs.readFileSync('scripts/generate-update-set-xml.js', 'utf8'),
        /const distAppDir = path\.join\(rootDir, 'dist', 'app'\);/
    );
    if (fs.existsSync('dist/app')) {
        for (const file of scan('dist/app')) {
            const text = fs.readFileSync(file, 'utf8');
            for (const marker of markers.slice(2)) assert.ok(!text.includes(marker), `${file} contains ${marker}`);
        }
    }
});

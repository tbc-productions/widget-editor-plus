const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const file = 'src/fluent/generated/other/sys-ui-page/widget_editor_plus.client.js';
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const html = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_plus.html', 'utf8');

function loadFunction(context, name) {
    let found;
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
        if (
            ts.isFunctionExpression(node) &&
            ts.isBinaryExpression(node.parent) &&
            node.parent.left.getText(ast) === '$scope.' + name
        )
            found = node;
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(found, name);
    vm.runInContext('var ' + name + ' = ' + found.getText(ast) + ';', context);
    return context[name];
}

const context = vm.createContext({});
loadFunction(context, '_blankComments');
const analyse = loadFunction(context, '_analyseWidgetData');

function run(sources) {
    const issues = JSON.parse(JSON.stringify(analyse(sources)));
    const texts = {};
    for (const part of ['client', 'link', 'server', 'template']) {
        if (!sources[part]) continue;
        texts[part] = issues[part].map((issue) => {
            const text = sources[part].slice(issue.start, issue.end);
            return issue.severity + ':' + text;
        });
    }
    return texts;
}

test('flags data properties the server never sets and ignores client or template writes', () => {
    const result = run({
        client: `api.controller = function () {
            var c = this;
            c.data.filter = '';
            console.log(c.data.items, c.data['title'], c.data.missing, c.data.filter);
            // c.data.commented
        };`,
        server: `(function () {
            data.items = [];
            data['title'] = 'Hello';
            // data.missing = true;
        })();`,
        template: `<div>{{c.data.items.length}} {{data.typo}}<input ng-model="c.data.query"> {{c.data.query}}<!-- {{c.data.hidden}} --></div>`,
    });
    assert.deepEqual(result.client, ['warning:missing']);
    assert.deepEqual(result.template, ['warning:typo']);
    assert.deepEqual(result.server, []);
});

test('respects custom controllerAs names and this aliases', () => {
    const result = run({
        client: `function ($scope) { var vm = this; vm.data.a; $scope.data.b; }`,
        controllerAs: 'vm',
        server: `(function () { data.a = 1; data.b = 2; data.c = 3; })();`,
        template: `<p>{{vm.data.c}} {{c.data.notData}}</p>`,
    });
    assert.deepEqual(result.client, []);
    assert.deepEqual(result.template, []);
    assert.deepEqual(result.server, []);
});

test('marks server data that nothing reads as unused', () => {
    const result = run({
        client: `function () { var c = this; c.data.used; }`,
        server: `(function () { data.used = 1; data.unused = 2; data.internal = 3; if (data.internal) gs.info('x'); })();`,
        template: `<p></p>`,
    });
    assert.deepEqual(result.server, ['unused:unused']);
});

test('skips unused checks when the client script uses data as a whole', () => {
    for (const client of [
        'function () { var c = this; angular.copy(c.data); }',
        'function (listService) { var c = this; listService.init(c.data); }',
        'function () { var c = this; console.log(c.data[key]); }',
    ]) {
        assert.deepEqual(run({ client, server: '(function () { data.a = 1; })();', template: '' }).server, [], client);
    }
});

test('skips missing checks when the server populates data dynamically', () => {
    for (const server of [
        '(function () { $sp.getRecordValues(data, gr, "short_description"); })();',
        '(function () { data = { a: 1 }; })();',
        '(function () { data[field] = 1; })();',
    ]) {
        const result = run({ client: 'function () { var c = this; c.data.a; }', server, template: '{{data.b}}' });
        assert.deepEqual(result.client, [], server);
        assert.deepEqual(result.template, [], server);
    }
});

test('flags actions the server does not handle', () => {
    const result = run({
        client: `function () {
            var c = this;
            c.server.get({ action: 'save', id: 1 });
            c.server.get({ action: 'remove' });
            c.data.action = 'refresh';
            c.server.update();
            c.data.action = 'unknown';
        }`,
        server: `(function () {
            if (input && input.action === 'save') {}
            switch (input.action) { case 'remove': break; }
            if ('refresh' == input.action) {}
            data.action = input.actionLabel;
        })();`,
        template: '',
    });
    assert.deepEqual(result.client, ['warning:unknown']);
});

test('follows input.action aliases and skips dynamic or absent dispatch', () => {
    const aliased = run({
        client: `function () { var c = this; c.server.get({ action: 'one' }); c.server.get({ action: 'two' }); }`,
        server: `(function () { var action = input.action; if (action == 'one') {} })();`,
        template: '',
    });
    assert.deepEqual(aliased.client, ['warning:two']);
    for (const server of [
        '(function () { handlers[input.action](); })();',
        '(function () { if (input.action.indexOf("t") === 0) {} })();',
        '(function () { if (input && input.term) {} })();',
    ]) {
        const result = run({
            client: `function () { var c = this; c.server.get({ action: 'two' }); }`,
            server,
            template: '',
        });
        assert.deepEqual(result.client, [], server);
    }
});

test('the link function reads and writes data through its scope and controller parameters', () => {
    const result = run({
        client: 'function () { var c = this; }',
        link: `function link(scope, element, attrs, ctrl) {
            scope.data.fromScope;
            scope.c.data.fromAlias;
            ctrl.data.fromController;
            scope.data.linkWrite = true;
            element.data.notData;
            scope.data.missing;
            scope.server.get({ action: 'unknown' });
        }`,
        server: `(function () {
            data.fromScope = 1; data.fromAlias = 2; data.fromController = 3; data.orphan = 4;
            if (input.action == 'known') {}
        })();`,
        template: '{{c.data.linkWrite}}',
    });
    assert.deepEqual(result.link, ['warning:missing', 'warning:unknown']);
    assert.deepEqual(result.template, []);
    assert.deepEqual(result.server, ['unused:orphan']);
});

test('whole data use in the link function disables unused checks', () => {
    const result = run({
        link: 'function (scope) { angular.copy(scope.data); }',
        server: '(function () { data.a = 1; })();',
        template: '',
    });
    assert.deepEqual(result.server, []);
});

test('server scripts flag controller data references when the controller name is undefined', () => {
    const messages = (sources) =>
        JSON.parse(JSON.stringify(analyse(sources))).server.filter((issue) => / is not defined$/.test(issue.message));
    const sources = {
        client: '',
        controllerAs: 'vm',
        server: '(function () { data.a = c.data.a; vm.data.b = 1; obj.c.data; // c.data\n })();',
        template: '',
    };
    const errors = messages(sources);
    assert.deepEqual(
        errors.map((issue) => sources.server.slice(issue.start, issue.end)),
        ['vm', 'c']
    );
    assert.equal(errors[0].message, 'vm is not defined');
    assert.ok(errors.every((issue) => issue.severity === 'warning'));
    for (const server of [
        '(function () { var c = { data: {} }; c.data.a = 1; })();',
        '(function () { list.forEach(function (c) { c.data; }); })();',
        '(function () { const fn = (x, c) => c.data; })();',
    ]) {
        assert.deepEqual(messages({ client: '', server, template: '' }), [], server);
    }
});

test('client scripts and link functions flag bare data references when data is undefined', () => {
    const sources = {
        client: `function () { var c = this; data.a; c.data.b; response.data.c; data['d']; }`,
        link: 'function (scope) { data.e; scope.data.f; }',
        server: '(function () { data.a = 1; data.b = 2; data.d = 3; data.f = 4; })();',
        template: '',
    };
    const issues = JSON.parse(JSON.stringify(analyse(sources)));
    const errors = (part) => issues[part].filter((issue) => / is not defined$/.test(issue.message));
    assert.deepEqual(
        errors('client').map((issue) => [sources.client.slice(issue.start, issue.end + 2), issue.message]),
        [
            ['data.a', 'data is not defined'],
            ["data['", 'data is not defined'],
        ]
    );
    assert.deepEqual(
        errors('link').map((issue) => issue.message),
        ['data is not defined']
    );
    for (const client of [
        'function () { $http.get(url).then(function (data) { data.rows; }); }',
        'function () { var data = {}; data.a = 1; }',
        'function () { load().then((data) => data.rows); }',
    ]) {
        assert.equal(analyse({ client, server: '', template: '' }).client.length, 0, client);
    }
});

test('data parameters only hide warnings inside their own function, and string expressions are ignored', () => {
    const client = `api.controller = function ($scope, spUtil) {
        var c = this;
        $scope.$watch('data.task', function (newTask) {});
        data.typo = 1;
        spUtil.recordWatch($scope, 'table', 'query', function (data) { console.log(data.action); });
        load().then((data) => data.rows);
        load().then(data => data.rows);
        try {} catch (data) { data.message; }
        data.after;
    };`;
    const issues = JSON.parse(JSON.stringify(analyse({ client, server: '', template: '' })));
    assert.deepEqual(
        issues.client
            .filter((issue) => / is not defined$/.test(issue.message))
            .map((issue) => client.slice(issue.start, issue.end + 6)),
        ['data.typo ', 'data.after']
    );
});

test('options gets the same wrong-script warnings as data', () => {
    const sources = {
        client: 'function () { var c = this; options.title; c.options.title; }',
        link: 'function (scope) { options.size; scope.options.size; }',
        server: '(function () { var title = options.title || c.options.title; })();',
        template: '',
    };
    const messages = (part) =>
        JSON.parse(JSON.stringify(analyse(sources)))
            [part].filter((issue) => / is not defined$/.test(issue.message))
            .map((issue) => issue.message);
    assert.deepEqual(messages('client'), ['options is not defined']);
    assert.deepEqual(messages('link'), ['options is not defined']);
    assert.deepEqual(messages('server'), ['c is not defined']);
});

test('client definitions do not declare server data or options as globals', () => {
    const dts = fs.readFileSync('src/fluent/generated/client-development/ui-script/monaco_language_client.js', 'utf8');
    assert.doesNotMatch(dts, /declare var (data|options):/);
    assert.doesNotMatch(dts, /populated by the server script/);
});

test('Angular templates count as data reads and writes and receive their own issues', () => {
    const sources = {
        angularTemplates: [
            '<li ng-repeat="item in c.data.rows">{{data.heading}} {{c.data.nope}}</li>',
            '<input ng-model="c.data.term"><span>{{options.title}}</span>',
        ],
        client: 'function () { var c = this; c.data.term; }',
        server: '(function () { data.rows = []; data.heading = "x"; data.orphan = 1; })();',
        template: '<div ng-include="\'list.html\'"></div>',
    };
    const issues = JSON.parse(JSON.stringify(analyse(sources)));
    assert.deepEqual(
        issues.angularTemplates.map((list, i) =>
            list.map((issue) => sources.angularTemplates[i].slice(issue.start, issue.end))
        ),
        [['nope'], []]
    );
    assert.deepEqual(issues.client, []);
    assert.deepEqual(
        issues.server.map((issue) => sources.server.slice(issue.start, issue.end)),
        ['orphan']
    );
});

test('whole data bindings in templates still report unused server data', () => {
    const result = run({
        angularTemplates: ['<my-list data="c.data"></my-list>'],
        client: '',
        server: '(function () { data.a = 1; })();',
        template: '<pre>{{c.data | json}}</pre>',
    });
    assert.deepEqual(result.server, ['unused:a']);
});

test('checks read open template panes live and other linked templates from saved content', () => {
    assert.match(source, /\$scope\.\$watch\('templates', _scheduleWidgetDataChecks\);/);
    assert.match(source, /pane\.recordType === 'template'\)\s*\) \{\s*_scheduleWidgetDataChecks\(\);/);
    assert.match(source, /if \(!open\) sources\.angularTemplates\.push\(t\.template \|\| ''\);/);
});

test('messages state the problem without suggesting a fix', () => {
    const messages = analyse({
        client: "function () { var c = this; c.data.missing; data.x; c.server.get({ action: 'nope' }); }",
        server: "(function () { data.orphan = 1; if (input.action == 'yes') {} })();",
        template: '',
    });
    const all = ['client', 'server'].flatMap((part) => Array.from(messages[part], (issue) => issue.message));
    assert.deepEqual(all.sort(), [
        "Action 'nope' is not handled",
        'data is not defined',
        'data.missing is never set',
        'data.orphan is never used',
    ]);
});

test('comment blanking keeps offsets and ignores comment markers in strings', () => {
    const text = 'var a = "//not"; // gone\n/* also\ngone */ b';
    const blanked = context._blankComments(text);
    assert.equal(blanked.length, text.length);
    assert.equal(blanked.split('\n').length, 3);
    assert.match(blanked, /"\/\/not"/);
    assert.doesNotMatch(blanked, /gone/);
});

test('data checks are a persisted preference that defaults on', () => {
    assert.match(source, /widgetDataChecks: true,/);
    assert.match(source, /prefs\.widgetDataChecks = \$scope\.userPrefs\.widgetDataChecks;/);
    assert.match(source, /prefs\.showUnusedVars = \$scope\.userPrefs\.showUnusedVars;/);
    assert.match(source, /\$scope\.userPrefs\.widgetDataChecks = !!\$scope\.userPrefsEdit\.widgetDataChecks;/);
    assert.match(source, /\$scope\.userPrefsEdit\.widgetDataChecks = true;/);
    assert.match(html, /id="chk-widget-data-checks" ng-model="userPrefsEdit\.widgetDataChecks"/);
});

test('focus rechecks reopen the Different Update Set alert when the current update set no longer matches', async () => {
    const pending = [];
    const scope = {
        isVersionView: false,
        updateSetAlertDismissed: true,
        updateSetMismatch: false,
        widgetUpdateSetId: 'ws',
    };
    const ctx = vm.createContext({
        $scope: scope,
        document: { hidden: false },
        _knownUpdateSetId: 'ws',
        _updateSetCheckPending: false,
        ajax: () => new Promise((resolve) => pending.push(resolve)),
    });
    loadFunction(ctx, '_applyCurrentUpdateSet');
    const check = loadFunction(ctx, '_checkCurrentUpdateSet');
    async function answer(id) {
        pending.shift()({ success: true, update_set_id: id });
        await new Promise(setImmediate);
    }

    check();
    check();
    assert.equal(pending.length, 1, 'concurrent checks are coalesced');
    await answer('other');
    assert.equal(scope.updateSetMismatch, true);
    assert.equal(scope.updateSetAlertDismissed, false);
    assert.equal(scope.openDropdown, 'alert-updateset');

    scope.updateSetAlertDismissed = true;
    scope.openDropdown = null;
    check();
    await answer('other');
    assert.equal(scope.updateSetAlertDismissed, true, 'an unchanged update set keeps the alert dismissed');
    assert.equal(scope.openDropdown, null);

    scope.openDropdown = 'alert-updateset';
    check();
    await answer('ws');
    assert.equal(scope.updateSetMismatch, false, 'switching to the record update set clears the mismatch');
    assert.equal(scope.openDropdown, null, 'a cleared mismatch closes its popover');

    ctx.document.hidden = true;
    check();
    assert.equal(pending.length, 0, 'hidden tabs do not check');
    ctx.document.hidden = false;
    ctx._knownUpdateSetId = null;
    check();
    assert.equal(pending.length, 0, 'records without an in-progress update set do not check');
});

test('widgets without an in-progress update set compare against the load-time update set, and saves move it', () => {
    assert.match(
        source,
        /\$scope\.widgetUpdateSetId =\s*\$scope\.isWidgetRecord === false\s*\? ''\s*: data\.widget\.widget_update_set_id \|\| data\.widget\.current_update_set_id \|\| '';/
    );
    assert.match(
        source,
        /\$scope\.widgetUpdateSetName =\s*\$scope\.isWidgetRecord === false\s*\? ''\s*: data\.widget\.widget_update_set_name \|\| data\.widget\.current_update_set_name \|\| '';/
    );
    assert.match(source, /if \(\$scope\.lastSaveUpdateSet\) _applySavedUpdateSet\(\$scope\.lastSaveUpdateSet\);/);
    assert.match(source, /if \(savedUpdateSet\) _applySavedUpdateSet\(savedUpdateSet\);/);
    const scope = { isWidgetRecord: true, updateSetMismatch: true, widgetUpdateSetId: 'a', widgetUpdateSetName: 'A' };
    const ctx = vm.createContext({ $scope: scope, _knownUpdateSetId: 'a' });
    const applySaved = loadFunction(ctx, '_applySavedUpdateSet');
    applySaved({ name: 'B', sys_id: 'b' });
    assert.deepEqual(
        [scope.widgetUpdateSetId, scope.widgetUpdateSetName, scope.updateSetMismatch, ctx._knownUpdateSetId],
        ['b', 'B', false, 'b']
    );
    scope.isWidgetRecord = false;
    applySaved({ name: 'C', sys_id: 'c' });
    assert.equal(scope.widgetUpdateSetId, 'b', 'other record types keep the widget mismatch state');
    assert.deepEqual([scope.recordUpdateSet.sys_id, scope.currentUpdateSetId], ['c', 'c']);
});

test('the header marks records in the current update set', () => {
    const scope = { currentUpdateSetId: 'a', recordUpdateSet: null };
    const ctx = vm.createContext({ $scope: scope, _knownUpdateSetId: 'a' });
    vm.runInContext(source.match(/\$scope\.isInCurrentUpdateSet = function \(\) \{[\s\S]*?\n {16}\};/)[0], ctx);
    const applyCurrent = loadFunction(ctx, '_applyCurrentUpdateSet');
    assert.equal(scope.isInCurrentUpdateSet(), false, 'records without an in-progress update set are unmarked');
    scope.recordUpdateSet = { name: 'A', sys_id: 'a' };
    assert.equal(scope.isInCurrentUpdateSet(), true);
    applyCurrent('b');
    assert.equal(scope.isInCurrentUpdateSet(), false, 'switching update sets elsewhere clears the mark');
    assert.match(
        source,
        /\$scope\.widgetUpdateSetId \|\| \$scope\.recordUpdateSet\s*\? data\.widget\.current_update_set_id \|\| ''/
    );
    assert.match(
        html,
        /<i class="icon-livefeed we-record-update-set" role="img" ng-if="!loading &amp;&amp; !loadError &amp;&amp; !showPicker &amp;&amp; !isVersionView &amp;&amp; isInCurrentUpdateSet\(\)" aria-label="\{\{'Current update set: ' \+ recordUpdateSet\.name\}\}" we-tooltip-title="\{\{'Current update set: ' \+ recordUpdateSet\.name\}\}"><\/i>/
    );
});

test('focus checks also listen on the framing Next Experience window', () => {
    assert.match(source, /if \(window\.top !== window && window\.top\.document\) _focusWindows\.push\(window\.top\);/);
    assert.match(source, /win\.addEventListener\('focus', _checkCurrentUpdateSet\);/);
    assert.match(source, /win\.removeEventListener\('focus', _checkCurrentUpdateSet\);/);
});

test('the widget payload includes the current update set and the alert keeps its original markup', () => {
    const server = fs.readFileSync(
        'src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_ajax.server.js',
        'utf8'
    );
    assert.match(server, /current_update_set_id: currentUpdateSetId,/);
    assert.match(server, /current_update_set_name: this\._getUpdateSetName\(currentUpdateSetId\),/);
    assert.match(server, /getCurrentUpdateSet: function \(\)/);
    assert.match(html, /ng-if="!isVersionView &amp;&amp; updateSetMismatch &amp;&amp; !updateSetAlertDismissed"/);
    assert.doesNotMatch(html, /updateSetChange/);
});

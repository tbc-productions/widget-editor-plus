const { readUiPageSource } = require('../helpers/fluent-source.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const source = readUiPageSource('src/fluent/generated/other/sys-ui-page/sys_ui_page_8b2e70458373fe1070b8b5dfeeaad35e.now.ts');

test('Credit+ appears between Keyboard shortcuts and Code Search+ in the Widget Editor+ menu', () => {
    const keyboard = source.indexOf('>Keyboard shortcuts</div>');
    const credit = source.indexOf('ng-click="openCredit()">Credit+');
    const codeSearch = source.indexOf('ng-click="openCodeSearch()">Code Search+');
    const apiDocs = source.indexOf('ng-click="openApiDocs()">API documentation');

    assert.ok(keyboard >= 0, 'Keyboard shortcuts menu item should exist');
    assert.ok(credit > keyboard && codeSearch > credit, 'Credit+ should be directly above Code Search+');
    assert.match(source, /<j:if test="\$\{gs.hasRole\('admin'\)\}"><div class="we-dropdown-item" ng-if="!isNewWidget" ng-click="openCredit\(\)">Credit\+<\/div><\/j:if>/);
    assert.ok(apiDocs > codeSearch, 'Code Search should precede API documentation');
});

test('Code search opens its UI Page record in a new tab and closes the menu', () => {
    const functionStart = source.indexOf('$scope.openCodeSearch = function () {');
    const functionEnd = source.indexOf('$scope.openApiDocs = function () {', functionStart);
    const implementation = source.slice(functionStart, functionEnd);

    assert.ok(functionStart >= 0 && functionEnd > functionStart, 'openCodeSearch should exist');
    assert.ok(
        implementation.includes(
            "'/nav_to.do?uri=ui_page.do%3Fsys_id%3D27a85cdf06a14eba97d2ffc3b57c4a46'"
        )
    );
    assert.ok(implementation.includes("'_blank'"));
    assert.ok(implementation.includes("'noopener,noreferrer'"));
    assert.ok(implementation.includes('$scope.openDropdown = null;'));
});


test('Credit+ opens the current saved widget in a new tab and closes the menu', () => {
    const start = source.indexOf('$scope.openCredit = function () {');
    const end = source.indexOf('$scope.openCodeSearch = function () {', start);
    assert.ok(start >= 0 && end > start);
    for (const [id, isNewWidget, opens] of [['a'.repeat(32), false, true], ['', false, false], ['invalid', false, false], ['b'.repeat(32), true, false]]) {
        const calls = [], scope = { isNewWidget, openDropdown: 'burger' };
        vm.runInNewContext(source.slice(start, end), { $scope: scope, SYS_ID: id, window: { open: (...args) => calls.push(args) } });
        scope.openCredit();
        assert.equal(scope.openDropdown, null);
        assert.equal(calls.length, opens ? 1 : 0);
        if (opens) {
            const url = new URL(calls[0][0], 'https://instance.test');
            const destination = new URL(url.searchParams.get('uri'), url.origin);
            assert.equal(destination.pathname, '/ui_page.do');
            assert.equal(destination.searchParams.get('sys_id'), '9c5bf170283e4d6394aa639c79936587');
            assert.equal(destination.searchParams.get('sysparm_table'), 'sp_widget');
            assert.equal(destination.searchParams.get('sysparm_record'), id);
            assert.deepEqual(calls[0].slice(1), ['_blank', 'noopener,noreferrer']);
        }
    }
});

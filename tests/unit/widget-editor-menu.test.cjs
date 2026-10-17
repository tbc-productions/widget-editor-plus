const { readUiPageSource } = require('../helpers/fluent-source.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const source = readUiPageSource('src/fluent/generated/other/sys-ui-page/sys_ui_page_8b2e70458373fe1070b8b5dfeeaad35e.now.ts');

test('Widget Editor+ keeps app shortcuts in the drawer rather than duplicating them in its menu', () => {
    assert.doesNotMatch(source, /openCredit|openCodeSearch/);
    const keyboard = source.indexOf('>Keyboard shortcuts</div>');
    const apiDocs = source.indexOf('ng-click="openApiDocs()">API documentation');
    assert.ok(keyboard >= 0 && apiDocs > keyboard);
    assert.match(source, /<we-app-drawer current-app="widget-editor"/);
    assert.match(source, /name: 'Code Search\+'/);
    assert.match(source, /name: 'Credit\+'/);
});

test('opening a dropdown by keyboard prevents the document handler from focusing it twice', () => {
    const callbacks = [], scope = {};
    let prevented = false, stopped = false, focused = 0;
    const context = {
        $scope: scope,
        $timeout: callback => callbacks.push(callback),
        document: { querySelector: () => ({}) },
        _prepareDropdownKeyboardItems() {},
        _getMenuKeyboardItems: () => [{ focus: () => focused++ }],
    };
    vm.runInNewContext(source.slice(source.indexOf('$scope.onDropdownTriggerKeydown ='), source.indexOf("$scope.$watch('openDropdown'")), context);
    scope.onDropdownTriggerKeydown({
        key: 'ArrowDown',
        preventDefault: () => { prevented = true; },
        stopPropagation: () => { stopped = true; },
    }, 'pickerType');
    assert.equal(prevented && stopped, true);
    assert.equal(scope.openDropdown, 'pickerType');
    assert.equal(focused, 0);
    assert.equal(callbacks.length, 1);
    callbacks[0]();
    assert.equal(focused, 1);
});

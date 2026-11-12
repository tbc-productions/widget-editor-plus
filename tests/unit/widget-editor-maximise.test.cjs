const { readUiPageSource } = require('../helpers/fluent-source.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const source = readUiPageSource('src/fluent/generated/other/sys-ui-page/sys_ui_page_8b2e70458373fe1070b8b5dfeeaad35e.now.ts');

function createContext(paneKeys, hiddenKeys = []) {
    const scope = {
        coreEditorDefs: [...paneKeys, ...hiddenKeys].map(key => ({ field: key, key, visible: paneKeys.includes(key) })),
        maximisedPaneKey: null,
        widget: {},
    };
    const context = {
        $scope: scope,
        $timeout: callback => callback(),
        buildVisibleItems: () => {
            const panes = scope.coreEditorDefs.filter(def => def.visible).map(def => ({ key: def.key, type: 'pane' }));
            scope.visiblePaneCount = panes.length;
            context._reconcileMaximisedPane(panes);
            scope.visibleItems = panes;
        },
        disposeEditor: key => { delete context.monacoEditors[key]; },
        focused: [],
        initAllEditors: () => {
            for (const def of scope.coreEditorDefs.filter(d => d.visible)) {
                context.monacoEditors[def.key] ||= { focus: () => context.focused.push(def.key), getValue: () => `${def.key} value` };
            }
        },
        layouts: 0,
        layoutAllEditors: () => { context.layouts++; },
        monacoEditors: {},
    };
    const start = source.indexOf('function _reconcileMaximisedPane(');
    const end = source.indexOf('$scope.reorderPrefEditors =');
    assert.ok(start >= 0 && end > start);
    vm.runInNewContext(source.slice(start, end), context);
    context.buildVisibleItems();
    context.initAllEditors();
    return context;
}

test('maximising a pane is session-only view state that restores on a second toggle', () => {
    const context = createContext(['template', 'script']);
    const scope = context.$scope;
    scope.toggleMaximisePane({ key: 'script' });
    assert.equal(scope.maximisedPaneKey, 'script');
    assert.deepEqual(context.focused, ['script']);
    scope.toggleMaximisePane({ key: 'script' });
    assert.equal(scope.maximisedPaneKey, null);
    assert.deepEqual(context.focused, ['script', 'script']);
    assert.equal(context.layouts, 2);
    assert.equal(scope.userPrefs, undefined);
});

test('a single pane cannot be maximised', () => {
    const context = createContext(['script']);
    context.$scope.toggleMaximisePane({ key: 'script' });
    assert.equal(context.$scope.maximisedPaneKey, null);
});

test('maximise follows a newly opened pane and ends when its pane closes', () => {
    const context = createContext(['template', 'script']);
    const scope = context.$scope;
    scope.maximisePane({ key: 'script' });
    context._reconcileMaximisedPane([{ key: 'template' }, { key: 'script' }, { key: 'provider-1' }]);
    assert.equal(scope.maximisedPaneKey, 'provider-1');
    context._reconcileMaximisedPane([{ key: 'template' }, { key: 'script' }]);
    assert.equal(scope.maximisedPaneKey, null);
});

test('a hidden editor opened while maximised is hidden again on restore', () => {
    const context = createContext(['template', 'script'], ['css']);
    const scope = context.$scope;
    const css = scope.coreEditorDefs.find(def => def.key === 'css');
    scope.maximisePane({ key: 'css' });
    assert.equal(css.visible, false);
    scope.maximisePane({ key: 'script' });
    scope.maximisePane({ key: 'css' });
    assert.equal(css.visible, true);
    assert.equal(scope.maximisedPaneKey, 'css');
    assert.equal(context.focused.at(-1), 'css');
    scope.restorePanes();
    assert.equal(css.visible, false);
    assert.equal(scope.maximisedPaneKey, null);
    assert.equal(scope.widget.css, 'css value');
    assert.deepEqual(scope.visibleItems.map(item => item.key), ['template', 'script']);
    assert.equal(context.focused.at(-1), 'template');
});

test('double-clicking a header control does not toggle maximise', () => {
    const context = createContext(['template', 'script']);
    const scope = context.$scope;
    scope.onPaneHeaderDblClick({ key: 'script' }, { target: { closest: () => ({}) } });
    assert.equal(scope.maximisedPaneKey, null);
    scope.onPaneHeaderDblClick({ key: 'script' }, { target: { closest: () => null } });
    assert.equal(scope.maximisedPaneKey, 'script');
});

test('maximised panes hide their siblings without changing saved visibility', () => {
    assert.match(source, /'we-max-hidden': maximisedPaneKey &amp;&amp; maximisedPaneKey !== item\.key/);
    assert.match(source, /\.we-body \.we-max-hidden \{ display: none !important; \}/);
    assert.match(source, /ng-click="toggleMaximisePane\(item\)"/);
    assert.match(source, /other in switchableEditors track by other\.key/);
    assert.match(source, /coreEditorDefs\.length > 1 &amp;&amp; !maximisedPaneKey/);
    assert.match(source, /id: 'we\.toggleMaximise'/);
});

test('the maximised strip flags editors another user has updated', () => {
    assert.match(source, /'we-pane-max-chip--changed': other\.externalChange/);
    assert.match(source, /other\.externalChange\.user \+ ' has updated ' \+ other\.label/);
});

const { readUiPageSource } = require('../helpers/fluent-source.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vmModule = require('node:vm');

const pageSource = readUiPageSource('src/fluent/generated/other/sys-ui-page/sys_ui_page_widget_editor_code_search.now.ts');
const serverSource = fs.readFileSync(
    'src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_code_search.server.js',
    'utf8'
);
const propertiesSource = fs.readFileSync(
    'src/fluent/generated/properties/system-property/sys_properties_widget_editor_code_search_display_fields.now.ts',
    'utf8'
);
const categorySource = fs.readFileSync(
    'src/fluent/generated/properties/system-property-category-m2m/sys_properties_category_m2m_widget_editor_plus.now.ts',
    'utf8'
);
const pageAclSource = fs.readFileSync(
    'src/fluent/generated/security/access-control/sys_security_acl_widget_editor_code_search_ui_page.now.ts',
    'utf8'
);
const ajaxAclSource = fs.readFileSync(
    'src/fluent/generated/security/access-control/sys_security_acl_widget_editor_code_search_ajax.now.ts',
    'utf8'
);
const moduleSource = fs.readFileSync(
    'src/fluent/generated/user-interface/module/sys_app_module_widget_editor_code_search.now.ts',
    'utf8'
);

test('code search uses GlideRecord and is restricted to sp_admin', () => {
    assert.equal(serverSource.includes('GlideRecordSecure'), false);
    assert.ok(serverSource.includes('new GlideRecord('));
    assert.ok(pageAclSource.includes("roles: ['sp_admin']"));
    assert.ok(ajaxAclSource.includes("roles: ['sp_admin']"));
    assert.ok(moduleSource.includes('override_menu_roles: true'));
    assert.ok(moduleSource.includes("roles: ['sp_admin']"));
});

test('table search always caps the GlideRecord scan, even with secondary filters or case-sensitive matching', () => {
    assert.ok(
        serverSource.includes('record.setLimit(!secondaryFilters.length && !caseSensitive ? limit + 1 : this.MAX_SCAN_ROWS);'),
        'setLimit must always be applied so a CONTAINS query cannot scan a table unbounded when secondary filters or case-sensitive matching leave `count` under the limit'
    );
    assert.ok(serverSource.includes('MAX_SCAN_ROWS:'), 'MAX_SCAN_ROWS constant should bound the worst-case scan');
});

test('advanced conditions round-trip through the URL alongside the query, case and active-only params', () => {
    assert.ok(
        pageSource.includes("if (urlFilters.length) url.searchParams.set('filters', JSON.stringify(urlFilters));"),
        'updateUrlParam should persist non-empty secondary filters as a filters URL param'
    );
    assert.ok(
        pageSource.includes("url.searchParams.delete('filters');"),
        'updateUrlParam should clear the filters URL param when there is no query or no valid filters'
    );
    assert.ok(
        /if \(urlFilters && urlFilters.length\) \{\s*vm.secondaryFilters = urlFilters;\s*vm.showAdvancedFilters = true;\s*\}/.test(pageSource),
        'Filters parsed from the URL on load should populate vm.secondaryFilters and reveal the advanced filters panel'
    );

    const start = pageSource.indexOf('            function _parseUrlFilters(raw) {');
    const end = pageSource.indexOf('            var initialParams = new URLSearchParams', start);
    const fnSource = pageSource.slice(start, end);
    eval(fnSource);

    assert.equal(_parseUrlFilters(null), null, 'Missing filters param should parse to null');
    assert.equal(_parseUrlFilters('not json'), null, 'Malformed JSON should parse to null');
    assert.equal(_parseUrlFilters(JSON.stringify([{ operator: 'contains', term: '', joiner: 'and' }])), null, 'A blank term should be rejected');
    assert.equal(_parseUrlFilters(JSON.stringify([{ operator: 'bogus', term: 'x', joiner: 'and' }])), null, 'An invalid operator should be rejected');
    assert.equal(_parseUrlFilters(JSON.stringify([{ operator: 'contains', term: 'x', joiner: 'maybe' }])), null, 'An invalid joiner should be rejected');
    assert.equal(_parseUrlFilters(JSON.stringify(Array(21).fill({ operator: 'contains', term: 'x', joiner: 'and' }))), null, 'More than 20 filters should be rejected');

    const valid = [
        { operator: 'contains', term: 'incident', joiner: 'and' },
        { operator: 'not_contains', term: 'test', joiner: 'or' }
    ];
    assert.deepEqual(_parseUrlFilters(JSON.stringify(valid)), valid, 'A valid filters array should round-trip unchanged');
});

test('changing Group/Sort resets the results pane without smooth scrolling', () => {
    const start = pageSource.indexOf("            $scope.$watch('ctrl.viewMode'");
    const end = pageSource.indexOf('            vm.clearInput = function', start);
    const watcherSource = pageSource.slice(start, end);
    const container = { scrollTop: 480, scrollTo() { throw new Error('scrollTo must not be used'); } };
    let watcher;
    let sortedUpdates = 0;
    let viewedUpdates = 0;
    const vm = {};
    const $scope = { $watch(_name, callback) { watcher = callback; } };
    const $timeout = callback => callback();
    const document = { getElementById() { return container; } };
    const _updateSortedResults = () => { sortedUpdates++; };
    const _updateCurrentViewedTable = () => { viewedUpdates++; };

    eval(watcherSource);
    watcher('date_desc', 'group_table');

    assert.equal(container.scrollTop, 0);
    assert.equal(sortedUpdates, 1);
    assert.equal(viewedUpdates, 1);
    assert.equal(watcherSource.includes("behavior: 'smooth'"), false);
});

test('excluding a result field marks its table and recomputes the visible record count', () => {
    const helpersStart = pageSource.indexOf('            function _fieldIsActive');
    const helpersEnd = pageSource.indexOf("            // Tracks which table's section", helpersStart);
    const togglesStart = pageSource.indexOf('            // At least one field must stay included');
    const togglesEnd = pageSource.indexOf('            function _fieldsOrClause', togglesStart);

    const vm = {
        hasSearched: true,
        viewMode: 'group_table',
        tableActiveFields: {},
        tableMatchCounts: {},
        tables: [{ table: 'x_example', sysId: '1' }],
        tablesWithResults: [],
        results: [
            { table: 'x_example', tableLabel: 'Example', displayValue: 'A', matches: [{ field: 'script' }] },
            { table: 'x_example', tableLabel: 'Example', displayValue: 'B', matches: [{ field: 'template' }] }
        ],
        scrollToTable(table, options) { this.lastScrollRequest = { table, options }; }
    };
    function _updateTablesWithResults() {
        vm.tablesWithResults = vm.tables.filter(table => (vm.tableMatchCounts[table.table] || 0) > 0);
    }

    eval(pageSource.slice(helpersStart, helpersEnd));
    eval(pageSource.slice(togglesStart, togglesEnd));
    _updateGroupedResults();
    const group = vm.groupedResults[0];

    assert.equal(vm.tableMatchCounts.x_example, 2);
    assert.equal(vm.hasExcludedResultFields('x_example'), false);
    vm.toggleGroupField(group, 'template');
    assert.equal(vm.hasExcludedResultFields('x_example'), true);
    assert.equal(vm.tableMatchCounts.x_example, 1);
    assert.equal(vm.tablesWithResults.length, 1);
    assert.deepEqual(vm.lastScrollRequest, {
        table: 'x_example',
        options: { forceTop: true, smooth: true }
    });
    assert.ok(pageSource.includes('ng-if="ctrl.hasExcludedResultFields(table.table)"'));
});

test('record header fields come only from each table display-fields property', () => {
    const requested = [];
    const context = {
        AbstractAjaxProcessor: {},
        Class: { create() { return function WidgetEditorCodeSearchAjax() {}; } },
        GlideRecord() {},
        JSON,
        encodeURIComponent,
        gs: {
            getProperty(name) {
                requested.push(name);
                return ' type, operation, type,  ';
            }
        }
    };
    context.Object = Object.create(Object);
    context.Object.extendsObject = (_base, members) => members;
    vmModule.runInNewContext(serverSource, context);
    const config = new context.WidgetEditorCodeSearchAjax()._getTableDisplayConfig('sys_security_acl');

    assert.deepEqual(Array.from(config.secondaryFields), ['type', 'operation']);
    assert.equal(config.primaryField, '');
    assert.deepEqual(requested, ['monaco.plus.code_search.display_fields.sys_security_acl']);
});

test('all known code-search tables have display-field properties in the Monaco category', () => {
    const expectedFields = {
        catalog_script_client: 'cat_item,type',
        catalog_ui_policy: 'catalog_item',
        catalog_ui_policy_action: 'catalog_item,ui_policy,variable',
        item_option_new: 'cat_item,type',
        sc_cat_item_producer: 'table_name,category',
        sp_angular_provider: 'type',
        sp_ng_template: 'sp_widget',
        sp_page: 'title',
        sp_widget: 'id',
        sysevent_email_action: 'collection,category',
        sysevent_email_template: 'sys_scope',
        sysevent_in_email_action: 'target_table,type',
        sysevent_script_action: 'event_name',
        sys_processor: 'type,path',
        sys_relationship: 'applies_to,queries_from',
        sys_script: 'collection,when',
        sys_script_client: 'table,type',
        sys_script_email: 'sys_scope',
        sys_script_include: 'sys_scope',
        sys_security_acl: 'type,operation',
        sys_transform_map: 'source_table,target_table',
        sys_ui_action: 'table',
        sys_ui_macro: 'sys_scope',
        sys_ui_page: 'sys_scope,category',
        sys_ui_policy: 'table',
        sys_ui_script: 'sys_scope,ui_type',
        sys_ui_style: 'table,element',
        sysauto_script: 'sys_scope,run_type'
    };
    Object.entries(expectedFields).forEach(([table, fields]) => {
        assert.ok(propertiesSource.includes(`name: 'monaco.plus.code_search.display_fields.${table}'`));
        const propertyStart = propertiesSource.indexOf(`name: 'monaco.plus.code_search.display_fields.${table}'`);
        assert.ok(propertiesSource.slice(propertyStart, propertyStart + 180).includes(`value: '${fields}'`));
        assert.ok(categorySource.includes(`code-search-display-fields-${table.replaceAll('_', '-')}`));
    });

    ['cmn_map_page', 'sp_css', 'sp_search_source', 'sys_trigger'].forEach(table => {
        assert.equal(propertiesSource.includes(`name: 'monaco.plus.code_search.display_fields.${table}'`), false);
        assert.equal(categorySource.includes(`code-search-display-fields-${table.replaceAll('_', '-')}`), false);
    });
});

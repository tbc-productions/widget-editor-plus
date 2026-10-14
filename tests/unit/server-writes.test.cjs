const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(
    'src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_ajax.server.js',
    'utf8'
);
const id = 'a'.repeat(32);

function harness(params, tables = {}, shared = false) {
    const operations = [];
    function Record(table) {
        const options = tables[table] || {};
        let row = 0;
        this.initialize =
            this.setValue =
            this.addQuery =
            this.setLimit =
                () => {};
        this.get = () => true;
        this.canWrite = () => true;
        this.canDelete = () => options.canDelete !== false;
        this.query = () => {
            row = 0;
        };
        this.next = () => row++ < (options.rows || 0);
        this.hasNext = () => shared;
        for (const method of ['insert', 'update', 'deleteRecord']) {
            this[method] = () => {
                operations.push([table, method]);
                return method in options
                    ? options[method]
                    : method === 'deleteRecord'
                      ? true
                      : id;
            };
        }
    }
    const context = vm.createContext({
        Class: { create: () => function () {} },
        Object: { extendsObject: (_, methods) => methods },
        AbstractAjaxProcessor: {},
        gs: { getProperty: (_, fallback) => fallback },
        GlideRecordSecure: Record,
    });
    vm.runInContext(source, context);
    const api = context.WidgetEditorAjax.prototype;
    api.getParameter = (name) => params[name];
    api._answer = (answer) => answer;
    return { api, operations };
}

for (const [method, table] of [
    ['saveTemplate', 'sp_ng_template'],
    ['saveProvider', 'sp_angular_provider'],
    ['saveScriptInclude', 'sys_script_include'],
]) {
    test(`${method} reports failed updates and successful saves`, () => {
        const params = {
            sys_id: id,
            data: JSON.stringify({
                sys_id: id,
                id: 'template',
                name: 'provider',
                script: 'edited',
            }),
        };
        const failed = harness(params, { [table]: { update: null } });
        assert.equal(failed.api[method]().success, false);
        assert.equal(harness(params).api[method]().success, true);
    });
}

for (const [method, table] of [
    ['saveTemplate', 'sp_ng_template'],
    ['saveProvider', 'sp_angular_provider'],
]) {
    test(`${method} stops after a failed insert instead of using the ID "null"`, () => {
        const h = harness(
            {
                sys_id: id,
                data: JSON.stringify({ id: 'template', name: 'provider' }),
            },
            { [table]: { insert: null } }
        );
        const result = h.api[method]();
        assert.equal(result.success, false);
        assert.equal(result.sys_id, undefined);
        assert.deepEqual(h.operations, [[table, 'insert']]);
    });
}

test('a failed provider link removes only the newly created provider and reports rollback failure', () => {
    for (const removed of [true, false]) {
        const h = harness(
            { sys_id: id, data: JSON.stringify({ name: 'new provider' }) },
            {
                sp_angular_provider: { deleteRecord: removed },
                m2m_sp_ng_pro_sp_widget: { insert: null },
            }
        );
        const answer = h.api.saveProvider();
        assert.equal(answer.success, false);
        assert.match(
            answer.error,
            removed ? /new provider was removed/ : /Link existing provider/
        );
        assert.deepEqual(h.operations, [
            ['sp_angular_provider', 'insert'],
            ['m2m_sp_ng_pro_sp_widget', 'insert'],
            ['sp_angular_provider', 'deleteRecord'],
        ]);
    }
});

test('ES12 failures are reported for both creation and update', () => {
    for (const rows of [0, 1]) {
        const params = { sys_id: id, enabled: 'true' };
        const failed = harness(params, {
            sys_es_latest_script: { rows, insert: null, update: null },
        });
        assert.equal(failed.api.saveEs12().success, false);
        const saved = harness(params, {
            sys_es_latest_script: { rows },
        }).api.saveEs12();
        assert.equal(saved.success, true);
        assert.equal(saved.result, true);
    }
});

test('failed template deletion does not report success', () => {
    const h = harness(
        { sys_id: id },
        { sp_ng_template: { deleteRecord: false } }
    );
    assert.equal(h.api.deleteTemplate().success, false);
});

for (const [kind, table, param] of [
    ['Provider', 'm2m_sp_ng_pro_sp_widget', 'provider_sys_id'],
    ['Dependency', 'm2m_sp_widget_dependency', 'dep_sys_id'],
]) {
    test(`${kind} links report failed writes and keep existing links as no-ops`, () => {
        const params = { sys_id: id, [param]: id };
        const failedLink = harness(params, { [table]: { insert: null } });
        assert.equal(failedLink.api['link' + kind]().success, false);
        const failedUnlink = harness(params, { [table]: { rows: 1, deleteRecord: false } });
        assert.equal(failedUnlink.api['unlink' + kind]().success, false);
        assert.equal(harness(params).api['link' + kind]().success, true);
        assert.equal(harness(params, { [table]: { rows: 1 } }).api['unlink' + kind]().success, true);
        for (const [method, rows] of [['link', 1], ['unlink', 0]]) {
            const noop = harness(params, { [table]: { rows } });
            assert.equal(noop.api[method + kind]().success, true);
            assert.deepEqual(noop.operations, []);
        }
    });
}

test('failed provider deletion leaves widget links untouched', () => {
    const h = harness(
        { sys_id: id, widget_sys_id: id },
        {
            sp_angular_provider: { deleteRecord: false },
            m2m_sp_ng_pro_sp_widget: { rows: 1 },
        }
    );
    assert.equal(h.api.deleteProvider().success, false);
    assert.deepEqual(h.operations, [['sp_angular_provider', 'deleteRecord']]);
});

test('provider deletion checks link permissions and refuses shared providers before writing', () => {
    for (const shared of [false, true]) {
        const h = harness(
            { sys_id: id, widget_sys_id: id },
            { m2m_sp_ng_pro_sp_widget: { rows: 1, canDelete: false } },
            shared
        );
        assert.equal(h.api.deleteProvider().success, false);
        assert.deepEqual(h.operations, []);
    }
});

test('provider deletion removes links only after success and reports failed link cleanup', () => {
    for (const deleted of [true, false]) {
        const h = harness(
            { sys_id: id, widget_sys_id: id },
            { m2m_sp_ng_pro_sp_widget: { rows: 1, deleteRecord: deleted } }
        );
        assert.equal(h.api.deleteProvider().success, deleted);
        assert.deepEqual(h.operations, [
            ['sp_angular_provider', 'deleteRecord'],
            ['m2m_sp_ng_pro_sp_widget', 'deleteRecord'],
        ]);
    }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const base = 'src/fluent/generated/other/sys-ui-page/widget_editor_compare';
const script = fs.readFileSync(base + '.client.js', 'utf8');
const html = fs.readFileSync(base + '.html', 'utf8');

function metadata(overrides = {}) {
    const context = {
        ctrl: {}, _leftIsCurrentSaved: false, _leftVersionData: null, _rightVersionData: null,
        _savedRef: { sys_updated_by: 'saved updater' }, _recordData: { sys_updated_by: 'current updater' },
        _currentDate: '', _latestVerUsn: '', _latestVerUss: '',
        _formatDate: value => value, _formatDateFull: value => value,
        ...overrides,
    };
    vm.runInNewContext(script.slice(script.indexOf('var lMeta;'), script.indexOf('ctrl.currentMeta = {', script.indexOf('var lMeta;'))), context);
    return context.ctrl;
}

test('Compare+ pins an unconditional Updated by row ahead of sorted fields', () => {
    const row = html.match(/<tr\b[^>]*>(?:(?!<\/tr>)[\s\S])*?we-tooltip="sys_updated_by"[\s\S]*?<\/tr>/)[0];
    assert.equal(row.includes('ng-if='), false);
    assert.match(row, /<span>Updated by<\/span>/);
    for (const side of ['Left', 'Right']) {
        assert.match(row, new RegExp('ng-model="ctrl.meta' + side + '.by"\\s+aria-label="Updated by \\(' + side.toLowerCase() + '\\)"'));
    }
    assert.ok(html.indexOf(row) < html.indexOf('ng-repeat="f in ctrl.fields"'));

    for (const showChangedFieldsFirst of [false, true]) {
        const ctrl = {
            showChangedFieldsFirst,
            rawFields: [{ key: 'sys_created_by' }, { key: 'sys_updated_by' }, { key: 'script', isScript: true, changed: true }],
            extraFields: [{ key: 'description', isExtra: true }],
            isChanged: () => false,
        };
        const context = { ctrl, _scheduleChangedBelowIndicatorUpdate() {} };
        vm.runInNewContext(script.slice(script.indexOf('function _sortFields()'), script.indexOf('ctrl.toggleShowChangedFieldsFirst =')), context);
        context._sortFields();
        assert.deepEqual(Array.from(ctrl.fields, field => field.key), showChangedFieldsFirst
            ? ['script', 'description', 'sys_created_by'] : ['sys_created_by', 'script', 'description']);
    }
});

test('Compare+ prefers the record updater in both version payloads over the version creator', () => {
    const ctrl = metadata({
        _leftVersionData: { sys_created_by: 'left importer', fields: { sys_updated_by: 'left updater' } },
        _rightVersionData: { sys_created_by: 'right importer', fields: { sys_updated_by: 'right updater' } },
    });
    assert.equal(ctrl.metaLeft.by, 'left updater');
    assert.equal(ctrl.metaRight.by, 'right updater');
});

test('Compare+ keeps author fallbacks, saved/current updaters and unsaved metadata', () => {
    for (const fields of [undefined, {}, { sys_updated_by: '' }]) {
        const ctrl = metadata({
            _leftVersionData: { sys_created_by: 'left author', fields },
            _rightVersionData: { sys_created_by: 'right author', fields },
        });
        assert.equal(ctrl.metaLeft.by, 'left author');
        assert.equal(ctrl.metaRight.by, 'right author');
    }
    assert.equal(metadata().metaLeft.by, '');
    const current = metadata({ _leftIsCurrentSaved: true });
    assert.equal(current.metaLeft.by, 'saved updater');
    assert.equal(current.metaRight.by, 'current updater');
    assert.equal(metadata({ ctrl: { currentIsUnsaved: true } }).metaRight.by, 'N/A');
});

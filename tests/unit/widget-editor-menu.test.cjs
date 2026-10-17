const { readUiPageSource } = require('../helpers/fluent-source.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');

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

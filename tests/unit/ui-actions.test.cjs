const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const compareSource = fs.readFileSync(
    'src/fluent/generated/server-development/ui-action/sys_ui_action_987709096eb2ae2febce3b58151f28f7.now.ts',
    'utf8'
);
const updateWidgetSource = fs.readFileSync(
    'src/fluent/generated/server-development/ui-action/sys_ui_action_f4580c008d02765608b16502eaf4c340.now.ts',
    'utf8'
);
const copyRecordUrlSource = fs.readFileSync(
    'src/fluent/generated/server-development/ui-action/sys_ui_action_341d7f2780c78746be6dea94fccf416a.now.ts',
    'utf8'
);
const ajaxSource = fs.readFileSync(
    'src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_ajax.server.js',
    'utf8'
);

test('sys_update_xml Compare+ opens the update version on the right', () => {
    assert.match(compareSource, /table: 'sys_update_xml'/);
    assert.match(compareSource, /showContextMenu: true/);
    assert.match(compareSource, /order: 110/);
    assert.match(compareSource, /new GlideAjax\('WidgetEditorAjax'\)/);
    assert.match(compareSource, /getCustomerUpdateComparison/);
    assert.match(compareSource, /&version_1=.*result\.version_1/);
    assert.match(compareSource, /&version_2=.*result\.version_2/);
    assert.doesNotMatch(compareSource, /new GlideRecord/);
});

test('sys_update_xml Compare+ skips same-set edits and handles a missing prior version', () => {
    assert.match(compareSource, /condition: "current\.table != 'sys_upgrade_history_log'"/);
    assert.match(ajaxSource, /getCustomerUpdateComparison: function \(\)/);
    assert.match(ajaxSource, /bySource\.addQuery\('source', updateSet\)/);
    assert.match(ajaxSource, /byPayload\.getValue\('payload'\) === payload/);
    assert.match(ajaxSource, /firstInSet\.addQuery\('source', source\)/);
    assert.match(ajaxSource, /firstInSet\.orderBy\('sys_recorded_at'\)/);
    assert.match(ajaxSource, /previous\.addQuery\('sys_recorded_at', '<', firstInSetAt\)/);
    assert.match(
        ajaxSource,
        /reason: 'no_previous_update_set',[\s\S]*?error: 'No previous update set found\.'/
    );
    assert.match(compareSource, /new GlideUINotification\(\{/);
    assert.match(
        compareSource,
        /NOW\.CustomEvent\.fireTop\('glide:ui_notification\.info', notification\)/
    );
    assert.match(compareSource, /text: getMessage\('No previous update set found\.'\)/);
    assert.doesNotMatch(compareSource, /g_form\.addInfoMessage/);
    assert.doesNotMatch(compareSource, /g_notification\.show/);
});

test('widget customer updates open in Widget Editor+ above Show Related Record', () => {
    assert.match(updateWidgetSource, /table: 'sys_update_xml'/);
    assert.match(updateWidgetSource, /sp_widget_/);
    assert.match(updateWidgetSource, /sp_header_footer_/);
    assert.match(updateWidgetSource, /showLink: true/);
    assert.match(updateWidgetSource, /order: 990/);
    assert.match(updateWidgetSource, /new GlideAjax\('WidgetEditorAjax'\)/);
    assert.match(updateWidgetSource, /getCustomerUpdateWidgetTarget/);
    assert.match(ajaxSource, /getCustomerUpdateWidgetTarget: function \(\)/);
});

test('Open in Widget Editor+ is form-only, since the condition cannot hide it from list context menus', () => {
    assert.doesNotMatch(updateWidgetSource, /showContextMenu/);
    assert.doesNotMatch(updateWidgetSource, /list:\s*{/);
});

test('customer updates copy their target record URL below Copy URL to clipboard', () => {
    assert.match(copyRecordUrlSource, /table: 'sys_update_xml'/);
    assert.match(copyRecordUrlSource, /name: 'Copy record URL'/);
    assert.match(copyRecordUrlSource, /showContextMenu: true/);
    assert.match(copyRecordUrlSource, /order: 90/);
    assert.match(copyRecordUrlSource, /getCustomerUpdateTarget/);
    assert.match(copyRecordUrlSource, /window\.location\.origin \+ '\/nav_to\.do\?uri='/);
    assert.match(copyRecordUrlSource, /result\.table \+ '\.do\?sys_id=' \+ result\.record_id/);
    assert.match(copyRecordUrlSource, /encodeURIComponent\(recordUri\)/);
    const modernCopy = copyRecordUrlSource.indexOf('navigator.clipboard.writeText(value)');
    const legacyCopy = copyRecordUrlSource.indexOf("document.execCommand('copy')");
    assert.ok(modernCopy >= 0, 'should use the modern Clipboard API');
    assert.ok(legacyCopy > modernCopy, 'legacy copy should only be a fallback');
    assert.doesNotMatch(copyRecordUrlSource, /copyToClipboard\(value\)/);
    assert.match(ajaxSource, /getCustomerUpdateTarget: function \(\)/);
});

test('customer update UI action scripts stay out of the isolated sandbox', () => {
    // Isolated scripts run without window, document, navigator, and gel,
    // which all three of these scripts rely on (clipboard, window.location,
    // NOW.CustomEvent, gel('sys_uniqueValue')).
    assert.match(compareSource, /isolateScript: false/);
    assert.match(updateWidgetSource, /isolateScript: false/);
    assert.match(copyRecordUrlSource, /isolateScript: false/);
});

test('copying the record URL notifies once the clipboard write succeeds', () => {
    assert.match(copyRecordUrlSource, /'Record URL copied to clipboard\.'/);
    assert.match(copyRecordUrlSource, /new GlideUINotification\(\{/);
    assert.match(
        copyRecordUrlSource,
        /NOW\.CustomEvent\.fireTop\('glide:ui_notification\.info', notification\)/
    );
    assert.match(
        copyRecordUrlSource,
        /navigator\.clipboard\.writeText\(value\)\.then\(function\(\) \{\s*_weNotifyRecordUrlCopied\(\);/
    );
    assert.match(
        copyRecordUrlSource,
        /if \(copied\) \{\s*_weNotifyRecordUrlCopied\(\);\s*\} else \{\s*window\.prompt/
    );
});

test('copy record URL permits readable forced updates without requiring sys_metadata membership', () => {
    assert.match(copyRecordUrlSource, /condition: 'current\.canRead\(\)'/);
    assert.match(copyRecordUrlSource, /roles: \['sp_admin'\]/);
    assert.doesNotMatch(copyRecordUrlSource, /new GlideRecord\("sys_metadata"\)/);
});

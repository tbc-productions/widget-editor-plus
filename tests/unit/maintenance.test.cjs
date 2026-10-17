const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { harness, id, appId, apiId } = require('../helpers/maintenance-harness.cjs');
const uninstall = (h, plan, extra = {}) => h.call('uninstallSuite', { token: plan.token, confirmation: 'UNINSTALL', selected_records: JSON.stringify(plan.records.concat(plan.deletePreferences ? plan.preferences : []).map(row => row.sys_id)), ...extra });

test('manifest covers tracked and retired IDs without importing referenced shared roles', () => {
    const manifest = JSON.parse(fs.readFileSync('src/fluent/generated/server-development/script-include/widget_editor_uninstall_manifest.json', 'utf8'));
    const keys = fs.readFileSync('src/fluent/generated/keys.ts', 'utf8');
    for (const match of keys.matchAll(/table:\s*'([a-z_][a-z0-9_]*)'\s+id:\s*'([0-9a-f]{32})'/g)) assert.ok(manifest[match[1]].includes(match[2]));
    assert.ok(manifest.sys_properties_category_m2m.length > 0);
    assert.deepEqual(manifest.sys_app, [appId]);
    assert.equal(manifest.sys_user_role, undefined);
    assert.equal(Object.values(manifest).flat().includes('cd640d10d7101200a9addd173e24d4cd'), false);
});

for (const method of ['getMaintenanceAccess', 'previewSuiteMaintenance', 'exportSuiteMaintenance', 'uninstallSuite', 'previewSuitePreferenceImport', 'importSuitePreferences']) {
    test(method + ' requires admin on the server', () => {
        const h = harness({ admin: false });
        assert.match(h.call(method).error, /Admin role/);
        assert.deepEqual(h.operations, []);
    });
}

test('preview includes local suite settings and all users and defaults, keeping unrelated records out', () => {
    const h = harness(), plan = h.preview();
    assert.equal(plan.success, true);
    assert.equal(plan.preferences.length, 3);
    assert.ok(plan.records.some(row => row.sys_id === id(6)));
    assert.ok(plan.records.some(row => row.sys_id === id(8)));
    assert.equal(plan.records.some(row => [id(2), id(7), id(9)].includes(row.sys_id)), false);
    assert.equal(plan.preferences.some(row => row.sys_id === id(14)), false);
    assert.equal(plan.preferences.find(row => row.sys_id === id(13)).user, 'Shared default');
    assert.deepEqual(h.operations, []);
});

test('property-category discovery uses the actual reference field and stops on an invalid field', () => {
    const h = harness();
    for (let n = 200; n < 400; n++) h.database.sys_properties_category_m2m.push({sys_id: id(n), property: id(7)});
    const preview = h.preview();
    assert.deepEqual(preview.records.filter(row => row.table === 'sys_properties_category_m2m').map(row => row.sys_id), [id(8)]);
    h.faults.invalidField = 'property';
    assert.match(h.preview().error, /Cannot inspect property-category links/);
    assert.deepEqual(h.operations, []);
});

test('application-owned records outside the manifest are reviewed, backed up and removed with the app', () => {
    const h = harness();
    for (let n = 200; n < 225; n++) h.database.sys_metadata.push({sys_id: id(n), name: 'Nesting test ' + n, sys_class_name: 'sp_page', sys_scope: appId});
    const preview = h.preview({backup_required: 'false'});
    assert.deepEqual(preview.blockers, []);
    assert.equal(preview.records.filter(row=>row.table==='sp_page').length, 25);
    assert.equal(preview.records.find(row=>row.sys_id===id(200)).label, 'Nesting test 200');
    assert.ok(h.export(preview).includes('<sp_page action="INSERT_OR_UPDATE">'));
    assert.equal(uninstall(h, preview).success, true);
    assert.equal(h.database.sys_metadata.length, 0);
});

test('application ownership includes package records, excludes unrelated records and deduplicates source records', () => {
    const h=harness();
    h.database.sys_metadata.push(
        {sys_id:id(1),sys_class_name:'sys_ui_page',sys_scope:appId},
        {sys_id:id(200),sys_class_name:'sys_security_acl_role',sys_package:appId,sys_security_acl:id(3)},
        {sys_id:id(201),sys_class_name:'sp_widget',sys_scope:id(999)}
    );
    const plan=h.preview({backup_required:'false'});
    assert.equal(plan.records.filter(row=>row.sys_id===id(1)).length,1);
    assert.equal(plan.records.some(row=>row.sys_id===id(200)),true);
    assert.ok(plan.records.find(row=>row.sys_id===id(200)).references.includes(id(3)));
    assert.equal(plan.records.some(row=>row.sys_id===id(201)),false);
    h.faults.invalidField='sys_scope';
    assert.match(h.preview().error,/Cannot inspect application ownership/);
});

test('backup round-trips scripts, Unicode, null and every reviewed preference into importable XML', () => {
    const h = harness(), plan = h.preview(), xml = h.export(plan);
    assert.equal(XMLValidator.validate(xml), true);
    const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false, htmlEntities: true }).parse(xml).unload;
    assert.equal(parsed.sys_script_include.script, h.database.sys_script_include[0].script);
    assert.equal(parsed.sys_script_include.empty['@_nil'], 'true');
    assert.equal(parsed.sys_user_preference.length, 3);
    assert.equal(parsed.sys_user_preference[0].value, h.database.sys_user_preference[0].value);
    assert.ok(Object.entries(parsed).filter(([name]) => name !== '#text').flatMap(([, rows]) => rows).every(row => row['@_action'] === 'INSERT_OR_UPDATE'));
});

test('standalone preference export does not need to read or delete application records', () => {
    const h = harness();
    h.database.sys_script_include[0].unreadable = true;
    const plan = h.preview({ preferences_only: 'true' });
    assert.equal(plan.success, true);
    assert.equal(plan.records.length, 0);
    const xml = h.export(plan, 'preferences');
    assert.equal(xml.includes('<sys_ui_page'), false);
    assert.equal(new XMLParser().parse(xml).unload.sys_user_preference.length, 3);
    assert.equal(uninstall(h, plan).success, false);
});

test('backup gates, exact confirmation and session tokens cannot be bypassed in request parameters', () => {
    const h = harness(), plan = h.preview();
    assert.match(uninstall(h, plan, { backup_required: 'false' }).error, /complete backup/);
    assert.match(h.call('exportSuiteMaintenance', { token: plan.token, mode: 'backup', offset: '1' }).error, /Restart/);
    h.export(plan);
    assert.match(uninstall(h, plan, { confirmation: 'yes' }).error, /type UNINSTALL/);
    assert.match(uninstall(h, plan, { token: id(999) }).error, /expired/);
    assert.deepEqual(h.operations, []);
    h.expire();
    assert.match(uninstall(h, plan).error, /expired/);
});

test('partial or unreadable exports cannot enable uninstall', () => {
    const h = harness();
    for (let i = 20; i < 45; i++) h.database.sys_user_preference.push({ ...h.database.sys_user_preference[0], sys_id: id(i) });
    const plan = h.preview();
    const batch = h.call('exportSuiteMaintenance', { token: plan.token, mode: 'backup', offset: '0' });
    assert.equal(batch.done, false);
    assert.match(uninstall(h, plan).error, /complete backup/);
    h.faults.unreadableField = 'script';
    assert.throws(() => h.export(plan), /Cannot back up field/);
    assert.match(uninstall(h, plan).error, /complete backup/);
    assert.deepEqual(h.operations, []);
});

for (const change of ['edit', 'add', 'remove', 'permission', 'preference']) {
    test('changed preview aborts before any deletion: ' + change, () => {
        const h = harness(), plan = h.preview();
        h.export(plan);
        if (change === 'edit') h.database.sys_ui_page[0].sys_mod_count = '1';
        if (change === 'add') h.database.sys_properties.push({ sys_id: id(99), name: 'monaco.plus.new' });
        if (change === 'remove') h.database.sys_ui_page.shift();
        if (change === 'permission') h.database.sys_security_acl[0].undeletable = true;
        if (change === 'preference') h.database.sys_user_preference[0].sys_mod_count = '1';
        const result = uninstall(h, plan);
        assert.equal(result.success, false);
        assert.deepEqual(h.operations, []);
    });
}

for (const deletePreferences of [false, true]) {
    test('uninstall only removes the reviewed suite, preferences=' + deletePreferences, () => {
        const h = harness(), plan = h.preview({ delete_preferences: String(deletePreferences) });
        h.export(plan);
        assert.equal(uninstall(h, plan).success, true);
        assert.equal(h.database.sys_user_preference.length, deletePreferences ? 1 : 4);
        assert.equal(h.database.sys_user_preference.some(row => row.name === 'unrelated.preference'), true);
        assert.equal(h.database.sys_ui_page[0].name, 'Unrelated page');
        const removed = h.operations.map(op => op[2]);
        assert.ok(removed.indexOf(id(4)) < removed.indexOf(id(3)));
        assert.ok(removed.indexOf(id(3)) < removed.indexOf(apiId));
        assert.equal(removed.at(-1), appId);
        assert.equal(uninstall(h, plan).success, false, 'consumed previews cannot be replayed');
    });
}

test('backup can be explicitly skipped, while preference deletion stays fixed to the reviewed choice', () => {
    const h = harness(), plan = h.preview({ backup_required: 'false' });
    assert.equal(uninstall(h, plan, { delete_preferences: 'true' }).success, true);
    assert.equal(h.database.sys_user_preference.length, 4);
});

test('selection deletes only checked records and keeps required parents', () => {
    const h = harness(), plan = h.preview({backup_required:'false'});
    const selected = plan.records.filter(row => ![id(4), id(3), appId].includes(row.sys_id)).map(row => row.sys_id);
    const result = uninstall(h, plan, {selected_records: JSON.stringify(selected)});
    assert.equal(result.success, true);
    assert.equal(result.kept, 3);
    assert.equal(h.database.sys_security_acl.length, 1);
    assert.equal(h.database.sys_security_acl_role.length, 1);
    assert.equal(h.database.sys_app.length, 1);
    assert.deepEqual(h.operations.map(op => op[2]).sort(), selected.sort());
});

test('server rejects empty, unknown, duplicate and unsafe parent selections before deletion', () => {
    for (const selection of [[], [id(999)], [id(1),id(1)], [id(3)], [appId]]) {
        const h = harness(), plan = h.preview({backup_required:'false'});
        assert.equal(uninstall(h, plan, {selected_records:JSON.stringify(selection)}).success, false);
        assert.deepEqual(h.operations, []);
    }
});

test('uninstall requires active security_admin elevation, including when elevation expires after review', () => {
    const h = harness({securityAdmin:false});
    assert.deepEqual(h.call('getMaintenanceAccess'), {success:true,securityAdmin:false});
    assert.match(h.preview().error, /Elevated security_admin is required/);
    assert.deepEqual(h.sessions, {});
    const plan = h.preview({preferences_only:'true'});
    assert.equal(plan.success, true);
    assert.equal(plan.securityAdmin, false);
    assert.ok(h.export(plan, 'preferences').includes('sys_user_preference'));
    assert.match(uninstall(h, plan).error, /Elevate to security_admin/);
    assert.deepEqual(h.operations, []);
    const elevated = harness(), reviewed = elevated.preview({backup_required:'false'});
    elevated.faults.elevated = false;
    assert.match(elevated.preview().error, /Elevated security_admin is required/);
    assert.match(uninstall(elevated, reviewed).error, /Elevate to security_admin/);
    assert.deepEqual(elevated.operations, []);
});

test('failure stops deletion, reports progress, and leaves the API available for reviewing a retry', () => {
    const h = harness(), plan = h.preview({ backup_required: 'false' });
    h.faults.deleteId = id(6);
    const result = uninstall(h, plan);
    assert.equal(result.success, false);
    assert.ok(result.deleted > 0);
    assert.match(result.error, /already deleted/);
    assert.equal(h.database.sys_script_include.length, 1);
    assert.equal(h.database.sys_app.length, 1);
});

test('attachments block potentially unlisted cascade deletion', () => {
        const h = harness();
        h.database.sys_attachment.push({ sys_id: id(91), table_sys_id: id(1) });
        const plan = h.preview({ backup_required: 'false' });
        assert.equal(plan.blockers.length, 1);
        assert.equal(uninstall(h, plan).success, false);
        assert.deepEqual(h.operations, []);
});

function preferenceXml(name = 'monaco_plus.user_prefs', user = id(101), value = 'restored &amp; 🦘') {
    return `<unload><sys_user_preference action="INSERT_OR_UPDATE"><sys_id>${id(900)}</sys_id><name>${name}</name><user>${user}</user><value>${value}</value><type>string</type><system>false</system></sys_user_preference></unload>`;
}
const importPreview = (h, xml) => h.call('previewSuitePreferenceImport', { xml });
const restore = (h, plan, offset = '0') => h.call('importSuitePreferences', { token: plan.token, confirmation: 'RESTORE', offset });

test('preference export restores by user and name across changed preference IDs without duplicates', () => {
    const source = harness(), xml = source.export(source.preview({ preferences_only: 'true' }), 'preferences');
    const target = harness();
    target.database.sys_user_preference[0].sys_id = id(901);
    target.database.sys_user_preference[0].value = 'overwritten by clone';
    target.database.sys_user_preference.splice(1, 1);
    const plan = importPreview(target, xml);
    assert.equal(plan.success, true);
    assert.equal(plan.updated, 2);
    assert.equal(plan.created, 1);
    assert.deepEqual(target.operations, []);
    assert.equal(restore(target, plan).done, true);
    assert.equal(target.database.sys_user_preference.length, 4);
    assert.equal(target.database.sys_user_preference.find(row => row.sys_id === id(901)).value, source.database.sys_user_preference[0].value);
    assert.equal(target.database.sys_user_preference.find(row => !row.user).system, 'true');
    const again = importPreview(target, xml);
    assert.equal(again.created, 0);
    assert.equal(restore(target, again).success, true);
    assert.equal(target.database.sys_user_preference.length, 4);
});

test('preference import rejects mixed backups, unrelated preferences, missing users, duplicates and unsafe XML before writing', () => {
    for (const xml of [
        '<unload><sys_user/></unload>', preferenceXml('unrelated.preference'), preferenceXml(undefined, id(404)),
        preferenceXml().replace('</unload>', preferenceXml().replace(/<\/?unload>/g, '') + '</unload>'),
        preferenceXml().replace('<unload>', '<!DOCTYPE unload><unload>'), '<unload>',
        preferenceXml().replace('<type>string</type>', '<name>we_debug_menu_prefs</name>'),
    ]) {
        const h = harness(), plan = importPreview(h, xml);
        assert.equal(plan.success, false, xml);
        assert.deepEqual(h.operations, []);
    }
    const h = harness();
    h.database.sys_user_preference.push({ ...h.database.sys_user_preference[0], sys_id: id(902) });
    assert.match(importPreview(h, preferenceXml()).error, /Duplicate existing/);
    assert.deepEqual(h.operations, []);
});

test('import enforces confirmation, expiry, matching revisions, write permissions and persistence failures', () => {
    for (const fault of ['confirmation', 'expiry', 'changed', 'denied', 'failed']) {
        const h = harness(), plan = importPreview(h, preferenceXml());
        assert.equal(plan.success, true);
        if (fault === 'confirmation') assert.equal(h.call('importSuitePreferences', { token: plan.token, offset: '0' }).success, false);
        else {
            if (fault === 'expiry') h.expire();
            if (fault === 'changed') h.database.sys_user_preference[0].sys_mod_count = '1';
            if (fault === 'denied') h.faults.unwritableField = 'value';
            if (fault === 'failed') h.faults.update = true;
            assert.equal(restore(h, plan).success, false, fault);
        }
        assert.deepEqual(h.operations, []);
    }
});

test('imports are batched and sequential; replay cannot create new duplicate preferences', () => {
    const h = harness();
    let xml = '<unload>';
    for (let n = 200; n < 225; n++) {
        h.database.sys_user.push({ sys_id: id(n), name: 'User ' + n });
        xml += preferenceXml(undefined, id(n)).replace(/<\/?unload>/g, '');
    }
    const plan = importPreview(h, xml + '</unload>');
    assert.equal(plan.created, 25);
    const first = restore(h, plan);
    assert.equal(first.next, 20);
    assert.equal(first.done, false);
    assert.equal(restore(h, plan).success, false);
    assert.equal(restore(h, plan, '20').done, true);
    assert.equal(h.operations.filter(op => op[0] === 'insert').length, 25);
});

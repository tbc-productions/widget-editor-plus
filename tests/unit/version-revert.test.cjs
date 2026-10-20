const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const base = 'src/fluent/generated/other/sys-ui-page/';
const client = fs.readFileSync(base + 'widget_editor_plus.client.js', 'utf8');
const html = fs.readFileSync(base + 'widget_editor_plus.html', 'utf8');
const revert = client.slice(client.indexOf('$scope.revertVersion ='), client.indexOf('$scope.openVersionDiff ='));

test('version Revert opens the existing platform confirmation only for writable older versions', () => {
    const latest = { sys_id: 'latest', state: 'current' }, older = { sys_id: 'older' };
    const dialogs = [], signals = [];
    const scope = { widget: { sys_id: 'record' }, versions: [latest, older], canWriteWidget: true };
    const ctx = { $scope: scope, localStorage: { setItem: (...args) => signals.push(args) },
        GlideModal: function (...args) {
            const dialog = { args, preferences: {}, setTitle(value) { this.title = value; },
                setPreference(key, value) { this.preferences[key] = value; }, render() { this.rendered = true; } };
            dialogs.push(dialog); return dialog;
        } };
    vm.runInNewContext(revert, ctx);
    let stopped = 0;
    for (const [overrides, version] of [
        [{}, latest], [{}, { sys_id: 'another-current', state: 'current' }],
        [{ canWriteWidget: false }, older], [{ widgetSysPolicy: 'protected' }, older],
        [{ isNewWidget: true }, older], [{ widget: null }, older], [{}, null], [{}, {}],
    ]) {
        Object.assign(scope, { canWriteWidget: true, widgetSysPolicy: '', isNewWidget: false, widget: { sys_id: 'record' } }, overrides);
        scope.revertVersion(version, { stopPropagation() { stopped++; } });
    }
    assert.equal(stopped, 8); assert.equal(dialogs.length, 0); assert.equal(signals.length, 0);
    Object.assign(scope, { widget: { sys_id: 'record' }, openDropdown: 'versions', openCompactSubmenu: 'versions' });
    scope.revertVersion(older, { stopPropagation() { stopped++; } });
    assert.deepEqual(dialogs[0].args, ['revert_update_version_confirm', true, 300]);
    assert.deepEqual(dialogs[0].preferences, { sysparm_sys_id: 'older', focusTrap: true });
    assert.equal(dialogs[0].rendered, true); assert.equal(dialogs[0].title, 'Revert');
    assert.equal(scope.openDropdown, null); assert.equal(scope.openCompactSubmenu, null);
    assert.equal(signals[0][0], '_weRevertPending_record');
});

test('wide and compact version menus show the Revert hover icon before the new-tab link, excluding latest and read-only records', async () => {
    const { chromium } = require('@playwright/test');
    const rows = [...html.matchAll(/<div class="we-dropdown-item" ng-repeat="v in versions"[\s\S]*?<\/div>/g)].map(match => match[0]);
    assert.equal(rows.length, 2);
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setContent(`<style>button{border:2px outset;min-height:45px;min-width:45px;padding:8px;box-shadow:0 1px 3px black}button:not(.btn):hover{box-shadow:0 1px 3px rgba(0,0,0,.2)}span[class*=" icon-"]::before{content:'↶';font-size:16px}:root{--now-color_text--primary:30,45,50}${css}</style><div id="fixture"><div id="wide">${rows[0]}</div><div id="compact">${rows[1]}</div></div>`);
        await page.addScriptTag({ content: fs.readFileSync(require.resolve('angular/angular.min.js'), 'utf8') });
        await page.evaluate(() => {
            angular.module('versionTest', []).run(function ($rootScope) {
                Object.assign($rootScope, { versions: [{ sys_id: 'latest', state: 'current' }, { sys_id: 'older' }], canWriteWidget: true,
                    formatVersionDate: () => 'Date', openVersionDiff: () => { window.openedDiff = true; },
                    revertVersion: (version, event) => { event.stopPropagation(); window.reverted = version.sys_id; } });
            });
            angular.bootstrap(document.getElementById('fixture'), ['versionTest']);
        });
        for (const id of ['wide', 'compact']) {
            const rows = page.locator('#' + id + ' .we-dropdown-item');
            assert.equal(await rows.nth(0).locator('.we-version-revert').count(), 0);
            const button = rows.nth(1).getByRole('button', { name: 'Revert to this version' });
            assert.equal(await button.locator('.icon-undo-action').count(), 1);
            await page.mouse.move(1200, 700);
            assert.equal(await button.evaluate(el => getComputedStyle(el).opacity), '0');
            await rows.nth(1).hover();
            assert.equal(await button.evaluate(el => getComputedStyle(el).opacity), '1');
            const external = rows.nth(1).locator('a');
            const style = el => {
                const css = getComputedStyle(el);
                return Object.fromEntries(['width', 'height', 'border', 'borderRadius', 'padding', 'boxShadow', 'color', 'cursor'].map(key => [key, css[key]]));
            };
            assert.deepEqual(await button.evaluate(style), await external.evaluate(style), 'both actions share size, border and colour');
            assert.equal(await button.locator('.icon').evaluate(el => getComputedStyle(el).fontSize), '10px');
            assert.equal(await button.locator('.icon').evaluate(el => getComputedStyle(el, '::before').fontSize), '10px', 'the retina glyph overrides the platform 16px rule');
            assert.equal(await external.evaluate(el => getComputedStyle(el).maskSize), '12.5px 12.5px', 'the padded SVG renders its visible drawing at 10px');
            await button.hover(); const revertHover = await button.evaluate(style);
            await external.hover(); assert.deepEqual(await external.evaluate(style), revertHover, 'both icons use the same hover colour');
            assert.equal(revertHover.color, 'rgb(30, 45, 50)');
            const revertBox = await button.boundingBox(), externalBox = await external.boundingBox();
            assert.ok(externalBox.x - revertBox.x - revertBox.width >= 8, 'version actions have a visible gap');
            await button.focus(); await button.press('Enter');
            assert.equal(await page.evaluate(() => window.reverted), 'older');
            assert.equal(await page.evaluate(() => window.openedDiff), undefined);
        }
        await page.evaluate(() => {
            const scope = angular.element(document.getElementById('fixture')).scope();
            scope.$apply(() => { scope.canWriteWidget = false; });
        });
        assert.equal(await page.locator('.we-version-revert').count(), 0);
        await page.evaluate(() => {
            const scope = angular.element(document.getElementById('fixture')).scope();
            scope.$apply(() => { scope.canWriteWidget = true; scope.widgetSysPolicy = 'protected'; });
        });
        assert.equal(await page.locator('.we-version-revert').count(), 0);
    } finally { await browser.close(); }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const { readFluentField } = require('../helpers/fluent-source.cjs');

const path = 'src/fluent/generated/other/sys-ui-page/sys_ui_page_widget_editor_assistant.now.ts';
const html = readFluentField(path, 'html');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const tableStart = html.indexOf('<table class="we-main-table"');
const table = html.slice(tableStart, html.indexOf('</table>', tableStart) + 8);
const script = readFluentField(path, 'clientScript');
const helpers = script.slice(script.indexOf('ctrl.canIncludePreviousVersion ='), script.indexOf('ctrl.toggleRecordPreviousVersion ='));
const angular = fs.readFileSync(require.resolve('angular/angular.min.js'), 'utf8');

test('Assistant actions stay right aligned and unclipped, with missing history below the name', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [720, 1280, 1920]) {
            const page = await browser.newPage({ viewport: { width, height: 800 } });
            try {
                await page.setContent(`<style>${css}
                    .we-main-table tbody td { text-align: left !important; }
                    .btn { display:inline-block; width:44px; height:36px; border:1px solid; padding:6px; }
                    .we-table-card { margin:16px; }
                    .we-table-scroll-container { height:700px; }
                </style><div id="layout-test" ng-controller="LayoutTest as ctrl" class="we-table-card">
                    <div class="we-table-scroll-container">${table}</div></div>`);
                await page.addScriptTag({ content: angular });
                await page.evaluate(helpers => {
                    angular.module('layoutTest', []).controller('LayoutTest', function () {
                        const ctrl = this;
                        ctrl.primary = { sysId: 'primary' };
                        ctrl.previousVersionRecords = { 'sp_widget:empty': true, 'sp_widget:historical': true };
                        ctrl.visibleRows = [
                            { table: 'sp_widget', sys_id: 'primary', label: 'Actions Widget', primary: true, checked: true },
                            { table: 'sp_widget', sys_id: 'empty', label: 'Announcements', checked: true, previousVersionBytes: 0 },
                            { table: 'sp_widget', sys_id: 'historical', label: 'Earlier widget', checked: true, previousVersion: { updateSetName: 'Earlier set' } },
                            { table: 'sys_db_object', sys_id: 'structure', label: 'Table structure', checked: true },
                        ];
                        ctrl.updateSets = [{ sys_id: 'set', name: 'Update set' }];
                        ctrl.refreshingUpdateSets = {};
                        ctrl.isExportBlocked = () => false;
                        ctrl.tableIconClass = () => '';
                        ctrl.isAllSelected = ctrl.isUpdateSetChecked = () => true;
                        ctrl.updateSetRecordCount = () => 1;
                        const rowKey = row => row.table + ':' + row.sys_id;
                        eval(helpers);
                    });
                    angular.bootstrap(document.getElementById('layout-test'), ['layoutTest']);
                }, helpers);

                for (const buttonWidth of [44, 64]) {
                    await page.locator('.we-record-actions .btn').evaluateAll((buttons, width) => {
                        buttons.forEach(button => { button.style.width = width + 'px'; });
                    }, buttonWidth);
                    const rows = await page.locator('.we-cell-actions:has(.we-record-actions)').evaluateAll(cells => cells.map(cell => {
                        const bounds = cell.getBoundingClientRect();
                        const clip = cell.closest('.we-table-scroll-container').getBoundingClientRect();
                        const right = bounds.right - parseFloat(getComputedStyle(cell).paddingRight);
                        const buttons = [...cell.querySelectorAll('.btn')].map(button => {
                            const rect = button.getBoundingClientRect();
                            return { left: rect.left, right: rect.right, top: rect.top };
                        });
                        return {
                            contained: buttons.every(button => button.left >= bounds.left && button.right <= Math.min(bounds.right, clip.right)),
                            rightAligned: Math.abs(Math.max(...buttons.map(button => button.right)) - right) < 1,
                            count: buttons.length,
                        };
                    }));
                    assert.ok(rows.some(row => row.count === 4));
                    assert.ok(rows.some(row => row.count === 3));
                    assert.ok(rows.every(row => row.contained && row.rightAligned), JSON.stringify({ width, buttonWidth, rows }));
                }
                const missing = page.locator('[data-row-key="sp_widget:empty"]');
                const name = await missing.getByText('Announcements', { exact: true }).boundingBox();
                const message = await missing.getByText('No previous version', { exact: true }).boundingBox();
                assert.ok(message.y >= name.y + name.height, 'missing history sits beneath the record name');
                assert.ok(Math.abs(message.x - name.x) < 1, 'history follows the record name indentation');
                assert.equal(await page.locator('[data-row-key="sp_widget:historical"]').getByText('+ Previous', { exact: true }).count(), 1);
                assert.equal(await page.locator('th.we-cell-actions').evaluate(el => getComputedStyle(el).textAlign), 'right');
            } finally { await page.close(); }
        }
    } finally { await browser.close(); }
});

const { readUiPageSource } = require('../helpers/fluent-source.cjs');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const source = readUiPageSource('src/fluent/generated/other/sys-ui-page/sys_ui_page_widget_editor_code_search.now.ts');
const css = source.match(/<style>([\s\S]*?)<\/style>/)[1];
const scrollCode = source.slice(source.indexOf('var tableScrollRequest = 0;'), source.indexOf('vm.openConfig = function'));

test('table navigation scrolls only results across viewport and header sizes', async () => {
    const context = await browser.newContext();
    try {
        for (const size of [{ width: 1280, height: 800 }, { width: 800, height: 500 }]) {
            const page = await context.newPage();
            await page.setViewportSize(size);
            await page.setContent(`<style>${css}</style>
                <div class="cs-app"><header class="dc-header" style="height:123px"><input placeholder="Search" /></header>
                <div class="cs-body"><aside class="cs-sidebar">Tables</aside><main class="cs-main">
                <div class="cs-toolbar">Search summary</div><div class="cs-results" id="cs-results-container">
                ${Array.from({ length: 6 }, (_, i) => `<section class="cs-table-group" id="table-group-t${i}"><div class="cs-table-group-sticky" id="table-group-head-t${i}"><div class="cs-table-group-head">Table ${i}</div><div class="cs-field-toggle-row">Fields</div></div><div style="height:600px">Results</div></section>`).join('')}
                </div></main></div></div>`);
            await page.evaluate(code => {
                window.vm = { viewMode: 'group_table' };
                const $timeout = (fn, delay) => setTimeout(fn, delay || 0);
                // ServiceNow's Prototype library shadows the native method on elements.
                window.legacyScrollCalls = 0;
                document.querySelector('.cs-results').scrollTo = () => {
                    window.legacyScrollCalls++;
                    window.scrollTo(0, 100);
                };
                eval(code);
            }, scrollCode);
            const positions = () => page.evaluate(() => ({
                header: document.querySelector('.dc-header').getBoundingClientRect().top,
                toolbar: document.querySelector('.cs-toolbar').getBoundingClientRect().top,
                ancestors: ['.cs-app', '.cs-body', '.cs-main'].map(s => document.querySelector(s).scrollTop),
                legacyScrollCalls: window.legacyScrollCalls,
                page: window.scrollY
            }));
            const before = await positions();
            for (const table of ['t4', 't1', 't5', 't0']) {
                await page.evaluate(table => vm.scrollToTable(table), table);
                await page.waitForFunction(table => {
                    const container = document.getElementById('cs-results-container');
                    const rect = document.getElementById('table-group-head-' + table).getBoundingClientRect();
                    const bounds = container.getBoundingClientRect();
                    return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
                }, table);
                // Allow the smooth scroll to finish before comparing positions.
                await page.waitForTimeout(600);
                const headerGap = await page.evaluate(table => {
                    const container = document.getElementById('cs-results-container');
                    const header = document.getElementById('table-group-head-' + table);
                    return header.getBoundingClientRect().top -
                        (container.getBoundingClientRect().top + container.clientTop);
                }, table);
                assert.ok(Math.abs(headerGap) <= 1, `table ${table} header should be flush, got ${headerGap}px`);
                assert.deepEqual(await positions(), before);
            }
            // Field toggles force the current table back to its start, even while its sticky
            // header is already visible part-way through that table.
            await page.evaluate(() => {
                const container = document.getElementById('cs-results-container');
                const table = document.getElementById('table-group-t2');
                container.scrollTop = table.offsetTop + 250;
                vm.scrollToTable('t2', { forceTop: true, smooth: true });
            });
            await page.waitForFunction(() => {
                const container = document.getElementById('cs-results-container');
                const table = document.getElementById('table-group-t2');
                const visibleTop = container.getBoundingClientRect().top + container.clientTop;
                return Math.abs(table.getBoundingClientRect().top - visibleTop) <= 1;
            });
            assert.deepEqual(await positions(), before);
            // A sticky heading must not prevent returning to the table's first record.
            await page.locator('.cs-results').evaluate(el => { el.scrollTop = 350; });
            await page.evaluate(() => vm.scrollToTable('t0'));
            await page.waitForFunction(() => document.querySelector('.cs-results').scrollTop < 20);
            await page.waitForTimeout(600);
            const top = await page.locator('.cs-results').evaluate(el => el.scrollTop);
            await page.evaluate(() => vm.scrollToTable('t0'));
            await page.waitForTimeout(100);
            assert.equal(await page.locator('.cs-results').evaluate(el => el.scrollTop), top);
            // A delayed render for an earlier click must not override a later click.
            await page.evaluate(() => {
                vm.viewMode = 'date_desc';
                vm.scrollToTable('missing');
                vm.scrollToTable('t3');
                setTimeout(() => {
                    const el = document.createElement('a');
                    el.id = 'table-group-missing';
                    el.textContent = 'Late group';
                    document.querySelector('.cs-results').prepend(el);
                }, 60);
            });
            await page.waitForTimeout(1000);
            assert.equal(await page.evaluate(() => vm.viewMode), 'group_table');
            assert.ok(await page.locator('.cs-results').evaluate(el => el.scrollTop) > 1000);
            assert.deepEqual(await positions(), before);
            await page.locator('.cs-results').evaluate(el => { el.scrollTop = el.scrollHeight; });
            await page.locator('.cs-results').hover();
            await page.mouse.wheel(0, 1000);
            await page.waitForTimeout(100);
            assert.deepEqual(await positions(), before);
            await page.close();
        }
    } finally {
        await context.close();
    }
});

test('sticky table header paints over Monaco widgets from a scrolled result card', async () => {
    const context = await browser.newContext();
    try {
        const page = await context.newPage();
        await page.setViewportSize({ width: 900, height: 600 });
        await page.setContent(`<style>${css}</style>
            <div class="cs-results" style="width:800px;height:300px">
                <section class="cs-table-group">
                    <div class="cs-table-group-sticky" id="sticky-header" style="height:60px">Business Rule</div>
                    <div class="cs-card" style="height:500px;position:relative">
                        <div class="monaco-editor" style="height:500px;position:relative">
                            <div id="monaco-find-widget" style="position:absolute;z-index:1000;top:80px;height:50px;width:300px">Find</div>
                        </div>
                    </div>
                </section>
            </div>`);
        await page.locator('.cs-results').evaluate(el => { el.scrollTop = 140; });

        const layers = await page.evaluate(() => {
            const header = document.getElementById('sticky-header').getBoundingClientRect();
            const widget = document.getElementById('monaco-find-widget').getBoundingClientRect();
            const topmost = document.elementFromPoint(widget.left + 10, Math.max(header.top, widget.top) + 5);
            return {
                overlap: header.bottom > widget.top && widget.bottom > header.top,
                topmostInsideHeader: document.getElementById('sticky-header').contains(topmost)
            };
        });

        assert.equal(layers.overlap, true, 'The fixture should put Monaco\'s widget behind the sticky header');
        assert.equal(layers.topmostInsideHeader, true, 'The sticky header should be the topmost painted layer');
    } finally {
        await context.close();
    }
});

test('advanced conditions get their own row and results keep the remaining height', async () => {
    const context = await browser.newContext();
    const advancedForm = source.match(/<form class="cs-advanced"[\s\S]*?<\/form>/)[0];
    try {
        for (const height of [800, 500]) {
            const page = await context.newPage();
            await page.setViewportSize({ width: 1280, height });
            await page.setContent(`<style>${css}</style><div class="cs-app">
                <header class="dc-header" style="height:80px">Search</header>
                <div class="cs-body"><aside class="cs-sidebar">Tables</aside><main class="cs-main">
                <div class="cs-toolbar">Summary</div><div class="cs-results" id="cs-results-container">
                <div style="height:3000px">Results</div></div></main></div></div>`);
            const bodyHeight = await page.locator('.cs-body').evaluate(el => el.clientHeight);
            for (const rows of [1, 20]) {
                // Reproduce ng-if inserting the actual conditions form between header and body.
                await page.evaluate(({ advancedForm, rows }) => {
                    document.querySelector('.dc-header').insertAdjacentHTML('afterend', advancedForm);
                    const form = document.querySelector('.cs-advanced');
                    const row = form.firstElementChild;
                    for (let i = 1; i < rows; i++) form.append(row.cloneNode(true));
                }, { advancedForm, rows });
                const bounds = await page.evaluate(() => {
                    const header = document.querySelector('.dc-header').getBoundingClientRect();
                    const form = document.querySelector('.cs-advanced').getBoundingClientRect();
                    const body = document.querySelector('.cs-body').getBoundingClientRect();
                    const results = document.querySelector('.cs-results').getBoundingClientRect();
                    return { headerTop: header.top, headerBottom: header.bottom, formTop: form.top,
                        formBottom: form.bottom, formHeight: form.height, bodyTop: body.top,
                        bodyBottom: body.bottom, resultsHeight: results.height, viewport: innerHeight };
                });
                assert.equal(bounds.headerTop, 0);
                assert.ok(bounds.formHeight > 30);
                assert.ok(bounds.formHeight <= height * 0.35 + 1);
                assert.ok(bounds.formTop >= bounds.headerBottom);
                assert.ok(bounds.bodyTop >= bounds.formBottom);
                assert.ok(bounds.bodyBottom <= bounds.viewport);
                assert.ok(bounds.resultsHeight > 100);
                await page.locator('.cs-results').evaluate(el => { el.scrollTop = 1000; });
                assert.equal(await page.locator('.cs-results').evaluate(el => el.scrollTop), 1000);
                assert.equal(await page.locator('.dc-header').evaluate(el => el.getBoundingClientRect().top), 0);
                if (rows === 20) {
                    await page.locator('.cs-advanced').evaluate(el => { el.scrollTop = el.scrollHeight; });
                    assert.ok(await page.locator('.cs-advanced').evaluate(el => el.scrollTop) > 0);
                }
                // Removing the last condition restores all available height to results.
                await page.locator('.cs-advanced').evaluate(el => el.remove());
                assert.equal(await page.locator('.cs-body').evaluate(el => el.clientHeight), bodyHeight);
            }
            await page.close();
        }
    } finally {
        await context.close();
    }
});

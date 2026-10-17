const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, expect } = require('@playwright/test');
const { readFluentField } = require('../helpers/fluent-source.cjs');

const directory = 'src/fluent/generated/other/sys-ui-page/';
const drawer = fs.readFileSync(directory + 'widget_editor_app_drawer.js', 'utf8');
const pages = [
    ['8b2e70458373fe1070b8b5dfeeaad35e', 'widget-editor', 'Widget Editor+', 'icon-code'],
    ['51ec3d258363b61070b8b5dfeeaad36b', 'compare', 'Compare+', 'icon-split-vertical'],
    ['widget_editor_assistant', 'assistant', 'AI Assistant', 'icon-ai-sparkle-fill'],
    ['widget_editor_code_search', 'code-search', 'Code Search+', 'icon-search'],
    ['widget_editor_credit', 'credit', 'Credit+', 'icon-history'],
    ['widget_editor_plus_properties', 'properties', 'Widget Editor+ Properties', 'icon-cog'],
];
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { if (browser) await browser.close(); });

async function mount({ current = 'widget-editor', admin = true, width = 1024, touch = false, host, rootSize = 16, search = '', capabilities, delay = 0 } = {}) {
    const page = await browser.newPage({ viewport: { width, height: 768 }, hasTouch: touch });
    await page.context().route('http://widget-editor.test/**', route => route.fulfill({
        contentType: 'text/html',
        body: `<style>html {font-size:${rootSize}px} body {margin:0;font-family:Arial}
            article,aside,details,figcaption,figure,footer,header,hgroup,main,nav,section,summary {display:block}
            header {display:flex;align-items:center;gap:10px;padding:12px 20px;background:#ddede9}
            .clipped {overflow:hidden;height:70px} #outside {margin-top:450px}</style>
            <div class="clipped"><header>${host || `<we-app-drawer current-app="${current}" credit-available="${admin}"></we-app-drawer>`}<span>App title</span></header></div>
            <button id="outside">Outside</button>`,
    }));
    await page.addInitScript(({ capabilities, delay }) => {
        window.ajaxCalls = [];
        window.GlideAjax = function (name) {
            const params = {};
            this.addParam = (key, value) => { params[key] = value; };
            this.getXMLAnswer = callback => {
                window.ajaxCalls.push({ name, params });
                window.setTimeout(() => callback(JSON.stringify({ success: true, apps: capabilities })), delay);
            };
        };
    }, { capabilities, delay });
    await page.goto('http://widget-editor.test/' + search);
    await page.addScriptTag({ content: drawer });
    return page;
}

test('ServiceNow normalisation cannot expose the closed drawer or cover the app header', async () => {
    const page = await mount();
    try {
        const trigger = page.getByRole('button', { name: 'Apps', exact: true });
        const nav = page.locator('nav');
        assert.equal(await nav.isVisible(), false, 'closed drawer must override ServiceNow nav { display: block }');
        assert.equal(await trigger.evaluate(button => {
            const rect = button.getBoundingClientRect();
            return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        }), true, 'hidden drawer must not intercept clicks on the launcher');
        await trigger.click();
        await expect(nav).toBeVisible();
        assert.equal(await nav.evaluate(el => el.matches(':popover-open')), true);
        const buttonBounds = await trigger.boundingBox();
        assert.ok((await nav.boundingBox()).y >= buttonBounds.y + buttonBounds.height);
        await page.keyboard.press('Escape');
        await expect(nav).toBeHidden();
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    } finally { await page.close(); }
});

test('launcher contrast stays visible on all six real header styles in light and dark themes', async () => {
    const themes = [
        { name: 'light page with dark brand header', header: '3,45,66', title: '255,255,255', page: '255,255,255', text: '23,43,49' },
        { name: 'light page with light brand header', header: '221,237,233', title: '38,50,56', page: '255,255,255', text: '38,50,56' },
        { name: 'dark page with dark brand header', header: '3,45,66', title: '255,255,255', page: '32,37,39', text: '227,233,231' },
    ];
    function luminance(colour) {
        const channels = colour.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
            value /= 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    for (const [record, current, name] of pages) {
        const html = readFluentField(directory + 'sys_ui_page_' + record + '.now.ts', 'html');
        const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
        for (const theme of themes) {
            const page = await mount({ current });
            try {
                await page.addStyleTag({ content: css + `
                    :root { --now-color_chrome--brand-5:${theme.header}; --now-color--neutral-0:${theme.title};
                        --now-color_background--primary:${theme.page}; --now-color_text--primary:${theme.text}; }
                ` });
                await page.evaluate(current => {
                    document.querySelector('header').className = current === 'widget-editor' ? 'we-alert-pills-row' : 'dc-header';
                }, current);
                const trigger = page.getByRole('button', { name: 'Apps', exact: true });
                for (const state of ['normal', 'hover', 'keyboard focus', 'open']) {
                    if (state === 'hover') await trigger.hover();
                    if (state === 'keyboard focus') { await page.mouse.move(700, 600); await trigger.focus(); }
                    if (state === 'open') await trigger.press('Enter');
                    const colours = await trigger.evaluate(button => {
                        const style = getComputedStyle(button);
                        return {
                            foreground: getComputedStyle(button.querySelector('i'), '::before').color,
                            background: style.backgroundColor === 'rgba(0, 0, 0, 0)'
                                ? getComputedStyle(button.closest('header')).backgroundColor : style.backgroundColor,
                        };
                    });
                    const a = luminance(colours.foreground), b = luminance(colours.background);
                    const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
                    assert.ok(contrast >= 3, `${name}, ${theme.name}, ${state}: icon contrast is ${contrast.toFixed(2)}:1`);
                }
            } finally { await page.close(); }
        }
    }
});

test('all six existing pages bundle the drawer and select their approved Retina icon', async () => {
    for (const [record, current, name, icon] of pages) {
        const file = directory + 'sys_ui_page_' + record + '.now.ts';
        const html = readFluentField(file, 'html');
        const client = readFluentField(file, 'clientScript');
        assert.ok(client.startsWith(drawer + '\n'));
        assert.match(html, /href="\/styles\/retina_icons\/retina_icons\.css"/);
        const hosts = html.match(/<we-app-drawer\b[^>]*><\/we-app-drawer>/g);
        assert.equal(hosts.length, 1);
        assert.ok(hosts[0].includes(`current-app="${current}"`));
        const host = hosts[0].replace(/\$\{gs\.hasRole\('admin'\)\}/g, 'true');
        const page = await mount({ host, rootSize: current === 'widget-editor' ? 16 : 14 });
        try {
            await page.getByRole('button', { name: 'Apps', exact: true }).click();
            const nav = page.getByRole('navigation', { name: 'Apps', exact: true });
            await expect(nav).toBeVisible();
            assert.equal((await nav.boundingBox()).width, 352);
            assert.equal(await nav.locator('.we-app-drawer-description').first().evaluate(el => getComputedStyle(el).fontSize), '11px');
            assert.equal(await nav.locator('.we-app-drawer-option').count(), 5);
            assert.deepEqual(await nav.locator('.we-app-drawer-option').evaluateAll(rows => rows.map(row => row.dataset.app)), ['widget-editor', 'compare', 'assistant', 'credit', 'code-search']);
            const selected = nav.locator('a[aria-current="page"]');
            assert.equal(await selected.count(), current === 'properties' ? 0 : 1);
            if (current !== 'properties') {
                assert.ok((await selected.getAttribute('aria-label')).startsWith(name + ', current app'));
                assert.equal(await selected.locator('i.' + icon).count(), 1);
            }
            assert.equal(await nav.locator('[data-app="properties"]').count(), 0);
            assert.equal(await nav.locator('.icon-open-document-new-tab').count(), 5);
            assert.equal(await page.locator('button .' + icon).count(), 1);
            for (const link of await nav.locator('a').all()) {
                const newTab = await link.evaluate(el => el.classList.contains('we-app-drawer-new-tab'));
                assert.equal(await link.getAttribute('target'), newTab ? '_blank' : null);
                assert.equal(await link.getAttribute('rel'), newTab ? 'noopener noreferrer' : null);
                assert.match(await link.getAttribute('href'), /^\/ui_page\.do\?sys_id=[a-f0-9]{32}$/);
            }
            assert.equal(await nav.getByText('Widget Editor+ suite', { exact: true }).count(), 0);
            assert.equal(await nav.getByText('Apps open in a new tab', { exact: true }).count(), 0);
        } finally { await page.close(); }
    }
});

test('Credit+ stays admin-only and links open a separate tab without changing the editor', async () => {
    const page = await mount({ admin: false });
    try {
        await page.getByRole('button', { name: 'Apps', exact: true }).click();
        assert.equal(await page.locator('.we-app-drawer-option').count(), 4);
        assert.equal(await page.getByText('Credit+', { exact: true }).count(), 0);
        await page.locator('[data-app="compare"] .we-app-drawer-link').hover();
        const popupPromise = page.waitForEvent('popup');
        await page.getByRole('link', { name: 'Open Compare+ in a new tab', exact: true }).click();
        const popup = await popupPromise;
        await popup.waitForLoadState();
        assert.equal(popup.url(), 'http://widget-editor.test/ui_page.do?sys_id=51ec3d258363b61070b8b5dfeeaad36b');
        assert.equal(page.url(), 'http://widget-editor.test/');
        assert.equal(await popup.evaluate(() => window.opener), null);
    } finally { await page.context().close(); }
});

test('keyboard and hover reveal the new-tab action; Escape and outside clicks dismiss the popover', async () => {
    const page = await mount();
    try {
        const trigger = page.getByRole('button', { name: 'Apps', exact: true });
        const nav = page.locator('nav');
        const firstLink = page.locator('.we-app-drawer-link').first();
        const action = page.locator('.we-app-drawer-new-tab').first();
        await trigger.focus();
        await page.keyboard.press('Enter');
        await expect(nav).toBeVisible();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await page.keyboard.press('Tab');
        await expect(firstLink).toBeFocused();
        await expect(action).toBeVisible();
        await page.keyboard.press('Tab');
        await expect(action).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(nav).toBeHidden();
        await expect(trigger).toBeFocused();
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await trigger.click();
        await page.mouse.move(700, 600);
        await expect(action).toBeHidden();
        await firstLink.hover();
        await expect(action).toBeVisible();
        await page.locator('#outside').click();
        await expect(nav).toBeHidden();
    } finally { await page.close(); }
});

test('the drawer clears clipped headers and fits narrow touch screens and resized windows', async () => {
    const page = await mount({ width: 320, touch: true });
    try {
        const trigger = page.getByRole('button', { name: 'Apps', exact: true });
        const nav = page.locator('nav');
        await trigger.click();
        const bounds = await nav.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320);
        assert.ok(bounds.y + bounds.height <= 768);
        const lastLink = page.locator('.we-app-drawer-link').last();
        const centre = await lastLink.evaluate(el => {
            const r = el.getBoundingClientRect();
            return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).closest('a') === el;
        });
        assert.equal(centre, true, 'popover must stay above the clipped shell');
        const action = page.locator('.we-app-drawer-new-tab').last();
        await expect(action).toBeVisible();
        const actionBounds = await action.boundingBox();
        assert.ok(actionBounds.width >= 44 && actionBounds.height >= 44);
        await page.setViewportSize({ width: 600, height: 500 });
        await expect.poll(async () => {
            const resized = await nav.boundingBox();
            return resized.x >= 0 && resized.x + resized.width <= 600 && resized.y + resized.height <= 500;
        }).toBe(true);
    } finally { await page.close(); }
});

test('AngularJS can remove and recreate a header without orphaned popovers or duplicate navigation', async () => {
    const page = await mount();
    try {
        await page.addScriptTag({ content: fs.readFileSync(require.resolve('angular/angular.min.js'), 'utf8') });
        await page.evaluate(() => {
            document.querySelector('header').setAttribute('ng-if', 'visible');
            angular.module('drawerTest', []).run(['$rootScope', scope => { scope.visible = true; }]);
            window.drawerInjector = angular.bootstrap(document.querySelector('.clipped'), ['drawerTest']);
        });
        const trigger = page.getByRole('button', { name: 'Apps', exact: true });
        await trigger.click();
        await expect(page.locator('nav')).toBeVisible();
        await page.evaluate(() => {
            const scope = window.drawerInjector.get('$rootScope');
            scope.$apply(() => { scope.visible = false; });
        });
        assert.equal(await page.locator(':popover-open').count(), 0);
        await page.evaluate(() => {
            const scope = window.drawerInjector.get('$rootScope');
            scope.$apply(() => { scope.visible = true; });
        });
        assert.equal(await trigger.count(), 1);
        await trigger.click();
        await expect(page.locator('nav')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('nav')).toBeHidden();
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    } finally { await page.close(); }
});

test('the editor module registers after Jelly processes the complete client script', async () => {
    const page = await mount();
    try {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        assert.doesNotMatch(drawer, /\$\{/, 'Jelly must not consume JavaScript template placeholders');
        await page.addScriptTag({ content: fs.readFileSync(require.resolve('angular/angular.min.js'), 'utf8') });
        const client = readFluentField(directory + 'sys_ui_page_8b2e70458373fe1070b8b5dfeeaad35e.now.ts', 'clientScript');
        await page.addScriptTag({ content: client.replace(/\$\{[^}]*\}/g, '') });
        assert.equal(await page.evaluate(() => angular.module('widgetEditor').name), 'widgetEditor');
        assert.deepEqual(errors, []);
        await page.getByRole('button', { name: 'Apps', exact: true }).click();
        await expect(page.locator('nav')).toBeVisible();
    } finally { await page.close(); }
});

const record = 'a'.repeat(32);
const support = { 'widget-editor': true, compare: true, credit: true, assistant: true };
const destinations = {
    'widget-editor': ['record_table', 'record_sys_id'],
    compare: ['table', 'record_id'],
    credit: ['sysparm_table', 'sysparm_record'],
    assistant: ['record_table', 'record_sys_id'],
};

test('record apps retain compatible context in both actions and primary clicks use the current tab', async () => {
    for (const [current, search] of [
        ['widget-editor', '?record_table=sys_script_include&record_sys_id=' + record],
        ['widget-editor', '?widget_id=' + record],
        ['assistant', '?record_table=sys_script_include&record_sys_id=' + record],
        ['compare', '?table=sys_script_include&record_id=' + record + '&version_1=old'],
        ['credit', '?sysparm_table=sys_script_include&sysparm_record=' + record + '&sysparm_update=old'],
    ]) {
        const page = await mount({ current, search, capabilities: support });
        try {
            await page.getByRole('button', { name: 'Apps', exact: true }).click();
            await expect(page.locator('nav')).toHaveAttribute('aria-busy', 'false');
            const table = search.includes('widget_id') ? 'sp_widget' : 'sys_script_include';
            for (const [app, [tableParam, recordParam]] of Object.entries(destinations)) {
                const row = page.locator('[data-app="' + app + '"]');
                const href = await row.locator('.we-app-drawer-link').getAttribute('href');
                assert.equal(await row.locator('.we-app-drawer-new-tab').getAttribute('href'), href);
                const url = new URL(href, page.url());
                assert.equal(url.searchParams.get(tableParam), table);
                assert.equal(url.searchParams.get(recordParam), record);
                assert.equal(url.searchParams.size, 3, 'historical versions must not carry across');
            }
            assert.deepEqual(await page.evaluate(() => window.ajaxCalls), [{
                name: 'WidgetEditorAjax', params: { sysparm_name: 'getAppDrawerContext', table, record_id: record },
            }]);
            const destination = current === 'compare' ? 'credit' : current === 'credit' ? 'widget-editor' : 'compare';
            const link = page.locator('[data-app="' + destination + '"] .we-app-drawer-link');
            const expected = new URL(await link.getAttribute('href'), page.url()).href;
            const source = page.url();
            await link.hover();
            const popupPromise = page.waitForEvent('popup');
            await page.locator('[data-app="' + destination + '"] .we-app-drawer-new-tab').click();
            const popup = await popupPromise;
            await popup.waitForLoadState();
            assert.equal(popup.url(), expected);
            assert.equal(page.url(), source);
            await popup.close();
            await link.click();
            await expect(page).toHaveURL(expected);
            assert.equal(page.context().pages().length, 1);
        } finally { await page.context().close(); }
    }
});

test('unsupported, missing and malformed record context opens apps fresh', async () => {
    for (const [search, capabilities, expectedCalls] of [
        ['?table=incident&record_id=' + record, { compare: true }, 1],
        ['?table=not_a_table&record_id=' + record, {}, 1],
        ['?table=incident&record_id=bad', support, 0],
        ['?table=incident%26injected&record_id=' + record, support, 0],
        ['', support, 0],
    ]) {
        const page = await mount({ current: 'compare', search, capabilities });
        try {
            await page.getByRole('button', { name: 'Apps', exact: true }).click();
            await expect(page.locator('nav')).toHaveAttribute('aria-busy', 'false');
            assert.equal(await page.evaluate(() => window.ajaxCalls.length), expectedCalls);
            for (const app of ['widget-editor', 'credit']) {
                const row = page.locator('[data-app="' + app + '"]');
                for (const link of await row.locator('a').all()) {
                    assert.match(await link.getAttribute('href'), /^\/ui_page\.do\?sys_id=[a-f0-9]{32}$/);
                }
            }
        } finally { await page.close(); }
    }
});

test('context checks ignore stale responses and refresh after Credit+ selects a different record', async () => {
    const page = await mount({ current: 'credit', search: '?sysparm_table=sys_script_include&sysparm_record=' + record, capabilities: support, delay: 250 });
    try {
        await page.getByRole('button', { name: 'Apps', exact: true }).click();
        const link = page.locator('[data-app="widget-editor"] .we-app-drawer-link');
        await expect(link).toHaveAttribute('aria-disabled', 'true');
        assert.equal(await link.getAttribute('href'), null);
        await page.evaluate(() => {
            history.replaceState({}, '', '?sysparm_table=incident&sysparm_record=' + 'b'.repeat(32));
            window.GlideAjax = function () {
                this.addParam = () => {};
                this.getXMLAnswer = callback => callback(JSON.stringify({ success: true, apps: { compare: true } }));
            };
            document.querySelector('nav').hidePopover();
        });
        await page.getByRole('button', { name: 'Apps', exact: true }).click();
        await expect(page.locator('nav')).toHaveAttribute('aria-busy', 'false');
        await page.waitForTimeout(300);
        assert.match(await link.getAttribute('href'), /^\/ui_page\.do\?sys_id=[a-f0-9]{32}$/);
        assert.ok((await page.locator('[data-app="compare"] .we-app-drawer-link').getAttribute('href')).includes('&table=incident&record_id=' + 'b'.repeat(32)));
        await page.evaluate(() => { history.replaceState({}, '', '?sysparm_update=only-update-id'); document.querySelector('nav').hidePopover(); });
        await page.getByRole('button', { name: 'Apps', exact: true }).click();
        assert.match(await page.locator('[data-app="compare"] .we-app-drawer-link').getAttribute('href'), /^\/ui_page\.do\?sys_id=[a-f0-9]{32}$/);
    } finally { await page.close(); }
});

test('failed compatibility checks restore usable fresh links', async () => {
    const page = await mount({ current: 'compare' });
    try {
        await page.evaluate(record => {
            history.replaceState({}, '', '?table=sp_widget&record_id=' + record);
            window.GlideAjax = function () {
                this.addParam = () => {};
                this.getXMLAnswer = callback => callback('not JSON');
            };
        }, record);
        await page.getByRole('button', { name: 'Apps', exact: true }).click();
        await expect(page.locator('nav')).toHaveAttribute('aria-busy', 'false');
        assert.equal(await page.locator('a[aria-disabled="true"]').count(), 0);
        for (const link of await page.locator('nav a').all()) assert.match(await link.getAttribute('href'), /^\/ui_page\.do\?sys_id=[a-f0-9]{32}$/);
    } finally { await page.close(); }
});


test('tagline colour matches the real Open modal list subtext in light and dark themes', async () => {
    const html = readFluentField(directory + 'sys_ui_page_8b2e70458373fe1070b8b5dfeeaad35e.now.ts', 'html');
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    for (const colour of ['23,43,49', '227,233,231']) {
        const page = await mount();
        try {
            await page.addStyleTag({ content: css + ':root { --now-color_text--primary: ' + colour + '; --now-color_text--secondary: 160,20,40; }' });
            await page.evaluate(() => {
                const reference = document.createElement('span');
                reference.className = 'we-picker-item-id';
                reference.textContent = 'Open modal subtext';
                document.body.appendChild(reference);
            });
            const colours = await page.evaluate(() => [
                getComputedStyle(document.querySelector('.we-picker-item-id')).color,
                getComputedStyle(document.querySelector('.we-app-drawer-description')).color,
            ]);
            assert.equal(colours[0], colours[1]);
        } finally { await page.close(); }
    }
});

test('Properties keeps its heading and search, uses a cog drawer button and stays out of the app list', async () => {
    const file = directory + 'sys_ui_page_widget_editor_plus_properties.now.ts';
    const html = readFluentField(file, 'html');
    const client = readFluentField(file, 'clientScript');
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[0];
    const shell = html.slice(html.indexOf('<div class="wep-shell">'), html.lastIndexOf('</j:jelly>'));
    for (const [width, admin] of [[1280, true], [320, false]]) {
        const page = await browser.newPage({ viewport: { width, height: 768 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            await page.context().route('http://properties.test/**', route => route.fulfill({
                contentType: 'text/html',
                body: css + '<style>:root { --now-color_chrome--brand-5: 3,45,66; --now-color--neutral-0: 255,255,255; --now-color_text--primary: 23,43,49; --now-color_background--primary: 255,255,255; }</style>' + shell.replace(/\$\{gs\.hasRole\('admin'\)\}/g, String(admin)),
            }));
            await page.goto('http://properties.test/ui_page.do?sys_id=47cb4ac08e0d4437b5c0a482d8411e30');
            await page.evaluate(() => {
                window.propertyRequests = [];
                window.GlideAjax = function () {
                    const params = {};
                    this.addParam = (name, value) => { params[name] = value; };
                    this.getXMLAnswer = callback => {
                        window.propertyRequests.push(params);
                        callback(JSON.stringify({ success: true, properties: [] }));
                    };
                };
            });
            await page.addScriptTag({ content: client });
            const heading = page.getByRole('heading', { name: 'Widget Editor+ Properties', exact: true });
            const trigger = page.getByRole('button', { name: 'Apps', exact: true });
            await expect(heading).toBeVisible();
            await expect(page.getByRole('searchbox', { name: 'Search properties' })).toBeVisible();
            assert.equal(await trigger.locator('.icon-cog').count(), 1);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.equal(await page.locator('#wep-header').evaluate(el => getComputedStyle(el).borderBottomWidth), '0px');
            assert.equal(await page.evaluate(() => window.propertyRequests[0].sysparm_name), 'getProperties');
            await trigger.click();
            const nav = page.getByRole('navigation', { name: 'Apps', exact: true });
            await expect(nav).toBeVisible();
            assert.equal(await nav.locator('.we-app-drawer-option').count(), admin ? 5 : 4);
            assert.equal(await nav.locator('[aria-current="page"]').count(), 0);
            assert.equal(await nav.getByText('Properties', { exact: true }).count(), 0);
            const bounds = await nav.boundingBox();
            assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
            await nav.getByRole('link', { name: 'Compare+', exact: true }).click();
            await expect(page).toHaveURL('http://properties.test/ui_page.do?sys_id=51ec3d258363b61070b8b5dfeeaad36b');
            assert.equal(page.context().pages().length, 1);
            assert.deepEqual(errors, []);
        } finally { await page.context().close(); }
    }
});

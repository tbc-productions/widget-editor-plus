const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const html = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_credit.html', 'utf8');
assert.match(fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_compare.html', 'utf8'), /credit_update:\s*_weDiffConfigParams.get\('credit_update'\)/);
const client = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_credit.client.js', 'utf8');
assert.doesNotMatch(client, /[\uD800-\uDBFF][\uDC00-\uDFFF]/, 'Use JavaScript Unicode escapes so emoji survive update-set transport');
const angularSource = fs.readFileSync(require.resolve('angular/angular.min.js'), 'utf8');
async function settle(page) {
    await page.evaluate(() => new Promise(resolve => {
        const scope = angular.element(document.getElementById('credit-plus')).injector().get('$rootScope');
        scope.$evalAsync(() => scope.$$postDigest(resolve));
    }));
}
async function installCredit(page) {
    await page.addScriptTag({ content: angularSource });
    await page.addScriptTag({ content: client });
    await settle(page);
}
// Jelly may discard whitespace-only text nodes between elements.
const markup = (html.match(/<style>([\s\S]*?)<\/style>/)[0] + html.match(/<main[\s\S]*?<\/main>/)[0]).replace(/>\s+</g, '><');
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/i)[1];
function initialMetadata(description, siteTitle = 'My instance') {
    const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<span id="cp-page-description" hidden>' + escape(description) + '</span><span id="cp-site-title" hidden>' + escape(siteTitle) + '</span><script>' + bootstrap + '</script>';
}
const update = 'b'.repeat(32), original = 'c'.repeat(32);
const fixture = {
    success: true, selected: update, table: 'sp_widget', tableLabel: 'Widget', recordName: 'My widget', removedCount: 1, record: 'a'.repeat(32), field: 'script',
    fields: [{ name: 'script', label: 'Server script', language: 'javascript' }, { name: 'client_script', label: 'Client script', language: 'javascript' }, { name: 'template', label: 'HTML template', language: 'html' }, { name: 'condition', label: 'Condition', language: 'javascript' }],
    warnings: [],
    updateSets: [{ id: original, number: 1, name: 'Default', author: 'Earlier author', time: '2026-09-01 00:00:00' }, { id: update, number: 2, name: 'HM-13489', author: 'Developer', time: '2026-10-01 00:00:00' }, { id: 'd'.repeat(32), number: 3, name: 'Next release', author: 'Future author', time: '2026-10-02 00:00:00' }],
    lines: [{ number: 1, text: '<img src=x onerror="window.injected=true">', update }, { number: 2, text: 'run();', update }],
    updates: [{ id: original, updateSet: { id: 'e'.repeat(32), table: 'sys_update_set', name: 'Original release' }, available: true, author: 'Earlier author', time: '2026-09-01 00:00:00', before: '', code: 'old();', beforeAvailable: false, removedCount: 0, added: [true], removed: [] }, { id: update, updateSet: { id: 'f'.repeat(32), table: 'sys_remote_update_set', name: 'Imported release' }, removedCount: 1, removedOrigins: { 0: original }, available: true, author: 'Developer', time: '2026-10-01 00:00:00', before: 'old();', code: 'run();', beforeAvailable: true, added: [true], removed: [true] }]
};

function installMonaco() {
    window.creditEditors = [];
    window.createdModels = []; window.disposedModels = 0; window.disposedEditors = 0; window.disposedCreditEditors = 0; window.options = []; window.creditOptions = [];
    window.monaco = { editor: {
        setTheme() {},
        EditorOption: { fontInfo: 'fontInfo' },
        createModel: (text, language) => { const model = { text, language, dispose: () => window.disposedModels++ }; window.createdModels.push(model); return model; },
        create: (container, options) => {
            window.creditOptions.push(options); let top = 0, scroll, configuration, zonesChanged;
            let font = { fontFamily: 'monospace', fontSize: 13, fontWeight: 'normal', letterSpacing: 0, lineHeight: 24 }, padding = 8, zone = 0, hidden = [], groupZones = {}, nextZone = 0;
            const editor = { getScrollHeight: () => Math.max(container.clientHeight, options.model.text.split('\n').length * font.lineHeight + padding * 2 + zone + Object.values(groupZones).reduce((sum, zone) => sum + zone.heightInPx, 0)), getScrollTop: () => top,
                getScrollWidth: () => container.clientWidth, getLayoutInfo: () => ({ height: container.clientHeight, contentWidth: container.clientWidth, horizontalScrollbarHeight: 12 }),
                getOption: () => font,
                deltaDecorations: (_old, decorations) => { editor.decorations = decorations; return decorations.map((_, i) => 'decoration-' + i); },
                setHiddenAreas: ranges => { hidden = ranges; window.hiddenRanges = ranges; },
                getTopForLineNumber: (number, includeZone) => padding + (number - 1 - hidden.reduce((total, range) => total + Math.max(0, Math.min(number - 1, range.endLineNumber) - range.startLineNumber + 1), 0)) * font.lineHeight + (number > 15 && !(number === 16 && includeZone) ? zone : 0) + Object.values(groupZones).filter(zone => zone.afterLineNumber < number).reduce((sum, zone) => sum + zone.heightInPx, 0),
                updateOptions: options => { font = { ...font, ...options }; padding = options.padding?.top ?? padding; if (configuration) configuration(); },
                changeViewZones: callback => {
                    callback({ addZone: zone => {
                        const id = String(++nextZone); groupZones[id] = zone;
                        container.style.position = 'relative';
                        zone.domNode.style.cssText = 'position:absolute;left:0;width:100%;height:' + zone.heightInPx + 'px;top:' + (editor.getTopForLineNumber(zone.afterLineNumber) + font.lineHeight) + 'px';
                        container.appendChild(zone.domNode);
                        return id;
                    }, removeZone: id => { groupZones[id].domNode.remove(); delete groupZones[id]; } });
                    editor.groupZones = Object.values(groupZones).map(({ afterLineNumber, heightInPx }) => ({ afterLineNumber, heightInPx }));
                    editor.zoneElements = Object.values(groupZones).map(zone => zone.domNode);
                    if (zonesChanged) zonesChanged();
                },
                addViewZone: height => { zone = height; if (zonesChanged) zonesChanged(); },
                revealLine: number => {
                    const position = editor.getTopForLineNumber(number);
                    if (position < top) editor.setScrollTop(position);
                    else if (position + font.lineHeight > top + container.clientHeight) editor.setScrollTop(position + font.lineHeight - container.clientHeight);
                },
                setScrollTop: value => { top = value; if (scroll) scroll(); }, onDidScrollChange: callback => scroll = callback, onDidContentSizeChange() {}, onDidLayoutChange() {}, onDidChangeConfiguration: callback => configuration = callback, onDidChangeViewZones: callback => zonesChanged = callback, layout() {}, dispose: () => { Object.values(groupZones).forEach(zone => zone.domNode.remove()); window.disposedCreditEditors++; } };
            window.creditEditor = editor; window.creditEditors.push(editor); return editor;
        },
        colorizeModelLine: (model, number) => { const escaped = document.createElement('span'); escaped.textContent = model.text.split('\n')[number - 1]; return '<span class="mtk2">' + escaped.innerHTML + '</span>'; },
        colorize: () => Promise.resolve(''),
        createDiffEditor: (container, options) => { window.options.push(options); let modified; return { setModel: models => { window.lastModels = models; modified = window.monaco.editor.create(container, { ...options, model: models.modified }); }, getModifiedEditor: () => modified, onDidUpdateDiff() {}, layout() {}, dispose: () => { window.disposedEditors++; modified.dispose(); } }; }
    } };
}

async function openField(page, name = 'script') {
    const section = page.locator('.cp-field-section[data-field="' + name + '"]');
    if (!await section.evaluate(node => node.open)) await section.locator('summary.da-summary').click();
    await page.waitForFunction(name => document.querySelector('.cp-field-section[data-field="' + name + '"] summary .da-diff-counts').textContent.length > 0, name);
    await page.waitForFunction(name => { const section = document.querySelector('.cp-field-section[data-field="' + name + '"]'); return section.querySelector('[id$="-code-loading"]').hidden && (section.querySelector('[id$="-attribution"]').children.length > 0 || section.querySelector('[id$="-lines"]').children.length > 0 || section.querySelector('summary .da-diff-counts').textContent === '0 lines'); }, name);
    return section;
}
async function chooseSet(page, id) {
    await page.locator('#cp-update-button').click();
    await page.locator('#cp-update-menu [data-value="' + id + '"]').click();
    await settle(page);
}
function part(section, id) { return section.locator('[id$="' + id.replace(/^cp/, '') + '"]'); }
async function menuAction(page, cell, label) {
    await cell.click({ button: 'right' });
    await page.locator('#cp-context-menu').getByRole('menuitem', { name: label, exact: true }).click();
}
function setCell(section) { return section.locator('[data-context-kind="update set"]').first(); }
async function initialise(page, width = 1280, monaco = false, search = '', preferences = {}) {
    await page.setViewportSize({ width, height: 850 });
    await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: markup }));
    await page.goto('https://credit.test/?sysparm_update=' + update + (search ? '&' + search : ''));
    if (monaco) await page.evaluate(installMonaco);
    await page.evaluate(({ fixture, preferences }) => {
        window.fixture = fixture; window.calls = []; window.nextAnswer = null; window.historyEntries = [];
        window.WE_HISTORY_SYNC = { set: entry => window.historyEntries.push(entry) }; window.WE_CREDIT_CONFIG = { siteTitle: 'My instance', preferences };
        window.GlideAjax = function (name) {
            const params = {}; this.addParam = (key, value) => params[key] = value;
            this.getXMLAnswer = callback => {
                if (params.sysparm_name === 'savePreferences') {
                    (window.preferenceCalls ||= []).push(params);
                    window.savedPreferences = JSON.parse(params.sysparm_preferences);
                    callback('{"success":true}');
                    return;
                }
                if (params.sysparm_name === 'getContributors') {
                    (window.contributorCalls ||= []).push(params);
                    callback(JSON.stringify({ success: true, contributors: window.contributors || {} }));
                    return;
                }
                window.calls.push({ name, params });
                const result = window.nextAnswer || (params.sysparm_name === 'getComparison' ? { success: true, table: window.fixture.table, record: window.fixture.record, left: { sys_id: params.sysparm_from_update, fields: { script: 'old();' } }, right: { sys_id: params.sysparm_update, fields: { script: window.fixture.lines.map(line => line.text).join('\n') } } } : { ...window.fixture, selected: params.sysparm_update || window.fixture.selected, field: params.sysparm_field || 'script' });
                window.nextAnswer = null; callback(JSON.stringify(result));
            };
        };
    }, { fixture, preferences });
    await installCredit(page);
}

test('Statistics summary stays readable and distinct with light and dark themes and matching brand/text colours', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await initialise(page);
        for (const width of [1280, 390]) {
            await page.setViewportSize({ width, height: 850 });
            for (const [background, surface, text] of [
                ['255,255,255', '237,237,237', '29,29,29'],
                ['24,26,30', '45,48,54', '235,235,235']
            ]) {
                const colours = await page.evaluate(({ background, surface, text }) => {
                    const style = document.documentElement.style;
                    style.setProperty('--now-color_background--primary', background);
                    style.setProperty('--now-color_background--tertiary', surface);
                    style.setProperty('--now-color_text--primary', text);
                    style.setProperty('--now-color_chrome--brand-5', text);
                    const summary = getComputedStyle(document.getElementById('cp-statistics-button'));
                    const label = getComputedStyle(document.getElementById('cp-statistics-heading'));
                    return { background: summary.backgroundColor, text: label.color };
                }, { background, surface, text });
                function luminance(colour) {
                    return colour.match(/\d+/g).map(Number).map(channel => {
                        const value = channel / 255;
                        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
                    }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
                }
                const foreground = luminance(colours.text), backdrop = luminance(colours.background);
                assert.ok((Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05) >= 4.5);
                assert.equal(colours.background, 'rgb(' + surface.split(',').join(', ') + ')');
                assert.notEqual(colours.background, 'rgb(' + background.split(',').join(', ') + ')');
                await page.screenshot({ path: '/tmp/credit-statistics-summary-' + width + '-' + (text === '29,29,29' ? 'light' : 'dark') + '.png' });
            }
        }
    } finally { await browser.close(); }
});

test('fields start collapsed, author is plain text, and Compare+ links open safely in a new tab', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage(); await initialise(page, width);
            assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
            assert.equal(await page.locator('#cp-table-filters, #cp-removed-view, #cp-removed-panel').count(), 0);
            assert.equal(await page.evaluate(() => window.calls[0].params.sysparm_context), 'true');
            const script = await openField(page);
            assert.equal(await part(script, 'cp-lines').locator('.cp-origin a').count(), 0);
            assert.equal(await part(script, 'cp-lines').locator('.cp-origin .cp-cell-text').first().textContent(), 'Developer');
            assert.equal(await part(script, 'cp-lines').locator('.cp-origin .cp-cell-text').first().getAttribute('title'), 'Developer');
            assert.equal(await page.locator('img').count(), 0);
            assert.equal(await part(script, 'cp-lines').locator('.cp-code').first().textContent(), fixture.lines[0].text);
            assert.equal(await setCell(script).evaluate(node => getComputedStyle(node).cursor), 'pointer');
            assert.equal(await setCell(script).locator('.cp-cell-text').evaluate(node => getComputedStyle(node).textDecorationStyle), 'dotted');
            await setCell(script).click({ button: 'right' });
            const compare = page.locator('#cp-context-menu').getByRole('menuitem', { name: 'Compare+', exact: true });
            assert.equal(await page.locator('#cp-context-menu').getByRole('menuitem', { name: 'Quick compare' }).getAttribute('aria-disabled'), 'true');
            assert.deepEqual(await page.locator('#cp-context-menu [role=menuitem]').allTextContents(), ['Show matching', 'Filter out', 'Quick compare', 'Compare+', 'Open update set']);
            assert.equal(await page.locator('#cp-context-menu').getByRole('menuitem', {name:'Open update set',exact:true}).getAttribute('href'), '/nav_to.do?uri=' + encodeURIComponent('sys_remote_update_set.do?sys_id=' + 'f'.repeat(32)));
            await page.locator('#cp-context-menu').getByRole('menuitem', {name:'Quick compare'}).evaluate(node => node.click());
            assert.equal(await page.evaluate(() => window.calls.some(call => call.params.sysparm_name === 'getComparison')), false);
            assert.equal(await compare.getAttribute('aria-disabled'), 'true');
            assert.equal(await compare.getAttribute('href'), null);
            assert.equal(await page.locator('#cp-context-menu [role=menuitem]').last().evaluate(node => node.previousElementSibling.getAttribute('role')), 'separator');
            assert.equal(await page.locator('#cp-inspector').count(), 0);
            assert.equal(await page.locator('.cp-active-filters button[title], .cp-heading-label [title]').count(), 0);
            assert.equal(await page.locator('#cp-context-menu .icon-open-document-new-tab').count(), 2);
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#cp-retry .icon-refresh').count(), 1);
            assert.equal(await page.locator('.dc-title').evaluate(node => node.tagName), 'DIV');
            await openField(page, 'template');
            assert.equal(await page.locator('.cp-field-section[open]').count(), 2);
            await script.locator('summary.da-summary').click(); await openField(page);
            assert.equal(await page.evaluate(() => window.calls.length), 3);
            await page.evaluate(() => window.nextAnswer = { success: false, error: 'Administrator access is required.' });
            await page.locator('#cp-retry').click(); assert.equal(await page.locator('#cp-results').isVisible(), false);
            assert.equal(await page.locator('#cp-status').textContent(), 'Administrator access is required.');
            assert.equal(await page.locator('#cp-status').evaluate(node => node.classList.contains('alert')), false);
            assert.equal(await page.locator('#cp-status-wrap').getAttribute('class'), 'dc-no-versions-overlay');
            assert.equal(await page.locator('#cp-status-content').getAttribute('class'), 'dc-no-versions-content');
            assert.equal(await page.locator('#cp-status-content').evaluate(node => getComputedStyle(node).textAlign), 'center');
            await page.screenshot({ path: '/tmp/credit-load-error-' + width + '.png' });
            await page.locator('#cp-retry').click(); assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
            await page.evaluate(() => window.fixture.lines = []);
            const empty = page.locator('.cp-field-section[data-field=script]');
            await empty.locator('summary').click();
            await page.waitForFunction(() => document.querySelector('.cp-field-section[data-field=script]').getAttribute('aria-disabled') === 'true');
            assert.equal(await empty.evaluate(node => node.open), false);
            assert.equal(await empty.locator('.da-diff-counts').textContent(), '0 lines');
            assert.equal(await empty.locator('table').first().isVisible(), false);
            await page.close();
        }
    } finally { await browser.close(); }
});


test('viewer ignores stale responses after a timeout and allows retry', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: markup }));
        await page.goto('https://credit.test/?sysparm_update=' + update);
        await page.evaluate(() => {
            window.pending = [];
            const timeout = window.setTimeout;
            window.setTimeout = (callback, delay) => { if (delay === 180000) { window.expire = callback; return 1; } return timeout(callback, delay); };
            window.clearTimeout = () => {};
            window.GlideAjax = function () { this.addParam = () => {}; this.getXMLAnswer = callback => window.pending.push(callback); };
        });
        await installCredit(page);
        assert.equal(await page.locator('#cp-loading').isVisible(), true);
        assert.equal(await page.locator('#cp-loading svg rect').count(), 5);
        assert.equal(await page.locator('#cp-status-wrap').isVisible(), false);
        assert.equal(await page.locator('#cp-loading').evaluate(node => getComputedStyle(node).alignItems), 'center');
        await page.evaluate(() => window.expire());
        await settle(page);
        assert.match(await page.locator('#cp-status').textContent(), /timed out/);
        assert.equal(await page.locator('#cp-status').evaluate(node => node.classList.contains('alert')), false);
        assert.equal(await page.locator('#cp-status-wrap').getAttribute('class'), 'dc-no-versions-overlay');
        assert.equal(await page.locator('#cp-status-content').getAttribute('class'), 'dc-no-versions-content');
        await page.locator('#cp-retry').click();
        await page.evaluate(fixture => window.pending[0](JSON.stringify(fixture)), fixture);
        await settle(page);
        assert.match(await page.locator('#cp-status').textContent(), /Loading/);
        await page.evaluate(fixture => window.pending[1](JSON.stringify(fixture)), fixture);
        await settle(page);
        assert.equal(await page.locator('#cp-loading').count(), 0);
        assert.equal(await page.locator('.cp-field-section').count(), 4);
        assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
    } finally { await browser.close(); }
});

test('inline diff compares the row update to the selected update and restores attribution', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page, 1280, true);
        await page.evaluate(original => window.fixture.lines[0].update = original, original);
        const section = await openField(page);
        const other = await openField(page, 'template');
        await setCell(section).click({button:'right'});
        const external = page.getByRole('menuitem', {name:'Compare+',exact:true});
        assert.equal(await external.getAttribute('target'), '_blank');
        assert.equal(await external.getAttribute('rel'), 'noopener');
        assert.match(decodeURIComponent(await external.getAttribute('href')), new RegExp('credit_update=' + original));
        await page.keyboard.press('Escape');
        await menuAction(page, setCell(section), 'Quick compare');
        assert.equal(await part(section, 'cp-diff-close').isVisible(), true);
        assert.deepEqual(await page.evaluate(() => window.calls.at(-1).params), { sysparm_name: 'getComparison', sysparm_update: fixture.selected, sysparm_from_update: original });
        assert.equal(await part(section, 'cp-code-loading').isVisible(), false);
        assert.equal(await page.evaluate(() => window.lastModels.original.text), 'old();');
        assert.equal(await page.evaluate(() => window.lastModels.modified.text), fixture.lines.map(line => line.text).join('\n'));
        assert.equal(await page.evaluate(() => window.options.at(-1).renderSideBySide), false);
        assert.equal(await page.evaluate(() => window.options.at(-1).readOnly), true);
        assert.equal(await part(other, 'cp-diff-close').isVisible(), false);
        const splitter = part(section, 'cp-splitter');
        await splitter.focus(); await page.keyboard.press('ArrowRight');
        assert.equal(await splitter.getAttribute('aria-valuenow'), '36');
        assert.equal(await part(other, 'cp-splitter').getAttribute('aria-valuenow'), '36');
        const widths = await page.locator('.cp-field-section[open] .cp-gutter').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
        assert.equal(widths[0], widths[1]);
        await part(section, 'cp-diff-close').click();
        assert.equal(await part(section, 'cp-diff-close').isVisible(), false);
        assert.equal(await page.evaluate(() => window.disposedEditors), 1);
        assert.equal(await part(section, 'cp-attribution').locator('tr').count(), 2);
        await page.evaluate(() => window.nextAnswer = { success: false, error: 'Snapshot unavailable.' });
        await menuAction(page, setCell(section), 'Quick compare');
        assert.equal(await part(section, 'cp-field-status').textContent(), 'Snapshot unavailable.');
        assert.equal(await part(section, 'cp-code-status').getAttribute('class'), 'alert alert-danger');
        assert.equal(await part(section, 'cp-code-view').isVisible(), true);
        await page.locator('#cp-retry').click();
        assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
    } finally { await browser.close(); }
});

test('multiple Monaco fields stay aligned and release editors when collapsed or the update set changes', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage(); await initialise(page, width, true);
            assert.equal(await page.evaluate(() => window.creditOptions.length), 0);
            await page.evaluate(() => window.fixture.lines = Array.from({ length: 120 }, (_, i) => ({ number: i + 1, text: 'var line' + i + ' = true;', update: window.fixture.selected })));
            const script = await openField(page);
            assert.equal(await part(script, 'cp-code-view').isVisible(), true);
            assert.equal(await part(script, 'cp-attribution').locator('tr').count(), 120);
            const options = await page.evaluate(() => window.creditOptions[0]);
            assert.equal(options.readOnly, true); assert.equal(options.domReadOnly, true); assert.equal(options.wordWrap, 'off'); assert.equal(options.folding, false);
            await page.evaluate(() => window.creditEditor.setScrollTop(480));
            assert.equal(await part(script, 'cp-gutter-content').evaluate(node => node.style.transform), 'translateY(-480px)');
            await part(script, 'cp-gutter').evaluate(node => node.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, cancelable: true })));
            assert.equal(await page.evaluate(() => window.creditEditor.getScrollTop()), 240);
            const html = await openField(page, 'template');
            assert.equal(await page.evaluate(() => window.creditOptions.at(-1).model.language), 'html');
            assert.equal(await part(script, 'cp-code-view').isVisible(), true);
            assert.equal(await part(html, 'cp-code-view').isVisible(), true);
            await script.locator('summary.da-summary').click();
            await page.waitForFunction(() => window.disposedCreditEditors === 1);
            await openField(page);
            assert.equal(await page.evaluate(() => window.calls.length), 3);
            assert.equal(await page.evaluate(() => window.creditOptions.length), 3);
            await chooseSet(page, original);
            assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
            assert.equal(await page.evaluate(() => window.disposedCreditEditors), 3);
            await page.evaluate(() => window.monaco.editor.create = () => { throw Error('Unavailable'); });
            const fallback = await openField(page);
            assert.equal(await part(fallback, 'cp-table-fallback').isVisible(), true);
            assert.equal(await part(fallback, 'cp-lines').locator('tr').count(), 120);
            await page.close();
        }
    } finally { await browser.close(); }
});

test('annotations inherit Monaco font metrics and follow geometry changes without cumulative drift', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: markup }));
        await page.goto('https://credit.test/?sysparm_update=' + update);
        await page.evaluate(installMonaco);
        await page.evaluate(fixture => {
            fixture = { ...fixture, lines: Array.from({ length: 120 }, (_, i) => ({ number: i + 1, text: 'code();', update: i >= 118 ? fixture.updates[0].id : fixture.selected })) };
            window.GlideAjax = function () { this.addParam = () => {}; this.getXMLAnswer = callback => callback(JSON.stringify(fixture)); };
        }, fixture);
        await installCredit(page);
        await openField(page);
        assert.deepEqual(await page.locator('.cp-gutter-content').first().evaluate(node => {
            const style = getComputedStyle(node); return [style.fontSize, style.lineHeight, style.fontFamily];
        }), ['13px', '24px', 'monospace']);
        await page.evaluate(() => {
            creditEditor.updateOptions({ fontSize: 15, lineHeight: 27, padding: { top: 13 } });
            creditEditor.addViewZone(37);
        });
        await page.waitForFunction(() => document.querySelector('#cp-attribution tr[data-line-number="16"]').style.top === '455px');
        assert.deepEqual(await page.locator('.cp-gutter-content').first().evaluate(node => {
            const style = getComputedStyle(node); return [style.fontSize, style.lineHeight];
        }), ['15px', '27px']);
        for (const zoom of [0.8, 1.1, 1.25, 1.5, 1]) {
            await page.evaluate(zoom => { document.body.style.zoom = zoom; creditEditor.setScrollTop(1800); }, zoom);
            const drift = await page.locator('#cp-attribution tr').evaluateAll(rows => {
                const top = document.getElementById('cp-code-monaco').getBoundingClientRect().top;
                const zoom = Number(document.body.style.zoom);
                return Math.max(...rows.map((row, index) => Math.abs(row.getBoundingClientRect().top - top - (creditEditor.getTopForLineNumber(index + 1) - creditEditor.getScrollTop()) * zoom)));
            });
            assert.ok(drift < 0.05, 'Annotations follow Monaco line positions at zoom ' + zoom + ': ' + drift);
        }
        await page.evaluate(() => document.querySelector('#cp-attribution tr[data-line-number="119"] .cp-cell').focus({ preventScroll: true }));
        assert.ok(await page.evaluate(() => creditEditor.getScrollTop()) > 2500, 'Keyboard focus reveals code for an off-screen attribution');
    } finally { await browser.close(); }
});

test('Polaris captures the record title while History keeps the Credit+ title and record name', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: route.request().url().endsWith('/host')
            ? '<span id="shell-title"></span><iframe style="width:100%;height:650px" onload="document.getElementById(\'shell-title\').textContent=this.contentDocument.title" src="/?sysparm_update=' + update + '"></iframe>'
            : initialMetadata('My widget (Widget)') + markup }));
        await page.goto('https://credit.test/host');
        const frame = page.frames()[1];
        await frame.evaluate(fixture => {
            window.historyEntries = []; window.calls = [];
            window.WE_HISTORY_SYNC = { set: entry => window.historyEntries.push(entry) };
            window.GlideAjax = function () { const params = {}; window.calls.push(params); this.addParam = (key, value) => params[key] = value; this.getXMLAnswer = callback => window.finishLoading = () => callback(JSON.stringify(fixture)); };
        }, fixture);
        assert.equal(await page.locator('#shell-title').textContent(), 'Credit: My widget (Widget) - My instance');
        await installCredit(frame);
        assert.equal(await frame.title(), 'Credit: My widget (Widget) - My instance');
        assert.equal(await frame.evaluate(() => window.calls[0].sysparm_update), update);
        assert.equal(await frame.evaluate(() => window.calls[0].sysparm_version), undefined);
        await frame.evaluate(() => window.finishLoading());
        await page.waitForFunction(() => document.title === 'Credit: My widget (Widget) - My instance');
        assert.equal(await frame.evaluate(() => window.historyEntries.at(-1).title), 'Credit+');
        assert.equal(await frame.evaluate(() => window.historyEntries.at(-1).description), 'My widget');
        await frame.locator('.cp-field-section[data-field="client_script"] summary').click();
        await frame.waitForFunction(() => window.calls.length === 2);
        await frame.evaluate(() => window.finishLoading());
        assert.equal(await page.locator('#shell-title').textContent(), await page.title());
        assert.equal(await frame.evaluate(() => window.historyEntries.at(-1).description), 'My widget');
        assert.equal(await frame.evaluate(() => window.historyEntries.at(-1).title), 'Credit+');
        assert.equal(new URL('https://credit.test/' + await frame.evaluate(() => window.historyEntries.at(-1).url)).searchParams.get('sysparm_field'), 'client_script');
        assert.match(html, /we_history_sync\.jsdbx/);
        assert.match(html, /window\.location\.replace\('\/now\/nav\/ui\/classic\/params\/target\//);
    } finally { await browser.close(); }
});

test('initial historical names and instance titles stay text, including closing script tags', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const name = 'Widget </script><img src=x onerror="window.injected=true"> \'quotes\' & more';
        const siteTitle = 'Instance </script><script>window.injected=true</script>';
        await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: route.request().url().endsWith('/host')
            ? '<iframe src="/page"></iframe>' : initialMetadata(name + ' (Widget)', siteTitle) + markup }));
        await page.goto('https://credit.test/host');
        const frame = page.frames()[1];
        assert.equal(await frame.title(), 'Credit: ' + name + ' (Widget) - ' + siteTitle);
        assert.equal(await frame.locator('img').count(), 0);
        assert.equal(await frame.evaluate(() => window.injected), undefined);
        assert.match(html, /\$\{HTML:jvar_cp_description\}/);
    } finally { await browser.close(); }
});

test('Compare+ update-set dropdown shows date, set name and author columns and supports keyboard selection', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage(); await initialise(page, width);
            await page.locator('#cp-update-button').click();
            assert.deepEqual(await page.locator('#cp-update-menu .dc-version-dd-item').evaluateAll(items => items.map(item => Array.from(item.querySelectorAll('.dc-vrow span'), span => span.textContent))), [
                ['2026-10-02 00:00:00', 'Next release', 'Future author'], ['2026-10-01 00:00:00', 'HM-13489', 'Developer'], ['2026-09-01 00:00:00', 'Default', 'Earlier author']
            ]);
            assert.equal(await page.locator('#cp-update-button').getAttribute('aria-expanded'), 'true');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
            await page.keyboard.press('End'); await page.keyboard.press('Enter');
            assert.equal(await page.locator('#cp-update-button').getAttribute('data-value'), original);
            assert.equal(new URL(page.url()).searchParams.get('sysparm_update'), original);
            assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
            assert.equal(await page.evaluate(() => window.calls.at(-1).params.sysparm_context), 'true');
            assert.equal(await page.locator('#cp-update-menu .dc-version-dd-item').count(), 3);
            await page.locator('#cp-update-button').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
            assert.equal(await page.locator('#cp-update-button').getAttribute('data-value'), 'd'.repeat(32));
            await page.locator('#cp-update-button').click(); await page.keyboard.press('Escape');
            assert.equal(await page.evaluate(() => document.activeElement.id), 'cp-update-button');
            assert.equal(await page.locator('#cp-update-menu').isVisible(), false);
            await page.locator('#cp-update-button').click(); await page.locator('.dc-title').click();
            assert.equal(await page.locator('#cp-update-menu').isVisible(), false);
            await page.screenshot({ path: '/tmp/credit-plus-fields-' + width + '.png', fullPage: true });
            await page.close();
        }
    } finally { await browser.close(); }
});

test('Compare+ header pickers search and navigate safely, discarding old record-search replies', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: markup }));
        await page.goto('https://credit.test/?sysparm_update=' + update);
        await page.evaluate(fixture => {
            window.pickers = {}; window.calls = []; window.pendingRecords = null;
            window.$j = input => {
                const state = window.pickers[input.id] || { input, value: null, options: null, handler: null, enabled: true };
                const api = { 0: input, select2: (command, value) => {
                    if (typeof command === 'object') { state.options = command; window.pickers[input.id] = state; return api; }
                    if (command === 'data') { if (value === undefined) return state.value; state.value = value; return api; }
                    if (command === 'container') return { find: () => ({ attr: () => {} }) };
                    if (command === 'enable') state.enabled = value;
                    return api;
                }, on: (_event, handler) => { state.handler = handler; }, off: () => { state.handler = null; }, remove: () => input.remove() };
                return api;
            };
            window.$j.fn = { select2() {} };
            window.choosePicker = (id, choice) => window.pickers[id].handler({ added: choice });
            window.searchPicker = (id, term, page) => {
                window.pickers[id].result = null;
                window.pickers[id].options.query({ term, page, callback: value => window.pickers[id].result = value });
            };
            window.GlideAjax = function (name) {
                const params = { processor: name }; this.addParam = (key, value) => params[key] = value;
                this.getXMLAnswer = callback => {
                    window.calls.push(params);
                    if (params.sysparm_name === 'getTables') callback(JSON.stringify({ success: true, results: [{ id: 'sp_widget', text: 'Widget' }], has_more: true }));
                    else if (params.sysparm_name === 'getRecords') window.pendingRecords = callback;
                    else if (params.sysparm_record) {
                        if (params.sysparm_record === '0'.repeat(32)) { callback(JSON.stringify({ success: false, error: 'No Customer Updates for this record.', errorCode: 'no_customer_updates' })); return; }
                        const id = 'e'.repeat(32);
                        callback(JSON.stringify({ ...fixture, table: params.sysparm_table, tableLabel: 'Script Include', record: params.sysparm_record, recordName: 'Selected include', selected: id, lines: [{ number: 1, text: 'selected();', update: id }], updates: [{ ...fixture.updates[1], id }], updateSets: [{ id, number: 1, name: 'Selected set', time: '2026-10-01 00:00:00' }] }));
                    } else callback(JSON.stringify(fixture));
                };
            };
        }, fixture);
        await installCredit(page);
        assert.deepEqual(await page.evaluate(() => window.pickers['cp-table-input'].value), { id: 'sp_widget', text: 'Widget' });
        assert.deepEqual(await page.evaluate(() => window.pickers['cp-record-input'].value), { id: fixture.record, text: 'My widget' });
        assert.equal(await page.evaluate(() => window.pickers['cp-table-input'].options.dropdownCssClass), 'dc-table-picker-drop');
        assert.equal(await page.evaluate(() => window.pickers['cp-record-input'].options.dropdownCssClass), 'dc-record-picker-drop');
        await page.evaluate(() => window.searchPicker('cp-table-input', 'widget', 2));
        await page.waitForFunction(() => window.pickers['cp-table-input'].result);
        assert.equal(await page.evaluate(() => window.calls.at(-1).sysparm_page), 2);
        assert.equal(await page.evaluate(() => window.calls.at(-1).sysparm_search), 'widget');
        assert.equal(await page.evaluate(() => window.pickers['cp-table-input'].result.more), true);
        await page.evaluate(() => window.searchPicker('cp-record-input', 'old', 1));
        await page.waitForFunction(() => window.pendingRecords);
        assert.equal(await page.evaluate(() => window.calls.at(-1).sysparm_table), 'sp_widget');
        await page.evaluate(() => window.choosePicker('cp-table-input', { id: 'sys_script_include', text: 'Script Include' }));
        assert.equal(await page.locator('#cp-status').textContent(), 'Select a record.');
        assert.equal(await page.locator('#cp-status-wrap').getAttribute('class'), 'dc-no-versions-overlay');
        assert.equal(await page.locator('#cp-status-content').getAttribute('class'), 'dc-no-versions-content');
        assert.equal(await page.locator('#cp-loading').count(), 0);
        assert.equal(await page.locator('#cp-update-menu [role=option]').count(), 0);
        assert.equal(new URL(page.url()).searchParams.has('sysparm_update'), false);
        assert.equal(new URL(page.url()).searchParams.has('sysparm_record'), false);
        assert.equal(await page.evaluate(() => window.pickers['cp-record-input'].value), null);
        await page.evaluate(() => window.pendingRecords(JSON.stringify({ success: true, results: [{ id: 'old', text: 'Old widget' }] })));
        assert.equal(await page.evaluate(() => window.pickers['cp-record-input'].result), null, 'Stale results from another table are discarded');
        await page.evaluate(() => window.choosePicker('cp-record-input', { id: '0'.repeat(32), text: 'No history' }));
        assert.match(await page.locator('#cp-status').textContent(), /No Customer Updates/);
        assert.equal(await page.locator('#cp-status').evaluate(node => node.classList.contains('alert-danger')), false);
        assert.equal(await page.locator('#cp-status-wrap').getAttribute('class'), 'dc-no-versions-overlay');
        assert.equal(await page.locator('#cp-status-content').getAttribute('class'), 'dc-no-versions-content');
        assert.equal(await page.locator('#cp-status-wrap').evaluate(node => getComputedStyle(node).justifyContent), 'center');
        assert.equal(await page.locator('#cp-update-button').isDisabled(), true);
        assert.equal(await page.evaluate(() => window.pickers['cp-record-input'].enabled), true);
        await page.evaluate(() => window.choosePicker('cp-record-input', { id: 'd'.repeat(32), text: 'Selected include' }));
        assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
        assert.equal(await page.title(), 'Credit: Selected include (Script Include) - ServiceNow');
        assert.equal(await page.locator('#cp-status-wrap').getAttribute('class'), '');
        assert.equal(new URL(page.url()).searchParams.get('sysparm_table'), 'sys_script_include');
        assert.equal(new URL(page.url()).searchParams.get('sysparm_record'), 'd'.repeat(32));
        assert.equal(new URL(page.url()).searchParams.get('sysparm_update'), 'e'.repeat(32));
        assert.equal(await page.locator('#cp-update-button').getAttribute('data-value'), 'e'.repeat(32));
        const params = await page.evaluate(() => window.calls.at(-1));
        assert.equal(params.processor, 'WidgetEditorCreditAjax');
        assert.equal(params.sysparm_name, 'getCredit');
        assert.equal(params.sysparm_update, undefined);
        const safe = await page.evaluate(() => {
            const result = window.pickers['cp-table-input'].options.formatResult({ id: 'sp_widget', text: '<img src=x onerror="window.injected=true">' });
            return { html: result[0].innerHTML, images: result[0].querySelectorAll('img').length };
        });
        assert.equal(safe.images, 0); assert.match(safe.html, /&lt;img/);
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        assert.equal(await page.locator('#cp-table-input').count(), 0);
        await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
        assert.equal(await page.locator('#cp-table-input').count(), 1);
        assert.equal(await page.evaluate(() => window.pickers['cp-table-input'].value.id), 'sys_script_include');
    } finally { await browser.close(); }
});

test('every field resists ServiceNow table/button sizing and uses theme variables for the dropdown', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page, 1280, true);
        await page.addStyleTag({ content: 'button { min-height:29.25px; line-height:21px; display:inline-block; } tbody { display:table-row-group; } tr { display:table-row; position:static; } td { display:table-cell; font-size:12px; line-height:21px; } .form-control { background-color:rgba(255,255,255,.45) !important; } :root { --now-color_background--primary:7,8,11; --now-button--secondary--color:132,134,255; }' });
        await page.waitForFunction(() => getComputedStyle(document.getElementById('cp-update-button')).backgroundColor === 'rgb(7, 8, 11)');
        assert.equal(await page.locator('#cp-update-button').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(7, 8, 11)');
        assert.equal(await page.locator('#cp-update-button').evaluate(node => getComputedStyle(node).color), 'rgb(132, 134, 255)');
        for (const name of ['script', 'client_script', 'template']) {
            const section = await openField(page, name);
            assert.equal(await part(section, 'cp-attribution').locator('tr').first().evaluate(node => getComputedStyle(node).display), 'block');
            assert.equal(await part(section, 'cp-gutter-content').evaluate(node => getComputedStyle(node).position), 'relative');
            assert.equal(await part(section, 'cp-attribution').locator('button').count(), 0);
            assert.equal(await part(section, 'cp-attribution').locator('tr').nth(1).evaluate(row => row.getBoundingClientRect().top - row.closest('.cp-code-body').getBoundingClientRect().top), 32);
        }
        await page.addStyleTag({ content: ':root { --now-color_background--primary:255,255,255; --now-button--secondary--color:22,27,28; }' });
        await page.waitForFunction(() => getComputedStyle(document.getElementById('cp-update-button')).backgroundColor === 'rgb(255, 255, 255)');
        assert.equal(await page.locator('#cp-update-button').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)');
        assert.equal(await page.locator('#cp-update-button').evaluate(node => getComputedStyle(node).color), 'rgb(22, 27, 28)');
    } finally { await browser.close(); }
});

test('field timeouts, retry and update-set changes discard late responses without reopening fields', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page, 1280, true);
        await page.evaluate(fixture => {
            const setTimeout = window.setTimeout; window.pending = [];
            window.setTimeout = (callback, delay) => delay === 180000 ? (window.expire = callback, 123) : setTimeout(callback, delay);
            window.GlideAjax = function () {
                const params = {}; this.addParam = (key, value) => params[key] = value;
                this.getXMLAnswer = callback => {
                    if (params.sysparm_context) callback(JSON.stringify({ ...fixture, selected: params.sysparm_update }));
                    else if (params.sysparm_name === 'getContributors') callback('{"success":true,"contributors":{}}');
                    else window.pending.push({ params, callback });
                };
            };
        }, fixture);
        const section = page.locator('.cp-field-section[data-field="script"]');
        await section.locator('summary.da-summary').click(); await page.waitForFunction(() => window.pending.length === 1);
        assert.equal(await part(section, 'cp-code-loading').isVisible(), true);
        await page.evaluate(() => window.expire());
        await settle(page);
        assert.equal(await part(section, 'cp-code-loading').isVisible(), false);
        assert.match(await part(section, 'cp-field-status').textContent(), /timed out/);
        assert.equal(await part(section, 'cp-field-retry').count(), 0);
        await section.locator('summary.da-summary').click();
        await section.locator('summary.da-summary').click();
        await page.evaluate(fixture => window.pending[0].callback(JSON.stringify(fixture)), fixture);
        await settle(page);
        assert.equal(await part(section, 'cp-field-status').textContent(), '');
        assert.equal(await part(section, 'cp-code-loading').isVisible(), true);
        assert.equal(await part(section, 'cp-code-loading').textContent(), 'Loading…');
        assert.equal(await part(section, 'cp-code-loading').evaluate(node => node.getBoundingClientRect().left >= node.previousElementSibling.getBoundingClientRect().right), true);
        await page.setViewportSize({ width: 600, height: 850 });
        assert.equal(await part(section, 'cp-code-loading').isVisible(), true);
        await page.setViewportSize({ width: 1280, height: 850 });
        await page.evaluate(fixture => window.pending[1].callback(JSON.stringify(fixture)), fixture);
        await settle(page);
        assert.equal(await part(section, 'cp-code-loading').isVisible(), false);
        assert.equal(await part(section, 'cp-code-view').isVisible(), true);
        const html = page.locator('.cp-field-section[data-field="template"]');
        await html.locator('summary.da-summary').click(); await page.waitForFunction(() => window.pending.length === 3);
        await html.locator('summary.da-summary').click();
        await page.evaluate(fixture => window.pending[2].callback(JSON.stringify({ ...fixture, field: 'template' })), fixture);
        await settle(page);
        assert.equal(await page.evaluate(() => window.creditOptions.length), 1, 'Collapsed fields do not create an editor when their response arrives');
        await openField(page, 'template');
        assert.equal(await page.evaluate(() => window.pending.length), 3, 'Completed data is reused when reopened');
        await page.locator('.cp-field-section[data-field="condition"] summary.da-summary').click();
        await page.waitForFunction(() => window.pending.length === 4);
        await chooseSet(page, original);
        await page.evaluate(fixture => window.pending[3].callback(JSON.stringify({ ...fixture, field: 'condition' })), fixture);
        await settle(page);
        assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
        assert.equal(await page.evaluate(() => window.creditOptions.length), 2);
        assert.equal(await page.evaluate(() => window.disposedCreditEditors), 2);
    } finally { await browser.close(); }
});

test('inline author/set filters combine and clear independently while retaining original Monaco geometry', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1280, 390]) for (const useMonaco of [false, true]) {
            const page = await browser.newPage(); await initialise(page, width, useMonaco);
            await page.evaluate(({ update, original }) => {
                window.fixture.lines = Array.from({ length: 6 }, (_, i) => ({ number: i + 1, text: 'line' + (i + 1) + '();', update: [0, 2, 5].includes(i) ? original : update }));
            }, { update, original });
            const section = await openField(page);
            const body = () => part(section, useMonaco ? 'cp-attribution' : 'cp-lines');
            const author = () => body().locator('[data-context-kind="author"][data-context-value="Earlier author"]').first();
            const set = () => body().locator('[data-context-kind="update set"]').first();
            const numbers = () => useMonaco ? body().locator('tr:not([hidden])').evaluateAll(rows => rows.map(row => Number(row.dataset.lineNumber))) : body().locator('.cp-number').evaluateAll(cells => cells.map(cell => Number(cell.textContent)));
            await author().focus(); await page.keyboard.press('Shift+F10');
            assert.deepEqual(await page.locator('#cp-context-menu [role="menuitem"]').allTextContents(), ['Show matching', 'Filter out']);
            await page.keyboard.press('Enter');
            assert.deepEqual(await numbers(), [1, 3, 6]);
            if (useMonaco) {
                assert.equal(await page.evaluate(() => window.createdModels[0].text.split('\n').length), 6);
                assert.deepEqual(await body().locator('tr:not([hidden])').evaluateAll(rows => rows.map(row => parseFloat(row.style.top))), [8, 32, 56]);
            }
            await menuAction(page, set(), 'Show matching'); assert.deepEqual(await numbers(), [1, 3, 6]);
            await section.getByRole('button', {name:'Clear created by filter',exact:true}).click();
            assert.deepEqual(await numbers(), [1, 3, 6]);
            const second = await openField(page, 'template');
            assert.equal(await part(second, 'cp-active-filters').isVisible(), false);
            await section.getByRole('button', {name:'Clear update set filter',exact:true}).click();
            await menuAction(page, author(), 'Filter out');
            assert.deepEqual(await numbers(), [2, 4, 5]);
            await menuAction(page, body().locator('[data-context-kind="update set"]').filter({visible:true}).first(), 'Filter out');
            assert.deepEqual(await numbers(), []);
            assert.equal(await part(section, 'cp-lines').locator('.cp-empty').textContent(), 'No matches.');
            await section.getByRole('button', {name:'Clear created by filter',exact:true}).click();
            assert.deepEqual(await numbers(), [1, 3, 6]);
            await section.getByRole('button', {name:'Clear update set filter',exact:true}).click();
            assert.deepEqual(await numbers(), [1, 2, 3, 4, 5, 6]);
            assert.equal(await page.locator('#cp-editor-link').getAttribute('href'), '/nav_to.do?uri=' + encodeURIComponent('ui_page.do?sys_id=8b2e70458373fe1070b8b5dfeeaad35e&widget_id=' + fixture.record));
            assert.equal(await page.locator('#cp-record-link').getAttribute('href'), '/nav_to.do?uri=' + encodeURIComponent('sp_widget.do?sys_id=' + fixture.record));
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await page.evaluate(() => window.fixture.table = 'sys_script_include'); await page.locator('#cp-retry').click();
            assert.equal(await page.locator('#cp-editor-link').isVisible(), false);
            assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
            await page.close();
        }
    } finally { await browser.close(); }
});


test('Compare+ loads Customer Update snapshots read-only without version queries or parent history changes', async () => {
    const compareClient = fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_compare.client.js', 'utf8');
    const browser = await chromium.launch({ headless: true });
    try {
        for (const denied of [false, true]) {
            const page = await browser.newPage();
            await page.route('https://compare.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: route.request().url().endsWith('/host') ? '<title>Credit: My widget</title><iframe src="/comparison"></iframe>' : '<div id="we-diff-app"></div>' }));
            await page.goto('https://compare.test/host');
            const frame = page.frames()[1];
            await frame.evaluate(({ denied, update, original, record }) => {
                window.WE_DIFF_CONFIG = { table: 'sp_widget', record_id: record, credit_update: update, da_iframe: 'true' };
                window.WE_XML_EXPORT = { annotateFieldChanges() {} }; window.historyEntries = []; window.calls = [];
                window.WE_HISTORY_SYNC = { set: value => window.historyEntries.push(value) };
                window.angular = { module: () => ({ controller(_name, dependencies) { window.CompareController = dependencies[dependencies.length - 1]; return this; }, directive() { return this; } }), bootstrap() {} };
                const timer = window.setTimeout.bind(window); window.setTimeout = (callback, delay) => timer(callback, delay === 1000 ? 10 : delay);
                window.GlideAjax = function (name) {
                    const params = {}; this.addParam = (key, value) => params[key] = value;
                    this.getXML = callback => {
                        window.calls.push({ name, params });
                        let result;
                        if (params.sysparm_name === 'getUserPrefs') result = { success: true, value: '{}' };
                        else if (params.sysparm_name === 'getDiffFieldDefs') result = { success: true, table_label: 'Widget', fields: [{ key: 'script', label: 'Server script', renderAs: 'code', language: 'javascript' }] };
                        else if (name === 'WidgetEditorCreditAjax' && params.sysparm_name === 'getComparison') result = denied ? { success: false, error: 'Administrator access is required.' } : { success: true, table: 'sp_widget', record, recordName: 'My widget', left: { sys_id: original, sys_created_on: '2026-10-02 00:00:00', sys_created_by: 'Earlier author', fields: { script: 'before();' }, update_set_name: 'Earlier set', update_set_table: 'sys_update_set' }, right: { sys_id: update, sys_created_on: '2026-10-01 00:00:00', sys_created_by: 'Developer', fields: { script: 'after();' }, update_set_name: 'Imported set', update_set_sys_id: 'f'.repeat(32), update_set_table: 'sys_remote_update_set' } };
                        else throw Error('Unexpected comparison request: ' + params.sysparm_name);
                        timer(() => callback({ responseXML: { documentElement: { getAttribute: () => JSON.stringify(result) } } }), 0);
                    };
                };
            }, { denied, update, original, record: fixture.record });
            await frame.addScriptTag({ content: compareClient });
            await frame.evaluate(() => {
                const scope = { $$phase: true, $root: {}, $on() {}, $apply: callback => callback() };
                window.ctrl = new window.CompareController(scope, callback => setTimeout(callback, 0), [document]);
            });
            await frame.waitForFunction(() => !window.ctrl.loading);
            if (denied) assert.match(await frame.evaluate(() => ctrl.errorMsg), /Administrator/);
            else {
                assert.deepEqual(await frame.evaluate(() => [ctrl.leftFields.script, ctrl.rightFields.script, ctrl.leftVersionId, ctrl.rightVersionId]), ['before();', 'after();', original, update]);
                assert.equal(await frame.evaluate(() => ctrl.canWrite), false);
                assert.equal(await frame.evaluate(() => ctrl.metaRight.ust), 'sys_remote_update_set');
                assert.equal(await frame.evaluate(() => ctrl.scriptFields[0].changed), true);
                await frame.evaluate(() => ctrl.toggleVersionCol('left'));
                assert.equal(await frame.evaluate(() => ctrl.openVersionCol), null);
            }
            assert.deepEqual(await frame.evaluate(() => window.calls.map(call => call.params.sysparm_name)), ['getUserPrefs', 'getDiffFieldDefs', 'getComparison']);
            await page.waitForTimeout(30);
            assert.equal(await page.title(), 'Credit: My widget');
            assert.equal(await frame.evaluate(() => window.historyEntries.length), 0);
            await page.close();
        }
    } finally { await browser.close(); }
});

test('closing or reloading discards late inline comparisons and timeouts keep attribution available', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page, 1280, true);
        await page.evaluate(original => window.fixture.lines[0].update = original, original);
        let section = await openField(page);
        await page.evaluate(() => {
            const Ajax = window.GlideAjax, timeout = window.setTimeout;
            window.pendingComparisons = [];
            window.setTimeout = function (callback, delay) { if (delay === 180000) window.expireComparison = callback; return timeout(callback, delay); };
            window.GlideAjax = function (name) {
                const request = new Ajax(name); const params = {}; const add = request.addParam;
                request.addParam = (key, value) => { params[key] = value; add(key, value); };
                const get = request.getXMLAnswer;
                request.getXMLAnswer = callback => {
                    if (params.sysparm_name === 'getComparison') window.pendingComparisons.push(() => get(callback));
                    else get(callback);
                };
                return request;
            };
        });
        const compare = () => menuAction(page, setCell(section), 'Quick compare');
        await compare();
        assert.equal(await part(section, 'cp-code-label').textContent(), 'Server script');
        assert.equal(await part(section, 'cp-diff-close').evaluate(node => node.parentElement.className), 'cp-code-heading');
        assert.equal(await part(section, 'cp-diff-close').textContent(), 'Stop comparing');
        assert.equal(await part(section, 'cp-code-label').getAttribute('title'), null);
        assert.equal(await part(section, 'cp-diff-close').evaluate(node => { const gap = node.getBoundingClientRect().left - node.previousElementSibling.getBoundingClientRect().right; return gap > 0 && gap <= 8; }), true);
        assert.equal(await part(section, 'cp-code-status').isVisible(), false);
        assert.equal(await part(section, 'cp-code-loading').isVisible(), true);
        assert.equal(await part(section, 'cp-code-loading').textContent(), 'Loading comparison…');
        assert.equal(await part(section, 'cp-code-loading').evaluate(node => node.getBoundingClientRect().left >= node.previousElementSibling.getBoundingClientRect().right), true);
        assert.equal(await part(section, 'cp-code-loading').locator('.icon-loading').evaluate(node => getComputedStyle(node).animationName), 'cpSpin');
        await page.setViewportSize({ width: 600, height: 850 });
        assert.equal(await part(section, 'cp-code-loading').isVisible(), true);
        await page.setViewportSize({ width: 1280, height: 850 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await part(section, 'cp-code-loading').locator('.icon-loading').evaluate(node => getComputedStyle(node).animationName), 'none');
        await part(section, 'cp-diff-close').click();
        assert.equal(await part(section, 'cp-code-loading').isVisible(), false);
        await page.evaluate(() => window.pendingComparisons[0]());
        assert.equal(await page.evaluate(() => window.options.length), 0);
        await compare(); await page.evaluate(() => window.expireComparison());
        assert.equal(await part(section, 'cp-field-status').textContent(), 'Comparison timed out.');
        assert.equal(await part(section, 'cp-code-loading').isVisible(), false);
        await page.evaluate(() => window.pendingComparisons[1]());
        assert.equal(await page.evaluate(() => window.options.length), 0);
        await compare(); await page.locator('#cp-retry').click();
        await page.evaluate(() => window.pendingComparisons[2]());
        assert.equal(await page.evaluate(() => window.options.length), 0);
        section = await openField(page);
        assert.equal(await part(section, 'cp-code-view').isVisible(), true);
    } finally { await browser.close(); }
});

test('Polaris URL, record title and History follow update selection and survive a shell refresh', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const prefix = '/now/nav/ui/classic/params/target/';
        const child = '/ui_page.do?sys_id=9c5bf170283e4d6394aa639c79936587&sysparm_update=' + update;
        await page.route('https://credit.test/**', route => {
            const url = new URL(route.request().url());
            const isShell = url.pathname.startsWith(prefix);
            const src = isShell ? '/' + decodeURIComponent(url.pathname.slice(prefix.length)) : '';
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: isShell
                ? '<span id="shell-title">Credit+</span><iframe style="width:100%;height:700px" src="' + src.replaceAll('&', '&amp;') + '"></iframe>'
                : initialMetadata('') + markup });
        });
        await page.goto('https://credit.test' + prefix + encodeURIComponent(child.slice(1)));
        async function initialiseFrame() {
            const frame = page.frames()[1];
            await frame.evaluate(fixture => {
                window.historyEntries = []; window.notifications = []; window.statisticsCalls = 0;
                window.WE_HISTORY_SYNC = { set: entry => window.historyEntries.push(entry) };
                window.CustomEvent.fireTop = (event, win) => {
                    window.notifications.push(event);
                    parent.document.getElementById('shell-title').textContent = win.document.title;
                };
                window.GlideAjax = function () {
                    const params = {}; this.addParam = (k,v) => params[k]=v;
                    this.getXMLAnswer = cb => {
                        if (params.sysparm_name === 'getStatistics') {
                            window.statisticsCalls++;
                            cb(JSON.stringify({success:true,ageDays:1,founder:'Ada',created:'',updateSetCount:1,contributorCount:1,added:1,removed:0,creators:[],destroyers:[],creatorSets:[],destroyerSets:[]}));
                        } else cb(JSON.stringify({...fixture, selected:params.sysparm_update, field:params.sysparm_field||'script'}));
                    };
                };
            }, fixture);
            await installCredit(frame);
            return frame;
        }
        await page.evaluate(() => history.replaceState({shellState:'preserved'}, '', location.href));
        let frame = await initialiseFrame();
        await page.waitForFunction(() => document.getElementById('shell-title').textContent.includes('My widget (Widget)'));
        await chooseSet(frame, original);
        assert.equal(new URL('https://credit.test/' + decodeURIComponent(new URL(page.url()).pathname.slice(prefix.length))).searchParams.get('sysparm_update'), original);
        assert.equal(await page.evaluate(() => history.state.shellState), 'preserved');
        const entry = await frame.evaluate(() => window.historyEntries.at(-1));
        assert.equal(entry.title, 'Credit+');
        assert.equal(entry.description, 'My widget');
        assert.equal(new URL('https://credit.test/' + entry.url).searchParams.get('sysparm_update'), original);
        assert.ok(entry.match.includes('url=' + child.slice(1)));
        assert.equal(await frame.evaluate(() => window.statisticsCalls), 0);
        await frame.getByRole('button', { name: 'Statistics', exact: true }).click();
        assert.equal(new URL(frame.url()).searchParams.get('sysparm_statistics'), 'true');
        assert.equal(new URL('https://credit.test/' + decodeURIComponent(new URL(page.url()).pathname.slice(prefix.length))).searchParams.get('sysparm_statistics'), 'true');
        assert.equal(await frame.locator('#cp-statistics-button').getAttribute('aria-expanded'), 'true');
        assert.equal(await frame.locator('#cp-statistics-container').evaluate(node => node.open), true);
        await page.reload();
        frame = await initialiseFrame();
        assert.equal(await frame.locator('#cp-update-button').getAttribute('data-value'), original);
        assert.equal(await frame.locator('#cp-statistics').isVisible(), true);
        assert.equal(await frame.evaluate(() => window.statisticsCalls), 1);
        assert.equal(await frame.evaluate(() => window.historyEntries.at(-1).title), 'Credit+');
        assert.equal(await frame.evaluate(() => window.historyEntries.at(-1).description), 'My widget');
        assert.equal(await frame.locator('#cp-statistics-button').getAttribute('aria-expanded'), 'true');
        assert.equal(await frame.locator('#cp-statistics-container').evaluate(node => node.open), true);
        await frame.getByRole('button', { name: 'Statistics', exact: true }).click();
        assert.equal(new URL(frame.url()).searchParams.has('sysparm_statistics'), false);
        assert.equal(new URL('https://credit.test/' + decodeURIComponent(new URL(page.url()).pathname.slice(prefix.length))).searchParams.has('sysparm_statistics'), false);
        assert.equal(await frame.locator('#cp-statistics-button').getAttribute('aria-expanded'), 'false');
        assert.equal(await frame.locator('#cp-statistics-container').evaluate(node => node.open), false);
        assert.equal(await frame.locator('#cp-statistics').isVisible(), false);
        await page.waitForFunction(() => document.getElementById('shell-title').textContent.includes('My widget (Widget)'));
    } finally { await browser.close(); }
});

test('widget open actions form a themed split button with keyboard access and a record fallback', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage(); await initialise(page, width);
            // Bootstrap normally hides dropdowns until open; the page must also work without its JavaScript.
            await page.addStyleTag({ content: '.dropdown-menu { display: none; }' });
            const toggle = page.getByRole('button', { name: 'More widget actions' });
            const main = page.getByRole('link', { name: 'Open in Widget Editor+', exact: true });
            const menu = page.getByRole('menu', { name: 'Open widget' });
            const record = page.getByRole('menuitem', { name: 'Open in Widget', exact: true });
            assert.equal(await menu.isVisible(), false);
            assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
            assert.equal(await main.getAttribute('href'), '/nav_to.do?uri=' + encodeURIComponent('ui_page.do?sys_id=8b2e70458373fe1070b8b5dfeeaad35e&widget_id=' + fixture.record));
            assert.equal(await main.evaluate(node => { const next = node.nextElementSibling.getBoundingClientRect(), current = node.getBoundingClientRect(); return Math.abs(next.left - current.right) <= 1 && next.top === current.top && getComputedStyle(node).borderTopRightRadius === '0px' && getComputedStyle(node.nextElementSibling).borderTopLeftRadius === '0px'; }), true);
            for (const [background, foreground] of [['255 255 255', '29 29 29'], ['24 26 30', '235 235 235']]) {
                await page.evaluate(({ background, foreground }) => {
                    document.documentElement.style.setProperty('--now-color_background--primary', background);
                    document.documentElement.style.setProperty('--now-color_text--primary', foreground);
                }, { background, foreground });
                await toggle.click(); assert.equal(await menu.isVisible(), true);
                assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
                assert.equal(await record.getAttribute('href'), '/nav_to.do?uri=' + encodeURIComponent('sp_widget.do?sys_id=' + fixture.record));
                assert.equal(await record.getAttribute('target'), '_blank');
                assert.equal(await record.getAttribute('rel'), 'noopener');
                assert.equal(await menu.evaluate(node => { const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && getComputedStyle(node).backgroundColor === getComputedStyle(document.body).backgroundColor; }), true);
                await page.keyboard.press('Escape'); await settle(page); assert.equal(await menu.isVisible(), false);
                assert.equal(await toggle.evaluate(node => node === document.activeElement), true);
            }
            await toggle.press('ArrowDown'); await page.waitForFunction(() => document.activeElement.id === 'cp-record-link');
            await record.press('ArrowUp'); await settle(page); assert.equal(await menu.isVisible(), true);
            await page.keyboard.press('Tab'); await settle(page); assert.equal(await menu.isVisible(), false);
            await toggle.click(); await page.locator('#cp-record-name').click(); await settle(page); assert.equal(await menu.isVisible(), false);
            await toggle.click();
            await record.evaluate(node => node.addEventListener('click', event => event.preventDefault(), { once: true }));
            await record.click(); assert.equal(await menu.isVisible(), false);
            await toggle.click(); await page.locator('#cp-retry').click(); assert.equal(await menu.isVisible(), false);
            await page.evaluate(() => { window.fixture.table = 'sys_script_include'; window.fixture.tableLabel = 'Script Include'; });
            await page.locator('#cp-retry').click();
            assert.equal(await page.locator('#cp-open-actions').isVisible(), false);
            const fallback = page.getByRole('link', { name: 'Open Script Include', exact: true });
            assert.equal(await fallback.isVisible(), true);
            assert.equal(await fallback.getAttribute('href'), '/nav_to.do?uri=' + encodeURIComponent('sys_script_include.do?sys_id=' + fixture.record));
            await page.evaluate(() => window.fixture.deleted = true); await page.locator('#cp-retry').click();
            assert.equal(await fallback.isVisible(), false);
            assert.equal(await page.locator('#cp-open-actions').isVisible(), false);
            await page.close();
        }
    } finally { await browser.close(); }
});

test('statistics load only on demand, render safe leaderboards, cache while open, and reset on selection', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage(); await initialise(page, width);
            await page.evaluate(() => {
                const Original = window.GlideAjax;
                window.statsRequests = [];
                window.GlideAjax = function (name) {
                    const ga = new Original(name), params = {};
                    this.addParam = (key, value) => { params[key] = value; ga.addParam(key, value); };
                    this.getXMLAnswer = callback => {
                        if (params.sysparm_name === 'getStatistics') window.statsRequests.push({ params, callback });
                        else ga.getXMLAnswer(callback);
                    };
                };
                window.statsFixture = { success: true, ageDays: 42, founder: 'Ada', founderUserId: '3'.repeat(32), creationSource: 'record', created: '2026-09-01 12:00:00', updateSetCount: 12, unknownSetCount: 0, contributorCount: 5, fieldCount: 4, added: 1024, removed: 512, gaps: 0,
                    creators: [{ name: '<img src=x onerror=alert(1)>', added: 512 }, { name: 'Grace', added: 300, userId: '4'.repeat(32) }, { name: 'Linus', added: 212 }, { name: 'Fourth', added: 0 }], destroyers: [{ name: 'Grace', removed: 512, userId: '4'.repeat(32) }],
                    creatorSets: [{ name: 'First release', added: 800, updateSet: { id: '1'.repeat(32), table: 'sys_update_set' } }, { name: 'Unknown set', added: 0 }, { name: 'Invalid reference', added: 0, updateSet: { id: 'javascript:alert(1)', table: 'sys_user' } }], destroyerSets: [{ name: 'Imported set', removed: 512, updateSet: { id: '2'.repeat(32), table: 'sys_remote_update_set' } }], busiestField: { name: 'Server script', added: 800, removed: 200 }, biggestMakeover: { name: 'First release', added: 800, removed: 0, updateSet: { id: '1'.repeat(32), table: 'sys_update_set' } } };
            });
            assert.equal(await page.evaluate(() => window.statsRequests.length), 0);
            const button = page.getByRole('button', { name: 'Statistics', exact: true });
            assert.equal(await button.locator('.fa-bar-chart').count(), 1);
            assert.equal(await button.evaluate(node => node.tagName === 'SUMMARY' && node.parentElement === document.querySelector('.dc-body .da-section') && !document.querySelector('.dc-header #cp-statistics-button')), true);
            assert.equal(await page.locator('#cp-statistics-container').evaluate(node => node.open), false);
            await button.click();
            assert.equal(await page.locator('#cp-statistics-status').textContent(), 'Loading statistics…');
            assert.equal(await page.locator('.cp-stats-skeleton').getAttribute('aria-hidden'), 'true');
            assert.equal(await page.locator('.cp-stats-skeleton .we-skeleton-bar').count(), 36);
            assert.equal(await page.locator('.we-skeleton-bar').first().evaluate(node => getComputedStyle(node).animationName), 'we-skeleton-pulse');
            await page.screenshot({ path: '/tmp/credit-statistics-loading-' + width + '.png', fullPage: true });
            await page.emulateMedia({ reducedMotion: 'reduce' });
            assert.equal(await page.locator('.we-skeleton-bar').first().evaluate(node => getComputedStyle(node).animationName), 'none');
            await page.emulateMedia({ reducedMotion: 'no-preference' });
            assert.equal(await page.evaluate(() => window.statsRequests.length), 1);
            await button.click(); await button.click(); // Do not duplicate in-flight requests.
            assert.equal(await page.evaluate(() => window.statsRequests.length), 1);
            await page.evaluate(() => window.statsRequests[0].callback(JSON.stringify(window.statsFixture)));
            await settle(page);
            assert.equal(await page.locator('.cp-stats-board').count(), 4);
            assert.deepEqual(await page.locator('.cp-stats-board').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).borderTopColor)), ['rgba(9, 134, 88, 0.35)', 'rgba(191, 41, 41, 0.35)', 'rgba(9, 134, 88, 0.35)', 'rgba(191, 41, 41, 0.35)']);
            assert.equal(await page.locator('.cp-stats-board').first().locator('li').count(), 3);
            assert.deepEqual(await page.locator('.cp-stats-percentage').allTextContents(), ['50.0%', '29.3%', '20.7%', '100.0%', '78.1%', '100.0%']);
            assert.deepEqual(await page.locator('.cp-stats-board').first().locator('.cp-stats-rank').allTextContents(), ['1', '2', '3']);
            assert.deepEqual(await page.locator('.cp-stats-contribution span').evaluateAll(nodes => nodes.map(node => node.style.width)), ['50%', '29.3%', '20.7%', '100%', '78.1%', '100%']);
            assert.equal(await page.locator('.cp-stats-board').evaluateAll(boards => boards.every(board => {
                const rows = Array.from(board.querySelectorAll('.cp-stats-entry'));
                return rows.every(row => {
                    const score = row.querySelector('.cp-stats-score'), percentage = row.querySelector('.cp-stats-percentage');
                    return getComputedStyle(score).textAlign === 'right' && getComputedStyle(percentage).textAlign === 'right' &&
                        score.getBoundingClientRect().right <= percentage.getBoundingClientRect().left && row.scrollWidth <= row.clientWidth &&
                        Math.abs(percentage.getBoundingClientRect().right - rows[0].querySelector('.cp-stats-percentage').getBoundingClientRect().right) < 1;
                });
            })), true);
            assert.equal(await page.locator('#cp-statistics img').count(), 0);
            assert.equal((await page.locator('#cp-statistics-heading').textContent()).trim(), 'Statistics');
            assert.deepEqual(await page.locator('.cp-stats-board h3').evaluateAll(nodes => nodes.map(node => node.textContent.replace(/\s+/g, ' ').trim())), ['Builders Created by', 'Destroyers Created by', 'Expansions Update sets', 'Demolitions Update sets']);
            assert.equal(await page.locator('.cp-stats-board h3').first().evaluate(node => getComputedStyle(node).fontWeight), '600');
            const makeover = page.locator('.cp-stats-facts dd').last();
            await makeover.locator('a').evaluate(node => node.textContent = 'Credit+ Test ct20261014a - ' + 'Biggest update set '.repeat(8));
            assert.equal(await makeover.locator('a').evaluate(node => getComputedStyle(node).whiteSpace), 'normal');
            assert.equal(await makeover.evaluate(node => node.scrollWidth <= node.clientWidth), true);
            assert.equal(await makeover.locator('a').evaluate(node => node.getBoundingClientRect().height > parseFloat(getComputedStyle(node).fontSize) * 2), true);
            assert.equal(await page.locator('.cp-stats-skeleton').count(), 0);
            assert.equal(await page.locator('#cp-statistics .cp-stats-icon').count(), 12);
            assert.equal(await page.locator('.cp-stat-card').evaluateAll(cards => cards.every(card => {
                const value = card.querySelector('dd').getBoundingClientRect(), label = card.querySelector('dt').getBoundingClientRect(), icon = card.querySelector('.cp-stats-icon').getBoundingClientRect(), box = card.getBoundingClientRect();
                return value.bottom <= label.top + 1 && icon.left >= value.right && icon.left >= label.right && Math.abs((icon.top + icon.bottom) / 2 - (box.top + box.bottom) / 2) < 1 && card.scrollWidth <= card.clientWidth && parseFloat(getComputedStyle(card).minHeight) >= 122;
            })), true, 'Panel values sit above labels with larger icons to the right, without overlap');
            assert.equal(await page.locator('.cp-stats-board-title, #cp-statistics h2').evaluateAll(nodes => nodes.every(node => node.lastElementChild.matches('.cp-stats-icon') && getComputedStyle(node.lastElementChild).width === parseFloat(getComputedStyle(node).fontSize) * 1.25 + 'px')), true);
            assert.equal(await page.locator('.cp-stats-board-group').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display === 'block' && parseFloat(getComputedStyle(node).fontSize) < parseFloat(getComputedStyle(node.parentElement).fontSize))), true);
            for (const [background, foreground] of [['255,255,255', '29,29,29'], ['6,7,8', '235,235,235']]) {
                for (const brand of ['80,82,189', '255,255,255', '0,0,0']) {
                    const contrasts = await page.evaluate(({ background, foreground, brand }) => {
                        const style = document.documentElement.style;
                        style.setProperty('--now-color_background--primary', background);
                        style.setProperty('--now-color_background--secondary', background);
                        style.setProperty('--now-color_text--primary', foreground);
                        style.setProperty('--now-color_text--secondary', foreground);
                        style.setProperty('--now-color--primary-1', brand);
                        const context = document.createElement('canvas').getContext('2d');
                        function rgb(colour) {
                            context.fillStyle = colour; context.fillRect(0, 0, 1, 1);
                            return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
                        }
                        function luminance(channels) {
                            return channels.map(channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
                        }
                        return Array.from(document.querySelectorAll('.cp-stats-icon')).map(icon => {
                            const colour = luminance(rgb(getComputedStyle(icon).color));
                            const backdrop = luminance(rgb(getComputedStyle(icon.closest('.cp-stat-card, .cp-stats-board') || document.getElementById('cp-statistics')).backgroundColor));
                            return (Math.max(colour, backdrop) + 0.05) / (Math.min(colour, backdrop) + 0.05);
                        });
                    }, { background, foreground, brand });
                    assert.equal(contrasts.every(contrast => contrast >= 3), true, 'Icons retain at least 3:1 contrast in each theme, even with extreme brand colours');
                }
            }
            await page.evaluate(() => ['--now-color_background--primary', '--now-color_background--secondary', '--now-color_text--primary', '--now-color_text--secondary', '--now-color--primary-1'].forEach(name => document.documentElement.style.removeProperty(name)));
            assert.match(await page.locator('.cp-stats-facts').textContent(), /42 days/);
            assert.equal(await page.locator('.cp-stats-note').count(), 0);
            assert.deepEqual(await page.locator('.cp-stats-board').first().locator('.cp-stats-medal').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color)), ['rgb(185, 134, 0)', 'rgb(125, 135, 145)', 'rgb(174, 116, 59)']);
            assert.match(await page.locator('.cp-stats-facts').textContent(), /Age/);
            assert.match(await page.locator('.cp-stats-facts').textContent(), /Biggest makeover/);
            const links = page.locator('#cp-statistics-content a');
            assert.equal(await links.count(), 6);
            assert.deepEqual(await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), [
                '/nav_to.do?uri=' + encodeURIComponent('sys_user.do?sys_id=' + '3'.repeat(32)),
                '/nav_to.do?uri=' + encodeURIComponent('sys_update_set.do?sys_id=' + '1'.repeat(32)),
                '/nav_to.do?uri=' + encodeURIComponent('sys_user.do?sys_id=' + '4'.repeat(32)),
                '/nav_to.do?uri=' + encodeURIComponent('sys_user.do?sys_id=' + '4'.repeat(32)),
                '/nav_to.do?uri=' + encodeURIComponent('sys_update_set.do?sys_id=' + '1'.repeat(32)),
                '/nav_to.do?uri=' + encodeURIComponent('sys_remote_update_set.do?sys_id=' + '2'.repeat(32))
            ]);
            assert.equal(await links.evaluateAll(nodes => nodes.every(node => !node.hasAttribute('target'))), true);
            assert.equal(await page.locator('#cp-statistics [title], #cp-statistics .icon-open-document-new-tab').count(), 0);
            assert.equal(await page.locator('.cp-stats-board').first().locator('li .cp-stats-name').first().textContent(), '<img src=x onerror=alert(1)>');
            assert.equal(await page.locator('#cp-statistics a .cp-stats-medal').count(), 0);
            const rankedUser = page.locator('.cp-stats-board').first().locator('li').nth(1);
            await rankedUser.locator('a').hover();
            assert.equal(await rankedUser.locator('.cp-stats-medal').evaluate(node => getComputedStyle(node).textDecorationLine), 'none');
            assert.equal(await rankedUser.locator('.cp-stats-medal').evaluate(node => parseFloat(getComputedStyle(node).fontSize) > parseFloat(getComputedStyle(node.previousElementSibling).fontSize)), true);
            assert.equal(await page.locator('#cp-statistics').evaluate(node => node.scrollWidth <= node.clientWidth), true);
            await button.press('Enter'); await settle(page);
            assert.equal(await page.locator('#cp-statistics-container').evaluate(node => node.open), false);
            await button.press('Space'); await settle(page);
            assert.equal(await page.locator('#cp-statistics-container').evaluate(node => node.open), true);
            assert.equal(await page.evaluate(() => window.statsRequests.length), 1);
            await page.screenshot({ path: '/tmp/credit-statistics-' + width + '.png', fullPage: true });
            await chooseSet(page, original);
            assert.equal(await page.locator('#cp-statistics').isVisible(), false);
            await button.click();
            assert.equal(await page.evaluate(() => window.statsRequests[1].params.sysparm_update), original);
            await settle(page);
            await chooseSet(page, update);
            await page.evaluate(() => window.statsRequests[1].callback(JSON.stringify(window.statsFixture)));
            await settle(page);
            assert.equal((await page.locator('#cp-statistics-content').textContent()).trim(), '');
            await button.click();
            await page.evaluate(() => window.statsRequests[2].callback(JSON.stringify({ success: false, error: 'History unavailable.' })));
            await settle(page);
            assert.equal(await page.locator('#cp-statistics-status').textContent(), 'History unavailable.');
            assert.equal(await page.getByRole('button', { name: 'Retry statistics' }).count(), 0);
            await button.click(); await button.click();
            await page.evaluate(() => window.statsRequests[3].callback(JSON.stringify(window.statsFixture)));
            await settle(page);
            assert.equal(await page.locator('.cp-stats-board').count(), 4);
            await chooseSet(page, original);
            await button.click();
            await page.evaluate(() => window.statsRequests[4].callback(JSON.stringify({ ...window.statsFixture, added: 0, removed: 0, creators: [{ name: 'No additions', added: 0 }], destroyers: [{ name: 'No removals', removed: 0 }], creatorSets: [], destroyerSets: [] })));
            await settle(page);
            assert.equal(await page.locator('.cp-stats-percentage, .cp-stats-medal').count(), 0);
            assert.deepEqual(await page.locator('.cp-stats-board p').allTextContents(), ['No additions', 'No removals', 'No additions', 'No removals']);
            await page.close();
        }
    } finally { await browser.close(); }
});

test('people leaderboards show photos and consistent coloured initials with safe image fallbacks in both themes', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const [width, background, foreground] of [[1280, '255 255 255', '29 29 29'], [390, '24 26 30', '235 235 235']]) {
            const page = await browser.newPage(); await initialise(page, width);
            await page.route('**/*.iix?t=medium', route => route.request().url().includes('1'.repeat(32))
                ? route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') })
                : route.fulfill({ status: 404, body: 'Missing photo' }));
            await page.evaluate(({ background, foreground }) => {
                document.documentElement.style.setProperty('--now-color_background--primary', background);
                document.documentElement.style.setProperty('--now-color_text--primary', foreground);
                const people = [{ name: 'Alice', photo: '1'.repeat(32) }, { name: 'Bob' }, { name: 'Carol', photo: '2'.repeat(32) }, { name: '<img src=x>', photo: 'https://other.test/photo.png' }, ...Array.from({ length: 16 }, (_, i) => ({ name: 'User' + i }))].map(person => ({ ...person, added: 1, removed: 1 }));
                window.nextAnswer = { success: true, ageDays: 1, founder: 'Alice', updateSetCount: 1, contributorCount: people.length, added: people.length, removed: people.length,
                    creators: people, destroyers: people.map(person => ({ ...person, name: person.name.toUpperCase() })), creatorSets: [{ name: 'A release', added: people.length }], destroyerSets: [] };
            }, { background, foreground });
            await page.getByRole('button', { name: 'Statistics', exact: true }).click(); await settle(page);
            await page.waitForFunction(() => document.querySelectorAll('.cp-stats-board .cp-avatar img').length === 2 && Array.from(document.querySelectorAll('.cp-stats-board .cp-avatar img')).every(img => img.naturalWidth > 0));
            const boards = page.locator('.cp-stats-board');
            assert.equal(await boards.nth(0).locator('.cp-avatar').count(), 20);
            assert.equal(await boards.nth(1).locator('.cp-avatar').count(), 20);
            assert.equal(await boards.nth(2).locator('.cp-avatar').count(), 0);
            assert.deepEqual(await boards.nth(0).locator('.cp-avatar').allTextContents(), ['A', 'B', 'C', '<', ...Array(16).fill('U')]);
            assert.equal(await boards.nth(0).locator('.cp-avatar').nth(3).locator('img').count(), 0, 'External image URLs are rejected');
            assert.equal(await boards.nth(0).locator('.cp-avatar').nth(2).locator('img').count(), 0, 'Broken photos fall back to initials');
            assert.equal(await boards.locator('.cp-avatar').evaluateAll(nodes => nodes.every(node => node.getAttribute('aria-hidden') === 'true' && node.nextElementSibling.matches('.cp-stats-name'))), true);
            const colours = await boards.nth(0).locator('.cp-avatar').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
            assert.deepEqual(await boards.nth(1).locator('.cp-avatar').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor)), colours, 'Username casing does not change avatar colours');
            assert.ok(new Set(colours).size > 4);
            assert.equal(await boards.locator('.cp-avatar').evaluateAll(nodes => nodes.every(node => {
                const channels = getComputedStyle(node).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
                const luminance = channels.map(channel => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
                return getComputedStyle(node).color === 'rgb(255, 255, 255)' && 1.05 / (luminance + 0.05) >= 4.5;
            })), true, 'Every initial has at least 4.5:1 contrast on its coloured background');
            assert.equal(await page.locator('#cp-statistics').evaluate(node => node.scrollWidth <= node.clientWidth), true);
            await page.getByRole('button', { name: 'Statistics', exact: true }).click();
            await page.getByRole('button', { name: 'Statistics', exact: true }).click();
            assert.deepEqual(await boards.nth(0).locator('.cp-avatar').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor)), colours);
            await page.close();
        }
    } finally { await browser.close(); }
});

test('statistics timeout stays visible and reopening discards the expired response', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page);
        await page.evaluate(() => {
            const originalTimeout = window.setTimeout;
            window.setTimeout = (callback, delay) => { if (delay === 180000) { window.expireStats = callback; return 0; } return originalTimeout(callback, delay); };
            window.statsCallbacks = [];
            window.GlideAjax = function () { this.addParam = () => {}; this.getXMLAnswer = callback => window.statsCallbacks.push(callback); };
        });
        await page.getByRole('button', { name: 'Statistics', exact: true }).click();
        await page.evaluate(() => window.expireStats());
        await settle(page);
        assert.match(await page.locator('#cp-statistics-status').textContent(), /timed out/);
        assert.equal(await page.locator('.cp-stats-skeleton').count(), 0);
        await page.evaluate(() => window.statsCallbacks[0](JSON.stringify({success:false,error:'Stale error'})));
        await settle(page);
        assert.match(await page.locator('#cp-statistics-status').textContent(), /timed out/);
        assert.equal(await page.locator('.cp-stats-skeleton').count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Retry statistics' }).count(), 0);
        const statistics = page.getByRole('button', { name: 'Statistics', exact: true });
        await statistics.click(); await statistics.click();
        await page.evaluate(() => window.statsCallbacks[1]('not JSON'));
        await settle(page);
        assert.equal(await page.locator('#cp-statistics-status').textContent(), 'Statistics could not be loaded.');
    } finally { await browser.close(); }
});


test('statistics age retains readable values and distinguishes unknown ages with an icon', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page);
        for (const ageDays of [null, 0, 89, 90, 364, 365, 999, 1000]) {
            await page.locator('#cp-retry').click();
            await page.evaluate(ageDays => window.nextAnswer = { success: true, ageDays, founder: '', created: '', updateSetCount: 0, contributorCount: 0, added: 0, removed: 0, creators: [], destroyers: [], creatorSets: [], destroyerSets: [] }, ageDays);
            await page.getByRole('button', { name: 'Statistics', exact: true }).click();
            assert.equal((await page.locator('.cp-stats-facts dt').first().textContent()).trim(), 'Age');
            assert.equal(await page.locator('.cp-stats-facts dd').first().textContent(), ageDays === null ? 'Unknown' : ageDays.toLocaleString() + ' days');
            assert.match(await page.locator('.cp-stats-facts dt .cp-stats-icon').first().getAttribute('class'), ageDays === null ? /fa-question-circle/ : /fa-clock-o/);
        }
    } finally { await browser.close(); }
});


test('field loading keeps the Monaco headings, splitter and column widths through completion', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage(); await initialise(page, width, true);
            await page.evaluate(() => {
                window.GlideAjax = function () { this.addParam = () => {}; this.getXMLAnswer = callback => window.fieldResponse = callback; };
            });
            const section = page.locator('.cp-field-section[data-field="script"]');
            await section.locator('summary').click();
            await page.waitForFunction(() => window.fieldResponse);
            const dimensions = () => section.locator('.cp-code-headings, .cp-gutter-head span, .cp-code-heading, .cp-code-body, .cp-splitter').evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return { width: rect.width, left: rect.left }; }));
            assert.equal(await part(section, 'cp-table-fallback').isVisible(), false);
            assert.equal(await part(section, 'cp-code-view').isVisible(), true);
            assert.equal(await part(section, 'cp-code-loading').isVisible(), true);
            await part(section, 'cp-splitter').focus(); await page.keyboard.press('ArrowRight');
            const before = await dimensions();
            await section.locator('summary').click(); await section.locator('summary').click();
            assert.equal(await part(section, 'cp-table-fallback').isVisible(), false);
            await page.evaluate(fixture => window.fieldResponse(JSON.stringify(fixture)), fixture);
            assert.equal(await part(section, 'cp-code-loading').isVisible(), false);
            assert.equal(await part(section, 'cp-code-view').isVisible(), true);
            assert.deepEqual(await dimensions(), before);
            assert.equal(await part(section, 'cp-table-fallback').isVisible(), false);
            await page.screenshot({ path: '/tmp/credit-stable-field-' + width + '.png', fullPage: true });
            await page.close();
        }
    } finally { await browser.close(); }
});

test('AngularJS owns field lifecycles and disposes scopes and editors on reload and teardown', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page, 1280, true);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        const watchers = await page.evaluate(() => angular.element(document.getElementById('credit-plus')).injector().get('$rootScope').$$watchersCount);
        for (let i = 0; i < 3; i++) {
            await openField(page);
            await page.evaluate(() => window.oldFieldScope = angular.element(document.querySelector('.cp-field-section')).scope());
            await page.locator('#cp-retry').click(); await settle(page);
            assert.equal(await page.evaluate(() => window.oldFieldScope.$$destroyed), true);
            assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
            assert.equal(await page.evaluate(() => angular.element(document.getElementById('credit-plus')).injector().get('$rootScope').$$watchersCount), watchers);
        }
        await openField(page);
        await page.evaluate(() => {
            const Ajax = window.GlideAjax;
            window.GlideAjax = function () {
                const ajax = new Ajax(); let name;
                this.addParam = (key, value) => { if (key === 'sysparm_name') name = value; ajax.addParam(key, value); };
                this.getXMLAnswer = callback => name === 'getStatistics' ? window.lateStatistics = callback : ajax.getXMLAnswer(callback);
            };
        });
        await page.getByRole('button', { name: 'Statistics', exact: true }).click();
        await page.evaluate(() => {
            const scope = angular.element(document.getElementById('credit-plus')).scope();
            scope.$destroy();
            window.lateStatistics(JSON.stringify({ success: false, error: 'Late response' }));
            window.dispatchEvent(new Event('resize'));
            window.dispatchEvent(new Event('pageshow'));
        });
        assert.equal(await page.evaluate(() => window.disposedCreditEditors), 4);
        assert.equal(await page.evaluate(() => window.createdModels.length), await page.evaluate(() => window.disposedModels));
        assert.equal(await page.locator('#cp-context-menu').count(), 0);
        assert.deepEqual(errors, []);
    } finally { await browser.close(); }
});

test('expanding a field scrolls only after its editor is ready and ignores collapsed pending fields', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page, 1280, true);
        await page.evaluate(() => {
            window.scrolls = []; window.pendingFields = [];
            const scroll = Element.prototype.scrollIntoView;
            Element.prototype.scrollIntoView = function (options) {
                if (this.matches('.cp-field-section summary')) window.scrolls.push({ field: this.closest('details').dataset.field, editors: window.creditOptions.length, behavior: options.behavior });
                scroll.call(this, options);
            };
            window.GlideAjax = function () {
                let method;
                this.addParam = (key, value) => { if (key === 'sysparm_name') method = value; };
                this.getXMLAnswer = callback => method === 'getContributors' ? callback('{"success":true,"contributors":{}}') : window.pendingFields.push(callback);
            };
        });
        const script = page.locator('.cp-field-section[data-field="script"]');
        await script.locator('summary').click();
        await page.waitForFunction(() => window.pendingFields.length === 1);
        await page.evaluate(() => new Promise(requestAnimationFrame));
        assert.deepEqual(await page.evaluate(() => window.scrolls), []);
        await page.evaluate(fixture => window.pendingFields[0](JSON.stringify(fixture)), fixture);
        await page.waitForFunction(() => window.scrolls.length === 1);
        assert.deepEqual(await page.evaluate(() => window.scrolls), [{ field: 'script', editors: 1, behavior: 'smooth' }]);
        const template = page.locator('.cp-field-section[data-field="template"]');
        await template.locator('summary').click();
        await page.waitForFunction(() => window.pendingFields.length === 2);
        await template.locator('summary').click();
        await page.evaluate(fixture => window.pendingFields[1](JSON.stringify(fixture)), fixture);
        await settle(page);
        await page.evaluate(() => new Promise(requestAnimationFrame));
        assert.equal(await page.evaluate(() => window.scrolls.length), 1);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await template.locator('summary').click();
        await page.waitForFunction(() => window.scrolls.length === 2);
        assert.deepEqual(await page.evaluate(() => window.scrolls[1]), { field: 'template', editors: 2, behavior: 'auto' });
        assert.equal(await page.evaluate(() => window.pendingFields.length), 2);
    } finally { await browser.close(); }
});

test('dragging the shared splitter resizes grouped attribution and keeps its header aligned', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1920, 1280, 390]) {
            const page = await browser.newPage(); await initialise(page, width, true);
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.evaluate(() => {
                window.fixture.updates[1].author = 'A developer with a very long display name';
                window.fixture.updates[1].updateSet.name = 'A very long update set name that must never dictate the column width';
            });
            await openField(page);
            const section = await openField(page, 'template');
            const widths = () => page.locator('.cp-attribution tr:first-child td:not(.cp-time)').evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width));
            const before = await widths();
            const splitter = part(section, 'cp-splitter');
            const handle = await splitter.boundingBox(), body = await section.locator('.cp-code-body').boundingBox();
            await page.mouse.move(handle.x + handle.width / 2, handle.y + 20);
            await page.mouse.down();
            await page.mouse.move(body.x + body.width * 0.15, handle.y + 20, { steps: 8 });
            await page.mouse.up();
            const after = await widths();
            assert.equal(after.length, 2);
            after.forEach((size, index) => assert.ok(size < before[index] * 0.6, 'Every column shrinks with the pane'));
            assert.equal(await splitter.getAttribute('aria-valuenow'), '15');
            assert.equal(await page.locator('.cp-splitter[aria-valuenow="15"]').count(), fixture.fields.length);
            for (const field of ['script', 'template']) {
                const current = page.locator('.cp-field-section[data-field="' + field + '"]');
                const columns = await current.evaluate(section => {
                    const headers = [section.querySelector('.cp-gutter-head')];
                    const cells = [...section.querySelectorAll('.cp-attribution tr:first-child td')].filter(node => getComputedStyle(node).display !== 'none');
                    return cells.map((cell, index) => ({ left: cell.getBoundingClientRect().left - headers[index].getBoundingClientRect().left, width: cell.getBoundingClientRect().width - headers[index].getBoundingClientRect().width }));
                });
                columns.forEach(column => { assert.ok(Math.abs(column.left) < 1); assert.ok(Math.abs(column.width) <= 1, JSON.stringify(column)); });
                assert.equal(await current.locator('.cp-attribution .cp-update-set .cp-cell-text').first().evaluate(node => getComputedStyle(node).textOverflow), 'ellipsis');
            }
            await splitter.focus(); await page.keyboard.press('Home');
            assert.equal(await splitter.getAttribute('aria-valuenow'), '10');
            await page.keyboard.press('End');
            const cards = await page.locator('.cp-attribution-block').evaluateAll(nodes => nodes.map(node => ({
                overflow: node.scrollWidth > node.clientWidth,
                author: node.querySelector('.cp-author').getBoundingClientRect().top,
                meta: node.querySelector('.cp-attribution-meta').getBoundingClientRect().top,
            })));
            assert.equal(cards.every(card => !card.overflow && card.meta > card.author), true);
            await page.close();
        }
    } finally { await browser.close(); }
});

test('Statistics scrolls smoothly after opening, never on closing, and respects reduced motion', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page);
        await page.evaluate(() => {
            window.statisticsScrolls = [];
            const panel = document.getElementById('cp-statistics-container'), scroll = panel.scrollIntoView;
            panel.scrollIntoView = function (options) {
                window.statisticsScrolls.push({ behavior: options.behavior, visible: panel.open && getComputedStyle(panel).display !== 'none' });
                scroll.call(panel, options);
            };
            window.GlideAjax = function () { this.addParam = () => {}; this.getXMLAnswer = () => {}; };
        });
        const button = page.getByRole('button', { name: 'Statistics', exact: true });
        await button.click();
        await page.waitForFunction(() => statisticsScrolls.length === 1);
        assert.deepEqual(await page.evaluate(() => statisticsScrolls), [{ behavior: 'smooth', visible: true }]);
        await button.click();
        await page.evaluate(() => new Promise(requestAnimationFrame));
        assert.equal(await page.evaluate(() => statisticsScrolls.length), 1);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await button.click();
        await page.waitForFunction(() => statisticsScrolls.length === 2);
        assert.deepEqual(await page.evaluate(() => statisticsScrolls[1]), { behavior: 'auto', visible: true });
    } finally { await browser.close(); }
});

test('statistics batches merge users and set IDs, reset the timeout and discard stale continuations', async () => {
    const browser = await chromium.launch({headless:true});
    try {
        const page = await browser.newPage(); await initialise(page);
        await page.evaluate(() => {
            const Ajax = window.GlideAjax;
            window.statsBatches = [];
            window.GlideAjax = function (name) {
                const original = new Ajax(name), params = {};
                this.addParam = (key,value) => { params[key]=value; original.addParam(key,value); };
                this.getXMLAnswer = callback => params.sysparm_name === 'getStatistics'
                    ? window.statsBatches.push({params,callback}) : original.getXMLAnswer(callback);
            };
            const set = {id:'1'.repeat(32),table:'sys_update_set',name:'Same name'};
            window.batch = {success:true,ageDays:10,founder:'Ada',founderUserId:'2'.repeat(32),updateSetCount:1,
                contributorCount:1,added:3,removed:1,gaps:0,partial:false,
                creators:[{name:'Ada',userId:'2'.repeat(32),added:3,removed:1}],
                creatorSets:[{key:'set-1',name:'Same name',updateSet:set,added:3,removed:1}],
                fieldTotals:[{name:'Script',added:3,removed:1}],nextCursor:'1',historyKey:'stable'};
        });
        await page.getByRole('button',{name:'Statistics',exact:true}).click();
        await page.evaluate(() => window.statsBatches[0].callback(JSON.stringify(window.batch)));
        await settle(page);
        assert.equal(await page.evaluate(() => window.statsBatches.length),2);
        assert.equal(await page.evaluate(() => window.statsBatches[1].params.sysparm_cursor),'1');
        assert.equal(await page.evaluate(() => window.statsBatches[1].params.sysparm_history_key),'stable');
        await page.evaluate(() => window.statsBatches[1].callback(JSON.stringify({...window.batch,added:2,removed:0,
            creators:[{...window.batch.creators[0],name:'ADA',added:2,removed:0}],
            creatorSets:[{...window.batch.creatorSets[0],added:2,removed:0}],fieldTotals:[{name:'Script',added:2,removed:0}],nextCursor:''})));
        await settle(page);
        assert.equal(await page.locator('.cp-stats-board').first().locator('li').count(),1);
        assert.match(await page.locator('.cp-stats-board').first().textContent(),/5 lines/);
        assert.match(await page.locator('.cp-stats-board').nth(1).textContent(),/1 lines/);
        assert.equal(await page.locator('.cp-stats-skeleton').count(),0);
        await chooseSet(page,original);
        await page.getByRole('button',{name:'Statistics',exact:true}).click();
        await page.evaluate(() => window.statsBatches[2].callback(JSON.stringify(window.batch)));
        await settle(page);
        const calls = await page.evaluate(() => window.statsBatches.length);
        await chooseSet(page,update);
        await page.evaluate(() => window.statsBatches.at(-1).callback(JSON.stringify(window.batch)));
        await settle(page);
        assert.equal(await page.evaluate(() => window.statsBatches.length),calls);
        assert.equal(await page.locator('#cp-statistics').isVisible(),false);
    } finally { await browser.close(); }
});

test('real browser workers stream field and statistics batches without server-computed results', async () => {
    const browser = await chromium.launch({headless:true});
    try {
        const page = await browser.newPage(); await initialise(page,1280,true);
        const workerSource = fs.readFileSync('src/fluent/generated/client-development/ui-script/widget_editor_credit_worker.js','utf8');
        await page.route('**/widget_editor_credit_worker.jsdbx?*', route=>route.fulfill({contentType:'application/javascript',body:workerSource}));
        await page.evaluate(() => {
            const NativeWorker=window.Worker; window.workerStarts=0; window.workerStops=0;
            window.Worker=function(url){window.workerStarts++;const worker=new NativeWorker(url),stop=worker.terminate.bind(worker);worker.terminate=()=>{window.workerStops++;stop();};return worker;};
            window.GlideAjax=function(){const params={};this.addParam=(k,v)=>params[k]=v;this.getXMLAnswer=callback=>{
                window.calls.push({params});
                const index=Number(params.sysparm_cursor),snapshot=window.fixture.updates[index];
                const batch={...window.fixture,field:'script',snapshots:[{...snapshot,values:{script:index?'one();\nthree();':'one();\ntwo();'}}],limits:{max_lines:50000,diff_work:20000000},historyKey:'stable',nextCursor:index?'':'1'};
                if(params.sysparm_name==='getStatistics')Object.assign(batch,{founder:'Founder',founderUserId:'',ageDays:3,updateSetCount:2,unknownSetCount:0,fields:[{name:'script',label:'Server script'}],fieldTotals:[{name:'Server script',added:0,removed:0}],creators:[{name:snapshot.author,added:0,removed:0}],added:0,removed:0,gaps:0,partial:false});
                callback(JSON.stringify(batch));
            };};
        });
        const field=await openField(page);
        await page.waitForFunction(()=>window.workerStops===1);
        assert.equal(await part(field,'cp-attribution').locator('tr').count(),2);
        assert.deepEqual(await part(field,'cp-attribution').locator('.cp-origin .cp-author .cp-cell-text').allTextContents(),['Earlier author','Developer']);
        assert.equal(await page.evaluate(()=>window.creditOptions.length),1);
        await page.getByRole('button',{name:'Statistics',exact:true}).click();
        await page.waitForFunction(()=>window.workerStops===2);
        assert.deepEqual(await page.locator('.cp-stats-facts dd').allTextContents(),['3 days','2','Founder','2','30 days','3','1','Server script','Imported release','September 2026']);
        assert.equal(await page.evaluate(()=>window.workerStarts),2);
        assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.params.sysparm_snapshots==='true').length),4);
        assert.equal(await page.locator('#cp-statistics-status').textContent(),'');
    } finally {await browser.close();}
});

test('unavailable worker shows a retryable field error instead of blocking the main thread', async () => {
    const browser=await chromium.launch({headless:true});
    try {
        const page=await browser.newPage();await initialise(page);
        await page.route('**/widget_editor_credit_worker.jsdbx?*',route=>route.fulfill({status:404,body:'Unavailable'}));
        await page.evaluate(()=>window.nextAnswer={success:true,snapshots:[],limits:{max_lines:50000,diff_work:20000000}});
        const field=page.locator('.cp-field-section[data-field=script]');
        await field.locator('summary.da-summary').click();
        await page.waitForFunction(() => document.querySelector('.cp-field-section[data-field=script] [id$="-code-status"]').classList.contains('alert-danger'));
        assert.equal(await part(field,'cp-field-retry').count(), 0);
        assert.match(await part(field,'cp-code-status').textContent(),/browser worker could not load/);
        assert.equal(await page.getByRole('button',{name:'Statistics',exact:true}).isEnabled(),true);
    }finally{await browser.close();}
});

async function tableApiFixture(page, options = {}) {
    await initialise(page,1280,true);
    const entries = [original,update,'d'.repeat(32)].map((id,index)=>({
        sys_id:id, name:'sp_widget_'+fixture.record,sys_created_on:'2026-09-01 00:00:00',sys_updated_on:fixture.updateSets[index].time,
        sys_mod_count:'0',update_set:index===1?'':'e'.repeat(32),remote_update_set:index===1?'f'.repeat(32):'',
        payload:`<record_update table="sp_widget"><sp_widget action="INSERT_OR_UPDATE"><sys_id>${fixture.record}</sys_id><sys_updated_by>${fixture.updateSets[index].author}</sys_updated_by><sys_updated_on>${fixture.updateSets[index].time}</sys_updated_on><script><![CDATA[${index===1?'one();\nthree();':'one();\ntwo();'}]]></script><client_script><![CDATA[client();]]></client_script><template/><condition/></sp_widget><sys_app_file><script>Ignore companion record</script></sys_app_file></record_update>`
    }));
    if(options.count)for(let i=3;i<options.count;i++)entries.push({...entries[2],sys_id:i.toString(16).padStart(32,'0')});
    const manifest = {name:entries[0].name,key:'fixture-history',limits:{max_payload_chars:20000000,max_history_chars:100000000,max_lines:50000,diff_work:20000000},history:entries.map((row,index)=>({id:row.sys_id,orderTime:row.sys_updated_on,created:row.sys_created_on,revision:0,updateSetId:row.update_set,remoteUpdateSetId:row.remote_update_set,author:fixture.updateSets[Math.min(index,2)].author,time:row.sys_updated_on,updateSet:index===1?fixture.updates[1].updateSet:fixture.updates[0].updateSet}))};
    Object.assign(manifest.limits,options.limits||{});
    let calls = 0;
    await page.route('**/api/now/table/sys_update_xml?*',async route=>{
        calls++;
        if(options.respond)return options.respond(route,entries,calls);
        const url=new URL(route.request().url());
        assert.equal(url.searchParams.get('sysparm_display_value'),'false');
        const ids=url.searchParams.get('sysparm_query').split('^')[0].slice(8).split(',');
        await route.fulfill({contentType:'application/json',body:JSON.stringify({result:entries.filter(row=>ids.includes(row.sys_id))})});
    });
    await page.route('**/widget_editor_credit_worker.jsdbx?*',route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync('src/fluent/generated/client-development/ui-script/widget_editor_credit_worker.js','utf8')}));
    await page.evaluate(manifest=>{
        window.fixture.tableApi=manifest;
        window.GlideAjax=function(){const params={};this.addParam=(k,v)=>params[k]=v;this.getXMLAnswer=callback=>{
            if(params.sysparm_name==='savePreferences') { callback('{"success":true}'); return; }
            if(params.sysparm_name==='getContributors') { callback('{"success":true,"contributors":{}}'); return; }
            window.calls.push({params});
            if(params.sysparm_name==='getStatistics') {
                if(params.sysparm_context!=='true')throw new Error('Server must not calculate statistics');
                callback(JSON.stringify({success:true,historyKey:window.fixture.tableApi.key,founder:'Founder',founderUserId:'',ageDays:3,updateSetCount:2,unknownSetCount:0,fieldTotals:window.fixture.fields.map(f=>({name:f.label,added:0,removed:0})),creators:JSON.parse(params.sysparm_authors).map(name=>({name,added:0,removed:0})),added:0,removed:0,gaps:0,partial:false}));
            } else {
                if(params.sysparm_context!=='true')throw new Error('Server must not calculate fields or comparisons');
                callback(JSON.stringify({...window.fixture,selected:params.sysparm_update||window.fixture.selected}));
            }
        };};
    },manifest);
    await page.getByRole('button',{name:'Reload',exact:true}).click(); await settle(page);
    return {entries,manifest,calls:()=>calls};
}

test('Table API history populates collapsed line counts and is shared by fields, statistics, quick compare and update selection',async()=>{
    const browser=await chromium.launch({headless:true});
    try {
        const page=await browser.newPage(),api=await tableApiFixture(page);
        await page.waitForFunction(()=>document.querySelector('.cp-field-section[data-field="script"] .da-diff-counts').textContent==='2 lines');
        assert.equal(api.calls(),1);
        assert.deepEqual(await page.locator('.cp-field-section .da-diff-counts').allTextContents(),['2 lines','1 lines','0 lines','0 lines']);
        assert.equal(await page.locator('.cp-field-section[open]').count(),0);
        assert.equal(await page.evaluate(()=>window.creditOptions.length),0);
        assert.equal(await page.evaluate(()=>window.calls.some(c=>c.params.sysparm_name==='getStatistics')),false);
        await page.locator('.cp-field-section[data-field="script"] summary').click();
        await page.locator('.cp-field-section[data-field="client_script"] summary').click();
        await page.getByRole('button',{name:'Statistics',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.cp-stats-board li').length>0);
        const field=await openField(page);
        assert.equal(api.calls(),1);
        assert.deepEqual(await part(field,'cp-attribution').locator('.cp-origin .cp-author .cp-cell-text').allTextContents(),['Earlier author','Developer']);
        assert.deepEqual(await page.locator('.cp-stats-facts div').evaluateAll(nodes => nodes.filter(node => ['Update sets', 'Contributors', 'Lines created', 'Lines destroyed'].includes(node.querySelector('dt').textContent)).map(node => node.querySelector('dd').textContent)),['2','3','5','2']);
        await menuAction(page,setCell(field),'Quick compare');
        await page.waitForFunction(()=>!!window.lastModels);
        assert.equal(await page.evaluate(()=>window.lastModels.original.text),'one();\ntwo();');
        await chooseSet(page,'d'.repeat(32)); await openField(page);
        assert.equal(api.calls(),1,'another update set uses the same history cache');
        await page.getByRole('button',{name:'Statistics',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.cp-stats-board li').length>0);
        assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.params.sysparm_name==='getStatistics').length),1);
        await page.getByRole('button',{name:'Reload',exact:true}).click(); await openField(page);
        assert.equal(api.calls(),2,'Reload refetches history');
        await page.evaluate(()=>window.fixture.tableApi.key='changed');
        await chooseSet(page,original);await openField(page);
        assert.equal(api.calls(),3,'changed history invalidates the cache');
    }finally{await browser.close();}
});

test('Table API history batches beyond 100 records and reports denied access with a working retry',async()=>{
    const browser=await chromium.launch({headless:true});
    try {
        const page=await browser.newPage(); const api=await tableApiFixture(page,{count:101});
        await openField(page); assert.equal(api.calls(),2);
        const retryPage=await browser.newPage(); const denied=await tableApiFixture(retryPage,{respond:async(route,entries,n)=>route.fulfill({status:n<=2?403:200,contentType:'application/json',body:JSON.stringify(n<=2?{error:{message:'Access denied'}}:{result:entries})})});
        await retryPage.waitForFunction(()=>document.querySelector('#cp-status').textContent.includes('access was denied'));
        const field=retryPage.locator('.cp-field-section[data-field="script"]');await field.locator('summary').click();
        await retryPage.waitForFunction(() => document.querySelector('.cp-field-section[data-field=script] [id$="-code-status"]').classList.contains('alert-danger'));
        assert.equal(await part(field,'cp-field-retry').count(), 0);
        assert.match(await part(field,'cp-code-status').textContent(),/Table API access was denied/);
        await retryPage.getByRole('button', { name: 'Reload', exact: true }).click(); await openField(retryPage);
        assert.equal(denied.calls(),3);
    }finally{await browser.close();}
});

test('Table API rejects reassigned or wrong-record snapshots and tolerates unreadable history gaps',async()=>{
    const browser=await chromium.launch({headless:true});
    try {
        for(const mode of ['reassigned','wrong target','missing','doctype','malformed','duplicate']) {
            const page=await browser.newPage();
            await tableApiFixture(page,{respond:async(route,entries)=>{
                const rows=structuredClone(entries);
                if(mode==='reassigned')rows[0].update_set='9'.repeat(32);
                if(mode==='wrong target')rows[0].payload=rows[0].payload.replace(fixture.record,'9'.repeat(32));
                if(mode==='missing')rows.shift();
                if(mode==='doctype')rows[0].payload='<!DOCTYPE record_update>'+rows[0].payload;
                if(mode==='malformed')rows[0].payload='<record_update>';
                if(mode==='duplicate')rows[0].payload=rows[0].payload.replace('</sp_widget>','<script>duplicate</script></sp_widget>');
                await route.fulfill({contentType:'application/json',body:JSON.stringify({result:rows})});
            }});
            const field=page.locator('.cp-field-section[data-field="script"]');await field.locator('summary').click();
            if(['reassigned','wrong target'].includes(mode)) {
                await page.waitForFunction(() => document.querySelector('.cp-field-section[data-field=script] [id$="-code-status"]').classList.contains('alert-danger'));
                assert.equal(await part(field,'cp-field-retry').count(), 0);
                assert.match(await part(field,'cp-code-status').textContent(),/changed while loading|different records/);
            }else{
                await openField(page);assert.match(await part(field,'cp-code-status').textContent(),/snapshot interrupts attribution/);
            }
            await page.close();
        }
    }finally{await browser.close();}
});

test('bounded history retains selected code and refetches an evicted update when selected',async()=>{
    const browser=await chromium.launch({headless:true});
    try{
        const page=await browser.newPage(),api=await tableApiFixture(page,{limits:{max_history_chars:1}});
        const field=await openField(page);
        assert.equal(await part(field,'cp-attribution').locator('tr').count(),2);
        assert.match(await part(field,'cp-code-status').textContent(),/Attribution is partial/);
        await chooseSet(page,original);await openField(page);
        assert.equal(api.calls(),2);
        assert.equal(await page.evaluate(()=>window.creditOptions.at(-1).model.text),'one();\ntwo();');
    }finally{await browser.close();}
});

test('Reload cancels pending shared retrieval and late responses cannot replace current code',async()=>{
    const browser=await chromium.launch({headless:true});
    try{
        const page=await browser.newPage();let oldRoute;let announce;
        const requested=new Promise(resolve=>announce=resolve);
        const api=await tableApiFixture(page,{respond:async(route,entries,n)=>{
            if(n===1){oldRoute=route;announce();return;}
            await route.fulfill({contentType:'application/json',body:JSON.stringify({result:entries})});
        }});
        await page.locator('.cp-field-section[data-field="script"] summary').click();await requested;
        await page.getByRole('button',{name:'Reload',exact:true}).click();await openField(page);
        await oldRoute.fulfill({contentType:'application/json',body:'{"result":[]}'}).catch(()=>{});
        assert.equal(api.calls(),2);
        assert.equal(await page.evaluate(()=>window.creditOptions.at(-1).model.text),'one();\nthree();');
        assert.equal(await page.locator('.cp-field-section[data-field="script"] [id$="-field-retry"]').isVisible(),false);
    }finally{await browser.close();}
});

test('whitespace popover recalculates open fields and Statistics from the cache and preserves code',async()=>{
    const browser=await chromium.launch({headless:true});
    try{
        const page=await browser.newPage();
        const api=await tableApiFixture(page,{respond:async(route,entries)=>{
            const rows=structuredClone(entries);
            rows[1].payload=rows[1].payload.replace('one();\nthree();',' one();\ntwo( );  ');
            await route.fulfill({contentType:'application/json',body:JSON.stringify({result:rows})});
        }});
        const field=await openField(page);
        const authors=()=>part(field,'cp-attribution').locator('.cp-origin .cp-author .cp-cell-text').allTextContents();
        assert.deepEqual(await authors(),['Earlier author']);
        await page.getByRole('button',{name:'Statistics',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.cp-stats-board li').length>0);
        const totals=await page.locator('.cp-stats-facts dd').allTextContents();
        await page.getByRole('button',{name:'Whitespace settings',exact:true}).click();
        const popover=page.getByRole('dialog',{name:'Attribution and Statistics whitespace settings'});
        assert.equal(await popover.locator('input:checked').inputValue(),'all');
        await popover.getByLabel('Show all changes',{exact:true}).check();
        await openField(page);
        await page.waitForFunction(()=>document.querySelectorAll('.cp-stats-board li').length>0);
        assert.deepEqual(await authors(),['Developer']);
        assert.notDeepEqual(await page.locator('.cp-stats-facts dd').allTextContents(),totals);
        assert.equal(new URL(page.url()).searchParams.get('sysparm_whitespace'),'none');
        assert.equal(api.calls(),1);
        assert.equal(await page.evaluate(()=>window.creditOptions.at(-1).model.text),' one();\ntwo( );  ');
        assert.equal(await page.locator('.cp-field-section[open]').count(),1);
        // Opening a field can move focus away; reopen only when needed.
        if(!await popover.isVisible())await page.getByRole('button',{name:'Whitespace settings',exact:true}).click();
        await popover.getByLabel('Ignore whitespace when comparing lines',{exact:true}).check();
        await openField(page);
        assert.deepEqual(await authors(),['Earlier author']);
        assert.equal(new URL(page.url()).searchParams.has('sysparm_whitespace'),false);
        assert.equal(api.calls(),1);
        if(!await popover.isVisible())await page.getByRole('button',{name:'Whitespace settings',exact:true}).click();
        await page.keyboard.press('Escape');
        await popover.waitFor({state:'hidden'});
        assert.equal(await popover.isVisible(),false);
        assert.equal(await page.getByRole('button',{name:'Whitespace settings',exact:true}).evaluate(n=>n===document.activeElement),true);
        await page.setViewportSize({width:390,height:844});
        await page.getByRole('button',{name:'Whitespace settings',exact:true}).click();
        const box=await popover.boundingBox();assert.ok(box.x>=0 && box.x+box.width<=390);
        await page.locator('.dc-title').click();await settle(page);assert.equal(await popover.isVisible(),false);
    }finally{await browser.close();}
});

test('long leaderboards scroll independently with their headings fixed at the top',async()=>{
    const browser=await chromium.launch({headless:true});
    try{
        const page=await browser.newPage();await initialise(page);
        await page.evaluate(()=>{
            window.GlideAjax=function(){this.addParam=()=>{};this.getXMLAnswer=callback=>callback(JSON.stringify({success:true,ageDays:1,founder:'Ada',updateSetCount:100,contributorCount:100,added:100,removed:0,creators:Array.from({length:100},(_,i)=>({name:'Contributor '+i,added:100-i})),destroyers:[],creatorSets:[],destroyerSets:[]}));};
        });
        await page.getByRole('button',{name:'Statistics',exact:true}).click();await settle(page);
        const board=page.locator('.cp-stats-board').first();
        assert.equal(await board.locator('li').count(),100);
        assert.equal(await board.evaluate(n=>n.clientHeight<n.scrollHeight && n.getBoundingClientRect().height<=innerHeight*.375+1),true);
        await board.focus();await page.keyboard.press('End');
        await page.waitForFunction(()=>document.querySelector('.cp-stats-board').scrollTop>0);
        assert.equal(await board.evaluate(n=>Math.abs(n.querySelector('h3').getBoundingClientRect().top-n.getBoundingClientRect().top-1)<2),true);
        assert.equal(await page.locator('.cp-stats-board').nth(1).evaluate(n=>n.scrollTop),0);
    }finally{await browser.close();}
});


test('partial Table API statistics show available results without a partial notice or retry button', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await tableApiFixture(page, { limits: { max_history_chars: 1 } });
        await page.getByRole('button', { name: 'Statistics', exact: true }).click();
        await page.waitForFunction(() => document.querySelectorAll('.cp-stats-board h3').length === 4);
        assert.equal(await page.locator('.cp-stats-facts dd').count(), 8);
        assert.deepEqual(await page.locator('.cp-stats-facts div').evaluateAll(nodes => nodes.filter(node => ['Lines created', 'Lines destroyed'].includes(node.querySelector('dt').textContent)).map(node => node.querySelector('dd').textContent)), ['0', '0']);
        assert.equal(await page.locator('#cp-statistics-status').textContent(), '');
        assert.equal(await page.locator('#cp-statistics .alert-danger').count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Retry statistics' }).count(), 0);
    } finally { await browser.close(); }
});


test('missing fields stay disabled with an Unavailable label and enable again on another update set', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await tableApiFixture(page, { respond: async (route, entries) => {
            const rows = structuredClone(entries);
            rows[1].payload = rows[1].payload.replace('<client_script><![CDATA[client();]]></client_script>', '');
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: rows }) });
        } });
        const field = page.locator('.cp-field-section[data-field="client_script"]');
        const summary = field.locator('summary');
        await field.locator('.label.label-warning').waitFor();
        assert.equal(await field.locator('.label.label-warning').textContent(), 'Unavailable');
        assert.ok(await summary.evaluate(node => {
            const label = node.querySelector('.label');
            return Math.abs(node.getBoundingClientRect().right - parseFloat(getComputedStyle(node).paddingRight) - label.getBoundingClientRect().right) < 1;
        }), 'Unavailable label aligns with the right edge of the heading');
        assert.equal(await field.getAttribute('aria-disabled'), 'true');
        assert.equal(await summary.getAttribute('aria-disabled'), 'true');
        assert.equal(await summary.getAttribute('tabindex'), '-1');
        assert.equal(await summary.evaluate(node => getComputedStyle(node).cursor), 'not-allowed');
        await summary.evaluate(node => node.click());
        await summary.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');
        await field.evaluate(node => node.open = true);
        await page.waitForFunction(() => !document.querySelector('.cp-field-section[data-field="client_script"]').open);
        assert.equal(await page.getByRole('button', { name: 'Retry field' }).count(), 0);
        assert.equal(await page.evaluate(() => window.creditOptions.length), 0);
        const empty = page.locator('.cp-field-section[data-field=template]');
        assert.equal(await empty.getAttribute('aria-disabled'), 'true');
        assert.equal(await empty.evaluate(node => node.open), false);
        assert.equal(await empty.locator('.da-diff-counts').textContent(), '0 lines');
        assert.equal(await empty.locator('table').first().isVisible(), false);
        assert.equal(await empty.locator('.label').count(), 0);
        await chooseSet(page, original);
        assert.equal(await field.getAttribute('aria-disabled'), 'false');
        assert.equal(await field.locator('.label').count(), 0);
        assert.equal(await summary.getAttribute('tabindex'), '0');
        await openField(page, 'client_script');
        assert.equal(await page.evaluate(() => window.creditOptions.at(-1).model.text), 'client();');
    } finally { await browser.close(); }
});


test('zero-line fields close during loading, block expansion and enable only when an update has code', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        let finish;
        let announce;
        const requested = new Promise(resolve => announce = resolve);
        await tableApiFixture(page, { respond: (route, entries) => {
            const rows = structuredClone(entries);
            rows[0].payload = rows[0].payload.replace('<template/>', '<template><![CDATA[<p>Earlier code</p>]]></template>');
            finish = () => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: rows }) });
            announce();
        } });
        await requested;
        const field = page.locator('.cp-field-section[data-field=template]');
        const summary = field.locator('summary');
        await summary.click();
        assert.equal(await field.evaluate(node => node.open), true);
        await finish();
        await page.waitForFunction(() => document.querySelector('.cp-field-section[data-field=template]').getAttribute('aria-disabled') === 'true');
        assert.equal(await field.evaluate(node => node.open), false);
        assert.equal(await field.locator('.da-diff-counts').textContent(), '0 lines');
        assert.equal(await field.locator('.label').count(), 0);
        assert.equal(await summary.getAttribute('tabindex'), '-1');
        await summary.evaluate(node => node.click());
        await summary.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');
        await field.evaluate(node => node.open = true);
        await page.waitForFunction(() => !document.querySelector('.cp-field-section[data-field=template]').open);
        assert.equal(await field.locator('table').first().isVisible(), false);
        assert.equal(await page.evaluate(() => window.creditOptions.length), 0);
        await chooseSet(page, original);
        await openField(page, 'template');
        assert.equal(await page.evaluate(() => window.creditOptions.at(-1).model.text), '<p>Earlier code</p>');
        await chooseSet(page, update);
        assert.equal(await field.getAttribute('aria-disabled'), 'true');
        assert.equal(await field.evaluate(node => node.open), false);
        assert.equal(await field.locator('table').first().isVisible(), false);
        assert.equal(await page.evaluate(() => window.creditOptions.length), 1);
    } finally { await browser.close(); }
});


test('grouped attribution markers stay consistent across fields, themes and inline comparison', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page, 1280, true);
        await page.evaluate(() => {
            const [first, second] = window.fixture.updates;
            window.fixture.lines = [first.id, first.id, second.id, first.id].map((update, i) => ({ number: i + 1, text: 'line' + i + '();', update }));
        });
        const field = await openField(page);
        const markers = async section => part(section, 'cp-attribution').locator('.cp-origin').evaluateAll(cells => cells.map(cell => ({
            colour: getComputedStyle(cell).borderLeftColor, width: getComputedStyle(cell).borderLeftWidth,
            height: cell.getBoundingClientRect().height,
        })));
        const first = await markers(field);
        assert.equal(first.length, 3);
        assert.equal(first[0].colour, first[2].colour);
        assert.notEqual(first[0].colour, first[1].colour);
        assert.equal(first.every(marker => marker.width === '3px' && marker.height >= 48), true);
        const other = await openField(page, 'client_script');
        assert.deepEqual(await markers(other), first);
        await page.evaluate(() => document.documentElement.style.setProperty('--now-color_background--primary', '24 26 30'));
        assert.deepEqual(await markers(field), first);
        await menuAction(page, setCell(field), 'Quick compare');
        assert.deepEqual(await markers(field), first);
        await part(field, 'cp-diff-close').click();
        assert.deepEqual(await markers(field), first);
        await field.locator('summary').click(); await openField(page);
        assert.deepEqual(await markers(field), first);
    } finally { await browser.close(); }
});


function installActivityChart() {
    window.activityCharts = [];
    window.Chart = function (ctx) {
        this.Line = (data, options) => {
            const maximum = Math.max(1, ...data.datasets.flatMap(dataset => dataset.data));
            const chart = {
                data, options, chart: { ctx, width: ctx.canvas.width, height: ctx.canvas.height },
                scale: { xScalePaddingLeft: 50, xScalePaddingRight: 15, startPoint: 40, endPoint: 310, calculateX: index => 50 + index * 48, draw() {} },
                datasets: data.datasets.map(dataset => ({ points: dataset.data.map(value => ({ value, x: 0, y: 0 })) })),
                draw: () => chart.datasets.forEach(dataset => dataset.points.forEach((point, index) => {
                    point.x = chart.scale.calculateX(index);
                    point.y = chart.scale.endPoint - point.value / maximum * (chart.scale.endPoint - chart.scale.startPoint);
                })),
                destroy: () => { chart.destroyed = true; },
            };
            window.activityCharts.push(chart); return chart;
        };
    };
}

test('activity chart shows monthly churn, quiet spells, avatars and safe hover details with case-insensitive leaderboards', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await tableApiFixture(page, { respond: async (route, entries) => {
            const dates = ['2025-12-31 23:50:00', '2026-01-02 00:00:00', '2026-02-04 00:00:00'];
            const names = ['CaseUser', 'caseuser', 'CASEUSER'];
            const codes = ['one();\ntwo();', 'three();\nfour();', 'three();\nfour();\nfive();'];
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: entries.map((entry, index) => ({
                ...entry, payload: entry.payload.replace(/<sys_updated_on>.*?<\/sys_updated_on>/, '<sys_updated_on>' + dates[index] + '</sys_updated_on>')
                    .replace(/<sys_updated_by>.*?<\/sys_updated_by>/, '<sys_updated_by>' + names[index] + '</sys_updated_by>')
                    .replace(/<script><!\[CDATA\[[\s\S]*?\]\]><\/script>/, '<script><![CDATA[' + codes[index] + ']]></script>'),
            })) }) });
        } });
        await page.evaluate(installActivityChart);
        await page.route('**/*.iix?t=medium', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }));
        await page.evaluate(() => {
            const Ajax = window.GlideAjax;
            window.GlideAjax = function () {
                const ajax = new Ajax(); this.addParam = (key, value) => ajax.addParam(key, value);
                this.getXMLAnswer = callback => ajax.getXMLAnswer(answer => {
                    const result = JSON.parse(answer);
                    if (result.creators) result.creators.forEach(creator => { creator.name = 'CaseUser'; creator.photo = '1'.repeat(32); });
                    callback(JSON.stringify(result));
                });
            };
        });
        const button = page.getByRole('button', { name: 'Statistics', exact: true });
        await button.click();
        await page.waitForFunction(() => document.querySelectorAll('.cp-activity-avatar').length === 3);
        assert.deepEqual(await page.locator('.cp-stats-facts div').evaluateAll(nodes => Object.values(nodes.reduce((rows, node) => { const top = node.getBoundingClientRect().top; rows[top] = (rows[top] || 0) + 1; return rows; }, {}))), [5, 5]);
        assert.deepEqual(await page.locator('.cp-stats-facts dt').allTextContents(), ['Age', 'Update sets', 'Founder', 'Contributors', 'Longest quiet spell', 'Lines created', 'Lines destroyed', 'Busiest field', 'Biggest makeover', 'Busiest month']);
        const facts = await page.locator('.cp-stats-facts div').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.querySelector('dt').textContent, node.querySelector('dd').textContent])));
        assert.equal(Object.entries(facts).find(([label]) => label.startsWith('Busiest month'))[1], 'January 2026');
        assert.equal(Object.entries(facts).find(([label]) => label.startsWith('Longest quiet spell'))[1], '33 days');
        assert.equal(Object.entries(facts).find(([label]) => label.startsWith('Contributors'))[1], '1');
        assert.deepEqual(await page.locator('.cp-stats-board').first().locator('.cp-stats-name').allTextContents(), ['CaseUser']);
        assert.deepEqual(await page.evaluate(() => activityCharts.at(-1).data.datasets.map(dataset => dataset.data)), [[3, 2, 1], [0, 2, 0]]);
        assert.equal(await page.locator('.cp-activity').evaluate(node => node.compareDocumentPosition(document.querySelector('.cp-stats-boards')) & Node.DOCUMENT_POSITION_FOLLOWING), 4);
        const avatar = page.locator('.cp-activity-avatar').nth(1), tooltip = page.locator('.cp-activity-tooltip');
        await avatar.hover(); assert.equal(await tooltip.textContent(), 'Imported release');
        assert.equal(await page.locator('.cp-activity-hover').isVisible(), true);
        assert.equal(await avatar.evaluate(node => node.classList.contains('cp-activity-avatar-active')), true);
        await avatar.focus(); assert.equal(await tooltip.isVisible(), true);
        await page.keyboard.press('Escape'); assert.equal(await tooltip.isVisible(), false);
        assert.equal(await page.locator('.cp-activity-hover').isVisible(), false);
        await avatar.click(); assert.match(await tooltip.textContent(), /Imported release/);
        assert.match(await tooltip.textContent(), /\nCaseUser$/);
        assert.equal(await avatar.locator('img').getAttribute('src'), '/' + '1'.repeat(32) + '.iix?t=medium');
        assert.equal(await avatar.evaluate(node => node.style.backgroundColor), await page.locator('.cp-stats-board .cp-avatar').first().evaluate(node => node.style.backgroundColor), 'The chart and people leaderboards share the same user colour');
        await page.waitForFunction(() => document.querySelector('.cp-activity-avatar img')?.naturalWidth > 0);
        await avatar.locator('img').evaluate(image => image.dispatchEvent(new Event('error')));
        assert.equal(await avatar.locator('img').count(), 0); assert.equal(await avatar.textContent(), 'C');
        const dot = await page.evaluate(() => activityCharts.at(-1).datasets[0].points[1]);
        const canvas = await page.locator('.cp-activity canvas').boundingBox();
        await page.mouse.move(canvas.x + dot.x, canvas.y + dot.y);
        assert.match(await tooltip.textContent(), /Imported release\n2026-01-02.*\n2 additions, 2 removals/);
        await button.click(); await page.waitForFunction(() => activityCharts.at(-1).destroyed);
        await button.click(); await page.waitForFunction(() => !activityCharts.at(-1).destroyed);
        for (const theme of ['255 255 255', '24 26 30']) {
            await page.evaluate(theme => document.documentElement.style.setProperty('--now-color_background--primary', theme), theme);
            await page.setViewportSize({ width: 390, height: 850 });
            await page.waitForFunction(() => activityCharts.at(-1).chart.width < 390);
            assert.equal(await page.locator('.cp-activity-error').isVisible(), false);
        }
        assert.equal(await page.evaluate(() => window.calls.filter(call => call.params.sysparm_name === 'getStatistics').length), 1);
    } finally { await browser.close(); }
});

test('long activity timelines fit the viewport, zoom into regions and preserve leaderboards if charts fail', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await tableApiFixture(page, { count: 701 });
        await page.evaluate(installActivityChart);
        const button = page.getByRole('button', { name: 'Statistics', exact: true });
        await button.click();
        await page.waitForFunction(() => window.activityCharts.at(-1)?.datasets[0].points.length === 701);
        assert.equal(await page.locator('.cp-activity-plot').evaluate(node => node.offsetWidth === node.parentElement.clientWidth), true);
        assert.equal(await page.locator('.cp-activity canvas').evaluate(node => node.width < 1280 && node.height === 170), true);
        assert.equal(await page.locator('.cp-activity-help').count(), 0);
        assert.equal(await page.locator('.cp-activity-avatar').count() < 50, true, 'Crowded avatars are thinned until zooming');
        const zoomIn = page.getByRole('button', { name: 'Zoom in on activity' });
        for (let i = 0; i < 5; i++) {
            const before = await page.evaluate(() => activityCharts.at(-1).datasets[0].points.length);
            await zoomIn.click();
            await page.waitForFunction(before => activityCharts.at(-1).datasets[0].points.length < before, before);
        }
        assert.equal(await page.locator('.cp-activity-avatar').count(), 22);
        assert.equal(await page.getByRole('slider').count(), 0);
        await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
        await page.waitForFunction(() => activityCharts.at(-1).datasets[0].points.length === 701);
        assert.equal(await page.getByRole('slider').count(), 0);
        const bounds = await page.locator('.cp-activity canvas').boundingBox();
        await page.mouse.move(bounds.x + 100, bounds.y + 100); await page.mouse.down();
        await page.mouse.move(bounds.x + 400, bounds.y + 100);
        assert.equal(await page.locator('.cp-activity-selection').isVisible(), true);
        await page.mouse.up();
        await page.waitForFunction(() => activityCharts.at(-1).datasets[0].points.length < 701);
        const selected = await page.evaluate(() => activityCharts.at(-1).datasets[0].points.length);
        await page.getByRole('button', { name: 'Zoom out on activity' }).click();
        await page.waitForFunction(count => activityCharts.at(-1).datasets[0].points.length > count, selected);
        await page.getByRole('button', { name: 'Reset zoom', exact: true }).press('Enter');
        await page.waitForFunction(() => activityCharts.at(-1).datasets[0].points.length === 701);
        await button.click(); await page.evaluate(() => { delete window.Chart; }); await button.click();
        await page.waitForFunction(() => !document.querySelector('.cp-activity-error').hidden);
        assert.equal(await page.locator('.cp-stats-board').count(), 4);
    } finally { await browser.close(); }
});

test('activity dates handle single updates, invalid dates, zero churn and tied months', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const [activity, month, quiet] of [
            [[], 'No activity', 'No gap yet'],
            [[['2026-01-01 00:00:00', 1]], 'January 2026', 'No gap yet'],
            [[['2026-02-30 00:00:00', 100], ['2026-01-01 00:00:00', 0], ['2026-01-01 12:00:00', 0]], 'No activity', '0 days'],
            [[['2026-02-01 00:00:00', 3], ['2026-01-01 00:00:00', 3]], 'January 2026', '31 days'],
        ]) {
            const page = await browser.newPage(); await initialise(page); await page.evaluate(installActivityChart);
            await page.evaluate(activity => {
                const points = activity.map(([time, added], index) => ({ id: String(index), time, added, removed: 0, author: 'Ada' }));
                window.nextAnswer = { success: true, ageDays: 1, founder: 'Ada', updateSetCount: 1, contributorCount: 1,
                    added: 0, removed: 0, creators: [], creatorSets: [], fieldTotals: [], activity: points };
            }, activity);
            await page.getByRole('button', { name: 'Statistics', exact: true }).click(); await settle(page);
            const values = await page.locator('.cp-stats-facts div').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.querySelector('dt').textContent, node.querySelector('dd').textContent])));
            assert.deepEqual([values['Busiest month'], values['Longest quiet spell']], [month, quiet]);
            if (activity.length === 1) {
                await page.waitForFunction(() => window.activityCharts.length > 0);
                assert.equal(await page.evaluate(() => { const chart = activityCharts.at(-1); return chart.datasets.every(dataset => dataset.points[0].x === chart.scale.xScalePaddingLeft + 16); }), true, 'A single update stays left-aligned with padding from the vertical axis');
            }
            if (activity.length > 1) {
                await page.waitForFunction(() => window.activityCharts.length > 0);
                const labels = await page.evaluate(() => window.activityCharts.at(-1).data.labels);
                assert.equal(labels.some(label => label.includes('Mar')), false, 'Invalid calendar dates are not normalised into another month');
            }
            await page.close();
        }
    } finally { await browser.close(); }
});

test('activity labels switch from unique dates to times when zooming, then seconds for short ranges', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page); await page.evaluate(installActivityChart);
        const dates = Array.from({ length: 12 }, (_, i) => '2026-10-' + String(10 + Math.floor(i / 4)) + ' ' + String(6 + i % 4 * 3).padStart(2, '0') + ':00:00');
        async function show(times) {
            await page.locator('#cp-retry').click();
            await page.evaluate(times => window.nextAnswer = { success: true, ageDays: 1, founder: 'Ada', updateSetCount: 1, contributorCount: 1, added: 1, removed: 0, creators: [], creatorSets: [], fieldTotals: [], activity: times.map((time, i) => ({ id: String(i), time, added: 1, removed: 0, author: 'Ada' })) }, times);
            await page.getByRole('button', { name: 'Statistics', exact: true }).click();
            await page.waitForFunction(count => window.activityCharts.at(-1)?.datasets[0].points.length === count && !window.activityCharts.at(-1).destroyed, times.length);
        }
        const labels = () => page.evaluate(() => window.activityCharts.at(-1).data.labels.filter(Boolean));
        await show(dates);
        assert.equal(await page.locator('.cp-activity-range').textContent(), '10 Oct 2026 – 12 Oct 2026');
        let ticks = await labels();
        assert.equal(ticks.length, new Set(ticks).size);
        assert.ok(ticks.every(label => label.includes('Oct')));
        await page.getByRole('button', { name: 'Zoom in on activity' }).click();
        await page.waitForFunction(() => window.activityCharts.at(-1).datasets[0].points.length === 6);
        await page.getByRole('button', { name: 'Zoom in on activity' }).click();
        await page.waitForFunction(() => window.activityCharts.at(-1).datasets[0].points.length === 3);
        assert.deepEqual(await labels(), ['09:00', '12:00', '15:00']);
        assert.equal(await page.locator('.cp-activity-range').textContent(), '11 Oct 2026');
        await page.getByRole('button', { name: 'Reset zoom', exact: true }).click();
        await page.waitForFunction(() => window.activityCharts.at(-1).datasets[0].points.length === 12);
        assert.ok((await labels()).every(label => label.includes('Oct')));
        assert.equal(await page.locator('.cp-activity-range').textContent(), '10 Oct 2026 – 12 Oct 2026');
        await show(['2026-10-11 10:00:12', '2026-10-11 10:00:30', '2026-10-11 10:00:50']);
        assert.deepEqual(await labels(), ['10:00:12', '10:00:30', '10:00:50']);
        await show(['2026-10-11 10:00:12', '2026-10-11 10:00:12']);
        assert.deepEqual(await labels(), ['10:00:12']);
        await show(['2026-10-11 23:50:00', '2026-10-12 00:10:00']);
        ticks = await labels(); assert.equal(ticks.length, 2); assert.ok(ticks.every(label => label.includes('Oct')));
    } finally { await browser.close(); }
});

test('contribution bars animate once on intersection, respect reduced motion and stop observing removed rows', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.addInitScript(() => {
            window.IntersectionObserver = class {
                constructor(callback) { this.callback = callback; this.observed = new Set(); window.barObserver = this; }
                observe(node) { this.observed.add(node); }
                unobserve(node) { this.observed.delete(node); }
            };
        });
        await initialise(page);
        await page.evaluate(() => window.nextAnswer = { success: true, ageDays: 1, founder: 'Ada', updateSetCount: 1, contributorCount: 20, added: 20, removed: 0, creators: Array.from({ length: 20 }, (_, i) => ({ name: 'User ' + i, added: 1 })), destroyers: [], creatorSets: [], destroyerSets: [] });
        await page.getByRole('button', { name: 'Statistics', exact: true }).click(); await settle(page);
        assert.equal(await page.evaluate(() => window.barObserver.observed.size), 20);
        const first = page.locator('.cp-stats-contribution').first();
        assert.equal(await first.locator('span').evaluate(node => getComputedStyle(node).transform), 'matrix(0, 0, 0, 1, 0, 0)');
        await page.evaluate(() => {
            const nodes = [...window.barObserver.observed];
            window.barObserver.callback([{ target: nodes[0], isIntersecting: true }, { target: nodes[1], isIntersecting: false }]);
        });
        assert.equal(await first.evaluate(node => node.classList.contains('cp-bar-visible')), true);
        assert.equal(await page.locator('.cp-stats-contribution').nth(1).evaluate(node => node.classList.contains('cp-bar-visible')), false);
        assert.equal(await page.evaluate(() => window.barObserver.observed.size), 19);
        assert.equal(await first.locator('span').evaluate(node => getComputedStyle(node).transformOrigin.startsWith('0px')), true);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        const next = page.locator('.cp-stats-contribution').nth(1).locator('span');
        assert.equal(await next.evaluate(node => getComputedStyle(node).transitionDuration), '0s');
        assert.equal(await next.evaluate(node => getComputedStyle(node).transform), 'matrix(1, 0, 0, 1, 0, 0)');
        await page.locator('#cp-retry').click(); await settle(page);
        assert.equal(await page.evaluate(() => window.barObserver.observed.size), 0);
    } finally { await browser.close(); }
});


test('incomplete updates plot known totals and annotate their update set without treating missing history as zero', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1280, 390]) {
            const page = await browser.newPage(); await initialise(page, width); await page.evaluate(installActivityChart);
            await page.evaluate(() => window.nextAnswer = {
                success: true, ageDays: 1, founder: 'Ada', updateSetCount: 1, contributorCount: 1, added: 74, removed: 115, creators: [], creatorSets: [], fieldTotals: [],
                activity: [
                    { id: '1', time: '2026-10-11 10:56:22', author: 'Ada', added: 74, removed: 115, available: false, updateSet: { name: '<img src=x onerror=alert(1)> Batch 01' } },
                    { id: '2', time: '2026-10-11 11:56:22', author: 'Grace', added: 0, removed: 0, available: false, updateSet: { name: 'Missing snapshot' } },
                    { id: '3', time: '2026-10-11 12:56:22', author: 'Linus', added: 0, removed: 0, available: true, updateSet: { name: 'Unchanged snapshot' } },
                ],
            });
            await page.getByRole('button', { name: 'Statistics', exact: true }).click();
            await page.waitForFunction(() => window.activityCharts.at(-1)?.datasets[0].points.length === 3);
            assert.deepEqual(await page.evaluate(() => activityCharts.at(-1).data.datasets.map(dataset => dataset.data)), [[74, null, 0], [115, null, 0]]);
            assert.equal(await page.evaluate(() => activityCharts.at(-1).datasets.every(dataset => dataset.points[0].y < activityCharts.at(-1).scale.endPoint)), true, 'Known non-zero totals sit above the baseline');
            assert.equal(await page.locator('.cp-activity-range').textContent(), '11 Oct 2026');
            const avatar = page.locator('.cp-activity-avatar').first();
            await avatar.hover();
            const tooltip = page.locator('.cp-activity-tooltip');
            assert.equal(await page.locator('.cp-activity-annotation').count(), 0);
            assert.equal(await tooltip.isVisible(), true);
            assert.equal(await tooltip.textContent(), '<img src=x onerror=alert(1)> Batch 01');
            assert.equal(await tooltip.locator('img').count(), 0);
            assert.equal(await tooltip.evaluate(node => getComputedStyle(node).fontSize === getComputedStyle(node.closest('.cp-activity')).fontSize), true);
            assert.equal(await tooltip.evaluate(node => { const bounds = node.getBoundingClientRect(), plot = node.closest('.cp-activity').getBoundingClientRect(); return bounds.left >= plot.left && bounds.right <= plot.right + 1; }), true);
            assert.equal(await page.locator('.cp-activity-halo[hidden]').count(), 0);
            await avatar.click();
            assert.equal(await page.locator('.cp-activity-tooltip').textContent(), '<img src=x onerror=alert(1)> Batch 01\n2026-10-11 10:56:22\n74 additions, 115 removals\nAda');
            await page.locator('.cp-activity canvas').scrollIntoViewIfNeeded();
            const dot = await page.evaluate(() => activityCharts.at(-1).datasets[0].points[0]), canvas = await page.locator('.cp-activity canvas').boundingBox();
            await page.mouse.move(canvas.x + dot.x, canvas.y + dot.y);
            assert.match(await page.locator('.cp-activity-tooltip').textContent(), /74 additions, 115 removals/);
            await page.locator('.cp-activity-avatar').nth(1).hover();
            assert.equal(await tooltip.textContent(), 'Missing snapshot');
            assert.equal(await page.locator('.cp-activity-halo[hidden]').count(), 2);
            await page.keyboard.press('Escape');
            assert.equal(await tooltip.isVisible(), false);
            await page.close();
        }
    } finally { await browser.close(); }
});

test('graph full screen is the first control, fills the viewport and preserves zoom through native and fallback exits', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const [mode, width] of [['native', 1280], ['native', 390], ['denied', 390], ['missing', 1280]]) {
            const page = await browser.newPage(); await initialise(page, width); await page.evaluate(installActivityChart);
            await page.evaluate(() => window.nextAnswer = { success: true, ageDays: 1, founder: 'Ada', contributorCount: 1, updateSetCount: 1, added: 3, removed: 0, creators: [], creatorSets: [], fieldTotals: [], activity: [0,1,2,3].map(i => ({ id: String(i), time: '2026-10-11 1' + i + ':00:00', author: 'Ada', added: i, removed: 0 })) });
            await page.getByRole('button', { name: 'Statistics', exact: true }).click();
            await page.waitForFunction(() => activityCharts.at(-1)?.datasets[0].points.length === 4);
            await page.evaluate(mode => {
                const chart = document.querySelector('.cp-activity');
                if (mode === 'denied') chart.requestFullscreen = () => Promise.reject(new Error('Unavailable in this frame'));
                if (mode === 'missing') chart.requestFullscreen = undefined;
            }, mode);
            assert.equal(await page.locator('.cp-activity-controls button').first().getAttribute('aria-label'), 'Enter full screen');
            await page.getByRole('button', { name: 'Zoom in on activity' }).click();
            await page.waitForFunction(() => activityCharts.at(-1).datasets[0].points.length === 2);
            await page.getByRole('button', { name: 'Enter full screen' }).click();
            await page.waitForFunction(() => document.querySelector('.cp-activity-fullscreen').getAttribute('aria-pressed') === 'true' && document.querySelector('.cp-activity canvas').height > 170);
            assert.equal(await page.locator('.cp-activity').evaluate(node => { const box = node.getBoundingClientRect(); return Math.abs(box.width - innerWidth) < 2 && Math.abs(box.height - innerHeight) < 2; }), true);
            assert.equal(await page.locator('.cp-activity-fullscreen .fa-compress').count(), 1);
            assert.equal(await page.evaluate(() => activityCharts.at(-1).datasets[0].points.length), 2);
            assert.equal(await page.evaluate(() => !!document.fullscreenElement), mode === 'native');
            await page.getByRole('button', { name: 'Exit full screen' }).click();
            await page.waitForFunction(() => !document.fullscreenElement && !document.querySelector('.cp-activity').classList.contains('cp-activity-expanded') && document.querySelector('.cp-activity canvas').height === 170);
            assert.equal(await page.locator('.cp-activity-fullscreen .fa-expand').count(), 1);
            assert.equal(await page.evaluate(() => activityCharts.at(-1).datasets[0].points.length), 2);
            await page.getByRole('button', { name: 'Enter full screen' }).click();
            await page.waitForFunction(() => document.querySelector('.cp-activity-fullscreen').getAttribute('aria-pressed') === 'true');
            if (mode === 'native') await page.evaluate(() => document.exitFullscreen());
            else await page.keyboard.press('Escape');
            await page.waitForFunction(() => document.querySelector('.cp-activity-fullscreen').getAttribute('aria-pressed') === 'false');
            await page.getByRole('button', { name: 'Enter full screen' }).click();
            await page.waitForFunction(() => document.querySelector('.cp-activity-fullscreen').getAttribute('aria-pressed') === 'true');
            await page.evaluate(() => angular.element(document.getElementById('credit-plus')).scope().ctrl.reload());
            await page.waitForFunction(() => !document.fullscreenElement && !document.querySelector('.cp-activity'));
            await page.close();
        }
    } finally { await browser.close(); }
});

test('Statistics header sticks below the responsive main toolbar while its content scrolls', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page);
        await page.evaluate(() => window.nextAnswer = { success: true, ageDays: 1, founder: 'Ada', contributorCount: 100, updateSetCount: 100, added: 100, removed: 100, creators: Array.from({length:100}, (_,i) => ({name:'Contributor '+i, added:1})), destroyers:Array.from({length:100}, (_,i) => ({name:'Contributor '+i, removed:1})), creatorSets: [], destroyerSets: [] });
        await page.getByRole('button', { name: 'Statistics', exact: true }).click(); await settle(page);
        for (const width of [1280, 390]) {
            await page.setViewportSize({ width, height: 850 });
            await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cp-header-height')) - document.querySelector('.dc-header').getBoundingClientRect().height) < 1);
            await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 240); });
            await page.waitForFunction(() => scrollY > 100);
            assert.equal(await page.locator('#cp-statistics-button').evaluate(node => {
                const header = document.querySelector('.dc-header').getBoundingClientRect(), box = node.getBoundingClientRect();
                return getComputedStyle(node).position === 'sticky' && Math.abs(box.top - header.bottom) < 2;
            }), true, 'The Statistics header stays beneath the toolbar without covering it');
        }
    } finally { await browser.close(); }
});


test('attribution blocks show cached avatars and aligned update-set gaps, with safe fallbacks and filtering', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const monaco of [false, true]) for (const width of [1280, 390]) {
            const page = await browser.newPage();
            await initialise(page, width, monaco);
            await page.route('**/*.iix?t=medium', route => route.request().url().includes('1'.repeat(32))
                ? route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') })
                : route.fulfill({ status: 404, body: 'Missing photo' }));
            await page.evaluate(width => {
                if (width === 390) {
                    document.documentElement.style.setProperty('--now-color_background--primary', '24 26 30');
                    document.documentElement.style.setProperty('--now-color_text--primary', '235 235 235');
                    document.documentElement.style.setProperty('--now-color_text--secondary', '190 194 201');
                    document.documentElement.style.setProperty('--now-color_background--secondary', '36 39 44');
                    document.documentElement.style.setProperty('--now-color_background--tertiary', '45 48 54');
                }
                const [first, second] = window.fixture.updates;
                window.fixture.lines = [first.id, first.id, second.id, second.id, first.id].map((update, i) => ({ number: i + 1, text: 'line' + i + '();', update }));
                window.contributors = {
                    'earlier author': { name: 'Earlier author', photo: '1'.repeat(32) },
                    developer: { name: 'Developer', photo: '2'.repeat(32) },
                };
            }, width);
            const field = await openField(page);
            const table = part(field, monaco ? 'cp-attribution' : 'cp-lines');
            assert.equal(await part(field, monaco ? 'cp-code-view' : 'cp-table-fallback').locator(monaco ? '.cp-gutter-head' : 'thead th:first-child').textContent(), 'Code attribution');
            const avatars = table.locator('.cp-origin .cp-avatar');
            assert.equal(await avatars.count(), 3, 'Only the beginning of each attribution block has an avatar');
            await page.waitForFunction(() => [...document.querySelectorAll('.cp-origin .cp-avatar img')].filter(img => img.naturalWidth > 0).length === 2 && !document.querySelector('.cp-avatar[data-author="developer"] img'));
            assert.deepEqual(await avatars.allTextContents(), ['E', 'D', 'E']);
            assert.equal(await avatars.evaluateAll(nodes => nodes.every(node => node.getAttribute('aria-hidden') === 'true')), true);
            assert.equal(await avatars.evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().width === 32)), true);
            assert.equal(await table.locator('.cp-author').count(), 3);
            assert.equal(await table.locator('.cp-time').count(), 3);
            assert.equal(await table.locator('.cp-attribution-block').evaluateAll(nodes => nodes.every(node => node.querySelector('.cp-attribution-meta').getBoundingClientRect().top >= node.querySelector('.cp-author').getBoundingClientRect().bottom)), true);

            if (monaco) {
                assert.deepEqual(await page.evaluate(() => creditEditor.groupZones), [{ afterLineNumber: 2, heightInPx: 6 }, { afterLineNumber: 4, heightInPx: 6 }, { afterLineNumber: 5, heightInPx: 24 }]);
                assert.equal(await table.locator('tr').evaluateAll(rows => rows.every(row => Number(row.style.top.replace('px', '')) === creditEditor.getTopForLineNumber(Number(row.dataset.lineNumber)))), true);
                const rows = await table.locator('tr').evaluateAll(rows => rows.map(row => ({ top: row.getBoundingClientRect().top, bottom: row.getBoundingClientRect().bottom })));
                assert.equal(rows[2].top - rows[1].bottom, 6);
                const separators = await table.locator('.cp-group-end').evaluateAll(cells => cells.map(cell => {
                    const style = getComputedStyle(cell, '::after');
                    return { width: style.borderBottomWidth, style: style.borderBottomStyle, colour: style.borderBottomColor };
                }));
                assert.equal(separators.length, 2);
                assert.equal(separators.every(separator => separator.width === '1px' && separator.style === 'dotted'), true);
                const codeSeparators = await page.evaluate(() => creditEditor.zoneElements.filter(node => node.classList.contains('cp-group-separator')).map(node => {
                    const style = getComputedStyle(node);
                    return { width: style.borderBottomWidth, style: style.borderBottomStyle, colour: style.borderBottomColor };
                }));
                assert.deepEqual(codeSeparators, separators, 'The same 1px dotted colour spans attribution and code');

            } else {
                assert.equal(await table.locator('tr.cp-block-start').count(), 2);
                assert.deepEqual(await table.locator('tr.cp-block-start td').first().evaluate(node => [getComputedStyle(node).borderTopWidth, getComputedStyle(node).borderTopStyle]), ['1px', 'dotted']);
                const separators = await table.locator('tr.cp-block-start').evaluateAll(rows => rows.map(row => Array.from(row.cells).map(cell => getComputedStyle(cell).borderTopColor)));
                assert.equal(separators.every(colours => new Set(colours).size === 1), true, 'Fallback separators have one colour across attribution and code');
            }
            await page.screenshot({ path: '/tmp/credit-attribution-avatars-' + width + '-' + (monaco ? 'monaco' : 'fallback') + '.png', fullPage: true });
            await openField(page, 'client_script');
            assert.equal(await page.evaluate(() => window.contributorCalls.length), 1, 'Contributors are loaded once across fields');
            await menuAction(page, table.locator('[data-context-kind="author"]').first(), 'Show matching');
            const visibleRows = table.locator('tr:visible');
            assert.equal(await visibleRows.count(), 3);
            assert.equal(await visibleRows.locator('.cp-avatar').count(), 1, 'A filtered group retains one leading avatar');
            if (monaco) {
                assert.deepEqual(await page.evaluate(() => creditEditors[0].groupZones), []);
                assert.equal(await table.locator('.cp-group-end').count(), 0, 'Filtering to one group removes separators');
            }
            await field.getByRole('button', { name: 'Clear created by filter' }).click();
            assert.equal(await avatars.count(), 3);
            await page.close();
        }
    } finally { await browser.close(); }
});


test('group attribution stays visible while scrolling and yields to the next group without focus jumps', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const width of [1280, 390]) for (const monaco of [true, false]) {
            const page = await browser.newPage(); await initialise(page, width, monaco);
            await page.evaluate(() => {
                const [first, second] = window.fixture.updates;
                window.fixture.lines = Array.from({ length: 200 }, (_, i) => ({ number: i + 1, text: 'line' + i + '();', update: i < 100 ? first.id : second.id }));
            });
            const field = await openField(page), pane = part(field, monaco ? 'cp-gutter' : 'cp-table-fallback');
            const cards = pane.locator('.cp-attribution-block');
            async function scroll(top) {
                if (monaco) await page.evaluate(top => creditEditors[0].setScrollTop(top), top);
                else await pane.evaluate((node, top) => { node.scrollTop = top; }, top);
                await page.evaluate(() => new Promise(requestAnimationFrame));
            }
            const scrollTop = () => monaco ? page.evaluate(() => creditEditors[0].getScrollTop()) : pane.evaluate(node => node.scrollTop);
            const top = async () => (await pane.boundingBox()).y;
            await scroll(1200);
            assert.equal(await cards.count(), 2, 'One set of details is rendered per group');
            assert.ok(Math.abs((await cards.first().boundingBox()).y - await top()) < 1, 'The current group stays at the top of the pane');
            await cards.first().locator('.cp-author').evaluate(node => node.focus({ preventScroll: true }));
            await page.keyboard.press('Shift+F10');
            assert.equal(await page.locator('#cp-context-menu').isVisible(), true);
            const menuScroll = await scrollTop();
            assert.equal(menuScroll, 1200, 'Opening the sticky author menu does not jump back to its first code line');
            await page.keyboard.press('Escape');
            assert.equal(await scrollTop(), menuScroll, 'Returning focus to the sticky author preserves the scroll position');
            await page.screenshot({ path: '/tmp/credit-sticky-attribution-' + width + '-' + (monaco ? 'monaco' : 'fallback') + '.png', fullPage: true });
            const nextTop = (await cards.nth(1).boundingBox()).y - await top() + await scrollTop();
            await scroll(nextTop - 24);
            const first = await cards.first().boundingBox(), next = await cards.nth(1).boundingBox();
            assert.ok(first.y < await top() && first.y + first.height <= next.y + 1, 'Details stop at their group boundary');
            await scroll(nextTop + 200);
            assert.ok(Math.abs((await cards.nth(1).boundingBox()).y - await top()) < 1, 'The next group becomes sticky');
            await menuAction(page, cards.nth(1).locator('.cp-author'), 'Show matching');
            await scroll(1200);
            assert.equal(await cards.count(), 1);
            assert.ok(Math.abs((await cards.first().boundingBox()).y - await top()) < 1, 'Filtering rebuilds the sticky group');
            await field.getByRole('button', { name: 'Clear created by filter' }).click();
            await scroll(1200);
            assert.equal(await cards.count(), 2);
            assert.ok(Math.abs((await cards.first().boundingBox()).y - await top()) < 1);
            if (monaco) {
                await page.evaluate(() => creditEditors[0].updateOptions({ lineHeight: 27 }));
                await page.evaluate(() => new Promise(requestAnimationFrame));
                assert.ok(Math.abs((await cards.first().boundingBox()).y - await top()) < 1, 'Font changes refresh sticky bounds');
            }
            await page.close();
        }
    } finally { await browser.close(); }
});


test('attribution buttons switch cached fields between Grouped and Columns and mark the selected view', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const monaco of [false, true]) for (const width of [1280, 390]) {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await initialise(page, width, monaco);
            await page.evaluate(() => {
                const [first, second] = window.fixture.updates;
                window.fixture.lines = [first.id, first.id, second.id, second.id, first.id].map((update, i) => ({ number: i + 1, text: 'line' + i + '();', update }));
            });
            const field = await openField(page);
            const second = await openField(page, 'client_script');
            const rows = section => part(section, monaco ? 'cp-attribution' : 'cp-lines');
            const grouped = page.getByRole('button', { name: 'Grouped view', exact: true });
            const columns = page.getByRole('button', { name: 'Column view', exact: true });
            async function assertActive(view) {
                assert.equal(await grouped.getAttribute('aria-pressed'), String(view === 'grouped'));
                assert.equal(await columns.getAttribute('aria-pressed'), String(view === 'columns'));
                assert.equal(await grouped.evaluate(node => node.classList.contains('active')), view === 'grouped');
                assert.equal(await columns.evaluate(node => node.classList.contains('active')), view === 'columns');
                assert.equal(await page.locator('.cp-settings-control .btn.active').count(), 1);
            }
            assert.equal(await grouped.textContent(), '');
            assert.equal(await columns.textContent(), '');
            assert.equal(await grouped.locator('.fa.fa-id-card-o[aria-hidden="true"]').count(), 1);
            assert.equal(await columns.locator('.fa.fa-columns[aria-hidden="true"]').count(), 1);
            assert.equal(await columns.evaluate(node => node.nextElementSibling.id), 'cp-whitespace-control');
            assert.equal(await page.locator('#cp-view-popover').count(), 0);
            await assertActive('grouped');
            assert.equal(await rows(field).locator('.cp-avatar').count(), 3);
            const calls = await page.evaluate(() => window.calls.length);
            const editors = monaco ? await page.evaluate(() => window.creditEditors.length) : 0;
            await columns.click();
            await settle(page);
            await assertActive('columns');
            assert.equal(new URL(page.url()).searchParams.get('sysparm_view'), 'columns');
            assert.deepEqual(await page.evaluate(() => window.savedPreferences), { view: 'columns', whitespace: 'all' });
            for (const section of [field, second]) {
                assert.equal(await rows(section).locator('.cp-avatar').count(), 0);
                assert.deepEqual(await rows(section).locator('.cp-author .cp-cell-text').allTextContents(), ['Earlier author', 'Earlier author', 'Developer', 'Developer', 'Earlier author']);
                assert.equal(await rows(section).locator('.cp-time').count(), 5);
                assert.equal(await rows(section).locator('.cp-update-set').count(), 5);
                const headings = part(section, monaco ? 'cp-code-view' : 'cp-table-fallback').locator(monaco ? '.cp-gutter-head' : 'thead tr');
                assert.equal(await headings.locator('.cp-time').isVisible(), width !== 390);
                assert.match(await headings.textContent(), /Updated.*Created by.*Update set/);
                assert.equal(await headings.evaluate(node => {
                    const updated = getComputedStyle(node.children[0]), author = getComputedStyle(node.children[1]);
                    return ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'color'].every(property => updated[property] === author[property]);
                }), true, 'Updated uses the same typography as the other column headings');
                if (monaco) {
                    assert.equal(await rows(section).locator('tr').evaluateAll(nodes => nodes.every(row => row.children.length === 3)), true);
                    assert.equal(await rows(section).locator('.cp-column-group-end').count(), 2);
                } else assert.equal(await rows(section).locator('tr').evaluateAll(nodes => nodes.every(row => row.cells.length === 5)), true);
            }
            assert.equal(await page.evaluate(() => window.calls.length), calls, 'Switching view does not fetch attribution');
            if (monaco) {
                assert.equal(await page.evaluate(() => window.creditEditors.length), editors);
                assert.equal(await page.evaluate(() => window.creditOptions.at(-1).model.text), 'line0();\nline1();\nline2();\nline3();\nline4();');
                assert.deepEqual(await page.evaluate(() => window.creditEditor.groupZones), [{ afterLineNumber: 2, heightInPx: 6 }, { afterLineNumber: 4, heightInPx: 6 }]);
            }
            await columns.click();
            assert.equal(await page.evaluate(() => window.preferenceCalls.length), 1, 'Clicking the active view leaves it selected without saving again');
            await page.screenshot({ path: '/tmp/credit-columns-buttons-' + width + '-' + (monaco ? 'monaco' : 'fallback') + '.png', fullPage: true });
            await menuAction(page, rows(field).locator('[data-context-kind="author"]').first(), 'Show matching');
            await grouped.focus();
            await page.keyboard.press('Space');
            await settle(page);
            await assertActive('grouped');
            assert.equal(new URL(page.url()).searchParams.has('sysparm_view'), false);
            assert.deepEqual(await page.evaluate(() => window.savedPreferences), { view: 'grouped', whitespace: 'all' });
            assert.deepEqual(await rows(field).locator('.cp-author .cp-cell-text').allTextContents(), ['Earlier author']);
            assert.equal(await rows(field).locator('.cp-avatar').count(), 1);
            assert.equal(await part(field, 'cp-active-filters').getByRole('button').count(), 1);
            assert.equal(await rows(second).locator('.cp-avatar').count(), 3);
            await part(field, 'cp-active-filters').getByRole('button').click();
            if (monaco) {
                await menuAction(page, setCell(field), 'Quick compare');
                const compareCalls = await page.evaluate(() => window.calls.length);
                await columns.click();
                await settle(page);
                assert.equal(await part(field, 'cp-diff-close').isVisible(), true);
                assert.equal(await page.evaluate(() => window.lastModels.original.text), 'old();');
                assert.equal(await page.evaluate(() => window.calls.length), compareCalls);
            }
            assert.deepEqual(errors, []);
            await page.close();
        }
    } finally { await browser.close(); }
});

test('Credit loads saved preferences with explicit URL overrides and keeps them across update selection', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const [preferences, search, view, whitespace] of [
            [{ view: 'columns', whitespace: 'eol' }, '', 'columns', 'eol'],
            [{ view: 'columns', whitespace: 'eol' }, 'sysparm_view=grouped&sysparm_whitespace=none', 'grouped', 'none'],
            [{ view: 'grouped', whitespace: 'none' }, 'sysparm_view=columns&sysparm_whitespace=changes', 'columns', 'changes'],
            [{ view: 'columns', whitespace: 'none' }, 'sysparm_view=grouped&sysparm_whitespace=all', 'grouped', 'all'],
            [{ view: 'invalid', whitespace: 'invalid' }, '', 'grouped', 'all'],
        ]) {
            const page = await browser.newPage();
            await initialise(page, 1280, true, search, preferences);
            let field = await openField(page);
            assert.equal(await part(field, 'cp-attribution').locator('.cp-avatar').count(), view === 'columns' ? 0 : 1);
            await chooseSet(page, original);
            field = await openField(page);
            assert.equal(await part(field, 'cp-attribution').locator('.cp-avatar').count(), view === 'columns' ? 0 : 1);
            if (preferences.view === 'columns') assert.equal(new URL(page.url()).searchParams.get('sysparm_view'), view);
            if (['none', 'changes', 'eol'].includes(preferences.whitespace)) assert.equal(new URL(page.url()).searchParams.get('sysparm_whitespace'), whitespace);
            const button = page.getByRole('button', { name: view === 'columns' ? 'Column view' : 'Grouped view', exact: true });
            assert.equal(await button.getAttribute('aria-pressed'), 'true');
            await page.getByRole('button', { name: 'Whitespace settings', exact: true }).click();
            assert.equal(await page.locator('#cp-whitespace-popover input:checked').inputValue(), whitespace);
            await page.getByLabel('Ignore changes in amount of whitespace', { exact: true }).check();
            await settle(page);
            if (whitespace !== 'changes') assert.deepEqual(await page.evaluate(() => window.savedPreferences), { view, whitespace: 'changes' });
            await page.close();
        }
    } finally { await browser.close(); }
});

test('Credit serialises preference writes, retains the latest choices and reports save failures', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await initialise(page);
        await openField(page);
        await page.evaluate(() => {
            const Original = window.GlideAjax;
            window.preferenceWrites = [];
            window.GlideAjax = function (name) {
                const ga = new Original(name), params = {};
                this.addParam = (key, value) => { params[key] = value; ga.addParam(key, value); };
                this.getXMLAnswer = callback => params.sysparm_name === 'savePreferences'
                    ? window.preferenceWrites.push({ value: JSON.parse(params.sysparm_preferences), callback })
                    : ga.getXMLAnswer(callback);
            };
        });
        await page.getByRole('button', { name: 'Column view', exact: true }).click();
        await page.getByRole('button', { name: 'Grouped view', exact: true }).click();
        await page.getByRole('button', { name: 'Whitespace settings', exact: true }).click();
        await page.getByLabel('Show all changes', { exact: true }).check();
        assert.equal(await page.evaluate(() => window.preferenceWrites.length), 1);
        await page.evaluate(() => preferenceWrites[0].callback('{"success":true}'));
        assert.deepEqual(await page.evaluate(() => window.preferenceWrites.map(write => write.value)), [{ view: 'columns', whitespace: 'all' }, { view: 'grouped', whitespace: 'none' }]);
        await page.evaluate(() => preferenceWrites[1].callback('{"success":false}'));
        await settle(page);
        assert.match(await page.getByRole('status').allTextContents().then(values => values.join(' ')), /Could not save Credit preferences/);
        await page.getByRole('button', { name: 'Column view', exact: true }).click();
        await page.evaluate(() => preferenceWrites[2].callback('{"success":true}'));
        await settle(page);
        assert.equal(await page.getByText('Could not save Credit preferences.', { exact: false }).isVisible(), false);
    } finally { await browser.close(); }
});

test('Columns keeps empty filter results clearable and renders unknown origins safely', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const monaco of [false, true]) {
            const page = await browser.newPage();
            await initialise(page, 1280, monaco, 'sysparm_view=columns');
            let field = await openField(page);
            await menuAction(page, field.locator('[data-context-kind="author"]').first(), 'Filter out');
            const empty = part(field, 'cp-lines').locator('.cp-empty');
            assert.equal(await empty.textContent(), 'No matches.');
            assert.equal(await empty.getAttribute('colspan'), '5');
            await part(field, 'cp-active-filters').getByRole('button').click();
            assert.equal(await field.locator('.cp-empty').count(), 0);
            await page.evaluate(() => window.fixture.lines[0].update = 'f'.repeat(32));
            await page.getByRole('button', { name: 'Reload', exact: true }).click();
            field = await openField(page);
            const rows = part(field, monaco ? 'cp-attribution' : 'cp-lines');
            assert.deepEqual(await rows.locator('.cp-author .cp-cell-text').allTextContents(), ['Unknown', 'Developer']);
            assert.deepEqual(await rows.locator('.cp-update-set .cp-cell-text').allTextContents(), ['—', fixture.updates[1].updateSet.name]);
            await page.close();
        }
    } finally { await browser.close(); }
});

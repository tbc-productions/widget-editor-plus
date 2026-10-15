const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const html = fs.readFileSync('src/fluent/generated/other/sys-ui-page/credit_plus.html', 'utf8');
assert.match(fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_compare.html', 'utf8'), /credit_update:\s*_weDiffConfigParams.get\('credit_update'\)/);
const client = fs.readFileSync('src/fluent/generated/other/sys-ui-page/credit_plus.client.js', 'utf8');
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
            let font = { fontFamily: 'monospace', fontSize: 13, fontWeight: 'normal', letterSpacing: 0, lineHeight: 24 }, padding = 8, zone = 0, hidden = [];
            const editor = { getScrollHeight: () => Math.max(container.clientHeight, options.model.text.split('\n').length * font.lineHeight + padding * 2 + zone), getScrollTop: () => top,
                getScrollWidth: () => container.clientWidth, getLayoutInfo: () => ({ height: container.clientHeight, contentWidth: container.clientWidth, horizontalScrollbarHeight: 12 }),
                getOption: () => font,
                deltaDecorations: (_old, decorations) => { editor.decorations = decorations; return decorations.map((_, i) => 'decoration-' + i); },
                setHiddenAreas: ranges => { hidden = ranges; window.hiddenRanges = ranges; },
                getTopForLineNumber: (number, includeZone) => padding + (number - 1 - hidden.reduce((total, range) => total + Math.max(0, Math.min(number - 1, range.endLineNumber) - range.startLineNumber + 1), 0)) * font.lineHeight + (number > 15 && !(number === 16 && includeZone) ? zone : 0),
                updateOptions: options => { font = { ...font, ...options }; padding = options.padding?.top ?? padding; if (configuration) configuration(); },
                addViewZone: height => { zone = height; if (zonesChanged) zonesChanged(); },
                revealLine: number => {
                    const position = editor.getTopForLineNumber(number);
                    if (position < top) editor.setScrollTop(position);
                    else if (position + font.lineHeight > top + container.clientHeight) editor.setScrollTop(position + font.lineHeight - container.clientHeight);
                },
                setScrollTop: value => { top = value; if (scroll) scroll(); }, onDidScrollChange: callback => scroll = callback, onDidContentSizeChange() {}, onDidLayoutChange() {}, onDidChangeConfiguration: callback => configuration = callback, onDidChangeViewZones: callback => zonesChanged = callback, layout() {}, dispose: () => window.disposedCreditEditors++ };
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
async function initialise(page, width = 1280, monaco = false) {
    await page.setViewportSize({ width, height: 850 });
    await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: markup }));
    await page.goto('https://credit.test/?sysparm_update=' + update);
    if (monaco) await page.evaluate(installMonaco);
    await page.evaluate(fixture => {
        window.fixture = fixture; window.calls = []; window.nextAnswer = null; window.historyEntries = [];
        window.WE_HISTORY_SYNC = { set: entry => window.historyEntries.push(entry) }; window.WE_CREDIT_CONFIG = { siteTitle: 'My instance' };
        window.GlideAjax = function (name) {
            const params = {}; this.addParam = (key, value) => params[key] = value;
            this.getXMLAnswer = callback => {
                window.calls.push({ name, params });
                const result = window.nextAnswer || (params.sysparm_name === 'getComparison' ? { success: true, table: window.fixture.table, record: window.fixture.record, left: { sys_id: params.sysparm_from_update, fields: { script: 'old();' } }, right: { sys_id: params.sysparm_update, fields: { script: window.fixture.lines.map(line => line.text).join('\n') } } } : { ...window.fixture, selected: params.sysparm_update || window.fixture.selected, field: params.sysparm_field || 'script' });
                window.nextAnswer = null; callback(JSON.stringify(result));
            };
        };
    }, fixture);
    await installCredit(page);
}

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
            assert.equal(await page.locator('#cp-status').evaluate(node => node.classList.contains('alert') && node.classList.contains('alert-danger')), true);
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
            fixture = { ...fixture, lines: Array.from({ length: 120 }, (_, i) => ({ number: i + 1, text: 'code();', update: fixture.selected })) };
            window.GlideAjax = function () { this.addParam = () => {}; this.getXMLAnswer = callback => callback(JSON.stringify(fixture)); };
        }, fixture);
        await installCredit(page);
        await openField(page);
        assert.deepEqual(await page.locator('#cp-attribution .cp-cell').first().evaluate(node => {
            const style = getComputedStyle(node); return [style.fontSize, style.lineHeight, style.fontFamily];
        }), ['13px', '24px', 'monospace']);
        await page.evaluate(() => {
            creditEditor.updateOptions({ fontSize: 15, lineHeight: 27, padding: { top: 13 } });
            creditEditor.addViewZone(37);
        });
        await page.waitForFunction(() => document.querySelector('#cp-attribution tr[data-line-number="16"]').style.top === '455px');
        assert.deepEqual(await page.locator('#cp-attribution .cp-cell').first().evaluate(node => {
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
            assert.equal(await part(section, 'cp-attribution').locator('tr').first().evaluate(node => getComputedStyle(node).display), 'grid');
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
        assert.equal(await frame.locator('#cp-statistics-button').getAttribute('aria-pressed'), 'true');
        assert.equal(await frame.locator('#cp-statistics-button').evaluate(node => node.classList.contains('active')), true);
        await page.reload();
        frame = await initialiseFrame();
        assert.equal(await frame.locator('#cp-update-button').getAttribute('data-value'), original);
        assert.equal(await frame.locator('#cp-statistics').isVisible(), true);
        assert.equal(await frame.evaluate(() => window.statisticsCalls), 1);
        assert.equal(await frame.evaluate(() => window.historyEntries.at(-1).title), 'Credit+');
        assert.equal(await frame.evaluate(() => window.historyEntries.at(-1).description), 'My widget');
        assert.equal(await frame.locator('#cp-statistics-button').getAttribute('aria-pressed'), 'true');
        assert.equal(await frame.locator('#cp-statistics-button').evaluate(node => node.classList.contains('active')), true);
        await frame.getByRole('button', { name: 'Statistics', exact: true }).click();
        assert.equal(new URL(frame.url()).searchParams.has('sysparm_statistics'), false);
        assert.equal(new URL('https://credit.test/' + decodeURIComponent(new URL(page.url()).pathname.slice(prefix.length))).searchParams.has('sysparm_statistics'), false);
        assert.equal(await frame.locator('#cp-statistics-button').getAttribute('aria-pressed'), 'false');
        assert.equal(await frame.locator('#cp-statistics-button').evaluate(node => node.classList.contains('active')), false);
        assert.equal(await frame.locator('#cp-statistics').isVisible(), false);
        await page.waitForFunction(() => document.getElementById('shell-title').textContent.includes('My widget (Widget)'));
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
            assert.equal(await button.locator('.icon-chart-pi').count(), 1);
            assert.equal(await button.evaluate(node => { const dropdown = document.getElementById('cp-update-button').getBoundingClientRect(), icon = node.getBoundingClientRect(); return icon.left >= dropdown.right && icon.top < dropdown.bottom; }), true);
            await button.click();
            assert.equal(await page.locator('#cp-statistics-status').textContent(), 'Loading statistics…');
            assert.equal(await page.locator('.cp-stats-skeleton').getAttribute('aria-hidden'), 'true');
            assert.equal(await page.locator('.cp-stats-skeleton .we-skeleton-bar').count(), 32);
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
            assert.equal(await page.locator('.cp-stats-board').first().locator('li').count(), 4);
            assert.deepEqual(await page.locator('.cp-stats-percentage').allTextContents(), ['50.0%', '29.3%', '20.7%', '0.0%', '100.0%', '78.1%', '0.0%', '0.0%', '100.0%']);
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
            assert.equal(await page.locator('#cp-statistics-heading').textContent(), 'Statistics 📊');
            assert.deepEqual(await page.locator('.cp-stats-board h3').allTextContents(), ['Builders 👷 - Created by 👤', 'Destroyers 💥 - Created by 👤', 'Expansions 🏗️ - Update sets 📦', 'Demolitions 🧨 - Update sets 📦']);
            assert.equal(await page.locator('.cp-stats-board h3').first().evaluate(node => getComputedStyle(node).fontWeight), '600');
            const makeover = page.locator('.cp-stats-facts dd').last();
            await makeover.locator('a').evaluate(node => node.textContent = 'Credit+ Test ct20261014a - ' + 'Biggest update set '.repeat(8));
            assert.equal(await makeover.locator('a').evaluate(node => getComputedStyle(node).whiteSpace), 'normal');
            assert.equal(await makeover.evaluate(node => node.scrollWidth <= node.clientWidth), true);
            assert.equal(await makeover.locator('a').evaluate(node => node.getBoundingClientRect().height > parseFloat(getComputedStyle(node).fontSize) * 2), true);
            assert.equal(await page.locator('.cp-stats-skeleton').count(), 0);
            assert.equal(await page.locator('#cp-statistics .cp-stats-emoji').count(), 17);
            assert.equal(await page.locator('#cp-statistics .cp-stats-emoji').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).fontSize === getComputedStyle(document.querySelector('.cp-stats-medal')).fontSize)), true);
            assert.match(await page.locator('.cp-stats-facts').textContent(), /42 days/);
            assert.equal(await page.locator('.cp-stats-note').count(), 0);
            assert.deepEqual(await page.locator('.cp-stats-board').first().locator('li [aria-hidden=true]').allTextContents(), ['🏆', '🥈', '🥉']);
            assert.match(await page.locator('.cp-stats-facts').textContent(), /Age 👶/);
            assert.match(await page.locator('.cp-stats-facts').textContent(), /Biggest makeover 💄/);
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
            await button.click(); await button.click();
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
            assert.deepEqual(await page.locator('.cp-stats-percentage').allTextContents(), ['0.0%', '0.0%']);
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


test('statistics age emoji change at the specified day boundaries', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page);
        for (const [ageDays, icon] of [[null, '❓'], [0, '👶'], [89, '👶'], [90, '🧒'], [364, '🧒'], [365, '🧑'], [999, '🧑'], [1000, '🧓']]) {
            await page.locator('#cp-retry').click();
            await page.evaluate(ageDays => window.nextAnswer = { success: true, ageDays, founder: '', created: '', updateSetCount: 0, contributorCount: 0, added: 0, removed: 0, creators: [], destroyers: [], creatorSets: [], destroyerSets: [] }, ageDays);
            await page.getByRole('button', { name: 'Statistics', exact: true }).click();
            assert.equal(await page.locator('.cp-stats-facts dt').first().textContent(), 'Age ' + icon);
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
            window.GlideAjax = function () { this.addParam = () => {}; this.getXMLAnswer = callback => window.pendingFields.push(callback); };
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

test('dragging the shared splitter shrinks every attribution column and keeps headers aligned', async () => {
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
            assert.equal(after.length, 4);
            after.forEach((size, index) => assert.ok(size < before[index] * 0.6, 'Every column shrinks with the pane'));
            assert.equal(await splitter.getAttribute('aria-valuenow'), '15');
            assert.equal(await page.locator('.cp-splitter[aria-valuenow="15"]').count(), fixture.fields.length);
            for (const field of ['script', 'template']) {
                const current = page.locator('.cp-field-section[data-field="' + field + '"]');
                const columns = await current.evaluate(section => {
                    const headers = [...section.querySelectorAll('.cp-gutter-head span')].filter(node => getComputedStyle(node).display !== 'none');
                    const cells = [...section.querySelectorAll('.cp-attribution tr:first-child td')].filter(node => getComputedStyle(node).display !== 'none');
                    return cells.map((cell, index) => ({ left: cell.getBoundingClientRect().left - headers[index].getBoundingClientRect().left, width: cell.getBoundingClientRect().width - headers[index].getBoundingClientRect().width }));
                });
                columns.forEach(column => { assert.ok(Math.abs(column.left) < 1); assert.ok(Math.abs(column.width) < 1); });
                assert.equal(await current.locator('.cp-attribution .cp-update-set .cp-cell-text').first().evaluate(node => getComputedStyle(node).textOverflow), 'ellipsis');
            }
            await splitter.focus(); await page.keyboard.press('Home');
            assert.equal(await splitter.getAttribute('aria-valuenow'), '10');
            await page.keyboard.press('End');
            if (width > 760) {
                const timestamps = await page.locator('.cp-attribution tr:first-child .cp-time').evaluateAll(cells => cells.map(cell => ({
                    width: cell.getBoundingClientRect().width,
                    cap: parseFloat(cell.closest('.cp-field-section').style.getPropertyValue('--cp-time-width')),
                    clipped: cell.scrollWidth > cell.clientWidth,
                    headerWidth: cell.closest('.cp-field-section').querySelector('.cp-time-heading').getBoundingClientRect().width
                })));
                timestamps.forEach(time => {
                    assert.ok(Math.abs(time.width - time.cap) < 1, 'Updated stops growing once a full timestamp fits');
                    assert.ok(Math.abs(time.width - time.headerWidth) < 1, 'Updated header matches the capped cells');
                    assert.equal(time.clipped, false, 'Full timestamp fits at the maximum width');
                });
                await page.addStyleTag({ content: '#credit-plus .cp-gutter td { padding-left: 19px; padding-right: 19px; }' });
                await page.evaluate(() => creditEditor.updateOptions({ fontFamily: 'monospace', fontSize: 18, letterSpacing: 1.25 }));
                await page.waitForFunction(() => document.querySelector('.cp-field-section[data-field="template"] .cp-gutter-content').style.fontSize === '18px');
                const enlarged = await section.locator('.cp-attribution tr:first-child .cp-time').evaluate(cell => ({
                    width: cell.getBoundingClientRect().width, clipped: cell.scrollWidth > cell.clientWidth,
                    headerWidth: cell.closest('.cp-field-section').querySelector('.cp-time-heading').getBoundingClientRect().width
                }));
                assert.ok(enlarged.width > timestamps[1].width, 'Cap follows the rendered font and platform padding');
                assert.equal(enlarged.clipped, false, 'A larger timestamp is still fully visible');
                assert.ok(Math.abs(enlarged.width - enlarged.headerWidth) < 1);
            }
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
            const panel = document.getElementById('cp-statistics'), scroll = panel.scrollIntoView;
            panel.scrollIntoView = function (options) {
                window.statisticsScrolls.push({ behavior: options.behavior, visible: getComputedStyle(panel).display !== 'none' });
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
            creators:[{...window.batch.creators[0],added:2,removed:0}],
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
        assert.deepEqual(await part(field,'cp-attribution').locator('.cp-origin .cp-cell-text').allTextContents(),['Earlier author','Developer']);
        assert.equal(await page.evaluate(()=>window.creditOptions.length),1);
        await page.getByRole('button',{name:'Statistics',exact:true}).click();
        await page.waitForFunction(()=>window.workerStops===2);
        assert.deepEqual(await page.locator('.cp-stats-facts dd').allTextContents(),['3 days','Founder','2','2','3','1','Server script','Imported release']);
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
        assert.deepEqual(await part(field,'cp-attribution').locator('.cp-origin .cp-cell-text').allTextContents(),['Earlier author','Developer']);
        assert.deepEqual((await page.locator('.cp-stats-facts dd').allTextContents()).slice(2,6),['2','3','5','2']);
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
        const authors=()=>part(field,'cp-attribution').locator('.cp-origin .cp-cell-text').allTextContents();
        assert.deepEqual(await authors(),['Earlier author','Earlier author']);
        await page.getByRole('button',{name:'Statistics',exact:true}).click();
        await page.waitForFunction(()=>document.querySelectorAll('.cp-stats-board li').length>0);
        const totals=await page.locator('.cp-stats-facts dd').allTextContents();
        await page.getByRole('button',{name:'Whitespace settings',exact:true}).click();
        const popover=page.getByRole('dialog',{name:'Attribution and Statistics whitespace settings'});
        assert.equal(await popover.locator('input:checked').inputValue(),'all');
        await popover.getByLabel('Show all changes',{exact:true}).check();
        await openField(page);
        await page.waitForFunction(()=>document.querySelectorAll('.cp-stats-board li').length>0);
        assert.deepEqual(await authors(),['Developer','Developer']);
        assert.notDeepEqual(await page.locator('.cp-stats-facts dd').allTextContents(),totals);
        assert.equal(new URL(page.url()).searchParams.get('sysparm_whitespace'),'none');
        assert.equal(api.calls(),1);
        assert.equal(await page.evaluate(()=>window.creditOptions.at(-1).model.text),' one();\ntwo( );  ');
        assert.equal(await page.locator('.cp-field-section[open]').count(),1);
        // Opening a field can move focus away; reopen only when needed.
        if(!await popover.isVisible())await page.getByRole('button',{name:'Whitespace settings',exact:true}).click();
        await popover.getByLabel('Ignore whitespace when comparing lines',{exact:true}).check();
        await openField(page);
        assert.deepEqual(await authors(),['Earlier author','Earlier author']);
        assert.equal(new URL(page.url()).searchParams.has('sysparm_whitespace'),false);
        assert.equal(api.calls(),1);
        if(!await popover.isVisible())await page.getByRole('button',{name:'Whitespace settings',exact:true}).click();
        await page.keyboard.press('Escape');
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
        assert.equal(await board.evaluate(n=>n.clientHeight<n.scrollHeight && n.getBoundingClientRect().height<=innerHeight*.75+1),true);
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
        assert.equal(await page.locator('.cp-stats-facts dd').count(), 6);
        assert.deepEqual((await page.locator('.cp-stats-facts dd').allTextContents()).slice(-2), ['0', '0']);
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


test('Monaco attribution borders end each update-set group and stay consistent across fields and themes', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await initialise(page, 1280, true);
        await page.evaluate(() => {
            const first = window.fixture.updates[0], second = window.fixture.updates[1];
            first.updateSet.name = second.updateSet.name = 'Same name';
            window.fixture.updates.push(
                { ...first, id: '7'.repeat(32), author: 'Another author' },
                { ...first, id: '8'.repeat(32), updateSet: { ...first.updateSet, table: 'sys_remote_update_set' } },
                { ...first, id: '9'.repeat(32), updateSet: null },
            );
            window.fixture.lines = [first.id, '7'.repeat(32), second.id, null, '8'.repeat(32), second.id, '9'.repeat(32)]
                .map((update, index) => ({ number: index + 1, text: 'line' + index + '();', update }));
        });
        const field = await openField(page);
        const first = await page.evaluate(() => window.creditEditors[0].decorations);
        assert.deepEqual(first.map(d => [d.range.startLineNumber, d.range.endLineNumber]), [[2, 2], [3, 3], [5, 5], [6, 6]]);
        assert.equal(first.every(d => d.options.isWholeLine === true && d.options.marginClassName === d.options.className), true);
        assert.equal(first[1].options.className, first[3].options.className);
        assert.equal(new Set(first.map(d => d.options.className)).size, 3);
        await openField(page, 'client_script');
        assert.deepEqual(await page.evaluate(() => window.creditEditors[1].decorations), first);
        const colours = [];
        for (const background of ['255 255 255', '24 26 30']) {
            colours.push(await page.evaluate(({ background, decorations }) => {
                document.documentElement.style.setProperty('--now-color_background--primary', background);
                const editor = document.createElement('div'); editor.className = 'monaco-editor';
                document.getElementById('credit-plus').appendChild(editor);
                const values = decorations.map(decoration => {
                    const line = document.createElement('div'); line.className = decoration.options.className;
                    editor.appendChild(line);
                    const style = getComputedStyle(line);
                    return { background: style.backgroundColor, border: style.borderBottomColor, width: style.borderBottomWidth, style: style.borderBottomStyle };
                });
                editor.remove();
                return values;
            }, { background, decorations: first }));
        }
        assert.deepEqual(colours[0], colours[1]);
        assert.equal(new Set(colours[0].map(value => value.border)).size, 3);
        assert.equal(colours[0].every(value => {
            const alpha = Number(value.border.match(/, ([\d.]+)\)$/)?.[1]);
            return alpha > 0 && alpha <= 0.5 && value.width === '1px' && value.style === 'solid' && value.background === 'rgba(0, 0, 0, 0)';
        }), true, 'Group borders are subtle in both themes without filling lines');
        const rows = await part(field, 'cp-attribution').locator('tr').evaluateAll(rows => rows.map(row => ({
            number: Number(row.dataset.lineNumber), className: row.className,
            border: getComputedStyle(row).borderBottomColor, width: getComputedStyle(row).borderBottomWidth,
            height: row.getBoundingClientRect().height,
        })));
        assert.deepEqual(rows.filter(row => row.width === '1px').map(row => row.number), [2, 3, 5, 6]);
        assert.equal(rows.every(row => row.height === 24), true, 'Borders do not change attribution row heights');
        first.forEach((decoration, index) => {
            const row = rows[decoration.range.endLineNumber - 1];
            assert.equal(row.className, decoration.options.className);
            assert.equal(row.border, colours[0][index].border, 'Borders extend across the left attribution columns');
        });
        await menuAction(page, setCell(field), 'Quick compare');
        assert.equal(await page.evaluate(() => window.creditEditors.at(-1).decorations), undefined);
        await part(field, 'cp-diff-close').click();
        assert.deepEqual(await page.evaluate(() => window.creditEditors.at(-1).decorations), first);
        await field.locator('summary').click();
        await openField(page);
        assert.deepEqual(await page.evaluate(() => window.creditEditors.at(-1).decorations), first);
        await chooseSet(page, original);
        await openField(page);
        assert.deepEqual(await page.evaluate(() => window.creditEditors.at(-1).decorations), first);
    } finally { await browser.close(); }
});

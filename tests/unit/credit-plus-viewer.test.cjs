const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const html = fs.readFileSync('src/fluent/generated/other/sys-ui-page/credit_plus.html', 'utf8');
assert.match(fs.readFileSync('src/fluent/generated/other/sys-ui-page/widget_editor_compare.html', 'utf8'), /credit_update:\s*_weDiffConfigParams.get\('credit_update'\)/);
const client = fs.readFileSync('src/fluent/generated/other/sys-ui-page/credit_plus.client.js', 'utf8');
const markup = html.match(/<style>([\s\S]*?)<\/style>/)[0] + html.match(/<main[\s\S]*?<\/main>/)[0];
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)[1];
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
            window.creditEditor = editor; return editor;
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
    await page.waitForFunction(name => { const section = document.querySelector('.cp-field-section[data-field="' + name + '"]'); return section.querySelector('[id$="-current-panel"]').hidden || !section.querySelector('[id$="-code-view"]').hidden || section.querySelector('[id$="-lines"]').children.length > 0 || section.querySelector('summary .da-diff-counts').textContent === '0 lines'; }, name);
    return section;
}
async function chooseSet(page, id) {
    await page.locator('#cp-update-button').click();
    await page.locator('#cp-update-menu [data-value="' + id + '"]').click();
}
function part(section, id) { return section.locator('[id$="' + id.replace(/^cp/, '') + '"]'); }
async function menuAction(page, cell, label) {
    await cell.click({ button: 'right' });
    await page.locator('#cp-context-menu').getByRole('menuitem', { name: label, exact: true }).click();
}
function setCell(section) { return section.locator('[data-context-kind="update set"]').first(); }
async function initialise(page, width = 1280, monaco = false) {
    await page.setViewportSize({ width, height: 850 });
    await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html', body: markup }));
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
    await page.addScriptTag({ content: client });
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
            await page.locator('#cp-retry').click(); assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
            await page.evaluate(() => window.fixture.lines = []);
            const empty = await openField(page);
            assert.equal(await part(empty, 'cp-field-status').textContent(), '');
            assert.equal(await part(empty, 'cp-lines').locator('.cp-empty').textContent(), 'No code in this update set.');
            assert.equal(await part(empty, 'cp-lines').locator('.cp-empty').getAttribute('colspan'), '5');
            await page.close();
        }
    } finally { await browser.close(); }
});


test('viewer ignores stale responses after a timeout and allows retry', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html', body: markup }));
        await page.goto('https://credit.test/?sysparm_update=' + update);
        await page.evaluate(() => {
            window.pending = [];
            window.setTimeout = (callback, delay) => { if (delay === 30000) window.expire = callback; return 1; };
            window.clearTimeout = () => {};
            window.GlideAjax = function () { this.addParam = () => {}; this.getXMLAnswer = callback => window.pending.push(callback); };
        });
        await page.addScriptTag({ content: client });
        await page.evaluate(() => window.expire());
        assert.match(await page.locator('#cp-status').textContent(), /timed out/);
        await page.locator('#cp-retry').click();
        await page.evaluate(fixture => window.pending[0](JSON.stringify(fixture)), fixture);
        assert.match(await page.locator('#cp-status').textContent(), /Loading/);
        await page.evaluate(fixture => window.pending[1](JSON.stringify(fixture)), fixture);
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
        await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html', body: markup }));
        await page.goto('https://credit.test/?sysparm_update=' + update);
        await page.evaluate(installMonaco);
        await page.evaluate(fixture => {
            fixture = { ...fixture, lines: Array.from({ length: 120 }, (_, i) => ({ number: i + 1, text: 'code();', update: fixture.selected })) };
            window.GlideAjax = function () { this.addParam = () => {}; this.getXMLAnswer = callback => callback(JSON.stringify(fixture)); };
        }, fixture);
        await page.addScriptTag({ content: client });
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

test('Polaris captures the record title before asynchronous credit loading and history tracks fields/views', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html', body: route.request().url().endsWith('/host')
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
        await frame.addScriptTag({ content: client });
        assert.equal(await frame.title(), 'Credit: My widget (Widget) - My instance');
        assert.equal(await frame.evaluate(() => window.calls[0].sysparm_update), update);
        assert.equal(await frame.evaluate(() => window.calls[0].sysparm_version), undefined);
        await frame.evaluate(() => window.finishLoading());
        await page.waitForFunction(() => document.title === 'Credit: My widget (Widget) - My instance');
        assert.equal(await frame.evaluate(() => window.historyEntries.at(-1).title), 'Credit: My widget (Widget)');
        await frame.locator('.cp-field-section[data-field="client_script"] summary').click();
        await frame.waitForFunction(() => window.calls.length === 2);
        await frame.evaluate(() => window.finishLoading());
        assert.equal(await page.locator('#shell-title').textContent(), await page.title());
        assert.match(await frame.evaluate(() => window.historyEntries.at(-1).description), /My widget \(Widget\).*Client script/);
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
        await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html', body: route.request().url().endsWith('/host')
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
            assert.equal(await page.locator('#cp-inspect-version').inputValue(), original);
            assert.equal(new URL(page.url()).searchParams.get('sysparm_update'), original);
            assert.equal(await page.locator('.cp-field-section[open]').count(), 0);
            assert.equal(await page.evaluate(() => window.calls.at(-1).params.sysparm_context), 'true');
            assert.equal(await page.locator('#cp-update-menu .dc-version-dd-item').count(), 3);
            await page.locator('#cp-update-button').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
            assert.equal(await page.locator('#cp-inspect-version').inputValue(), 'd'.repeat(32));
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
        await page.route('https://credit.test/**', route => route.fulfill({ contentType: 'text/html', body: markup }));
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
        await page.addScriptTag({ content: client });
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
        assert.equal(await page.locator('#cp-inspect-version option').count(), 0);
        assert.equal(new URL(page.url()).searchParams.has('sysparm_update'), false);
        assert.equal(new URL(page.url()).searchParams.has('sysparm_record'), false);
        assert.equal(await page.evaluate(() => window.pickers['cp-record-input'].value), null);
        await page.evaluate(() => window.pendingRecords(JSON.stringify({ success: true, results: [{ id: 'old', text: 'Old widget' }] })));
        assert.equal(await page.evaluate(() => window.pickers['cp-record-input'].result), null, 'Stale results from another table are discarded');
        await page.evaluate(() => window.choosePicker('cp-record-input', { id: '0'.repeat(32), text: 'No history' }));
        assert.match(await page.locator('#cp-status').textContent(), /No Customer Updates/);
        assert.equal(await page.locator('#cp-status').getAttribute('class'), '');
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
        assert.equal(await page.locator('#cp-inspect-version').inputValue(), 'e'.repeat(32));
        const params = await page.evaluate(() => window.calls.at(-1));
        assert.equal(params.processor, 'CreditPlus');
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
            window.setTimeout = (callback, delay) => delay === 30000 ? (window.expire = callback, 123) : setTimeout(callback, delay);
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
        assert.equal(await part(section, 'cp-fallback-loading').isVisible(), true);
        await page.evaluate(() => window.expire());
        assert.equal(await part(section, 'cp-fallback-loading').isVisible(), false);
        assert.match(await part(section, 'cp-field-status').textContent(), /timed out/);
        await part(section, 'cp-field-retry').click();
        await page.evaluate(fixture => window.pending[0].callback(JSON.stringify(fixture)), fixture);
        assert.equal(await part(section, 'cp-field-status').textContent(), '');
        assert.equal(await part(section, 'cp-fallback-loading').isVisible(), true);
        assert.equal(await part(section, 'cp-fallback-loading').textContent(), 'Loading…');
        assert.equal(await part(section, 'cp-fallback-loading').evaluate(node => node.getBoundingClientRect().left >= node.previousElementSibling.getBoundingClientRect().right), true);
        await page.setViewportSize({ width: 600, height: 850 });
        assert.equal(await part(section, 'cp-fallback-loading').isVisible(), true);
        await page.setViewportSize({ width: 1280, height: 850 });
        await page.evaluate(fixture => window.pending[1].callback(JSON.stringify(fixture)), fixture);
        assert.equal(await part(section, 'cp-code-loading').isVisible(), false);
        assert.equal(await part(section, 'cp-code-view').isVisible(), true);
        const html = page.locator('.cp-field-section[data-field="template"]');
        await html.locator('summary.da-summary').click(); await page.waitForFunction(() => window.pending.length === 3);
        await html.locator('summary.da-summary').click();
        await page.evaluate(fixture => window.pending[2].callback(JSON.stringify({ ...fixture, field: 'template' })), fixture);
        assert.equal(await page.evaluate(() => window.creditOptions.length), 1, 'Collapsed fields do not create an editor when their response arrives');
        await openField(page, 'template');
        assert.equal(await page.evaluate(() => window.pending.length), 3, 'Completed data is reused when reopened');
        await page.locator('.cp-field-section[data-field="condition"] summary.da-summary').click();
        await page.waitForFunction(() => window.pending.length === 4);
        await chooseSet(page, original);
        await page.evaluate(fixture => window.pending[3].callback(JSON.stringify({ ...fixture, field: 'condition' })), fixture);
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
            await page.route('https://compare.test/**', route => route.fulfill({ contentType: 'text/html', body: route.request().url().endsWith('/host') ? '<title>Credit: My widget</title><iframe src="/comparison"></iframe>' : '<div id="we-diff-app"></div>' }));
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
                        else if (name === 'CreditPlus' && params.sysparm_name === 'getComparison') result = denied ? { success: false, error: 'Administrator access is required.' } : { success: true, table: 'sp_widget', record, recordName: 'My widget', left: { sys_id: original, sys_created_on: '2026-10-02 00:00:00', sys_created_by: 'Earlier author', fields: { script: 'before();' }, update_set_name: 'Earlier set', update_set_table: 'sys_update_set' }, right: { sys_id: update, sys_created_on: '2026-10-01 00:00:00', sys_created_by: 'Developer', fields: { script: 'after();' }, update_set_name: 'Imported set', update_set_sys_id: 'f'.repeat(32), update_set_table: 'sys_remote_update_set' } };
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
            window.setTimeout = function (callback, delay) { if (delay === 30000) window.expireComparison = callback; return timeout(callback, delay); };
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
            return route.fulfill({ contentType: 'text/html', body: isShell
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
            await frame.addScriptTag({ content: client });
            return frame;
        }
        await page.evaluate(() => history.replaceState({shellState:'preserved'}, '', location.href));
        let frame = await initialiseFrame();
        await page.waitForFunction(() => document.getElementById('shell-title').textContent.includes('My widget (Widget)'));
        await chooseSet(frame, original);
        assert.equal(new URL('https://credit.test/' + decodeURIComponent(new URL(page.url()).pathname.slice(prefix.length))).searchParams.get('sysparm_update'), original);
        assert.equal(await page.evaluate(() => history.state.shellState), 'preserved');
        const entry = await frame.evaluate(() => window.historyEntries.at(-1));
        assert.match(entry.title, /My widget \(Widget\)/);
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
        assert.equal(await frame.locator('#cp-inspect-version').inputValue(), original);
        assert.equal(await frame.locator('#cp-statistics').isVisible(), true);
        assert.equal(await frame.evaluate(() => window.statisticsCalls), 1);
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
            assert.equal(await page.locator('.cp-stats-board').count(), 4);
            assert.equal(await page.locator('.cp-stats-board').first().locator('li').count(), 4);
            assert.equal(await page.locator('#cp-statistics img').count(), 0);
            assert.equal(await page.locator('#cp-statistics-heading').textContent(), 'Statistics 📊');
            assert.deepEqual(await page.locator('.cp-stats-board h3').allTextContents(), ['Builders 👷 · Created by 👤', 'Destroyers 💥 · Created by 👤', 'Expansion packs 🏗️ · Update sets 📦', 'Demolition kits 🧨 · Update sets 📦']);
            assert.equal(await page.locator('.cp-stats-skeleton').count(), 0);
            assert.match(await page.locator('.cp-stats-facts').textContent(), /42 days/);
            assert.equal(await page.locator('.cp-stats-note').count(), 0);
            assert.deepEqual(await page.locator('.cp-stats-board').first().locator('li [aria-hidden=true]').allTextContents(), ['🥇', '🥈', '🥉']);
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
            assert.equal(await page.locator('.cp-stats-board').first().locator('li .cp-stats-name').first().textContent(), '<img src=x onerror=alert(1)> 🥇');
            assert.equal(await page.locator('#cp-statistics').evaluate(node => node.scrollWidth <= node.clientWidth), true);
            await button.click(); await button.click();
            assert.equal(await page.evaluate(() => window.statsRequests.length), 1);
            await page.screenshot({ path: '/tmp/credit-statistics-' + width + '.png', fullPage: true });
            await chooseSet(page, original);
            assert.equal(await page.locator('#cp-statistics').isVisible(), false);
            await button.click();
            assert.equal(await page.evaluate(() => window.statsRequests[1].params.sysparm_update), original);
            await chooseSet(page, update);
            await page.evaluate(() => window.statsRequests[1].callback(JSON.stringify(window.statsFixture)));
            assert.equal(await page.locator('#cp-statistics-content').textContent(), '');
            await button.click();
            await page.evaluate(() => window.statsRequests[2].callback(JSON.stringify({ success: false, error: 'History unavailable.' })));
            assert.equal(await page.locator('#cp-statistics-status').textContent(), 'History unavailable.');
            await page.getByRole('button', { name: 'Retry statistics' }).click();
            await page.evaluate(() => window.statsRequests[3].callback(JSON.stringify(window.statsFixture)));
            assert.equal(await page.locator('.cp-stats-board').count(), 4);
            await page.close();
        }
    } finally { await browser.close(); }
});

test('statistics timeout allows retry and discards the expired response', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage(); await initialise(page);
        await page.evaluate(() => {
            const originalTimeout = window.setTimeout;
            window.setTimeout = (callback, delay) => { if (delay === 30000) { window.expireStats = callback; return 0; } return originalTimeout(callback, delay); };
            window.statsCallbacks = [];
            window.GlideAjax = function () { this.addParam = () => {}; this.getXMLAnswer = callback => window.statsCallbacks.push(callback); };
        });
        await page.getByRole('button', { name: 'Statistics', exact: true }).click();
        await page.evaluate(() => window.expireStats());
        assert.match(await page.locator('#cp-statistics-status').textContent(), /timed out/);
        assert.equal(await page.locator('.cp-stats-skeleton').count(), 0);
        await page.evaluate(() => window.statsCallbacks[0](JSON.stringify({success:false,error:'Stale error'})));
        assert.match(await page.locator('#cp-statistics-status').textContent(), /timed out/);
        assert.equal(await page.locator('.cp-stats-skeleton').count(), 0);
        await page.getByRole('button', { name: 'Retry statistics' }).click();
        await page.evaluate(() => window.statsCallbacks[1]('not JSON'));
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

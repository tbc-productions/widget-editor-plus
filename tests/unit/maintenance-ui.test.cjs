const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, expect } = require('@playwright/test');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { readFluentField } = require('../helpers/fluent-source.cjs');
const { harness, id } = require('../helpers/maintenance-harness.cjs');

const path = 'src/fluent/generated/other/sys-ui-page/';
const html = readFluentField(path + 'sys_ui_page_widget_editor_plus_properties.now.ts', 'html');
const section = html.match(/<section id="wep-maintenance"[\s\S]*?<\/section>/)[0];
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const script = fs.readFileSync(path + 'widget_editor_maintenance.client.js', 'utf8');
const propertiesScript = fs.readFileSync(path + 'widget_editor_plus_properties.client.js', 'utf8');
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function mount(h = harness(), width = 1280, fullProperties = false, {holdProperties = false, holdHierarchy = false, dark = false, propertiesError = false} = {}) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let releaseProperties;
    const ready = new Promise(resolve => { releaseProperties = resolve; });
    let hierarchyRequested;
    const hierarchyStarted = new Promise(resolve => { hierarchyRequested = resolve; });
    const theme = dark ? ':root { --now-color_background--primary:7,8,11;--now-color_background--secondary:21,25,32;--now-color_border--secondary:94,101,116;--now-color_text--primary:255,255,255;--now-color_text--secondary:193,197,205;--now-color_chrome--brand-5:48,47,75;--now-color--neutral-0:255,255,255; } .btn { background:rgb(7,8,11);color:rgb(132,134,255);border:1px solid rgb(132,134,255);border-radius:4px;padding:0 10px;font:700 14px/14px Arial,sans-serif;cursor:pointer;} .btn:disabled{opacity:.5;cursor:default;} a{color:rgb(132,134,255)} .text-danger{color:rgb(240,142,150)} .form-control{background:rgb(7,8,11);color:white;border:1px solid rgb(94,101,116);border-radius:4px;padding:8px;} .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' : '';
    await page.route('http://widget-editor.test/**', async route => {
        if (route.request().method() === 'POST') {
            const { method, params } = route.request().postDataJSON();
            if (method === 'getProperties' && holdProperties) await ready;
            if (method === 'getRules' && holdHierarchy) {
                hierarchyRequested();
                await ready;
            }
            const result = method === 'getProperties'
                ? propertiesError ? {success:false,error:'Unable to load properties.'} : { success: true, properties: [{ name: 'monaco.plus.record_limit', description: 'Record limit.', value: '500', type: 'integer' }].concat(holdHierarchy ? [{name:'monaco.plus.update_sets.markdown_groups',description:'Table hierarchy.',value:'{}',type:'string'}] : []) }
                : method === 'getRules' && holdHierarchy ? {success:true,config:{},rules:{groups:Array.from({length:35},(_,i)=>({id:'group_'+i,table:'table_'+i,label:'Table '+i,children:[]}))}}
                : h.call(method, params);
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
        } else await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<style>' + style + theme + '</style>' + (fullProperties
            ? html.slice(html.indexOf('<div class="wep-shell">'), html.lastIndexOf('</j:jelly>'))
            : '<main class="container-fluid wep-app">' + section + '</main>') });
    });
    await page.addInitScript(() => {
        window.GlideAjax = function () {
            const params = {};
            this.addParam = (key, value) => { params[key] = value; };
            this.getXMLAnswer = async callback => {
                const response = await fetch('/maintenance', { method: 'POST', body: JSON.stringify({ method: params.sysparm_name, params }) });
                callback(await response.text());
            };
        };
    });
    await page.goto('http://widget-editor.test/');
    if (fullProperties) await page.addScriptTag({ content: propertiesScript });
    await page.addScriptTag({ content: script });
    return { page, h, errors, releaseProperties, hierarchyStarted };
}

test('maintenance is the final Properties section, with shared navigation, search and keyboard accordions', async () => {
    const { page, errors } = await mount(harness(), 390, true);
    try {
        const jump = page.getByRole('link', { name: 'Backup and uninstall', exact: true });
        const heading = page.getByRole('heading', { name: 'Backup and uninstall', exact: true });
        await expect(jump).toBeVisible();
        assert.equal(await page.locator('#wep-sections .wep-section').last().getAttribute('id'), 'wep-maintenance');
        assert.equal(await page.locator('#wep-maintenance details.wep-card').count(), 3);
        assert.equal(await page.locator('#wep-maintenance details[open]').count(), 0);
        await page.getByRole('searchbox', { name: 'Search properties' }).fill('record_limit');
        await expect(heading).toBeHidden();
        await jump.click();
        await expect(page.getByRole('searchbox')).toHaveValue('');
        await expect(heading).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(page.locator('#wep-export-details summary')).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('button', { name: 'Export all users’ preferences' })).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('button', { name: 'Export all users’ preferences' })).toBeHidden();
        await page.getByRole('searchbox').fill('restore');
        await expect(heading).toBeVisible();
        await expect(page.locator('#wep-export-details')).toBeHidden();
        await expect(page.locator('#wep-restore-details')).toBeVisible();
        await expect(page.locator('#wep-uninstall-details')).toBeHidden();
        await page.getByRole('searchbox').fill('');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: '/tmp/widget-editor-maintenance-section.png', fullPage: true });
    } finally { await page.close(); }
});

test('Debug Menu has navigation, searchable accordions and an exact copyable embed snippet', async () => {
    for(const width of [1280,390]){
        const {page,errors}=await mount(harness(),width,true,{dark:width===390});
        try {
            const jump=page.getByRole('link',{name:'Debug Menu',exact:true});
            const heading=page.getByRole('heading',{name:'Debug Menu',exact:true});
            await expect(jump).toBeVisible();
            await expect(page.locator('#wep-debug-menu details')).toHaveCount(1);
            await expect(page.locator('#wep-debug-menu details[open]')).toHaveCount(0);
            assert.equal(await page.locator('#wep-debug-menu').evaluate(el=>el.nextElementSibling.id),'wep-maintenance');
            await page.getByRole('searchbox').fill('record_limit');
            await expect(heading).toBeHidden();
            await jump.click();
            await expect(heading).toBeFocused();
            await expect(page.getByRole('searchbox')).toHaveValue('');
            await page.locator('#wep-debug-menu summary').filter({hasText:'Embed widget'}).click();
            const snippet='<widget id="widget_editor_debug_menu"></widget>';
            await expect(page.locator('#wep-debug-menu-code')).toHaveText(snippet);
            await expect(page.locator('#wep-debug-menu widget')).toHaveCount(0);
            await page.evaluate(()=>{
                Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{
                    if(window.clipboardDenied) throw new Error('Denied');
                    window.copiedSnippet=text;
                }}});
            });
            await page.getByRole('button',{name:'Copy code',exact:true}).click();
            await expect(page.getByRole('button',{name:'Copied',exact:true})).toBeVisible();
            assert.equal(await page.evaluate(()=>window.copiedSnippet),snippet);
            await page.screenshot({path:'/tmp/widget-editor-debug-menu-'+width+'.png'});
            await page.evaluate(()=>{window.clipboardDenied=true;});
            await page.locator('#wep-copy-debug-menu').click();
            await expect(page.locator('#wep-copy-debug-menu-error')).toBeVisible();
            await page.getByRole('searchbox').fill('widget_editor_debug_menu');
            await expect(heading).toBeVisible();
            await expect(page.locator('#wep-copy-debug-menu')).toBeVisible();
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
            assert.deepEqual(errors,[]);
        }finally{await page.close();}
    }
});

test('back to top is a round floating retina icon button with keyboard and reduced-motion support', async () => {
    for(const width of [1280,390]){
        const {page,errors}=await mount(harness(),width,true);
        try {
            await page.emulateMedia({reducedMotion:width===390?'reduce':'no-preference'});
            const back=page.getByRole('button',{name:'Back to top',exact:true});
            await expect(back).toBeHidden();
            await page.getByRole('link',{name:'Backup and uninstall',exact:true}).click();
            await expect(back).toBeVisible();
            await expect(back.locator('.icon-chevron-up[aria-hidden="true"]')).toHaveCount(1);
            await expect(back).toHaveText('');
            const geometry=await back.evaluate(el=>({position:getComputedStyle(el).position,radius:getComputedStyle(el).borderRadius,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,right:innerWidth-el.getBoundingClientRect().right,bottom:innerHeight-el.getBoundingClientRect().bottom}));
            assert.deepEqual(geometry,{position:'fixed',radius:'50%',width:44,height:44,right:20,bottom:20});
            await page.evaluate(()=>{
                const scroll=window.scrollTo;
                window.scrollTo=function(options){window.backToTopBehaviour=options.behavior;scroll.call(window,options);};
            });
            await back.focus();
            await page.keyboard.press('Enter');
            await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
            await expect(page.getByRole('heading',{name:'Widget Editor+ Properties',exact:true})).toBeFocused();
            await expect(back).toBeHidden();
            assert.equal(await page.evaluate(()=>window.backToTopBehaviour),width===390?'auto':'smooth');
            assert.deepEqual(errors,[]);
        }finally{await page.close();}
    }
});

test('the first jump aligns the collapsed final section below the sticky header', async () => {
    for (const width of [1280, 390]) {
        const { page } = await mount(harness(), width, true);
        try {
            await page.getByRole('link', { name: 'Backup and uninstall', exact: true }).click();
            await expect.poll(() => page.locator('#wep-maintenance').evaluate(section => {
                const header = document.getElementById('wep-header');
                return Math.abs(section.getBoundingClientRect().top - header.getBoundingClientRect().bottom - 16);
            })).toBeLessThan(2);
            await expect(page.locator('#wep-maintenance details[open]')).toHaveCount(0);
        } finally { await page.close(); }
    }
});

test('initial loading waits for the hierarchy before exposing jump buttons', async () => {
    for (const width of [1280, 390]) {
        const { page, releaseProperties, hierarchyStarted, errors } = await mount(harness(), width, true, {holdHierarchy:true});
        try {
            await hierarchyStarted;
            await expect(page.locator('#wep-loading')).toBeVisible();
            await expect(page.getByRole('link', {name:'Backup and uninstall',exact:true})).toBeHidden();
            releaseProperties();
            await expect(page.locator('.wep-rule-table tbody tr')).toHaveCount(36);
            await page.getByRole('link', {name:'Backup and uninstall',exact:true}).click();
            await expect.poll(() => page.locator('#wep-maintenance').evaluate(section =>
                Math.abs(section.getBoundingClientRect().top - document.getElementById('wep-header').getBoundingClientRect().bottom - 16)
            )).toBeLessThan(2);
            assert.deepEqual(errors,[]);
        } finally { releaseProperties(); await page.close(); }
    }
});

test('review, backup acknowledgement and typed confirmation gate uninstall; option changes invalidate review', async () => {
    const { page, h, errors } = await mount();
    try {
        await expect(page.locator('#wep-delete-preferences')).not.toBeChecked();
        await expect(page.locator('#wep-backup-required')).toBeChecked();
        await page.locator('#wep-uninstall-details summary.panel-heading').click();
        await page.getByRole('button', { name: 'Review records to remove' }).click();
        await expect(page.locator('#wep-uninstall-count')).toContainText('3 preferences kept');
        await expect(page.locator('#wep-uninstall-records tr')).toHaveCount(8);
        await expect(page.getByLabel('Type UNINSTALL to confirm')).toBeDisabled();
        await expect(page.locator('#wep-uninstall')).toBeDisabled();
        const downloaded = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download backup' }).click();
        const xml = fs.readFileSync(await (await downloaded).path(), 'utf8');
        assert.equal(XMLValidator.validate(xml), true);
        assert.equal(new XMLParser().parse(xml).unload.sys_user_preference.length, 3);
        await expect(page.getByLabel('Type UNINSTALL to confirm')).toBeDisabled();
        await page.getByLabel('I have saved the backup').check();
        await expect(page.getByLabel('Type UNINSTALL to confirm')).toBeEnabled();
        await page.getByLabel('Type UNINSTALL to confirm').fill('UNINSTALL');
        await expect(page.locator('#wep-uninstall')).toBeEnabled();
        await page.getByLabel('Delete all users’ app preferences').check();
        await expect(page.locator('#wep-uninstall-preview')).toBeHidden();
        await page.getByRole('button', { name: 'Review records to remove' }).click();
        await expect(page.locator('#wep-uninstall-records tr')).toHaveCount(11);
        await page.getByLabel('Back up records and preferences first (recommended)').uncheck();
        await page.getByRole('button', { name: 'Review records to remove' }).click();
        await expect(page.locator('#wep-uninstall-preview')).toBeVisible();
        await page.locator('#wep-uninstall-confirmation').fill('UNINSTALL');
        await page.locator('#wep-uninstall').click();
        await expect(page.locator('#wep-uninstall-status')).toContainText('Uninstall complete');
        assert.equal(h.database.sys_user_preference.length, 1);
        await expect(page.locator('#wep-export-preferences')).toBeDisabled();
        assert.deepEqual(errors, []);
    } finally { await page.close(); }
});

test('both exports use their original button to cancel and keep status alongside it', async () => {
    for(const backup of [true,false]){
    const h = harness({securityAdmin:backup});
    for (let n=300;n<335;n++) {
        if(backup) h.database.sys_properties.push({sys_id:id(n),name:'monaco.plus.test_'+n,value:'test'});
        else h.database.sys_user_preference.push({sys_id:id(n),name:'monaco_plus.user_prefs',user:id(n+100),value:'{}'});
    }
    const buttonName=backup?'Download backup':'Export all users’ preferences';
    const buttonId=backup?'wep-download-backup':'wep-export-preferences';
    const statusId=backup?'#wep-backup-status':'#wep-export-status';
    const {page,errors}=await mount(h);
    let release, started;
    const held=new Promise(resolve=>{release=resolve;});
    const secondBatch=new Promise(resolve=>{started=resolve;});
    let batches=0, downloads=0;
    page.on('download',()=>downloads++);
    await page.route('**/maintenance',async route=>{
        if(route.request().postDataJSON().method==='exportSuiteMaintenance' && ++batches===2){
            started(); await held;
        }
        await route.fallback();
    });
    try {
        if(backup){
            await page.locator('#wep-uninstall-details summary.panel-heading').click();
            await page.getByRole('button',{name:'Review records to remove'}).click();
        }else await page.locator('#wep-export-details summary').click();
        await page.getByRole('button',{name:buttonName}).click();
        await secondBatch;
        const cancel=page.getByRole('button',{name:'Cancel export',exact:true});
        await expect(cancel).toHaveAttribute('id',buttonId);
        await expect(page.locator(statusId)).toContainText('Exported 20 of');
        const buttonBox=await cancel.boundingBox(),statusBox=await page.locator(statusId).boundingBox();
        assert.ok(statusBox.x>buttonBox.x+buttonBox.width);
        assert.ok(Math.abs(statusBox.y+statusBox.height/2-buttonBox.y-buttonBox.height/2)<2);
        await expect(page.locator('#wep-uninstall-status')).toBeHidden();
        await cancel.click();
        await expect(cancel).toBeDisabled();
        release();
        await expect(page.getByRole('button',{name:buttonName})).toBeEnabled();
        await expect(page.locator(statusId)).toHaveText('Export cancelled.');
        await expect(page.locator(statusId)).toHaveClass('alert alert-danger');
        assert.equal(await page.locator(statusId).evaluate(el=>el.getBoundingClientRect().top>=el.previousElementSibling.getBoundingClientRect().bottom),true);
        await expect(page.locator('#wep-backup-saved-label')).toBeHidden();
        assert.equal(batches,2);
        assert.equal(downloads,0);
        const download=page.waitForEvent('download');
        await page.getByRole('button',{name:buttonName}).click();
        await download;
        await expect(page.locator(statusId)).toContainText('Exported '+(backup?46:38)+' records.');
        await expect(page.locator(statusId)).toHaveClass('alert alert-info');
        assert.equal(await page.locator(statusId).evaluate(el=>el.getBoundingClientRect().top>=el.previousElementSibling.getBoundingClientRect().bottom),true);
        await expect(page.getByRole('button',{name:buttonName})).toBeEnabled();
        assert.deepEqual(errors,[]);
    } finally {release();await page.close();}
    }
});

test('empty preference exports show an info alert without downloading; shared defaults still export', async () => {
    for(const width of [1280,390]){
        const h=harness({securityAdmin:false});
        h.database.sys_user_preference=h.database.sys_user_preference.filter(row=>row.name==='unrelated.preference');
        const {page,errors}=await mount(h,width);
        let downloads=0,exports=0;
        page.on('download',()=>downloads++);
        await page.route('**/maintenance',async route=>{
            if(route.request().postDataJSON().method==='exportSuiteMaintenance') exports++;
            await route.fallback();
        });
        try {
            await page.locator('#wep-export-details summary').click();
            await page.getByRole('button',{name:'Export all users’ preferences'}).click();
            await expect(page.locator('#wep-export-status')).toHaveText('No preferences found.');
            await expect(page.locator('#wep-export-status')).toHaveClass('alert alert-info');
            await expect(page.getByRole('button',{name:'Export all users’ preferences'})).toBeEnabled();
            assert.equal(downloads,0);
            assert.equal(exports,0);
            assert.equal(await page.locator('#wep-export-status').evaluate(el=>el.getBoundingClientRect().top>=el.previousElementSibling.getBoundingClientRect().bottom),true);
            h.database.sys_user_preference.push({sys_id:id(1000),name:'monaco_plus.user_prefs',user:'',value:'{}'});
            const download=page.waitForEvent('download');
            await page.getByRole('button',{name:'Export all users’ preferences'}).click();
            await download;
            await expect(page.locator('#wep-export-status')).toHaveText('Exported 1 record.');
            assert.equal(downloads,1);
            assert.deepEqual(errors,[]);
        }finally{await page.close();}
    }
});

test('preference export can be cancelled while its preview is still loading', async () => {
    const {page}=await mount(harness({securityAdmin:false}));
    let release, exports=0;
    const held=new Promise(resolve=>{release=resolve;});
    await page.route('**/maintenance',async route=>{
        const method=route.request().postDataJSON().method;
        if(method==='previewSuiteMaintenance') await held;
        if(method==='exportSuiteMaintenance') exports++;
        await route.fallback();
    });
    try {
        await page.locator('#wep-export-details summary').click();
        await page.locator('#wep-export-preferences').click();
        const cancel=page.getByRole('button',{name:'Cancel export',exact:true});
        await expect(cancel).toBeEnabled();
        await cancel.click();
        await expect(cancel).toBeDisabled();
        release();
        await expect(page.getByRole('button',{name:'Export all users’ preferences'})).toBeEnabled();
        await expect(page.locator('#wep-export-status')).toHaveText('Export cancelled.');
        assert.equal(exports,0);
    } finally {release();await page.close();}
});

test('uninstall displays progress while pending and clears it after success or failure', async () => {
    for(const fail of [false,true]){
        const {page,h,errors}=await mount(harness(),1280,true);
        if(fail) h.faults.deleteId=id(1);
        let release;
        const held=new Promise(resolve=>{release=resolve;});
        await page.route('**/maintenance',async route=>{
            if(route.request().postDataJSON().method==='uninstallSuite') await held;
            await route.fallback();
        });
        try {
            await page.locator('#wep-uninstall-details summary.panel-heading').click();
            await page.getByLabel('Back up records and preferences first (recommended)').uncheck();
            await page.getByRole('button',{name:'Review records to remove'}).click();
            await page.getByLabel('Type UNINSTALL to confirm').fill('UNINSTALL');
            await page.locator('#wep-uninstall').click();
            const progress=page.getByRole('progressbar',{name:'Uninstalling Widget Editor+ apps'});
            await expect(progress).toBeVisible();
            await expect(progress).toHaveClass('progress-bar progress-bar-striped active');
            await expect(progress).not.toHaveAttribute('aria-valuenow');
            await expect(page.locator('#wep-uninstall-status')).toHaveText('Uninstalling…');
            await expect(page.locator('#wep-uninstall-status')).toHaveClass('');
            await expect(page.locator('#wep-uninstall')).toBeDisabled();
            release();
            await expect(page.locator('#wep-uninstall-status')).toContainText(fail?'Could not delete':'Uninstall complete');
            await expect(page.locator('#wep-uninstall-status')).toHaveClass(fail?'alert alert-danger':'alert alert-info');
            await expect(progress).toBeHidden();
            await expect(page.locator('#wep-back-to-top')).toBeEnabled();
            assert.deepEqual(errors,[]);
        } finally {release();await page.close();}
    }
});

test('preferences export and restore works independently and updates matching users across changed preference IDs', async () => {
    const { page, h, errors } = await mount(harness({securityAdmin:false}));
    try {
        await page.locator('#wep-export-details summary').click();
        const downloaded = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export all users’ preferences' }).click();
        const xml = fs.readFileSync(await (await downloaded).path(), 'utf8');
        assert.equal(XMLValidator.validate(xml), true);
        assert.equal(xml.includes('<sys_app '), false);
        await expect(page.locator('#wep-export-status')).toContainText('Exported 3 records');
        await expect(page.locator('#wep-export-status')).toHaveClass('alert alert-info');
        const savedValue = h.database.sys_user_preference[0].value;
        h.database.sys_user_preference[0].sys_id = id(999);
        h.database.sys_user_preference[0].value = 'clone value';
        h.database.sys_user_preference.splice(1, 1);
        await page.locator('#wep-restore-details summary').click();
        await expect(page.locator('#wep-preference-file')).toHaveClass('form-control');
        await page.getByLabel('Preferences XML file (up to 10 MiB)').setInputFiles({ name: 'preferences.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
        await page.getByRole('button', { name: 'Review import' }).click();
        await expect(page.locator('#wep-import-count')).toContainText('2 updates, 1 new');
        await expect(page.locator('#wep-restore-status')).toHaveClass('');
        await expect(page.getByRole('button', { name: 'Restore preferences', exact: true })).toBeDisabled();
        await page.getByLabel('Overwrite matching preferences').check();
        await page.getByRole('button', { name: 'Restore preferences', exact: true }).click();
        await expect(page.locator('#wep-restore-status')).toContainText('Restored 3 preferences');
        await expect(page.locator('#wep-restore-status')).toHaveClass('alert alert-info');
        await expect(page.locator('#wep-export-details #wep-export-status')).toContainText('Exported 3 records');
        assert.equal(await page.locator('#wep-maintenance-status').count(), 0);
        assert.equal(h.database.sys_user_preference.length, 4);
        assert.equal(h.database.sys_user_preference.find(row => row.sys_id === id(999)).value, savedValue);
        assert.deepEqual(errors, []);
    } finally { await page.close(); }
});

test('page loading uses the animated SVG until properties arrive and clears it on failure', async () => {
    for (const propertiesError of [false, true]) {
        const {page, releaseProperties, errors} = await mount(harness(), 1280, true, {holdProperties:true, propertiesError});
        try {
            await expect(page.locator('#wep-loading')).toBeVisible();
            await expect(page.locator('#wep-loading')).toContainText('Loading properties');
            assert.ok(await page.locator('#wep-loading svg animate').count() > 0);
            assert.notEqual(await page.locator('#wep-loading .frame').evaluate(el => getComputedStyle(el).animationName), 'none');
            await expect(page.locator('#wep-content')).toBeHidden();
            releaseProperties();
            await expect(page.locator('#wep-loading')).toBeHidden();
            await expect(page.locator('#wep-content')).toBeVisible();
            if (propertiesError) await expect(page.locator('#wep-message')).toContainText('Unable to load properties');
            assert.deepEqual(errors, []);
        } finally {releaseProperties();await page.close();}
    }
});

test('record links, default selection, parent preservation and select-all are enforced in the UI and deletion', async () => {
    const {page,h,errors} = await mount();
    try {
        await page.locator('#wep-uninstall-details summary.panel-heading').click();
        await page.getByLabel('Back up records and preferences first (recommended)').uncheck();
        await page.getByRole('button',{name:'Review records to remove'}).click();
        const master = page.getByRole('checkbox',{name:'Select all records for removal'});
        await expect(master).toBeChecked();
        assert.equal(await page.locator('#wep-maintenance input[type="checkbox"]').evaluateAll(inputs => inputs.every(input =>
            input.classList.contains('checkbox') && input.parentElement.classList.contains('input-group-checkbox') &&
            input.nextElementSibling.classList.contains('checkbox-label') && input.nextElementSibling.htmlFor === input.id
        )), true);
        assert.equal(await page.locator('#wep-uninstall-records input:checked').count(),8);
        assert.equal(await page.locator('#wep-uninstall-records a[target="_blank"][rel="noopener"]').count(),8);
        await expect(page.locator('#wep-uninstall-records a').filter({hasText:'WidgetEditorMarkdownAjax'}).first()).toHaveAttribute('href',/sys_script_include\.do\?sys_id=/);
        await page.locator('label[for="wep-remove-'+id(4)+'"]').click();
        await expect(page.locator('#wep-uninstall-count')).toContainText('5 selected, 3 preserved');
        await expect(page.locator('[data-record-id="'+id(3)+'"]')).not.toBeChecked();
        await expect(page.locator('[data-record-id="'+id(3)+'"]')).toBeDisabled();
        await expect(master).toHaveJSProperty('indeterminate',true);
        await master.check();
        await expect(page.locator('#wep-uninstall-count')).toContainText('8 selected, 0 preserved');
        await master.uncheck();
        await expect(page.locator('#wep-uninstall-confirmation')).toBeDisabled();
        await expect(page.locator('#wep-uninstall')).toBeDisabled();
        await master.check();
        await page.locator('[data-record-id="'+id(4)+'"]').uncheck();
        await page.locator('#wep-uninstall-confirmation').fill('UNINSTALL');
        await page.locator('#wep-uninstall').click();
        await expect(page.locator('#wep-uninstall-status')).toContainText('5 records, 3 preserved');
        assert.equal(h.database.sys_security_acl.length,1);
        assert.equal(h.database.sys_security_acl_role.length,1);
        assert.deepEqual(errors,[]);
    } finally {await page.close();}
});

test('dark preview includes all application records in one selectable table with sticky headers', async () => {
    const h=harness();
    for(let n=200;n<225;n++) h.database.sys_metadata.push({sys_id:id(n),name:'Widget Editor+ test page '+n,sys_class_name:'sp_page',sys_scope:'d65bb60783e7321070b8b5dfeeaad3b2'});
    for(let n=300;n<360;n++) h.database.sys_properties.push({sys_id:id(n),name:'monaco.plus.example_'+n,value:'value'});
    const {page,errors}=await mount(h,1280,false,{dark:true});
    try {
        await page.locator('#wep-uninstall-details summary.panel-heading').click();
        await page.getByRole('button',{name:'Review records to remove'}).click();
        await expect(page.locator('#wep-uninstall-warnings')).toBeHidden();
        await expect(page.locator('#wep-uninstall-confirmation')).toBeDisabled();
        await expect(page.locator('#wep-uninstall-records tr')).toHaveCount(93);
        await expect(page.locator('#wep-uninstall-records a').filter({hasText:'Widget Editor+ test page'})).toHaveCount(25);
        await expect(page.locator('[data-record-id="'+id(200)+'"]')).toBeChecked();
        await page.locator('[data-record-id="'+id(200)+'"]').uncheck();
        await expect(page.locator('[data-record-id="d65bb60783e7321070b8b5dfeeaad3b2"]')).not.toBeChecked();
        assert.equal(await page.locator('#wep-uninstall-details .panel-title').evaluate(el=>getComputedStyle(el).fontFamily),await page.locator('#wep-maintenance').evaluate(el=>getComputedStyle(el).fontFamily));
        const region=page.getByRole('region',{name:'Records to remove',exact:true});
        await region.evaluate(el=>{el.scrollTop=300;});
        const regionBox=await region.boundingBox(),headerBox=await region.locator('th').first().boundingBox();
        assert.ok(Math.abs(headerBox.y-regionBox.y-1)<2,'header remains at the top of the scrolling table');
        await expect(page.locator('#wep-uninstall-details #wep-uninstall-status')).toContainText('Review the records');
        assert.deepEqual(errors,[]);
        await page.screenshot({path:'/tmp/widget-editor-properties-polished-dark.png',fullPage:true});
    } finally {await page.close();}
});

test('uninstall review requires active elevation while preferences remain available', async () => {
    const h = harness();
    h.faults.elevated = false;
    const {page}=await mount(h);
    try {
        await page.locator('#wep-uninstall-details summary.panel-heading').click();
        const warning = page.locator('#wep-uninstall-details .alert.alert-warning:not(#wep-uninstall-warnings)');
        await expect(warning).toContainText('Permanently remove Widget Editor+ apps');
        await expect(warning).toContainText('Elevated security_admin is required');
        const review = page.getByRole('button',{name:'Review records to remove'});
        await expect(review).toBeDisabled();
        await expect(page.getByLabel('Delete all users’ app preferences')).toBeDisabled();
        await expect(page.locator('#wep-uninstall-preview')).toBeHidden();
        await expect(page.locator('#wep-uninstall')).toBeDisabled();
        await page.locator('#wep-export-details summary').click();
        await expect(page.locator('#wep-export-preferences')).toBeEnabled();
        const download = page.waitForEvent('download');
        await page.locator('#wep-export-preferences').click();
        await download;
        h.faults.elevated = true;
        await page.locator('#wep-uninstall-details summary.panel-heading').click();
        await page.locator('#wep-uninstall-details summary.panel-heading').click();
        await expect(review).toBeEnabled();
        await review.click();
        await expect(page.locator('#wep-uninstall-preview')).toBeVisible();
        h.faults.elevated = false;
        await page.locator('#wep-uninstall-details summary.panel-heading').click();
        await page.locator('#wep-uninstall-details summary.panel-heading').click();
        await expect(review).toBeDisabled();
        await expect(page.locator('#wep-uninstall-preview')).toBeHidden();
        assert.deepEqual(h.operations,[]);
    } finally {await page.close();}
});

test('mobile preview contains long values, preserves focus and recovers from permission and export errors', async () => {
    const { page, h, errors } = await mount(harness(), 390);
    try {
        h.database.sys_ui_page[0].name = '<unsafe & ' + 'LongRecordName'.repeat(15);
        h.database.sys_security_acl[0].undeletable = true;
        await expect(page.locator('#wep-review-uninstall')).toBeEnabled();
        const access = page.waitForResponse(response => response.request().method() === 'POST' &&
            response.request().postDataJSON().method === 'getMaintenanceAccess');
        await page.locator('#wep-uninstall-details summary.panel-heading').click();
        await access;
        await page.getByRole('button', { name: 'Review records to remove' }).click();
        await expect(page.locator('#wep-uninstall-blocked')).toContainText('permissions');
        await expect(page.locator('#wep-uninstall')).toBeDisabled();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        assert.equal(await page.locator('#wep-uninstall-records script').count(), 0);
        await expect(page.locator('#wep-uninstall-confirmation')).toBeDisabled();
        h.faults.unreadableField = 'script';
        await page.getByRole('button', { name: 'Download backup' }).click();
        await expect(page.locator('#wep-backup-status')).toContainText('Cannot back up field');
        await expect(page.locator('#wep-backup-status')).toHaveClass('alert alert-danger');
        await expect(page.locator('#wep-backup-status')).toBeFocused();
        await expect(page.locator('#wep-backup-saved-label')).toBeHidden();
        delete h.faults.unreadableField;
        delete h.database.sys_security_acl[0].undeletable;
        await page.getByRole('button', { name: 'Review records to remove' }).click();
        await expect(page.locator('#wep-uninstall-blocked')).not.toContainText('permissions');
        assert.deepEqual(errors, []);
        await page.screenshot({ path: '/tmp/widget-editor-maintenance-mobile.png', fullPage: true });
    } finally { await page.close(); }
});

test('invalid import keeps the chosen file and shows a recoverable error without writes', async () => {
    const { page, h } = await mount();
    try {
        await page.locator('#wep-restore-details summary').click();
        await page.getByLabel('Preferences XML file (up to 10 MiB)').setInputFiles({ name: 'bad.xml', mimeType: 'application/xml', buffer: Buffer.from('<unload><sys_user/></unload>') });
        await page.getByRole('button', { name: 'Review import' }).click();
        await expect(page.locator('#wep-restore-status')).toContainText('records other than preferences');
        await expect(page.locator('#wep-restore-status')).toHaveClass('alert alert-danger');
        await expect(page.locator('#wep-restore-status')).toBeFocused();
        assert.equal(await page.locator('#wep-preference-file').evaluate(input => input.files[0].name), 'bad.xml');
        await expect(page.getByRole('button', { name: 'Review import' })).toBeEnabled();
        assert.deepEqual(h.operations, []);
    } finally { await page.close(); }
});

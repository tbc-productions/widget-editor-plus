const fs = require('node:fs');
const vm = require('node:vm');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const source = fs.readFileSync('src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_markdown.server.js', 'utf8');
const id = n => n.toString(16).padStart(32, '0');
const appId = 'd65bb60783e7321070b8b5dfeeaad3b2';
const apiId = '8c1af74f04814c0b8cfe761dfe6e4bde';
const iterator = values => { let i = 0; return { hasNext: () => i < values.length, next: () => values[i++] }; };
function xmlNode(value) {
    const name = Object.keys(value).find(key => key !== ':@');
    const children = Array.isArray(value[name]) ? value[name] : [];
    return { getNodeName: () => name, getAttribute: key => value[':@']?.['@_' + key] || null,
        getTextContent: () => name === '#text' ? String(value[name]) : children.map(child => xmlNode(child).getTextContent()).join(''),
        getChildNodeIterator: () => iterator(children.map(xmlNode)) };
}
function harness({ admin = true, securityAdmin = true, database, manifest } = {}) {
    const row = (sys_id, name, extra = {}) => ({ sys_id, name, sys_updated_on: '2026-10-17 01:00:00', sys_mod_count: '0', ...extra });
    database ||= {
        sys_app: [row(appId, 'Widget Editor+')],
        sys_ui_page: [row(id(1), 'Widget Editor+'), row(id(2), 'Unrelated page')],
        sys_script_include: [row(apiId, 'WidgetEditorMarkdownAjax', { script: '<script>&\'"🦘\r\n', empty: null })],
        sys_security_acl: [row(id(3), 'WidgetEditorMarkdownAjax')],
        sys_security_acl_role: [row(id(4), '', { sys_security_acl: id(3) })],
        sys_properties: [row(id(5), 'monaco.plus.example'), row(id(6), 'monaco.plus.local_setting'), row(id(7), 'unrelated.property')],
        sys_properties_category_m2m: [row(id(8), '', { property: id(6) }), row(id(9), '', { property: id(7) })],
        sys_user: [row(id(101), 'Alice'), row(id(102), 'Bob')],
        sys_user_preference: [
            row(id(11), 'monaco_plus.user_prefs', { user: id(101), value: '{"theme":"🦘 & < >"}', type: 'string', system: 'false' }),
            row(id(12), 'we_debug_menu_prefs', { user: id(102), value: '', type: 'string', system: 'false' }),
            row(id(13), 'widget_editor_assistant.favourite_tables', { user: '', value: '[]', type: 'string', system: 'true' }),
            row(id(14), 'unrelated.preference', { user: id(101), value: 'keep' }),
        ],
        sys_metadata: [], sys_attachment: [],
    };
    manifest ||= { sys_app: [appId], sys_ui_page: [id(1)], sys_script_include: [apiId], sys_security_acl: [id(3)], sys_security_acl_role: [id(4)], sys_properties: [id(5)] };
    for (const [table, entries] of Object.entries(database)) {
        if (table !== 'sys_user' && table !== 'sys_user_preference' && table !== 'sys_metadata' && table !== 'sys_attachment')
            entries.forEach(entry => { entry.sys_scope ||= appId; });
    }
    const operations = [], sessions = {}, faults = {};
    let params = {}, sequence = 1000, now = Date.now();
    function Record(table) {
        let current, groups = [], matches = [], cursor = 0, limit = Infinity;
        const rows = () => database[table] ||= [];
        this.isValid = () => true;
        this.isValidField = field => field !== faults.invalidField && (table !== 'sys_properties_category_m2m' || ['sys_id', 'property', 'category', 'order', 'sys_updated_on', 'sys_mod_count'].includes(field));
        this.addQuery = (...args) => {
            if (!this.isValidField(args[0])) return { addOrCondition() {} };
            const group = [args]; groups.push(group);
            return { addOrCondition: (...other) => group.push(other) };
        };
        const matchesCondition = (entry, args) => {
            let [field, op, value] = args;
            if (args.length === 2) { value = op; op = '='; }
            const actual = String(entry[field] ?? '');
            if (op === 'IN') return String(value).split(',').filter(Boolean).includes(actual);
            if (op === 'STARTSWITH') return actual.startsWith(value);
            return actual === String(value);
        };
        this.query = () => { matches = rows().filter(entry => groups.every(group => group.some(args => matchesCondition(entry, args)))).slice(0, limit); cursor = 0; };
        this.next = () => { current = matches[cursor++]; return !!current; };
        this.get = value => { current = rows().find(entry => entry.sys_id === value) || database.sys_metadata.find(entry => entry.sys_class_name === table && entry.sys_id === value); return !!current; };
        this.setLimit = value => { limit = value; };
        this.getUniqueValue = () => current.sys_id;
        this.getRecordClassName = () => current.sys_class_name || table;
        this.getValue = field => current[field] ?? null;
        this.getDisplayValue = field => field === 'user' ? current.user : current.name || current.sys_id;
        this.canRead = () => !current?.unreadable;
        this.canDelete = () => !current?.undeletable;
        this.canWrite = () => !current?.unwritable;
        this.canCreate = () => !faults.createDenied;
        this.getElement = field => ({ canRead: () => field !== faults.unreadableField, canWrite: () => field !== faults.unwritableField });
        this.getElements = () => {
            const fields = Object.keys(current).filter(key => !['unreadable', 'undeletable', 'unwritable'].includes(key)).map(field => ({ getName: () => field, canRead: () => field !== faults.unreadableField,
                getED: () => ({getInternalType: () => ['sys_scope', 'sys_package', 'property', 'category', 'sys_security_acl', 'sys_ui_action', 'user'].includes(field) ? 'reference' : 'string'}) }));
            return { size: () => fields.length, get: index => fields[index] };
        };
        this.initialize = () => { current = {}; };
        this.setValue = (field, value) => { current[field] = value; };
        this.insert = () => {
            if (faults.insert) return null;
            current.sys_id = id(sequence++); current.sys_mod_count = '0'; rows().push(current);
            operations.push(['insert', table, current.sys_id]); return current.sys_id;
        };
        this.update = () => {
            if (faults.update) return null;
            current.sys_mod_count = String(Number(current.sys_mod_count || 0) + 1);
            operations.push(['update', table, current.sys_id]); return current.sys_id;
        };
        this.deleteRecord = () => {
            if (faults.deleteId === current.sys_id) return false;
            operations.push(['delete', table, current.sys_id]);
            database[table] = rows().filter(entry => entry !== current);
            database.sys_metadata = database.sys_metadata.filter(entry => entry !== current);
            return true;
        };
    }
    const context = vm.createContext({
        Class: { create: () => function () {} }, AbstractAjaxProcessor: {},
        Object: Object.assign(Object.create(Object), { extendsObject: (_base, methods) => methods }),
        WidgetEditorUninstallRecords: manifest, GlideRecord: Record, Date: { now: () => now },
        gs: { hasRole: role => admin && role === 'admin', generateGUID: () => id(sequence++),
            getSession: () => ({ getClientData: key => sessions[key], putClientData: (key, value) => { sessions[key] = value; }, getActivatedElevatedRoles: () => securityAdmin && faults.elevated !== false ? 'security_admin' : '' }) },
        XMLDocument2: function () {
            let parsed;
            this.parseXML = text => {
                if (XMLValidator.validate(text) !== true) return false;
                parsed = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, trimValues: false, htmlEntities: true }).parse(text);
                return true;
            };
            this.getDocumentElement = () => xmlNode(parsed.find(value => !value['?xml']));
        },
    });
    vm.runInContext(source, context);
    const api = context.WidgetEditorMarkdownAjax.prototype;
    // ServiceNow parameters can be Java-backed strings rather than JavaScript primitives.
    api.getParameter = key => params[key] == null ? params[key] : Object(String(params[key]));
    api._answer = value => JSON.parse(JSON.stringify(value));
    const call = (method, values = {}) => { params = values; return api[method](); };
    return { api, database, operations, faults, sessions, call, expire: () => { now += 1800001; },
        preview: (values = {}) => call('previewSuiteMaintenance', values),
        export: (plan, mode = 'backup') => {
            let offset = 0, xml = '<unload>\n';
            while (true) {
                const result = call('exportSuiteMaintenance', { token: plan.token, mode, offset: String(offset) });
                if (!result.success) throw new Error(result.error);
                xml += result.xml;
                if (result.done) return xml + '</unload>';
                offset = result.next;
            }
        },
    };
}
module.exports = { harness, id, appId, apiId };

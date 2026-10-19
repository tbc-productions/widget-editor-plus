var WidgetEditorMarkdownAjax = Class.create();
WidgetEditorMarkdownAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {
    RULES_PROPERTY: 'monaco.plus.update_sets.markdown_groups',
    GROUPS_PREFIX: 'monaco.plus.update_sets.markdown_groups.',
    DISPLAY_PROPERTY: 'monaco.plus.update_sets.markdown_display',
    PAGE_SIZE: 100,
    _suitePreferenceNames: function () {
        return [
            'monaco_plus.user_prefs',
            'widget_editor.visible_editors',
            'we_debug_menu_prefs',
            'widget_editor_assistant.favourite_tables',
            'widget_editor_assistant.favourite_groups',
        ];
    },
    _preferenceImportTarget: function (row) {
        if (row.user) {
            var user = new GlideRecord('sys_user');
            if (!/^[0-9a-f]{32}$/.test(row.user) || !user.get(row.user) || !user.canRead())
                throw new Error(
                    'User ' +
                        row.user +
                        ' is missing or unreadable. Restore the matching user before importing preferences.'
                );
        }
        var gr = new GlideRecord('sys_user_preference');
        gr.addQuery('name', row.name);
        gr.addQuery('user', row.user);
        gr.setLimit(2);
        gr.query();
        var id = '',
            revision = '';
        if (gr.next()) {
            if (!gr.canRead() || !gr.canWrite())
                throw new Error(
                    'Cannot update preference ' + row.name + ' for ' + (row.user || 'Shared default') + '.'
                );
            id = String(gr.getUniqueValue());
            revision = String(gr.getValue('sys_mod_count') || '0');
            if (gr.next())
                throw new Error(
                    'Duplicate existing preference ' +
                        row.name +
                        ' for ' +
                        (row.user || 'Shared default') +
                        '. Resolve duplicates before importing.'
                );
        } else {
            gr.initialize();
            if (!gr.canCreate()) throw new Error('Cannot create preferences.');
        }
        return { id: id, revision: revision };
    },
    previewSuitePreferenceImport: function () {
        if (!gs.hasRole('admin')) return this._answer({ success: false, error: 'Admin role required.' });
        try {
            var xml = String(this.getParameter('xml') || '');
            if (!xml || xml.length > 10485760 || /<!DOCTYPE|<!ENTITY/i.test(xml))
                throw new Error('Choose a preferences XML export under 10 MiB without DTDs or entities.');
            var doc = new XMLDocument2();
            if (doc.parseXML(xml) === false) throw new Error('The XML file is malformed.');
            var root = doc.getDocumentElement();
            if (!root || String(root.getNodeName()) !== 'unload') throw new Error('Choose a preferences XML export.');
            var children = root.getChildNodeIterator(),
                rows = [],
                seen = {},
                updated = 0;
            while (children.hasNext()) {
                var record = children.next(),
                    tag = String(record.getNodeName());
                if (tag === '#text' || tag === '#comment') continue;
                if (tag !== 'sys_user_preference' || String(record.getAttribute('action') || '') !== 'INSERT_OR_UPDATE')
                    throw new Error(
                        'This file contains records other than preferences. Choose the preferences-only export.'
                    );
                var fields = record.getChildNodeIterator(),
                    values = Object.create(null);
                while (fields.hasNext()) {
                    var field = fields.next(),
                        name = String(field.getNodeName());
                    if (name === '#text' || name === '#comment') continue;
                    if (Object.prototype.hasOwnProperty.call(values, name))
                        throw new Error('Duplicate XML field ' + name + '.');
                    values[name] = String(field.getTextContent() || '');
                }
                if (
                    this._suitePreferenceNames().indexOf(values.name) === -1 ||
                    values.user === undefined ||
                    values.value === undefined
                )
                    throw new Error('The file contains an unsupported or incomplete preference.');
                var key = values.name + ':' + values.user;
                if (seen[key]) throw new Error('The file contains duplicate preferences for ' + key + '.');
                seen[key] = true;
                if (values.system && !/^(true|false|0|1)$/.test(values.system))
                    throw new Error('Invalid shared-default flag.');
                if (values.type && values.type.length > 40) throw new Error('Invalid preference type.');
                var row = {
                    name: values.name,
                    user: values.user,
                    value: values.value,
                    type: values.type || 'string',
                    system: /^(true|1)$/.test(values.system || '') ? 'true' : 'false',
                };
                row.target = this._preferenceImportTarget(row);
                if (row.target.id) updated++;
                rows.push(row);
            }
            if (!rows.length) throw new Error('The file contains no Widget Editor+ apps preferences.');
            var plan = { token: String(gs.generateGUID()), created: Date.now(), offset: 0, rows: rows };
            gs.getSession().putClientData('we_suite_preference_import', JSON.stringify(plan));
            return this._answer({
                success: true,
                token: plan.token,
                total: rows.length,
                updated: updated,
                created: rows.length - updated,
            });
        } catch (e) {
            return this._answer({ success: false, error: e.message || String(e) });
        }
    },
    importSuitePreferences: function () {
        if (!gs.hasRole('admin')) return this._answer({ success: false, error: 'Admin role required.' });
        var plan = null;
        try {
            var raw = gs.getSession().getClientData('we_suite_preference_import');
            plan = raw ? JSON.parse(String(raw)) : null;
            if (
                !plan ||
                plan.token !== String(this.getParameter('token') || '') ||
                Date.now() - plan.created > 1800000 ||
                String(this.getParameter('confirmation') || '') !== 'RESTORE'
            )
                throw new Error('Review the preferences file and confirm restore again.');
            if (String(plan.offset) !== String(this.getParameter('offset')))
                throw new Error('The import has advanced. Review the file again.');
            var end = Math.min(plan.offset + 20, plan.rows.length);
            while (plan.offset < end) {
                var row = plan.rows[plan.offset],
                    target = this._preferenceImportTarget(row);
                if (JSON.stringify(target) !== JSON.stringify(row.target))
                    throw new Error('A preference changed since review. Review the file again.');
                var gr = new GlideRecord('sys_user_preference');
                if (target.id) {
                    if (!gr.get(target.id)) throw new Error('A preference disappeared. Review the file again.');
                } else gr.initialize();
                ['name', 'user', 'value', 'type', 'system'].forEach(function (field) {
                    if (!gr.getElement(field).canWrite())
                        throw new Error('Cannot restore preference field ' + field + '.');
                    gr.setValue(field, row[field]);
                });
                if (!(target.id ? gr.update() : gr.insert())) throw new Error('Could not restore ' + row.name + '.');
                plan.offset++;
                gs.getSession().putClientData('we_suite_preference_import', JSON.stringify(plan));
            }
            var done = plan.offset === plan.rows.length;
            if (done) gs.getSession().putClientData('we_suite_preference_import', '');
            return this._answer({ success: true, next: plan.offset, total: plan.rows.length, done: done });
        } catch (e) {
            return this._answer({
                success: false,
                error:
                    (e.message || String(e)) +
                    (plan
                        ? ' Restored ' + plan.offset + ' preferences so far. Re-select the file to review and retry.'
                        : ''),
            });
        }
    },
    _maintenanceRow: function (gr, table) {
        if (!gr.canRead()) throw new Error('Cannot read ' + table + ':' + gr.getUniqueValue() + '.');
        var elements = gr.getElements(),
            references = [];
        for (var i = 0; i < elements.size(); i++) {
            var field = elements.get(i);
            if (String(field.getED().getInternalType()) === 'reference') {
                var value = String(gr.getValue(String(field.getName())) || '');
                if (/^[0-9a-f]{32}$/.test(value) && references.indexOf(value) === -1) references.push(value);
            }
        }
        return {
            table: table,
            sys_id: String(gr.getUniqueValue()),
            label: String(gr.getDisplayValue() || gr.getUniqueValue()),
            name: String(gr.getValue('name') || ''),
            user: table === 'sys_user_preference' ? String(gr.getDisplayValue('user') || 'Shared default') : '',
            updated: String(gr.getValue('sys_updated_on') || ''),
            revision: String(gr.getValue('sys_mod_count') || '0'),
            canDelete: !!gr.canDelete(),
            references: references,
        };
    },
    _maintenanceInventory: function (preferencesOnly) {
        var self = this,
            records = [],
            preferences = [],
            seen = {};
        function collect(gr, table, target) {
            gr.query();
            while (gr.next()) {
                var recordTable = table === 'sys_metadata' ? String(gr.getRecordClassName()) : table;
                var key = recordTable + ':' + gr.getUniqueValue();
                if (seen[key]) continue;
                seen[key] = true;
                var record = gr;
                if (recordTable !== table) {
                    // Read subclass fields too, so preservation includes their references.
                    record = new GlideRecord(recordTable);
                    if (!record.get(gr.getUniqueValue())) throw new Error('Cannot read ' + key + '.');
                }
                target.push(self._maintenanceRow(record, recordTable));
            }
        }
        if (!preferencesOnly) {
            Object.keys(WidgetEditorUninstallRecords).forEach(function (table) {
                var gr = new GlideRecord(table);
                if (!gr.isValid()) throw new Error('Cannot inspect table ' + table + '.');
                gr.addQuery('sys_id', 'IN', WidgetEditorUninstallRecords[table].join(','));
                collect(gr, table, records);
            });
            var metadata = new GlideRecord('sys_metadata');
            if (!metadata.isValidField('sys_scope') || !metadata.isValidField('sys_package'))
                throw new Error('Cannot inspect application ownership.');
            metadata
                .addQuery('sys_scope', 'd65bb60783e7321070b8b5dfeeaad3b2')
                .addOrCondition('sys_package', 'd65bb60783e7321070b8b5dfeeaad3b2');
            collect(metadata, 'sys_metadata', records);
            // Table-specific settings can be added from Properties after installation.
            var properties = new GlideRecord('sys_properties');
            properties.addQuery('name', 'STARTSWITH', 'monaco.plus.');
            collect(properties, 'sys_properties', records);
            var propertyIds = records
                .filter(function (row) {
                    return row.table === 'sys_properties';
                })
                .map(function (row) {
                    return row.sys_id;
                })
                .join(',');
            if (propertyIds) {
                var links = new GlideRecord('sys_properties_category_m2m');
                if (!links.isValidField('property')) throw new Error('Cannot inspect property-category links.');
                links.addQuery('property', 'IN', propertyIds);
                collect(links, 'sys_properties_category_m2m', records);
            }
        }
        var prefs = new GlideRecord('sys_user_preference');
        prefs.addQuery('name', 'IN', this._suitePreferenceNames().join(','));
        collect(prefs, 'sys_user_preference', preferences);
        function byId(a, b) {
            return (a.table + ':' + a.sys_id).localeCompare(b.table + ':' + b.sys_id);
        }
        return { records: records.sort(byId), preferences: preferences.sort(byId) };
    },
    _maintenanceSignature: function (rows) {
        return JSON.stringify(
            rows.map(function (row) {
                return [row.table, row.sys_id, row.updated, row.revision];
            })
        );
    },
    _maintenanceBlockers: function (rows) {
        var blockers = [];
        if (rows.length) {
            var attachment = new GlideRecord('sys_attachment');
            attachment.addQuery(
                'table_sys_id',
                'IN',
                rows
                    .map(function (row) {
                        return row.sys_id;
                    })
                    .join(',')
            );
            attachment.setLimit(1);
            attachment.query();
            if (attachment.next()) blockers.push('Uninstall blocked by related records outside the removal list.');
        }
        return blockers;
    },
    _maintenancePlan: function () {
        var raw = gs.getSession().getClientData('we_suite_maintenance');
        var plan = raw ? JSON.parse(String(raw)) : null;
        if (!plan || plan.token !== String(this.getParameter('token') || '') || Date.now() - plan.created > 1800000)
            throw new Error('The preview has expired. Review the records again.');
        return plan;
    },
    _maintenanceSecurityAdmin: function () {
        return (
            String(gs.getSession().getActivatedElevatedRoles() || '')
                .split(',')
                .map(function (role) {
                    return role.trim();
                })
                .indexOf('security_admin') !== -1
        );
    },
    getMaintenanceAccess: function () {
        if (!gs.hasRole('admin')) return this._answer({ success: false, error: 'Admin role required.' });
        return this._answer({ success: true, securityAdmin: this._maintenanceSecurityAdmin() });
    },
    previewSuiteMaintenance: function () {
        if (!gs.hasRole('admin')) return this._answer({ success: false, error: 'Admin role required.' });
        try {
            var preferencesOnly = String(this.getParameter('preferences_only')) === 'true';
            if (!preferencesOnly && !this._maintenanceSecurityAdmin())
                throw new Error('Elevated security_admin is required.');
            var inventory = this._maintenanceInventory(preferencesOnly);
            var plan = {
                token: String(gs.generateGUID()),
                created: Date.now(),
                preferencesOnly: preferencesOnly,
                deletePreferences: String(this.getParameter('delete_preferences')) === 'true',
                backupRequired: String(this.getParameter('backup_required')) !== 'false',
                records: inventory.records,
                preferences: inventory.preferences,
            };
            gs.getSession().putClientData('we_suite_maintenance', JSON.stringify(plan));
            var blockers = preferencesOnly ? [] : this._maintenanceBlockers(plan.records);
            return this._answer({
                success: true,
                token: plan.token,
                records: plan.records,
                preferences: plan.preferences,
                blockers: blockers,
                deletePreferences: plan.deletePreferences,
                securityAdmin: this._maintenanceSecurityAdmin(),
            });
        } catch (e) {
            return this._answer({ success: false, error: e.message || String(e) });
        }
    },
    _maintenanceXml: function (gr, table) {
        function escape(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\r/g, '&#13;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }
        var elements = gr.getElements(),
            xml = '<' + table + ' action="INSERT_OR_UPDATE">';
        for (var i = 0; i < elements.size(); i++) {
            var field = elements.get(i),
                name = String(field.getName());
            if (!field.canRead()) throw new Error('Cannot back up field ' + table + '.' + name + '.');
            var value = gr.getValue(name);
            xml += value === null ? '<' + name + ' nil="true"/>' : '<' + name + '>' + escape(value) + '</' + name + '>';
        }
        return xml + '</' + table + '>\n';
    },
    exportSuiteMaintenance: function () {
        if (!gs.hasRole('admin')) return this._answer({ success: false, error: 'Admin role required.' });
        try {
            var plan = this._maintenancePlan(),
                mode = String(this.getParameter('mode') || ''),
                offset = Number(this.getParameter('offset'));
            if (mode !== 'preferences' && mode !== 'backup') throw new Error('Invalid export mode.');
            if (mode === 'backup' && plan.preferencesOnly) throw new Error('Review the uninstall records first.');
            var rows = mode === 'preferences' ? plan.preferences : plan.records.concat(plan.preferences);
            if (!isFinite(offset) || offset < 0 || Math.floor(offset) !== offset || offset > rows.length)
                throw new Error('Invalid export offset.');
            if (offset === 0) {
                plan.exportMode = mode;
                plan.exportOffset = 0;
                plan.backupComplete = false;
            }
            if (plan.exportMode !== mode || offset !== plan.exportOffset) throw new Error('Restart the export.');
            var end = Math.min(offset + 20, rows.length),
                xml = '';
            for (var i = offset; i < end; i++) {
                var row = rows[i],
                    gr = new GlideRecord(row.table);
                if (
                    !gr.get(row.sys_id) ||
                    this._maintenanceSignature([row]) !==
                        this._maintenanceSignature([this._maintenanceRow(gr, row.table)])
                )
                    throw new Error('Records changed during export. Review the records and export again.');
                xml += this._maintenanceXml(gr, row.table);
            }
            plan.exportOffset = end;
            plan.backupComplete = mode === 'backup' && end === rows.length;
            gs.getSession().putClientData('we_suite_maintenance', JSON.stringify(plan));
            return this._answer({ success: true, xml: xml, next: end, total: rows.length, done: end === rows.length });
        } catch (e) {
            return this._answer({ success: false, error: e.message || String(e) });
        }
    },
    uninstallSuite: function () {
        if (!gs.hasRole('admin')) return this._answer({ success: false, error: 'Admin role required.' });
        var deleted = 0;
        try {
            if (!this._maintenanceSecurityAdmin())
                throw new Error('Elevate to security_admin before uninstalling Widget Editor+ apps.');
            var plan = this._maintenancePlan();
            if (plan.preferencesOnly || String(this.getParameter('confirmation') || '') !== 'UNINSTALL')
                throw new Error('Review the uninstall records and type UNINSTALL to confirm.');
            if (plan.backupRequired && !plan.backupComplete) throw new Error('Download the complete backup first.');
            var current = this._maintenanceInventory(false),
                rows = plan.records.concat(plan.deletePreferences ? plan.preferences : []),
                latest = current.records.concat(plan.deletePreferences ? current.preferences : []);
            if (this._maintenanceSignature(rows) !== this._maintenanceSignature(latest))
                throw new Error('The removal list changed. Review the records and back up again.');
            if (
                plan.backupRequired &&
                this._maintenanceSignature(plan.preferences) !== this._maintenanceSignature(current.preferences)
            )
                throw new Error('Preferences changed since backup. Review the records and back up again.');
            var selected = JSON.parse(String(this.getParameter('selected_records') || 'null'));
            if (!Array.isArray(selected) || !selected.length || selected.length > rows.length)
                throw new Error('Select at least one reviewed record to remove.');
            var known = {},
                selectedIds = {};
            rows.forEach(function (row) {
                known[row.sys_id] = row;
            });
            selected.forEach(function (id) {
                if (typeof id !== 'string' || !known[id] || selectedIds[id])
                    throw new Error('The selection contains an unreviewed or duplicate record.');
                selectedIds[id] = true;
            });
            latest.forEach(function (row) {
                if (selectedIds[row.sys_id]) return;
                row.references.forEach(function (id) {
                    if (selectedIds[id])
                        throw new Error(
                            'A selected record is required by a preserved record. Update the selection before uninstalling.'
                        );
                });
            });
            var kept = rows.length - selected.length;
            rows = latest.filter(function (row) {
                return !!selectedIds[row.sys_id];
            });
            var blockers = this._maintenanceBlockers(current.records);
            if (blockers.length) throw new Error(blockers.join(' '));
            // Preflight everything before deletion, including ACLs that may need security_admin.
            rows.forEach(function (row) {
                if (!row.canDelete)
                    throw new Error(
                        'Cannot delete ' +
                            row.table +
                            ':' +
                            row.sys_id +
                            '. Check your elevated roles, then review again.'
                    );
            });
            function priority(row) {
                if (row.table === 'sys_app') return 100;
                if (row.table === 'sys_script_include' && row.sys_id === '8c1af74f04814c0b8cfe761dfe6e4bde') return 90;
                if (row.table === 'sys_security_acl') return 80;
                if (/_role$|_m2m$/.test(row.table) || row.table === 'sys_claim') return 0;
                return 10;
            }
            rows.sort(function (a, b) {
                return priority(a) - priority(b);
            });
            gs.getSession().putClientData('we_suite_maintenance', '');
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i],
                    gr = new GlideRecord(row.table);
                if (!gr.get(row.sys_id)) continue; // A previously removed parent can cascade to a listed child.
                if (!gr.canDelete() || !gr.deleteRecord())
                    throw new Error('Could not delete ' + row.table + ':' + row.sys_id + '. Uninstall stopped.');
                deleted++;
            }
            return this._answer({ success: true, deleted: deleted, total: rows.length, kept: kept });
        } catch (e) {
            return this._answer({
                success: false,
                deleted: deleted,
                error:
                    (e.message || String(e)) +
                    (deleted
                        ? ' ' + deleted + ' records were already deleted. Review the remaining records before retrying.'
                        : ''),
            });
        }
    },
    _sortRules: function (rules) {
        function sort(nodes) {
            nodes.sort(function (a, b) {
                return a.label.localeCompare(b.label) || a.table.localeCompare(b.table);
            });
            nodes.forEach(function (node) {
                sort(node.children || []);
            });
        }
        sort(rules.groups);
        return rules;
    },
    _relatedTables: function (table) {
        this._relatedCache = this._relatedCache || {};
        if (this._relatedCache[table]) return this._relatedCache[table];
        var names = this._hierarchyNames(table),
            listId = '';
        // Use the nearest inherited Default View configuration, never a personal view.
        for (var i = 0; i < names.length; i++) {
            var list = new GlideRecordSecure('sys_ui_related_list');
            list.addQuery('name', names[i]);
            list.addQuery('view', 'Default view');
            list.addQuery('sys_user', '');
            list.setLimit(1);
            list.query();
            if (list.next()) {
                listId = String(list.getUniqueValue());
                break;
            }
        }
        var result = [],
            seen = {};
        if (listId) {
            var entry = new GlideRecordSecure('sys_ui_related_list_entry');
            entry.addQuery('list_id', listId);
            entry.query();
            while (entry.next()) {
                var relationship = String(entry.getValue('related_list') || '');
                var match = relationship.match(/^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/i);
                if (!match || seen[relationship]) continue;
                var dict = new GlideRecordSecure('sys_dictionary');
                dict.addQuery('name', 'IN', this._hierarchyNames(match[1]).join(','));
                dict.addQuery('element', match[2]);
                dict.addQuery('internal_type', 'reference');
                dict.query();
                if (!dict.next() || names.indexOf(String(dict.getValue('reference'))) === -1) continue;
                seen[relationship] = true;
                result.push({
                    table: match[1],
                    field: match[2],
                    label: this._tableLabel(match[1]),
                });
            }
        }
        result.sort(function (a, b) {
            return a.label.localeCompare(b.label) || a.field.localeCompare(b.field);
        });
        this._relatedCache[table] = result;
        return result;
    },
    getRelatedTables: function () {
        if (!gs.hasRole('admin'))
            return this._answer({
                success: false,
                error: 'Admin role required.',
            });
        var table = String(this.getParameter('table') || '');
        if (!this._table(table))
            return this._answer({
                success: false,
                error: 'Invalid table.',
            });
        var related = this._relatedTables(table).slice(),
            seen = {};
        related.forEach(function (entry) {
            seen[entry.table] = true;
        });
        var forward = this._parentReferences(table),
            self = this;
        Object.keys(forward).forEach(function (child) {
            if (!seen[child])
                related.push({
                    table: child,
                    field: forward[child].join(', '),
                    label: self._tableLabel(child),
                });
        });
        return this._answer({ success: true, tables: related });
    },
    _escapeJsonUnicode: function (value) {
        // Keep UTF-16 code units out of XML transport and property storage.
        return value.replace(/[\u007f-\uffff]/g, function (character) {
            return '\\u' + ('0000' + character.charCodeAt(0).toString(16)).slice(-4);
        });
    },
    _answer: function (value) {
        return this.setAnswer(this._escapeJsonUnicode(JSON.stringify(value)));
    },
    _sysId: function (value) {
        return /^[0-9a-f]{32}$/i.test(String(value || ''));
    },
    _table: function (value) {
        return /^[a-z][a-z0-9_]*$/i.test(String(value || ''));
    },
    _url: function (table, id) {
        var origin = String(gs.getProperty('glide.servlet.uri', '')).replace(/\/+$/, '');
        return origin + '/nav_to.do?uri=' + encodeURIComponent(table + '.do?sys_id=' + id);
    },
    _xmlText: function (value) {
        return String(value || '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    },
    _payloadField: function (payload, field) {
        if (!this._table(field)) return { value: '', display: '' };
        var re = new RegExp('<' + field + '(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/' + field + '>', 'i');
        var match = String(payload || '').match(re);
        if (!match) return { value: '', display: '' };
        var display = match[0].match(/\bdisplay_value="([^"]*)"/i);
        return {
            value: this._xmlText(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')),
            display: display ? this._xmlText(display[1]) : '',
        };
    },
    _target: function (update) {
        var payload = String(update.getValue('payload') || '');
        var root = payload.match(/<record_update\b[^>]*\btable=["']([a-z][a-z0-9_]*)["']/i);
        var table = root ? root[1] : '';
        // Composite-keyed updates such as dictionary entries omit the root table.
        // The child element names the record table, not its table attribute.
        var rootElement = payload.match(/<record_update\b[^>]*>/i);
        var cursor = rootElement ? rootElement.index + rootElement[0].length : -1;
        if (cursor !== -1) {
            while (cursor < payload.length) {
                if (/\s/.test(payload.charAt(cursor))) {
                    cursor++;
                    continue;
                }
                if (payload.slice(cursor, cursor + 4) !== '<!--') break;
                var commentEnd = payload.indexOf('-->', cursor + 4);
                if (commentEnd === -1) {
                    cursor = -1;
                    break;
                }
                cursor = commentEnd + 3;
            }
        }
        var recordElement = cursor === -1 ? null : payload.slice(cursor).match(/^<([a-z][a-z0-9_]*)\b/i);
        if (recordElement) table = recordElement[1];
        var id = '';
        if (this._table(table)) {
            try {
                var xml = new XMLDocument2();
                xml.parseXML(payload);
                var record = xml.getFirstNode('//' + table);
                var children = record && record.getChildNodeIterator();
                while (children && children.hasNext()) {
                    var child = children.next();
                    if (child.getNodeName() === 'sys_id') {
                        id = String(child.getTextContent() || '');
                        break;
                    }
                }
            } catch (e) {}
        }
        if (!this._sysId(id) && this._table(table)) {
            var recordPayload = payload.match(new RegExp('<' + table + '\\b[^>]*>([\\s\\S]*?)<\\/' + table + '>', 'i'));
            if (recordPayload) id = this._payloadField(recordPayload[1], 'sys_id').value.trim();
        }
        if (this._table(table) && this._sysId(id)) return { table: table, id: id, payload: payload };
        // Forced updates can have a sparse payload. The final 32 hex characters of
        // sys_update_xml.name are the target ID; the prefix is the whole table name.
        var name = String(update.getValue('name') || '');
        var suffix = name.match(/^([a-z][a-z0-9_]*)_([0-9a-f]{32})$/i);
        if (suffix && (!table || suffix[1] === table)) {
            return { table: suffix[1], id: suffix[2], payload: payload };
        }
        return null;
    },
    _displayField: function (table) {
        this._displayFields = this._displayFields || {};
        if (this._displayFields[table]) return this._displayFields[table];
        var names = this._hierarchyNames(table);
        for (var i = 0; i < names.length; i++) {
            var dict = new GlideRecordSecure('sys_dictionary');
            dict.addQuery('name', names[i]);
            dict.addQuery('display', true);
            dict.setLimit(1);
            dict.query();
            if (dict.next()) {
                this._displayFields[table] = {
                    name: dict.getValue('element') || '',
                    reference: dict.getValue('reference') || '',
                };
                return this._displayFields[table];
            }
        }
        this._displayFields[table] = { name: '', reference: '' };
        return this._displayFields[table];
    },
    _hierarchyNames: function (table) {
        var names = [],
            seen = {},
            current = table;
        while (current && !seen[current] && names.length < 12) {
            names.push(current);
            seen[current] = true;
            var object = new GlideRecordSecure('sys_db_object');
            if (!object.get('name', current)) break;
            var parentId = String(object.getValue('super_class') || '');
            if (!this._sysId(parentId)) break;
            var parent = new GlideRecordSecure('sys_db_object');
            if (!parent.get(parentId)) break;
            current = String(parent.getValue('name') || '');
        }
        return names;
    },
    _displayConfigs: function () {
        var parsed = JSON.parse(String(gs.getProperty(this.DISPLAY_PROPERTY, '{}') || '{}'));
        var configs = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        var properties = new GlideRecordSecure('sys_properties'),
            prefix = this.DISPLAY_PROPERTY + '.';
        properties.addQuery('name', 'STARTSWITH', prefix);
        properties.query();
        while (properties.next()) {
            var name = String(properties.getValue('name') || '');
            if (name.indexOf(prefix) !== 0) continue;
            var value = String(properties.getValue('value') || '');
            if (value) configs[name.slice(prefix.length)] = JSON.parse(value);
        }
        var self = this;
        Object.keys(configs).forEach(function (table) {
            configs[table] = self._normaliseDisplayConfig(configs[table]);
        });
        return configs;
    },
    _normaliseDisplayConfig: function (config) {
        if (config && typeof config.display === 'string') {
            return {
                display_value: config.display,
                additional_fields: (config.secondary || []).join(','),
            };
        }
        if (config && typeof config.display_separator === 'string') {
            return {
                display_value: config.display_value
                    .split(',')
                    .map(function (field) {
                        return field.trim();
                    })
                    .join('.'),
                additional_fields: config.additional_fields,
            };
        }
        return config;
    },
    _removeLegacyDisplayTable: function (table) {
        var legacy = JSON.parse(String(gs.getProperty(this.DISPLAY_PROPERTY, '{}') || '{}'));
        if (Object.prototype.hasOwnProperty.call(legacy, table)) {
            delete legacy[table];
            gs.setProperty(this.DISPLAY_PROPERTY, Object.keys(legacy).length ? JSON.stringify(legacy, null, 4) : '');
        }
    },
    _displayConfig: function (table) {
        if (!this._displayConfigCache) {
            try {
                this._displayConfigCache = this._displayConfigs();
            } catch (e) {
                this._displayConfigCache = {};
            }
        }
        return Object.prototype.hasOwnProperty.call(this._displayConfigCache, table)
            ? this._displayConfigCache[table]
            : null;
    },
    _saveDisplayConfigs: function (value) {
        try {
            var config = JSON.parse(value),
                error = this._validateDisplayConfig(config),
                self = this;
            if (error) throw new Error(error);
            Object.keys(config).forEach(function (table) {
                config[table] = self._normaliseDisplayConfig(config[table]);
            });
            var prefix = this.DISPLAY_PROPERTY + '.',
                existing = new GlideRecordSecure('sys_properties'),
                removed = [];
            existing.addQuery('name', 'STARTSWITH', prefix);
            existing.query();
            while (existing.next()) {
                var name = String(existing.getValue('name'));
                if (!Object.prototype.hasOwnProperty.call(config, name.slice(prefix.length))) removed.push(name);
            }
            Object.keys(config).forEach(function (table) {
                var name = prefix + table,
                    property = new GlideRecordSecure('sys_properties');
                if (!property.get('name', name)) {
                    property.initialize();
                    property.setValue('name', name);
                    property.setValue('type', 'string');
                    property.setValue('read_roles', 'sp_admin');
                    property.setValue('write_roles', 'admin');
                    property.setValue('ignore_cache', true);
                    property.setValue('value', JSON.stringify(config[table], null, 4));
                    if (!property.insert()) throw new Error('Could not create property: ' + name);
                }
                self._ensurePropertyCategory(property);
                gs.setProperty(name, JSON.stringify(config[table], null, 4));
            });
            removed.forEach(function (name) {
                self._deleteConfigProperty(name);
            });
            // Migrate the legacy combined value only after all per-table writes succeed.
            var legacy = new GlideRecordSecure('sys_properties');
            if (legacy.get('name', this.DISPLAY_PROPERTY)) gs.setProperty(this.DISPLAY_PROPERTY, '');
            this._displayConfigCache = config;
            return this._answer({
                success: true,
                value: JSON.stringify(config, null, 4),
            });
        } catch (e) {
            return this._answer({
                success: false,
                error: e.message || String(e),
            });
        }
    },
    _fieldPath: function (table, path) {
        if (typeof path !== 'string' || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/i.test(path)) return null;
        var parts = path.split('.'),
            steps = [];
        for (var i = 0; i < parts.length; i++) {
            var schema = new GlideRecordSecure(table);
            if (!schema.isValid() || !schema.isValidField(parts[i])) return null;
            var element = schema.getElement(parts[i]),
                descriptor = element && element.getED();
            var reference =
                descriptor && String(descriptor.getInternalType()) === 'reference'
                    ? String(descriptor.getReference() || '')
                    : '';
            steps.push({
                table: table,
                field: parts[i],
                reference: reference,
            });
            if (i < parts.length - 1) {
                if (!this._table(reference)) return null;
                table = reference;
            }
        }
        return steps;
    },
    _validateDisplayConfig: function (value) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return 'Expected a JSON object keyed by table name.';
        var tables = Object.keys(value);
        for (var i = 0; i < tables.length; i++) {
            var table = tables[i],
                config = value[table];
            if (!this._table(table) || !config || typeof config !== 'object' || Array.isArray(config))
                return 'Invalid display configuration for ' + table + '.';
            var legacy = typeof config.display === 'string';
            if (
                legacy
                    ? Object.keys(config).some(function (key) {
                          return key !== 'display' && key !== 'secondary';
                      }) ||
                      (config.secondary !== undefined && !Array.isArray(config.secondary))
                    : typeof config.display_value !== 'string' ||
                      typeof config.additional_fields !== 'string' ||
                      (config.display_separator !== undefined && typeof config.display_separator !== 'string') ||
                      Object.keys(config).some(function (key) {
                          return key !== 'display_value' && key !== 'additional_fields' && key !== 'display_separator';
                      })
            )
                return 'Invalid display configuration for ' + table + '.';
            var normalised = this._normaliseDisplayConfig(config);
            var extra = normalised.additional_fields.trim()
                ? normalised.additional_fields.split(',').map(function (field) {
                      return field.trim();
                  })
                : [];
            var fields = normalised.display_value
                .split(/[,.]/)
                .map(function (field) {
                    return field.trim();
                })
                .concat(extra);
            for (var j = 0; j < fields.length; j++) {
                if (!this._fieldPath(table, fields[j]))
                    return 'Invalid field path: ' + table + '.' + String(fields[j]) + '.';
            }
        }
        return '';
    },
    _configuredValue: function (record, table, payload, path, displayOnly) {
        // Resolve each reference securely; never evaluate a field path as code.
        try {
            var steps = this._fieldPath(table, path);
            if (!steps) return '';
            for (var i = 0; i < steps.length; i++) {
                var step = steps[i],
                    raw = '',
                    display = '';
                if (record) {
                    var element = record.getElement(step.field);
                    if (!element || !element.canRead()) return '';
                    var rawValue = record.getValue(step.field),
                        displayValue = record.getDisplayValue(step.field);
                    raw = rawValue === null || rawValue === undefined ? '' : String(rawValue);
                    display = displayValue === null || displayValue === undefined ? '' : String(displayValue);
                } else if (i === 0) {
                    var field = this._payloadField(payload, step.field);
                    raw = field.value;
                    display = field.display;
                } else return '';
                if (i === steps.length - 1) return displayOnly ? display : display || raw;
                if (!this._sysId(raw)) return '';
                record = this._record(step.reference, raw);
                if (!record) return '';
            }
        } catch (e) {}
        return '';
    },
    _consolidation: function (record, table, payload) {
        if (table !== 'kb_knowledge') return null;
        // Article numbers survive version-specific sys_ids. Never merge by title.
        var number = this._configuredValue(record, table, payload, 'number');
        if (!number) return null;
        return {
            key: number,
            name: number,
            version: this._configuredValue(record, table, payload, 'display_number'),
        };
    },
    _secondaryValues: function (record, table, payload, usedFields) {
        var config = this._displayConfig(table),
            result = [];
        if (!config || !config.additional_fields) return result;
        if (!usedFields) {
            usedFields = [];
            this._name(record, table, '', payload, '', 0, usedFields);
        }
        var seen = usedFields.slice();
        var fields = config.additional_fields.split(',').map(function (field) {
            return field.trim();
        });
        for (var i = 0; i < fields.length; i++) {
            if (seen.indexOf(fields[i]) !== -1) continue;
            seen.push(fields[i]);
            var value = this._configuredValue(record, table, payload, fields[i]);
            if (value) result.push(value);
        }
        return result;
    },
    _name: function (record, table, id, payload, fallback, depth, usedFields) {
        function selected(value, field) {
            if (usedFields && field && usedFields.indexOf(field) === -1) usedFields.push(field);
            return value;
        }
        var config = !depth && this._displayConfig(table);
        if (config && config.display_value) {
            var groups = config.display_value.split(',').map(function (group) {
                return group.split('.').map(function (field) {
                    return field.trim();
                });
            });
            // Commas retain ordered fallbacks; periods combine fields on this record.
            for (var pass = 0; pass < 2; pass++) {
                for (var index = 0; index < groups.length; index++) {
                    var fields = groups[index],
                        parts = [],
                        chosen = [];
                    for (var part = 0; part < fields.length; part++) {
                        if (chosen.indexOf(fields[part]) !== -1) continue;
                        var value = this._configuredValue(
                            record,
                            table,
                            payload,
                            fields[part],
                            fields.length === 1 && pass === 0
                        );
                        if (value) {
                            parts.push(value);
                            chosen.push(fields[part]);
                        }
                    }
                    if (parts.length) {
                        chosen.forEach(function (field) {
                            selected('', field);
                        });
                        return parts.join('.');
                    }
                }
            }
        }

        var display = this._displayField(table);
        if (record) {
            if (display.name && display.reference && this._sysId(record.getValue(display.name)) && (depth || 0) < 3) {
                var referenced = new GlideRecordSecure(display.reference);
                if (referenced.isValid() && referenced.get(record.getValue(display.name))) {
                    var refName = this._name(
                        referenced,
                        display.reference,
                        record.getValue(display.name),
                        '',
                        '',
                        (depth || 0) + 1
                    );
                    if (
                        refName &&
                        refName !== display.reference + ':' + record.getValue(display.name) &&
                        !this._sysId(refName)
                    )
                        return selected(refName, display.name);
                }
            }
            if (display.name) {
                var fieldName = String(record.getDisplayValue(display.name) || '');
                if (fieldName && !this._sysId(fieldName)) return selected(fieldName, display.name);
            }
            var name = String(record.getDisplayValue() || '');
            if (name && !this._sysId(name)) return selected(name, display.name);
        }
        if (display.name) {
            var payloadDisplay = this._payloadField(payload, display.name);
            if (payloadDisplay.display && !this._sysId(payloadDisplay.display))
                return selected(payloadDisplay.display, display.name);
            if (payloadDisplay.value && !this._sysId(payloadDisplay.value))
                return selected(payloadDisplay.value, display.name);
        }
        var fields = ['name', 'short_description', 'title', 'question_text'];
        for (var i = 0; i < fields.length; i++) {
            var field = this._payloadField(payload, fields[i]);
            if (field.display && !this._sysId(field.display)) return selected(field.display, fields[i]);
            if (field.value && !this._sysId(field.value)) return selected(field.value, fields[i]);
        }
        return fallback && !this._sysId(fallback) ? fallback : table + ':' + id;
    },
    _tableLabel: function (table) {
        this._tableLabels = this._tableLabels || {};
        if (this._tableLabels[table]) return this._tableLabels[table];
        var gr = new GlideRecordSecure('sys_db_object');
        this._tableLabels[table] = gr.get('name', table) ? String(gr.getValue('label') || table) : table;
        return this._tableLabels[table];
    },
    _record: function (table, id) {
        try {
            var gr = new GlideRecordSecure(table);
            return gr.isValid() && gr.get(id) ? gr : null;
        } catch (e) {
            return null;
        }
    },
    _updateForTarget: function (table, id, setTable, setId) {
        if (!setId || (setTable !== 'sys_update_set' && setTable !== 'sys_remote_update_set')) return null;
        var gr = new GlideRecordSecure('sys_update_xml');
        gr.addQuery(setTable === 'sys_update_set' ? 'update_set' : 'remote_update_set', setId);
        gr.addQuery('name', table + '_' + id);
        gr.orderByDesc('sys_created_on');
        gr.setLimit(1);
        gr.query();
        return gr.next()
            ? {
                  id: String(gr.getUniqueValue()),
                  payload: String(gr.getValue('payload') || ''),
                  name: String(gr.getValue('target_name') || ''),
                  action: String(gr.getValue('action') || ''),
              }
            : null;
    },
    _groupConfigs: function () {
        var gr = new GlideRecordSecure('sys_properties'),
            configs = {};
        gr.addQuery('name', 'STARTSWITH', this.GROUPS_PREFIX);
        gr.query();
        while (gr.next()) {
            var name = String(gr.getValue('name') || '');
            var table = name.slice(this.GROUPS_PREFIX.length);
            var value = String(gr.getValue('value') || '').trim();
            if (this._table(table) && value) {
                var children = JSON.parse(value);
                if (!Array.isArray(children) || children.length) configs[table] = children;
            }
        }
        return configs;
    },
    _parentReferences: function (parent) {
        var dictionary = new GlideRecordSecure('sys_dictionary'),
            targets = {};
        dictionary.addQuery('name', 'IN', this._hierarchyNames(parent).join(','));
        dictionary.addQuery('internal_type', 'reference');
        dictionary.query();
        while (dictionary.next()) {
            var target = String(dictionary.getValue('reference') || ''),
                field = String(dictionary.getValue('element') || '');
            if (!this._table(target) || !this._table(field)) continue;
            if (!targets[target]) targets[target] = [];
            if (targets[target].indexOf(field) === -1) targets[target].push(field);
        }
        Object.keys(targets).forEach(function (target) {
            targets[target].sort();
        });
        return targets;
    },
    _referenceField: function (parent, child) {
        var related = this._relatedTables(parent).filter(function (entry) {
            return entry.table === child;
        });
        if (related.length === 1) return related[0].field;
        var gr = new GlideRecordSecure('sys_dictionary');
        gr.addQuery('name', 'IN', this._hierarchyNames(child).join(','));
        gr.addQuery('internal_type', 'reference');
        gr.addQuery('reference', 'IN', this._hierarchyNames(parent).join(','));
        gr.query();
        var fields = {};
        while (gr.next()) fields[String(gr.getValue('element'))] = true;
        var names = Object.keys(fields);
        if (!names.length) {
            var forward = this._parentReferences(parent),
                references = [],
                hierarchy = this._hierarchyNames(child);
            hierarchy.forEach(function (table) {
                (forward[table] || []).forEach(function (field) {
                    if (references.indexOf(field) === -1) references.push(field);
                });
            });
            if (references.length) return { parentFields: references.sort() };
        }
        if (names.length !== 1) throw new Error('Expected one reference from ' + child + ' to ' + parent + '.');
        return names[0];
    },
    _buildGroupRules: function (configs) {
        var self = this,
            parents = {},
            active = {},
            built = {};
        Object.keys(configs).forEach(function (parent) {
            if (!self._table(parent) || !Array.isArray(configs[parent]))
                throw new Error('Use a JSON array of child table names.');
            var table = new GlideRecordSecure('sys_db_object');
            if (!table.get('name', parent)) throw new Error('Unknown table: ' + parent);
            configs[parent].forEach(function (child) {
                if (typeof child !== 'string' || !self._table(child))
                    throw new Error('Use a JSON array of child table names.');
                if (parents[child]) throw new Error('A child table can appear under only one parent: ' + child);
                parents[child] = parent;
            });
        });
        function node(table, depth) {
            if (active[table] || depth > 6) throw new Error('The table hierarchy contains a cycle or is too deep.');
            if (built[table]) return built[table];
            var record = new GlideRecordSecure('sys_db_object');
            if (!record.get('name', table)) throw new Error('Unknown table: ' + table);
            active[table] = true;
            var result = {
                id: table,
                table: table,
                label: self._tableLabel(table),
                children: [],
            };
            if (parents[table]) {
                var reference = self._referenceField(parents[table], table);
                if (typeof reference === 'string') result.field = reference;
                else {
                    result.parentFields = reference.parentFields;
                    result.field = parents[table] + '.' + reference.parentFields.join(', ' + parents[table] + '.');
                }
            }
            result.children = (configs[table] || []).map(function (child) {
                return node(child, depth + 1);
            });
            delete active[table];
            built[table] = result;
            return result;
        }
        // Visit every node as well as roots so a rootless cycle is rejected.
        Object.keys(configs)
            .filter(function (table) {
                return !parents[table];
            })
            .forEach(function (table) {
                node(table, 0);
            });
        Object.keys(configs).forEach(function (table) {
            node(table, 0);
        });
        return this._sortRules({
            version: 1,
            groups: Object.keys(configs)
                .filter(function (table) {
                    return !parents[table];
                })
                .map(function (table) {
                    return built[table];
                }),
        });
    },
    _rules: function () {
        return this._buildGroupRules(this._groupConfigs());
    },
    _findRule: function (nodes, table, chain, orders) {
        for (var i = 0; i < nodes.length; i++) {
            var next = chain.concat(nodes[i]);
            var nextOrders = (orders || []).concat(i);
            if (nodes[i].table === table) return { chain: next, orders: nextOrders };
            var child = this._findRule(nodes[i].children || [], table, next, nextOrders);
            if (child) return child;
        }
        return null;
    },
    _referencingParentId: function (parent, fields, childId, setTable, setId) {
        var matches = {},
            gr = new GlideRecordSecure(parent);
        var condition = gr.addQuery(fields[0], childId);
        for (var i = 1; i < fields.length; i++) condition.addOrCondition(fields[i], childId);
        gr.query();
        while (gr.next()) matches[String(gr.getUniqueValue())] = true;
        // Deleted parents can still be resolved from their latest captured payload.
        if (this._sysId(setId) && (setTable === 'sys_update_set' || setTable === 'sys_remote_update_set')) {
            var updates = new GlideRecordSecure('sys_update_xml'),
                seen = {},
                self = this;
            updates.addQuery(setTable === 'sys_update_set' ? 'update_set' : 'remote_update_set', setId);
            updates.addQuery('name', 'STARTSWITH', parent + '_');
            updates.orderByDesc('sys_updated_on');
            updates.query();
            var captured = {};
            while (updates.next()) {
                var name = String(updates.getValue('name') || ''),
                    id = name.slice(parent.length + 1);
                if (!this._sysId(id) || seen[id]) continue;
                seen[id] = true;
                var payload = String(updates.getValue('payload') || '');
                if (
                    fields.some(function (field) {
                        return self._payloadField(payload, field).value === childId;
                    })
                )
                    captured[id] = true;
            }
            var ids = Object.keys(captured);
            if (ids.length === 1) return ids[0];
            ids.forEach(function (id) {
                matches[id] = true;
            });
        }
        var parents = Object.keys(matches);
        // Shared components must not be assigned to an arbitrary parent.
        return parents.length === 1 ? parents[0] : '';
    },
    _ancestors: function (table, id, payload, rules, setTable, setId) {
        var match = this._findRule(rules.groups, table, []);
        var ordinary = {
            type: this._tableLabel(table),
            typeOrder: 10000,
            ancestors: [],
        };
        if (!match) return ordinary;
        var chain = match.chain;
        if (chain.length === 1)
            return {
                type: chain[0].label,
                typeOrder: match.orders[0],
                ancestors: [],
            };
        var ancestors = [];
        var childId = id,
            childPayload = payload,
            childRecord = this._record(table, id);
        for (var i = chain.length - 1; i > 0; i--) {
            var field = chain[i].field;
            var parent = chain[i - 1];
            var parentId;
            if (chain[i].parentFields)
                parentId = this._referencingParentId(parent.table, chain[i].parentFields, childId, setTable, setId);
            else {
                parentId = childRecord ? String(childRecord.getValue(field) || '') : '';
                if (!this._sysId(parentId)) parentId = this._payloadField(childPayload, field).value;
            }
            if (!this._sysId(parentId)) return ordinary;
            var parentRecord = this._record(parent.table, parentId);
            var parentUpdate = this._updateForTarget(parent.table, parentId, setTable, setId);
            if (!parentRecord && !parentUpdate) return ordinary;
            var primaryFields = [];
            ancestors.unshift({
                table: parent.table,
                id: parentId,
                inUpdateSet: !!parentUpdate,
                action: parentUpdate ? parentUpdate.action : '',
                isNew:
                    !!parentUpdate &&
                    this._isNewUpdate(parentUpdate.action, parent.table + '_' + parentId, setTable, setId),
                consolidation: this._consolidation(
                    parentRecord,
                    parent.table,
                    parentUpdate ? parentUpdate.payload : ''
                ),
                type: parent.label,
                typeOrder: match.orders[i - 1],
                name: this._name(
                    parentRecord,
                    parent.table,
                    parentId,
                    parentUpdate ? parentUpdate.payload : '',
                    parentUpdate ? parentUpdate.name : '',
                    0,
                    primaryFields
                ),
                secondary: this._secondaryValues(
                    parentRecord,
                    parent.table,
                    parentUpdate ? parentUpdate.payload : '',
                    primaryFields
                ),
                url: parentRecord ? this._url(parent.table, parentId) : this._url('sys_update_xml', parentUpdate.id),
            });
            childId = parentId;
            childRecord = parentRecord;
            childPayload = parentUpdate ? parentUpdate.payload : '';
        }
        return {
            type: chain[chain.length - 1].label,
            typeOrder: match.orders[match.orders.length - 1],
            ancestors: ancestors,
        };
    },

    getSetsForUpdates: function () {
        var ids = String(this.getParameter('update_ids') || '')
            .split(',')
            .filter(function (id) {
                return id;
            });
        if (!ids.length || ids.length > 100)
            return this._answer({
                success: false,
                error: 'Select 1 to 100 customer updates.',
            });
        var seen = {},
            sets = [];
        for (var i = 0; i < ids.length; i++) {
            if (!this._sysId(ids[i]))
                return this._answer({
                    success: false,
                    error: 'Invalid customer update ID.',
                });
            var update = new GlideRecordSecure('sys_update_xml');
            if (!update.get(ids[i]))
                return this._answer({
                    success: false,
                    error: 'A selected customer update is unavailable.',
                });
            var local = String(update.getValue('update_set') || '');
            var remote = String(update.getValue('remote_update_set') || '');
            var setTable = local ? 'sys_update_set' : 'sys_remote_update_set';
            var setId = local || remote;
            if (!this._sysId(setId))
                return this._answer({
                    success: false,
                    error: 'A selected update has no update set.',
                });
            var key = setTable + ':' + setId;
            if (seen[key]) continue;
            var set = new GlideRecordSecure(setTable);
            if (!set.get(setId))
                return this._answer({
                    success: false,
                    error: 'An update set is unavailable.',
                });
            seen[key] = true;
            sets.push({
                table: setTable,
                id: setId,
                name: String(set.getValue('name') || setId),
                url: this._url(setTable, setId),
            });
        }
        sets.sort(function (a, b) {
            return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
        });
        return this._answer({ success: true, sets: sets });
    },
    getMemberPage: function () {
        var setTable = String(this.getParameter('set_table') || '');
        var setId = String(this.getParameter('set_id') || '');
        var offset = Number(this.getParameter('offset') || 0);
        if (
            (setTable !== 'sys_update_set' && setTable !== 'sys_remote_update_set') ||
            !this._sysId(setId) ||
            !isFinite(offset) ||
            offset < 0 ||
            offset % this.PAGE_SIZE !== 0
        ) {
            return this._answer({
                success: false,
                error: 'Invalid update set page.',
            });
        }
        var set = new GlideRecordSecure(setTable);
        if (!set.get(setId))
            return this._answer({
                success: false,
                error: 'Update set unavailable.',
            });
        var field = setTable === 'sys_update_set' ? 'update_set' : 'remote_update_set';
        var gr = new GlideRecordSecure('sys_update_xml');
        gr.addQuery(field, setId);
        return this._markdownPage(gr, offset);
    },
    getListPage: function () {
        var query = this.getParameter('list_query');
        var offset = Number(this.getParameter('offset') || 0);
        if (
            query === null ||
            typeof query === 'undefined' ||
            !isFinite(offset) ||
            offset < 0 ||
            offset % this.PAGE_SIZE !== 0
        ) {
            return this._answer({
                success: false,
                error: 'Invalid customer updates list page.',
            });
        }
        var gr = new GlideRecordSecure('sys_update_xml');
        if (String(query)) gr.addEncodedQuery(String(query));
        return this._markdownPage(gr, offset);
    },
    _isNewUpdate: function (action, name, setTable, setId) {
        if (
            action === 'DELETE' ||
            !name ||
            !setId ||
            (setTable !== 'sys_update_set' && setTable !== 'sys_remote_update_set')
        )
            return false;
        this._firstUpdateSets = this._firstUpdateSets || {};
        if (!Object.prototype.hasOwnProperty.call(this._firstUpdateSets, name)) {
            // Repeated edits in the originating set remain new, regardless of mod count.
            var history = new GlideRecordSecure('sys_update_xml');
            history.addQuery('name', name);
            history.orderBy('sys_created_on');
            history.orderBy('sys_id');
            history.setLimit(1);
            history.query();
            var firstSet = '';
            if (history.next()) {
                var local = String(history.getValue('update_set') || '');
                var remote = String(history.getValue('remote_update_set') || '');
                firstSet = local ? 'sys_update_set:' + local : remote ? 'sys_remote_update_set:' + remote : '';
            }
            this._firstUpdateSets[name] = firstSet;
        }
        return this._firstUpdateSets[name] === setTable + ':' + setId;
    },
    _markdownSourceSet: function (table, id) {
        if (!this._sysId(id)) return null;
        this._markdownSourceSets = this._markdownSourceSets || {};
        var key = table + ':' + id;
        if (!this._markdownSourceSets[key]) {
            var record = new GlideRecordSecure(table);
            var name = record.get(id) ? String(record.getValue('name') || id) : id;
            this._markdownSourceSets[key] = {
                table: table,
                id: id,
                name: name,
                url: this._url(table, id),
            };
        }
        return this._markdownSourceSets[key];
    },
    _markdownPage: function (gr, offset) {
        gr.orderByDesc('sys_updated_on');
        gr.orderByDesc('sys_id');
        gr.chooseWindow(offset, offset + this.PAGE_SIZE + 1);
        gr.query();
        var rows = [],
            rules = this._rules();
        while (gr.next() && rows.length <= this.PAGE_SIZE) {
            var local = String(gr.getValue('update_set') || '');
            var setTable = local ? 'sys_update_set' : 'sys_remote_update_set';
            var setId = local || String(gr.getValue('remote_update_set') || '');
            var sourceSet = this._markdownSourceSet(setTable, setId);
            var target = this._target(gr);
            var updateId = String(gr.getUniqueValue());
            if (!target) {
                rows.push({
                    table: 'sys_update_xml',
                    id: updateId,
                    sourceSet: sourceSet,
                    type: 'Unresolved Customer Updates',
                    name: String(gr.getValue('target_name') || gr.getValue('name') || updateId),
                    url: this._url('sys_update_xml', updateId),
                    ancestors: [],
                    action: '',
                });
                continue;
            }
            var action = String(gr.getValue('action') || '');
            var live = this._record(target.table, target.id);
            var grouping = this._ancestors(target.table, target.id, target.payload, rules, setTable, setId);
            var primaryFields = [];
            rows.push({
                table: target.table,
                id: target.id,
                sourceSet: sourceSet,
                type: grouping.type,
                typeOrder: grouping.typeOrder,
                inUpdateSet: true,
                consolidation: this._consolidation(live, target.table, target.payload),
                name: this._name(
                    live,
                    target.table,
                    target.id,
                    target.payload,
                    String(gr.getValue('target_name') || ''),
                    0,
                    primaryFields
                ),
                secondary: this._secondaryValues(live, target.table, target.payload, primaryFields),
                url: live ? this._url(target.table, target.id) : this._url('sys_update_xml', updateId),
                ancestors: grouping.ancestors,
                action: action,
                isNew: this._isNewUpdate(action, String(gr.getValue('name') || ''), setTable, setId),
                updateId: updateId,
            });
        }
        var hasMore = rows.length > this.PAGE_SIZE;
        if (hasMore) rows.pop();
        var maxListLevels = Number(gs.getProperty('monaco.plus.update_sets.markdown_max_list_levels', '9'));
        if (!isFinite(maxListLevels) || maxListLevels < 1 || Math.floor(maxListLevels) !== maxListLevels)
            maxListLevels = 9;
        return this._answer({
            success: true,
            rows: rows,
            hasMore: hasMore,
            nextOffset: offset + rows.length,
            maxListLevels: maxListLevels,
            indicators: this._markdownFormatting(),
            escapeMarkdown:
                String(gs.getProperty('monaco.plus.update_sets.markdown_escape_characters', 'false')) === 'true',
        });
    },
    _parseMarkdownFormatting: function (value) {
        var config = JSON.parse(value);
        if (!config || typeof config !== 'object' || Array.isArray(config))
            throw new Error('Formatting must be a JSON object.');
        Object.keys(config).forEach(function (key) {
            if (key === 'update_set' && config[key] && typeof config[key] === 'object' && !Array.isArray(config[key])) {
                Object.keys(config[key]).forEach(function (number) {
                    if (!/^[1-9][0-9]*$/.test(number) || typeof config[key][number] !== 'string') {
                        throw new Error('Update-set indicators must use positive number keys, with string values.');
                    }
                });
                return;
            }
            if (
                key === 'display_field_wrapper' &&
                typeof config[key] === 'string' &&
                config[key].length !== 0 &&
                config[key].length !== 2
            ) {
                throw new Error('Use two characters for the display-field wrapper, such as (), or an empty string.');
            }
            if (
                ['new', 'deleted', 'display_field_separator', 'context_indicator', 'display_field_wrapper'].indexOf(
                    key
                ) === -1 ||
                typeof config[key] !== 'string'
            ) {
                throw new Error('Use string formatting values and a numbered object for update_set.');
            }
        });
        return config;
    },
    _markdownFormatting: function () {
        try {
            return this._parseMarkdownFormatting(
                String(
                    gs.getProperty(
                        'monaco.plus.update_sets.markdown_formatting',
                        gs.getProperty('monaco.plus.update_sets.markdown_indicators', 'null')
                    )
                )
            );
        } catch (e) {
            return null;
        } // Invalid external edits fall back to the built-in indicators.
    },
    _groupPropertyTables: function () {
        var properties = new GlideRecordSecure('sys_properties'),
            tables = [];
        properties.addQuery('name', 'STARTSWITH', this.GROUPS_PREFIX);
        properties.query();
        while (properties.next()) tables.push(String(properties.getValue('name')).slice(this.GROUPS_PREFIX.length));
        return tables;
    },
    getRules: function () {
        if (!gs.hasRole('admin'))
            return this._answer({
                success: false,
                error: 'Admin role required.',
            });
        try {
            var raw = this.getParameter('rules');
            var configs = raw ? JSON.parse(String(raw)) : this._groupConfigs();
            this._validateGroupConfigs(configs);
            return this._answer({
                success: true,
                rules: this._buildGroupRules(configs),
                config: configs,
                propertyTables: this._groupPropertyTables(),
            });
        } catch (e) {
            return this._answer({
                success: false,
                error: e.message || String(e),
            });
        }
    },
    getProperties: function () {
        if (!gs.hasRole('admin'))
            return this._answer({
                success: false,
                error: 'Admin role required.',
            });
        var gr = new GlideRecordSecure('sys_properties');
        gr.addQuery('name', 'STARTSWITH', 'monaco.plus.');
        gr.orderBy('name');
        gr.query();
        var properties = [],
            groupsUpdated = {},
            displayUpdated = {};
        while (gr.next()) {
            var name = String(gr.getValue('name') || '');
            var updatedOn = String(gr.getValue('sys_updated_on') || '');
            if (name.indexOf(this.GROUPS_PREFIX) === 0)
                groupsUpdated[name.slice(this.GROUPS_PREFIX.length)] = updatedOn;
            if (name.indexOf(this.DISPLAY_PROPERTY + '.') === 0)
                displayUpdated[name.slice(this.DISPLAY_PROPERTY.length + 1)] = updatedOn;
            if (
                name === this.RULES_PROPERTY ||
                name.indexOf(this.GROUPS_PREFIX) === 0 ||
                name === this.DISPLAY_PROPERTY ||
                name.indexOf(this.DISPLAY_PROPERTY + '.') === 0
            )
                continue;
            properties.push({
                name: name,
                updatedOn: updatedOn,
                value: String(gr.getValue('value') || ''),
                description: String(gr.getValue('description') || ''),
                type: String(gr.getValue('type') || 'string'),
            });
        }
        properties.push({
            name: this.DISPLAY_PROPERTY,
            updatedByTable: displayUpdated,
            value: JSON.stringify(this._displayConfigs(), null, 4),
            description: 'Display and secondary fields by table for update set Markdown export.',
            type: 'string',
        });
        properties.push({
            name: this.RULES_PROPERTY,
            updatedByTable: groupsUpdated,
            propertyCount: this._groupPropertyTables().length,
            value: JSON.stringify(this._groupConfigs(), null, 4),
            description: 'Child tables grouped by parent table in update set Markdown export.',
            type: 'string',
        });
        return this._answer({ success: true, properties: properties });
    },
    saveProperty: function () {
        if (!gs.hasRole('admin'))
            return this._answer({
                success: false,
                error: 'Admin role required.',
            });
        var name = String(this.getParameter('property_name') || '');
        var value = String(this.getParameter('property_value') || '');
        if (name === this.DISPLAY_PROPERTY) return this._saveDisplayConfigs(value);
        if (name.indexOf(this.DISPLAY_PROPERTY + '.') === 0)
            return this._answer({
                success: false,
                error: 'Use the combined Markdown display editor.',
            });
        if (value.length > 4000)
            return this._answer({
                success: false,
                error: 'Property value exceeds 4000 characters.',
            });
        if (!/^monaco\.plus\.[a-z0-9_.]+$/.test(name)) {
            return this._answer({
                success: false,
                error: 'Invalid Widget Editor+ property.',
            });
        }
        if (
            /^monaco\.plus\.(?:code_search\.display_fields\.|assistant\.table_config\.|editor\.table_config\.)/.test(
                name
            )
        ) {
            return this._answer({
                success: false,
                error: 'Use the table configuration editor.',
            });
        }
        if (name.indexOf(this.GROUPS_PREFIX) === 0) {
            return this._answer({
                success: false,
                error: 'Use the combined Table hierarchy editor.',
            });
        }
        if (name === this.RULES_PROPERTY) {
            return this._answer({
                success: false,
                error: 'Edit Table hierarchy with the hierarchy editor.',
            });
        }
        var property = new GlideRecordSecure('sys_properties');
        if (!property.get('name', name)) {
            return this._answer({
                success: false,
                error: 'Property not found.',
            });
        }
        var json = /^monaco\.plus\.(?:assistant\.table_config\.|css\.variables$|scss\.variables$)/.test(name);
        try {
            var existing = JSON.parse(String(property.getValue('value') || ''));
            if (existing !== null && typeof existing === 'object') json = true;
        } catch (e) {}
        if (json) {
            try {
                JSON.parse(value);
            } catch (e) {
                return this._answer({
                    success: false,
                    error: 'Invalid JSON.',
                });
            }
        }
        if (name === 'monaco.plus.update_sets.markdown_formatting') {
            try {
                this._parseMarkdownFormatting(value);
                value = this._escapeJsonUnicode(value);
            } catch (e) {
                return this._answer({
                    success: false,
                    error: e.message || String(e),
                });
            }
        }
        var type = String(property.getValue('type') || 'string');
        if (type === 'boolean' && value !== 'true' && value !== 'false') {
            return this._answer({
                success: false,
                error: 'Choose true or false.',
            });
        }
        if (type === 'integer' && !/^-?\d+$/.test(value)) {
            return this._answer({
                success: false,
                error: 'Enter a whole number.',
            });
        }
        var dictionary = new GlideRecordSecure('sys_dictionary');
        dictionary.addQuery('name', 'sys_properties');
        dictionary.addQuery('element', 'value');
        dictionary.setLimit(1);
        dictionary.query();
        var limit = dictionary.next() ? parseInt(dictionary.getValue('max_length'), 10) : 4000;
        if (!isFinite(limit) || limit < 1) limit = 4000;
        limit = Math.min(limit, 4000);
        if (value.length > limit)
            return this._answer({
                success: false,
                error: 'Property value exceeds ' + limit + ' characters.',
            });
        gs.setProperty(name, value);
        return this._answer({
            success: true,
            value: String(gs.getProperty(name, '') || ''),
        });
    },
    _ensurePropertyCategory: function (property) {
        var category = new GlideRecordSecure('sys_properties_category');
        if (!category.get('name', 'Widget Editor+'))
            throw new Error('Widget Editor+ property category is unavailable.');
        var link = new GlideRecordSecure('sys_properties_category_m2m');
        link.addQuery('property', property.getUniqueValue());
        link.addQuery('category', category.getUniqueValue());
        link.setLimit(1);
        link.query();
        if (link.next()) return;
        link.initialize();
        link.setValue('property', property.getUniqueValue());
        link.setValue('category', category.getUniqueValue());
        link.setValue('order', 100);
        if (!link.insert()) throw new Error('Could not add property to the Widget Editor+ category.');
    },
    _tablePropertyPrefix: function (kind) {
        if (kind === 'markdown_display') return this.DISPLAY_PROPERTY + '.';
        if (kind === 'display_fields') return 'monaco.plus.code_search.display_fields.';
        if (kind === 'table_config') return 'monaco.plus.assistant.table_config.';
        if (kind === 'editor_config') return 'monaco.plus.editor.table_config.';
        throw new Error('Invalid property family.');
    },
    _requireConfigTable: function (table) {
        if (!this._table(table) || !new GlideRecordSecure('sys_db_object').get('name', table)) {
            throw new Error('Invalid table: ' + table);
        }
    },
    _requireConfigField: function (table, field) {
        if (
            typeof field !== 'string' ||
            !/^[a-z][a-z0-9_]*$/i.test(field) ||
            !new GlideRecordSecure(table).isValidField(field)
        )
            throw new Error('Invalid field: ' + table + '.' + field);
    },
    _validateAssistantConfig: function (table, config) {
        var self = this;
        function object(value, allowed) {
            if (
                !value ||
                typeof value !== 'object' ||
                Array.isArray(value) ||
                Object.keys(value).some(function (key) {
                    return allowed.indexOf(key) === -1;
                })
            ) {
                throw new Error('Invalid Assistant configuration schema.');
            }
        }
        object(config, ['rules', 'pickerFields']);
        if (config.pickerFields !== undefined) {
            if (!Array.isArray(config.pickerFields)) throw new Error('pickerFields must be an array.');
            config.pickerFields.forEach(function (field) {
                self._requireConfigField(table, field);
            });
        }
        function rules(source, items, depth) {
            if (!Array.isArray(items) || depth > 20)
                throw new Error('rules and then must be arrays with at most 20 nesting levels.');
            items.forEach(function (rule) {
                var allowed = ['type', 'relatedTable', 'category', 'then'];
                if (rule && rule.type === 'reference_field')
                    allowed = allowed.concat(['sourceField', 'relatedMatchField']);
                else if (rule && rule.type === 'child_reference') allowed.push('relatedField');
                else if (rule && rule.type === 'token')
                    allowed = allowed.concat(['sourceField', 'pattern', 'relatedMatchField']);
                else throw new Error('Invalid rule type.');
                object(rule, allowed);
                self._requireConfigTable(rule.relatedTable);
                if (rule.category !== undefined && typeof rule.category !== 'string')
                    throw new Error('category must be a string.');
                if (rule.type === 'child_reference') self._requireConfigField(rule.relatedTable, rule.relatedField);
                else {
                    var fields =
                        rule.type === 'token' && Array.isArray(rule.sourceField)
                            ? rule.sourceField
                            : [rule.sourceField];
                    if (!fields.length) throw new Error('sourceField must contain a field.');
                    fields.forEach(function (field) {
                        self._requireConfigField(source, field);
                    });
                    self._requireConfigField(
                        rule.relatedTable,
                        rule.relatedMatchField === undefined
                            ? rule.type === 'token'
                                ? 'name'
                                : 'sys_id'
                            : rule.relatedMatchField
                    );
                    if (rule.type === 'token') {
                        if (typeof rule.pattern !== 'string' || !rule.pattern)
                            throw new Error('pattern must be a non-empty regular expression.');
                        try {
                            new RegExp(rule.pattern);
                        } catch (e) {
                            throw new Error('Invalid token regular expression.');
                        }
                    }
                }
                if (rule.then !== undefined) rules(rule.relatedTable, rule.then, depth + 1);
            });
        }
        if (config.rules !== undefined) rules(table, config.rules, 1);
    },
    saveTableProperty: function () {
        if (!gs.hasRole('admin'))
            return this._answer({
                success: false,
                error: 'Admin role required.',
            });
        try {
            var kind = String(this.getParameter('kind') || ''),
                prefix = this._tablePropertyPrefix(kind);
            var table = String(this.getParameter('table') || '').trim();
            this._requireConfigTable(table);
            var value = String(this.getParameter('property_value') || '');
            var description = String(this.getParameter('description') || '');
            if (kind !== 'markdown_display' && value.length > 4000)
                throw new Error('Property value exceeds 4000 characters.');
            if ((kind === 'table_config' || kind === 'editor_config') && description.length > 512)
                throw new Error('Description exceeds 512 characters.');
            if (kind === 'display_fields') {
                var self = this,
                    fields = value.split(',').map(function (field) {
                        return field.trim();
                    });
                fields.forEach(function (field) {
                    self._requireConfigField(table, field);
                });
                value = fields
                    .filter(function (field, i) {
                        return fields.indexOf(field) === i;
                    })
                    .join(',');
            } else if (kind === 'markdown_display') {
                var display = JSON.parse(value),
                    configs = {};
                if (
                    !display ||
                    typeof display.display_value !== 'string' ||
                    typeof display.additional_fields !== 'string' ||
                    Object.keys(display).some(function (key) {
                        return key !== 'display_value' && key !== 'additional_fields';
                    })
                )
                    throw new Error('Use display_value and additional_fields strings.');
                configs[table] = display;
                var error = this._validateDisplayConfig(configs);
                if (error) throw new Error(error);
                value = JSON.stringify(display, null, 4);
            } else if (kind === 'editor_config') {
                new global.WidgetEditorAjax()._parseEditorConfig(table, JSON.parse(value));
            } else this._validateAssistantConfig(table, JSON.parse(value));
            var name = prefix + table,
                property = new GlideRecordSecure('sys_properties');
            var exists = property.get('name', name);
            if (!exists) {
                property.initialize();
                property.setValue('name', name);
                property.setValue('type', 'string');
                property.setValue('read_roles', 'sp_admin');
                property.setValue('write_roles', 'admin');
                property.setValue('ignore_cache', true);
            }
            if (kind === 'table_config' || kind === 'editor_config') property.setValue('description', description);
            property.setValue('value', value);
            if (!(exists ? property.update() : property.insert())) throw new Error('Could not save property.');
            this._ensurePropertyCategory(property);
            gs.setProperty(name, value);
            if (kind === 'markdown_display') this._removeLegacyDisplayTable(table);
            return this._answer({ success: true, value: value });
        } catch (e) {
            return this._answer({
                success: false,
                error: e.message || String(e),
            });
        }
    },
    deleteTableProperty: function () {
        if (!gs.hasRole('admin'))
            return this._answer({
                success: false,
                error: 'Admin role required.',
            });
        try {
            var prefix = this._tablePropertyPrefix(String(this.getParameter('kind') || ''));
            var table = String(this.getParameter('table') || '');
            if (!this._table(table)) throw new Error('Invalid table name.');
            this._deleteConfigProperty(prefix + table);
            if (prefix === this.DISPLAY_PROPERTY + '.') this._removeLegacyDisplayTable(table);
            return this._answer({ success: true });
        } catch (e) {
            return this._answer({
                success: false,
                error: e.message || String(e),
            });
        }
    },
    _deleteConfigProperty: function (name) {
        var property = new GlideRecordSecure('sys_properties');
        if (property.get('name', name) && !property.deleteRecord())
            throw new Error('Could not delete property: ' + name);
    },
    _validateGroupConfigs: function (configs) {
        if (!configs || typeof configs !== 'object' || Array.isArray(configs)) {
            throw new Error('Use a JSON object mapping parent tables to arrays of child table names.');
        }
        Object.keys(configs).forEach(function (table) {
            if (
                !/^[a-z][a-z0-9_]*$/i.test(table) ||
                !Array.isArray(configs[table]) ||
                configs[table].some(function (child) {
                    return typeof child !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(child);
                })
            ) {
                throw new Error('Use a JSON object mapping parent tables to arrays of child table names.');
            }
        });
    },
    _writeGroupProperty: function (name, value) {
        if (!value) {
            this._deleteConfigProperty(name);
            return;
        }
        var property = new GlideRecordSecure('sys_properties');
        if (!property.get('name', name)) {
            // Removed/empty groups must never create a property for a leaf table.
            if (!value) return;
            property.initialize();
            property.setValue('name', name);
            property.setValue('type', 'string');
            property.setValue('read_roles', 'sp_admin');
            property.setValue('write_roles', 'admin');
            property.setValue('ignore_cache', true);
            property.setValue(
                'description',
                'Child tables grouped under ' +
                    name.slice(this.GROUPS_PREFIX.length) +
                    ' in update set Markdown export.'
            );
            property.setValue('value', value);
            if (!property.insert()) throw new Error('Could not create property: ' + name);
        }
        this._ensurePropertyCategory(property);
        gs.setProperty(name, value);
    },
    saveRules: function () {
        if (!gs.hasRole('admin'))
            return this._answer({
                success: false,
                error: 'Admin role required.',
            });
        try {
            var configs = JSON.parse(String(this.getParameter('rules') || ''));
            this._validateGroupConfigs(configs);
            this._buildGroupRules(configs);
            // Validate the entire edit before writing any individual property.
            var existing = new GlideRecordSecure('sys_properties'),
                names = {},
                self = this;
            existing.addQuery('name', 'STARTSWITH', this.GROUPS_PREFIX);
            existing.query();
            while (existing.next()) names[String(existing.getValue('name'))] = true;
            Object.keys(configs).forEach(function (table) {
                if (configs[table].length) names[self.GROUPS_PREFIX + table] = true;
            });
            Object.keys(names).forEach(function (name) {
                var children = configs[name.slice(self.GROUPS_PREFIX.length)];
                self._writeGroupProperty(name, children && children.length ? JSON.stringify(children, null, 4) : '');
            });
            return this._answer({ success: true });
        } catch (e) {
            return this._answer({
                success: false,
                error: e.message || String(e),
            });
        }
    },
    searchTables: function () {
        if (!gs.hasRole('admin'))
            return this._answer({
                success: false,
                error: 'Admin role required.',
            });
        var query = String(this.getParameter('query') || '').trim();
        var gr = new GlideRecordSecure('sys_db_object');
        if (query) {
            var q = gr.addQuery('name', 'CONTAINS', query);
            q.addOrCondition('label', 'CONTAINS', query);
        }
        gr.orderBy('label');
        gr.setLimit(50);
        gr.query();
        var tables = [];
        while (gr.next())
            tables.push({
                name: String(gr.getValue('name')),
                label: String(gr.getValue('label') || gr.getValue('name')),
            });
        return this._answer({ success: true, tables: tables });
    },
    getReferenceFields: function () {
        if (!gs.hasRole('admin'))
            return this._answer({
                success: false,
                error: 'Admin role required.',
            });
        var table = String(this.getParameter('table') || '');
        if (!this._table(table))
            return this._answer({
                success: false,
                error: 'Invalid table.',
            });
        var names = this._hierarchyNames(table);
        var gr = new GlideRecordSecure('sys_dictionary');
        gr.addQuery('name', 'IN', names.join(','));
        gr.addQuery('internal_type', 'reference');
        gr.orderBy('element');
        gr.query();
        var fields = [],
            seen = {};
        while (gr.next()) {
            var field = String(gr.getValue('element') || '');
            if (!field || seen[field]) continue;
            seen[field] = true;
            fields.push({
                name: field,
                label: String(gr.getValue('column_label') || field),
                reference: String(gr.getValue('reference') || ''),
            });
        }
        return this._answer({ success: true, fields: fields });
    },
    type: 'WidgetEditorMarkdownAjax',
});

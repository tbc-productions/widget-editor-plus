var WidgetEditorCreditAjax = Class.create();
WidgetEditorCreditAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {
    _limits: function () {
        if (this._creditLimits) return this._creditLimits;
        var defaults = {
            max_updates: 5000,
            max_payload_chars: 20000000,
            max_history_chars: 100000000,
            max_lines: 50000,
            diff_work: 20000000,
            request_timeout_seconds: 180,
        };
        var limits = {};
        Object.keys(defaults).forEach(function (key) {
            var raw = String(gs.getProperty('monaco.plus.credit.' + key, String(defaults[key])));
            var value = Number(raw);
            limits[key] = /^\d+$/.test(raw) && value > 0 && Number.isSafeInteger(value) ? value : defaults[key];
        });
        limits.request_timeout_seconds = Math.min(limits.request_timeout_seconds, 2147483);
        this._creditLimits = limits;
        return limits;
    },
    canView: function (update) {
        if (!gs.hasRole('admin')) return false;
        try {
            var gr = this._customerUpdate(String(update.getUniqueValue()));
            return this._fields(this._payload(gr).table).length > 0;
        } catch (e) {
            return false;
        }
    },

    validateLaunch: function () {
        if (!gs.hasRole('admin')) return JSON.stringify({ success: false, error: 'Administrator access is required.' });
        try {
            var gr = this._customerUpdate(this.getParameter('sysparm_update'));
            var fields = this._fields(this._payload(gr).table);
            if (!fields.length) throw new Error('This customer update has no code fields.');
            return JSON.stringify({ success: true });
        } catch (e) {
            return JSON.stringify({ success: false, error: e.message });
        }
    },

    getCredit: function () {
        if (!gs.hasRole('admin')) return JSON.stringify({ success: false, error: 'Administrator access is required.' });
        try {
            var updateId = this.getParameter('sysparm_update'),
                table = this.getParameter('sysparm_table'),
                recordId = this.getParameter('sysparm_record');
            updateId = String(updateId || '').toLowerCase();
            var history;
            if (!updateId) {
                table = String(table || '');
                recordId = String(recordId || '').toLowerCase();
                if (
                    !/^[a-z_][a-z0-9_]*$/i.test(table) ||
                    !/^[0-9a-f]{32}$/.test(recordId) ||
                    !this._fields(table).length
                )
                    throw new Error('Choose a valid table and record with code fields.');
                history = this._customerUpdates(table + '_' + recordId, '');
                if (!history.length) {
                    var emptyHistory = new Error('No Customer Updates for this record.');
                    emptyHistory.code = 'no_customer_updates';
                    throw emptyHistory;
                }
                updateId = history[history.length - 1].id;
            }
            var selected = this._customerUpdate(updateId),
                target = this._payload(selected);
            if (history && (target.table !== table || target.id !== recordId))
                throw new Error('The customer update identifies a different record.');
            var fields = this._fields(target.table);
            if (!fields.length) throw new Error('This customer update has no code fields.');
            var selectedDeleted = target.action === 'DELETE';
            var name = String(selected.getValue('name') || '');
            if (!name) throw new Error('Customer update has no history name.');
            history = history || this._customerUpdates(name, updateId);
            var description = this._description(target);
            return JSON.stringify({
                success: true,
                table: target.table,
                tableLabel: description.tableLabel,
                recordName: description.recordName,
                deleted: selectedDeleted,
                record: target.id,
                selected: updateId,
                fields: fields,
                tableApi: { name: name, key: this._historyKey(history), history: history, limits: this._limits() },
                requestTimeout: this._limits().request_timeout_seconds * 1000,
                partial: !!history.partial,
                updateSets: history.map(function (entry) {
                    return {
                        id: entry.id,
                        name: entry.updateSet ? entry.updateSet.name : 'Unknown update set',
                        time: entry.orderTime,
                        author: entry.author,
                    };
                }),
            });
        } catch (e) {
            return JSON.stringify({ success: false, error: e.message, errorCode: e.code || '' });
        }
    },

    getStatistics: function () {
        if (!gs.hasRole('admin')) return JSON.stringify({ success: false, error: 'Administrator access is required.' });
        try {
            var selected = this._customerUpdate(this.getParameter('sysparm_update')),
                target = this._payload(selected),
                fields = this._fields(target.table),
                name = String(selected.getValue('name') || '');
            if (!fields.length || !name) throw new Error('This customer update has no code history.');
            var history = this._customerUpdates(name, String(selected.getUniqueValue()));
            if (!history.length) throw new Error('No Customer Updates for this record.');
            var requestedAuthors = JSON.parse(String(this.getParameter('sysparm_authors') || '[]')),
                authors = Object.create(null);
            if (!Array.isArray(requestedAuthors) || requestedAuthors.length > this._limits().max_updates + 1)
                throw new Error('Invalid contributor list.');
            requestedAuthors.forEach(function (name) {
                if (typeof name !== 'string' || name.length > 256) throw new Error('Invalid contributor.');
                if (!authors[name.toLowerCase()]) authors[name.toLowerCase()] = { name: name, added: 0, removed: 0 };
            });
            var knownSets = Object.create(null),
                unknownSets = 0;
            history.forEach(function (entry) {
                if (entry.updateSet) knownSets[entry.updateSet.table + ':' + entry.updateSet.id] = true;
                else unknownSets++;
            });
            var founder = '',
                created = '',
                record = new GlideRecord(target.table),
                creationSource = 'snapshot';
            if (record.get(target.id) && record.canRead()) {
                founder = record.getElement('sys_created_by').canRead()
                    ? String(record.getValue('sys_created_by') || '')
                    : '';
                created = record.getElement('sys_created_on').canRead()
                    ? String(record.getValue('sys_created_on') || '')
                    : '';
                creationSource = 'record';
            } else {
                var firstSnapshot = this._loadEntry(history[0]);
                if (firstSnapshot && (firstSnapshot.table !== target.table || firstSnapshot.id !== target.id))
                    throw new Error('History payloads identify different records.');
                var first = firstSnapshot ? firstSnapshot.values : {};
                founder = String(first.sys_created_by || '');
                created = String(first.sys_created_on || '');
            }
            var userNames = Object.keys(authors),
                userIds = Object.create(null);
            if (founder && userNames.indexOf(founder.toLowerCase()) === -1) userNames.push(founder.toLowerCase());
            if (userNames.length) {
                var users = new GlideRecord('sys_user'),
                    userQuery = users.addQuery('user_name', userNames[0]);
                for (var u = 1; u < userNames.length; u++) userQuery.addOrCondition('user_name', userNames[u]);
                users.query();
                while (users.next()) {
                    if (!users.canRead() || !users.getElement('user_name').canRead()) continue;
                    var username = String(users.getValue('user_name')),
                        photo = users.getElement('photo').canRead()
                            ? String(users.getValue('photo') || '').replace(/\.iix$/i, '')
                            : '';
                    userIds[username.toLowerCase()] = String(users.getUniqueValue());
                    if (authors[username.toLowerCase()]) {
                        authors[username.toLowerCase()].name = username;
                        authors[username.toLowerCase()].photo = /^[0-9a-f]{32}$/i.test(photo) ? photo : '';
                    }
                }
            }
            var creators = Object.keys(authors).map(function (name) {
                authors[name].userId = userIds[name] || '';
                return authors[name];
            });
            var contributorsById = Object.create(null);
            creators.forEach(function (author) {
                if (author.userId) contributorsById[author.userId] = author;
            });
            var profileIds = Object.keys(contributorsById);
            if (profileIds.length) {
                var profiles = new GlideRecord('live_profile');
                profiles.addQuery('document', 'IN', profileIds.join(','));
                profiles.query();
                while (profiles.next()) {
                    if (
                        !profiles.canRead() ||
                        !profiles.getElement('document').canRead() ||
                        !profiles.getElement('photo').canRead()
                    )
                        continue;
                    var author = contributorsById[String(profiles.getValue('document'))],
                        profilePhoto = String(profiles.getValue('photo') || '').replace(/\.iix$/i, '');
                    if (author && /^[0-9a-f]{32}$/i.test(profilePhoto)) author.photo = profilePhoto;
                }
            }
            var ageDays = null;
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(created)) {
                var birth = new GlideDateTime(created),
                    now = new GlideDateTime();
                if (birth.isValid() && birth.getNumericValue() <= now.getNumericValue())
                    ageDays = Math.floor((now.getNumericValue() - birth.getNumericValue()) / 86400000);
            }
            return JSON.stringify({
                success: true,
                founder: founder,
                founderUserId: userIds[founder.toLowerCase()] || '',
                created: created,
                creationSource: creationSource,
                ageDays: ageDays,
                updateSetCount: Object.keys(knownSets).length,
                unknownSetCount: unknownSets,
                contributorCount: creators.length,
                fieldCount: fields.length,
                added: 0,
                removed: 0,
                creators: creators,
                gaps: 0,
                partial: !!history.partial,
                fieldTotals: fields.map(function (field) {
                    return { name: field.label, added: 0, removed: 0 };
                }),
                historyKey: this._historyKey(history),
            });
        } catch (e) {
            return JSON.stringify({ success: false, error: e.message });
        }
    },

    getComparison: function () {
        if (!gs.hasRole('admin')) return JSON.stringify({ success: false, error: 'Administrator access is required.' });
        try {
            var id = String(this.getParameter('sysparm_update') || '').toLowerCase(),
                selected = this._customerUpdate(id),
                target = this._payload(selected);
            if (!this._fields(target.table).length) throw new Error('This customer update has no code fields.');
            var name = String(selected.getValue('name') || '');
            if (!name) throw new Error('Customer update has no history name.');
            var history = this._customerUpdates(name, id),
                index = history.findIndex(function (entry) {
                    return entry.id === id;
                });
            if (index < 0) throw new Error('Selected customer update is unavailable in the ordered history.');
            var current = history[index],
                previous = index > 0 ? history[index - 1] : null;
            var fromId = String(this.getParameter('sysparm_from_update') || '').toLowerCase();
            if (fromId) {
                if (fromId === id) throw new Error('Choose a different update set to compare.');
                var fromIndex = history.findIndex(function (entry) {
                    return entry.id === fromId;
                });
                if (fromIndex < 0 || fromIndex > index)
                    throw new Error('The comparison update is unavailable in this history.');
                previous = history[fromIndex];
            }
            current.parsed = target;
            current.time = String((target.action !== 'DELETE' && target.values.sys_updated_on) || current.orderTime);
            current.author = String((target.action !== 'DELETE' && target.values.sys_updated_by) || current.author);
            if (previous) previous.parsed = this._loadEntry(previous);
            [previous, current].forEach(function (entry) {
                if (!entry) return;
                if (!entry.parsed) throw new Error('The previous customer update payload is unavailable.');
                if (entry.parsed.table !== target.table || entry.parsed.id !== target.id)
                    throw new Error('History payloads identify different records.');
            });
            var description = this._description(target);
            return JSON.stringify({
                success: true,
                table: target.table,
                record: target.id,
                recordName: description.recordName,
                left: this._comparisonSnapshot(previous),
                right: this._comparisonSnapshot(current),
            });
        } catch (e) {
            return JSON.stringify({ success: false, error: e.message });
        }
    },

    _comparisonSnapshot: function (entry) {
        var set = entry && entry.updateSet;
        return {
            sys_id: entry ? entry.id : 'credit_baseline',
            sys_created_on: entry ? entry.time : '',
            sys_created_by: entry ? entry.author : '',
            update_set_name: set ? set.name : entry ? 'Unknown update set' : 'Baseline (no earlier update set)',
            update_set_sys_id: set ? set.id : '',
            update_set_table: set ? set.table : '',
            fields: entry && entry.parsed.action !== 'DELETE' ? entry.parsed.values : {},
            display_values: entry && entry.parsed.action !== 'DELETE' ? entry.parsed.displayValues : {},
        };
    },

    getTables: function () {
        if (!gs.hasRole('admin')) return JSON.stringify({ success: false, error: 'Administrator access is required.' });
        try {
            var page = this._pickerPage(),
                offset = (page - 1) * 50;
            var search = String(this.getParameter('sysparm_search') || '').substring(0, 200);
            var gr = new GlideRecord('sys_db_object');
            var join = gr.addJoinQuery('sys_dictionary', 'name', 'name');
            join.addCondition('internal_type', 'collection');
            join.addCondition('attributes', 'CONTAINS', 'update_synch=true');
            if (search) gr.addQuery('label', 'CONTAINS', search).addOrCondition('name', 'CONTAINS', search);
            gr.orderBy('label');
            gr.chooseWindow(offset, offset + 51);
            gr.query();
            var results = [],
                count = 0;
            while (gr.next()) {
                if (++count > 50) break;
                var name = String(gr.getValue('name') || '');
                if (this._fields(name).length) results.push({ id: name, text: String(gr.getValue('label') || name) });
            }
            return JSON.stringify({ success: true, results: results, has_more: count > 50 });
        } catch (e) {
            return JSON.stringify({ success: false, error: e.message });
        }
    },

    getRecords: function () {
        if (!gs.hasRole('admin')) return JSON.stringify({ success: false, error: 'Administrator access is required.' });
        try {
            var table = String(this.getParameter('sysparm_table') || '');
            if (!/^[a-z_][a-z0-9_]*$/i.test(table) || !this._fields(table).length)
                throw new Error('Choose a table with code fields.');
            var page = this._pickerPage(),
                offset = (page - 1) * 50;
            var search = String(this.getParameter('sysparm_search') || '').substring(0, 200);
            var gr = new GlideRecord(table),
                display = String(gr.getDisplayName() || 'sys_id');
            if (search) gr.addQuery(display, 'CONTAINS', search);
            gr.orderBy(display);
            gr.chooseWindow(offset, offset + 51);
            gr.query();
            var results = [],
                count = 0;
            while (gr.next()) {
                if (++count > 50) break;
                if (!gr.canRead()) continue;
                results.push({
                    id: String(gr.getUniqueValue()),
                    text: String(gr.getDisplayValue() || gr.getUniqueValue()),
                });
            }
            var more = count > 50;
            return JSON.stringify({ success: true, results: results, has_more: more });
        } catch (e) {
            return JSON.stringify({ success: false, error: e.message });
        }
    },

    _pickerPage: function () {
        var value = String(this.getParameter('sysparm_page') || '1');
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10000) throw new Error('Invalid picker page.');
        return Number(value);
    },

    getPageDescription: function (updateId) {
        if (!gs.hasRole('admin')) throw new Error('Administrator access is required.');
        var target = this._payload(this._customerUpdate(updateId));
        var description = this._description(target);
        return description.recordName + ' (' + description.tableLabel + ')';
    },

    _customerUpdate: function (id) {
        if (!/^[0-9a-f]{32}$/i.test(String(id || ''))) throw new Error('Select exactly one valid customer update.');
        var gr = new GlideRecord('sys_update_xml');
        if (!gr.get(String(id)) || !gr.canRead() || !gr.getElement('payload').canRead())
            throw new Error('Customer update is unavailable or unreadable.');
        return gr;
    },

    _description: function (target) {
        var gr = new GlideRecord(target.table);
        var displayField = String(gr.getDisplayName() || 'name');
        return {
            tableLabel: String(gr.getLabel() || target.table),
            recordName: String(target.values[displayField] || target.values.name || target.values.title || target.id),
        };
    },

    _fields: function (table) {
        var gr = new GlideRecord(table);
        if (!gr.isValid()) throw new Error('The updated table is unavailable.');
        gr.initialize();
        // Effective elements include inherited dictionary fields and overrides.
        var languages = {
            email_script: 'javascript',
            html_script: 'html',
            script: 'javascript',
            script_client: 'javascript',
            script_plain: 'javascript',
            script_server: 'javascript',
            conditions: 'plaintext',
            condition_string: 'javascript',
            variable_conditions: 'plaintext',
            workflow_conditions: 'plaintext',
            html: 'html',
            html_template: 'html',
            json: 'json',
            json_translations: 'json',
        };
        var elements = gr.getElements(),
            fields = [];
        for (var i = 0; i < elements.size(); i++) {
            var element = elements.get(i),
                type = String(element.getED().getInternalType());
            if (Object.prototype.hasOwnProperty.call(languages, type))
                fields.push({
                    name: String(element.getName()),
                    label: String(element.getLabel()),
                    language: languages[type],
                });
        }
        fields.sort(function (a, b) {
            return a.label.localeCompare(b.label) || a.name.localeCompare(b.name);
        });
        return fields;
    },

    _sets: function (updates) {
        var cache = Object.create(null);
        ['sys_update_set', 'sys_remote_update_set'].forEach(function (table) {
            var ids = Object.create(null);
            updates.forEach(function (entry) {
                if (entry.updateSet && entry.updateSet.table === table) ids[entry.updateSet.id] = true;
            });
            var unique = Object.keys(ids);
            for (var offset = 0; offset < unique.length; offset += 500) {
                var sets = new GlideRecord(table);
                sets.addQuery('sys_id', 'IN', unique.slice(offset, offset + 500).join(','));
                sets.query();
                while (sets.next()) {
                    if (!sets.canRead() || !sets.getElement('name').canRead()) continue;
                    var id = String(sets.getUniqueValue());
                    cache[table + ':' + id] = { id: id, table: table, name: String(sets.getValue('name') || id) };
                }
            }
        });
        return cache;
    },

    _customerUpdateReference: function (update) {
        var fields = ['update_set', 'remote_update_set'];
        for (var i = 0; i < fields.length; i++) {
            if (!update.getElement(fields[i]).canRead()) continue;
            var id = String(update.getValue(fields[i]) || '');
            if (/^[0-9a-f]{32}$/i.test(id))
                return { id: id, table: i === 0 ? 'sys_update_set' : 'sys_remote_update_set' };
        }
        return null;
    },

    _customerUpdates: function (name, selectedId) {
        var gr = new GlideRecord('sys_update_xml');
        gr.addQuery('name', name);
        gr.orderByDesc('sys_updated_on');
        gr.orderByDesc('sys_created_on');
        gr.orderByDesc('sys_id');
        var limit = this._limits().max_updates;
        gr.setLimit(limit + 1);
        gr.query();
        var updates = [];
        var describe = function (record) {
            var reference = this._customerUpdateReference(record);
            return {
                id: String(record.getUniqueValue()),
                time: String(record.getValue('sys_updated_on') || record.getValue('sys_created_on') || ''),
                orderTime: String(record.getValue('sys_updated_on') || record.getValue('sys_created_on') || ''),
                created: String(record.getValue('sys_created_on') || ''),
                revision: Number(record.getValue('sys_mod_count') || 0),
                updateSetId: record.getElement('update_set').canRead()
                    ? String(record.getValue('update_set') || '')
                    : '',
                remoteUpdateSetId: record.getElement('remote_update_set').canRead()
                    ? String(record.getValue('remote_update_set') || '')
                    : '',
                author: String(record.getValue('sys_updated_by') || record.getValue('sys_created_by') || 'Unknown'),
                updateSet: reference,
            };
        }.bind(this);
        while (gr.next()) {
            if (updates.length === limit) {
                updates.partial = true;
                break;
            }
            if (!gr.canRead()) continue;
            updates.push(describe(gr));
        }
        if (
            selectedId &&
            !updates.some(function (entry) {
                return entry.id === selectedId;
            })
        ) {
            updates.push(describe(this._customerUpdate(selectedId)));
            updates.partial = true;
        }
        var sets = this._sets(updates);
        updates.forEach(function (entry) {
            if (entry.updateSet) entry.updateSet = sets[entry.updateSet.table + ':' + entry.updateSet.id] || null;
        });
        // Imports/reverts routinely share second-resolution timestamps; IDs are a stable final tie-breaker.
        updates.sort(function (a, b) {
            return (
                a.orderTime.localeCompare(b.orderTime) ||
                a.created.localeCompare(b.created) ||
                a.revision - b.revision ||
                a.id.localeCompare(b.id)
            );
        });
        return updates;
    },

    _historyKey: function (history) {
        var left = 2166136261,
            right = 5381;
        history.forEach(function (entry) {
            var text =
                entry.id +
                entry.orderTime +
                entry.created +
                entry.revision +
                entry.updateSetId +
                ':' +
                entry.remoteUpdateSetId;
            for (var i = 0; i < text.length; i++) {
                left = Math.imul(left ^ text.charCodeAt(i), 16777619);
                right = Math.imul(right, 33) ^ text.charCodeAt(i);
            }
        });
        return (left >>> 0).toString(16) + ':' + (right >>> 0).toString(16);
    },

    _loadEntry: function (entry) {
        try {
            var record = this._customerUpdate(entry.id);
            var parsed = this._payload(record);
            var deleted = parsed.action === 'DELETE';
            entry.time = String((!deleted && parsed.values.sys_updated_on) || entry.orderTime);
            entry.author = String((!deleted && parsed.values.sys_updated_by) || entry.author);
            return parsed;
        } catch (e) {
            return null;
        }
    },

    _payload: function (gr) {
        var payload = String(gr.getValue('payload') || '');
        if (!payload || payload.length > this._limits().max_payload_chars || /<!DOCTYPE|<!ENTITY/i.test(payload))
            throw new Error('Customer update payload is missing, oversized or unsupported.');
        var doc = new XMLDocument2();
        if (doc.parseXML(payload) === false) throw new Error('Customer update payload is malformed.');
        var root = doc.getDocumentElement();
        if (!root || String(root.getNodeName()) !== 'record_update')
            throw new Error('Expected a record_update payload.');
        var table = String(root.getAttribute('table') || ''),
            records = root.getChildNodeIterator(),
            record = null;
        var name = String(gr.getValue('name') || ''),
            match = name.match(/^([a-z_][a-z0-9_]*)_[0-9a-f]{32}$/i);
        if (!table && match) table = match[1];
        if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error('The payload does not identify its target table.');
        while (records.hasNext()) {
            var candidate = records.next();
            if (String(candidate.getNodeName()) === table) {
                if (record) throw new Error('Payload contains multiple target records.');
                record = candidate;
            }
        }
        if (!record) throw new Error('Target record is absent from the payload.');
        var values = Object.create(null),
            displayValues = Object.create(null),
            children = record.getChildNodeIterator();
        while (children.hasNext()) {
            var child = children.next(),
                field = String(child.getNodeName());
            if (/^[a-z_][a-z0-9_]*$/i.test(field)) {
                if (Object.prototype.hasOwnProperty.call(values, field))
                    throw new Error('Payload contains duplicate fields.');
                values[field] = String(child.getTextContent() || '');
                var display = child.getAttribute('display_value');
                if (display !== null && display !== undefined && String(display))
                    displayValues[field] = String(display);
            }
        }
        var id = String(values.sys_id || '').trim();
        if (!/^[0-9a-f]{32}$/i.test(id)) throw new Error('The target record has no valid sys_id.');
        return {
            table: table,
            id: id,
            action: String(record.getAttribute('action') || ''),
            values: values,
            displayValues: displayValues,
        };
    },

    type: 'WidgetEditorCreditAjax',
});

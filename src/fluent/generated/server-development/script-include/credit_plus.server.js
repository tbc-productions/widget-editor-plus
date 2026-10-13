var CreditPlus = Class.create();
CreditPlus.prototype = Object.extendsObject(AbstractAjaxProcessor, {
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
            return JSON.stringify(
                this.buildUpdate(
                    this.getParameter('sysparm_update'),
                    this.getParameter('sysparm_field'),
                    this.getParameter('sysparm_table'),
                    this.getParameter('sysparm_record'),
                    this.getParameter('sysparm_context') === 'true'
                )
            );
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
            var history = this._customerUpdates(name, String(selected.getUniqueValue())),
                authors = Object.create(null),
                sets = [],
                fieldTotals = fields.map(function (field) {
                    return { name: field.label, added: 0, removed: 0 };
                }),
                previous = fields.map(function () {
                    return [];
                }),
                budget = { remaining: 10000000 },
                gaps = 0,
                added = 0,
                removed = 0,
                lastTime = '',
                knownSets = 0;
            if (!history.length) throw new Error('No Customer Updates for this record.');
            for (var h = 0; h < history.length; h++) {
                var entry = history[h],
                    parsed = entry.parsed;
                if (!parsed)
                    throw new Error('A historical payload is unavailable. Statistics could not be calculated.');
                if (parsed.table !== target.table || parsed.id !== target.id)
                    throw new Error('History payloads identify different records.');
                if (lastTime === entry.orderTime)
                    throw new Error(
                        'History contains tied Customer Update timestamps. The order cannot be determined safely.'
                    );
                lastTime = entry.orderTime;
                var author =
                        authors[entry.author] || (authors[entry.author] = { name: entry.author, added: 0, removed: 0 }),
                    set = {
                        name: entry.updateSet ? entry.updateSet.name : 'Unknown update set',
                        updateSet: entry.updateSet,
                        added: 0,
                        removed: 0,
                    };
                sets.push(set);
                if (entry.updateSet) knownSets++;
                for (var f = 0; f < fields.length; f++) {
                    var field = fields[f].name;
                    if (parsed.action !== 'DELETE' && !Object.prototype.hasOwnProperty.call(parsed.values, field)) {
                        previous[f] = null;
                        gaps++;
                        continue;
                    }
                    var lines = this._lines(
                        parsed.action === 'DELETE' ? '' : String(parsed.values[field]).replace(/\r\n?/g, '\n')
                    );
                    if (lines.length > 5000) throw new Error('Script exceeds the 5,000 line comparison limit.');
                    // A field missing from a snapshot breaks the chain; do not invent additions after that gap.
                    if (previous[f] !== null) {
                        var mapping = this._match(previous[f], lines, budget),
                            matched = 0;
                        for (var i = 0; i < lines.length; i++) if (mapping[i] !== undefined) matched++;
                        var plus = lines.length - matched,
                            minus = previous[f].length - matched;
                        author.added += plus;
                        author.removed += minus;
                        set.added += plus;
                        set.removed += minus;
                        fieldTotals[f].added += plus;
                        fieldTotals[f].removed += minus;
                        added += plus;
                        removed += minus;
                    }
                    previous[f] = lines;
                }
            }
            function rank(entries, metric) {
                return entries.sort(function (a, b) {
                    return b[metric] - a[metric] || a.name.localeCompare(b.name);
                });
            }
            function busiest(entries) {
                return (
                    entries
                        .filter(function (entry) {
                            return entry.added + entry.removed > 0;
                        })
                        .sort(function (a, b) {
                            return b.added + b.removed - a.added - a.removed || a.name.localeCompare(b.name);
                        })[0] || null
                );
            }
            var first = history[0].parsed.values,
                founder = String(first.sys_created_by || ''),
                created = String(first.sys_created_on || ''),
                record = new GlideRecordSecure(target.table),
                creationSource = 'snapshot';
            if (record.get(target.id) && record.canRead()) {
                founder = record.getElement('sys_created_by').canRead()
                    ? String(record.getValue('sys_created_by') || '')
                    : '';
                created = record.getElement('sys_created_on').canRead()
                    ? String(record.getValue('sys_created_on') || '')
                    : '';
                creationSource = 'record';
            }
            var userNames = Object.keys(authors),
                userIds = Object.create(null);
            if (founder && userNames.indexOf(founder) === -1) userNames.push(founder);
            if (userNames.length) {
                var users = new GlideRecordSecure('sys_user'),
                    userQuery = users.addQuery('user_name', userNames[0]);
                for (var u = 1; u < userNames.length; u++) userQuery.addOrCondition('user_name', userNames[u]);
                users.query();
                while (users.next()) {
                    if (!users.canRead() || !users.getElement('user_name').canRead()) continue;
                    userIds[String(users.getValue('user_name'))] = String(users.getUniqueValue());
                }
                Object.keys(authors).forEach(function (name) {
                    authors[name].userId = userIds[name] || '';
                });
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
                founderUserId: userIds[founder] || '',
                created: created,
                creationSource: creationSource,
                ageDays: ageDays,
                updateSetCount: knownSets,
                unknownSetCount: history.length - knownSets,
                contributorCount: Object.keys(authors).length,
                fieldCount: fields.length,
                added: added,
                removed: removed,
                creators: rank(
                    Object.keys(authors).map(function (key) {
                        return authors[key];
                    }),
                    'added'
                ),
                destroyers: rank(
                    Object.keys(authors).map(function (key) {
                        return authors[key];
                    }),
                    'removed'
                ),
                creatorSets: rank(sets.slice(), 'added'),
                destroyerSets: rank(sets.slice(), 'removed'),
                busiestField: busiest(fieldTotals),
                biggestMakeover: busiest(sets),
                gaps: gaps,
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
            if (
                (previous && previous.orderTime === current.orderTime) ||
                (history[index + 1] && history[index + 1].orderTime === current.orderTime)
            )
                throw new Error(
                    'History contains tied Customer Update timestamps. The order cannot be determined safely.'
                );
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
            if (current.payload !== String(selected.getValue('payload')))
                throw new Error('The customer update changed while loading. Reload to try again.');
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
            var gr = new GlideRecordSecure('sys_db_object');
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
            var gr = new GlideRecordSecure(table),
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

    // Reusable server entry point; helpers beginning with _ cannot be called through GlideAjax.
    buildUpdate: function (updateId, field, table, recordId, metadataOnly) {
        if (!gs.hasRole('admin')) throw new Error('Administrator access is required.');
        updateId = String(updateId || '').toLowerCase();
        var history;
        if (!updateId) {
            table = String(table || '');
            recordId = String(recordId || '').toLowerCase();
            if (!/^[a-z_][a-z0-9_]*$/i.test(table) || !/^[0-9a-f]{32}$/.test(recordId) || !this._fields(table).length)
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
        field = String(field || fields[0].name);
        if (
            !metadataOnly &&
            !fields.some(function (entry) {
                return entry.name === field;
            })
        )
            throw new Error('Choose a script field from this table.');
        var selectedDeleted = target.action === 'DELETE';
        var name = String(selected.getValue('name') || '');
        if (!name) throw new Error('Customer update has no history name.');
        history = history || this._customerUpdates(name, updateId);
        var description = this._description(target);
        var context = {
            success: true,
            table: target.table,
            tableLabel: description.tableLabel,
            recordName: description.recordName,
            deleted: selectedDeleted,
            record: target.id,
            selected: updateId,
            fields: fields,
            updateSets: history.map(function (entry) {
                return {
                    id: entry.id,
                    name: entry.updateSet ? entry.updateSet.name : 'Unknown update set',
                    time: entry.orderTime,
                    author: entry.author,
                };
            }),
        };
        // The collapsed viewer needs metadata only; calculate code attribution when a field is expanded.
        if (metadataOnly) return context;
        if (!selectedDeleted && !Object.prototype.hasOwnProperty.call(target.values, field))
            throw new Error('This script field is absent from the selected payload.');
        var snapshots = [],
            warnings = [];
        var previous = [],
            origins = [],
            seenSelected = false,
            lastKey = '',
            budget = { remaining: 10000000 };
        for (var h = 0; h < history.length; h++) {
            var entry = history[h],
                parsed = entry.parsed;
            if (lastKey === entry.orderTime)
                throw new Error(
                    'History contains tied Customer Update timestamps. The order cannot be determined safely.'
                );
            lastKey = entry.orderTime;
            if (parsed && (parsed.table !== target.table || parsed.id !== target.id))
                throw new Error('History payloads identify different records.');
            var snapshot = {
                id: entry.id,
                author: entry.author,
                time: entry.time,
                updateSet: entry.updateSet,
                available: false,
            };
            snapshots.push(snapshot);
            var deleted = parsed && parsed.action === 'DELETE';
            if (!parsed || (!deleted && !Object.prototype.hasOwnProperty.call(parsed.values, field))) {
                warnings.push(
                    'An unavailable or field-missing snapshot interrupts attribution at customer update ' +
                        snapshot.id +
                        '.'
                );
                previous = [];
                origins = [];
                continue;
            }
            snapshot.deleted = !!deleted;
            var code = deleted ? '' : String(parsed.values[field]).replace(/\r\n?/g, '\n');
            snapshot.available = true;
            var lines = this._lines(code);
            var mapping = this._match(previous, lines, budget),
                nextOrigins = [];
            for (var i = 0; i < lines.length; i++)
                nextOrigins[i] = mapping[i] === undefined ? snapshot.id : origins[mapping[i]];
            previous = lines;
            origins = nextOrigins;
            if (snapshot.id === updateId) {
                if (history[h + 1] && history[h + 1].orderTime === entry.orderTime)
                    throw new Error(
                        'History contains tied Customer Update timestamps. The order cannot be determined safely.'
                    );
                if (entry.payload !== String(selected.getValue('payload')))
                    throw new Error('The customer update changed while loading. Reload to try again.');
                seenSelected = true;
                break;
            }
        }
        if (!seenSelected) throw new Error('Selected customer update is unavailable in the ordered history.');
        var finalLines = selectedDeleted ? [] : this._lines(String(target.values[field]).replace(/\r\n?/g, '\n'));
        // Stop at the selected update set; no later snapshot contributes attribution.
        var output = finalLines.map(function (line, index) {
            return { number: index + 1, text: line, update: origins[index] };
        });
        return Object.assign(context, {
            field: field,
            lines: output,
            updates: snapshots,
            warnings: warnings,
        });
    },

    _customerUpdate: function (id) {
        if (!/^[0-9a-f]{32}$/i.test(String(id || ''))) throw new Error('Select exactly one valid customer update.');
        var gr = new GlideRecordSecure('sys_update_xml');
        if (!gr.get(String(id)) || !gr.canRead() || !gr.getElement('payload').canRead())
            throw new Error('Customer update is unavailable or unreadable.');
        return gr;
    },

    _description: function (target) {
        var gr = new GlideRecordSecure(target.table);
        var displayField = String(gr.getDisplayName() || 'name');
        return {
            tableLabel: String(gr.getLabel() || target.table),
            recordName: String(target.values[displayField] || target.values.name || target.values.title || target.id),
        };
    },

    _fields: function (table) {
        var gr = new GlideRecordSecure(table);
        if (!gr.isValid()) throw new Error('The updated table is unavailable.');
        gr.initialize();
        // Effective elements include inherited dictionary fields and overrides.
        var elements = gr.getElements(),
            fields = [];
        for (var i = 0; i < elements.size(); i++) {
            var element = elements.get(i),
                type = String(element.getED().getInternalType());
            if (
                ['script', 'script_plain', 'html_template', 'condition', 'condition_string', 'conditions'].indexOf(
                    type
                ) !== -1
            )
                fields.push({
                    name: String(element.getName()),
                    label: String(element.getLabel()),
                    language: type === 'html_template' ? 'html' : type === 'conditions' ? 'plaintext' : 'javascript',
                });
        }
        fields.sort(function (a, b) {
            return a.label.localeCompare(b.label) || a.name.localeCompare(b.name);
        });
        return fields;
    },

    _set: function (table, id, cache) {
        if ((table !== 'sys_update_set' && table !== 'sys_remote_update_set') || !/^[0-9a-f]{32}$/i.test(id))
            return null;
        var key = table + ':' + id;
        if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
        var set = new GlideRecordSecure(table);
        cache[key] =
            set.get(id) && set.canRead() && set.getElement('name').canRead()
                ? { id: id, table: table, name: String(set.getValue('name') || id) }
                : null;
        return cache[key];
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
        var gr = new GlideRecordSecure('sys_update_xml');
        gr.addQuery('name', name);
        gr.setLimit(501);
        gr.query();
        var updates = [],
            groups = Object.create(null),
            cache = Object.create(null),
            bytes = 0,
            count = 0;
        while (gr.next()) {
            if (++count > 500) throw new Error('History exceeds 500 customer updates. Credit was not calculated.');
            if (!gr.canRead() || !gr.getElement('payload').canRead())
                throw new Error('A historical payload is unreadable.');
            var payload = String(gr.getValue('payload') || '');
            if ((bytes += payload.length) > 10000000)
                throw new Error('History payloads exceed the 10 MB comparison limit.');
            if (payload.length > 2000000) throw new Error('A customer update payload exceeds the 2 MB limit.');
            var parsed;
            try {
                parsed = this._payload(gr);
            } catch (e) {
                parsed = null;
            }
            var deleted = parsed && parsed.action === 'DELETE';
            // Source author/time describe attribution; Customer Update time determines history order.
            var time = String(
                (!deleted && parsed && parsed.values.sys_updated_on) || gr.getValue('sys_updated_on') || ''
            );
            var orderTime = String(gr.getValue('sys_updated_on') || gr.getValue('sys_created_on') || '');
            if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(orderTime))
                throw new Error('A customer update has no reliable history ordering key.');
            var reference = this._customerUpdateReference(gr),
                id = String(gr.getUniqueValue());
            var key = reference ? reference.table + ':' + reference.id : 'unknown:' + id;
            var entry = {
                id: id,
                parsed: parsed,
                payload: payload,
                time: time,
                orderTime: orderTime,
                author: String(
                    (!deleted && parsed && parsed.values.sys_updated_by) || gr.getValue('sys_updated_by') || 'Unknown'
                ),
                updateSet: reference ? this._set(reference.table, reference.id, cache) : null,
            };
            // There should be one customer update per object/set. Collapse identical duplicates only.
            if (groups[key]) {
                if (groups[key].payload !== payload)
                    throw new Error('An update set contains conflicting customer update snapshots.');
                if (id === selectedId || (groups[key].id !== selectedId && orderTime > groups[key].orderTime)) {
                    updates[updates.indexOf(groups[key])] = entry;
                    groups[key] = entry;
                }
            } else {
                groups[key] = entry;
                updates.push(entry);
            }
        }
        updates.sort(function (a, b) {
            return a.orderTime < b.orderTime ? -1 : a.orderTime > b.orderTime ? 1 : a.id < b.id ? -1 : 1;
        });
        return updates;
    },

    _payload: function (gr) {
        var payload = String(gr.getValue('payload') || '');
        if (!payload || payload.length > 2000000 || /<!DOCTYPE|<!ENTITY/i.test(payload))
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

    _lines: function (code) {
        return code === '' ? [] : code.split('\n');
    },

    _match: function (oldLines, newLines, budget) {
        var a = oldLines.map(function (line) {
            return line.replace(/\s/g, '');
        });
        var b = newLines.map(function (line) {
            return line.replace(/\s/g, '');
        });
        var n = a.length,
            m = b.length,
            map = [],
            used = [],
            rows = [],
            i,
            j;
        if (n > 5000 || m > 5000) throw new Error('Script exceeds the 5,000 line comparison limit.');
        if (n === m && a.join('\n') === b.join('\n')) {
            for (i = 0; i < m; i++) map[i] = i;
            return map;
        }
        if (!n || !m) return map;
        var cells = (n + 1) * (m + 1);
        if (cells > 1000000 || (budget.remaining -= cells) < 0)
            throw new Error('Diff exceeds the comparison budget. Credit was not calculated.');
        // Exact LCS anchors unchanged lines, with a bounded matrix for server memory.
        rows[n] = [];
        for (j = 0; j <= m; j++) rows[n][j] = 0;
        for (i = n - 1; i >= 0; i--) {
            rows[i] = [];
            rows[i][m] = 0;
            for (j = m - 1; j >= 0; j--)
                rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
        }
        i = 0;
        j = 0;
        while (i < n && j < m) {
            if (a[i] === b[j]) {
                map[j] = i;
                used[i] = true;
                i++;
                j++;
            } else if (rows[i + 1][j] >= rows[i][j + 1]) i++;
            else j++;
        }
        rows = null;
        // Match longest unmatched contiguous blocks first; never reuse a deleted line as a copy.
        while (true) {
            var best = null;
            for (i = 0; i < n; i++) {
                if (used[i]) continue;
                for (j = 0; j < m; j++) {
                    if (--budget.remaining < 0) throw new Error('Moved-line detection exceeds the comparison budget.');
                    if (map[j] !== undefined || a[i] !== b[j]) continue;
                    var length = 0,
                        score = 0;
                    while (
                        i + length < n &&
                        j + length < m &&
                        !used[i + length] &&
                        map[j + length] === undefined &&
                        a[i + length] === b[j + length]
                    ) {
                        if (--budget.remaining < 0)
                            throw new Error('Moved-line detection exceeds the comparison budget.');
                        score += a[i + length].length;
                        length++;
                    }
                    if (length >= 2 && score >= 20 && (!best || score > best.score))
                        best = { i: i, j: j, length: length, score: score };
                }
            }
            if (!best) break;
            for (var k = 0; k < best.length; k++) {
                map[best.j + k] = best.i + k;
                used[best.i + k] = true;
            }
        }
        var oldOccurrences = Object.create(null),
            newOccurrences = Object.create(null);
        for (i = 0; i < n; i++)
            if (!used[i] && /\w/.test(a[i])) (oldOccurrences[a[i]] || (oldOccurrences[a[i]] = [])).push(i);
        for (j = 0; j < m; j++)
            if (map[j] === undefined && /\w/.test(b[j])) (newOccurrences[b[j]] || (newOccurrences[b[j]] = [])).push(j);
        Object.keys(newOccurrences).forEach(function (line) {
            if (oldOccurrences[line] && oldOccurrences[line].length === 1 && newOccurrences[line].length === 1)
                map[newOccurrences[line][0]] = oldOccurrences[line][0];
        });
        return map;
    },

    type: 'CreditPlus',
});

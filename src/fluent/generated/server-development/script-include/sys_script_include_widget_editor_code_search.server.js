var WidgetEditorCodeSearchAjax = Class.create();
WidgetEditorCodeSearchAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {
    MAX_RESULTS_PER_TABLE: 500,
    MAX_SNIPPETS_PER_FIELD: 5,
    MAX_INLINE_SNIPPET_GAP: 3,
    MAX_SCAN_ROWS: 20000,
    MAX_TOTAL_SCAN_ROWS: 100000,
    MAX_BATCH_RESULTS: 100,
    MAX_BATCH_SCAN_ROWS: 250,
    MAX_BATCH_PROCESSING_MS: 250,

    _getParam: function (name) {
        var val = this.getParameter(name);
        if (val === null || val === undefined) {
            val = this.getParameter('sysparm_' + name);
        }
        return val != null ? String(val) : '';
    },

    _getSearchValue: function (record, field, caseSensitive, cache) {
        var key = '$' + field;
        if (!cache[key]) {
            var raw = String(record.getValue(field) || '');
            cache[key] = {
                raw: raw,
                searchable: caseSensitive ? raw : raw.toLowerCase(),
            };
        }
        return cache[key];
    },

    _matchesSecondaryFilters: function (record, fields, filters, caseSensitive, cache) {
        if (!filters.length) return true;
        var self = this;
        cache = cache || {};

        function evalFilter(filter) {
            var term = caseSensitive ? filter.term : filter.term.toLowerCase();
            var found = fields.some(function (field) {
                return self._getSearchValue(record, field, caseSensitive, cache).searchable.indexOf(term) !== -1;
            });
            return filter.operator === 'contains' ? found : !found;
        }

        // AND/OR conditions are evaluated in order, left to right (no precedence grouping).
        var result = evalFilter(filters[0]);
        for (var i = 1; i < filters.length; i++) {
            result = filters[i].joiner === 'or' ? result || evalFilter(filters[i]) : result && evalFilter(filters[i]);
        }
        return result;
    },

    getGroups: function () {
        var groups = [];
        var gr = new GlideRecord('sn_codesearch_search_group');
        gr.orderBy('name');
        gr.query();
        while (gr.next()) {
            var gId = gr.getUniqueValue();
            var tableCount = 0;
            try {
                var countGr = new GlideAggregate('sn_codesearch_table');
                countGr.addQuery('search_group', gId);
                countGr.addAggregate('COUNT');
                countGr.query();
                if (countGr.next()) {
                    tableCount = parseInt(countGr.getAggregate('COUNT'), 10) || 0;
                }
            } catch (e) {}

            groups.push({
                sysId: gId,
                name: gr.getDisplayValue('name') || gr.getValue('name'),
                description: gr.getValue('description') || '',
                extendedMatching: gr.getValue('extended_matching') === '1',
                tableCount: tableCount,
            });
        }

        // Prioritize groups with tables configured
        groups.sort(function (a, b) {
            if (b.tableCount !== a.tableCount) return b.tableCount - a.tableCount;
            return a.name.localeCompare(b.name);
        });

        var defaultGroupId = String(gs.getProperty('monaco.plus.code_search.default_search_group', '') || '').trim();
        return this._answer({
            success: true,
            groups: groups,
            defaultGroupId: this._isSysId(defaultGroupId) ? defaultGroupId : '',
        });
    },

    getGroupTables: function () {
        var groupId = this._getParam('group_id');
        if (!this._isSysId(groupId))
            return this._answer({
                success: false,
                error: 'Invalid search group.',
            });

        var rows = [];
        var cfg = new GlideRecord('sn_codesearch_table');
        cfg.addQuery('search_group', groupId);
        cfg.orderBy('table');
        cfg.query();
        while (cfg.next()) {
            var table = String(cfg.getValue('table') || '');
            if (!this._validTable(table)) continue;
            rows.push({
                sysId: cfg.getUniqueValue(),
                table: table,
                label: this._tableLabel(table),
                searchFields: this._validFields(table, cfg.getValue('search_fields')).join(','),
                additionalFilter: cfg.getValue('additional_filter') || '',
            });
        }
        return this._answer({ success: true, tables: rows });
    },

    search: function () {
        var started = Date.now();
        var timings = { queryMs: 0, processingMs: 0, totalMs: 0 };
        var groupId = this._getParam('group_id');
        var term = String(this._getParam('query') || this._getParam('term') || '').trim();
        var limit = parseInt(this._getParam('limit'), 10) || this.MAX_RESULTS_PER_TABLE;
        limit = Math.max(1, Math.min(limit, this.MAX_RESULTS_PER_TABLE));
        if (!this._isSysId(groupId))
            return this._answer({
                success: false,
                error: 'Invalid search group.',
            });
        if (!term)
            return this._answer({
                success: false,
                error: 'Enter code to search for.',
            });
        var caseSensitive = this._getParam('case_sensitive') === 'true' || this._getParam('case_sensitive') === '1';
        var needle = caseSensitive ? term : term.toLowerCase();
        var activeOnly = this._getParam('active_only') === 'true' || this._getParam('active_only') === '1';
        var secondaryFilters;
        try {
            secondaryFilters = JSON.parse(this._getParam('secondary_filters') || '[]');
            if (!Array.isArray(secondaryFilters) || secondaryFilters.length > 20) throw new Error('Invalid filters');
            secondaryFilters.forEach(function (item, idx) {
                if (
                    !item ||
                    (item.operator !== 'contains' && item.operator !== 'not_contains') ||
                    typeof item.term !== 'string' ||
                    !item.term.trim() ||
                    item.term.length > 1000
                ) {
                    throw new Error('Invalid filter');
                }
                if (idx > 0 && item.joiner !== 'and' && item.joiner !== 'or') {
                    throw new Error('Invalid filter joiner');
                }
            });
        } catch (invalidFilters) {
            return this._answer({
                success: false,
                error: 'Provide up to 20 secondary filters with an operator and a non-empty term (maximum 1,000 characters).',
            });
        }

        var tableConfigId = String(this._getParam('table_config_id') || this._getParam('table') || '').trim();
        // Batching is opt-in so existing callers can still search an entire group.
        var batchSize = this._getParam('batch_size');
        var batched = batchSize !== '';
        var cursor = { sysId: '', scanned: 0, matched: 0 };
        if (batched) {
            batchSize = Number(batchSize);
            if (
                !this._isSysId(tableConfigId) ||
                !isFinite(batchSize) ||
                batchSize < 1 ||
                Math.floor(batchSize) !== batchSize
            ) {
                return this._answer({
                    success: false,
                    error: 'Provide a table configuration and a positive batch size.',
                });
            }
            batchSize = Math.min(batchSize, this.MAX_BATCH_RESULTS);
            try {
                var rawCursor = this._getParam('cursor');
                if (rawCursor) {
                    cursor = JSON.parse(rawCursor);
                    if (
                        !cursor ||
                        !this._isSysId(cursor.sysId) ||
                        typeof cursor.scanned !== 'number' ||
                        !isFinite(cursor.scanned) ||
                        cursor.scanned < 1 ||
                        cursor.scanned > this.MAX_SCAN_ROWS ||
                        Math.floor(cursor.scanned) !== cursor.scanned ||
                        typeof cursor.matched !== 'number' ||
                        !isFinite(cursor.matched) ||
                        cursor.matched < 0 ||
                        cursor.matched > limit ||
                        Math.floor(cursor.matched) !== cursor.matched ||
                        cursor.matched > cursor.scanned
                    )
                        throw new Error('Invalid cursor');
                }
            } catch (invalidCursor) {
                return this._answer({
                    success: false,
                    error: 'Invalid search cursor.',
                });
            }
        }
        var nextCursor = '';
        var overrides = {};
        try {
            overrides = JSON.parse(this._getParam('overrides') || '{}');
        } catch (ignore) {}
        var results = [],
            searched = 0,
            skipped = [],
            totalScanned = 0;
        var cfg = new GlideRecord('sn_codesearch_table');
        cfg.addQuery('search_group', groupId);
        if (tableConfigId) {
            if (this._isSysId(tableConfigId)) {
                cfg.addQuery('sys_id', tableConfigId);
            } else {
                cfg.addQuery('table', tableConfigId);
            }
        }
        cfg.orderBy('table');
        cfg.query();
        while (cfg.next()) {
            if (totalScanned >= this.MAX_TOTAL_SCAN_ROWS) {
                skipped.push(
                    String(cfg.getValue('table') || '') +
                        ': search scan budget exceeded, narrow the search group or query.'
                );
                continue;
            }
            var configId = cfg.getUniqueValue();
            var override = overrides[configId] || {};
            if (override.enabled === false) continue;
            var table = String(cfg.getValue('table') || '');
            if (!this._validTable(table)) {
                skipped.push(table);
                continue;
            }
            var fields = this._validFields(table, override.searchFields || cfg.getValue('search_fields'));
            if (!fields.length) {
                skipped.push(table);
                continue;
            }
            var filter =
                typeof override.additionalFilter === 'string'
                    ? override.additionalFilter
                    : String(cfg.getValue('additional_filter') || '');
            var validation = this._validateFilter(table, filter);
            if (!validation.valid) {
                skipped.push(table + ': ' + validation.error);
                continue;
            }

            var displayCfg = this._getTableDisplayConfig(table);
            var tableLabel = this._tableLabel(table);
            var fieldLabels = {};
            if (batched && (cursor.matched >= limit || cursor.scanned >= this.MAX_SCAN_ROWS)) break;
            var record = new GlideRecord(table);
            if (filter && !batched) record.addEncodedQuery(filter);

            // A table with neither field is treated as always-active, so no filter is applied.
            var tableHasActive = record.isValidField('active');
            var tableHasUActive = record.isValidField('u_active');
            if (activeOnly) {
                if (tableHasActive && tableHasUActive) {
                    var actQ = record.addQuery('active', true);
                    actQ.addOrCondition('u_active', true);
                } else if (tableHasActive) {
                    record.addQuery('active', true);
                } else if (tableHasUActive) {
                    record.addQuery('u_active', true);
                }
            }

            searched++;
            var qc = record.addQuery(fields[0], 'CONTAINS', term);
            for (var i = 1; i < fields.length; i++) qc.addOrCondition(fields[i], 'CONTAINS', term);
            // Secondary filters can be combined with AND/OR, so they're checked in code
            // (in evaluation order) for consistent empty-field, case, and joiner semantics.
            // Apply the result limit after secondary and case-sensitive matching. When those are
            // in play, `count` only advances on rows that pass them, so a plain CONTAINS query on
            // a large table could otherwise scan unbounded looking for enough passing rows -
            // cap it well above the result limit to keep the transaction bounded.
            var resultLimit = batched ? Math.min(batchSize, limit - cursor.matched) : limit;
            var scanLimit = batched
                ? Math.min(this.MAX_BATCH_SCAN_ROWS, this.MAX_SCAN_ROWS - cursor.scanned)
                : this.MAX_SCAN_ROWS;
            if (batched) {
                // Resume after the last candidate examined, including candidates rejected by
                // secondary filters. Stable key ordering avoids increasingly costly offsets.
                if (cursor.sysId) record.addQuery('sys_id', '>', cursor.sysId);
                if (filter) {
                    // Apply the cursor and search conditions to every NQ branch. Saved list
                    // ordering must not override the stable sys_id order used for paging.
                    var searchConditions = record.getEncodedQuery();
                    var branches = filter.split('^NQ').map(function (branch) {
                        var conditions = branch
                            .split('^')
                            .filter(function (part) {
                                return part && part !== 'EQ' && !/^(ORDERBY|GROUPBY)/.test(part);
                            })
                            .join('^');
                        return searchConditions + (conditions ? '^' + conditions : '');
                    });
                    record = new GlideRecord(table);
                    record.addEncodedQuery(branches.join('^NQ'));
                }
                record.orderBy('sys_id');
                if (!secondaryFilters.length && !caseSensitive) scanLimit = Math.min(scanLimit, resultLimit);
                record.setLimit(scanLimit + 1);
            } else {
                record.setLimit(!secondaryFilters.length && !caseSensitive ? limit + 1 : this.MAX_SCAN_ROWS);
            }
            var queryStarted = Date.now();
            record.query();
            timings.queryMs += Date.now() - queryStarted;
            // GlideRecord can defer fetching rows until next(), so include that time
            // with the query instead of attributing it to snippet processing.
            var nextRecord = function () {
                var readStarted = Date.now();
                var found = record.next();
                timings.queryMs += Date.now() - readStarted;
                return found;
            };
            var batchStarted = Date.now();
            var queryMsBeforeRows = timings.queryMs;
            var processingLimitReached = false;
            var count = 0,
                tableScanned = 0,
                lastScannedId = '';
            while (count < resultLimit && tableScanned < scanLimit && totalScanned < this.MAX_TOTAL_SCAN_ROWS) {
                // Always examine at least one candidate so an early response advances
                // the cursor, even when filters reject every result in this batch.
                if (batched && tableScanned > 0 && Date.now() - batchStarted >= this.MAX_BATCH_PROCESSING_MS) {
                    processingLimitReached = true;
                    break;
                }
                if (!nextRecord()) break;
                totalScanned++;
                tableScanned++;
                lastScannedId = String(record.getUniqueValue());
                var fieldValues = {};
                if (!this._matchesSecondaryFilters(record, fields, secondaryFilters, caseSensitive, fieldValues))
                    continue;
                var matches = [];
                for (var f = 0; f < fields.length; f++) {
                    var fieldName = fields[f];
                    var fieldValue = this._getSearchValue(record, fieldName, caseSensitive, fieldValues);
                    var value = fieldValue.raw;
                    if (!value) continue;
                    var haystack = fieldValue.searchable;
                    var snippetSource = null;
                    var nextSnippetLineStart = 0;
                    var searchPos = 0;
                    var snippetWindowsInField = 0;
                    // Every occurrence in a field is merged into one match, its snippet windows
                    // joined by a "…" separator line only when the unmatched gap is wider than
                    // the combined context around the two matches. Overlapping windows extend the
                    // current excerpt; this prevents small holes such as omitting only one line.
                    var lastShownEndLine = 0;
                    var fieldMatch = null;

                    while (snippetWindowsInField < this.MAX_SNIPPETS_PER_FIELD) {
                        var at = haystack.indexOf(needle, searchPos);
                        if (at === -1) break;
                        searchPos = at + term.length;
                        if (!snippetSource) snippetSource = this._prepareSnippetSource(value);
                        // Further occurrences on the same line have identical context.
                        if (at < nextSnippetLineStart) continue;
                        var snippetInfo = this._extractSnippetWithLines(value, at, term.length, snippetSource);
                        nextSnippetLineStart = snippetSource.lineStarts[snippetInfo.matchLine];
                        if (nextSnippetLineStart === undefined) nextSnippetLineStart = value.length + 1;
                        var snippetEndLine = snippetInfo.startLine + snippetInfo.lines.length - 1;
                        if (snippetEndLine <= lastShownEndLine) continue;

                        if (!fieldMatch) {
                            var fLabel = fieldLabels['$' + fieldName];
                            if (!fLabel) {
                                fLabel = fieldName;
                                try {
                                    fLabel = record.getElement(fieldName).getLabel() || fieldName;
                                } catch (efl) {}
                                fieldLabels['$' + fieldName] = fLabel;
                            }
                            fieldMatch = {
                                field: fieldName,
                                fieldLabel: fLabel,
                                line: snippetInfo.matchLine,
                                totalLines: snippetInfo.totalLines,
                                singleLine: snippetInfo.singleLine,
                                lines: snippetInfo.lines.slice(),
                                snippet: snippetInfo.text,
                            };
                            snippetWindowsInField++;
                        } else {
                            var gapLineCount = snippetInfo.startLine - lastShownEndLine - 1;
                            if (gapLineCount > 0) {
                                if (gapLineCount <= this.MAX_INLINE_SNIPPET_GAP) {
                                    for (
                                        var gapLine = lastShownEndLine + 1;
                                        gapLine < snippetInfo.startLine;
                                        gapLine++
                                    ) {
                                        fieldMatch.lines.push({
                                            num: gapLine,
                                            text: snippetInfo.allLines[gapLine - 1],
                                            isMatch: false,
                                            inBlockComment: snippetInfo.blockCommentStates[gapLine - 1],
                                        });
                                    }
                                } else {
                                    fieldMatch.lines.push({
                                        separator: true,
                                    });
                                    fieldMatch.snippet += '\n…\n';
                                    snippetWindowsInField++;
                                }
                            }
                            snippetInfo.lines.forEach(function (l) {
                                if (l.num > lastShownEndLine) fieldMatch.lines.push(l);
                            });
                        }
                        lastShownEndLine = snippetEndLine;
                        if (lastShownEndLine === snippetInfo.totalLines) break;
                    }

                    if (fieldMatch) {
                        var shownLineCount = fieldMatch.lines.filter(function (l) {
                            return !l.separator;
                        }).length;
                        fieldMatch.allLinesShown = shownLineCount >= fieldMatch.totalLines;
                        fieldMatch.snippet = fieldMatch.lines
                            .map(function (l) {
                                return l.separator ? '…' : l.text;
                            })
                            .join('\n');
                        matches.push(fieldMatch);
                    }
                }

                if (matches.length > 0) {
                    var recSysId = record.getUniqueValue();
                    var isWidget = table === 'sp_widget';

                    // Determine active status, matching the OR semantics of the query above.
                    // A table with neither field is always considered active, so it's never
                    // excluded by the Active only filter.
                    var hasActiveField = tableHasActive || tableHasUActive;
                    var isActive =
                        !hasActiveField ||
                        (tableHasActive &&
                            (record.getValue('active') === '1' || record.getValue('active') === 'true')) ||
                        (tableHasUActive &&
                            (record.getValue('u_active') === '1' || record.getValue('u_active') === 'true'));

                    if (activeOnly && !isActive) {
                        continue;
                    }
                    count++;

                    // Primary value
                    var primaryVal = '';
                    if (displayCfg.primaryField && record.isValidField(displayCfg.primaryField)) {
                        primaryVal =
                            record.getDisplayValue(displayCfg.primaryField) || record.getValue(displayCfg.primaryField);
                    }
                    if (!primaryVal) {
                        primaryVal = record.getDisplayValue() || recSysId;
                    }

                    // Secondary values
                    var secondaryVals = [];
                    for (var s = 0; s < displayCfg.secondaryFields.length; s++) {
                        var sField = displayCfg.secondaryFields[s];
                        if (!record.isValidField(sField)) continue;
                        var sVal = record.getDisplayValue(sField) || record.getValue(sField);
                        if (sVal !== null && sVal !== undefined && sVal !== '') {
                            var sLabel = sField;
                            try {
                                sLabel = record.getElement(sField).getLabel() || sField;
                            } catch (eLbl) {}
                            secondaryVals.push({
                                field: sField,
                                label: sLabel,
                                value: sVal,
                            });
                        }
                    }

                    results.push({
                        table: table,
                        tableLabel: tableLabel,
                        sysId: recSysId,
                        displayValue: primaryVal,
                        secondaryValues: secondaryVals,
                        hasActive: hasActiveField,
                        isActive: hasActiveField ? isActive : null,
                        updatedOn: record.isValidField('sys_updated_on')
                            ? record.getDisplayValue('sys_updated_on')
                            : '',
                        matches: matches,
                        isWidget: isWidget,
                        widgetEditorUrl: isWidget ? '/widget_editor.do?widget_id=' + recSysId : null,
                        url: '/nav_to.do?uri=' + encodeURIComponent(table + '.do?sys_id=' + recSysId),
                    });
                }
            }
            if (batched) {
                var scannedSoFar = cursor.scanned + tableScanned;
                var matchedSoFar = cursor.matched + count;
                // Only probe for another row if the loop stopped at a batch boundary.
                // The probe is not consumed: the next request resumes after lastScannedId.
                var hasMore =
                    (count >= resultLimit || tableScanned >= scanLimit || processingLimitReached) && nextRecord();
                if (hasMore && matchedSoFar < limit && scannedSoFar < this.MAX_SCAN_ROWS) {
                    nextCursor = JSON.stringify({
                        sysId: lastScannedId,
                        scanned: scannedSoFar,
                        matched: matchedSoFar,
                    });
                } else if (hasMore && matchedSoFar < limit && scannedSoFar >= this.MAX_SCAN_ROWS) {
                    skipped.push(table + ': search scan budget exceeded, narrow the query or filters.');
                }
            }
            timings.processingMs += Date.now() - batchStarted - (timings.queryMs - queryMsBeforeRows);
        }
        results.sort(function (a, b) {
            var valA = String(a.displayValue || '').toLowerCase();
            var valB = String(b.displayValue || '').toLowerCase();
            return valA.localeCompare(valB);
        });
        timings.totalMs = Date.now() - started;
        return this._answer({
            success: true,
            results: results,
            searchedTables: searched,
            skipped: skipped,
            nextCursor: nextCursor,
            scanned: totalScanned,
            timings: timings,
        });
    },

    validateFilter: function () {
        var configId = this._getParam('config_id');
        var cfg = this._getConfig(configId);
        if (!cfg)
            return this._answer({
                success: false,
                error: 'Configuration not found.',
            });
        var table = String(cfg.getValue('table'));
        var filter = this._getParam('filter');
        var result = this._validateFilter(table, filter);
        if (result.valid) {
            var matchCount = this._countFilterMatches(table, filter);
            result.success = true;
            result.matchCount = matchCount;
            result.listUrl =
                matchCount >= 0
                    ? '/' + table + '_list.do' + (filter ? '?sysparm_query=' + encodeURIComponent(filter) : '')
                    : null;
            result.message = 'Filter is valid' + (matchCount >= 0 ? ' (' + matchCount + ' records match)' : '.');
        } else {
            result.success = false;
        }
        return this._answer(result);
    },

    getTableFields: function () {
        var table = this._getParam('table');
        if (!this._validTable(table))
            return this._answer({
                success: false,
                error: 'Invalid table.',
            });

        var hierArr = [];
        try {
            if (typeof TableUtils !== 'undefined') {
                var hierList = new TableUtils(table).getHierarchy();
                for (var h = 0; h < hierList.size(); h++) hierArr.push(String(hierList.get(h)));
            } else if (typeof GlideTableHierarchy !== 'undefined') {
                var hierList2 = new GlideTableHierarchy(table).getHierarchy();
                for (var h2 = 0; h2 < hierList2.length; h2++) hierArr.push(String(hierList2[h2]));
            }
        } catch (e) {}
        if (!hierArr.length) hierArr = [table];

        var dict = new GlideRecord('sys_dictionary');
        dict.addQuery('name', 'IN', hierArr.join(','));
        dict.addNotNullQuery('element');
        dict.addQuery('internal_type', '!=', 'collection');
        dict.query();

        var fields = [];
        var seen = {};
        var probe = new GlideRecord(table);
        while (dict.next()) {
            var fName = String(dict.getValue('element') || '');
            if (!fName || seen[fName]) continue;
            seen[fName] = true;
            if (!probe.isValidField(fName)) continue;

            var label = '';
            try {
                var el = probe.getElement(fName);
                if (el) label = el.getLabel() || '';
            } catch (eLbl) {}
            if (!label) {
                label = String(dict.getValue('column_label') || fName);
            }
            fields.push({
                id: fName,
                name: fName,
                label: label,
                text: label + ' (' + fName + ')',
            });
        }

        if (fields.length === 0) {
            try {
                probe.initialize();
                var elems = probe.getElements();
                for (var j = 0; j < elems.size(); j++) {
                    var elem = elems.get(j);
                    var nm = elem.getName();
                    if (nm && !seen[nm]) {
                        seen[nm] = true;
                        var lbl = elem.getLabel() || nm;
                        fields.push({
                            id: nm,
                            name: nm,
                            label: lbl,
                            text: lbl + ' (' + nm + ')',
                        });
                    }
                }
            } catch (eElems) {}
        }

        fields.sort(function (a, b) {
            var la = (a.label || a.id).toLowerCase();
            var lb = (b.label || b.id).toLowerCase();
            return la.localeCompare(lb);
        });

        return this._answer({ success: true, fields: fields });
    },

    _getConfig: function (sysId) {
        if (!this._isSysId(sysId)) return null;
        var gr = new GlideRecord('sn_codesearch_table');
        return gr.get(sysId) ? gr : null;
    },

    _countFilterMatches: function (table, filter) {
        try {
            var ga = new GlideAggregate(table);
            if (filter) ga.addEncodedQuery(filter);
            ga.addAggregate('COUNT');
            ga.query();
            if (ga.next()) return parseInt(ga.getAggregate('COUNT'), 10) || 0;
        } catch (e) {}
        return -1;
    },

    _validateFilter: function (table, filter) {
        if (!filter) return { valid: true };
        if (filter.length > 4000)
            return {
                valid: false,
                error: 'Filter exceeds 4,000 characters.',
            };
        try {
            var gr = new GlideRecord(table);
            if (typeof gr.isValidEncodedQuery === 'function' && !gr.isValidEncodedQuery(filter)) {
                return {
                    valid: false,
                    error: 'The encoded query contains an invalid field or operator.',
                };
            }
            return { valid: true };
        } catch (e) {
            return {
                valid: false,
                error: 'Invalid encoded query: ' + String(e),
            };
        }
    },

    _validFields: function (table, csv) {
        var out = [],
            seen = {},
            probe = new GlideRecord(table);
        String(csv || '')
            .split(',')
            .forEach(function (raw) {
                var field = raw.trim();
                if (field && !seen[field] && /^[a-zA-Z0-9_]+$/.test(field) && probe.isValidField(field)) {
                    seen[field] = true;
                    out.push(field);
                }
            });
        return out;
    },

    _validTable: function (table) {
        if (!/^[a-zA-Z0-9_]+$/.test(table)) return false;
        try {
            return new GlideRecord(table).isValid();
        } catch (e) {
            return false;
        }
    },

    _tableLabel: function (table) {
        try {
            return new GlideRecord(table).getLabel() || table;
        } catch (e) {
            return table;
        }
    },

    getFieldContent: function () {
        var table = this._getParam('table');
        var sysId = this._getParam('sys_id');
        var field = this._getParam('field');
        if (!this._validTable(table) || !this._isSysId(sysId) || !field || !/^[a-zA-Z0-9_]+$/.test(field)) {
            return this._answer({
                success: false,
                error: 'Invalid parameters.',
            });
        }
        var gr = new GlideRecord(table);
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Record not found or access denied.',
            });
        }
        if (!gr.isValidField(field)) {
            return this._answer({
                success: false,
                error: 'Field does not exist.',
            });
        }
        var val = String(gr.getValue(field) || '');
        return this._answer({
            success: true,
            content: val,
            field: field,
            fieldLabel: gr.getElement(field).getLabel() || field,
            table: table,
            tableLabel: this._tableLabel(table),
            sysId: sysId,
            displayValue: gr.getDisplayValue(),
        });
    },

    _getTableDisplayConfig: function (table) {
        var raw = gs.getProperty('monaco.plus.code_search.display_fields.' + table, '');
        var seen = {};
        var secondaryFields = String(raw || '')
            .split(',')
            .map(function (field) {
                return field.trim();
            })
            .filter(function (field) {
                if (!field || seen[field]) return false;
                seen[field] = true;
                return true;
            });

        return {
            primaryField: '',
            secondaryFields: secondaryFields,
        };
    },

    _prepareSnippetSource: function (value) {
        var allLines = [],
            lineStarts = [0];
        var newline = /\r\n|\r|\n/g;
        var match,
            start = 0;
        while ((match = newline.exec(value)) !== null) {
            allLines.push(value.slice(start, match.index));
            start = match.index + match[0].length;
            lineStarts.push(start);
        }
        allLines.push(value.slice(start));
        return {
            allLines: allLines,
            lineStarts: lineStarts,
            blockCommentStates: this._getBlockCommentStates(allLines),
        };
    },

    _extractSnippetWithLines: function (value, at, termLen, source) {
        source = source || this._prepareSnippetSource(value);
        var allLines = source.allLines;
        var blockCommentStates = source.blockCommentStates;
        // Offsets refer to the original text, including CRLF. Binary lookup avoids
        // walking from the beginning of a long script for every occurrence.
        var low = 0,
            high = source.lineStarts.length - 1;
        while (low < high) {
            var mid = Math.floor((low + high + 1) / 2);
            if (source.lineStarts[mid] <= at) low = mid;
            else high = mid - 1;
        }
        var matchLineIdx = low;

        var matchLineNum = matchLineIdx + 1;
        var startIdx = Math.max(0, matchLineIdx - 2);
        var endIdx = Math.min(allLines.length - 1, matchLineIdx + 2);

        var resultLines = [];
        for (var i = startIdx; i <= endIdx; i++) {
            resultLines.push({
                num: i + 1,
                text: allLines[i],
                isMatch: i === matchLineIdx,
                inBlockComment: blockCommentStates[i],
            });
        }

        var totalLines = allLines.length;
        var allLinesShown = resultLines.length >= totalLines;
        return {
            matchLine: matchLineNum,
            startLine: startIdx + 1,
            totalLines: totalLines,
            singleLine: totalLines <= 1,
            allLinesShown: allLinesShown,
            allLines: allLines,
            blockCommentStates: blockCommentStates,
            lines: resultLines,
            text: resultLines
                .map(function (r) {
                    return r.text;
                })
                .join('\n'),
        };
    },

    /* Track whether each source line begins inside a block comment. The snippet UI only
       receives selected lines, so it cannot infer this when the opening delimiter was
       outside the excerpt. Strings are skipped to avoid treating comment-like text as code. */
    _getBlockCommentStates: function (lines) {
        var states = [];
        var inBlockComment = false;
        var quote = '';
        var escaped = false;

        for (var lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            var line = String(lines[lineIndex] || '');
            states.push(inBlockComment);
            escaped = false;

            for (var i = 0; i < line.length; i++) {
                var ch = line.charAt(i);
                var next = line.charAt(i + 1);

                if (inBlockComment) {
                    if (ch === '*' && next === '/') {
                        inBlockComment = false;
                        i++;
                    }
                    continue;
                }
                if (quote) {
                    if (escaped) escaped = false;
                    else if (ch === '\\') escaped = true;
                    else if (ch === quote) quote = '';
                    continue;
                }
                if (ch === '/' && next === '/') break;
                if (ch === '/' && next === '*') {
                    inBlockComment = true;
                    i++;
                } else if (ch === "'" || ch === '"' || ch === '`') {
                    quote = ch;
                }
            }

            /* JavaScript single- and double-quoted strings do not continue onto the next
               physical line. Template literals do, so retain only the backtick state. */
            if (quote !== '`') quote = '';
        }
        return states;
    },

    _isSysId: function (value) {
        return /^[0-9a-f]{32}$/.test(value);
    },
    _answer: function (data) {
        return this.setAnswer(JSON.stringify(data));
    },

    /* Shared with the main Widget Editor+ tool so lastCodeSearchGroup rides along with its preferences export/import. */
    USER_PREF_NAME: 'monaco_plus.user_prefs',

    /**
     * Returns the current user's last-selected code search group, from the shared Widget Editor+ preference blob.
     * @returns {{success: boolean, groupId: string|null}} Return value.
     */
    getLastSearchGroup: function () {
        var groupId = new WidgetEditorAjax().getMergedUserPref(this.USER_PREF_NAME, 'lastCodeSearchGroup', null);
        return this._answer({ success: true, groupId: groupId });
    },

    /**
     * Persists the user's last-selected code search group into the shared Widget Editor+ preference blob,
     * merging into whatever the main tool has already stored there rather than overwriting it.
     * Accepts `group_id`.
     * @returns {{success: boolean}} Return value.
     */
    saveLastSearchGroup: function () {
        var groupId = this._getParam('group_id');
        new WidgetEditorAjax().saveMergedUserPref(this.USER_PREF_NAME, 'lastCodeSearchGroup', groupId);
        return this._answer({ success: true });
    },

    type: 'WidgetEditorCodeSearchAjax',
});

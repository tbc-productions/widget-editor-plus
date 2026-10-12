var WidgetEditorAssistantAjax = Class.create();
WidgetEditorAssistantAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {
    // Dictionary internal_types that hold actual script code.
    SCRIPT_FIELD_TYPES: {
        script: true,
        script_server: true,
        script_plain: true,
    },

    SI_SCAN_BUILTINS: {
        Array: true,
        Object: true,
        Date: true,
        RegExp: true,
        Error: true,
        TypeError: true,
        RangeError: true,
        Map: true,
        Set: true,
        WeakMap: true,
        WeakSet: true,
        Promise: true,
        XMLHttpRequest: true,
        FormData: true,
        Blob: true,
        File: true,
        URL: true,
        URLSearchParams: true,
        Function: true,
        Number: true,
        String: true,
        Boolean: true,
        JSON: true,
        Math: true,
        Symbol: true,
        Reflect: true,
        Intl: true,
        Class: true,
        Packages: true,
        GlideRecord: true,
        GlideRecordSecure: true,
        GlideAggregate: true,
        GlideDateTime: true,
        GlideDate: true,
        GlideDuration: true,
        GlideForm: true,
        GlideUser: true,
        GlideSession: true,
        GlideAjax: true,
        GlideModal: true,
        GlideDialogWindow: true,
        GlideList2: true,
        GlideQuery: true,
        GlideTime: true,
        GlideElement: true,
        GlideSystem: true,
        GlideStringUtil: true,
        GlideFilter: true,
        GlideSchedule: true,
        GlideTableHierarchy: true,
        GlideEncrypter: true,
        GlideSecureRandomUtil: true,
        GlideSysAttachment: true,
        GlideScopedEvaluator: true,
        GlideHTTPRequest: true,
        GlideURL: true,
        GlideNavigation: true,
        GlideEmailOutbound: true,
        GlideExcelParser: true,
        GlideXMLUtil: true,
        XMLDocument2: true,
        GlideImportSetTransformer: true,
        GlideSPScriptable: true,
        GlideElementDescriptor: true,
        RESTMessageV2: true,
        SOAPMessageV2: true,
        FlowAPI: true,
        Workflow: true,
        NotifyClient: true,
    },

    // Resolve the navigation target separately from the historical record identity.
    getExportRecordUrl: function () {
        var table = String(this.getParameter('table') || '');
        var sysId = String(this.getParameter('sys_id') || '');
        if (!/^[a-zA-Z0-9_]+$/.test(table) || !/^[0-9a-f]{32}$/.test(sysId)) {
            return this._answer({ success: false });
        }
        var es12Override = 'unavailable';
        var deleted = this.getParameter('deleted') === 'true';
        var record = new GlideRecordSecure(table);
        var exists = record.isValid() && record.get(sysId);
        if (exists && !deleted && table !== 'sys_metadata_delete') {
            es12Override = this._getExportEs12Override(sysId);
        }
        if (table !== 'sys_metadata_delete' && (deleted || !exists)) {
            var deletion = new GlideRecordSecure('sys_metadata_delete');
            deletion.addQuery('sys_metadata', sysId);
            deletion.orderByDesc('sys_created_on');
            deletion.setLimit(1);
            deletion.query();
            if (deletion.next()) {
                table = 'sys_metadata_delete';
                sysId = deletion.getUniqueValue();
            } else {
                // Never manufacture a link to a deleted record or a guessed deletion sys_id.
                return this._answer({
                    success: true,
                    url: '',
                    unavailable: true,
                });
            }
        }
        var origin = String(gs.getProperty('glide.servlet.uri', '')).replace(/\/+$/, '');
        return this._answer({
            success: true,
            es12Override: es12Override,
            url: origin + '/nav_to.do?uri=' + encodeURIComponent(table + '.do?sys_id=' + sysId),
        });
    },

    // An absent per-script override does not establish the application's effective mode.
    _getExportEs12Override: function (sysId) {
        try {
            var es = new GlideRecordSecure('sys_es_latest_script');
            es.addQuery('id', sysId);
            es.setLimit(1);
            es.query();
            if (!es.next()) return 'not_found';
            var value = es.getValue('use_es_latest');
            if (value === '1' || value === 'true') return 'enabled';
            if (value === '0' || value === 'false') return 'disabled';
        } catch (e) {}
        return 'unavailable';
    },

    EXPORT_BLOCKLIST_TABLES_PROPERTY: 'monaco.plus.assistant.export_blocklist_tables',
    EXPORT_BLOCKLIST_PREFIXES_PROPERTY: 'monaco.plus.assistant.export_blocklist_prefixes',

    /**
     * Comma-separated list parsed from a system property, trimmed and emptied of blanks.
     * @param {string} propertyName - Property to read.
     * @returns {Array.<string>}
     */
    _getPropertyList: function (propertyName) {
        return gs
            .getProperty(propertyName, '')
            .split(',')
            .map(function (v) {
                return v.trim();
            })
            .filter(function (v) {
                return v.length > 0;
            });
    },

    /**
     * Whether record data from this table is blocklisted from search/browse/export.
     * Table names and prefixes are admin-configured via EXPORT_BLOCKLIST_TABLES_PROPERTY /
     * EXPORT_BLOCKLIST_PREFIXES_PROPERTY — also read by the Assistant UI page's own
     * isTableExportBlocked() so both sides stay in sync from the same source of truth.
     * @param {string} table - Table name.
     * @returns {boolean}
     */
    _isTableExportBlocked: function (table) {
        if (!table) return false;
        var tables = this._getPropertyList(this.EXPORT_BLOCKLIST_TABLES_PROPERTY);
        if (tables.indexOf(table) !== -1) return true;
        var prefixes = this._getPropertyList(this.EXPORT_BLOCKLIST_PREFIXES_PROPERTY);
        for (var i = 0; i < prefixes.length; i++) {
            if (table.indexOf(prefixes[i]) === 0) return true;
        }
        return false;
    },

    ////////////////////////////////////////////////////////////
    // Related component suggestions
    ////////////////////////////////////////////////////////////

    /**
     * Suggests related components for a record: admin-configured table_config rules
     * (see _getTableConfig) plus, for every table, script include/table/property/event/
     * integration/flow references scanned from its script-type field(s), whatever table
     * its table_name-type field(s) name, and records named by its reference fields.
     * sys_db_object is special-cased to suggest tables referenced by the viewed table's
     * own reference-type dictionary fields, rather than its own fields.
     * Accepts `table` and `sys_id`.
     * @returns {{success: boolean, related: Array.<{table: string, sys_id: string,
     *   label: string, category: string, updatedOn: string}>}} Return value.
     */
    getSuggestedRelated: function () {
        // getParameter() returns a Java String, so coerce before strict-comparing.
        var table = String(this.getParameter('table') || '');
        var sysId = this.getParameter('sys_id');
        if (!table || !sysId) {
            return this._answer({
                success: false,
                error: 'No table/sys_id provided',
                related: [],
            });
        }

        if (table === 'sys_db_object') {
            try {
                var tableGr = new GlideRecordSecure('sys_db_object');
                if (!tableGr.get(sysId)) {
                    return this._answer({
                        success: false,
                        error: 'Table not found',
                        related: [],
                    });
                }
                var refTableNames = this._scanDictionaryReferencedTables(tableGr.getValue('name'));
                var refTables = this._findReferencedTables(refTableNames).filter(function (r) {
                    return r.sys_id !== sysId;
                });
                return this._answer({
                    success: true,
                    related: refTables.concat(this._findTableChoices(sysId)),
                });
            } catch (e) {
                return this._answer({
                    success: false,
                    error: String(e),
                    related: [],
                });
            }
        }

        // Never let an exception here kill the whole GlideAjax response.
        try {
            var gr = new GlideRecordSecure(table);
            if (!gr.get(sysId)) {
                return this._answer({
                    success: false,
                    error: 'Record not found',
                    related: [],
                });
            }

            var configured = this._evaluateRules(gr, this._getTableConfig(table).rules);

            // Generic fallback: any table with its own script-type field(s) gets scanned for
            // further Script Include, table, property, event, integration and flow references;
            // any table_name-type field(s) suggest whatever table that field names; and any
            // populated reference field is followed — whatever the target table
            // happens to be. Always runs, alongside any table_config rules above.
            var generic = this._findRecordReferences(gr, table);
            if (table === 'sys_security_acl') {
                // ACL names are either a table or table.field (including table.*).
                // Resolve the table portion as an exact sys_db_object name.
                var aclTable = String(gr.getValue('name') || '').split('.')[0];
                if (aclTable) generic = generic.concat(this._findReferencedTables([aclTable]));
            }
            var scriptFields = this._findScriptFields(table);
            var tableNameFields = this._findFieldsOfType(table, 'table_name');
            if (scriptFields.length) {
                var scriptContent = scriptFields
                    .map(function (f) {
                        return gr.getValue(f) || '';
                    })
                    .join('\n');
                var scriptNames = this._scanReferencedNamesInText(scriptContent);
                var scriptIncludeMatches = this._findReferencedScriptIncludes(scriptNames, gr.getValue('sys_scope'));
                var scriptTableNames = this._scanReferencedTableNamesInText(scriptContent);
                generic = generic.concat(
                    scriptIncludeMatches,
                    this._findReferencedTables(scriptTableNames),
                    this._findReferencedResources(scriptContent)
                );
            }
            if (table === 'sp_widget') {
                generic = generic.concat(this._findInjectedAngularProviders(gr.getValue('client_script')));
            }
            if (tableNameFields.length) {
                var seenTableNames = {};
                var namedTableNames = [];
                tableNameFields.forEach(function (f) {
                    var val = gr.getValue(f);
                    if (val && val !== table && !seenTableNames[val]) {
                        seenTableNames[val] = true;
                        namedTableNames.push(val);
                    }
                });
                generic = generic.concat(this._findReferencedTables(namedTableNames));
            }

            var related = this._dedupeRelated(configured.concat(generic)).filter(function (r) {
                return r.sys_id !== sysId;
            });
            return this._answer({ success: true, related: related });
        } catch (e) {
            return this._answer({
                success: false,
                error: String(e),
                related: [],
            });
        }
    },

    ////////////////////////////////////////////////////////////
    // Admin-configured table relationships (table_config properties)
    ////////////////////////////////////////////////////////////

    TABLE_CONFIG_PROPERTY_PREFIX: 'monaco.plus.assistant.table_config.',

    /**
     * Reads and parses the admin-configured relationship rules for a table from its
     * `monaco.plus.assistant.table_config.<table>` system property. Absent, empty, or
     * malformed properties simply yield no rules — this is purely additive to whatever
     * suggestions the generic script/table_name field scan already produces.
     * Rule shape: {type: 'reference_field'|'child_reference'|'token', ..., then: [rule, ...]}
     *   - reference_field: {sourceField, relatedTable, relatedMatchField (default 'sys_id')}
     *       Follows a field on the source record as a forward reference into relatedTable,
     *       matched against relatedMatchField (a raw field value, not necessarily a sys_id).
     *   - child_reference: {relatedTable, relatedField}
     *       Finds every row in relatedTable whose relatedField equals the source record's
     *       own sys_id (the reverse/"related list" direction).
     *   - token: {sourceField, pattern, relatedTable, relatedMatchField (default 'name')}
     *       Regex-scans sourceField (or, if an array, every field in it) for `pattern`
     *       (one capture group), then matches each captured name against relatedMatchField.
     * Any rule may carry `then`, a nested rule array evaluated against each record the
     * rule resolves — e.g. a child_reference chained into a further reference_field lets
     * one relationship link into another (A -> B -> C) without new code.
     * The same property also optionally carries `pickerFields`, a field-name array
     * overriding which columns the record picker shows (and their order) for this table —
     * see `_getTableColumns`. This lets admins tune picker labels for their own tables
     * without a code change.
     * @param {string} table - Table name.
     * @returns {{rules: Array.<Object>, pickerFields: Array.<string>|null}}
     */
    _getTableConfig: function (table) {
        var raw = gs.getProperty(this.TABLE_CONFIG_PROPERTY_PREFIX + table, '');
        if (!raw) {
            return { rules: [], pickerFields: null };
        }
        try {
            var parsed = JSON.parse(raw);
            return {
                rules: Array.isArray(parsed.rules) ? parsed.rules : [],
                pickerFields: Array.isArray(parsed.pickerFields) ? parsed.pickerFields : null,
            };
        } catch (e) {
            gs.warn('Widget Editor+ Assistant: failed to parse table_config for ' + table + ': ' + e.message);
            return { rules: [], pickerFields: null };
        }
    },

    /**
     * Evaluates a list of table_config rules against a positioned GlideRecordSecure,
     * recursing into each rule's `then` (if any) against the records it resolved.
     * @param {GlideRecordSecure} gr - The source record, already .get()'d.
     * @param {Array.<Object>} rules - Rules from _getTableConfig.
     * @returns {Array.<{table: string, sys_id: string, label: string, category: string, updatedOn: string}>}
     */
    _evaluateRules: function (gr, rules) {
        var suggestions = [];
        for (var i = 0; i < rules.length; i++) {
            var rule = rules[i];
            var matches = this._evaluateRule(gr, rule);
            for (var j = 0; j < matches.length; j++) {
                var match = matches[j];
                suggestions.push(match);
                if (rule.then && rule.then.length && match.sys_id) {
                    var childGr = new GlideRecordSecure(match.table);
                    if (childGr.get(match.sys_id)) {
                        suggestions = suggestions.concat(this._evaluateRules(childGr, rule.then));
                    }
                }
            }
        }
        return suggestions;
    },

    /**
     * Dispatches a single table_config rule by its `type`.
     * @param {GlideRecordSecure} gr - The source record.
     * @param {Object} rule - One rule from a table_config property.
     * @returns {Array.<{table: string, sys_id: string, label: string, category: string, updatedOn: string}>}
     */
    _evaluateRule: function (gr, rule) {
        switch (rule && rule.type) {
            case 'reference_field':
                return this._evalReferenceField(gr, rule);
            case 'child_reference':
                return this._evalChildReference(gr, rule);
            case 'token':
                return this._evalToken(gr, rule);
            default:
                gs.warn('Widget Editor+ Assistant: unknown table_config rule type "' + (rule && rule.type) + '"');
                return [];
        }
    },

    /**
     * Follows a forward reference: the source record's own `rule.sourceField` value is
     * matched against `rule.relatedMatchField` (default 'sys_id') on `rule.relatedTable`.
     */
    _evalReferenceField: function (gr, rule) {
        var value = gr.getValue(rule.sourceField);
        if (!value) {
            return [];
        }
        var matchField = rule.relatedMatchField || 'sys_id';
        var targetGr = new GlideRecordSecure(rule.relatedTable);
        if (matchField === 'sys_id') {
            if (!targetGr.get(value)) {
                return [];
            }
        } else {
            targetGr.addQuery(matchField, value);
            targetGr.setLimit(1);
            targetGr.query();
            if (!targetGr.next()) {
                return [];
            }
        }
        return [this._toMatch(targetGr, rule)];
    },

    /**
     * Follows a reverse reference: every row in `rule.relatedTable` whose
     * `rule.relatedField` equals the source record's own sys_id.
     */
    _evalChildReference: function (gr, rule) {
        var results = [];
        var targetGr = new GlideRecordSecure(rule.relatedTable);
        targetGr.addQuery(rule.relatedField, gr.getUniqueValue());
        targetGr.query();
        while (targetGr.next()) {
            results.push(this._toMatch(targetGr, rule));
        }
        return results;
    },

    /**
     * Regex-scans `rule.sourceField` (a field name, or array of field names) for
     * `rule.pattern` (one capture group per match), then matches each captured name
     * against `rule.relatedMatchField` (default 'name') on `rule.relatedTable`.
     */
    _evalToken: function (gr, rule) {
        var fields = Array.isArray(rule.sourceField) ? rule.sourceField : [rule.sourceField];
        var text = fields
            .map(function (f) {
                return gr.getValue(f) || '';
            })
            .join('\n');

        var names = [];
        var seen = {};
        try {
            var re = new RegExp(rule.pattern, 'g');
            var m;
            while ((m = re.exec(text)) !== null) {
                var name = (m[1] || '').trim();
                if (name && !seen[name]) {
                    seen[name] = true;
                    names.push(name);
                }
            }
        } catch (e) {
            gs.warn('Widget Editor+ Assistant: invalid token pattern "' + rule.pattern + '": ' + e.message);
            return [];
        }
        if (!names.length) {
            return [];
        }

        var results = [];
        var matchField = rule.relatedMatchField || 'name';
        var targetGr = new GlideRecordSecure(rule.relatedTable);
        targetGr.addQuery(matchField, 'IN', names.join(','));
        targetGr.query();
        while (targetGr.next()) {
            results.push(this._toMatch(targetGr, rule));
        }
        return results;
    },

    /**
     * Builds a suggestion entry from a positioned GlideRecordSecure resolved by a rule.
     */
    _toMatch: function (gr, rule) {
        return {
            table: rule.relatedTable,
            sys_id: gr.getUniqueValue(),
            label: gr.getDisplayValue() || gr.getUniqueValue(),
            category: rule.category || 'Related (configured)',
            updatedOn: gr.getDisplayValue('sys_updated_on'),
        };
    },

    /**
     * Finds table names referenced by a table's own reference-type dictionary fields.
     * @param {string} tableName - The table to scan.
     * @returns {Array.<string>} Candidate referenced table names (deduplicated).
     */
    _scanDictionaryReferencedTables: function (tableName) {
        var seen = {};
        var names = [];
        var gr = new GlideRecordSecure('sys_dictionary');
        gr.addQuery('name', tableName);
        gr.addQuery('internal_type', 'reference');
        gr.addNotNullQuery('reference');
        gr.query();
        while (gr.next()) {
            var refTable = gr.getValue('reference');
            if (refTable && refTable !== tableName && !seen[refTable]) {
                seen[refTable] = true;
                names.push(refTable);
            }
        }
        return names;
    },

    /**
     * Finds a table's own script-type fields (internal_type in SCRIPT_FIELD_TYPES),
     * so any table holding server-side code can be scanned without hardcoding its name.
     * @param {string} table - Table name.
     * @returns {Array.<string>} Field names.
     */
    _findScriptFields: function (table) {
        return this._findFieldsOfType(table, Object.keys(this.SCRIPT_FIELD_TYPES).join(','));
    },

    /**
     * Finds a table's fields (including those inherited from parent tables) matching the
     * given dictionary internal_type(s).
     * @param {string} table - Table name.
     * @param {string} internalTypes - Comma-separated internal_type value(s).
     * @returns {Array.<string>} Field names.
     */
    _findFieldsOfType: function (table, internalTypes) {
        var fields = [];
        var seen = {};
        var gr = new GlideRecordSecure('sys_dictionary');
        gr.addQuery('name', 'IN', this._tableHierarchyNames(table).join(','));
        gr.addQuery('internal_type', 'IN', internalTypes);
        gr.query();
        while (gr.next()) {
            var field = gr.getValue('element');
            if (field && !seen[field]) {
                seen[field] = true;
                fields.push(field);
            }
        }
        return fields;
    },

    /**
     * Angular providers a widget's client controller receives by dependency injection —
     * the parameter names of its first function, matched against sp_angular_provider names.
     * Catches providers used by the widget but never linked through m2m_sp_ng_pro_sp_widget.
     * @param {string} clientScript - The widget's client_script.
     * @returns {Array.<{table: string, sys_id: string, label: string, category: string, updatedOn: string}>} Matches.
     */
    _findInjectedAngularProviders: function (clientScript) {
        var m = /\bfunction\b[^(]*\(([^)]*)\)/.exec(clientScript || '');
        if (!m) return [];
        var names = m[1]
            .split(',')
            .map(function (p) {
                return p.trim();
            })
            .filter(function (p) {
                return /^[a-zA-Z_$][\w$]*$/.test(p) && p.charAt(0) !== '$';
            });
        if (!names.length) return [];
        return this._findRecordsByField('sp_angular_provider', 'name', names, 'Angular Provider (injected)');
    },

    // Each entry captures an optional scope prefix (group 1) and the class name (group 2).
    SI_SCAN_PATTERNS: [
        // new Foo( / new global.Foo(
        /\bnew\s+(?:([a-zA-Z_][a-zA-Z0-9_]*)\.)?([A-Z][a-zA-Z0-9_]*)\s*\(/g,
        // Object.extendsObject(Foo, / Object.extendsObject(global.Foo,
        /\bextendsObject\s*\(\s*(?:([a-zA-Z_][a-zA-Z0-9_]*)\.)?([A-Z][a-zA-Z0-9_]*)\s*,/g,
        // Static usage: Foo.bar( / global.Foo.bar( — not preceded by another member access
        /(?:^|[^\w$.])(?:(global|sn_[a-z0-9_]+|x_[a-z0-9_]+)\.)?([A-Z][a-zA-Z0-9_]*)\.[a-zA-Z_$][\w$]*\s*\(/gm,
        // new GlideAjax('Foo') / gs.include('Foo') — the name is a string argument
        /\b(?:GlideAjax\s*\(|gs\.include\s*\()\s*['"](?:([a-zA-Z_][a-zA-Z0-9_]*)\.)?([A-Za-z_][a-zA-Z0-9_]*)['"]/g,
    ],

    /**
     * Regex-scans raw script text for Script Include references: instantiation,
     * extendsObject inheritance, static member calls, GlideAjax processors and gs.include.
     * @param {string} content - Script text to scan.
     * @returns {Array.<{name: string, scope: string}>} Candidates (deduplicated, builtins
     *   excluded); `scope` is the explicit `global.`/`sn_x.` prefix when one was written.
     */
    _scanReferencedNamesInText: function (content) {
        var seen = {};
        var candidates = [];
        var builtins = this.SI_SCAN_BUILTINS;
        this.SI_SCAN_PATTERNS.forEach(function (re) {
            re.lastIndex = 0;
            var m;
            while ((m = re.exec(content || '')) !== null) {
                var scope = m[1] || '';
                var name = m[2];
                if (builtins[name]) continue;
                var key = scope + '.' + name;
                if (seen[key]) continue;
                seen[key] = true;
                candidates.push({ name: name, scope: scope });
            }
        });
        return candidates;
    },

    /**
     * Matches candidate class names against active sys_script_include records.
     * Same-named script includes can exist in multiple scopes (different code,
     * only one actually resolved by the widget's `new Name()` call) — picks, per name,
     * the one whose api_name matches an explicit scope prefix, else the one in the
     * widget's own scope, else the most recently updated.
     * @param {Array.<{name: string, scope: string}>} candidates - From _scanReferencedNamesInText.
     * @param {string} widgetScope - The widget's sys_scope sys_id, for scope preference.
     * @returns {Array.<{table: string, sys_id: string, label: string, category: string, updatedOn: string}>} Matches.
     */
    _findReferencedScriptIncludes: function (candidates, widgetScope) {
        if (!candidates || candidates.length === 0) {
            return [];
        }
        var explicitApiNames = {};
        var names = [];
        var seenNames = {};
        candidates.forEach(function (c) {
            if (c.scope) explicitApiNames[c.scope + '.' + c.name] = true;
            if (!seenNames[c.name]) {
                seenNames[c.name] = true;
                names.push(c.name);
            }
        });

        var siGr = new GlideRecordSecure('sys_script_include');
        siGr.addQuery('active', true);
        siGr.addQuery('name', 'IN', names.join(','));
        siGr.orderByDesc('sys_updated_on');
        siGr.query();

        var byName = {};
        while (siGr.next()) {
            var name = siGr.getValue('name');
            var rank = explicitApiNames[siGr.getValue('api_name')]
                ? 2
                : siGr.getValue('sys_scope') === widgetScope
                  ? 1
                  : 0;
            var existing = byName[name];
            if (!existing || rank > existing.rank) {
                byName[name] = {
                    table: 'sys_script_include',
                    sys_id: siGr.getUniqueValue(),
                    label: name,
                    category: 'Script Include (referenced)',
                    updatedOn: siGr.getDisplayValue('sys_updated_on'),
                    rank: rank,
                };
            }
        }

        var results = [];
        Object.keys(byName).forEach(function (name) {
            var c = byName[name];
            results.push({
                table: c.table,
                sys_id: c.sys_id,
                label: c.label,
                category: c.category,
                updatedOn: c.updatedOn,
            });
        });
        return results;
    },

    /**
     * Regex-scans raw script text for new GlideRecord/GlideRecordSecure/GlideAggregate/GlideQuery('table_name') references.
     * @param {string} content - Script text to scan.
     * @returns {Array.<string>} Candidate table names (deduplicated).
     */
    _scanReferencedTableNamesInText: function (content) {
        return this._scanCaptures(
            content,
            /\bnew\s+(?:global\.)?(?:GlideRecord|GlideRecordSecure|GlideAggregate|GlideQuery)\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/g
        );
    },

    /**
     * Collects the first capture group of every regex match, deduplicated in order.
     * @param {string} content - Text to scan.
     * @param {RegExp} re - Global regex with one capture group.
     * @returns {Array.<string>}
     */
    _scanCaptures: function (content, re) {
        var seen = {};
        var values = [];
        re.lastIndex = 0;
        var m;
        while ((m = re.exec(content || '')) !== null) {
            var value = (m[1] || '').trim();
            if (value && !seen[value]) {
                seen[value] = true;
                values.push(value);
            }
        }
        return values;
    },

    // Script-referenced resources resolved by a literal name: each scan's capture is
    // matched against `field` on `table`.
    RESOURCE_SCANS: [
        {
            re: /\bgs\.(?:getProperty|setProperty)\s*\(\s*['"]([a-zA-Z0-9_.\-]+)['"]/g,
            table: 'sys_properties',
            field: 'name',
            category: 'System Property (referenced)',
        },
        {
            re: /\bgs\.eventQueue(?:Scheduled)?\s*\(\s*['"]([a-zA-Z0-9_.\-]+)['"]/g,
            table: 'sysevent_register',
            field: 'event_name',
            category: 'Event (referenced)',
        },
        {
            re: /\bnew\s+(?:sn_ws\.)?RESTMessageV2\s*\(\s*['"]([^'"]+)['"]/g,
            table: 'sys_rest_message',
            field: 'name',
            category: 'REST Message (referenced)',
        },
        {
            re: /\bnew\s+(?:sn_ws\.)?SOAPMessageV2\s*\(\s*['"]([^'"]+)['"]/g,
            table: 'sys_soap_message',
            field: 'name',
            category: 'SOAP Message (referenced)',
        },
        {
            re: /\bFlowAPI\s*\.\s*(?:start|execute)(?:Flow|Subflow)\w*\s*\(\s*['"](?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)['"]/g,
            table: 'sys_hub_flow',
            field: 'internal_name',
            category: 'Flow (referenced)',
        },
        {
            re: /\bstartFlow\s*\(\s*['"]([0-9a-f]{32})['"]/g,
            table: 'wf_workflow',
            field: 'sys_id',
            category: 'Workflow (referenced)',
        },
    ],

    /**
     * Finds properties, events, REST/SOAP messages, flows and workflows named literally
     * in script text.
     * @param {string} content - Script text to scan.
     * @returns {Array.<{table: string, sys_id: string, label: string, category: string, updatedOn: string}>} Matches.
     */
    _findReferencedResources: function (content) {
        var results = [];
        for (var i = 0; i < this.RESOURCE_SCANS.length; i++) {
            var scan = this.RESOURCE_SCANS[i];
            var values = this._scanCaptures(content, scan.re);
            if (values.length) {
                results = results.concat(this._findRecordsByField(scan.table, scan.field, values, scan.category));
            }
        }
        return results;
    },

    /**
     * Matches values against `field` on `table`, one suggestion per record found.
     * @param {string} table - Table to query.
     * @param {string} field - Field the values are matched against.
     * @param {Array.<string>} values - Literal values to look up.
     * @param {string} category - Suggestion category label.
     * @returns {Array.<{table: string, sys_id: string, label: string, category: string, updatedOn: string}>} Matches.
     */
    _findRecordsByField: function (table, field, values, category) {
        var results = [];
        try {
            var gr = new GlideRecordSecure(table);
            if (!gr.isValid()) return results;
            gr.addQuery(field, 'IN', values.join(','));
            gr.query();
            while (gr.next()) {
                results.push({
                    table: table,
                    sys_id: gr.getUniqueValue(),
                    label: gr.getDisplayValue() || gr.getValue(field) || gr.getUniqueValue(),
                    category: category,
                    updatedOn: gr.getDisplayValue('sys_updated_on'),
                });
            }
        } catch (e) {
            gs.warn('Widget Editor+ Assistant: lookup on ' + table + '.' + field + ' failed: ' + e.message);
        }
        return results;
    },

    /**
     * Follows populated reference fields, including inherited fields, to readable
     * records without requiring a per-table rule.
     * @param {GlideRecordSecure} gr - The source record, already .get()'d.
     * @param {string} table - Its table name.
     * @returns {Array.<{table: string, sys_id: string, label: string, category: string, updatedOn: string}>} Matches.
     */
    _findRecordReferences: function (gr, table) {
        var results = [];
        var dict = new GlideRecordSecure('sys_dictionary');
        dict.addQuery('name', 'IN', this._tableHierarchyNames(table).join(','));
        dict.addQuery('internal_type', 'reference');
        dict.addNotNullQuery('reference');
        dict.query();
        while (dict.next()) {
            var field = dict.getValue('element');
            var refTable = dict.getValue('reference');
            if (!field || !refTable) continue;
            var value = gr.getValue(field);
            if (!value) continue;
            try {
                var target = new GlideRecordSecure(refTable);
                if (!target.get(value)) continue;
                results.push({
                    table: target.getRecordClassName() || refTable,
                    sys_id: target.getUniqueValue(),
                    label: target.getDisplayValue() || value,
                    category: (dict.getValue('column_label') || field) + ' (reference)',
                    updatedOn: target.getDisplayValue('sys_updated_on'),
                });
            } catch (e) {
                gs.warn('Widget Editor+ Assistant: could not follow ' + table + '.' + field + ': ' + e.message);
            }
        }
        return results;
    },

    /**
     * The table plus every parent it extends, so fields declared up the hierarchy
     * (e.g. sysauto for sysauto_script) are included in dictionary scans.
     * @param {string} table - Table name.
     * @returns {Array.<string>}
     */
    _tableHierarchyNames: function (table) {
        var names = [table];
        try {
            var current = table;
            while (names.length < 10) {
                var base = String(new GlideTableHierarchy(current).getBase() || '');
                if (!base || base === current || names.indexOf(base) !== -1) break;
                names.push(base);
                current = base;
            }
        } catch (e) {}
        return names;
    },

    /**
     * Matches candidate table names against sys_db_object records.
     * @param {Array.<string>} names - Candidate table names from _scanReferencedTableNamesInText.
     * @returns {Array.<{table: string, sys_id: string, label: string, category: string, updatedOn: string}>} Matches.
     */
    _findReferencedTables: function (names) {
        if (!names || names.length === 0) {
            return [];
        }

        var results = [];
        var gr = new GlideRecordSecure('sys_db_object');
        gr.addQuery('name', 'IN', names.join(','));
        gr.query();
        while (gr.next()) {
            results.push({
                table: 'sys_db_object',
                sys_id: gr.getUniqueValue(),
                label: gr.getValue('label') || gr.getValue('name'),
                category: 'Table (referenced)',
                updatedOn: gr.getDisplayValue('sys_updated_on'),
            });
        }
        return results;
    },

    /**
     * Removes duplicate table+sys_id entries, keeping the first occurrence.
     * @param {Array.<{table: string, sys_id: string}>} related
     * @returns {Array} Deduplicated list.
     */
    _dedupeRelated: function (related) {
        var seen = {};
        return related.filter(function (r) {
            var key = r.table + ':' + r.sys_id;
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    },

    ////////////////////////////////////////////////////////////
    // Table / record picker
    ////////////////////////////////////////////////////////////

    /**
     * Searches sys_db_object by label or name for the table picker. Paginated with
     * RECORD_LIMIT-sized pages for lazy-loading, same pattern as searchRecords.
     * Accepts `query`, `offset` (default 0).
     * @returns {{success: boolean, tables: Array.<{name: string, label: string}>,
     *   total: number, offset: number, hasMore: boolean}} Return value.
     */
    searchTables: function () {
        var query = this.getParameter('query') || '';
        var offset = parseInt(this.getParameter('offset'), 10) || 0;

        var countGa = new GlideAggregate('sys_db_object');
        if (query) {
            countGa.addQuery('label', 'CONTAINS', query).addOrCondition('name', 'CONTAINS', query);
        }
        countGa.addAggregate('COUNT');
        countGa.query();
        var total = countGa.next() ? parseInt(countGa.getAggregate('COUNT'), 10) || 0 : 0;

        var gr = new GlideRecordSecure('sys_db_object');
        if (query) {
            gr.addQuery('label', 'CONTAINS', query).addOrCondition('name', 'CONTAINS', query);
        }
        gr.orderBy('label');
        gr.chooseWindow(offset, offset + this.RECORD_LIMIT);
        gr.query();

        var tables = [];
        while (gr.next()) {
            var name = gr.getValue('name');
            if (this._isTableExportBlocked(name)) continue;
            tables.push({
                name: name,
                label: gr.getValue('label') || name,
            });
        }
        return this._answer({
            success: true,
            tables: tables,
            total: total,
            offset: offset,
            hasMore: offset + tables.length < total,
        });
    },

    /* Shares its page size with the main Widget Editor+ picker on purpose. */
    RECORD_LIMIT: parseInt(gs.getProperty('monaco.plus.record_limit', '500'), 10) || 500,

    /**
     * Searches a table for records matching a text query against its default list view
     * columns and sys_id. Uses RECORD_LIMIT for pagination and lazy-loading.
     * Accepts `table`, `query`, `offset` (default 0), `limit` (default RECORD_LIMIT).
     * @returns {{success: boolean, columns: Array.<{field: string, label: string}>,
     *   records: Array.<{sys_id: string, label: string, updatedOn: string, values: Object}>,
     *   total: number, offset: number, hasMore: boolean}} Return value.
     */
    searchRecords: function () {
        var table = this.getParameter('table');
        var query = this.getParameter('query') || '';
        var offset = parseInt(this.getParameter('offset'), 10) || 0;
        var limit = parseInt(this.getParameter('limit'), 10) || this.RECORD_LIMIT;
        if (!table) {
            return this._answer({
                success: false,
                error: 'No table provided',
                columns: [],
                records: [],
                total: 0,
                hasMore: false,
            });
        }
        if (this._isTableExportBlocked(table)) {
            return this._answer({
                success: false,
                error: 'Records from this table are blocklisted and cannot be browsed or exported.',
                blocked: true,
                columns: [],
                records: [],
                total: 0,
                hasMore: false,
            });
        }

        var cols = this._getTableColumns(table);
        var displayField = this._getDisplayField(table);

        // Count total matching records
        var countGa = new GlideAggregate(table);
        if (query) {
            var cq = countGa.addQuery('sys_id', 'CONTAINS', query);
            if (displayField) {
                cq.addOrCondition(displayField, 'CONTAINS', query);
            }
            for (var i = 0; i < cols.length; i++) {
                cq.addOrCondition(cols[i].field, 'CONTAINS', query);
            }
        }
        countGa.addAggregate('COUNT');
        countGa.query();
        var total = countGa.next() ? parseInt(countGa.getAggregate('COUNT'), 10) || 0 : 0;

        // Query records
        var gr = new GlideRecordSecure(table);
        if (query) {
            var q = gr.addQuery('sys_id', 'CONTAINS', query);
            if (displayField) {
                q.addOrCondition(displayField, 'CONTAINS', query);
            }
            for (var j = 0; j < cols.length; j++) {
                q.addOrCondition(cols[j].field, 'CONTAINS', query);
            }
        }
        var sortField = (cols.length && cols[0].field) || displayField || 'sys_id';
        gr.orderBy(sortField);
        gr.chooseWindow(offset, offset + limit);
        gr.query();

        var records = [];
        while (gr.next()) {
            var values = {};
            for (var c = 0; c < cols.length; c++) {
                var fName = cols[c].field;
                values[fName] = gr.getDisplayValue(fName) || gr.getValue(fName) || '';
            }
            records.push({
                sys_id: gr.getUniqueValue(),
                label: gr.getDisplayValue() || gr.getUniqueValue(),
                updatedOn: gr.getDisplayValue('sys_updated_on'),
                values: values,
                choiceTable: String(table) === 'sys_choice_set' ? gr.getValue('name') : '',
                choiceField: String(table) === 'sys_choice_set' ? gr.getValue('element') : '',
            });
        }

        return this._answer({
            success: true,
            columns: cols,
            records: records,
            total: total,
            offset: offset,
            hasMore: offset + records.length < total,
            pageSize: limit,
        });
    },

    /** Column internal types allowed in the record picker's list-view columns. */
    PICKER_COLUMN_TYPES: {
        composite_name: true,
        reference: true,
        string: true,
        table_name: true,
        translated_field: true,
        translated_text: true,
    },

    /**
     * Resolves picker column definitions from a table's default list view.
     * An admin-configured `pickerFields` array (from `monaco.plus.assistant.table_config.<table>`,
     * see `_getTableConfig`) takes precedence over the table's own default list view. Every table
     * with a picker override currently ships one of these properties — there is no code-level
     * fallback map, so overriding a new table's picker fields only requires a system property.
     * @param {string} table - Table name.
     * @returns {Array.<{field: string, label: string}>}
     */
    _getTableColumns: function (table) {
        var override = this._getTableConfig(table).pickerFields;
        if (override) {
            var grOverride = new GlideRecordSecure(table);
            grOverride.initialize();
            var overrideCols = [];
            for (var o = 0; o < override.length; o++) {
                var ofName = override[o];
                if (!grOverride.isValidField(ofName)) {
                    continue;
                }
                var oGlideEl;
                try {
                    oGlideEl = grOverride.getElement(ofName);
                } catch (oe2) {
                    continue;
                }
                var oInternalType = '';
                try {
                    oInternalType = String(oGlideEl.getED().getInternalType());
                } catch (oe3) {}
                if (!this.PICKER_COLUMN_TYPES[oInternalType]) {
                    continue;
                }
                var oLabel = ofName;
                try {
                    oLabel = oGlideEl.getLabel() || ofName;
                } catch (oe) {}
                overrideCols.push({ field: ofName, label: oLabel });
            }
            if (overrideCols.length) {
                return overrideCols;
            }
        }

        var listSysId = this._findListSysId(table);
        var fieldNames = [];
        if (listSysId) {
            var elemGr = new GlideRecordSecure('sys_ui_list_element');
            elemGr.addQuery('list_id', listSysId);
            elemGr.orderBy('position');
            elemGr.setLimit(8);
            elemGr.query();
            while (elemGr.next()) {
                var fn = elemGr.getValue('element');
                if (fn && fn.indexOf('sys_') !== 0) {
                    fieldNames.push(fn);
                }
            }
        }

        var grProbe = new GlideRecordSecure(table);
        grProbe.initialize();
        var cols = [];
        for (var i = 0; i < fieldNames.length; i++) {
            var elName = fieldNames[i];
            if (!grProbe.isValidField(elName)) {
                continue;
            }
            var glideEl;
            try {
                glideEl = grProbe.getElement(elName);
            } catch (e) {
                continue;
            }
            var internalType = '';
            try {
                internalType = String(glideEl.getED().getInternalType());
            } catch (e2) {}
            if (!this.PICKER_COLUMN_TYPES[internalType]) {
                continue;
            }
            cols.push({
                field: elName,
                label: glideEl.getLabel() || elName,
            });
        }

        if (cols.length === 0) {
            var displayField = this._getDisplayField(table) || 'name';
            if (displayField.indexOf('sys_') !== 0) {
                var dLabel = displayField;
                if (grProbe.isValidField(displayField)) {
                    try {
                        dLabel = grProbe.getElement(displayField).getLabel() || displayField;
                    } catch (e) {}
                }
                cols.push({ field: displayField, label: dLabel });
            }
        }
        return cols;
    },

    /**
     * Finds the sys_id of the default sys_ui_list for a table.
     * @param {string} table - Table name.
     * @returns {string|null}
     */
    _findListSysId: function (table) {
        var gr = new GlideRecordSecure('sys_ui_list');
        gr.addQuery('name', table);
        gr.addQuery('view', '');
        gr.addNullQuery('sys_user');
        gr.setLimit(1);
        gr.query();
        if (gr.next()) {
            return gr.getUniqueValue();
        }
        var gr2 = new GlideRecordSecure('sys_ui_list');
        gr2.addQuery('name', table);
        gr2.addNullQuery('sys_user');
        gr2.setLimit(1);
        gr2.query();
        if (gr2.next()) {
            return gr2.getUniqueValue();
        }
        return null;
    },

    /**
     * Resolves the display label for a single record, used to re-validate/re-label
     * selections restored from localStorage.
     * Accepts `table`, `sys_id`, and optional `unblocked` ('true' to skip the export
     * blocklist check — passed for update-set members, which are never blocklisted since
     * the update set already scopes what's being exported).
     * @returns {{success: boolean, label: string, updatedOn: string}} Return value.
     */
    getRecordLabel: function () {
        var table = this.getParameter('table');
        var sysId = this.getParameter('sys_id');
        var unblocked = this.getParameter('unblocked') === 'true';
        if (!table || !sysId) {
            return this._answer({
                success: false,
                label: '',
                tableLabel: '',
                updatedOn: '',
            });
        }
        var gr = new GlideRecordSecure(table);
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                label: '',
                tableLabel: '',
                updatedOn: '',
            });
        }
        var tableLabel = this._getTableLabel(table);
        if (!unblocked && this._isTableExportBlocked(table)) {
            // Confirm the record exists without leaking its display value (e.g. a person's name).
            return this._answer({
                success: true,
                label: sysId,
                tableLabel: tableLabel,
                updatedOn: gr.getDisplayValue('sys_updated_on'),
                blocked: true,
            });
        }
        return this._answer({
            success: true,
            label: gr.getDisplayValue() || sysId,
            tableLabel: tableLabel,
            updatedOn: gr.getDisplayValue('sys_updated_on'),
            choiceTable: String(table) === 'sys_choice_set' ? gr.getValue('name') : '',
            choiceField: String(table) === 'sys_choice_set' ? gr.getValue('element') : '',
        });
    },

    /**
     * Resolves the technical table name a sys_db_object record represents, for the token-size
     * estimate's SCHEMA export lookup — a single-field read instead of a full record export.
     * Accepts `sys_id` (of the sys_db_object record).
     * @returns {{success: boolean, name: string}} Return value.
     */
    resolveTableName: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) return this._answer({ success: false, name: '' });
        var gr = new GlideRecordSecure('sys_db_object');
        if (!gr.get(sysId)) return this._answer({ success: false, name: '' });
        return this._answer({
            success: true,
            name: gr.getValue('name') || '',
        });
    },

    // One native Choice Set per table/field, never one suggestion per value.
    _findTableChoices: function (sysId) {
        if (this._isTableExportBlocked('sys_choice_set') || this._isTableExportBlocked('sys_choice')) return [];
        var tables = [];
        var seen = {};
        while (sysId && !seen[sysId]) {
            seen[sysId] = true;
            var table = new GlideRecordSecure('sys_db_object');
            if (!table.get(sysId)) break;
            var name = table.getValue('name');
            if (!name) break;
            tables.push(String(name));
            sysId = String(table.getValue('super_class') || '');
        }
        if (!tables.length) return [];
        var sets = new GlideRecordSecure('sys_choice_set');
        sets.addQuery('name', 'IN', tables.join(','));
        sets.orderBy('name');
        sets.orderBy('element');
        sets.orderBy('sys_id');
        sets.query();
        var related = [];
        var fields = {};
        while (sets.next()) {
            var source = sets.getValue('name') || '';
            var field = sets.getValue('element') || '';
            var key = source + '.' + field;
            if (!field || fields[key]) continue;
            fields[key] = true;
            related.push({
                table: 'sys_choice_set',
                choiceTable: source,
                choiceField: field,
                sys_id: sets.getUniqueValue(),
                label: key + ' choices',
                category: source === tables[0] ? 'Choice Set' : 'Choice Set (inherited)',
                updatedOn: sets.getDisplayValue('sys_updated_on'),
            });
        }
        return related;
    },

    // Resolve the grouping from a readable native record; never accept an arbitrary query.
    getChoiceSetValues: function () {
        var id = String(this.getParameter('sys_id') || '');
        if (
            !/^[0-9a-f]{32}$/.test(id) ||
            this._isTableExportBlocked('sys_choice_set') ||
            this._isTableExportBlocked('sys_choice')
        ) {
            return this._answer({ success: false });
        }
        var set = new GlideRecordSecure('sys_choice_set');
        if (!set.get(id)) return this._answer({ success: false });
        var name = set.getValue('name');
        var field = set.getValue('element');
        if (!name || !field) return this._answer({ success: false });
        var choices = new GlideRecordSecure('sys_choice');
        if (!choices.canRead()) return this._answer({ success: false });
        choices.addQuery('name', name);
        choices.addQuery('element', field);
        choices.orderBy('language');
        choices.orderBy('sequence');
        choices.orderBy('value');
        choices.orderBy('dependent_value');
        choices.orderBy('sys_id');
        choices.query();
        var values = [];
        while (choices.next()) {
            var value = { sys_id: choices.getUniqueValue() };
            ['value', 'label', 'language', 'inactive', 'dependent_value', 'sequence', 'hint'].forEach(function (key) {
                value[key] = choices.getValue(key);
            });
            values.push(value);
        }
        return this._answer({
            success: true,
            name: name,
            element: field,
            choices: values,
        });
    },

    /**
     * Resolves a table's display label from sys_db_object.
     * @param {string} table - Table name.
     * @returns {string} The table's label, or the table name if not found.
     */
    _getTableLabel: function (table) {
        var gr = new GlideRecordSecure('sys_db_object');
        gr.addQuery('name', table);
        gr.setLimit(1);
        gr.query();
        if (gr.next()) {
            return gr.getValue('label') || table;
        }
        return table;
    },

    /**
     * Filters a candidate list of {table, sys_id} pairs down to the ones that still
     * exist, used to validate an imported favourite-groups JSON file before it's kept.
     * Accepts `records` (JSON-encoded array of {table, sys_id}).
     * @returns {{success: boolean, records: Array.<{table: string, sys_id: string}>}} Return value.
     */
    validateRecordsExist: function () {
        var records;
        try {
            records = JSON.parse(this.getParameter('records') || '[]');
        } catch (e) {
            return this._answer({ success: false, records: [] });
        }
        var valid = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (!r || !r.table || !r.sys_id) continue;
            var gr = new GlideRecordSecure(r.table);
            if (!gr.isValid() || !gr.get(r.sys_id)) continue;
            valid.push({ table: r.table, sys_id: r.sys_id });
        }
        return this._answer({ success: true, records: valid });
    },

    /**
     * Looks up the field marked as the display field for a table's dictionary entries.
     * @param {string} table - Table name.
     * @returns {string} Display field element name, or '' if none is configured.
     */
    _getDisplayField: function (table) {
        var gr = new GlideRecordSecure('sys_dictionary');
        gr.addQuery('name', table);
        gr.addQuery('display', true);
        gr.setLimit(1);
        gr.query();
        if (gr.next()) {
            return gr.getValue('element') || '';
        }
        return '';
    },

    ////////////////////////////////////////////////////////////
    // Favourite tables (User Preferences)
    ////////////////////////////////////////////////////////////

    FAVOURITE_TABLES_PREF_NAME: 'widget_editor_assistant.favourite_tables',

    /**
     * Returns the current user's favourited tables for the picker's Favourites
     * section, stored as a JSON array of {name, label} in a sys_user_preference.
     * @returns {{success: boolean, favourites: Array.<{name: string, label: string}>}} Return value.
     */
    getFavouriteTables: function () {
        var gr = new GlideRecordSecure('sys_user_preference');
        gr.addQuery('user', gs.getUserID());
        gr.addQuery('name', this.FAVOURITE_TABLES_PREF_NAME);
        gr.setLimit(1);
        gr.query();
        var favourites = [];
        if (gr.next()) {
            try {
                favourites = JSON.parse(gr.getValue('value') || '[]');
            } catch (e) {}
        }
        return this._answer({ success: true, favourites: favourites });
    },

    /**
     * Upserts the current user's favourited tables.
     * Accepts `favourites` (JSON-encoded array of {name, label}).
     * @returns {{success: boolean}} Return value.
     */
    saveFavouriteTables: function () {
        var favourites = this.getParameter('favourites') || '[]';
        var gr = new GlideRecordSecure('sys_user_preference');
        gr.addQuery('user', gs.getUserID());
        gr.addQuery('name', this.FAVOURITE_TABLES_PREF_NAME);
        gr.query();

        if (gr.next()) {
            gr.setValue('value', favourites);
            gr.update();
        } else {
            gr.initialize();
            gr.setValue('user', gs.getUserID());
            gr.setValue('name', this.FAVOURITE_TABLES_PREF_NAME);
            gr.setValue('value', favourites);
            gr.setValue('type', 'string');
            gr.insert();
        }
        return this._answer({ success: true });
    },

    ////////////////////////////////////////////////////////////
    // Favourite groups (User Preferences)
    ////////////////////////////////////////////////////////////

    FAVOURITE_GROUPS_PREF_NAME: 'widget_editor_assistant.favourite_groups',

    /**
     * Returns the current user's favourite record groups for the Favourites sidebar,
     * stored as a JSON array of {id, name, records: [{table, sys_id}], created, updated}
     * in a sys_user_preference. Record names/tables are re-resolved client-side via
     * getRecordLabel rather than cached here, so renames/moves never go stale.
     * @returns {{success: boolean, groups: Array.<{id: string, name: string,
     *   records: Array.<{table: string, sys_id: string}>, created: string, updated: string}>}} Return value.
     */
    getFavouriteGroups: function () {
        var gr = new GlideRecordSecure('sys_user_preference');
        gr.addQuery('user', gs.getUserID());
        gr.addQuery('name', this.FAVOURITE_GROUPS_PREF_NAME);
        gr.setLimit(1);
        gr.query();
        var groups = [];
        if (gr.next()) {
            try {
                groups = JSON.parse(gr.getValue('value') || '[]');
            } catch (e) {}
        }
        return this._answer({ success: true, groups: groups });
    },

    /**
     * Upserts the current user's favourite groups.
     * Accepts `groups` (JSON-encoded array of {id, name, records, created, updated}).
     * @returns {{success: boolean}} Return value.
     */
    saveFavouriteGroups: function () {
        var groups = this.getParameter('groups') || '[]';
        var gr = new GlideRecordSecure('sys_user_preference');
        gr.addQuery('user', gs.getUserID());
        gr.addQuery('name', this.FAVOURITE_GROUPS_PREF_NAME);
        gr.query();

        if (gr.next()) {
            gr.setValue('value', groups);
            gr.update();
        } else {
            gr.initialize();
            gr.setValue('user', gs.getUserID());
            gr.setValue('name', this.FAVOURITE_GROUPS_PREF_NAME);
            gr.setValue('value', groups);
            gr.setValue('type', 'string');
            gr.insert();
        }
        return this._answer({ success: true });
    },

    ////////////////////////////////////////////////////////////
    // Table/Graph view mode (User Preferences)
    ////////////////////////////////////////////////////////////

    /* Shared with the main Widget Editor+ tool so the view mode rides along with its preferences export/import. */
    USER_PREF_NAME: 'monaco_plus.user_prefs',

    /**
     * Returns the current user's last-selected view mode ('table' or 'graph'),
     * from the shared Widget Editor+ preference blob. Defaults to 'table'.
     * @returns {{success: boolean, viewMode: string}} Return value.
     */
    getViewMode: function () {
        var viewMode = new WidgetEditorAjax().getMergedUserPref(this.USER_PREF_NAME, 'assistantViewMode', 'table');
        return this._answer({
            success: true,
            viewMode: viewMode === 'graph' ? 'graph' : 'table',
        });
    },

    /**
     * Persists the user's view mode into the shared Widget Editor+ preference blob, merging
     * into whatever the main tool has already stored there rather than overwriting it.
     * Accepts `viewMode` ('table' or 'graph'; anything else is treated as 'table').
     * @returns {{success: boolean}} Return value.
     */
    saveViewMode: function () {
        var viewMode = this.getParameter('viewMode') === 'graph' ? 'graph' : 'table';
        new WidgetEditorAjax().saveMergedUserPref(this.USER_PREF_NAME, 'assistantViewMode', viewMode);
        return this._answer({ success: true });
    },

    ////////////////////////////////////////////////////////////
    // Update set picker
    ////////////////////////////////////////////////////////////

    /**
     * Searches sys_update_set by name for the update set picker. The session's current update
     * set (gs.getPreference('sys_update_set') — same source used elsewhere to detect update-set
     * mismatches) is returned separately as `current` so the client can always pin it at the top,
     * and is excluded from the paginated `updateSets` list so it's never shown twice.
     * Accepts `query`, `offset` (default 0).
     * @returns {{success: boolean, current: ?Object, updateSets: Array.<Object>,
     *   total: number, offset: number, hasMore: boolean}} Return value.
     */
    searchUpdateSets: function () {
        var query = this.getParameter('query') || '';
        var offset = parseInt(this.getParameter('offset'), 10) || 0;
        var currentId = gs.getPreference('sys_update_set') || '';

        var countGa = new GlideAggregate('sys_update_set');
        if (currentId) countGa.addQuery('sys_id', '!=', currentId);
        if (query) countGa.addQuery('name', 'CONTAINS', query);
        countGa.addAggregate('COUNT');
        countGa.query();
        var total = countGa.next() ? parseInt(countGa.getAggregate('COUNT'), 10) || 0 : 0;

        var gr = new GlideRecordSecure('sys_update_set');
        if (currentId) gr.addQuery('sys_id', '!=', currentId);
        if (query) gr.addQuery('name', 'CONTAINS', query);
        gr.orderByDesc('sys_updated_on');
        gr.chooseWindow(offset, offset + this.RECORD_LIMIT);
        gr.query();
        var updateSets = [];
        while (gr.next()) {
            updateSets.push(this._updateSetSummary(gr));
        }

        var current = null;
        if (currentId && offset === 0) {
            var curGr = new GlideRecordSecure('sys_update_set');
            if (
                curGr.get(currentId) &&
                (!query || curGr.getValue('name').toLowerCase().indexOf(query.toLowerCase()) !== -1)
            ) {
                current = this._updateSetSummary(curGr);
            }
        }

        return this._answer({
            current: current,
            hasMore: offset + updateSets.length < total,
            offset: offset,
            success: true,
            total: total,
            updateSets: updateSets,
        });
    },

    /**
     * Summarizes one sys_update_set row for the picker/manifest.
     * @param {GlideRecordSecure} gr - A queried sys_update_set GlideRecordSecure.
     * @returns {{sys_id: string, name: string, state: string, stateLabel: string,
     *   description: string, updatedOn: string}} Return value.
     */
    _updateSetSummary: function (gr) {
        return {
            description: gr.getValue('description') || '',
            name: gr.getValue('name'),
            state: gr.getValue('state'),
            stateLabel: gr.getDisplayValue('state'),
            sys_id: gr.getUniqueValue(),
            updatedOn: gr.getDisplayValue('sys_updated_on'),
        };
    },

    /**
     * Lists the distinct records touched by an update set, extracted from its sys_update_xml
     * entries. Dedupes by table+sys_id, keeping the earliest entry so `sysCreatedOnValue` is a
     * safe lower bound for a later "what existed before this update set" lookup.
     * Accepts `update_set`.
     * @returns {{success: boolean, members: Array.<{table: string, sys_id: string, action: string,
     *   label: string, tableLabel: string, updatedOn: string, sysCreatedOnValue: string}>,
     *   total: number}} Return value.
     */
    getUpdateSetMembers: function () {
        var updateSetId = this.getParameter('update_set');
        if (!updateSetId) {
            return this._answer({
                success: false,
                error: 'No update set provided',
                members: [],
                total: 0,
            });
        }

        var gr = new GlideRecordSecure('sys_update_xml');
        gr.addQuery('update_set', updateSetId);
        gr.orderBy('sys_created_on');
        gr.query();

        var seen = {};
        var members = [];
        while (gr.next()) {
            var parsed = this._parseUpdateXmlMember(gr);
            if (!parsed) continue;
            var key = parsed.table + ':' + parsed.sys_id;
            if (seen[key]) continue;
            seen[key] = true;
            members.push(parsed);
        }
        return this._answer({
            success: true,
            members: members,
            total: members.length,
        });
    },

    /**
     * Extracts {table, sys_id, action, label, tableLabel, updatedOn, sysCreatedOnValue} from one
     * sys_update_xml row by parsing its payload. A payload is shaped like
     * `<record_update table="the_table"><the_table action="..."><sys_id>...</sys_id>...` —
     * the table name is a root attribute and sys_id a child element, both more reliable than
     * splitting the `name` field (which is `table + '_' + sys_id` but table names can themselves
     * contain underscores).
     * @param {GlideRecordSecure} gr - A queried sys_update_xml GlideRecordSecure.
     * @returns {?Object} null if the payload couldn't be parsed. Unlike manually-added records,
     *   update-set members are never export-blocklisted — an update set is an explicit,
     *   already-scoped bundle of changes, so every member it touches is included.
     */
    _parseUpdateXmlMember: function (gr) {
        var payload = gr.getValue('payload') || '';
        var tableMatch = payload.match(/<record_update[^>]*\btable="([^"]+)"/);
        var idMatch = payload.match(/<sys_id>([0-9a-f]{32})<\/sys_id>/);
        if (!tableMatch || !idMatch) return null;
        var table = tableMatch[1];
        var sysId = idMatch[1];

        var label = sysId;
        try {
            var recGr = new GlideRecordSecure(table);
            if (recGr.isValid() && recGr.get(sysId)) {
                label = recGr.getDisplayValue() || sysId;
            }
        } catch (e) {
            // Table may no longer exist, or the record itself may have since been deleted.
        }

        return {
            action: gr.getValue('action'),
            label: label,
            sys_id: sysId,
            sysCreatedOnValue: gr.getValue('sys_created_on'),
            table: table,
            tableLabel: this._getTableLabel(table),
            updatedOn: gr.getDisplayValue('sys_created_on'),
        };
    },

    /**
     * Finds the latest sys_update_xml payload for a record recorded strictly before `before`
     * (a sys_created_on value), regardless of which update set it belongs to — the version that
     * existed immediately prior to the update set currently being added. Reuses the same
     * `name = table + '_' + sys_id` lookup already used elsewhere to resolve a record's owning
     * update set.
     * Accepts `table`, `sys_id`, `before`.
     * @returns {{success: boolean, found: boolean, payload: ?string, action: ?string,
     *   updateSetSysId: ?string, updateSetName: ?string, updatedOn: ?string}} Return value.
     */
    getPreviousUpdateXml: function () {
        var table = this.getParameter('table');
        var sysId = this.getParameter('sys_id');
        var before = this.getParameter('before');
        if (!table || !sysId) {
            return this._answer({ success: false, found: false });
        }

        var gr = new GlideRecordSecure('sys_update_xml');
        gr.addQuery('name', table + '_' + sysId);
        if (before) gr.addQuery('sys_created_on', '<', before);
        gr.orderByDesc('sys_created_on');
        gr.setLimit(1);
        gr.query();
        if (!gr.next()) {
            return this._answer({ success: true, found: false });
        }

        var updateSetId = gr.getValue('update_set');
        var updateSetName = '';
        if (updateSetId) {
            var usGr = new GlideRecordSecure('sys_update_set');
            if (usGr.get(updateSetId)) {
                updateSetName = usGr.getValue('name');
            }
        }

        return this._answer({
            action: gr.getValue('action'),
            found: true,
            payload: gr.getValue('payload'),
            success: true,
            updatedOn: gr.getDisplayValue('sys_created_on'),
            updateSetName: updateSetName,
            updateSetSysId: updateSetId,
        });
    },

    ////////////////////////////////////////////////////////////
    // Token config & ranges
    ////////////////////////////////////////////////////////////

    // Small <15k tokens, moderate 15k-150k, large >150k.
    TOKEN_CONFIG: {
        // Rough chars-per-token ratio for estimating tokens from the actual exported XML size.
        charsPerToken: 4,
        ranges: [
            { max: 15000, level: 'green', label: 'Small' },
            { max: 150000, level: 'orange', label: 'Moderate' },
            { max: null, level: 'red', label: 'Large' },
        ],
    },

    /**
     * Returns token estimation configuration and color thresholds.
     * @returns {{success: boolean, charsPerToken: number, ranges: Array.<{max: ?number, level: string, label: string}>}} Return value.
     */
    getTokenConfig: function () {
        return this._answer({
            success: true,
            charsPerToken: this.TOKEN_CONFIG.charsPerToken,
            ranges: this.TOKEN_CONFIG.ranges,
        });
    },

    _answer: function (obj) {
        return this.setAnswer(JSON.stringify(obj));
    },

    type: 'WidgetEditorAssistantAjax',
});

(function() {
    'use strict';

    // Config is populated by the Jelly template above. Keep all client-side
    // normalization here so the rest of the page has one source of truth.
    var pageConfig = window.WE_DIFF_CONFIG || {};
    var SITE_TITLE = pageConfig.siteTitle || 'ServiceNow';
    var APP_TITLE = 'Compare+';

    function _syncHistoryEntry(description) {
        if (window.WE_HISTORY_SYNC) {
            window.WE_HISTORY_SYNC.set({ description: description || '', title: APP_TITLE });
        }
    }

    // Suppress "Unexpected usage" rejections from language service workers
    window.addEventListener('unhandledrejection', function(e) {
        if (e.reason && e.reason.message === 'Unexpected usage') {
            e.preventDefault();
        }
    });

    function _ensureMonacoWorker() {
        if (!window.MonacoEnvironment) {
            window.MonacoEnvironment = {};
        }
        if (typeof window.MonacoEnvironment.getWorker === 'function') {
            return;
        }
        var wb = '/scripts/snc-code-editor/';
        window.MonacoEnvironment.getWorker = function(workerId, label) {
            var f;
            if (label === 'typescript' || label === 'javascript') {
                f = wb + 'ts.worker.bundle.min.jsx?sysparm_substitute=false';
            } else if (label === 'css' || label === 'scss' || label === 'less') {
                f = wb + 'css.worker.bundle.min.jsx?sysparm_substitute=false';
            } else if (label === 'html' || label === 'handlebars') {
                f = wb + 'html.worker.bundle.min.jsx?sysparm_substitute=false';
            } else if (label === 'json') {
                f = wb + 'json.worker.bundle.min.jsx?sysparm_substitute=false';
            } else {
                f = wb + 'editor.worker.bundle.min.jsx?sysparm_substitute=false';
            }
            var blob = new Blob(['importScripts(' + JSON.stringify(location.origin + f) + ')'], { type: 'application/javascript' });
            return new Worker(URL.createObjectURL(blob));
        };
    }

    var _langServicesSetup = false;
    function _setupLanguageServices() {
        if (_langServicesSetup || !window.monaco) { return; }
        _langServicesSetup = true;

        // Disable semantic/suggestion diagnostics; keep syntax errors visible in a diff.
        if (monaco.languages && monaco.languages.typescript) {
            var _noValidation = {
                noSemanticValidation: true,
                noSuggestionDiagnostics: true
            };
            var _jsDef = monaco.languages.typescript.javascriptDefaults;
            if (_jsDef && _jsDef.setDiagnosticsOptions) { _jsDef.setDiagnosticsOptions(_noValidation); }
            var _tsDef = monaco.languages.typescript.typescriptDefaults;
            if (_tsDef && _tsDef.setDiagnosticsOptions) { _tsDef.setDiagnosticsOptions(_noValidation); }
        }

        _initMonacoPlus();

        // Register a lightweight JSON tokenizer (no worker, no validation squiggles)
        if (
            monaco.languages &&
            !monaco.languages.getLanguages().some(function(l) { return l.id === 'we-json'; })
        ) {
            monaco.languages.register({ id: 'we-json' });
            monaco.languages.setMonarchTokensProvider('we-json', {
                defaultToken: '',
                tokenizer: {
                    root: [
                        [/[{}[],:]/, 'delimiter.bracket'],
                        [/"/, { token: 'string.quote', next: '@string' }],
                        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
                        [/\b(?:true|false|null)\b/, 'keyword'],
                        [/\s+/, '']
                    ],
                    string: [
                        [/[^\\"]+/, 'string'],
                        [/\\./, 'string.escape'],
                        [/"/, { token: 'string.quote', next: '@pop' }]
                    ]
                }
            });
        }
    }

    function _langForEditor(lang) {
        return (lang === 'json') ? 'we-json' : (lang || 'plaintext');
    }

    var _snProvidersRegistered = false;
    function _registerSnProviders() {
        if (_snProvidersRegistered || !window.monaco) { return; }
        _snProvidersRegistered = true;

        var _defTables = [
            { table: 'sys_script_include', nameField: 'api_name' },
            { table: 'sys_script_include', nameField: 'name' },
            { table: 'sys_ui_script',      nameField: 'name'    }
        ];
        var _defProvider = {
            provideDefinition: function(model, position) {
                var word = model.getWordAtPosition(position);
                if (!word || !word.word) { return []; }
                var name = word.word;
                function tryTable(idx) {
                    if (idx >= _defTables.length) { return; }
                    var t = _defTables[idx];
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET',
                        '/api/now/table/' + t.table +
                        '?sysparm_query=' + t.nameField + '=' + encodeURIComponent(name) +
                        '&sysparm_fields=sys_id&sysparm_limit=1',
                        true);
                    xhr.setRequestHeader('X-UserToken', window.g_ck || '');
                    xhr.setRequestHeader('Accept', 'application/json');
                    xhr.onload = function() {
                        if (xhr.status !== 200) { tryTable(idx + 1); return; }
                        try {
                            var records = JSON.parse(xhr.responseText).result || [];
                            if (records.length > 0) {
                                window.open('/' + t.table + '.do?sys_id=' + records[0].sys_id);
                            } else {
                                tryTable(idx + 1);
                            }
                        } catch(e) { tryTable(idx + 1); }
                    };
                    xhr.onerror = function() { tryTable(idx + 1); };
                    xhr.send();
                }
                tryTable(0);
                return [];
            }
        };
        monaco.languages.registerDefinitionProvider('javascript', _defProvider);
        monaco.languages.registerDefinitionProvider('typescript', _defProvider);
    }

    var _mplusInitialized = false;
    function _initMonacoPlus() {
        if (_mplusInitialized) { return; }
        var _bs = window.SNMonacoPlusBootstrap;
        if (!_bs || typeof _bs.init !== 'function') { return; }
        _mplusInitialized = true;
        _bs.init({ language: 'typescript' }).then(function(api) {
            if (!api) { return; }
            if (typeof api.loadSnTypeDefinitions === 'function') {
                api.loadSnTypeDefinitions();
            }
            _registerSnProviders();
        });
        _bs.init({ language: 'html' });
    }

    var recordId     = pageConfig.record_id || '';
    var tableParam   = pageConfig.table || 'sp_widget';
    var version1Id   = pageConfig.version_1 || '';
    var version2Id   = pageConfig.version_2 || '';
    var daToken      = pageConfig.da_token || '';
    var isEmbedded   = pageConfig.da_iframe === 'true';
    var isFromList   = pageConfig.da_source === 'list';

    var diffPageSysId     = pageConfig.diffPageSysId || '';
    var widgetEditorSysId = pageConfig.widgetEditorSysId || '';

    function _queryString(params) {
        return Object.keys(params)
            .filter(function(k) { return params[k] !== undefined && params[k] !== null; })
            .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
            .join('&');
    }

    // Build a nav_to.do URL for a page identified by its sys_id (or page name as fallback).
    function _navUrl(pageSysId, pageNameFallback, params) {
        var qs = _queryString(params);
        var uri = pageSysId
            ? ('ui_page.do?sys_id=' + encodeURIComponent(pageSysId) + (qs ? '&' + qs : ''))
            : (pageNameFallback + '.do?' + qs);
        return '/nav_to.do?uri=' + encodeURIComponent(uri);
    }

    // Build a direct page URL (for iframe src) without nav_to wrapper.
    function _iframeUrl(pageSysId, pageNameFallback, params) {
        var qs = _queryString(params);
        if (pageSysId) {
            return '/ui_page.do?sys_id=' + encodeURIComponent(pageSysId) + (qs ? '&' + qs : '');
        }
        return '/' + pageNameFallback + '.do?' + qs;
    }

    //////// Pure helpers ////////////////////////////////////////////////////////

    function _ajax(method, params, cb) {
        var ga = new GlideAjax('WidgetEditorAjax');
        ga.addParam('sysparm_name', method);
        for (var k in params) {
            if (params.hasOwnProperty(k)) {
                ga.addParam(k, params[k]);
            }
        }
        ga.getXML(function(resp) {
            if (typeof cb !== 'function') { return; }
            var data;
            try { data = JSON.parse(resp.responseXML.documentElement.getAttribute('answer')); }
            catch (e) { data = { success: false, error: 'Parse error: ' + (e.message || e) }; }
            cb(data);
        });
    }

    function _formatDate(isoStr) {
        if (!isoStr) { return ''; }
        try {
            return new Date(isoStr.replace(' ', 'T') + 'Z').toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
            });
        } catch(e) { return isoStr; }
    }

    function _formatDateFull(isoStr) {
        if (!isoStr) { return ''; }
        try {
            return new Date(isoStr.replace(' ', 'T') + 'Z').toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit'
            });
        } catch(e) { return isoStr; }
    }

    function _resolveMonacoTheme() {
        try {
            var bg = getComputedStyle(document.documentElement).getPropertyValue('--now-color_background--primary').trim();
            if (bg) {
                var p = bg.split(/[\s,]+/).map(Number);
                if (p.length >= 3) {
                    return (p[0] + p[1] + p[2]) / 3 < 128 ? 'vs-dark' : 'vs';
                }
            }
        } catch (e) {}
        return 'vs-dark';
    }

    // Builds a normalized fields map from a version or live record object, per fieldDefs.
    function _buildFields(versionDataOrNull, recordData, fieldDefs) {
        var result = {};
        if (!fieldDefs) { return result; }
        if (versionDataOrNull) {
            var f = versionDataOrNull.fields || {};
            for (var i = 0; i < fieldDefs.length; i++) {
                var key = fieldDefs[i].key;
                var isCode = fieldDefs[i].renderAs === 'code';
                var isBool = fieldDefs[i].renderAs === 'boolean';
                /* absent from payload = null; present but empty = '' */
                var raw = f[key] !== undefined ? (f[key] !== null ? String(f[key]) : null) : null;
                if (isBool && raw !== null) {
                    result[key] = (raw === 'true' || raw === '1') ? 'true' : 'false';
                } else {
                    result[key] = (raw !== null && !isCode) ? raw.trim() : raw;
                }
            }
        } else {
            var vals = (recordData && recordData.values) || {};
            for (var j = 0; j < fieldDefs.length; j++) {
                var k = fieldDefs[j].key;
                var v = vals[k];
                var isCodeField = fieldDefs[j].renderAs === 'code';
                if (fieldDefs[j].renderAs === 'boolean') {
                    result[k] = (v === null || v === undefined) ? null
                              : (v === true || v === '1' || v === 'true') ? 'true' : 'false';
                } else {
                    var rawStr = (v !== null && v !== undefined) ? String(v) : null;
                    result[k] = (rawStr !== null && !isCodeField) ? rawStr.trim() : rawStr;
                }
            }
        }
        return result;
    }

    function _buildDisplayFields(fieldsMap) {
        var result = {};
        for (var k in fieldsMap) {
            if (fieldsMap.hasOwnProperty(k)) {
                result[k] = fieldsMap[k] !== null ? fieldsMap[k] : '';
            }
        }
        return result;
    }

    /* For reference fields, return display value if available, otherwise raw value. */
    function _buildRefDisplay(versionDataOrNull, recordData, fieldDefs) {
        var result = {};
        if (!fieldDefs) { return result; }
        var dvMap = versionDataOrNull
            ? (versionDataOrNull.display_values || {})
            : ((recordData && recordData.display_values) || {});
        var rawMap = versionDataOrNull
            ? (versionDataOrNull.fields || {})
            : ((recordData && recordData.values) || {});
        for (var i = 0; i < fieldDefs.length; i++) {
            var _renderAs = fieldDefs[i].renderAs;
            if (_renderAs !== 'reference' && _renderAs !== 'choice') { continue; }
            var key = fieldDefs[i].key;
            var dv = dvMap[key];
            var rawVal = (rawMap[key] !== null && rawMap[key] !== undefined) ? String(rawMap[key]) : null;
            if (dv != null && dv !== '') {
                result[key] = rawVal ? String(dv) + ' [' + rawVal + ']' : String(dv);
            } else {
                result[key] = rawVal !== null ? rawVal : '';
            }
        }
        return result;
    }

    function _buildListDisplay(versionDataOrNull, recordData, fieldDefs) {
        var result = {};
        if (!fieldDefs) { return result; }
        var dvMap = versionDataOrNull
            ? (versionDataOrNull.display_values || {})
            : ((recordData && recordData.display_values) || {});
        var rawMap = versionDataOrNull
            ? (versionDataOrNull.fields || {})
            : ((recordData && recordData.values) || {});
        for (var i = 0; i < fieldDefs.length; i++) {
            if (fieldDefs[i].renderAs !== 'list') { continue; }
            var key = fieldDefs[i].key;
            var rawVal = (rawMap[key] !== null && rawMap[key] !== undefined) ? String(rawMap[key]) : '';
            var dv = dvMap[key] || '';
            if (!rawVal) { result[key] = ''; continue; }
            var ids   = rawVal.split(',');
            var names = dv ? dv.split(',') : [];
            result[key] = ids.map(function(id, idx) {
                id = id.trim();
                var name = (names[idx] || '').trim();
                return (name && name !== id) ? name + ' [' + id + ']' : id;
            }).join('\n');
        }
        return result;
    }

    function _countsFromLineChanges(lineChanges) {
        var added = 0, removed = 0;
        if (!lineChanges) { return { added: 0, removed: 0 }; }
        for (var i = 0; i < lineChanges.length; i++) {
            var c = lineChanges[i];
            if (c.modifiedEndLineNumber >= c.modifiedStartLineNumber) {
                added   += c.modifiedEndLineNumber  - c.modifiedStartLineNumber  + 1;
            }
            if (c.originalEndLineNumber >= c.originalStartLineNumber) {
                removed += c.originalEndLineNumber - c.originalStartLineNumber + 1;
            }
        }
        return { added: added, removed: removed };
    }

    function _diffLineCounts(leftText, rightText) {
        if (leftText === rightText) {
            return { added: 0, removed: 0 };
        }
        var L = leftText  === '' ? [] : leftText.split('\n');
        var R = rightText === '' ? [] : rightText.split('\n');
        var m = L.length, n = R.length;
        if (m * n > 250000) {
            var freq = {};
            L.forEach(function(l) { freq[l] = (freq[l] || 0) + 1; });
            var common = 0;
            R.forEach(function(l) { if (freq[l] > 0) { common++; freq[l]--; } });
            return { added: n - common, removed: m - common };
        }
        var prev = new Array(n + 1).fill(0), curr = new Array(n + 1).fill(0);
        for (var i = 1; i <= m; i++) {
            for (var j = 1; j <= n; j++) {
                curr[j] = L[i-1] === R[j-1] ? prev[j-1]+1 : Math.max(curr[j-1], prev[j]);
            }
            var tmp = prev; prev = curr; curr = tmp;
            for (var kk = 0; kk <= n; kk++) curr[kk] = 0;
        }
        return { added: n - prev[n], removed: m - prev[n] };
    }


    //////// Angular app /////////////////////////////////////////////////////////

    function _initAngular() {
        if (typeof angular === 'undefined') {
            return;
        }

    // Compare exported field values, not display labels or generated metadata.
    function annotateFieldChanges(previous, current, currentDeleted) {
        function fields(record) {
            var result = Object.create(null);
            if (record) Array.prototype.forEach.call(record.children, function (field) {
                result[field.tagName] = field;
            });
            return result;
        }
        var before = fields(previous);
        var after = fields(current);
        var names = Object.keys(before);
        Object.keys(after).forEach(function (name) { if (!before[name]) names.push(name); });
        function isNil(field) {
            return field.getAttribute('nil') === 'true' || field.getAttribute('nil') === '1';
        }
        names.forEach(function (name) {
            var left = before[name];
            var right = after[name];
            var status = null;
            if ((left && (left.getAttribute('redacted') === 'true' || left.children.length)) ||
                (right && (right.getAttribute('redacted') === 'true' || right.children.length))) {
                // Not comparable — already conveyed by redacted="true" or the field's own
                // nested structure; leaving change unset avoids a second, redundant signal.
            } else if (currentDeleted && previous) {
                status = 'removed';
            } else if (!previous || !current) {
                // The whole record is missing on one side — already conveyed by the
                // enclosing previous_version's status="new" or the deleted_record fallback.
            } else if (!left) {
                status = 'added';
            } else if (!right) {
                status = 'removed';
            } else {
                status = left.textContent === right.textContent && isNil(left) === isNil(right) ? 'unchanged' : 'modified';
            }
            if (!status) return;
            if (left) left.setAttribute('change', status);
            if (right) right.setAttribute('change', status);
        });
    }
    // End field comparison helper.

    angular.module('weDiff', [])

    .controller('WeDiffCtrl', ['$scope', '$timeout', '$document', function($scope, $timeout, $document) {
        var ctrl = this;

        // Exposed scope state
        ctrl.loading          = true;
        ctrl.errorMsg         = '';
        ctrl.noVersions       = false;
        ctrl.recordNotFound   = false;
        ctrl.noRecordSelected = false;
        ctrl.tableNoVersions  = false;
        ctrl.recordName   = '';
        ctrl.isSpWidget   = (tableParam === 'sp_widget');

        ctrl.leftVersionId  = version1Id;
        ctrl.rightVersionId = version2Id || 'current';
        ctrl.versionsData          = [];
        ctrl.leftVersionOptions    = [];
        ctrl.eligibleRightVersions = [];
        ctrl.leftFields  = {};
        ctrl.rightFields = {};
        ctrl.metaLeft    = {};
        ctrl.metaRight   = {};
        ctrl.simpleFields = [];   // populated after getDiffFieldDefs returns
        ctrl.scriptFields = [];   // populated after getDiffFieldDefs returns
        ctrl.rawFields    = [];   // populated after getDiffFieldDefs returns, in layout order
        ctrl.fields       = [];   // displayed fields (sorted when showChangedFieldsFirst is enabled)
        ctrl.showChangedFieldsFirst = false;
        var _cachedUserPrefs = {};
        ctrl.tableLabel   = '';   // human-readable table name, e.g. "Widget"
        ctrl.editors       = {};
        ctrl.extraChangedSimpleFields = [];
        ctrl.extraChangedScriptFields = [];
        ctrl.extraFields               = [];   // in layout order
        ctrl.extraEditors      = {};
        ctrl.extraLeftFields   = {};
        ctrl.extraRightFields  = {};
        ctrl.leftDisplayFields       = {};
        ctrl.rightDisplayFields      = {};
        ctrl.extraLeftDisplayFields  = {};
        ctrl.extraRightDisplayFields = {};
        ctrl.leftRefDisplay       = {};
        ctrl.rightRefDisplay      = {};
        ctrl.extraLeftRefDisplay  = {};
        ctrl.extraRightRefDisplay = {};
        ctrl.leftListDisplay       = {};
        ctrl.rightListDisplay      = {};
        ctrl.extraLeftListDisplay  = {};
        ctrl.extraRightListDisplay = {};
        ctrl.loadingLeft      = false;
        ctrl.loadingRight     = false;
        ctrl.currentIsUnsaved = false;
        ctrl.currentMeta      = { date: '', by: '', usn: '' };
        ctrl.savedMeta        = { date: '', by: '', usn: '' };
        ctrl.openVersionCol   = null;
        ctrl.canWrite         = false;
        ctrl.wordWrap         = true;
        ctrl.expandedIndex    = null;
        ctrl.expandedExtraIndex = null;
        ctrl.expandedString   = null;   // { key, label, isExtra } when a long string field is expanded
        ctrl.stringEditor     = null;   // shared Monaco diff editor for expanded strings
        ctrl.hasChangedBelowViewport = false;

        ctrl.showBuilder      = {};
        ctrl.parsedCache      = {};
        ctrl.tableLabelsCache = {};
        ctrl.tableFieldsCache = {};
        ctrl.resolvedDisplayValuesCache = {};
        ctrl.resolvingQueries = {};
        // Catalog variable metadata for variable_conditions fields, keyed by item_option_new Sys ID
        // (not per-table, since a variable's Sys ID is already globally unique).
        ctrl.variableLabelsCache = {};
        ctrl.variableFieldsCache = {};

        // Private state
        var _recordData          = null;
        var _savedRecordData     = null;
        var _fieldDefs           = null;   // array of { key, label, type, renderAs, language, reference }
        var _extraFieldDefs      = null;   // extra (non-layout) field defs
        var _leftVersionData     = null;
        var _leftIsCurrentSaved  = false;
        var _rightVersionData    = null;
        var _allVersionsData     = [];
        var _versionCache        = {};
        var _currentLeftId       = version1Id;
        var _currentRightId      = version2Id || 'current';
        var _exportLeftValues    = {};
        var _exportRightValues   = {};
        var _pending             = 0;
        var _errors              = [];
        var _tableHasNoTracking  = false;
        var _changedBelowRaf     = null;

        function _updateChangedBelowIndicator() {
            if (ctrl.expandedIndex !== null || ctrl.expandedExtraIndex !== null || ctrl.expandedString) {
                ctrl.hasChangedBelowViewport = false;
                return;
            }
            var changedElements = document.querySelectorAll('.da-section.da-changed, .sft-changed');
            if (!changedElements || changedElements.length === 0) {
                ctrl.hasChangedBelowViewport = false;
                return;
            }
            var viewportBottom = window.innerHeight || document.documentElement.clientHeight || 0;
            var hasBelow = false;
            for (var i = 0; i < changedElements.length; i++) {
                var rect = changedElements[i].getBoundingClientRect();
                if (rect.bottom > viewportBottom) {
                    hasBelow = true;
                    break;
                }
            }
            ctrl.hasChangedBelowViewport = hasBelow;
        }

        function _scheduleChangedBelowIndicatorUpdate() {
            if (_changedBelowRaf) {
                return;
            }
            _changedBelowRaf = window.requestAnimationFrame(function() {
                _changedBelowRaf = null;
                _apply(_updateChangedBelowIndicator);
            });
        }

        /* Schedule fn in a digest (uses $timeout when outside one) */
        function _apply(fn) {
            if ($scope.$$phase || $scope.$root.$$phase) {
                fn();
            } else {
                $timeout(fn);
            }
        }

        function _sortFields() {
            if (!ctrl.rawFields || !ctrl.rawFields.length) { return; }
            var combined = ctrl.rawFields.concat(ctrl.extraFields || []);
            if (!ctrl.showChangedFieldsFirst) {
                ctrl.fields = combined;
            } else {
                var changed = [];
                var unchanged = [];
                for (var i = 0; i < combined.length; i++) {
                    var f = combined[i];
                    var isChg = f.isExtra ? true : (f.isScript ? !!f.changed : !!ctrl.isChanged(f.key));
                    if (isChg) {
                        changed.push(f);
                    } else {
                        unchanged.push(f);
                    }
                }
                ctrl.fields = changed.concat(unchanged);
            }
            _scheduleChangedBelowIndicatorUpdate();
        }

        ctrl.toggleShowChangedFieldsFirst = function() {
            ctrl.showChangedFieldsFirst = !ctrl.showChangedFieldsFirst;
            _sortFields();
            _cachedUserPrefs.showChangedFieldsFirst = ctrl.showChangedFieldsFirst;
            _ajax('saveUserPrefs', { value: JSON.stringify(_cachedUserPrefs) });
            $timeout(function() {
                for (var k in ctrl.editors) {
                    if (ctrl.editors.hasOwnProperty(k) && ctrl.editors[k]) {
                        ctrl.editors[k].layout();
                    }
                }
                for (var ek in ctrl.extraEditors) {
                    if (ctrl.extraEditors.hasOwnProperty(ek) && ctrl.extraEditors[ek]) {
                        ctrl.extraEditors[ek].layout();
                    }
                }
            }, 50);
        };

        function _getVersionsList() {
            if (_allVersionsData.length > 0) {
                return _allVersionsData;
            }
            var list = [];
            if (_leftVersionData) {
                list.push({
                    sys_id: version1Id,
                    sys_created_on:  _leftVersionData.sys_created_on  || '',
                    sys_created_by:  _leftVersionData.sys_created_by  || '',
                    update_set_name: _leftVersionData.update_set_name || ''
                });
            }
            if (version2Id && _rightVersionData) {
                list.push({
                    sys_id: version2Id,
                    sys_created_on:  _rightVersionData.sys_created_on  || '',
                    sys_created_by:  _rightVersionData.sys_created_by  || '',
                    update_set_name: _rightVersionData.update_set_name || ''
                });
            }
            return list;
        }

        function _getEligibleRightVersions() {
            var all = _getVersionsList();
            if (_leftIsCurrentSaved) {
                return [];
            }
            if (!ctrl.currentIsUnsaved && _allVersionsData.length > 0) {
                var latestId = _allVersionsData[0].sys_id;
                all = all.filter(function(v) { return v.sys_id !== latestId; });
            }
            var leftDate = _leftVersionData ? (_leftVersionData.sys_created_on || '') : '';
            return all.filter(function(v) {
                return leftDate ? (v.sys_created_on || '') > leftDate : v.sys_id !== _currentLeftId;
            });
        }

        function _validateRightSelection() {
            if (_currentRightId !== 'current') {
                var eligible = _getEligibleRightVersions();
                if (!eligible.some(function(v) { return v.sys_id === _currentRightId; })) {
                    _currentRightId     = 'current';
                    _rightVersionData   = null;
                    ctrl.rightVersionId = 'current';
                }
            }
        }

        function _syncScope() {
            if (!_fieldDefs) { return; }

            ctrl.recordName = (_recordData && _recordData.name) || (_savedRecordData && _savedRecordData.name) || '(Unnamed)';
            var _tableSuffix = ctrl.tableLabel ? ' (' + ctrl.tableLabel + ')' : '';
            var _title = 'Compare: ' + ctrl.recordName + _tableSuffix + ' - ' + SITE_TITLE;
            document.title = _title;
            setTimeout(function() {
                try { if (window.parent !== window) window.parent.document.title = _title; } catch(e) {}
            }, 1000);
            _syncHistoryEntry(ctrl.recordName + _tableSuffix);

            var _latestVer     = _allVersionsData.length > 0 ? _allVersionsData[0] : null;
            var _latestVerUsn  = _latestVer ? (_latestVer.update_set_name   || '') : '';
            var _latestVerUss  = _latestVer ? (_latestVer.update_set_sys_id || '') : '';
            var _latestVerDate = _latestVer ? (_latestVer.sys_created_on    || '') : '';
            var _recDate       = (_recordData && _recordData.sys_updated_on) || '';
            var _currentDate   = _latestVerDate > _recDate ? _latestVerDate : _recDate;

            var _savedRef = _savedRecordData || _recordData;

            // Unsaved vs Current: merges saved record values as the base with snap values overlaid.
            var _unsavedRef = (ctrl.currentIsUnsaved && _savedRecordData)
                ? { values: (function() {
                        var merged = {};
                        var base = _savedRecordData.values || {};
                        var snap = _recordData.values || {};
                        for (var _k in base) { if (base.hasOwnProperty(_k)) { merged[_k] = base[_k]; } }
                        for (var _s in snap) { if (snap.hasOwnProperty(_s)) { merged[_s] = snap[_s]; } }
                        return merged;
                    })() }
                : _recordData;

            var lf = _leftIsCurrentSaved
                ? _buildFields(null, _savedRef, _fieldDefs)
                : _buildFields(_leftVersionData, _recordData, _fieldDefs);
            var rf = _buildFields(_rightVersionData, _unsavedRef, _fieldDefs);

            // Preserve all loaded fields and raw values, independent of the visible diff filter.
            _exportLeftValues = _leftIsCurrentSaved ? ((_savedRef && _savedRef.values) || {})
                : (_leftVersionData ? _leftVersionData.fields : ((_recordData && _recordData.values) || {}));
            _exportRightValues = _rightVersionData ? _rightVersionData.fields : ((_unsavedRef && _unsavedRef.values) || {});
            ctrl.leftFields  = lf;
            ctrl.rightFields = rf;
            ctrl.leftDisplayFields  = _buildDisplayFields(lf);
            ctrl.rightDisplayFields = _buildDisplayFields(rf);
            ctrl.leftRefDisplay = _leftIsCurrentSaved
                ? _buildRefDisplay(null, _savedRef, _fieldDefs)
                : _buildRefDisplay(_leftVersionData, _recordData, _fieldDefs);
            ctrl.rightRefDisplay = _buildRefDisplay(_rightVersionData, _unsavedRef, _fieldDefs);
            ctrl.leftListDisplay = _leftIsCurrentSaved
                ? _buildListDisplay(null, _savedRef, _fieldDefs)
                : _buildListDisplay(_leftVersionData, _recordData, _fieldDefs);
            ctrl.rightListDisplay = _buildListDisplay(_rightVersionData, _unsavedRef, _fieldDefs);

            var lMeta;
            if (_leftIsCurrentSaved) {
                lMeta = {};
                ctrl.metaLeft = {
                    date:     _formatDate(_currentDate) || '',
                    dateFull: _formatDateFull(_currentDate) || '',
                    usn:      _latestVerUsn,
                    uss:      _latestVerUss,
                    by:       (_savedRef && _savedRef.sys_updated_by) || ''
                };
            } else {
                lMeta = _leftVersionData || {};
                ctrl.metaLeft = {
                    date:     _formatDate(lMeta.sys_created_on || '') || '',
                    dateFull: _formatDateFull(lMeta.sys_created_on || '') || '',
                    usn:      lMeta.update_set_name   || '',
                    uss:      lMeta.update_set_sys_id || '',
                    by:       lMeta.sys_created_by    || ''
                };
            }
            var rMeta = _rightVersionData;
            ctrl.metaRight = rMeta ? {
                date:     _formatDate(rMeta.sys_created_on || '') || '',
                dateFull: _formatDateFull(rMeta.sys_created_on || '') || '',
                usn:      rMeta.update_set_name   || '',
                uss:      rMeta.update_set_sys_id || '',
                by:       rMeta.sys_created_by    || ''
            } : ctrl.currentIsUnsaved ? {
                date:     'N/A',
                dateFull: '',
                usn:      'N/A',
                uss:      '',
                by:       'N/A'
            } : {
                date:     _formatDate(_currentDate) || '',
                dateFull: _formatDateFull(_currentDate) || '',
                usn:      _latestVerUsn,
                uss:      _latestVerUss,
                by:       (_recordData && _recordData.sys_updated_by) || ''
            };

            ctrl.currentMeta = {
                date:     _formatDate(_currentDate) || '',
                dateFull: _formatDateFull(_currentDate) || '',
                by:       (_recordData && _recordData.sys_updated_by) || '',
                usn:      _latestVerUsn,
                uss:      _latestVerUss
            };
            if (_savedRecordData) {
                ctrl.savedMeta = {
                    date:     _formatDate(_savedRecordData.sys_updated_on || '') || '',
                    dateFull: _formatDateFull(_savedRecordData.sys_updated_on || '') || '',
                    by:       _savedRecordData.sys_updated_by || '',
                    usn:      _latestVerUsn,
                    uss:      _latestVerUss
                };
            }
            ctrl.versionsData = _getVersionsList();
            ctrl.leftVersionOptions = ctrl.versionsData;
            ctrl.eligibleRightVersions = _getEligibleRightVersions();
            ctrl.leftVersionId         = _currentLeftId;
            ctrl.rightVersionId        = _currentRightId;
            var _writeRef = _savedRecordData || _recordData;
            ctrl.canWrite = !!(_writeRef && _writeRef.canWrite);
            ctrl.recordSysPolicy        = (_writeRef && _writeRef.sys_policy)         || '';
            ctrl.recordSysPolicyDisplay = (_writeRef && _writeRef.sys_policy_display) || '';

            // Update changed state on script fields
            ctrl.scriptFields.forEach(function(f) {
                var lc = (lf[f.key] || '').replace(/\r\n/g, '\n');
                var rc = (rf[f.key] || '').replace(/\r\n/g, '\n');
                f.changed = lc !== rc;
                f.counts  = f.changed ? _diffLineCounts(lc, rc) : null;
            });

            if (window.monaco) {
                var theme = _resolveMonacoTheme();
                if (theme === 'vs') {
                    monaco.editor.defineTheme('we-vs-light', {
                        base: 'vs',
                        inherit: true,
                        rules: [],
                        colors: {
                            // Softer line-level green (default ~12% opacity is fine; keep similar)
                            'diffEditor.insertedLineBackground': '#9bb95518',
                            // Softer char-level green — default is ~30% which is too strong in light mode
                            'diffEditor.insertedTextBackground': '#9bb95530',
                        },
                    });
                    monaco.editor.setTheme('we-vs-light');
                } else {
                    monaco.editor.setTheme('vs-dark');
                }
            }

            // Refresh any already-open diff editors
            for (var k in ctrl.editors) {
                if (!ctrl.editors.hasOwnProperty(k)) { continue; }
                var fDef  = ctrl.scriptFields[parseInt(k, 10)];
                var model = ctrl.editors[k].getModel();
                if (model && fDef) {
                    model.original.setValue(lf[fDef.key] || '');
                    model.modified.setValue(rf[fDef.key] || '');
                    ctrl.updateEditorHeight(parseInt(k, 10), false);
                }
            }

            // Compute extra (non-layout) changed fields
            if (_extraFieldDefs && _extraFieldDefs.length > 0) {
                var lfe = _leftIsCurrentSaved
                    ? _buildFields(null, _savedRef, _extraFieldDefs)
                    : _buildFields(_leftVersionData, _recordData, _extraFieldDefs);
                var rfe = _buildFields(_rightVersionData, _unsavedRef, _extraFieldDefs);
                ctrl.extraLeftFields  = lfe;
                ctrl.extraRightFields = rfe;
                ctrl.extraLeftDisplayFields  = _buildDisplayFields(lfe);
                ctrl.extraRightDisplayFields = _buildDisplayFields(rfe);
                ctrl.extraLeftRefDisplay = _leftIsCurrentSaved
                    ? _buildRefDisplay(null, _savedRef, _extraFieldDefs)
                    : _buildRefDisplay(_leftVersionData, _recordData, _extraFieldDefs);
                ctrl.extraRightRefDisplay = _buildRefDisplay(_rightVersionData, _unsavedRef, _extraFieldDefs);
                ctrl.extraLeftListDisplay = _leftIsCurrentSaved
                    ? _buildListDisplay(null, _savedRef, _extraFieldDefs)
                    : _buildListDisplay(_leftVersionData, _recordData, _extraFieldDefs);
                ctrl.extraRightListDisplay = _buildListDisplay(_rightVersionData, _unsavedRef, _extraFieldDefs);

                var extraSimple = [];
                var extraCode   = [];
                var extraFields = [];
                for (var ei = 0; ei < _extraFieldDefs.length; ei++) {
                    var eDef = _extraFieldDefs[ei];
                    var lv = (lfe[eDef.key] || '').replace(/\r\n/g, '\n');
                    var rv = (rfe[eDef.key] || '').replace(/\r\n/g, '\n');
                    if (lv === rv) { continue; }
                    if (eDef.renderAs === 'code' || eDef.type === 'html' || eDef.type === 'html_script') {
                        var extraScriptObj = {
                            isScript: true,
                            isExtra: true,
                            key: eDef.key,
                            label: eDef.label,
                            language: eDef.language || (eDef.type === 'html' || eDef.type === 'html_script' ? 'html' : 'plaintext'),
                            reference: eDef.reference,
                            counts: _diffLineCounts(lv, rv),
                            scriptIndex: extraCode.length
                        };
                        extraCode.push(extraScriptObj);
                        extraFields.push(extraScriptObj);
                    } else {
                        var extraSimpleObj = Object.assign({}, eDef);
                        extraSimpleObj.isScript = false;
                        extraSimpleObj.isExtra = true;
                        extraSimple.push(extraSimpleObj);
                        extraFields.push(extraSimpleObj);
                    }
                }
                ctrl.extraChangedSimpleFields = extraSimple;
                ctrl.extraChangedScriptFields = extraCode;
                ctrl.extraFields               = extraFields;

                // Refresh any already-open extra diff editors
                for (var ek in ctrl.extraEditors) {
                    if (!ctrl.extraEditors.hasOwnProperty(ek)) { continue; }
                    var efDef  = ctrl.extraChangedScriptFields[parseInt(ek, 10)];
                    var eModel = ctrl.extraEditors[ek].getModel();
                    if (eModel && efDef) {
                        eModel.original.setValue(lfe[efDef.key] || '');
                        eModel.modified.setValue(rfe[efDef.key] || '');
                        ctrl.updateEditorHeight(parseInt(ek, 10), true);
                    }
                }
            } else {
                ctrl.extraChangedSimpleFields = [];
                ctrl.extraChangedScriptFields = [];
                ctrl.extraFields               = [];
                ctrl.extraLeftFields         = {};
                ctrl.extraRightFields        = {};
                ctrl.extraLeftDisplayFields  = {};
                ctrl.extraRightDisplayFields = {};
                ctrl.extraLeftRefDisplay  = {};
                ctrl.extraRightRefDisplay = {};
            }

            _sortFields();

            // Refresh / auto-collapse the shared string diff editor when versions change
            if (ctrl.expandedString) {
                var _sk    = ctrl.expandedString.key;
                var _slMap = ctrl.expandedString.isExtra ? ctrl.extraLeftFields  : ctrl.leftFields;
                var _srMap = ctrl.expandedString.isExtra ? ctrl.extraRightFields : ctrl.rightFields;
                var _slv   = _slMap[_sk] || '';
                var _srv   = _srMap[_sk] || '';
                if (_slv === _srv || (_slv.length <= 100 && _srv.length <= 100)) {
                    ctrl.collapseStringExpanded();
                } else if (ctrl.stringEditor) {
                    var _sm = ctrl.stringEditor.getModel();
                    if (_sm) {
                        _sm.original.setValue(_slv);
                        _sm.modified.setValue(_srv);
                    }
                }
            }

            $timeout(_scheduleChangedBelowIndicatorUpdate, 0, false);
        }

        ctrl.canExportXml = function () {
            return !ctrl.loading && !ctrl.loadingLeft && !ctrl.loadingRight && !ctrl.errorMsg &&
                !ctrl.isSameVersionSelected() &&
                (_leftIsCurrentSaved || (!!_leftVersionData && _versionCache[ctrl.leftVersionId] === _leftVersionData)) &&
                (ctrl.rightVersionId === 'current' || (!!_rightVersionData && _versionCache[ctrl.rightVersionId] === _rightVersionData));
        };

        ctrl.exportXml = function () {
            if (!ctrl.canExportXml()) return;
            var doc = document.implementation.createDocument(null, 'context_bundle', null);
            doc.documentElement.setAttribute('format_version', '2');
            var notes = doc.createElement('format_notes');
            notes.textContent = 'Compare previous to current raw field values; added/removed means snapshot presence. A field with no change attribute could not be compared — redacted, structured, or the whole record is missing on one side (see its status/change_type). sys_mod_count is a per-record saved update counter, not a global version; unsaved edits do not increment it. ES12 is the current server-side override at export/load, not historical or client-side mode; not_found/unavailable may inherit application defaults. Record URLs identify platform records, not historical versions.';
            doc.documentElement.appendChild(notes);
            doc.documentElement.setAttribute('generated_at', new Date().toISOString());
            var primary = doc.createElement('primary_record');
            doc.documentElement.appendChild(primary);
            var record = doc.createElement('versioned_record');
            record.setAttribute('table', tableParam);
            record.setAttribute('sys_id', recordId);
            record.setAttribute('name', ctrl.recordName || recordId);
            var recordUrl = window.location.origin + '/nav_to.do?uri=' + encodeURIComponent(tableParam + '.do?sys_id=' + recordId);
            record.setAttribute('record_url', recordUrl);
            var es12Source = _savedRecordData || _recordData;
            record.setAttribute('es12_override_at_load', (es12Source && es12Source.es12_override) || 'unavailable');
            primary.appendChild(record);
            function appendVersion(tag, side, id, label, values, metadata) {
                var version = doc.createElement(tag);
                version.setAttribute('version_id', id || '');
                version.setAttribute('label', label || '');
                if (side === 'right' && id === 'current' && ctrl.currentIsUnsaved) version.setAttribute('unsaved', 'true');
                if (metadata) {
                    if (metadata.sys_created_on) version.setAttribute('recorded_on', metadata.sys_created_on);
                    if (metadata.sys_created_by) version.setAttribute('recorded_by', metadata.sys_created_by);
                    if (metadata.update_set_name) version.setAttribute('update_set_name', metadata.update_set_name);
                }
                var data = doc.createElement(tableParam);
                var modCount = values && values.sys_mod_count;
                if (modCount !== null && modCount !== undefined && /^[0-9]+$/.test(String(modCount))) {
                    data.setAttribute('sys_mod_count', String(modCount));
                } else {
                    data.setAttribute('sys_mod_count_status', 'unavailable');
                }
                Object.keys(values || {}).forEach(function (key) {
                    if (key === '_unsaved') return;
                    var field = doc.createElement(key);
                    if (values[key] === null || values[key] === undefined) field.setAttribute('nil', 'true');
                    else field.textContent = String(values[key]);
                    data.appendChild(field);
                });
                version.appendChild(data);
                record.appendChild(version);
                return data;
            }
            var previousRecord = appendVersion('previous_version', 'left', ctrl.leftVersionId, ctrl.leftLabel(), _exportLeftValues, _leftVersionData);
            var currentRecord = appendVersion('current_version', 'right', ctrl.rightVersionId, ctrl.rightLabel(), _exportRightValues, _rightVersionData);
            annotateFieldChanges(previousRecord, currentRecord, false);
            var blob = new Blob([new XMLSerializer().serializeToString(doc)], { type: 'application/xml' });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = 'diff-' + tableParam + '-' + recordId + '.xml';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };

        ctrl.revertToLeft = function() {
            var sysId = ctrl.leftVersionId;
            if (!sysId || sysId === 'current_saved') { return; }
            try { localStorage.setItem('_weRevertPending_' + recordId, Date.now().toString()); } catch(e) {}
            var gdw = new GlideModal('revert_update_version_confirm', true, 300);
            gdw.setTitle('Revert');
            gdw.setPreference('sysparm_sys_id', sysId);
            gdw.setPreference('focusTrap', true);
            gdw.render();
        };

        function _onLoaded() {
            _pending--;
            if (_pending > 0) { return; }
            _apply(function() {
                ctrl.loading = false;
                if (_errors.length > 0) {
                    ctrl.errorMsg = _errors.join(' | ');
                    return;
                }
                if (ctrl.tableNoVersions || ctrl.noRecordSelected) { return; }
                if (_tableHasNoTracking) {
                    if (_allVersionsData.length === 0) {
                        ctrl.tableNoVersions = true;
                        return;
                    }
                    if (!_fieldDefs && _leftVersionData && _leftVersionData.fields) {
                        var derivedSimple = [];
                        var fields = [];
                        for (var _dk in _leftVersionData.fields) {
                            if (_leftVersionData.fields.hasOwnProperty(_dk)) {
                                var fdObj = { key: _dk, label: _dk, renderAs: 'text', reference: '', changed: false, counts: null };
                                derivedSimple.push(fdObj);
                                var fdCopy = Object.assign({}, fdObj);
                                fdCopy.isScript = false;
                                fdCopy.isExtra = false;
                                fields.push(fdCopy);
                            }
                        }
                        _fieldDefs = derivedSimple;
                        _extraFieldDefs = [];
                        ctrl.simpleFields = derivedSimple;
                        ctrl.scriptFields = [];
                        ctrl.rawFields    = fields;
                        ctrl.fields       = fields.slice();
                        _sortFields();
                    }
                }
                if (!_recordData) {
                    ctrl.recordNotFound = true;
                    var _notFoundSuffix = ctrl.tableLabel ? ' (' + ctrl.tableLabel + ')' : '';
                    document.title = 'Compare: Record not found' + _notFoundSuffix + ' - ' + SITE_TITLE;
                    _syncHistoryEntry('Record not found' + _notFoundSuffix);
                    return;
                }
                if (!_fieldDefs) {
                    ctrl.errorMsg = 'Failed to load field definitions for table: ' + tableParam;
                    return;
                }
                if (!_leftVersionData && !_leftIsCurrentSaved) {
                    if (_allVersionsData.length === 0) {
                        ctrl.noVersions = true;
                        ctrl.recordName = _recordData.name || '(Unnamed)';
                        var _noVerSuffix = ctrl.tableLabel ? ' (' + ctrl.tableLabel + ')' : '';
                        document.title = 'Compare: ' + ctrl.recordName + _noVerSuffix + ' - ' + SITE_TITLE;
                        _syncHistoryEntry(ctrl.recordName + _noVerSuffix);
                        return;
                    }
                    ctrl.errorMsg = 'Version load failed (record_id: ' + recordId + ')';
                    return;
                }
                // When both versions explicitly provided, ensure older → left, newer → right
                if (version1Id && version2Id && _leftVersionData && _rightVersionData) {
                    if ((_leftVersionData.sys_created_on || '') > (_rightVersionData.sys_created_on || '')) {
                        var _tmpData       = _leftVersionData;
                        _leftVersionData   = _rightVersionData;
                        _rightVersionData  = _tmpData;
                        var _tmpId         = _currentLeftId;
                        _currentLeftId     = _currentRightId;
                        _currentRightId    = _tmpId;
                    }
                }
                _syncScope();
            });
        }

        function _loadAndSwitch(side, sysId) {
            if (sysId === 'current') {
                _rightVersionData   = null;
                ctrl.loadingRight   = false;
                _validateRightSelection();
                _syncScope();
                return;
            }
            if (_versionCache[sysId]) {
                if (side === 'left') {
                    _leftVersionData  = _versionCache[sysId];
                    ctrl.loadingLeft  = false;
                } else {
                    _rightVersionData = _versionCache[sysId];
                    ctrl.loadingRight = false;
                }
                _validateRightSelection();
                _syncScope();
                return;
            }
            if (side === 'left') {
                ctrl.loadingLeft  = true;
            } else {
                ctrl.loadingRight = true;
            }

            _ajax('getVersionForTable', { version_id: sysId }, function(data) {
                if (side === 'left'  && _currentLeftId  !== sysId) { return; }
                if (side === 'right' && _currentRightId !== sysId) { return; }
                if (data.success) {
                    _versionCache[sysId] = data;
                    if (side === 'left') {
                        _leftVersionData  = data;
                    } else {
                        _rightVersionData = data;
                    }
                }
                _apply(function() {
                    if (side === 'left') {
                        ctrl.loadingLeft  = false;
                    } else {
                        ctrl.loadingRight = false;
                    }
                    _validateRightSelection();
                    _syncScope();
                });
            });
        }

        //////// Expand / collapse //////////////////////////////////////////////

        function _headerHeight() {
            var h = document.querySelector('.dc-header');
            if (!h) { return 0; }
            return Math.ceil(h.getBoundingClientRect().bottom);
        }

        function _getEditorElements(index, isExtra) {
            var sectionPrefix = isExtra ? '#da-extra-' : '#da-';
            var editorPrefix = isExtra ? 'da-ex-ed-' : 'da-ed-';
            var wrap = document.querySelector(sectionPrefix + index + ' .da-editor-wrap');
            return {
                wrap: wrap,
                outer: wrap ? wrap.querySelector('.da-editor-canvas-outer') : null,
                container: document.getElementById(editorPrefix + index)
            };
        }

        function _setWrapTop(index, isExtra) {
            var elements = _getEditorElements(index, isExtra);
            if (!elements.wrap) { return; }
            var top = _headerHeight();
            var height = window.innerHeight - top;
            elements.wrap.style.top = top + 'px';
            elements.wrap.style.height = height + 'px';
            if (elements.outer) { elements.outer.style.height = height + 'px'; }
            if (elements.container) { elements.container.style.height = '100%'; }
        }

        function _clearWrapTop(index, isExtra) {
            var elements = _getEditorElements(index, isExtra);
            var wrap = elements.wrap;
            if (!wrap) { return; }
            wrap.style.top    = '';
            wrap.style.height = '';
            if (elements.outer) { elements.outer.style.height = ''; }
            ctrl.updateEditorHeight(index, isExtra);
        }

        ctrl.updateEditorHeight = function(index, isExtra) {
            var fDef = isExtra ? ctrl.extraChangedScriptFields[index] : ctrl.scriptFields[index];
            var prefix = isExtra ? 'da-ex-ed-' : 'da-ed-';
            var idPrefix = isExtra ? '#da-extra-' : '#da-';
            var editor = isExtra ? ctrl.extraEditors[index] : ctrl.editors[index];
            var container = document.getElementById(prefix + index);
            if (!editor || !container || !fDef) { return; }

            var model = editor.getModel();
            if (!model) { return; }

            var lines = Math.max(model.original.getLineCount(), model.modified.getLineCount());
            var linesToShow = Math.max(1, Math.min(10, lines));
            var lineHeight = editor.getOriginalEditor().getOption(monaco.editor.EditorOption.lineHeight) || 19;
            var calculatedHeight = Math.max(34, (linesToShow * lineHeight) + 8);

            if ((isExtra ? ctrl.expandedExtraIndex : ctrl.expandedIndex) !== index) {
                var wrap = document.querySelector(idPrefix + index + ' .da-editor-wrap');
                var outer = container.parentElement;
                if (wrap) { wrap.style.height = calculatedHeight + 'px'; }
                if (outer) { outer.style.height = calculatedHeight + 'px'; }
                container.style.height = calculatedHeight + 'px';
                editor.layout();
            }
        };

        function _scrollAccordionIntoView(index) {
            var details = document.getElementById('da-' + index);
            if (!details) { return; }
            var margin = 8;
            var headerBottom = _headerHeight();
            var viewportTop = headerBottom + margin;
            var viewportBottom = window.innerHeight - margin;
            var rect = details.getBoundingClientRect();
            var currentY = window.pageYOffset || document.documentElement.scrollTop || 0;
            var targetY = currentY;
            var accordionHeight = rect.height;
            var viewportHeight = Math.max(0, viewportBottom - viewportTop);
            if (accordionHeight <= viewportHeight) {
                if (rect.top < viewportTop) {
                    targetY = currentY + (rect.top - viewportTop);
                } else if (rect.bottom > viewportBottom) {
                    targetY = currentY + (rect.bottom - viewportBottom);
                }
            } else {
                targetY = currentY + (rect.top - viewportTop);
            }
            var maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            targetY = Math.max(0, Math.min(Math.round(targetY), maxY));
            if (Math.abs(targetY - currentY) > 1) {
                window.scrollTo({ top: targetY, behavior: 'smooth' });
            }
        }

        function _notifyParentExpand(fieldLabel) {
            try {
                if (window.parent !== window) {
                    window.parent.postMessage({ type: 'we-diff-expand', fieldLabel: fieldLabel || null }, '*');
                }
            } catch(e) {}
        }

        ctrl.toggleExpand = function(index, event) {
            if (event) { event.stopPropagation(); }
            if (ctrl.expandedExtraIndex !== null) { ctrl.collapseExtraExpanded(); }

            var wasExpanded = ctrl.expandedIndex === index;
            var prevIndex   = ctrl.expandedIndex;
            ctrl.expandedIndex = wasExpanded ? null : index;

            if (!wasExpanded) {
                var _f = ctrl.scriptFields[index];
                _notifyParentExpand(_f ? _f.label : '');
            } else {
                _notifyParentExpand(null);
            }

            $timeout(function() {
                if (!wasExpanded) {
                    _setWrapTop(index, false);
                } else {
                    _clearWrapTop(index, false);
                }
                if (ctrl.editors[index]) { ctrl.editors[index].layout(); }
                if (prevIndex !== null && prevIndex !== index) {
                    _clearWrapTop(prevIndex, false);
                    if (ctrl.editors[prevIndex]) { ctrl.editors[prevIndex].layout(); }
                }
                if (!wasExpanded) {
                    _scrollAccordionIntoView(index);
                }
                _scheduleChangedBelowIndicatorUpdate();
            }, 10);
        };

        ctrl.toggleExtraExpand = function(index, event) {
            if (event) { event.stopPropagation(); }
            if (ctrl.expandedIndex !== null) { ctrl.collapseExpanded(); }

            var wasExpanded = ctrl.expandedExtraIndex === index;
            var prevIndex   = ctrl.expandedExtraIndex;
            ctrl.expandedExtraIndex = wasExpanded ? null : index;

            if (!wasExpanded) {
                var _f = ctrl.extraChangedScriptFields[index];
                _notifyParentExpand(_f ? _f.label : '');
            } else {
                _notifyParentExpand(null);
            }

            $timeout(function() {
                if (!wasExpanded) {
                    _setWrapTop(index, true);
                } else {
                    _clearWrapTop(index, true);
                }
                if (ctrl.extraEditors[index]) { ctrl.extraEditors[index].layout(); }
                if (prevIndex !== null && prevIndex !== index) {
                    _clearWrapTop(prevIndex, true);
                    if (ctrl.extraEditors[prevIndex]) { ctrl.extraEditors[prevIndex].layout(); }
                }
                _scheduleChangedBelowIndicatorUpdate();
            }, 10);
        };

        ctrl.collapseExtraExpanded = function() {
            var idx = ctrl.expandedExtraIndex;
            if (idx === null) { return; }
            ctrl.expandedExtraIndex = null;
            _clearWrapTop(idx, true);
            $timeout(function() {
                if (ctrl.extraEditors[idx]) { ctrl.extraEditors[idx].layout(); }
                _scheduleChangedBelowIndicatorUpdate();
            }, 0);
            _notifyParentExpand(null);
        };

        ctrl.scrollAccordionIntoView = function(index) {
            _scrollAccordionIntoView(index);
        };

        ctrl.collapseExpanded = function() {
            var idx = ctrl.expandedIndex;
            if (idx === null) { return; }
            ctrl.expandedIndex = null;
            _clearWrapTop(idx, false);
            $timeout(function() {
                if (ctrl.editors[idx]) { ctrl.editors[idx].layout(); }
                _scheduleChangedBelowIndicatorUpdate();
            }, 0);
            _notifyParentExpand(null);
        };

        function _setStringOverlayTop() {
            var wrap = document.querySelector('.sft-string-overlay');
            if (!wrap) { return; }
            var top = _headerHeight();
            wrap.style.top    = top + 'px';
            wrap.style.height = (window.innerHeight - top) + 'px';
        }

        ctrl.shouldShowStringExpand = function(f, isExtra) {
            if (!f) { return false; }
            var ra = f.renderAs;
            if (ra === 'boolean' || ra === 'reference' || ra === 'choice' || ra === 'image' || ra === 'list') {
                return false;
            }
            var lv, rv;
            if (isExtra) {
                lv = ctrl.extraLeftFields[f.key]  || '';
                rv = ctrl.extraRightFields[f.key] || '';
            } else {
                lv = ctrl.leftFields[f.key]  || '';
                rv = ctrl.rightFields[f.key] || '';
            }
            // Normalize line endings so CRLF vs LF differences don't count
            var lvn = lv.replace(/\r\n/g, '\n');
            var rvn = rv.replace(/\r\n/g, '\n');
            if (lvn === rvn) { return false; }
            return lvn.length > 100 || rvn.length > 100;
        };

        ctrl.initStringEditor = function() {
            if (!ctrl.expandedString) { return; }
            var container = document.getElementById('sft-string-editor');
            if (!window.monaco || !container) {
                if (container) {
                    container.innerHTML = '<div class="da-no-monaco">Monaco editor is not available. Keep the Widget Editor tab open and try again.</div>';
                }
                return;
            }
            _ensureMonacoWorker();
            _setupLanguageServices();
            var key = ctrl.expandedString.key;
            var lang = _langForEditor(ctrl.expandedString.language);
            var lf  = ctrl.expandedString.isExtra ? ctrl.extraLeftFields  : ctrl.leftFields;
            var rf  = ctrl.expandedString.isExtra ? ctrl.extraRightFields : ctrl.rightFields;
            if (ctrl.stringEditor) {
                var model = ctrl.stringEditor.getModel();
                if (model) {
                    monaco.editor.setModelLanguage(model.original, lang);
                    monaco.editor.setModelLanguage(model.modified, lang);
                    model.original.setValue(lf[key] || '');
                    model.modified.setValue(rf[key] || '');
                }
                ctrl.stringEditor.layout();
                return;
            }
            var diffEditor = monaco.editor.createDiffEditor(container, {
                automaticLayout: true,
                enableSplitViewResizing: true,
                readOnly: true,
                scrollBeyondLastLine: false,
                wordWrap: ctrl.wordWrap ? 'on' : 'off'
            });
            diffEditor.setModel({
                original: monaco.editor.createModel(lf[key] || '', lang),
                modified: monaco.editor.createModel(rf[key] || '', lang)
            });
            ctrl.stringEditor = diffEditor;
        };

        ctrl.toggleStringExpand = function(f, isExtra, event) {
            if (event) { event.stopPropagation(); }
            var sameOpen = !!(ctrl.expandedString
                && ctrl.expandedString.key === f.key
                && ctrl.expandedString.isExtra === isExtra);
            if (sameOpen) {
                ctrl.collapseStringExpanded();
                return;
            }
            // Collapse any open code-field expansion first
            if (ctrl.expandedIndex !== null) { ctrl.collapseExpanded(); }
            ctrl.expandedString = { key: f.key, label: f.label, isExtra: !!isExtra, language: f.language || 'plaintext' };
            _notifyParentExpand(f.label || '');
            $timeout(function() {
                _setStringOverlayTop();
                ctrl.initStringEditor();
                _scheduleChangedBelowIndicatorUpdate();
            }, 10);
        };

        ctrl.collapseStringExpanded = function() {
            if (!ctrl.expandedString) { return; }
            ctrl.expandedString = null;
            if (ctrl.stringEditor) {
                try { ctrl.stringEditor.dispose(); } catch(e) {}
                ctrl.stringEditor = null;
            }
            _notifyParentExpand(null);
            $timeout(function() { _scheduleChangedBelowIndicatorUpdate(); }, 0);
        };

        ctrl.collapseAnyExpanded = function() {
            if (ctrl.expandedIndex !== null)      { ctrl.collapseExpanded(); }
            if (ctrl.expandedExtraIndex !== null) { ctrl.collapseExtraExpanded(); }
            if (ctrl.expandedString)              { ctrl.collapseStringExpanded(); }
        };

        ctrl.expandedFieldLabel = function() {
            if (ctrl.expandedIndex !== null) {
                var f = ctrl.scriptFields[ctrl.expandedIndex];
                return f ? (ctrl.recordName + ' — ' + f.label) : ctrl.recordName;
            }
            if (ctrl.expandedExtraIndex !== null) {
                var fx = ctrl.extraChangedScriptFields[ctrl.expandedExtraIndex];
                return fx ? (ctrl.recordName + ' — ' + fx.label) : ctrl.recordName;
            }
            if (ctrl.expandedString) {
                return ctrl.recordName + ' — ' + ctrl.expandedString.label;
            }
            return '';
        };

        var _onWindowResize = function() {
            if (ctrl.expandedIndex !== null) {
                _setWrapTop(ctrl.expandedIndex, false);
                if (ctrl.editors[ctrl.expandedIndex]) {
                    ctrl.editors[ctrl.expandedIndex].layout();
                }
            }
            if (ctrl.expandedExtraIndex !== null) {
                _setWrapTop(ctrl.expandedExtraIndex, true);
                if (ctrl.extraEditors[ctrl.expandedExtraIndex]) {
                    ctrl.extraEditors[ctrl.expandedExtraIndex].layout();
                }
            }
            if (ctrl.expandedString) {
                _setStringOverlayTop();
                if (ctrl.stringEditor) { ctrl.stringEditor.layout(); }
            }
            _scheduleChangedBelowIndicatorUpdate();
        };
        window.addEventListener('resize', _onWindowResize);
        var _onWindowScroll = function() {
            _scheduleChangedBelowIndicatorUpdate();
        };
        window.addEventListener('scroll', _onWindowScroll, { passive: true });
        var _onWindowKeydown = function(e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                if (ctrl.expandedIndex !== null || ctrl.expandedExtraIndex !== null || ctrl.expandedString) {
                    $scope.$apply(function() {
                        ctrl.collapseAnyExpanded();
                    });
                }
            }
        };
        window.addEventListener('keydown', _onWindowKeydown);
        $scope.$on('$destroy', function() {
            window.removeEventListener('resize', _onWindowResize);
            window.removeEventListener('scroll', _onWindowScroll);
            window.removeEventListener('keydown', _onWindowKeydown);
            if (_changedBelowRaf) {
                window.cancelAnimationFrame(_changedBelowRaf);
                _changedBelowRaf = null;
            }
            if (ctrl.stringEditor) {
                try { ctrl.stringEditor.dispose(); } catch(e) {}
                ctrl.stringEditor = null;
            }
        });

        var _onParentMessage = function(e) {
            if (!e.data || e.data.type !== 'we-diff-collapse') { return; }
            $scope.$apply(function() { ctrl.collapseAnyExpanded(); });
        };
        window.addEventListener('message', _onParentMessage);
        $scope.$on('$destroy', function() { window.removeEventListener('message', _onParentMessage); });

        //////// Initial data load ///////////////////////////////////////////////

        _ajax('getUserPrefs', {}, function(data) {
            if (data.success && data.value) {
                try {
                    var p = JSON.parse(data.value) || {};
                    _cachedUserPrefs = Object.assign(p, _cachedUserPrefs);
                    if (_cachedUserPrefs.hasOwnProperty('wordWrap')) { ctrl.wordWrap = !!_cachedUserPrefs.wordWrap; }
                    if (_cachedUserPrefs.hasOwnProperty('showChangedFieldsFirst')) {
                        _apply(function() {
                            ctrl.showChangedFieldsFirst = !!_cachedUserPrefs.showChangedFieldsFirst;
                            _sortFields();
                        });
                    }
                } catch(e) {}
            }
        });

        if (!recordId && !daToken) {
            ctrl.noRecordSelected = true;
            _pending++;
            _ajax('getDiffFieldDefs', { table: tableParam }, function(data) {
                if (data.success) {
                    _apply(function() { ctrl.tableLabel = data.table_label || ''; });
                } else if (data.error === 'Table does not track versions') {
                    _apply(function() { ctrl.tableNoVersions = true; ctrl.tableLabel = data.table_label || ''; });
                } else {
                    _errors.push(data.error || 'Field definitions load failed');
                }
                _onLoaded();
            });
        } else {
            _pending++;
            _ajax('getDiffFieldDefs', { table: tableParam }, function(data) {
                if (data.success && data.fields && data.fields.length > 0) {
                    _fieldDefs      = data.fields;
                    _extraFieldDefs = data.extra_fields || [];
                    // Partition into simple fields and script/code fields, keeping overall order
                    var simple = [];
                    var code   = [];
                    var fields = [];
                    for (var i = 0; i < data.fields.length; i++) {
                        var fd = data.fields[i];
                        if (fd.renderAs === 'code' || fd.type === 'html' || fd.type === 'html_script') {
                            var scriptObj = {
                                isScript: true,
                                isExtra: false,
                                key: fd.key,
                                label: fd.label,
                                language: fd.language || (fd.type === 'html' || fd.type === 'html_script' ? 'html' : 'plaintext'),
                                reference: fd.reference,
                                changed: false,
                                counts: null,
                                scriptIndex: code.length
                            };
                            code.push(scriptObj);
                            fields.push(scriptObj);
                        } else {
                            var simpleObj = Object.assign({}, fd);
                            simpleObj.isScript = false;
                            simpleObj.isExtra = false;
                            simple.push(simpleObj);
                            fields.push(simpleObj);
                        }
                    }
                    _apply(function() {
                        ctrl.simpleFields = simple;
                        ctrl.scriptFields = code;
                        ctrl.rawFields    = fields;
                        ctrl.fields       = fields.slice();
                        _sortFields();
                        ctrl.tableLabel   = data.table_label || '';
                    });
                } else if (data.error === 'Table does not track versions') {
                    _tableHasNoTracking = true;
                    _apply(function() { ctrl.tableLabel = data.table_label || ''; });
                } else {
                    _errors.push(data.error || 'Field definitions load failed');
                }
                _onLoaded();
            });

            // Load current record state
            var _openerSnap = null;
            if (daToken) {
                try {
                    var _lsVal = localStorage.getItem('_weDiffSnap_' + daToken);
                    if (_lsVal) {
                        _openerSnap = JSON.parse(_lsVal);
                        localStorage.removeItem('_weDiffSnap_' + daToken);
                    }
                } catch (e) {}
            }

            if (_openerSnap) {
                var isNewSnapshot = !!_openerSnap._newRecord && !recordId;
                delete _openerSnap._newRecord;
                _recordData = {
                    sys_id:         recordId,
                    name:           _openerSnap.name || _openerSnap.id || '',
                    sys_updated_on: _openerSnap.sys_updated_on || '',
                    sys_updated_by: _openerSnap.sys_updated_by || '',
                    canWrite:       false,
                    sys_policy:     '',
                    sys_policy_display: '',
                    update_set_sys_id: '',
                    update_set_name: '',
                    values: _openerSnap
                };
                ctrl.currentIsUnsaved = !!_openerSnap._unsaved;
                if (isNewSnapshot) {
                    _savedRecordData = { values: {}, canWrite: false };
                } else if (_openerSnap._unsaved) {
                    _pending++;
                    _ajax('getRecordForDiff', { table: tableParam, record_id: recordId }, function(data) {
                        if (data.success && data.record) {
                            _savedRecordData = data.record;
                        }
                        _onLoaded();
                    });
                }
            } else {
                _pending++;
                _ajax('getRecordForDiff', { table: tableParam, record_id: recordId }, function(data) {
                    if (data.success && data.record) {
                        _recordData = data.record;
                    }
                    _onLoaded();
                });
            }

            _pending++;
            _ajax('getVersionsForTable', { table: tableParam, record_id: recordId }, function(data) {
                if (data.success && data.versions) {
                    _allVersionsData = data.versions;
                }
                if (!version1Id) {
                    if (_openerSnap && _openerSnap._unsaved) {
                        _leftIsCurrentSaved = true;
                        _currentLeftId      = 'current_saved';
                        ctrl.leftVersionId  = 'current_saved';
                    } else if (_allVersionsData.length > 0) {
                        var autoIdx = _allVersionsData.length > 1 ? 1 : 0;
                        var autoId  = _allVersionsData[autoIdx].sys_id;
                        _currentLeftId     = autoId;
                        ctrl.leftVersionId = autoId;
                        _pending++;
                        _ajax('getVersionForTable', { version_id: autoId }, function(vd) {
                            if (vd.success) {
                                _leftVersionData = vd;
                                _versionCache[autoId] = vd;
                            } else {
                                _errors.push('Version load failed: ' + (vd.error || 'no detail'));
                            }
                            _onLoaded();
                        });
                    }
                }
                _onLoaded();
            });

            // Load explicit version_1
            if (version1Id) {
                _pending++;
                _ajax('getVersionForTable', { version_id: version1Id }, function(data) {
                    if (data.success) {
                        _leftVersionData = data;
                        _versionCache[version1Id] = data;
                    } else {
                        _errors.push('Version 1 load failed: ' + (data.error || 'no detail'));
                    }
                    _onLoaded();
                });

                // Load explicit version_2
                if (version2Id) {
                    _pending++;
                    _ajax('getVersionForTable', { version_id: version2Id }, function(data) {
                        if (data.success) {
                            _rightVersionData = data;
                            _versionCache[version2Id] = data;
                        }
                        _onLoaded();
                    });
                }
            }
        }

        //////// Exposed methods /////////////////////////////////////////////////

        // Resolve the 'current' sentinel to the actual sys_id of the current-state version.
        function _resolveVersionId(vId) {
            if (vId !== 'current') { return vId; }
            for (var i = 0; i < _allVersionsData.length; i++) {
                if (_allVersionsData[i].state === 'current') {
                    return _allVersionsData[i].sys_id;
                }
            }
            return vId;
        }

        ctrl.isSameVersionSelected = function() {
            var l = _resolveVersionId(ctrl.leftVersionId);
            var r = _resolveVersionId(ctrl.rightVersionId);
            return !!(l && r && l === r);
        };

        ctrl.isChanged = function(key) {
            var l = (ctrl.leftFields[key]  || '').replace(/\r\n/g, '\n');
            var r = (ctrl.rightFields[key] || '').replace(/\r\n/g, '\n');
            return l !== r;
        };

        ctrl.boolValClass = function(value) {
            return value === 'true' ? 'sft-bool-icon--true' : 'sft-bool-icon--false';
        };

        // Build a /nav_to.do URL that opens the referenced record in a new tab.
        ctrl.getReferenceUrl = function(f, side) {
            var val = side === 'left' ? ctrl.leftFields[f.key] : ctrl.rightFields[f.key];
            if (!val || !f.reference) { return '#'; }
            return '/nav_to.do?uri=' + encodeURIComponent(f.reference + '.do?sys_id=' + val);
        };

        ctrl.getExtraReferenceUrl = function(f, side) {
            var val = side === 'left' ? ctrl.extraLeftFields[f.key] : ctrl.extraRightFields[f.key];
            if (!val || !f.reference) { return '#'; }
            return '/nav_to.do?uri=' + encodeURIComponent(f.reference + '.do?sys_id=' + val);
        };

        ctrl.versionOptionLabel = function(v) {
            var label = _formatDate(v.sys_created_on);
            if (v.sys_created_by) {
                label += ' \u00b7 ' + v.sys_created_by;
            }
            if (v.update_set_name) {
                label += ' (' + v.update_set_name + ')';
            }
            return label || 'Version';
        };

        ctrl.formatDate     = function(isoStr) { return _formatDate(isoStr); };
        ctrl.formatDateFull = function(isoStr) { return _formatDateFull(isoStr); };

        ctrl.leftLabel = function() {
            if (ctrl.leftVersionId === 'current_saved') {
                if (ctrl.savedMeta.date) {
                    return ctrl.savedMeta.date + ' (Current)';
                }
                return 'Current (saved)';
            }
            var v = (ctrl.versionsData || []).filter(function(x) { return x.sys_id === ctrl.leftVersionId; })[0];
            if (!v) { return 'Select version'; }
            var label = _formatDate(v.sys_created_on);
            if (v.update_set_name) { label += ' (' + v.update_set_name + ')'; }
            return label || 'Version';
        };

        ctrl.rightLabel = function() {
            if (!ctrl.rightVersionId || ctrl.rightVersionId === 'current') {
                if (ctrl.currentIsUnsaved) { return '(Unsaved)'; }
                var label = ctrl.currentMeta.date || '';
                return label + ' (Current)';
            }
            var v = (ctrl.versionsData || []).filter(function(x) { return x.sys_id === ctrl.rightVersionId; })[0];
            return v ? ctrl.versionOptionLabel(v) : 'Select version';
        };

        ctrl.toggleVersionCol = function(side) {
            ctrl.openVersionCol = ctrl.openVersionCol === side ? null : side;
        };

        ctrl.selectLeftVersion = function(sysId) {
            ctrl.openVersionCol = null;
            if (sysId === ctrl.leftVersionId) { return; }
            ctrl.leftVersionId = sysId;
            if (sysId === 'current_saved') {
                _leftIsCurrentSaved = true;
                _leftVersionData    = null;
                _currentLeftId      = 'current_saved';
                _validateRightSelection();
                _apply(function() { _syncScope(); });
            } else {
                _leftIsCurrentSaved = false;
                ctrl.onLeftVersionChange();
            }
        };

        ctrl.selectRightVersion = function(sysId) {
            ctrl.openVersionCol = null;
            if (sysId === ctrl.rightVersionId) { return; }
            ctrl.rightVersionId = sysId;
            ctrl.onRightVersionChange();
        };

        $document[0].addEventListener('click', function() {
            if (ctrl.openVersionCol !== null) {
                $scope.$apply(function() { ctrl.openVersionCol = null; });
            }
        });

        ctrl.platformUrl = '/nav_to.do?uri=' + encodeURIComponent(tableParam + '.do?sys_id=' + recordId);

        ctrl.hasWidgetEditorOpener = (function() {
            try { return !!(window.top.opener && !window.top.opener.closed); } catch(e) { return false; }
        })();
        ctrl.isEmbedded  = isEmbedded;
        ctrl.isFromList  = isFromList;

        ctrl.openWidgetEditorNew = function() {
            var url = _navUrl(widgetEditorSysId, 'widget_editor', { widget_id: recordId });
            window.open(url, '_blank');
            try { window.top.close(); } catch(e) {}
        };

        ctrl.goToWidgetEditor = function() {
            if (isFromList) {
                try { window.top.close(); } catch(e) {}
                return;
            }
            try {
                var topOpener = window.top.opener;
                if (topOpener && !topOpener.closed) {
                    topOpener.top.focus();
                    window.top.close();
                    return;
                }
            } catch (e) {}
            var url = _navUrl(widgetEditorSysId, 'widget_editor', { widget_id: recordId });
            window.top.location.href = url;
        };

        ctrl.onLeftVersionChange = function() {
            if (ctrl.leftVersionId === _currentRightId) {
                ctrl.leftVersionId = _currentLeftId;
                return;
            }
            _currentLeftId = ctrl.leftVersionId;
            _loadAndSwitch('left', _currentLeftId);
        };

        ctrl.onRightVersionChange = function() {
            if (ctrl.rightVersionId !== 'current' && ctrl.rightVersionId === _currentLeftId) {
                ctrl.rightVersionId = _currentRightId;
                return;
            }
            _currentRightId = ctrl.rightVersionId;
            _loadAndSwitch('right', _currentRightId);
        };

        ctrl.initEditor = function(index) {
            if (ctrl.editors[index]) {
                ctrl.editors[index].layout();
                return;
            }
            var fDef      = ctrl.scriptFields[index];
            var container = document.getElementById('da-ed-' + index);
            if (!window.monaco || !container) {
                if (container) {
                    container.innerHTML = '<div class="da-no-monaco">Monaco editor is not available. Keep the Widget Editor tab open and try again.</div>';
                }
                return;
            }
            _ensureMonacoWorker();
            _setupLanguageServices();
            var diffEditor = monaco.editor.createDiffEditor(container, {
                automaticLayout: true,
                enableSplitViewResizing: true,
                readOnly: true,
                scrollBeyondLastLine: false,
                wordWrap: ctrl.wordWrap ? 'on' : 'off',
                minimap: { enabled: false }
            });
            diffEditor.setModel({
                original: monaco.editor.createModel(ctrl.leftFields[fDef.key]  || '', _langForEditor(fDef.language)),
                modified: monaco.editor.createModel(ctrl.rightFields[fDef.key] || '', _langForEditor(fDef.language))
            });
            diffEditor.onDidUpdateDiff(function() {
                var counts = _countsFromLineChanges(diffEditor.getLineChanges());
                _apply(function() {
                    var f = ctrl.scriptFields[index];
                    if (f) { f.counts = counts; }
                });
            });
            ctrl.editors[index] = diffEditor;
            $timeout(function() {
                ctrl.updateEditorHeight(index, false);
            }, 50);
        };

        ctrl.initExtraEditor = function(index) {
            if (ctrl.extraEditors[index]) {
                ctrl.extraEditors[index].layout();
                return;
            }
            var fDef      = ctrl.extraChangedScriptFields[index];
            var container = document.getElementById('da-ex-ed-' + index);
            if (!window.monaco || !container) {
                if (container) {
                    container.innerHTML = '<div class="da-no-monaco">Monaco editor is not available. Keep the Widget Editor tab open and try again.</div>';
                }
                return;
            }
            _ensureMonacoWorker();
            _setupLanguageServices();
            var diffEditor = monaco.editor.createDiffEditor(container, {
                automaticLayout: true,
                enableSplitViewResizing: true,
                readOnly: true,
                scrollBeyondLastLine: false,
                wordWrap: ctrl.wordWrap ? 'on' : 'off',
                minimap: { enabled: false }
            });
            diffEditor.setModel({
                original: monaco.editor.createModel(ctrl.extraLeftFields[fDef.key]  || '', _langForEditor(fDef.language)),
                modified: monaco.editor.createModel(ctrl.extraRightFields[fDef.key] || '', _langForEditor(fDef.language))
            });
            diffEditor.onDidUpdateDiff(function() {
                var counts = _countsFromLineChanges(diffEditor.getLineChanges());
                _apply(function() {
                    var f = ctrl.extraChangedScriptFields[index];
                    if (f) { f.counts = counts; }
                });
            });
            ctrl.extraEditors[index] = diffEditor;
            $timeout(function() {
                ctrl.updateEditorHeight(index, true);
            }, 50);
        };

        function _parseEncodedQuery(query, labels) {
            if (!query) { return []; }
            var parts = query.split('^');
            var conditions = [];
            
            var OPERATORS = {
                '=': 'is',
                '!=': 'is not',
                'STARTSWITH': 'starts with',
                'ENDSWITH': 'ends with',
                'LIKE': 'contains',
                'NOT LIKE': 'does not contain',
                '>=': 'greater than or equal to',
                '<=': 'less than or equal to',
                '>': 'greater than',
                '<': 'less than',
                'ISEMPTY': 'is empty',
                'ISNOTEMPTY': 'is not empty',
                'ANYTHING': 'is anything',
                'VALCHANGES': 'changes',
                'CHANGESFROM': 'changes from',
                'CHANGESTO': 'changes to',
                'IN': 'is one of',
                'NOT IN': 'is not one of',
                'INSTANCEOF': 'instance of',
                'ON': 'on',
                'NOTON': 'not on'
            };
            
            var opKeys = Object.keys(OPERATORS).sort(function(a, b) {
                return b.length - a.length;
            });
            
            for (var i = 0; i < parts.length; i++) {
                var part = parts[i];
                if (!part || part === 'EQ') { continue; }
                
                var isOr = false;
                if (part.indexOf('OR') === 0) {
                    isOr = true;
                    part = part.substring(2);
                }
                
                var isNewQueryGroup = false;
                if (part.indexOf('NQ') === 0) {
                    isNewQueryGroup = (conditions.length > 0);
                    part = part.substring(2);
                }
                
                var matchedOp = null;
                var opIndex = -1;
                for (var j = 0; j < opKeys.length; j++) {
                    var op = opKeys[j];
                    var idx = part.indexOf(op);
                    if (idx !== -1) {
                        matchedOp = op;
                        opIndex = idx;
                        break;
                    }
                }
                
                var field = '';
                var opLabel = '';
                var value = '';
                
                if (matchedOp) {
                    field = part.substring(0, opIndex);
                    value = part.substring(opIndex + matchedOp.length);
                    opLabel = OPERATORS[matchedOp];
                    
                    if (value && value.indexOf('@javascript:') !== -1) {
                        value = value.split('@')[0];
                    }
                } else {
                    field = part;
                }
                
                var fieldLabel = (labels && labels[field]) || field;
                
                conditions.push({
                    field: field,
                    fieldLabel: fieldLabel,
                    operator: matchedOp,
                    operatorLabel: opLabel,
                    value: value,
                    isOr: isOr,
                    isNewQueryGroup: isNewQueryGroup
                });
            }
            return conditions;
        }

        // variable_conditions values are an encoded-query string just like 'conditions', but each
        // "field" token is an item_option_new (catalog variable) Sys ID prefixed with "IO:" instead
        // of a table field name, so the operator-splitting logic above is reused as-is.
        function _extractVariableIds(query) {
            var ids = [];
            if (!query) { return ids; }
            var re = /IO:([0-9a-f]{32})/gi;
            var m;
            while ((m = re.exec(query))) {
                if (ids.indexOf(m[1]) === -1) {
                    ids.push(m[1]);
                }
            }
            return ids;
        }

        function _parseVariableConditions(query, variableLabels) {
            var parsed = _parseEncodedQuery(query, {});
            for (var i = 0; i < parsed.length; i++) {
                var cond = parsed[i];
                var variableId = cond.field.indexOf('IO:') === 0 ? cond.field.substring(3) : cond.field;
                cond.isVariable = true;
                cond.variableId = variableId;
                cond.fieldLabel = (variableLabels && variableLabels[variableId]) || variableId;
            }
            return parsed;
        }

        ctrl.toggleBuilderMode = function(f, isExtra) {
            var key = f.key;
            ctrl.showBuilder[key] = !ctrl.showBuilder[key];
            if (!ctrl.showBuilder[key]) {
                return;
            }

            if (f.type === 'variable_conditions') {
                var leftQuery = isExtra ? (ctrl.extraLeftFields[key] || '') : (ctrl.leftFields[key] || '');
                var rightQuery = isExtra ? (ctrl.extraRightFields[key] || '') : (ctrl.rightFields[key] || '');
                var variableIds = _extractVariableIds(leftQuery).concat(_extractVariableIds(rightQuery));
                ctrl.loadVariableMetadata(variableIds);
                return;
            }

            var targetTable = '';
            if (f.dependent) {
                targetTable = isExtra ? (ctrl.extraLeftFields[f.dependent] || ctrl.extraRightFields[f.dependent] || '')
                                      : (ctrl.leftFields[f.dependent] || ctrl.rightFields[f.dependent] || '');
            }
            if (!targetTable) {
                targetTable = tableParam;
            }
            if (targetTable && (!ctrl.tableLabelsCache[targetTable] || Object.keys(ctrl.tableLabelsCache[targetTable]).length === 0)) {
                ctrl.loadTableLabels(targetTable);
            }
        };

        ctrl.loadVariableMetadata = function(variableIds) {
            var toLoad = [];
            for (var i = 0; i < variableIds.length; i++) {
                var id = variableIds[i];
                if (!ctrl.variableFieldsCache.hasOwnProperty(id) && toLoad.indexOf(id) === -1) {
                    toLoad.push(id);
                }
            }
            if (!toLoad.length) {
                return;
            }
            toLoad.forEach(function(id) { ctrl.variableFieldsCache[id] = {}; });
            _ajax('getVariableLabels', { variables: JSON.stringify(toLoad) }, function(data) {
                if (data.success && data.variables) {
                    _apply(function() {
                        for (var id in data.variables) {
                            ctrl.variableFieldsCache[id] = data.variables[id];
                            ctrl.variableLabelsCache[id] = data.variables[id].label;
                        }
                        ctrl.parsedCache = {};
                    });
                }
            });
        };

        ctrl.loadTableLabels = function(tableName) {
            if (ctrl.tableLabelsCache[tableName] && Object.keys(ctrl.tableLabelsCache[tableName]).length > 0) {
                return;
            }
            ctrl.tableLabelsCache[tableName] = {};
            ctrl.tableFieldsCache[tableName] = {};
            _ajax('getFieldLabels', { table: tableName }, function(data) {
                if (data.success && data.labels) {
                    _apply(function() {
                        ctrl.tableLabelsCache[tableName] = data.labels;
                        if (data.fields) {
                            ctrl.tableFieldsCache[tableName] = data.fields;
                        }
                        ctrl.parsedCache = {};
                    });
                }
            });
        };

        ctrl.getParsedConditions = function(key, side, isExtra) {
            var rawQuery = '';
            if (isExtra) {
                rawQuery = side === 'left' ? (ctrl.extraLeftFields[key] || '') : (ctrl.extraRightFields[key] || '');
            } else {
                rawQuery = side === 'left' ? (ctrl.leftFields[key] || '') : (ctrl.rightFields[key] || '');
            }
            
            var cacheKey = key + '_' + side + '_' + isExtra + '_' + rawQuery;
            if (ctrl.parsedCache[cacheKey]) {
                var parsed = ctrl.parsedCache[cacheKey];
                ctrl.resolveDisplayValuesForConditions(key, side, isExtra, parsed);
                return parsed;
            }
            
            var f = isExtra ? ctrl.extraFields.filter(function(x) { return x.key === key; })[0]
                            : ctrl.fields.filter(function(x) { return x.key === key; })[0];

            if (f && f.type === 'variable_conditions') {
                var varParsed = _parseVariableConditions(rawQuery, ctrl.variableLabelsCache);
                ctrl.parsedCache[cacheKey] = varParsed;
                ctrl.resolveDisplayValuesForConditions(key, side, isExtra, varParsed);
                return varParsed;
            }

            var labels = {};
            if (f) {
                var targetTable = '';
                if (f.dependent) {
                    targetTable = isExtra ? (ctrl.extraLeftFields[f.dependent] || ctrl.extraRightFields[f.dependent] || '')
                                          : (ctrl.leftFields[f.dependent] || ctrl.rightFields[f.dependent] || '');
                }
                if (!targetTable) {
                    targetTable = tableParam;
                }
                labels = ctrl.tableLabelsCache[targetTable] || {};
            }

            var parsed = _parseEncodedQuery(rawQuery, labels);
            ctrl.parsedCache[cacheKey] = parsed;
            ctrl.resolveDisplayValuesForConditions(key, side, isExtra, parsed);
            return parsed;
        };

        ctrl.resolveDisplayValuesForConditions = function(key, side, isExtra, conditions) {
            if (!conditions || conditions.length === 0) {
                return;
            }
            
            var f = isExtra ? ctrl.extraFields.filter(function(x) { return x.key === key; })[0]
                            : ctrl.fields.filter(function(x) { return x.key === key; })[0];
            if (!f) {
                return;
            }

            if (f.type === 'variable_conditions') {
                ctrl.resolveDisplayValuesForVariableConditions(conditions);
                return;
            }

            var targetTable = '';
            if (f.dependent) {
                targetTable = isExtra ? (ctrl.extraLeftFields[f.dependent] || ctrl.extraRightFields[f.dependent] || '')
                                      : (ctrl.leftFields[f.dependent] || ctrl.rightFields[f.dependent] || '');
            }
            if (!targetTable) {
                targetTable = tableParam;
            }
            if (!targetTable) {
                return;
            }

            var toResolve = [];
            for (var i = 0; i < conditions.length; i++) {
                var cond = conditions[i];
                if (!cond.field || cond.value === undefined || cond.value === null || cond.value === '') {
                    continue;
                }
                
                var cacheKey = targetTable + '|||' + cond.field + '|||' + cond.value;
                if (ctrl.resolvedDisplayValuesCache[cacheKey] === undefined) {
                    toResolve.push({
                        field: cond.field,
                        value: cond.value
                    });
                }
            }

            if (toResolve.length === 0) {
                return;
            }

            var batchKey = targetTable + '|||' + JSON.stringify(toResolve);
            if (ctrl.resolvingQueries[batchKey]) {
                return;
            }
            ctrl.resolvingQueries[batchKey] = true;

            _ajax('resolveConditionDisplayValues', {
                table: targetTable,
                conditions: JSON.stringify(toResolve)
            }, function(data) {
                delete ctrl.resolvingQueries[batchKey];
                if (data.success && data.results) {
                    _apply(function() {
                        for (var k in data.results) {
                            var parts = k.split('|||');
                            var fieldName = parts[0];
                            var rawVal = parts[1];
                            var displayVal = data.results[k];
                            var cacheKey = targetTable + '|||' + fieldName + '|||' + rawVal;
                            ctrl.resolvedDisplayValuesCache[cacheKey] = displayVal;
                        }
                    });
                }
            });
        };

        // Mirrors resolveDisplayValuesForConditions, but resolves catalog-variable choice/reference
        // values (keyed by variableId, not table+field) via resolveVariableConditionDisplayValues.
        ctrl.resolveDisplayValuesForVariableConditions = function(conditions) {
            var toResolve = [];
            for (var i = 0; i < conditions.length; i++) {
                var cond = conditions[i];
                if (!cond.variableId || cond.value === undefined || cond.value === null || cond.value === '') {
                    continue;
                }
                var cacheKey = 'VAR|||' + cond.variableId + '|||' + cond.value;
                if (ctrl.resolvedDisplayValuesCache[cacheKey] === undefined) {
                    toResolve.push({ variable: cond.variableId, value: cond.value });
                }
            }

            if (toResolve.length === 0) {
                return;
            }

            var batchKey = 'VAR|||' + JSON.stringify(toResolve);
            if (ctrl.resolvingQueries[batchKey]) {
                return;
            }
            ctrl.resolvingQueries[batchKey] = true;

            _ajax('resolveVariableConditionDisplayValues', {
                pairs: JSON.stringify(toResolve)
            }, function(data) {
                delete ctrl.resolvingQueries[batchKey];
                if (data.success && data.results) {
                    _apply(function() {
                        for (var k in data.results) {
                            var parts = k.split('|||');
                            var variableId = parts[0];
                            var rawVal = parts[1];
                            var cacheKey = 'VAR|||' + variableId + '|||' + rawVal;
                            ctrl.resolvedDisplayValuesCache[cacheKey] = data.results[k];
                        }
                    });
                }
            });
        };

        ctrl.getConditionDisplayValue = function(field, cond, side, isExtra) {
            var cacheKey;
            if (cond.isVariable) {
                cacheKey = 'VAR|||' + cond.variableId + '|||' + cond.value;
            } else {
                var targetTable = '';
                if (field.dependent) {
                    targetTable = isExtra ? (ctrl.extraLeftFields[field.dependent] || ctrl.extraRightFields[field.dependent] || '')
                                          : (ctrl.leftFields[field.dependent] || ctrl.rightFields[field.dependent] || '');
                }
                if (!targetTable) {
                    targetTable = tableParam;
                }
                cacheKey = targetTable + '|||' + cond.field + '|||' + cond.value;
            }

            var displayVal = ctrl.resolvedDisplayValuesCache[cacheKey] !== undefined
                ? ctrl.resolvedDisplayValuesCache[cacheKey]
                : cond.value;

            if (displayVal && cond && (cond.operator === 'IN' || cond.operator === 'NOT IN')) {
                return displayVal.split(',').map(function(item) { return item.trim(); }).join('\n');
            }
            return displayVal;
        };

        ctrl.getFieldMetadata = function(field, cond, isExtra) {
            if (cond && cond.isVariable) {
                var varMeta = ctrl.variableFieldsCache[cond.variableId] || {};
                return {
                    choice: varMeta.isChoice ? 1 : 0,
                    type: varMeta.reference ? 'reference' : (varMeta.isChoice ? 'choice' : ''),
                    reference: varMeta.reference || ''
                };
            }

            var targetTable = '';
            if (field.dependent) {
                targetTable = isExtra ? (ctrl.extraLeftFields[field.dependent] || ctrl.extraRightFields[field.dependent] || '')
                                      : (ctrl.leftFields[field.dependent] || ctrl.rightFields[field.dependent] || '');
            }
            if (!targetTable) {
                targetTable = tableParam;
            }

            var fields = ctrl.tableFieldsCache[targetTable] || {};
            return fields[cond.field] || {};
        };

        ctrl.isChoiceValueField = function(field, cond, side, isExtra) {
            if (cond && (cond.operator === 'ON' || cond.operator === 'NOTON')) {
                return true;
            }
            var meta = ctrl.getFieldMetadata(field, cond, isExtra);
            return meta.choice > 0 || meta.type === 'boolean' || meta.type === 'choice';
        };

        ctrl.isReferenceValueField = function(field, cond, side, isExtra) {
            var meta = ctrl.getFieldMetadata(field, cond, isExtra);
            return meta.type === 'reference' || meta.type === 'glide_list';
        };

        ctrl.isTextareaValueField = function(field, cond, side, isExtra) {
            if (ctrl.isChoiceValueField(field, cond, side, isExtra) || ctrl.isReferenceValueField(field, cond, side, isExtra)) {
                return false;
            }
            var val = ctrl.getConditionDisplayValue(field, cond, side, isExtra);
            return (val && (val.indexOf('\n') !== -1 || val.length > 50));
        };

        ctrl.isStandardValueField = function(field, cond, side, isExtra) {
            return !ctrl.isChoiceValueField(field, cond, side, isExtra) &&
                   !ctrl.isReferenceValueField(field, cond, side, isExtra) &&
                   !ctrl.isTextareaValueField(field, cond, side, isExtra);
        };

        ctrl.hasValueField = function(cond) {
            if (!cond || !cond.operator) {
                return false;
            }
            var op = cond.operator.toUpperCase();
            var noValOps = ['ISEMPTY', 'ISNOTEMPTY', 'ANYTHING', 'VALCHANGES'];
            return noValOps.indexOf(op) === -1;
        };

        ctrl.isValidSysId = function(val) {
            return val && /^[0-9a-f]{32}$/i.test(val.trim());
        };

        ctrl.getConditionReferenceUrl = function(field, cond, isExtra) {
            var meta = ctrl.getFieldMetadata(field, cond, isExtra);
            if (meta.reference && cond.value) {
                var cleanVal = cond.value.trim();
                if (/^[0-9a-f]{32}$/i.test(cleanVal)) {
                    return '/' + meta.reference + '.do?sys_id=' + cleanVal;
                }
            }
            return '#';
        };

        ctrl.isConditionPartChanged = function(field, cond, side, isExtra, index, partType) {
            if (!cond) { return false; }
            var changed = isExtra ? true : ctrl.isChanged(field.key);
            if (!changed) {
                return false;
            }
            var oppSide = side === 'left' ? 'right' : 'left';
            var oppConditions = ctrl.getParsedConditions(field.key, oppSide, isExtra) || [];
            var oppCond = oppConditions[index];
            if (!oppCond) {
                return true;
            }
            if (partType === 'field') {
                return cond.field !== oppCond.field;
            }
            if (partType === 'operator') {
                return cond.operator !== oppCond.operator;
            }
            if (partType === 'value') {
                return cond.value !== oppCond.value;
            }
            if (partType === 'conjunction') {
                var condOr = !!(cond.isOr || cond.isNewQueryGroup);
                var oppOr = !!(oppCond.isOr || oppCond.isNewQueryGroup);
                return condOr !== oppOr;
            }
            return false;
        };
    }])

    .directive('weDiffRecordPicker', ['$timeout', function($timeout) {
        return {
            restrict: 'A',
            link: function(scope, el) {
                $timeout(function() {
                    var $jq = (typeof $j !== 'undefined') ? $j : (typeof jQuery !== 'undefined' ? jQuery : null);
                    if (!$jq || !$jq.fn || !$jq.fn.select2) {
                        return;
                    }

                    var input = document.createElement('input');
                    input.type = 'hidden';
                    input.value = recordId;
                    el[0].appendChild(input);
                    var $input = $jq(input);

                    var _timer = null;
                    $input.select2({
                        placeholder: '(select record)',
                        minimumInputLength: 0,
                        allowClear: false,
                        dropdownCssClass: 'dc-record-picker-drop',
                        query: function(query) {
                            clearTimeout(_timer);
                            _timer = setTimeout(function() {
                                _ajax('getRecordsForTable', { table: tableParam, search: query.term || '', page: query.page || 1 }, function(data) {
                                    var results = (data.success && data.records)
                                        ? data.records.map(function(r) { return { id: r.sys_id, text: r.name || r.sys_id }; })
                                        : [];
                                    query.callback({ results: results, more: !!data.has_more });
                                });
                            }, 250);
                        },
                        initSelection: function(element, callback) {
                            var name = scope.ctrl && scope.ctrl.recordName;
                            callback({ id: recordId, text: name || '' });
                        }
                    });

                    $input.on('change', function(e) {
                        var newId = (e.added && e.added.id) || e.val || $input.select2('val');
                        if (!newId || newId === recordId) { return; }
                        window.top.location.href = _navUrl(diffPageSysId, 'widget_editor_diff', { table: tableParam, record_id: newId });
                    });

                    var unwatch = scope.$watch('ctrl.recordName', function(name) {
                        if (!name) { return; }
                        $input.select2('data', { id: recordId, text: name });
                        unwatch();
                    });
                });
            }
        };
    }])

    .directive('weDiffTablePicker', ['$timeout', function($timeout) {
        return {
            restrict: 'A',
            link: function(scope, el) {
                $timeout(function() {
                    var $jq = (typeof $j !== 'undefined') ? $j : (typeof jQuery !== 'undefined' ? jQuery : null);
                    if (!$jq || !$jq.fn || !$jq.fn.select2) { return; }

                    var input = document.createElement('input');
                    input.type = 'hidden';
                    input.value = tableParam;
                    el[0].appendChild(input);
                    var $input = $jq(input);

                    var _timer = null;
                    $input.select2({
                        placeholder: '(select table)',
                        minimumInputLength: 0,
                        allowClear: false,
                        dropdownCssClass: 'dc-table-picker-drop',
                        formatResult: function(item) {
                            var label = document.createTextNode(item.text || item.id);
                            var name  = document.createTextNode(item.id);
                            var wrap  = document.createElement('span');
                            var sub   = document.createElement('span');
                            sub.className = 'dc-table-result-name';
                            wrap.appendChild(label);
                            wrap.appendChild(sub);
                            sub.appendChild(name);
                            return wrap;
                        },
                        formatSelection: function(item) { return item.text || item.id; },
                        query: function(query) {
                            clearTimeout(_timer);
                            _timer = setTimeout(function() {
                                _ajax('getTablesForDiff', { search: query.term || '', page: query.page || 1 }, function(data) {
                                    var results = (data.success && data.tables)
                                        ? data.tables.map(function(t) { return { id: t.name, text: t.label || t.name }; })
                                        : [];
                                    query.callback({ results: results, more: !!data.has_more });
                                });
                            }, 250);
                        },
                        initSelection: function(element, callback) {
                            var label = scope.ctrl && scope.ctrl.tableLabel;
                            callback({ id: tableParam, text: label || tableParam });
                        }
                    });

                    $input.on('change', function(e) {
                        var newTable = (e.added && e.added.id) || e.val || $input.select2('val');
                        if (!newTable || newTable === tableParam) { return; }
                        window.top.location.href = _navUrl(diffPageSysId, 'widget_editor_diff', { table: newTable });
                    });

                    var unwatch = scope.$watch('ctrl.tableLabel', function(label) {
                        if (!label) { return; }
                        $input.select2('data', { id: tableParam, text: label });
                        unwatch();
                    });
                });
            }
        };
    }])

    .directive('weDiffEditor', ['$timeout', function($timeout) {
        return {
            link: function(scope, element, attrs) {
                var index = parseInt(attrs.scriptIndex || scope.$eval(attrs.weDiffEditor) || scope.$index, 10);
                $timeout(function() {
                    scope.ctrl.initEditor(index);
                }, 0);
            }
        };
    }])

    .directive('weDiffExtraEditor', ['$timeout', function($timeout) {
        return {
            link: function(scope, element, attrs) {
                var index = parseInt(attrs.scriptIndex || scope.$eval(attrs.weDiffExtraEditor) || scope.$index, 10);
                $timeout(function() {
                    scope.ctrl.initExtraEditor(index);
                }, 0);
            }
        };
    }])

    .directive('weSyncRowHeight', ['$timeout', function($timeout) {
        return {
            restrict: 'A',
            require: 'ngModel',
            link: function(scope, el, attrs, ngModel) {
                var _orig = ngModel.$render.bind(ngModel);
                ngModel.$render = function() {
                    _orig();
                    $timeout(function() {
                        var row = el[0].closest('tr');
                        if (!row) { return; }
                        var tas = row.querySelectorAll('textarea.sft-textarea');
                        tas.forEach(function(ta) { 
                            ta.style.height = ''; 
                        });
                        var max = 0;
                        var borderHeight = 0;
                        tas.forEach(function(ta) {
                            max = Math.max(max, ta.scrollHeight);
                            borderHeight = Math.max(borderHeight, ta.offsetHeight - ta.clientHeight);
                        });
                        tas.forEach(function(ta) {
                            ta.style.height = (max + borderHeight) + 'px';
                        });
                    }, 0, false);
                };
            }
        };
    }])
    .directive('weTooltip', [function() {
        return {
            restrict: 'A',
            link: function(scope, element, attrs) {
                attrs.$observe('weTooltip', function(val) {
                    element.attr('title', val || '');
                });
            }
        };
    }]);

        var appEl = document.getElementById('we-diff-app');
        if (appEl) {
            angular.bootstrap(appEl, ['weDiff']);
        }
    }

    /* Detect Polaris light/dark theme via CSS variable and stamp html.we-light accordingly. */
    function _applyThemeClass() {
        try {
            var bg = getComputedStyle(document.documentElement)
                .getPropertyValue('--now-color_background--primary').trim();
            var p = bg.split(/[\s,]+/).map(Number);
            if (p.length >= 3) {
                document.documentElement.classList.toggle('we-light', (p[0] + p[1] + p[2]) / 3 >= 128);
            }
        } catch (e) {}
    }

    // Copy CSS variables from opener window (theme support)
    function _copyOpenerStyles() {
        var openerWin = (window.top && window.top.opener) || window.opener;
        if (!openerWin || !openerWin.document) { return; }
        try {
            var styles = openerWin.document.querySelectorAll('style');
            for (var i = 0; i < styles.length; i++) {
                var text = styles[i].textContent || '';
                if (text.indexOf('--now-') !== -1 || text.indexOf(':root') !== -1) {
                    var s = document.createElement('style');
                    s.textContent = text;
                    document.head.appendChild(s);
                }
            }
        } catch (e) {}
    }

    function _afterLoad() {
        _copyOpenerStyles();
        _applyThemeClass();
        _initAngular();
    }

    if (typeof addAfterPageLoadedEvent === 'function') {
        addAfterPageLoadedEvent(_afterLoad);
    } else if (document.readyState !== 'loading') {
        _afterLoad();
    } else {
        document.addEventListener('DOMContentLoaded', _afterLoad);
    }

})();

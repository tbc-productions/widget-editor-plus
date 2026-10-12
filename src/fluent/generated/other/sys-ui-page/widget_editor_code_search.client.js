(function () {
    'use strict';

    function _initAngular() {
        if (typeof angular === 'undefined') {
            return;
        }

        var codeSearchApp = angular.module('codeSearchApp', []);

        codeSearchApp.directive('csSelect2Fields', [
            '$timeout',
            function ($timeout) {
                return {
                    restrict: 'A',
                    link: function (scope, el) {
                        var $jq = typeof $j !== 'undefined' ? $j : typeof jQuery !== 'undefined' ? jQuery : null;
                        if (!$jq || !$jq.fn || !$jq.fn.select2) {
                            return;
                        }
                        var $el = $jq(el[0]);
                        var ctrl = scope.ctrl;
                        var isInitialized = false;

                        function buildFieldData() {
                            var fields = (ctrl && ctrl.currentTableFields) || [];
                            return fields.map(function (f) {
                                return {
                                    id: f.id,
                                    text: f.text || (f.label ? f.label + ' (' + f.id + ')' : f.id),
                                };
                            });
                        }

                        function updateSelect2Val() {
                            if (!isInitialized) return;
                            var raw = (ctrl && ctrl.draft && ctrl.draft.searchFields) || '';
                            var arr = raw
                                ? raw
                                      .split(',')
                                      .map(function (s) {
                                          return s.trim();
                                      })
                                      .filter(Boolean)
                                : [];
                            $el.select2('val', arr);
                        }

                        function initSelect2() {
                            var data = buildFieldData();
                            if (!data.length) return;

                            try {
                                $el.select2('destroy');
                            } catch (e) {}

                            $el.select2({
                                multiple: true,
                                placeholder: 'Select code search fields…',
                                data: data,
                                dropdownCssClass: 'cs-fields-picker-drop',
                                width: '100%',
                                initSelection: function (element, callback) {
                                    var val = element.val();
                                    var selected = [];
                                    if (val) {
                                        var map = {};
                                        data.forEach(function (d) {
                                            map[d.id] = d;
                                        });
                                        val.split(',').forEach(function (id) {
                                            var trimmed = id.trim();
                                            if (trimmed && map[trimmed]) {
                                                selected.push(map[trimmed]);
                                            }
                                        });
                                    }
                                    callback(selected);
                                },
                            });

                            isInitialized = true;
                            updateSelect2Val();

                            $el.off('change.csFields').on('change.csFields', function () {
                                var val = $el.select2('val');
                                var arr = Array.isArray(val) ? val.filter(Boolean) : [];
                                var csv = arr.join(',');
                                if (ctrl && ctrl.draft && ctrl.draft.searchFields !== csv) {
                                    scope.$apply(function () {
                                        ctrl.draft.searchFields = csv;
                                        if (ctrl.validation && ctrl.validation.error) {
                                            ctrl.validation.error = '';
                                        }
                                    });
                                }
                            });
                        }

                        var initVal = (ctrl && ctrl.draft && ctrl.draft.searchFields) || '';
                        $el.val(initVal);

                        scope.$watchCollection('ctrl.currentTableFields', function (fields) {
                            if (fields && fields.length) {
                                $timeout(initSelect2, 0);
                            }
                        });

                        scope.$watch('ctrl.draft.searchFields', function (newVal, oldVal) {
                            if (newVal !== oldVal) {
                                updateSelect2Val();
                            }
                        });

                        scope.$on('$destroy', function () {
                            try {
                                $el.off('.csFields');
                                $el.select2('destroy');
                            } catch (e) {}
                        });
                    },
                };
            },
        ]);

        codeSearchApp.controller('CodeSearchController', [
            '$scope',
            '$sce',
            '$timeout',
            '$q',
            function ($scope, $sce, $timeout, $q) {
                var vm = this;
                vm.groups = [];
                vm.tables = [];
                vm.results = [];
                vm.groupedResults = [];
                vm.sortedResults = [];
                vm.tablesWithResults = [];
                vm.filteredConfigTables = [];
                vm.query = '';
                vm.secondaryFilters = [];
                vm.showAdvancedFilters = false;
                vm.loading = false;
                vm.hasSearched = false;
                vm.searchedTables = 0;
                vm.elapsed = null;
                vm.editing = null;
                vm.draft = {};
                vm.validation = {};
                vm.toast = '';
                vm.tableFilter = '';
                vm.selectedGroupId = '';
                var persistGroupInUrl = false;
                vm.selectedGroup = null;
                vm.viewMode = 'group_table';
                vm.tableMatchCounts = {};
                vm.tableActiveFields = {};
                vm.fieldsCache = {};
                vm.loadingFields = false;
                vm.currentTableFields = [];
                vm.caseSensitive = false;
                vm.activeOnly = true;
                // Table whose results section is currently scrolled to the top of the results pane.
                vm.currentViewedTable = null;

                var currentSearchGen = 0;
                // GlideAjax has no built-in timeout, so a table whose CONTAINS query stalls (large table,
                // unindexed field) hangs its worker forever instead of erroring, freezing the whole search.
                var TABLE_SEARCH_TIMEOUT_MS = 25000;
                vm.searchProgress = {
                    completed: 0,
                    total: 0,
                    percent: 0,
                    currentTable: '',
                };

                // Sidebar Panes State
                vm.paneGroupOpen = true;
                vm.paneResultsOpen = false;

                var APP_TITLE = 'Code Search+';
                var siteTitle =
                    (window.WE_CODE_SEARCH_CONFIG && window.WE_CODE_SEARCH_CONFIG.siteTitle) || 'ServiceNow';
                var titleTimer = null;
                var historySyncedTerm = null;
                // Match the History row by sys_id, not url: updateUrlParam() keeps rewriting location.search.
                var historyMatch = 'urlLIKEsys_id=' + (new URLSearchParams(location.search).get('sys_id') || '');
                $scope.$watch(
                    function () {
                        return vm.query + '|' + vm.hasSearched + '|' + vm.loading + '|' + vm.results.length;
                    },
                    function () {
                        var term = vm.query && vm.query.trim();
                        var suffix = vm.hasSearched && !vm.loading ? ' (' + vm.results.length + ')' : '';
                        var title = (term ? term + suffix + ' - ' : '') + APP_TITLE + ' - ' + siteTitle;
                        document.title = title;
                        if (titleTimer) {
                            $timeout.cancel(titleTimer);
                        }
                        titleTimer = $timeout(function () {
                            try {
                                if (window.parent !== window) {
                                    window.parent.document.title = title;
                                }
                            } catch (e) {}
                        }, 1000);

                        // Syncs on load and again when the searched term changes, not as each table finishes.
                        var searched = term && vm.hasSearched ? term : '';
                        if (window.WE_HISTORY_SYNC && historySyncedTerm !== searched) {
                            historySyncedTerm = searched;
                            window.WE_HISTORY_SYNC.set({
                                description: searched,
                                match: historyMatch,
                                title: APP_TITLE,
                                // Rewrites the row url so reopening the entry restores this exact search.
                                url: !!searched,
                            });
                        }
                    }
                );

                function _updateTablesWithResults() {
                    if (!vm.hasSearched) {
                        vm.tablesWithResults = [];
                        return;
                    }
                    vm.tablesWithResults = (vm.tables || []).filter(function (t) {
                        return (vm.tableMatchCounts[t.table] || 0) > 0;
                    });
                }

                function _updateFilteredConfigTables() {
                    var list = vm.tables || [];
                    if (vm.tableFilter) {
                        var q = vm.tableFilter.toLowerCase();
                        list = list.filter(function (t) {
                            return (
                                (t.label && t.label.toLowerCase().indexOf(q) > -1) ||
                                (t.table && t.table.toLowerCase().indexOf(q) > -1)
                            );
                        });
                    }
                    vm.filteredConfigTables = list;
                }

                function _fieldIsActive(table, field) {
                    var active = vm.tableActiveFields[table];
                    return !active || active[field] !== false;
                }

                function _applyVisibleMatches(r) {
                    r.visibleMatches = (r.matches || []).filter(function (m) {
                        return _fieldIsActive(r.table, m.field);
                    });
                    return r.visibleMatches.length > 0;
                }

                function _computeGroupFields(records) {
                    var seen = {};
                    var fields = [];
                    records.forEach(function (r) {
                        (r.matches || []).forEach(function (m) {
                            if (!seen[m.field]) {
                                seen[m.field] = true;
                                fields.push({
                                    field: m.field,
                                    label: m.fieldLabel || m.field,
                                });
                            }
                        });
                    });
                    return fields;
                }

                function _ensureActiveFieldDefaults(table, fields) {
                    if (!vm.tableActiveFields[table]) {
                        vm.tableActiveFields[table] = {};
                    }
                    var active = vm.tableActiveFields[table];
                    fields.forEach(function (f) {
                        if (!(f.field in active)) active[f.field] = true;
                    });
                }

                function _applyFieldFilter(group) {
                    group.records = (group.allRecords || []).filter(_applyVisibleMatches);
                }

                function _updateGroupedResults() {
                    var items = vm.results || [];
                    var groupsMap = {};
                    var order = [];
                    var visibleCounts = {};
                    items.forEach(function (r) {
                        if (!groupsMap[r.table]) {
                            groupsMap[r.table] = {
                                table: r.table,
                                tableLabel: r.tableLabel,
                                allRecords: [],
                                records: [],
                                fields: [],
                            };
                            order.push(r.table);
                        }
                        groupsMap[r.table].allRecords.push(r);
                    });
                    order.sort(function (a, b) {
                        return (groupsMap[a].tableLabel || a).localeCompare(groupsMap[b].tableLabel || b);
                    });
                    order.forEach(function (t) {
                        var group = groupsMap[t];
                        group.allRecords.sort(function (a, b) {
                            var valA = String(a.displayValue || '');
                            var valB = String(b.displayValue || '');
                            var comp = valA.localeCompare(valB, undefined, {
                                sensitivity: 'base',
                                numeric: true,
                            });
                            if (comp !== 0) return comp;
                            return valA.localeCompare(valB);
                        });
                        group.fields = _computeGroupFields(group.allRecords);
                        _ensureActiveFieldDefaults(t, group.fields);
                        _applyFieldFilter(group);
                        visibleCounts[t] = group.records.length;
                    });
                    vm.groupedResults = order.map(function (t) {
                        return groupsMap[t];
                    });
                    vm.tableMatchCounts = visibleCounts;
                    _updateTablesWithResults();
                }

                function _updateSortedResults() {
                    var items = (vm.results || []).filter(_applyVisibleMatches);
                    if (vm.viewMode === 'date_asc') {
                        items.sort(function (a, b) {
                            var da = a.updatedOn ? new Date(a.updatedOn.replace(' ', 'T') + 'Z').getTime() : 0;
                            var db = b.updatedOn ? new Date(b.updatedOn.replace(' ', 'T') + 'Z').getTime() : 0;
                            return da - db;
                        });
                    } else if (vm.viewMode === 'date_desc') {
                        items.sort(function (a, b) {
                            var da = a.updatedOn ? new Date(a.updatedOn.replace(' ', 'T') + 'Z').getTime() : 0;
                            var db = b.updatedOn ? new Date(b.updatedOn.replace(' ', 'T') + 'Z').getTime() : 0;
                            return db - da;
                        });
                    }
                    vm.sortedResults = items;
                }

                // Tracks which table's section has scrolled to the top of the results pane,
                // so the sidebar's "tables with results" list can highlight it.
                function _updateCurrentViewedTable() {
                    if (vm.viewMode !== 'group_table' || !vm.hasSearched) {
                        vm.currentViewedTable = null;
                        return;
                    }
                    var container = document.getElementById('cs-results-container');
                    var sections = container ? container.querySelectorAll('.cs-table-group') : [];
                    if (!sections.length) {
                        vm.currentViewedTable = null;
                        return;
                    }
                    var containerTop = container.getBoundingClientRect().top;
                    var current = sections[0].getAttribute('data-table');
                    for (var i = 0; i < sections.length; i++) {
                        if (sections[i].getBoundingClientRect().top - containerTop > 4) break;
                        current = sections[i].getAttribute('data-table');
                    }
                    vm.currentViewedTable = current;
                }

                function _bindResultsScrollSpy() {
                    var container = document.getElementById('cs-results-container');
                    if (!container) return;
                    var ticking = false;
                    container.addEventListener(
                        'scroll',
                        function () {
                            if (ticking) return;
                            ticking = true;
                            window.requestAnimationFrame(function () {
                                ticking = false;
                                if ($scope.$$phase) {
                                    _updateCurrentViewedTable();
                                } else {
                                    $scope.$apply(_updateCurrentViewedTable);
                                }
                            });
                        },
                        { passive: true }
                    );
                }

                vm.togglePane = function (pane) {
                    if (pane === 'group') {
                        vm.paneGroupOpen = !vm.paneGroupOpen;
                    } else if (pane === 'results') {
                        if (!vm.hasSearched) return;
                        vm.paneResultsOpen = !vm.paneResultsOpen;
                    }
                };

                vm.getTablesWithResults = function () {
                    return vm.tablesWithResults;
                };

                vm.tablesWithResultsCount = function () {
                    return (vm.tablesWithResults || []).length;
                };

                vm.getTableSearchFieldsDisplay = function (table) {
                    if (!table) return '';
                    var val = table.searchFields || table.search_fields;
                    if (!val) return '';
                    var raw = Array.isArray(val) ? val.join(',') : String(val);
                    return raw
                        .split(',')
                        .map(function (f) {
                            return f.trim();
                        })
                        .filter(Boolean)
                        .join(', ');
                };

                vm.getSortedResults = function () {
                    return vm.sortedResults;
                };

                $scope.$watch('ctrl.tableFilter', function () {
                    _updateFilteredConfigTables();
                });

                $scope.$watch('ctrl.viewMode', function (newMode, oldMode) {
                    _updateSortedResults();
                    $timeout(function () {
                        if (newMode !== oldMode) {
                            var container = document.getElementById('cs-results-container');
                            if (container) container.scrollTop = 0;
                        }
                        _updateCurrentViewedTable();
                    });
                });

                vm.clearInput = function () {
                    vm.query = '';
                    vm.clearResults();
                };

                vm.hasActiveConditions = function () {
                    return (vm.secondaryFilters || []).some(function (f) {
                        return f && typeof f.term === 'string' && f.term.trim().length > 0;
                    });
                };

                vm.isFilterPanelVisible = function () {
                    return !!(vm.showAdvancedFilters && vm.secondaryFilters && vm.secondaryFilters.length);
                };

                vm.toggleAdvanced = function () {
                    if (!vm.secondaryFilters.length) {
                        vm.addSecondaryFilter(-1, 'and');
                        vm.showAdvancedFilters = true;
                    } else if (vm.showAdvancedFilters) {
                        if (!vm.hasActiveConditions()) {
                            vm.secondaryFilters = [];
                            vm.showAdvancedFilters = false;
                        } else {
                            vm.showAdvancedFilters = false;
                        }
                    } else {
                        vm.showAdvancedFilters = true;
                    }
                };

                vm.showAdvanced = vm.toggleAdvanced;

                function _lastOrChainIndex(afterIndex) {
                    // Find the end of any contiguous run of OR-joined rows immediately
                    // following afterIndex, so a new condition lands after the whole group
                    // rather than splitting it.
                    var idx = afterIndex;
                    while (idx + 1 < vm.secondaryFilters.length && vm.secondaryFilters[idx + 1].joiner === 'or') {
                        idx++;
                    }
                    return idx;
                }

                vm.addSecondaryFilter = function (afterIndex, joiner) {
                    if (vm.secondaryFilters.length >= 20) return;
                    var row = {
                        operator: 'contains',
                        term: '',
                        joiner: joiner === 'or' ? 'or' : 'and',
                    };
                    if (afterIndex < 0) {
                        vm.secondaryFilters.push(row);
                    } else {
                        vm.secondaryFilters.splice(_lastOrChainIndex(afterIndex) + 1, 0, row);
                    }
                    vm.showAdvancedFilters = true;
                };

                vm.removeSecondaryFilter = function (index) {
                    vm.secondaryFilters.splice(index, 1);
                    if (!vm.secondaryFilters.length) {
                        vm.showAdvancedFilters = false;
                    }
                };

                vm.formatElapsed = function (ms) {
                    if (!ms && ms !== 0) return '';
                    var sec = ms / 1000;
                    return (sec < 10 ? sec.toFixed(2) : sec.toFixed(1)) + 's';
                };

                vm.onOptionChange = function () {
                    if (vm.hasSearched && vm.query && vm.query.trim()) {
                        vm.runSearch();
                    }
                };

                function _validSecondaryFiltersForUrl() {
                    return (vm.secondaryFilters || []).filter(function (f) {
                        return f && f.term && f.term.trim();
                    });
                }

                function updateUrlParam(term) {
                    try {
                        var url = new URL(window.location.href);
                        if (vm.selectedGroupId && persistGroupInUrl) url.searchParams.set('group', vm.selectedGroupId);
                        else url.searchParams.delete('group');
                        if (term) {
                            url.searchParams.set('q', term);
                            if (vm.caseSensitive) url.searchParams.set('case', '1');
                            else url.searchParams.delete('case');
                            if (vm.activeOnly) url.searchParams.set('active', '1');
                            else url.searchParams.set('active', '0');
                            var urlFilters = _validSecondaryFiltersForUrl();
                            if (urlFilters.length) url.searchParams.set('filters', JSON.stringify(urlFilters));
                            else url.searchParams.delete('filters');
                        } else {
                            url.searchParams.delete('q');
                            url.searchParams.delete('case');
                            url.searchParams.delete('active');
                            url.searchParams.delete('filters');
                        }
                        window.history.replaceState({}, '', url.toString());

                        if (window.top && window.top !== window) {
                            try {
                                var topUrl = new URL(window.top.location.href);
                                if (topUrl.pathname.indexOf('/now/nav/ui/classic/params/target/') > -1) {
                                    var targetPath = url.pathname + url.search + url.hash;
                                    var newTop =
                                        '/now/nav/ui/classic/params/target/' +
                                        encodeURIComponent(targetPath.substring(1));
                                    window.top.history.replaceState({}, '', newTop);
                                } else if (topUrl.searchParams.has('uri')) {
                                    var targetUri = url.pathname + url.search + url.hash;
                                    topUrl.searchParams.set('uri', targetUri);
                                    window.top.history.replaceState({}, '', topUrl.toString());
                                }
                            } catch (eTop) {}
                        }
                    } catch (e) {}
                }

                function _parseUrlFilters(raw) {
                    if (!raw) return null;
                    try {
                        var parsed = JSON.parse(raw);
                        if (!Array.isArray(parsed) || !parsed.length || parsed.length > 20) return null;
                        var out = [];
                        for (var i = 0; i < parsed.length; i++) {
                            var item = parsed[i];
                            if (
                                !item ||
                                (item.operator !== 'contains' && item.operator !== 'not_contains') ||
                                typeof item.term !== 'string' ||
                                !item.term.trim() ||
                                item.term.length > 1000 ||
                                (item.joiner !== 'and' && item.joiner !== 'or')
                            ) {
                                return null;
                            }
                            out.push({
                                operator: item.operator,
                                term: item.term,
                                joiner: item.joiner,
                            });
                        }
                        return out;
                    } catch (e) {
                        return null;
                    }
                }

                var initialParams = new URLSearchParams(window.location.search);
                var urlQuery = initialParams.get('q') || initialParams.get('query') || '';
                var urlCase = initialParams.get('case');
                if (urlCase === '1' || urlCase === 'true') vm.caseSensitive = true;
                var urlActive = initialParams.get('active');
                if (urlActive === '0' || urlActive === 'false') {
                    vm.activeOnly = false;
                } else if (urlActive === '1' || urlActive === 'true') {
                    vm.activeOnly = true;
                }
                var urlFilters = _parseUrlFilters(initialParams.get('filters'));
                var urlGroupId = initialParams.get('group') || '';

                if (!urlQuery && window.top && window.top !== window) {
                    try {
                        var topPath = window.top.location.pathname;
                        var marker = '/now/nav/ui/classic/params/target/';
                        var markerIdx = topPath.indexOf(marker);
                        if (markerIdx > -1) {
                            var encodedTarget = topPath.substring(markerIdx + marker.length);
                            var decodedTarget = decodeURIComponent(encodedTarget);
                            var topTargetParams = new URLSearchParams(
                                decodedTarget.indexOf('?') > -1 ? decodedTarget.split('?')[1] : ''
                            );
                            urlQuery = topTargetParams.get('q') || topTargetParams.get('query') || '';
                            var topCase = topTargetParams.get('case');
                            if (topCase === '1' || topCase === 'true') vm.caseSensitive = true;
                            var topActive = topTargetParams.get('active');
                            if (topActive === '0' || topActive === 'false') {
                                vm.activeOnly = false;
                            } else if (topActive === '1' || topActive === 'true') {
                                vm.activeOnly = true;
                            }
                            urlFilters = _parseUrlFilters(topTargetParams.get('filters'));
                            if (!urlGroupId) urlGroupId = topTargetParams.get('group') || '';
                        }
                    } catch (eTop) {}
                }
                if (urlQuery) {
                    vm.query = urlQuery;
                }
                if (urlFilters && urlFilters.length) {
                    vm.secondaryFilters = urlFilters;
                    vm.showAdvancedFilters = true;
                }

                function notify(msg) {
                    vm.toast = msg;
                    $timeout(function () {
                        if (vm.toast === msg) vm.toast = '';
                    }, 3000);
                }

                function ajax(action, params) {
                    var deferred = $q.defer();
                    var ga = new GlideAjax('WidgetEditorCodeSearchAjax');
                    // ServiceNow's GlideAjax error handler checks this flag before firing its
                    // native "transaction was canceled" GlideUI notification. The request is
                    // still terminated by cancel_my_transaction.do; only that expected alert
                    // is suppressed for Code Search-owned requests.
                    ga._suppressCancelNotification = true;
                    ga.addParam('sysparm_name', action);
                    if (params) {
                        Object.keys(params).forEach(function (k) {
                            var val = params[k] != null ? String(params[k]) : '';
                            ga.addParam('sysparm_' + k, val);
                        });
                    }
                    ga.getXML(function (response) {
                        var answer =
                            response && response.responseXML && response.responseXML.documentElement
                                ? response.responseXML.documentElement.getAttribute('answer')
                                : null;
                        try {
                            var parsed = JSON.parse(answer || '{}');
                            $timeout(function () {
                                if (parsed && parsed.success) {
                                    deferred.resolve(parsed);
                                } else {
                                    deferred.reject(new Error((parsed && parsed.error) || 'Request failed'));
                                }
                            });
                        } catch (e) {
                            $timeout(function () {
                                deferred.reject(e);
                            });
                        }
                    });
                    return deferred.promise;
                }

                function ajaxWithTimeout(action, params, timeoutMs) {
                    var deferred = $q.defer();
                    var settled = false;

                    var timeoutHandle = $timeout(function () {
                        if (settled) return;
                        settled = true;
                        deferred.reject(new Error('Timed out'));
                    }, timeoutMs);

                    ajax(action, params).then(
                        function (data) {
                            if (settled) return;
                            settled = true;
                            $timeout.cancel(timeoutHandle);
                            deferred.resolve(data);
                        },
                        function (err) {
                            if (settled) return;
                            settled = true;
                            $timeout.cancel(timeoutHandle);
                            deferred.reject(err);
                        }
                    );

                    return deferred.promise;
                }

                // GlideAjax has no supported client-side abort. Visiting the platform's own
                // cancellation processor is the only reliable way to terminate a table query
                // that is still running server-side, so keep it isolated in a hidden frame.
                function _requestTransactionCancel() {
                    var cancelUrl =
                        '/cancel_my_transaction.do?sysparm_cancel_source=widget_editor_code_search&_=' + Date.now();
                    try {
                        var oldFrame = document.getElementById('widget-editor-code-search-cancel-frame');
                        if (oldFrame && oldFrame.parentNode) oldFrame.parentNode.removeChild(oldFrame);
                        var frame = document.createElement('iframe');
                        frame.id = 'widget-editor-code-search-cancel-frame';
                        frame.title = 'Cancel server transactions';
                        frame.hidden = true;
                        frame.src = cancelUrl;
                        document.body.appendChild(frame);
                    } catch (e) {}
                }

                function _selectGroup(groupId, defaultGroupId) {
                    var match =
                        groupId &&
                        vm.groups.filter(function (g) {
                            return g.sysId === groupId;
                        })[0];
                    var defaultGroup =
                        defaultGroupId &&
                        vm.groups.filter(function (g) {
                            return g.sysId === defaultGroupId;
                        })[0];
                    vm.selectedGroup = match || defaultGroup || vm.groups[0];
                    // Automatic defaults must not become shared-link preferences on reload.
                    persistGroupInUrl = !!match;
                    vm.selectedGroupId = vm.selectedGroup.sysId;
                    vm.loadTables();
                    updateUrlParam(vm.query.trim());
                }

                vm.loadGroups = function () {
                    ajax('getGroups')
                        .then(function (data) {
                            vm.groups = data.groups || [];
                            if (vm.groups.length > 0) {
                                if (urlGroupId) {
                                    // A shared link's group takes priority over the saved preference, and
                                    // becomes the new default so re-sharing later reflects the latest choice.
                                    _selectGroup(urlGroupId);
                                    ajax('saveLastSearchGroup', {
                                        group_id: vm.selectedGroupId,
                                    }).catch(function () {});
                                } else {
                                    ajax('getLastSearchGroup')
                                        .then(function (prefData) {
                                            _selectGroup(prefData && prefData.groupId, data.defaultGroupId);
                                        })
                                        .catch(function () {
                                            _selectGroup(null, data.defaultGroupId);
                                        });
                                }
                            }
                        })
                        .catch(function (e) {
                            notify('Could not load search groups: ' + e.message);
                        });
                };

                vm.onGroupChange = function () {
                    persistGroupInUrl = true;
                    for (var i = 0; i < vm.groups.length; i++) {
                        if (vm.groups[i].sysId === vm.selectedGroupId) {
                            vm.selectedGroup = vm.groups[i];
                            break;
                        }
                    }
                    vm.loadTables();
                    updateUrlParam(vm.query.trim());
                    ajax('saveLastSearchGroup', {
                        group_id: vm.selectedGroupId,
                    }).catch(function () {});
                };

                vm.loadTables = function () {
                    if (!vm.selectedGroupId) return;
                    ajax('getGroupTables', { group_id: vm.selectedGroupId })
                        .then(function (data) {
                            vm.tables = (data.tables || []).map(function (t) {
                                t.enabled = true;
                                t.searchFieldsDisplay = (t.searchFields || t.search_fields || '')
                                    .split(',')
                                    .map(function (f) {
                                        return f.trim();
                                    })
                                    .filter(Boolean)
                                    .join(', ');
                                t.originalSearchFields = t.searchFields || '';
                                t.originalAdditionalFilter = t.additionalFilter || '';
                                return t;
                            });
                            // Sort alphabetical by label
                            vm.tables.sort(function (a, b) {
                                return (a.label || a.table).localeCompare(b.label || b.table);
                            });
                            vm.tableMatchCounts = {};
                            vm.tableActiveFields = {};
                            vm.editing = null;
                            _updateFilteredConfigTables();
                            _updateTablesWithResults();
                            if (vm.query && !vm.hasSearched) {
                                vm.runSearch();
                            }
                        })
                        .catch(function (e) {
                            notify('Could not load tables: ' + e.message);
                        });
                };

                vm.visibleTables = function () {
                    var list = vm.tables;
                    if (vm.hasSearched) {
                        list = list.filter(function (t) {
                            return (vm.tableMatchCounts[t.table] || 0) > 0;
                        });
                    } else if (vm.tableFilter) {
                        var q = vm.tableFilter.toLowerCase();
                        list = list.filter(function (t) {
                            return (
                                (t.label && t.label.toLowerCase().indexOf(q) > -1) ||
                                (t.table && t.table.toLowerCase().indexOf(q) > -1)
                            );
                        });
                    }
                    return list;
                };

                vm.enabledCount = function () {
                    return vm.tables.filter(function (t) {
                        return t.enabled;
                    }).length;
                };

                vm.selectAllTables = function (state) {
                    vm.tables.forEach(function (t) {
                        t.enabled = state;
                    });
                };

                vm.toggleTable = function (table) {
                    if (table) {
                        table.enabled = !table.enabled;
                    }
                };

                vm.onTableClick = function (table) {
                    if (vm.hasSearched) {
                        vm.scrollToTable(table.table);
                    } else {
                        vm.openConfig(table);
                    }
                };

                var tableScrollRequest = 0;
                vm.scrollToTable = function (tableName, options) {
                    options = options || {};
                    var request = ++tableScrollRequest;
                    vm.viewMode = 'group_table';
                    function doScroll(attempts) {
                        if (request !== tableScrollRequest || vm.viewMode !== 'group_table') return;
                        var container = document.getElementById('cs-results-container');
                        var el = document.getElementById('table-group-' + tableName);
                        // Angular may still be replacing the date-sorted view with table groups.
                        if (
                            !container ||
                            !el ||
                            !container.contains(el) ||
                            !el.getClientRects().length ||
                            !container.clientHeight
                        ) {
                            if (attempts > 0) {
                                $timeout(function () {
                                    doScroll(attempts - 1);
                                }, 50);
                            }
                            return;
                        }

                        vm.currentViewedTable = tableName;
                        var containerRect = container.getBoundingClientRect();
                        var elRect = el.getBoundingClientRect();
                        var visibleTop = containerRect.top + container.clientTop;
                        var visibleBottom = visibleTop + container.clientHeight;
                        var heading =
                            el.querySelector('.cs-table-group-sticky') || el.querySelector('.cs-table-group-head');
                        var headingHeight = heading ? heading.getBoundingClientRect().height : 0;
                        // Measure the section's natural position: its sticky heading may be
                        // visible even when the start of the table is above the results pane.
                        if (options.forceTop || elRect.top < visibleTop || elRect.top + headingHeight > visibleBottom) {
                            // Align the section exactly with the results viewport. Adding or subtracting
                            // a visual cushion here leaves a strip above the sticky table header.
                            var offset = container.scrollTop + elRect.top - visibleTop;
                            var top = Math.max(0, Math.min(offset, container.scrollHeight - container.clientHeight));
                            // ServiceNow's Prototype extensions shadow element.scrollTo with
                            // a page-scrolling helper. Call the browser method directly instead.
                            var nativeScrollTo = window.Element && window.Element.prototype.scrollTo;
                            if (typeof nativeScrollTo === 'function') {
                                try {
                                    nativeScrollTo.call(container, {
                                        top: top,
                                        behavior: options.smooth ? 'smooth' : 'auto',
                                    });
                                } catch (e) {
                                    container.scrollTop = top;
                                }
                            } else {
                                container.scrollTop = top;
                            }
                        }
                    }
                    $timeout(function () {
                        doScroll(8);
                    });
                };

                vm.openConfig = function (table) {
                    vm.editing = table;
                    vm.draft = {
                        searchFields: table.searchFields,
                        additionalFilter: table.additionalFilter,
                    };
                    vm.validation = {};
                    vm.currentTableFields = [];

                    if (vm.fieldsCache[table.table]) {
                        vm.currentTableFields = vm.fieldsCache[table.table];
                    } else {
                        vm.loadingFields = true;
                        ajax('getTableFields', { table: table.table })
                            .then(function (data) {
                                vm.loadingFields = false;
                                var fields = (data && data.fields) || [];
                                vm.fieldsCache[table.table] = fields;
                                if (vm.editing && vm.editing.table === table.table) {
                                    vm.currentTableFields = fields;
                                }
                            })
                            .catch(function (e) {
                                vm.loadingFields = false;
                                vm.validation = {
                                    error: 'Failed to load table fields: ' + e.message,
                                };
                            });
                    }
                };

                vm.closeConfig = function () {
                    vm.editing = null;
                    vm.currentTableFields = [];
                    vm.validation = {};
                };

                vm.applyConfig = function () {
                    if (!vm.editing) return;
                    var raw = (vm.draft.searchFields || '')
                        .split(',')
                        .map(function (s) {
                            return s.trim();
                        })
                        .filter(Boolean);
                    if (!raw.length) {
                        vm.validation = {
                            error: 'At least one valid search field is required.',
                        };
                        return;
                    }
                    var validFields = vm.fieldsCache[vm.editing.table] || vm.currentTableFields || [];
                    if (validFields.length > 0) {
                        var validMap = {};
                        validFields.forEach(function (f) {
                            validMap[f.id] = true;
                        });
                        for (var i = 0; i < raw.length; i++) {
                            if (!validMap[raw[i]]) {
                                vm.validation = {
                                    error: 'Field "' + raw[i] + '" does not exist on table ' + vm.editing.table + '.',
                                };
                                return;
                            }
                        }
                    }
                    vm.editing.searchFields = raw.join(',');
                    vm.editing.searchFieldsDisplay = raw.join(', ');
                    vm.editing.additionalFilter = (vm.draft.additionalFilter || '').trim();
                    vm.closeConfig();
                    notify('Filter applied for this search session');
                };

                vm.validateFilter = function () {
                    if (!vm.editing) return;
                    vm.validating = true;
                    vm.validation = {};
                    ajax('validateFilter', {
                        config_id: vm.editing.sysId,
                        filter: vm.draft.additionalFilter || '',
                    })
                        .then(function (data) {
                            vm.validation = {
                                ok: true,
                                message: data.message || 'Filter is valid.',
                                matchCount: data.matchCount,
                                listUrl: data.listUrl,
                            };
                            vm.validating = false;
                        })
                        .catch(function (e) {
                            vm.validation = { error: e.message };
                            vm.validating = false;
                        });
                };

                vm.resetSessionConfig = function () {
                    if (!vm.editing) return;
                    var origFields = vm.editing.originalSearchFields || '';
                    var origFilter = vm.editing.originalAdditionalFilter || '';
                    vm.draft.searchFields = origFields;
                    vm.draft.additionalFilter = origFilter;
                    vm.editing.searchFields = origFields;
                    vm.editing.searchFieldsDisplay = origFields
                        .split(',')
                        .map(function (f) {
                            return f.trim();
                        })
                        .filter(Boolean)
                        .join(', ');
                    vm.editing.additionalFilter = origFilter;
                    vm.validation = {};
                    notify('Reset to Code Search Table configuration');
                };

                function _normalizeFields(fieldsStr) {
                    return (fieldsStr || '')
                        .split(',')
                        .map(function (s) {
                            return s.trim();
                        })
                        .filter(Boolean)
                        .sort()
                        .join(',');
                }

                function _normalizeFilter(filterStr) {
                    return (filterStr || '').trim();
                }

                vm.hasCustomSessionConfig = function (table) {
                    if (!table) return false;
                    var origFields = _normalizeFields(table.originalSearchFields);
                    var curFields = _normalizeFields(table.searchFields);
                    if (origFields !== curFields) return true;

                    var origFilter = _normalizeFilter(table.originalAdditionalFilter);
                    var curFilter = _normalizeFilter(table.additionalFilter);
                    if (origFilter !== curFilter) return true;

                    return false;
                };

                vm.getTableByTableName = function (tableName) {
                    if (!tableName || !vm.tables) return null;
                    for (var i = 0; i < vm.tables.length; i++) {
                        if (vm.tables[i].table === tableName) return vm.tables[i];
                    }
                    return null;
                };

                vm.hasCustomSessionConfigForTable = function (tableName) {
                    var t = vm.getTableByTableName(tableName);
                    return t ? vm.hasCustomSessionConfig(t) : false;
                };

                vm.getSessionConfigTooltip = function (table) {
                    if (!table || !vm.hasCustomSessionConfig(table)) return '';
                    var changes = [];
                    if (_normalizeFields(table.searchFields) !== _normalizeFields(table.originalSearchFields)) {
                        changes.push('search fields modified');
                    }
                    if (_normalizeFilter(table.additionalFilter) !== _normalizeFilter(table.originalAdditionalFilter)) {
                        changes.push('additional query modified');
                    }
                    return 'Custom session configuration: ' + changes.join(', ');
                };

                vm.getSessionConfigTooltipForTable = function (tableName) {
                    var t = vm.getTableByTableName(tableName);
                    return t ? vm.getSessionConfigTooltip(t) : '';
                };

                vm.getTableRecordUrl = function (table) {
                    if (!table || !table.sysId) return '#';
                    return '/nav_to.do?uri=' + encodeURIComponent('sn_codesearch_table.do?sys_id=' + table.sysId);
                };

                vm.onSearchSubmit = function () {
                    vm.runSearch();
                };

                vm.runSearch = function () {
                    if (!vm.selectedGroupId || !vm.query.trim()) return;
                    if (
                        vm.secondaryFilters.some(function (filter) {
                            return !filter.term.trim();
                        })
                    ) {
                        notify('Enter a term for each secondary filter or remove the empty row.');
                        return;
                    }
                    ++tableScrollRequest;
                    var resultsContainer = document.getElementById('cs-results-container');
                    if (resultsContainer) resultsContainer.scrollTop = 0;
                    _disposeAllEditors();
                    updateUrlParam(vm.query.trim());

                    var enabledTables = (vm.tables || []).filter(function (t) {
                        return t.enabled;
                    });
                    var total = enabledTables.length;
                    if (!total) {
                        notify('No tables are enabled for search.');
                        return;
                    }

                    var gen = ++currentSearchGen;
                    var started = Date.now();
                    vm.loading = true;
                    vm.hasSearched = true;
                    vm.results = [];
                    vm.tableMatchCounts = {};
                    vm.tableActiveFields = {};
                    vm.searchedTables = 0;
                    vm.searchProgress = {
                        completed: 0,
                        total: total,
                        percent: 0,
                        currentTable: enabledTables[0].label || enabledTables[0].table,
                    };
                    vm.paneResultsOpen = true;
                    vm.paneGroupOpen = false;
                    _updateTablesWithResults();
                    _updateGroupedResults();
                    _updateSortedResults();

                    // Capture the search inputs once so edits cannot change a continuation.
                    // Finish every batch for the current table before starting the next table.
                    var pendingTables = enabledTables.map(function (table) {
                        var overrides = {};
                        overrides[table.sysId] = {
                            enabled: true,
                            searchFields: table.searchFields,
                            additionalFilter: table.additionalFilter,
                        };
                        return {
                            table: table.table,
                            label: table.label || table.table,
                            params: {
                                group_id: vm.selectedGroupId,
                                table_config_id: table.sysId,
                                query: vm.query,
                                secondary_filters: JSON.stringify(vm.secondaryFilters),
                                overrides: JSON.stringify(overrides),
                                case_sensitive: vm.caseSensitive ? 'true' : 'false',
                                active_only: vm.activeOnly ? 'true' : 'false',
                                batch_size: 25,
                                cursor: '',
                            },
                        };
                    });
                    var nextIndex = 0;
                    var completedCount = 0;
                    var accumulatedResults = [];
                    var allSkipped = [];

                    vm.cancelSearch = function () {
                        if (currentSearchGen !== gen) return;
                        ++currentSearchGen;
                        vm.loading = false;
                        vm.results = accumulatedResults;
                        vm.elapsed = Date.now() - started;
                        vm.searchProgress.currentTable = '';
                        _updateGroupedResults();
                        _updateTablesWithResults();
                        _updateSortedResults();
                        $timeout(_updateCurrentViewedTable);
                        _requestTransactionCancel();
                        notify('Search cancelled after ' + completedCount + ' of ' + total + ' tables.');
                    };

                    function searchNext() {
                        if (currentSearchGen !== gen) return $q.when();
                        if (nextIndex >= pendingTables.length) return $q.when();
                        var table = pendingTables[nextIndex++];

                        vm.searchProgress.currentTable = table.label || table.table;

                        return searchBatch(table)
                            .catch(function (err) {
                                if (currentSearchGen !== gen) return;
                                var label = table.label || table.table;
                                allSkipped.push(
                                    err && err.message === 'Timed out'
                                        ? label + ': search took too long and was skipped'
                                        : label + ': ' + ((err && err.message) || 'search failed')
                                );
                            })
                            .then(function () {
                                if (currentSearchGen !== gen) return;
                                completedCount++;
                                vm.searchedTables = completedCount;
                                vm.searchProgress.completed = completedCount;
                                vm.searchProgress.percent = Math.round((completedCount / total) * 100);
                                return searchNext();
                            });
                    }

                    function searchBatch(table) {
                        if (currentSearchGen !== gen) return $q.when();
                        return ajaxWithTimeout('search', table.params, TABLE_SEARCH_TIMEOUT_MS).then(function (data) {
                            if (currentSearchGen !== gen) return;

                            var tableResults = (data && data.results) || [];
                            tableResults.forEach(function (r) {
                                if (r && (!r.url || r.url.indexOf('/nav_to.do?uri=') !== 0)) {
                                    r.url =
                                        '/nav_to.do?uri=' +
                                        encodeURIComponent((r.table || table.table) + '.do?sys_id=' + r.sysId);
                                }
                            });
                            if (tableResults.length > 0) {
                                accumulatedResults = accumulatedResults.concat(tableResults);
                                vm.results = accumulatedResults;
                                _updateGroupedResults();
                                _updateTablesWithResults();
                                _updateSortedResults();
                            }
                            if (data && data.skipped && data.skipped.length) {
                                allSkipped = allSkipped.concat(data.skipped);
                            }

                            vm.elapsed = Date.now() - started;
                            if (data && data.nextCursor) {
                                if (data.nextCursor === table.params.cursor)
                                    throw new Error('Search cursor did not advance');
                                table.params.cursor = data.nextCursor;
                                return searchBatch(table);
                            }
                        });
                    }

                    searchNext()
                        .then(function () {
                            if (currentSearchGen !== gen) return;
                            vm.results = accumulatedResults;
                            vm.elapsed = Date.now() - started;
                            vm.loading = false;
                            vm.searchProgress.percent = 100;
                            vm.searchProgress.currentTable = '';
                            _updateGroupedResults();
                            _updateTablesWithResults();
                            _updateSortedResults();
                            vm.paneResultsOpen = true;
                            vm.paneGroupOpen = false;
                            $timeout(_updateCurrentViewedTable);
                            if (allSkipped.length) {
                                notify(allSkipped.length + ' table configuration(s) skipped');
                            }
                        })
                        .catch(function (e) {
                            if (currentSearchGen !== gen) return;
                            vm.loading = false;
                            vm.searchProgress.currentTable = '';
                            notify(e ? e.message : 'Search encountered an error');
                        });
                };

                vm.formatDate = function (dateStr) {
                    if (!dateStr) return '';
                    var s = String(dateStr).trim();
                    var iso = s.replace(' ', 'T');
                    if (!iso.endsWith('Z') && !iso.includes('+')) iso += 'Z';
                    var d = new Date(iso);
                    if (isNaN(d.getTime())) d = new Date(s);
                    if (isNaN(d.getTime())) return dateStr;
                    return d.toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                    });
                };

                vm.getGroupedResults = function () {
                    return vm.groupedResults;
                };

                // At least one field must stay included, so results are never entirely hidden.
                vm.isLastActiveField = function (group, field) {
                    var active = vm.tableActiveFields[group.table];
                    if (!active || active[field] === false) return false;
                    var activeCount = (group.fields || []).filter(function (f) {
                        return active[f.field] !== false;
                    }).length;
                    return activeCount <= 1;
                };

                vm.toggleGroupField = function (group, field) {
                    var active = vm.tableActiveFields[group.table];
                    if (!active) return;
                    if (vm.isLastActiveField(group, field)) return;
                    active[field] = active[field] === false;
                    _applyFieldFilter(group);
                    vm.tableMatchCounts[group.table] = group.records.length;
                    _updateTablesWithResults();
                    _updateSortedResults();
                    vm.scrollToTable(group.table, {
                        forceTop: true,
                        smooth: true,
                    });
                };

                vm.hasExcludedResultFields = function (table) {
                    var active = vm.tableActiveFields[table];
                    if (!active) return false;
                    return Object.keys(active).some(function (field) {
                        return active[field] === false;
                    });
                };

                function _fieldsOrClause(fields, operator, value) {
                    return fields
                        .map(function (f) {
                            return f + operator + value;
                        })
                        .join('^OR');
                }

                // Builds a nav_to.do link to the table's list view scoped to only the toggled-on
                // fields for the primary term, plus the advanced AND/OR conditions applied the
                // same way the search itself evaluates them (left to right, no precedence
                // grouping). DOES NOT CONTAIN conditions are ANDed across fields (a record must be
                // missing the term from every field), which can't be flattened into the OR chain
                // when it follows an OR joiner — in that rare case it's ANDed in instead.
                vm.getGroupListUrl = function (group) {
                    if (!vm.query) return null;
                    var activeFields = (group.fields || [])
                        .filter(function (f) {
                            return _fieldIsActive(group.table, f.field);
                        })
                        .map(function (f) {
                            return f.field;
                        });
                    if (!activeFields.length) return null;

                    var tableCfg = null;
                    for (var i = 0; i < (vm.tables || []).length; i++) {
                        if (vm.tables[i].table === group.table) {
                            tableCfg = vm.tables[i];
                            break;
                        }
                    }
                    var allFields =
                        tableCfg && tableCfg.searchFields
                            ? String(tableCfg.searchFields)
                                  .split(',')
                                  .map(function (s) {
                                      return s.trim();
                                  })
                                  .filter(Boolean)
                            : activeFields;

                    var primaryClause = _fieldsOrClause(activeFields, 'LIKE', vm.query);
                    var segments = [{ pieces: primaryClause ? [primaryClause] : [] }];

                    (vm.secondaryFilters || []).forEach(function (filter, idx) {
                        if (!filter || !filter.term) return;
                        var fields = allFields.length ? allFields : activeFields;
                        var joiner = idx === 0 ? 'and' : filter.joiner === 'or' ? 'or' : 'and';
                        if (filter.operator === 'not_contains') {
                            var andClause = fields
                                .map(function (f) {
                                    return f + 'NOTLIKE' + filter.term;
                                })
                                .join('^');
                            segments.push({ pieces: [andClause] });
                        } else {
                            var orClause = _fieldsOrClause(fields, 'LIKE', filter.term);
                            if (joiner === 'or' && segments.length) {
                                segments[segments.length - 1].pieces.push(orClause);
                            } else {
                                segments.push({ pieces: [orClause] });
                            }
                        }
                    });

                    var encodedQuery = segments
                        .map(function (seg) {
                            return seg.pieces.join('^OR');
                        })
                        .filter(Boolean)
                        .join('^');

                    if (tableCfg && tableCfg.additionalFilter) {
                        encodedQuery = tableCfg.additionalFilter + (encodedQuery ? '^' + encodedQuery : '');
                    }

                    var listPath = group.table + '_list.do' + (encodedQuery ? '?sysparm_query=' + encodedQuery : '');
                    return '/nav_to.do?uri=' + encodeURIComponent(listPath);
                };

                vm.clearResults = function () {
                    currentSearchGen++;
                    _disposeAllEditors();
                    vm.results = [];
                    vm.tableMatchCounts = {};
                    vm.tableActiveFields = {};
                    vm.hasSearched = false;
                    vm.loading = false;
                    vm.elapsed = null;
                    vm.paneResultsOpen = false;
                    vm.paneGroupOpen = true;
                    vm.searchProgress = {
                        completed: 0,
                        total: 0,
                        percent: 0,
                        currentTable: '',
                    };
                    _updateTablesWithResults();
                    _updateGroupedResults();
                    _updateSortedResults();
                    updateUrlParam('');
                };

                var _highlightCache = {};
                var _highlightCacheKey = '';

                var _codeKeywords = {
                    break: true,
                    case: true,
                    catch: true,
                    class: true,
                    const: true,
                    continue: true,
                    debugger: true,
                    default: true,
                    delete: true,
                    do: true,
                    else: true,
                    export: true,
                    extends: true,
                    finally: true,
                    for: true,
                    function: true,
                    if: true,
                    import: true,
                    in: true,
                    instanceof: true,
                    let: true,
                    new: true,
                    return: true,
                    switch: true,
                    throw: true,
                    try: true,
                    typeof: true,
                    var: true,
                    void: true,
                    while: true,
                    with: true,
                    yield: true,
                    async: true,
                    await: true,
                    of: true,
                    this: true,
                    super: true,
                };
                var _codeLiterals = {
                    true: true,
                    false: true,
                    null: true,
                    undefined: true,
                };

                function _codeTokens(raw, startsInBlockComment) {
                    var tokens = [];
                    var i = 0;
                    var inBlockComment = !!startsInBlockComment;

                    function add(text, type) {
                        if (!text) return;
                        var previous = tokens[tokens.length - 1];
                        if (previous && previous.type === type) previous.text += text;
                        else tokens.push({ text: text, type: type });
                    }

                    while (i < raw.length) {
                        var start = i;
                        var ch = raw.charAt(i);
                        var next = raw.charAt(i + 1);

                        if (inBlockComment) {
                            var close = raw.indexOf('*/', i);
                            if (close === -1) {
                                add(raw.substring(i), 'comment');
                                break;
                            }
                            add(raw.substring(i, close + 2), 'comment');
                            i = close + 2;
                            inBlockComment = false;
                            continue;
                        }
                        if (ch === '/' && next === '/') {
                            var newline = raw.indexOf('\n', i);
                            if (newline === -1) {
                                add(raw.substring(i), 'comment');
                                break;
                            }
                            add(raw.substring(i, newline), 'comment');
                            add('\n', '');
                            i = newline + 1;
                            continue;
                        }
                        if (ch === '/' && next === '*') {
                            inBlockComment = true;
                            continue;
                        }
                        if (ch === "'" || ch === '"' || ch === '`') {
                            var quote = ch;
                            i++;
                            var escaped = false;
                            while (i < raw.length) {
                                var stringChar = raw.charAt(i++);
                                if (escaped) escaped = false;
                                else if (stringChar === '\\') escaped = true;
                                else if (stringChar === quote) break;
                                else if (stringChar === '\n' && quote !== '`') break;
                            }
                            add(raw.substring(start, i), 'string');
                            continue;
                        }
                        if (/[0-9]/.test(ch) && (i === 0 || !/[A-Za-z0-9_$]/.test(raw.charAt(i - 1)))) {
                            var numberMatch = raw
                                .substring(i)
                                .match(/^(?:0[xob][0-9a-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
                            if (numberMatch) {
                                add(numberMatch[0], 'number');
                                i += numberMatch[0].length;
                                continue;
                            }
                        }
                        if (/[A-Za-z_$]/.test(ch)) {
                            i++;
                            while (i < raw.length && /[A-Za-z0-9_$]/.test(raw.charAt(i))) i++;
                            var word = raw.substring(start, i);
                            add(word, _codeKeywords[word] ? 'keyword' : _codeLiterals[word] ? 'literal' : '');
                            continue;
                        }
                        add(ch, '');
                        i++;
                    }
                    return tokens;
                }

                function _findRanges(searchable, find) {
                    var out = [];
                    if (!find) return out;
                    var searchAt = 0;
                    var foundAt;
                    while ((foundAt = searchable.indexOf(find, searchAt)) !== -1) {
                        out.push({
                            start: foundAt,
                            end: foundAt + find.length,
                        });
                        searchAt = foundAt + find.length;
                    }
                    return out;
                }

                function _mergeRanges(ranges) {
                    if (!ranges.length) return [];
                    var sorted = ranges.slice().sort(function (a, b) {
                        return a.start - b.start;
                    });
                    var out = [{ start: sorted[0].start, end: sorted[0].end }];
                    for (var i = 1; i < sorted.length; i++) {
                        var last = out[out.length - 1];
                        if (sorted[i].start <= last.end) {
                            last.end = Math.max(last.end, sorted[i].end);
                        } else {
                            out.push({
                                start: sorted[i].start,
                                end: sorted[i].end,
                            });
                        }
                    }
                    return out;
                }

                // Clips ranges (sorted, non-overlapping) to remove any overlap with blockers
                // (also sorted, non-overlapping), so a secondary-filter match that coincides with
                // the primary query match yields to the primary highlight instead of stacking marks.
                function _subtractRanges(ranges, blockers) {
                    if (!blockers.length) return ranges;
                    var out = [];
                    ranges.forEach(function (r) {
                        var segments = [{ start: r.start, end: r.end }];
                        blockers.forEach(function (b) {
                            var next = [];
                            segments.forEach(function (s) {
                                if (b.end <= s.start || b.start >= s.end) {
                                    next.push(s);
                                    return;
                                }
                                if (b.start > s.start) next.push({ start: s.start, end: b.start });
                                if (b.end < s.end) next.push({ start: b.end, end: s.end });
                            });
                            segments = next;
                        });
                        out = out.concat(segments);
                    });
                    return out;
                }

                vm.highlightCode = function (text, startsInBlockComment) {
                    function esc(v) {
                        var div = document.createElement('div');
                        div.textContent = String(v || '');
                        return div.innerHTML;
                    }
                    var raw = String(text || '');
                    var needle = String(vm.query || '');
                    var secondaryTerms = (vm.secondaryFilters || [])
                        .filter(function (f) {
                            return f.operator === 'contains' && f.term && f.term.trim();
                        })
                        .map(function (f) {
                            return f.term;
                        });
                    var cacheKey = JSON.stringify([needle, secondaryTerms, !!vm.caseSensitive, !!startsInBlockComment]);
                    if (cacheKey !== _highlightCacheKey) {
                        _highlightCache = {};
                        _highlightCacheKey = cacheKey;
                    }
                    if (Object.prototype.hasOwnProperty.call(_highlightCache, raw)) {
                        return _highlightCache[raw];
                    }

                    var searchable = vm.caseSensitive ? raw : raw.toLowerCase();
                    var find = vm.caseSensitive ? needle : needle.toLowerCase();
                    var primaryRanges = _findRanges(searchable, find);

                    var secondaryRanges = _mergeRanges(
                        secondaryTerms.reduce(function (acc, term) {
                            var secFind = vm.caseSensitive ? term : term.toLowerCase();
                            return acc.concat(_findRanges(searchable, secFind));
                        }, [])
                    );
                    secondaryRanges = _subtractRanges(secondaryRanges, primaryRanges);

                    var ranges = primaryRanges
                        .map(function (r) {
                            return {
                                start: r.start,
                                end: r.end,
                                kind: 'primary',
                            };
                        })
                        .concat(
                            secondaryRanges.map(function (r) {
                                return {
                                    start: r.start,
                                    end: r.end,
                                    kind: 'secondary',
                                };
                            })
                        )
                        .sort(function (a, b) {
                            return a.start - b.start;
                        });

                    var offset = 0;
                    var rangeIndex = 0;
                    var out = '';
                    _codeTokens(raw, startsInBlockComment).forEach(function (token) {
                        var tokenStart = offset;
                        var tokenEnd = offset + token.text.length;
                        var localAt = 0;
                        var tokenHtml = '';

                        while (rangeIndex < ranges.length && ranges[rangeIndex].end <= tokenStart) rangeIndex++;
                        var currentRange = rangeIndex;
                        while (localAt < token.text.length) {
                            var globalAt = tokenStart + localAt;
                            while (currentRange < ranges.length && ranges[currentRange].end <= globalAt) currentRange++;
                            var range = ranges[currentRange];
                            var highlighted = !!range && globalAt >= range.start && globalAt < range.end;
                            var boundary = tokenEnd;
                            if (range)
                                boundary = Math.min(
                                    boundary,
                                    highlighted ? range.end : Math.max(globalAt, range.start)
                                );
                            if (boundary <= globalAt) boundary = globalAt + 1;
                            var piece = esc(token.text.substring(localAt, boundary - tokenStart));
                            var markClass =
                                highlighted && range.kind === 'secondary'
                                    ? 'cs-highlight cs-highlight-secondary'
                                    : 'cs-highlight';
                            tokenHtml += highlighted ? '<mark class="' + markClass + '">' + piece + '</mark>' : piece;
                            localAt = boundary - tokenStart;
                        }
                        out += token.type
                            ? '<span class="cs-token-' + token.type + '">' + tokenHtml + '</span>'
                            : tokenHtml;
                        offset = tokenEnd;
                        rangeIndex = currentRange;
                    });

                    var result = $sce.trustAsHtml(out);
                    _highlightCache[raw] = result;
                    return result;
                };

                function _disposeAllEditors() {
                    if (vm.results && vm.results.length) {
                        vm.results.forEach(function (r) {
                            if (r.matches) {
                                r.matches.forEach(function (m) {
                                    if (m._editor) {
                                        try {
                                            m._editor.dispose();
                                        } catch (e) {}
                                        m._editor = null;
                                    }
                                    m.expanded = false;
                                });
                            }
                        });
                    }
                }

                function _ensureMonacoWorker() {
                    if (!window.MonacoEnvironment) {
                        window.MonacoEnvironment = {};
                    }
                    if (typeof window.MonacoEnvironment.getWorker === 'function') {
                        return;
                    }
                    var wb = '/scripts/snc-code-editor/';
                    window.MonacoEnvironment.getWorker = function (workerId, label) {
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
                        var blob = new Blob(['importScripts(' + JSON.stringify(location.origin + f) + ')'], {
                            type: 'application/javascript',
                        });
                        return new Worker(URL.createObjectURL(blob));
                    };
                }

                function _detectLanguage(fieldName, content) {
                    var f = String(fieldName || '').toLowerCase();
                    if (f.indexOf('template') > -1 || f.indexOf('html') > -1) return 'html';
                    if (f.indexOf('css') > -1 || f.indexOf('scss') > -1) return 'css';
                    if (f.indexOf('schema') > -1 || f.indexOf('json') > -1) return 'json';
                    if (f.indexOf('xml') > -1) return 'xml';
                    return 'javascript';
                }

                // Code Search follows the ServiceNow UI theme, independently of the
                // editorTheme preference used by Widget Editor+ itself.
                function _getUiMonacoTheme() {
                    try {
                        var bg = window
                            .getComputedStyle(document.documentElement)
                            .getPropertyValue('--now-color_background--primary')
                            .trim();
                        if (bg) {
                            var parts = bg.split(/[\s,]+/).map(Number);
                            if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                                return (parts[0] + parts[1] + parts[2]) / 3 >= 128 ? 'vs' : 'vs-dark';
                            }
                        }
                    } catch (e) {}

                    try {
                        if (window.NOW && window.NOW.theme && window.NOW.theme.name) {
                            return /dark/i.test(window.NOW.theme.name) ? 'vs-dark' : 'vs';
                        }
                    } catch (eNow) {}

                    return 'vs';
                }

                var _currentUiMonacoTheme = '';
                function _syncUiMonacoTheme() {
                    var theme = _getUiMonacoTheme();
                    if (theme === _currentUiMonacoTheme) return;
                    _currentUiMonacoTheme = theme;
                    if (window.monaco && window.monaco.editor) {
                        window.monaco.editor.setTheme(theme);
                    }
                }

                function _watchUiMonacoTheme() {
                    _syncUiMonacoTheme();
                    if (!window.MutationObserver) return;

                    var queued = false;
                    var observer = new MutationObserver(function () {
                        if (queued) return;
                        queued = true;
                        window.requestAnimationFrame(function () {
                            queued = false;
                            _syncUiMonacoTheme();
                        });
                    });
                    observer.observe(document.documentElement, {
                        attributes: true,
                    });
                    if (document.body) observer.observe(document.body, { attributes: true });
                    if (document.head) {
                        observer.observe(document.head, {
                            attributes: true,
                            childList: true,
                            characterData: true,
                            subtree: true,
                        });
                    }
                }

                function _highlightQueryInEditor(editor, query, targetLine) {
                    if (!editor || !query) return;
                    var q = String(query).trim();
                    if (!q) return;

                    var matchCase = !!vm.caseSensitive;

                    // Opening the controller directly lets us opt out of Monaco's default behavior
                    // of replacing the requested query with the word currently under the cursor.
                    try {
                        var findController = editor.getContribution('editor.contrib.findController');
                        if (findController) {
                            findController.start({
                                forceRevealReplace: false,
                                seedSearchStringFromSelection: false,
                                shouldFocus: 1,
                                shouldAnimate: false,
                            });
                            var state = findController.getState();
                            if (state) {
                                state.change(
                                    {
                                        searchString: q,
                                        isRegex: false,
                                        matchCase: matchCase,
                                        wholeWord: false,
                                    },
                                    false
                                );
                            }
                        }
                    } catch (efc) {}

                    // Scroll to the line returned by the code search.
                    if (targetLine) {
                        try {
                            editor.revealLineInCenter(targetLine);
                            editor.setPosition({
                                lineNumber: targetLine,
                                column: 1,
                            });
                        } catch (ePos) {}
                    }
                }

                vm.getMonacoHostId = function (result, match, index) {
                    return 'monaco-host-' + result.table + '-' + result.sysId + '-' + match.field + '-' + index;
                };

                vm.toggleMatchExpand = function (result, match, index) {
                    if (match.expanded) {
                        vm.collapseMatch(match);
                    } else {
                        if (vm.loading) return;
                        vm.expandMatch(result, match, index);
                    }
                };

                vm.collapseMatch = function (match) {
                    match.expanded = false;
                    match.loading = false;
                    if (match._editor) {
                        try {
                            match._editor.dispose();
                        } catch (e) {}
                        match._editor = null;
                    }
                };

                vm.expandMatch = function (result, match, index) {
                    match.expanded = true;
                    match.loading = true;

                    ajax('getFieldContent', {
                        table: result.table,
                        sys_id: result.sysId,
                        field: match.field,
                    })
                        .then(function (data) {
                            match.loading = false;
                            $timeout(function () {
                                var hostId = vm.getMonacoHostId(result, match, index);
                                var container = document.getElementById(hostId);
                                if (!container) return;
                                _ensureMonacoWorker();

                                if (match._editor) {
                                    try {
                                        match._editor.dispose();
                                    } catch (e) {}
                                    match._editor = null;
                                }

                                if (window.monaco && window.monaco.editor) {
                                    var lang = _detectLanguage(match.field, data.content);
                                    var uiTheme = _getUiMonacoTheme();
                                    // Set the global theme before Monaco creates any DOM so it never
                                    // paints its default dark theme on the way to a light editor.
                                    window.monaco.editor.setTheme(uiTheme);
                                    var editor = window.monaco.editor.create(container, {
                                        value: data.content || '',
                                        language: lang,
                                        theme: uiTheme,
                                        readOnly: true,
                                        automaticLayout: true,
                                        lineNumbers: 'on',
                                        scrollBeyondLastLine: false,
                                        minimap: { enabled: false },
                                    });
                                    match._editor = editor;

                                    var line = match.line || 1;
                                    editor.setPosition({
                                        lineNumber: line,
                                        column: 1,
                                    });
                                    editor.revealLineInCenter(line);

                                    _highlightQueryInEditor(editor, vm.query, line);
                                    $timeout(function () {
                                        _highlightQueryInEditor(editor, vm.query, line);
                                    }, 80);
                                }
                            }, 60);
                        })
                        .catch(function (e) {
                            match.loading = false;
                            match.expanded = false;
                            notify('Could not load code: ' + e.message);
                        });
                };

                // Initialize
                _watchUiMonacoTheme();
                _bindResultsScrollSpy();
                vm.loadGroups();
            },
        ]);

        function _bootstrap() {
            var appEl = document.getElementById('codeSearchApp');
            if (!appEl) {
                setTimeout(_bootstrap, 20);
                return;
            }
            if (!window.angular.element || !angular.element(appEl).injector()) {
                try {
                    angular.bootstrap(appEl, ['codeSearchApp']);
                } catch (e) {
                    console.error('Failed to bootstrap codeSearchApp:', e);
                }
            }
        }
        _bootstrap();
    }

    function _loadScript(src, callback) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = function () {
            if (callback) callback(null);
        };
        s.onerror = function (e) {
            if (callback) callback(e);
        };
        document.head.appendChild(s);
    }

    function _init() {
        if (typeof angular !== 'undefined') {
            _initAngular();
            return;
        }

        var attempts = 0;
        var timer = setInterval(function () {
            attempts++;
            if (typeof angular !== 'undefined') {
                clearInterval(timer);
                _initAngular();
            } else if (attempts === 15) {
                _loadScript('/scripts/angular_1.5.11/angular.min.js', function () {
                    if (typeof angular !== 'undefined') {
                        clearInterval(timer);
                        _initAngular();
                    }
                });
            } else if (attempts > 120) {
                clearInterval(timer);
                console.error('AngularJS failed to load within timeout');
            }
        }, 50);
    }

    if (typeof addAfterPageLoadedEvent === 'function') {
        addAfterPageLoadedEvent(_init);
    } else if (document.readyState !== 'loading') {
        _init();
    } else {
        document.addEventListener('DOMContentLoaded', _init);
    }
})();

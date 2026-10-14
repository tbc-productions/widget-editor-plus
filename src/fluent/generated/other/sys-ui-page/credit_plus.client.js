(function () {
    'use strict';
    function initialise() {
        var page = document.getElementById('credit-plus');
        if (!page || !window.angular || angular.element(page).injector()) return;
        var app = angular.module('weCredit', []);
        app.controller('CreditCtrl', [
            '$scope',
            function ($scope) {
                var ctrl = this;
                ctrl.fields = [];
                ctrl.recordName = '';
                ctrl.tableLabel = '';
                ctrl.loading = false;
                ctrl.status = '';
                ctrl.error = false;
                ctrl.empty = false;
                var cleanups = [];
                function listen(target, event, handler, options) {
                    target.addEventListener(event, handler, options);
                    cleanups.push(function () {
                        target.removeEventListener(event, handler, options);
                    });
                }
                function changed() {
                    if (!$scope.$$destroyed) $scope.$evalAsync();
                }

                var config = window.WE_CREDIT_CONFIG || {},
                    params = new URLSearchParams(window.location.search);
                var requestTimeout =
                    isFinite(Number(config.requestTimeout)) && Number(config.requestTimeout) > 0
                        ? Math.min(Number(config.requestTimeout), 2147483000)
                        : 180000;
                ctrl.whitespaceOptions = [
                    { value: 'none', label: 'Show all changes' },
                    { value: 'all', label: 'Ignore whitespace when comparing lines' },
                    { value: 'changes', label: 'Ignore changes in amount of whitespace' },
                    { value: 'eol', label: 'Ignore changes in whitespace at EOL' },
                ];
                ctrl.whitespaceMode = params.get('sysparm_whitespace') || 'all';
                if (
                    !ctrl.whitespaceOptions.some(function (option) {
                        return option.value === ctrl.whitespaceMode;
                    })
                )
                    ctrl.whitespaceMode = 'all';
                ctrl.whitespaceOpen = false;
                ctrl.toggleWhitespace = function () {
                    ctrl.whitespaceOpen = !ctrl.whitespaceOpen;
                    if (ctrl.whitespaceOpen)
                        $scope.$$postDigest(function () {
                            document.querySelector('#cp-whitespace-popover input:checked').focus();
                        });
                };
                function closeWhitespace(restoreFocus) {
                    if (!ctrl.whitespaceOpen) return;
                    ctrl.whitespaceOpen = false;
                    if (restoreFocus) document.getElementById('cp-whitespace-button').focus();
                    changed();
                }
                listen(document, 'click', function (event) {
                    if (!event.target.closest('#cp-whitespace-control')) closeWhitespace(false);
                });
                listen(document, 'focusin', function (event) {
                    if (!event.target.closest('#cp-whitespace-control')) closeWhitespace(false);
                });
                listen(document, 'keydown', function (event) {
                    if (event.key === 'Escape' && ctrl.whitespaceOpen) {
                        event.preventDefault();
                        closeWhitespace(true);
                    }
                });
                ctrl.changeWhitespace = function () {
                    closeMenu(false);
                    fieldViews.forEach(function (view) {
                        view.recalculate();
                    });
                    var statisticsOpen = ctrl.statistics.open;
                    resetStatistics();
                    ctrl.statistics.open = statisticsOpen;
                    if (statisticsOpen) loadStatistics();
                    updateUrl();
                    updateTitle();
                };
                var openStatisticsOnLoad = params.get('sysparm_statistics') === 'true';
                var launchUrl = window.location.pathname.substring(1) + window.location.search,
                    notifiedTitle = '',
                    notifiedUrl = '';
                ctrl.updateSets = [];
                ctrl.selectedSet = null;
                var updateId = params.get('sysparm_update') || '',
                    requestedField = params.get('sysparm_field') || '',
                    tableName = params.get('sysparm_table') || '',
                    recordId = params.get('sysparm_record') || '';
                var tablePicker,
                    recordPicker,
                    pickerTimers = [],
                    pickerRequests = [0, 0];
                var data,
                    fieldViews = [],
                    pendingScrollSection,
                    sequence = 0,
                    titleTimer,
                    contextTimer;

                var historyCache;
                function clearHistory() {
                    if (historyCache) {
                        historyCache.cancelled = true;
                        historyCache.requests.forEach(function (request) {
                            request.abort();
                        });
                    }
                    historyCache = null;
                }
                function tableApi(path, query, cache) {
                    return new Promise(function (resolve, reject) {
                        var xhr = new XMLHttpRequest();
                        cache.requests.push(xhr);
                        xhr.open('GET', '/api/now/table/' + path + '?' + query.toString());
                        xhr.setRequestHeader('Accept', 'application/json');
                        if (window.g_ck) xhr.setRequestHeader('X-UserToken', window.g_ck);
                        xhr.timeout = requestTimeout;
                        function finish(error, result) {
                            var index = cache.requests.indexOf(xhr);
                            if (index !== -1) cache.requests.splice(index, 1);
                            if (error) reject(error);
                            else resolve(result);
                        }
                        xhr.onload = function () {
                            if (xhr.status !== 200) {
                                finish(
                                    new Error(
                                        xhr.status === 401 || xhr.status === 403
                                            ? 'Customer Update Table API access was denied. Check your session and table access.'
                                            : 'Customer Updates could not be retrieved (HTTP ' +
                                              xhr.status +
                                              '). Retry the field.'
                                    )
                                );
                                return;
                            }
                            try {
                                var response = JSON.parse(xhr.responseText);
                                if (!Array.isArray(response.result)) throw new Error('Invalid Table API response.');
                                finish(null, response.result);
                            } catch (error) {
                                finish(error);
                            }
                        };
                        xhr.onerror = function () {
                            finish(
                                new Error('Customer Updates could not be retrieved. Check your connection and retry.')
                            );
                        };
                        xhr.ontimeout = function () {
                            finish(new Error('Customer Update retrieval timed out. Retry the field.'));
                        };
                        xhr.onabort = function () {
                            finish(new Error('History loading was cancelled.'));
                        };
                        if (cache.cancelled) xhr.onabort();
                        else xhr.send();
                    });
                }
                function extractSnapshot(raw, entry, context) {
                    var snapshot = Object.assign({}, entry, { values: Object.create(null) });
                    context.fields.forEach(function (field) {
                        snapshot.values[field.name] = null;
                    });
                    if (
                        !raw ||
                        typeof raw.payload !== 'string' ||
                        !raw.payload ||
                        raw.payload.length > context.tableApi.limits.max_payload_chars ||
                        /<!DOCTYPE|<!ENTITY/i.test(raw.payload)
                    )
                        return snapshot;
                    var doc = new DOMParser().parseFromString(raw.payload, 'application/xml');
                    if (doc.getElementsByTagName('parsererror').length) return snapshot;
                    var root = doc.documentElement;
                    if (!root || root.nodeName !== 'record_update') return snapshot;
                    var table = root.getAttribute('table') || context.table;
                    var records = Array.prototype.filter.call(root.children, function (node) {
                        return node.nodeName === table;
                    });
                    if (records.length !== 1) return snapshot;
                    var record = records[0],
                        values = Object.create(null),
                        duplicate = false;
                    Array.prototype.forEach.call(record.children, function (node) {
                        if (Object.prototype.hasOwnProperty.call(values, node.nodeName)) duplicate = true;
                        values[node.nodeName] = node.textContent || '';
                    });
                    if (duplicate) return snapshot;
                    if (table !== context.table || String(values.sys_id || '').trim() !== context.record)
                        throw new Error('History payloads identify different records. Reload Credit+.');
                    var deleted = record.getAttribute('action') === 'DELETE';
                    snapshot.author = (!deleted && values.sys_updated_by) || entry.author;
                    snapshot.time = (!deleted && values.sys_updated_on) || entry.orderTime;
                    context.fields.forEach(function (field) {
                        snapshot.values[field.name] = deleted
                            ? ''
                            : Object.prototype.hasOwnProperty.call(values, field.name)
                              ? values[field.name].replace(/\r\n?/g, '\n')
                              : null;
                    });
                    return snapshot;
                }
                function showLineCounts(cache) {
                    if (!ctrl.data || !cache.snapshots || historyCache !== cache) return;
                    var selected = cache.byId[ctrl.data.selected];
                    if (!selected) return;
                    ctrl.fields.forEach(function (field) {
                        var code = selected.values[field.name];
                        field.unavailable = typeof code !== 'string';
                        field.disabled = field.unavailable || code === '';
                        field.lineCount =
                            typeof code === 'string' ? (code === '' ? 0 : code.split('\n').length) + ' lines' : '';
                    });
                    ctrl.status = '';
                    ctrl.error = false;
                    changed();
                }
                function sharedHistory(context) {
                    var manifest = context.tableApi;
                    var key =
                        context.table +
                        ':' +
                        context.record +
                        ':' +
                        manifest.key +
                        ':' +
                        JSON.stringify([context.fields, manifest.limits]);
                    if (historyCache && historyCache.key === key && !historyCache.dropped[context.selected])
                        return historyCache.promise;
                    clearHistory();
                    var cache = (historyCache = {
                        key: key,
                        requests: [],
                        cancelled: false,
                        byId: Object.create(null),
                        dropped: Object.create(null),
                        partial: context.partial,
                    });
                    var retained = 0,
                        offset = 0;
                    // Retain the selected snapshot first, then the newest history within the cache budget.
                    var entries = manifest.history.slice().reverse();
                    var selectedIndex = entries.findIndex(function (entry) {
                        return entry.id === context.selected;
                    });
                    if (selectedIndex > 0) entries.unshift(entries.splice(selectedIndex, 1)[0]);
                    function next() {
                        if (cache.cancelled) throw new Error('History loading was cancelled.');
                        if (offset >= entries.length) {
                            cache.snapshots = manifest.history.map(function (entry) {
                                return cache.byId[entry.id];
                            });
                            showLineCounts(cache);
                            return cache;
                        }
                        // Bound each request independently of the total history size.
                        var batch = entries.slice(offset, offset + 100);
                        offset += batch.length;
                        if (
                            batch.some(function (entry) {
                                return !/^[0-9a-f]{32}$/.test(entry.id);
                            })
                        )
                            throw new Error('Invalid Customer Update history.');
                        var query = new URLSearchParams({
                            sysparm_query:
                                'sys_idIN' +
                                batch
                                    .map(function (entry) {
                                        return entry.id;
                                    })
                                    .join(',') +
                                '^ORDERBYsys_id',
                            sysparm_fields:
                                'sys_id,name,payload,sys_updated_on,sys_created_on,sys_mod_count,update_set,remote_update_set',
                            sysparm_limit: String(batch.length),
                            sysparm_display_value: 'false',
                            sysparm_exclude_reference_link: 'true',
                        });
                        return tableApi('sys_update_xml', query, cache).then(function (rows) {
                            if (cache.cancelled) throw new Error('History loading was cancelled.');
                            var byId = Object.create(null);
                            rows.forEach(function (row) {
                                if (
                                    byId[row.sys_id] ||
                                    !batch.some(function (entry) {
                                        return entry.id === row.sys_id;
                                    })
                                )
                                    throw new Error('Unexpected Customer Update response.');
                                byId[row.sys_id] = row;
                            });
                            batch.forEach(function (entry) {
                                var row = byId[entry.id];
                                if (
                                    row &&
                                    (row.name !== manifest.name ||
                                        (row.sys_updated_on || row.sys_created_on || '') !== entry.orderTime ||
                                        (row.sys_created_on || '') !== entry.created ||
                                        Number(row.sys_mod_count || 0) !== entry.revision ||
                                        (row.update_set || '') !== entry.updateSetId ||
                                        (row.remote_update_set || '') !== entry.remoteUpdateSetId)
                                )
                                    throw new Error('Customer Updates changed while loading. Reload Credit+.');
                                var snapshot = extractSnapshot(row, entry, context);
                                var size = context.fields.reduce(function (total, field) {
                                    return total + (snapshot.values[field.name] || '').length;
                                }, 0);
                                if (
                                    retained + size > manifest.limits.max_history_chars &&
                                    entry.id !== context.selected
                                ) {
                                    cache.dropped[entry.id] = true;
                                    snapshot = extractSnapshot(null, entry, context);
                                    cache.partial = true;
                                } else retained += size;
                                cache.byId[entry.id] = snapshot;
                            });
                            return next();
                        });
                    }
                    cache.promise = Promise.resolve()
                        .then(next)
                        .catch(function (error) {
                            if (historyCache === cache) clearHistory();
                            throw error;
                        });
                    return cache.promise;
                }

                function matchBatch(worker, kind, batch, completed, failed) {
                    worker.onmessage = function (event) {
                        changed();
                        if (!event.data || !event.data.success)
                            failed((event.data || {}).error || 'Calculation failed.');
                        else {
                            try {
                                completed(event.data);
                            } catch (error) {
                                failed(error.message || 'Calculation failed.');
                            }
                        }
                    };
                    worker.onerror = function () {
                        failed('The browser worker could not load. Reload Credit+ and retry.');
                    };
                    batch.whitespace = ctrl.whitespaceMode;
                    worker.postMessage({ kind: kind, batch: batch });
                }

                function element(tag, text, className) {
                    var node = document.createElement(tag);
                    if (text !== undefined) node.textContent = text;
                    if (className) node.className = className;
                    return node;
                }

                var borderStyles = element('style'),
                    borderClasses = Object.create(null);
                page.appendChild(borderStyles);
                function updateSetBorder(set) {
                    if (
                        !set ||
                        !/^[0-9a-f]{32}$/i.test(set.id) ||
                        ['sys_update_set', 'sys_remote_update_set'].indexOf(set.table) === -1
                    )
                        return '';
                    var key = set.table + '-' + set.id;
                    if (borderClasses[key]) return borderClasses[key];
                    // Stable IDs keep colours consistent across fields, selections and reloads.
                    var hash = 2166136261;
                    for (var i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
                    var hue = ((hash >>> 0) / 4294967296) * 360,
                        className = 'cp-attribution-border-' + key;
                    borderStyles.appendChild(
                        document.createTextNode(
                            '#credit-plus .' +
                                className +
                                '{box-sizing:border-box;border-bottom:1px solid hsla(' +
                                hue +
                                ',60%,60%,0.45);}'
                        )
                    );
                    borderClasses[key] = className;
                    return className;
                }

                var statisticsRequest = 0,
                    statisticsTimer,
                    statisticsWorker,
                    statisticsScrollFrame;
                ctrl.medals = ['\uD83C\uDFC6', '\uD83E\uDD48', '\uD83E\uDD49'];
                ctrl.skeletonFacts = [0, 1, 2, 3, 4, 5, 6, 7];
                ctrl.skeletonBoards = [0, 1, 2, 3];
                ctrl.skeletonRows = [0, 1, 2];
                function setStatisticsOpen(open) {
                    ctrl.statistics.open = open;
                    window.cancelAnimationFrame(statisticsScrollFrame);
                    if (open)
                        $scope.$evalAsync(function () {
                            if ($scope.$$destroyed || !ctrl.statistics.open) return;
                            window.cancelAnimationFrame(statisticsScrollFrame);
                            statisticsScrollFrame = window.requestAnimationFrame(function () {
                                if ($scope.$$destroyed || !ctrl.statistics.open) return;
                                document.getElementById('cp-statistics').scrollIntoView({
                                    block: 'start',
                                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                                        ? 'auto'
                                        : 'smooth',
                                });
                            });
                        });
                }
                function resetStatistics() {
                    statisticsRequest++;
                    if (statisticsWorker) statisticsWorker.terminate();
                    statisticsWorker = null;
                    window.clearTimeout(statisticsTimer);
                    window.cancelAnimationFrame(statisticsScrollFrame);
                    ctrl.statistics = { open: false, loading: false, loaded: false, error: '', facts: [], boards: [] };
                }
                resetStatistics();
                function statisticsUrl(entry) {
                    var reference = entry.userId ? { id: entry.userId, table: 'sys_user' } : entry.updateSet;
                    return reference &&
                        /^[0-9a-f]{32}$/i.test(reference.id) &&
                        ['sys_update_set', 'sys_remote_update_set', 'sys_user'].indexOf(reference.table) !== -1
                        ? navUrl(reference.table + '.do?sys_id=' + reference.id)
                        : '';
                }
                function renderStatistics(stats) {
                    var facts = [],
                        boards = [];
                    function fact(label, emoji, value, record) {
                        facts.push({
                            label: label,
                            emoji: emoji,
                            value: value,
                            href: record ? statisticsUrl(record) : '',
                        });
                    }
                    var ageIcon =
                        stats.ageDays === null
                            ? '\u2753'
                            : stats.ageDays < 90
                              ? '\uD83D\uDC76'
                              : stats.ageDays < 365
                                ? '\uD83E\uDDD2'
                                : stats.ageDays < 1000
                                  ? '\uD83E\uDDD1'
                                  : '\uD83E\uDDD3';
                    fact('Age', ageIcon, stats.ageDays === null ? 'Unknown' : stats.ageDays.toLocaleString() + ' days');
                    fact('Founder', '\uD83C\uDF31', stats.founder || 'Unknown', { userId: stats.founderUserId });
                    fact('Update sets', '\uD83D\uDCE6', stats.updateSetCount.toLocaleString());
                    fact('Contributors', '\uD83D\uDC65', stats.contributorCount.toLocaleString());
                    fact('Lines created', '\u2728', stats.added.toLocaleString());
                    fact('Lines destroyed', '\uD83D\uDCA5', stats.removed.toLocaleString());
                    if (stats.busiestField) fact('Busiest field', '\uD83D\uDC1D', stats.busiestField.name);
                    if (stats.biggestMakeover)
                        fact('Biggest makeover', '\uD83D\uDC84', stats.biggestMakeover.name, stats.biggestMakeover);
                    function board(title, emoji, group, groupEmoji, entries, metric) {
                        boards.push({
                            title: title,
                            metric: metric,
                            emoji: emoji,
                            group: group,
                            groupEmoji: groupEmoji,
                            empty: 'No lines ' + (metric === 'added' ? 'added.' : 'removed.'),
                            entries: entries.map(function (entry) {
                                return {
                                    name: entry.name,
                                    href: statisticsUrl(entry),
                                    score: entry[metric].toLocaleString() + ' lines',
                                    percentage:
                                        (stats[metric] ? (entry[metric] / stats[metric]) * 100 : 0).toFixed(1) + '%',
                                };
                            }),
                        });
                    }
                    board('Builders', '\uD83D\uDC77', 'Created by', '\uD83D\uDC64', stats.creators, 'added');
                    board('Destroyers', '\uD83D\uDCA5', 'Created by', '\uD83D\uDC64', stats.destroyers, 'removed');
                    board(
                        'Expansions',
                        '\uD83C\uDFD7\uFE0F',
                        'Update sets',
                        '\uD83D\uDCE6',
                        stats.creatorSets,
                        'added'
                    );
                    board('Demolitions', '\uD83E\uDDE8', 'Update sets', '\uD83D\uDCE6', stats.destroyerSets, 'removed');
                    ctrl.statistics.facts = facts;
                    ctrl.statistics.boards = boards;
                }

                function loadStatistics() {
                    if (!data || ctrl.statistics.loading || ctrl.statistics.loaded) return;
                    var request = ++statisticsRequest;
                    ctrl.statistics.loading = true;
                    ctrl.statistics.error = '';
                    changed();
                    function failed(message) {
                        if (request !== statisticsRequest || $scope.$$destroyed) return;
                        statisticsRequest++;
                        if (statisticsWorker) statisticsWorker.terminate();
                        statisticsWorker = null;
                        window.clearTimeout(statisticsTimer);
                        if (accumulated) complete();
                        ctrl.statistics.loading = false;
                        ctrl.statistics.error = message;
                        changed();
                    }
                    var accumulated,
                        cursor = '0',
                        historyKey = '';
                    function merge(stats) {
                        if (!accumulated)
                            accumulated = {
                                summary: stats,
                                authors: Object.create(null),
                                sets: Object.create(null),
                                fields: Object.create(null),
                                added: 0,
                                removed: 0,
                            };
                        accumulated.added += stats.added;
                        accumulated.removed += stats.removed;
                        function collect(entries, destination, key) {
                            (entries || []).forEach(function (entry) {
                                var id = key(entry),
                                    previous = destination[id];
                                if (!previous) {
                                    previous = destination[id] = Object.assign({}, entry, { added: 0, removed: 0 });
                                }
                                previous.added += entry.added;
                                previous.removed += entry.removed;
                                if (entry.userId) previous.userId = entry.userId;
                            });
                        }
                        collect(stats.creators, accumulated.authors, function (entry) {
                            return entry.name;
                        });
                        collect(stats.creatorSets, accumulated.sets, function (entry) {
                            return (
                                entry.key ||
                                (entry.updateSet ? entry.updateSet.table + ':' + entry.updateSet.id : entry.name)
                            );
                        });
                        collect(stats.fieldTotals, accumulated.fields, function (entry) {
                            return entry.name;
                        });
                    }
                    function complete() {
                        if (statisticsWorker) statisticsWorker.terminate();
                        statisticsWorker = null;
                        var stats = accumulated.summary;
                        function rank(object, metric) {
                            return Object.keys(object)
                                .map(function (key) {
                                    return object[key];
                                })
                                .sort(function (a, b) {
                                    return b[metric] - a[metric] || a.name.localeCompare(b.name);
                                });
                        }
                        function busiest(object) {
                            return (
                                rank(object, 'added')
                                    .sort(function (a, b) {
                                        return (
                                            b.added + b.removed - a.added - a.removed || a.name.localeCompare(b.name)
                                        );
                                    })
                                    .filter(function (entry) {
                                        return entry.added + entry.removed > 0;
                                    })[0] || null
                            );
                        }
                        stats.creators = rank(accumulated.authors, 'added');
                        stats.destroyers = rank(accumulated.authors, 'removed');
                        stats.creatorSets = rank(accumulated.sets, 'added');
                        stats.destroyerSets = rank(accumulated.sets, 'removed');
                        stats.contributorCount = stats.creators.length;
                        stats.added = accumulated.added;
                        stats.removed = accumulated.removed;
                        if (Object.keys(accumulated.fields).length) stats.busiestField = busiest(accumulated.fields);
                        stats.biggestMakeover = busiest(accumulated.sets);
                        renderStatistics(stats);
                        ctrl.statistics.loaded = true;
                        ctrl.statistics.loading = false;
                        ctrl.statistics.error = '';
                    }
                    function nextBatch() {
                        statisticsTimer = window.setTimeout(function () {
                            if (request !== statisticsRequest) return;
                            failed('The request timed out. Reload to try again.');
                        }, requestTimeout);
                        try {
                            var ga = new GlideAjax('WidgetEditorCreditAjax');
                            ga.addParam('sysparm_name', 'getStatistics');
                            ga.addParam('sysparm_snapshots', 'true');
                            ga.addParam('sysparm_update', data.selected);
                            ga.addParam('sysparm_cursor', cursor);
                            ga.addParam('sysparm_history_key', historyKey);
                            ga.getXMLAnswer(function (answer) {
                                changed();
                                if (request !== statisticsRequest || $scope.$$destroyed) return;
                                window.clearTimeout(statisticsTimer);
                                try {
                                    var stats = JSON.parse(answer || '{}');
                                    if (!stats.success) {
                                        failed(stats.error || 'Statistics could not be loaded.');
                                        return;
                                    }
                                    function accept(stats) {
                                        if (request !== statisticsRequest || $scope.$$destroyed) return;
                                        window.clearTimeout(statisticsTimer);
                                        if (!stats.fieldTotals && !stats.nextCursor && !accumulated) {
                                            renderStatistics(stats);
                                            ctrl.statistics.loaded = true;
                                            ctrl.statistics.loading = false;
                                            return;
                                        }
                                        merge(stats);
                                        if (stats.nextCursor) {
                                            if (
                                                !/^\d+$/.test(stats.nextCursor) ||
                                                Number(stats.nextCursor) <= Number(cursor)
                                            )
                                                throw new Error('Invalid statistics cursor.');
                                            cursor = stats.nextCursor;
                                            historyKey = stats.historyKey;
                                            nextBatch();
                                        } else complete();
                                        changed();
                                    }
                                    if (stats.snapshots) {
                                        if (!statisticsWorker)
                                            statisticsWorker = new Worker(
                                                '/widget_editor_credit_worker.jsdbx?sysparm_substitute=false&v=2'
                                            );
                                        statisticsTimer = window.setTimeout(function () {
                                            if (request !== statisticsRequest) return;
                                            failed('Calculation timed out. Reload to try again.');
                                        }, requestTimeout);
                                        matchBatch(statisticsWorker, 'statistics', stats, accept, failed);
                                    } else accept(stats);
                                } catch (e) {
                                    failed('Statistics could not be loaded.');
                                }
                            });
                        } catch (e) {
                            window.clearTimeout(statisticsTimer);
                            failed('Statistics could not be loaded.');
                        }
                    }
                    if (data.tableApi) {
                        var context = data;
                        statisticsTimer = window.setTimeout(function () {
                            failed('Statistics timed out. Reload to try again.');
                        }, requestTimeout);
                        sharedHistory(context)
                            .then(function (cache) {
                                if (request !== statisticsRequest || $scope.$$destroyed) return;
                                if (!cache.statisticsInfo) {
                                    cache.statisticsInfo = new Promise(function (resolve, reject) {
                                        var authors = [];
                                        cache.snapshots.forEach(function (snapshot) {
                                            if (authors.indexOf(snapshot.author) === -1) authors.push(snapshot.author);
                                        });
                                        var ga = new GlideAjax('WidgetEditorCreditAjax');
                                        ga.addParam('sysparm_name', 'getStatistics');
                                        ga.addParam('sysparm_context', 'true');
                                        ga.addParam('sysparm_update', context.selected);
                                        ga.addParam('sysparm_authors', JSON.stringify(authors));
                                        var infoTimer = window.setTimeout(function () {
                                            reject(new Error('Statistics details timed out. Reload to try again.'));
                                        }, requestTimeout);
                                        ga.getXMLAnswer(function (answer) {
                                            window.clearTimeout(infoTimer);
                                            try {
                                                var stats = JSON.parse(answer || '{}');
                                                if (!stats.success)
                                                    throw new Error(stats.error || 'Statistics details unavailable.');
                                                if (stats.historyKey !== context.tableApi.key)
                                                    throw new Error('Customer Updates changed. Reload Credit+.');
                                                resolve(stats);
                                            } catch (error) {
                                                reject(error);
                                            }
                                        });
                                    }).catch(function (error) {
                                        cache.statisticsInfo = null;
                                        throw error;
                                    });
                                }
                                return cache.statisticsInfo.then(function (info) {
                                    if (request !== statisticsRequest || $scope.$$destroyed) return;
                                    window.clearTimeout(statisticsTimer);
                                    statisticsTimer = window.setTimeout(function () {
                                        failed('Calculation timed out. Reload to try again.');
                                    }, requestTimeout);
                                    statisticsWorker = new Worker(
                                        '/widget_editor_credit_worker.jsdbx?sysparm_substitute=false&v=2'
                                    );
                                    matchBatch(
                                        statisticsWorker,
                                        'statistics',
                                        Object.assign({}, info, {
                                            snapshots: cache.snapshots,
                                            fields: context.fields,
                                            limits: context.tableApi.limits,
                                            partial: cache.partial,
                                            nextCursor: '',
                                        }),
                                        function (stats) {
                                            if (request !== statisticsRequest || $scope.$$destroyed) return;
                                            window.clearTimeout(statisticsTimer);
                                            merge(stats);
                                            complete();
                                            changed();
                                        },
                                        failed
                                    );
                                });
                            })
                            .catch(function (error) {
                                failed(error.message || 'Statistics could not be loaded.');
                            });
                    } else nextBatch();
                }
                ctrl.toggleStatistics = function () {
                    setStatisticsOpen(!ctrl.statistics.open);
                    updateUrl();
                    updateTitle();
                    if (ctrl.statistics.open) loadStatistics();
                };

                function navUrl(uri) {
                    return '/nav_to.do?uri=' + encodeURIComponent(uri);
                }

                function updateUrl() {
                    if (ctrl.whitespaceMode === 'all') params.delete('sysparm_whitespace');
                    else params.set('sysparm_whitespace', ctrl.whitespaceMode);
                    if (openStatisticsOnLoad || ctrl.statistics.open) params.set('sysparm_statistics', 'true');
                    else params.delete('sysparm_statistics');
                    if (updateId) params.set('sysparm_update', updateId);
                    else params.delete('sysparm_update');
                    if (tableName) params.set('sysparm_table', tableName);
                    else params.delete('sysparm_table');
                    if (recordId) params.set('sysparm_record', recordId);
                    else params.delete('sysparm_record');
                    if (requestedField) params.set('sysparm_field', requestedField);
                    else params.delete('sysparm_field');
                    params.delete('sysparm_view');
                    var uri = window.location.pathname + '?' + params.toString() + window.location.hash;
                    window.history.replaceState(window.history.state, '', uri);
                    try {
                        var top = window.top,
                            prefix = '/now/nav/ui/classic/params/target/';
                        if (top !== window && top.location.pathname.indexOf(prefix) === 0)
                            top.history.replaceState(
                                top.history.state,
                                '',
                                prefix + encodeURIComponent(uri.substring(1)) + top.location.search + top.location.hash
                            );
                        else if (top !== window && top.location.pathname === '/nav_to.do') {
                            var shellUrl = new URL(top.location.href);
                            shellUrl.searchParams.set('uri', uri.substring(1));
                            top.history.replaceState(top.history.state, '', shellUrl.href);
                        }
                    } catch (e) {}
                }

                function syncPickers() {
                    if (!tablePicker) return;
                    tablePicker.select2(
                        'data',
                        tableName ? { id: tableName, text: ctrl.tableLabel || tableName } : null
                    );
                    recordPicker.select2('data', recordId ? { id: recordId, text: ctrl.recordName || recordId } : null);
                    recordPicker.select2('enable', !!tableName);
                }

                function setupPickers() {
                    if (tablePicker) return;
                    var jq = typeof $j !== 'undefined' ? $j : typeof jQuery !== 'undefined' ? jQuery : null;
                    if (!jq || !jq.fn || !jq.fn.select2) return;
                    ['table', 'record'].forEach(function (kind, index) {
                        var isTable = kind === 'table',
                            wrap = document.getElementById('cp-' + kind + '-picker');
                        var input = element('input');
                        input.type = 'hidden';
                        input.id = 'cp-' + kind + '-input';
                        input.value = isTable ? tableName : recordId;
                        wrap.appendChild(input);
                        document.getElementById(isTable ? 'cp-table-label' : 'cp-record-name').hidden = true;
                        var picker = jq(input);
                        picker.select2({
                            placeholder: isTable ? '(select table)' : '(select record)',
                            minimumInputLength: 0,
                            allowClear: false,
                            dropdownCssClass: isTable ? 'dc-table-picker-drop' : 'dc-record-picker-drop',
                            formatResult: function (item) {
                                var label = element('span', item.text || item.id);
                                if (isTable) label.appendChild(element('span', item.id, 'dc-table-result-name'));
                                return jq(label);
                            },
                            initSelection: function (_input, callback) {
                                callback({
                                    id: isTable ? tableName : recordId,
                                    text: isTable ? ctrl.tableLabel : ctrl.recordName,
                                });
                            },
                            query: function (query) {
                                window.clearTimeout(pickerTimers[index]);
                                var request = ++pickerRequests[index],
                                    queryTable = tableName;
                                pickerTimers[index] = window.setTimeout(function () {
                                    var ga = new GlideAjax('WidgetEditorCreditAjax');
                                    ga.addParam('sysparm_name', isTable ? 'getTables' : 'getRecords');
                                    ga.addParam('sysparm_search', query.term || '');
                                    ga.addParam('sysparm_page', query.page || 1);
                                    if (!isTable) ga.addParam('sysparm_table', queryTable);
                                    ga.getXMLAnswer(function (answer) {
                                        changed();
                                        if (request !== pickerRequests[index] || (!isTable && queryTable !== tableName))
                                            return;
                                        var result;
                                        try {
                                            result = JSON.parse(answer || '{}');
                                        } catch (e) {
                                            result = {};
                                        }
                                        query.callback({
                                            results: result.success ? result.results || [] : [],
                                            more: !!result.has_more,
                                        });
                                    });
                                }, 250);
                            },
                        });
                        picker
                            .select2('container')
                            .find('.select2-choice')
                            .attr('aria-label', isTable ? 'Table' : 'Record');
                        picker.on('change.credit', function (event) {
                            changed();
                            var choice = event.added || picker.select2('data'),
                                id = choice && choice.id;
                            if (!id || id === (isTable ? tableName : recordId)) return;
                            picker.select2('close');
                            if (isTable) {
                                tableName = id;
                                recordId = '';
                                pickerRequests[1]++;
                                ctrl.tableLabel = choice.text || id;
                                ctrl.recordName = '';
                            } else {
                                recordId = id;
                                ctrl.recordName = choice.text || id;
                            }
                            updateId = '';
                            requestedField = '';

                            ctrl.updateSets = [];
                            ctrl.selectedSet = null;
                            config.description = recordId
                                ? (choice.text || id) + ' (' + ctrl.tableLabel + ')'
                                : ctrl.tableLabel;
                            syncPickers();
                            updateUrl();
                            load();
                        });
                        if (isTable) tablePicker = picker;
                        else recordPicker = picker;
                    });
                    syncPickers();
                }

                // Use the same document, parent-frame title and Next Experience History helper as Compare+.
                function syncTitle() {
                    // Polaris captures the iframe title at load; keep its record title stable across fields/views.
                    var recordDescription = data
                        ? (data.recordName || data.record) + ' (' + (data.tableLabel || data.table) + ')'
                        : config.description;
                    var title =
                        (recordDescription ? 'Credit: ' + recordDescription : 'Credit+') +
                        ' - ' +
                        (config.siteTitle || 'ServiceNow');
                    document.title = title;
                    window.clearTimeout(titleTimer);
                    titleTimer = window.setTimeout(function () {
                        try {
                            if (window.parent !== window) window.parent.document.title = title;
                            var currentUrl = window.location.pathname.substring(1) + window.location.search;
                            if (
                                recordDescription &&
                                (notifiedTitle !== title || notifiedUrl !== currentUrl) &&
                                window.CustomEvent &&
                                typeof window.CustomEvent.fireTop === 'function'
                            ) {
                                notifiedTitle = title;
                                notifiedUrl = currentUrl;
                                window.CustomEvent.fireTop('navigation.complete', window);
                            }
                        } catch (e) {}
                    }, 1000);
                    if (window.WE_HISTORY_SYNC) {
                        var currentUrl = window.location.pathname.substring(1) + window.location.search;
                        window.WE_HISTORY_SYNC.set({
                            title: 'Credit+',
                            description: (data ? data.recordName : ctrl.recordName) || '',
                            match: 'url=' + currentUrl + (currentUrl !== launchUrl ? '^ORurl=' + launchUrl : ''),
                            url: currentUrl,
                        });
                    }
                }

                function updateTitle() {
                    if (data) syncTitle();
                }

                var contextMenu = element('div', undefined, 'context_menu cp-context-menu'),
                    menuOwner;
                contextMenu.id = 'cp-context-menu';
                contextMenu.hidden = true;
                contextMenu.setAttribute('role', 'menu');
                page.appendChild(contextMenu);
                function closeMenu(restoreFocus) {
                    contextMenu.hidden = true;
                    if (menuOwner) {
                        menuOwner.setAttribute('aria-expanded', 'false');
                        if (restoreFocus && menuOwner.isConnected) menuOwner.focus({ preventScroll: true });
                    }
                    menuOwner = null;
                }
                function openMenu(event, owner, items) {
                    event.preventDefault();
                    closeMenu(false);
                    menuOwner = owner;
                    owner.setAttribute('aria-expanded', 'true');
                    contextMenu.textContent = '';
                    items.forEach(function (item) {
                        if (item.separator) {
                            var divider = element('div', undefined, 'context_item_hr');
                            divider.setAttribute('role', 'separator');
                            contextMenu.appendChild(divider);
                            return;
                        }
                        var action = element(item.href && !item.disabled ? 'a' : 'div', item.label, 'context_item');
                        action.setAttribute('role', 'menuitem');
                        action.tabIndex = -1;
                        if (item.disabled) {
                            action.classList.add('is-disabled');
                            action.setAttribute('aria-disabled', 'true');
                        }
                        if (item.href) {
                            if (!item.disabled) {
                                action.href = item.href;
                                action.target = '_blank';
                                action.rel = 'noopener';
                            }
                            var icon = element('span', undefined, 'icon-open-document-new-tab');
                            icon.setAttribute('aria-hidden', 'true');
                            action.appendChild(icon);
                        }
                        action.addEventListener('mouseenter', function () {
                            if (!item.disabled) action.focus({ preventScroll: true });
                        });
                        action.addEventListener('click', function (event) {
                            if (item.disabled) {
                                event.preventDefault();
                                return;
                            }
                            closeMenu(true);
                            if (item.run) item.run();
                        });
                        contextMenu.appendChild(action);
                    });
                    contextMenu.hidden = false;
                    var rect = owner.getBoundingClientRect(),
                        x = event.type === 'contextmenu' && event.clientX ? event.clientX : rect.left,
                        y = event.type === 'contextmenu' && event.clientY ? event.clientY : rect.bottom;
                    contextMenu.style.left =
                        Math.max(4, Math.min(x, window.innerWidth - contextMenu.offsetWidth - 4)) + 'px';
                    contextMenu.style.top =
                        Math.max(4, Math.min(y, window.innerHeight - contextMenu.offsetHeight - 4)) + 'px';
                    contextMenu
                        .querySelector('[role="menuitem"]:not([aria-disabled="true"])')
                        .focus({ preventScroll: true });
                }
                contextMenu.addEventListener('keydown', function (event) {
                    var items = Array.from(
                            contextMenu.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')
                        ),
                        index = items.indexOf(document.activeElement);
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        closeMenu(true);
                        return;
                    }
                    if (event.key === 'Tab') {
                        closeMenu(true);
                        return;
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (items[index]) items[index].click();
                        return;
                    }
                    if (event.key === 'ArrowDown') index = (index + 1) % items.length;
                    else if (event.key === 'ArrowUp') index = (index - 1 + items.length) % items.length;
                    else if (event.key === 'Home') index = 0;
                    else if (event.key === 'End') index = items.length - 1;
                    else return;
                    event.preventDefault();
                    items[index].focus({ preventScroll: true });
                });
                listen(document, 'pointerdown', function (event) {
                    if (!contextMenu.contains(event.target)) closeMenu(false);
                });
                listen(window, 'resize', function () {
                    closeMenu(false);
                });
                ['wheel', 'touchmove'].forEach(function (type) {
                    listen(
                        window,
                        type,
                        function (event) {
                            if (!contextMenu.contains(event.target)) closeMenu(false);
                        },
                        { capture: true, passive: true }
                    );
                });

                function compareUrl(id, result) {
                    return navUrl(
                        'ui_page.do?sys_id=51ec3d258363b61070b8b5dfeeaad36b&table=' +
                            encodeURIComponent(result.table) +
                            '&record_id=' +
                            encodeURIComponent(result.record) +
                            '&credit_update=' +
                            encodeURIComponent(id)
                    );
                }

                function setupMonaco() {
                    if (!window.MonacoEnvironment) window.MonacoEnvironment = {};
                    if (typeof window.MonacoEnvironment.getWorker !== 'function') {
                        window.MonacoEnvironment.getWorker = function (_module, label) {
                            var worker =
                                label === 'javascript' || label === 'typescript'
                                    ? 'ts.worker.bundle.min.jsx'
                                    : label === 'html' || label === 'handlebars'
                                      ? 'html.worker.bundle.min.jsx'
                                      : 'editor.worker.bundle.min.jsx';
                            var blob = new Blob(
                                [
                                    'importScripts(' +
                                        JSON.stringify(
                                            location.origin +
                                                '/scripts/snc-code-editor/' +
                                                worker +
                                                '?sysparm_substitute=false'
                                        ) +
                                        ')',
                                ],
                                { type: 'application/javascript' }
                            );
                            var url = URL.createObjectURL(blob),
                                instance = new Worker(url);
                            URL.revokeObjectURL(url);
                            return instance;
                        };
                    }
                    var background = getComputedStyle(document.documentElement)
                        .getPropertyValue('--now-color_background--primary')
                        .trim();
                    var channels = background.split(/[\s,]+/).map(Number);
                    var theme = background && (channels[0] + channels[1] + channels[2]) / 3 < 128 ? 'vs-dark' : 'vs';
                    monaco.editor.setTheme(theme);
                    var jsDefaults =
                        monaco.languages &&
                        monaco.languages.typescript &&
                        monaco.languages.typescript.javascriptDefaults;
                    if (jsDefaults)
                        jsDefaults.setDiagnosticsOptions({
                            noSemanticValidation: true,
                            noSuggestionDiagnostics: true,
                            noSyntaxValidation: true,
                        });
                }

                var updateButton = document.getElementById('cp-update-button'),
                    updateMenu = document.getElementById('cp-update-menu');
                function closeUpdateDropdown(focus) {
                    updateMenu.hidden = true;
                    updateButton.setAttribute('aria-expanded', 'false');
                    updateButton.querySelector('.caret').classList.remove('we-caret--open');
                    if (focus) updateButton.focus();
                }
                function positionUpdateDropdown() {
                    var rect = updateButton.getBoundingClientRect(),
                        width = Math.min(Math.max(rect.width, 600), window.innerWidth - 24);
                    updateMenu.style.width = width + 'px';
                    updateMenu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) + 'px';
                    updateMenu.style.top = rect.bottom + 3 + 'px';
                    updateMenu.style.maxHeight = Math.min(300, window.innerHeight - rect.bottom - 15) + 'px';
                }
                ctrl.chooseUpdate = function (set) {
                    closeUpdateDropdown(true);
                    if (updateId === set.id) return;
                    updateId = set.id;
                    ctrl.selectedSet = set;
                    updateUrl();
                    load(true);
                };
                function openUpdateDropdown() {
                    if (updateButton.disabled) return;
                    updateMenu.hidden = false;
                    positionUpdateDropdown();
                    updateButton.setAttribute('aria-expanded', 'true');
                    updateButton.querySelector('.caret').classList.add('we-caret--open');
                    var selected = updateMenu.querySelector('[aria-selected="true"]') || updateMenu.firstElementChild;
                    if (selected) {
                        selected.focus({ preventScroll: true });
                        selected.scrollIntoView({ block: 'nearest' });
                    }
                }
                updateButton.addEventListener('click', function () {
                    if (updateMenu.hidden) openUpdateDropdown();
                    else closeUpdateDropdown(true);
                });
                updateButton.addEventListener('keydown', function (event) {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        openUpdateDropdown();
                    }
                });
                updateMenu.addEventListener('keydown', function (event) {
                    var items = Array.prototype.slice.call(updateMenu.children),
                        index = items.indexOf(document.activeElement);
                    if (event.key === 'Escape' || event.key === 'Tab') {
                        closeUpdateDropdown(true);
                        if (event.key === 'Escape') event.preventDefault();
                        return;
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (items[index]) items[index].click();
                        return;
                    }
                    if (event.key === 'ArrowDown') index = (index + 1) % items.length;
                    else if (event.key === 'ArrowUp') index = (index - 1 + items.length) % items.length;
                    else if (event.key === 'Home') index = 0;
                    else if (event.key === 'End') index = items.length - 1;
                    else return;
                    event.preventDefault();
                    items[index].focus({ preventScroll: true });
                    items[index].scrollIntoView({ block: 'nearest' });
                });
                listen(document, 'click', function (event) {
                    if (!updateButton.contains(event.target) && !updateMenu.contains(event.target))
                        closeUpdateDropdown(false);
                });
                listen(window, 'resize', function () {
                    if (!updateMenu.hidden) positionUpdateDropdown();
                });
                listen(
                    window,
                    'scroll',
                    function () {
                        if (!updateMenu.hidden) positionUpdateDropdown();
                    },
                    true
                );

                var attributionWidth;
                function resizeAttribution(width) {
                    attributionWidth = Math.max(10, Math.min(65, width));
                    page.style.setProperty('--cp-attribution-width', attributionWidth + '%');
                    page.querySelectorAll('.cp-splitter').forEach(function (splitter) {
                        splitter.setAttribute('aria-valuenow', String(Math.round(attributionWidth)));
                    });
                }

                function createFieldView(entry, index, section, fieldScope) {
                    var summary = section.querySelector('summary'),
                        nodes = {};
                    section.querySelectorAll('[id]').forEach(function (item) {
                        nodes[item.id] = item;
                        if (index) item.id = 'cp-' + entry.name + '-' + item.id.substring(3);
                    });
                    section.querySelectorAll('label[for]').forEach(function (label) {
                        if (index) label.htmlFor = nodes[label.htmlFor].id;
                    });
                    entry.lineCount = entry.lineCount || '';
                    summary.addEventListener('click', function (event) {
                        if (entry.disabled) event.preventDefault();
                    });
                    function node(id) {
                        return nodes[id];
                    }
                    var data,
                        updates = {},
                        filterAuthor = null,
                        filterSet = null;
                    var diffData,
                        diffEditor,
                        originalModel,
                        diffRequest = 0,
                        diffTimer;
                    var creditEditor,
                        creditModel,
                        scrollFrame,
                        annotationRows = [],
                        annotationFrame,
                        timeWidthKey,
                        touchY,
                        pending = false,
                        fieldRequest = 0,
                        fieldWorker,
                        timer,
                        disposed = false;
                    fieldScope.$watch('field.disabled', function (disabled) {
                        if (!disabled) return;
                        section.open = false;
                        fieldRequest++;
                        pending = false;
                        window.clearTimeout(timer);
                        if (fieldWorker) fieldWorker.terminate();
                        fieldWorker = null;
                    });
                    var gutter = node('cp-gutter'),
                        gutterContent = node('cp-gutter-content');
                    var codeMatches = [];
                    node('cp-code-label').textContent = entry.label;
                    node('cp-fallback-label').textContent = entry.label;
                    function setFieldStatus(message, error) {
                        ['cp-code-loading', 'cp-fallback-loading'].forEach(function (id) {
                            node(id).hidden = true;
                        });
                        ['cp-field-status', 'cp-code-status'].forEach(function (id) {
                            node(id).textContent = message;
                            node(id).className = message ? 'alert ' + (error ? 'alert-danger' : 'alert-warning') : '';
                        });
                        node('cp-status-row').hidden = !message;
                        node('cp-code-status').hidden = !message;
                    }
                    function setFieldLoading(message) {
                        setFieldStatus('');
                        ['cp-code-loading', 'cp-fallback-loading'].forEach(function (id) {
                            node(id).querySelector('.cp-sr-only').textContent = message;
                            node(id).hidden = false;
                        });
                    }
                    var splitter = node('cp-splitter');
                    splitter.setAttribute('aria-controls', node('cp-code-monaco').id);
                    splitter.setAttribute(
                        'aria-valuenow',
                        String(attributionWidth || (window.innerWidth <= 760 ? 44 : 34))
                    );
                    splitter.addEventListener('pointerdown', function (event) {
                        if (event.button !== 0) return;
                        splitter.setPointerCapture(event.pointerId);
                        event.preventDefault();
                        splitter.focus({ preventScroll: true });
                    });
                    splitter.addEventListener('pointermove', function (event) {
                        if (!splitter.hasPointerCapture(event.pointerId)) return;
                        var rect = splitter.parentNode.getBoundingClientRect();
                        resizeAttribution(((event.clientX - rect.left) / rect.width) * 100);
                    });
                    splitter.addEventListener('pointerup', function (event) {
                        if (splitter.hasPointerCapture(event.pointerId))
                            splitter.releasePointerCapture(event.pointerId);
                    });
                    splitter.addEventListener('keydown', function (event) {
                        var width = Number(splitter.getAttribute('aria-valuenow'));
                        if (event.key === 'ArrowLeft') width -= 2;
                        else if (event.key === 'ArrowRight') width += 2;
                        else if (event.key === 'Home') width = 10;
                        else if (event.key === 'End') width = 65;
                        else return;
                        event.preventDefault();
                        resizeAttribution(width);
                    });
                    function matchesAttribution(line) {
                        var snapshot = updates[line.update],
                            author = snapshot ? snapshot.author : '',
                            set =
                                snapshot && snapshot.updateSet
                                    ? snapshot.updateSet.table + ':' + snapshot.updateSet.id
                                    : '';
                        return (
                            (!filterAuthor || (author === filterAuthor.value) !== filterAuthor.exclude) &&
                            (!filterSet || (set === filterSet.value) !== filterSet.exclude)
                        );
                    }
                    function applyHiddenLines() {
                        if (!creditEditor) return;
                        var ranges = [],
                            start;
                        annotationRows.forEach(function (row, index) {
                            row.hidden = !codeMatches[index];
                            if (!codeMatches[index] && start === undefined) start = index + 1;
                            if (codeMatches[index] && start !== undefined) {
                                ranges.push({
                                    startLineNumber: start,
                                    startColumn: 1,
                                    endLineNumber: index,
                                    endColumn: 1,
                                });
                                start = undefined;
                            }
                        });
                        if (start !== undefined)
                            ranges.push({
                                startLineNumber: start,
                                startColumn: 1,
                                endLineNumber: data.lines.length,
                                endColumn: 1,
                            });
                        // Keep the complete model for syntax context and original line numbers.
                        if (ranges.length && !creditEditor.setHiddenAreas)
                            throw new Error('Line filtering unavailable');
                        if (creditEditor.setHiddenAreas) creditEditor.setHiddenAreas(ranges);
                        layoutAnnotations();
                    }
                    function applyFilters() {
                        if (!data) return;
                        codeMatches = data.lines.map(matchesAttribution);
                        var active = node('cp-active-filters');
                        active.textContent = '';
                        [
                            { name: 'Created by', filter: filterAuthor },
                            { name: 'Update set', filter: filterSet },
                        ].forEach(function (entry) {
                            if (!entry.filter) return;
                            var button = element(
                                'button',
                                entry.name + (entry.filter.exclude ? ' ≠ ' : ': ') + entry.filter.label + ' ×',
                                'btn btn-default cp-filter-chip'
                            );
                            button.type = 'button';
                            button.setAttribute('aria-label', 'Clear ' + entry.name.toLowerCase() + ' filter');
                            button.addEventListener('click', function () {
                                if (entry.name === 'Created by') filterAuthor = null;
                                else filterSet = null;
                                applyFilters();
                                (active.querySelector('button') || summary).focus({ preventScroll: true });
                            });
                            active.appendChild(button);
                        });
                        active.hidden = !filterAuthor && !filterSet;
                        if (section.open) renderCode();
                    }
                    function contextCell(cell, kind, snapshot) {
                        var isAuthor = kind === 'author',
                            set =
                                snapshot.updateSet &&
                                /^[0-9a-f]{32}$/i.test(snapshot.updateSet.id) &&
                                ['sys_update_set', 'sys_remote_update_set'].indexOf(snapshot.updateSet.table) !== -1
                                    ? snapshot.updateSet
                                    : null,
                            value = isAuthor ? snapshot.author : set ? set.table + ':' + set.id : '',
                            label = isAuthor ? snapshot.author : set ? set.name : 'Customer update';
                        cell.tabIndex = 0;
                        cell.dataset.contextKind = kind;
                        cell.dataset.contextValue = value;
                        cell.setAttribute('role', 'button');
                        cell.setAttribute('aria-controls', contextMenu.id);
                        cell.setAttribute('aria-haspopup', 'menu');
                        cell.setAttribute('aria-expanded', 'false');
                        function filter(exclude) {
                            var selected = { value: value, label: label, exclude: exclude };
                            if (isAuthor) filterAuthor = selected;
                            else filterSet = selected;
                            applyFilters();
                            node('cp-active-filters').querySelector('button').focus({ preventScroll: true });
                        }
                        function show(event) {
                            var items = [];
                            if (isAuthor || set) {
                                items.push({
                                    label: 'Show matching',
                                    run: function () {
                                        filter(false);
                                    },
                                });
                                items.push({
                                    label: 'Filter out',
                                    run: function () {
                                        filter(true);
                                    },
                                });
                            }
                            if (!isAuthor) {
                                items.push({ separator: true });
                                items.push({
                                    label: 'Quick compare',
                                    disabled: snapshot.id === data.selected,
                                    run: function () {
                                        showDiff(snapshot);
                                    },
                                });
                                items.push({
                                    label: 'Compare+',
                                    disabled: snapshot.id === data.selected,
                                    href: compareUrl(snapshot.id, data),
                                });
                                if (set) {
                                    items.push({ separator: true });
                                    items.push({
                                        label: 'Open update set',
                                        href: navUrl(set.table + '.do?sys_id=' + encodeURIComponent(set.id)),
                                    });
                                }
                            }
                            openMenu(event, cell, items);
                        }
                        cell.addEventListener('contextmenu', show);
                        cell.addEventListener('click', show);
                        cell.addEventListener('keydown', function (event) {
                            if (
                                event.key === 'ContextMenu' ||
                                (event.shiftKey && event.key === 'F10') ||
                                event.key === 'Enter' ||
                                event.key === ' '
                            )
                                show(event);
                        });
                    }
                    function language() {
                        return entry.language || 'javascript';
                    }
                    function scrollWhenReady() {
                        if (pendingScrollSection !== section || scrollFrame) return;
                        scrollFrame = window.requestAnimationFrame(function () {
                            scrollFrame = null;
                            if (disposed || !section.open || !section.isConnected || pendingScrollSection !== section)
                                return;
                            if (creditEditor) {
                                creditEditor.layout();
                                if (creditEditor.render) creditEditor.render(true);
                                layoutAnnotations();
                            }
                            pendingScrollSection = null;
                            summary.scrollIntoView({
                                block: 'start',
                                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                                    ? 'auto'
                                    : 'smooth',
                            });
                        });
                    }
                    function disposeCredit() {
                        window.cancelAnimationFrame(scrollFrame);
                        scrollFrame = null;
                        window.cancelAnimationFrame(annotationFrame);
                        annotationFrame = null;
                        annotationRows = [];
                        if (diffEditor) diffEditor.dispose();
                        else if (creditEditor) creditEditor.dispose();
                        diffEditor = null;
                        if (originalModel) originalModel.dispose();
                        originalModel = null;
                        creditEditor = null;
                        if (creditModel) creditModel.dispose();
                        creditModel = null;
                        node('cp-code-view').hidden = !!data;
                        node('cp-table-fallback').hidden = !data;
                        node('cp-attribution').textContent = '';
                        gutter.scrollTop = 0;
                    }

                    function updateGutter() {
                        if (!creditEditor) return;
                        var layout = creditEditor.getLayoutInfo();
                        var scrollbar =
                            creditEditor.getScrollWidth() > layout.contentWidth ? layout.horizontalScrollbarHeight : 0;
                        gutter.style.height = Math.max(0, layout.height - scrollbar) + 'px';
                        gutterContent.style.height = creditEditor.getScrollHeight() + 'px';
                        gutterContent.style.transform = 'translateY(' + -creditEditor.getScrollTop() + 'px)';
                    }

                    function sizeTimestampColumn(font) {
                        var cell = annotationRows.length && annotationRows[0].querySelector('.cp-time');
                        if (!cell || getComputedStyle(cell).display === 'none') return;
                        var style = getComputedStyle(cell),
                            key = [
                                style.font,
                                style.letterSpacing,
                                style.paddingLeft,
                                style.paddingRight,
                                font.typicalHalfwidthCharacterWidth,
                            ].join('|');
                        if (key === timeWidthKey) return;
                        timeWidthKey = key;
                        var measure = element('span'),
                            width = 0;
                        measure.style.cssText =
                            'position:absolute;visibility:hidden;white-space:pre;width:max-content;';
                        cell.appendChild(measure);
                        data.updates.forEach(function (snapshot) {
                            measure.textContent = snapshot.time || '';
                            width = Math.max(width, measure.offsetWidth);
                        });
                        measure.remove();
                        // Preserve the loading width unless the rendered timestamp needs more room.
                        if (width)
                            section.style.setProperty(
                                '--cp-time-width',
                                Math.ceil(
                                    Math.max(
                                        width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2,
                                        12.5 * parseFloat(getComputedStyle(document.documentElement).fontSize)
                                    )
                                ) + 'px'
                            );
                    }

                    function layoutAnnotations() {
                        if (!creditEditor) return;
                        var font = creditEditor.getOption(monaco.editor.EditorOption.fontInfo);
                        gutterContent.style.fontFamily = font.fontFamily;
                        gutterContent.style.fontSize = font.fontSize + 'px';
                        gutterContent.style.fontWeight = font.fontWeight;
                        gutterContent.style.letterSpacing = font.letterSpacing + 'px';
                        gutterContent.style.lineHeight = font.lineHeight + 'px';
                        sizeTimestampColumn(font);
                        annotationRows.forEach(function (row, index) {
                            // Monaco owns line positions and font metrics; table layout must not accumulate rounding errors.
                            row.style.top = creditEditor.getTopForLineNumber(index + 1) + 'px';
                            row.style.height = font.lineHeight + 'px';
                        });
                        updateGutter();
                    }

                    function scheduleAnnotationLayout() {
                        if (annotationFrame !== null && annotationFrame !== undefined) return;
                        annotationFrame = window.requestAnimationFrame(function () {
                            annotationFrame = null;
                            layoutAnnotations();
                        });
                    }

                    function monacoCredit() {
                        if (!window.monaco || !codeMatches.some(Boolean)) return false;
                        try {
                            setupMonaco();
                            node('cp-code-view').hidden = false;
                            creditModel = monaco.editor.createModel(
                                data.lines
                                    .map(function (line) {
                                        return line.text;
                                    })
                                    .join('\n'),
                                language()
                            );
                            var options = {
                                model: creditModel,
                                automaticLayout: true,
                                readOnly: true,
                                domReadOnly: true,
                                lineHeight: 24,
                                fontSize: 13,
                                padding: { top: 8, bottom: 8 },
                                wordWrap: 'off',
                                folding: false,
                                codeLens: false,
                                stickyScroll: { enabled: false },
                                glyphMargin: false,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                renderLineHighlight: 'none',
                                ariaLabel: 'Read-only historical code. Line attribution is in the adjacent table.',
                            };
                            if (diffData) {
                                delete options.model;
                                originalModel = monaco.editor.createModel(diffData.code, language());
                                options.renderSideBySide = false;
                                options.renderIndicators = true;
                                options.lineDecorationsWidth = 24;
                                options.glyphMargin = true;
                                options.originalEditable = false;
                                options.ignoreTrimWhitespace = false;
                                options.renderOverviewRuler = false;
                                options.diffCodeLens = false;
                                diffEditor = monaco.editor.createDiffEditor(node('cp-code-monaco'), options);
                                diffEditor.setModel({ original: originalModel, modified: creditModel });
                                creditEditor = diffEditor.getModifiedEditor();
                                diffEditor.onDidUpdateDiff(scheduleAnnotationLayout);
                            } else creditEditor = monaco.editor.create(node('cp-code-monaco'), options);
                            var fragment = document.createDocumentFragment(),
                                previousOrigin,
                                decorations = [];
                            data.lines.forEach(function (line, index) {
                                var snapshot = updates[line.update],
                                    border = updateSetBorder(snapshot && snapshot.updateSet),
                                    next = data.lines[index + 1],
                                    nextSnapshot = next && updates[next.update],
                                    groupEnd =
                                        border && border !== updateSetBorder(nextSnapshot && nextSnapshot.updateSet);
                                if (!diffData && groupEnd)
                                    decorations.push({
                                        range: {
                                            startLineNumber: line.number,
                                            startColumn: 1,
                                            endLineNumber: line.number,
                                            endColumn: 1,
                                        },
                                        options: { isWholeLine: true, className: border, marginClassName: border },
                                    });
                                var row = attribution(line);
                                row.removeChild(row.querySelector('.cp-number'));
                                row.removeChild(row.querySelector('.cp-code'));
                                row.dataset.lineNumber = line.number;
                                row.setAttribute('role', 'row');
                                row.querySelectorAll('td').forEach(function (cell) {
                                    cell.setAttribute('role', 'cell');
                                });
                                annotationRows.push(row);
                                if (!diffData && groupEnd) row.className = border;
                                else if (diffData && previousOrigin !== line.update) row.className = 'cp-block-start';
                                previousOrigin = line.update;
                                fragment.appendChild(row);
                            });
                            node('cp-attribution').appendChild(fragment);
                            if (!diffData) creditEditor.deltaDecorations([], decorations);
                            creditEditor.onDidScrollChange(updateGutter);
                            creditEditor.onDidContentSizeChange(scheduleAnnotationLayout);
                            creditEditor.onDidLayoutChange(scheduleAnnotationLayout);
                            creditEditor.onDidChangeConfiguration(scheduleAnnotationLayout);
                            creditEditor.onDidChangeViewZones(scheduleAnnotationLayout);
                            applyHiddenLines();
                            node('cp-table-fallback').hidden = true;
                            scrollWhenReady();
                            return true;
                        } catch (e) {
                            disposeCredit();
                            return false;
                        }
                    }

                    function renderCode() {
                        if (creditEditor && codeMatches.some(Boolean)) {
                            try {
                                applyHiddenLines();
                                scrollWhenReady();
                                return;
                            } catch (e) {}
                        }
                        disposeCredit();
                        var tbody = node('cp-lines');
                        tbody.textContent = '';
                        if (!codeMatches.some(Boolean)) {
                            var row = element('tr'),
                                cell = element(
                                    'td',
                                    data.lines.length
                                        ? 'No matches.'
                                        : data.deleted
                                          ? 'Record deleted.'
                                          : 'No code in this update set.',
                                    'cp-empty'
                                );
                            cell.colSpan = 5;
                            row.appendChild(cell);
                            tbody.appendChild(row);
                            scrollWhenReady();
                            return;
                        }
                        if (monacoCredit()) return;
                        var fragment = document.createDocumentFragment(),
                            previousOrigin;
                        data.lines.forEach(function (line, index) {
                            if (!codeMatches[index]) return;
                            var row = attribution(line);
                            if (previousOrigin !== line.update) row.className = 'cp-block-start';
                            previousOrigin = line.update;
                            fragment.appendChild(row);
                        });
                        tbody.appendChild(fragment);
                        scrollWhenReady();
                    }

                    function attribution(line) {
                        var row = element('tr'),
                            snapshot = updates[line.update];
                        var time = element('td', snapshot ? snapshot.time : '', 'cp-time');
                        time.title = time.textContent;
                        row.appendChild(time);
                        var author = element('td', undefined, 'cp-origin'),
                            authorCell = element('div', undefined, 'cp-cell');
                        authorCell.tabIndex = 0;
                        var authorText = element('span', snapshot ? snapshot.author : 'Unknown', 'cp-cell-text');
                        authorText.title = authorText.textContent;
                        authorCell.appendChild(authorText);
                        if (snapshot) contextCell(authorCell, 'author', snapshot);
                        author.appendChild(authorCell);
                        row.appendChild(author);
                        var set = element('td', undefined, 'cp-update-set'),
                            setCell = element('div', undefined, 'cp-cell');
                        setCell.tabIndex = 0;
                        var name = snapshot && snapshot.updateSet ? snapshot.updateSet.name : '—',
                            text = element('span', name, 'cp-cell-text');
                        text.title = name;
                        setCell.appendChild(text);
                        if (snapshot) contextCell(setCell, 'update set', snapshot);
                        set.appendChild(setCell);
                        row.appendChild(set);
                        row.appendChild(element('td', String(line.number), 'cp-number'));
                        row.appendChild(element('td', line.text, 'cp-code'));
                        return row;
                    }

                    function closeDiff() {
                        diffRequest++;
                        window.clearTimeout(diffTimer);
                        diffData = null;
                        node('cp-diff-close').hidden = true;
                        setFieldStatus(data.warnings.join(' '));
                        disposeCredit();
                        if (section.open) renderCode();
                    }
                    function showDiff(snapshot) {
                        if (snapshot.id === data.selected) return;
                        if (diffData) {
                            diffData = null;
                            disposeCredit();
                            renderCode();
                        }
                        var request = ++diffRequest;
                        window.clearTimeout(diffTimer);
                        node('cp-diff-close').hidden = false;
                        function fail(message) {
                            setFieldStatus(message, true);
                        }
                        if (!window.monaco) {
                            fail('Comparison requires Monaco.');
                            return;
                        }
                        setFieldLoading('Loading comparison…');
                        diffTimer = window.setTimeout(function () {
                            if (request !== diffRequest || disposed) return;
                            diffRequest++;
                            fail('Comparison timed out.');
                        }, requestTimeout);
                        function receiveComparison(result) {
                            changed();
                            if (disposed || request !== diffRequest) return;
                            window.clearTimeout(diffTimer);
                            if (!result.success) {
                                fail(result.error || 'Comparison unavailable.');
                                return;
                            }
                            if (
                                result.table !== data.table ||
                                result.record !== data.record ||
                                !result.left ||
                                !result.right ||
                                result.left.sys_id !== snapshot.id ||
                                result.right.sys_id !== data.selected ||
                                !result.left.fields ||
                                !result.right.fields ||
                                String(result.right.fields[entry.name] || '').replace(/\r\n?/g, '\n') !==
                                    data.lines
                                        .map(function (line) {
                                            return line.text;
                                        })
                                        .join('\n')
                            ) {
                                fail('The customer update changed. Reload to compare.');
                                return;
                            }
                            diffData = { code: String(result.left.fields[entry.name] || '').replace(/\r\n?/g, '\n') };
                            setFieldStatus(data.warnings.join(' '));
                            disposeCredit();
                            if (section.open) renderCode();
                            if (section.open && !diffEditor) fail('Comparison unavailable.');
                        }
                        if (ctrl.data.tableApi) {
                            sharedHistory(ctrl.data)
                                .then(function (cache) {
                                    var left = cache.byId[snapshot.id],
                                        right = cache.byId[data.selected];
                                    if (
                                        !left ||
                                        !right ||
                                        left.values[entry.name] === null ||
                                        right.values[entry.name] === null
                                    )
                                        receiveComparison({
                                            success: false,
                                            error: 'Comparison snapshot is unavailable.',
                                        });
                                    else
                                        receiveComparison({
                                            success: true,
                                            table: data.table,
                                            record: data.record,
                                            left: { sys_id: left.id, fields: left.values },
                                            right: { sys_id: right.id, fields: right.values },
                                        });
                                })
                                .catch(function (error) {
                                    receiveComparison({ success: false, error: error.message });
                                });
                        } else {
                            var ga = new GlideAjax('WidgetEditorCreditAjax');
                            ga.addParam('sysparm_name', 'getComparison');
                            ga.addParam('sysparm_update', data.selected);
                            ga.addParam('sysparm_from_update', snapshot.id);
                            ga.getXMLAnswer(function (answer) {
                                var result;
                                try {
                                    result = JSON.parse(answer || '{}');
                                } catch (e) {
                                    result = {};
                                }
                                receiveComparison(result);
                            });
                        }
                    }
                    node('cp-diff-close').addEventListener('click', function () {
                        closeDiff();
                        var trigger = section.querySelector('[data-context-kind="update set"]');
                        if (trigger) trigger.focus({ preventScroll: true });
                    });

                    function updateView() {
                        if (!section.open || !data) return;
                        if (!creditEditor) renderCode();
                        else {
                            if (diffEditor) diffEditor.layout();
                            else creditEditor.layout();
                            layoutAnnotations();
                            scrollWhenReady();
                        }
                    }
                    function setData(result) {
                        data = result;
                        if (Number(result.requestTimeout) > 0) requestTimeout = Number(result.requestTimeout);
                        data.updates.forEach(function (snapshot) {
                            updates[snapshot.id] = snapshot;
                        });
                        entry.lineCount = data.lines.length + ' lines';
                        entry.disabled = data.lines.length === 0;
                        changed();
                        if (entry.disabled) {
                            section.open = false;
                            return;
                        }
                        setFieldStatus(data.warnings.join(' '));
                        applyFilters();
                    }
                    function loadField() {
                        if (data || pending || disposed || entry.disabled) return;
                        pending = true;
                        var request = ++fieldRequest,
                            parentRequest = sequence,
                            cursor = '0',
                            historyKey = '';
                        setFieldLoading('Loading…');
                        function active() {
                            return (
                                !disposed &&
                                !entry.disabled &&
                                request === fieldRequest &&
                                parentRequest === sequence &&
                                pending
                            );
                        }
                        function fail(message) {
                            if (!active()) return;
                            pending = false;
                            window.clearTimeout(timer);
                            if (fieldWorker) fieldWorker.terminate();
                            fieldWorker = null;
                            setFieldStatus(message, true);
                            changed();
                        }
                        function nextBatch() {
                            timer = window.setTimeout(function () {
                                fail('Request timed out.');
                            }, requestTimeout);
                            var ga = new GlideAjax('WidgetEditorCreditAjax');
                            ga.addParam('sysparm_name', 'getCredit');
                            ga.addParam('sysparm_update', updateId);
                            ga.addParam('sysparm_field', entry.name);
                            ga.addParam('sysparm_snapshots', 'true');
                            ga.addParam('sysparm_cursor', cursor);
                            ga.addParam('sysparm_history_key', historyKey);
                            ga.getXMLAnswer(function (answer) {
                                if (!active()) return;
                                try {
                                    var result = JSON.parse(answer || '{}');
                                    if (!result.success) {
                                        fail(result.error || 'Field unavailable.');
                                        return;
                                    }
                                    function accept(result) {
                                        if (!active()) return;
                                        window.clearTimeout(timer);
                                        if (result.nextCursor) {
                                            if (
                                                !/^\d+$/.test(result.nextCursor) ||
                                                Number(result.nextCursor) <= Number(cursor)
                                            ) {
                                                fail('Invalid field cursor.');
                                                return;
                                            }
                                            cursor = result.nextCursor;
                                            historyKey = result.historyKey;
                                            nextBatch();
                                        } else {
                                            pending = false;
                                            if (fieldWorker) fieldWorker.terminate();
                                            fieldWorker = null;
                                            setData(result);
                                        }
                                    }
                                    if (result.snapshots) {
                                        if (!fieldWorker)
                                            fieldWorker = new Worker(
                                                '/widget_editor_credit_worker.jsdbx?sysparm_substitute=false&v=2'
                                            );
                                        matchBatch(fieldWorker, 'credit', result, accept, fail);
                                    } else accept(result);
                                } catch (e) {
                                    fail('Field could not be loaded or calculated.');
                                }
                            });
                        }
                        if (ctrl.data.tableApi) {
                            var context = ctrl.data;
                            timer = window.setTimeout(function () {
                                fail('Request timed out.');
                            }, requestTimeout);
                            sharedHistory(context)
                                .then(function (cache) {
                                    if (!active()) return;
                                    var selected = cache.byId[context.selected];
                                    if (!selected || selected.values[entry.name] === null) {
                                        entry.unavailable = true;
                                        entry.disabled = true;
                                        changed();
                                        return;
                                    }
                                    var cutoff = cache.snapshots.indexOf(selected);
                                    var snapshots = cache.snapshots.slice(0, cutoff + 1).map(function (snapshot) {
                                        var values = {};
                                        values[entry.name] = snapshot.values[entry.name];
                                        return Object.assign({}, snapshot, { values: values });
                                    });
                                    window.clearTimeout(timer);
                                    timer = window.setTimeout(function () {
                                        fail('Calculation timed out.');
                                    }, requestTimeout);
                                    fieldWorker = new Worker(
                                        '/widget_editor_credit_worker.jsdbx?sysparm_substitute=false&v=2'
                                    );
                                    matchBatch(
                                        fieldWorker,
                                        'credit',
                                        Object.assign({}, context, {
                                            tableApi: undefined,
                                            field: entry.name,
                                            snapshots: snapshots,
                                            limits: context.tableApi.limits,
                                            partial: cache.partial,
                                            nextCursor: '',
                                        }),
                                        function (result) {
                                            if (!active()) return;
                                            window.clearTimeout(timer);
                                            pending = false;
                                            fieldWorker.terminate();
                                            fieldWorker = null;
                                            setData(result);
                                        },
                                        fail
                                    );
                                })
                                .catch(function (error) {
                                    fail(error.message || 'Field could not be loaded.');
                                });
                        } else nextBatch();
                    }
                    section.addEventListener('toggle', function () {
                        changed();
                        if (disposed || !section.isConnected) return;
                        if (section.open && entry.disabled) {
                            section.open = false;
                            return;
                        }
                        if (section.open) {
                            pendingScrollSection = section;
                            requestedField = entry.name;
                            updateUrl();
                            updateTitle();
                            loadField();
                            updateView();
                        } else {
                            if (pendingScrollSection === section) pendingScrollSection = null;
                            disposeCredit();
                        }
                    });
                    gutter.addEventListener(
                        'wheel',
                        function (event) {
                            if (!creditEditor || !event.deltaY) return;
                            var delta =
                                event.deltaY *
                                (event.deltaMode === 1
                                    ? creditEditor.getOption(monaco.editor.EditorOption.fontInfo).lineHeight
                                    : event.deltaMode === 2
                                      ? gutter.clientHeight
                                      : 1);
                            var before = creditEditor.getScrollTop();
                            creditEditor.setScrollTop(before + delta);
                            if (creditEditor.getScrollTop() !== before) event.preventDefault();
                        },
                        { passive: false }
                    );
                    gutter.addEventListener('focusin', function (event) {
                        if (!creditEditor) return;
                        var row = event.target.closest('tr[data-line-number]');
                        if (row) creditEditor.revealLine(Number(row.dataset.lineNumber));
                        updateGutter();
                    });
                    gutter.addEventListener(
                        'touchstart',
                        function (event) {
                            touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
                        },
                        { passive: true }
                    );
                    gutter.addEventListener(
                        'touchmove',
                        function (event) {
                            if (!creditEditor || touchY === null || touchY === undefined || event.touches.length !== 1)
                                return;
                            var next = event.touches[0].clientY,
                                before = creditEditor.getScrollTop();
                            creditEditor.setScrollTop(before + touchY - next);
                            touchY = next;
                            if (creditEditor.getScrollTop() !== before) event.preventDefault();
                        },
                        { passive: false }
                    );
                    gutter.addEventListener('touchend', function () {
                        touchY = null;
                    });
                    updateView();
                    return {
                        section: section,
                        updateView: updateView,
                        release: disposeCredit,
                        recalculate: function () {
                            fieldRequest++;
                            pending = false;
                            if (fieldWorker) fieldWorker.terminate();
                            fieldWorker = null;
                            window.clearTimeout(timer);
                            window.clearTimeout(diffTimer);
                            diffRequest++;
                            diffData = null;
                            node('cp-diff-close').hidden = true;
                            data = null;
                            updates = {};
                            disposeCredit();
                            node('cp-lines').textContent = '';
                            if (section.open) loadField();
                        },
                        dispose: function () {
                            disposed = true;
                            if (fieldWorker) fieldWorker.terminate();
                            fieldWorker = null;
                            if (pendingScrollSection === section) pendingScrollSection = null;
                            window.clearTimeout(timer);
                            window.clearTimeout(diffTimer);
                            diffRequest++;
                            disposeCredit();
                        },
                    };
                }

                function render(result) {
                    borderStyles.textContent = '';
                    borderClasses = Object.create(null);
                    data = result;
                    if (Number(result.requestTimeout) > 0) requestTimeout = Number(result.requestTimeout);
                    ctrl.data = result;
                    tableName = data.table;
                    recordId = data.record;
                    updateId = data.selected;
                    ctrl.recordName = data.recordName || data.record;
                    ctrl.tableLabel = data.tableLabel || data.table;
                    config.description = ctrl.recordName + ' (' + ctrl.tableLabel + ')';
                    ctrl.recordHref = navUrl(data.table + '.do?sys_id=' + encodeURIComponent(data.record));
                    ctrl.editorHref = navUrl(
                        'ui_page.do?sys_id=8b2e70458373fe1070b8b5dfeeaad35e&widget_id=' +
                            encodeURIComponent(data.record)
                    );
                    syncPickers();
                    updateUrl();
                    ctrl.updateSets = data.updateSets.slice().reverse();
                    ctrl.selectedSet = ctrl.updateSets.filter(function (set) {
                        return set.id === data.selected;
                    })[0];
                    ctrl.status = '';
                    ctrl.fields = data.fields.map(function (entry) {
                        return {
                            name: entry.name,
                            label: entry.label,
                            language: entry.language,
                            key: sequence + ':' + entry.name,
                        };
                    });
                    if (data.tableApi) {
                        var historyRequest = sequence;
                        sharedHistory(data)
                            .then(showLineCounts)
                            .catch(function (error) {
                                if (historyRequest !== sequence || $scope.$$destroyed) return;
                                ctrl.status = error.message || 'History could not be loaded. Reload to try again.';
                                ctrl.error = true;
                                changed();
                            });
                    }
                    closeUpdateDropdown(false);
                    updateScrollOffset();
                    if (openStatisticsOnLoad) {
                        openStatisticsOnLoad = false;
                        setStatisticsOpen(true);
                        loadStatistics();
                    }
                    updateTitle();
                }
                ctrl.mountField = function (entry, index, section, fieldScope) {
                    var view = createFieldView(entry, index, section, fieldScope);
                    fieldViews.push(view);
                    fieldScope.$on('$destroy', function () {
                        view.dispose();
                        var index = fieldViews.indexOf(view);
                        if (index !== -1) fieldViews.splice(index, 1);
                    });
                };
                ctrl.mountPickers = setupPickers;

                function load(preserveHistory) {
                    if (!preserveHistory) clearHistory();
                    window.clearTimeout(contextTimer);
                    resetStatistics();
                    closeMenu(false);
                    var request = ++sequence;
                    ctrl.loading = true;
                    closeUpdateDropdown(false);
                    ctrl.data = null;
                    ctrl.fields = [];
                    fieldViews.forEach(function (view) {
                        view.dispose();
                    });
                    fieldViews = [];
                    data = null;
                    ctrl.error = ctrl.empty = false;
                    ctrl.status = 'Loading update sets…';
                    changed();
                    syncTitle();
                    if (!updateId && (!tableName || !recordId)) {
                        ctrl.loading = false;
                        ctrl.empty = true;
                        ctrl.status = tableName ? 'Select a record.' : 'Select a table.';
                        return;
                    }
                    function failed(message, emptyHistory) {
                        ctrl.error = !emptyHistory;
                        ctrl.empty = !!emptyHistory;
                        changed();
                        if (emptyHistory) {
                            ctrl.updateSets = [];
                            ctrl.selectedSet = null;
                        }
                        ctrl.status = message;
                        ctrl.loading = false;
                        closeUpdateDropdown(false);
                        syncTitle();
                    }
                    var timer = (contextTimer = window.setTimeout(function () {
                        if (request !== sequence) return;
                        sequence++;
                        failed('The request timed out. Reload to try again.');
                    }, requestTimeout));
                    var ga = new GlideAjax('WidgetEditorCreditAjax');
                    ga.addParam('sysparm_name', 'getCredit');
                    ga.addParam('sysparm_context', 'true');
                    if (updateId) ga.addParam('sysparm_update', updateId);
                    else {
                        ga.addParam('sysparm_table', tableName);
                        ga.addParam('sysparm_record', recordId);
                    }
                    ga.getXMLAnswer(function (answer) {
                        changed();
                        window.clearTimeout(timer);
                        if (request !== sequence) return;
                        var result;
                        try {
                            result = JSON.parse(answer || '{}');
                        } catch (e) {
                            result = {};
                        }
                        ctrl.loading = false;
                        if (!result.success) {
                            failed(
                                result.error || 'Credit+ could not load this customer update. Reload to try again.',
                                result.errorCode === 'no_customer_updates'
                            );
                            return;
                        }
                        render(result);
                    });
                }

                ctrl.reload = load;
                listen(window, 'pagehide', function () {
                    clearHistory();
                    resetStatistics();
                    closeMenu(false);
                    pickerTimers.forEach(function (timer) {
                        window.clearTimeout(timer);
                    });
                    pickerRequests[0]++;
                    pickerRequests[1]++;
                    [tablePicker, recordPicker].forEach(function (picker) {
                        if (picker) {
                            picker.off('.credit');
                            picker.select2('destroy');
                            picker.remove();
                        }
                    });
                    tablePicker = null;
                    recordPicker = null;
                    fieldViews.forEach(function (view) {
                        view.release();
                    });
                    window.clearTimeout(titleTimer);
                });
                function updateScrollOffset() {
                    var height = document.querySelector('.dc-header').getBoundingClientRect().height + 12;
                    document.documentElement.style.scrollPaddingTop = height + 'px';
                }
                var headerObserver;
                if (window.ResizeObserver) {
                    headerObserver = new ResizeObserver(updateScrollOffset);
                    headerObserver.observe(document.querySelector('.dc-header'));
                } else listen(window, 'resize', updateScrollOffset);
                listen(window, 'pagehide', function () {
                    if (headerObserver) headerObserver.disconnect();
                });
                listen(window, 'pageshow', function () {
                    setupPickers();
                    if (headerObserver) headerObserver.observe(document.querySelector('.dc-header'));
                    updateScrollOffset();
                    updateTitle();
                    fieldViews.forEach(function (view) {
                        view.updateView();
                    });
                });
                $scope.$on('$destroy', function () {
                    clearHistory();
                    sequence++;
                    window.clearTimeout(contextTimer);
                    resetStatistics();
                    cleanups.forEach(function (cleanup) {
                        cleanup();
                    });
                    if (headerObserver) headerObserver.disconnect();
                    [tablePicker, recordPicker].forEach(function (picker) {
                        if (picker) {
                            picker.off('.credit');
                            picker.select2('destroy');
                            picker.remove();
                        }
                    });
                    pickerTimers.forEach(function (timer) {
                        window.clearTimeout(timer);
                    });
                    pickerRequests[0]++;
                    pickerRequests[1]++;
                    window.clearTimeout(titleTimer);
                    closeMenu(false);
                    contextMenu.remove();
                });
                $scope.$evalAsync(function () {
                    updateScrollOffset();
                    syncTitle();
                    load();
                });
            },
        ]);
        app.directive('creditField', function () {
            return {
                restrict: 'A',
                require: '^ngController',
                template: function () {
                    return document.getElementById('cp-field-template').innerHTML;
                },
                link: function (scope, element, attrs, ctrl) {
                    ctrl.mountField(scope.field, scope.$index, element[0], scope);
                },
            };
        });
        app.directive('creditRecordPickers', function () {
            return {
                restrict: 'A',
                require: '^ngController',
                link: function (scope, element, attrs, ctrl) {
                    ctrl.mountPickers();
                },
            };
        });
        angular.bootstrap(page, ['weCredit']);
    }
    if (typeof addAfterPageLoadedEvent === 'function') addAfterPageLoadedEvent(initialise);
    else if (document.readyState !== 'loading') initialise();
    else document.addEventListener('DOMContentLoaded', initialise);
})();

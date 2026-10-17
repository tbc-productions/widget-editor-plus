(function () {
    'use strict';
    function renderAvatar(element, name, photo) {
        var colours = ['#176b5b', '#245e9b', '#6b4c9a', '#9b4163', '#8b4e27', '#526a26', '#465a73', '#4b4fa0'],
            username = name.toLowerCase(),
            hash = 0;
        for (var i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) | 0;
        element.classList.add('cp-avatar');
        element.textContent = name.charAt(0).toUpperCase() || '?';
        element.style.backgroundColor = colours[Math.abs(hash) % colours.length];
        element.style.color = '#fff';
        if (/^[0-9a-f]{32}$/i.test(photo || '')) {
            var image = document.createElement('img');
            image.alt = '';
            image.src = '/' + photo + '.iix?t=medium';
            image.onerror = function () {
                image.remove();
            };
            element.appendChild(image);
        }
    }
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
                var preferences = config.preferences || {};
                ctrl.attributionView = params.get('sysparm_view') || preferences.view;
                if (['grouped', 'columns'].indexOf(ctrl.attributionView) === -1) ctrl.attributionView = 'grouped';
                page.classList.toggle('cp-columns-view', ctrl.attributionView === 'columns');
                ctrl.changeAttributionView = function (view) {
                    if (ctrl.attributionView === view) return;
                    ctrl.attributionView = view;
                    closeMenu(false);
                    page.classList.toggle('cp-columns-view', view === 'columns');
                    fieldViews.forEach(function (fieldView) {
                        fieldView.changeAttributionView();
                    });
                    updateUrl();
                    savePreferences();
                };
                ctrl.whitespaceOptions = [
                    { value: 'none', label: 'Show all changes' },
                    { value: 'all', label: 'Ignore whitespace when comparing lines' },
                    { value: 'changes', label: 'Ignore changes in amount of whitespace' },
                    { value: 'eol', label: 'Ignore changes in whitespace at EOL' },
                ];
                ctrl.whitespaceMode = params.get('sysparm_whitespace') || preferences.whitespace || 'all';
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
                ctrl.editorMenuOpen = false;
                ctrl.closeEditorMenu = function (restoreFocus) {
                    if (!ctrl.editorMenuOpen) return;
                    ctrl.editorMenuOpen = false;
                    if (restoreFocus) document.getElementById('cp-open-toggle').focus();
                    changed();
                };
                ctrl.editorMenuKeydown = function (event) {
                    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                    event.preventDefault();
                    ctrl.editorMenuOpen = true;
                    $scope.$$postDigest(function () {
                        window.requestAnimationFrame(function () {
                            if (ctrl.editorMenuOpen && !$scope.$$destroyed)
                                document.getElementById('cp-record-link').focus();
                        });
                    });
                };
                listen(document, 'click', function (event) {
                    if (!event.target.closest('#cp-whitespace-control')) closeWhitespace(false);
                    if (!event.target.closest('#cp-open-actions')) ctrl.closeEditorMenu(false);
                });
                listen(document, 'focusin', function (event) {
                    if (!event.target.closest('#cp-whitespace-control')) closeWhitespace(false);
                    if (!event.target.closest('#cp-open-actions')) ctrl.closeEditorMenu(false);
                });
                listen(document, 'keydown', function (event) {
                    if (event.key === 'Escape' && ctrl.editorMenuOpen) {
                        event.preventDefault();
                        ctrl.closeEditorMenu(true);
                    }
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
                    savePreferences();
                };
                var pendingPreferences,
                    savingPreferences = false,
                    preferenceTimer;
                function savePreferences() {
                    pendingPreferences = { view: ctrl.attributionView, whitespace: ctrl.whitespaceMode };
                    writePreferences();
                }
                function writePreferences() {
                    if (savingPreferences || !pendingPreferences || $scope.$$destroyed) return;
                    var value = pendingPreferences;
                    pendingPreferences = null;
                    savingPreferences = true;
                    var finished = false;
                    function done(success) {
                        if (finished || $scope.$$destroyed) return;
                        finished = true;
                        window.clearTimeout(preferenceTimer);
                        savingPreferences = false;
                        ctrl.preferenceError = success
                            ? ''
                            : 'Could not save Credit preferences. Change an option to try again.';
                        changed();
                        writePreferences();
                    }
                    preferenceTimer = window.setTimeout(function () {
                        done(false);
                    }, requestTimeout);
                    try {
                        var ga = new GlideAjax('WidgetEditorCreditAjax');
                        ga.addParam('sysparm_name', 'savePreferences');
                        ga.addParam('sysparm_preferences', JSON.stringify(value));
                        ga.getXMLAnswer(function (answer) {
                            try {
                                done(JSON.parse(answer).success === true);
                            } catch (e) {
                                done(false);
                            }
                        });
                    } catch (e) {
                        done(false);
                    }
                }
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

                var contributors = Object.create(null);
                function attributionAvatar(name) {
                    var avatar = element('span');
                    avatar.dataset.author = name.toLowerCase();
                    avatar.setAttribute('aria-hidden', 'true');
                    renderAvatar(avatar, name, (contributors[name.toLowerCase()] || {}).photo);
                    return avatar;
                }
                function loadContributors(snapshots) {
                    var names = [];
                    snapshots.forEach(function (snapshot) {
                        var name = snapshot.author || '';
                        if (name && !Object.prototype.hasOwnProperty.call(contributors, name.toLowerCase())) {
                            contributors[name.toLowerCase()] = null;
                            names.push(name);
                        }
                    });
                    if (!names.length) return;
                    try {
                        var ga = new GlideAjax('WidgetEditorCreditAjax');
                        ga.addParam('sysparm_name', 'getContributors');
                        ga.addParam('sysparm_authors', JSON.stringify(names));
                        ga.getXMLAnswer(function (answer) {
                            if ($scope.$$destroyed) return;
                            try {
                                var result = JSON.parse(answer || '{}');
                                if (!result.success || !result.contributors) return;
                                names.forEach(function (name) {
                                    var key = name.toLowerCase();
                                    contributors[key] = result.contributors[key] || {};
                                });
                                page.querySelectorAll('.cp-origin .cp-avatar').forEach(function (avatar) {
                                    var person = contributors[avatar.dataset.author];
                                    if (person)
                                        renderAvatar(avatar, person.name || avatar.dataset.author, person.photo);
                                });
                            } catch (e) {} // Initials keep attribution usable when photos cannot be loaded.
                        });
                    } catch (e) {} // Photo retrieval must not block code attribution.
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
                                '{--cp-group-colour:hsla(' +
                                hue +
                                ',60%,45%,0.8);}' +
                                '#credit-plus .cp-origin.' +
                                className +
                                '{border-left:3px solid var(--cp-group-colour);}'
                        )
                    );
                    borderClasses[key] = className;
                    return className;
                }

                var statisticsRequest = 0,
                    statisticsTimer,
                    statisticsWorker,
                    statisticsScrollFrame;
                ctrl.rankIcons = [
                    'fa-trophy cp-rank-gold',
                    'fa-certificate cp-rank-silver',
                    'fa-certificate cp-rank-bronze',
                ];
                ctrl.skeletonFacts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
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
                                document.getElementById('cp-statistics-container').scrollIntoView({
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
                    function fact(label, icon, value, record, style) {
                        facts.push({
                            label: label,
                            icon: icon,
                            value: value,
                            href: record ? statisticsUrl(record) : '',
                            style: style || '',
                        });
                    }
                    var ageIcon = stats.ageDays === null ? 'fa-question-circle' : 'fa-clock-o';
                    fact('Age', ageIcon, stats.ageDays === null ? 'Unknown' : stats.ageDays.toLocaleString() + ' days');
                    fact('Update sets', 'fa-cubes', stats.updateSetCount.toLocaleString());
                    fact('Founder', 'fa-leaf', stats.founder || 'Unknown', { userId: stats.founderUserId });
                    fact('Contributors', 'fa-users', stats.contributorCount.toLocaleString());
                    if (stats.activity)
                        fact(
                            'Longest quiet spell',
                            'fa-moon-o',
                            stats.longestQuietDays === null
                                ? 'No gap yet'
                                : stats.longestQuietDays.toLocaleString() + ' days',
                            null,
                            'cp-stat-text'
                        );
                    fact('Lines created', 'fa-plus-circle', stats.added.toLocaleString(), null, 'cp-stat-added');
                    fact('Lines destroyed', 'fa-minus-circle', stats.removed.toLocaleString(), null, 'cp-stat-removed');
                    if (stats.busiestField)
                        fact('Busiest field', 'fa-bolt', stats.busiestField.name, null, 'cp-stat-text');
                    if (stats.biggestMakeover)
                        fact(
                            'Biggest makeover',
                            'fa-magic',
                            stats.biggestMakeover.name,
                            stats.biggestMakeover,
                            'cp-stat-text'
                        );
                    if (stats.activity) {
                        fact(
                            'Busiest month',
                            'fa-calendar',
                            stats.busiestMonth
                                ? new Date(stats.busiestMonth + '-01T00:00:00Z').toLocaleDateString('en-AU', {
                                      month: 'long',
                                      year: 'numeric',
                                      timeZone: 'UTC',
                                  })
                                : 'No activity',
                            null,
                            'cp-stat-text'
                        );
                    }
                    function board(title, icon, group, entries, metric) {
                        boards.push({
                            title: title,
                            metric: metric,
                            icon: icon,
                            group: group,
                            empty: metric === 'added' ? 'No additions' : 'No removals',
                            entries: entries
                                .filter(function (entry) {
                                    return entry[metric] > 0;
                                })
                                .map(function (entry) {
                                    return {
                                        name: entry.name,
                                        photo: entry.photo || '',
                                        href: statisticsUrl(entry),
                                        score: entry[metric].toLocaleString() + ' lines',
                                        percentage:
                                            (stats[metric] ? (entry[metric] / stats[metric]) * 100 : 0).toFixed(1) +
                                            '%',
                                    };
                                }),
                        });
                    }
                    board('Builders', 'fa-wrench', 'Created by', stats.creators, 'added');
                    board('Destroyers', 'fa-bomb', 'Created by', stats.destroyers, 'removed');
                    board('Expansions', 'fa-building', 'Update sets', stats.creatorSets, 'added');
                    board('Demolitions', 'fa-gavel', 'Update sets', stats.destroyerSets, 'removed');
                    ctrl.statistics.facts = facts;
                    ctrl.statistics.boards = boards;
                    ctrl.statistics.activity = stats.activity || [];
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
                                activity: [],
                            };
                        accumulated.added += stats.added;
                        accumulated.removed += stats.removed;
                        accumulated.activity = accumulated.activity.concat(stats.activity || []);
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
                                if (entry.photo) previous.photo = entry.photo;
                            });
                        }
                        collect(stats.creators, accumulated.authors, function (entry) {
                            return entry.name.toLowerCase();
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
                        var months = Object.create(null);
                        stats.activity = accumulated.activity
                            .filter(function (point) {
                                if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(point.time || '')) return false;
                                point.timestamp = Date.parse(point.time.replace(' ', 'T') + 'Z');
                                return (
                                    isFinite(point.timestamp) &&
                                    new Date(point.timestamp).toISOString().slice(0, 19).replace('T', ' ') ===
                                        point.time
                                );
                            })
                            .sort(function (a, b) {
                                return a.timestamp - b.timestamp || a.id.localeCompare(b.id);
                            });
                        stats.longestQuietDays = null;
                        stats.busiestMonth = '';
                        var busiestTotal = 0;
                        stats.activity.forEach(function (point, index) {
                            var month = point.time.slice(0, 7);
                            months[month] = (months[month] || 0) + point.added + point.removed;
                            if (index)
                                stats.longestQuietDays = Math.max(
                                    stats.longestQuietDays || 0,
                                    Math.floor((point.timestamp - stats.activity[index - 1].timestamp) / 86400000)
                                );
                        });
                        Object.keys(months)
                            .sort()
                            .forEach(function (month) {
                                if (months[month] > busiestTotal) {
                                    stats.busiestMonth = month;
                                    busiestTotal = months[month];
                                }
                            });
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
                                                '/widget_editor_credit_worker.jsdbx?sysparm_substitute=false&v=3'
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
                                        '/widget_editor_credit_worker.jsdbx?sysparm_substitute=false&v=3'
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
                    if (
                        ctrl.whitespaceMode === 'all' &&
                        ['none', 'changes', 'eol'].indexOf(preferences.whitespace) === -1
                    )
                        params.delete('sysparm_whitespace');
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
                    if (ctrl.attributionView === 'columns' || preferences.view === 'columns')
                        params.set('sysparm_view', ctrl.attributionView);
                    else params.delete('sysparm_view');
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
                        attributionBlocks = [],
                        groupZones = [],
                        annotationFrame,
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
                    function attributionGroups() {
                        var groups = [];
                        data.lines.forEach(function (line, index) {
                            if (!codeMatches[index]) return;
                            var group = groups[groups.length - 1];
                            if (!group || group.lines[0].update !== line.update) {
                                group = { lines: [] };
                                groups.push(group);
                            }
                            group.lines.push(line);
                        });
                        return groups;
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
                        var groups = attributionGroups();
                        annotationRows.forEach(function (row) {
                            row.textContent = '';
                            row.className = '';
                            row.setAttribute('aria-hidden', 'true');
                            delete row.dataset.groupEnd;
                        });
                        groups.forEach(function (group, index) {
                            var first = group.lines[0],
                                last = group.lines[group.lines.length - 1],
                                row = annotationRows[first.number - 1];
                            if (ctrl.attributionView === 'columns') {
                                group.lines.forEach(function (line) {
                                    var target = annotationRows[line.number - 1],
                                        source = attribution(line);
                                    while (source.children.length > 2) target.appendChild(source.firstChild);
                                    target.removeAttribute('aria-hidden');
                                });
                                if (index < groups.length - 1) {
                                    var snapshot = updates[last.update];
                                    annotationRows[last.number - 1].className =
                                        'cp-column-group-end ' + updateSetBorder(snapshot && snapshot.updateSet);
                                }
                            } else {
                                var cell = attribution(first).firstChild;
                                if (index < groups.length - 1) cell.classList.add('cp-group-end');
                                row.appendChild(cell);
                                row.removeAttribute('aria-hidden');
                                row.dataset.groupEnd = last.number;
                            }
                        });
                        if (creditEditor.changeViewZones)
                            creditEditor.changeViewZones(function (accessor) {
                                groupZones.forEach(function (id) {
                                    accessor.removeZone(id);
                                });
                                groupZones = [];
                                var lineHeight = creditEditor.getOption(monaco.editor.EditorOption.fontInfo).lineHeight;
                                groups.forEach(function (group, index) {
                                    var height =
                                        Math.max(
                                            0,
                                            (ctrl.attributionView === 'columns' ? 0 : 48) -
                                                group.lines.length * lineHeight
                                        ) + (index < groups.length - 1 ? 6 : 0);
                                    var snapshot = updates[group.lines[0].update],
                                        separator =
                                            index < groups.length - 1
                                                ? 'cp-group-separator ' +
                                                  updateSetBorder(snapshot && snapshot.updateSet)
                                                : '';
                                    if (height)
                                        groupZones.push(
                                            accessor.addZone({
                                                afterLineNumber: group.lines[group.lines.length - 1].number,
                                                heightInPx: height,
                                                domNode: element('div', undefined, separator),
                                                marginDomNode: element('div', undefined, separator),
                                            })
                                        );
                                });
                            });
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
                        attributionBlocks = [];
                        groupZones = [];
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
                        node('cp-code-monaco').parentNode.style.removeProperty('--cp-content-height');
                        gutter.scrollTop = 0;
                    }

                    function updateGutter() {
                        if (!creditEditor) return;
                        var layout = creditEditor.getLayoutInfo();
                        var scrollbar =
                            creditEditor.getScrollWidth() > layout.contentWidth ? layout.horizontalScrollbarHeight : 0;
                        gutter.style.height = Math.max(0, layout.height - scrollbar) + 'px';
                        gutterContent.style.height = creditEditor.getScrollHeight() + 'px';
                        var scrollTop = creditEditor.getScrollTop();
                        gutterContent.style.transform = 'translateY(' + -scrollTop + 'px)';
                        attributionBlocks.forEach(function (block) {
                            var offset = Math.max(0, Math.min(scrollTop - block.top, block.limit));
                            if (offset !== block.offset) {
                                block.element.style.transform = 'translateY(' + offset + 'px)';
                                block.offset = offset;
                            }
                        });
                    }

                    function layoutAnnotations() {
                        if (!creditEditor) return;
                        var body = node('cp-code-monaco').parentNode;
                        var height = Math.ceil(creditEditor.getContentHeight()) + 'px';
                        if (body.style.getPropertyValue('--cp-content-height') !== height) {
                            body.style.setProperty('--cp-content-height', height);
                            if (diffEditor) diffEditor.layout();
                            else creditEditor.layout();
                        }
                        var font = creditEditor.getOption(monaco.editor.EditorOption.fontInfo);
                        gutterContent.style.fontFamily = font.fontFamily;
                        gutterContent.style.fontSize = font.fontSize + 'px';
                        gutterContent.style.fontWeight = font.fontWeight;
                        gutterContent.style.letterSpacing = font.letterSpacing + 'px';
                        gutterContent.style.lineHeight = font.lineHeight + 'px';
                        attributionBlocks = [];
                        annotationRows.forEach(function (row, index) {
                            // Monaco owns line positions and font metrics; table layout must not accumulate rounding errors.
                            row.style.top = creditEditor.getTopForLineNumber(index + 1) + 'px';
                            row.style.height = font.lineHeight + 'px';
                            var cell = row.querySelector('.cp-origin');
                            if (cell) {
                                cell.style.height =
                                    Math.max(
                                        48,
                                        creditEditor.getTopForLineNumber(Number(row.dataset.groupEnd)) +
                                            font.lineHeight -
                                            creditEditor.getTopForLineNumber(index + 1)
                                    ) + 'px';
                                attributionBlocks.push({
                                    element: cell.querySelector('.cp-attribution-block'),
                                    top: parseFloat(row.style.top),
                                    height: parseFloat(cell.style.height),
                                });
                            }
                        });
                        attributionBlocks.forEach(function (block) {
                            block.limit = Math.max(0, block.height - block.element.offsetHeight);
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
                                padding: { top: 0, bottom: 8 },
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
                            var fragment = document.createDocumentFragment();
                            data.lines.forEach(function (line) {
                                var row = element('tr');
                                row.dataset.lineNumber = line.number;
                                row.setAttribute('role', 'row');
                                annotationRows.push(row);
                                fragment.appendChild(row);
                            });
                            node('cp-attribution').appendChild(fragment);
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
                            cell.colSpan = ctrl.attributionView === 'columns' ? 5 : 3;
                            row.appendChild(cell);
                            tbody.appendChild(row);
                            scrollWhenReady();
                            return;
                        }
                        if (monacoCredit()) return;
                        var fragment = document.createDocumentFragment();
                        var groups = attributionGroups();
                        groups.forEach(function (group, groupIndex) {
                            group.lines.forEach(function (line, index) {
                                var row = attribution(line),
                                    cell = row.querySelector('.cp-origin');
                                if (index === 0) {
                                    if (cell) cell.rowSpan = group.lines.length;
                                    if (groupIndex) {
                                        var previous = updates[groups[groupIndex - 1].lines[0].update];
                                        row.className =
                                            'cp-block-start ' + updateSetBorder(previous && previous.updateSet);
                                    }
                                } else if (cell) cell.remove();
                                fragment.appendChild(row);
                            });
                        });
                        tbody.appendChild(fragment);
                        scrollWhenReady();
                    }

                    function attribution(line) {
                        var row = element('tr'),
                            snapshot = updates[line.update],
                            columns = ctrl.attributionView === 'columns';
                        var author = element(columns ? 'td' : 'div', undefined, 'cp-cell cp-author'),
                            authorText = element('span', snapshot ? snapshot.author : 'Unknown', 'cp-cell-text');
                        authorText.title = authorText.textContent;
                        author.appendChild(authorText);
                        if (snapshot) contextCell(author, 'author', snapshot);
                        var set = element(columns ? 'td' : 'div', undefined, 'cp-cell cp-update-set'),
                            name = snapshot && snapshot.updateSet ? snapshot.updateSet.name : '—',
                            text = element('span', name, 'cp-cell-text');
                        text.title = name;
                        set.appendChild(text);
                        if (snapshot) contextCell(set, 'update set', snapshot);
                        var time = element(columns ? 'td' : 'span', snapshot ? snapshot.time : '', 'cp-time');
                        time.title = time.textContent;
                        if (columns) {
                            var border = updateSetBorder(snapshot && snapshot.updateSet);
                            time.className += ' ' + border;
                            author.className += ' ' + border;
                            author.title = snapshot ? snapshot.author + ' — ' + snapshot.time : 'Unknown';
                            row.appendChild(time);
                            row.appendChild(author);
                            row.appendChild(set);
                        } else {
                            var cell = element(
                                    'td',
                                    undefined,
                                    'cp-origin ' + updateSetBorder(snapshot && snapshot.updateSet)
                                ),
                                block = element('div', undefined, 'cp-attribution-block'),
                                identity = element('div', undefined, 'cp-attribution-identity'),
                                meta = element('div', undefined, 'cp-attribution-meta');
                            block.appendChild(attributionAvatar(snapshot ? snapshot.author : ''));
                            identity.appendChild(author);
                            meta.appendChild(set);
                            meta.appendChild(time);
                            identity.appendChild(meta);
                            block.appendChild(identity);
                            cell.appendChild(block);
                            row.appendChild(cell);
                        }
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
                        loadContributors(data.updates);
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
                                                '/widget_editor_credit_worker.jsdbx?sysparm_substitute=false&v=3'
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
                                        '/widget_editor_credit_worker.jsdbx?sysparm_substitute=false&v=3'
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
                        var block = event.target.closest('.cp-attribution-block'),
                            bounds = block && block.getBoundingClientRect(),
                            viewport = gutter.getBoundingClientRect();
                        if (row && (!bounds || bounds.bottom <= viewport.top || bounds.top >= viewport.bottom))
                            creditEditor.revealLine(Number(row.dataset.lineNumber));
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
                        changeAttributionView: function () {
                            var scrollTop = creditEditor
                                ? creditEditor.getScrollTop()
                                : node('cp-table-fallback').scrollTop;
                            if (data && section.open) {
                                renderCode();
                                if (creditEditor) creditEditor.setScrollTop(scrollTop);
                                else node('cp-table-fallback').scrollTop = scrollTop;
                            }
                        },
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
                    ctrl.closeEditorMenu(false);
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
                        ctrl.empty = true;
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
                    var height = document.querySelector('.dc-header').getBoundingClientRect().height;
                    document.documentElement.style.scrollPaddingTop = height + 12 + 'px';
                    document.documentElement.style.setProperty('--cp-header-height', height + 'px');
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
                    window.clearTimeout(preferenceTimer);
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
        app.directive('creditStatistics', function () {
            return {
                restrict: 'A',
                link: function (scope, element) {
                    scope.$watch('ctrl.statistics.open', function (open) {
                        element[0].open = !!open;
                    });
                },
            };
        });
        app.directive('creditContribution', function () {
            var observer = window.IntersectionObserver
                ? new IntersectionObserver(
                      function (entries) {
                          entries.forEach(function (entry) {
                              if (!entry.isIntersecting) return;
                              entry.target.classList.add('cp-bar-visible');
                              observer.unobserve(entry.target);
                          });
                      },
                      { threshold: 0.1 }
                  )
                : null;
            return {
                restrict: 'A',
                link: function (scope, element) {
                    if (!observer) element[0].classList.add('cp-bar-visible');
                    else {
                        observer.observe(element[0]);
                        scope.$on('$destroy', function () {
                            observer.unobserve(element[0]);
                        });
                    }
                },
            };
        });
        app.directive('creditAvatar', function () {
            return {
                restrict: 'A',
                link: function (scope, element, attrs) {
                    scope.$watch(attrs.creditAvatar, function (author) {
                        if (author) renderAvatar(element[0], author.name, author.photo);
                    });
                },
            };
        });
        app.directive('creditActivity', function () {
            return {
                restrict: 'A',
                link: function (scope, element, attrs) {
                    var root = element[0],
                        viewport = root.querySelector('.cp-activity-viewport'),
                        plot = root.querySelector('.cp-activity-plot'),
                        canvas = root.querySelector('canvas'),
                        avatars = root.querySelector('.cp-activity-avatars'),
                        tooltip = root.querySelector('.cp-activity-tooltip'),
                        error = root.querySelector('.cp-activity-error'),
                        dateRange = root.querySelector('.cp-activity-range'),
                        selection = root.querySelector('.cp-activity-selection'),
                        hoverLayer = root.querySelector('.cp-activity-hover'),
                        guide = root.querySelector('.cp-activity-guide'),
                        halos = root.querySelectorAll('.cp-activity-halo'),
                        activeAvatar,
                        fullscreen = root.querySelector('.cp-activity-fullscreen'),
                        zoomIn = root.querySelector('.cp-activity-zoom-in'),
                        zoomOut = root.querySelector('.cp-activity-zoom-out'),
                        reset = root.querySelector('.cp-activity-reset'),
                        chart,
                        frame,
                        history,
                        points,
                        spacing,
                        dragStart,
                        pointPadding = 16,
                        start = 0,
                        end = 0;
                    function hideTooltip() {
                        tooltip.hidden = true;
                        hoverLayer.hidden = true;
                        if (activeAvatar) activeAvatar.classList.remove('cp-activity-avatar-active');
                        activeAvatar = null;
                    }
                    function hasTotals(point) {
                        return point.available !== false || point.added > 0 || point.removed > 0;
                    }
                    function highlight(index) {
                        hoverLayer.hidden = false;
                        guide.style.left = chart.scale.calculateX(index) + 'px';
                        guide.style.top = chart.scale.startPoint + 'px';
                        guide.style.height = chart.scale.endPoint - chart.scale.startPoint + 'px';
                        halos.forEach(function (halo, dataset) {
                            var dot = chart.datasets[dataset].points[index];
                            halo.hidden = !hasTotals(points[index]) || !dot || !isFinite(dot.y);
                            if (halo.hidden) return;
                            halo.style.left = dot.x + 'px';
                            halo.style.top = dot.y + 'px';
                        });
                        if (activeAvatar) activeAvatar.classList.remove('cp-activity-avatar-active');
                        activeAvatar = avatars.querySelector('[data-point-index="' + index + '"]');
                        if (activeAvatar) activeAvatar.classList.add('cp-activity-avatar-active');
                    }
                    function showTooltip(text, x, y) {
                        tooltip.textContent = text;
                        tooltip.hidden = false;
                        tooltip.style.left = '0px';
                        tooltip.style.left =
                            Math.max(0, Math.min(root.clientWidth - tooltip.offsetWidth, x + 12)) + 'px';
                        tooltip.style.top = y + 12 + 'px';
                    }
                    function details(point) {
                        return (
                            (point.updateSet ? point.updateSet.name : 'Unknown update set') +
                            '\n' +
                            point.time +
                            '\n' +
                            point.added.toLocaleString() +
                            ' additions, ' +
                            point.removed.toLocaleString() +
                            ' removals' +
                            '\n' +
                            point.author
                        );
                    }
                    function destroy() {
                        if (chart) chart.destroy();
                        chart = null;
                        avatars.textContent = '';
                        cancelSelection();
                        hideTooltip();
                    }
                    function render() {
                        frame = null;
                        destroy();
                        var activity = scope.$eval(attrs.creditActivity) || [];
                        if (history !== activity) {
                            history = activity;
                            start = 0;
                            end = history.length - 1;
                        }
                        points = history.slice(start, end + 1);
                        if (!scope.ctrl.statistics.open || !points.length || !viewport.clientWidth) return;
                        var count = points.length,
                            labelStep = Math.max(1, Math.ceil(count / Math.max(2, viewport.clientWidth / 110))),
                            timeLabels =
                                history.length > 1 &&
                                points[0].time.slice(0, 10) === points[count - 1].time.slice(0, 10),
                            seconds = points[count - 1].timestamp - points[0].timestamp < 60000,
                            lastLabel = '';
                        var dates = [points[0], points[count - 1]].map(function (point) {
                            return new Date(point.timestamp).toLocaleDateString('en-AU', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                timeZone: 'UTC',
                            });
                        });
                        dateRange.textContent = dates[0] === dates[1] ? dates[0] : dates.join(' – ');
                        zoomIn.disabled = count <= 1;
                        zoomOut.disabled = reset.disabled = count === history.length;
                        error.hidden = true;
                        try {
                            canvas.width = viewport.clientWidth;
                            canvas.height = plot.clientHeight;
                            canvas.style.width = viewport.clientWidth + 'px';
                            canvas.style.height = plot.clientHeight + 'px';
                            var style = getComputedStyle(root),
                                axisColour = 'rgba(' + style.color.match(/\d+/g).slice(0, 3).join(',') + ',0.25)',
                                colours = ['#22966b', '#d25555'];
                            chart = new window.Chart(canvas.getContext('2d')).Line(
                                {
                                    labels: points.map(function (point, index) {
                                        if (
                                            !(
                                                (index % labelStep === 0 && index < count - 1 - labelStep / 2) ||
                                                index === count - 1
                                            )
                                        )
                                            return '';
                                        var label = timeLabels
                                            ? point.time.slice(11, seconds ? 19 : 16)
                                            : new Date(point.timestamp).toLocaleDateString('en-AU', {
                                                  day: 'numeric',
                                                  month: 'short',
                                                  year: '2-digit',
                                                  timeZone: 'UTC',
                                              });
                                        if (label === lastLabel) return '';
                                        lastLabel = label;
                                        return label;
                                    }),
                                    datasets: ['added', 'removed'].map(function (metric, index) {
                                        return {
                                            label: index ? 'Removals' : 'Additions',
                                            strokeColor: colours[index],
                                            pointColor: colours[index],
                                            pointStrokeColor: colours[index],
                                            data: points.map(function (point) {
                                                return hasTotals(point) ? point[metric] : null;
                                            }),
                                        };
                                    }),
                                },
                                {
                                    animation: false,
                                    responsive: false,
                                    showTooltips: false,
                                    datasetFill: false,
                                    bezierCurve: false,
                                    pointDotRadius: 3,
                                    scaleBeginAtZero: true,
                                    scaleFontColor: style.color,
                                    scaleFontFamily: style.fontFamily,
                                    scaleLineColor: 'rgba(0,0,0,0)',
                                    scaleGridLineColor:
                                        'rgba(' + style.color.match(/\d+/g).slice(0, 3).join(',') + ',0.08)',
                                    scaleShowVerticalLines: false,
                                }
                            );
                            chart.scale.xScalePaddingLeft = Math.max(40, chart.scale.xScalePaddingLeft);
                            chart.scale.xScalePaddingRight = Math.max(40, chart.scale.xScalePaddingRight);
                            spacing =
                                (viewport.clientWidth -
                                    chart.scale.xScalePaddingLeft -
                                    chart.scale.xScalePaddingRight -
                                    2 * pointPadding) /
                                Math.max(1, points.length - 1);
                            chart.scale.calculateX = function (index) {
                                return this.xScalePaddingLeft + pointPadding + index * spacing;
                            };
                            chart.scale.xLabelRotation = 0;
                            chart.scale.startPoint = 40;
                            chart.scale.endPoint = chart.chart.height - 30;
                            chart.draw();
                            // The bundled chart otherwise draws its vertical axis through the first point.
                            var context = chart.chart.ctx;
                            context.beginPath();
                            context.strokeStyle = axisColour;
                            context.lineWidth = 1;
                            context.moveTo(chart.scale.xScalePaddingLeft, chart.scale.startPoint);
                            context.lineTo(chart.scale.xScalePaddingLeft, chart.scale.endPoint);
                            context.lineTo(viewport.clientWidth - chart.scale.xScalePaddingRight, chart.scale.endPoint);
                            context.stroke();
                            points.forEach(function (point, index) {
                                // Thin crowded avatars; zooming restores individual updates.
                                if (index % Math.max(1, Math.ceil(28 / spacing)) !== 0) return;
                                var button = document.createElement('button'),
                                    added = chart.datasets[0].points[index],
                                    removed = chart.datasets[1].points[index];
                                button.type = 'button';
                                button.className = 'cp-activity-avatar';
                                button.dataset.pointIndex = index;
                                renderAvatar(button, point.author, point.photo);
                                button.setAttribute('aria-label', point.author + '; show update details');
                                button.setAttribute('aria-describedby', 'cp-activity-tooltip');
                                button.style.left = chart.scale.calculateX(index) + 'px';
                                button.style.top =
                                    (!hasTotals(point) ? chart.scale.endPoint : Math.min(added.y, removed.y)) -
                                    8 +
                                    'px';
                                function show(text) {
                                    highlight(index);
                                    var rect = button.getBoundingClientRect(),
                                        parent = root.getBoundingClientRect();
                                    showTooltip(text, rect.left - parent.left, rect.bottom - parent.top);
                                }
                                function showSet() {
                                    show(point.updateSet ? point.updateSet.name : 'Unknown update set');
                                }
                                button.addEventListener('mouseenter', showSet);
                                button.addEventListener('focus', showSet);
                                button.addEventListener('click', function () {
                                    show(details(point));
                                });
                                button.addEventListener('mouseleave', hideTooltip);
                                button.addEventListener('blur', hideTooltip);
                                avatars.appendChild(button);
                            });
                        } catch (e) {
                            destroy();
                            error.hidden = false;
                        }
                    }
                    function schedule() {
                        window.cancelAnimationFrame(frame);
                        frame = window.requestAnimationFrame(render);
                    }
                    function isFullscreen() {
                        return document.fullscreenElement === root || root.classList.contains('cp-activity-expanded');
                    }
                    function fullscreenChanged() {
                        fullscreen.setAttribute(
                            'aria-label',
                            isFullscreen() ? 'Exit full screen' : 'Enter full screen'
                        );
                        fullscreen.setAttribute('aria-pressed', String(isFullscreen()));
                        fullscreen.querySelector('i').className =
                            'fa ' + (isFullscreen() ? 'fa-compress' : 'fa-expand');
                        schedule();
                    }
                    function exitFullscreen() {
                        root.classList.remove('cp-activity-expanded');
                        if (document.fullscreenElement === root) document.exitFullscreen().catch(function () {});
                    }
                    function expandFallback() {
                        if (scope.$$destroyed || !scope.ctrl.statistics.open) return;
                        root.classList.add('cp-activity-expanded');
                        fullscreenChanged();
                    }
                    function toggleFullscreen() {
                        if (isFullscreen()) {
                            exitFullscreen();
                            fullscreenChanged();
                        } else if (root.requestFullscreen) root.requestFullscreen().catch(expandFallback);
                        else expandFallback();
                    }
                    function setRange(from, to) {
                        start = Math.max(0, Math.min(history.length - 1, from));
                        end = Math.max(start, Math.min(history.length - 1, to));
                        schedule();
                    }
                    function zoom(factor) {
                        var count = Math.min(history.length, Math.max(1, Math.round(points.length * factor))),
                            from = Math.max(
                                0,
                                Math.min(history.length - count, Math.round((start + end + 1 - count) / 2))
                            );
                        setRange(from, from + count - 1);
                    }
                    function magnify() {
                        zoom(0.5);
                    }
                    function reduce() {
                        zoom(2);
                    }
                    function resetZoom() {
                        setRange(0, history.length - 1);
                    }
                    function pointIndex(x) {
                        return points.length === 1
                            ? 0
                            : Math.max(
                                  0,
                                  Math.min(
                                      points.length - 1,
                                      Math.round((x - chart.scale.xScalePaddingLeft - pointPadding) / spacing)
                                  )
                              );
                    }
                    function beginSelection(event) {
                        if (!chart || event.button !== 0) return;
                        hideTooltip();
                        dragStart = Math.max(
                            0,
                            Math.min(canvas.clientWidth, event.clientX - canvas.getBoundingClientRect().left)
                        );
                        canvas.setPointerCapture(event.pointerId);
                    }
                    function endSelection(event) {
                        if (dragStart === undefined) return;
                        var x = Math.max(
                                0,
                                Math.min(canvas.clientWidth, event.clientX - canvas.getBoundingClientRect().left)
                            ),
                            first = pointIndex(Math.min(dragStart, x)),
                            last = pointIndex(Math.max(dragStart, x)),
                            distance = Math.abs(x - dragStart);
                        dragStart = undefined;
                        selection.hidden = true;
                        if (distance >= 8) setRange(start + first, start + last);
                        else hover(event);
                    }
                    function cancelSelection() {
                        dragStart = undefined;
                        selection.hidden = true;
                    }
                    function hover(event) {
                        if (!chart) return;
                        if (dragStart !== undefined) {
                            var cursor = Math.max(
                                0,
                                Math.min(canvas.clientWidth, event.clientX - canvas.getBoundingClientRect().left)
                            );
                            selection.hidden = false;
                            selection.style.left = Math.min(dragStart, cursor) + 'px';
                            selection.style.width = Math.abs(cursor - dragStart) + 'px';
                            return;
                        }
                        var rect = canvas.getBoundingClientRect(),
                            parent = root.getBoundingClientRect(),
                            x = event.clientX - rect.left,
                            y = event.clientY - rect.top,
                            index = pointIndex(x),
                            point = points.length === 1 ? points[0] : points[index];
                        if (points.length === 1) index = 0;
                        if (
                            !point ||
                            !hasTotals(point) ||
                            !chart.datasets.some(function (dataset) {
                                var dot = dataset.points[index];
                                return Math.abs(dot.x - x) < 12 && Math.abs(dot.y - y) < 12;
                            })
                        ) {
                            hideTooltip();
                            return;
                        }
                        showTooltip(details(point), event.clientX - parent.left, event.clientY - parent.top);
                        highlight(index);
                    }
                    function keyboard(event) {
                        if (event.key === 'Escape') {
                            if (root.classList.contains('cp-activity-expanded')) {
                                exitFullscreen();
                                fullscreenChanged();
                            }
                            hideTooltip();
                            cancelSelection();
                        }
                    }
                    fullscreen.addEventListener('click', toggleFullscreen);
                    document.addEventListener('fullscreenchange', fullscreenChanged);
                    zoomIn.addEventListener('click', magnify);
                    zoomOut.addEventListener('click', reduce);
                    reset.addEventListener('click', resetZoom);
                    canvas.addEventListener('pointerdown', beginSelection);
                    canvas.addEventListener('pointermove', hover);
                    canvas.addEventListener('pointerup', endSelection);
                    canvas.addEventListener('pointercancel', cancelSelection);
                    canvas.addEventListener('mouseleave', hideTooltip);
                    root.addEventListener('keydown', keyboard);
                    window.addEventListener('resize', schedule);
                    var observer = window.ResizeObserver ? new ResizeObserver(schedule) : null,
                        themeObserver = new MutationObserver(schedule);
                    if (observer) observer.observe(viewport);
                    themeObserver.observe(document.documentElement, {
                        attributes: true,
                        attributeFilter: ['class', 'style'],
                    });
                    scope.$watchGroup([attrs.creditActivity, 'ctrl.statistics.open'], function () {
                        if (!scope.ctrl.statistics.open) exitFullscreen();
                        schedule();
                    });
                    scope.$on('$destroy', function () {
                        window.cancelAnimationFrame(frame);
                        if (observer) observer.disconnect();
                        themeObserver.disconnect();
                        window.removeEventListener('resize', schedule);
                        fullscreen.removeEventListener('click', toggleFullscreen);
                        document.removeEventListener('fullscreenchange', fullscreenChanged);
                        exitFullscreen();
                        zoomIn.removeEventListener('click', magnify);
                        zoomOut.removeEventListener('click', reduce);
                        reset.removeEventListener('click', resetZoom);
                        canvas.removeEventListener('pointerdown', beginSelection);
                        canvas.removeEventListener('pointermove', hover);
                        canvas.removeEventListener('pointerup', endSelection);
                        canvas.removeEventListener('pointercancel', cancelSelection);
                        canvas.removeEventListener('mouseleave', hideTooltip);
                        root.removeEventListener('keydown', keyboard);
                        destroy();
                    });
                },
            };
        });
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

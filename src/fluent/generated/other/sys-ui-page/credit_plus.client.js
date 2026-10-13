(function () {
    'use strict';
    var page = document.getElementById('credit-plus');
    if (!page) return;
    var config = window.WE_CREDIT_CONFIG || {},
        params = new URLSearchParams(window.location.search);
    var launchUrl = window.location.pathname.substring(1) + window.location.search,
        notifiedTitle = '',
        notifiedUrl = '';
    var status = document.getElementById('cp-status');
    var retry = document.getElementById('cp-retry');
    var results = document.getElementById('cp-results'),
        warnings = document.getElementById('cp-warnings');
    var updateSelect = document.getElementById('cp-inspect-version');
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
        sequence = 0,
        titleTimer;

    function element(tag, text, className) {
        var node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function navUrl(uri) {
        return '/nav_to.do?uri=' + encodeURIComponent(uri);
    }

    function updateUrl() {
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
            tableName
                ? { id: tableName, text: document.getElementById('cp-table-label').textContent || tableName }
                : null
        );
        recordPicker.select2(
            'data',
            recordId ? { id: recordId, text: document.getElementById('cp-record-name').textContent || recordId } : null
        );
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
                        text: document.getElementById(isTable ? 'cp-table-label' : 'cp-record-name').textContent,
                    });
                },
                query: function (query) {
                    window.clearTimeout(pickerTimers[index]);
                    var request = ++pickerRequests[index],
                        queryTable = tableName;
                    pickerTimers[index] = window.setTimeout(function () {
                        var ga = new GlideAjax('CreditPlus');
                        ga.addParam('sysparm_name', isTable ? 'getTables' : 'getRecords');
                        ga.addParam('sysparm_search', query.term || '');
                        ga.addParam('sysparm_page', query.page || 1);
                        if (!isTable) ga.addParam('sysparm_table', queryTable);
                        ga.getXMLAnswer(function (answer) {
                            if (request !== pickerRequests[index] || (!isTable && queryTable !== tableName)) return;
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
                var choice = event.added || picker.select2('data'),
                    id = choice && choice.id;
                if (!id || id === (isTable ? tableName : recordId)) return;
                picker.select2('close');
                if (isTable) {
                    tableName = id;
                    recordId = '';
                    pickerRequests[1]++;
                    document.getElementById('cp-table-label').textContent = choice.text || id;
                    document.getElementById('cp-record-name').textContent = '';
                } else {
                    recordId = id;
                    document.getElementById('cp-record-name').textContent = choice.text || id;
                }
                updateId = '';
                requestedField = '';

                updateSelect.textContent = '';
                config.description = recordId
                    ? (choice.text || id) + ' (' + document.getElementById('cp-table-label').textContent + ')'
                    : document.getElementById('cp-table-label').textContent;
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
    function syncTitle(description) {
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
                title: recordDescription ? 'Credit: ' + recordDescription : 'Credit+',
                description: description,
                match: 'url=' + currentUrl + (currentUrl !== launchUrl ? '^ORurl=' + launchUrl : ''),
                url: currentUrl,
            });
        }
    }

    function fieldLabel() {
        var entry = data.fields.filter(function (candidate) {
            return candidate.name === requestedField;
        })[0];
        return entry ? entry.label : 'Fields';
    }

    function updateTitle() {
        if (data)
            syncTitle(
                (data.recordName || data.record) + ' (' + (data.tableLabel || data.table) + ') / ' + fieldLabel()
            );
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
        contextMenu.style.left = Math.max(4, Math.min(x, window.innerWidth - contextMenu.offsetWidth - 4)) + 'px';
        contextMenu.style.top = Math.max(4, Math.min(y, window.innerHeight - contextMenu.offsetHeight - 4)) + 'px';
        contextMenu.querySelector('[role="menuitem"]:not([aria-disabled="true"])').focus({ preventScroll: true });
    }
    contextMenu.addEventListener('keydown', function (event) {
        var items = Array.from(contextMenu.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')),
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
    document.addEventListener('pointerdown', function (event) {
        if (!contextMenu.contains(event.target)) closeMenu(false);
    });
    window.addEventListener('resize', function () {
        closeMenu(false);
    });
    ['wheel', 'touchmove'].forEach(function (type) {
        window.addEventListener(
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
                                location.origin + '/scripts/snc-code-editor/' + worker + '?sysparm_substitute=false'
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
            monaco.languages && monaco.languages.typescript && monaco.languages.typescript.javascriptDefaults;
        if (jsDefaults)
            jsDefaults.setDiagnosticsOptions({
                noSemanticValidation: true,
                noSuggestionDiagnostics: true,
                noSyntaxValidation: true,
            });
    }

    var updateButton = document.getElementById('cp-update-button'),
        updateMenu = document.getElementById('cp-update-menu');
    function updateRow(option) {
        var row = element('span', undefined, 'dc-vrow');
        [
            ['time', 'dc-vrow-date'],
            ['setName', 'dc-vrow-uset'],
            ['author', 'dc-vrow-user'],
        ].forEach(function (column) {
            var text = option.dataset[column[0]] || '—',
                cell = element('span', text, column[1]);
            cell.title = text;
            row.appendChild(cell);
        });
        return row;
    }
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
    function syncUpdateDropdown() {
        closeUpdateDropdown(false);
        updateButton.disabled = updateSelect.disabled;
        var label = updateButton.querySelector('.dc-version-dd-btn-label');
        label.textContent = '';
        var selected = updateSelect.options[updateSelect.selectedIndex];
        if (selected) label.appendChild(updateRow(selected));
        else label.textContent = 'Update set';
        updateMenu.textContent = '';
        Array.prototype.forEach.call(updateSelect.options, function (option, index) {
            var item = element('div', undefined, 'dc-version-dd-item');
            item.id = 'cp-update-option-' + index;
            item.dataset.value = option.value;
            item.tabIndex = -1;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', String(option.selected));
            if (option.selected) item.classList.add('dc-version-dd-selected');
            item.appendChild(updateRow(option));
            item.addEventListener('click', function () {
                closeUpdateDropdown(true);
                if (updateSelect.value === option.value) return;
                updateSelect.value = option.value;
                updateSelect.dispatchEvent(new Event('change'));
            });
            updateMenu.appendChild(item);
        });
    }
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
    document.addEventListener('click', function (event) {
        if (!updateButton.contains(event.target) && !updateMenu.contains(event.target)) closeUpdateDropdown(false);
    });
    window.addEventListener('resize', function () {
        if (!updateMenu.hidden) positionUpdateDropdown();
    });
    window.addEventListener(
        'scroll',
        function () {
            if (!updateMenu.hidden) positionUpdateDropdown();
        },
        true
    );

    var attributionWidth;
    function resizeAttribution(width) {
        attributionWidth = Math.max(20, Math.min(65, width));
        page.style.setProperty('--cp-attribution-width', attributionWidth + '%');
        page.querySelectorAll('.cp-splitter').forEach(function (splitter) {
            splitter.setAttribute('aria-valuenow', String(Math.round(attributionWidth)));
        });
    }

    function createFieldView(entry, index) {
        var section = element('details', undefined, 'da-section cp-field-section');
        section.dataset.field = entry.name;
        var summary = element('summary', undefined, 'da-summary');
        summary.appendChild(element('span', entry.label, 'da-label'));
        summary.appendChild(element('span', entry.name, 'da-field-key'));
        var count = element('span', '', 'da-diff-counts');
        summary.appendChild(count);
        section.appendChild(summary);
        var content = document.getElementById('cp-field-template').content.cloneNode(true),
            nodes = {};
        content.querySelectorAll('[id]').forEach(function (item) {
            nodes[item.id] = item;
            if (index) item.id = 'cp-' + entry.name + '-' + item.id.substring(3);
        });
        content.querySelectorAll('label[for]').forEach(function (label) {
            if (index) label.htmlFor = nodes[label.htmlFor].id;
        });
        section.appendChild(content);
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
            annotationRows = [],
            annotationFrame,
            touchY,
            pending = false,
            fieldRequest = 0,
            timer,
            disposed = false;
        var gutter = node('cp-gutter'),
            gutterContent = node('cp-gutter-content');
        var codeMatches = [];
        node('cp-code-label').textContent = entry.label;
        node('cp-code-label').title = entry.label;
        node('cp-fallback-label').textContent = entry.label;
        function setFieldStatus(message, error) {
            ['cp-field-status', 'cp-code-status'].forEach(function (id) {
                node(id).textContent = message;
                node(id).className = 'cp-field-status' + (error ? ' cp-error' : '');
            });
            node('cp-status-row').hidden = !message;
            node('cp-code-status').hidden = !message;
        }
        var splitter = node('cp-splitter');
        splitter.setAttribute('aria-controls', node('cp-code-monaco').id);
        splitter.setAttribute('aria-valuenow', String(attributionWidth || (window.innerWidth <= 760 ? 44 : 34)));
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
            if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
        });
        splitter.addEventListener('keydown', function (event) {
            var width = Number(splitter.getAttribute('aria-valuenow'));
            if (event.key === 'ArrowLeft') width -= 2;
            else if (event.key === 'ArrowRight') width += 2;
            else if (event.key === 'Home') width = 20;
            else if (event.key === 'End') width = 65;
            else return;
            event.preventDefault();
            resizeAttribution(width);
        });
        function matchesAttribution(line) {
            var snapshot = updates[line.update],
                author = snapshot ? snapshot.author : '',
                set = snapshot && snapshot.updateSet ? snapshot.updateSet.table + ':' + snapshot.updateSet.id : '';
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
                    ranges.push({ startLineNumber: start, startColumn: 1, endLineNumber: index, endColumn: 1 });
                    start = undefined;
                }
            });
            if (start !== undefined)
                ranges.push({ startLineNumber: start, startColumn: 1, endLineNumber: data.lines.length, endColumn: 1 });
            // Keep the complete model for syntax context and original line numbers.
            if (ranges.length && !creditEditor.setHiddenAreas) throw new Error('Line filtering unavailable');
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
                button.title = button.textContent;
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
        function disposeCredit() {
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
            node('cp-code-view').hidden = true;
            node('cp-table-fallback').hidden = false;
            node('cp-attribution').textContent = '';
            gutter.scrollTop = 0;
        }

        function updateGutter() {
            if (!creditEditor) return;
            var layout = creditEditor.getLayoutInfo();
            var scrollbar = creditEditor.getScrollWidth() > layout.contentWidth ? layout.horizontalScrollbarHeight : 0;
            gutter.style.height = Math.max(0, layout.height - scrollbar) + 'px';
            gutterContent.style.height = creditEditor.getScrollHeight() + 'px';
            gutterContent.style.transform = 'translateY(' + -creditEditor.getScrollTop() + 'px)';
        }

        function layoutAnnotations() {
            if (!creditEditor) return;
            var font = creditEditor.getOption(monaco.editor.EditorOption.fontInfo);
            gutterContent.style.fontFamily = font.fontFamily;
            gutterContent.style.fontSize = font.fontSize + 'px';
            gutterContent.style.fontWeight = font.fontWeight;
            gutterContent.style.letterSpacing = font.letterSpacing + 'px';
            gutterContent.style.lineHeight = font.lineHeight + 'px';
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
                    previousOrigin;
                data.lines.forEach(function (line) {
                    var row = attribution(line);
                    row.removeChild(row.querySelector('.cp-number'));
                    row.removeChild(row.querySelector('.cp-code'));
                    row.dataset.lineNumber = line.number;
                    row.setAttribute('role', 'row');
                    row.querySelectorAll('td').forEach(function (cell) {
                        cell.setAttribute('role', 'cell');
                    });
                    annotationRows.push(row);
                    if (previousOrigin !== line.update) row.className = 'cp-block-start';
                    previousOrigin = line.update;
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
            authorText.title = authorText.textContent + (snapshot && snapshot.time ? ' · ' + snapshot.time : '');
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
            setFieldStatus('Loading comparison…');
            diffTimer = window.setTimeout(function () {
                if (request !== diffRequest || disposed) return;
                diffRequest++;
                fail('Comparison timed out.');
            }, 30000);
            var ga = new GlideAjax('CreditPlus');
            ga.addParam('sysparm_name', 'getComparison');
            ga.addParam('sysparm_update', data.selected);
            ga.addParam('sysparm_from_update', snapshot.id);
            ga.getXMLAnswer(function (answer) {
                if (disposed || request !== diffRequest) return;
                window.clearTimeout(diffTimer);
                var result;
                try {
                    result = JSON.parse(answer || '{}');
                } catch (e) {
                    result = {};
                }
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
            });
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
            }
        }
        function setData(result) {
            data = result;
            data.updates.forEach(function (snapshot) {
                updates[snapshot.id] = snapshot;
            });
            count.textContent = data.lines.length + ' lines';
            setFieldStatus(data.warnings.join(' '));
            applyFilters();
        }
        function loadField() {
            if (data || pending || disposed) return;
            pending = true;
            var request = ++fieldRequest,
                parentRequest = sequence;
            setFieldStatus('Loading…');
            node('cp-field-retry').hidden = true;
            function fail(message) {
                pending = false;
                setFieldStatus(message, true);
                node('cp-field-retry').hidden = false;
            }
            timer = window.setTimeout(function () {
                if (!disposed && request === fieldRequest && parentRequest === sequence) {
                    timer = null;
                    fail('Request timed out.');
                }
            }, 30000);
            var ga = new GlideAjax('CreditPlus');
            ga.addParam('sysparm_name', 'getCredit');
            ga.addParam('sysparm_update', updateId);
            ga.addParam('sysparm_field', entry.name);
            ga.getXMLAnswer(function (answer) {
                if (disposed || request !== fieldRequest || parentRequest !== sequence || !pending) return;
                window.clearTimeout(timer);
                timer = null;
                pending = false;
                var result;
                try {
                    result = JSON.parse(answer || '{}');
                } catch (e) {
                    result = {};
                }
                if (!result.success) {
                    fail(result.error || 'Field unavailable.');
                    return;
                }
                setData(result);
            });
        }
        section.addEventListener('toggle', function () {
            if (disposed || !section.isConnected) return;
            if (section.open) {
                requestedField = entry.name;
                updateUrl();
                updateTitle();
                loadField();
                updateView();
                summary.scrollIntoView({ block: 'start' });
            } else disposeCredit();
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
                if (!creditEditor || touchY === null || touchY === undefined || event.touches.length !== 1) return;
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
        node('cp-field-retry').addEventListener('click', loadField);
        updateView();
        return {
            section: section,
            updateView: updateView,
            release: disposeCredit,
            dispose: function () {
                disposed = true;
                window.clearTimeout(timer);
                window.clearTimeout(diffTimer);
                diffRequest++;
                disposeCredit();
            },
        };
    }

    function render(result) {
        data = result;
        tableName = data.table;
        recordId = data.record;
        updateId = data.selected;
        document.getElementById('cp-record-name').textContent = data.recordName || data.record;
        document.getElementById('cp-table-label').textContent = data.tableLabel || data.table;
        config.description = (data.recordName || data.record) + ' (' + (data.tableLabel || data.table) + ')';
        syncPickers();
        updateUrl();
        var link = document.getElementById('cp-record-link');
        link.href = navUrl(data.table + '.do?sys_id=' + encodeURIComponent(data.record));
        link.textContent = 'Open ' + (data.tableLabel || data.table);
        link.hidden = !!data.deleted;
        var editorLink = document.getElementById('cp-editor-link');
        editorLink.href = navUrl(
            'ui_page.do?sys_id=8b2e70458373fe1070b8b5dfeeaad35e&widget_id=' + encodeURIComponent(data.record)
        );
        editorLink.hidden = data.table !== 'sp_widget' || !!data.deleted;
        document.getElementById('cp-warning-text').textContent = '';
        (data.warnings || []).forEach(function (warning) {
            document.getElementById('cp-warning-text').appendChild(element('p', warning));
        });
        warnings.hidden = !(data.warnings || []).length;
        updateSelect.textContent = '';
        data.updateSets
            .slice()
            .reverse()
            .forEach(function (set) {
                var option = element('option', set.time + ' · ' + set.name + ' · ' + set.author);
                option.value = set.id;
                option.dataset.time = set.time;
                option.dataset.setName = set.name;
                option.dataset.author = set.author;
                updateSelect.appendChild(option);
            });
        updateSelect.value = data.selected;
        results.hidden = false;
        status.textContent = '';
        data.fields.forEach(function (entry, index) {
            var view = createFieldView(entry, index);
            fieldViews.push(view);
            results.appendChild(view.section);
        });
        updateSelect.disabled = false;
        syncUpdateDropdown();
        updateScrollOffset();
        updateTitle();
    }

    function load() {
        closeMenu(false);
        var request = ++sequence;
        retry.disabled = true;
        updateSelect.disabled = true;
        syncUpdateDropdown();
        results.hidden = true;
        warnings.hidden = true;
        fieldViews.forEach(function (view) {
            view.dispose();
        });
        fieldViews = [];
        results.textContent = '';
        data = null;
        document.getElementById('cp-record-link').hidden = true;
        document.getElementById('cp-editor-link').hidden = true;
        status.className = '';
        status.textContent = 'Loading update sets…';
        syncTitle(config.description || '');
        if (!updateId && (!tableName || !recordId)) {
            status.textContent = tableName ? 'Select a record.' : 'Select a table.';
            return;
        }
        function failed(message) {
            status.className = 'cp-error';
            status.textContent = message;
            retry.disabled = false;
            updateSelect.disabled = updateSelect.options.length === 0;
            syncUpdateDropdown();
            syncTitle('Unavailable customer update');
        }
        var timer = window.setTimeout(function () {
            if (request !== sequence) return;
            sequence++;
            failed('The request timed out. Reload to try again.');
        }, 30000);
        var ga = new GlideAjax('CreditPlus');
        ga.addParam('sysparm_name', 'getCredit');
        ga.addParam('sysparm_context', 'true');
        if (updateId) ga.addParam('sysparm_update', updateId);
        else {
            ga.addParam('sysparm_table', tableName);
            ga.addParam('sysparm_record', recordId);
        }
        ga.getXMLAnswer(function (answer) {
            window.clearTimeout(timer);
            if (request !== sequence) return;
            var result;
            try {
                result = JSON.parse(answer || '{}');
            } catch (e) {
                result = {};
            }
            retry.disabled = false;
            if (!result.success) {
                failed(result.error || 'Credit+ could not load this customer update. Reload to try again.');
                return;
            }
            render(result);
        });
    }

    retry.addEventListener('click', load);
    updateSelect.addEventListener('change', function () {
        updateId = updateSelect.value;
        updateUrl();
        load();
    });
    window.addEventListener('pagehide', function () {
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
    } else window.addEventListener('resize', updateScrollOffset);
    window.addEventListener('pagehide', function () {
        if (headerObserver) headerObserver.disconnect();
    });
    window.addEventListener('pageshow', function () {
        setupPickers();
        if (headerObserver) headerObserver.observe(document.querySelector('.dc-header'));
        updateScrollOffset();
        updateTitle();
        fieldViews.forEach(function (view) {
            view.updateView();
        });
    });
    setupPickers();
    updateScrollOffset();
    syncTitle(config.description || '');
    load();
})();

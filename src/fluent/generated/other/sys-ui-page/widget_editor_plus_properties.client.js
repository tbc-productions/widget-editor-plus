(function () {
    function initialise() {
        'use strict';
        var pageTitle = 'Widget Editor+ Properties';
        document.title = pageTitle;
        // The navigation shell sets its title after the iframe loads.
        setTimeout(function () {
            try {
                if (window.parent !== window) window.parent.document.title = pageTitle;
            } catch (e) {}
        }, 1000);
        if (window.WE_HISTORY_SYNC) {
            window.WE_HISTORY_SYNC.set({ title: pageTitle });
        }
        var sections = document.getElementById('wep-sections');
        var nav = document.getElementById('wep-nav');
        var message = document.getElementById('wep-message');
        var search = document.getElementById('wep-search');
        var header = document.getElementById('wep-header');
        var headerObserver = null;
        function updateHeaderHeight() {
            if (header)
                document.documentElement.style.setProperty(
                    '--wep-header-height',
                    header.getBoundingClientRect().height + 'px'
                );
        }
        updateHeaderHeight();
        if (header && window.ResizeObserver) {
            headerObserver = new window.ResizeObserver(updateHeaderHeight);
            headerObserver.observe(header);
        }
        var dirty = {};
        var rulesDirty = false;
        var plainTextareas = [];
        var jsonEditors = [];
        var counterSequence = 0;

        function ajax(method, params) {
            return new Promise(function (resolve, reject) {
                var ga = new GlideAjax('WidgetEditorMarkdownAjax');
                ga.addParam('sysparm_name', method);
                Object.keys(params || {}).forEach(function (key) {
                    var value = params[key];
                    if (
                        method === 'saveProperty' &&
                        params.property_name === 'monaco.plus.update_sets.markdown_formatting' &&
                        key === 'property_value'
                    ) {
                        // JSON escapes preserve emoji through request decoding and property storage.
                        value = value.replace(/[\u007f-\uffff]/g, function (character) {
                            return '\\u' + ('0000' + character.charCodeAt(0).toString(16)).slice(-4);
                        });
                    }
                    ga.addParam(key, value);
                });
                ga.getXMLAnswer(function (answer) {
                    var data;
                    try {
                        data = JSON.parse(answer || '{}');
                    } catch (e) {
                        reject(new Error('Invalid server response.'));
                        return;
                    }
                    if (!data.success) {
                        reject(new Error(data.error || 'Request failed.'));
                        return;
                    }
                    resolve(data);
                    if (/^(saveProperty|saveTableProperty|deleteTableProperty|saveRules)$/.test(method))
                        refreshUpdatedTimes();
                });
            });
        }
        function el(tag, className, value) {
            var node = document.createElement(tag);
            if (className) node.className = className;
            if (value) node.textContent = value;
            return node;
        }
        function showUpdated(property, value) {
            property.updatedOn = value;
            var pill = property._updatedPill;
            if (!pill) return;
            // ServiceNow's internal date/time value is UTC, without a timezone suffix.
            var date = new Date(value ? value.replace(' ', 'T') + 'Z' : NaN);
            pill.hidden = isNaN(date.getTime());
            pill.textContent = '';
            if (pill.hidden) return;
            var localDate = date.toLocaleDateString(),
                localTime = date.toLocaleTimeString();
            if (property._rowTimestamp) {
                pill.appendChild(el('span', '', localDate));
                pill.appendChild(el('br'));
                pill.appendChild(el('span', '', localTime));
            } else pill.textContent = 'Updated ' + localDate + ' ' + localTime;
            pill.setAttribute('datetime', date.toISOString());
        }
        function refreshUpdatedTimes() {
            ajax('getProperties', {})
                .then(function (data) {
                    if (!sections) return;
                    Array.prototype.forEach.call(sections.querySelectorAll('.wep-card'), function (card) {
                        var property = card._prop;
                        var match = data.properties.filter(function (item) {
                            return (
                                item.name === property.name ||
                                (property.prefix && item.name === property.prefix.slice(0, -1))
                            );
                        })[0];
                        if (property.rows || property.name === 'monaco.plus.update_sets.markdown_groups') {
                            property.updatedByTable = (match && match.updatedByTable) || {};
                            (property._updatedRows || []).forEach(function (row) {
                                var name = row.name();
                                var saved = data.properties.filter(function (item) {
                                    return item.name === name;
                                })[0];
                                showUpdated(
                                    row,
                                    saved
                                        ? saved.updatedOn
                                        : property.updatedByTable[name.slice(name.lastIndexOf('.') + 1)]
                                );
                            });
                        } else showUpdated(property, match && match.updatedOn);
                    });
                })
                .catch(function () {
                    /* A metadata refresh must not turn a successful save into an error. */
                });
        }
        function characterCount(limit) {
            if (limit === undefined) limit = 4000;
            var counter = el('small', 'wep-character-count', limit === null ? '0 characters' : '0 / ' + limit);
            counter._limit = limit;
            counter.id = 'wep-character-count-' + ++counterSequence;
            return counter;
        }
        function updateCharacterCount(counter, value) {
            var length = String(value || '').length;
            counter.textContent = counter._limit === null ? length + ' characters' : length + ' / ' + counter._limit;
            counter.className =
                'wep-character-count' + (counter._limit !== null && length > counter._limit ? ' text-danger' : '');
        }
        function button(label, action) {
            var node = el('button', 'btn btn-default', label);
            node.type = 'button';
            node.onclick = action;
            return node;
        }
        function iconButton(icon, label, action) {
            var control = button('', action);
            control.title = label;
            control.setAttribute('aria-label', label);
            var glyph = el('span', 'glyphicon glyphicon-' + icon);
            glyph.setAttribute('aria-hidden', 'true');
            control.appendChild(glyph);
            return control;
        }
        function status(node, value, kind) {
            if (!node) return;
            node.textContent = value;
            var isPill = node.id === 'wep-message';
            node.className = 'wep-status' + (isPill ? ' wep-header-status-pill' : '') + (kind ? ' ' + kind : '');
            if (isPill) node.style.display = value ? 'inline-flex' : 'none';
        }
        function confirmPropertyRemoval(names, trigger) {
            if (!names.length) return Promise.resolve(true);
            return new Promise(function (resolve, reject) {
                var jq = window.$j || window.jQuery;
                if (!jq || !jq.fn || !jq.fn.modal) {
                    reject(new Error('The confirmation dialog is unavailable. Reload the page.'));
                    return;
                }
                var modal = el('div', 'modal fade'),
                    dialog = el('div', 'modal-dialog'),
                    content = el('div', 'modal-content');
                var titleId = 'wep-remove-title-' + ++counterSequence,
                    bodyId = titleId + '-body';
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('tabindex', '-1');
                modal.setAttribute('aria-labelledby', titleId);
                modal.setAttribute('aria-describedby', bodyId);
                dialog.setAttribute('role', 'document');
                var header = el('div', 'modal-header'),
                    title = el(
                        'h4',
                        'modal-title',
                        names.length === 1 ? 'Remove system property?' : 'Remove system properties?'
                    );
                title.id = titleId;
                header.appendChild(title);
                var body = el('div', 'modal-body');
                body.id = bodyId;
                body.appendChild(
                    el(
                        'p',
                        '',
                        'This will delete the following system ' + (names.length === 1 ? 'property:' : 'properties:')
                    )
                );
                var list = el('ul');
                names.forEach(function (name) {
                    list.appendChild(el('li', '', name));
                });
                body.appendChild(list);
                var footer = el('div', 'modal-footer'),
                    accepted = false,
                    $modal = jq(modal);
                var cancel = button('Cancel', function () {
                    $modal.modal('hide');
                });
                var confirm = button('Remove', function () {
                    accepted = true;
                    $modal.modal('hide');
                });
                confirm.className = 'btn btn-danger';
                footer.appendChild(cancel);
                footer.appendChild(confirm);
                content.appendChild(header);
                content.appendChild(body);
                content.appendChild(footer);
                dialog.appendChild(content);
                modal.appendChild(dialog);
                document.body.appendChild(modal);
                $modal.one('shown.bs.modal', function () {
                    cancel.focus();
                });
                $modal.one('hidden.bs.modal', function () {
                    modal.remove();
                    if (trigger && trigger.focus) trigger.focus();
                    resolve(accepted);
                });
                $modal.modal({ backdrop: true, keyboard: true, show: true });
            });
        }
        function feature(name) {
            if (name.indexOf('monaco.plus.update_sets.') === 0) return 'Export Markdown+';
            if (name.indexOf('monaco.plus.assistant.') === 0) return 'Assistant+';
            if (name.indexOf('monaco.plus.code_search.') === 0) return 'Code Search+';
            var other = name.match(/^monaco\.plus\.([a-z0-9_]+)\./);
            if (other && ['widget', 'css', 'scss'].indexOf(other[1]) === -1) {
                return (
                    other[1].replace(/_/g, ' ').replace(/\b\w/g, function (c) {
                        return c.toUpperCase();
                    }) + '+'
                );
            }
            return 'Widget Editor+';
        }
        function isJsonProperty(property) {
            if (property.name === 'monaco.plus.update_sets.markdown_display') return true;
            if (/^monaco\.plus\.(?:assistant\.table_config\.|css\.variables$|scss\.variables$)/.test(property.name))
                return true;
            try {
                var value = JSON.parse(property.value);
                return value !== null && typeof value === 'object';
            } catch (e) {
                return false;
            }
        }
        function resizePlainTextarea(input) {
            if (!input || input.hidden || !input.parentNode) return;
            input.style.height = 'auto';
            if (input.className.indexOf('wep-plain-textarea') !== -1) {
                var border = Math.max(0, (input.offsetHeight || 0) - (input.clientHeight || 0));
                input.style.height = input.scrollHeight + border + 'px';
                input.style.overflowY = 'hidden';
                return;
            }
            var fitContents = input.className.indexOf('wep-description-input') !== -1;
            var cap = fitContents ? Infinity : Math.max(76, Math.floor(window.innerHeight * 0.5));
            var needed = Math.max(fitContents ? 48 : 76, input.scrollHeight);
            input.style.height = Math.min(needed, cap) + 'px';
            input.style.overflowY = needed > cap ? 'auto' : 'hidden';
        }
        function monacoTheme() {
            try {
                var bg = window
                    .getComputedStyle(document.documentElement)
                    .getPropertyValue('--now-color_background--primary')
                    .trim();
                var parts = bg.split(/[\s,]+/).map(Number);
                if (
                    parts.length >= 3 &&
                    parts.slice(0, 3).every(function (value) {
                        return !isNaN(value);
                    })
                ) {
                    return (parts[0] + parts[1] + parts[2]) / 3 >= 128 ? 'vs' : 'vs-dark';
                }
            } catch (e) {}
            return window.NOW && window.NOW.theme && /dark/i.test(window.NOW.theme.name || '') ? 'vs-dark' : 'vs';
        }
        function ensureMonacoWorker() {
            window.MonacoEnvironment = window.MonacoEnvironment || {};
            if (typeof window.MonacoEnvironment.getWorker === 'function') return;
            window.MonacoEnvironment.getWorker = function (_id, language) {
                var file = language === 'json' ? 'json.worker.bundle.min.jsx' : 'editor.worker.bundle.min.jsx';
                var url = window.location.origin + '/scripts/snc-code-editor/' + file + '?sysparm_substitute=false';
                var blob = new Blob(['importScripts(' + JSON.stringify(url) + ')'], { type: 'application/javascript' });
                return new Worker(URL.createObjectURL(blob));
            };
        }
        function mountJsonEditor(input, host, onChange) {
            if (!window.monaco || !window.monaco.editor) return null;
            try {
                ensureMonacoWorker();
                if (window.SNMonacoPlusBootstrap && window.SNMonacoPlusBootstrap.registerUnicodeHover) {
                    window.SNMonacoPlusBootstrap.registerUnicodeHover(window.monaco);
                }
                var theme = monacoTheme();
                var editor = window.monaco.editor.create(host, {
                    value: input.value,
                    language: 'json',
                    theme: theme,
                    automaticLayout: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    fixedOverflowWidgets: true,
                });
                function describeEditor() {
                    var field = host.querySelector('textarea, [role="textbox"]');
                    var description = input.getAttribute('aria-describedby');
                    if (!field || !description) return;
                    var ids = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
                    if (ids.indexOf(description) === -1) ids.push(description);
                    field.setAttribute('aria-describedby', ids.join(' '));
                }
                describeEditor();
                editor.onDidFocusEditorText(describeEditor);
                editor.onDidChangeModelContent(function () {
                    input.value = editor.getValue();
                    onChange();
                });
                function resize() {
                    var cap = Math.max(76, Math.floor(window.innerHeight * 0.5));
                    var content = Math.max(76, Math.ceil(editor.getContentHeight()) + 2);
                    var height = Math.min(content, cap) + 'px';
                    if (host.style.height !== height) {
                        host.style.height = height;
                        editor.layout();
                    }
                }
                editor.onDidContentSizeChange(resize);
                input.hidden = true;
                input.style.display = 'none';
                jsonEditors.push({ editor: editor, resize: resize });
                resize();
                return editor;
            } catch (e) {
                if (editor) editor.dispose();
                input.hidden = false;
                input.style.display = '';
                host.remove();
                return null;
            }
        }
        function propertyCard(property) {
            var card = el('article', 'panel panel-default wep-card');
            card._prop = property;
            card.setAttribute('data-search', (property.name + ' ' + (property.description || '')).toLowerCase());
            var heading = el('div', 'panel-heading');
            heading.appendChild(
                el(
                    'h3',
                    'panel-title wep-property-name',
                    /^monaco\.plus\.update_sets\.markdown_(groups|display)$/.test(property.name)
                        ? property.name + '.*'
                        : property.name
                )
            );
            var isRules = property.name === 'monaco.plus.update_sets.markdown_groups';
            var json = isJsonProperty(property);
            var typeText = isRules ? 'Table hierarchy' : json ? 'JSON' : property.type || 'string';
            var tagClass =
                'wep-type-tag ' +
                (isRules
                    ? 'wep-type-tag--hierarchy'
                    : json
                      ? 'wep-type-tag--json'
                      : property.type && property.type.toLowerCase() === 'boolean'
                        ? 'wep-type-tag--boolean'
                        : 'wep-type-tag--string');
            if (!isRules) heading.appendChild(el('span', tagClass, typeText.toUpperCase()));
            if (!property.rows && !isRules) {
                property._updatedPill = el('time', 'wep-type-tag wep-updated-pill');
                heading.appendChild(property._updatedPill);
                showUpdated(property, property.updatedOn);
            }
            card.appendChild(heading);
            var body = el('div', 'panel-body');
            card.appendChild(body);
            if (property.description || isRules)
                body.appendChild(
                    el(
                        'p',
                        'wep-description',
                        isRules ? 'Alphabetical table hierarchy for update set Markdown export.' : property.description
                    )
                );
            if (property.rows) {
                tableProperties(body, property);
                return card;
            }
            if (isRules) {
                markdownCard(body, property);
                return card;
            }
            var counter = characterCount();
            var input,
                editor = null;
            var json = isJsonProperty(property);
            if (property.type.toLowerCase() === 'boolean') {
                input = el('select', 'form-control wep-value');
                ['true', 'false'].forEach(function (value) {
                    var option = el('option', '', value);
                    option.value = value;
                    input.appendChild(option);
                });
            } else {
                input = el(
                    'textarea',
                    'form-control wep-value' + (json ? ' wep-json-fallback' : ' wep-plain-textarea')
                );
                input.rows = json ? 8 : 1;
                input.setAttribute('aria-label', property.name);
            }
            input.setAttribute('aria-describedby', counter.id);
            input.value = property.value;
            body.appendChild(input);
            if (input.tagName.toLowerCase() === 'textarea' && !json) plainTextareas.push(input);
            var combinedDisplay = property.name === 'monaco.plus.update_sets.markdown_display';
            function displayLength() {
                var config = JSON.parse(readValue());
                if (!config || typeof config !== 'object' || Array.isArray(config))
                    throw new Error('Use a JSON object keyed by table.');
                return Object.keys(config).reduce(function (length, table) {
                    return Math.max(length, JSON.stringify(config[table], null, 4).length);
                }, 0);
            }
            function countValue() {
                if (!combinedDisplay) {
                    updateCharacterCount(counter, readValue());
                    return;
                }
                var length;
                try {
                    length = displayLength();
                } catch (e) {
                    length = readValue().length;
                }
                counter.textContent = length + ' characters (largest table)';
                counter.className = 'wep-character-count';
            }
            function valueError() {
                if (combinedDisplay) {
                    try {
                        displayLength();
                    } catch (e) {
                        return e.message;
                    }
                }
                if (!combinedDisplay && readValue().length > 4000) return 'Property value exceeds 4000 characters.';
                if (json) {
                    try {
                        JSON.parse(readValue());
                    } catch (e) {
                        return 'Invalid JSON.';
                    }
                }
                return '';
            }
            function readValue() {
                return editor ? editor.getValue() : input.value;
            }
            function writeValue(value) {
                if (editor) editor.setValue(value);
                input.value = value;
                if (!json && input.tagName.toLowerCase() === 'textarea') resizePlainTextarea(input);
            }
            var actions = el('div', 'wep-actions');
            var save = button('Save property', function () {
                if (valueError()) {
                    updateDirty();
                    return;
                }
                save.disabled = true;
                status(note, 'Saving…');
                var submitted = readValue();
                ajax('saveProperty', {
                    property_name: property.name,
                    property_value: submitted,
                })
                    .then(function (result) {
                        property.value = result.value;
                        if (readValue() === submitted) writeValue(result.value);
                        updateDirty();
                        status(note, 'Saved.', 'success');
                    })
                    .catch(function (error) {
                        status(note, error.message, 'error');
                    })
                    .then(function () {
                        save.disabled = !dirty[property.name] || !!valueError();
                    });
            });
            save.className = 'btn btn-primary';
            save.disabled = true;
            function updateDirty() {
                countValue();
                reset.hidden = readValue() === property.value;
                if (readValue() === property.value) {
                    delete dirty[property.name];
                    save.disabled = true;
                    status(note, '');
                } else {
                    dirty[property.name] = true;
                    var error = valueError();
                    save.disabled = !!error;
                    status(note, error || 'Unsaved changes', error ? 'error' : 'dirty');
                }
            }
            input.oninput = input.onchange = function () {
                if (!json && input.tagName.toLowerCase() === 'textarea') resizePlainTextarea(input);
                updateDirty();
            };
            var reset = button('Revert', function () {
                writeValue(property.value);
                updateDirty();
            });
            reset.hidden = true;
            var note = el('span', 'wep-status');
            actions.appendChild(save);
            actions.appendChild(reset);
            actions.appendChild(note);
            actions.appendChild(counter);
            countValue();
            body.appendChild(actions);
            if (json) {
                var host = el('div', 'wep-monaco');
                body.insertBefore(host, actions);
                window.requestAnimationFrame(function () {
                    editor = mountJsonEditor(input, host, updateDirty);
                    if (!editor) host.remove();
                });
            }
            return card;
        }
        function updatedCell(family, row, name, value) {
            var cell = el('td', 'wep-updated-cell'),
                time = el('time');
            var timestamp = {
                _updatedPill: time,
                _rowTimestamp: true,
                name: name,
            };
            if (!family._updatedRows) family._updatedRows = [];
            family._updatedRows.push(timestamp);
            showUpdated(timestamp, value);
            cell.appendChild(time);
            row.appendChild(cell);
            return timestamp;
        }
        function tableProperties(body, family) {
            var assistant = family.kind === 'table_config',
                markdown = family.kind === 'markdown_display';
            var table = el(
                'table',
                'table table-striped wep-properties-table wep-config-table' +
                    (assistant ? ' wep-assistant-config-table' : '')
            );
            var head = el('thead'),
                headings = el('tr'),
                rows = el('tbody');
            (assistant
                ? ['Table', 'Description', 'JSON', 'Actions', 'Updated']
                : markdown
                  ? ['Table', 'Display fields', 'Additional fields', 'Actions', 'Updated']
                  : ['Table', 'Fields', 'Actions', 'Updated']
            ).forEach(function (label) {
                var th = el('th', '', label);
                th.setAttribute('scope', 'col');
                headings.appendChild(th);
            });
            head.appendChild(headings);
            table.appendChild(head);
            table.appendChild(rows);
            body.appendChild(table);
            var rowSequence = 0;
            function addRow(property) {
                var saved = property ? property.name.slice(family.prefix.length) : '';
                var key = family.prefix + 'row-' + ++rowSequence,
                    busy = false,
                    editor = null,
                    picker = null,
                    active = true,
                    request = 0;
                var row = el('tr'),
                    nameCell = el('td'),
                    valueCell = el('td'),
                    actions = el('td');
                var name = el('input');
                name.type = 'hidden';
                name.value = saved;
                name.setAttribute('aria-label', 'Table');
                name.placeholder = 'Table name';
                nameCell.appendChild(name);
                row.appendChild(nameCell);
                var description = el(
                    markdown ? 'input' : 'textarea',
                    'form-control' + (assistant ? ' wep-description-input' : '')
                );
                description.rows = 2;
                var displayConfig = markdown && property ? JSON.parse(property.value) : {};
                description.value = markdown ? displayConfig.display_value || '' : property ? property.description : '';
                description.setAttribute('aria-label', markdown ? 'Display fields' : 'Description');
                if (markdown) {
                    description.placeholder = 'name,short_description';
                    description.title = 'Use commas for primary fallbacks, or periods to join fields with a period.';
                }
                if (assistant) description.setAttribute('maxlength', '512');
                var descriptionCounter = markdown ? null : characterCount(assistant ? 512 : 4000);
                if (descriptionCounter) description.setAttribute('aria-describedby', descriptionCounter.id);
                if (assistant || markdown) {
                    var descCell = el('td');
                    descCell.appendChild(description);
                    if (descriptionCounter) descCell.appendChild(descriptionCounter);
                    row.appendChild(descCell);
                }
                var input = el(
                    assistant ? 'textarea' : 'input',
                    'form-control' + (assistant ? ' wep-json-fallback' : '')
                );
                input.rows = assistant ? 6 : 2;
                input.value = markdown
                    ? displayConfig.additional_fields || ''
                    : property
                      ? property.value
                      : assistant
                        ? '{"rules":[],"pickerFields":[]}'
                        : '';
                input.setAttribute('aria-label', assistant ? 'JSON' : markdown ? 'Additional fields' : 'Fields');
                if (!assistant) input.placeholder = 'name,description';
                var counter = markdown ? null : characterCount();
                if (counter) input.setAttribute('aria-describedby', counter.id);
                valueCell.appendChild(input);
                if (counter) valueCell.appendChild(counter);
                row.appendChild(valueCell);
                var note = el('small', 'wep-status');
                note.setAttribute('role', 'status');
                var baseline = property ? snapshot() : '';
                function snapshot() {
                    return JSON.stringify([name.value.trim(), description.value, input.value]);
                }
                function propertyValue() {
                    if (!markdown) return input.value;
                    var config = {
                        display_value: description.value.trim(),
                        additional_fields: input.value,
                    };
                    return JSON.stringify(config, null, 4);
                }
                function refresh() {
                    if (counter) updateCharacterCount(counter, input.value);
                    if (descriptionCounter) updateCharacterCount(descriptionCounter, description.value);
                    var changed = snapshot() !== baseline;
                    if (changed) dirty[key] = true;
                    else delete dirty[key];
                    save.disabled =
                        busy ||
                        !changed ||
                        !name.value.trim() ||
                        (!markdown && propertyValue().length > 4000) ||
                        (markdown && !description.value.trim()) ||
                        (assistant && description.value.length > 512);
                    remove.disabled = busy;
                }
                function pending(value) {
                    busy = value;
                    input.disabled = description.disabled = value;
                    if (picker) picker.select2('enable', !value && !saved);
                    if (editor) editor.updateOptions({ readOnly: value });
                    refresh();
                }
                var save = iconButton('floppy-disk', 'Save property', function () {
                    var target = name.value.trim();
                    var duplicate = Array.prototype.some.call(rows.children, function (other) {
                        return other !== row && other._tableName() === target;
                    });
                    if (duplicate) {
                        status(note, 'This table already has a row.', 'error');
                        return;
                    }
                    if (assistant) {
                        try {
                            JSON.parse(input.value);
                        } catch (e) {
                            status(note, 'Invalid JSON.', 'error');
                            return;
                        }
                    }
                    pending(true);
                    status(note, 'Saving…');
                    ajax('saveTableProperty', {
                        kind: family.kind,
                        table: target,
                        property_value: propertyValue(),
                        description: assistant ? description.value : '',
                    })
                        .then(function (result) {
                            if (!saved) {
                                family.propertyCount++;
                                family._refreshCount();
                            }
                            saved = target;
                            name.value = target;
                            if (markdown) {
                                var config = JSON.parse(result.value);
                                description.value = config.display_value;
                                input.value = config.additional_fields;
                            } else input.value = result.value;
                            if (editor) editor.setValue(result.value);
                            baseline = snapshot();
                            status(note, 'Saved.', 'success');
                        })
                        .catch(function (error) {
                            status(note, error.message, 'error');
                        })
                        .then(function () {
                            pending(false);
                        });
                });
                save.className = 'btn btn-primary';
                function discard() {
                    if (saved) {
                        family.propertyCount--;
                        family._refreshCount();
                    }
                    family._updatedRows = family._updatedRows.filter(function (item) {
                        return item !== timestamp;
                    });
                    active = false;
                    request++;
                    delete dirty[key];
                    plainTextareas = plainTextareas.filter(function (field) {
                        return field !== description;
                    });
                    if (picker) {
                        picker.off('.wepTable');
                        picker.select2('destroy');
                    }
                    if (editor) {
                        jsonEditors = jsonEditors.filter(function (item) {
                            return item.editor !== editor;
                        });
                        editor.dispose();
                    }
                    row.remove();
                }
                var remove = iconButton('remove', 'Remove table', function () {
                    if (!saved) {
                        discard();
                        return;
                    }
                    if (busy) return;
                    pending(true);
                    confirmPropertyRemoval([family.prefix + saved], remove)
                        .then(function (confirmed) {
                            if (!confirmed) {
                                pending(false);
                                remove.focus();
                                return;
                            }
                            status(note, 'Removing…');
                            return ajax('deleteTableProperty', {
                                kind: family.kind,
                                table: saved,
                            }).then(discard);
                        })
                        .catch(function (error) {
                            status(note, error.message, 'error');
                            pending(false);
                        });
                });
                actions.appendChild(save);
                actions.appendChild(remove);
                actions.appendChild(note);
                row.appendChild(actions);
                var timestamp = updatedCell(
                    family,
                    row,
                    function () {
                        return family.prefix + saved;
                    },
                    property && property.updatedOn
                );
                row._tableName = function () {
                    return name.value.trim();
                };
                rows.appendChild(row);
                name.oninput =
                    description.oninput =
                    input.oninput =
                        function () {
                            if (assistant) resizePlainTextarea(description);
                            refresh();
                            status(note, 'Unsaved changes', 'dirty');
                        };
                if (assistant) {
                    plainTextareas.push(description);
                    window.requestAnimationFrame(function () {
                        if (active) resizePlainTextarea(description);
                    });
                }
                var jq = window.$j || window.jQuery;
                if (jq && jq.fn && jq.fn.select2) {
                    picker = jq(name);
                    picker.select2({
                        placeholder: 'Select a table',
                        minimumInputLength: 0,
                        width: '100%',
                        query: function (query) {
                            var current = ++request;
                            ajax('searchTables', { query: query.term || '' })
                                .then(function (data) {
                                    if (!active || current !== request) return;
                                    query.callback({
                                        results: data.tables
                                            .filter(function (item) {
                                                return !Array.prototype.some.call(rows.children, function (other) {
                                                    return other !== row && other._tableName() === item.name;
                                                });
                                            })
                                            .map(function (item) {
                                                return {
                                                    id: item.name,
                                                    text: item.label + ' (' + item.name + ')',
                                                };
                                            }),
                                        more: false,
                                    });
                                })
                                .catch(function (error) {
                                    if (!active || current !== request) return;
                                    status(note, error.message, 'error');
                                    query.callback({
                                        results: [],
                                        more: false,
                                    });
                                });
                        },
                    });
                    if (saved) picker.select2('data', { id: saved, text: saved });
                    picker.select2('enable', !saved);
                    picker.on('change.wepTable', function () {
                        refresh();
                        status(note, 'Unsaved changes', 'dirty');
                    });
                } else status(note, 'The Select2 table picker is unavailable. Reload the page.', 'error');
                refresh();
                if (assistant) {
                    var host = el('div', 'wep-monaco');
                    valueCell.insertBefore(host, counter);
                    window.requestAnimationFrame(function () {
                        if (!active) return;
                        editor = mountJsonEditor(input, host, refresh);
                        if (!editor) host.remove();
                    });
                }
            }
            family.rows.forEach(addRow);
            body.appendChild(
                button('Add table', function () {
                    addRow(null);
                })
            );
        }
        function markdownCard(card, property) {
            var note = el('span', 'wep-status');
            var panel = el('div', 'wep-tree');
            var root = el('div', 'wep-rule-scroll');
            var rules = null,
                collapsed = {},
                revision = 0,
                mode = 'UI',
                jsonEditor = null,
                syncing = false;
            var relatedPicker = null,
                topPicker = null;
            var modes = el('div', 'wep-hierarchy-toolbar');
            var modeButton = button('Switch to JSON', function () {
                setMode(mode === 'UI' ? 'JSON' : 'UI');
            });
            modes.appendChild(modeButton);
            panel.appendChild(modes);
            panel.appendChild(root);
            var jsonPanel = el('div', 'wep-hierarchy-json');
            jsonPanel.hidden = true;
            var jsonInput = el('textarea', 'form-control wep-value wep-json-fallback');
            jsonInput.setAttribute('aria-label', 'Table hierarchy JSON');
            jsonInput.rows = 10;
            jsonPanel.appendChild(jsonInput);
            panel.appendChild(jsonPanel);
            jsonInput.oninput = jsonInput.onchange = jsonChanged;
            var savedConfig = JSON.parse(property.value),
                savedTables = Object.keys(savedConfig),
                savingRules = false;
            function compactHierarchy() {
                var config = {};
                function visit(nodes) {
                    nodes.forEach(function (node) {
                        if (node.children.length)
                            config[node.table] = node.children.map(function (child) {
                                return child.table;
                            });
                        visit(node.children);
                    });
                }
                if (rules) visit(rules.groups);
                return config;
            }
            function parseHierarchy() {
                var config;
                try {
                    config = JSON.parse(jsonInput.value);
                } catch (e) {
                    throw new Error('Invalid JSON.');
                }
                if (!config || typeof config !== 'object' || Array.isArray(config))
                    throw new Error('Use a JSON object of parent tables and child table arrays.');
                Object.keys(config).forEach(function (table) {
                    if (
                        !/^[a-z][a-z0-9_]*$/i.test(table) ||
                        !Array.isArray(config[table]) ||
                        config[table].some(function (child) {
                            return typeof child !== 'string' || !/^[a-z][a-z0-9_]*$/i.test(child);
                        })
                    )
                        throw new Error('Use a JSON object of parent tables and child table arrays.');
                });
                var parents = {};
                Object.keys(config).forEach(function (parent) {
                    config[parent].forEach(function (child) {
                        if (Object.prototype.hasOwnProperty.call(parents, child))
                            throw new Error('A child table can appear under only one parent: ' + child);
                        parents[child] = parent;
                    });
                });
                Object.keys(config).forEach(function (table) {
                    var seen = {},
                        current = table;
                    while (current) {
                        if (seen[current]) throw new Error('The table hierarchy contains a cycle: ' + current);
                        seen[current] = true;
                        current = parents[current];
                    }
                });
                return config;
            }
            function readConfig() {
                return mode === 'JSON' ? parseHierarchy() : compactHierarchy();
            }
            function hierarchyError() {
                try {
                    readConfig();
                } catch (e) {
                    return e.message;
                }
                return '';
            }
            function jsonChanged() {
                if (syncing) return;
                markRules();
                try {
                    parseHierarchy();
                } catch (e) {
                    save.disabled = true;
                    status(note, e.message, 'error');
                }
            }
            function displayMode(next) {
                mode = next;
                root.hidden = mode !== 'UI';
                jsonPanel.hidden = mode !== 'JSON';
                modeButton.textContent = mode === 'UI' ? 'Switch to JSON' : 'Switch to UI';
                if (mode === 'JSON' && !jsonEditor) {
                    var host = el('div', 'wep-monaco');
                    jsonPanel.appendChild(host);
                    jsonEditor = mountJsonEditor(jsonInput, host, jsonChanged);
                    if (!jsonEditor) host.remove();
                }
                if (jsonEditor && mode === 'JSON') jsonEditor.layout();
                save.disabled = !rulesDirty || !!hierarchyError();
            }
            function setJson(config) {
                syncing = true;
                jsonInput.value = JSON.stringify(config, null, 4);
                if (jsonEditor) jsonEditor.setValue(jsonInput.value);
                syncing = false;
            }
            function setMode(next) {
                if (mode === next) return;
                if (next === 'UI') {
                    var config;
                    try {
                        config = parseHierarchy();
                    } catch (e) {
                        status(note, e.message, 'error');
                        return;
                    }
                    var requested = revision;
                    ajax('getRules', { rules: JSON.stringify(config) })
                        .then(function (data) {
                            if (requested !== revision) return;
                            rules = data.rules;
                            renderRules();
                            displayMode('UI');
                            status(note, rulesDirty ? 'Unsaved changes' : '');
                        })
                        .catch(function (error) {
                            status(note, error.message, 'error');
                        });
                } else {
                    closePicker();
                    setJson(rules ? compactHierarchy() : savedConfig);
                    displayMode('JSON');
                }
            }
            var footer = el('div', 'wep-actions');
            var save = button('Save property', function () {
                if (savingRules) return;
                var error = hierarchyError();
                if (error) {
                    save.disabled = true;
                    status(note, error, 'error');
                    return;
                }
                var config = readConfig(),
                    submitted = revision;
                var removed = savedTables
                    .filter(function (table) {
                        return !config[table] || !config[table].length;
                    })
                    .map(function (table) {
                        return 'monaco.plus.update_sets.markdown_groups.' + table;
                    });
                savingRules = true;
                save.disabled = true;
                confirmPropertyRemoval(removed, save)
                    .then(function (confirmed) {
                        if (!confirmed) return;
                        if (revision !== submitted)
                            throw new Error('Configuration changed. Save again to review the updated changes.');
                        status(note, 'Saving…');
                        return ajax('saveRules', {
                            rules: JSON.stringify(config),
                        }).then(function () {
                            savedTables = Object.keys(config).filter(function (table) {
                                return config[table].length;
                            });
                            property.propertyCount = savedTables.length;
                            property._refreshCount();
                            savedConfig = JSON.parse(JSON.stringify(config));
                            refreshRulesDirty();
                            status(note, rulesDirty ? 'Unsaved changes' : 'Saved.', rulesDirty ? 'dirty' : 'success');
                        });
                    })
                    .catch(function (error) {
                        status(note, error.message, 'error');
                    })
                    .then(function () {
                        savingRules = false;
                        save.disabled = !rulesDirty || !!hierarchyError();
                    });
            });
            var revert = button('Revert', function () {
                var requested = ++revision;
                ajax('getRules', { rules: JSON.stringify(savedConfig) })
                    .then(function (data) {
                        if (requested !== revision) return;
                        rules = data.rules;
                        rulesDirty = false;
                        revert.hidden = true;
                        setJson(savedConfig);
                        renderRules();
                        save.disabled = true;
                        status(note, '');
                    })
                    .catch(function (error) {
                        if (requested !== revision) return;
                        setJson(savedConfig);
                        displayMode('JSON');
                        refreshRulesDirty();
                        save.disabled = true;
                        status(note, error.message, 'error');
                    });
            });
            revert.hidden = true;
            save.className = 'btn btn-primary';
            save.disabled = true;
            footer.appendChild(save);
            footer.appendChild(revert);
            footer.appendChild(note);
            panel.appendChild(footer);
            card.appendChild(panel);
            status(note, 'Loading…');
            var loadingRevision = revision;
            ajax('getRules', {})
                .then(function (data) {
                    if (revision !== loadingRevision) return;
                    savedConfig = data.config;
                    savedTables = data.propertyTables || Object.keys(savedConfig);
                    rules = data.rules;
                    property.propertyCount = savedTables.length;
                    property._refreshCount();
                    renderRules();
                    status(note, '');
                })
                .catch(function (error) {
                    if (revision !== loadingRevision) return;
                    setJson(savedConfig);
                    displayMode('JSON');
                    status(note, error.message + ' Edit the JSON to repair the hierarchy.', 'error');
                });
            function refreshRulesDirty() {
                function canonical(config) {
                    return JSON.stringify(
                        Object.keys(config)
                            .sort()
                            .map(function (table) {
                                return [table, config[table].slice().sort()];
                            })
                    );
                }
                try {
                    rulesDirty =
                        canonical(mode === 'JSON' ? JSON.parse(jsonInput.value) : compactHierarchy()) !==
                        canonical(savedConfig);
                } catch (e) {
                    rulesDirty = true;
                }
                revert.hidden = !rulesDirty;
            }
            function markRules() {
                revision++;
                refreshRulesDirty();
                var error = hierarchyError();
                save.disabled = !rulesDirty || !!error;
                status(
                    note,
                    error || (rulesDirty ? 'Unsaved changes' : ''),
                    error ? 'error' : rulesDirty ? 'dirty' : ''
                );
            }
            function closePicker() {
                if (relatedPicker) {
                    relatedPicker.destroy();
                    relatedPicker = null;
                }
            }
            function contains(table, nodes) {
                return nodes.some(function (node) {
                    return node.table === table || contains(table, node.children);
                });
            }
            function openPicker(parent, parentRow, depth, trigger) {
                closePicker();
                relatedPicker = createPicker(parent, parentRow.parentNode, parentRow.nextSibling, depth + 1, trigger);
            }
            function createPicker(parent, body, before, depth, trigger) {
                var row = el('tr', parent ? 'wep-related-picker-row' : 'wep-top-picker-row');
                var inputs = el('td');
                if (parent) inputs.style.paddingLeft = 38 + depth * 20 + 'px';
                var reference = el('td', 'wep-rule-reference');
                var actionsCell = el('td', 'wep-rule-actions');
                var controls = el('div', 'wep-rule-action-group');
                actionsCell.appendChild(controls);
                row.appendChild(inputs);
                row.appendChild(reference);
                row.appendChild(actionsCell);
                row.appendChild(el('td'));
                body.insertBefore(row, before || null);
                var input = el('input');
                input.type = 'hidden';
                input.setAttribute('aria-label', parent ? 'Related table' : 'Top-level table');
                inputs.appendChild(input);
                var hint = el('span', 'wep-status');
                hint.setAttribute('role', 'status');
                inputs.appendChild(hint);
                var selected = null,
                    active = true,
                    timer = null,
                    request = 0,
                    $input = null;
                var add = iconButton('floppy-disk', 'Add table', function () {
                    if (!selected || contains(selected.table, rules.groups)) return;
                    (parent ? parent.children : rules.groups).push({
                        id: 'group_' + Date.now().toString(36),
                        table: selected.table,
                        label: selected.label,
                        field: selected.field || '',
                        children: [],
                    });
                    if (parent) collapsed[parent.id] = false;
                    markRules();
                    renderRules();
                });
                add.className = 'btn btn-primary';
                controls.appendChild(add);
                add.disabled = true;
                if (parent)
                    controls.appendChild(
                        iconButton('remove', 'Cancel', function () {
                            closePicker();
                            if (trigger) trigger.focus();
                        })
                    );
                var jq = window.$j || window.jQuery;
                if (!jq || !jq.fn || !jq.fn.select2) {
                    status(hint, 'The Select2 table picker is unavailable. Reload the page.', 'error');
                } else {
                    $input = jq(input);
                    $input.select2({
                        placeholder: parent ? 'Add related table' : 'Add table',
                        minimumInputLength: 0,
                        allowClear: true,
                        width: '100%',
                        query: function (query) {
                            clearTimeout(timer);
                            var current = ++request;
                            timer = setTimeout(function () {
                                ajax(
                                    parent ? 'getRelatedTables' : 'searchTables',
                                    parent ? { table: parent.table } : { query: query.term || '' }
                                )
                                    .then(function (data) {
                                        if (!active || current !== request) return;
                                        var term = (query.term || '').toLowerCase();
                                        var results = data.tables
                                            .filter(function (item) {
                                                return (
                                                    !contains(item.table || item.name, rules.groups) &&
                                                    (!parent ||
                                                        (item.label + ' ' + item.table + ' ' + item.field)
                                                            .toLowerCase()
                                                            .indexOf(term) !== -1)
                                                );
                                            })
                                            .map(function (item) {
                                                var table = item.table || item.name;
                                                return {
                                                    id: table + (item.field ? '.' + item.field : ''),
                                                    text: item.label + ' (' + table + ')',
                                                    table: table,
                                                    label: item.label,
                                                    field: item.field || '',
                                                };
                                            });
                                        status(hint, '');
                                        query.callback({
                                            results: results,
                                            more: false,
                                        });
                                    })
                                    .catch(function (error) {
                                        if (!active || current !== request) return;
                                        status(hint, error.message, 'error');
                                        query.callback({
                                            results: [],
                                            more: false,
                                        });
                                    });
                            }, 250);
                        },
                    });
                    $input.on('change.wepRules', function () {
                        selected = $input.select2('data');
                        add.disabled = !selected || contains(selected.table, rules.groups);
                        reference.textContent = selected ? selected.field : '';
                    });
                }
                return {
                    destroy: function () {
                        active = false;
                        request++;
                        clearTimeout(timer);
                        if ($input) {
                            $input.off('.wepRules');
                            $input.select2('destroy');
                        }
                        row.remove();
                    },
                };
            }
            function renderRules() {
                closePicker();
                if (topPicker) {
                    topPicker.destroy();
                    topPicker = null;
                }
                root.textContent = '';
                property._updatedRows = [];
                var table = el('table', 'table wep-properties-table wep-rule-table');
                var head = el('thead'),
                    header = el('tr');
                ['Table', 'Reference field', 'Actions', 'Updated'].forEach(function (label) {
                    var cell = el('th', '', label);
                    cell.setAttribute('scope', 'col');
                    header.appendChild(cell);
                });
                head.appendChild(header);
                table.appendChild(head);
                var body = el('tbody');
                table.appendChild(body);
                root.appendChild(table);
                function render(nodes, depth) {
                    nodes.sort(function (a, b) {
                        return a.label.localeCompare(b.label) || a.table.localeCompare(b.table);
                    });
                    nodes.forEach(function (node) {
                        if (collapsed[node.id] === undefined) collapsed[node.id] = true;
                        var row = el('tr'),
                            name = el('td');
                        name.style.paddingLeft = 10 + depth * 20 + 'px';
                        var branch = el('div', 'wep-rule-name');
                        if (node.children.length) {
                            var expand = iconButton(
                                collapsed[node.id] ? 'chevron-right' : 'chevron-down',
                                (collapsed[node.id] ? 'Expand ' : 'Collapse ') + node.label,
                                function () {
                                    collapsed[node.id] = !collapsed[node.id];
                                    renderRules();
                                }
                            );
                            expand.setAttribute('aria-expanded', String(!collapsed[node.id]));
                            branch.appendChild(expand);
                        } else branch.appendChild(el('span', 'wep-rule-spacer'));
                        var text = el('span', 'wep-rule-label');
                        text.appendChild(el('strong', '', node.label));
                        text.appendChild(el('code', '', node.table));
                        branch.appendChild(text);
                        name.appendChild(branch);
                        row.appendChild(name);
                        row.appendChild(el('td', 'wep-rule-reference', depth ? node.field : '—'));
                        var actionsCell = el('td', 'wep-rule-actions');
                        var controls = el('div', 'wep-rule-action-group');
                        actionsCell.appendChild(controls);
                        var child = iconButton('plus', 'Add child table', function () {
                            openPicker(node, row, depth, child);
                        });
                        child.disabled = depth >= 6;
                        controls.appendChild(child);
                        var remove = iconButton('remove', 'Remove table', function () {
                            nodes.splice(nodes.indexOf(node), 1);
                            closePicker();
                            markRules();
                            renderRules();
                        });
                        controls.appendChild(remove);
                        row.appendChild(actionsCell);
                        updatedCell(
                            property,
                            row,
                            function () {
                                return property.name + '.' + node.table;
                            },
                            (property.updatedByTable || {})[node.table]
                        );
                        body.appendChild(row);
                        if (!collapsed[node.id]) render(node.children, depth + 1);
                    });
                }
                render(rules.groups, 0);
                topPicker = createPicker(null, body, null, 0, null);
            }
        }
        function render(properties) {
            ['display_fields', 'table_config', 'markdown_display'].forEach(function (kind) {
                var prefix =
                    kind === 'display_fields'
                        ? 'monaco.plus.code_search.display_fields.'
                        : kind === 'table_config'
                          ? 'monaco.plus.assistant.table_config.'
                          : 'monaco.plus.update_sets.markdown_display.';
                var rows = properties.filter(function (property) {
                    return property.name.indexOf(prefix) === 0;
                });
                if (kind === 'markdown_display') {
                    var combined = properties.filter(function (property) {
                        return property.name === 'monaco.plus.update_sets.markdown_display';
                    })[0];
                    if (combined) {
                        var config = JSON.parse(combined.value);
                        rows = Object.keys(config)
                            .sort()
                            .map(function (table) {
                                return {
                                    name: prefix + table,
                                    value: JSON.stringify(config[table]),
                                    description: '',
                                    type: 'string',
                                    updatedOn: (combined.updatedByTable || {})[table],
                                };
                            });
                    }
                }
                properties = properties.filter(function (property) {
                    return (
                        property.name.indexOf(prefix) !== 0 &&
                        !(kind === 'markdown_display' && property.name === 'monaco.plus.update_sets.markdown_display')
                    );
                });
                properties.push({
                    name: prefix + '*',
                    prefix: prefix,
                    kind: kind,
                    rows: rows,
                    propertyCount: rows.length,
                    value: '',
                    type: 'string',
                    description:
                        kind === 'display_fields'
                            ? 'Display fields by table. Enter comma-separated field names.'
                            : kind === 'markdown_display'
                              ? 'Primary fields use commas for fallbacks and periods to join fields with a period. Empty fields are skipped. Additional fields are separate.'
                              : 'Assistant configuration by table.',
                });
            });
            if (sections) sections.textContent = '';
            if (nav) nav.textContent = '';
            var features = ['Widget Editor+', 'Assistant+', 'Code Search+'];
            properties.forEach(function (property) {
                var name = feature(property.name);
                if (name !== 'Export Markdown+' && features.indexOf(name) === -1) features.push(name);
            });
            if (
                properties.some(function (p) {
                    return feature(p.name) === 'Export Markdown+';
                })
            ) {
                features.push('Export Markdown+');
            }
            features.forEach(function (name, index) {
                var matches = properties
                    .filter(function (property) {
                        return feature(property.name) === name;
                    })
                    .sort(function (a, b) {
                        return a.name.localeCompare(b.name);
                    });
                if (!matches.length) return;
                var section = el('section', 'wep-section');
                section.id = 'wep-feature-' + index;
                section.setAttribute('data-feature', name);
                var heading = el('h2', 'wep-feature-heading', name);
                var countBadge = el('span', 'wep-section-count'),
                    pillCount;
                function refreshCount() {
                    var count = matches.reduce(function (total, property) {
                        return total + (typeof property.propertyCount === 'number' ? property.propertyCount : 1);
                    }, 0);
                    countBadge.textContent = count + (count === 1 ? ' property' : ' properties');
                    if (pillCount) pillCount.textContent = String(count);
                }
                matches.forEach(function (property) {
                    property._refreshCount = refreshCount;
                });
                refreshCount();
                heading.appendChild(countBadge);
                section.appendChild(heading);
                matches.forEach(function (property) {
                    section.appendChild(propertyCard(property));
                });
                if (sections) sections.appendChild(section);
                var item = el('li');
                item.setAttribute('data-feature', name);
                var link = el('a', 'btn btn-default wep-feature-pill');
                link.href = '#' + section.id;
                link.title = 'Go to ' + name;
                var labelSpan = el('span', 'we-sidebar-item-label', name);
                link.appendChild(labelSpan);
                pillCount = el('span', 'wep-nav-count we-type-count-pill');
                refreshCount();
                link.appendChild(pillCount);
                link.onclick = function (e) {
                    e.preventDefault();
                    if (section.hidden && search) {
                        search.value = '';
                        filter();
                    }
                    heading.setAttribute('tabindex', '-1');
                    heading.focus({ preventScroll: true });
                    var reduceMotion =
                        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    section.scrollIntoView({
                        behavior: reduceMotion ? 'auto' : 'smooth',
                        block: 'start',
                    });
                };
                item.appendChild(link);
                if (nav) nav.appendChild(item);
            });
            filter();
            window.requestAnimationFrame(function () {
                plainTextareas.forEach(resizePlainTextarea);
            });
        }
        function escapeRegex(s) {
            return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        }
        function escapeHtml(s) {
            if (!s) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
        function setHighlight(element, text, query) {
            if (!element) return;
            var str = String(text || '');
            if (!query || typeof element.innerHTML === 'undefined') {
                element.textContent = str;
                return;
            }
            var regex = new RegExp(escapeRegex(query), 'gi');
            var out = '';
            var lastIndex = 0;
            var match;
            while ((match = regex.exec(str)) !== null) {
                out += escapeHtml(str.slice(lastIndex, match.index));
                out += '<mark>' + escapeHtml(match[0]) + '</mark>';
                lastIndex = match.index + match[0].length;
                if (match[0].length === 0) regex.lastIndex++;
            }
            out += escapeHtml(str.slice(lastIndex));
            element.innerHTML = out;
        }
        function filter() {
            var query = (search && search.value ? search.value : '').trim().toLowerCase();
            var clearBtn = document.getElementById('wep-search-clear');
            if (clearBtn) clearBtn.style.display = query ? '' : 'none';
            var totalVisible = 0;
            if (sections) {
                Array.prototype.forEach.call(sections.querySelectorAll('.wep-section'), function (section) {
                    var visible = 0;
                    Array.prototype.forEach.call(section.querySelectorAll('.wep-card'), function (card) {
                        var cardSearch = card.getAttribute('data-search') || '';
                        var matches = !query || cardSearch.indexOf(query) !== -1;
                        card.hidden = !matches;
                        if (matches) {
                            visible++;
                            if (card._prop) {
                                var titles = card.querySelectorAll ? card.querySelectorAll('.wep-property-name') : [];
                                var titleEl = titles.length ? titles[0] : null;
                                var descs = card.querySelectorAll ? card.querySelectorAll('.wep-description') : [];
                                var descEl = descs.length ? descs[0] : null;
                                setHighlight(
                                    titleEl,
                                    /^monaco\.plus\.update_sets\.markdown_(groups|display)$/.test(card._prop.name)
                                        ? card._prop.name + '.*'
                                        : card._prop.name,
                                    query
                                );
                                if (descEl) setHighlight(descEl, card._prop.description || '', query);
                            }
                        }
                    });
                    section.hidden = !visible;
                    totalVisible += visible;
                });
            }
            var emptySearch = document.getElementById('wep-empty-search');
            if (emptySearch) emptySearch.style.display = query && totalVisible === 0 ? '' : 'none';
            window.requestAnimationFrame(function () {
                plainTextareas.forEach(resizePlainTextarea);
                jsonEditors.forEach(function (item) {
                    item.editor.layout();
                    item.resize();
                });
            });
        }
        var clearBtn = document.getElementById('wep-search-clear');
        if (clearBtn) {
            clearBtn.onclick = function () {
                if (search) {
                    search.value = '';
                    search.focus();
                }
                filter();
            };
        }
        if (search) search.oninput = filter;
        window.addEventListener('resize', function () {
            updateHeaderHeight();
            plainTextareas.forEach(resizePlainTextarea);
            jsonEditors.forEach(function (item) {
                item.editor.layout();
                item.resize();
            });
        });
        window.addEventListener('beforeunload', function (event) {
            if (!rulesDirty && !Object.keys(dirty).length) return;
            event.preventDefault();
            event.returnValue = '';
        });
        window.addEventListener('unload', function () {
            if (headerObserver) headerObserver.disconnect();
            jsonEditors.forEach(function (item) {
                try {
                    item.editor.dispose();
                } catch (e) {}
            });
        });
        ajax('getProperties', {})
            .then(function (data) {
                render(data.properties);
            })
            .catch(function (error) {
                status(message, error.message, 'error');
            });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise);
    else initialise();
})();

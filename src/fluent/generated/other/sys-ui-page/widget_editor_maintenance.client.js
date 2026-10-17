(function () {
    'use strict';
    function initialise() {
        var root = document.getElementById('wep-maintenance');
        if (!root) return;
        function node(id) {
            return document.getElementById('wep-' + id);
        }
        var importPlan = null;
        var file = node('preference-file'),
            reviewImport = node('review-import'),
            importPreview = node('import-preview'),
            importConfirm = node('import-confirm'),
            importPreferences = node('import-preferences');
        var plan = null,
            securityAdmin = false,
            busy = false,
            cancelled = false,
            finished = false,
            exporting = null,
            backupReady = false;
        var activePanel = 'export',
            cancelImport = node('restore-cancel');
        var choices = {},
            locks = {},
            selectAll = node('select-all-records');
        var exportPreferences = node('export-preferences'),
            options = node('uninstall-options'),
            review = node('review-uninstall'),
            deletePreferences = node('delete-preferences'),
            backupRequired = node('backup-required'),
            preview = node('uninstall-preview'),
            downloadBackup = node('download-backup'),
            backupSaved = node('backup-saved'),
            confirmation = node('uninstall-confirmation'),
            uninstall = node('uninstall');
        function status(text, kind, panel) {
            var message = node((panel || activePanel) + '-status');
            message.textContent = text;
            message.className = kind ? 'alert alert-' + kind : '';
            message.hidden = !text;
            if (message.parentElement.classList.contains('wep-maintenance-feedback'))
                message.parentElement.hidden = !text;
        }
        function selectedRecords() {
            return Object.keys(choices)
                .filter(function (id) {
                    return choices[id].checkbox.checked;
                })
                .map(function (id) {
                    return choices[id].row;
                });
        }
        function recordLink(row) {
            var link = document.createElement('a');
            link.textContent = row.label;
            link.href = row.table + '.do?sys_id=' + row.sys_id;
            link.target = '_blank';
            link.rel = 'noopener';
            return link;
        }
        function updateSelection() {
            if (!plan) return;
            locks = {};
            var queue = Object.keys(choices).filter(function (id) {
                    return !choices[id].checkbox.checked;
                }),
                seen = {};
            while (queue.length) {
                var id = queue.shift();
                if (seen[id]) continue;
                seen[id] = true;
                (choices[id].row.references || []).forEach(function (reference) {
                    if (reference === id || !choices[reference]) return;
                    locks[reference] = true;
                    choices[reference].checkbox.checked = false;
                    queue.push(reference);
                });
            }
            var selected = selectedRecords(),
                total = Object.keys(choices).length;
            selectAll.checked = selected.length === total && total > 0;
            selectAll.indeterminate = selected.length > 0 && selected.length < total;
            node('preserved-dependencies').hidden = !Object.keys(locks).length;
            node('uninstall-count').textContent =
                selected.length +
                ' selected, ' +
                (total - selected.length) +
                ' preserved. ' +
                (deletePreferences.checked
                    ? selected.filter(function (row) {
                          return row.table === 'sys_user_preference';
                      }).length + ' preferences selected.'
                    : plan.preferences.length + ' preferences kept.');
            node('uninstall-blocked').textContent =
                (plan.blockers || []).join(' ') +
                (!plan.securityAdmin ? ' Elevate to security_admin, then review again.' : '') +
                (plan.securityAdmin &&
                selected.some(function (row) {
                    return !row.canDelete;
                })
                    ? ' Some selected records cannot be deleted with your current permissions.'
                    : '');
            node('uninstall-warnings').hidden = !node('uninstall-blocked').textContent.trim();
            updateControls();
        }
        function updateControls() {
            file.disabled = busy || finished;
            reviewImport.disabled = busy || finished || !file.files.length;
            importConfirm.disabled = busy || finished;
            importPreferences.disabled = busy || finished || !importPlan || !importConfirm.checked;
            exportPreferences.disabled = finished || (busy && (exporting !== exportPreferences || cancelled));
            options.disabled = busy || finished || !securityAdmin;
            review.disabled = busy || finished || !securityAdmin;
            downloadBackup.disabled = finished || !plan || (busy && (exporting !== downloadBackup || cancelled));
            backupSaved.disabled = busy || finished;
            var blocked =
                plan &&
                selectedRecords().some(function (row) {
                    return !row.canDelete;
                });
            selectAll.disabled = busy || finished || !plan;
            Object.keys(choices).forEach(function (id) {
                choices[id].checkbox.disabled = busy || finished || !!locks[id];
            });
            var prerequisitesMissing =
                busy ||
                finished ||
                !securityAdmin ||
                !plan ||
                !selectedRecords().length ||
                blocked ||
                (plan && (!plan.securityAdmin || (plan.blockers && plan.blockers.length > 0))) ||
                (backupRequired.checked && (!backupReady || !backupSaved.checked));
            confirmation.disabled = prerequisitesMissing;
            uninstall.disabled = prerequisitesMissing || confirmation.value !== 'UNINSTALL';
        }
        function invalidate() {
            status('', '', 'backup');
            plan = null;
            choices = {};
            locks = {};
            backupReady = false;
            preview.hidden = true;
            confirmation.value = '';
            backupSaved.checked = false;
            node('backup-saved-label').hidden = true;
            updateControls();
        }
        function ajax(method, params) {
            return new Promise(function (resolve, reject) {
                var ga = new GlideAjax('WidgetEditorMarkdownAjax');
                ga.addParam('sysparm_name', method);
                Object.keys(params || {}).forEach(function (key) {
                    ga.addParam(key, String(params[key]));
                });
                ga.getXMLAnswer(function (answer) {
                    try {
                        var data = JSON.parse(answer || '{}');
                        if (!data.success)
                            throw new Error(data.error || 'The request failed. Review the records before retrying.');
                        resolve(data);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        }
        async function checkAccess() {
            if (busy || finished) return;
            securityAdmin = false;
            updateControls();
            try {
                var access = await ajax('getMaintenanceAccess', {});
                securityAdmin = access.securityAdmin === true;
                if (!securityAdmin) invalidate();
                updateControls();
            } catch (error) {
                invalidate();
                status(error.message, 'danger', 'uninstall');
            }
        }
        function getPreview(preferencesOnly) {
            return ajax('previewSuiteMaintenance', {
                preferences_only: preferencesOnly,
                delete_preferences: deletePreferences.checked,
                backup_required: backupRequired.checked,
            });
        }
        async function exportXml(data, mode) {
            var parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<unload>\n'],
                offset = 0;
            var backup = mode === 'backup';
            exporting = backup ? downloadBackup : exportPreferences;
            var label = exporting.textContent;
            exporting.textContent = 'Cancel export';
            cancelled = false;
            backupReady = false;
            backupSaved.checked = false;
            updateControls();
            try {
                data = await data;
                if (cancelled) throw new Error('Export cancelled.');
                while (true) {
                    var batch = await ajax('exportSuiteMaintenance', { token: data.token, mode: mode, offset: offset });
                    if (cancelled) throw new Error('Export cancelled.');
                    parts.push(batch.xml);
                    status('Exported ' + batch.next + ' of ' + batch.total + ' records…');
                    if (batch.done) break;
                    if (batch.next <= offset) throw new Error('Export did not advance. Review the records and retry.');
                    offset = batch.next;
                }
                parts.push('</unload>\n');
                var url = URL.createObjectURL(new Blob(parts, { type: 'application/xml;charset=utf-8' }));
                var link = document.createElement('a');
                link.href = url;
                link.download =
                    'widget-editor-plus-' + mode + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.xml';
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(function () {
                    URL.revokeObjectURL(url);
                }, 60000);
                if (mode === 'backup') {
                    backupReady = true;
                    node('backup-saved-label').hidden = false;
                }
                status('Exported ' + batch.total + ' records.', 'info');
            } finally {
                exporting.textContent = label;
                exporting = null;
            }
        }
        function cancelExport() {
            cancelled = true;
            status('Cancelling export…');
            updateControls();
        }
        async function run(panel, action, feedback) {
            if (busy || finished) return;
            activePanel = feedback || panel;
            busy = true;
            node(panel + '-details').setAttribute('aria-busy', 'true');
            updateControls();
            try {
                await action();
            } catch (error) {
                status(error.message || String(error), 'danger');
                node(activePanel + '-status').focus();
            } finally {
                busy = false;
                node(panel + '-details').setAttribute('aria-busy', 'false');
                updateControls();
            }
        }
        exportPreferences.onclick = function () {
            if (exporting === exportPreferences) {
                cancelExport();
                return;
            }
            run('export', async function () {
                invalidate();
                status('Loading preferences…');
                await exportXml(getPreview(true), 'preferences');
            });
        };
        file.onchange = function () {
            importPlan = null;
            importPreview.hidden = true;
            importConfirm.checked = false;
            status('', '', 'restore');
            updateControls();
        };
        importConfirm.onchange = updateControls;
        reviewImport.onclick = function () {
            run('restore', async function () {
                importPlan = null;
                importConfirm.checked = false;
                importPreview.hidden = true;
                if (!file.files.length) throw new Error('Choose a preferences XML file.');
                if (file.files[0].size > 10485760) throw new Error('Choose a file up to 10 MiB.');
                status('Checking preferences…');
                importPlan = await ajax('previewSuitePreferenceImport', { xml: await file.files[0].text() });
                node('import-count').textContent =
                    importPlan.total +
                    ' preferences: ' +
                    importPlan.updated +
                    ' updates, ' +
                    importPlan.created +
                    ' new.';
                importPreview.hidden = false;
                status('Confirm to restore preferences.');
            });
        };
        importPreferences.onclick = function () {
            if (importPreferences.disabled) return;
            run('restore', async function () {
                invalidate();
                var offset = 0;
                cancelled = false;
                cancelImport.hidden = false;
                status('Restoring preferences…');
                try {
                    while (true) {
                        var batch = await ajax('importSuitePreferences', {
                            token: importPlan.token,
                            confirmation: 'RESTORE',
                            offset: offset,
                        });
                        status('Restored ' + batch.next + ' of ' + batch.total + ' preferences…');
                        if (batch.done) break;
                        if (cancelled)
                            throw new Error(
                                'Import stopped after restoring ' +
                                    batch.next +
                                    ' preferences. Re-select the file to review and restore the rest.'
                            );
                        if (batch.next <= offset)
                            throw new Error('Import did not advance. Re-select the file to review and retry.');
                        offset = batch.next;
                    }
                    status('Restored ' + batch.total + ' preferences. Reload Widget Editor+ apps to apply.', 'info');
                } finally {
                    importPlan = null;
                    importConfirm.checked = false;
                    cancelImport.hidden = true;
                }
            });
        };
        cancelImport.onclick = function () {
            cancelled = true;
            status('Stopping after the current batch…', '', 'restore');
        };
        deletePreferences.onchange = backupRequired.onchange = function () {
            invalidate();
            status('Options changed. Review the records again.', '', 'uninstall');
        };
        review.onclick = function () {
            if (review.disabled) return;
            run('uninstall', async function () {
                invalidate();
                status('Finding installed records and preferences…');
                plan = await getPreview(false);
                var rows = plan.records.concat(deletePreferences.checked ? plan.preferences : []);
                var body = node('uninstall-records');
                body.textContent = '';
                rows.forEach(function (row) {
                    var tr = document.createElement('tr');
                    var cell = document.createElement('td'),
                        group = document.createElement('div'),
                        label = document.createElement('label'),
                        caption = document.createElement('span'),
                        checkbox = document.createElement('input');
                    group.className = 'input-group-checkbox';
                    checkbox.type = 'checkbox';
                    checkbox.className = 'checkbox';
                    checkbox.id = 'wep-remove-' + row.sys_id;
                    checkbox.checked = true;
                    label.className = 'checkbox-label';
                    label.htmlFor = checkbox.id;
                    caption.className = 'sr-only';
                    caption.textContent = 'Remove ' + row.label + ' (' + row.table + ')';
                    label.appendChild(caption);
                    checkbox.setAttribute('data-record-id', row.sys_id);
                    choices[row.sys_id] = { row: row, checkbox: checkbox };
                    checkbox.onchange = function () {
                        confirmation.value = '';
                        updateSelection();
                    };
                    group.appendChild(checkbox);
                    group.appendChild(label);
                    cell.appendChild(group);
                    tr.appendChild(cell);
                    [row.label, row.table, row.sys_id, row.user].forEach(function (value, index) {
                        var cell = document.createElement('td');
                        if (index === 0) cell.appendChild(recordLink(row));
                        else cell.textContent = value;
                        tr.appendChild(cell);
                    });
                    body.appendChild(tr);
                });
                updateSelection();
                preview.hidden = false;
                status(
                    rows.length
                        ? 'Review the records before uninstalling.'
                        : 'No Widget Editor+ apps records were found.'
                );
                if (!rows.length) {
                    plan = null;
                }
            });
        };
        downloadBackup.onclick = function () {
            if (exporting === downloadBackup) {
                cancelExport();
                return;
            }
            run(
                'uninstall',
                async function () {
                    status('', '', 'uninstall');
                    status('Exporting…');
                    await exportXml(plan, 'backup');
                },
                'backup'
            );
        };
        selectAll.onchange = function () {
            var checked = selectAll.checked;
            Object.keys(choices).forEach(function (id) {
                choices[id].checkbox.checked = checked;
            });
            confirmation.value = '';
            updateSelection();
        };
        confirmation.oninput = backupSaved.onchange = updateControls;
        uninstall.onclick = function () {
            if (uninstall.disabled) return;
            run('uninstall', async function () {
                status('Uninstalling…');
                node('uninstall-progress').hidden = false;
                try {
                    var result = await ajax('uninstallSuite', {
                        token: plan.token,
                        confirmation: confirmation.value,
                        selected_records: JSON.stringify(
                            selectedRecords().map(function (row) {
                                return row.sys_id;
                            })
                        ),
                    });
                    finished = true;
                    status(
                        'Uninstall complete. Removed ' +
                            result.total +
                            ' records' +
                            (result.kept ? ', ' + result.kept + ' preserved.' : '.') +
                            ' Reload ServiceNow navigation.',
                        'info'
                    );
                    document.querySelectorAll('button, input, select, textarea').forEach(function (control) {
                        control.disabled = true;
                    });
                    node('uninstall-status').focus();
                } catch (error) {
                    invalidate();
                    throw error;
                } finally {
                    node('uninstall-progress').hidden = true;
                }
            });
        };
        window.addEventListener('beforeunload', function (event) {
            if (!busy) return;
            event.preventDefault();
            event.returnValue = '';
        });
        node('uninstall-details').addEventListener('toggle', function () {
            if (this.open) checkAccess();
        });
        window.addEventListener('focus', checkAccess);
        checkAccess();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise);
    else initialise();
})();

(function () {
    'use strict';

    function mergeBlock(source, result, change, eol) {
        var from = source === '' ? [] : source.replace(/\r\n/g, '\n').split('\n');
        var into = result === '' ? [] : result.replace(/\r\n/g, '\n').split('\n');
        var text =
            change.originalEndLineNumber === 0
                ? []
                : from.slice(change.originalStartLineNumber - 1, change.originalEndLineNumber);
        var start =
            change.modifiedEndLineNumber === 0 ? change.modifiedStartLineNumber : change.modifiedStartLineNumber - 1;
        var count = change.modifiedEndLineNumber === 0 ? 0 : change.modifiedEndLineNumber - start;
        return into
            .slice(0, start)
            .concat(text, into.slice(start + count))
            .join(eol);
    }

    function create(container, previous, later, language, wordWrap, onChange, initial) {
        var monaco = window.monaco;
        var models = [previous, initial === undefined ? later : initial, later].map(function (value) {
            return monaco.editor.createModel(value, language);
        });
        var editors = [],
            comparisons = [],
            disposables = [],
            decorations = [[], [], []],
            resultChanges = [null, null],
            resultVersions = [0, 0],
            buttons = [[], []];
        var gutters = [];
        container.classList.add('dc-merge-editors');
        models.forEach(function (model, index) {
            var pane = document.createElement('div');
            pane.className = 'dc-merge-pane';
            var code = document.createElement('div');
            code.className = 'dc-merge-code';
            var gutter = document.createElement('div');
            gutter.className = 'dc-merge-gutter';
            if (index === 2) pane.appendChild(gutter);
            pane.appendChild(code);
            if (index === 0) pane.appendChild(gutter);
            container.appendChild(pane);
            gutters[index] = gutter;
            editors[index] = monaco.editor.create(code, {
                model: model,
                automaticLayout: true,
                readOnly: index !== 1,
                ariaLabel: ['Previous version (read only)', 'Merge+ (editable)', 'Later version (read only)'][index],
                scrollBeyondLastLine: false,
                wordWrap: wordWrap ? 'on' : 'off',
                minimap: { enabled: false },
                // Avoid cross-editor occurrence scans being cancelled when a merge field closes.
                occurrencesHighlight: 'off',
                lineNumbersMinChars: 3,
            });
        });

        function clearButtons(side) {
            buttons[side].forEach(function (button) {
                button.remove();
            });
            buttons[side] = [];
        }
        function decoration(start, end, origin) {
            return {
                range: new monaco.Range(start, 1, end, 1),
                options: {
                    isWholeLine: true,
                    className: 'dc-merge-' + origin,
                    hoverMessage: {
                        value: { previous: 'Previous version', later: 'Later version', custom: 'Custom edit' }[origin],
                    },
                },
            };
        }
        function colourResult() {
            var version = models[1].getVersionId();
            if (resultVersions[0] !== version || resultVersions[1] !== version) return;
            var lineCount = models[1].getLineCount();
            var different = resultChanges.map(function (changes) {
                var lines = new Uint8Array(lineCount);
                changes.forEach(function (change) {
                    if (change.modifiedEndLineNumber !== 0) {
                        lines.fill(1, change.modifiedStartLineNumber - 1, change.modifiedEndLineNumber);
                    }
                });
                return lines;
            });
            var ranges = [],
                start = 1,
                last = '';
            for (var line = 1; line <= lineCount + 1; line++) {
                var origin = '';
                if (line <= lineCount) {
                    var fromPrevious = !different[0][line - 1];
                    var fromLater = !different[1][line - 1];
                    origin = fromPrevious ? (fromLater ? '' : 'previous') : fromLater ? 'later' : 'custom';
                }
                if (origin !== last) {
                    if (last) ranges.push(decoration(start, line - 1, last));
                    start = line;
                    last = origin;
                }
            }
            decorations[1] = editors[1].deltaDecorations(decorations[1], ranges);
        }
        function compare(original, modified, update) {
            var hidden = document.createElement('div');
            hidden.className = 'dc-merge-diff-worker';
            hidden.setAttribute('aria-hidden', 'true');
            container.appendChild(hidden);
            var diff = monaco.editor.createDiffEditor(hidden, {
                readOnly: true,
                ignoreTrimWhitespace: false,
                maxComputationTime: 5000,
                minimap: { enabled: false },
                occurrencesHighlight: 'off',
            });
            comparisons.push(diff);
            disposables.push(
                diff.onDidUpdateDiff(function () {
                    var changes = diff.getLineChanges();
                    if (changes) update(changes);
                })
            );
            diff.setModel({ original: models[original], modified: models[modified] });
        }
        compare(0, 2, function (changes) {
            [0, 2].forEach(function (index) {
                var original = index === 0;
                decorations[index] = editors[index].deltaDecorations(
                    decorations[index],
                    changes
                        .filter(function (change) {
                            return (original ? change.originalEndLineNumber : change.modifiedEndLineNumber) !== 0;
                        })
                        .map(function (change) {
                            return decoration(
                                original ? change.originalStartLineNumber : change.modifiedStartLineNumber,
                                original ? change.originalEndLineNumber : change.modifiedEndLineNumber,
                                original ? 'previous' : 'later'
                            );
                        })
                );
            });
        });
        [0, 2].forEach(function (index, side) {
            var selectionButton = document.createElement('button');
            selectionButton.type = 'button';
            selectionButton.className = 'dc-merge-arrow';
            var selectionIcon = document.createElement('span');
            selectionIcon.className = 'icon ' + (side === 0 ? 'icon-arrow-right' : 'icon-arrow-left');
            selectionIcon.setAttribute('aria-hidden', 'true');
            selectionButton.appendChild(selectionIcon);
            selectionButton.title = 'Use selected ' + (side === 0 ? 'previous' : 'later') + ' text';
            selectionButton.setAttribute('aria-label', selectionButton.title);
            selectionButton.style.display = 'none';
            gutters[index].appendChild(selectionButton);
            selectionButton.addEventListener('click', function () {
                var selection = editors[index].getSelection();
                if (!selection || selection.isEmpty()) return;
                var target = editors[1].getSelection();
                var text = models[index].getValueInRange(selection);
                editors[1].pushUndoStop();
                editors[1].executeEdits(
                    'merge-selection',
                    [{ range: target, text: text, forceMoveMarkers: true }],
                    function (edits) {
                        var end = edits[0].range.getEndPosition();
                        return [new monaco.Selection(end.lineNumber, end.column, end.lineNumber, end.column)];
                    }
                );
                editors[1].pushUndoStop();
                editors[1].focus();
                editors[1].revealPositionInCenter(editors[1].getPosition());
            });
            function positionButtons() {
                var selection = editors[index].getSelection();
                var selected = selection && !selection.isEmpty();
                if (selected) {
                    selectionButton.mergeLine = selection.startLineNumber;
                    selectionButton.mergeEndLine = Math.max(
                        selection.startLineNumber,
                        selection.endLineNumber - (selection.endColumn === 1 ? 1 : 0)
                    );
                } else selectionButton.style.display = 'none';
                buttons[side].forEach(function (button) {
                    if (selected) button.style.display = 'none';
                });
                (selected ? [selectionButton] : buttons[side]).forEach(function (button) {
                    var top = editors[index].getTopForLineNumber(button.mergeLine) - editors[index].getScrollTop();
                    var bottom =
                        editors[index].getBottomForLineNumber(button.mergeEndLine) - editors[index].getScrollTop();
                    var height = gutters[index].clientHeight;
                    button.style.display = bottom <= 0 || top >= height ? 'none' : 'flex';
                    button.style.top = Math.max(0, Math.min(top, height - 24)) + 'px';
                });
            }
            disposables.push(editors[index].onDidScrollChange(positionButtons));
            disposables.push(editors[index].onDidLayoutChange(positionButtons));
            disposables.push(editors[index].onDidChangeCursorSelection(positionButtons));
            compare(index, 1, function (changes) {
                clearButtons(side);
                var version = models[1].getVersionId();
                resultChanges[side] = changes;
                resultVersions[side] = version;
                colourResult();
                changes.forEach(function (change) {
                    var button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'dc-merge-arrow';
                    button.appendChild(selectionIcon.cloneNode(true));
                    button.title =
                        'Use ' +
                        (side === 0 ? 'previous' : 'later') +
                        ' block at line ' +
                        change.originalStartLineNumber;
                    button.setAttribute('aria-label', button.title);
                    button.mergeLine = Math.max(
                        1,
                        Math.min(models[index].getLineCount(), change.originalStartLineNumber)
                    );
                    button.mergeEndLine = Math.max(button.mergeLine, change.originalEndLineNumber);
                    button.addEventListener('click', function () {
                        if (models[1].getVersionId() !== version) return;
                        var value = mergeBlock(
                            models[index].getValue(),
                            models[1].getValue(),
                            change,
                            models[1].getEOL()
                        );
                        editors[1].pushUndoStop();
                        editors[1].executeEdits('merge-block', [{ range: models[1].getFullModelRange(), text: value }]);
                        editors[1].pushUndoStop();
                        editors[1].focus();
                        editors[1].revealLineInCenter(
                            Math.max(1, Math.min(models[1].getLineCount(), change.modifiedStartLineNumber))
                        );
                    });
                    gutters[index].appendChild(button);
                    buttons[side].push(button);
                });
                positionButtons();
            });
        });
        disposables.push(
            models[1].onDidChangeContent(function () {
                clearButtons(0);
                clearButtons(1);
                resultVersions = [0, 0];
                onChange(models[1].getValue());
            })
        );
        editors[1].focus();
        return {
            getValue: function () {
                return models[1].getValue();
            },
            canUndo: function () {
                return models[1].canUndo();
            },
            canRedo: function () {
                return models[1].canRedo();
            },
            undo: function () {
                editors[1].trigger('merge', 'undo', null);
            },
            redo: function () {
                editors[1].trigger('merge', 'redo', null);
            },
            dispose: function () {
                disposables.forEach(function (disposable) {
                    disposable.dispose();
                });
                comparisons.forEach(function (diff) {
                    diff.setModel(null);
                    diff.dispose();
                });
                editors.forEach(function (editor) {
                    editor.setModel(null);
                    editor.dispose();
                });
                models.forEach(function (model) {
                    model.dispose();
                });
                container.textContent = '';
            },
        };
    }
    window.WEMergeEditor = { create: create, mergeBlock: mergeBlock };
})();

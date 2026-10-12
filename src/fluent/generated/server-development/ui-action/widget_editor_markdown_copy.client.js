function copyUpdateSetMarkdownPlus(currentList, sourceElement) {
    // Capture the invoking list now: ServiceNow clears g_list when the action returns.
    return new Promise(function (resolve, reject) {
        try {
            var list =
                sourceElement && sourceElement.nodeType === 1 && typeof GlideList2 !== 'undefined'
                    ? GlideList2.get(sourceElement)
                    : null;
            list = list || currentList || (typeof g_list !== 'undefined' ? g_list : null);
            if (!list && typeof GlideLists2 !== 'undefined') {
                var matches = Object.keys(GlideLists2)
                    .map(function (id) {
                        return GlideLists2[id];
                    })
                    .filter(function (item) {
                        return (
                            item && typeof item.getTableName === 'function' && item.getTableName() === 'sys_update_xml'
                        );
                    });
                if (matches.length === 1) list = matches[0];
            }
            if (!list || list.getTableName() !== 'sys_update_xml') {
                throw new Error('The Customer Updates list could not be found.');
            }
            var query = _weMarkdownListQuery(list);
            _weMarkdownNotify('info', 'Preparing Markdown export… Keep page in focus.');
            resolve(query);
        } catch (error) {
            reject(error);
        }
    })
        .then(_weLoadMarkdownList)
        .then(function (loaded) {
            var value = _weMarkdownText(
                [{ rows: loaded.rows }],
                loaded.escapeMarkdown,
                loaded.maxListLevels,
                loaded.indicators
            );
            if (!value) throw new Error('No customer updates match this list.');
            return _weWriteMarkdownClipboard(value);
        })
        .then(function () {
            _weMarkdownNotify('info', 'Markdown copied to clipboard');
        })
        .catch(function (error) {
            _weMarkdownNotify('error', error.message || String(error));
        });
}

function _weMarkdownListQuery(list) {
    var query = list.getQuery({ fixed: true });
    if (typeof query !== 'string') throw new Error('The Customer Updates list query is unavailable.');
    var related = typeof list.getRelatedQuery === 'function' ? list.getRelatedQuery() : '';
    if (typeof list.getRelated === 'function' && list.getRelated() && !related) {
        throw new Error('The Customer Updates related-list query is unavailable.');
    }
    if (!related) return query;
    // Each OR query branch must remain inside the related list. Keep escaped carets intact.
    var branches = [],
        start = 0;
    for (var i = 0; i < query.length; i++) {
        if (query.charAt(i) !== '^') continue;
        if (query.charAt(i + 1) === '^') {
            i++;
            continue;
        }
        if (query.slice(i, i + 3) === '^NQ') {
            branches.push(query.slice(start, i));
            start = i + 3;
            i += 2;
        }
    }
    branches.push(query.slice(start));
    return branches
        .map(function (branch) {
            return related + (branch ? '^' + branch : '');
        })
        .join('^NQ');
}

function _weMarkdownAjax(method, params) {
    return new Promise(function (resolve, reject) {
        var ga = new GlideAjax('WidgetEditorMarkdownAjax');
        ga.addParam('sysparm_name', method);
        Object.keys(params || {}).forEach(function (key) {
            ga.addParam(key, params[key]);
        });
        ga.getXMLAnswer(function (answer) {
            var result;
            try {
                result = JSON.parse(answer || '{}');
            } catch (e) {
                reject(new Error('Invalid Markdown response.'));
                return;
            }
            if (!result.success) {
                reject(new Error(result.error || 'Markdown request failed.'));
                return;
            }
            resolve(result);
        });
    });
}

function _weLoadMarkdownList(query) {
    var rows = [],
        offset = 0,
        escapeMarkdown = false,
        maxListLevels = 9,
        indicators;
    function next() {
        return _weMarkdownAjax('getListPage', {
            list_query: query,
            offset: offset,
        }).then(function (page) {
            rows = rows.concat(page.rows);
            if (offset === 0) {
                escapeMarkdown = page.escapeMarkdown === true;
                maxListLevels = page.maxListLevels;
                indicators = page.indicators;
            }
            if (!page.hasMore)
                return {
                    rows: rows,
                    escapeMarkdown: escapeMarkdown,
                    maxListLevels: maxListLevels,
                    indicators: indicators,
                };
            if (page.nextOffset <= offset) throw new Error('Markdown paging did not advance.');
            offset = page.nextOffset;
            return next();
        });
    }
    return next();
}

function _weMarkdownEscape(value, escapeMarkdown) {
    var text = String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (escapeMarkdown !== true) return text;
    return text.replace(/[\\`*_{}\[\]()#+.!|<>~-]/g, '\\$&');
}
function _weMarkdownLink(name, url, escapeMarkdown) {
    var label = _weMarkdownEscape(name, escapeMarkdown);
    return url ? '[' + label + '](' + String(url).replace(/\(/g, '%28').replace(/\)/g, '%29') + ')' : label;
}
function _weMarkdownContainer() {
    return { types: {} };
}
function _weMarkdownType(container, label, order) {
    if (!container.types[label])
        container.types[label] = {
            label: label,
            order: order == null ? 10000 : order,
            records: {},
        };
    return container.types[label];
}
function _weMarkdownRecord(type, record) {
    var key = record.table + ':' + record.id;
    if (!type.records[key])
        type.records[key] = {
            table: record.table,
            id: record.id,
            name: record.name,
            url: record.url,
            secondary: record.secondary || [],
            inUpdateSet: record.inUpdateSet,
            setMarkers: record.setMarkers || [],
            action: record.action || '',
            isNew: !!record.isNew,
            types: {},
        };
    else if (record.updateId) {
        type.records[key].name = record.name;
        type.records[key].url = record.url;
        type.records[key].secondary = record.secondary || [];
        type.records[key].action = record.action || '';
    }
    return type.records[key];
}
function _weMarkdownTree(rows) {
    var root = _weMarkdownContainer(),
        definitions = {},
        attached = {},
        visiting = {};
    function key(record) {
        return record.table + ':' + (record.consolidation ? 'article:' + record.consolidation.key : record.id);
    }
    function register(record, parents, explicit) {
        var id = key(record),
            existing = definitions[id];
        var present = explicit || record.inUpdateSet === true;
        if (!existing) {
            definitions[id] = {
                record: Object.assign({}, record, { inUpdateSet: present }),
                parents: parents,
                explicit: explicit,
                ids: [record.id],
            };
            return;
        }
        present = present || existing.record.inUpdateSet;
        var markers = _weMarkdownMergeMarkers(existing.record.setMarkers, record.setMarkers);
        var isNew = existing.record.isNew || record.isNew;
        if (existing.ids.indexOf(record.id) === -1) existing.ids.push(record.id);
        var newer =
            record.consolidation &&
            existing.record.consolidation &&
            record.consolidation.version.localeCompare(existing.record.consolidation.version, undefined, {
                numeric: true,
            }) > 0;
        if ((explicit && !existing.explicit) || (explicit === existing.explicit && newer)) {
            existing.record = Object.assign({}, record);
            existing.parents = parents;
            existing.explicit = explicit;
        }
        existing.record.inUpdateSet = present;
        existing.record.setMarkers = markers;
        existing.record.isNew = isNew;
        if (existing.ids.length > 1 && existing.record.consolidation)
            existing.record.name = existing.record.consolidation.name;
    }
    // Explicit updates supply the authoritative status and parent chain.
    rows.forEach(function (row) {
        register(row, row.ancestors || [], true);
    });
    rows.forEach(function (row) {
        (row.ancestors || []).forEach(function (ancestor, index, ancestors) {
            register(ancestor, ancestors.slice(0, index), false);
        });
    });
    function attach(id) {
        if (attached[id]) return attached[id];
        if (visiting[id]) return root;
        visiting[id] = true;
        var definition = definitions[id],
            record = definition.record,
            parents = definition.parents;
        var parent = parents.length ? attach(key(parents[parents.length - 1])) : root;
        attached[id] = _weMarkdownRecord(_weMarkdownType(parent, record.type, record.typeOrder), record);
        delete visiting[id];
        return attached[id];
    }
    Object.keys(definitions).forEach(attach);
    function markNewBranches(container) {
        var allNew = !!container.isNew && container.action !== 'DELETE' && container.inUpdateSet !== false;
        Object.keys(container.types).forEach(function (label) {
            var records = container.types[label].records;
            Object.keys(records).forEach(function (id) {
                if (!markNewBranches(records[id])) allNew = false;
            });
        });
        container.allNew = allNew;
        return allNew;
    }
    markNewBranches(root);
    return root;
}
function _weMarkdownRender(container, depth, summary, suppressNew, escapeMarkdown, maxListLevels, indicators) {
    maxListLevels = Number(maxListLevels);
    if (!isFinite(maxListLevels) || maxListLevels < 1 || Math.floor(maxListLevels) !== maxListLevels) maxListLevels = 9;
    summary = summary || {};
    var lines = [];
    Object.keys(container.types)
        .sort(function (a, b) {
            return a.localeCompare(b);
        })
        .forEach(function (label) {
            var type = container.types[label];
            var flat = depth + 2 >= maxListLevels;
            var typeLabel = '**' + _weMarkdownEscape(label, escapeMarkdown) + '**';
            if (depth + 1 < maxListLevels) lines.push(Array(depth * 2 + 1).join(' ') + '- ' + typeLabel);
            Object.keys(type.records)
                .sort(function (a, b) {
                    return type.records[a].name.localeCompare(type.records[b].name) || a.localeCompare(b);
                })
                .forEach(function (key) {
                    var record = type.records[key];
                    var name = _weMarkdownLink(record.name, record.url, escapeMarkdown);
                    if (record.action === 'DELETE') name = '~~' + name + '~~';
                    var separator = _weMarkdownFormatOption(indicators, 'display_field_separator');
                    if (separator && !/\s$/.test(separator)) separator += ' ';
                    var wrapper = _weMarkdownFormatOption(indicators, 'display_field_wrapper');
                    if (record.secondary.length)
                        name +=
                            ' ' +
                            wrapper.charAt(0) +
                            record.secondary
                                .map(function (value) {
                                    return _weMarkdownEscape(value, escapeMarkdown);
                                })
                                .join(separator) +
                            wrapper.charAt(1);
                    var statusMarker =
                        record.action === 'DELETE'
                            ? _weMarkdownIndicator(indicators, 'deleted')
                            : record.isNew && (!suppressNew || flat)
                              ? _weMarkdownIndicator(indicators, 'new')
                              : '';
                    if (statusMarker) name += ' ' + statusMarker;
                    var setMarkers = record.setMarkers
                        .map(function (number) {
                            return _weMarkdownIndicator(indicators, 'update_set', number);
                        })
                        .filter(function (value) {
                            return value;
                        });
                    if (setMarkers.length) name += ' ' + setMarkers.join(' ');
                    if (record.inUpdateSet === false) {
                        var contextMarker = _weMarkdownFormatOption(indicators, 'context_indicator');
                        // Avoid emphasis spanning links and additional values in Markdown paste converters.
                        name = (contextMarker ? contextMarker + ' ' : '') + name;
                        summary.hasContextOnly = true;
                    }
                    if (flat) name += ' ' + typeLabel;
                    var recordDepth = Math.min(depth + 1, maxListLevels - 1);
                    lines.push(Array(recordDepth * 2 + 1).join(' ') + '- ' + name);
                    lines = lines.concat(
                        _weMarkdownRender(
                            record,
                            depth + 2,
                            summary,
                            suppressNew || record.allNew,
                            escapeMarkdown,
                            maxListLevels,
                            indicators
                        )
                    );
                });
        });
    return lines;
}
function _weMarkdownKeycap(number) {
    if (number === 10) return '\uD83D\uDD1F';
    return String(number)
        .split('')
        .map(function (digit) {
            return digit + '\uFE0F\u20E3';
        })
        .join('');
}
function _weMarkdownIndicator(config, kind, number) {
    var defaults = { 'new': '\uD83C\uDD95', deleted: '\uD83D\uDEAE' };
    var value = config && typeof config[kind] === 'string' ? config[kind] : defaults[kind];
    if (kind === 'update_set') {
        var markers = config && config.update_set;
        value =
            markers && typeof markers[number] === 'string'
                ? markers[number]
                : !config && number >= 1 && number <= 10
                  ? _weMarkdownKeycap(number)
                  : '';
    }
    // Indicator text is intentional markup and is returned unchanged.
    return value.replace(/\s+/g, ' ').trim();
}
function _weMarkdownFormatOption(config, key) {
    var defaults = {
        display_field_separator: ',',
        context_indicator: '\u21aa',
        display_field_wrapper: '()',
    };
    return config && typeof config[key] === 'string' ? config[key] : defaults[key];
}
function _weMarkdownMergeMarkers(first, second) {
    return (first || [])
        .concat(second || [])
        .filter(function (value, index, values) {
            return values.indexOf(value) === index;
        })
        .sort(function (a, b) {
            return a - b;
        });
}
function _weMarkdownText(loaded, escapeMarkdown, maxListLevels, indicators) {
    var sets = {},
        seen = {},
        rows = [];
    function setKey(set) {
        return set.table + ':' + set.id;
    }
    loaded.forEach(function (item) {
        item.rows.forEach(function (row) {
            var set = row.sourceSet || item.set;
            if (set) sets[setKey(set)] = set;
        });
    });
    var keys = Object.keys(sets).sort(function (a, b) {
        return sets[a].name.localeCompare(sets[b].name) || a.localeCompare(b);
    });
    loaded.forEach(function (item) {
        item.rows.forEach(function (source) {
            var set = source.sourceSet || item.set;
            var markers = keys.length > 1 && set ? [keys.indexOf(setKey(set)) + 1] : [];
            var row = Object.assign({}, source, {
                setMarkers: markers,
                ancestors: (source.ancestors || []).map(function (parent) {
                    return Object.assign({}, parent, {
                        setMarkers: parent.inUpdateSet ? markers : [],
                    });
                }),
            });
            var key = row.table + ':' + row.id;
            if (!seen[key]) {
                seen[key] = row;
                rows.push(row);
            } else {
                var existing = seen[key];
                existing.isNew = existing.isNew || row.isNew;
                existing.setMarkers = _weMarkdownMergeMarkers(existing.setMarkers, markers);
                existing.ancestors.forEach(function (parent) {
                    row.ancestors.forEach(function (other) {
                        if (parent.table === other.table && parent.id === other.id) {
                            parent.inUpdateSet = parent.inUpdateSet || other.inUpdateSet;
                            parent.setMarkers = _weMarkdownMergeMarkers(parent.setMarkers, other.setMarkers);
                        }
                    });
                });
            }
        });
    });
    var legend = keys
        .map(function (key, index) {
            var set = sets[key];
            var marker = keys.length > 1 ? _weMarkdownIndicator(indicators, 'update_set', index + 1) : '';
            return (marker ? marker + ' ' : '') + _weMarkdownLink(set.name, set.url, escapeMarkdown);
        })
        .join('\n');
    var summary = {};
    var list = _weMarkdownRender(
        _weMarkdownTree(rows),
        0,
        summary,
        false,
        escapeMarkdown,
        maxListLevels,
        indicators
    ).join('\n');
    var contextMarker = _weMarkdownFormatOption(indicators, 'context_indicator');
    return (
        (legend ? legend + '\n\n' : '') +
        list +
        (summary.hasContextOnly
            ? '\n\n' + (contextMarker ? contextMarker + ' ' : '') + 'For context only - not included in update set.'
            : '')
    );
}

function _weMarkdownNotify(type, message) {
    var note = new GlideUINotification({
        type: type,
        text: message,
        duration: 5000,
    });
    NOW.CustomEvent.fireTop('glide:ui_notification.' + type, note);
}
function _weWriteMarkdownClipboard(value) {
    return Promise.resolve()
        .then(function () {
            if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
            return navigator.clipboard.writeText(value);
        })
        .catch(function () {
            throw new Error('Copy to clipboard failed. Ensure browser permissions allow clipboard access.');
        });
}

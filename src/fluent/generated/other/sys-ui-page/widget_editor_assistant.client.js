(function () {
    'use strict';

    function _initAngular() {
        if (typeof angular === 'undefined') {
            return;
        }

        var weAssistantApp = angular.module('weAssistantApp', []);

        // Directive: we-infinite-scroll="handler()" — invokes handler when the element is scrolled near its bottom.
        weAssistantApp.directive('weInfiniteScroll', [
            function () {
                var THRESHOLD_PX = 120;
                return {
                    restrict: 'A',
                    link: function (scope, el, attrs) {
                        function onScroll() {
                            var node = el[0];
                            if (node.scrollTop + node.clientHeight >= node.scrollHeight - THRESHOLD_PX) {
                                scope.$apply(function () {
                                    scope.$eval(attrs.weInfiniteScroll);
                                });
                            }
                        }
                        el.on('scroll', onScroll);
                        scope.$on('$destroy', function () {
                            el.off('scroll', onScroll);
                        });
                    },
                };
            },
        ]);

        // Canvas renderer for the selected-record graph. It owns drawing, wheel zoom and
        // pointer panning; native HTML buttons over the canvas provide record actions.
        weAssistantApp.directive('weRecordGraphCanvas', [
            '$window',
            '$timeout',
            function ($window, $timeout) {
                return {
                    restrict: 'A',
                    scope: {
                        graph: '=',
                        command: '=',
                        zoomPercent: '=',
                        onScan: '&',
                        onOpen: '&',
                        onRemove: '&',
                        onToggle: '&',
                        onSelectPrimary: '&',
                    },
                    link: function (scope, element) {
                        var canvas = element[0];
                        var ctx = canvas.getContext('2d');
                        var host = canvas.parentElement;
                        var actionLayer = document.createElement('div');
                        actionLayer.className = 'we-graph-actions-layer';
                        host.appendChild(actionLayer);
                        var minimap = document.createElement('canvas');
                        minimap.className = 'we-graph-minimap';
                        minimap.title = 'Graph overview — click or drag to pan';
                        minimap.setAttribute('aria-label', 'Graph overview. Click or drag to pan the graph.');
                        minimap.setAttribute('role', 'img');
                        host.appendChild(minimap);
                        var minimapCtx = minimap.getContext('2d');
                        var minimapTransform = { scale: 1, x: 0, y: 0 };
                        var minimapPointerId = null;
                        var lastTopologySignature = '';
                        var scanSourceKey = null;
                        var layoutRevision = 0;
                        var dpr = Math.max(1, $window.devicePixelRatio || 1);
                        var viewportWidth = 1;
                        var viewportHeight = 1;
                        var camera = { x: 0, y: 0, scale: 1 };
                        var layout = {
                            nodes: [],
                            byKey: {},
                            edges: [],
                            width: 1,
                            height: 1,
                        };
                        var pointer = null;
                        var destroyed = false;
                        var NODE_WIDTH = 280;
                        var COLUMN_GAP = 260;
                        var ROW_GAP = 46;
                        var COMPONENT_GAP = 110;
                        var MIN_SCALE = 0.2;
                        var MAX_SCALE = 2.5;
                        var AUTO_FIT_MIN_SCALE = 0.6;
                        var MIN_NODE_VISIBLE = 24;
                        var CLICK_SLOP = 4;
                        var LAYOUT_ANIMATION_MS = 420;
                        var nodeTween = null;
                        var cameraTween = null;
                        var animationFrame = null;
                        var reducedMotionMedia = $window.matchMedia
                            ? $window.matchMedia('(prefers-reduced-motion: reduce)')
                            : null;

                        function cssColour(property) {
                            var raw = $window.getComputedStyle(host).getPropertyValue(property).trim();
                            return 'rgb(' + raw.replace(/,/g, ' ') + ')';
                        }

                        var colours = {};
                        function refreshThemeColours() {
                            colours.background = cssColour('--now-color_background--secondary');
                            colours.surface = cssColour('--now-color_background--primary');
                            colours.primarySurface = cssColour('--now-color_surface--brand-1');
                            colours.text = cssColour('--now-color_text--primary');
                            colours.secondaryText = cssColour('--now-color_text--secondary');
                            colours.border = cssColour('--now-color_border--tertiary');
                            colours.primary = cssColour('--now-color--primary-1');
                            colours.positiveSurface = cssColour('--now-color_alert--positive-0');
                            colours.positiveBorder = cssColour('--now-color_alert--positive-1');
                            colours.criticalSurface = cssColour('--now-color_alert--critical-0');
                            colours.criticalBorder = cssColour('--now-color_alert--critical-1');
                        }
                        refreshThemeColours();

                        function roundedRect(x, y, width, height, radius) {
                            var r = Math.min(radius, width / 2, height / 2);
                            ctx.beginPath();
                            ctx.moveTo(x + r, y);
                            ctx.arcTo(x + width, y, x + width, y + height, r);
                            ctx.arcTo(x + width, y + height, x, y + height, r);
                            ctx.arcTo(x, y + height, x, y, r);
                            ctx.arcTo(x, y, x + width, y, r);
                            ctx.closePath();
                        }

                        // Wraps every character of the label, including long values with no spaces.
                        // Node height grows with the returned lines, so names are never ellipsised.
                        function wrapText(text, maxWidth) {
                            text = String(text || '');
                            if (!text) return [''];
                            var words = text.split(/\s+/);
                            var lines = [];
                            var current = '';
                            words.forEach(function (word) {
                                var candidate = current ? current + ' ' + word : word;
                                if (ctx.measureText(candidate).width <= maxWidth) {
                                    current = candidate;
                                    return;
                                }
                                if (current) {
                                    lines.push(current);
                                    current = '';
                                }
                                while (ctx.measureText(word).width > maxWidth && word.length > 1) {
                                    var cut = word.length - 1;
                                    while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxWidth) cut--;
                                    lines.push(word.slice(0, cut));
                                    word = word.slice(cut);
                                }
                                current = word;
                            });
                            if (current) lines.push(current);
                            return lines.length ? lines : [''];
                        }

                        // Same buttons, in the same order, as the table's actions column.
                        function actionDefinitions(node) {
                            if (node.row.choiceGroup)
                                return node.blocked
                                    ? []
                                    : [
                                          {
                                              type: 'toggle',
                                              title: (node.checked ? 'Exclude' : 'Include') + ' all fields',
                                              iconClass: node.checked ? 'icon-check' : 'icon-add',
                                              choiceToggle: true,
                                          },
                                      ];
                            var actions = [];
                            if (node.primary && !node.embeddedPrimary)
                                actions.push({
                                    type: 'selectPrimary',
                                    title: 'Select primary record',
                                    iconClass: 'icon-target',
                                });
                            actions.push({
                                type: 'scan',
                                title: 'Scan for related records',
                                iconClass: 'icon-search',
                            });
                            if (!node.embeddedPrimary)
                                actions.push({
                                    type: 'open',
                                    title: 'Open record in platform',
                                    iconClass: 'icon-open-document-new-tab',
                                });
                            if (!node.primary)
                                actions.push({
                                    type: 'remove',
                                    title: 'Remove record',
                                    iconClass: 'icon-cross',
                                });
                            return actions;
                        }

                        function pillDefinitions(node) {
                            var row = node.row;
                            if (row.choiceGroup) {
                                var lines = [];
                                var currentLine = [];
                                var currentWidth = 0;
                                var maxLineWidth = 252;
                                if (ctx && ctx.measureText) {
                                    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                                }
                                var members = (row.members || []).slice().sort(function (a, b) {
                                    var nameA = String(a.choiceField || a.label || '');
                                    var nameB = String(b.choiceField || b.label || '');
                                    return nameA.localeCompare(nameB);
                                });
                                members.forEach(function (member) {
                                    var fieldName = member.choiceField || member.label || '';
                                    var isIncluded = !!member.checked;
                                    var def = {
                                        className: 'we-pill-choice' + (isIncluded ? '' : ' we-pill-choice--deselected'),
                                        label: fieldName,
                                        title: fieldName + (isIncluded ? ' (included)' : ' (deselected)'),
                                        opacity: isIncluded ? 1 : 0.5,
                                        onClick: function () {
                                            if (typeof scope !== 'undefined' && scope.$apply && scope.onToggle) {
                                                scope.$apply(function () {
                                                    scope.onToggle({
                                                        row: member,
                                                    });
                                                });
                                                if (typeof $timeout !== 'undefined' && typeof draw === 'function') {
                                                    $timeout(draw);
                                                }
                                            }
                                        },
                                    };
                                    var textWidth =
                                        ctx && ctx.measureText
                                            ? ctx.measureText(fieldName).width
                                            : fieldName.length * 7;
                                    var pillWidth = textWidth + 15;
                                    if (currentLine.length > 0 && currentWidth + 4 + pillWidth > maxLineWidth) {
                                        lines.push(currentLine);
                                        currentLine = [def];
                                        currentWidth = pillWidth;
                                    } else {
                                        currentLine.push(def);
                                        currentWidth += (currentLine.length > 1 ? 4 : 0) + pillWidth;
                                    }
                                });
                                if (currentLine.length) lines.push(currentLine);
                                return lines;
                            }
                            var lines = [];
                            var status = [];
                            if (node.primary)
                                status.push({
                                    className: 'we-pill-primary',
                                    label: 'Primary',
                                });
                            if (node.blocked)
                                status.push({
                                    className: 'we-pill-blocked',
                                    label: 'Blocked',
                                    iconBefore: 'icon-locked',
                                });
                            if (row.favouriteGroupName)
                                status.push({
                                    className: 'we-pill-favourite',
                                    label: row.favouriteGroupName,
                                    title: row.favouriteGroupName,
                                    textClass: 'we-pill-favourite-text',
                                    iconAfter: 'icon-star',
                                });
                            while (status.length) lines.push(status.splice(0, 2));

                            if (row.updateSetSysId) {
                                var updateLine = [
                                    {
                                        className: 'we-pill-update-set',
                                        label: row.updateSetName,
                                        title: row.updateSetName,
                                        textClass: 'we-pill-update-set-text',
                                        iconBefore: 'icon-document-code',
                                    },
                                ];
                                if (node.includePreviousUpdates && row.isNewInUpdateSet) {
                                    updateLine.push({
                                        className: 'we-pill-new',
                                        label: 'New',
                                    });
                                }
                                if (row.updateSetAction === 'DELETE') {
                                    updateLine.push({
                                        className: 'we-pill-deleted',
                                        label: 'Deleted',
                                    });
                                }
                                lines.push(updateLine);
                                if (node.includePreviousUpdates && !row.isNewInUpdateSet && row.previousVersion) {
                                    lines.push([
                                        {
                                            className: 'we-pill-update-set we-pill-update-set--previous',
                                            label: row.previousVersion.updateSetName,
                                            title: 'Previous Update Set: ' + row.previousVersion.updateSetName,
                                            textClass: 'we-pill-update-set-text',
                                        },
                                    ]);
                                }
                            }
                            return lines;
                        }

                        function createPill(definition) {
                            var pill = document.createElement('span');
                            pill.className = definition.className;
                            if (definition.title) pill.title = definition.title;
                            if (definition.opacity !== undefined) pill.style.opacity = String(definition.opacity);
                            if (definition.onClick) {
                                pill.addEventListener('click', function (e) {
                                    e.stopPropagation();
                                    definition.onClick(e);
                                });
                            }
                            if (definition.iconBefore) {
                                var before = document.createElement('i');
                                before.className = definition.iconBefore;
                                before.setAttribute('aria-hidden', 'true');
                                pill.appendChild(before);
                            }
                            var text = document.createElement('span');
                            if (definition.textClass) text.className = definition.textClass;
                            text.textContent = definition.label || '';
                            pill.appendChild(text);
                            if (definition.iconAfter) {
                                var after = document.createElement('i');
                                after.className = definition.iconAfter;
                                after.setAttribute('aria-hidden', 'true');
                                pill.appendChild(after);
                            }
                            return pill;
                        }

                        function rebuildActionButtons() {
                            // Overlay elements otherwise briefly render at absolute (0, 0) before
                            // the next canvas draw positions them. Keep the layer hidden until the
                            // canvas, cards and overlays have all been updated as one frame.
                            actionLayer.style.visibility = 'hidden';
                            actionLayer.innerHTML = '';
                            layout.nodes.forEach(function (node) {
                                var group = document.createElement('div');
                                group.className = 'we-graph-node-actions';
                                group.setAttribute('role', 'group');
                                group.setAttribute('aria-label', 'Actions for ' + node.fullLabel);
                                node.actions.forEach(function (action) {
                                    action.node = node;
                                    var button = document.createElement('button');
                                    button.type = 'button';
                                    button.className = 'btn btn-default btn-icon';
                                    button.title = action.title;
                                    button.setAttribute('aria-label', action.title);
                                    if (action.choiceToggle) {
                                        button.setAttribute(
                                            'aria-pressed',
                                            node.row.partiallyChecked ? 'mixed' : String(node.checked)
                                        );
                                    }
                                    var icon = document.createElement('i');
                                    icon.className = action.iconClass;
                                    icon.setAttribute('aria-hidden', 'true');
                                    button.appendChild(icon);
                                    button.addEventListener('click', function () {
                                        runAction(action);
                                    });
                                    action.button = button;
                                    group.appendChild(button);
                                });
                                actionLayer.appendChild(group);
                                node.actionGroup = group;

                                if (node.suggested) {
                                    var recommended = document.createElement('span');
                                    recommended.className = 'we-graph-recommended-icon';
                                    recommended.title = 'Recommended';
                                    recommended.setAttribute('aria-label', 'Recommended');
                                    var sparkle = document.createElement('i');
                                    sparkle.className = 'icon-ai-sparkle-fill';
                                    sparkle.setAttribute('aria-hidden', 'true');
                                    recommended.appendChild(sparkle);
                                    actionLayer.appendChild(recommended);
                                    node.recommendedIcon = recommended;
                                }

                                if (node.pillLines.length) {
                                    var pills = document.createElement('div');
                                    pills.className = 'we-graph-node-pills';
                                    pills.setAttribute('aria-hidden', 'true');
                                    node.pillLines.forEach(function (definitions) {
                                        var line = document.createElement('div');
                                        line.className = 'we-graph-pill-line';
                                        definitions.forEach(function (definition) {
                                            line.appendChild(createPill(definition));
                                        });
                                        pills.appendChild(line);
                                    });
                                    actionLayer.appendChild(pills);
                                    node.pillsElement = pills;
                                }
                            });
                        }

                        function columnX(column) {
                            return 40 + column * (NODE_WIDTH + COLUMN_GAP);
                        }

                        // Splits nodes into connected components (undirected) so each related
                        // group can be laid out on its own and stacked without interleaving.
                        function groupComponents(nodes) {
                            var seen = {};
                            var components = [];
                            nodes.forEach(function (start) {
                                if (seen[start.key]) return;
                                var component = [];
                                var stack = [start];
                                seen[start.key] = true;
                                while (stack.length) {
                                    var node = stack.pop();
                                    component.push(node);
                                    node.parents.concat(node.children).forEach(function (neighbour) {
                                        if (seen[neighbour.key]) return;
                                        seen[neighbour.key] = true;
                                        stack.push(neighbour);
                                    });
                                }
                                components.push(component);
                            });
                            return components;
                        }

                        // Neighbours in the direction of the sweep only; back edges and same-column
                        // links would otherwise pull a node towards its own column.
                        function sweepNeighbours(node, towardsParents) {
                            return (towardsParents ? node.parents : node.children).filter(function (other) {
                                return towardsParents ? other.column < node.column : other.column > node.column;
                            });
                        }

                        function nodeCentre(node) {
                            return node.y + node.height / 2;
                        }

                        // Moves each node in a column towards the average centre of its neighbours.
                        // A top-down and a bottom-up greedy placement are averaged, which keeps the
                        // column overlap-free while centring runs of siblings on their shared parent.
                        function relaxColumn(column, towardsParents) {
                            var desired = column.map(function (node) {
                                var neighbours = sweepNeighbours(node, towardsParents);
                                if (!neighbours.length) return node.y;
                                return (
                                    neighbours.reduce(function (sum, other) {
                                        return sum + nodeCentre(other);
                                    }, 0) /
                                        neighbours.length -
                                    node.height / 2
                                );
                            });
                            var down = [];
                            var floor = -Infinity;
                            column.forEach(function (node, index) {
                                var y = Math.max(desired[index], floor);
                                down.push(y);
                                floor = y + node.height + ROW_GAP;
                            });
                            var up = new Array(column.length);
                            var ceiling = Infinity;
                            for (var index = column.length - 1; index >= 0; index--) {
                                var y = Math.min(desired[index], ceiling - column[index].height - ROW_GAP);
                                up[index] = y;
                                ceiling = y;
                            }
                            column.forEach(function (node, index) {
                                node.y = (down[index] + up[index]) / 2;
                            });
                        }

                        // Layered layout for one connected component: barycentre ordering to cut
                        // edge crossings, then iterative vertical relaxation so children line up
                        // with their parents. Returns the component height; node.y starts at 0.
                        function placeComponent(component) {
                            var columns = {};
                            component.forEach(function (node) {
                                (columns[node.column] = columns[node.column] || []).push(node);
                            });
                            var keys = Object.keys(columns)
                                .map(Number)
                                .sort(function (a, b) {
                                    return a - b;
                                });
                            var reversedKeys = keys.slice().reverse();
                            function reindex(column) {
                                column.forEach(function (node, index) {
                                    node.index = index;
                                });
                            }
                            keys.forEach(function (key) {
                                columns[key].sort(function (a, b) {
                                    return a.order - b.order;
                                });
                                reindex(columns[key]);
                            });

                            for (var sweep = 0; sweep < 4; sweep++) {
                                var forward = sweep % 2 === 0;
                                (forward ? keys : reversedKeys).forEach(function (key, position) {
                                    if (position === 0) return;
                                    var column = columns[key];
                                    column.forEach(function (node) {
                                        var neighbours = sweepNeighbours(node, forward);
                                        node.barycentre = neighbours.length
                                            ? neighbours.reduce(function (sum, other) {
                                                  return sum + other.index;
                                              }, 0) / neighbours.length
                                            : node.index;
                                    });
                                    column.sort(function (a, b) {
                                        return a.barycentre - b.barycentre || a.index - b.index;
                                    });
                                    reindex(column);
                                });
                            }

                            keys.forEach(function (key) {
                                var y = 0;
                                columns[key].forEach(function (node) {
                                    node.y = y;
                                    y += node.height + ROW_GAP;
                                });
                            });
                            for (var pass = 0; pass < 3; pass++) {
                                keys.forEach(function (key, position) {
                                    if (position > 0) relaxColumn(columns[key], true);
                                });
                                reversedKeys.forEach(function (key, position) {
                                    if (position > 0) relaxColumn(columns[key], false);
                                });
                            }
                            keys.forEach(function (key, position) {
                                if (position > 0) relaxColumn(columns[key], true);
                            });

                            var top = Infinity;
                            var bottom = -Infinity;
                            component.forEach(function (node) {
                                top = Math.min(top, node.y);
                                bottom = Math.max(bottom, node.y + node.height);
                            });
                            component.forEach(function (node) {
                                node.x = columnX(node.column);
                                node.y -= top;
                            });
                            return bottom - top;
                        }

                        // Disconnected records are easier to scan when each row contains only
                        // one record type. Sort types and names, and wrap each type at three cards.
                        function placeUnrelatedRecords(singles, startY) {
                            if (!singles.length) return { bottom: startY, columns: 0 };
                            var byType = {};
                            singles.forEach(function (component) {
                                var node = component[0];
                                (byType[node.table] = byType[node.table] || []).push(node);
                            });
                            var types = Object.keys(byType).sort(function (a, b) {
                                var labelA = byType[a][0].tableLabel || a;
                                var labelB = byType[b][0].tableLabel || b;
                                return labelA.localeCompare(labelB) || a.localeCompare(b);
                            });
                            var y = startY;
                            var maxColumns = 0;
                            types.forEach(function (type, typeIndex) {
                                if (typeIndex > 0) y += COMPONENT_GAP;
                                var records = byType[type].sort(function (a, b) {
                                    return (
                                        String(a.fullLabel || '').localeCompare(String(b.fullLabel || '')) ||
                                        a.key.localeCompare(b.key)
                                    );
                                });
                                for (var start = 0; start < records.length; start += 3) {
                                    if (start > 0) y += ROW_GAP;
                                    var row = records.slice(start, start + 3);
                                    var rowHeight = 0;
                                    row.forEach(function (node, column) {
                                        node.x = columnX(column);
                                        node.y = y;
                                        rowHeight = Math.max(rowHeight, node.height);
                                    });
                                    maxColumns = Math.max(maxColumns, row.length);
                                    y += rowHeight;
                                }
                            });
                            return {
                                bottom: y + COMPONENT_GAP,
                                columns: maxColumns,
                            };
                        }

                        function buildLayout() {
                            var graph = scope.graph || { nodes: [], edges: [] };
                            var nodes = [];
                            var byKey = {};
                            ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                            (graph.nodes || []).forEach(function (sourceNode) {
                                var node = angular.extend({}, sourceNode);
                                ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                                node.labelLines = wrapText(node.fullLabel, NODE_WIDTH - 28);
                                ctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                                node.fieldLines = [];
                                node.fieldHeight = node.fieldLines.length ? 6 + node.fieldLines.length * 16 : 0;
                                node.width = NODE_WIDTH;
                                node.actions = actionDefinitions(node);
                                node.pillLines = pillDefinitions(node);
                                node.height = Math.max(
                                    82,
                                    58 + node.labelLines.length * 19 + node.fieldHeight + node.pillLines.length * 26
                                );
                                node.parents = [];
                                node.children = [];
                                nodes.push(node);
                                byKey[node.key] = node;
                            });
                            var edges = (graph.edges || []).filter(function (edge) {
                                return byKey[edge.source] && byKey[edge.target];
                            });
                            edges.forEach(function (edge) {
                                var from = byKey[edge.source];
                                var to = byKey[edge.target];
                                from.hasOutgoing = true;
                                to.hasIncoming = true;
                                from.children.push(to);
                                to.parents.push(from);
                            });

                            // Primary group first, then larger groups. Disconnected records follow
                            // in type-specific rows beneath the linked groups.
                            var linked = [];
                            var singles = [];
                            groupComponents(nodes).forEach(function (component) {
                                (component.length > 1 ? linked : singles).push(component);
                            });
                            linked.sort(function (a, b) {
                                var aPrimary = a.some(function (node) {
                                    return node.primary;
                                });
                                var bPrimary = b.some(function (node) {
                                    return node.primary;
                                });
                                if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
                                return b.length - a.length;
                            });
                            var columnCount = 0;
                            linked.forEach(function (component) {
                                component.forEach(function (node) {
                                    columnCount = Math.max(columnCount, node.column + 1);
                                });
                            });
                            var y = 40;
                            linked.forEach(function (component) {
                                var height = placeComponent(component);
                                component.forEach(function (node) {
                                    node.y += y;
                                });
                                y += height + COMPONENT_GAP;
                            });
                            var unrelated = placeUnrelatedRecords(singles, y);
                            y = unrelated.bottom;
                            columnCount = Math.max(columnCount, unrelated.columns, 1);

                            layout = {
                                nodes: nodes,
                                byKey: byKey,
                                edges: edges,
                                width: columnX(columnCount - 1) + NODE_WIDTH + 40,
                                height: Math.max(180, y - COMPONENT_GAP + 40),
                            };
                            rebuildActionButtons();
                        }

                        // Match the layout animation with an equal camera movement so the
                        // searched record stays at the same screen position and zoom.
                        function preserveScanSource(previous, animate) {
                            var from = previous[scanSourceKey];
                            var node = layout.byKey[scanSourceKey];
                            if (!from || !node) {
                                scanSourceKey = null;
                                return false;
                            }
                            cancelCameraTween();
                            var target = {
                                x: camera.x + (from.x - node.x) * camera.scale,
                                y: camera.y + (from.y - node.y) * camera.scale,
                                scale: camera.scale,
                            };
                            if (animate) animateCameraTo(target);
                            else {
                                camera.x = target.x;
                                camera.y = target.y;
                            }
                            return true;
                        }

                        function setZoomLabel() {
                            scope.zoomPercent = Math.round(camera.scale * 100);
                        }

                        // Keep panning useful without allowing the entire graph to be lost off-screen.
                        // If no card retains a visible patch, move the camera by the shortest amount
                        // needed to bring the nearest card back into the viewport.
                        function clampCameraToVisibleNode() {
                            if (!layout.nodes.length) return;
                            var nearest = null;
                            layout.nodes.forEach(function (node) {
                                var left = camera.x + node.x * camera.scale;
                                var top = camera.y + node.y * camera.scale;
                                var right = left + node.width * camera.scale;
                                var bottom = top + node.height * camera.scale;
                                var requiredX = Math.min(MIN_NODE_VISIBLE, node.width * camera.scale);
                                var requiredY = Math.min(MIN_NODE_VISIBLE, node.height * camera.scale);
                                var overlapX = Math.max(0, Math.min(right, viewportWidth) - Math.max(left, 0));
                                var overlapY = Math.max(0, Math.min(bottom, viewportHeight) - Math.max(top, 0));
                                if (overlapX >= requiredX && overlapY >= requiredY) {
                                    nearest = {
                                        visible: true,
                                        dx: 0,
                                        dy: 0,
                                        distance: 0,
                                    };
                                    return;
                                }
                                var dx =
                                    right < requiredX
                                        ? requiredX - right
                                        : left > viewportWidth - requiredX
                                          ? viewportWidth - requiredX - left
                                          : 0;
                                var dy =
                                    bottom < requiredY
                                        ? requiredY - bottom
                                        : top > viewportHeight - requiredY
                                          ? viewportHeight - requiredY - top
                                          : 0;
                                var distance = dx * dx + dy * dy;
                                if (!nearest || distance < nearest.distance)
                                    nearest = {
                                        visible: false,
                                        dx: dx,
                                        dy: dy,
                                        distance: distance,
                                    };
                            });
                            if (nearest && !nearest.visible) {
                                camera.x += nearest.dx;
                                camera.y += nearest.dy;
                            }
                        }

                        function easeOutCubic(t) {
                            return 1 - Math.pow(1 - t, 3);
                        }

                        function animationsAllowed() {
                            return !(reducedMotionMedia && reducedMotionMedia.matches);
                        }

                        function nodeAlpha(node) {
                            return (node.dimmed ? 0.5 : 1) * (node.alpha == null ? 1 : node.alpha);
                        }

                        function snapshotPositions() {
                            var positions = {};
                            layout.nodes.forEach(function (node) {
                                positions[node.key] = { x: node.x, y: node.y };
                            });
                            return positions;
                        }

                        // Slide cards from their previous spot to the new layout and fade in
                        // newcomers, so a shifted record stays traceable rather than jumping.
                        function animateLayoutFrom(previous) {
                            nodeTween = null;
                            if (!animationsAllowed()) return;
                            var moves = [];
                            layout.nodes.forEach(function (node) {
                                var from = previous[node.key];
                                if (!from) {
                                    node.alpha = 0;
                                    moves.push({
                                        node: node,
                                        fromX: node.x,
                                        fromY: node.y,
                                        toX: node.x,
                                        toY: node.y,
                                        fade: true,
                                    });
                                    return;
                                }
                                if (from.x === node.x && from.y === node.y) return;
                                moves.push({
                                    node: node,
                                    fromX: from.x,
                                    fromY: from.y,
                                    toX: node.x,
                                    toY: node.y,
                                });
                                node.x = from.x;
                                node.y = from.y;
                            });
                            if (!moves.length) return;
                            nodeTween = { start: null, moves: moves };
                            scheduleAnimationFrame();
                        }

                        function animateCameraTo(target) {
                            if (!animationsAllowed()) {
                                camera.x = target.x;
                                camera.y = target.y;
                                camera.scale = target.scale;
                                return;
                            }
                            cameraTween = {
                                start: null,
                                from: {
                                    x: camera.x,
                                    y: camera.y,
                                    scale: camera.scale,
                                },
                                to: target,
                            };
                            scheduleAnimationFrame();
                        }

                        function cancelCameraTween() {
                            cameraTween = null;
                        }

                        function scheduleAnimationFrame() {
                            if (animationFrame !== null) return;
                            animationFrame = $window.requestAnimationFrame(stepAnimation);
                        }

                        function stepAnimation(now) {
                            animationFrame = null;
                            if (destroyed) return;
                            var active = false;
                            if (nodeTween) {
                                if (nodeTween.start === null) nodeTween.start = now;
                                var nodeProgress = Math.min(1, (now - nodeTween.start) / LAYOUT_ANIMATION_MS);
                                var nodeEase = easeOutCubic(nodeProgress);
                                nodeTween.moves.forEach(function (move) {
                                    move.node.x = move.fromX + (move.toX - move.fromX) * nodeEase;
                                    move.node.y = move.fromY + (move.toY - move.fromY) * nodeEase;
                                    if (move.fade) move.node.alpha = nodeEase;
                                });
                                if (nodeProgress >= 1) {
                                    nodeTween.moves.forEach(function (move) {
                                        move.node.alpha = null;
                                    });
                                    nodeTween = null;
                                } else active = true;
                            }
                            if (cameraTween) {
                                if (cameraTween.start === null) cameraTween.start = now;
                                var cameraProgress = Math.min(1, (now - cameraTween.start) / LAYOUT_ANIMATION_MS);
                                var cameraEase = easeOutCubic(cameraProgress);
                                camera.x = cameraTween.from.x + (cameraTween.to.x - cameraTween.from.x) * cameraEase;
                                camera.y = cameraTween.from.y + (cameraTween.to.y - cameraTween.from.y) * cameraEase;
                                camera.scale =
                                    cameraTween.from.scale +
                                    (cameraTween.to.scale - cameraTween.from.scale) * cameraEase;
                                setZoomLabel();
                                if (cameraProgress >= 1) cameraTween = null;
                                else active = true;
                            }
                            draw();
                            if (active) scheduleAnimationFrame();
                            else scope.$evalAsync();
                        }

                        // Clamps to [AUTO_FIT_MIN_SCALE, 100%]; manual zoom via zoomAt can go further.
                        function fitGraph(animate) {
                            if (!layout.nodes.length) return;
                            var scale = Math.max(
                                AUTO_FIT_MIN_SCALE,
                                Math.min((viewportWidth - 80) / layout.width, (viewportHeight - 80) / layout.height, 1)
                            );
                            var target = {
                                scale: scale,
                                x: (viewportWidth - layout.width * scale) / 2,
                                y: (viewportHeight - layout.height * scale) / 2,
                            };
                            if (animate) {
                                animateCameraTo(target);
                            } else {
                                cancelCameraTween();
                                camera.x = target.x;
                                camera.y = target.y;
                                camera.scale = target.scale;
                            }
                            setZoomLabel();
                            draw();
                        }

                        function zoomAt(factor, screenX, screenY) {
                            cancelCameraTween();
                            var oldScale = camera.scale;
                            var nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));
                            var worldX = (screenX - camera.x) / oldScale;
                            var worldY = (screenY - camera.y) / oldScale;
                            camera.scale = nextScale;
                            camera.x = screenX - worldX * nextScale;
                            camera.y = screenY - worldY * nextScale;
                            clampCameraToVisibleNode();
                            setZoomLabel();
                            draw();
                        }

                        function drawGrid() {
                            var spacing = 24;
                            var left = -camera.x / camera.scale;
                            var top = -camera.y / camera.scale;
                            var right = left + viewportWidth / camera.scale;
                            var bottom = top + viewportHeight / camera.scale;
                            ctx.save();
                            ctx.fillStyle = colours.secondaryText;
                            ctx.globalAlpha = 0.2;
                            for (var x = Math.floor(left / spacing) * spacing; x <= right; x += spacing) {
                                for (var y = Math.floor(top / spacing) * spacing; y <= bottom; y += spacing) {
                                    ctx.beginPath();
                                    ctx.arc(x, y, 0.85 / camera.scale, 0, Math.PI * 2);
                                    ctx.fill();
                                }
                            }
                            ctx.restore();
                        }

                        // Cubic bezier leaving the source's right port and entering the target's
                        // left port horizontally. Backward links loop out and around.
                        function edgeEndpoints(from, to) {
                            var x1 = from.x + from.width;
                            var y1 = from.y + from.height / 2;
                            var x2 = to.x;
                            var y2 = to.y + to.height / 2;
                            var reach = Math.max(48, Math.abs(x2 - x1) * 0.45);
                            return {
                                x1: x1,
                                y1: y1,
                                x2: x2,
                                y2: y2,
                                c1x: x1 + reach,
                                c2x: x2 - reach,
                            };
                        }

                        // Bezier point at t = 0.5; the y control points equal the endpoints.
                        function edgeMidpoint(p) {
                            return {
                                x: (p.x1 + 3 * p.c1x + 3 * p.c2x + p.x2) / 8,
                                y: (p.y1 + p.y2) / 2,
                            };
                        }

                        function traceEdge(targetContext, from, to) {
                            var p = edgeEndpoints(from, to);
                            targetContext.beginPath();
                            targetContext.moveTo(p.x1, p.y1);
                            targetContext.bezierCurveTo(p.c1x, p.y1, p.c2x, p.y2, p.x2, p.y2);
                        }

                        // Split into two passes (see draw()) so a neighbouring edge's line — drawn
                        // after this one when several edges fan out from the same node — can never
                        // cross back over a label that's already been drawn.
                        function drawEdgeLine(edge) {
                            var from = layout.byKey[edge.source];
                            var to = layout.byKey[edge.target];
                            var p = edgeEndpoints(from, to);
                            ctx.save();
                            ctx.globalAlpha = from.dimmed || to.dimmed ? 0.45 : 1;
                            ctx.strokeStyle = colours.border;
                            ctx.lineWidth = 2;
                            traceEdge(ctx, from, to);
                            ctx.stroke();

                            ctx.fillStyle = colours.border;
                            ctx.beginPath();
                            ctx.moveTo(p.x2, p.y2);
                            ctx.lineTo(p.x2 - 10, p.y2 - 5);
                            ctx.lineTo(p.x2 - 10, p.y2 + 5);
                            ctx.closePath();
                            ctx.fill();
                            ctx.restore();
                        }

                        function drawEdgeLabel(edge) {
                            if (!edge.label) return;
                            var from = layout.byKey[edge.source];
                            var to = layout.byKey[edge.target];
                            var mid = edgeMidpoint(edgeEndpoints(from, to));
                            ctx.save();
                            ctx.globalAlpha = from.dimmed || to.dimmed ? 0.45 : 1;
                            var label = String(edge.label);
                            var mx = mid.x;
                            ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                            var labelLines = wrapText(label, COLUMN_GAP - 36);
                            var lineHeight = 16;
                            var labelWidth = labelLines.reduce(function (width, line) {
                                return Math.max(width, ctx.measureText(line).width);
                            }, 0);
                            var labelHeight = labelLines.length * lineHeight;
                            var my = mid.y - labelHeight / 2;
                            ctx.fillStyle = colours.background;
                            ctx.fillRect(mx - labelWidth / 2 - 6, my - 12, labelWidth + 12, labelHeight + 6);
                            ctx.fillStyle = colours.secondaryText;
                            ctx.textAlign = 'center';
                            labelLines.forEach(function (line, index) {
                                ctx.fillText(line, mx, my + index * lineHeight);
                            });
                            ctx.textAlign = 'left';
                            ctx.restore();
                        }

                        function fitText(text, maxWidth) {
                            text = String(text || '');
                            if (ctx.measureText(text).width <= maxWidth) return text;
                            while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth)
                                text = text.slice(0, -1);
                            return text + '…';
                        }

                        function nodeStatusGradient(targetContext, node, positive, critical) {
                            var gradient = targetContext.createLinearGradient(
                                node.x,
                                node.y,
                                node.x + node.width,
                                node.y
                            );
                            gradient.addColorStop(0, positive);
                            gradient.addColorStop(1, critical);
                            return gradient;
                        }

                        function nodeFillStyle(targetContext, node) {
                            if (node.isNew && node.isDeleted) {
                                return nodeStatusGradient(
                                    targetContext,
                                    node,
                                    colours.positiveSurface,
                                    colours.criticalSurface
                                );
                            }
                            if (node.isDeleted) return colours.criticalSurface;
                            if (node.isNew) return colours.positiveSurface;
                            return node.primary ? colours.primarySurface : colours.surface;
                        }

                        function nodeBorderStyle(targetContext, node) {
                            if (node.isNew && node.isDeleted) {
                                return nodeStatusGradient(
                                    targetContext,
                                    node,
                                    colours.positiveBorder,
                                    colours.criticalBorder
                                );
                            }
                            if (node.isDeleted) return colours.criticalBorder;
                            if (node.isNew) return colours.positiveBorder;
                            return node.primary ? colours.primary : colours.border;
                        }

                        function drawNode(node) {
                            ctx.save();
                            ctx.globalAlpha = nodeAlpha(node);
                            roundedRect(node.x, node.y, node.width, node.height, 8);
                            ctx.fillStyle = nodeFillStyle(ctx, node);
                            ctx.fill();
                            ctx.strokeStyle = nodeBorderStyle(ctx, node);
                            ctx.lineWidth = node.primary || node.isNew || node.isDeleted ? 2 : 1.25;
                            ctx.stroke();

                            ctx.fillStyle = colours.secondaryText;
                            ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                            var actionSpace = node.actions.length * 32 + 10;
                            var recommendedSpace = node.suggested ? 18 : 0;
                            var fittedTableLabel = fitText(
                                String(node.tableLabel || node.table).toUpperCase(),
                                node.width - 28 - actionSpace - recommendedSpace
                            );
                            ctx.fillText(fittedTableLabel, node.x + 14, node.y + 23);
                            node.tableTextWidth = ctx.measureText(fittedTableLabel).width;

                            ctx.fillStyle = colours.text;
                            ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                            node.labelLines.forEach(function (line, index) {
                                ctx.fillText(line, node.x + 14, node.y + 49 + index * 19);
                            });

                            ctx.fillStyle = colours.secondaryText;
                            ctx.font = '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                            node.fieldLines.forEach(function (line, index) {
                                ctx.fillText(
                                    line,
                                    node.x + 14,
                                    node.y + 49 + node.labelLines.length * 19 + 3 + index * 16
                                );
                            });

                            // Only render ports that participate in at least one relationship.
                            var ports = [];
                            if (node.hasIncoming) ports.push(node.x);
                            if (node.hasOutgoing) ports.push(node.x + node.width);
                            ports.forEach(function (portX) {
                                ctx.beginPath();
                                ctx.arc(portX, node.y + node.height / 2, 5, 0, Math.PI * 2);
                                ctx.fillStyle = colours.surface;
                                ctx.fill();
                                ctx.strokeStyle = colours.primary;
                                ctx.lineWidth = 2;
                                ctx.stroke();
                            });
                            ctx.restore();
                        }

                        function updateActionButtons() {
                            layout.nodes.forEach(function (node) {
                                if (!node.actionGroup) return;
                                node.actions.forEach(function (action) {
                                    if (action.button)
                                        action.button.disabled = action.type === 'scan' && !!node.row.scanning;
                                });
                                var groupWidth = node.actionGroup.offsetWidth;
                                var screenX = camera.x + (node.x + node.width - 10 - groupWidth) * camera.scale;
                                var screenY = camera.y + (node.y + 8) * camera.scale;
                                node.actionGroup.style.transform =
                                    'translate(' + screenX + 'px, ' + screenY + 'px) scale(' + camera.scale + ')';
                                node.actionGroup.style.opacity = String(nodeAlpha(node));
                                if (node.recommendedIcon) {
                                    var iconX = camera.x + (node.x + 20 + (node.tableTextWidth || 0)) * camera.scale;
                                    var iconY = camera.y + (node.y + 9) * camera.scale;
                                    node.recommendedIcon.style.transform =
                                        'translate(' + iconX + 'px, ' + iconY + 'px) scale(' + camera.scale + ')';
                                    node.recommendedIcon.style.opacity = String(nodeAlpha(node));
                                }
                                if (node.pillsElement) {
                                    var pillsX = camera.x + (node.x + 14) * camera.scale;
                                    var pillsY =
                                        camera.y +
                                        (node.y + 59 + (node.labelLines.length - 1) * 19 + node.fieldHeight) *
                                            camera.scale;
                                    node.pillsElement.style.transform =
                                        'translate(' + pillsX + 'px, ' + pillsY + 'px) scale(' + camera.scale + ')';
                                    node.pillsElement.style.opacity = String(nodeAlpha(node));
                                }
                            });
                        }

                        function drawMinimap() {
                            if (!layout.nodes.length) return;
                            var width = Math.max(1, minimap.clientWidth || 192);
                            var height = Math.max(1, minimap.clientHeight || 128);
                            var pixelWidth = Math.round(width * dpr);
                            var pixelHeight = Math.round(height * dpr);
                            if (minimap.width !== pixelWidth || minimap.height !== pixelHeight) {
                                minimap.width = pixelWidth;
                                minimap.height = pixelHeight;
                            }
                            minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
                            minimapCtx.clearRect(0, 0, width, height);
                            minimapCtx.fillStyle = colours.surface;
                            minimapCtx.fillRect(0, 0, width, height);

                            var padding = 9;
                            var scale = Math.min(
                                (width - padding * 2) / layout.width,
                                (height - padding * 2) / layout.height
                            );
                            var offsetX = (width - layout.width * scale) / 2;
                            var offsetY = (height - layout.height * scale) / 2;
                            minimapTransform = {
                                scale: scale,
                                x: offsetX,
                                y: offsetY,
                            };

                            minimapCtx.save();
                            minimapCtx.translate(offsetX, offsetY);
                            minimapCtx.scale(scale, scale);
                            minimapCtx.strokeStyle = colours.border;
                            minimapCtx.lineWidth = Math.max(1 / scale, 1.5);
                            layout.edges.forEach(function (edge) {
                                var from = layout.byKey[edge.source];
                                var to = layout.byKey[edge.target];
                                minimapCtx.globalAlpha = from.dimmed || to.dimmed ? 0.35 : 0.75;
                                traceEdge(minimapCtx, from, to);
                                minimapCtx.stroke();
                            });
                            layout.nodes.forEach(function (node) {
                                minimapCtx.globalAlpha = node.dimmed ? 0.4 : 1;
                                minimapCtx.fillStyle =
                                    node.isNew || node.isDeleted
                                        ? nodeFillStyle(minimapCtx, node)
                                        : node.primary
                                          ? colours.primary
                                          : colours.secondaryText;
                                minimapCtx.fillRect(node.x, node.y, node.width, node.height);
                                minimapCtx.strokeStyle = nodeBorderStyle(minimapCtx, node);
                                minimapCtx.lineWidth = Math.max(1 / scale, 1.5);
                                minimapCtx.strokeRect(node.x, node.y, node.width, node.height);
                            });
                            minimapCtx.restore();

                            // Current main-canvas viewport, expressed in graph-world coordinates.
                            var worldLeft = -camera.x / camera.scale;
                            var worldTop = -camera.y / camera.scale;
                            var worldWidth = viewportWidth / camera.scale;
                            var worldHeight = viewportHeight / camera.scale;
                            minimapCtx.save();
                            minimapCtx.fillStyle = colours.primary;
                            minimapCtx.globalAlpha = 0.12;
                            minimapCtx.fillRect(
                                offsetX + worldLeft * scale,
                                offsetY + worldTop * scale,
                                worldWidth * scale,
                                worldHeight * scale
                            );
                            minimapCtx.restore();
                            minimapCtx.strokeStyle = colours.primary;
                            minimapCtx.lineWidth = 1.5;
                            minimapCtx.strokeRect(
                                offsetX + worldLeft * scale,
                                offsetY + worldTop * scale,
                                worldWidth * scale,
                                worldHeight * scale
                            );
                        }

                        function draw() {
                            if (destroyed) return;
                            refreshThemeColours();
                            ctx.setTransform(1, 0, 0, 1, 0, 0);
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            ctx.fillStyle = colours.background;
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.setTransform(
                                dpr * camera.scale,
                                0,
                                0,
                                dpr * camera.scale,
                                dpr * camera.x,
                                dpr * camera.y
                            );
                            drawGrid();
                            layout.edges.forEach(drawEdgeLine);
                            layout.edges.forEach(drawEdgeLabel);
                            layout.nodes.forEach(drawNode);
                            updateActionButtons();
                            drawMinimap();
                            actionLayer.style.visibility = 'visible';
                        }

                        function resize() {
                            viewportWidth = Math.max(1, host.clientWidth);
                            viewportHeight = Math.max(1, host.clientHeight);
                            dpr = Math.max(1, $window.devicePixelRatio || 1);
                            canvas.width = Math.round(viewportWidth * dpr);
                            canvas.height = Math.round(viewportHeight * dpr);
                            canvas.style.width = viewportWidth + 'px';
                            canvas.style.height = viewportHeight + 'px';
                            clampCameraToVisibleNode();
                            draw();
                        }

                        function screenPoint(event) {
                            var rect = canvas.getBoundingClientRect();
                            return {
                                x: event.clientX - rect.left,
                                y: event.clientY - rect.top,
                            };
                        }

                        function runAction(action) {
                            if (!action || !action.node) return;
                            scope.$apply(function () {
                                if (action.type === 'scan') {
                                    scanSourceKey = action.node.key;
                                    cancelCameraTween();
                                    scope.onScan({ row: action.node.row });
                                }
                                if (action.type === 'open') scope.onOpen({ row: action.node.row });
                                if (action.type === 'remove') scope.onRemove({ row: action.node.row });
                                if (action.type === 'toggle') scope.onToggle({ row: action.node.row });
                                if (action.type === 'selectPrimary') scope.onSelectPrimary();
                            });
                            $timeout(draw);
                        }

                        // Node under a screen point, if any — checked later ones win so
                        // overlapping cards resolve to the one drawn on top.
                        function nodeAt(p) {
                            var worldX = (p.x - camera.x) / camera.scale;
                            var worldY = (p.y - camera.y) / camera.scale;
                            var hit = null;
                            layout.nodes.forEach(function (node) {
                                if (
                                    worldX >= node.x &&
                                    worldX <= node.x + node.width &&
                                    worldY >= node.y &&
                                    worldY <= node.y + node.height
                                )
                                    hit = node;
                            });
                            return hit;
                        }

                        function isToggleable(node) {
                            return !!node && !node.primary && !node.blocked;
                        }

                        function updateHoverCursor(p) {
                            element.toggleClass('we-canvas-over-node', !pointer && isToggleable(nodeAt(p)));
                        }

                        function onPointerDown(event) {
                            if (event.button !== undefined && event.button !== 0) return;
                            var p = screenPoint(event);
                            cancelCameraTween();
                            pointer = {
                                id: event.pointerId,
                                x: p.x,
                                y: p.y,
                                cameraX: camera.x,
                                cameraY: camera.y,
                                moved: false,
                            };
                            canvas.setPointerCapture(event.pointerId);
                            element.removeClass('we-canvas-over-node');
                            element.addClass('we-canvas-panning');
                        }

                        function onPointerMove(event) {
                            var p = screenPoint(event);
                            if (!pointer || pointer.id !== event.pointerId) {
                                updateHoverCursor(p);
                                return;
                            }
                            var dx = p.x - pointer.x;
                            var dy = p.y - pointer.y;
                            if (Math.abs(dx) > CLICK_SLOP || Math.abs(dy) > CLICK_SLOP) pointer.moved = true;
                            camera.x = pointer.cameraX + dx;
                            camera.y = pointer.cameraY + dy;
                            clampCameraToVisibleNode();
                            draw();
                        }

                        // A press-and-release without a drag toggles the card under the cursor;
                        // anything that moved beyond the slop was a pan.
                        function onPointerUp(event) {
                            if (!pointer || pointer.id !== event.pointerId) return;
                            var wasClick = !pointer.moved;
                            pointer = null;
                            element.removeClass('we-canvas-panning');
                            try {
                                canvas.releasePointerCapture(event.pointerId);
                            } catch (e) {}
                            var p = screenPoint(event);
                            var node = wasClick ? nodeAt(p) : null;
                            if (isToggleable(node)) runAction({ type: 'toggle', node: node });
                            updateHoverCursor(p);
                        }

                        // A cancelled pointer (e.g. touch scroll takeover) ends the pan but never toggles.
                        function onPointerCancel(event) {
                            if (!pointer || pointer.id !== event.pointerId) return;
                            pointer = null;
                            element.removeClass('we-canvas-panning');
                            try {
                                canvas.releasePointerCapture(event.pointerId);
                            } catch (e) {}
                        }

                        function onPointerLeave() {
                            element.removeClass('we-canvas-over-node');
                        }

                        function onWheel(event) {
                            event.preventDefault();
                            var p = screenPoint(event);
                            zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
                            scope.$evalAsync();
                        }

                        function panFromMinimap(event) {
                            cancelCameraTween();
                            var rect = minimap.getBoundingClientRect();
                            var localX = event.clientX - rect.left;
                            var localY = event.clientY - rect.top;
                            var worldX = (localX - minimapTransform.x) / minimapTransform.scale;
                            var worldY = (localY - minimapTransform.y) / minimapTransform.scale;
                            camera.x = viewportWidth / 2 - worldX * camera.scale;
                            camera.y = viewportHeight / 2 - worldY * camera.scale;
                            clampCameraToVisibleNode();
                            draw();
                        }

                        function onMinimapPointerDown(event) {
                            if (event.button !== undefined && event.button !== 0) return;
                            event.preventDefault();
                            minimapPointerId = event.pointerId;
                            minimap.setPointerCapture(event.pointerId);
                            panFromMinimap(event);
                        }

                        function onMinimapPointerMove(event) {
                            if (minimapPointerId !== event.pointerId) return;
                            event.preventDefault();
                            panFromMinimap(event);
                        }

                        function onMinimapPointerUp(event) {
                            if (minimapPointerId !== event.pointerId) return;
                            minimapPointerId = null;
                            try {
                                minimap.releasePointerCapture(event.pointerId);
                            } catch (e) {}
                        }

                        canvas.addEventListener('pointerdown', onPointerDown);
                        canvas.addEventListener('pointermove', onPointerMove);
                        canvas.addEventListener('pointerup', onPointerUp);
                        canvas.addEventListener('pointercancel', onPointerCancel);
                        canvas.addEventListener('pointerleave', onPointerLeave);
                        canvas.addEventListener('wheel', onWheel, {
                            passive: false,
                        });
                        minimap.addEventListener('pointerdown', onMinimapPointerDown);
                        minimap.addEventListener('pointermove', onMinimapPointerMove);
                        minimap.addEventListener('pointerup', onMinimapPointerUp);
                        minimap.addEventListener('pointercancel', onMinimapPointerUp);

                        var resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
                        if (resizeObserver) resizeObserver.observe(host);
                        else angular.element($window).on('resize', resize);

                        // Canvas pixels do not automatically repaint when CSS variables change.
                        // Watch the theme-bearing document elements and redraw from the latest
                        // ServiceNow colour tokens whenever a theme class/style changes.
                        var themeObserver =
                            typeof MutationObserver !== 'undefined'
                                ? new MutationObserver(function () {
                                      $timeout(draw);
                                  })
                                : null;
                        if (themeObserver) {
                            themeObserver.observe(document.documentElement, {
                                attributes: true,
                                attributeFilter: ['class', 'style', 'data-theme'],
                            });
                            if (document.body)
                                themeObserver.observe(document.body, {
                                    attributes: true,
                                    attributeFilter: ['class', 'style', 'data-theme'],
                                });
                        }
                        var colourSchemeMedia = $window.matchMedia
                            ? $window.matchMedia('(prefers-color-scheme: dark)')
                            : null;
                        function onColourSchemeChange() {
                            $timeout(draw);
                        }
                        if (colourSchemeMedia && colourSchemeMedia.addEventListener)
                            colourSchemeMedia.addEventListener('change', onColourSchemeChange);

                        scope.$watch('graph', function () {
                            var graph = scope.graph || { nodes: [], edges: [] };
                            var topologySignature =
                                (graph.nodes || [])
                                    .map(function (node) {
                                        return node.key;
                                    })
                                    .join('|') +
                                '::' +
                                (graph.edges || [])
                                    .map(function (edge) {
                                        return edge.key;
                                    })
                                    .join('|');
                            var topologyChanged = topologySignature !== lastTopologySignature;
                            lastTopologySignature = topologySignature;
                            var revision = ++layoutRevision;
                            var previous = snapshotPositions();
                            var animate = Object.keys(previous).length > 0;
                            buildLayout();
                            var sourcePreserved = preserveScanSource(previous, animate);
                            if (animate) animateLayoutFrom(previous);
                            var shouldFit = topologyChanged && !sourcePreserved;
                            if (host.clientWidth > 1 && host.clientHeight > 1) {
                                resize();
                                if (shouldFit) fitGraph(animate);
                            } else {
                                // Initial ng-if insertion can report zero dimensions for one turn.
                                // The overlay remains hidden until a correctly-sized frame is ready.
                                $timeout(function () {
                                    if (destroyed || revision !== layoutRevision) return;
                                    resize();
                                    if (shouldFit) fitGraph(animate);
                                });
                            }
                            if (shouldFit) {
                                // The host can still be mid-transition (e.g. a sidebar width
                                // animation) when the fit above runs, so its clientWidth/Height
                                // aren't final yet. Re-fit once more after paint settles so the
                                // automatic fit lands on the same size a manual Fit click would see.
                                $window.requestAnimationFrame(function () {
                                    $window.requestAnimationFrame(function () {
                                        if (destroyed || revision !== layoutRevision || scanSourceKey) return;
                                        resize();
                                        fitGraph(animate);
                                        scope.$evalAsync();
                                    });
                                });
                            }
                        });
                        scope.$watch('command', function (command) {
                            if (!command || !command.action) return;
                            if (command.action === 'fit') fitGraph();
                            if (command.action === 'zoomIn') zoomAt(1.2, viewportWidth / 2, viewportHeight / 2);
                            if (command.action === 'zoomOut') zoomAt(1 / 1.2, viewportWidth / 2, viewportHeight / 2);
                        });

                        scope.$on('$destroy', function () {
                            destroyed = true;
                            if (animationFrame !== null) $window.cancelAnimationFrame(animationFrame);
                            canvas.removeEventListener('pointerdown', onPointerDown);
                            canvas.removeEventListener('pointermove', onPointerMove);
                            canvas.removeEventListener('pointerup', onPointerUp);
                            canvas.removeEventListener('pointercancel', onPointerCancel);
                            canvas.removeEventListener('pointerleave', onPointerLeave);
                            canvas.removeEventListener('wheel', onWheel);
                            minimap.removeEventListener('pointerdown', onMinimapPointerDown);
                            minimap.removeEventListener('pointermove', onMinimapPointerMove);
                            minimap.removeEventListener('pointerup', onMinimapPointerUp);
                            minimap.removeEventListener('pointercancel', onMinimapPointerUp);
                            if (resizeObserver) resizeObserver.disconnect();
                            else angular.element($window).off('resize', resize);
                            if (themeObserver) themeObserver.disconnect();
                            if (colourSchemeMedia && colourSchemeMedia.removeEventListener)
                                colourSchemeMedia.removeEventListener('change', onColourSchemeChange);
                            if (actionLayer.parentNode) actionLayer.parentNode.removeChild(actionLayer);
                            if (minimap.parentNode) minimap.parentNode.removeChild(minimap);
                        });
                    },
                };
            },
        ]);

        // Directive: weModalDraggable — enables dragging a .we-picker-box modal by its
        // title row. Ported from Widget Editor+'s own we-modal-draggable directive so both
        // apps' modals behave identically, clamped so a modal can never be dragged off-screen.
        weAssistantApp.directive('weModalDraggable', [
            function () {
                return {
                    restrict: 'A',
                    link: function (scope, element) {
                        var modal = element[0].closest('.we-picker-box');
                        if (!modal) {
                            return;
                        }

                        var startX, startY, startTx, startTy, naturalLeft, naturalTop, dragging;

                        /* Parse the current translate() values from the modal's inline transform style. */
                        function getTranslate(el) {
                            var m = (el.style.transform || '').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
                            return m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0];
                        }

                        function onMouseMove(e) {
                            if (!dragging) return;
                            var dx = startTx + e.clientX - startX;
                            var dy = startTy + e.clientY - startY;

                            /* Clamp so the modal stays fully within the viewport. */
                            var mW = modal.offsetWidth;
                            var mH = modal.offsetHeight;
                            dx = Math.max(-naturalLeft, Math.min(window.innerWidth - mW - naturalLeft, dx));
                            dy = Math.max(-naturalTop, Math.min(window.innerHeight - mH - naturalTop, dy));

                            modal.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
                        }

                        function onMouseUp() {
                            dragging = false;
                            modal.classList.remove('we-picker-box--dragging');
                            document.removeEventListener('mousemove', onMouseMove);
                            document.removeEventListener('mouseup', onMouseUp);
                        }

                        element[0].addEventListener('mousedown', function (e) {
                            if (e.target.closest('button, a, input, select, [role="button"]')) {
                                return;
                            }
                            e.preventDefault();
                            var t = getTranslate(modal);
                            var rect = modal.getBoundingClientRect();
                            startX = e.clientX;
                            startY = e.clientY;
                            startTx = t[0];
                            startTy = t[1];
                            /* Natural (untranslated) position — computed once at drag start. */
                            naturalLeft = rect.left - t[0];
                            naturalTop = rect.top - t[1];
                            dragging = true;
                            modal.classList.add('we-picker-box--dragging');
                            document.addEventListener('mousemove', onMouseMove);
                            document.addEventListener('mouseup', onMouseUp);
                        });

                        scope.$on('$destroy', function () {
                            document.removeEventListener('mousemove', onMouseMove);
                            document.removeEventListener('mouseup', onMouseUp);
                        });
                    },
                };
            },
        ]);

        // Filter: weHighlight — wraps matching search-query text in native <mark> tags.
        weAssistantApp.filter('weHighlight', [
            '$sce',
            function ($sce) {
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
                return function (text, query) {
                    if (text === null || typeof text === 'undefined') {
                        return '';
                    }
                    var str = String(text);
                    if (!query || typeof query !== 'string' || !query.trim()) {
                        return $sce.trustAsHtml(escapeHtml(str));
                    }
                    var q = query.trim();
                    var regex = new RegExp(escapeRegex(q), 'gi');
                    var out = '';
                    var lastIndex = 0;
                    var match;
                    while ((match = regex.exec(str)) !== null) {
                        out += escapeHtml(str.slice(lastIndex, match.index));
                        out += '<mark>' + escapeHtml(match[0]) + '</mark>';
                        lastIndex = match.index + match[0].length;
                        if (match[0].length === 0) {
                            regex.lastIndex++;
                        }
                    }
                    out += escapeHtml(str.slice(lastIndex));
                    return $sce.trustAsHtml(out);
                };
            },
        ]);

        // Directive: we-loader — inline search-box loading spinner.
        weAssistantApp.directive('weLoader', [
            function () {
                return {
                    restrict: 'E',
                    template:
                        '<svg class="we-loader-icon" aria-hidden="true" viewBox="0 0 16 16">' +
                        '<path d="M13 8a5 5 0 1 1-2.592-4.383c.208.115.47.09.638-.078l.738-.737a.47.47 0 0 0-.067-.735 7 7 0 1 0 2.216 2.216.47.47 0 0 0-.735-.067l-.737.738a.54.54 0 0 0-.078.638A5 5 0 0 1 13 8"/>' +
                        '</svg>',
                };
            },
        ]);

        // Directive: we-header-loader — small spinner shown next to a section header while loading.
        weAssistantApp.directive('weHeaderLoader', [
            function () {
                return {
                    restrict: 'E',
                    template:
                        '<span class="we-header-loader" aria-label="Loading" title="Loading…">' +
                        '<svg class="we-header-loader-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
                        '<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>' +
                        '<path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' +
                        '</svg>' +
                        '</span>',
                };
            },
        ]);

        var COMMON_TABLES = [
            { name: 'sp_widget', label: 'Widget' },
            { name: 'sys_script_include', label: 'Script Include' },
            { name: 'sys_script', label: 'Business Rule' },
            { name: 'sp_ng_template', label: 'Angular Template' },
            { name: 'sp_angular_provider', label: 'Angular Provider' },
            { name: 'sys_ui_page', label: 'UI Page' },
            { name: 'sys_ui_script', label: 'UI Script' },
            { name: 'sp_css', label: 'Style Sheet' },
            { name: 'sys_script_client', label: 'Client Script' },
            { name: 'sys_ui_policy', label: 'UI Policy' },
            { name: 'sys_ui_action', label: 'UI Action' },
            { name: 'sys_security_acl', label: 'Access Control (ACL)' },
            { name: 'sys_db_object', label: 'Table' },
            { name: 'sys_choice_set', label: 'Choice Set' },
            { name: 'sys_properties', label: 'System Property' },
            { name: 'sys_script_fix', label: 'Fix Script' },
            { name: 'sysauto', label: 'Scheduled Job' },
            { name: 'sysevent_email_action', label: 'Notification' },
            { name: 'sys_script_email', label: 'Mail Script' },
            { name: 'sp_page', label: 'Portal Page' },
            { name: 'sysauto_script', label: 'Scheduled Script Execution' },
        ];
        COMMON_TABLES.sort(function (a, b) {
            return a.label.localeCompare(b.label);
        });

        var COMMON_TABLE_NAMES = {};
        for (var ci = 0; ci < COMMON_TABLES.length; ci++) {
            COMMON_TABLE_NAMES[COMMON_TABLES[ci].name] = true;
        }

        var TABLE_LABELS = {
            sp_widget: 'Widget',
            sp_ng_template: 'Angular Template',
            sp_angular_provider: 'Angular Provider',
            sp_container: 'Container',
            sp_row: 'Row',
            sp_column: 'Column',
            sp_instance: 'Widget Instance',
            item_option_new: 'Variable',
            catalog_ui_policy: 'Catalog UI Policy',
            catalog_ui_policy_action: 'Catalog UI Policy Action',
            catalog_script_client: 'Catalog Client Script',
            sysevent_register: 'Event Registration',
            sys_rest_message: 'REST Message',
            sys_soap_message: 'SOAP Message',
            sys_hub_flow: 'Flow',
            wf_workflow: 'Workflow',
        };
        for (var i = 0; i < COMMON_TABLES.length; i++) {
            TABLE_LABELS[COMMON_TABLES[i].name] = COMMON_TABLES[i].label;
        }

        var EMAIL_ONLY_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        var REDACT_FIELDS = { sys_created_by: true, sys_updated_by: true };

        // Sourced from the same monaco.plus.assistant.export_blocklist_tables/prefixes
        // properties the Assistant script include (sys_script_include_widget_editor_assistant.server.js)
        // reads, rendered into window.WE_ASSISTANT_CONFIG at page-load time above — a single
        // admin-configured source of truth, not a hardcoded copy that can drift out of sync.
        var EXPORT_BLOCKLISTED_TABLES = {};
        ((window.WE_ASSISTANT_CONFIG && window.WE_ASSISTANT_CONFIG.exportBlocklistTables) || '')
            .split(',')
            .forEach(function (t) {
                t = t.trim();
                if (t) EXPORT_BLOCKLISTED_TABLES[t] = true;
            });

        var EXPORT_BLOCKLISTED_PREFIXES = (
            (window.WE_ASSISTANT_CONFIG && window.WE_ASSISTANT_CONFIG.exportBlocklistPrefixes) ||
            ''
        )
            .split(',')
            .map(function (p) {
                return p.trim();
            })
            .filter(function (p) {
                return p.length > 0;
            });

        function isTableExportBlocked(table) {
            if (!table) return false;
            if (EXPORT_BLOCKLISTED_TABLES[table]) return true;
            for (var i = 0; i < EXPORT_BLOCKLISTED_PREFIXES.length; i++) {
                if (table.indexOf(EXPORT_BLOCKLISTED_PREFIXES[i]) === 0) return true;
            }
            return false;
        }

        function tableLabel(table) {
            return TABLE_LABELS[table] || table;
        }

        // Tables with their own dedicated (non-script-scan) suggestion source — excluded from the
        // generic one-layer-deep re-scan since recursing into them would trigger a different,
        // much larger suggestion mechanism (table schema refs, portal layout, catalog metadata, widget scan).
        var NON_GENERIC_SCAN_TABLES = {
            sys_db_object: true,
            sys_choice_set: true,
            sp_page: true,
            sc_cat_item_producer: true,
            sp_widget: true,
            sysevent_email_action: true,
        };

        // Per-table icon overrides; anything unlisted falls back to a generic document icon.
        var TABLE_ICONS = {
            sys_db_object: 'icon-insert-table',
            sp_widget: 'icon-script',
            sys_security_acl: 'icon-locked',
            sys_properties: 'icon-cog',
            sys_script: 'icon-list',
            sp_css: 'icon-marker',
            sp_ng_template: 'icon-layout',
            sp_angular_provider: 'icon-console',
            sys_script_fix: 'icon-script-check',
            sysauto: 'icon-date-time',
            sysevent_email_action: 'icon-mail',
            sys_script_email: 'icon-envelope-subscribe',
            sp_page: 'icon-application-generic',
            sysauto_script: 'icon-timeline',
        };
        var DEFAULT_TABLE_ICON = 'icon-document-code';

        function tableIconClass(table) {
            return TABLE_ICONS[table] || DEFAULT_TABLE_ICON;
        }

        function pad(n) {
            return n < 10 ? '0' + n : '' + n;
        }

        // Pretty-prints an XML document in place by inserting indentation text nodes
        // between element children; leaf elements (text/CDATA only) stay inline.
        function indentXmlDoc(doc, spacing) {
            spacing = spacing || '  ';
            function hasElementChild(node) {
                for (var i = 0; i < node.childNodes.length; i++) {
                    if (node.childNodes[i].nodeType === 1) return true;
                }
                return false;
            }
            function indent(node, depth) {
                if (!hasElementChild(node)) return;
                var childPad = '\n' + spacing.repeat(depth + 1);
                var closePad = '\n' + spacing.repeat(depth);
                Array.prototype.slice.call(node.childNodes).forEach(function (child) {
                    if (child.nodeType === 3 && !child.textContent.trim()) {
                        node.removeChild(child);
                    }
                });
                var children = Array.prototype.slice.call(node.childNodes);
                children.forEach(function (child) {
                    node.insertBefore(doc.createTextNode(childPad), child);
                });
                node.appendChild(doc.createTextNode(closePad));
                children.forEach(function (child) {
                    if (child.nodeType === 1) indent(child, depth + 1);
                });
            }
            indent(doc.documentElement, 0);
        }

        // Strips unsafe filename characters, collapsing whitespace to underscores.
        function safeFileNameSegment(str) {
            return String(str || '')
                .trim()
                .replace(/[\\/:*?"<>|]/g, '')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 80);
        }

        // Reflects the primary record in the URL without reloading the page.
        function updatePrimaryUrl(table, sysId) {
            try {
                var url = new URL(window.location.href);
                url.searchParams.set('record_table', table);
                url.searchParams.set('record_sys_id', sysId);
                window.history.replaceState(null, '', url.toString());

                // Skip if nested 2+ levels deep (e.g. inside the Assistant modal's iframe).
                if (window.top !== window && window.parent === window.top) {
                    var page = url.pathname.substring(1) + url.search + url.hash;
                    window.top.history.replaceState(
                        null,
                        '',
                        '/now/nav/ui/classic/params/target/' + encodeURIComponent(page)
                    );
                }
            } catch (e) {}
        }

        function clearPrimaryUrl() {
            try {
                var url = new URL(window.location.href);
                url.searchParams.delete('record_table');
                url.searchParams.delete('record_sys_id');
                window.history.replaceState(null, '', url.toString());

                if (window.top !== window && window.parent === window.top) {
                    var page = url.pathname.substring(1) + url.search + url.hash;
                    window.top.history.replaceState(
                        null,
                        '',
                        '/now/nav/ui/classic/params/target/' + encodeURIComponent(page)
                    );
                }
            } catch (e) {}
        }

        async function runPool(items, worker, concurrency) {
            var idx = 0;
            async function next() {
                while (idx < items.length) {
                    var i = idx++;
                    await worker(items[i], i);
                }
            }
            var workers = [];
            for (var i = 0; i < Math.min(concurrency, items.length); i++) {
                workers.push(next());
            }
            await Promise.all(workers);
        }

        var annotateFieldChanges = window.WE_XML_EXPORT.annotateFieldChanges;

        // Read only the record's own counter, never one from a nested schema or payload.
        function addExportModCount(el, source) {
            source = source || el;
            var count = null;
            for (var i = 0; i < source.children.length; i++) {
                if (source.children[i].tagName === 'sys_mod_count') {
                    count = source.children[i].textContent.trim();
                    break;
                }
            }
            if (count !== null && /^[0-9]+$/.test(count)) el.setAttribute('sys_mod_count', count);
            else el.setAttribute('sys_mod_count_status', 'unavailable');
        }

        function redactRecordElement(el) {
            var leaves = el.querySelectorAll('*');
            for (var i = 0; i < leaves.length; i++) {
                var node = leaves[i];
                if (node.children.length > 0) {
                    continue;
                }
                var tag = node.tagName;
                var text = (node.textContent || '').trim();
                if (REDACT_FIELDS[tag] || (text && EMAIL_ONLY_RE.test(text))) {
                    node.setAttribute('redacted', 'true');
                    node.textContent = '';
                }
            }
        }

        weAssistantApp.controller('WeAssistantCtrl', [
            '$scope',
            '$q',
            '$timeout',
            function ($scope, $q, $timeout) {
                var ctrl = this;

                var analysisQueue = [],
                    analysisRequests = Object.create(null),
                    analysisBatches = 0;
                var analysisScheduled = false,
                    analysisClosed = false;

                function ajax(action, params) {
                    if (action !== 'getSuggestedRelated' || !window.WECodeAnalysis) return request(action, params);
                    var key = params.table + ':' + params.sys_id;
                    if (analysisRequests[key]) return analysisRequests[key].promise;
                    var deferred = $q.defer();
                    var job = { params: params, deferred: deferred, promise: deferred.promise };
                    analysisRequests[key] = job;
                    analysisQueue.push(job);
                    if (!analysisScheduled) {
                        analysisScheduled = true;
                        $timeout(flushAnalysis, 0, false);
                    }
                    return deferred.promise;
                }

                async function analyseBatch(jobs) {
                    var sources = await request('getAnalysisSources', {
                        records: JSON.stringify(
                            jobs.map(function (job) {
                                return job.params;
                            })
                        ),
                    });
                    if (
                        !sources ||
                        !sources.success ||
                        !Array.isArray(sources.results) ||
                        sources.results.length !== jobs.length
                    )
                        throw new Error('Analysis sources unavailable');
                    var candidates = [],
                        positions = [];
                    await Promise.all(
                        sources.results.map(async function (result, index) {
                            if (!result.success) throw new Error(result.error || 'Analysis source unavailable');
                            if (!result.analysis) return;
                            var analysis = await window.WECodeAnalysis.analyse(result.analysis);
                            candidates.push({
                                table: jobs[index].params.table,
                                sys_id: jobs[index].params.sys_id,
                                version: result.analysis.version,
                                analysis: analysis,
                            });
                            positions.push(index);
                        })
                    );
                    if (analysisClosed) throw new Error('Assistant closed');
                    if (candidates.length) {
                        var resolved = await request('resolveAnalysis', { records: JSON.stringify(candidates) });
                        if (
                            !resolved ||
                            !resolved.success ||
                            !Array.isArray(resolved.results) ||
                            resolved.results.length !== candidates.length
                        )
                            throw new Error('Analysis resolution unavailable');
                        resolved.results.forEach(function (result, index) {
                            if (!result.success) throw new Error(result.error || 'Analysis resolution failed');
                            var source = sources.results[positions[index]],
                                seen = Object.create(null);
                            source.related = (result.replaceRelated ? [] : source.related || [])
                                .concat(result.related || [])
                                .filter(function (row) {
                                    var key = row.table + ':' + row.sys_id;
                                    if (seen[key]) return false;
                                    seen[key] = true;
                                    return true;
                                });
                        });
                    }
                    return sources.results.map(function (result) {
                        return { success: true, related: result.related };
                    });
                }

                function flushAnalysis() {
                    analysisScheduled = false;
                    while (!analysisClosed && analysisBatches < 3 && analysisQueue.length) {
                        (function (jobs) {
                            analysisBatches++;
                            $q.when(analyseBatch(jobs))
                                .then(
                                    function (results) {
                                        jobs.forEach(function (job, index) {
                                            job.deferred.resolve(results[index]);
                                        });
                                    },
                                    function () {
                                        // Keep discovery available when workers or the new endpoint cannot load.
                                        return $q.when(
                                            runPool(
                                                jobs,
                                                function (job) {
                                                    if (!analysisClosed)
                                                        return request('getSuggestedRelated', job.params).then(
                                                            job.deferred.resolve,
                                                            job.deferred.reject
                                                        );
                                                },
                                                3
                                            )
                                        );
                                    }
                                )
                                .finally(function () {
                                    jobs.forEach(function (job) {
                                        delete analysisRequests[job.params.table + ':' + job.params.sys_id];
                                    });
                                    analysisBatches--;
                                    flushAnalysis();
                                });
                        })(analysisQueue.splice(0, 10));
                    }
                }

                $scope.$on('$destroy', function () {
                    analysisClosed = true;
                    analysisQueue = [];
                    Object.keys(analysisRequests).forEach(function (key) {
                        analysisRequests[key].deferred.reject(new Error('Assistant closed'));
                    });
                });

                function request(action, params) {
                    var deferred = $q.defer();
                    var ga = new GlideAjax('WidgetEditorAssistantAjax');
                    ga.addParam('sysparm_name', action);
                    if (params) {
                        Object.keys(params).forEach(function (k) {
                            ga.addParam(k, params[k] != null ? String(params[k]) : '');
                        });
                    }
                    ga.getXML(function (response) {
                        var answer = response.responseXML.documentElement.getAttribute('answer');
                        try {
                            var parsed = JSON.parse(answer);
                            $timeout(function () {
                                deferred.resolve(parsed);
                            });
                        } catch (e) {
                            $timeout(function () {
                                deferred.reject(e);
                            });
                        }
                    });
                    return deferred.promise;
                }

                ctrl.embeddedInModal = !!(window.WE_ASSISTANT_CONFIG && window.WE_ASSISTANT_CONFIG.embedded);
                ctrl.primary = {
                    table: '',
                    sysId: '',
                    label: '',
                    tableLabel: '',
                    updatedOn: '',
                };
                ctrl.related = [];
                ctrl.updateSets = [];
                ctrl.includePreviousUpdates = false;
                ctrl.rows = [];
                ctrl.visibleRows = [];
                ctrl.viewMode = 'table';
                ctrl.graph = { nodes: [], edges: [] };
                ctrl.graphZoom = 100;
                ctrl.graphCommand = null;
                var graphCommandId = 0;
                // Relationship provenance discovered by the suggestion scanner. Kept separately
                // from rows because one record can be linked from more than one selected record.
                var recordLinks = {};
                var graphLinksScanned = {};
                var graphLinkRequests = {};
                var graphLinksGeneration = 0;
                var graphLinkScansPending = 0;
                ctrl.typeCountsList = [];
                ctrl.activeTypeFilters = {};
                var primaryRowObj = null;
                var placeholderRowObj = { placeholder: true, checked: false };
                ctrl.generating = false;
                ctrl.addingUpdateSet = false;
                ctrl.loadingInitial = !!(window.WE_ASSISTANT_CONFIG && window.WE_ASSISTANT_CONFIG.sysId);
                ctrl.progress = { done: 0, total: 0 };
                ctrl.activeSidebarTab = 'xml';
                ctrl.sidebarCollapsed = false;

                if (!ctrl.embeddedInModal) {
                    var siteTitle =
                        (window.WE_ASSISTANT_CONFIG && window.WE_ASSISTANT_CONFIG.siteTitle) || 'ServiceNow';
                    var titleTimer = null;
                    $scope.$watch(
                        function () {
                            return ctrl.primary.label;
                        },
                        function (label) {
                            var title = (label ? label + ' - ' : '') + 'Widget Editor+ Assistant - ' + siteTitle;
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
                            if (window.WE_HISTORY_SYNC) {
                                window.WE_HISTORY_SYNC.set({
                                    description: label || '',
                                    title: 'Widget Editor+ Assistant',
                                });
                            }
                        }
                    );
                }

                ctrl.selectSidebarTab = function (tab) {
                    if (ctrl.activeSidebarTab === tab && !ctrl.sidebarCollapsed) {
                        ctrl.sidebarCollapsed = true;
                    } else {
                        ctrl.activeSidebarTab = tab;
                        ctrl.sidebarCollapsed = false;
                    }
                };

                ctrl.toggleSidebar = function () {
                    ctrl.sidebarCollapsed = !ctrl.sidebarCollapsed;
                };

                ctrl.lookup = {
                    open: false,
                    mode: 'primary',
                    targetRow: null,
                    step: 'table',
                    tableQuery: '',
                    recordQuery: '',
                    commonTables: COMMON_TABLES,
                    tableResults: [],
                    tableTotal: 0,
                    tableHasMore: false,
                    tableLoading: false,
                    tableLoadingMore: false,
                    tableActiveSearch: '',
                    columns: [],
                    recordResults: [],
                    chosenTable: '',
                    tableLabel: '',
                    total: 0,
                    hasMore: false,
                    loading: false,
                    loadingMore: false,
                    recordActiveSearch: '',
                    selectingPrimary: false,
                };

                ctrl.usPicker = {
                    open: false,
                    query: '',
                    current: null,
                    results: [],
                    total: 0,
                    hasMore: false,
                    loading: false,
                    loadingMore: false,
                    activeSearch: '',
                    pending: {},
                    error: '',
                };

                // Favourite tables: persisted server-side as a user preference, not localStorage.
                ctrl.favouriteTables = [];

                function sortByLabel(list) {
                    list.sort(function (a, b) {
                        return a.label.localeCompare(b.label);
                    });
                    return list;
                }

                function saveFavouriteTables() {
                    ajax('saveFavouriteTables', {
                        favourites: JSON.stringify(ctrl.favouriteTables),
                    }).then(angular.noop, angular.noop);
                }

                function loadFavouriteTables() {
                    return ajax('getFavouriteTables', {}).then(function (res) {
                        if (res.success && angular.isArray(res.favourites)) {
                            ctrl.favouriteTables = sortByLabel(
                                res.favourites.filter(function (t) {
                                    return t && t.name && !COMMON_TABLE_NAMES[t.name] && !isTableExportBlocked(t.name);
                                })
                            );
                        }
                    }, angular.noop);
                }

                ////////////////////////////////////////////////////////////
                // Favourite groups: named bundles of records, persisted server-side.
                ////////////////////////////////////////////////////////////

                ctrl.favouriteGroups = [];
                ctrl.loadingFavourites = true;
                ctrl.manageGroup = null;
                ctrl.confirmDialog = null;

                function sortFavouriteGroups() {
                    ctrl.favouriteGroups.sort(function (a, b) {
                        return a.name.localeCompare(b.name);
                    });
                }

                function loadFavouriteGroups() {
                    ctrl.loadingFavourites = true;
                    return ajax('getFavouriteGroups', {})
                        .then(function (res) {
                            if (res.success && angular.isArray(res.groups)) {
                                ctrl.favouriteGroups = res.groups.filter(function (g) {
                                    return g && g.id && g.name && angular.isArray(g.records);
                                });
                                sortFavouriteGroups();
                            }
                        }, angular.noop)
                        .finally(function () {
                            ctrl.loadingFavourites = false;
                        });
                }

                // Strips transient UI-only fields (loading/scanning flags, resolved labels)
                // before persisting — the server only ever stores {id, name, records, created, updated}.
                function persistFavouriteGroups() {
                    var serializable = ctrl.favouriteGroups.map(function (g) {
                        return {
                            id: g.id,
                            name: g.name,
                            records: g.records.map(function (r) {
                                return { table: r.table, sys_id: r.sys_id };
                            }),
                            created: g.created,
                            updated: g.updated,
                        };
                    });
                    return ajax('saveFavouriteGroups', {
                        groups: JSON.stringify(serializable),
                    }).then(angular.noop, angular.noop);
                }

                ////////////////////////////////////////////////////////////
                // Table/Graph view mode: persisted server-side so it survives across sessions.
                ////////////////////////////////////////////////////////////

                function loadViewMode() {
                    return ajax('getViewMode', {}).then(function (res) {
                        if (res && res.success && res.viewMode === 'graph') {
                            ctrl.viewMode = 'graph';
                            rebuildGraph();
                        }
                    }, angular.noop);
                }

                function genGroupId() {
                    return 'fav_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
                }

                // Trimmed + case-insensitive, so "Foo" and " foo " are treated as the same name.
                function normalizeGroupName(name) {
                    return (name || '').trim().toLowerCase();
                }

                // True when the modal's current name collides with another group's — excludes
                // the group being edited itself, so keeping a name unchanged is never a conflict.
                ctrl.isDuplicateGroupName = function () {
                    if (!ctrl.manageGroup) return false;
                    var n = normalizeGroupName(ctrl.manageGroup.name);
                    if (!n) return false;
                    return ctrl.favouriteGroups.some(function (g) {
                        return g.id !== ctrl.manageGroup.id && normalizeGroupName(g.name) === n;
                    });
                };

                ctrl.exportFavouriteGroups = function () {
                    var payload = {
                        favourite_groups: ctrl.favouriteGroups.map(function (g) {
                            return {
                                name: g.name,
                                records: g.records.map(function (r) {
                                    return {
                                        table: r.table,
                                        sys_id: r.sys_id,
                                    };
                                }),
                                created: g.created,
                                updated: g.updated,
                            };
                        }),
                    };
                    var blob = new Blob([JSON.stringify(payload, null, 2)], {
                        type: 'application/json',
                    });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = 'widget-editor-assistant-favourites.json';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                };

                ctrl.importingFavourites = false;

                // A group with no valid records after checking against the server is skipped
                // entirely — an imported group is never created (or left) empty.
                function applyImportedFavouriteGroups(incoming) {
                    var allRecords = [];
                    incoming.forEach(function (g) {
                        ((g && g.records) || []).forEach(function (r) {
                            if (r && r.table && r.sys_id)
                                allRecords.push({
                                    table: r.table,
                                    sys_id: r.sys_id,
                                });
                        });
                    });
                    if (!allRecords.length) {
                        ctrl.importingFavourites = false;
                        return;
                    }
                    ajax('validateRecordsExist', {
                        records: JSON.stringify(allRecords),
                    })
                        .then(function (res) {
                            if (!res || !res.success) return;
                            var validKeys = {};
                            res.records.forEach(function (r) {
                                validKeys[r.table + ':' + r.sys_id] = true;
                            });

                            var now = new Date().toISOString();
                            incoming.forEach(function (g) {
                                if (!g || !g.name) return;
                                var name = g.name.trim();
                                if (!name) return;
                                var validRecords = (g.records || [])
                                    .filter(function (r) {
                                        return r && r.table && r.sys_id && validKeys[r.table + ':' + r.sys_id];
                                    })
                                    .map(function (r) {
                                        return {
                                            table: r.table,
                                            sys_id: r.sys_id,
                                        };
                                    });
                                if (!validRecords.length) return;

                                // Same name (trimmed, case-insensitive) as an existing group — overwrite it rather than duplicate.
                                var normalized = normalizeGroupName(name);
                                var existing = ctrl.favouriteGroups.filter(function (eg) {
                                    return normalizeGroupName(eg.name) === normalized;
                                })[0];
                                if (existing) {
                                    existing.records = validRecords;
                                    existing.updated = now;
                                } else {
                                    ctrl.favouriteGroups.push({
                                        id: genGroupId(),
                                        name: name,
                                        records: validRecords,
                                        created: g.created || now,
                                        updated: now,
                                    });
                                }
                            });
                            sortFavouriteGroups();
                            persistFavouriteGroups();
                        }, angular.noop)
                        .finally(function () {
                            ctrl.importingFavourites = false;
                        });
                }

                ctrl.importFavouriteGroups = function () {
                    if (ctrl.importingFavourites) return;
                    var input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'application/json,.json';
                    input.addEventListener('change', function () {
                        var file = input.files && input.files[0];
                        if (!file) return;
                        ctrl.importingFavourites = true;
                        var reader = new FileReader();
                        reader.onload = function () {
                            var parsed = null;
                            try {
                                parsed = JSON.parse(reader.result);
                            } catch (e) {}
                            var incoming =
                                parsed && angular.isArray(parsed.favourite_groups) ? parsed.favourite_groups : null;
                            $timeout(function () {
                                if (!incoming) {
                                    console.error(
                                        '[Widget Editor+ Assistant] Import failed: not a valid favourite groups JSON file.'
                                    );
                                    ctrl.importingFavourites = false;
                                    return;
                                }
                                applyImportedFavouriteGroups(incoming);
                            });
                        };
                        reader.onerror = function () {
                            $timeout(function () {
                                ctrl.importingFavourites = false;
                            });
                        };
                        reader.readAsText(file);
                    });
                    input.click();
                };

                // Table, then name — matches the main table's own sort order.
                function sortGroupRecords(records) {
                    records.sort(function (a, b) {
                        var tA = a.tableLabel || a.table || '';
                        var tB = b.tableLabel || b.table || '';
                        if (tA !== tB) return tA.localeCompare(tB);
                        return (a.label || '').localeCompare(b.label || '');
                    });
                    return records;
                }

                // Resolves live label/updatedOn for a group's stored {table, sys_id} pairs,
                // same re-validation approach as the main table's manual rows.
                function resolveGroupRecords(records) {
                    return $q.all(
                        records.map(function (r) {
                            return ajax('getRecordLabel', {
                                table: r.table,
                                sys_id: r.sys_id,
                            }).then(function (res) {
                                return {
                                    table: r.table,
                                    sys_id: r.sys_id,
                                    label: res && res.success ? res.label : r.sys_id,
                                    tableLabel: tableLabel(r.table),
                                    updatedOn: (res && res.updatedOn) || '',
                                };
                            });
                        })
                    );
                }

                ctrl.openManageGroup = function (group) {
                    if (!group) {
                        ctrl.manageGroup = {
                            id: null,
                            name: '',
                            records: [],
                            isNew: true,
                            refreshing: false,
                            saving: false,
                        };
                        return;
                    }
                    var openedId = group.id;
                    ctrl.manageGroup = {
                        id: openedId,
                        name: group.name,
                        records: [],
                        isNew: false,
                        refreshing: true,
                        saving: false,
                        created: group.created,
                    };
                    resolveGroupRecords(group.records).then(
                        function (records) {
                            // The modal may have been closed (or reopened for a different group)
                            // while this was in flight — don't clobber whatever's there now.
                            if (ctrl.manageGroup && ctrl.manageGroup.id === openedId) {
                                ctrl.manageGroup.records = sortGroupRecords(records);
                                ctrl.manageGroup.refreshing = false;
                            }
                        },
                        function () {
                            if (ctrl.manageGroup && ctrl.manageGroup.id === openedId) {
                                ctrl.manageGroup.refreshing = false;
                            }
                        }
                    );
                };

                ctrl.closeManageGroup = function () {
                    ctrl.manageGroup = null;
                };

                ctrl.onManageGroupBackdropClick = function (event) {
                    if (event.target === event.currentTarget) {
                        ctrl.closeManageGroup();
                    }
                };

                ctrl.refreshManageGroupRecords = function () {
                    if (!ctrl.manageGroup || ctrl.manageGroup.refreshing) return;
                    var openedId = ctrl.manageGroup.id;
                    ctrl.manageGroup.refreshing = true;
                    resolveGroupRecords(ctrl.manageGroup.records).then(
                        function (records) {
                            if (ctrl.manageGroup && ctrl.manageGroup.id === openedId) {
                                ctrl.manageGroup.records = sortGroupRecords(records);
                                ctrl.manageGroup.refreshing = false;
                            }
                        },
                        function () {
                            if (ctrl.manageGroup && ctrl.manageGroup.id === openedId) {
                                ctrl.manageGroup.refreshing = false;
                            }
                        }
                    );
                };

                // Scans this row's table/sys_id for further related records (same generic
                // scan used on the main table) and adds any new ones straight into the group.
                ctrl.manageGroupScanRow = function (row) {
                    if (row.scanning || !ctrl.manageGroup) return;
                    row.scanning = true;
                    ajax('getSuggestedRelated', {
                        table: row.table,
                        sys_id: row.sys_id,
                    })
                        .then(function (res) {
                            if (!res || !res.success || !res.related) return;
                            var existingKeys = {};
                            ctrl.manageGroup.records.forEach(function (r) {
                                existingKeys[r.table + ':' + r.sys_id] = true;
                            });
                            res.related.forEach(function (r) {
                                var key = r.table + ':' + r.sys_id;
                                if (existingKeys[key]) return;
                                existingKeys[key] = true;
                                ctrl.manageGroup.records.push({
                                    table: r.table,
                                    sys_id: r.sys_id,
                                    label: r.label,
                                    tableLabel: tableLabel(r.table),
                                    updatedOn: r.updatedOn,
                                });
                            });
                            sortGroupRecords(ctrl.manageGroup.records);
                        }, angular.noop)
                        .finally(function () {
                            row.scanning = false;
                        });
                };

                ctrl.manageGroupRemoveRow = function (row) {
                    if (!ctrl.manageGroup) return;
                    ctrl.manageGroup.records = ctrl.manageGroup.records.filter(function (r) {
                        return r !== row;
                    });
                };

                ctrl.addRecordToManageGroup = function () {
                    ctrl.openLookup('group');
                };

                ctrl.saveManageGroup = function () {
                    if (!ctrl.manageGroup || !ctrl.manageGroup.name || ctrl.isDuplicateGroupName()) return;

                    // Saving down to 0 records on an existing group deletes it instead —
                    // the zero-record rule prevents orphaned empty groups from persisting.
                    if (!ctrl.manageGroup.isNew && ctrl.manageGroup.records.length === 0) {
                        ctrl.favouriteGroups = ctrl.favouriteGroups.filter(function (g) {
                            return g.id !== ctrl.manageGroup.id;
                        });
                        persistFavouriteGroups();
                        ctrl.closeManageGroup();
                        return;
                    }
                    if (ctrl.manageGroup.records.length === 0) return;

                    var now = new Date().toISOString();
                    var records = ctrl.manageGroup.records.map(function (r) {
                        return {
                            table: r.table,
                            sys_id: r.sys_id,
                            label: r.label,
                            tableLabel: r.tableLabel,
                            updatedOn: r.updatedOn,
                        };
                    });
                    var name = ctrl.manageGroup.name.trim();
                    if (ctrl.manageGroup.isNew) {
                        ctrl.favouriteGroups.push({
                            id: genGroupId(),
                            name: name,
                            records: records,
                            created: now,
                            updated: now,
                        });
                    } else {
                        var existing = ctrl.favouriteGroups.filter(function (g) {
                            return g.id === ctrl.manageGroup.id;
                        })[0];
                        if (existing) {
                            existing.name = name;
                            existing.records = records;
                            existing.updated = now;
                        }
                    }
                    sortFavouriteGroups();
                    persistFavouriteGroups();
                    ctrl.closeManageGroup();
                };

                function removeFavouriteGroup(id) {
                    ctrl.favouriteGroups = ctrl.favouriteGroups.filter(function (g) {
                        return g.id !== id;
                    });
                    persistFavouriteGroups();
                }

                // Deletes immediately if the group is already empty; otherwise asks for
                // confirmation first, since deleting drops its records from favourites too.
                function requestDeleteGroup(id, name, recordCount, afterDelete) {
                    if (recordCount === 0) {
                        removeFavouriteGroup(id);
                        if (afterDelete) afterDelete();
                        return;
                    }
                    ctrl.confirmDialog = {
                        title: 'Delete "' + name + '"?',
                        message:
                            'This removes the group and its ' +
                            recordCount +
                            ' record' +
                            (recordCount === 1 ? '' : 's') +
                            ' from your favourites. This can’t be undone.',
                        confirmLabel: 'Delete Group',
                        onConfirm: function () {
                            removeFavouriteGroup(id);
                            ctrl.confirmDialog = null;
                            if (afterDelete) afterDelete();
                        },
                    };
                }

                ctrl.onConfirmBackdropClick = function (event) {
                    if (event.target === event.currentTarget) {
                        ctrl.confirmDialog = null;
                    }
                };

                ctrl.deleteManageGroup = function () {
                    if (!ctrl.manageGroup || ctrl.manageGroup.isNew) return;
                    requestDeleteGroup(
                        ctrl.manageGroup.id,
                        ctrl.manageGroup.name,
                        ctrl.manageGroup.records.length,
                        ctrl.closeManageGroup
                    );
                };

                ctrl.deleteFavouriteGroupFromSidebar = function (group) {
                    if (!group) return;
                    requestDeleteGroup(group.id, group.name, group.records.length);
                };

                // True while any of this group's records are currently in the related-records table.
                ctrl.isFavouriteGroupActive = function (group) {
                    if (!group) return false;
                    return ctrl.related.some(function (r) {
                        return r.favouriteGroupId === group.id;
                    });
                };

                // Merges a group's records into the current workspace, resolving live labels
                // for any not already present. Marked manual (not suggested) once added, and
                // tagged with the group so they can be told apart and toggled back off. Records
                // already present for another reason (primary/suggested/manual) are tagged in
                // place rather than skipped — skipping them silently was the bug that made the
                // toggle look like it did nothing: those rows never got tagged, so the group
                // could never be detected as "active" and every click just re-tried the same no-op.
                ctrl.loadFavouriteGroup = function (group) {
                    if (!group || group.loading || !group.records || !group.records.length) return;
                    group.loading = true;
                    resolveGroupRecords(group.records)
                        .then(function (records) {
                            records.forEach(function (r) {
                                var existingRow = null;
                                for (var i = 0; i < ctrl.related.length; i++) {
                                    if (ctrl.related[i].table === r.table && ctrl.related[i].sys_id === r.sys_id) {
                                        existingRow = ctrl.related[i];
                                        break;
                                    }
                                }
                                if (existingRow) {
                                    existingRow.favouriteGroupId = group.id;
                                    existingRow.favouriteGroupName = group.name;
                                    return;
                                }
                                ctrl.related.push({
                                    table: r.table,
                                    sys_id: r.sys_id,
                                    label: r.label,
                                    tableLabel: r.tableLabel,
                                    category: 'Favourite: ' + group.name,
                                    updatedOn: r.updatedOn,
                                    manual: true,
                                    suggested: false,
                                    checked: true,
                                    favouriteGroupId: group.id,
                                    favouriteGroupName: group.name,
                                    addedByFavourite: true,
                                });
                            });
                            ctrl.saveSelections();
                            rebuildRows();
                        }, angular.noop)
                        .finally(function () {
                            group.loading = false;
                        });
                };

                // Toggles a group's records in/out of the related-records table. A row that
                // only existed because this group added it is removed outright; a row that was
                // already there for another reason (primary/suggested/manual) just loses its tag.
                ctrl.toggleFavouriteGroup = function (group) {
                    if (!group || group.loading) return;
                    if (ctrl.isFavouriteGroupActive(group)) {
                        ctrl.related = ctrl.related.filter(function (r) {
                            if (r.primary || r.favouriteGroupId !== group.id) return true;
                            if (r.addedByFavourite) return false;
                            delete r.favouriteGroupId;
                            delete r.favouriteGroupName;
                            return true;
                        });
                        ctrl.saveSelections();
                        rebuildRows();
                        return;
                    }
                    ctrl.loadFavouriteGroup(group);
                };

                ctrl.tokenConfig = {
                    charsPerToken: 4,
                    ranges: [
                        { max: 15000, level: 'green', label: 'Small' },
                        { max: 150000, level: 'orange', label: 'Moderate' },
                        { max: null, level: 'red', label: 'Large' },
                    ],
                };

                function loadTokenConfig() {
                    return ajax('getTokenConfig', {}).then(function (res) {
                        if (res && res.success && angular.isArray(res.ranges)) {
                            ctrl.tokenConfig = res;
                        }
                    }, angular.noop);
                }

                ctrl.isPresetTable = function (name) {
                    return !!COMMON_TABLE_NAMES[name];
                };

                ctrl.tableIconClass = tableIconClass;

                // Update-set members are never blocked — an update set already scopes what's
                // being exported, so nothing it touches is excluded.
                ctrl.isExportBlocked = function (table, row) {
                    if (row && row.updateSetSysId) {
                        return false;
                    }
                    return isTableExportBlocked(table);
                };

                ctrl.isFavouriteTable = function (name) {
                    if (!name) return false;
                    return ctrl.favouriteTables.some(function (t) {
                        return t.name === name;
                    });
                };

                ctrl.toggleFavouriteTable = function () {
                    var name = ctrl.lookup.chosenTable;
                    if (!name || ctrl.isPresetTable(name)) return;
                    var idx = -1;
                    for (var i = 0; i < ctrl.favouriteTables.length; i++) {
                        if (ctrl.favouriteTables[i].name === name) {
                            idx = i;
                            break;
                        }
                    }
                    if (idx === -1) {
                        ctrl.favouriteTables.push({
                            name: name,
                            label: ctrl.lookup.tableLabel || tableLabel(name),
                        });
                        sortByLabel(ctrl.favouriteTables);
                    } else {
                        ctrl.favouriteTables.splice(idx, 1);
                    }
                    saveFavouriteTables();
                };

                function storageKey() {
                    return 'we_assistant_selection_' + ctrl.primary.table + '_' + ctrl.primary.sysId;
                }

                function rowKey(row) {
                    return row.table + ':' + row.sys_id;
                }

                // Graph-only aggregation: real rows remain the source for persistence and XML.
                function groupGraphChoices(rows) {
                    var groups = Object.create(null);
                    var aliases = Object.create(null);
                    var grouped = [];
                    rows.forEach(function (row) {
                        if (row.table !== 'sys_choice_set' || row.primary || !row.choiceTable) {
                            grouped.push(row);
                            return;
                        }
                        var group = groups[row.choiceTable];
                        if (!group) {
                            group = groups[row.choiceTable] = {
                                table: 'sys_choice_set',
                                sys_id: 'table:' + row.choiceTable,
                                choiceTable: row.choiceTable,
                                choiceGroup: true,
                                tableLabel: tableLabel('sys_choice_set'),
                                label: row.choiceTable,
                                members: [],
                                checked: false,
                            };
                            grouped.push(group);
                        }
                        group.members.push(row);
                        aliases[rowKey(row)] = rowKey(group);
                    });
                    Object.keys(groups).forEach(function (table) {
                        var group = groups[table];
                        var included = group.members.filter(function (row) {
                            return row.checked;
                        }).length;
                        group.checked = included === group.members.length;
                        group.partiallyChecked = included > 0 && !group.checked;
                        group.selectionLabel = included + ' / ' + group.members.length + ' fields included';
                        group.fieldNames = group.members
                            .map(function (row) {
                                return row.choiceField || row.label;
                            })
                            .sort()
                            .join(', ');
                        group.label = table;
                    });
                    return { rows: grouped, aliases: aliases };
                }

                // Builds deterministic graph topology from every record, checked or not. Unchecked
                // records and those outside the active Context XML type filter stay in place but
                // dim, so a node can be toggled back on from the graph itself.
                // The canvas directive measures full labels and performs the final pixel layout.
                function rebuildGraph() {
                    var selected = ctrl.rows.filter(function (r) {
                        return !r.placeholder && r.table && r.sys_id;
                    });
                    var choiceGroups = groupGraphChoices(selected);
                    selected = choiceGroups.rows;
                    var byKey = {};
                    selected.forEach(function (r) {
                        byKey[rowKey(r)] = r;
                    });

                    var graphEdges = [];
                    var edgeKeys = {};
                    var incoming = {};
                    var outgoing = {};
                    Object.keys(recordLinks).forEach(function (linkKey) {
                        var original = recordLinks[linkKey];
                        var link = {
                            source: choiceGroups.aliases[original.source] || original.source,
                            target: choiceGroups.aliases[original.target] || original.target,
                            label: original.label,
                        };
                        var edgeKey = link.source + '>' + link.target;
                        if (edgeKeys[edgeKey]) return;
                        edgeKeys[edgeKey] = true;
                        if (choiceGroups.aliases[original.target]) link.label = 'Choices';
                        if (!byKey[link.source] || !byKey[link.target] || link.source === link.target) return;
                        graphEdges.push(link);
                        incoming[link.target] = (incoming[link.target] || 0) + 1;
                        (outgoing[link.source] = outgoing[link.source] || []).push(link.target);
                    });

                    // Longest-path layering: a record sits one column right of its furthest parent,
                    // so every edge flows left to right. Back edges found by DFS are ignored so cycles
                    // can't push levels forever.
                    var visited = {};
                    var onStack = {};
                    var topo = [];
                    var backEdge = {};
                    function visit(key) {
                        visited[key] = true;
                        onStack[key] = true;
                        (outgoing[key] || []).forEach(function (target) {
                            if (onStack[target]) {
                                backEdge[key + '>' + target] = true;
                                return;
                            }
                            if (!visited[target]) visit(target);
                        });
                        onStack[key] = false;
                        topo.push(key);
                    }
                    selected.forEach(function (r) {
                        var key = rowKey(r);
                        if ((r.primary || !incoming[key]) && !visited[key]) visit(key);
                    });
                    selected.forEach(function (r) {
                        var key = rowKey(r);
                        if (!visited[key]) visit(key);
                    });
                    var level = {};
                    topo.reverse().forEach(function (source) {
                        if (level[source] === undefined) level[source] = 0;
                        (outgoing[source] || []).forEach(function (target) {
                            if (backEdge[source + '>' + target]) return;
                            level[target] = Math.max(level[target] || 0, level[source] + 1);
                        });
                    });

                    var columns = {};
                    selected.forEach(function (r) {
                        var l = level[rowKey(r)];
                        (columns[l] = columns[l] || []).push(r);
                    });
                    var columnKeys = Object.keys(columns)
                        .map(Number)
                        .sort(function (a, b) {
                            return a - b;
                        });
                    var nodes = [];
                    columnKeys.forEach(function (l, columnIndex) {
                        var rows = columns[l];
                        rows.sort(function (a, b) {
                            if (!!a.primary !== !!b.primary) return a.primary ? -1 : 1;
                            return String(a.label || '').localeCompare(String(b.label || ''));
                        });
                        rows.forEach(function (r, rowIndex) {
                            nodes.push({
                                key: rowKey(r),
                                table: r.table,
                                sysId: r.sys_id,
                                tableLabel: r.tableLabel || tableLabel(r.table) || r.table,
                                fullLabel: r.label || r.sys_id,
                                primary: !!r.primary,
                                suggested: !!r.suggested,
                                blocked: r.choiceGroup
                                    ? r.members.every(function (member) {
                                          return ctrl.isExportBlocked(member.table, member);
                                      })
                                    : ctrl.isExportBlocked(r.table, r),
                                // Match the visible pill semantics: "New" is only meaningful/shown
                                // while previous versions are included; Deleted is always shown.
                                isNew: !!ctrl.includePreviousUpdates && !!r.isNewInUpdateSet,
                                isDeleted: r.updateSetAction === 'DELETE',
                                includePreviousUpdates: !!ctrl.includePreviousUpdates,
                                checked: !!r.checked,
                                dimmed: (!r.checked && !r.partiallyChecked) || !rowMatchesActiveFilter(r),
                                embeddedPrimary: !!(r.primary && ctrl.embeddedInModal),
                                column: columnIndex,
                                order: rowIndex,
                                row: r,
                            });
                        });
                    });

                    var edges = graphEdges.map(function (link) {
                        return {
                            key: link.source + '>' + link.target,
                            source: link.source,
                            target: link.target,
                            label: link.label,
                        };
                    });
                    ctrl.graph = { nodes: nodes, edges: edges };
                }

                ctrl.setViewMode = function (mode) {
                    ctrl.viewMode = mode === 'graph' ? 'graph' : 'table';
                    if (ctrl.viewMode === 'graph') rebuildGraph();
                    ajax('saveViewMode', { viewMode: ctrl.viewMode }).then(angular.noop, angular.noop);
                };

                ctrl.graphCanvasCommand = function (action) {
                    ctrl.graphCommand = {
                        action: action,
                        id: ++graphCommandId,
                    };
                };

                var _prevTableChecked = {};
                function deselectChoicesForTable(tableRow) {
                    if (!tableRow || tableRow.table !== 'sys_db_object') return;
                    var tableKey = rowKey(tableRow);
                    // Only choice tables reached through record links count; the display label is
                    // not a table name and can collide across tables.
                    var tableNames = {};

                    var linkedChoiceKeys = {};
                    if (typeof recordLinks !== 'undefined' && recordLinks) {
                        Object.keys(recordLinks).forEach(function (linkKey) {
                            var link = recordLinks[linkKey];
                            if (
                                link &&
                                link.source === tableKey &&
                                link.target &&
                                link.target.indexOf('sys_choice_set:') === 0
                            ) {
                                linkedChoiceKeys[link.target] = true;
                            }
                        });
                    }

                    var allRows = (typeof ctrl !== 'undefined' && (ctrl.rows || ctrl.related)) || [];
                    allRows.forEach(function (r) {
                        if (r.table === 'sys_choice_set' && linkedChoiceKeys[rowKey(r)]) {
                            if (r.choiceTable) tableNames[String(r.choiceTable).toLowerCase()] = true;
                        }
                    });

                    allRows.forEach(function (r) {
                        if (r.table === 'sys_choice_set') {
                            var key = rowKey(r);
                            var matchesName = r.choiceTable && tableNames[String(r.choiceTable).toLowerCase()];
                            if (linkedChoiceKeys[key] || matchesName) {
                                r.checked = false;
                            }
                        }
                    });
                }
                ctrl.deselectChoicesForTable = deselectChoicesForTable;

                // Clicking a graph node — same rules as the table checkbox, and the table
                // reflects the change immediately since both bind to row.checked.
                ctrl.toggleGraphRecord = function (row) {
                    if (!row || row.primary) return;
                    if (row.choiceGroup) {
                        var include = !row.members.every(function (member) {
                            return member.checked;
                        });
                        row.members.forEach(function (member) {
                            if (!ctrl.isExportBlocked(member.table, member)) member.checked = include;
                        });
                    } else {
                        if (ctrl.isExportBlocked(row.table, row)) return;
                        row.checked = !row.checked;
                        if (row.table === 'sys_db_object' && !row.checked) {
                            deselectChoicesForTable(row);
                        }
                    }
                    ctrl.onSelectionChange(row);
                };

                ctrl.openGraphRecord = function (row) {
                    if (!row || (row.primary && ctrl.embeddedInModal)) return;
                    window.open(
                        '/nav_to.do?uri=' + encodeURIComponent(row.table + '.do?sys_id=' + row.sys_id),
                        '_blank',
                        'noopener,noreferrer'
                    );
                };

                async function fetchExportRecordXml(row) {
                    var pending = fetchExportRecordXml.pending || (fetchExportRecordXml.pending = new Map());
                    var key = row.table + ':' + row.sys_id;
                    if (pending.has(key)) return pending.get(key);
                    var promise = loadExportRecordXml(row).finally(function () {
                        pending.delete(key);
                    });
                    pending.set(key, promise);
                    return promise;
                }

                async function loadExportRecordXml(row) {
                    var response = await fetch(
                        '/' + row.table + '.do?sys_id=' + encodeURIComponent(row.sys_id) + '&XML',
                        { credentials: 'same-origin' }
                    );
                    var text = await response.text();
                    if (row.table !== 'sys_choice_set') return text;
                    var parsed = new DOMParser().parseFromString(text, 'text/xml');
                    var set = parsed.documentElement.querySelector('sys_choice_set');
                    if (!set) throw new Error('Choice Set export unavailable');
                    var values = parsed.createElement('choice_values');
                    set.appendChild(values);
                    try {
                        var result = await ajax('getChoiceSetValues', {
                            sys_id: row.sys_id,
                        });
                        if (!result || !result.success) {
                            values.setAttribute('status', 'unavailable');
                        } else {
                            values.setAttribute('table', result.name);
                            values.setAttribute('field', result.element);
                            (result.choices || []).forEach(function (choice) {
                                var el = parsed.createElement('choice');
                                [
                                    'sys_id',
                                    'value',
                                    'label',
                                    'language',
                                    'inactive',
                                    'dependent_value',
                                    'sequence',
                                    'hint',
                                ].forEach(function (key) {
                                    if (choice[key] !== null && choice[key] !== undefined)
                                        el.setAttribute(key, choice[key]);
                                });
                                values.appendChild(el);
                            });
                        }
                    } catch (e) {
                        values.setAttribute('status', 'unavailable');
                    }
                    return new XMLSerializer().serializeToString(parsed);
                }

                // Exported XML/SCHEMA byte size per row, keyed by rowKey — drives the real token estimate.
                ctrl.rowSizeBytes = {};
                var _sizeFetchInFlight = {};

                function _fetchRowSize(row) {
                    var key = rowKey(row);
                    var p;
                    if (row.table === 'sys_db_object') {
                        // A single-field server lookup instead of a full record export, just to
                        // resolve which table's SCHEMA to fetch (the export path needs the full
                        // record anyway, for sys_mod_count, so it resolves this separately).
                        p = ajax('resolveTableName', {
                            sys_id: row.sys_id,
                        }).then(function (res) {
                            var targetTable = (res && res.success && res.name) || row.label;
                            if (!targetTable) return 0;
                            return fetch('/' + encodeURIComponent(targetTable) + '.do?SCHEMA', {
                                credentials: 'same-origin',
                            })
                                .then(function (r) {
                                    return r.text();
                                })
                                .then(function (text) {
                                    return new Blob([text]).size;
                                });
                        });
                    } else {
                        p = fetchExportRecordXml(row).then(function (text) {
                            return new Blob([text]).size;
                        });
                    }
                    return p
                        .then(
                            function (size) {
                                ctrl.rowSizeBytes[key] = size || 0;
                            },
                            function () {
                                ctrl.rowSizeBytes[key] = 0;
                            }
                        )
                        .finally(function () {
                            delete _sizeFetchInFlight[key];
                            $timeout(angular.noop);
                        });
                }

                // Scoped to visibleRows + checked — the same scope rawTokenCount() reads from —
                // so a row hidden by the active type filter, or unchecked, isn't exported just to
                // measure a size nothing currently uses.
                function ensureRowSizesLoaded() {
                    var pending = ctrl.visibleRows.filter(function (r) {
                        if (r.placeholder || !r.sys_id || !r.table || !r.checked) return false;
                        var key = rowKey(r);
                        return !ctrl.rowSizeBytes.hasOwnProperty(key) && !_sizeFetchInFlight[key];
                    });
                    pending.forEach(function (r) {
                        _sizeFetchInFlight[rowKey(r)] = true;
                    });
                    if (pending.length) {
                        runPool(pending, _fetchRowSize, 8);
                    }
                }

                // Suggested rows the user explicitly removed, so a refresh doesn't re-add them.
                var dismissedSuggestionKeys = {};

                // Records already scanned for further references this session (one-layer-deep re-scan), to avoid re-fetching or looping on cycles.
                var _scannedScriptKeys = {};
                var _suggestScanDepth = 0;

                function loadDismissedSuggestions() {
                    dismissedSuggestionKeys = {};
                    _scannedScriptKeys = {};
                    try {
                        var stored = JSON.parse(localStorage.getItem(storageKey()) || 'null');
                        ((stored && stored.dismissedSuggestions) || []).forEach(function (k) {
                            dismissedSuggestionKeys[k] = true;
                        });
                    } catch (e) {}
                }

                function recomputeTypeCounts() {
                    var map = {};
                    for (var j = 0; j < ctrl.rows.length; j++) {
                        var r = ctrl.rows[j];
                        if (r.placeholder || !r.sys_id || !r.table) continue;
                        var lbl = r.tableLabel || tableLabel(r.table) || r.table;
                        if (!map[lbl]) {
                            map[lbl] = {
                                label: lbl,
                                selectedCount: 0,
                                totalCount: 0,
                            };
                        }
                        map[lbl].totalCount++;
                        if (r.checked) {
                            map[lbl].selectedCount++;
                        }
                    }
                    var typeCountsList = [];
                    Object.keys(map).forEach(function (k) {
                        typeCountsList.push(map[k]);
                    });
                    typeCountsList.sort(function (a, b) {
                        return a.label.localeCompare(b.label);
                    });
                    ctrl.typeCountsList = typeCountsList;

                    // Drop filters for types that no longer have any rows.
                    for (var lbl in ctrl.activeTypeFilters) {
                        if (ctrl.activeTypeFilters.hasOwnProperty(lbl) && !map[lbl]) {
                            delete ctrl.activeTypeFilters[lbl];
                        }
                    }
                }

                // True when no type filter is active, or when this row's type is one of the
                // active ones. tableLabel is set synchronously on every row (even ones whose
                // display label is still resolving), so this is safe to use before a row has
                // made it into ctrl.rows/visibleRows.
                function rowMatchesActiveFilter(r) {
                    if (r.placeholder || r.primary) return true;
                    var activeLabels = Object.keys(ctrl.activeTypeFilters).filter(function (lbl) {
                        return ctrl.activeTypeFilters[lbl];
                    });
                    if (activeLabels.length === 0) return true;
                    var lbl = r.tableLabel || tableLabel(r.table) || r.table;
                    return !!ctrl.activeTypeFilters[lbl];
                }

                // Rows shown to the user AND the scope for selection, export, and token totals: when a
                // type filter is active only matching types (plus the primary row) are included.
                function recomputeVisibleRows() {
                    ctrl.visibleRows = ctrl.rows.filter(rowMatchesActiveFilter);
                    if (ctrl.viewMode === 'graph') rebuildGraph();
                }

                ctrl.toggleTypeFilter = function (label) {
                    ctrl.activeTypeFilters[label] = !ctrl.activeTypeFilters[label];
                    if (!ctrl.activeTypeFilters[label]) {
                        delete ctrl.activeTypeFilters[label];
                    }
                    recomputeVisibleRows();
                    ensureEstimatesForVisible();
                };

                // Reuses existing row objects across calls so ng-repeat's watch settles; also resets the progress bar.
                function rebuildRows(pinnedAtEndRow) {
                    ctrl.progress = { done: 0, total: 0 };
                    var rows = [];
                    if (ctrl.primary.sysId && ctrl.primary.table) {
                        if (!primaryRowObj) primaryRowObj = {};
                        angular.extend(primaryRowObj, {
                            table: ctrl.primary.table,
                            sys_id: ctrl.primary.sysId,
                            label: ctrl.primary.label || '',
                            tableLabel: ctrl.primary.tableLabel || tableLabel(ctrl.primary.table),
                            updatedOn: ctrl.primary.updatedOn || '',
                            primary: true,
                            suggested: false,
                            manual: false,
                            placeholder: false,
                            checked: true,
                        });
                        rows.push(primaryRowObj);
                    } else if (!ctrl.loadingInitial && ctrl.related.length === 0) {
                        // Once there are already related rows (e.g. from an added update set), the big
                        // "choose a primary" prompt would just sit awkwardly among real data — a primary
                        // is optional at that point.
                        rows.push(placeholderRowObj);
                    }

                    var nonPrimary = ctrl.related.filter(function (r) {
                        return !r.primary && r.sys_id && r.table && r.label;
                    });
                    if (pinnedAtEndRow && pinnedAtEndRow.sys_id && pinnedAtEndRow.label) {
                        var rest = nonPrimary.filter(function (r) {
                            return r !== pinnedAtEndRow;
                        });
                        rest.sort(function (a, b) {
                            var tA = a.tableLabel || a.table || '';
                            var tB = b.tableLabel || b.table || '';
                            if (tA !== tB) return tA.localeCompare(tB);
                            return (a.label || '').localeCompare(b.label || '');
                        });
                        for (var i = 0; i < rest.length; i++) {
                            rows.push(rest[i]);
                        }
                        rows.push(pinnedAtEndRow);
                    } else {
                        nonPrimary.sort(function (a, b) {
                            var tA = a.tableLabel || a.table || '';
                            var tB = b.tableLabel || b.table || '';
                            if (tA !== tB) return tA.localeCompare(tB);
                            return (a.label || '').localeCompare(b.label || '');
                        });
                        for (var j = 0; j < nonPrimary.length; j++) {
                            rows.push(nonPrimary[j]);
                        }
                    }

                    ctrl.rows = rows;
                    (ctrl.rows || []).forEach(function (r) {
                        if (r.table === 'sys_db_object') {
                            _prevTableChecked[rowKey(r)] = !!r.checked;
                        }
                    });
                    recomputeTypeCounts();
                    recomputeVisibleRows();
                    ensureRowSizesLoaded();
                }
                rebuildRows();

                ctrl.totalRowCount = function () {
                    return ctrl.visibleRows.filter(function (r) {
                        return !r.placeholder;
                    }).length;
                };

                // Scoped to visibleRows: when a type filter is active, hidden types count toward
                // neither selection, export, nor the token estimate below.
                ctrl.selectedCount = function () {
                    return ctrl.visibleRows.filter(function (r) {
                        return r.checked && !r.placeholder;
                    }).length;
                };

                ctrl.rawTokenCount = function () {
                    var charsPerToken = (ctrl.tokenConfig && ctrl.tokenConfig.charsPerToken) || 4;
                    var bytes = 0;
                    for (var i = 0; i < ctrl.visibleRows.length; i++) {
                        var r = ctrl.visibleRows[i];
                        if (r.placeholder || !r.checked) continue;
                        bytes += ctrl.rowSizeBytes[rowKey(r)] || 0;
                        // Include Previous Updates adds a previous_version payload per update-set row to the export.
                        if (ctrl.includePreviousUpdates && r.updateSetSysId) {
                            bytes += r.previousVersionBytes || 0;
                        }
                    }
                    return Math.round(bytes / charsPerToken);
                };

                // True while any checked, visible row's export size hasn't been measured yet — including
                // the previous-version payload size, once Include Previous Updates makes that relevant.
                ctrl.sizesPending = function () {
                    for (var i = 0; i < ctrl.visibleRows.length; i++) {
                        var r = ctrl.visibleRows[i];
                        if (r.placeholder || !r.checked) continue;
                        if (!ctrl.rowSizeBytes.hasOwnProperty(rowKey(r))) return true;
                        if (
                            ctrl.includePreviousUpdates &&
                            r.updateSetSysId &&
                            !r.hasOwnProperty('previousVersionBytes')
                        )
                            return true;
                    }
                    return false;
                };

                // Fraction (0-1) of the same checked+visible measurements sizesPending() waits on
                // that have actually landed — drives the loading wheel's fill while it's pending.
                ctrl.tokenLoadFraction = function () {
                    var total = 0,
                        done = 0;
                    for (var i = 0; i < ctrl.visibleRows.length; i++) {
                        var r = ctrl.visibleRows[i];
                        if (r.placeholder || !r.checked) continue;
                        total++;
                        if (ctrl.rowSizeBytes.hasOwnProperty(rowKey(r))) done++;
                        if (ctrl.includePreviousUpdates && r.updateSetSysId) {
                            total++;
                            if (r.hasOwnProperty('previousVersionBytes')) done++;
                        }
                    }
                    return total === 0 ? 1 : done / total;
                };

                ctrl.estimatedTokens = function () {
                    var count = ctrl.rawTokenCount();
                    if (count === 0) return '0';
                    if (count > 100000) {
                        return Math.round(count / 1000) + 'K';
                    }
                    return String(count);
                };

                ctrl.tokenLevelInfo = function () {
                    if (ctrl.sizesPending() || ctrl.previousVersionsCalculating()) {
                        return { level: 'none', label: '' };
                    }
                    var count = ctrl.rawTokenCount();
                    if (count === 0) {
                        return { level: 'none', label: '' };
                    }
                    var ranges = (ctrl.tokenConfig && ctrl.tokenConfig.ranges) || [
                        { max: 15000, level: 'green', label: 'Small' },
                        { max: 150000, level: 'orange', label: 'Moderate' },
                        { max: null, level: 'red', label: 'Large' },
                    ];
                    for (var i = 0; i < ranges.length; i++) {
                        var r = ranges[i];
                        if (r.max === null || r.max === undefined || count <= r.max) {
                            return r;
                        }
                    }
                    return (
                        ranges[ranges.length - 1] || {
                            level: 'red',
                            label: 'Large',
                        }
                    );
                };

                ctrl.tokenCardClass = function () {
                    var info = ctrl.tokenLevelInfo();
                    return info.level ? 'we-token-' + info.level : '';
                };

                ctrl.isAllSelected = function () {
                    var rows = ctrl.visibleRows.filter(function (r) {
                        return !r.placeholder;
                    });
                    if (rows.length === 0) return false;
                    return rows.every(function (r) {
                        return r.checked;
                    });
                };

                // Only (de)selects rows matching the active type filter, so a filter can be used
                // to bulk-select just that slice without disturbing hidden rows' checked state.
                // Scoped to ctrl.related (not just ctrl.rows/visibleRows) so a row whose display
                // label hasn't resolved yet — e.g. a manual row just restored from localStorage —
                // still gets included; tableLabel, which the filter test uses, is already set.
                ctrl.toggleSelectAll = function () {
                    var target = !ctrl.isAllSelected();
                    ctrl.related.forEach(function (r) {
                        if (!r.primary && rowMatchesActiveFilter(r)) {
                            r.checked = target;
                        }
                    });
                    ctrl.saveSelections();
                    recomputeTypeCounts();
                    ensureEstimatesForVisible();
                    if (ctrl.viewMode === 'graph') rebuildGraph();
                };

                ctrl.onSelectionChange = function () {
                    var changedRow = arguments[0];
                    if (changedRow && changedRow.table === 'sys_db_object' && !changedRow.checked) {
                        deselectChoicesForTable(changedRow);
                    }
                    var allRows = ctrl.rows || ctrl.related || [];
                    allRows.forEach(function (r) {
                        if (r.table === 'sys_db_object') {
                            var k = rowKey(r);
                            if (_prevTableChecked[k] === true && !r.checked) {
                                deselectChoicesForTable(r);
                            }
                            _prevTableChecked[k] = !!r.checked;
                        }
                    });
                    ctrl.saveSelections();
                    recomputeTypeCounts();
                    ensureEstimatesForVisible();
                    if (ctrl.viewMode === 'graph') rebuildGraph();
                };

                ctrl.updateSetRecordCount = function (us) {
                    return ctrl.related.filter(function (r) {
                        return r.updateSetSysId === us.sys_id;
                    }).length;
                };

                ctrl.isUpdateSetChecked = function (us) {
                    var rows = ctrl.related.filter(function (r) {
                        return r.updateSetSysId === us.sys_id;
                    });
                    if (rows.length === 0) return false;
                    return rows.every(function (r) {
                        return r.checked;
                    });
                };

                // Bulk-(de)selects every record from one update set at once, without touching rows from other sources.
                ctrl.toggleUpdateSetChecked = function (us) {
                    var target = !ctrl.isUpdateSetChecked(us);
                    ctrl.related.forEach(function (r) {
                        if (r.updateSetSysId === us.sys_id) {
                            r.checked = target;
                        }
                    });
                    ctrl.saveSelections();
                    recomputeTypeCounts();
                    ensureEstimatesForVisible();
                    if (ctrl.viewMode === 'graph') rebuildGraph();
                };

                ctrl.removeRow = function (row) {
                    if (row.suggested) {
                        dismissedSuggestionKeys[rowKey(row)] = true;
                    }
                    ctrl.related = ctrl.related.filter(function (r) {
                        return r !== row;
                    });
                    // Drop the update set's own summary row too once its last member row is gone.
                    if (row.updateSetSysId) {
                        ctrl.updateSets = ctrl.updateSets.filter(function (u) {
                            return u.sys_id !== row.updateSetSysId || ctrl.updateSetRecordCount(u) > 0;
                        });
                    }
                    ctrl.saveSelections();
                    rebuildRows();
                };

                // Re-runs the same table-driven scan used at load time, but scoped to this one row,
                // so users can pull in further related records without refreshing the whole bundle.
                ctrl.scanRow = function (row) {
                    if (row.scanning) return;
                    row.scanning = true;
                    loadSuggested(row.table, row.sys_id, 0)
                        .then(function () {
                            ctrl.saveSelections();
                            rebuildRows();
                        })
                        .finally(function () {
                            row.scanning = false;
                        });
                };

                // Refreshes every row's name/updated-on and re-scans the primary for suggestions.
                ctrl.refreshingAll = false;
                ctrl.refreshAll = function () {
                    if (!ctrl.primary.sysId || ctrl.refreshingAll) return;
                    ctrl.refreshingAll = true;
                    // Refresh re-adds any recommended records the user previously removed.
                    dismissedSuggestionKeys = {};
                    // Content may have changed since the last measurement.
                    ctrl.rowSizeBytes = {};
                    ctrl.saveSelections();
                    ajax('getRecordLabel', {
                        table: ctrl.primary.table,
                        sys_id: ctrl.primary.sysId,
                    })
                        .then(function (res) {
                            if (res.success) {
                                ctrl.primary.label = res.label;
                                ctrl.primary.updatedOn = res.updatedOn;
                            }
                            return loadPrimaryContext();
                        })
                        .then(
                            function () {
                                ctrl.refreshingAll = false;
                            },
                            function () {
                                ctrl.refreshingAll = false;
                            }
                        );
                };

                // Wipes the whole bundle back to an empty state: primary, related records, and update
                // sets. In embedded mode the primary comes from the host page, not this session, so it's
                // left alone — only the related/update-set data this session added gets cleared.
                ctrl.clearAll = function () {
                    var clearPrimary = !!ctrl.primary.sysId && !ctrl.embeddedInModal;
                    if (!clearPrimary && ctrl.related.length === 0 && ctrl.updateSets.length === 0) return;

                    if (clearPrimary) {
                        ctrl.primary = {
                            table: '',
                            sysId: '',
                            label: '',
                            tableLabel: '',
                            updatedOn: '',
                        };
                        clearPrimaryUrl();
                    }
                    ctrl.related = [];
                    ctrl.updateSets = [];
                    recordLinks = {};
                    graphLinksScanned = {};
                    graphLinkRequests = {};
                    graphLinksGeneration++;
                    ctrl.includePreviousUpdates = false;
                    dismissedSuggestionKeys = {};
                    _scannedScriptKeys = {};
                    ctrl.rowSizeBytes = {};
                    ctrl.activeTypeFilters = {};
                    ctrl.saveSelections();
                    rebuildRows();
                };

                ctrl.progressPct = function () {
                    if (!ctrl.progress.total) return 0;
                    return Math.round((ctrl.progress.done / ctrl.progress.total) * 100);
                };

                // localStorage remembers only table+sys_id and checked state, never name/updated-on —
                // except for DELETE-action update-set members, whose label is persisted since the
                // underlying record is gone and can never be freshly re-resolved on reload.
                ctrl.saveSelections = function () {
                    try {
                        var manual = ctrl.related
                            .filter(function (r) {
                                return r.manual;
                            })
                            .map(function (r) {
                                return { table: r.table, sys_id: r.sys_id };
                            });
                        var updateSetMembers = ctrl.related
                            .filter(function (r) {
                                return r.updateSetSysId;
                            })
                            .map(function (r) {
                                return {
                                    table: r.table,
                                    sys_id: r.sys_id,
                                    label: r.updateSetAction === 'DELETE' ? r.label || '' : '',
                                    updateSetSysId: r.updateSetSysId,
                                    updateSetName: r.updateSetName,
                                    updateSetAction: r.updateSetAction,
                                    updateSetMemberCreatedOnValue: r.updateSetMemberCreatedOnValue,
                                };
                            });
                        var checked = {};
                        for (var i = 0; i < ctrl.related.length; i++) {
                            var r = ctrl.related[i];
                            if (!r.primary) {
                                checked[rowKey(r)] = r.checked;
                            }
                        }
                        var dismissedSuggestions = Object.keys(dismissedSuggestionKeys);
                        localStorage.setItem(
                            storageKey(),
                            JSON.stringify({
                                checked: checked,
                                dismissedSuggestions: dismissedSuggestions,
                                includePreviousUpdates: ctrl.includePreviousUpdates,
                                manual: manual,
                                updateSetMembers: updateSetMembers,
                                updateSets: ctrl.updateSets,
                            })
                        );
                    } catch (e) {}
                };

                function loadStoredSelections() {
                    var stored = null;
                    try {
                        stored = JSON.parse(localStorage.getItem(storageKey()) || 'null');
                    } catch (e) {}
                    if (!stored) {
                        return $q.resolve();
                    }

                    var existingKeys = new Set(ctrl.related.map(rowKey));
                    var manualRows = (stored.manual || []).filter(function (r) {
                        return r && r.table && r.sys_id && !existingKeys.has(r.table + ':' + r.sys_id);
                    });
                    for (var i = 0; i < manualRows.length; i++) {
                        var r = manualRows[i];
                        ctrl.related.push({
                            table: r.table,
                            sys_id: r.sys_id,
                            label: '',
                            tableLabel: tableLabel(r.table),
                            category: 'Manual',
                            manual: true,
                            suggested: false,
                            checked: true,
                        });
                        existingKeys.add(r.table + ':' + r.sys_id);
                    }

                    ctrl.updateSets = stored.updateSets || [];
                    ctrl.includePreviousUpdates = !!stored.includePreviousUpdates;
                    var updateSetMemberRows = (stored.updateSetMembers || []).filter(function (r) {
                        return r && r.table && r.sys_id && !existingKeys.has(r.table + ':' + r.sys_id);
                    });
                    var restoredUpdateSetRows = [];
                    for (var k = 0; k < updateSetMemberRows.length; k++) {
                        var m = updateSetMemberRows[k];
                        var row = {
                            table: m.table,
                            sys_id: m.sys_id,
                            label: m.updateSetAction === 'DELETE' ? m.label || '' : '',
                            tableLabel: tableLabel(m.table),
                            category: 'Update Set',
                            manual: false,
                            suggested: false,
                            checked: true,
                            updateSetSysId: m.updateSetSysId,
                            updateSetName: m.updateSetName,
                            updateSetAction: m.updateSetAction,
                            updateSetMemberCreatedOnValue: m.updateSetMemberCreatedOnValue,
                        };
                        ctrl.related.push(row);
                        restoredUpdateSetRows.push(row);
                        existingKeys.add(m.table + ':' + m.sys_id);
                    }

                    var checked = stored.checked || {};
                    for (var j = 0; j < ctrl.related.length; j++) {
                        var row2 = ctrl.related[j];
                        if (row2.primary) continue;
                        var key = rowKey(row2);
                        if (Object.prototype.hasOwnProperty.call(checked, key)) {
                            row2.checked = !!checked[key];
                        }
                    }

                    return validateRowsNeedingLabel(function (r) {
                        return (r.manual || r.updateSetSysId) && r.updateSetAction !== 'DELETE';
                    }).then(function () {
                        if (ctrl.includePreviousUpdates && restoredUpdateSetRows.length) {
                            return refreshPreviousVersions(restoredUpdateSetRows);
                        }
                    });
                }

                // Re-resolves label/tableLabel/updatedOn for rows added by sys_id alone (manual adds,
                // update-set members) — anything matched by predicate — dropping any that no longer
                // resolve (e.g. the record was deleted since it was added).
                function validateRowsNeedingLabel(predicate) {
                    var rows = ctrl.related.filter(predicate);
                    if (rows.length === 0) {
                        return $q.resolve();
                    }
                    return $q
                        .all(
                            rows.map(function (r) {
                                if (!r.table || !r.sys_id) {
                                    ctrl.related = ctrl.related.filter(function (x) {
                                        return x !== r;
                                    });
                                    return $q.resolve();
                                }
                                // Update-set members are never export-blocklisted — the update set already
                                // scopes what's being exported, so unblock label resolution for those rows.
                                var params = {
                                    table: r.table,
                                    sys_id: r.sys_id,
                                };
                                if (r.updateSetSysId) {
                                    params.unblocked = 'true';
                                }
                                return ajax('getRecordLabel', params).then(
                                    function (res) {
                                        if (!res || !res.success || !res.label) {
                                            ctrl.related = ctrl.related.filter(function (x) {
                                                return x !== r;
                                            });
                                        } else {
                                            r.label = res.label;
                                            r.updatedOn = res.updatedOn || '';
                                            r.tableLabel = res.tableLabel || tableLabel(r.table);
                                            r.choiceTable = res.choiceTable;
                                            r.choiceField = res.choiceField;
                                        }
                                    },
                                    function () {
                                        ctrl.related = ctrl.related.filter(function (x) {
                                            return x !== r;
                                        });
                                    }
                                );
                            })
                        )
                        .then(function () {
                            ctrl.related = ctrl.related.filter(function (r) {
                                return r.primary || (r.sys_id && r.table && r.label);
                            });
                        });
                }

                ctrl.scanningSuggested = false;
                ctrl.discoveringLinks = false;

                // Update-set and manually selected records do not go through the suggestion
                // scanner. Look up their outgoing references for graph edges only; never add
                // the returned records to the bundle. Keep links to currently absent targets
                // so a later update set can reveal the edge without rescanning its source.
                function discoverGraphLinks(rows, force) {
                    var sources = (rows || []).filter(function (row) {
                        if (!row.table || !row.sys_id || row.updateSetAction === 'DELETE') return false;
                        var key = rowKey(row);
                        if (!force && graphLinksScanned[key]) return false;
                        graphLinksScanned[key] = true;
                        return true;
                    });
                    if (!sources.length) return Promise.resolve();
                    graphLinkScansPending++;
                    ctrl.discoveringLinks = true;
                    var generation = graphLinksGeneration;
                    return runPool(
                        sources,
                        function (row) {
                            var sourceKey = rowKey(row);
                            var requestId = (graphLinkRequests[sourceKey] || 0) + 1;
                            graphLinkRequests[sourceKey] = requestId;
                            return ajax('getSuggestedRelated', {
                                table: row.table,
                                sys_id: row.sys_id,
                            }).then(
                                function (res) {
                                    if (
                                        generation !== graphLinksGeneration ||
                                        requestId !== graphLinkRequests[sourceKey]
                                    )
                                        return;
                                    if (!res || !res.success) {
                                        delete graphLinksScanned[sourceKey];
                                        return;
                                    }
                                    Object.keys(recordLinks).forEach(function (key) {
                                        if (recordLinks[key].source === sourceKey) delete recordLinks[key];
                                    });
                                    (res.related || []).forEach(function (target) {
                                        var targetKey = target.table + ':' + target.sys_id;
                                        if (!target.table || !target.sys_id || targetKey === sourceKey) return;
                                        recordLinks[sourceKey + '>' + targetKey] = {
                                            source: sourceKey,
                                            target: targetKey,
                                            label: target.category || 'Related',
                                        };
                                    });
                                },
                                function () {
                                    if (
                                        generation === graphLinksGeneration &&
                                        requestId === graphLinkRequests[sourceKey]
                                    ) {
                                        delete graphLinksScanned[sourceKey];
                                    }
                                }
                            );
                        },
                        6
                    ).finally(function () {
                        graphLinkScansPending--;
                        ctrl.discoveringLinks = graphLinkScansPending > 0;
                        $timeout(function () {
                            if (ctrl.viewMode === 'graph') rebuildGraph();
                        });
                    });
                }

                // Scans table/sysId for suggestions; recurses into any newly-added Script Include or
                // Business Rule so references inside those get suggested too. Always resolves so a
                // failed fetch can't stall the rest of loadPrimaryContext.
                function loadSuggested(table, sysId, depth) {
                    table = table || ctrl.primary.table;
                    sysId = sysId || ctrl.primary.sysId;
                    depth = depth || 0;
                    var sourceKey = table + ':' + sysId;
                    _scannedScriptKeys[sourceKey] = true;

                    _suggestScanDepth++;
                    ctrl.scanningSuggested = true;
                    return ajax('getSuggestedRelated', {
                        table: table,
                        sys_id: sysId,
                    })
                        .then(
                            function (res) {
                                if (!res || !res.success || !res.related) {
                                    if (res && res.error) {
                                        console.error(
                                            '[Widget Editor+ Assistant] getSuggestedRelated failed:',
                                            res.error
                                        );
                                    }
                                    return;
                                }
                                var existingKeys = new Set(ctrl.related.map(rowKey));
                                var toExpand = [];
                                graphLinksScanned[sourceKey] = true;
                                for (var i = 0; i < res.related.length; i++) {
                                    var row = res.related[i];
                                    var key = rowKey(row);
                                    recordLinks[sourceKey + '>' + key] = {
                                        source: sourceKey,
                                        target: key,
                                        label: row.category || 'Related',
                                    };
                                    if (existingKeys.has(key) || dismissedSuggestionKeys[key]) continue;
                                    existingKeys.add(key);
                                    ctrl.related.push({
                                        table: row.table,
                                        sys_id: row.sys_id,
                                        label: row.label,
                                        tableLabel: tableLabel(row.table),
                                        choiceTable: row.choiceTable,
                                        choiceField: row.choiceField,
                                        category: row.category,
                                        updatedOn: row.updatedOn,
                                        manual: false,
                                        suggested: true,
                                        checked: row.table !== 'sys_choice_set',
                                    });
                                    // Only expand one extra layer deep — items found at that layer aren't scanned further.
                                    if (
                                        depth === 0 &&
                                        !NON_GENERIC_SCAN_TABLES[row.table] &&
                                        !_scannedScriptKeys[key]
                                    ) {
                                        _scannedScriptKeys[key] = true;
                                        toExpand.push(row);
                                    }
                                }
                                if (!toExpand.length) return;
                                return $q.all(
                                    toExpand.map(function (row) {
                                        return loadSuggested(row.table, row.sys_id, depth + 1);
                                    })
                                );
                            },
                            function (err) {
                                console.error('[Widget Editor+ Assistant] getSuggestedRelated request failed:', err);
                            }
                        )
                        .finally(function () {
                            _suggestScanDepth--;
                            ctrl.scanningSuggested = _suggestScanDepth > 0;
                        });
                }

                function loadPrimaryContext() {
                    loadDismissedSuggestions();
                    recordLinks = {};
                    graphLinksScanned = {};
                    graphLinkRequests = {};
                    graphLinksGeneration++;
                    ctrl.related = [
                        {
                            table: ctrl.primary.table,
                            sys_id: ctrl.primary.sysId,
                            label: ctrl.primary.label,
                            tableLabel: ctrl.primary.tableLabel,
                            category: 'Primary record',
                            updatedOn: ctrl.primary.updatedOn,
                            manual: false,
                            primary: true,
                            suggested: false,
                            checked: true,
                        },
                    ];
                    rebuildRows();
                    return loadSuggested()
                        .then(loadStoredSelections)
                        .then(function () {
                            rebuildRows();
                            discoverGraphLinks(ctrl.related);
                        });
                }

                // Lookup Modal methods
                function resetLookupResults() {
                    ctrl.lookup.tableQuery = '';
                    ctrl.lookup.tableResults = [];
                    ctrl.lookup.tableTotal = 0;
                    ctrl.lookup.tableHasMore = false;
                    ctrl.lookup.tableLoading = false;
                    ctrl.lookup.tableLoadingMore = false;
                    ctrl.lookup.tableActiveSearch = '';
                    ctrl.lookup.recordQuery = '';
                    ctrl.lookup.recordResults = [];
                    ctrl.lookup.columns = [];
                    ctrl.lookup.total = 0;
                    ctrl.lookup.hasMore = false;
                    ctrl.lookup.recordActiveSearch = '';
                }

                ctrl.openLookup = function (mode) {
                    // A bundle can't mix a primary record with an update set.
                    if (mode === 'primary' && (ctrl.embeddedInModal || ctrl.updateSets.length)) return;
                    ctrl.lookup.open = true;
                    ctrl.lookup.mode = mode;
                    ctrl.lookup.targetRow = null;
                    ctrl.lookup.step = 'table';
                    ctrl.lookup.selectingPrimary = false;
                    resetLookupResults();
                };

                ctrl.openLookupForRow = function (row, step) {
                    if (row.primary && ctrl.embeddedInModal) return;
                    ctrl.lookup.open = true;
                    ctrl.lookup.mode = row.primary ? 'primary' : 'edit';
                    ctrl.lookup.targetRow = row;
                    ctrl.lookup.chosenTable = row.table;
                    ctrl.lookup.tableLabel = row.tableLabel || tableLabel(row.table);
                    ctrl.lookup.step = step;
                    ctrl.lookup.selectingPrimary = false;
                    resetLookupResults();
                    if (step === 'record') {
                        loadRecords('', false);
                    }
                };

                ctrl.closeLookup = function () {
                    ctrl.lookup.open = false;
                };

                ctrl.onModalBackdropClick = function (event) {
                    if (event.target === event.currentTarget) {
                        ctrl.closeLookup();
                    }
                };

                // Table search (step 1): offset-based lazy loading via scroll, $timeout-debounced.
                var _tableRequestId = 0;
                function loadTables(query, isMore) {
                    if (!query) {
                        ctrl.lookup.tableResults = [];
                        ctrl.lookup.tableTotal = 0;
                        ctrl.lookup.tableHasMore = false;
                        ctrl.lookup.tableLoading = false;
                        ctrl.lookup.tableLoadingMore = false;
                        return;
                    }
                    if (isMore) {
                        ctrl.lookup.tableLoadingMore = true;
                    } else {
                        ctrl.lookup.tableLoading = true;
                        ctrl.lookup.tableResults = [];
                    }
                    var requestId = ++_tableRequestId;
                    var offset = isMore ? ctrl.lookup.tableResults.length : 0;

                    ajax('searchTables', { query: query, offset: offset }).then(
                        function (res) {
                            if (requestId !== _tableRequestId) return;
                            ctrl.lookup.tableActiveSearch = query;
                            if (res.success) {
                                var found = (res.tables || []).filter(function (t) {
                                    return !COMMON_TABLE_NAMES[t.name];
                                });
                                ctrl.lookup.tableTotal = res.total || 0;
                                ctrl.lookup.tableHasMore = !!res.hasMore;
                                ctrl.lookup.tableResults = isMore ? ctrl.lookup.tableResults.concat(found) : found;
                            }
                            ctrl.lookup.tableLoading = false;
                            ctrl.lookup.tableLoadingMore = false;
                        },
                        function () {
                            if (requestId === _tableRequestId) {
                                ctrl.lookup.tableLoading = false;
                                ctrl.lookup.tableLoadingMore = false;
                            }
                        }
                    );
                }

                var _tableSearchDebounce;
                ctrl.onTableQueryChange = function () {
                    ctrl.lookup.tableLoading = true;
                    $timeout.cancel(_tableSearchDebounce);
                    _tableSearchDebounce = $timeout(function () {
                        loadTables(ctrl.lookup.tableQuery, false);
                    }, 250);
                };

                ctrl.loadMoreTables = function () {
                    if (ctrl.lookup.tableLoading || ctrl.lookup.tableLoadingMore || !ctrl.lookup.tableHasMore) return;
                    loadTables(ctrl.lookup.tableQuery, true);
                };

                var _recordRequestId = 0;
                // Keep selected records visible in add mode so the picker can show which
                // records have already been added while more are selected.
                function filterOutSelectedRecords(records) {
                    if (ctrl.lookup.mode === 'add') return records;
                    var excludeSysId = ctrl.lookup.targetRow ? ctrl.lookup.targetRow.sys_id : null;
                    var selected = {};
                    for (var i = 0; i < ctrl.related.length; i++) {
                        var r = ctrl.related[i];
                        if (r.table === ctrl.lookup.chosenTable && r.sys_id !== excludeSysId) {
                            selected[r.sys_id] = true;
                        }
                    }
                    return records.filter(function (rec) {
                        return !selected[rec.sys_id];
                    });
                }

                ctrl.isRecordSelected = function (record) {
                    return (
                        (ctrl.primary.table === ctrl.lookup.chosenTable && ctrl.primary.sysId === record.sys_id) ||
                        ctrl.related.some(function (row) {
                            return row.table === ctrl.lookup.chosenTable && row.sys_id === record.sys_id;
                        })
                    );
                };

                function removePrimaryFromPicker() {
                    if (ctrl.embeddedInModal) return;
                    ctrl.primary = {
                        table: '',
                        sysId: '',
                        label: '',
                        tableLabel: '',
                        updatedOn: '',
                    };
                    clearPrimaryUrl();
                    ctrl.related = ctrl.related.filter(function (row) {
                        return row.manual || row.updateSetSysId;
                    });
                    var retainedKeys = new Set(ctrl.related.map(rowKey));
                    Object.keys(recordLinks).forEach(function (key) {
                        var link = recordLinks[key];
                        if (!retainedKeys.has(link.source) || !retainedKeys.has(link.target)) delete recordLinks[key];
                    });
                    graphLinksScanned = {};
                    graphLinkRequests = {};
                    graphLinksGeneration++;
                    dismissedSuggestionKeys = {};
                    _scannedScriptKeys = {};
                    ctrl.saveSelections();
                    rebuildRows();
                    // Restart pending scans invalidated above while keeping known links visible.
                    discoverGraphLinks(ctrl.related);
                }

                function loadRecords(query, isMore) {
                    if (isMore) {
                        ctrl.lookup.loadingMore = true;
                    } else {
                        ctrl.lookup.loading = true;
                        ctrl.lookup.recordResults = [];
                    }
                    var requestId = ++_recordRequestId;
                    var offset = isMore ? ctrl.lookup.recordResults.length : 0;

                    return ajax('searchRecords', {
                        table: ctrl.lookup.chosenTable,
                        query: query || '',
                        offset: offset,
                    }).then(
                        function (res) {
                            if (requestId !== _recordRequestId) return;
                            ctrl.lookup.recordActiveSearch = query || '';
                            if (res.success) {
                                ctrl.lookup.columns = res.columns || [];
                                ctrl.lookup.total = res.total || 0;
                                ctrl.lookup.hasMore = res.hasMore;
                                var records = filterOutSelectedRecords(res.records || []);
                                if (isMore) {
                                    ctrl.lookup.recordResults = ctrl.lookup.recordResults.concat(records);
                                } else {
                                    ctrl.lookup.recordResults = records;
                                }
                            }
                            ctrl.lookup.loading = false;
                            ctrl.lookup.loadingMore = false;
                        },
                        function () {
                            if (requestId === _recordRequestId) {
                                ctrl.lookup.loading = false;
                                ctrl.lookup.loadingMore = false;
                            }
                        }
                    );
                }

                ctrl.loadMoreRecords = function () {
                    if (ctrl.lookup.loading || ctrl.lookup.loadingMore || !ctrl.lookup.hasMore) return;
                    loadRecords(ctrl.lookup.recordQuery, true);
                };

                var _recordSearchDebounce;
                ctrl.onRecordQueryChange = function () {
                    ctrl.lookup.loading = true;
                    $timeout.cancel(_recordSearchDebounce);
                    _recordSearchDebounce = $timeout(function () {
                        loadRecords(ctrl.lookup.recordQuery, false);
                    }, 250);
                };

                // Keyboard nav for picker lists: Up/Down moves focus, Enter selects.
                function focusFirstItem(listEl) {
                    var first = listEl && listEl.querySelector('.we-picker-item');
                    if (first && first.focus) {
                        first.focus();
                        if (typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'nearest' });
                    }
                }

                function focusLastItem(listEl) {
                    var items = listEl ? listEl.querySelectorAll('.we-picker-item') : null;
                    if (!items || !items.length) return;
                    var last = items[items.length - 1];
                    if (last && last.focus) {
                        last.focus();
                        if (typeof last.scrollIntoView === 'function') last.scrollIntoView({ block: 'nearest' });
                    }
                }

                function onListSearchKeydown(event, listSelector, onEnterFirst) {
                    var key = event && event.key;
                    if (key === 'ArrowDown') {
                        event.preventDefault();
                        focusFirstItem(document.querySelector(listSelector));
                    } else if (key === 'ArrowUp') {
                        event.preventDefault();
                        focusLastItem(document.querySelector(listSelector));
                    } else if (key === 'Enter' && typeof onEnterFirst === 'function') {
                        event.preventDefault();
                        onEnterFirst();
                    }
                }

                function onListItemKeydown(event, onSelect) {
                    var key = event && event.key;
                    if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
                        event.preventDefault();
                        if (typeof onSelect === 'function') onSelect();
                        return;
                    }
                    if (key !== 'ArrowDown' && key !== 'ArrowUp') return;
                    event.preventDefault();
                    var el = event.currentTarget;
                    var list = el && el.parentElement;
                    if (!list) return;
                    var items = list.querySelectorAll('.we-picker-item');
                    if (!items.length) return;
                    var idx = Array.prototype.indexOf.call(items, el);
                    var nextIdx;
                    if (key === 'ArrowDown') {
                        if (idx === items.length - 1) return;
                        nextIdx = idx + 1;
                    } else {
                        if (idx === 0) return;
                        nextIdx = idx - 1;
                    }
                    var nextItem = items[nextIdx];
                    if (nextItem && nextItem.focus) {
                        nextItem.focus();
                        if (typeof nextItem.scrollIntoView === 'function')
                            nextItem.scrollIntoView({ block: 'nearest' });
                    }
                }

                ctrl.onTableSearchKeydown = function (event) {
                    onListSearchKeydown(event, '.we-picker-col-main .we-picker-item', function () {
                        if (ctrl.lookup.tableResults.length) ctrl.chooseTable(ctrl.lookup.tableResults[0]);
                    });
                };

                ctrl.onRecordSearchKeydown = function (event) {
                    onListSearchKeydown(event, '.we-picker-col-main .we-picker-item', function () {
                        if (ctrl.lookup.recordResults.length) ctrl.chooseRecord(ctrl.lookup.recordResults[0]);
                    });
                };

                ctrl.onTableItemKeydown = function (event, t) {
                    onListItemKeydown(event, function () {
                        ctrl.chooseTable(t);
                    });
                };

                ctrl.onRecordItemKeydown = function (event, r) {
                    onListItemKeydown(event, function () {
                        ctrl.chooseRecord(r);
                    });
                };

                ctrl.chooseTable = function (t) {
                    ctrl.lookup.chosenTable = t.name;
                    ctrl.lookup.tableLabel = t.label;
                    ctrl.lookup.step = 'record';
                    ctrl.lookup.recordQuery = '';
                    loadRecords('', false);
                };

                ctrl.recordSecondaryText = function (r) {
                    var parts = [];
                    for (var i = 1; i < ctrl.lookup.columns.length; i++) {
                        var field = ctrl.lookup.columns[i].field;
                        var val = r.values[field] || r[field];
                        if (val) {
                            parts.push(val);
                        }
                    }
                    return parts.join(' · ');
                };

                ctrl.chooseRecord = function (r) {
                    if (ctrl.lookup.selectingPrimary) return;
                    if (ctrl.lookup.mode === 'primary') {
                        var replacingPrimary = !!ctrl.primary.sysId;
                        ctrl.primary = {
                            table: ctrl.lookup.chosenTable,
                            sysId: r.sys_id,
                            label: r.label,
                            tableLabel: ctrl.lookup.tableLabel,
                            updatedOn: r.updatedOn,
                        };
                        updatePrimaryUrl(ctrl.primary.table, ctrl.primary.sysId);
                        if (replacingPrimary) {
                            ctrl.closeLookup();
                            loadPrimaryContext();
                        } else {
                            // The initial selection becomes the primary; later selections in
                            // this same picker add related records from the chosen table.
                            ctrl.lookup.mode = 'add';
                            ctrl.lookup.selectingPrimary = true;
                            loadPrimaryContext().finally(function () {
                                ctrl.lookup.selectingPrimary = false;
                            });
                        }
                        return;
                    }

                    if (ctrl.lookup.mode === 'edit' && ctrl.lookup.targetRow) {
                        ctrl.lookup.targetRow.table = ctrl.lookup.chosenTable;
                        ctrl.lookup.targetRow.tableLabel = ctrl.lookup.tableLabel;
                        ctrl.lookup.targetRow.sys_id = r.sys_id;
                        ctrl.lookup.targetRow.label = r.label;
                        ctrl.lookup.targetRow.updatedOn = r.updatedOn;
                        ctrl.lookup.targetRow.choiceTable = r.choiceTable;
                        ctrl.lookup.targetRow.choiceField = r.choiceField;
                        ctrl.saveSelections();
                        ctrl.closeLookup();
                        rebuildRows();
                        return;
                    }

                    if (ctrl.lookup.mode === 'group' && ctrl.manageGroup) {
                        var groupExists = ctrl.manageGroup.records.some(function (row) {
                            return row.table === ctrl.lookup.chosenTable && row.sys_id === r.sys_id;
                        });
                        if (!groupExists) {
                            ctrl.manageGroup.records.push({
                                table: ctrl.lookup.chosenTable,
                                sys_id: r.sys_id,
                                label: r.label,
                                tableLabel: ctrl.lookup.tableLabel,
                                updatedOn: r.updatedOn,
                            });
                            sortGroupRecords(ctrl.manageGroup.records);
                        }
                        ctrl.closeLookup();
                        return;
                    }

                    // Add mode
                    if (ctrl.primary.table === ctrl.lookup.chosenTable && ctrl.primary.sysId === r.sys_id) {
                        removePrimaryFromPicker();
                        return;
                    }
                    var existing = ctrl.related.filter(function (row) {
                        return row.table === ctrl.lookup.chosenTable && row.sys_id === r.sys_id;
                    })[0];
                    if (existing) {
                        ctrl.removeRow(existing);
                        return;
                    }
                    var newRecord = {
                        table: ctrl.lookup.chosenTable,
                        sys_id: r.sys_id,
                        label: r.label,
                        tableLabel: ctrl.lookup.tableLabel,
                        category: 'Manual',
                        choiceTable: r.choiceTable,
                        choiceField: r.choiceField,
                        updatedOn: r.updatedOn,
                        manual: true,
                        suggested: false,
                        checked: true,
                    };
                    ctrl.related.push(newRecord);
                    ctrl.saveSelections();
                    rebuildRows();
                    discoverGraphLinks([newRecord]);
                };

                ////////////////////////////////////////////////////////////
                // Update Set Picker
                ////////////////////////////////////////////////////////////

                ctrl.openUpdateSetPicker = function () {
                    // A bundle can't mix a primary record with an update set.
                    if (ctrl.primary.sysId) return;
                    ctrl.usPicker.open = true;
                    ctrl.usPicker.query = '';
                    ctrl.usPicker.current = null;
                    ctrl.usPicker.results = [];
                    ctrl.usPicker.total = 0;
                    ctrl.usPicker.hasMore = false;
                    ctrl.usPicker.activeSearch = '';
                    ctrl.usPicker.error = '';
                    loadUpdateSets('', false);
                };

                ctrl.closeUpdateSetPicker = function () {
                    ctrl.usPicker.open = false;
                };

                ctrl.onUpdateSetBackdropClick = function (event) {
                    if (event.target === event.currentTarget) {
                        ctrl.closeUpdateSetPicker();
                    }
                };

                var _updateSetRequestId = 0;
                function loadUpdateSets(query, isMore) {
                    if (isMore) {
                        ctrl.usPicker.loadingMore = true;
                    } else {
                        ctrl.usPicker.loading = true;
                        ctrl.usPicker.results = [];
                    }
                    var requestId = ++_updateSetRequestId;
                    var offset = isMore ? ctrl.usPicker.results.length : 0;

                    return ajax('searchUpdateSets', {
                        query: query || '',
                        offset: offset,
                    }).then(
                        function (res) {
                            if (requestId !== _updateSetRequestId) return;
                            ctrl.usPicker.activeSearch = query || '';
                            if (res.success) {
                                if (!isMore) ctrl.usPicker.current = res.current || null;
                                ctrl.usPicker.total = res.total || 0;
                                ctrl.usPicker.hasMore = !!res.hasMore;
                                var results = res.updateSets || [];
                                ctrl.usPicker.results = isMore ? ctrl.usPicker.results.concat(results) : results;
                            }
                            ctrl.usPicker.loading = false;
                            ctrl.usPicker.loadingMore = false;
                        },
                        function () {
                            if (requestId === _updateSetRequestId) {
                                ctrl.usPicker.loading = false;
                                ctrl.usPicker.loadingMore = false;
                            }
                        }
                    );
                }

                var _updateSetSearchDebounce;
                ctrl.onUpdateSetQueryChange = function () {
                    ctrl.usPicker.loading = true;
                    $timeout.cancel(_updateSetSearchDebounce);
                    _updateSetSearchDebounce = $timeout(function () {
                        loadUpdateSets(ctrl.usPicker.query, false);
                    }, 250);
                };

                ctrl.loadMoreUpdateSets = function () {
                    if (ctrl.usPicker.loading || ctrl.usPicker.loadingMore || !ctrl.usPicker.hasMore) return;
                    loadUpdateSets(ctrl.usPicker.query, true);
                };

                ctrl.onUpdateSetSearchKeydown = function (event) {
                    onListSearchKeydown(event, '.we-picker-col-main .we-picker-item', function () {
                        if (ctrl.usPicker.current) {
                            ctrl.chooseUpdateSet(ctrl.usPicker.current);
                        } else if (ctrl.usPicker.results.length) {
                            ctrl.chooseUpdateSet(ctrl.usPicker.results[0]);
                        }
                    });
                };

                ctrl.onUpdateSetItemKeydown = function (event, us) {
                    onListItemKeydown(event, function () {
                        ctrl.chooseUpdateSet(us);
                    });
                };

                ctrl.isUpdateSetSelected = function (us) {
                    return (
                        !!us &&
                        ctrl.updateSets.some(function (selected) {
                            return selected.sys_id === us.sys_id;
                        })
                    );
                };

                // Adds every record touched by an update set. Existing rows (already added, or the
                // primary) are left untouched rather than duplicated or re-tagged.
                // Pushes a related row for each member not already present (by table+sys_id) or
                // matching the primary. Shared by chooseUpdateSet (first add) and refreshUpdateSet
                // (re-add after removing the set's existing rows).
                function addUpdateSetMembers(us, members) {
                    var addedRows = [];
                    (members || []).forEach(function (m) {
                        var isPrimary = ctrl.primary.table === m.table && ctrl.primary.sysId === m.sys_id;
                        var existing = ctrl.related.filter(function (r) {
                            return r.table === m.table && r.sys_id === m.sys_id;
                        })[0];
                        if (isPrimary || existing) return;
                        var row = {
                            table: m.table,
                            sys_id: m.sys_id,
                            label: m.label,
                            tableLabel: m.tableLabel,
                            category: 'Update Set',
                            updatedOn: m.updatedOn,
                            manual: false,
                            suggested: false,
                            checked: true,
                            updateSetSysId: us.sys_id,
                            updateSetName: us.name,
                            updateSetAction: m.action,
                            updateSetMemberCreatedOnValue: m.sysCreatedOnValue,
                        };
                        ctrl.related.push(row);
                        addedRows.push(row);
                    });
                    return addedRows;
                }

                ctrl.chooseUpdateSet = function (us) {
                    if (!us || ctrl.usPicker.pending[us.sys_id]) return;
                    if (ctrl.isUpdateSetSelected(us)) {
                        ctrl.removeUpdateSet(us);
                        return;
                    }
                    ctrl.usPicker.pending[us.sys_id] = true;
                    ctrl.usPicker.error = '';
                    ctrl.addingUpdateSet = true;
                    ajax('getUpdateSetMembers', { update_set: us.sys_id }).then(
                        function (res) {
                            delete ctrl.usPicker.pending[us.sys_id];
                            ctrl.addingUpdateSet = Object.keys(ctrl.usPicker.pending).length > 0;
                            if (!res || !res.success) {
                                ctrl.usPicker.error = 'Could not add ' + us.name + '. Please try again.';
                                return;
                            }

                            if (
                                !ctrl.updateSets.some(function (u) {
                                    return u.sys_id === us.sys_id;
                                })
                            ) {
                                ctrl.updateSets.push({
                                    sys_id: us.sys_id,
                                    name: us.name,
                                    state: us.state,
                                    description: us.description,
                                    updatedOn: us.updatedOn,
                                });
                            }

                            var addedRows = addUpdateSetMembers(us, res.members);

                            ctrl.saveSelections();
                            rebuildRows();
                            discoverGraphLinks(ctrl.related);
                            if (ctrl.includePreviousUpdates && addedRows.length) {
                                refreshPreviousVersions(addedRows);
                            }
                        },
                        function () {
                            delete ctrl.usPicker.pending[us.sys_id];
                            ctrl.addingUpdateSet = Object.keys(ctrl.usPicker.pending).length > 0;
                            ctrl.usPicker.error = 'Could not add ' + us.name + '. Please try again.';
                        }
                    );
                };

                ctrl.removeUpdateSet = function (us) {
                    ctrl.updateSets = ctrl.updateSets.filter(function (u) {
                        return u.sys_id !== us.sys_id;
                    });
                    ctrl.related = ctrl.related.filter(function (r) {
                        return r.updateSetSysId !== us.sys_id;
                    });
                    ctrl.saveSelections();
                    rebuildRows();
                };

                // Drops every row this update set added and re-fetches/re-adds its current member
                // list from scratch, so records added or removed from the set since it was applied
                // (and refreshed labels/dates) are reflected.
                ctrl.refreshingUpdateSets = {};
                ctrl.refreshUpdateSet = function (us) {
                    if (ctrl.refreshingUpdateSets[us.sys_id]) return;
                    ctrl.refreshingUpdateSets[us.sys_id] = true;
                    ajax('getUpdateSetMembers', { update_set: us.sys_id }).then(
                        function (res) {
                            ctrl.refreshingUpdateSets[us.sys_id] = false;
                            if (!res || !res.success) return;

                            ctrl.related = ctrl.related.filter(function (r) {
                                return r.updateSetSysId !== us.sys_id;
                            });
                            var addedRows = addUpdateSetMembers(us, res.members);

                            ctrl.saveSelections();
                            rebuildRows();
                            discoverGraphLinks(addedRows, true);
                            if (ctrl.includePreviousUpdates && addedRows.length) {
                                refreshPreviousVersions(addedRows);
                            }
                        },
                        function () {
                            ctrl.refreshingUpdateSets[us.sys_id] = false;
                        }
                    );
                };

                // Looks up, per row, the latest recorded version of that record before it was touched
                // by its update set — used both to render the "New" pill and to populate the export's
                // previous_version content.
                // Counter (not a bool) since a toggle-on refresh and a newly-added update set's refresh
                // can overlap — the token estimate should keep showing "calculating" until both finish.
                var _pendingPreviousVersionFetches = 0;
                ctrl.previousVersionsCalculating = function () {
                    return _pendingPreviousVersionFetches > 0;
                };

                async function refreshPreviousVersions(rows) {
                    // Skip rows already measured — toggling Include Previous Updates off then on
                    // shouldn't re-fetch previous-version XML the row object already has cached.
                    var targets = rows.filter(function (r) {
                        return r.updateSetSysId && !r.hasOwnProperty('previousVersionBytes');
                    });
                    if (!targets.length) return;
                    _pendingPreviousVersionFetches++;
                    $timeout(angular.noop);
                    await runPool(
                        targets,
                        async function (row) {
                            try {
                                var res = await ajax('getPreviousUpdateXml', {
                                    table: row.table,
                                    sys_id: row.sys_id,
                                    before: row.updateSetMemberCreatedOnValue || '',
                                });
                                if (!res || !res.success) {
                                    row.previousVersionBytes = 0;
                                    return;
                                }
                                row.isNewInUpdateSet = !res.found;
                                row.previousVersion = res.found
                                    ? {
                                          payload: res.payload,
                                          action: res.action,
                                          updateSetSysId: res.updateSetSysId,
                                          updateSetName: res.updateSetName,
                                          updatedOn: res.updatedOn,
                                      }
                                    : null;
                                // Cached once here (not recomputed per digest) since it feeds the token estimate.
                                row.previousVersionBytes = res.found ? new Blob([res.payload || '']).size : 0;
                            } catch (e) {
                                // Fall back to 0 so a failed lookup doesn't leave sizesPending() stuck true forever.
                                row.previousVersionBytes = 0;
                            }
                            $timeout(angular.noop);
                        },
                        8
                    );
                    _pendingPreviousVersionFetches--;
                    $timeout(function () {
                        // Previous-version pills are canvas overlay metadata; refresh the graph as
                        // soon as the async lookups populate isNewInUpdateSet/previousVersion.
                        if (ctrl.viewMode === 'graph') rebuildGraph();
                    });
                }

                // Fetches previous-version sizes only for rows actually contributing to the token
                // estimate right now — checked AND passing the active type filter. A row hidden by
                // the filter, or unchecked, is skipped until it becomes visible/checked again.
                function ensurePreviousVersionsForVisible() {
                    if (!ctrl.includePreviousUpdates) return;
                    var targets = ctrl.visibleRows.filter(function (r) {
                        return r.checked && r.updateSetSysId;
                    });
                    if (targets.length) refreshPreviousVersions(targets);
                }

                // Both estimate inputs share the same scope (checked rows passing the active type
                // filter) and the same "only fetch what's missing" guard — call together whenever
                // selection or filter state changes.
                function ensureEstimatesForVisible() {
                    ensureRowSizesLoaded();
                    ensurePreviousVersionsForVisible();
                }

                ctrl.toggleIncludePreviousUpdates = function () {
                    ctrl.saveSelections();
                    // Reflect the toggle immediately (including removing cached pills when switched
                    // off); the async refresh above rebuilds again when newly-fetched metadata lands.
                    if (ctrl.viewMode === 'graph') rebuildGraph();
                    ensurePreviousVersionsForVisible();
                };

                ctrl.generateXml = async function () {
                    // Scoped to visibleRows: an active type filter excludes hidden types from the export.
                    var selected = ctrl.visibleRows.filter(function (r) {
                        return r.checked;
                    });
                    if (selected.length === 0) {
                        return;
                    }
                    ctrl.generating = true;
                    ctrl.progress = { done: 0, total: selected.length };

                    // Resolve every selected row, including records deleted since they were selected.
                    var exportUrls = {};
                    var exportEs12 = {};
                    await runPool(
                        selected,
                        async function (row) {
                            var key = row.table + ':' + row.sys_id;
                            try {
                                var result = await ajax('getExportRecordUrl', {
                                    table: row.table,
                                    sys_id: row.sys_id,
                                    deleted: row.updateSetAction === 'DELETE' ? 'true' : 'false',
                                });
                                exportUrls[key] = result && result.success ? result.url || '' : '';
                                exportEs12[key] =
                                    result && result.success ? result.es12Override || 'unavailable' : 'unavailable';
                            } catch (e) {
                                exportUrls[key] = '';
                            }
                        },
                        8
                    );
                    function addRecordUrl(el, row, payload) {
                        if (payload) {
                            addExportModCount(el);
                            return;
                        }
                        // Record URLs and runtime context live once on the uniform record wrapper.
                        el.setAttribute(
                            'es12_override_at_export',
                            exportEs12[row.table + ':' + row.sys_id] || 'unavailable'
                        );
                        var url = exportUrls[row.table + ':' + row.sys_id];
                        if (url) el.setAttribute('record_url', url);
                        else el.setAttribute('record_url_status', 'unavailable');
                    }

                    var combinedDoc = document.implementation.createDocument(null, 'context_bundle', null);
                    combinedDoc.documentElement.setAttribute('format_version', '3');
                    var notes = combinedDoc.createElement('format_notes');
                    notes.textContent =
                        'Compare previous to current raw field values; added/removed means snapshot presence. A field with no change attribute could not be compared — redacted, structured, or the whole record is missing on one side (see its status/change_type). sys_mod_count is a per-record saved update counter, not a global version; unsaved edits do not increment it. ES12 is the current server-side override at export/load, not historical or client-side mode; not_found/unavailable may inherit application defaults. Record URLs identify platform records, not historical versions. Every payload has a record wrapper identified by table:sys_id, containing current_version and optionally previous_version. context_manifest contains relationship elements whose source and target refer to wrapper IDs; record names, roles, inclusion reasons, and blocked status live on the wrappers. The graph contains discovered relationships between exported records only; it is not a complete dependency inventory. previous_version update_set_name and update_set_sys_id identify the historical snapshot’s update set, which may differ from the selected update set.';
                    combinedDoc.documentElement.appendChild(notes);

                    // Update set metadata up front — a reader needs to know
                    // which sets are involved before the per-record update_set_name attributes below mean anything.
                    if (ctrl.updateSets.length) {
                        var updateSetsEl = combinedDoc.createElement('update_sets');
                        ctrl.updateSets.forEach(function (us) {
                            var usEl = combinedDoc.createElement('update_set');
                            usEl.setAttribute('sys_id', us.sys_id);
                            usEl.setAttribute(
                                'record_url',
                                window.location.origin +
                                    '/nav_to.do?uri=' +
                                    encodeURIComponent('sys_update_set.do?sys_id=' + us.sys_id)
                            );
                            usEl.setAttribute('name', us.name);
                            if (us.state) usEl.setAttribute('state', us.state);
                            if (us.description) usEl.setAttribute('description', us.description);
                            updateSetsEl.appendChild(usEl);
                        });
                        combinedDoc.documentElement.appendChild(updateSetsEl);
                    }

                    // Export discovery links directly: canvas layout may omit cycles or hidden nodes.
                    var graphEl = combinedDoc.createElement('context_manifest');
                    var exportedKeys = Object.create(null);
                    selected.forEach(function (row) {
                        exportedKeys[rowKey(row)] = true;
                    });
                    Object.keys(recordLinks)
                        .sort()
                        .forEach(function (key) {
                            var link = recordLinks[key];
                            if (!exportedKeys[link.source] || !exportedKeys[link.target]) return;
                            var relationshipEl = combinedDoc.createElement('relationship');
                            relationshipEl.setAttribute('source', link.source);
                            relationshipEl.setAttribute('target', link.target);
                            relationshipEl.setAttribute('label', link.label || 'Related');
                            graphEl.appendChild(relationshipEl);
                        });
                    combinedDoc.documentElement.appendChild(graphEl);

                    var primaryContainer = combinedDoc.createElement('primary_record');
                    var relatedContainer = combinedDoc.createElement('related_records');
                    combinedDoc.documentElement.appendChild(primaryContainer);
                    combinedDoc.documentElement.appendChild(relatedContainer);

                    await runPool(
                        selected,
                        async function (row) {
                            var targetContainer = row.primary ? primaryContainer : relatedContainer;
                            // All records share one envelope, whether or not history was requested.
                            var showsVersions = !!row.updateSetSysId && ctrl.includePreviousUpdates;
                            var wrapperEl = combinedDoc.createElement('record');
                            wrapperEl.setAttribute('id', rowKey(row));
                            wrapperEl.setAttribute('table', row.table);
                            wrapperEl.setAttribute('table_label', row.tableLabel || tableLabel(row.table));
                            wrapperEl.setAttribute('sys_id', row.sys_id);
                            wrapperEl.setAttribute('name', row.label || row.sys_id);
                            wrapperEl.setAttribute('role', row.primary ? 'primary' : 'related');
                            if (row.suggested && row.category) {
                                wrapperEl.setAttribute('reason', row.category);
                            }
                            if (!row.updateSetSysId && isTableExportBlocked(row.table)) {
                                wrapperEl.setAttribute('blocked', 'true');
                            }
                            addRecordUrl(wrapperEl, row);
                            if (row.updateSetSysId) {
                                wrapperEl.setAttribute('update_set_sys_id', row.updateSetSysId);
                                wrapperEl.setAttribute('update_set_name', row.updateSetName || '');
                                wrapperEl.setAttribute('update_set_action', row.updateSetAction || '');
                                if (row.updateSetAction === 'DELETE' || showsVersions) {
                                    wrapperEl.setAttribute(
                                        'change_type',
                                        row.updateSetAction === 'DELETE'
                                            ? 'deleted'
                                            : row.isNewInUpdateSet
                                              ? 'new'
                                              : 'updated'
                                    );
                                }
                            }
                            targetContainer.appendChild(wrapperEl);
                            var destContainer = combinedDoc.createElement('current_version');
                            wrapperEl.appendChild(destContainer);
                            try {
                                if (row.updateSetAction === 'DELETE') {
                                    // A DELETE record no longer exists on the live table — fetching it would
                                    // just come back empty, so say plainly that it was deleted instead.
                                    var deletedEl = combinedDoc.createElement('deleted_record');
                                    deletedEl.setAttribute('table', row.table);
                                    deletedEl.setAttribute('sys_id', row.sys_id);
                                    addRecordUrl(deletedEl, row, true);
                                    deletedEl.setAttribute(
                                        'reason',
                                        'This record was deleted by the "' +
                                            (row.updateSetName || 'update set') +
                                            '" update set'
                                    );
                                    destContainer.appendChild(deletedEl);
                                } else if (row.table === 'sys_db_object') {
                                    // ?SCHEMA is keyed by the URL's own table, not sys_id — resolve the
                                    // actual table name this sys_db_object row represents first, then
                                    // export THAT table's schema (e.g. sys_user.do?SCHEMA, no sys_id).
                                    var metaResp = await fetch(
                                        '/sys_db_object.do?sys_id=' + encodeURIComponent(row.sys_id) + '&XML',
                                        { credentials: 'same-origin' }
                                    );
                                    var metaText = await metaResp.text();
                                    var metaEl = new DOMParser().parseFromString(metaText, 'text/xml').documentElement
                                        .firstElementChild;
                                    var nameEl = metaEl ? metaEl.querySelector('name') : null;
                                    var targetTable = (nameEl && nameEl.textContent) || row.label;
                                    if (targetTable) {
                                        var schemaResp = await fetch(
                                            '/' + encodeURIComponent(targetTable) + '.do?SCHEMA',
                                            { credentials: 'same-origin' }
                                        );
                                        var schemaText = await schemaResp.text();
                                        var schemaEl = new DOMParser().parseFromString(
                                            schemaText,
                                            'text/xml'
                                        ).documentElement;
                                        addRecordUrl(schemaEl, row, true);
                                        schemaEl.removeAttribute('sys_mod_count_status');
                                        addExportModCount(schemaEl, metaEl);
                                        redactRecordElement(schemaEl);
                                        destContainer.appendChild(combinedDoc.importNode(schemaEl, true));
                                    }
                                } else if (!row.updateSetSysId && isTableExportBlocked(row.table)) {
                                    // Structure export (above) is fine; record data from this table is never exported.
                                    // Update-set members skip this check entirely — the update set already
                                    // scopes what's being exported, so nothing it touches is withheld.
                                    var blockedEl = combinedDoc.createElement('blocked_record');
                                    blockedEl.setAttribute('table', row.table);
                                    blockedEl.setAttribute('sys_id', row.sys_id);
                                    addRecordUrl(blockedEl, row, true);
                                    blockedEl.setAttribute(
                                        'reason',
                                        'Table is on the export blocklist — record data withheld'
                                    );
                                    destContainer.appendChild(blockedEl);
                                } else {
                                    var text = await fetchExportRecordXml(row);
                                    var parsed = new DOMParser().parseFromString(text, 'text/xml');
                                    var children = parsed.documentElement.children;
                                    for (var c = 0; c < children.length; c++) {
                                        var recordEl = children[c];
                                        addRecordUrl(recordEl, row, true);
                                        redactRecordElement(recordEl);
                                        destContainer.appendChild(combinedDoc.importNode(recordEl, true));
                                    }
                                    if (children.length === 0) {
                                        destContainer.setAttribute('status', 'unavailable');
                                        destContainer.setAttribute('reason', 'Record no longer exists on this table');
                                    }
                                }
                            } catch (e) {
                                destContainer.setAttribute('status', 'unavailable');
                            }

                            if (showsVersions) {
                                var previousEl = combinedDoc.createElement('previous_version');
                                if (row.previousVersion) {
                                    previousEl.setAttribute('update_set_name', row.previousVersion.updateSetName || '');
                                    previousEl.setAttribute(
                                        'update_set_sys_id',
                                        row.previousVersion.updateSetSysId || ''
                                    );
                                    previousEl.setAttribute('recorded_on', row.previousVersion.updatedOn || '');
                                    var prevParsed = new DOMParser().parseFromString(
                                        row.previousVersion.payload || '',
                                        'text/xml'
                                    );
                                    var prevChildren = prevParsed.documentElement
                                        ? prevParsed.documentElement.children
                                        : [];
                                    for (var p = 0; p < prevChildren.length; p++) {
                                        addRecordUrl(prevChildren[p], row, true);
                                        redactRecordElement(prevChildren[p]);
                                        previousEl.appendChild(combinedDoc.importNode(prevChildren[p], true));
                                    }
                                } else {
                                    previousEl.setAttribute('status', 'new');
                                    previousEl.textContent =
                                        'No earlier version exists — this record is new as of this update set.';
                                }
                                wrapperEl.appendChild(previousEl);
                                function recordChild(container) {
                                    for (var i = 0; i < container.children.length; i++) {
                                        if (container.children[i].tagName === row.table) return container.children[i];
                                    }
                                    return null;
                                }
                                annotateFieldChanges(
                                    recordChild(previousEl),
                                    recordChild(destContainer),
                                    row.updateSetAction === 'DELETE'
                                );
                            }

                            $timeout(function () {
                                ctrl.progress.done++;
                            });
                        },
                        8
                    );

                    combinedDoc.documentElement.setAttribute('generated_at', new Date().toISOString());
                    indentXmlDoc(combinedDoc);
                    var xml = new XMLSerializer().serializeToString(combinedDoc);
                    var blob = new Blob([xml], { type: 'application/xml' });
                    var url = URL.createObjectURL(blob);
                    var now = new Date();
                    var stamp =
                        now.getFullYear() +
                        '-' +
                        pad(now.getMonth() + 1) +
                        '-' +
                        pad(now.getDate()) +
                        '-' +
                        pad(now.getHours()) +
                        '-' +
                        pad(now.getMinutes()) +
                        '-' +
                        pad(now.getSeconds());
                    var primaryName = safeFileNameSegment(ctrl.primary.label);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = 'context-' + (primaryName ? primaryName + '-' : '') + stamp + '.xml';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    $timeout(function () {
                        ctrl.generating = false;
                    });
                };

                function init() {
                    loadFavouriteTables();
                    loadFavouriteGroups();
                    loadViewMode();
                    loadTokenConfig();
                    if (window.WE_ASSISTANT_CONFIG && window.WE_ASSISTANT_CONFIG.sysId) {
                        ctrl.loadingInitial = true;
                        var table = window.WE_ASSISTANT_CONFIG.table || 'sp_widget';
                        var sysId = window.WE_ASSISTANT_CONFIG.sysId;
                        ajax('getRecordLabel', { table: table, sys_id: sysId })
                            .then(function (res) {
                                ctrl.primary = {
                                    table: table,
                                    sysId: sysId,
                                    label: res && res.success ? res.label : sysId,
                                    tableLabel: res && res.tableLabel ? res.tableLabel : tableLabel(table),
                                    updatedOn: res && res.updatedOn ? res.updatedOn : '',
                                };
                                return loadPrimaryContext();
                            })
                            .catch(function () {
                                rebuildRows();
                            })
                            .finally(function () {
                                ctrl.loadingInitial = false;
                            });
                    }
                }

                init();
            },
        ]);

        var appEl = document.getElementById('we-assistant-app');
        if (appEl && !angular.element(appEl).injector()) {
            try {
                angular.bootstrap(appEl, ['weAssistantApp']);
            } catch (e) {}
        }
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

    function _initApp() {
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

    function _init() {
        var started = false;
        var analysisTimer;
        function startApp() {
            if (started) return;
            started = true;
            clearTimeout(analysisTimer);
            _initApp();
        }
        if (window.WECodeAnalysis) startApp();
        else {
            analysisTimer = setTimeout(startApp, 3000);
            _loadScript('/widget_editor_code_analysis.jsdbx?sysparm_substitute=false&v=1', startApp);
        }
    }

    if (typeof addAfterPageLoadedEvent === 'function') {
        addAfterPageLoadedEvent(_init);
    } else if (document.readyState !== 'loading') {
        _init();
    } else {
        document.addEventListener('DOMContentLoaded', _init);
    }
})();

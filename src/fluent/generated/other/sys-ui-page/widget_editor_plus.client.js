(function () {
    'use strict';

    // Widget Editor+ — client_script.js — AngularJS module for the ServiceNow sp_widget editor UI page.

    // Suppress Monaco worker 'Unexpected usage' unhandled rejections (non-fatal).
    window.addEventListener('unhandledrejection', function (e) {
        if (e.reason && e.reason.message === 'Unexpected usage') {
            e.preventDefault();
        }
    });

    // Detect Polaris light/dark theme via CSS variable and stamp html.we-light accordingly.
    (function () {
        try {
            var bg = getComputedStyle(document.documentElement)
                .getPropertyValue('--now-color_background--primary')
                .trim();
            var p = bg.split(/[\s,]+/).map(Number);
            if (p.length >= 3) {
                document.documentElement.classList.toggle('we-light', (p[0] + p[1] + p[2]) / 3 >= 128);
            }
        } catch (e) {}
    })();

    if (typeof angular === 'undefined') {
        return;
    }

    var AJAX_SCRIPT = (window.WE_CONFIG && window.WE_CONFIG.ajaxScript) || 'WidgetEditorAjax';
    var WE_UI_SCRIPTS = (window.WE_CONFIG && window.WE_CONFIG.uiScripts) || {};
    var DIFF_PAGE_SYS_ID = (window.WE_CONFIG && window.WE_CONFIG.diffPageSysId) || '';

    /** Builds a UI page nav URL; uses sys_id-based nav when known so it survives page renames. */
    function _diffNavUrl(params) {
        var qs = Object.keys(params)
            .map(function (k) {
                return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
            })
            .join('&');
        if (DIFF_PAGE_SYS_ID) {
            return '/nav_to.do?uri=' + encodeURIComponent('ui_page.do?sys_id=' + DIFF_PAGE_SYS_ID + '&' + qs);
        }
        return '/' + (WE_UI_SCRIPTS.diffPage || 'widget_editor_diff') + '.do?' + qs;
    }

    /** Build a same-frame / iframe URL for the diff page. */
    function _diffIframeUrl(params) {
        var qs = Object.keys(params)
            .map(function (k) {
                return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
            })
            .join('&');
        if (DIFF_PAGE_SYS_ID) {
            return '/ui_page.do?sys_id=' + DIFF_PAGE_SYS_ID + '&' + qs;
        }
        return '/' + (WE_UI_SCRIPTS.diffPage || 'widget_editor_diff') + '.do?' + qs;
    }

    angular
        .module('widgetEditor', [])

        // Filter: weHighlight — Wraps matching search query in native <mark> tags without custom CSS overrides.
        .filter('weHighlight', [
            '$sce',
            function ($sce) {
                function escapeRegex(s) {
                    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
                }
                function escapeHtml(s) {
                    if (!s) {
                        return '';
                    }
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
        ])

        // Directive: we-splitter-drag — Adds mousedown-drag behaviour to splitter elements.
        .directive('weSplitterDrag', [
            function () {
                return {
                    restrict: 'A',
                    link: function (scope, element, attrs) {
                        attrs.$observe('weSplitterDrag', function (val) {
                            if (!val || val === 'undefined' || val === '') {
                                return;
                            }
                            element.on('mousedown', function (event) {
                                event.preventDefault();
                                scope.$apply(function () {
                                    scope.startSplitterDrag(parseInt(val, 10), event.originalEvent || event);
                                });
                            });
                        });
                    },
                };
            },
        ])

        // Directive: we-pref-draggable — HTML5 drag-and-drop reordering of editors in the User Preferences modal.
        .directive('wePrefDraggable', [
            function () {
                // Shared across row instances; set synchronously in dragstart since scope.$applyAsync is too late for the first dragover's preventDefault().
                var _activeDragKey = null;

                return {
                    restrict: 'A',
                    link: function (scope, element, attrs) {
                        var key = '';
                        attrs.$observe('wePrefDraggable', function (val) {
                            key = val || '';
                        });

                        element[0].addEventListener('dragstart', function (e) {
                            if (!key) {
                                return;
                            }
                            _activeDragKey = key;
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', key);
                            scope.$applyAsync(function () {
                                scope.prefDragKey = key;
                            });
                        });

                        element[0].addEventListener('dragend', function () {
                            _activeDragKey = null;
                            element.removeClass('we-pref-drag-over');
                            scope.$applyAsync(function () {
                                scope.prefDragKey = null;
                            });
                        });

                        element[0].addEventListener('dragover', function (e) {
                            if (!_activeDragKey || _activeDragKey === key || !key) {
                                return;
                            }
                            e.preventDefault();
                            element.addClass('we-pref-drag-over');
                        });

                        element[0].addEventListener('dragleave', function (e) {
                            if (!element[0].contains(e.relatedTarget)) {
                                element.removeClass('we-pref-drag-over');
                            }
                        });

                        element[0].addEventListener('drop', function (e) {
                            e.preventDefault();
                            element.removeClass('we-pref-drag-over');
                            var fromKey = _activeDragKey;
                            _activeDragKey = null;
                            scope.$applyAsync(function () {
                                scope.prefDragKey = null;
                            });
                            if (fromKey && fromKey !== key && key) {
                                scope.$apply(function () {
                                    scope.reorderPrefEditors(fromKey, key);
                                });
                            }
                        });
                    },
                };
            },
        ])

        // Directive: we-auto-resize — Makes a textarea grow vertically to fit its content.
        .directive('weAutoResize', [
            '$timeout',
            function ($timeout) {
                return {
                    restrict: 'A',
                    require: '?ngModel',
                    link: function (scope, el, attrs, ngModel) {
                        function resize() {
                            el[0].style.height = 'auto';
                            el[0].style.height = el[0].scrollHeight + el[0].offsetHeight - el[0].clientHeight + 'px';
                        }
                        el.on('input', resize);
                        if (ngModel) {
                            scope.$watch(
                                function () {
                                    return ngModel.$viewValue;
                                },
                                function () {
                                    $timeout(resize, 0);
                                }
                            );
                        } else {
                            $timeout(resize, 0);
                        }
                    },
                };
            },
        ])

        // Directive: we-select2-roles — Initialises a Select2 v3 multi-select on an <input type="hidden"> element.
        .directive('weSelect2Roles', [
            '$timeout',
            function ($timeout) {
                return {
                    restrict: 'A',
                    // No isolated scope, so rolesList must be mutated in-place — replacing it would shadow the controller-scope array on the ng-if child scope.
                    link: function (scope, el) {
                        $timeout(function () {
                            var $jq = typeof $j !== 'undefined' ? $j : typeof jQuery !== 'undefined' ? jQuery : null;
                            if (!$jq || !$jq.fn || !$jq.fn.select2) {
                                return;
                            }
                            var $el = $jq(el[0]);

                            // Walk up scope chain to find the scope that owns rolesList
                            function getRootRolesList() {
                                var s = scope;
                                while (s) {
                                    if (s.hasOwnProperty('rolesList')) return s;
                                    s = s.$parent;
                                }
                                return scope; // fallback
                            }

                            var ownerScope = getRootRolesList();

                            // Set initial comma-separated value so initSelection can parse it
                            $el.val((ownerScope.rolesList || []).join(','));

                            var _queryTimer = null;

                            $el.select2({
                                multiple: true,
                                placeholder: 'Add roles\u2026',
                                allowClear: false,
                                minimumInputLength: 0,
                                width: '100%',
                                query: function (query) {
                                    clearTimeout(_queryTimer);
                                    _queryTimer = setTimeout(function () {
                                        var current = $el.select2('val') || [];
                                        var ga = new GlideAjax(AJAX_SCRIPT);
                                        ga.addParam('sysparm_name', 'searchRoles');
                                        ga.addParam('term', query.term || '');
                                        ga.getXML(function (response) {
                                            try {
                                                var answer =
                                                    response.responseXML.documentElement.getAttribute('answer');
                                                var data = JSON.parse(answer);
                                                var results = (data.roles || [])
                                                    .filter(function (r) {
                                                        return current.indexOf(r) === -1;
                                                    })
                                                    .map(function (r) {
                                                        return {
                                                            id: r,
                                                            text: r,
                                                        };
                                                    });
                                                query.callback({
                                                    results: results,
                                                    more: false,
                                                });
                                            } catch (e) {
                                                query.callback({
                                                    results: [],
                                                    more: false,
                                                });
                                            }
                                        });
                                    }, 250);
                                },
                                initSelection: function (element, callback) {
                                    var val = element.val();
                                    callback(
                                        val
                                            ? val
                                                  .split(',')
                                                  .filter(Boolean)
                                                  .map(function (v) {
                                                      return {
                                                          id: v.trim(),
                                                          text: v.trim(),
                                                      };
                                                  })
                                            : []
                                    );
                                },
                            });

                            $el.on('change', function () {
                                var vals = Array.isArray($el.select2('val')) ? $el.select2('val').filter(Boolean) : [];
                                ownerScope.$apply(function () {
                                    // Mutate in-place so the controller-scope array reference is updated,
                                    // not shadowed by a new array on the ng-if child scope.
                                    ownerScope.rolesList.length = 0;
                                    vals.forEach(function (v) {
                                        ownerScope.rolesList.push(v);
                                    });
                                });
                            });

                            scope.$on('$destroy', function () {
                                clearTimeout(_queryTimer);
                                try {
                                    $el.select2('destroy');
                                } catch (e) {}
                            });
                        }, 0);
                    },
                };
            },
        ])

        .directive('weSelect2Reference', [
            '$timeout',
            function ($timeout) {
                return {
                    restrict: 'A',
                    require: 'ngModel',
                    link: function (scope, element, attrs, model) {
                        var field = scope.$eval(attrs.weSelect2Reference),
                            picker,
                            timer,
                            destroyed = false;
                        var sequence = 0,
                            renderSequence = 0,
                            choices = Object.create(null);
                        var init = $timeout(function () {
                            var jq = window.$j || window.jQuery;
                            if (!jq || !jq.fn || !jq.fn.select2) {
                                scope.referenceErrors[field.name] = 'Reference picker is unavailable. Reload the page.';
                                return;
                            }
                            picker = jq(element[0]);
                            var initial = model.$viewValue || '';
                            if (initial) choices[initial] = { id: initial, text: field.displayValue || initial };
                            picker.val(initial);
                            picker.select2({
                                width: field.more ? '29.375rem' : '18rem',
                                placeholder: 'Select ' + field.label,
                                allowClear: !field.required,
                                minimumInputLength: 0,
                                initSelection: function (_, callback) {
                                    callback(choices[model.$viewValue] || null);
                                },
                                query: function (query) {
                                    var request = ++sequence;
                                    $timeout.cancel(timer);
                                    timer = $timeout(function () {
                                        scope.referenceErrors[field.name] = '';
                                        scope
                                            .searchEditorReferences(field.name, query.term || '', query.page || 1)
                                            .then(function (data) {
                                                if (destroyed || request !== sequence) return;
                                                if (!data.success)
                                                    scope.referenceErrors[field.name] =
                                                        data.error || 'Reference lookup failed.';
                                                (data.results || []).forEach(function (choice) {
                                                    choices[choice.id] = choice;
                                                });
                                                query.callback({ results: data.results || [], more: !!data.has_more });
                                            });
                                    }, 250);
                                },
                            });
                            model.$render = function () {
                                var value = model.$viewValue || '',
                                    request = ++renderSequence;
                                picker.select2('data', value ? choices[value] || { id: value, text: value } : null);
                                if (value && !choices[value]) {
                                    scope.searchEditorReferences(field.name, '', 1, value).then(function (data) {
                                        if (destroyed || request !== renderSequence || model.$viewValue !== value)
                                            return;
                                        if (data.success && data.results && data.results[0]) {
                                            choices[value] = data.results[0];
                                            picker.select2('data', choices[value]);
                                        }
                                    });
                                }
                            };
                            model.$render();
                            picker.on('change.weReference', function () {
                                if (scope.$eval(attrs.ngDisabled)) return;
                                var selected = picker.select2('data');
                                scope.$evalAsync(function () {
                                    if (selected) choices[selected.id] = selected;
                                    scope.referenceErrors[field.name] = '';
                                    model.$setViewValue(selected ? selected.id : '');
                                    field.displayValue = selected ? selected.text : '';
                                });
                            });
                            scope.$watch(attrs.ngDisabled, function (disabled) {
                                picker.select2('enable', !disabled);
                            });
                        }, 0);
                        scope.$on('$destroy', function () {
                            destroyed = true;
                            $timeout.cancel(init);
                            $timeout.cancel(timer);
                            if (picker) {
                                picker.off('.weReference');
                                picker.select2('destroy');
                            }
                        });
                    },
                };
            },
        ])

        // Directive: we-modal-draggable — Enables dragging a modal dialog by its header. Apply to .we-modal-header.
        .directive('weModalDraggable', [
            function () {
                return {
                    restrict: 'A',
                    link: function (scope, element) {
                        var modal = element[0].closest('.we-modal');
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
                            if (!dragging) {
                                return;
                            }
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
                            modal.classList.remove('we-modal--dragging');
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
                            modal.classList.add('we-modal--dragging');
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
        ])

        // Directive: we-modal-dialog — Manages HTML5 <dialog> modal state, rendering in top-layer and making rest of page inert
        .directive('weModalDialog', [
            function () {
                // Ensure Bootstrap tooltips for elements inside any <dialog> are placed inside that <dialog> in the Top Layer
                if (window.jQuery && !window._weDialogTooltipHookInstalled) {
                    window._weDialogTooltipHookInstalled = true;
                    window
                        .jQuery(document)
                        .on('show.bs.tooltip.weDialog', function (e) {
                            var target = e.target;
                            var dlg = target && target.closest && target.closest('dialog');
                            if (dlg) {
                                var tip = window.jQuery(target).data('bs.tooltip');
                                if (tip) {
                                    tip.options.container = dlg;
                                }
                            }
                        })
                        .on('inserted.bs.tooltip.weDialog', function (e) {
                            var target = e.target;
                            var dlg = target && target.closest && target.closest('dialog');
                            if (dlg) {
                                var tip = window.jQuery(target).data('bs.tooltip');
                                if (tip && tip.$tip && tip.$tip[0] && tip.$tip[0].parentElement !== dlg) {
                                    dlg.appendChild(tip.$tip[0]);
                                }
                            }
                        });
                }

                return {
                    restrict: 'A',
                    link: function (scope, element, attrs) {
                        var dialog = element[0];
                        if (!dialog || typeof dialog.showModal !== 'function') {
                            return;
                        }

                        // Keep the app switcher interactive inside the Open dialog's modal top layer.
                        var header = attrs.weDialogHeader && document.querySelector(attrs.weDialogHeader);
                        var headerAnchor = header && document.createComment('App header');
                        if (header) header.before(headerAnchor);
                        function restoreHeader() {
                            if (header && headerAnchor.parentNode) headerAnchor.after(header);
                        }
                        scope.$on('$destroy', restoreHeader);

                        scope.$watch(attrs.weModalDialog, function (val) {
                            if (val) {
                                if (!dialog.open) {
                                    try {
                                        dialog.showModal();
                                    } catch (e) {
                                        dialog.setAttribute('open', '');
                                    }
                                    if (header) dialog.prepend(header);
                                }
                            } else {
                                if (dialog.open) {
                                    try {
                                        dialog.close();
                                    } catch (e) {
                                        dialog.removeAttribute('open');
                                    }
                                }
                                restoreHeader();
                            }
                        });

                        element.on('cancel', function (e) {
                            if (attrs.weDialogCancel) {
                                e.preventDefault();
                                scope.$apply(function () {
                                    scope.$eval(attrs.weDialogCancel);
                                });
                            }
                        });
                    },
                };
            },
        ])

        // Directive: we-loader — Inline search-box loading indicator using the Now Design System spinner
        .directive('weLoader', [
            function () {
                return {
                    restrict: 'E',
                    template:
                        '<svg class="we-loader-icon" aria-hidden="true" viewBox="0 0 16 16">' +
                        '<path d="M13 8a5 5 0 1 1-2.592-4.383c.208.115.47.09.638-.078l.738-.737a.47.47 0 0 0-.067-.735 7 7 0 1 0 2.216 2.216.47.47 0 0 0-.735-.067l-.737.738a.54.54 0 0 0-.078.638A5 5 0 0 1 13 8"/>' +
                        '</svg>',
                };
            },
        ])

        // Directive: we-header-loader — Animated SVG loading spinner next to modal section headers
        .directive('weHeaderLoader', [
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
        ])

        // Directive: we-spinner — Renders the circular loading spinner SVG; colour is inherited via currentColor.
        .directive('weSpinner', [
            function () {
                return {
                    restrict: 'E',
                    template:
                        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">' +
                        '<circle cx="32" cy="32" r="24" stroke="currentColor" stroke-width="3" fill="none" opacity="0.2"/>' +
                        '<circle cx="32" cy="32" r="24" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none" stroke-dasharray="40 110">' +
                        '<animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="1.2s" repeatCount="indefinite"/>' +
                        '<animate attributeName="stroke-dasharray" values="10 140; 80 70; 10 140" dur="2.4s" repeatCount="indefinite"/>' +
                        '</circle>' +
                        '</svg>',
                };
            },
        ])

        // Directive: we-tooltip-title — Keeps Bootstrap's data-original-title in sync with an interpolated attribute value.
        .directive('weTooltipTitle', [
            function () {
                return {
                    restrict: 'A',
                    link: function (scope, element, attrs) {
                        var container = element[0].closest('dialog') || element[0].closest('.we-modal') || 'body';
                        element.tooltip({
                            container: container,
                            placement: 'bottom',
                        });
                        attrs.$observe('weTooltipTitle', function (val) {
                            var text = val || '';
                            element.attr('data-original-title', text);
                            var tip = element.data('bs.tooltip');
                            if (tip) {
                                tip.options.title = text;
                                if (tip.$tip && tip.$tip.is(':visible')) {
                                    tip.$tip.find('.tooltip-inner').text(text);
                                }
                            }
                        });
                        scope.$on('$destroy', function () {
                            try {
                                element.tooltip('destroy');
                            } catch (e) {}
                        });
                    },
                };
            },
        ])

        // Directive: we-dropdown-auto-pos — Repositions a .we-dropdown-menu or .we-popover so it never escapes the viewport.
        .directive('weDropdownAutoPos', [
            '$timeout',
            function ($timeout) {
                return {
                    restrict: 'A',
                    link: function (scope, element) {
                        var el = element[0];

                        function reposition() {
                            // Reset inline corrections so base CSS applies before re-measuring.
                            el.style.left = '';
                            el.style.right = '';
                            el.style.top = '';
                            el.style.bottom = '';

                            var rect = el.getBoundingClientRect();
                            // Element is hidden (ng-show / ng-hide) or not yet laid out.
                            if (rect.width === 0 && rect.height === 0) {
                                return;
                            }

                            var vw = window.innerWidth;
                            var vh = window.innerHeight;

                            // Horizontal: flip to right-align when right edge overflows.
                            if (rect.right > vw) {
                                el.style.left = 'auto';
                                el.style.right = '0';
                            }
                            // Horizontal: fixes left-align if a right-aligned menu overflows off-screen left.
                            if (el.getBoundingClientRect().left < 0) {
                                el.style.left = '0';
                                el.style.right = 'auto';
                            }
                            // Vertical: flip to open upward when bottom edge overflows.
                            if (rect.bottom > vh) {
                                el.style.top = 'auto';
                                el.style.bottom = 'calc(100% + 0.1875rem)';
                            }
                        }

                        // Hides, repositions, then shows to avoid a one-frame flash at the default position.
                        function positionThenShow() {
                            el.style.opacity = '0';
                            $timeout(function () {
                                reposition();
                                el.style.opacity = '';
                            }, 0);
                        }

                        // ng-if: element is freshly inserted — reposition before first paint.
                        positionThenShow();

                        // ng-show: reposition whenever the controlling scope vars change.
                        scope.$watch('openDropdown', function (newVal, oldVal) {
                            if (newVal === oldVal) {
                                return;
                            }
                            positionThenShow();
                        });
                        scope.$watch('openCompactSubmenu', function (newVal, oldVal) {
                            if (newVal === oldVal) {
                                return;
                            }
                            // The compact menu panel is already visible; just re-check the
                            // vertical position after the submenu height change, no hide needed.
                            $timeout(function () {
                                reposition();
                            }, 0);
                        });
                    },
                };
            },
        ])

        // Directive: we-dropdown-fixed-pos — Like we-dropdown-auto-pos but uses position:fixed so the menu escapes clipping ancestors.
        .directive('weDropdownFixedPos', [
            '$timeout',
            function ($timeout) {
                return {
                    restrict: 'A',
                    link: function (scope, element) {
                        var el = element[0];

                        function reposition() {
                            el.style.top = '';
                            el.style.left = '';
                            el.style.right = '';
                            el.style.bottom = '';

                            var rect = el.getBoundingClientRect();
                            if (rect.width === 0 && rect.height === 0) {
                                return;
                            }

                            // Anchor to the trigger button inside the parent .we-dropdown
                            var trigger = el.parentElement && el.parentElement.querySelector('.btn');
                            var triggerRect = trigger
                                ? trigger.getBoundingClientRect()
                                : {
                                      bottom: 0,
                                      left: 0,
                                      right: 0,
                                      top: 0,
                                      width: 0,
                                  };

                            var vw = window.innerWidth;
                            var vh = window.innerHeight;
                            var gap = 3; // px

                            // Default: open below, left-aligned with trigger
                            var top = triggerRect.bottom + gap;
                            var left = triggerRect.left;

                            // Flip upward if bottom would overflow
                            if (top + rect.height > vh) {
                                top = triggerRect.top - rect.height - gap;
                            }

                            // Flip left-align to right-align if right edge overflows
                            if (left + rect.width > vw) {
                                left = triggerRect.right - rect.width;
                            }

                            // Clamp to viewport edges
                            left = Math.max(0, Math.min(left, vw - rect.width));
                            top = Math.max(0, Math.min(top, vh - rect.height));

                            el.style.position = 'fixed';
                            el.style.top = top + 'px';
                            el.style.left = left + 'px';
                        }

                        function positionThenShow() {
                            el.style.opacity = '0';
                            $timeout(function () {
                                reposition();
                                el.style.opacity = '';
                            }, 0);
                        }

                        positionThenShow();

                        scope.$watch('openDropdown', function (newVal, oldVal) {
                            if (newVal === oldVal) {
                                return;
                            }
                            positionThenShow();
                        });
                    },
                };
            },
        ])

        // Directive: we-pane-subheader-fit — Watches the subheader width and sets item.subheaderTypeOverflow
        .directive('wePaneSubheaderFit', [
            '$timeout',
            function ($timeout) {
                return {
                    restrict: 'A',
                    link: function (scope, element) {
                        var el = element[0];
                        var ro = null;
                        // Min usable name-row width: label + gap + input min-width ≈ 105px.
                        var MIN_NAME_ROW_W = 100;

                        function check() {
                            var typeRow = el.querySelector('.we-pane-subheader-type-row');
                            var nameRow = el.querySelector('.we-pane-subheader-name-row');
                            if (!typeRow || !nameRow) {
                                return;
                            }

                            // Temporarily restores display so layout can be re-measured for a switch back.
                            var wasOverflow = !!(scope.item && scope.item.subheaderTypeOverflow);
                            if (wasOverflow) {
                                typeRow.style.display = 'flex';
                            }

                            // getBoundingClientRect forces a synchronous layout flush.
                            var nameRowW = nameRow.getBoundingClientRect().width;

                            if (wasOverflow) {
                                typeRow.style.display = '';
                            }

                            // Name row squeezed below minimum width means the type row doesn't fit.
                            var overflows = nameRowW < MIN_NAME_ROW_W;

                            if (scope.item && !!scope.item.subheaderTypeOverflow !== overflows) {
                                scope.$apply(function () {
                                    scope.item.subheaderTypeOverflow = overflows;
                                });
                            }
                        }

                        $timeout(check, 50);

                        if (window.ResizeObserver) {
                            ro = new ResizeObserver(function () {
                                check();
                            });
                            ro.observe(el);
                        }

                        scope.$on('$destroy', function () {
                            if (ro) {
                                ro.disconnect();
                            }
                        });
                    },
                };
            },
        ])

        // Directive: we-file-change="handler($file)" — invokes handler with the selected File on a file input's change event.
        .directive('weFileChange', [
            function () {
                return {
                    restrict: 'A',
                    link: function (scope, el, attrs) {
                        el.on('change', function () {
                            var file = el[0].files && el[0].files[0];
                            el[0].value = '';
                            if (!file) {
                                return;
                            }
                            scope.$apply(function () {
                                scope.$eval(attrs.weFileChange, {
                                    $file: file,
                                });
                            });
                        });
                    },
                };
            },
        ])

        // Directive: we-infinite-scroll="handler()" — invokes handler when the element is scrolled near its bottom.
        .directive('weInfiniteScroll', [
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
        ])

        // Controller: WidgetEditorCtrl
        .controller('WidgetEditorCtrl', [
            '$scope',
            '$http',
            '$timeout',
            '$interval',
            '$q',
            '$injector',
            '$window',
            function ($scope, $http, $timeout, $interval, $q, $injector, $window) {
                // The Angular 'amb' service only exists on full form pages; falls back to window.amb.getClient().
                var amb = null;
                try {
                    if ($injector.has('amb')) amb = $injector.get('amb');
                } catch (e) {}
                if (!amb && window.amb && typeof window.amb.getClient === 'function') {
                    try {
                        amb = window.amb.getClient();
                    } catch (e) {}
                }

                // Reads window.WE_CONFIG (set before Angular bootstraps) instead of re-parsing location.search, since ServiceNow can rewrite the URL first.
                var _params = new URLSearchParams(window.location.search);
                var _weConfig = window.WE_CONFIG || {};
                var RECORD_TABLE = _weConfig.record_table || _params.get('record_table') || 'sp_widget';
                var SYS_ID = _weConfig.sys_id || _params.get('record_sys_id') || _params.get('widget_id') || '';
                $scope.recordTable = RECORD_TABLE;
                $scope.isWidgetRecord = RECORD_TABLE === 'sp_widget';
                $scope.recordAllowsCreate = $scope.isWidgetRecord;
                $scope.recordLabel = $scope.isWidgetRecord ? 'Widget' : 'Record';
                $scope.recordPrimaryField = 'name';
                $scope.recordTypes = [{ table: 'sp_widget', label: 'Widgets', singular: 'Widget', allowCreate: true }];
                var VERSION_ID = _weConfig.version_id || _params.get('version_id') || '';
                var IS_NEW = _weConfig.is_new !== undefined ? !!_weConfig.is_new : _params.get('new') === '1';
                var APP_TITLE = 'Widget Editor+';
                var SITE_TITLE = (window.WE_CONFIG && window.WE_CONFIG.siteTitle) || 'ServiceNow';

                var _titleTimer = null;
                $scope.$watch('widget.name', function (name) {
                    var _title = (name ? name + ' - ' : '') + APP_TITLE + ' - ' + SITE_TITLE;
                    document.title = _title;
                    if (_titleTimer) {
                        $timeout.cancel(_titleTimer);
                    }
                    _titleTimer = $timeout(function () {
                        try {
                            if (window.parent !== window) {
                                window.parent.document.title = _title;
                            }
                        } catch (e) {}
                    }, 1000);
                    if (window.WE_HISTORY_SYNC) {
                        window.WE_HISTORY_SYNC.set({
                            description: name || '',
                            title: APP_TITLE,
                        });
                    }
                    $scope.headerDirty.name = (name || '') !== originalHeader.name;
                });
                $scope.$watch('widget.id', function (v) {
                    $scope.headerDirty.id = (v || '') !== originalHeader.id;
                    if ($scope.isWidgetRecord === false && $scope.recordPrimaryField === 'id') $scope.widget.name = v;
                });
                $scope.$watch('widget.description', function (v) {
                    $scope.headerDirty.description = (v || '') !== originalHeader.description;
                });
                $scope.$watch('widget.controller_as', function (v) {
                    $scope.headerDirty.controller_as = (v || 'c') !== originalHeader.controller_as;
                });
                $scope.$watch('widget.is_public', function (v) {
                    $scope.headerDirty.is_public = !!v !== originalHeader.is_public;
                });
                $scope.$watch('widget.static', function (v) {
                    $scope.headerDirty.static = !!v !== originalHeader.static;
                });
                $scope.$watchCollection('rolesList', function (v) {
                    $scope.headerDirty.roles = (v || []).join(',') !== originalHeader.roles;
                });
                $scope.$watch(
                    function () {
                        return ($scope.additionalWidgetFields || [])
                            .map(function (fieldDef) {
                                return (
                                    fieldDef.name +
                                    '=' +
                                    _normaliseExtraWidgetFieldValue(fieldDef, $scope.widget[fieldDef.name])
                                );
                            })
                            .join('|');
                    },
                    function () {
                        ($scope.additionalWidgetFields || []).forEach(function (fieldDef) {
                            $scope.headerDirty[fieldDef.name] =
                                _normaliseExtraWidgetFieldValue(fieldDef, $scope.widget[fieldDef.name]) !==
                                _normaliseExtraWidgetFieldValue(fieldDef, originalHeader[fieldDef.name]);
                        });
                    }
                );

                // Scope state
                $scope.loading = true;
                $scope.loadingWidgetName = '';
                if (SYS_ID && $scope.isWidgetRecord) {
                    ajax('getWidgetName', { sys_id: SYS_ID }).then(function (data) {
                        $scope.loadingWidgetName = data.name || '';
                    });
                }
                $scope.loadError = null;
                $scope.widget = {};
                $scope.isVersionView = !!VERSION_ID;

                // SN Utils "Edit in VS Code" integration
                function checkSnUtilsInstalled() {
                    var installed =
                        typeof window.snusettings !== 'undefined' ||
                        typeof window.SNUtilsInject !== 'undefined' ||
                        typeof window.snuPostRequestToScriptSync === 'function' ||
                        !!document.querySelector('snu-presence') ||
                        !!document.querySelector(
                            'script[src*="snutils"], script[src*="lfabkiipmidkmhplochgpbaeekjjfbch"]'
                        );
                    if (!installed) {
                        return false;
                    }
                    // Only hide if snusettings has been injected AND vsscriptsync is explicitly false
                    if (
                        typeof window.snusettings !== 'undefined' &&
                        window.snusettings &&
                        window.snusettings.vsscriptsync === false
                    ) {
                        return false;
                    }
                    return true;
                }

                function updateSnUtilsState() {
                    var active = checkSnUtilsInstalled();
                    if (active !== $scope.hasSnUtils) {
                        $scope.$applyAsync(function () {
                            $scope.hasSnUtils = active;
                        });
                    }
                    return active;
                }

                $scope.hasSnUtils = checkSnUtilsInstalled();

                // Hook into snuSettingsAdded if SN Utils injects settings after page load
                var origSnuSettingsAdded = window.snuSettingsAdded;
                window.snuSettingsAdded = function () {
                    if (typeof origSnuSettingsAdded === 'function') {
                        try {
                            origSnuSettingsAdded.apply(this, arguments);
                        } catch (e) {}
                    }
                    updateSnUtilsState();
                };

                var _snuObserver = new MutationObserver(function () {
                    updateSnUtilsState();
                });
                _snuObserver.observe(document.documentElement, {
                    childList: true,
                    subtree: true,
                });

                // Delayed re-evaluations to account for async snusettings injection after page load
                $timeout(updateSnUtilsState, 500);
                $timeout(updateSnUtilsState, 1500);
                $timeout(updateSnUtilsState, 3000);

                $timeout(function () {
                    updateSnUtilsState();
                    _snuObserver.disconnect();
                }, 10000);

                $scope.c = $scope.c || {};
                $scope.$watch(
                    'widget',
                    function (w) {
                        if (!w) return;
                        $scope.c.readOnly = !$scope.canWriteWidget;
                        $scope.data = $scope.data || {};
                        $scope.data.title = w.name || '';
                        $scope.data.sys_id = w.sys_id || '';
                        var scopeVal =
                            typeof w.sys_scope === 'object' && w.sys_scope
                                ? w.sys_scope.value || 'global'
                                : w.sys_scope || 'global';
                        var scopeDisp =
                            typeof w.sys_scope === 'object' && w.sys_scope
                                ? w.sys_scope.displayValue || scopeVal
                                : scopeVal;
                        $scope.data.f = {
                            _fields: {
                                name: {
                                    value: w.name || '',
                                    displayValue: w.name || '',
                                },
                                id: {
                                    value: w.id || '',
                                    displayValue: w.id || '',
                                },
                                template: { value: w.template || '' },
                                css: { value: w.css || '' },
                                client_script: { value: w.client_script || '' },
                                script: { value: w.script || '' },
                                link: { value: w.link || '' },
                                option_schema: { value: w.option_schema || '' },
                                demo_data: { value: w.demo_data || '' },
                                sys_scope: {
                                    value: scopeVal,
                                    displayValue: scopeDisp,
                                },
                                data_table: {
                                    value: 'sp_widget',
                                    displayValue: 'Widget',
                                    choices: [],
                                },
                            },
                        };
                    },
                    true
                );

                $scope.editInVsCode = function () {
                    if (!$scope.widget || !$scope.widget.sys_id) return;

                    if (!$scope.canWriteWidget || $scope.widget.read_only) {
                        alert(
                            'This is a read-only widget and cannot be opened in VS Code. Please clone the widget first.'
                        );
                        return;
                    }

                    var g_ck_val = window.g_ck || (typeof g_ck !== 'undefined' ? g_ck : '');
                    var instanceName = window.location.host.split('.')[0];
                    var instanceUrl = window.location.origin;

                    var instance = {
                        name: instanceName,
                        url: instanceUrl,
                        g_ck: g_ck_val,
                    };

                    var scopeVal =
                        typeof $scope.widget.sys_scope === 'object' && $scope.widget.sys_scope
                            ? $scope.widget.sys_scope.value || 'global'
                            : $scope.widget.sys_scope || 'global';
                    var scopeDisp =
                        typeof $scope.widget.sys_scope === 'object' && $scope.widget.sys_scope
                            ? $scope.widget.sys_scope.displayValue || scopeVal
                            : scopeVal;

                    var fields = {
                        name: {
                            value: $scope.widget.name || '',
                            displayValue: $scope.widget.name || '',
                        },
                        id: {
                            value: $scope.widget.id || '',
                            displayValue: $scope.widget.id || '',
                        },
                        template: { value: $scope.widget.template || '' },
                        css: { value: $scope.widget.css || '' },
                        client_script: {
                            value: $scope.widget.client_script || '',
                        },
                        script: { value: $scope.widget.script || '' },
                        link: { value: $scope.widget.link || '' },
                        option_schema: {
                            value: $scope.widget.option_schema || '',
                        },
                        demo_data: { value: $scope.widget.demo_data || '' },
                        sys_scope: { value: scopeVal, displayValue: scopeDisp },
                        data_table: {
                            value: 'sp_widget',
                            displayValue: 'Widget',
                            choices: [],
                        },
                    };

                    var data = {
                        action: 'saveWidget',
                        tableName: 'sp_widget',
                        name: $scope.widget.name || '',
                        sys_id: $scope.widget.sys_id,
                        instance: instance,
                        widget: fields,
                    };

                    // Trigger SN Utils ScriptSync once (prefer extension functions if exposed, otherwise dispatch custom event)
                    if (typeof window.snuScriptSyncPostData === 'function') {
                        if (typeof window.snuScriptSync === 'function') {
                            try {
                                window.snuScriptSync();
                            } catch (e) {}
                        }
                        try {
                            window.snuScriptSyncPostData(data);
                        } catch (e) {}
                    } else if (
                        window.SNUtilsInject &&
                        window.SNUtilsInject.IDEBridge &&
                        typeof window.SNUtilsInject.IDEBridge.scriptSyncPostData === 'function'
                    ) {
                        if (typeof window.SNUtilsInject.IDEBridge.scriptSync === 'function') {
                            try {
                                window.SNUtilsInject.IDEBridge.scriptSync();
                            } catch (e) {}
                        }
                        try {
                            window.SNUtilsInject.IDEBridge.scriptSyncPostData(data);
                        } catch (e) {}
                    } else {
                        try {
                            var evtSync = new CustomEvent('snutils-event', {
                                detail: { event: 'scriptsync', command: '' },
                            });
                            (window.top || window).document.dispatchEvent(evtSync);
                        } catch (e) {}

                        try {
                            var evtPost = new CustomEvent('snutils-event', {
                                detail: {
                                    event: 'scriptsyncpostdata',
                                    command: data,
                                },
                            });
                            (window.top || window).document.dispatchEvent(evtPost);
                        } catch (e) {}
                    }
                };
                $scope.versionInfo = {};
                $scope.versions = [];
                $scope.templates = [];
                $scope.providers = [];
                $scope.dependencies = [];
                $scope.relatedModal = {
                    open: false,
                    tabs: [],
                    activeTab: null,
                    loading: false,
                };
                $scope.versionDiffModal = {
                    open: false,
                    url: null,
                    rawUrl: null,
                    label: '',
                    expandedField: null,
                    isUnsaved: false,
                };
                $scope.providerTypeChoices = [];
                $scope.es12RecordExists = false;
                $scope.presenceUsers = [];
                $scope.currentUserId =
                    (typeof NOW !== 'undefined' && NOW.user_id) ||
                    (typeof g_user !== 'undefined' && g_user.userID) ||
                    null;
                $scope.openDropdown = null;
                $scope.openCompactSubmenu = null;
                $scope.hasLintErrors = false;
                $scope.hasLintWarnings = false;

                // New widget / widget picker state
                $scope.isNewWidget = false;
                $scope.showPicker = false;
                $scope.showWidgetPickerModal = false;
                $scope.pendingWidgetNav = null;
                $scope.pendingNewWidget = false;
                $scope.pickerWidgets = [];
                $scope.pickerLoading = false;
                $scope.picker = { search: '', table: RECORD_TABLE };
                $scope.pickerOffset = 0;
                $scope.pickerError = null;
                $scope.pickerTotal = 0;
                $scope.pickerHasMore = false;
                $scope.pickerLoadingMore = false;

                // Roles
                $scope.rolesList = [];
                $scope.additionalWidgetFields = [];
                $scope.referenceErrors = {};
                $scope.searchEditorReferences = function (field, search, page, value) {
                    return ajax('getEditorReferenceChoices', {
                        sys_id: SYS_ID,
                        field: field,
                        search: search,
                        offset: (page - 1) * 20,
                        value: value || '',
                    });
                };

                // Reverted notification
                $scope.widgetReverted = false;
                $scope.showRevertConfirm = false;

                // Header field dirty tracking
                $scope.headerDirty = {
                    name: false,
                    id: false,
                    description: false,
                    controller_as: false,
                    is_public: false,
                    roles: false,
                    static: false,
                };
                var originalHeader = {
                    name: '',
                    id: '',
                    description: '',
                    controller_as: 'c',
                    is_public: false,
                    roles: '',
                    static: false,
                };

                // Core editor definitions (order = default pane order)
                $scope.coreEditorDefs = [
                    {
                        key: 'template',
                        label: 'Body HTML template',
                        field: 'template',
                        language: 'html',
                        visible: true,
                    },
                    {
                        key: 'css',
                        label: 'CSS/SCSS',
                        field: 'css',
                        language: 'scss',
                        visible: true,
                    },
                    {
                        key: 'client_script',
                        label: 'Client controller',
                        field: 'client_script',
                        language: 'javascript',
                        visible: true,
                    },
                    {
                        key: 'link',
                        label: 'Link',
                        field: 'link',
                        language: 'javascript',
                        visible: false,
                    },
                    {
                        key: 'script',
                        label: 'Server script',
                        field: 'script',
                        language: 'javascript',
                        visible: true,
                    },
                ];

                $scope.nameInvalid = false;
                $scope.visiblePaneCount = 0;
                $scope.prefDragKey = null;

                // Link provider modal state
                $scope.showLinkProviderModal = false;
                $scope.linkProvider = { search: '' };
                $scope.showLinkDependencyModal = false;
                $scope.linkDependency = { search: '' };
                $scope.linkDependencyResults = [];
                $scope.linkDependencySearching = false;
                $scope.linkDependencyTotal = 0;
                $scope.linkDependencyHasMore = false;
                $scope.linkDependencyLoadingMore = false;
                $scope.pendingUnlinkDependency = null;
                $scope.linkProviderResults = [];
                $scope.linkProviderSearching = false;
                $scope.linkProviderTotal = 0;
                $scope.linkProviderHasMore = false;
                $scope.linkProviderLoadingMore = false;

                // Write-access state
                $scope.canWriteWidget = true;
                $scope.saveError = null;
                $scope.lastSaveTime = null;
                $scope.lastSaveUpdateSet = null; // { sys_id, name } — set after each saveAll

                // User preferences (loaded from server; defaults apply until loaded)
                $scope.userPrefs = {
                    formatTabsToSpaces: true,
                    wordWrap: true,
                    editorTheme: 'auto',
                    minimap: false,
                    alwaysShowLink: true,
                    realtimeWidgetUpdates: false,
                    showAssistantButton: false,
                    contextMenuMode: 'enhanced',
                    autoIndent: true,
                    formatOnPaste: true,
                    formatOnType: true,
                    fontSize: 12,
                    fontFamily: '',
                    languageHelpers: true,
                    showUnusedVars: true,
                    remBase: 16,
                    stickyScroll: true,
                    htmlValidation: true,
                    htmlAutoCloseTags: true,
                    autoSurround: 'languageDefined',
                    autoClosingBrackets: 'languageDefined',
                    autoClosingQuotes: 'languageDefined',
                    linkedEditing: true,
                    insertSpaceBeforeFuncParen: false,
                    tabSize: 4,
                    ctrlSSaveActiveOnly: true,
                    autosaveInterval: 30,
                    draftRetentionDays: 7,
                    flashOnEditorOpen: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
                    showOpenInVsCode: true,
                    showRecentlyOpenedWidgets: true,
                    showOpenHistory: true,
                    recentWidgets: [],
                    recentRecords: [],
                    // Not surfaced in the Preferences dialog — just carried through load/save/export/import
                    // so Code Search+'s own preference lives on the shared preference row.
                    lastCodeSearchGroup: null,
                    // Last-saved editor order/visibility, so the Preferences dialog reflects saved state, not live changes.
                    editorOrder: [],
                    editorVisibility: {},
                };
                $scope.recentWidgetsResolved = [];
                $scope.showUserPrefsModal = false;
                $scope.userPrefsEdit = {};
                $scope.classPortals = null; // null = not yet loaded; [] = loaded (possibly empty)
                $scope.showOptionSchemaModal = false;
                $scope.optionSchemaLoading = false;
                $scope.optionSchemaLoadError = null;
                $scope.optionSchemaSaveError = null;
                $scope.optionSchemaSaving = false;
                $scope.optionSchemaJsonInvalid = false;
                $scope.showDemoDataModal = false;
                $scope.demoDataLoading = false;
                $scope.demoDataLoadError = null;
                $scope.demoDataSaveError = null;
                $scope.demoDataSaving = false;
                $scope.demoDataJsonInvalid = false;

                // Persistent pane state map (key → pane object). Prevents state loss on rebuild.
                var paneMap = {};
                // Extra panes for open templates / providers
                var extraPanes = [];
                // Monaco editor instances (key → monaco.editor instance)
                var monacoEditors = {};
                // Option schema modal editor instance
                var _optionSchemaEditor = null;
                // Demo data modal editor instance
                var _demoDataEditor = null;
                // XML modal editor instance
                var _xmlEditor = null;
                // Original values loaded from server (used for dirty-checking)
                var originalValues = {};
                // Last-known server values (used for external-change detection)
                var lastServerValues = {};
                // AMB channel subscription for widget presence
                var presenceChannel = null;
                // Widget sys_id used for presence — stored so stop can reference it
                var _presenceWidgetSysId = null;
                // ESLint lint worker state
                var _lintWorker = null; // SharedWorker port or dedicated Worker
                var _lintWorkerReady = false;
                var _lintSeq = 0; // monotonic request counter
                var _lintSeqMap = {}; // seq → { paneKey, model }
                var _lintLatestSeq = {}; // paneKey → latest seq (stale-result guard)
                var _lintTimers = {}; // paneKey → debounce timer id
                var _lintEditorLangs = {}; // paneKey → language ('javascript'|'html'|'scss'…)
                var _lintEditorIsServer = {}; // paneKey → true if this is the server script field
                var _es12Enabled = false; // tracks current ES12 mode for per-pane config
                var _lintMarkerWatcherActive = false; // true once onDidChangeMarkers is registered
                var _isInitialPaneBuild = true; // apply one-time pane auto-visibility rules on first load only

                $scope.visibleItems = [];

                // AJAX helper — GlideAjax → WidgetEditorAjax Script Include
                function ajax(action, params) {
                    var deferred = $q.defer();
                    var creating = $scope.isWidgetRecord === false && $scope.isNewWidget && action === 'saveWidget';
                    if (creating) {
                        if ($scope.creatingRecord) {
                            deferred.resolve({ success: false, error: 'Record creation is already in progress.' });
                            return deferred.promise;
                        }
                        $scope.creatingRecord = true;
                        deferred.promise.finally(function () {
                            $scope.creatingRecord = false;
                        });
                    }
                    var ga = new GlideAjax(AJAX_SCRIPT);
                    ga.addParam('sysparm_name', action);
                    if (creating) ga.addParam('new_record', 'true');
                    ga.addParam('record_table', (params && params.record_table) || RECORD_TABLE);
                    if ($scope.isWidgetRecord === false && (action === 'saveWidget' || action === 'saveField')) {
                        var originals = {};
                        var payload = action === 'saveField' ? {} : JSON.parse(params.data);
                        if (action === 'saveField') payload[params.field] = params.value;
                        Object.keys(payload).forEach(function (name) {
                            originals[name] = Object.prototype.hasOwnProperty.call(originalValues, name)
                                ? originalValues[name]
                                : originalHeader[name];
                        });
                        ga.addParam('original', JSON.stringify(originals));
                    }
                    if (params) {
                        Object.keys(params).forEach(function (k) {
                            ga.addParam(k, params[k] != null ? String(params[k]) : '');
                        });
                    }
                    ga.getXML(function (response) {
                        if (!response || !response.responseXML || !response.responseXML.documentElement) {
                            deferred.resolve({
                                success: false,
                                error: 'No response from server. Check permissions or network connection.',
                            });
                            return;
                        }
                        var answer = response.responseXML.documentElement.getAttribute('answer');
                        if (answer == null || answer === '') {
                            deferred.resolve({
                                success: false,
                                error: 'Write permission denied. You lack the required role (sp_admin) or permission to perform this action.',
                            });
                            return;
                        }
                        try {
                            var parsed = JSON.parse(answer);
                            if (!parsed || typeof parsed !== 'object') {
                                deferred.resolve({
                                    success: false,
                                    error: 'Invalid response from server.',
                                });
                            } else {
                                deferred.resolve(parsed);
                            }
                        } catch (e) {
                            deferred.resolve({
                                success: false,
                                error: 'Failed to process server response (' + (e.message || 'Parse error') + ')',
                            });
                        }
                    });
                    return deferred.promise;
                }

                // Widget Editor+ Assistant's favourite groups live in their own script
                // include/preference row (not this app's), but are folded into this app's
                // preferences export/import so a single JSON file round-trips both.
                function _assistantAjax(action, params) {
                    var deferred = $q.defer();
                    var ga = new GlideAjax('WidgetEditorAssistantAjax');
                    ga.addParam('sysparm_name', action);
                    if (params) {
                        Object.keys(params).forEach(function (k) {
                            ga.addParam(k, params[k] != null ? String(params[k]) : '');
                        });
                    }
                    ga.getXML(function (response) {
                        var answer =
                            response && response.responseXML && response.responseXML.documentElement
                                ? response.responseXML.documentElement.getAttribute('answer')
                                : null;
                        try {
                            deferred.resolve(answer ? JSON.parse(answer) : { success: false });
                        } catch (e) {
                            deferred.resolve({ success: false });
                        }
                    });
                    return deferred.promise;
                }

                // Trimmed + case-insensitive, matching the Assistant's own uniqueness rule.
                function _normalizeGroupName(name) {
                    return (name || '').trim().toLowerCase();
                }

                // Widget picker
                function _buildSavePayload() {
                    $scope.coreEditorDefs.forEach(function (def) {
                        if (monacoEditors[def.key]) {
                            $scope.widget[def.field] = monacoEditors[def.key].getValue();
                        }
                    });
                    if ($scope.isWidgetRecord === false) {
                        var recordPayload = {};
                        $scope.coreEditorDefs.forEach(function (def) {
                            var value = $scope.widget[def.field] || '';
                            if (
                                !def.readOnly &&
                                ($scope.isNewWidget || !_editorValuesEqual(value, originalValues[def.field]))
                            )
                                recordPayload[def.field] = value;
                        });
                        $scope.additionalWidgetFields.forEach(function (def) {
                            var value = _normaliseExtraWidgetFieldValue(def, $scope.widget[def.name]);
                            if (def.canWrite && ($scope.isNewWidget || value !== originalHeader[def.name]))
                                recordPayload[def.name] = value;
                        });
                        return recordPayload;
                    }
                    if ($scope.widget.is_public) {
                        $scope.rolesList.length = 0;
                    }
                    $scope.widget.roles = $scope.rolesList.join(',');
                    var payload = {
                        name: $scope.widget.name,
                        id: $scope.widget.id,
                        description: $scope.widget.description,
                        controller_as: $scope.widget.controller_as || 'c',
                        public: $scope.widget.is_public,
                        roles: $scope.widget.roles,
                        static: !!$scope.widget.static,
                        template: $scope.widget.template || '',
                        css: $scope.widget.css || '',
                        client_script: $scope.widget.client_script || '',
                        script: $scope.widget.script || '',
                        link: $scope.widget.link || '',
                    };

                    ($scope.additionalWidgetFields || []).forEach(function (fieldDef) {
                        payload[fieldDef.name] =
                            fieldDef.type === 'boolean'
                                ? !!$scope.widget[fieldDef.name]
                                : $scope.widget[fieldDef.name] || '';
                    });

                    return payload;
                }

                // Guards against a stale, slower response overwriting a newer one.
                var _widgetListRequestId = 0;
                function loadWidgetList(search) {
                    $scope.pickerLoading = true;
                    $scope.pickerHasMore = false;
                    var requestId = ++_widgetListRequestId;
                    var table = $scope.picker.table;
                    $scope.pickerError = null;
                    ajax(table === 'sp_widget' ? 'getWidgets' : 'getEditorRecords', {
                        record_table: table,
                        search: search,
                        offset: 0,
                    }).then(
                        function (d) {
                            if (requestId !== _widgetListRequestId) {
                                return;
                            }
                            $scope.pickerActiveSearch = search;
                            $scope.pickerWidgets =
                                d.success && d.widgets
                                    ? d.widgets.map(function (w) {
                                          w.table = table;
                                          w.widgetEditorUrl = buildWidgetEditorUrl(w.sys_id, table);
                                          return w;
                                      })
                                    : [];
                            $scope.pickerTotal = d.success ? d.total || 0 : 0;
                            $scope.pickerHasMore =
                                d.has_more !== undefined
                                    ? d.has_more
                                    : $scope.pickerWidgets.length < $scope.pickerTotal;
                            $scope.pickerOffset = d.next_offset || $scope.pickerWidgets.length;
                            $scope.pickerError = d.success ? null : d.error || 'Could not load records.';
                            $scope.pickerLoading = false;
                        },
                        function () {
                            if (requestId !== _widgetListRequestId) {
                                return;
                            }
                            $scope.pickerActiveSearch = search;
                            $scope.pickerWidgets = [];
                            $scope.pickerTotal = 0;
                            $scope.pickerHasMore = false;
                            $scope.pickerError = 'Could not load records. Try searching again.';
                            $scope.pickerLoading = false;
                        }
                    );
                }

                $scope.loadMoreWidgets = function () {
                    if ($scope.pickerLoading || $scope.pickerLoadingMore || !$scope.pickerHasMore) {
                        return;
                    }
                    $scope.pickerLoadingMore = true;
                    var requestId = _widgetListRequestId;
                    var search = $scope.pickerActiveSearch;
                    var table = $scope.picker.table;
                    ajax(table === 'sp_widget' ? 'getWidgets' : 'getEditorRecords', {
                        record_table: table,
                        search: search,
                        offset: $scope.pickerOffset,
                    }).then(
                        function (d) {
                            $scope.pickerLoadingMore = false;
                            if (requestId !== _widgetListRequestId) {
                                return;
                            }
                            var more =
                                d.success && d.widgets
                                    ? d.widgets.map(function (w) {
                                          w.table = table;
                                          w.widgetEditorUrl = buildWidgetEditorUrl(w.sys_id, table);
                                          return w;
                                      })
                                    : [];
                            $scope.pickerWidgets = $scope.pickerWidgets.concat(more);
                            $scope.pickerTotal = d.success ? d.total || 0 : $scope.pickerTotal;
                            $scope.pickerHasMore =
                                d.has_more !== undefined
                                    ? d.has_more
                                    : $scope.pickerWidgets.length < $scope.pickerTotal;
                            $scope.pickerOffset = d.next_offset || $scope.pickerWidgets.length;
                            if (!d.success) $scope.pickerError = d.error || 'Could not load more records.';
                        },
                        function () {
                            $scope.pickerLoadingMore = false;
                        }
                    );
                };

                var pickerDebounce;
                $scope.onPickerSearch = function () {
                    $scope.pickerLoading = true;
                    $timeout.cancel(pickerDebounce);
                    pickerDebounce = $timeout(function () {
                        loadWidgetList($scope.picker.search);
                    }, 250);
                };

                $scope.clearPickerSearch = function () {
                    $scope.picker.search = '';
                    $scope.pickerLoading = true;
                    $scope.onPickerSearch();
                };

                $scope.onPickerTypeChange = function () {
                    ++_widgetListRequestId;
                    $scope.picker.search = '';
                    $scope.pickerWidgets = [];
                    $scope.pickerLoadingMore = false;
                    $timeout.cancel(pickerDebounce);
                    loadWidgetList('');
                };
                $scope.selectPickerRecordType = function (table) {
                    $scope.openDropdown = null;
                    if (table !== $scope.picker.table) {
                        $scope.picker.table = table;
                        $scope.onPickerTypeChange();
                    }
                    $timeout(function () {
                        var input = document.getElementById('we-picker-search');
                        if (input) input.focus();
                    }, 0);
                };
                $scope.pickerType = function () {
                    return (
                        $scope.recordTypes.find(function (type) {
                            return type.table === $scope.picker.table;
                        }) || { label: 'Records', singular: 'Record' }
                    );
                };
                $scope.recordTypeLabel = function (table) {
                    var type = $scope.recordTypes.find(function (entry) {
                        return entry.table === table;
                    });
                    return type ? type.singular : table;
                };
                $scope.onPickerSearchKeydown = function (event) {
                    var key = event && event.key;
                    var keyCode = event && event.keyCode;
                    if (key === 'ArrowDown' || keyCode === 40) {
                        event.preventDefault();
                        var firstItem = document.querySelector('.we-picker-col-main .we-picker-item');
                        if (firstItem && firstItem.focus) {
                            firstItem.focus();
                            if (typeof firstItem.scrollIntoView === 'function') {
                                firstItem.scrollIntoView({ block: 'nearest' });
                            }
                        }
                    } else if (key === 'ArrowUp' || keyCode === 38) {
                        event.preventDefault();
                        var allItems = document.querySelectorAll('.we-picker-col-main .we-picker-item');
                        if (allItems && allItems.length) {
                            var lastItem = allItems[allItems.length - 1];
                            if (lastItem && lastItem.focus) {
                                lastItem.focus();
                                if (typeof lastItem.scrollIntoView === 'function') {
                                    lastItem.scrollIntoView({
                                        block: 'nearest',
                                    });
                                }
                            }
                        }
                    } else if (key === 'Enter' || keyCode === 13) {
                        if ($scope.pickerWidgets && $scope.pickerWidgets.length > 0) {
                            event.preventDefault();
                            $scope.openWidget($scope.pickerWidgets[0]);
                        }
                    }
                };

                $scope.onPickerItemKeydown = function (event, w) {
                    _handleListItemKeydown(event, function () {
                        $scope.openWidget(w);
                    });
                };

                // Deprecated takes priority (most urgent), then ServiceNow, then plain read-only.
                $scope.widgetPickerIconClass = function (w) {
                    if (!w) {
                        return 'icon-script';
                    }
                    if (w.deprecated) {
                        return 'icon-error';
                    }
                    if (w.servicenow) {
                        return 'icon-brand-now';
                    }
                    if (w.canWrite === false) {
                        return 'icon-locked';
                    }
                    if (!w.table || w.table === 'sp_widget') return 'icon-script';
                    var type = $scope.recordTypes.find(function (entry) {
                        return entry.table === w.table;
                    });
                    return type && type.icon ? type.icon : 'icon-document-code';
                };

                function _handleListSearchKeydown(event, itemSelector, onEnterFirst) {
                    var key = event && event.key;
                    var keyCode = event && event.keyCode;
                    if (key === 'ArrowDown' || keyCode === 40) {
                        event.preventDefault();
                        var firstItem = document.querySelector(itemSelector);
                        if (firstItem && firstItem.focus) {
                            firstItem.focus();
                            if (typeof firstItem.scrollIntoView === 'function') {
                                firstItem.scrollIntoView({ block: 'nearest' });
                            }
                        }
                    } else if (key === 'ArrowUp' || keyCode === 38) {
                        event.preventDefault();
                        var allItems = document.querySelectorAll(itemSelector);
                        if (allItems && allItems.length) {
                            var lastItem = allItems[allItems.length - 1];
                            if (lastItem && lastItem.focus) {
                                lastItem.focus();
                                if (typeof lastItem.scrollIntoView === 'function') {
                                    lastItem.scrollIntoView({
                                        block: 'nearest',
                                    });
                                }
                            }
                        }
                    } else if (key === 'Enter' || keyCode === 13) {
                        if (typeof onEnterFirst === 'function') {
                            event.preventDefault();
                            onEnterFirst();
                        }
                    }
                }

                function _handleListItemKeydown(event, onSelect) {
                    var key = event && event.key;
                    var keyCode = event && event.keyCode;

                    if (key === 'Enter' || keyCode === 13 || key === ' ' || key === 'Spacebar' || keyCode === 32) {
                        if (event.target && event.target.closest && event.target.closest('.we-picker-action-btn')) {
                            return;
                        }
                        event.preventDefault();
                        if (typeof onSelect === 'function') {
                            onSelect();
                        }
                        return;
                    }

                    if (key === 'ArrowDown' || keyCode === 40) {
                        event.preventDefault();
                        var el = event.currentTarget;
                        var list = el && el.parentElement;
                        if (!list) return;
                        // Every picker list is paginated except recent widgets, which has no fixed "last item" to wrap to.
                        var noWrap = !(list.closest && list.closest('.we-picker-col-recent'));
                        var items = list.querySelectorAll('.we-picker-item');
                        if (!items || !items.length) return;
                        var idx = Array.prototype.indexOf.call(items, el);
                        if (idx === items.length - 1 && noWrap) {
                            return;
                        }
                        var nextIdx = idx >= 0 && idx < items.length - 1 ? idx + 1 : 0;
                        var nextItem = items[nextIdx];
                        if (nextItem && nextItem.focus) {
                            nextItem.focus();
                            if (typeof nextItem.scrollIntoView === 'function') {
                                nextItem.scrollIntoView({ block: 'nearest' });
                            }
                        }
                    } else if (key === 'ArrowUp' || keyCode === 38) {
                        event.preventDefault();
                        var el = event.currentTarget;
                        var list = el && el.parentElement;
                        if (!list) return;
                        var noWrap = !(list.closest && list.closest('.we-picker-col-recent'));
                        var items = list.querySelectorAll('.we-picker-item');
                        if (!items || !items.length) return;
                        var idx = Array.prototype.indexOf.call(items, el);
                        if (idx === 0 && noWrap) {
                            return;
                        }
                        var prevIdx = idx > 0 ? idx - 1 : items.length - 1;
                        var prevItem = items[prevIdx];
                        if (prevItem && prevItem.focus) {
                            prevItem.focus();
                            if (typeof prevItem.scrollIntoView === 'function') {
                                prevItem.scrollIntoView({ block: 'nearest' });
                            }
                        }
                    }
                }

                $scope.clearLinkDepSearch = function () {
                    $scope.linkDependency.search = '';
                    $scope.linkDependencySearching = true;
                    $scope.onLinkDependencySearch();
                };
                $scope.onLinkDepSearchKeydown = function (event) {
                    _handleListSearchKeydown(
                        event,
                        '[we-modal-dialog="showLinkDependencyModal"] .we-picker-item',
                        function () {
                            if ($scope.linkDependencyResults && $scope.linkDependencyResults.length > 0) {
                                $scope.selectLinkDependency($scope.linkDependencyResults[0]);
                            }
                        }
                    );
                };
                $scope.onLinkDepItemKeydown = function (event, dep) {
                    _handleListItemKeydown(event, function () {
                        $scope.selectLinkDependency(dep);
                    });
                };

                $scope.clearLinkProviderSearch = function () {
                    $scope.linkProvider.search = '';
                    $scope.linkProviderSearching = true;
                    $scope.onLinkProviderSearch();
                };
                $scope.onLinkProviderSearchKeydown = function (event) {
                    _handleListSearchKeydown(
                        event,
                        '[we-modal-dialog="showLinkProviderModal"] .we-picker-item',
                        function () {
                            if ($scope.linkProviderResults && $scope.linkProviderResults.length > 0) {
                                $scope.selectLinkProvider($scope.linkProviderResults[0]);
                            }
                        }
                    );
                };
                $scope.onLinkProviderItemKeydown = function (event, p) {
                    _handleListItemKeydown(event, function () {
                        $scope.selectLinkProvider(p);
                    });
                };

                $scope.onOpenPortalInstanceKeydown = function (event, inst) {
                    _handleListItemKeydown(event, function () {
                        $scope.selectOpenOnPortalInstance(inst);
                    });
                };
                $scope.onOpenPortalPortalKeydown = function (event, portal) {
                    _handleListItemKeydown(event, function () {
                        $scope.selectOpenOnPortalPortal(portal);
                    });
                };

                function buildWidgetEditorUrl(widgetSysId, table) {
                    return (
                        '/ui_page.do?sys_id=' +
                        window.WE_CONFIG.widgetPageSysId +
                        (table && table !== 'sp_widget'
                            ? '&record_table=' +
                              encodeURIComponent(table) +
                              (widgetSysId ? '&record_sys_id=' + encodeURIComponent(widgetSysId) : '')
                            : '&widget_id=' + encodeURIComponent(widgetSysId))
                    );
                }
                $scope.recordEditorUrl = buildWidgetEditorUrl;

                function _mergeRecentWidget(list, sysId) {
                    var merged = (list || []).filter(function (id) {
                        return id !== sysId;
                    });
                    merged.unshift(sysId);
                    return merged.slice(0, 10);
                }

                function _refreshRecentWidgetsResolved() {
                    var recent = _recentRecordEntries();
                    if (recent.length) {
                        var tables = {};
                        recent.forEach(function (entry) {
                            (tables[entry.table] || (tables[entry.table] = [])).push(entry.sys_id);
                        });
                        return $q
                            .all(
                                Object.keys(tables).map(function (table) {
                                    return ajax(table === 'sp_widget' ? 'getWidgetsBySysIds' : 'getEditorRecords', {
                                        record_table: table,
                                        sys_ids: tables[table].join(','),
                                    }).then(function (data) {
                                        return (data.success ? data.widgets : []).map(function (record) {
                                            record.table = table;
                                            return record;
                                        });
                                    });
                                })
                            )
                            .then(function (groups) {
                                var resolved = {};
                                groups.forEach(function (records) {
                                    records.forEach(function (record) {
                                        resolved[record.table + ':' + record.sys_id] = record;
                                    });
                                });
                                $scope.recentWidgetsResolved = recent
                                    .map(function (entry) {
                                        return resolved[entry.table + ':' + entry.sys_id];
                                    })
                                    .filter(Boolean);
                            });
                    }
                    $scope.recentWidgetsResolved = [];
                }

                $scope.clearWidgetHistory = function () {
                    $scope.userPrefs.recentWidgets = [];
                    $scope.userPrefs.recentRecords = [];
                    $scope.recentWidgetsResolved = [];
                    saveUserPrefs();
                };

                $scope.removeRecentWidget = function (w) {
                    $scope.userPrefs.recentRecords = _recentRecordEntries().filter(function (entry) {
                        return entry.table !== (w.table || 'sp_widget') || entry.sys_id !== w.sys_id;
                    });
                    if (!w.table || w.table === 'sp_widget') {
                        $scope.userPrefs.recentWidgets = $scope.userPrefs.recentWidgets.filter(function (id) {
                            return id !== w.sys_id;
                        });
                    }
                    $scope.recentWidgetsResolved = $scope.recentWidgetsResolved.filter(function (r) {
                        return r.sys_id !== w.sys_id || r.table !== w.table;
                    });
                    saveUserPrefs();
                };

                $scope.toggleRecentWidgetsPane = function () {
                    $scope.userPrefs.showOpenHistory = !$scope.userPrefs.showOpenHistory;
                    saveUserPrefs();
                };

                function navigateToWidget(w) {
                    if (w.href) {
                        _bypassUnloadWarning = true;
                        window.location.href = w.href;
                        return;
                    }
                    var table = w.table || 'sp_widget';
                    var recentWidgets =
                        table === 'sp_widget'
                            ? _mergeRecentWidget($scope.userPrefs.recentWidgets, w.sys_id)
                            : $scope.userPrefs.recentWidgets;
                    var recentRecords = _mergeRecentRecord(table, w.sys_id);
                    var go = function () {
                        window.location.href = buildWidgetEditorUrl(w.sys_id, table);
                    };
                    saveUserPrefs({ recentWidgets: recentWidgets, recentRecords: recentRecords }).then(go, go);
                }

                $scope.recentWidgetUrl = function (w) {
                    return buildWidgetEditorUrl(w.sys_id, w.table);
                };

                function _recentRecordEntries() {
                    var entries = ($scope.userPrefs.recentRecords || []).slice();
                    ($scope.userPrefs.recentWidgets || []).forEach(function (id) {
                        if (
                            !entries.some(function (entry) {
                                return entry.table === 'sp_widget' && entry.sys_id === id;
                            })
                        )
                            entries.push({ table: 'sp_widget', sys_id: id });
                    });
                    return entries.slice(0, 10);
                }
                function _mergeRecentRecord(table, id) {
                    return [{ table: table, sys_id: id }]
                        .concat(
                            _recentRecordEntries().filter(function (entry) {
                                return entry.table !== table || entry.sys_id !== id;
                            })
                        )
                        .slice(0, 10);
                }

                $scope.openWidget = function (w) {
                    $scope.showWidgetPickerModal = false;
                    if (hasUnsavedChanges()) {
                        $scope.pendingWidgetNav = w;
                    } else {
                        navigateToWidget(w);
                    }
                };

                function handleAppNavigation(event) {
                    if (!hasUnsavedChanges()) return;
                    event.preventDefault();
                    $scope.$evalAsync(function () {
                        $scope.pendingWidgetNav = event.detail;
                    });
                }
                document.addEventListener('we-app-navigate', handleAppNavigation);
                $scope.$on('$destroy', function () {
                    document.removeEventListener('we-app-navigate', handleAppNavigation);
                });

                function navigateToNewWidget(table) {
                    _bypassUnloadWarning = true;
                    window.location.href = buildWidgetEditorUrl('', table || 'sp_widget') + '&new=1';
                }

                $scope.newWidget = function (table) {
                    table = table || 'sp_widget';
                    $scope.openDropdown = null;
                    $scope.showWidgetPickerModal = false;
                    if (hasUnsavedChanges()) {
                        $scope.pendingNewWidget = table;
                    } else {
                        navigateToNewWidget(table);
                    }
                };

                $scope.newRecord = function (table) {
                    table = table || RECORD_TABLE;
                    if (
                        !$scope.recordTypes.some(function (type) {
                            return type.table === table && type.allowCreate !== false;
                        })
                    )
                        return;
                    $scope.newWidget(table);
                };

                $scope.cancelNewWidget = function () {
                    if (!$scope.savingBeforeNewRecord) $scope.pendingNewWidget = false;
                };
                $scope.discardAndNewWidget = function () {
                    if ($scope.savingBeforeNewRecord || !_discardPageDraft()) return;
                    var table = $scope.pendingNewWidget || 'sp_widget';
                    $scope.pendingNewWidget = false;
                    navigateToNewWidget(table);
                };
                $scope.saveAndNewWidget = function () {
                    if ($scope.savingBeforeNewRecord) return;
                    var table = $scope.pendingNewWidget || 'sp_widget';
                    var payload = _buildSavePayload();
                    $scope.savingBeforeNewRecord = true;
                    $scope.saveError = null;
                    return ajax('saveWidget', {
                        sys_id: SYS_ID,
                        data: JSON.stringify(payload),
                    })
                        .then(function (data) {
                            if (!data.success) {
                                $scope.saveError = data.error || 'Save failed';
                                return;
                            }
                            _acceptWidgetSave(payload);
                            if (!$scope.isNewWidget && hasUnsavedChanges()) {
                                $scope.saveError =
                                    'Some fields still have unsaved changes. Save those fields before continuing.';
                                return;
                            }
                            $scope.pendingNewWidget = false;
                            navigateToNewWidget(table);
                        })
                        .catch(function (error) {
                            $scope.saveError = (error && error.message) || 'Save failed';
                        })
                        .finally(function () {
                            $scope.savingBeforeNewRecord = false;
                        });
                };

                $scope.openWidgetPickerModal = function () {
                    $scope.openDropdown = null;
                    $scope.picker.search = '';
                    $scope.pickerWidgets = [];
                    $scope.pickerLoading = true;
                    loadWidgetList('');
                    _refreshRecentWidgetsResolved();
                    $scope.showWidgetPickerModal = true;
                };

                $scope.closeWidgetPickerModal = function () {
                    $scope.openDropdown = null;
                    $scope.showWidgetPickerModal = false;
                };

                $scope.cancelWidgetNav = function () {
                    if (!$scope.savingBeforeWidgetNav) $scope.pendingWidgetNav = null;
                };

                $scope.discardAndOpenWidget = function () {
                    if ($scope.savingBeforeWidgetNav || !$scope.pendingWidgetNav || !_discardPageDraft()) return;
                    var target = $scope.pendingWidgetNav;
                    $scope.pendingWidgetNav = null;
                    _bypassUnloadWarning = true;
                    navigateToWidget(target);
                };

                $scope.saveAndOpenWidget = function () {
                    if ($scope.savingBeforeWidgetNav || !$scope.pendingWidgetNav) return;
                    var target = $scope.pendingWidgetNav;
                    var payload = _buildSavePayload();
                    $scope.savingBeforeWidgetNav = true;
                    $scope.saveError = null;
                    return ajax('saveWidget', {
                        sys_id: SYS_ID,
                        data: JSON.stringify(payload),
                    })
                        .then(function (data) {
                            if (!data.success) {
                                $scope.saveError = data.error || 'Save failed';
                                return;
                            }
                            _acceptWidgetSave(payload);
                            if (!$scope.isNewWidget && hasUnsavedChanges()) {
                                $scope.saveError =
                                    'Some fields still have unsaved changes. Save those fields before continuing.';
                                return;
                            }
                            $scope.pendingWidgetNav = null;
                            navigateToWidget(target);
                        })
                        .catch(function (error) {
                            $scope.saveError = (error && error.message) || 'Save failed';
                        })
                        .finally(function () {
                            $scope.savingBeforeWidgetNav = false;
                        });
                };

                // Initialisation
                function _snapshotEditorPrefs() {
                    $scope.userPrefs.editorOrder = $scope.coreEditorDefs.map(function (d) {
                        return d.key;
                    });
                    $scope.userPrefs.editorVisibility = {};
                    $scope.coreEditorDefs.forEach(function (d) {
                        $scope.userPrefs.editorVisibility[d.key] = d.visible;
                    });
                }

                function _applyUserPrefsData(p) {
                    var layout = $scope.isWidgetRecord === false ? {} : p;
                    $scope.widgetEditorLayout = {};
                    ['template', 'css', 'client_script', 'script', 'link', 'order'].forEach(function (key) {
                        if (p[key] !== undefined) $scope.widgetEditorLayout[key] = angular.copy(p[key]);
                    });
                    if (Array.isArray(p.recentRecords))
                        $scope.userPrefs.recentRecords = p.recentRecords
                            .filter(function (entry) {
                                return entry && typeof entry.table === 'string' && /^[a-f0-9]{32}$/i.test(entry.sys_id);
                            })
                            .slice(0, 10);
                    if (layout.order && Array.isArray(layout.order)) {
                        var ordered = [];
                        layout.order.forEach(function (key) {
                            var def = $scope.coreEditorDefs.filter(function (d) {
                                return d.key === key;
                            })[0];
                            if (def) {
                                ordered.push(def);
                            }
                        });
                        $scope.coreEditorDefs.forEach(function (d) {
                            if (
                                !ordered.some(function (od) {
                                    return od.key === d.key;
                                })
                            ) {
                                ordered.push(d);
                            }
                        });
                        $scope.coreEditorDefs.length = 0;
                        ordered.forEach(function (d) {
                            $scope.coreEditorDefs.push(d);
                        });
                    }
                    $scope.coreEditorDefs.forEach(function (d) {
                        if (layout.hasOwnProperty(d.key)) d.visible = layout[d.key];
                    });
                    _snapshotEditorPrefs();
                    [
                        'formatTabsToSpaces',
                        'wordWrap',
                        'editorTheme',
                        'minimap',
                        'alwaysShowLink',
                        'realtimeWidgetUpdates',
                        'autoIndent',
                        'formatOnPaste',
                        'formatOnType',
                        'autoSurround',
                        'autoClosingBrackets',
                        'autoClosingQuotes',
                    ].forEach(function (k) {
                        if (p.hasOwnProperty(k)) {
                            $scope.userPrefs[k] = p[k];
                        }
                    });
                    ['htmlClassPortalSysId', 'htmlClassPortalUrlSuffix', 'htmlClassThemeSysId'].forEach(function (k) {
                        if (p.hasOwnProperty(k)) {
                            $scope.userPrefs[k] = p[k];
                        }
                    });
                    [
                        'htmlValidation',
                        'htmlAutoCloseTags',
                        'languageHelpers',
                        'showUnusedVars',
                        'stickyScroll',
                        'insertSpaceBeforeFuncParen',
                        'linkedEditing',
                        'flashOnEditorOpen',
                        'showOpenInVsCode',
                        'showRecentlyOpenedWidgets',
                        'showOpenHistory',
                        'showAssistantButton',
                        'htmlClassIncludeStandardCss',
                    ].forEach(function (k) {
                        if (p.hasOwnProperty(k)) {
                            $scope.userPrefs[k] = !!p[k];
                        }
                    });
                    if (p.contextMenuMode === 'standard' || p.contextMenuMode === 'off') {
                        $scope.userPrefs.contextMenuMode = p.contextMenuMode;
                    } else if (p.hasOwnProperty('contextMenuMode')) {
                        $scope.userPrefs.contextMenuMode = 'enhanced';
                    }
                    if (window.SNMonacoPlus && SNMonacoPlus.setUnusedVarsEnabled) {
                        SNMonacoPlus.setUnusedVarsEnabled($scope.userPrefs.showUnusedVars);
                    }
                    if (_validAutosaveInterval(p.autosaveInterval)) {
                        $scope.userPrefs.autosaveInterval = p.autosaveInterval;
                    }
                    if (_validDraftRetentionDays(p.draftRetentionDays)) {
                        $scope.userPrefs.draftRetentionDays = p.draftRetentionDays;
                    }
                    if (p.hasOwnProperty('fontSize')) {
                        var fs = parseInt(p.fontSize, 10);
                        if (fs >= 8 && fs <= 32) {
                            $scope.userPrefs.fontSize = fs;
                        }
                    }
                    if (p.hasOwnProperty('tabSize')) {
                        var ts = parseInt(p.tabSize, 10);
                        if (ts >= 1 && ts <= 8) {
                            $scope.userPrefs.tabSize = ts;
                        }
                    }
                    if (p.hasOwnProperty('remBase')) {
                        var rb = parseFloat(p.remBase);
                        if (rb > 0) {
                            $scope.userPrefs.remBase = rb;
                        }
                    }
                    /* fontFamily triggers Google Fonts loader */
                    if (p.hasOwnProperty('fontFamily')) {
                        $scope.userPrefs.fontFamily = p.fontFamily || '';
                        if ($scope.userPrefs.fontFamily) {
                            _loadGoogleFonts();
                        }
                    }
                    if (p.hasOwnProperty('recentWidgets') && Array.isArray(p.recentWidgets)) {
                        $scope.userPrefs.recentWidgets = p.recentWidgets;
                        _refreshRecentWidgetsResolved();
                    }
                    if (p.hasOwnProperty('ctrlSSaveActiveOnly')) {
                        $scope.userPrefs.ctrlSSaveActiveOnly = !!p.ctrlSSaveActiveOnly;
                    } else if (p.hasOwnProperty('ctrlSSaveAll')) {
                        // ctrlSSaveAll is inverted relative to ctrlSSaveActiveOnly.
                        $scope.userPrefs.ctrlSSaveActiveOnly = !p.ctrlSSaveAll;
                    }
                    /* Apply HTML toggles to the language module */
                    if (window.MONACO_LANGUAGE_HTML) {
                        if (MONACO_LANGUAGE_HTML.setValidationEnabled) {
                            MONACO_LANGUAGE_HTML.setValidationEnabled($scope.userPrefs.htmlValidation);
                        }
                        if (MONACO_LANGUAGE_HTML.setAutoCloseTagsEnabled) {
                            MONACO_LANGUAGE_HTML.setAutoCloseTagsEnabled($scope.userPrefs.htmlAutoCloseTags);
                        }
                    }
                    // Retrigger now that userPrefs.htmlClassPortal* are populated.
                    loadHtmlMonarchDts();
                }

                function init() {
                    ajax('getEditorRecordTypes', {}).then(function (data) {
                        if (data.success) {
                            $scope.recordTypes = data.types;
                            var type = data.types.find(function (item) {
                                return item.table === RECORD_TABLE;
                            });
                            $scope.recordAllowsCreate = !!type && type.allowCreate !== false;
                            if (type) $scope.recordLabel = type.singular;
                        }
                    });
                    if (!SYS_ID) {
                        if (IS_NEW && $scope.isWidgetRecord) {
                            $scope.isNewWidget = true;
                            $scope.widget = {
                                name: '',
                                id: '',
                                description: '',
                                controller_as: 'c',
                                is_public: false,
                                roles: '',
                                template: '',
                                css: '',
                                client_script: '',
                                script: '',
                                link: '',
                                es12: true,
                                is_header_footer: false,
                                static: false,
                                option_schema_has_value: false,
                                demo_data_has_value: false,
                            };
                            $scope.es12RecordExists = false;
                            $scope.rolesList = [];
                            originalHeader = {
                                name: '',
                                id: '',
                                description: '',
                                controller_as: 'c',
                                is_public: false,
                                roles: '',
                                static: false,
                            };
                            originalValues = {
                                template: '',
                                css: '',
                                client_script: '',
                                script: '',
                                link: '',
                            };
                            lastServerValues = angular.copy(originalValues);
                            $q.all([ajax('getUserPrefs', {}), ajax('getWidgetDefaults', {})])
                                .then(function (results) {
                                    var prefsData = results[0];
                                    var defaultsData = results[1];
                                    _draftRetentionLoaded = !!(prefsData && prefsData.success);
                                    if (prefsData && prefsData.success && prefsData.value) {
                                        try {
                                            _applyUserPrefsData(JSON.parse(prefsData.value));
                                        } catch (e) {
                                            _draftRetentionLoaded = false;
                                        }
                                    }
                                    if (defaultsData && defaultsData.success) {
                                        _setAdditionalWidgetFields(defaultsData.additional_widget_fields);
                                        _applyAdditionalWidgetFieldDefaults();

                                        var d = defaultsData.defaults || {};
                                        ['template', 'css', 'client_script', 'script', 'link'].forEach(function (f) {
                                            if (d[f]) {
                                                $scope.widget[f] = d[f];
                                                originalValues[f] = d[f];
                                                lastServerValues[f] = d[f];
                                            }
                                        });
                                        $scope.widget.application = defaultsData.application || '';
                                        $scope.widget.application_sys_id = defaultsData.application_sys_id || '';
                                    }
                                    $scope.loading = false;
                                    buildVisibleItems();
                                    initAllEditors();
                                    _findLocalDrafts();
                                })
                                .catch(function () {
                                    $scope.loading = false;
                                    buildVisibleItems();
                                    initAllEditors();
                                });
                            ajax('getProviderChoices').then(function (d) {
                                if (d.success) {
                                    $scope.providerTypeChoices = d.choices;
                                }
                            });
                            $window.addEventListener('beforeunload', stopPresenceSubscription);
                            return;
                        }
                        if (!IS_NEW) {
                            $scope.showPicker = true;
                            $scope.loading = false;
                            loadWidgetList('');
                            ajax('getUserPrefs', {}).then(function (prefsData) {
                                _draftRetentionLoaded = !!(prefsData && prefsData.success);
                                if (prefsData && prefsData.success && prefsData.value) {
                                    try {
                                        _applyUserPrefsData(JSON.parse(prefsData.value));
                                    } catch (e) {
                                        _draftRetentionLoaded = false;
                                    }
                                }
                                _findLocalDrafts();
                            });
                            return;
                        }
                        $scope.isNewWidget = true;
                    }

                    // Widget + prefs are independent — fetch in parallel; side-data also parallel
                    $q.all([
                        ajax($scope.isNewWidget ? 'getWidgetDefaults' : 'getWidget', {
                            sys_id: SYS_ID,
                        }),
                        ajax('getUserPrefs', {}),
                    ])
                        .then(function (results) {
                            var data = results[0];
                            var prefsData = results[1];
                            if (!data.success) {
                                throw new Error(data.error || 'Failed to load widget');
                            }

                            $scope.widget = data.widget;
                            if ($scope.isWidgetRecord === false) {
                                $scope.recordLabel = data.record_label;
                                $scope.recordPrimaryField = data.primary_field;
                                $scope.coreEditorDefs = data.core_editor_defs;
                                APP_TITLE = data.record_label + ' Editor+';
                            }
                            _setAdditionalWidgetFields(data.additional_widget_fields);
                            var wo = data.widget.widgetOrigin;
                            if (wo && wo.created_on) {
                                // SN returns UTC "YYYY-MM-DD HH:MM:SS"; inserting T makes Date() parse it as UTC.
                                var originDate = new Date(wo.created_on.replace(' ', 'T') + 'Z');
                                $scope.widgetOrigin = {
                                    year: originDate.getFullYear(),
                                    founder: wo.founder,
                                    tooltip: originDate.toLocaleString(),
                                };
                            } else {
                                $scope.widgetOrigin = null;
                            }
                            $scope.canWriteWidget = data.widget.canWrite !== false;
                            $scope.widgetSysPolicy = data.widget.sys_policy || '';
                            $scope.widgetSysPolicyDisplay = data.widget.sys_policy_display || '';
                            $scope.widgetIsServiceNow = !!data.widget.servicenow;
                            $scope.widgetVolatilityLevel = data.widget.volatility_level || '';
                            $scope.widgetVolatilityDisplay = data.widget.volatility_level_display || '';
                            $scope.snAlertDismissed = false;
                            $scope.volatilityAlertDismissed = false;
                            $scope.updateSetAlertDismissed = false;
                            $scope.permissionAlertDismissed = false;
                            $scope.dismissSnAlert = function () {
                                $scope.snAlertDismissed = true;
                            };
                            $scope.dismissVolatilityAlert = function () {
                                $scope.volatilityAlertDismissed = true;
                            };
                            $scope.dismissUpdateSetAlert = function () {
                                $scope.updateSetAlertDismissed = true;
                            };
                            $scope.hasSaveError = function () {
                                if ($scope.saveError) {
                                    return true;
                                }
                                return ($scope.visibleItems || []).some(function (item) {
                                    return item.type === 'pane' && !!item.saveError;
                                });
                            };
                            $scope.getSaveErrorMessage = function () {
                                if ($scope.saveError) {
                                    return $scope.saveError;
                                }
                                var paneWithErr = ($scope.visibleItems || []).find(function (item) {
                                    return item.type === 'pane' && item.saveError;
                                });
                                if (paneWithErr && paneWithErr.saveError) {
                                    return (paneWithErr.title ? paneWithErr.title + ': ' : '') + paneWithErr.saveError;
                                }
                                return 'Save failed. Check permissions or network connection.';
                            };
                            $scope.dismissSaveError = function () {
                                $scope.saveError = null;
                                ($scope.visibleItems || []).forEach(function (item) {
                                    if (item.type === 'pane') {
                                        item.saveError = null;
                                    }
                                });
                            };
                            $scope.updateSetMismatch = !!data.widget.update_set_mismatch;
                            $scope.widgetUpdateSetId = data.widget.widget_update_set_id || '';
                            $scope.widgetUpdateSetName = data.widget.widget_update_set_name || '';
                            if ($scope.widgetSysPolicy) {
                                $scope.canWriteWidget = false;
                            }
                            $scope.es12RecordExists = !!data.widget.es12_record_exists;
                            _applyEsVersion(!!data.widget.es12);
                            $scope.rolesList = parseRoles(data.widget.roles);
                            originalHeader = {
                                name: data.widget.name || '',
                                id: data.widget.id || '',
                                description: data.widget.description || '',
                                controller_as: data.widget.controller_as || 'c',
                                is_public: !!data.widget.is_public,
                                roles: parseRoles(data.widget.roles).join(','),
                                static: !!data.widget.static,
                            };
                            _captureAdditionalHeaderValues(data.widget);
                            loadSnTypeDefinitions(data.widget.application_sys_id);
                            loadHtmlMonarchDts();
                            registerMacroCompletions();
                            loadCodeActions();
                            if (window.SNMonacoPlusBootstrap) {
                                window.SNMonacoPlusBootstrap.ensureCoreLoaded().then(function (api) {
                                    if (api) {
                                        api.loadCssEditorSupport();
                                    }
                                });
                            }
                            originalValues = {
                                template: data.widget.template,
                                css: data.widget.css,
                                client_script: data.widget.client_script,
                                script: data.widget.script,
                                link: data.widget.link,
                            };
                            if ($scope.isWidgetRecord === false) {
                                originalValues = {};
                                $scope.coreEditorDefs.forEach(function (def) {
                                    originalValues[def.field] = data.widget[def.field] || '';
                                });
                            }
                            lastServerValues = angular.copy(originalValues);

                            _draftRetentionLoaded = !!(prefsData && prefsData.success);
                            if (prefsData && prefsData.success && prefsData.value) {
                                try {
                                    _applyUserPrefsData(JSON.parse(prefsData.value));
                                } catch (e) {
                                    _draftRetentionLoaded = false;
                                }
                            }

                            if (!$scope.isVersionView && SYS_ID) {
                                if ($scope.isWidgetRecord)
                                    $scope.userPrefs.recentWidgets = _mergeRecentWidget(
                                        $scope.userPrefs.recentWidgets,
                                        SYS_ID
                                    );
                                $scope.userPrefs.recentRecords = _mergeRecentRecord(RECORD_TABLE, SYS_ID);
                                saveUserPrefs({
                                    recentWidgets: $scope.userPrefs.recentWidgets,
                                    recentRecords: $scope.userPrefs.recentRecords,
                                });
                            }

                            if ($scope.isVersionView) {
                                return ajax('getVersion', {
                                    version_id: VERSION_ID,
                                    sys_id: SYS_ID,
                                });
                            }
                            return null;
                        })
                        .then(function (vd) {
                            if (vd && vd.success) {
                                $scope.versionInfo = {
                                    sys_created_on: vd.sys_created_on,
                                    sys_created_by: vd.sys_created_by,
                                    update_set_name: vd.update_set_name || '',
                                };
                                overlayVersionFields(vd.fields);
                            }

                            $scope.loading = false;
                            buildVisibleItems();
                            initAllEditors();
                            _findLocalDrafts(true);
                        })
                        .catch(function (err) {
                            $scope.loadError = 'Error: ' + (err.message || String(err));
                            $scope.loading = false;
                        });

                    // Side data — parallel, non-blocking
                    if ($scope.isNewWidget) return;
                    ajax('getVersions', {
                        sys_id: SYS_ID,
                    }).then(function (d) {
                        if (d.success) {
                            $scope.versions = d.versions;
                            // Auto-open the Versions dropdown once, on initial load only.
                            if (window.WE_CONFIG && window.WE_CONFIG.openPanel === 'versions') {
                                window.WE_CONFIG.openPanel = '';
                                $scope.toggleDropdown('versions');
                            }
                        }
                    });
                    if ($scope.isWidgetRecord === false) return;
                    ajax('getTemplates', {
                        sys_id: SYS_ID,
                    }).then(function (d) {
                        if (d.success) {
                            $scope.templates = d.templates;
                        }
                    });
                    ajax('getProviders', {
                        sys_id: SYS_ID,
                    }).then(function (d) {
                        if (d.success) {
                            $scope.providers = d.providers;
                            _syncProviderCompletions();
                        }
                    });
                    ajax('getDependencies', {
                        sys_id: SYS_ID,
                    }).then(function (d) {
                        if (d.success) {
                            $scope.dependencies = d.dependencies;
                        }
                    });
                    ajax('getProviderChoices').then(function (d) {
                        if (d.success) {
                            $scope.providerTypeChoices = d.choices;
                        }
                    });

                    // Presence — subscribe to AMB channel (real-time, no polling)
                    if (!$scope.isVersionView) {
                        startPresenceSubscription(SYS_ID);
                    }
                    if (!$scope.isVersionView) {
                        startRecordWatcher();
                    }
                    if (!$scope.isVersionView) {
                        startRevertListener();
                    }
                    $window.addEventListener('beforeunload', stopPresenceSubscription);
                }

                function overlayVersionFields(fields) {
                    if ($scope.isWidgetRecord === false) {
                        $scope.additionalWidgetFields.forEach(function (def) {
                            if (fields[def.name] !== undefined)
                                $scope.widget[def.name] =
                                    def.type === 'boolean'
                                        ? fields[def.name] === '1' || fields[def.name] === 'true'
                                        : fields[def.name];
                        });
                        $scope.coreEditorDefs.forEach(function (def) {
                            if (fields[def.field] !== undefined) $scope.widget[def.field] = fields[def.field];
                        });
                        return;
                    }
                    var map = {
                        public: function (v) {
                            $scope.widget.is_public = v === '1' || v === 'true';
                        },
                        roles: function (v) {
                            $scope.widget.roles = v;
                            $scope.rolesList = parseRoles(v);
                        },
                    };
                    [
                        'template',
                        'css',
                        'client_script',
                        'script',
                        'link',
                        'name',
                        'id',
                        'description',
                        'public',
                        'roles',
                    ].forEach(function (f) {
                        if (fields[f] === undefined) {
                            return;
                        }
                        if (map[f]) {
                            map[f](fields[f]);
                        } else {
                            $scope.widget[f] = fields[f];
                        }
                    });
                }

                // Pane management
                function getOrCreateCorePaneObj(def) {
                    if (!paneMap[def.key]) {
                        paneMap[def.key] = {
                            key: def.key,
                            label: def.label,
                            field: def.field,
                            language: def.language,
                            scriptKind: def.scriptKind,
                            readOnly: !!def.readOnly,
                            type: 'pane',
                            hasIdInput: false,
                            closeable: false,
                            dirty: false,
                            idDirty: false,
                            savedAt: null,
                            externalChange: null,
                            width: null,
                        };
                    }
                    return paneMap[def.key];
                }

                function buildVisibleItems() {
                    var panes = [];
                    var applyInitialLinkAutoShow = _isInitialPaneBuild;

                    $scope.coreEditorDefs.forEach(function (def) {
                        var show = def.visible;
                        // Auto-show Link editor only on initial widget load when enabled and
                        // the widget has a meaningful link value (more than 3 non-empty lines).
                        if (
                            !show &&
                            applyInitialLinkAutoShow &&
                            def.field === 'link' &&
                            $scope.userPrefs.alwaysShowLink &&
                            $scope.widget
                        ) {
                            var linkVal = $scope.widget.link || '';
                            var nonEmptyLines = linkVal.split('\n').filter(function (l) {
                                return l.trim() !== '';
                            }).length;
                            if (nonEmptyLines > 3) {
                                show = true;
                                // Persist visibility for this session after initial auto-show.
                                def.visible = true;
                            }
                        }
                        if (show) {
                            panes.push(getOrCreateCorePaneObj(def));
                        }
                    });

                    extraPanes.forEach(function (p) {
                        panes.push(p);
                    });

                    $scope.visiblePaneCount = panes.length;

                    var items = [];
                    panes.forEach(function (p, i) {
                        if (i > 0) {
                            items.push({
                                key: 'spl-' + i,
                                type: 'splitter',
                            });
                        }
                        items.push(p);
                    });
                    $scope.visibleItems = items;
                    _isInitialPaneBuild = false;
                }

                $scope.reorderPrefEditors = function (fromKey, toKey) {
                    var arr = $scope.userPrefsEdit.editors;
                    var fromIdx = -1,
                        toIdx = -1;
                    for (var i = 0; i < arr.length; i++) {
                        if (arr[i].key === fromKey) {
                            fromIdx = i;
                        }
                        if (arr[i].key === toKey) {
                            toIdx = i;
                        }
                    }
                    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) {
                        return;
                    }
                    var removed = arr.splice(fromIdx, 1)[0];
                    arr.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, removed);
                };

                // Monaco editor management — uses GlideEditorMonaco (ServiceNow wrapper)

                var _monacoThemesDefined = false;
                var _scssTokenizerSet = false;
                var _weJsonRegistered = false;
                function _ensureMonacoThemes() {
                    if (_monacoThemesDefined || !window.monaco || !monaco.editor) {
                        return;
                    }
                    _monacoThemesDefined = true;
                    monaco.editor.defineTheme('we-vs', {
                        base: 'vs',
                        inherit: true,
                        rules: [
                            { token: 'variable.scss', foreground: '9c27b0' },
                            {
                                token: 'attribute.name.ng',
                                foreground: '0070c1',
                                fontStyle: 'bold',
                            },
                            {
                                token: 'attribute.name.sp',
                                foreground: '0070c1',
                            },
                            { token: 'ng.delimiter', foreground: 'af00db' },
                            { token: 'ng.expression', foreground: '001080' },
                        ],
                        colors: {},
                    });
                    monaco.editor.defineTheme('we-vs-dark', {
                        base: 'vs-dark',
                        inherit: true,
                        rules: [
                            { token: 'variable.scss', foreground: 'c792ea' },
                            {
                                token: 'attribute.name.ng',
                                foreground: '569cd6',
                                fontStyle: 'bold',
                            },
                            {
                                token: 'attribute.name.sp',
                                foreground: '569cd6',
                            },
                            { token: 'ng.delimiter', foreground: 'c678dd' },
                            { token: 'ng.expression', foreground: '9cdcfe' },
                        ],
                        colors: {},
                    });
                }

                // Monaco's Monarch tokenizer treats JSDoc blocks as one token; decorations add @tag/{type}/name coloring via we-jsdoc-* classes.
                var _JSDOC_NAME_TAGS = {
                    param: true,
                    arg: true,
                    argument: true,
                    property: true,
                    prop: true,
                    typedef: true,
                    member: true,
                };
                function _computeJsDocDecorations(model) {
                    if (!model) {
                        return [];
                    }
                    var text = model.getValue();
                    var decos = [];
                    function pushRange(start, length, className) {
                        var s = model.getPositionAt(start);
                        var e = model.getPositionAt(start + length);
                        decos.push({
                            range: new monaco.Range(s.lineNumber, s.column, e.lineNumber, e.column),
                            options: { inlineClassName: className },
                        });
                    }

                    var blockRe = /\/\*\*[\s\S]*?\*\//g;
                    var block;
                    while ((block = blockRe.exec(text)) !== null) {
                        var full = block[0];
                        var base = block.index;
                        var tagRe = /@([a-zA-Z]+)/g;
                        var tm;
                        while ((tm = tagRe.exec(full)) !== null) {
                            var tagName = tm[1];
                            pushRange(base + tm.index, tm[0].length, 'we-jsdoc-tag');

                            var afterOffset = base + tm.index + tm[0].length;
                            var rest = full.slice(tm.index + tm[0].length);
                            var consumed = 0;

                            var typeM = /^\s*(\{[^}]*\})/.exec(rest);
                            if (typeM) {
                                var typeStart = afterOffset + typeM[0].indexOf('{');
                                pushRange(typeStart, typeM[1].length, 'we-jsdoc-type');
                                consumed = typeM[0].length;
                            }

                            if (_JSDOC_NAME_TAGS[tagName]) {
                                var nameRest = rest.slice(consumed);
                                var nameM = /^\s+(\[?[\w$.]+\]?)/.exec(nameRest);
                                if (nameM) {
                                    var nameStart = afterOffset + consumed + nameM[0].indexOf(nameM[1]);
                                    pushRange(nameStart, nameM[1].length, 'we-jsdoc-name');
                                }
                            }
                        }
                    }
                    return decos;
                }

                // Monarch-only JSON language (no worker) avoids Monaco's "Unexpected usage" console error from the JSON language service worker.
                function _ensureWeJsonLanguage() {
                    if (_weJsonRegistered || !window.monaco || !monaco.languages) {
                        return;
                    }
                    _weJsonRegistered = true;
                    monaco.languages.register({ id: 'we-json' });
                    monaco.languages.setMonarchTokensProvider('we-json', {
                        defaultToken: '',
                        tokenizer: {
                            root: [
                                [/[{}[\],:]/, 'delimiter.bracket'],
                                [/"/, { token: 'string.quote', next: '@string' }],
                                [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
                                [/\b(?:true|false|null)\b/, 'keyword'],
                                [/\s+/, ''],
                            ],
                            string: [
                                [/[^\\"]+/, 'string'],
                                [/\\./, 'string.escape'],
                                [/"/, { token: 'string.quote', next: '@pop' }],
                            ],
                        },
                    });
                }

                function _setupScssTokenizer() {
                    if (_scssTokenizerSet) {
                        return;
                    }
                    _scssTokenizerSet = true;
                    monaco.languages.setLanguageConfiguration('scss', {
                        wordPattern: /(#?-?[_a-zA-Z][_a-zA-Z0-9-]*)|\d+[_a-zA-Z][_a-zA-Z0-9-]*/,
                        comments: {
                            lineComment: '//',
                            blockComment: ['/*', '*/'],
                        },
                        brackets: [
                            ['{', '}'],
                            ['[', ']'],
                            ['(', ')'],
                        ],
                        autoClosingPairs: [
                            { open: '{', close: '}' },
                            { open: '[', close: ']' },
                            { open: '(', close: ')' },
                            { open: '"', close: '"' },
                            { open: "'", close: "'" },
                        ],
                        surroundingPairs: [
                            { open: '{', close: '}' },
                            { open: '[', close: ']' },
                            { open: '(', close: ')' },
                            { open: '"', close: '"' },
                            { open: "'", close: "'" },
                        ],
                    });

                    monaco.languages.setMonarchTokensProvider('scss', {
                        defaultToken: '',
                        tokenPostfix: '.scss',

                        tokenizer: {
                            root: [
                                // Single-line comment
                                [/\/\/.*$/, 'comment'],
                                // Block comment
                                [/\/\*/, { token: 'comment', next: '@blockcomment' }],
                                // Strings
                                [/"([^"\\]|\\.)*"/, 'string'],
                                [/'([^'\\]|\\.)*'/, 'string'],
                                // SCSS variables
                                [/\$[\w-]+/, 'variable'],
                                // Interpolation #{...}
                                [
                                    /#{/,
                                    {
                                        token: 'keyword.operator',
                                        next: '@interpolation',
                                    },
                                ],
                                // At-rules
                                [
                                    /@(?:mixin|include|extend|function|return|if|else\s+if|else|for|each|while|debug|warn|error|use|forward|import|charset|namespace|media|supports|keyframes|-webkit-keyframes|-moz-keyframes|-o-keyframes|page|font-face|layer|container)\b/,
                                    'keyword',
                                ],
                                // !important / !default / !global / !optional
                                [/!(?:important|default|global|optional)\b/, 'keyword'],
                                // Hex colours
                                [/#[0-9a-fA-F]{3,8}\b/, 'number.hex'],
                                // Numbers with optional unit
                                [
                                    /-?(?:\d+\.?\d*|\.\d+)(?:em|ex|ch|rem|vw|vh|vmin|vmax|cqw|cqh|fr|px|pt|pc|in|cm|mm|deg|rad|turn|grad|s|ms|Hz|kHz|dpi|dpcm|dppx|%)?(?=[\s,;{}()\[\]])/,
                                    'number',
                                ],
                                // CSS functions — word immediately before (
                                [/[\w-]+(?=\s*\()/, 'support.function'],
                                // Property names — word then colon (not ::)
                                [/[\w-]+(?=\s*:(?!:))/, 'attribute.name'],
                                // Pseudo-elements ::
                                [/::[:\w-]+/, 'tag'],
                                // Pseudo-classes :
                                [/:[:\w-]+/, 'tag'],
                                // ID selectors
                                [/#[\w-]+/, 'tag'],
                                // Class selectors
                                [/\.[\w-]+/, 'tag'],
                                // Universal selector / parent ref / placeholder
                                [/[*&%]/, 'keyword.operator'],
                                // Control keywords
                                [
                                    /\b(?:true|false|null|and|or|not|in|from|through|to|auto|none|inherit|unset|initial|revert)\b/,
                                    'keyword',
                                ],
                                // Delimiters
                                [/[{}]/, 'delimiter.curly'],
                                [/[\[\]]/, 'delimiter.square'],
                                [/[()]/, 'delimiter.parenthesis'],
                                [/[;,:]/, 'delimiter'],
                            ],

                            blockcomment: [
                                [/\*\//, { token: 'comment', next: '@pop' }],
                                [/./, 'comment'],
                            ],

                            interpolation: [
                                [/}/, { token: 'keyword.operator', next: '@pop' }],
                                [/\$[\w-]+/, 'variable'],
                                { include: '@root' },
                            ],
                        },
                    });
                }

                // Wait one tick for Angular to render pane DOM nodes, then init editors.
                function initAllEditors() {
                    if (monaco.languages) {
                        // Register only if not already registered (built-in may have it already).
                        if (
                            !monaco.languages.getLanguages().some(function (l) {
                                return l.id === 'scss';
                            })
                        ) {
                            monaco.languages.register({ id: 'scss' });
                        }
                        // Always override the tokenizer so our variable.scss token is produced
                        // regardless of whether Monaco's built-in SCSS tokenizer was already set.
                        _setupScssTokenizer();
                        if (window.SNMonacoPlusBootstrap) {
                            window.SNMonacoPlusBootstrap.ensureCoreLoaded().then(function (api) {
                                if (api) {
                                    api.loadCssEditorSupport();
                                }
                            });
                        }
                    }
                    // Each pane loads its own DTS (server or client) when it initialises;
                    // no need to gate all editors on a single DTS load here.
                    $timeout(function () {
                        var panesToInit = $scope.visibleItems.filter(function (item) {
                            return item.type === 'pane' && !monacoEditors[item.key];
                        });

                        // One pane per tick so the browser can paint/respond between editor.create() calls.
                        function initNextPane(idx) {
                            if (idx >= panesToInit.length) {
                                $timeout(layoutAllEditors, 20);
                                $timeout(layoutAllEditors, 500);
                                $timeout(layoutAllEditors, 900);
                                // Re-layout once fonts are ready, since late metrics can delay proper paint.
                                try {
                                    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
                                        document.fonts.ready.then(function () {
                                            $timeout(layoutAllEditors, 0);
                                        });
                                    }
                                } catch (e) {}
                                return;
                            }
                            initEditorForPane(panesToInit[idx]);
                            $timeout(function () {
                                initNextPane(idx + 1);
                            }, 0);
                        }

                        initNextPane(0);
                    });
                }

                function getMonacoTheme() {
                    try {
                        if (window.NOW && window.NOW.theme && window.NOW.theme.name) {
                            return /dark/i.test(window.NOW.theme.name) ? 'vs-dark' : 'vs';
                        }
                    } catch (e) {}
                    var bg = getComputedStyle(document.documentElement)
                        .getPropertyValue('--now-color_background--primary')
                        .trim();
                    if (bg) {
                        var parts = bg.split(',').map(Number);
                        if (parts.length === 3 && (parts[0] + parts[1] + parts[2]) / 3 >= 128) {
                            return 'vs';
                        }
                    }
                    return 'vs-dark';
                }

                function _resolveMonacoTheme() {
                    var pref = $scope.userPrefs.editorTheme;
                    if (pref === 'dark') {
                        return 'we-vs-dark';
                    }
                    if (pref === 'light') {
                        return 'we-vs';
                    }
                    return getMonacoTheme() === 'vs-dark' ? 'we-vs-dark' : 'we-vs';
                }

                // Returns the table name if the cursor is in the first arg of a table-consuming API call, else null.
                function _getTableNameAtCursor(ed) {
                    var model = ed.getModel();
                    var pos = ed.getPosition();
                    if (!model || !pos) {
                        return null;
                    }

                    var line = model.getLineContent(pos.lineNumber);
                    var col = pos.column - 1; // 0-based column index

                    // Walk left to find the opening quote enclosing the cursor
                    var quoteChar = null,
                        startIdx = -1;
                    for (var i = col - 1; i >= 0; i--) {
                        var c = line[i];
                        if (c === "'" || c === '"') {
                            var bs = 0;
                            for (var j = i - 1; j >= 0 && line[j] === '\\'; j--) bs++;
                            if (bs % 2 === 0) {
                                quoteChar = c;
                                startIdx = i;
                                break;
                            }
                        }
                    }
                    if (quoteChar === null) {
                        return null;
                    }

                    // Walk right to find the closing quote
                    var endIdx = line.length;
                    for (var i = col; i < line.length; i++) {
                        if (line[i] === quoteChar) {
                            var bs = 0;
                            for (var j = i - 1; j >= 0 && line[j] === '\\'; j--) bs++;
                            if (bs % 2 === 0) {
                                endIdx = i;
                                break;
                            }
                        }
                    }

                    var candidate = line.substring(startIdx + 1, endIdx);
                    // ServiceNow table names: lowercase letters, digits, underscores
                    if (!/^[a-z][a-z0-9_]*$/.test(candidate)) {
                        return null;
                    }

                    // Check that the string is the first argument to a table API
                    var before = line.substring(0, startIdx).replace(/\s+$/, '');
                    if (/(?:GlideRecord(?:Secure)?|GlideAggregate|GlideQuery|addJoinQuery)\s*\($/.test(before)) {
                        return candidate;
                    }
                    return null;
                }

                // Returns the ServiceNow build name (e.g. "zurich") for docs URLs; WE_CONFIG.buildName comes from gs.getBuildName().
                function _getSnVersion() {
                    if (window.WE_CONFIG && window.WE_CONFIG.buildName) {
                        return window.WE_CONFIG.buildName;
                    }
                    if (typeof getVersion === 'function') {
                        try {
                            var v = getVersion();
                            if (v) {
                                return v;
                            }
                        } catch (e) {}
                    }
                    if (window.NOW && window.NOW.buildName) {
                        return window.NOW.buildName;
                    }
                    if (typeof g_buildName !== 'undefined' && g_buildName) {
                        return g_buildName;
                    }
                    return '';
                }

                var _JS_BUILTINS = {
                    Array: 1,
                    Boolean: 1,
                    Date: 1,
                    Error: 1,
                    Function: 1,
                    JSON: 1,
                    Map: 1,
                    Math: 1,
                    Number: 1,
                    Object: 1,
                    Promise: 1,
                    Proxy: 1,
                    Reflect: 1,
                    RegExp: 1,
                    Set: 1,
                    String: 1,
                    Symbol: 1,
                    WeakMap: 1,
                    WeakSet: 1,
                };

                // Returns the ServiceNow class name under the cursor, or found to its left for a method/property, excluding _JS_BUILTINS.
                function _getSnClassAtCursor(ed) {
                    var model = ed.getModel();
                    var pos = ed.getPosition();
                    if (!model || !pos) {
                        return null;
                    }

                    var word = model.getWordAtPosition(pos);
                    if (!word || !word.word) {
                        return null;
                    }
                    var name = word.word;

                    // Cursor is directly on an uppercase-starting identifier — likely a class
                    if (/^[A-Z]/.test(name)) {
                        return _JS_BUILTINS[name] ? null : name;
                    }

                    // Cursor is on a method/property — look for ClassName. immediately before
                    var line = model.getLineContent(pos.lineNumber);
                    var before = line.substring(0, (word.startColumn || 1) - 1);
                    var m = before.match(/([A-Z][A-Za-z0-9_]*)\.$/);
                    if (m && !_JS_BUILTINS[m[1]]) {
                        return m[1];
                    }

                    return null;
                }

                // Returns the script include name under the cursor if it exists in the SI name map, else null.
                function _getSINameAtCursor(ed) {
                    var model = ed.getModel();
                    var pos = ed.getPosition();
                    if (!model || !pos) {
                        return null;
                    }
                    var word = model.getWordAtPosition(pos);
                    if (!word || !word.word) {
                        return null;
                    }
                    return window.SNMonacoPlus && window.SNMonacoPlus.getSiSysId(word.word) ? word.word : null;
                }

                // JS formatting options
                function _applyJsFormatOptions() {
                    if (!window.monaco || !monaco.languages || !monaco.languages.typescript) {
                        return;
                    }
                    var opts = {
                        insertSpaceBeforeFunctionParenthesis: !!$scope.userPrefs.insertSpaceBeforeFuncParen,
                    };
                    var jsDef = monaco.languages.typescript.javascriptDefaults;
                    var tsDef = monaco.languages.typescript.typescriptDefaults;
                    if (jsDef && jsDef.setFormattingOptions) {
                        jsDef.setFormattingOptions(opts);
                    }
                    if (tsDef && tsDef.setFormattingOptions) {
                        tsDef.setFormattingOptions(opts);
                    }
                }

                var _jsFormattingProviderRegistered = false;

                function _removeLeadingCssRuleGaps(formatted) {
                    var lines = formatted.split('\n');
                    for (var i = 0; i < lines.length - 2; i++) {
                        if (!/\{[ \t]*$/.test(lines[i])) {
                            continue;
                        }
                        var next = i + 1;
                        while (next < lines.length && !lines[next].trim()) {
                            next++;
                        }
                        if (next === i + 1) {
                            continue;
                        }
                        var childRule = false;
                        for (var k = next; k < lines.length; k++) {
                            var line = lines[k].trim();
                            if (!line || /^\/\*|^\/\//.test(line) || /[;}]/.test(line)) {
                                break;
                            }
                            if (line.indexOf('{') !== -1) {
                                childRule = true;
                                break;
                            }
                        }
                        if (childRule) {
                            lines.splice(i + 1, next - i - 1);
                        }
                    }
                    return lines.join('\n');
                }

                function _restoreInlineCssComments(before, after) {
                    var sourceLines = before.split(/\r?\n/);
                    var lines = after.split('\n');
                    var searchFrom = 0;
                    sourceLines.forEach(function (sourceLine) {
                        var inline = sourceLine.match(/^(.*\S)[ \t]+(\/\*[^\n]*?\*\/)[ \t]*$/);
                        if (!inline) {
                            return;
                        }
                        var anchor = inline[1].replace(/\s/g, '');
                        for (var i = searchFrom; i < lines.length; i++) {
                            if (lines[i].trim() !== inline[2]) {
                                continue;
                            }
                            var previous = i - 1;
                            while (previous >= 0 && !lines[previous].trim()) {
                                previous--;
                            }
                            if (previous < 0 || lines[previous].replace(/\s/g, '') !== anchor) {
                                continue;
                            }
                            lines[previous] += ' ' + inline[2];
                            lines.splice(previous + 1, i - previous);
                            searchFrom = previous + 1;
                            break;
                        }
                    });
                    return lines.join('\n');
                }

                function _applyCssFormattingEdit(editor, model, before, after) {
                    if (before === after) {
                        return;
                    }
                    var start = 0;
                    while (
                        start < before.length &&
                        start < after.length &&
                        before.charAt(start) === after.charAt(start)
                    ) {
                        start++;
                    }
                    var beforeEnd = before.length;
                    var afterEnd = after.length;
                    while (
                        beforeEnd > start &&
                        afterEnd > start &&
                        before.charAt(beforeEnd - 1) === after.charAt(afterEnd - 1)
                    ) {
                        beforeEnd--;
                        afterEnd--;
                    }
                    var from = model.getPositionAt(start);
                    var to = model.getPositionAt(beforeEnd);
                    editor.executeEdits('cssFormattingSpacing', [
                        {
                            range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column),
                            text: after.substring(start, afterEnd),
                        },
                    ]);
                }

                // Calls the TypeScript worker directly, forwarding user prefs as format options; more reliable than the removed setFormattingOptions.
                function _registerJsFormattingProvider() {
                    if (_jsFormattingProviderRegistered || !window.monaco) {
                        return;
                    }
                    if (
                        !monaco.languages ||
                        !monaco.languages.typescript ||
                        !monaco.languages.typescript.getJavaScriptWorker
                    ) {
                        return;
                    }
                    _jsFormattingProviderRegistered = true;

                    function _buildFmtProvider(getWorker) {
                        function format(model, monacoOptions, range) {
                            var before = model.getValue();
                            var version = model.getVersionId();
                            var start = range
                                ? model.getOffsetAt({
                                      lineNumber: range.startLineNumber,
                                      column: range.startColumn,
                                  })
                                : 0;
                            var end = range
                                ? model.getOffsetAt({
                                      lineNumber: range.endLineNumber,
                                      column: range.endColumn,
                                  })
                                : before.length;
                            var options = {
                                baseIndentSize: 0,
                                indentSize: $scope.userPrefs.tabSize,
                                tabSize: $scope.userPrefs.tabSize,
                                convertTabsToSpaces: monacoOptions.insertSpaces,
                                insertSpaces: monacoOptions.insertSpaces,
                                newLineCharacter: '\n',
                                indentStyle: 2, // Smart
                                insertSpaceAfterCommaDelimiter: true,
                                insertSpaceAfterConstructor: false,
                                insertSpaceAfterSemicolonInForStatements: true,
                                insertSpaceBeforeAndAfterBinaryOperators: true,
                                insertSpaceAfterKeywordsInControlFlowStatements: true,
                                insertSpaceAfterFunctionKeywordForAnonymousFunctions:
                                    !!$scope.userPrefs.insertSpaceBeforeFuncParen,
                                insertSpaceBeforeFunctionParenthesis: !!$scope.userPrefs.insertSpaceBeforeFuncParen,
                                insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
                                insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
                                insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
                                insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: false,
                                insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
                                insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
                                trimTrailingWhitespace: true,
                                semicolons: 'ignore',
                            };
                            return getWorker()
                                .then(function (factory) {
                                    return factory(model.uri);
                                })
                                .then(function (worker) {
                                    return range
                                        ? worker.getFormattingEditsForRange(model.uri.toString(), start, end, options)
                                        : worker.getFormattingEditsForDocument(model.uri.toString(), options);
                                })
                                .then(function (edits) {
                                    if (model.isDisposed() || model.getVersionId() !== version) return [];
                                    var after = before;
                                    (edits || [])
                                        .slice()
                                        .sort(function (a, b) {
                                            return b.span.start - a.span.start;
                                        })
                                        .forEach(function (edit) {
                                            after =
                                                after.substring(0, edit.span.start) +
                                                edit.newText +
                                                after.substring(edit.span.start + edit.span.length);
                                        });
                                    // Tokenise the whole document so comment-like text in strings is left alone.
                                    var lines = after.split('\n');
                                    var tokens = monaco.editor.tokenize(after, model.getLanguageId());
                                    var firstLine = range ? range.startLineNumber - 1 : 0;
                                    var lastLine = range ? range.endLineNumber - 1 : lines.length - 1;
                                    function isComment(line, column) {
                                        var list = tokens[line] || [];
                                        for (var t = list.length - 1; t >= 0; t--) {
                                            if (list[t].offset <= column) return /comment/.test(list[t].type);
                                        }
                                        return false;
                                    }
                                    for (var i = firstLine; i <= lastLine; i++) {
                                        var opening = /^([ \t]*)\/\*\*?[ \t]*\r?$/.exec(lines[i]);
                                        if (!opening || !isComment(i, opening[1].length)) continue;
                                        var j = i + 1;
                                        var body = [];
                                        for (; j <= lastLine; j++) {
                                            var marker = /^([ \t]*)\*(.*)$/.exec(lines[j]);
                                            if (!marker || !isComment(j, marker[1].length)) break;
                                            body.push({
                                                line: j,
                                                rest: '*' + marker[2],
                                            });
                                            if (/^\/[ \t]*\r?$/.test(marker[2])) break;
                                        }
                                        if (!body.length) continue;
                                        body.forEach(function (item) {
                                            lines[item.line] = opening[1] + ' ' + item.rest;
                                        });
                                        i = j;
                                    }
                                    after = lines.join('\n');
                                    if (after === before) return [];
                                    var prefix = 0;
                                    while (
                                        prefix < before.length &&
                                        prefix < after.length &&
                                        before.charAt(prefix) === after.charAt(prefix)
                                    )
                                        prefix++;
                                    var beforeEnd = before.length,
                                        afterEnd = after.length;
                                    while (
                                        beforeEnd > prefix &&
                                        afterEnd > prefix &&
                                        before.charAt(beforeEnd - 1) === after.charAt(afterEnd - 1)
                                    ) {
                                        beforeEnd--;
                                        afterEnd--;
                                    }
                                    var from = model.getPositionAt(prefix),
                                        to = model.getPositionAt(beforeEnd);
                                    return [
                                        {
                                            range: new monaco.Range(
                                                from.lineNumber,
                                                from.column,
                                                to.lineNumber,
                                                to.column
                                            ),
                                            text: after.substring(prefix, afterEnd),
                                        },
                                    ];
                                });
                        }
                        return {
                            provideDocumentFormattingEdits: function (model, options) {
                                return format(model, options);
                            },
                            provideDocumentRangeFormattingEdits: function (model, range, options) {
                                return format(model, options, range);
                            },
                        };
                    }
                    function register(language, getWorker) {
                        var provider = _buildFmtProvider(getWorker);
                        monaco.languages.registerDocumentFormattingEditProvider(language, provider);
                        monaco.languages.registerDocumentRangeFormattingEditProvider(language, provider);
                    }
                    register('javascript', monaco.languages.typescript.getJavaScriptWorker);
                    if (monaco.languages.typescript.getTypeScriptWorker) {
                        register('typescript', monaco.languages.typescript.getTypeScriptWorker);
                    }
                }

                function initEditorForPane(pane) {
                    var container = document.getElementById('editor-' + pane.key);
                    if (!container || monacoEditors[pane.key]) {
                        return;
                    }

                    var isSI = pane.recordType === 'script_include';
                    var value = pane.field ? $scope.widget[pane.field] || '' : pane.content || '';
                    var readOnly =
                        $scope.isVersionView ||
                        !$scope.canWriteWidget ||
                        (pane.hasIdInput && !pane.editorUnlocked) ||
                        !!pane.readOnly;
                    var lang =
                        pane.language === 'css' || pane.language === 'sass' ? 'scss' : pane.language || 'javascript';

                    function _create() {
                        if (monacoEditors[pane.key]) {
                            return; // guard against double-init
                        }
                        _ensureMonacoThemes();
                        // Ensure our SCSS tokenizer is active — Monaco's built-in may have
                        // already registered 'scss' before initAllEditors ran its override.
                        if (monaco.languages) {
                            _setupScssTokenizer();
                        }
                        var isJs = lang === 'javascript' || lang === 'typescript';
                        // ESLint only runs for JS/TS; HTML/SCSS use Monaco's built-in validators.
                        _lintEditorLangs[pane.key] = lang;
                        _lintEditorIsServer[pane.key] = pane.scriptKind
                            ? pane.scriptKind === 'server'
                            : pane.field === 'script' || isSI;
                        if (_lintEditorIsServer[pane.key]) {
                            loadServerMonarchDts();
                        } else if (
                            pane.scriptKind === 'client' ||
                            pane.recordType === 'provider' ||
                            pane.field === 'link' ||
                            pane.field === 'client_script'
                        ) {
                            loadClientMonarchDts();
                        }
                        function _doCreate() {
                            if (monacoEditors[pane.key]) {
                                return;
                            }
                            var ed = monaco.editor.create(container, {
                                automaticLayout: true,
                                fixedOverflowWidgets: true,
                                fontFamily: _buildFontFamily($scope.userPrefs.fontFamily),
                                fontSize: $scope.userPrefs.fontSize,
                                glyphMargin: isJs,
                                insertSpaces: !!$scope.userPrefs.formatTabsToSpaces,
                                detectIndentation: false,
                                language: lang,
                                lightbulb: { enabled: true },
                                lineNumbers: 'on',
                                minimap: {
                                    enabled: !!$scope.userPrefs.minimap,
                                },
                                quickSuggestions: {
                                    other: true,
                                    comments: false,
                                    strings: true, // Enables inside string literals
                                },
                                hover: {
                                    enabled: !!$scope.userPrefs.languageHelpers,
                                },
                                parameterHints: {
                                    enabled: !!$scope.userPrefs.languageHelpers,
                                },
                                readOnly: readOnly,
                                scrollBeyondLastLine: false,
                                suggestOnTriggerCharacters: true,
                                tabSize: $scope.userPrefs.tabSize,
                                theme: _resolveMonacoTheme(),
                                value: value,
                                wordWrap: $scope.userPrefs.wordWrap ? 'on' : 'off',
                                autoIndent: $scope.userPrefs.autoIndent ? 'full' : 'none',
                                formatOnPaste: !!$scope.userPrefs.formatOnPaste,
                                formatOnType: !!$scope.userPrefs.formatOnType,
                                autoSurround: $scope.userPrefs.autoSurround,
                                autoClosingBrackets: $scope.userPrefs.autoClosingBrackets,
                                autoClosingQuotes: $scope.userPrefs.autoClosingQuotes,
                                linkedEditing: !!$scope.userPrefs.linkedEditing,
                                multiCursorModifier: 'ctrlCmd',
                                mouseWheelZoom: true,
                                stickyScroll: {
                                    enabled: !!$scope.userPrefs.stickyScroll,
                                },
                            });

                            _registerJsFormattingProvider();
                            _applyJsFormatOptions();

                            // Server and client panes share one Monaco JS language service; only one side's globals can be registered, so swap on focus.
                            if (isJs) {
                                var _jsScriptKind =
                                    pane.scriptKind ||
                                    (pane.field === 'script' || isSI
                                        ? 'server'
                                        : pane.recordType === 'provider' ||
                                            pane.field === 'link' ||
                                            pane.field === 'client_script'
                                          ? 'client'
                                          : null);
                                if (_jsScriptKind) {
                                    ed.onDidFocusEditorText(function () {
                                        if (window.SNMonacoPlusBootstrap) {
                                            window.SNMonacoPlusBootstrap.ensureCoreLoaded().then(function (api) {
                                                var model = ed.getModel();
                                                if (api && model && ed.hasTextFocus()) {
                                                    api.notifyScriptContextFocus(model.id, _jsScriptKind);
                                                }
                                            });
                                        }
                                    });
                                }
                            }

                            monacoEditors[pane.key] = {
                                getValue: function () {
                                    return ed.getValue();
                                },
                                focus: function () {
                                    try {
                                        ed.focus();
                                    } catch (e) {}
                                },
                                setValue: function (v) {
                                    if (isJs) {
                                        try {
                                            monaco.editor.setModelMarkers(ed.getModel(), 'LINT_MARKER', []);
                                        } catch (e2) {}
                                    }
                                    ed.setValue(v);
                                },
                                getModel: function () {
                                    return ed.getModel();
                                },
                                layout: function () {
                                    ed.layout();
                                },
                                render: function () {
                                    try {
                                        ed.render(true);
                                    } catch (e) {}
                                },
                                forceTokenize: function () {
                                    try {
                                        var _m = ed.getModel();
                                        if (!_m) {
                                            return;
                                        }
                                        // Full-model tokenization avoids leaving JS/TS uncolored before first paint.
                                        var _lastLine = _m.getLineCount();
                                        // Monaco ≥0.32 puts forceTokenization on model.tokenization;
                                        // older builds expose it directly on the model.
                                        var _tok =
                                            _m.tokenization && _m.tokenization.forceTokenization ? _m.tokenization : _m;
                                        if (_tok.forceTokenization) {
                                            _tok.forceTokenization(_lastLine);
                                        }
                                    } catch (_e) {}
                                },
                                updateOptions: function (opts) {
                                    ed.updateOptions(opts);
                                    var model = ed.getModel();
                                    if (model)
                                        model.updateOptions({
                                            insertSpaces: !!$scope.userPrefs.formatTabsToSpaces,
                                            tabSize: $scope.userPrefs.tabSize,
                                        });
                                },
                                dispose: function () {
                                    try {
                                        var _m = ed.getModel();
                                        if (_m) {
                                            delete _serverScriptModels[_m.id];
                                        }
                                    } catch (e2) {}
                                    try {
                                        ed.dispose();
                                    } catch (e) {}
                                },
                                format: function (useSpaces) {
                                    var action = ed.getAction('editor.action.formatDocument');
                                    if (!action) {
                                        return;
                                    }
                                    /* Monaco reads FormattingOptions from the
                                       model, so both must be updated. */
                                    var _fmtModel = ed.getModel();
                                    var _cssSource =
                                        _fmtModel && /^(css|scss)$/.test(_fmtModel.getLanguageId())
                                            ? _fmtModel.getValue()
                                            : null;
                                    ed.updateOptions({
                                        insertSpaces: !!useSpaces,
                                    });
                                    if (_fmtModel) {
                                        _fmtModel.updateOptions({
                                            insertSpaces: !!useSpaces,
                                        });
                                    }
                                    function _resetIndent() {
                                        ed.updateOptions({
                                            insertSpaces: !!$scope.userPrefs.formatTabsToSpaces,
                                        });
                                        if (_fmtModel && !_fmtModel.isDisposed()) {
                                            _fmtModel.updateOptions({
                                                insertSpaces: !!$scope.userPrefs.formatTabsToSpaces,
                                            });
                                        }
                                    }
                                    var result = action.run();
                                    if (result && result.then) {
                                        result.then(function () {
                                            if (_cssSource !== null && _fmtModel && !_fmtModel.isDisposed()) {
                                                var formatted = _fmtModel.getValue();
                                                var restored = _restoreInlineCssComments(
                                                    _cssSource,
                                                    _removeLeadingCssRuleGaps(formatted)
                                                );
                                                _applyCssFormattingEdit(ed, _fmtModel, formatted, restored);
                                            }
                                            _resetIndent();
                                        }, _resetIndent);
                                    } else {
                                        _resetIndent();
                                    }
                                },
                            };

                            // Track server script editors for script-include "new " completions
                            if (_lintEditorIsServer[pane.key]) {
                                var _edModel = ed.getModel();
                                if (_edModel) {
                                    _serverScriptModels[_edModel.id] = true;
                                }
                            }

                            if (!readOnly && pane.field) {
                                ed.onDidChangeModelContent(function () {
                                    $scope.$apply(function () {
                                        var cur = ed.getValue();
                                        pane.dirty = !_editorValuesEqual(cur, originalValues[pane.field]);
                                        if (pane.dirty) {
                                            pane.savedAt = null;
                                        }
                                    });
                                });
                            } else if (pane.hasIdInput || isSI) {
                                ed.onDidChangeModelContent(function () {
                                    if (ed.getOption(monaco.editor.EditorOption.readOnly)) {
                                        return;
                                    }
                                    $scope.$apply(function () {
                                        pane.dirty = !_editorValuesEqual(ed.getValue(), pane.lastServerContent);
                                        if (pane.dirty) pane.savedAt = null;
                                    });
                                });
                            }

                            if (!readOnly && isJs && (pane.field === 'script' || isSI)) {
                                if (window.SNMonacoPlus) {
                                    window.SNMonacoPlus.scanAndFetchSIs(value);
                                    window.SNMonacoPlus.scanLocalTypedefs(pane.key, value);
                                }
                                var _siTimer = null;
                                ed.onDidChangeModelContent(function () {
                                    clearTimeout(_siTimer);
                                    _siTimer = setTimeout(function () {
                                        if (window.SNMonacoPlus) {
                                            window.SNMonacoPlus.scanAndFetchSIs(ed.getValue());
                                            window.SNMonacoPlus.scanLocalTypedefs(pane.key, ed.getValue());
                                        }
                                    }, 800);
                                });
                            }

                            // Track Client Controller editors for Angular Provider api.controller-parameter completions.
                            // Uses SNMonacoPlusBootstrap directly (not the loadClientMonarchDts(cb) wrapper above,
                            // whose cb fires immediately without waiting for core to finish loading).
                            if (!readOnly && isJs && pane.field === 'client_script') {
                                function _runProviderScan(text) {
                                    var _bs = window.SNMonacoPlusBootstrap;
                                    if (!_bs) {
                                        return;
                                    }
                                    _bs.init({
                                        language: 'javascript',
                                        isClient: true,
                                    }).then(function (api) {
                                        if (api && typeof api.scanAndFetchProviders === 'function') {
                                            api.scanAndFetchProviders(text);
                                        }
                                    });
                                }
                                _runProviderScan(value);
                                var _providerTimer = null;
                                ed.onDidChangeModelContent(function () {
                                    clearTimeout(_providerTimer);
                                    _providerTimer = setTimeout(function () {
                                        _runProviderScan(ed.getValue());
                                    }, 800);
                                });
                            }

                            if (!readOnly && isJs && !$scope.isVersionView) {
                                _initLintWorker();
                                _triggerLint(pane.key);
                                ed.onDidChangeModelContent(function () {
                                    _triggerLint(pane.key);
                                });
                            }

                            if (lang === 'html' && !$scope.isVersionView) {
                                _lintNgExpressions(pane.key);
                                var _ngLintTimer = null;
                                ed.onDidChangeModelContent(function () {
                                    clearTimeout(_ngLintTimer);
                                    _ngLintTimer = setTimeout(function () {
                                        _lintNgExpressions(pane.key);
                                    }, 600);
                                });
                                // Forces a final check on blur so nothing goes unvalidated before the debounce fires.
                                ed.onDidBlurEditorWidget(function () {
                                    clearTimeout(_ngLintTimer);
                                    _lintNgExpressions(pane.key);
                                });
                            }

                            if (isJs) {
                                var _jsDocDecoIds = [];
                                var _jsDocTimer = null;
                                function _refreshJsDocDecorations() {
                                    _jsDocDecoIds = ed.deltaDecorations(
                                        _jsDocDecoIds,
                                        _computeJsDocDecorations(ed.getModel())
                                    );
                                }
                                _refreshJsDocDecorations();
                                ed.onDidChangeModelContent(function () {
                                    clearTimeout(_jsDocTimer);
                                    _jsDocTimer = setTimeout(_refreshJsDocDecorations, 300);
                                });
                            }

                            if (!$scope.isVersionView) {
                                initBreakpoints(ed, pane.key, pane);
                            }

                            // "Open table": shown when cursor is in a GlideRecord/GlideAggregate/GlideQuery table-name string.
                            if (isJs) {
                                var _tableCtxKey = ed.createContextKey('weIsOnTable', false);
                                var _classCtxKey = ed.createContextKey('weIsOnSnClass', false);
                                ed.onDidChangeCursorPosition(function () {
                                    _tableCtxKey.set(!!_getTableNameAtCursor(ed));
                                    _classCtxKey.set(!!_getSnClassAtCursor(ed));
                                });
                                ed.addAction({
                                    id: 'we.open-docs',
                                    label: 'Open documentation',
                                    contextMenuGroupId: '0_we_docs',
                                    contextMenuOrder: 1,
                                    precondition: 'weIsOnSnClass',
                                    run: function (ed) {
                                        var cls = _getSnClassAtCursor(ed);
                                        if (!cls) {
                                            return;
                                        }
                                        // GlideRecordSecure shares its docs page with GlideRecord
                                        if (cls === 'GlideRecordSecure') {
                                            cls = 'GlideRecord';
                                        }
                                        var ver = _getSnVersion();
                                        var url =
                                            'https://docs.servicenow.com/csh?topicname=c_' +
                                            cls +
                                            'API.html' +
                                            (ver ? '&version=' + encodeURIComponent(ver) : '');
                                        window.open(url, '_blank');
                                    },
                                });
                                ed.addAction({
                                    id: 'we.view-table-config',
                                    label: 'View table configuration',
                                    contextMenuGroupId: '0_we_table',
                                    contextMenuOrder: 1,
                                    precondition: 'weIsOnTable',
                                    run: function (ed) {
                                        var tbl = _getTableNameAtCursor(ed);
                                        if (tbl) {
                                            window.open(
                                                '/nav_to.do?uri=' +
                                                    encodeURIComponent(
                                                        'sys_db_object.do?sys_id=' +
                                                            tbl +
                                                            '&sysparm_refkey=name&sysparm_domain_restore=false'
                                                    ),
                                                '_blank'
                                            );
                                        }
                                    },
                                });
                                ed.addAction({
                                    id: 'we.open-table-list',
                                    label: 'Open table list',
                                    contextMenuGroupId: '0_we_table',
                                    contextMenuOrder: 2,
                                    precondition: 'weIsOnTable',
                                    run: function (ed) {
                                        var tbl = _getTableNameAtCursor(ed);
                                        if (tbl) {
                                            window.open(
                                                '/nav_to.do?uri=' + encodeURIComponent(tbl + '_list.do'),
                                                '_blank'
                                            );
                                        }
                                    },
                                });
                            }

                            // "Edit Script Include": shown on known SI names or confirmed async for capitalised words.
                            if (isJs) {
                                var _siCtxKey = ed.createContextKey('weIsOnScriptInclude', false);
                                var _siCheckSeq = 0;
                                ed.onDidChangeCursorPosition(function () {
                                    var syncName = _getSINameAtCursor(ed);
                                    if (syncName) {
                                        _siCtxKey.set(true);
                                        return;
                                    }
                                    _siCtxKey.set(false);

                                    var model = ed.getModel();
                                    var pos = ed.getPosition();
                                    if (!model || !pos) {
                                        return;
                                    }
                                    var wordObj = model.getWordAtPosition(pos);
                                    var wordStr = wordObj && wordObj.word;
                                    if (!wordStr || !/^[A-Z]/.test(wordStr)) {
                                        return;
                                    }

                                    var snPlus = window.SNMonacoPlus;
                                    if (!snPlus || !snPlus.checkSiExists) {
                                        return;
                                    }
                                    var seq = ++_siCheckSeq;
                                    snPlus.checkSiExists(wordStr, function (foundName) {
                                        if (foundName && seq === _siCheckSeq) {
                                            _siCtxKey.set(true);
                                        }
                                    });
                                });
                                ed.addAction({
                                    id: 'we.open-script-include',
                                    label: 'Edit Script Include',
                                    contextMenuGroupId: '0_we_docs',
                                    contextMenuOrder: 2,
                                    precondition: 'weIsOnScriptInclude',
                                    run: function (ed) {
                                        var name = _getSINameAtCursor(ed);
                                        if (name) {
                                            openScriptIncludeByName(name);
                                        }
                                    },
                                });
                            }

                            if (isJs) {
                                var _isAngularPane = pane.recordType === 'provider' || pane.field === 'client_script';
                                loadCodeActions(ed.getModel().id, _isAngularPane);
                                ed.addAction({
                                    id: 'we.go-to-references-platform',
                                    label: 'Go to References (Platform)',
                                    contextMenuGroupId: 'navigation',
                                    // Keep this below Monaco's built-in "Go to References".
                                    contextMenuOrder: 2.2,
                                    run: function (ed) {
                                        var model = ed.getModel();
                                        var pos = ed.getPosition();
                                        if (!model || !pos || typeof _openSnReferencesModal !== 'function') {
                                            return;
                                        }
                                        var word = model.getWordAtPosition(pos);
                                        if (!word || !word.word) {
                                            return;
                                        }
                                        _openSnReferencesModal(word.word);
                                    },
                                });
                            }

                            if (!readOnly) {
                                ed.addAction({
                                    id: 'we.save',
                                    label: 'Save',
                                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
                                    run: function () {
                                        $scope.$apply(function () {
                                            _handleCtrlS(pane);
                                        });
                                    },
                                });
                            }
                            if (lang === 'html') {
                                loadHtmlMonarchDts(function () {
                                    if (window.MONACO_LANGUAGE_HTML && MONACO_LANGUAGE_HTML.attachEditor) {
                                        MONACO_LANGUAGE_HTML.attachEditor(ed);
                                    }
                                });
                            }
                        } // end _doCreate
                        _doCreate();
                    }

                    // Use Monaco directly via AMD require (bypasses GlideEditorMonaco
                    // which expects a standard SN form-field DOM structure we don't have).
                    if (window.monaco && window.monaco.editor) {
                        _create();
                    } else {
                        require(['vs/editor/editor.main'], function () {
                            _create();
                        });
                    }
                }

                function layoutAllEditors() {
                    Object.keys(monacoEditors).forEach(function (k) {
                        try {
                            monacoEditors[k].layout();
                        } catch (e) {}
                        try {
                            monacoEditors[k].forceTokenize();
                        } catch (e) {}
                        try {
                            monacoEditors[k].render();
                        } catch (e) {}
                    });
                }

                function disposeEditor(key) {
                    if (monacoEditors[key]) {
                        try {
                            var _model = monacoEditors[key].getModel && monacoEditors[key].getModel();
                            if (_model) {
                                _clearLintMarkers(key, _model);
                            }
                        } catch (e) {}
                        try {
                            monacoEditors[key].dispose();
                        } catch (e) {}
                        delete monacoEditors[key];
                        delete _lintEditorLangs[key];
                        delete _lintEditorIsServer[key];
                    }
                }

                // ESLint linting — ServiceNow lintWorker + monaco.editor.setModelMarkers

                function _initLintWorker() {
                    if (_lintWorker || typeof Worker === 'undefined') {
                        return;
                    }
                    var base = window.location.origin;
                    var workerUrl = base + '/scripts/classes/monaco/lintWorker.js?sysparm_substitute=false';
                    var eslintUrl = base + '/scripts/snc-code-editor/eslint_bundle.min.js?sysparm_substitute=false';
                    try {
                        if (typeof SharedWorker !== 'undefined') {
                            var sw = new SharedWorker(workerUrl);
                            _lintWorker = sw.port;
                            _lintWorker.onmessage = _onLintWorkerMessage;
                            _lintWorker.start();
                        } else {
                            _lintWorker = new Worker(workerUrl);
                            _lintWorker.onmessage = _onLintWorkerMessage;
                        }
                        _lintWorker.postMessage({ linterUrl: eslintUrl });
                        _lintWorkerReady = true;
                    } catch (e) {
                        _lintWorker = null;
                    }
                    _initLintMarkerWatcher();
                }

                // Registers a one-time listener on monaco.editor.onDidChangeMarkers to keep
                // $scope.hasLintErrors and $scope.hasLintWarnings in sync with LINT_MARKER severity on open editors.
                function _initLintMarkerWatcher() {
                    if (_lintMarkerWatcherActive || !window.monaco) {
                        return;
                    }
                    _lintMarkerWatcherActive = true;
                    monaco.editor.onDidChangeMarkers(function () {
                        var hasErrors = false;
                        var hasWarnings = false;
                        Object.keys(monacoEditors).forEach(function (k) {
                            if (hasErrors && hasWarnings) {
                                return;
                            }
                            try {
                                var model = monacoEditors[k].getModel && monacoEditors[k].getModel();
                                if (!model) {
                                    return;
                                }
                                var markers = monaco.editor.getModelMarkers({
                                    resource: model.uri,
                                    owner: 'LINT_MARKER',
                                });
                                markers.forEach(function (m) {
                                    if (m.severity === monaco.MarkerSeverity.Error) {
                                        hasErrors = true;
                                    }
                                    if (m.severity === monaco.MarkerSeverity.Warning) {
                                        hasWarnings = true;
                                    }
                                });
                            } catch (e) {}
                        });
                        $scope.$applyAsync(function () {
                            $scope.hasLintErrors = hasErrors;
                            $scope.hasLintWarnings = hasWarnings;
                        });
                    });
                }

                function _onLintWorkerMessage(e) {
                    var data = e.data;
                    if (!data) {
                        return;
                    }
                    var entry = _lintSeqMap[data.version];
                    if (!entry) {
                        return;
                    }
                    delete _lintSeqMap[data.version];
                    // Discard stale result superseded by a newer request for this pane
                    if (_lintLatestSeq[entry.paneKey] !== data.version) {
                        return;
                    }
                    if (!window.monaco) {
                        return;
                    }
                    try {
                        var markers = _convertLintErrors(data.errors || [], entry.model);
                        monaco.editor.setModelMarkers(entry.model, 'LINT_MARKER', markers);
                    } catch (e2) {}
                }

                function _convertLintErrors(errors, model) {
                    var severityMap = window.monaco
                        ? {
                              error: monaco.MarkerSeverity.Error,
                              warning: monaco.MarkerSeverity.Warning,
                              hint: monaco.MarkerSeverity.Hint,
                              info: monaco.MarkerSeverity.Info,
                          }
                        : {};
                    return errors.map(function (err) {
                        var lineCount = model.getLineCount();
                        var startLine = Math.min(Math.max(err.from.line, 1), lineCount);
                        var endLine = Math.min(Math.max(err.to.line, 1), lineCount);
                        var lineLen = model.getLineLength(startLine);
                        var startCol = Math.max(Math.min(err.from.column, lineLen + 1), 1);
                        var endCol = Math.max(Math.min(err.to.column, lineLen + 1), 1);
                        return {
                            startLineNumber: startLine,
                            endLineNumber: endLine,
                            startColumn: startCol,
                            endColumn: endCol,
                            message: err.message,
                            severity: severityMap[err.severity] || monaco.MarkerSeverity.Warning,
                        };
                    });
                }

                // Per-pane ESLint config: server script ES5 (ES2021 with ES12 mode), other JS ES2021, HTML/SCSS skipped.
                function _getEslintConfigForPane(paneKey) {
                    var lang = _lintEditorLangs[paneKey];
                    if (lang !== 'javascript' && lang !== 'typescript') {
                        return null;
                    }
                    var ecmaVersion = _lintEditorIsServer[paneKey] && !_es12Enabled ? 5 : 2021;
                    return {
                        parserOptions: {
                            ecmaVersion: ecmaVersion,
                            sourceType: 'script',
                        },
                        rules: { semi: ['warn', 'always'] },
                    };
                }

                function _triggerLint(paneKey) {
                    // HTML/SCSS editors are validated by Monaco's built-in language services — skip ESLint.
                    var _lang = _lintEditorLangs[paneKey];
                    if (_lang !== 'javascript' && _lang !== 'typescript') {
                        return;
                    }
                    if (!_lintWorker || !_lintWorkerReady) {
                        return;
                    }
                    clearTimeout(_lintTimers[paneKey]);
                    _lintTimers[paneKey] = setTimeout(function () {
                        var edWrapper = monacoEditors[paneKey];
                        if (!edWrapper) {
                            return;
                        }
                        var model = edWrapper.getModel();
                        if (!model) {
                            return;
                        }
                        var cfg = _getEslintConfigForPane(paneKey);
                        if (!cfg) {
                            return;
                        }
                        var seq = ++_lintSeq;
                        _lintSeqMap[seq] = { paneKey: paneKey, model: model };
                        _lintLatestSeq[paneKey] = seq;
                        try {
                            _lintWorker.postMessage({
                                content: model.getValue(),
                                version: seq,
                                eslintOptions: cfg,
                            });
                        } catch (e) {}
                    }, 600);
                }

                function _clearLintMarkers(paneKey, model) {
                    clearTimeout(_lintTimers[paneKey]);
                    delete _lintTimers[paneKey];
                    delete _lintLatestSeq[paneKey];
                    if (!window.monaco || !model) {
                        return;
                    }
                    try {
                        monaco.editor.setModelMarkers(model, 'LINT_MARKER', []);
                    } catch (e) {}
                    try {
                        monaco.editor.setModelMarkers(model, 'NG_EXPR_MARKER', []);
                    } catch (e) {}
                }

                function _applyEsVersion(es12Enabled) {
                    _es12Enabled = !!es12Enabled;
                    // Re-lint all open JS editors — each gets a fresh config via _getEslintConfigForPane.
                    // HTML/SCSS editors are skipped automatically inside _triggerLint.
                    Object.keys(monacoEditors).forEach(function (k) {
                        _triggerLint(k);
                    });
                }

                function _computeNgExpressionMarkers(model) {
                    var html = window.MONACO_LANGUAGE_HTML;
                    return html ? html.getExpressionMarkers(model, monaco) : [];
                }

                function _lintNgExpressions(paneKey) {
                    if (!window.monaco) {
                        return;
                    }
                    var edWrapper = monacoEditors[paneKey];
                    if (!edWrapper) {
                        return;
                    }
                    var model = edWrapper.getModel && edWrapper.getModel();
                    if (!model) {
                        return;
                    }
                    try {
                        monaco.editor.setModelMarkers(model, 'NG_EXPR_MARKER', _computeNgExpressionMarkers(model));
                    } catch (e) {}
                }

                // Delegates DTS/diagnostic/provider setup to SNMonacoPlus.
                var _serverPlusInitialized = false;
                function _initServerMonacoPlus(scope) {
                    var _bs = window.SNMonacoPlusBootstrap;
                    if (!_bs) {
                        return;
                    }
                    if (!_serverPlusInitialized) {
                        _serverPlusInitialized = true;
                        _bs.init({
                            language: 'javascript',
                            getRemBase: function () {
                                return $scope.userPrefs && $scope.userPrefs.remBase > 0 ? $scope.userPrefs.remBase : 16;
                            },
                        });
                    }
                    // Reload scope-specific SN completions DTS for the current widget's app scope.
                    _bs.ensureCoreLoaded().then(function (api) {
                        if (!api) {
                            return;
                        }
                        if (scope && api.loadSnTypeDefinitions) {
                            api.loadSnTypeDefinitions(scope, 'javascript');
                        }
                        if (!_snProvidersRegistered) {
                            _snProvidersRegistered = true;
                            registerSnDefinitionProvider();
                            registerSnReferenceProvider();
                        }
                    });
                }

                function loadSnTypeDefinitions(scope) {
                    _initServerMonacoPlus(scope);
                }

                function loadServerMonarchDts() {
                    _initServerMonacoPlus();
                }

                function loadClientMonarchDts(cb) {
                    var _bs = window.SNMonacoPlusBootstrap;
                    if (_bs) {
                        _bs.init({
                            language: 'javascript',
                            isClient: true,
                            getRemBase: function () {
                                return $scope.userPrefs && $scope.userPrefs.remBase > 0 ? $scope.userPrefs.remBase : 16;
                            },
                        });
                    }
                    if (typeof cb === 'function') {
                        cb();
                    }
                }

                // Refreshes data-<prop> completions/hover/validation for linked Angular Provider directives.
                function _syncProviderCompletions() {
                    if (window.MONACO_LANGUAGE_HTML && typeof MONACO_LANGUAGE_HTML.setProviders === 'function') {
                        MONACO_LANGUAGE_HTML.setProviders($scope.providers);
                    }
                }

                function loadHtmlMonarchDts(cb) {
                    var _bs = window.SNMonacoPlusBootstrap;
                    if (!_bs) {
                        if (typeof cb === 'function') {
                            cb();
                        }
                        return;
                    }
                    var _dependencySysIds = ($scope.dependencies || []).map(function (d) {
                        return d.sys_id;
                    });
                    _bs.init({
                        language: 'html',
                        htmlClassPortalSysId: $scope.userPrefs.htmlClassPortalSysId,
                        htmlClassPortalUrlSuffix: $scope.userPrefs.htmlClassPortalUrlSuffix,
                        htmlClassThemeSysId: $scope.userPrefs.htmlClassThemeSysId,
                        htmlClassDependencySysIds: _dependencySysIds,
                        htmlClassIncludeStandardCss: $scope.userPrefs.htmlClassIncludeStandardCss,
                    }).then(function (api) {
                        // Called directly since core's once-only init may have run before userPrefs loaded.
                        if (api && typeof api.loadHtmlClassIndex === 'function') {
                            api.loadHtmlClassIndex({
                                portalSysId: $scope.userPrefs.htmlClassPortalSysId,
                                portalUrlSuffix: $scope.userPrefs.htmlClassPortalUrlSuffix,
                                themeSysId: $scope.userPrefs.htmlClassThemeSysId,
                                dependencySysIds: _dependencySysIds,
                                includeStandardCss: $scope.userPrefs.htmlClassIncludeStandardCss,
                            });
                        }
                        if (api && typeof api.loadHtmlMonarchDts === 'function') {
                            api.loadHtmlMonarchDts(function () {
                                _syncProviderCompletions();
                                if (typeof cb === 'function') {
                                    cb();
                                }
                            });
                        } else if (typeof cb === 'function') {
                            cb();
                        }
                    });
                }

                // Lazy-loads monaco_code_actions.jsdbx on first JS or SCSS editor.
                function loadCodeActions(modelId, isAngular) {
                    var _bs = window.SNMonacoPlusBootstrap;
                    if (!_bs) {
                        return;
                    }
                    _bs.ensureCoreLoaded().then(function (api) {
                        if (api && typeof api.loadCodeActions === 'function') {
                            api.loadCodeActions({
                                modelId: modelId,
                                isAngular: !!isAngular,
                                getRemBase: function () {
                                    return $scope.userPrefs && $scope.userPrefs.remBase > 0
                                        ? $scope.userPrefs.remBase
                                        : 16;
                                },
                            });
                        }
                    });
                }

                // Script include intellisense — delegated to SNMonacoPlus core
                var _selfSavingFields = {}; // field -> saved value; absorb own-save RW echoes
                var _serverScriptModels = {}; // model.id -> true for server script editors

                // Fetches SN code macros server-side and registers them as Monaco snippet completions.
                var _macroCompletionRegistered = false;

                function registerMacroCompletions() {
                    if (_macroCompletionRegistered) {
                        return;
                    }
                    var ga = new GlideAjax(AJAX_SCRIPT);
                    ga.addParam('sysparm_name', 'getMacros');
                    ga.getXML(function (resp) {
                        if (_macroCompletionRegistered) {
                            return;
                        }
                        var macros = [];
                        try {
                            var answer = resp.responseXML.documentElement.getAttribute('answer');
                            var data = JSON.parse(answer);
                            if (data.success && data.macros) {
                                macros = data.macros;
                            }
                        } catch (e) {}

                        function doRegister() {
                            if (_macroCompletionRegistered || !window.monaco) {
                                return;
                            }
                            _macroCompletionRegistered = true;

                            var suggestions = macros.map(function (m) {
                                return {
                                    label: m.name,
                                    detail: m.comments || '',
                                    insertText: m.script,
                                    kind: monaco.languages.CompletionItemKind.Snippet,
                                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                                };
                            });

                            var frozen = JSON.stringify(suggestions);
                            var _macroProvider = {
                                provideCompletionItems: function (model, position) {
                                    var word = model.getWordUntilPosition(position);
                                    var range = {
                                        startLineNumber: position.lineNumber,
                                        endLineNumber: position.lineNumber,
                                        startColumn: word.startColumn,
                                        endColumn: word.endColumn,
                                    };
                                    return {
                                        suggestions: JSON.parse(frozen).map(function (s) {
                                            return {
                                                label: s.label,
                                                detail: s.detail,
                                                insertText: s.insertText,
                                                kind: s.kind,
                                                insertTextRules: s.insertTextRules,
                                                range: range,
                                            };
                                        }),
                                    };
                                },
                            };
                            monaco.languages.registerCompletionItemProvider('javascript', _macroProvider);
                            monaco.languages.registerCompletionItemProvider('typescript', _macroProvider);
                        }

                        if (window.monaco) {
                            doRegister();
                        } else {
                            require(['vs/editor/editor.main'], doRegister);
                        }
                    });
                }

                // Go to Definition — opens Script Include / UI Script record in new tab
                var _snProvidersRegistered = false;
                function registerSnDefinitionProvider() {
                    if (!window.monaco) {
                        return;
                    }
                    // Tables searched in order; first hit wins
                    var defTables = [
                        { table: 'sys_script_include', nameField: 'api_name' },
                        { table: 'sys_script_include', nameField: 'name' },
                        { table: 'sys_ui_script', nameField: 'name' },
                    ];
                    var _defProvider = {
                        provideDefinition: function (model, position) {
                            var word = model.getWordAtPosition(position);
                            if (!word || !word.word) {
                                return [];
                            }
                            var name = word.word;
                            var headers = {
                                'X-UserToken': window.g_ck || '',
                                Accept: 'application/json',
                            };
                            // Try each table sequentially until a record is found, then open it
                            function tryTable(idx) {
                                if (idx >= defTables.length) {
                                    return;
                                }
                                var t = defTables[idx];
                                $http
                                    .get('/api/now/table/' + t.table, {
                                        params: {
                                            sysparm_query: t.nameField + '=' + name,
                                            sysparm_fields: 'sys_id',
                                            sysparm_limit: 1,
                                        },
                                        headers: headers,
                                    })
                                    .then(
                                        function (res) {
                                            var records = res.data && res.data.result;
                                            if (records && records.length > 0) {
                                                window.open('/' + t.table + '.do?sys_id=' + records[0].sys_id);
                                            } else {
                                                tryTable(idx + 1);
                                            }
                                        },
                                        function () {
                                            tryTable(idx + 1);
                                        }
                                    );
                            }
                            tryTable(0);
                            return [];
                        },
                    };
                    monaco.languages.registerDefinitionProvider('javascript', _defProvider);
                    monaco.languages.registerDefinitionProvider('typescript', _defProvider);
                }

                // Find References — searches for word usage across SN script tables
                var _openSnReferencesModal = null;
                function registerSnReferenceProvider() {
                    if (!window.monaco) {
                        return;
                    }
                    var refTables = [
                        {
                            table: 'sys_script_include',
                            label: 'Script Include',
                            fields: 'sys_id,name,script',
                            searchField: 'script',
                        },
                        {
                            table: 'sp_widget',
                            label: 'Widget',
                            fields: 'sys_id,name,script,client_script',
                            searchField: 'script',
                        },
                        {
                            table: 'sys_ui_page',
                            label: 'UI Page',
                            fields: 'sys_id,name,processing_script',
                            searchField: 'processing_script',
                        },
                        {
                            table: 'sys_script',
                            label: 'Business Rule',
                            fields: 'sys_id,name,script',
                            searchField: 'script',
                        },
                        {
                            table: 'sys_ui_script',
                            label: 'UI Script',
                            fields: 'sys_id,name,script',
                            searchField: 'script',
                        },
                    ];
                    // Build the references modal once; reuse on subsequent searches
                    var _refOverlay = null;
                    var _refTitle = null;
                    var _refBody = null;

                    function _ensureRefModal() {
                        if (_refOverlay) {
                            return;
                        }
                        _refOverlay = document.createElement('dialog');
                        _refOverlay.id = 'we-ref-panel';
                        _refOverlay.className = 'we-modal-backdrop';
                        _refOverlay.innerHTML =
                            '<div class="we-modal we-ref-modal" style="width:40rem;max-width:92vw">' +
                            '<div class="we-modal-header">' +
                            '<span id="we-ref-title"></span>' +
                            '<button type="button" class="we-modal-close-btn" id="we-ref-close" aria-label="Close"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 5L19 19M19 5L5 19" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>' +
                            '</div>' +
                            '<div id="we-ref-body" class="we-modal-body we-ref-body"></div>' +
                            '</div>';
                        document.body.appendChild(_refOverlay);
                        _refTitle = document.getElementById('we-ref-title');
                        _refBody = document.getElementById('we-ref-body');

                        document.getElementById('we-ref-close').addEventListener('click', function () {
                            if (_refOverlay.open) {
                                _refOverlay.close();
                            }
                        });
                        _refOverlay.addEventListener('click', function (e) {
                            if (e.target === _refOverlay) {
                                if (_refOverlay.open) {
                                    _refOverlay.close();
                                }
                            }
                        });
                        _refOverlay.addEventListener('cancel', function () {
                            if (_refOverlay.open) {
                                _refOverlay.close();
                            }
                        });
                    }

                    function _renderRefTitle(name) {
                        if (!_refTitle) {
                            return;
                        }
                        _refTitle.textContent = '';
                        _refTitle.appendChild(document.createTextNode('References to '));
                        var strong = document.createElement('strong');
                        strong.textContent = name || '';
                        _refTitle.appendChild(strong);
                    }

                    function _renderRefSearching() {
                        if (!_refBody) {
                            return;
                        }
                        _refBody.textContent = '';
                        var wrap = document.createElement('div');
                        wrap.className = 'we-ref-loading';
                        var spin = document.createElement('span');
                        spin.className = 'we-ref-spinner';
                        wrap.appendChild(spin);
                        wrap.appendChild(document.createTextNode('Searching records…'));
                        _refBody.appendChild(wrap);
                    }

                    function _renderRefNone(name) {
                        if (!_refBody) {
                            return;
                        }
                        _refBody.textContent = '';
                        var div = document.createElement('div');
                        div.className = 'we-ref-none';
                        div.appendChild(document.createTextNode('No references found for '));
                        var strong = document.createElement('strong');
                        strong.textContent = name || '';
                        div.appendChild(strong);
                        div.appendChild(document.createTextNode('.'));
                        _refBody.appendChild(div);
                    }

                    function _renderRefResults(results) {
                        if (!_refBody) {
                            return;
                        }
                        _refBody.textContent = '';

                        var count = document.createElement('div');
                        count.className = 'we-ref-count';
                        count.textContent = results.length + ' reference' + (results.length !== 1 ? 's' : '');
                        _refBody.appendChild(count);

                        results.forEach(function (r) {
                            var item = document.createElement('div');
                            item.className = 'we-ref-item';

                            var link = document.createElement('a');
                            link.href =
                                '/' +
                                String(r.table || '') +
                                '.do?sys_id=' +
                                encodeURIComponent(String(r.sys_id || ''));
                            link.target = '_blank';
                            link.rel = 'noopener noreferrer';
                            link.textContent = String(r.name || r.sys_id || '');
                            item.appendChild(link);

                            var label = document.createElement('span');
                            label.className = 'we-ref-label';
                            label.textContent = String(r.label || '');
                            item.appendChild(label);

                            _refBody.appendChild(item);
                        });
                    }

                    _openSnReferencesModal = function (name) {
                        if (!name) {
                            return;
                        }
                        var headers = {
                            'X-UserToken': window.g_ck || '',
                            Accept: 'application/json',
                        };

                        _ensureRefModal();
                        _renderRefTitle(name);
                        _renderRefSearching();
                        if (!_refOverlay.open) {
                            try {
                                _refOverlay.showModal();
                            } catch (e) {
                                _refOverlay.setAttribute('open', '');
                            }
                        }

                        var pending = refTables.length;
                        var results = [];
                        refTables.forEach(function (t) {
                            $http
                                .get('/api/now/table/' + t.table, {
                                    params: {
                                        sysparm_query: t.searchField + 'CONTAINS' + name,
                                        sysparm_fields: t.fields,
                                        sysparm_limit: 20,
                                    },
                                    headers: headers,
                                })
                                .then(function (res) {
                                    var records = (res.data && res.data.result) || [];
                                    records.forEach(function (r) {
                                        results.push({
                                            table: t.table,
                                            label: t.label,
                                            name: r.name || r.sys_id,
                                            sys_id: r.sys_id,
                                        });
                                    });
                                })
                                .finally(function () {
                                    pending--;
                                    if (pending === 0) {
                                        if (results.length === 0) {
                                            _renderRefNone(name);
                                        } else {
                                            results.sort(function (a, b) {
                                                if (a.label < b.label) {
                                                    return -1;
                                                }
                                                if (a.label > b.label) {
                                                    return 1;
                                                }
                                                if (a.name < b.name) {
                                                    return -1;
                                                }
                                                if (a.name > b.name) {
                                                    return 1;
                                                }
                                                return 0;
                                            });
                                            _renderRefResults(results);
                                        }
                                    }
                                });
                        });
                    };
                }

                // Server Breakpoints — gutter decoration + SN debug API
                function initBreakpoints(editor, paneKey, pane) {
                    var isSIPane = pane && pane.recordType === 'script_include';
                    if (
                        !isSIPane &&
                        !(pane && pane.scriptKind === 'server') &&
                        !(paneKey === 'script' && $scope.isWidgetRecord !== false)
                    ) {
                        return;
                    }

                    var table, recordSysId;
                    if (isSIPane) {
                        table = 'sys_script_include';
                        recordSysId = pane.sys_id;
                    } else {
                        table = $scope.recordTable || 'sp_widget';
                        recordSysId = $scope.widget && $scope.widget.sys_id;
                    }
                    if (!recordSysId) {
                        return;
                    }

                    var scriptField = (pane && pane.field) || 'script';
                    var bpBase =
                        '/api/now/js/debugger/breakpoint/' + table + '/' + recordSysId + '/' + scriptField + '/';
                    var dpUrl = '/api/now/js/debugpoints/script/' + table + '/' + recordSysId + '/' + scriptField;
                    var authHeaders = {
                        'X-UserToken': window.g_ck || '',
                        Accept: 'application/json',
                    };

                    var activeLines = {}; // line (string) → true
                    var decorationIds = [];
                    var ghostDecorationIds = [];
                    var ghostLine = null;

                    function renderDecorations() {
                        var newDecs = Object.keys(activeLines).map(function (line) {
                            return {
                                range: new monaco.Range(parseInt(line, 10), 1, parseInt(line, 10), 1),
                                options: {
                                    isWholeLine: false,
                                    glyphMarginClassName: 'we-breakpoint-glyph',
                                    glyphMarginHoverMessage: {
                                        value: 'Breakpoint (line ' + line + ')',
                                    },
                                },
                            };
                        });
                        decorationIds = editor.deltaDecorations(decorationIds, newDecs);
                    }

                    function renderGhostDecoration(lineNumber) {
                        var newDecs = lineNumber
                            ? [
                                  {
                                      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                                      options: {
                                          isWholeLine: false,
                                          glyphMarginClassName: 'we-breakpoint-glyph-ghost',
                                      },
                                  },
                              ]
                            : [];
                        ghostDecorationIds = editor.deltaDecorations(ghostDecorationIds, newDecs);
                    }

                    function syncFromServer() {
                        return $http.get(dpUrl, { headers: authHeaders }).then(function (res) {
                            var dp = res.data && res.data.result && res.data.result.debugpoints;
                            // debugpoints structure: { "BREAKPOINT": { "5": {...}, "10": {...} }, ... }
                            var bpLines = dp && dp.BREAKPOINT;
                            activeLines = {};
                            if (bpLines && typeof bpLines === 'object') {
                                Object.keys(bpLines).forEach(function (line) {
                                    activeLines[line] = true;
                                });
                            }
                            renderDecorations();
                        });
                    }

                    // Load existing breakpoints on init
                    syncFromServer();

                    // Ghost glyph + pointer cursor on glyph-margin hover only (not line numbers)
                    var editorDom = editor.getDomNode();
                    editor.onMouseMove(function (e) {
                        var inGutter = e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN;
                        editorDom.style.cursor = inGutter ? 'pointer' : '';
                        var newGhostLine = null;
                        if (inGutter && e.target.position) {
                            var hoverLineNum = e.target.position.lineNumber;
                            // Only show ghost on lines that don't already have a real breakpoint
                            var lineDecs = editor.getLineDecorations(hoverLineNum) || [];
                            var hasReal = lineDecs.some(function (d) {
                                return d.options.glyphMarginClassName === 'we-breakpoint-glyph';
                            });
                            if (!hasReal) {
                                newGhostLine = hoverLineNum;
                            }
                        }
                        if (newGhostLine !== ghostLine) {
                            ghostLine = newGhostLine;
                            renderGhostDecoration(ghostLine);
                        }
                    });

                    editor.onMouseLeave(function () {
                        editorDom.style.cursor = '';
                        if (ghostLine !== null) {
                            ghostLine = null;
                            renderGhostDecoration(null);
                        }
                    });

                    editor.onMouseDown(function (e) {
                        if (
                            e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
                            e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
                        ) {
                            if (!e.target.position) {
                                return;
                            }
                            var lineNumber = e.target.position.lineNumber;
                            var line = String(lineNumber);
                            // Use actual rendered decorations to decide set vs remove —
                            // more reliable than activeLines which may lag behind
                            var lineDecs = editor.getLineDecorations(lineNumber) || [];
                            var isRemoving = lineDecs.some(function (d) {
                                return d.options.glyphMarginClassName === 'we-breakpoint-glyph';
                            });
                            // Set: body {evaluationString:''}; Remove: empty body
                            var postConfig = isRemoving
                                ? { headers: authHeaders }
                                : {
                                      headers: angular.extend(
                                          {
                                              'Content-Type': 'application/json',
                                          },
                                          authHeaders
                                      ),
                                  };
                            var postBody = isRemoving ? undefined : { evaluationString: '' };
                            $http.post(bpBase + line, postBody, postConfig).then(function () {
                                syncFromServer();
                            });
                        }
                    });
                }

                // Splitter drag
                $scope.startSplitterDrag = function (splitterIdx, event) {
                    var items = $scope.visibleItems;
                    var leftPane = items[splitterIdx - 1];
                    var rightPane = items[splitterIdx + 1];
                    if (!leftPane || !rightPane) {
                        return;
                    }

                    var leftEl = document.getElementById('pane-' + leftPane.key);
                    var rightEl = document.getElementById('pane-' + rightPane.key);
                    if (!leftEl || !rightEl) {
                        return;
                    }

                    var startX = event.clientX;
                    var startLeftW = leftEl.offsetWidth;
                    var startRightW = rightEl.offsetWidth;

                    event.currentTarget.classList.add('dragging');
                    var splitterEl = event.currentTarget;

                    function onMove(e) {
                        var dx = e.clientX - startX;
                        var newLeft = Math.max(60, startLeftW + dx);
                        var newRight = Math.max(60, startRightW - dx);
                        leftPane.width = newLeft;
                        rightPane.width = newRight;
                        $scope.$apply();
                        layoutAllEditors();
                    }

                    function onUp() {
                        splitterEl.classList.remove('dragging');
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                    }
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                };

                // Save: single field
                var _paneIdDebounceMap = {};
                function checkPaneId(pane) {
                    var requestId = pane._idCheckRequest;
                    var action = pane.recordType === 'template' ? 'checkTemplateId' : 'checkProviderId';
                    ajax(action, {
                        id: pane.recordId,
                        sys_id: pane.sys_id || '',
                    }).then(function (res) {
                        if (requestId !== pane._idCheckRequest) {
                            return;
                        }
                        pane.idChecking = false;
                        pane.idError = !res.success
                            ? res.error || 'Could not check name.'
                            : res.exists
                              ? 'ID already exists'
                              : null;
                        pane.editorUnlocked = !pane.idError;
                        if (monacoEditors[pane.key]) {
                            monacoEditors[pane.key].updateOptions({
                                readOnly: !pane.editorUnlocked,
                            });
                        }
                    });
                }
                $scope.onPaneIdChange = function (pane) {
                    pane._idCheckRequest = (pane._idCheckRequest || 0) + 1;
                    pane.idDirty = true;
                    pane.idError = null;
                    pane.editorUnlocked = false;
                    if (monacoEditors[pane.key]) {
                        monacoEditors[pane.key].updateOptions({
                            readOnly: true,
                        });
                    }
                    $timeout.cancel(_paneIdDebounceMap[pane.key]);
                    if (!pane.recordId || !pane.recordId.trim()) {
                        pane.idChecking = false;
                        return;
                    }
                    pane.idChecking = true;
                    _paneIdDebounceMap[pane.key] = $timeout(function () {
                        checkPaneId(pane);
                    }, 500);
                };

                var _providerScaffoldDefaultNames = {
                    directive: 'myDirective',
                    factory: 'myFactory',
                    service: 'MyService',
                };

                function _buildProviderScaffold(providerType, fnName) {
                    if (providerType === 'directive') {
                        return (
                            'function ' +
                            fnName +
                            '() {\n' +
                            '    return {\n' +
                            "        restrict: 'E',\n" +
                            '        scope: {},\n' +
                            "        controllerAs: 'c',\n" +
                            '        bindToController: true,\n' +
                            '        template: ``,\n' +
                            '        link: function (scope, element, attrs) {},\n' +
                            '        controller: function ($scope, $element, $attrs) {},\n' +
                            '    };\n' +
                            '}\n'
                        );
                    }
                    if (providerType === 'factory') {
                        return (
                            'function ' +
                            fnName +
                            '() {\n' +
                            '    return {\n' +
                            '        someMethod: function () {},\n' +
                            '    };\n' +
                            '}\n'
                        );
                    }
                    if (providerType === 'service') {
                        return 'function ' + fnName + '() {\n' + '    this.someMethod = function () {};\n' + '}\n';
                    }
                    return null;
                }

                $scope.onProviderTypeChange = function (pane) {
                    pane.dirty = true;
                    var editor = monacoEditors[pane.key];
                    var currentValue = editor ? editor.getValue() : pane.content || '';
                    // Auto-swaps only when the pane is empty or still holds the last-inserted scaffold.
                    if (currentValue.trim() !== '' && currentValue !== pane._scaffoldContent) {
                        return;
                    }
                    var fnName = pane.recordId || _providerScaffoldDefaultNames[pane.providerType] || 'myProvider';
                    var scaffold = _buildProviderScaffold(pane.providerType, fnName);
                    if (!scaffold) {
                        return;
                    }
                    pane.content = scaffold;
                    pane._scaffoldContent = scaffold;
                    if (editor) {
                        editor.setValue(scaffold);
                    }
                };

                function _handleCtrlS(pane) {
                    if ($scope.isVersionView || !$scope.canWriteWidget) {
                        return;
                    }
                    if ($scope.isWidgetRecord === false && $scope.isNewWidget) {
                        $scope.saveAll();
                        return;
                    }
                    if ($scope.userPrefs.ctrlSSaveActiveOnly) {
                        if (pane && pane.dirty) {
                            $scope.savePaneField(pane);
                        }
                    } else {
                        $scope.saveAll();
                    }
                }

                $scope.savePaneField = function (pane) {
                    if ($scope.isWidgetRecord === false && $scope.isNewWidget) {
                        $scope.saveAll();
                        return;
                    }
                    if ($scope.isVersionView || pane.readOnly) {
                        return;
                    }
                    $scope.permissionAlertDismissed = false;
                    if (pane.recordType === 'script_include') {
                        saveExtraPane(pane);
                        return;
                    }
                    if (pane.hasIdInput) {
                        saveExtraPane(pane);
                        return;
                    }

                    var editor = monacoEditors[pane.key];
                    var value = editor ? editor.getValue() : $scope.widget[pane.field] || '';

                    // Mark field as self-saving so the record-watcher echo is absorbed
                    _selfSavingFields[pane.field] = value;

                    ajax('saveField', {
                        sys_id: SYS_ID,
                        field: pane.field,
                        value: value,
                    })
                        .then(function (data) {
                            if (!data.success) {
                                delete _selfSavingFields[pane.field];
                                pane.saveError = data.error || 'Save failed';
                                return;
                            }
                            pane.saveError = null;
                            originalValues[pane.field] = value;
                            lastServerValues[pane.field] = value;
                            if (data.sys_updated_on) {
                                $scope.widget.sys_updated_on = data.sys_updated_on;
                            }
                            pane.dirty = !_editorValuesEqual(
                                editor ? editor.getValue() : $scope.widget[pane.field] || '',
                                value
                            );
                            pane.externalChange = null;
                            _writeLocalDraft(true);
                            if ($scope.isWidgetRecord === false) {
                                ajax('getVersions', { sys_id: SYS_ID }).then(function (result) {
                                    if (result.success) $scope.versions = result.versions;
                                });
                            }
                            if (!hasUnsavedChanges()) {
                                pane.savedAt = null;
                                $scope.lastSaveTime = new Date();
                                if (data.update_set_sys_id && data.update_set_name) {
                                    $scope.lastSaveUpdateSet = {
                                        sys_id: data.update_set_sys_id,
                                        name: data.update_set_name,
                                    };
                                }
                            } else {
                                pane.savedAt = new Date();
                            }
                            // Safety: clear self-save flag if RW echo never arrives
                            $timeout(function () {
                                delete _selfSavingFields[pane.field];
                            }, 5000);
                        })
                        .catch(function (err) {
                            delete _selfSavingFields[pane.field];
                            pane.saveError = 'Save failed';
                            if (err && err.message) {
                                pane.saveError += ' (' + err.message + ')';
                            }
                        });
                };

                // Save: all (header Save button)
                $scope.$watch('widget.name', function (v) {
                    if (v && v.trim()) {
                        $scope.nameInvalid = false;
                        if ($scope.saveError === 'Widget name is required') {
                            $scope.saveError = null;
                        }
                    }
                });

                function _formatRelativeTime(date) {
                    var now = new Date();
                    var diffMs = now - date;
                    var diffMin = Math.floor(diffMs / 60000);
                    if (diffMin < 1) {
                        return 'just now';
                    }
                    if (diffMin < 60) {
                        return diffMin + ' min' + (diffMin === 1 ? '' : 's') + ' ago';
                    }
                    var opts = { hour: 'numeric', minute: '2-digit' };
                    if (diffMs >= 86400000) {
                        opts.month = 'short';
                        opts.day = 'numeric';
                        opts.year = 'numeric';
                    }
                    return date.toLocaleString(undefined, opts);
                }

                $scope.getLastSaveLabel = function () {
                    return $scope.lastSaveTime ? 'Saved ' + _formatRelativeTime($scope.lastSaveTime) : '';
                };

                $scope.getLocalDraftEditedLabel = function (draft) {
                    return _formatRelativeTime(new Date(draft.updatedAt));
                };

                $scope.getLastDraftSaveLabel = function () {
                    return $scope.userPrefs.autosaveInterval && $scope.lastDraftSaveTime
                        ? _formatRelativeTime($scope.lastDraftSaveTime)
                        : '';
                };

                $scope.getPaneSavedLabel = function (pane) {
                    return pane.savedAt ? 'Saved ' + _formatRelativeTime(pane.savedAt) : '';
                };

                $scope.formatUpdateSetName = function (name) {
                    if (!name || name.length <= 25) {
                        return name;
                    }
                    return name.substring(0, 20) + '\u2026' + name.slice(-4);
                };

                // Keep the relative labels fresh even when the user is idle
                setInterval(function () {
                    var hasPaneSaved = $scope.visibleItems.some(function (item) {
                        return item.type === 'pane' && item.savedAt;
                    });
                    if (
                        $scope.lastSaveTime ||
                        ($scope.localDrafts && $scope.localDrafts.length) ||
                        ($scope.userPrefs.autosaveInterval && $scope.lastDraftSaveTime) ||
                        hasPaneSaved
                    ) {
                        $scope.$applyAsync();
                    }
                }, 30000);

                function _acceptWidgetSave(payload) {
                    if ($scope.isWidgetRecord === false) {
                        Object.keys(payload).forEach(function (name) {
                            if (Object.prototype.hasOwnProperty.call(originalValues, name)) {
                                originalValues[name] = lastServerValues[name] = payload[name];
                                var pane = paneMap[name];
                                if (pane) {
                                    pane.dirty = !_editorValuesEqual(
                                        monacoEditors[name] ? monacoEditors[name].getValue() : $scope.widget[name],
                                        payload[name]
                                    );
                                    pane.savedAt = null;
                                    pane.externalChange = null;
                                }
                            } else originalHeader[name] = payload[name];
                        });
                        if ($scope.recordPrimaryField === 'id' && payload.id !== undefined)
                            originalHeader.name = payload.id;
                        ($scope.additionalWidgetFields || []).forEach(function (def) {
                            $scope.headerDirty[def.name] =
                                _normaliseExtraWidgetFieldValue(def, $scope.widget[def.name]) !==
                                originalHeader[def.name];
                        });
                        $scope.headerDirty.name = ($scope.widget.name || '') !== originalHeader.name;
                        _writeLocalDraft(true);
                        return;
                    }
                    $scope.coreEditorDefs.forEach(function (def) {
                        var val = payload[def.field] || '';
                        originalValues[def.field] = val;
                        lastServerValues[def.field] = val;
                    });
                    $scope.visibleItems.forEach(function (item) {
                        if (item.type === 'pane' && item.field) {
                            item.dirty = !_editorValuesEqual(
                                monacoEditors[item.key]
                                    ? monacoEditors[item.key].getValue()
                                    : $scope.widget[item.field] || '',
                                originalValues[item.field]
                            );
                            item.savedAt = null;
                            item.externalChange = null;
                        }
                    });
                    originalHeader = {
                        name: payload.name || '',
                        id: payload.id || '',
                        description: payload.description || '',
                        controller_as: payload.controller_as || 'c',
                        is_public: !!payload.public,
                        roles: payload.roles || '',
                        static: !!payload.static,
                    };
                    _captureAdditionalHeaderValues(payload);
                    Object.keys(originalHeader).forEach(function (field) {
                        var current = field === 'roles' ? $scope.rolesList.join(',') : $scope.widget[field];
                        current =
                            typeof originalHeader[field] === 'boolean'
                                ? !!current
                                : current || (field === 'controller_as' ? 'c' : '');
                        $scope.headerDirty[field] = current !== originalHeader[field];
                    });
                    _clearWidgetDrafts();
                }

                $scope.saveAll = function () {
                    if ($scope.isVersionView) {
                        return;
                    }
                    if (!$scope.canWriteWidget) {
                        return;
                    }
                    $scope.saveError = null;
                    $scope.permissionAlertDismissed = false;
                    var primary = $scope.isWidgetRecord === false ? $scope.recordPrimaryField : 'name';
                    if (!$scope.widget[primary] || !$scope.widget[primary].trim()) {
                        $scope.nameInvalid = true;
                        $scope.saveError =
                            $scope.isWidgetRecord === false
                                ? 'A record name or ID is required.'
                                : 'Widget name is required';
                        return;
                    }

                    var payload = _buildSavePayload();

                    // Marks script fields self-saving so the record-watcher echo doesn't re-dirty panes.
                    var _saveAllScriptFields = $scope.coreEditorDefs.map(function (def) {
                        return def.field;
                    });
                    _saveAllScriptFields.forEach(function (f) {
                        _selfSavingFields[f] = payload[f];
                    });

                    ajax('saveWidget', {
                        sys_id: SYS_ID,
                        data: JSON.stringify(payload),
                    })
                        .then(function (data) {
                            if (!data.success) {
                                _saveAllScriptFields.forEach(function (f) {
                                    delete _selfSavingFields[f];
                                });
                                $scope.saveError = data.error || 'Save failed';
                                return;
                            }
                            $scope.saveError = null;
                            $scope.lastSaveTime = new Date();
                            $scope.lastSaveUpdateSet =
                                data.update_set_sys_id && data.update_set_name
                                    ? {
                                          sys_id: data.update_set_sys_id,
                                          name: data.update_set_name,
                                      }
                                    : null;
                            if (data.sys_updated_on) {
                                $scope.widget.sys_updated_on = data.sys_updated_on;
                            }
                            var acceptedPayload = payload;
                            var wasNew = $scope.isNewWidget;
                            if (wasNew) {
                                SYS_ID = data.sys_id;
                                $scope.widget.sys_id = SYS_ID;
                                var newUrl = buildWidgetEditorUrl(SYS_ID, RECORD_TABLE);
                                history.replaceState({}, '', newUrl);
                                try {
                                    window.parent.history.replaceState({}, '', newUrl);
                                } catch (e) {}
                                $scope.isNewWidget = false;
                                $scope.userPrefs.recentRecords = _mergeRecentRecord(RECORD_TABLE, SYS_ID);
                                saveUserPrefs();
                                if (
                                    $scope.isWidgetRecord === false &&
                                    data.created_record &&
                                    data.created_record.success
                                ) {
                                    var created = data.created_record;
                                    acceptedPayload = angular.copy(payload);
                                    Object.keys(acceptedPayload).forEach(function (name) {
                                        if (Object.prototype.hasOwnProperty.call(created.widget, name))
                                            acceptedPayload[name] = created.widget[name];
                                    });
                                    _setAdditionalWidgetFields(created.additional_widget_fields);
                                    $scope.additionalWidgetFields.forEach(function (def) {
                                        if (!def.canWrite && !Object.prototype.hasOwnProperty.call(payload, def.name)) {
                                            $scope.widget[def.name] = created.widget[def.name];
                                            originalHeader[def.name] = _normaliseExtraWidgetFieldValue(
                                                def,
                                                created.widget[def.name]
                                            );
                                        }
                                    });
                                    $scope.widget.application = created.widget.application;
                                    $scope.widget.application_sys_id = created.widget.application_sys_id;
                                    $scope.canWriteWidget = created.widget.canWrite !== false;
                                    created.core_editor_defs.forEach(function (def) {
                                        var existing = $scope.coreEditorDefs.find(function (item) {
                                            return item.key === def.key;
                                        });
                                        if (existing) existing.readOnly = def.readOnly;
                                        if (paneMap[def.key]) paneMap[def.key].readOnly = def.readOnly;
                                        if (monacoEditors[def.key])
                                            monacoEditors[def.key].updateOptions({
                                                readOnly: !$scope.canWriteWidget || def.readOnly,
                                            });
                                    });
                                }
                            }
                            _acceptWidgetSave(acceptedPayload);
                            // Sync ES12 once the record has a SYS_ID.
                            $scope.saveEs12();
                            // Always refresh versions after a save so the new entry appears in the dropdown
                            ajax('getVersions', { sys_id: SYS_ID }).then(function (d) {
                                if (d.success) {
                                    $scope.versions = d.versions;
                                }
                            });
                            if (wasNew && $scope.isWidgetRecord) {
                                // Load remaining side data now that the record exists
                                ajax('getTemplates', { sys_id: SYS_ID }).then(function (d) {
                                    if (d.success) {
                                        $scope.templates = d.templates;
                                    }
                                });
                                ajax('getProviders', { sys_id: SYS_ID }).then(function (d) {
                                    if (d.success) {
                                        $scope.providers = d.providers;
                                        _syncProviderCompletions();
                                    }
                                });
                                ajax('getDependencies', {
                                    sys_id: SYS_ID,
                                }).then(function (d) {
                                    if (d.success) {
                                        $scope.dependencies = d.dependencies;
                                    }
                                });
                                startPresenceSubscription(SYS_ID);
                                startRecordWatcher();
                            }
                            // Also save any dirty open templates/providers
                            extraPanes.forEach(function (pane) {
                                if (pane.dirty || pane.idDirty) {
                                    saveExtraPane(pane);
                                }
                            });
                            // Safety: clear self-save flags if the RW echo never arrives
                            $timeout(function () {
                                _saveAllScriptFields.forEach(function (f) {
                                    delete _selfSavingFields[f];
                                });
                            }, 5000);
                        })
                        .catch(function (err) {
                            _saveAllScriptFields.forEach(function (f) {
                                delete _selfSavingFields[f];
                            });
                            $scope.saveError = 'Save failed';
                            if (err && err.message) {
                                $scope.saveError += ' (' + err.message + ')';
                            }
                        });
                };

                // ES12
                $scope.saveEs12 = function () {
                    if ($scope.isWidgetRecord === false && !$scope.widget.es12_supported) return;
                    // Defer until the record exists; the server upserts the setting.
                    if (!SYS_ID) {
                        return;
                    }
                    ajax('saveEs12', {
                        sys_id: SYS_ID,
                        enabled: $scope.widget.es12 ? 'true' : 'false',
                    }).then(function (data) {
                        if (!data.success) {
                            $scope.widget.es12 = _es12Enabled;
                            $scope.saveError = data.error || 'Could not save ES12 setting.';
                            return;
                        }
                        _applyEsVersion(!!data.result);
                        $scope.es12RecordExists = true;
                    });
                };

                // Presence via AMB channel (real-time, no polling), mirroring platform snRecordPresence.
                var _presenceVisibilityHandler = null;

                function startPresenceSubscription(widgetSysId) {
                    _presenceWidgetSysId = widgetSysId;

                    var currentUserId = (typeof NOW !== 'undefined' && NOW.user_id) || null;
                    // Presence map (user_id -> user info), seeded by polling, kept live via AMB.
                    var presenceMap = {};

                    function updatePresenceFromMap() {
                        $scope.presenceUsers = Object.keys(presenceMap).map(function (uid) {
                            return presenceMap[uid];
                        });
                    }

                    function fetchPresence() {
                        ajax('getPresence', { sys_id: widgetSysId }).then(function (data) {
                            if (!data || !data.success) {
                                return;
                            }
                            presenceMap = {};
                            (data.users || []).forEach(function (u) {
                                if (u.sys_id && u.sys_id !== currentUserId) {
                                    presenceMap[u.sys_id] = u;
                                }
                            });
                            updatePresenceFromMap();
                        });
                    }

                    // Publish our own viewing status to the presence channel.
                    // Mirrors snRecordPresence.publish() — notifies other subscribers in real-time.
                    function publishPresence(status) {
                        if (!presenceChannel) {
                            return;
                        }
                        try {
                            presenceChannel.publish({
                                presences: [
                                    {
                                        status: status,
                                        session_id: (NOW && NOW.session_id) || '',
                                        user_name: (NOW && NOW.user_name) || '',
                                        user_id: currentUserId || '',
                                        user_display_name: (NOW && (NOW.user_display_name || NOW.full_name)) || '',
                                        user_initials: (NOW && NOW.user_initials) || '',
                                        user_avatar: (NOW && NOW.user_avatar) || null,
                                        table: 'sp_widget',
                                        sys_id: widgetSysId,
                                    },
                                ],
                            });
                        } catch (e) {}
                    }

                    if (amb) {
                        try {
                            presenceChannel = amb.getChannel('/sn/rp/sp_widget/' + widgetSysId);

                            // Subscribe to receive other users' presence updates in real-time.
                            // Subscribing also registers us server-side (sys_amb_channel_presence).
                            presenceChannel.subscribe(function (msg) {
                                var presences = msg && msg.data && msg.data.presences;
                                if (!presences) {
                                    return;
                                }
                                var changed = false;
                                presences.forEach(function (p) {
                                    var uid = p.user_id;
                                    if (!uid || uid === currentUserId) {
                                        return;
                                    }
                                    if (p.status === 'exited' || p.status === 'probably left') {
                                        if (presenceMap[uid]) {
                                            delete presenceMap[uid];
                                            changed = true;
                                        }
                                    } else {
                                        presenceMap[uid] = {
                                            sys_id: uid,
                                            name: p.user_display_name || p.user_name || uid,
                                            initials: p.user_initials || p.user_initial || '',
                                            avatar: p.user_avatar || null,
                                        };
                                        changed = true;
                                    }
                                });
                                if (changed) {
                                    $scope.$applyAsync(updatePresenceFromMap);
                                }
                            });

                            // Ensure the AMB connection is active then announce ourselves.
                            amb.connect();
                            $timeout(function () {
                                publishPresence('viewing');
                            }, 500);
                        } catch (e) {}
                    }

                    // Initial fetch — catches users already viewing before we subscribed.
                    $timeout(fetchPresence, 1500);

                    _presenceVisibilityHandler = function () {
                        if (document.hidden) {
                            publishPresence('probably left');
                        } else {
                            fetchPresence();
                            publishPresence('viewing');
                        }
                    };
                    document.addEventListener('visibilitychange', _presenceVisibilityHandler);
                }

                function stopPresenceSubscription() {
                    if (presenceChannel) {
                        // Publishes "exited" before unsubscribing, mirroring snRecordPresence.termPresence.
                        try {
                            presenceChannel.publish({
                                presences: [
                                    {
                                        status: 'exited',
                                        session_id: (NOW && NOW.session_id) || '',
                                        user_id: (NOW && NOW.user_id) || '',
                                        table: 'sp_widget',
                                        sys_id: _presenceWidgetSysId,
                                    },
                                ],
                            });
                        } catch (e) {}
                        try {
                            presenceChannel.unsubscribe();
                        } catch (e) {}
                        presenceChannel = null;
                    }
                    if (_presenceVisibilityHandler) {
                        document.removeEventListener('visibilitychange', _presenceVisibilityHandler);
                        _presenceVisibilityHandler = null;
                    }
                    _presenceWidgetSysId = null;
                    $scope.presenceUsers = [];
                }

                // Per-pane presence (template / provider editors)
                var _panePresenceCurrentUserId = (typeof NOW !== 'undefined' && NOW.user_id) || null;

                function _presencePublishData(table, sysId, status) {
                    return {
                        presences: [
                            {
                                status: status,
                                session_id: (NOW && NOW.session_id) || '',
                                user_name: (NOW && NOW.user_name) || '',
                                user_id: _panePresenceCurrentUserId || '',
                                user_display_name: (NOW && (NOW.user_display_name || NOW.full_name)) || '',
                                user_initials: (NOW && NOW.user_initials) || '',
                                user_avatar: (NOW && NOW.user_avatar) || null,
                                table: table,
                                sys_id: sysId,
                            },
                        ],
                    };
                }

                function startPanePresence(pane) {
                    if (!amb || !pane.sys_id || pane._presenceChannel) {
                        return;
                    }
                    var table =
                        pane.recordType === 'template'
                            ? 'sp_ng_template'
                            : pane.recordType === 'script_include'
                              ? 'sys_script_include'
                              : 'sp_angular_provider';
                    var panePresenceMap = {};

                    try {
                        pane._presenceChannel = amb.getChannel('/sn/rp/' + table + '/' + pane.sys_id);
                        pane._presenceChannel.subscribe(function (msg) {
                            var presences = msg && msg.data && msg.data.presences;
                            if (!presences) {
                                return;
                            }
                            var changed = false;
                            presences.forEach(function (p) {
                                var uid = p.user_id;
                                if (!uid || uid === _panePresenceCurrentUserId) {
                                    return;
                                }
                                if (p.status === 'exited' || p.status === 'probably left') {
                                    if (panePresenceMap[uid]) {
                                        delete panePresenceMap[uid];
                                        changed = true;
                                    }
                                } else {
                                    panePresenceMap[uid] = {
                                        sys_id: uid,
                                        name: p.user_display_name || p.user_name || uid,
                                        initials: p.user_initials || p.user_initial || '',
                                        avatar: p.user_avatar || null,
                                    };
                                    changed = true;
                                }
                            });
                            if (changed) {
                                $scope.$applyAsync(function () {
                                    pane.viewingUsers = Object.keys(panePresenceMap).map(function (uid) {
                                        return panePresenceMap[uid];
                                    });
                                });
                            }
                        });
                        $timeout(function () {
                            if (pane._presenceChannel) {
                                try {
                                    pane._presenceChannel.publish(_presencePublishData(table, pane.sys_id, 'viewing'));
                                } catch (e) {}
                            }
                        }, 500);
                    } catch (e) {}
                }

                function stopPanePresence(pane) {
                    if (!pane._presenceChannel) {
                        return;
                    }
                    var table =
                        pane.recordType === 'template'
                            ? 'sp_ng_template'
                            : pane.recordType === 'script_include'
                              ? 'sys_script_include'
                              : 'sp_angular_provider';
                    try {
                        pane._presenceChannel.publish(_presencePublishData(table, pane.sys_id, 'exited'));
                    } catch (e) {}
                    try {
                        pane._presenceChannel.unsubscribe();
                    } catch (e) {}
                    pane._presenceChannel = null;
                    pane.viewingUsers = [];
                }

                $scope.viewersTitle = function (pane) {
                    return (pane.viewingUsers || [])
                        .filter(function (u) {
                            return u.sys_id !== $scope.currentUserId;
                        })
                        .map(function (u) {
                            return u.name;
                        })
                        .join(', ');
                };

                // Extra pane (template/provider) external-change via AMB record watcher
                function startPaneRecordWatcher(pane) {
                    if (!amb || !pane.sys_id || pane._rwChannel) {
                        return;
                    }
                    var table =
                        pane.recordType === 'template'
                            ? 'sp_ng_template'
                            : pane.recordType === 'script_include'
                              ? 'sys_script_include'
                              : 'sp_angular_provider';
                    var contentField = pane.recordType === 'template' ? 'template' : 'script';
                    try {
                        pane._rwChannel = amb.getRecordWatcherChannel
                            ? amb.getRecordWatcherChannel(table, 'sys_id=' + pane.sys_id)
                            : amb.getChannel('/rw/default/' + table + '/' + btoa('sys_id=' + pane.sys_id));
                        pane._rwChannel.subscribe(function (msg) {
                            var d = msg && msg.data;
                            if (!d || !d.record || !d.record[contentField]) {
                                return;
                            }
                            var serverVal = d.record[contentField].value || '';
                            if (serverVal === pane.lastServerContent) {
                                return;
                            }
                            // Absorb echo of our own save (may arrive before AJAX callback)
                            if (pane._pendingSaveContent !== undefined && pane._pendingSaveContent === serverVal) {
                                delete pane._pendingSaveContent;
                                pane.lastServerContent = serverVal;
                                return;
                            }
                            var updater = (msg.ext && msg.ext.from_user) || 'Another user';
                            $timeout(function () {
                                pane.lastServerContent = serverVal;
                                var editor = monacoEditors[pane.key];
                                if (!pane.dirty && editor) {
                                    editor.setValue(serverVal);
                                } else {
                                    pane.externalChange = {
                                        user: updater,
                                        serverVal: serverVal,
                                    };
                                }
                            });
                        });
                    } catch (e) {}
                }

                function stopPaneRecordWatcher(pane) {
                    if (!pane._rwChannel) {
                        return;
                    }
                    try {
                        pane._rwChannel.unsubscribe();
                    } catch (e) {}
                    pane._rwChannel = null;
                }

                // External-change detection via AMB record watcher
                function startRecordWatcher() {
                    if (!amb) {
                        return;
                    }

                    // Equivalent to snRecordWatcher._initWatcher(), which ng.amb doesn't expose here.
                    try {
                        var rwChannel = amb.getRecordWatcherChannel
                            ? amb.getRecordWatcherChannel('sp_widget', 'sys_id=' + SYS_ID)
                            : amb.getChannel('/rw/default/sp_widget/' + btoa('sys_id=' + SYS_ID));
                        rwChannel.subscribe(function (msg) {
                            var d = msg && msg.data;
                            if (!d || (d.sys_id && d.sys_id !== SYS_ID)) {
                                return;
                            }
                            $timeout(function () {
                                _applyWidgetRwMessage(d, msg.ext);
                            });
                        });
                        amb.connect();
                    } catch (e) {
                        return;
                    }
                }

                function _applyWidgetRwMessage(d, ext) {
                    var updater =
                        (ext && ext.from_user) ||
                        (d.record && d.record.sys_updated_by && d.record.sys_updated_by.value) ||
                        'Another user';
                    var changes = d.changes_with_users || {};
                    var record = d.record || {};

                    // Refresh the versions dropdown whenever any change is detected
                    ajax('getVersions', { sys_id: SYS_ID }).then(function (vd) {
                        if (vd.success) {
                            $scope.versions = vd.versions;
                        }
                    });

                    Object.keys(changes).forEach(function (field) {
                        if (!record[field]) {
                            return;
                        }
                        var serverVal = record[field].value || '';
                        lastServerValues[field] = serverVal;
                        var pane = getPaneByField(field);
                        if (!pane) {
                            return;
                        }
                        // Skips the infobar when the RW notification just echoes our own save.
                        if (_selfSavingFields[field] !== undefined && _selfSavingFields[field] === serverVal) {
                            delete _selfSavingFields[field];
                            originalValues[field] = serverVal;
                            pane.dirty = false;
                            pane.externalChange = null;
                            return;
                        }
                        originalValues[field] = serverVal;
                        if ($scope.userPrefs.realtimeWidgetUpdates) {
                            if (monacoEditors[pane.key]) {
                                monacoEditors[pane.key].setValue(serverVal);
                            }
                            $scope.widget[field] = serverVal;
                            pane.externalChange = null;
                        } else {
                            pane.dirty = true;
                            pane.externalChange = {
                                user: updater,
                                serverVal: serverVal,
                            };
                        }
                    });
                }

                function getPaneByField(field) {
                    for (var i = 0; i < $scope.visibleItems.length; i++) {
                        var item = $scope.visibleItems[i];
                        if (item.type === 'pane' && item.field === field) {
                            return item;
                        }
                    }
                    return null;
                }

                // Listens for a revert triggered from the diff page (localStorage signal).
                // Reverts by other users are handled by the AMB record watcher.
                function startRevertListener() {
                    var revertKey = '_weRevertPending_' + SYS_ID;
                    var FIELDS = ['template', 'css', 'client_script', 'script', 'link'];

                    function _onRevertDetected(w) {
                        FIELDS.forEach(function (f) {
                            lastServerValues[f] = w[f] || '';
                        });
                        $timeout(function () {
                            $scope.widgetReverted = true;
                        });
                    }

                    // Same-tab revert confirmed via fetch; other-user reverts arrive through the AMB record watcher.
                    window.addEventListener('storage', function (e) {
                        if (e.key !== revertKey || !e.newValue) {
                            return;
                        }
                        try {
                            localStorage.removeItem(revertKey);
                        } catch (ex) {}
                        ajax('getWidget', { sys_id: SYS_ID }).then(function (data) {
                            if (!data.success || !data.widget) {
                                return;
                            }
                            var w = data.widget;
                            // Only show the banner if server values actually changed (skips a cancelled revert).
                            var changed = FIELDS.some(function (f) {
                                return (w[f] || '') !== lastServerValues[f];
                            });
                            if (changed) {
                                _onRevertDetected(w);
                            }
                        });
                    });
                }

                $scope.reloadPage = function () {
                    window.location.reload();
                };

                $scope.requestRevert = function () {
                    $scope.openDropdown = null;
                    $scope.showRevertConfirm = true;
                };

                $scope.cancelRevert = function () {
                    _closeModal(function () {
                        $scope.showRevertConfirm = false;
                    });
                };

                $scope.confirmRevert = function () {
                    if ($scope.creatingRecord || !_discardPageDraft()) return;
                    _bypassUnloadWarning = true;
                    window.location.reload();
                };

                // Editor visibility & user preferences
                function _clearPaneWidths() {
                    Object.keys(paneMap).forEach(function (k) {
                        paneMap[k].width = null;
                    });
                    extraPanes.forEach(function (p) {
                        p.width = null;
                    });
                }

                function applyVisibility() {
                    // Save current value of editors becoming hidden, then dispose them
                    $scope.coreEditorDefs.forEach(function (def) {
                        if (!def.visible && monacoEditors[def.key]) {
                            $scope.widget[def.field] = monacoEditors[def.key].getValue();
                            disposeEditor(def.key);
                        }
                    });
                    _clearPaneWidths();
                    buildVisibleItems();
                    $timeout(function () {
                        initAllEditors();
                    }, 50);
                }

                $scope.onEditorVisibilityChange = function () {
                    applyVisibility();
                };

                function _buildUserPrefsBlob() {
                    // Editor order/visibility come from the last saved snapshot, not the
                    // live tab state, so session-only tab changes never get persisted as
                    // the default via unrelated saves (recent widgets, history pane, etc).
                    var storedOrder = $scope.userPrefs.editorOrder || [];
                    var storedVis = $scope.userPrefs.editorVisibility || {};
                    var prefs = {};
                    $scope.coreEditorDefs.forEach(function (d) {
                        prefs[d.key] = storedVis.hasOwnProperty(d.key) ? storedVis[d.key] : d.visible;
                    });
                    prefs.formatTabsToSpaces = $scope.userPrefs.formatTabsToSpaces;
                    prefs.wordWrap = $scope.userPrefs.wordWrap;
                    prefs.editorTheme = $scope.userPrefs.editorTheme;
                    prefs.minimap = $scope.userPrefs.minimap;
                    prefs.alwaysShowLink = $scope.userPrefs.alwaysShowLink;
                    prefs.realtimeWidgetUpdates = $scope.userPrefs.realtimeWidgetUpdates;
                    prefs.autoIndent = $scope.userPrefs.autoIndent;
                    prefs.formatOnPaste = $scope.userPrefs.formatOnPaste;
                    prefs.formatOnType = $scope.userPrefs.formatOnType;
                    prefs.fontSize = $scope.userPrefs.fontSize;
                    prefs.fontFamily = $scope.userPrefs.fontFamily;
                    prefs.languageHelpers = $scope.userPrefs.languageHelpers;
                    prefs.stickyScroll = $scope.userPrefs.stickyScroll;
                    prefs.htmlValidation = $scope.userPrefs.htmlValidation;
                    prefs.htmlAutoCloseTags = $scope.userPrefs.htmlAutoCloseTags;
                    prefs.autoSurround = $scope.userPrefs.autoSurround;
                    prefs.autoClosingBrackets = $scope.userPrefs.autoClosingBrackets;
                    prefs.autoClosingQuotes = $scope.userPrefs.autoClosingQuotes;
                    prefs.linkedEditing = $scope.userPrefs.linkedEditing;
                    prefs.insertSpaceBeforeFuncParen = $scope.userPrefs.insertSpaceBeforeFuncParen;
                    prefs.tabSize = $scope.userPrefs.tabSize;
                    prefs.remBase = $scope.userPrefs.remBase;
                    prefs.autosaveInterval = $scope.userPrefs.autosaveInterval;
                    prefs.draftRetentionDays = $scope.userPrefs.draftRetentionDays;
                    prefs.ctrlSSaveActiveOnly = $scope.userPrefs.ctrlSSaveActiveOnly;
                    prefs.flashOnEditorOpen = $scope.userPrefs.flashOnEditorOpen;
                    prefs.showOpenInVsCode = $scope.userPrefs.showOpenInVsCode;
                    prefs.showRecentlyOpenedWidgets = $scope.userPrefs.showRecentlyOpenedWidgets !== false;
                    prefs.showOpenHistory = $scope.userPrefs.showOpenHistory;
                    prefs.showAssistantButton = $scope.userPrefs.showAssistantButton;
                    prefs.contextMenuMode = $scope.userPrefs.contextMenuMode || 'enhanced';
                    prefs.htmlClassPortalSysId = $scope.userPrefs.htmlClassPortalSysId;
                    prefs.htmlClassPortalUrlSuffix = $scope.userPrefs.htmlClassPortalUrlSuffix;
                    prefs.htmlClassThemeSysId = $scope.userPrefs.htmlClassThemeSysId;
                    prefs.htmlClassIncludeStandardCss = !!$scope.userPrefs.htmlClassIncludeStandardCss;
                    prefs.recentWidgets = $scope.userPrefs.recentWidgets;
                    prefs.recentRecords = $scope.userPrefs.recentRecords;
                    prefs.order = storedOrder.length
                        ? storedOrder.concat(
                              $scope.coreEditorDefs
                                  .map(function (d) {
                                      return d.key;
                                  })
                                  .filter(function (k) {
                                      return storedOrder.indexOf(k) === -1;
                                  })
                          )
                        : $scope.coreEditorDefs.map(function (d) {
                              return d.key;
                          });
                    if ($scope.isWidgetRecord === false) {
                        $scope.coreEditorDefs.forEach(function (def) {
                            delete prefs[def.key];
                        });
                        delete prefs.order;
                        Object.keys($scope.widgetEditorLayout || {}).forEach(function (key) {
                            prefs[key] = angular.copy($scope.widgetEditorLayout[key]);
                        });
                    }
                    return prefs;
                }

                function saveUserPrefs(overrides) {
                    var prefs = _buildUserPrefsBlob();
                    if (overrides) {
                        Object.keys(overrides).forEach(function (k) {
                            prefs[k] = overrides[k];
                        });
                    }
                    return ajax('saveUserPrefs', {
                        value: JSON.stringify(prefs),
                    });
                }

                // Angular Templates (sp_ng_template)
                function focusPaneEditor(pane) {
                    if (!pane || !pane.key) {
                        return;
                    }
                    $timeout(function () {
                        var editor = monacoEditors[pane.key];
                        if (editor && editor.focus) {
                            editor.focus();
                            return;
                        }
                        // Fallback while Monaco is still mounting.
                        var container = document.getElementById('editor-' + pane.key);
                        if (!container || !container.querySelector) {
                            return;
                        }
                        var input = container.querySelector('textarea, [contenteditable="true"]');
                        if (input && input.focus) {
                            input.focus();
                        }
                    }, 0);
                }

                function flashOpenExtraPane(existingPane) {
                    if (!existingPane || !existingPane.key || !$scope.userPrefs.flashOnEditorOpen) {
                        return;
                    }
                    var paneEl = document.getElementById('pane-' + existingPane.key);
                    if (!paneEl || !paneEl.classList) {
                        return;
                    }
                    paneEl.classList.remove('we-pane-flash');
                    // Force reflow so quick re-selections can replay the animation.
                    paneEl.offsetWidth;
                    paneEl.classList.add('we-pane-flash');
                    focusPaneEditor(existingPane);
                    $timeout(function () {
                        if (paneEl && paneEl.classList) {
                            paneEl.classList.remove('we-pane-flash');
                        }
                    }, 380);
                }

                $scope.openTemplate = function (t) {
                    $scope.openDropdown = null;
                    var existingPane = extraPanes.find(function (p) {
                        return p.sys_id === t.sys_id;
                    });
                    if (existingPane) {
                        flashOpenExtraPane(existingPane);
                        return;
                    }
                    var pane = makeTemplatePaneObj(t);
                    pane.lastServerContent = t.template || '';
                    openExtraPane(pane);
                };

                $scope.addTemplate = function () {
                    $scope.openDropdown = null;
                    var defaultId = $scope.widget && $scope.widget.id ? $scope.widget.id + '-' : '';
                    var pane = makeTemplatePaneObj({
                        sys_id: null,
                        id: defaultId,
                        template: '',
                    });
                    openExtraPane(pane);
                    if (defaultId) {
                        $timeout(function () {
                            pane.idChecking = true;
                            checkPaneId(pane);
                        }, 80);
                    }
                };

                function makeTemplatePaneObj(t) {
                    var key = 'tpl-' + (t.sys_id || 'new-' + Date.now());
                    return {
                        key: key,
                        label: 'Angular template',
                        field: null,
                        language: 'html',
                        type: 'pane',
                        hasIdInput: true,
                        closeable: true,
                        recordType: 'template',
                        sys_id: t.sys_id || null,
                        recordId: t.id || '',
                        content: t.template || '',
                        editorUnlocked: !!t.sys_id,
                        canDelete: !!t.canDelete,
                        readOnly: !!t.readOnly,
                        readOnlyReason: t.readOnlyReason || '',
                        scopeName: t.scopeName || '',
                        idError: null,
                        idChecking: false,
                        dirty: false,
                        idDirty: false,
                        savedRecently: false,
                        externalChange: null,
                        viewingUsers: [],
                        width: null,
                        volatility_level: t.volatility_level || '',
                        volatility_level_display: t.volatility_level_display || '',
                    };
                }

                // Angular Providers (sp_angular_provider)
                function openExtraPane(pane) {
                    pane._draftOriginalId = pane.recordId || '';
                    pane._draftOriginalType = pane.providerType || '';
                    extraPanes.push(pane);
                    buildVisibleItems();
                    $timeout(function () {
                        initEditorForPane(pane);
                        focusPaneEditor(pane);
                        flashOpenExtraPane(pane);
                        // Extra panes are created after initial editor bootstrap,
                        // so they need explicit post-create relayout/tokenization.
                        $timeout(layoutAllEditors, 20);
                        $timeout(layoutAllEditors, 500);
                        $timeout(layoutAllEditors, 900);
                    }, 50);
                    if (pane.sys_id) {
                        startPanePresence(pane);
                        startPaneRecordWatcher(pane);
                    }
                }

                $scope.openProvider = function (p) {
                    $scope.openDropdown = null;
                    var existingPane = extraPanes.find(function (e) {
                        return e.sys_id === p.sys_id;
                    });
                    if (existingPane) {
                        flashOpenExtraPane(existingPane);
                        return;
                    }
                    var pane = makeProviderPaneObj(p);
                    pane.lastServerContent = p.script || '';
                    openExtraPane(pane);
                };

                $scope.addNewProvider = function () {
                    $scope.openDropdown = null;
                    var pane = makeProviderPaneObj({
                        sys_id: null,
                        name: '',
                        type: '',
                        script: '',
                    });
                    openExtraPane(pane);
                };

                var _linkProviderDebounce;
                $scope.openLinkProviderModal = function () {
                    $scope.openDropdown = null;
                    $scope.linkProvider.search = '';
                    $scope.linkProviderActiveSearch = '';
                    $scope.linkProviderResults = [];
                    $scope.linkProviderSearching = true;
                    $scope.showLinkProviderModal = true;
                    loadLinkProviderResults('');
                };

                $scope.onLinkProviderSearch = function () {
                    $scope.linkProviderSearching = true;
                    $timeout.cancel(_linkProviderDebounce);
                    _linkProviderDebounce = $timeout(function () {
                        loadLinkProviderResults($scope.linkProvider.search);
                    }, 300);
                };

                $scope.formatProviderType = function (type) {
                    if (!type) {
                        return '';
                    }
                    return type.charAt(0).toUpperCase() + type.slice(1);
                };

                // Guards against a stale, slower response overwriting a newer one.
                var _linkProviderRequestId = 0;
                function loadLinkProviderResults(search) {
                    $scope.linkProviderSearching = true;
                    $scope.linkProviderHasMore = false;
                    var requestId = ++_linkProviderRequestId;
                    ajax('getAllProviders', {
                        sys_id: SYS_ID,
                        search: search,
                        offset: 0,
                    }).then(function (d) {
                        if (requestId !== _linkProviderRequestId) {
                            return;
                        }
                        $scope.linkProviderSearching = false;
                        $scope.linkProviderActiveSearch = search;
                        if (d.success) {
                            $scope.linkProviderResults = d.providers;
                            $scope.linkProviderTotal = d.total || 0;
                            $scope.linkProviderHasMore = $scope.linkProviderResults.length < $scope.linkProviderTotal;
                        }
                    });
                }

                $scope.loadMoreLinkProviders = function () {
                    if ($scope.linkProviderSearching || $scope.linkProviderLoadingMore || !$scope.linkProviderHasMore) {
                        return;
                    }
                    $scope.linkProviderLoadingMore = true;
                    var requestId = _linkProviderRequestId;
                    ajax('getAllProviders', {
                        sys_id: SYS_ID,
                        search: $scope.linkProviderActiveSearch,
                        offset: $scope.linkProviderResults.length,
                    }).then(
                        function (d) {
                            $scope.linkProviderLoadingMore = false;
                            if (requestId !== _linkProviderRequestId) {
                                return;
                            }
                            if (d.success) {
                                $scope.linkProviderResults = $scope.linkProviderResults.concat(d.providers);
                                $scope.linkProviderTotal = d.total || 0;
                                $scope.linkProviderHasMore =
                                    $scope.linkProviderResults.length < $scope.linkProviderTotal;
                            }
                        },
                        function () {
                            $scope.linkProviderLoadingMore = false;
                        }
                    );
                };

                $scope.selectLinkProvider = function (p) {
                    _closeModal(function () {
                        $scope.showLinkProviderModal = false;
                    });
                    ajax('linkProvider', {
                        sys_id: SYS_ID,
                        provider_sys_id: p.sys_id,
                    }).then(function (d) {
                        if (!d.success) {
                            $window.alert(d.error || 'Link failed');
                            return;
                        }
                        ajax('getProviders', { sys_id: SYS_ID }).then(function (pd) {
                            if (pd.success) {
                                $scope.providers = pd.providers;
                                _syncProviderCompletions();
                            }
                        });
                        $scope.openProvider(p);
                    });
                };

                $scope.cancelLinkProviderModal = function () {
                    _closeModal(function () {
                        $scope.showLinkProviderModal = false;
                    });
                };

                function makeProviderPaneObj(p) {
                    var key = 'prv-' + (p.sys_id || 'new-' + Date.now());
                    return {
                        key: key,
                        label: 'Angular provider',
                        field: null,
                        language: 'javascript',
                        type: 'pane',
                        hasIdInput: true,
                        closeable: true,
                        recordType: 'provider',
                        sys_id: p.sys_id || null,
                        recordId: p.name || '',
                        providerType: p.type || '',
                        content: p.script || '',
                        editorUnlocked: !!p.sys_id,
                        canDelete: !!p.canDelete,
                        linkedToOtherWidgets: !!p.linkedToOtherWidgets,
                        readOnly: !!p.readOnly,
                        readOnlyReason: p.readOnlyReason || '',
                        scopeName: p.scopeName || '',
                        idError: null,
                        idChecking: false,
                        dirty: false,
                        idDirty: false,
                        savedRecently: false,
                        externalChange: null,
                        viewingUsers: [],
                        width: null,
                        volatility_level: p.volatility_level || '',
                        volatility_level_display: p.volatility_level_display || '',
                    };
                }

                // Script Include panes
                function makeScriptIncludePaneObj(si) {
                    var key = 'si-' + si.sys_id;
                    return {
                        key: key,
                        label: si.name,
                        field: null,
                        language: 'javascript',
                        type: 'pane',
                        hasIdInput: false,
                        closeable: true,
                        recordType: 'script_include',
                        sys_id: si.sys_id,
                        recordId: si.name,
                        content: si.script || '',
                        readOnly: !!si.readOnly,
                        readOnlyReason: si.readOnlyReason || '',
                        scopeName: si.scopeName || '',
                        editorUnlocked: true,
                        canDelete: false,
                        idError: null,
                        idChecking: false,
                        dirty: false,
                        idDirty: false,
                        savedRecently: false,
                        externalChange: null,
                        viewingUsers: [],
                        width: null,
                        volatility_level: si.volatility_level || '',
                        volatility_level_display: si.volatility_level_display || '',
                    };
                }

                $scope.openScriptInclude = function (si) {
                    // If already open, scroll it into view
                    var existing = extraPanes.filter(function (p) {
                        return p.sys_id === si.sys_id;
                    })[0];
                    if (existing) {
                        flashOpenExtraPane(existing);
                        return;
                    }
                    var pane = makeScriptIncludePaneObj(si);
                    pane.lastServerContent = si.script || '';
                    openExtraPane(pane);
                };

                function openScriptIncludeByName(name) {
                    var sysId = window.SNMonacoPlus && window.SNMonacoPlus.getSiSysId(name);
                    // If already open, focus it
                    if (sysId) {
                        var existing = extraPanes.filter(function (p) {
                            return p.sys_id === sysId;
                        })[0];
                        if (existing) {
                            $timeout(function () {
                                var el = document.querySelector('[data-key="' + existing.key + '"]');
                                if (el) {
                                    el.scrollIntoView({
                                        behavior: 'smooth',
                                        inline: 'nearest',
                                    });
                                }
                            }, 50);
                            return;
                        }
                    }
                    var params = sysId ? { sys_id: sysId } : { name: name };
                    ajax('getScriptInclude', params).then(function (d) {
                        if (!d.success) {
                            return;
                        }
                        $scope.openScriptInclude(d.si);
                    });
                }

                $scope.pendingDeletePane = null;

                $scope.deleteExtraPane = function (item) {
                    $scope.pendingDeletePane = item;
                };

                $scope.cancelDeletePane = function () {
                    $scope.pendingDeletePane = null;
                };

                $scope.confirmDeletePane = function () {
                    var item = $scope.pendingDeletePane;
                    if (!item || item.deleting) {
                        return;
                    }
                    item.deleting = true;
                    var params = { sys_id: item.sys_id };
                    if (item.recordType === 'provider') {
                        params.widget_sys_id = SYS_ID;
                    }
                    ajax(item.recordType === 'template' ? 'deleteTemplate' : 'deleteProvider', params).then(
                        function (d) {
                            item.deleting = false;
                            $scope.pendingDeletePane = null;
                            if (!d.success) {
                                $window.alert(d.error || 'Delete failed');
                                return;
                            }
                            var idx = extraPanes.indexOf(item);
                            if (idx !== -1) {
                                extraPanes.splice(idx, 1);
                            }
                            if (item.recordType === 'template') {
                                $scope.templates = $scope.templates.filter(function (t) {
                                    return t.sys_id !== item.sys_id;
                                });
                            } else {
                                $scope.providers = $scope.providers.filter(function (p) {
                                    return p.sys_id !== item.sys_id;
                                });
                                _syncProviderCompletions();
                            }
                            buildVisibleItems();
                        }
                    );
                };

                // Dependencies (m2m_sp_widget_dependency)
                var _linkDepDebounce = null;

                $scope.openDependency = function (dep) {
                    $scope.openDropdown = null;
                    $window.open(
                        '/nav_to.do?uri=' + encodeURIComponent('sp_dependency.do?sys_id=' + dep.sys_id),
                        '_blank'
                    );
                };

                $scope.addNewDependency = function () {
                    $scope.openDropdown = null;
                    $window.open('/nav_to.do?uri=sp_dependency.do', '_blank');
                };

                $scope.openLinkDependencyModal = function () {
                    $scope.openDropdown = null;
                    $scope.linkDependency.search = '';
                    $scope.linkDependencyActiveSearch = '';
                    $scope.linkDependencyResults = [];
                    $scope.linkDependencySearching = true;
                    $scope.showLinkDependencyModal = true;
                    _loadLinkDependencyResults('');
                };

                $scope.onLinkDependencySearch = function () {
                    $scope.linkDependencySearching = true;
                    $timeout.cancel(_linkDepDebounce);
                    _linkDepDebounce = $timeout(function () {
                        _loadLinkDependencyResults($scope.linkDependency.search);
                    }, 300);
                };

                // Guards against a stale, slower response overwriting a newer one.
                var _linkDependencyRequestId = 0;
                function _loadLinkDependencyResults(search) {
                    $scope.linkDependencySearching = true;
                    $scope.linkDependencyHasMore = false;
                    var requestId = ++_linkDependencyRequestId;
                    ajax('getAllDependencies', {
                        sys_id: SYS_ID,
                        search: search,
                        offset: 0,
                    }).then(function (d) {
                        if (requestId !== _linkDependencyRequestId) {
                            return;
                        }
                        $scope.linkDependencySearching = false;
                        $scope.linkDependencyActiveSearch = search;
                        if (d.success) {
                            $scope.linkDependencyResults = d.dependencies;
                            $scope.linkDependencyTotal = d.total || 0;
                            $scope.linkDependencyHasMore =
                                $scope.linkDependencyResults.length < $scope.linkDependencyTotal;
                        }
                    });
                }

                $scope.loadMoreLinkDependencies = function () {
                    if (
                        $scope.linkDependencySearching ||
                        $scope.linkDependencyLoadingMore ||
                        !$scope.linkDependencyHasMore
                    ) {
                        return;
                    }
                    $scope.linkDependencyLoadingMore = true;
                    var requestId = _linkDependencyRequestId;
                    ajax('getAllDependencies', {
                        sys_id: SYS_ID,
                        search: $scope.linkDependencyActiveSearch,
                        offset: $scope.linkDependencyResults.length,
                    }).then(
                        function (d) {
                            $scope.linkDependencyLoadingMore = false;
                            if (requestId !== _linkDependencyRequestId) {
                                return;
                            }
                            if (d.success) {
                                $scope.linkDependencyResults = $scope.linkDependencyResults.concat(d.dependencies);
                                $scope.linkDependencyTotal = d.total || 0;
                                $scope.linkDependencyHasMore =
                                    $scope.linkDependencyResults.length < $scope.linkDependencyTotal;
                            }
                        },
                        function () {
                            $scope.linkDependencyLoadingMore = false;
                        }
                    );
                };

                $scope.selectLinkDependency = function (dep) {
                    _closeModal(function () {
                        $scope.showLinkDependencyModal = false;
                    });
                    ajax('linkDependency', {
                        sys_id: SYS_ID,
                        dep_sys_id: dep.sys_id,
                    }).then(function (d) {
                        if (!d.success) {
                            $window.alert(d.error || 'Link failed');
                            return;
                        }
                        ajax('getDependencies', { sys_id: SYS_ID }).then(function (dd) {
                            if (dd.success) {
                                $scope.dependencies = dd.dependencies;
                                loadHtmlMonarchDts();
                            }
                        });
                    });
                };

                $scope.cancelLinkDependencyModal = function () {
                    _closeModal(function () {
                        $scope.showLinkDependencyModal = false;
                    });
                };

                $scope.unlinkDependencyFromDropdown = function (dep) {
                    $scope.openDropdown = null;
                    $scope.pendingUnlinkDependency = {
                        sys_id: dep.sys_id,
                        name: dep.name,
                    };
                };

                $scope.cancelUnlinkDependency = function () {
                    $scope.pendingUnlinkDependency = null;
                };

                $scope.confirmUnlinkDependency = function () {
                    var pending = $scope.pendingUnlinkDependency;
                    if (!pending) {
                        return;
                    }
                    $scope.pendingUnlinkDependency = null;
                    ajax('unlinkDependency', {
                        sys_id: SYS_ID,
                        dep_sys_id: pending.sys_id,
                    }).then(function (d) {
                        if (!d.success) {
                            $window.alert(d.error || 'Unlink failed');
                            return;
                        }
                        $scope.dependencies = $scope.dependencies.filter(function (dep) {
                            return dep.sys_id !== pending.sys_id;
                        });
                        loadHtmlMonarchDts();
                    });
                };

                // Related Lists modal

                function _markFirstLink(columns) {
                    var set = false;
                    (columns || []).forEach(function (col) {
                        col.firstLink = !set && !col.refTable;
                        if (col.firstLink) {
                            set = true;
                        }
                    });
                }

                $scope.openRelatedModal = function () {
                    if ($scope.isNewWidget) {
                        return;
                    }
                    $scope.relatedModal.open = true;
                    $scope.relatedModal.tabs = [];
                    $scope.relatedModal.activeTab = null;
                    $scope.relatedModal.loading = true;
                    ajax('getRelatedDefinitions', { sys_id: SYS_ID }).then(function (d) {
                        $scope.relatedModal.loading = false;
                        if (!d.success) {
                            return;
                        }
                        d.tabs.forEach(function (tab) {
                            _markFirstLink(tab.columns);
                        });
                        $scope.relatedModal.tabs = d.tabs;
                        if (d.tabs.length > 0) {
                            $scope.selectRelatedTab(d.tabs[0]);
                        }
                    });
                };

                $scope.assistantModal = {
                    open: false,
                    url: null,
                    rawUrl: null,
                };

                $scope.openAssistantModal = function () {
                    if ($scope.isNewWidget) {
                        return;
                    }
                    var rawUrl =
                        'widget_editor_assistant.do?record_table=' +
                        encodeURIComponent($scope.recordTable || 'sp_widget') +
                        '&record_sys_id=' +
                        SYS_ID;
                    var $sce = $injector.get('$sce');
                    $scope.assistantModal.rawUrl = rawUrl;
                    /* Clear the iframe first so a stale previous session never flashes before the fresh navigation lands. */
                    $scope.assistantModal.url = null;
                    $scope.assistantModal.open = true;
                    $scope.openDropdown = null;
                    $timeout(function () {
                        $scope.assistantModal.url = $sce.trustAsResourceUrl(rawUrl);
                    });
                };

                $scope.closeAssistantModal = function () {
                    _closeModal(function () {
                        $scope.assistantModal.open = false;
                        $scope.assistantModal.url = null;
                    });
                };

                $scope.openAssistantInNewTab = function () {
                    $window.open($scope.assistantModal.rawUrl, '_blank');
                    $scope.closeAssistantModal();
                };

                $scope.closeRelatedModal = function () {
                    _closeModal(function () {
                        $scope.relatedModal.open = false;
                    });
                };

                $scope.selectRelatedTab = function (tab) {
                    $scope.relatedModal.activeTab = tab;
                    if (!tab.rows) {
                        $scope.loadRelatedTabData(tab, 0);
                    }
                };

                $scope.loadRelatedTabData = function (tab, page) {
                    tab.loading = true;
                    tab.rows = null;
                    tab.error = null;
                    ajax('getRelatedData', {
                        sys_id: SYS_ID,
                        related_list: tab.related_list,
                        page: page,
                    }).then(function (d) {
                        tab.loading = false;
                        if (!d.success) {
                            tab.error = d.error || 'Failed to load';
                            return;
                        }
                        tab.rows = d.rows;
                        tab.columns = d.columns;
                        _markFirstLink(tab.columns);
                        tab.page = d.page;
                        var _ps = 20;
                        tab.pageStart = d.rows.length > 0 ? d.page * _ps + 1 : 0;
                        tab.pageEnd = d.page * _ps + d.rows.length;
                        tab.lastPage = Math.max(0, Math.ceil(tab.count / _ps) - 1);
                        tab.pageStartInput = tab.pageStart;
                    });
                };

                $scope.navigateToStartRow = function (tab) {
                    var ps = 20;
                    var val = parseInt(tab.pageStartInput, 10);
                    if (isNaN(val) || val < 1) val = 1;
                    if (val > tab.count) val = Math.max(1, tab.count);
                    var page = Math.floor((val - 1) / ps);
                    tab.pageStartInput = page * ps + 1;
                    if (page !== tab.page) {
                        $scope.loadRelatedTabData(tab, page);
                    }
                };

                $scope.relatedRecordUrl = function (table, sysId) {
                    return '/nav_to.do?uri=' + encodeURIComponent(table + '.do?sys_id=' + sysId);
                };

                // Unlink Provider
                $scope.pendingUnlinkProvider = null;

                $scope.unlinkProviderFromDropdown = function (p) {
                    $scope.openDropdown = null;
                    $scope.pendingUnlinkProvider = {
                        sys_id: p.sys_id,
                        name: p.name,
                    };
                };

                $scope.unlinkExtraPane = function (item) {
                    $scope.pendingUnlinkProvider = {
                        sys_id: item.sys_id,
                        name: item.recordId,
                    };
                };

                $scope.cancelUnlinkProvider = function () {
                    $scope.pendingUnlinkProvider = null;
                };

                $scope.confirmUnlinkProvider = function () {
                    var pending = $scope.pendingUnlinkProvider;
                    if (!pending || pending.unlinking) {
                        return;
                    }
                    pending.unlinking = true;
                    ajax('unlinkProvider', {
                        sys_id: SYS_ID,
                        provider_sys_id: pending.sys_id,
                    }).then(function (d) {
                        pending.unlinking = false;
                        $scope.pendingUnlinkProvider = null;
                        if (!d.success) {
                            $window.alert(d.error || 'Unlink failed');
                            return;
                        }
                        // Remove from providers list
                        $scope.providers = $scope.providers.filter(function (p) {
                            return p.sys_id !== pending.sys_id;
                        });
                        _syncProviderCompletions();
                        // Close the open pane for this provider, if any
                        var idx = extraPanes.findIndex(function (e) {
                            return e.sys_id === pending.sys_id;
                        });
                        if (idx !== -1) {
                            extraPanes.splice(idx, 1);
                        }
                        buildVisibleItems();
                    });
                };

                function saveExtraPane(pane, onSuccess) {
                    pane.saveError = null;
                    if (pane.recordType === 'script_include') {
                        if (pane.readOnly) {
                            return;
                        }
                        var editor = monacoEditors[pane.key];
                        var value = editor ? editor.getValue() : pane.content || '';
                        pane._pendingSaveContent = value;
                        ajax('saveScriptInclude', {
                            sys_id: pane.sys_id,
                            data: JSON.stringify({ script: value }),
                        }).then(function (res) {
                            if (!res.success) {
                                delete pane._pendingSaveContent;
                                pane.saveError = res.error || 'Save failed';
                                return;
                            }
                            pane.lastServerContent = value;
                            delete pane._pendingSaveContent;
                            pane.dirty = !_editorValuesEqual(editor ? editor.getValue() : pane.content || '', value);
                            _writeLocalDraft(true);
                            if (!hasUnsavedChanges()) {
                                pane.savedAt = null;
                                $scope.lastSaveTime = new Date();
                            } else {
                                pane.savedAt = new Date();
                            }
                            if (onSuccess && !pane.dirty && !pane.idDirty) {
                                onSuccess();
                            }
                        });
                        return;
                    }
                    if (!pane.recordId || !pane.recordId.trim()) {
                        pane.idError = 'An ID is required';
                        return;
                    }
                    if (pane.idError || pane.idChecking) {
                        return;
                    }
                    var editor = monacoEditors[pane.key];
                    var value = editor ? editor.getValue() : pane.content || '';
                    var isTemplate = pane.recordType === 'template';
                    var dataObj = {
                        sys_id: pane.sys_id,
                    };
                    if (isTemplate) {
                        dataObj.id = pane.recordId;
                    } else {
                        dataObj.name = pane.recordId;
                        dataObj.type = pane.providerType || '';
                    }
                    dataObj[isTemplate ? 'template' : 'script'] = value;
                    pane._pendingSaveContent = value;

                    ajax(isTemplate ? 'saveTemplate' : 'saveProvider', {
                        sys_id: SYS_ID,
                        data: JSON.stringify(dataObj),
                    }).then(function (res) {
                        if (!res.success) {
                            delete pane._pendingSaveContent;
                            pane.saveError = res.error || 'Save failed';
                            return;
                        }
                        pane.sys_id = res.sys_id;
                        startPanePresence(pane); // subscribe now that the record exists
                        startPaneRecordWatcher(pane); // watch for external changes
                        pane.lastServerContent = value;
                        delete pane._pendingSaveContent;
                        pane._draftOriginalId = isTemplate ? dataObj.id : dataObj.name;
                        pane._draftOriginalType = dataObj.type || '';
                        pane.dirty = !_editorValuesEqual(editor ? editor.getValue() : pane.content || '', value);
                        pane.idDirty =
                            pane.recordId !== pane._draftOriginalId ||
                            (!isTemplate && pane.providerType !== pane._draftOriginalType);
                        _writeLocalDraft(true);
                        if (!hasUnsavedChanges()) {
                            pane.savedAt = null;
                            $scope.lastSaveTime = new Date();
                        } else {
                            pane.savedAt = new Date();
                        }
                        var action = isTemplate ? 'getTemplates' : 'getProviders';
                        ajax(action, { sys_id: SYS_ID }).then(function (d) {
                            if (d.success) {
                                if (isTemplate) {
                                    $scope.templates = d.templates;
                                } else {
                                    $scope.providers = d.providers;
                                    _syncProviderCompletions();
                                }
                            }
                        });
                        if (onSuccess && !pane.dirty && !pane.idDirty) {
                            onSuccess();
                        }
                    });
                }

                // Close extra pane
                $scope.pendingClosePane = null;

                $scope.closePane = function (pane) {
                    stopPanePresence(pane);
                    stopPaneRecordWatcher(pane);
                    var idx = extraPanes.indexOf(pane);
                    if (idx !== -1) {
                        extraPanes.splice(idx, 1);
                    }
                    disposeEditor(pane.key);
                    _clearPaneWidths();
                    buildVisibleItems();
                    _writeLocalDraft(true);
                };

                $scope.cancelClosePane = function () {
                    $scope.pendingClosePane = null;
                };

                $scope.discardAndClosePane = function () {
                    var pane = $scope.pendingClosePane;
                    $scope.pendingClosePane = null;
                    $scope.closePane(pane);
                };

                $scope.saveAndClosePane = function () {
                    var pane = $scope.pendingClosePane;
                    $scope.pendingClosePane = null;
                    saveExtraPane(pane, function () {
                        $scope.closePane(pane);
                    });
                };

                // Unified close handler for all pane types
                $scope.closePaneItem = function (item) {
                    if (item.closeable) {
                        if (item.dirty || item.idDirty) {
                            $scope.pendingClosePane = item;
                        } else {
                            $scope.closePane(item);
                        }
                    } else {
                        var def = $scope.coreEditorDefs.filter(function (d) {
                            return d.key === item.key;
                        })[0];
                        if (def) {
                            def.visible = false;
                            applyVisibility();
                        }
                    }
                };

                // Versions diff tab
                $scope.formatVersionDate = function (snDate, includeSeconds) {
                    if (!snDate) {
                        return '';
                    }
                    try {
                        var options = {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                        };

                        // Conditionally add seconds to the options object
                        if (includeSeconds) {
                            options.second = '2-digit';
                        }

                        // SN returns UTC dates without a timezone suffix — append T and Z
                        return new Date(snDate.replace(' ', 'T') + 'Z').toLocaleString(undefined, options);
                    } catch (e) {
                        return snDate;
                    }
                };

                $scope.revertVersion = function (version, event) {
                    if (event) event.stopPropagation();
                    var widgetSysId = $scope.widget && $scope.widget.sys_id;
                    if (
                        !widgetSysId ||
                        !version ||
                        !version.sys_id ||
                        !$scope.canWriteWidget ||
                        $scope.widgetSysPolicy ||
                        $scope.isNewWidget ||
                        version.state === 'current' ||
                        !$scope.versions.length ||
                        version.sys_id === $scope.versions[0].sys_id
                    )
                        return;
                    $scope.openDropdown = null;
                    $scope.openCompactSubmenu = null;
                    try {
                        localStorage.setItem('_weRevertPending_' + widgetSysId, Date.now().toString());
                    } catch (e) {}
                    var dialog = new GlideModal('revert_update_version_confirm', true, 300);
                    dialog.setTitle('Revert');
                    dialog.setPreference('sysparm_sys_id', version.sys_id);
                    dialog.setPreference('focusTrap', true);
                    dialog.render();
                };

                $scope.openVersionDiff = function (version) {
                    $scope.openDropdown = null;
                    var widgetSysId = $scope.widget && $scope.widget.sys_id;
                    if (!widgetSysId || !version.sys_id) {
                        return;
                    }

                    var params = {
                        table: $scope.recordTable || 'sp_widget',
                        record_id: widgetSysId,
                        version_1: version.sys_id,
                    };
                    var rawUrl = _diffNavUrl(params);
                    var $sce = $injector.get('$sce');
                    var label =
                        $scope.formatVersionDate(version.sys_created_on) +
                        (version.sys_created_by ? ' \u2014 ' + version.sys_created_by : '');
                    $scope.versionDiffModal.rawUrl = rawUrl;
                    $scope.versionDiffModal.url = $sce.trustAsResourceUrl(
                        _diffIframeUrl(angular.extend({}, params, { da_iframe: 'true' }))
                    );
                    $scope.versionDiffModal.label = label;
                    $scope.versionDiffModal.isUnsaved = false;
                    $scope.versionDiffModal.localDraft = null;
                    $scope.versionDiffModal.open = true;
                };

                $scope.closeVersionDiffModal = function () {
                    var iframe = document.querySelector && document.querySelector('.we-diff-iframe');
                    var compare = iframe && iframe.contentWindow;
                    if (
                        compare &&
                        compare.WE_HAS_UNSAVED_MERGE &&
                        compare.WE_HAS_UNSAVED_MERGE() &&
                        !window.confirm('Discard the unsaved merged fields in Compare+?')
                    )
                        return;
                    _closeModal(function () {
                        $scope.versionDiffModal.open = false;
                        $scope.versionDiffModal.url = null;
                        $scope.versionDiffModal.expandedField = null;
                        $scope.versionDiffModal.isUnsaved = false;
                        $scope.versionDiffModal.localDraft = null;
                    });
                };

                $scope.openVersionDiffInNewTab = function () {
                    var iframe = document.querySelector('.we-diff-iframe');
                    var url = (iframe && iframe.contentWindow.WE_COMPARE_URL) || $scope.versionDiffModal.rawUrl;
                    $window.open(url, '_blank');
                    $scope.closeVersionDiffModal();
                };

                $scope.collapseDiffEditor = function () {
                    var iframe = document.querySelector('.we-diff-iframe');
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({ type: 'we-diff-collapse' }, '*');
                    }
                };

                function _acceptCompareSave(data) {
                    Object.keys(data.values).forEach(function (field) {
                        var value = data.values[field];
                        $scope.widget[field] = value;
                        var def = $scope.coreEditorDefs.find(function (item) {
                            return item.field === field;
                        });
                        if (def) {
                            originalValues[field] = lastServerValues[field] = value;
                            var editor = monacoEditors[def.key];
                            if (editor && editor.getValue() !== value) editor.setValue(value);
                            var pane = paneMap[def.key];
                            if (pane) {
                                pane.dirty = false;
                                pane.savedAt = null;
                                pane.saveError = null;
                                pane.externalChange = null;
                            }
                            _selfSavingFields[field] = value;
                            $timeout(function () {
                                if (_selfSavingFields[field] === value) delete _selfSavingFields[field];
                            }, 5000);
                        } else if (Object.prototype.hasOwnProperty.call(originalHeader, field)) {
                            originalHeader[field] = field === 'controller_as' ? value || 'c' : value;
                            $scope.headerDirty[field] = false;
                        }
                        if (field === 'option_schema' || field === 'demo_data') {
                            if (_draftJson[field]) _draftJson[field] = { base: value, value: value };
                            var jsonEditor = field === 'option_schema' ? _optionSchemaEditor : _demoDataEditor;
                            if (jsonEditor && jsonEditor.getValue() !== value) jsonEditor.setValue(value);
                            $scope.widget[field + '_has_value'] = _hasProperJsonObjectValue(value);
                        }
                    });
                    if (
                        $scope.isWidgetRecord === false &&
                        $scope.recordPrimaryField === 'id' &&
                        Object.prototype.hasOwnProperty.call(data.values, 'id')
                    ) {
                        $scope.widget.name = originalHeader.name = data.values.id;
                        $scope.headerDirty.name = false;
                    }
                    $scope.widget.sys_updated_on = data.sys_updated_on;
                    $scope.widget.sys_updated_by = data.sys_updated_by;
                    _writeLocalDraft(true);
                    $scope.$applyAsync();
                    ajax('getVersions', { sys_id: $scope.widget.sys_id }).then(function (result) {
                        if (result.success) $scope.versions = result.versions;
                    });
                }

                // Listen for notifications from the diff iframe.
                window.addEventListener('message', function (e) {
                    if (e.data && e.data.type === 'we-diff-saved') {
                        var iframe = document.querySelector('.we-diff-iframe');
                        if (
                            e.origin !== window.location.origin ||
                            !iframe ||
                            e.source !== iframe.contentWindow ||
                            !$scope.versionDiffModal.open ||
                            $scope.isVersionView ||
                            e.data.table !== $scope.recordTable ||
                            e.data.recordId !== $scope.widget.sys_id ||
                            !e.data.values ||
                            typeof e.data.values !== 'object' ||
                            Array.isArray(e.data.values) ||
                            !Object.keys(e.data.values).every(function (field) {
                                return typeof e.data.values[field] === 'string';
                            })
                        )
                            return;
                        _acceptCompareSave(e.data);
                        return;
                    }
                    if (!e.data || e.data.type !== 'we-diff-expand') {
                        return;
                    }
                    $scope.$apply(function () {
                        $scope.versionDiffModal.expandedField = e.data.fieldLabel || null;
                    });
                });

                // No version_id in the URL — the diff page detects the unsaved opener snap and shows current vs unsaved.
                $scope.openUnsavedDiff = function () {
                    $scope.openDropdown = null;
                    var wSysId = $scope.widget && $scope.widget.sys_id;
                    if (!wSysId) {
                        return;
                    }

                    var snap = {
                        name: $scope.widget.name || '',
                        id: $scope.widget.id || '',
                        description: $scope.widget.description || '',
                        is_public: !!$scope.widget.is_public,
                        roles: $scope.rolesList.join(','),
                        template: '',
                        css: '',
                        client_script: '',
                        script: '',
                        link: '',
                    };
                    $scope.coreEditorDefs.forEach(function (def) {
                        snap[def.field] = monacoEditors[def.key]
                            ? monacoEditors[def.key].getValue()
                            : $scope.widget[def.field] || '';
                    });
                    snap._unsaved = true;
                    snap.sys_updated_on = $scope.widget.sys_updated_on || '';
                    snap.sys_updated_by = $scope.widget.sys_updated_by || '';

                    if ($scope.isWidgetRecord === false)
                        $scope.additionalWidgetFields.forEach(function (def) {
                            snap[def.name] = $scope.widget[def.name];
                        });
                    _openUnsavedSnapshotDiff($scope.recordTable || 'sp_widget', wSysId, snap, 'Unsaved changes');
                };

                function _openUnsavedSnapshotDiff(table, recordId, snap, label) {
                    var snapToken = Date.now() + '_' + Math.random().toString(36).slice(2);
                    try {
                        localStorage.setItem('_weDiffSnap_' + snapToken, JSON.stringify(snap));
                    } catch (e) {
                        $scope.localDraftError = 'The comparison could not be opened. Check browser storage settings.';
                        return false;
                    }

                    var params = {
                        table: table,
                        record_id: recordId,
                        da_token: snapToken,
                    };
                    var rawUrl = _diffNavUrl(params);
                    var $sce = $injector.get('$sce');
                    $scope.versionDiffModal.rawUrl = rawUrl;
                    $scope.versionDiffModal.url = $sce.trustAsResourceUrl(
                        _diffIframeUrl(angular.extend({}, params, { da_iframe: 'true' }))
                    );
                    $scope.versionDiffModal.label = label;
                    $scope.versionDiffModal.expandedField = null;
                    $scope.versionDiffModal.localDraft = null;
                    $scope.versionDiffModal.isUnsaved = true;
                    $scope.versionDiffModal.open = true;
                    return true;
                }

                // Opens the diff page for an external-change alert on a pane.
                // Shows the user's current (unsaved) editor state vs the server's updated saved state.
                $scope.openExternalChangeDiff = function (item) {
                    if (!item.externalChange) {
                        return;
                    }
                    $scope.openUnsavedDiff();
                };

                // Replaces editor contents with the externally-saved server value and clears the warning.
                $scope.applyExternalChange = function (item) {
                    if (!item.externalChange) {
                        return;
                    }
                    var serverVal = item.externalChange.serverVal || '';
                    var editor = monacoEditors[item.key];
                    if (editor) {
                        editor.setValue(serverVal);
                    }
                    if (item.field) {
                        originalValues[item.field] = serverVal;
                        lastServerValues[item.field] = serverVal;
                        $scope.widget[item.field] = serverVal;
                    } else {
                        item.lastServerContent = serverVal;
                    }
                    item.dirty = false;
                    item.externalChange = null;
                };

                // Roles
                function parseRoles(str) {
                    return (str || '')
                        .split(',')
                        .map(function (r) {
                            return r.trim();
                        })
                        .filter(Boolean);
                }

                function _normaliseExtraWidgetFieldValue(fieldDef, value) {
                    if (fieldDef && fieldDef.type === 'boolean') {
                        return !!value;
                    }
                    return value || '';
                }

                function _setAdditionalWidgetFields(defs) {
                    $scope.additionalWidgetFields = Array.isArray(defs)
                        ? defs.filter(function (def) {
                              return def && def.name;
                          })
                        : [];
                }

                function _applyAdditionalWidgetFieldDefaults() {
                    ($scope.additionalWidgetFields || []).forEach(function (fieldDef) {
                        if ($scope.widget[fieldDef.name] !== undefined) {
                            return;
                        }
                        $scope.widget[fieldDef.name] = fieldDef.type === 'boolean' ? false : '';
                    });
                }

                function _captureAdditionalHeaderValues(source) {
                    ($scope.additionalWidgetFields || []).forEach(function (fieldDef) {
                        originalHeader[fieldDef.name] = _normaliseExtraWidgetFieldValue(
                            fieldDef,
                            source[fieldDef.name]
                        );
                    });
                }

                $scope.onPublicChange = function () {
                    // Roles are cleared on Save if is_public is true — not immediately
                };

                // Alert Status Pills Hover & Keyboard Management
                var alertHoverTimer = null;
                var alertPopoverOpenedAt = 0;
                $scope.onAlertPillEnter = function (key) {
                    if (alertHoverTimer) {
                        $timeout.cancel(alertHoverTimer);
                    }
                    alertHoverTimer = $timeout(function () {
                        $scope.onAlertPillFocus(key);
                    }, 280);
                };
                $scope.onAlertPillLeave = function (key) {
                    if (alertHoverTimer) {
                        $timeout.cancel(alertHoverTimer);
                        alertHoverTimer = null;
                    }
                    alertHoverTimer = $timeout(function () {
                        if ($scope.openDropdown === key) {
                            $scope.openDropdown = null;
                        }
                    }, 180);
                };
                $scope.onAlertPopoverEnter = function () {
                    if (alertHoverTimer) {
                        $timeout.cancel(alertHoverTimer);
                        alertHoverTimer = null;
                    }
                };
                $scope.onAlertPopoverLeave = function (key) {
                    if (alertHoverTimer) {
                        $timeout.cancel(alertHoverTimer);
                    }
                    alertHoverTimer = $timeout(function () {
                        if ($scope.openDropdown === key) {
                            $scope.openDropdown = null;
                        }
                    }, 120);
                };
                $scope.onAlertPillFocus = function (key) {
                    if (alertHoverTimer) {
                        $timeout.cancel(alertHoverTimer);
                        alertHoverTimer = null;
                    }
                    if ($scope.openDropdown !== key) alertPopoverOpenedAt = Date.now();
                    $scope.openDropdown = key;
                };
                $scope.onAlertPillKeydown = function ($event, key) {
                    if ($event.keyCode === 27) {
                        $event.preventDefault();
                        $event.stopPropagation();
                        $scope.openDropdown = null;
                    } else if ($event.keyCode === 13 || $event.keyCode === 32) {
                        $event.preventDefault();
                        $event.stopPropagation();
                        $scope.toggleDropdown(key, true);
                    } else if ($event.keyCode === 9 && !$event.shiftKey) {
                        var currentBtn = $event.currentTarget;
                        var wrapper = currentBtn.closest ? currentBtn.closest('.we-alert-pill-wrapper') : null;
                        if (wrapper) {
                            var firstAction = wrapper.querySelector(
                                'input[type="radio"]:checked, .we-alert-popover-actions button, .we-alert-popover-actions a'
                            );
                            if (firstAction) {
                                $event.preventDefault();
                                $event.stopPropagation();
                                $scope.openDropdown = key;
                                $timeout(function () {
                                    firstAction.focus();
                                }, 0);
                            }
                        }
                    }
                };
                $scope.onAlertActionKeydown = function ($event, key, isLast) {
                    if ($event.keyCode === 27) {
                        $event.preventDefault();
                        $event.stopPropagation();
                        var wrapper = $event.currentTarget.closest
                            ? $event.currentTarget.closest('.we-alert-pill-wrapper')
                            : null;
                        if (wrapper) {
                            var pillBtn = wrapper.querySelector('.we-alert-pill');
                            if (pillBtn) {
                                pillBtn.focus();
                            }
                        }
                        // Close after Angular has handled the pill's queued focus event.
                        $scope.$evalAsync(function () {
                            $scope.openDropdown = null;
                        });
                    } else if ($event.keyCode === 9 && !$event.shiftKey && isLast) {
                        var currentWrapper = $event.currentTarget.closest
                            ? $event.currentTarget.closest('.we-alert-pill-wrapper')
                            : null;
                        $scope.openDropdown = null;
                        if (currentWrapper && currentWrapper.parentElement) {
                            var allWrappers = Array.prototype.slice.call(
                                currentWrapper.parentElement.querySelectorAll('.we-alert-pill-wrapper')
                            );
                            var idx = allWrappers.indexOf(currentWrapper);
                            if (idx >= 0 && idx < allWrappers.length - 1) {
                                var nextPill = allWrappers[idx + 1].querySelector('.we-alert-pill');
                                if (nextPill) {
                                    $event.preventDefault();
                                    $event.stopPropagation();
                                    nextPill.focus();
                                }
                            }
                        }
                    } else if ($event.keyCode === 9 && $event.shiftKey) {
                        var wrapperEl = $event.currentTarget.closest
                            ? $event.currentTarget.closest('.we-alert-pill-wrapper')
                            : null;
                        if (wrapperEl) {
                            var actions = wrapperEl.querySelectorAll(
                                '.we-alert-popover-actions button, .we-alert-popover-actions a'
                            );
                            if (actions.length > 0 && actions[0] === $event.currentTarget) {
                                $event.preventDefault();
                                $event.stopPropagation();
                                var previousControl =
                                    wrapperEl.querySelector('input[type="radio"]:checked') ||
                                    wrapperEl.querySelector('.we-alert-pill');
                                if (previousControl) {
                                    previousControl.focus();
                                }
                            }
                        }
                    }
                };

                // Dropdown management
                $scope.toggleDropdown = function (name, fromKeyboard) {
                    if (name.indexOf('alert-') === 0 && !fromKeyboard) {
                        if (alertHoverTimer) {
                            $timeout.cancel(alertHoverTimer);
                            alertHoverTimer = null;
                        }
                        // Hover and focus can open the popover just before the click arrives.
                        if ($scope.openDropdown === name && Date.now() - alertPopoverOpenedAt < 500) return;
                        if ($scope.openDropdown !== name) alertPopoverOpenedAt = Date.now();
                    }
                    $scope.openDropdown = $scope.openDropdown === name ? null : name;
                    if (name !== 'compactMenu') {
                        $scope.openCompactSubmenu = null;
                    }
                };

                $scope.toggleCompactSubmenu = function (key) {
                    $scope.openCompactSubmenu = $scope.openCompactSubmenu === key ? null : key;
                };

                function _isKeyboardActivatableElement(el) {
                    if (!el || !el.closest) {
                        return false;
                    }
                    var target = el.closest('.we-dropdown-item, .we-compact-submenu-trigger, .we-picker-type-menu a');
                    if (!target) {
                        return false;
                    }
                    if (target.classList.contains('disabled') || target.getAttribute('aria-disabled') === 'true') {
                        return false;
                    }
                    return true;
                }

                function _getMenuKeyboardItems(container) {
                    if (!container || !container.querySelectorAll) {
                        return [];
                    }
                    return Array.prototype.filter.call(
                        container.querySelectorAll(
                            '.we-dropdown-item, .we-compact-submenu-trigger, .we-picker-type-menu a'
                        ),
                        function (el) {
                            if (el.classList.contains('disabled')) {
                                return false;
                            }
                            return !!el.offsetParent;
                        }
                    );
                }

                function _prepareDropdownKeyboardItems() {
                    var roots = document.querySelectorAll('.we-dropdown-menu, .we-popover, .we-picker-type-menu');
                    Array.prototype.forEach.call(roots, function (root) {
                        Array.prototype.forEach.call(
                            root.querySelectorAll(
                                '.we-dropdown-item, .we-compact-submenu-trigger, .we-picker-type-menu a'
                            ),
                            function (el) {
                                // Menu options are arrow-key navigable; keep them out of Tab order.
                                el.setAttribute('tabindex', '-1');
                                if (!el.hasAttribute('role')) {
                                    el.setAttribute('role', 'button');
                                }
                            }
                        );
                    });
                }

                function _getDropdownTriggersInOrder() {
                    return Array.prototype.filter.call(
                        document.querySelectorAll('[ng-click*="toggleDropdown("]'),
                        function (el) {
                            if (!el.offsetParent) {
                                return false;
                            }
                            if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
                                return false;
                            }
                            return true;
                        }
                    );
                }

                function _getDropdownNameFromTrigger(el) {
                    if (!el || !el.getAttribute) {
                        return null;
                    }
                    var clickExpr = el.getAttribute('ng-click') || '';
                    var match = /toggleDropdown\('([^']+)'\)/.exec(clickExpr);
                    return match && match[1] ? match[1] : null;
                }

                function _focusSiblingDropdownTrigger(backward) {
                    var triggers = _getDropdownTriggersInOrder();
                    if (!triggers.length) {
                        return;
                    }

                    var currentIdx = -1;
                    if ($scope.openDropdown) {
                        for (var i = 0; i < triggers.length; i++) {
                            if (_getDropdownNameFromTrigger(triggers[i]) === $scope.openDropdown) {
                                currentIdx = i;
                                break;
                            }
                        }
                    }

                    if (currentIdx < 0) {
                        currentIdx = triggers.indexOf(document.activeElement);
                    }
                    if (currentIdx < 0) {
                        currentIdx = 0;
                    }

                    var nextIdx;
                    if (backward) {
                        nextIdx = currentIdx === 0 ? triggers.length - 1 : currentIdx - 1;
                    } else {
                        nextIdx = currentIdx === triggers.length - 1 ? 0 : currentIdx + 1;
                    }

                    var next = triggers[nextIdx];
                    if (next && next.focus) {
                        next.focus();
                    }
                }

                function _isOpenDropdownTriggerElement(el) {
                    if (!el || !el.closest || !$scope.openDropdown) {
                        return false;
                    }
                    var trigger = el.closest('[ng-click*="toggleDropdown("]');
                    if (!trigger) {
                        return false;
                    }
                    return _getDropdownNameFromTrigger(trigger) === $scope.openDropdown;
                }

                function _closeOpenModalOnEscape() {
                    if ($scope.openDropdown === 'pickerType') {
                        $scope.openDropdown = null;
                        var trigger = document.getElementById('we-picker-type-toggle');
                        if (trigger) trigger.focus();
                        return true;
                    }
                    if ($scope._modalClosing) {
                        return true;
                    }

                    if ($scope.showRevertConfirm) {
                        $scope.cancelRevert();
                        return true;
                    }
                    if ($scope.showKeyboardShortcutsModal) {
                        $scope.closeKeyboardShortcutsModal();
                        return true;
                    }
                    if ($scope.pendingNewWidget) {
                        $scope.cancelNewWidget();
                        return true;
                    }
                    if ($scope.pendingWidgetNav) {
                        $scope.cancelWidgetNav();
                        return true;
                    }
                    if ($scope.pendingClosePane) {
                        $scope.cancelClosePane();
                        return true;
                    }
                    if ($scope.pendingUnlinkProvider) {
                        $scope.cancelUnlinkProvider();
                        return true;
                    }
                    if ($scope.pendingDeletePane) {
                        $scope.cancelDeletePane();
                        return true;
                    }
                    if ($scope.showWidgetPickerModal && !$scope.showPicker) {
                        $scope.closeWidgetPickerModal();
                        return true;
                    }
                    if ($scope.relatedModal && $scope.relatedModal.open) {
                        $scope.closeRelatedModal();
                        return true;
                    }
                    if ($scope.versionDiffModal && $scope.versionDiffModal.open) {
                        $scope.closeVersionDiffModal();
                        return true;
                    }
                    if ($scope.showXmlModal) {
                        $scope.closeXmlModal();
                        return true;
                    }
                    if ($scope.showOptionSchemaModal) {
                        $scope.closeOptionSchemaModal();
                        return true;
                    }
                    if ($scope.showDemoDataModal) {
                        $scope.closeDemoDataModal();
                        return true;
                    }
                    if ($scope.showLinkProviderModal) {
                        $scope.cancelLinkProviderModal();
                        return true;
                    }
                    if ($scope.showOpenOnPortalModal) {
                        $scope.closeOpenOnPortalModal();
                        return true;
                    }
                    if ($scope.pendingUnlinkDependency) {
                        $scope.cancelUnlinkDependency();
                        return true;
                    }
                    if ($scope.showLinkDependencyModal) {
                        $scope.cancelLinkDependencyModal();
                        return true;
                    }
                    if ($scope.showUserPrefsModal) {
                        $scope.cancelUserPrefsModal();
                        return true;
                    }

                    return false;
                }

                function _safeApply(fn) {
                    if ($scope.$$phase) {
                        fn();
                        return;
                    }
                    $scope.$apply(fn);
                }

                $scope.onDropdownTriggerKeydown = function (event, name) {
                    var key = event && event.key;
                    var keyCode = event && event.keyCode;
                    if (key === 'Escape' || keyCode === 27) {
                        event.preventDefault();
                        if (name === 'pickerType') event.stopPropagation();
                        $scope.openDropdown = null;
                        $scope.openCompactSubmenu = null;
                        return;
                    }

                    if (
                        key !== 'Enter' &&
                        key !== ' ' &&
                        key !== 'Spacebar' &&
                        key !== 'ArrowDown' &&
                        keyCode !== 13 &&
                        keyCode !== 32 &&
                        keyCode !== 40
                    ) {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    $scope.openDropdown = name;
                    if (name !== 'compactMenu') {
                        $scope.openCompactSubmenu = null;
                    }
                    $timeout(function () {
                        _prepareDropdownKeyboardItems();
                        var openMenu = document.querySelector(
                            '.we-dropdown-menu:not(.ng-hide), .we-popover:not(.ng-hide), .we-picker-type-menu:not(.ng-hide)'
                        );
                        if (!openMenu) {
                            return;
                        }
                        var items = _getMenuKeyboardItems(openMenu);
                        if (items.length) {
                            items[0].focus();
                        }
                    }, 0);
                };

                $scope.$watch('openDropdown', function (newVal) {
                    if (!newVal) {
                        return;
                    }
                    $timeout(function () {
                        _prepareDropdownKeyboardItems();
                    }, 0);
                });

                $scope.$watch('openCompactSubmenu', function (newVal) {
                    if (!newVal) {
                        return;
                    }
                    $timeout(function () {
                        _prepareDropdownKeyboardItems();
                    }, 0);
                });

                document.addEventListener('click', function (e) {
                    if (
                        !e.target.closest ||
                        (!e.target.closest('.we-dropdown') &&
                            !e.target.closest('.we-autocomplete') &&
                            !e.target.closest('.we-popover') &&
                            !e.target.closest('.select2-container') &&
                            !e.target.closest('.select2-dropdown') &&
                            !e.target.closest('.select2-drop'))
                    ) {
                        $scope.$apply(function () {
                            $scope.openDropdown = null;
                            $scope.openCompactSubmenu = null;
                        });
                    }
                });

                document.addEventListener('keydown', function (e) {
                    var key = e && e.key;
                    var keyCode = e && e.keyCode;
                    var isArrowDown = key === 'ArrowDown' || keyCode === 40;
                    var isArrowUp = key === 'ArrowUp' || keyCode === 38;

                    if (key === 'Escape' || keyCode === 27) {
                        var closedModal = false;
                        _safeApply(function () {
                            closedModal = _closeOpenModalOnEscape();
                        });
                        if (closedModal) {
                            e.preventDefault();
                            return;
                        }
                    }

                    if ((key === 'Tab' || keyCode === 9) && $scope.openDropdown) {
                        // Preserve native Tab/Shift+Tab order; close the menu after
                        // the browser has moved focus to the next focusable element.
                        setTimeout(function () {
                            _safeApply(function () {
                                $scope.openDropdown = null;
                                $scope.openCompactSubmenu = null;
                            });
                        }, 0);
                        return;
                    }

                    if ((key === 'Escape' || keyCode === 27) && $scope.openDropdown) {
                        e.preventDefault();
                        _safeApply(function () {
                            $scope.openDropdown = null;
                            $scope.openCompactSubmenu = null;
                        });
                        return;
                    }

                    if (!e.target || !e.target.closest) {
                        return;
                    }

                    var menuContainer = e.target.closest('.we-dropdown-menu, .we-popover, .we-picker-type-menu');
                    if (!menuContainer) {
                        if (
                            !$scope.openDropdown ||
                            (!isArrowDown && !isArrowUp) ||
                            !_isOpenDropdownTriggerElement(e.target)
                        ) {
                            return;
                        }

                        var openMenu = document.querySelector(
                            '.we-dropdown-menu:not(.ng-hide), .we-popover:not(.ng-hide), .we-picker-type-menu:not(.ng-hide)'
                        );
                        var openItems = _getMenuKeyboardItems(openMenu);
                        if (!openItems.length) {
                            return;
                        }

                        e.preventDefault();
                        var focusIdx = isArrowDown ? 0 : openItems.length - 1;
                        if (openItems[focusIdx] && openItems[focusIdx].focus) {
                            openItems[focusIdx].focus();
                        }
                        return;
                    }

                    if (isArrowDown || isArrowUp) {
                        var items = _getMenuKeyboardItems(menuContainer);
                        if (!items.length) {
                            return;
                        }
                        e.preventDefault();
                        var current = e.target.closest(
                            '.we-dropdown-item, .we-compact-submenu-trigger, .we-picker-type-menu a'
                        );
                        var currentIdx = items.indexOf(current);
                        if (currentIdx < 0) {
                            items[0].focus();
                            return;
                        }
                        var nextIdx = isArrowDown
                            ? Math.min(currentIdx + 1, items.length - 1)
                            : Math.max(currentIdx - 1, 0);
                        if (items[nextIdx] && items[nextIdx].focus) {
                            items[nextIdx].focus();
                        }
                        return;
                    }

                    var isEnter = key === 'Enter' || keyCode === 13;
                    var isSpace = key === ' ' || key === 'Spacebar' || keyCode === 32;
                    if (!isEnter && !isSpace) {
                        return;
                    }

                    if (e.target.closest('a, button, input, select, textarea, .select2-container, .select2-dropdown')) {
                        return;
                    }

                    if (!_isKeyboardActivatableElement(e.target)) {
                        return;
                    }

                    e.preventDefault();
                    var target = e.target.closest(
                        '.we-dropdown-item, .we-compact-submenu-trigger, .we-picker-type-menu a'
                    );
                    if (target && target.click) {
                        target.click();
                    }
                });

                // Local drafts are recovery copies; only explicit Save actions write to ServiceNow.
                var _draftPageId = Date.now() + '-' + Math.random().toString(36).slice(2);
                var _draftTimer = null;
                var _draftCaptureStopped = false;
                var _draftRetentionLoaded = false;
                var _draftJson = {};
                var _lastDraftEntries = null;
                $scope.localDrafts = [];
                $scope.localDraftSelection = { draft: null };
                $scope.localDraftError = null;
                $scope.lastDraftSaveTime = null;
                $scope.draftRecovery = {
                    entries: [],
                    records: [],
                    busy: false,
                };

                function _editorValuesEqual(left, right) {
                    function normalise(value) {
                        return typeof value === 'string'
                            ? value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
                            : value == null
                              ? ''
                              : value;
                    }
                    return normalise(left) === normalise(right);
                }

                function _validAutosaveInterval(value) {
                    return Number.isSafeInteger(value) && value >= 0;
                }

                $scope.validAutosaveInterval = _validAutosaveInterval;

                function _validDraftRetentionDays(value) {
                    return Number.isSafeInteger(value) && value >= 1;
                }

                $scope.validDraftRetentionDays = _validDraftRetentionDays;

                function _draftPrefix() {
                    return (
                        'we_local_draft:v1:' +
                        $scope.currentUserId +
                        ':' +
                        ($scope.recordTable && $scope.recordTable !== 'sp_widget' ? $scope.recordTable + ':' : '') +
                        SYS_ID +
                        ':'
                    );
                }

                function _syncLocalDraftSelection() {
                    var selected = $scope.localDraftSelection.draft;
                    $scope.localDraftSelection.draft =
                        $scope.localDrafts.find(function (draft) {
                            return selected && draft.key === selected.key;
                        }) ||
                        $scope.localDrafts[0] ||
                        null;
                }

                function _localDraftFieldSummary(draft) {
                    return draft.entries
                        .map(function (entry) {
                            if (entry.type !== 'widget') {
                                return {
                                    template: 'Angular template',
                                    provider: 'Angular provider',
                                    script_include: 'Script Include',
                                }[entry.type];
                            }
                            var def =
                                $scope.coreEditorDefs.find(function (d) {
                                    return d.field === entry.field;
                                }) ||
                                $scope.additionalWidgetFields.find(function (d) {
                                    return d.name === entry.field;
                                });
                            return (
                                (def && def.label) ||
                                {
                                    name: 'Name',
                                    id: 'ID',
                                    description: 'Description',
                                    controller_as: 'Controller alias',
                                    is_public: 'Public',
                                    roles: 'Roles',
                                    static: 'Static',
                                    option_schema: 'Option Schema',
                                    demo_data: 'Demo Data',
                                }[entry.field] ||
                                entry.field.replace(/_/g, ' ')
                            );
                        })
                        .filter(function (label, index, labels) {
                            return labels.indexOf(label) === index;
                        })
                        .join(' · ');
                }

                function _pruneLocalDrafts() {
                    if (
                        !_draftRetentionLoaded ||
                        !$scope.currentUserId ||
                        !_validDraftRetentionDays($scope.userPrefs.draftRetentionDays)
                    ) {
                        return;
                    }
                    var prefix = 'we_local_draft:v1:' + $scope.currentUserId + ':';
                    var cutoff = Date.now() - $scope.userPrefs.draftRetentionDays * 86400000;
                    for (var i = localStorage.length - 1; i >= 0; i--) {
                        var key = localStorage.key(i);
                        // Keep this tab's working copy even if its content has not changed recently.
                        if (key.indexOf(prefix) !== 0 || key === _draftPrefix() + _draftPageId) {
                            continue;
                        }
                        var raw = localStorage.getItem(key);
                        var draft;
                        try {
                            draft = JSON.parse(raw);
                        } catch (e) {
                            continue;
                        }
                        if (
                            draft &&
                            draft.version === 1 &&
                            Number.isFinite(draft.updatedAt) &&
                            Array.isArray(draft.entries) &&
                            draft.updatedAt <= cutoff &&
                            localStorage.getItem(key) === raw
                        ) {
                            localStorage.removeItem(key);
                        }
                    }
                    $scope.localDrafts = $scope.localDrafts.filter(function (draft) {
                        return draft.updatedAt > cutoff;
                    });
                    _syncLocalDraftSelection();
                }

                function _canDraft() {
                    return !!(
                        !_draftCaptureStopped &&
                        SYS_ID &&
                        $scope.currentUserId &&
                        !$scope.loading &&
                        !$scope.loadError &&
                        !$scope.isNewWidget &&
                        !$scope.isVersionView &&
                        $scope.canWriteWidget &&
                        !$scope.widget.deleted
                    );
                }

                function _draftWidgetFields() {
                    if ($scope.isWidgetRecord === false)
                        return $scope.coreEditorDefs
                            .filter(function (def) {
                                return !def.readOnly;
                            })
                            .map(function (def) {
                                return def.field;
                            })
                            .concat(
                                $scope.additionalWidgetFields
                                    .filter(function (def) {
                                        return def.canWrite;
                                    })
                                    .map(function (def) {
                                        return def.name;
                                    })
                            );
                    return ['name', 'id', 'description', 'controller_as', 'is_public', 'roles', 'static']
                        .concat(
                            $scope.coreEditorDefs.map(function (d) {
                                return d.field;
                            })
                        )
                        .concat(
                            $scope.additionalWidgetFields.map(function (d) {
                                return d.name;
                            })
                        );
                }

                function _draftPrettyJson(value) {
                    try {
                        return value.trim() ? JSON.stringify(JSON.parse(value), null, 4) : value;
                    } catch (e) {
                        return value;
                    }
                }

                function _collectLocalDraft() {
                    var entries = [];
                    function add(type, id, key, field, base, value) {
                        base = base == null ? '' : base;
                        value = value == null ? '' : value;
                        if (!_editorValuesEqual(value, base)) {
                            entries.push({
                                type: type,
                                id: id,
                                key: key,
                                field: field,
                                base: base,
                                value: value,
                            });
                        }
                    }
                    _draftWidgetFields().forEach(function (field) {
                        var def = $scope.coreEditorDefs.find(function (d) {
                            return d.field === field;
                        });
                        var extra = $scope.additionalWidgetFields.find(function (d) {
                            return d.name === field;
                        });
                        var base = def ? originalValues[field] : originalHeader[field];
                        var value =
                            def && monacoEditors[def.key]
                                ? monacoEditors[def.key].getValue()
                                : field === 'roles'
                                  ? $scope.rolesList.join(',')
                                  : $scope.widget[field];
                        if (extra) {
                            value = _normaliseExtraWidgetFieldValue(extra, value);
                        }
                        if (field === 'controller_as' && $scope.isWidgetRecord !== false) value = value || 'c';
                        if (field === 'is_public' || field === 'static') value = !!value;
                        add('widget', SYS_ID, def ? def.key : '', field, base, value);
                    });
                    extraPanes.forEach(function (pane) {
                        if (pane.readOnly) {
                            return;
                        }
                        var editor = monacoEditors[pane.key];
                        add(
                            pane.recordType,
                            pane.sys_id || '',
                            pane.key,
                            'content',
                            pane.lastServerContent,
                            editor ? editor.getValue() : pane.content
                        );
                        if (pane.hasIdInput) {
                            add(
                                pane.recordType,
                                pane.sys_id || '',
                                pane.key,
                                'recordId',
                                pane._draftOriginalId,
                                pane.recordId
                            );
                            if (pane.recordType === 'provider') {
                                add(
                                    'provider',
                                    pane.sys_id || '',
                                    pane.key,
                                    'providerType',
                                    pane._draftOriginalType,
                                    pane.providerType
                                );
                            }
                        }
                    });
                    Object.keys(_draftJson).forEach(function (field) {
                        var json = _draftJson[field];
                        add('widget', SYS_ID, '', field, json.base, json.value);
                    });
                    return {
                        version: 1,
                        updatedAt: Date.now(),
                        entries: entries,
                    };
                }

                function _writeLocalDraft(cleanup) {
                    if (!_canDraft() || (!cleanup && !$scope.userPrefs.autosaveInterval)) {
                        return;
                    }
                    try {
                        _pruneLocalDrafts();
                        var key = _draftPrefix() + _draftPageId;
                        // Saving with autosave off may clean up an existing draft, but must not create one.
                        if (cleanup && !$scope.userPrefs.autosaveInterval && !localStorage.getItem(key)) {
                            _findLocalDrafts();
                            return;
                        }
                        var draft = _collectLocalDraft();
                        var entries = JSON.stringify(draft.entries);
                        var old = localStorage.getItem(key);
                        // A different tab discarded this copy; capture again only after a content change.
                        if (!old && entries === _lastDraftEntries) {
                            $scope.lastDraftSaveTime = null;
                            return;
                        }
                        if (!draft.entries.length) {
                            localStorage.removeItem(key);
                            $scope.lastDraftSaveTime = null;
                            _lastDraftEntries = null;
                        } else {
                            var saved = old ? JSON.parse(old) : null;
                            if (!saved || JSON.stringify(saved.entries) !== entries) {
                                localStorage.setItem(key, JSON.stringify(draft));
                                saved = draft;
                            }
                            _lastDraftEntries = entries;
                            $scope.lastDraftSaveTime = new Date(saved.updatedAt);
                        }
                        $scope.localDraftError = null;
                        if (cleanup) _findLocalDrafts();
                    } catch (e) {
                        $scope.localDraftError =
                            'Local drafts could not be saved. Check browser storage settings or available space.';
                    }
                }

                function _discardPageDraft() {
                    try {
                        localStorage.removeItem(_draftPrefix() + _draftPageId);
                        _draftCaptureStopped = true;
                        $scope.lastDraftSaveTime = null;
                        $scope.localDraftError = null;
                        return true;
                    } catch (e) {
                        $scope.localDraftError = 'The local draft could not be discarded.';
                        return false;
                    }
                }

                function _clearWidgetDrafts() {
                    try {
                        _writeLocalDraft(true);
                        if (
                            $scope.versionDiffModal.localDraft &&
                            !$scope.localDrafts.some(function (draft) {
                                return draft.key === $scope.versionDiffModal.localDraft.key;
                            })
                        ) {
                            $scope.closeVersionDiffModal();
                        }
                    } catch (e) {
                        $scope.localDraftError = 'The record was saved, but its local drafts could not be updated.';
                    }
                }

                function _savedDraftValue(entry) {
                    if (entry.type === 'widget') {
                        if (Object.prototype.hasOwnProperty.call(originalValues, entry.field))
                            return originalValues[entry.field];
                        if (Object.prototype.hasOwnProperty.call(originalHeader, entry.field))
                            return originalHeader[entry.field];
                        return undefined;
                    }
                    if (!entry.id) return undefined;
                    var pane = extraPanes.find(function (p) {
                        return p.recordType === entry.type && p.sys_id === entry.id;
                    });
                    if (pane)
                        return entry.field === 'content'
                            ? pane.lastServerContent
                            : entry.field === 'recordId'
                              ? pane._draftOriginalId
                              : pane._draftOriginalType;
                    var record = ((entry.type === 'template' ? $scope.templates : $scope.providers) || []).find(
                        function (r) {
                            return r.sys_id === entry.id;
                        }
                    );
                    if (!record || entry.type === 'script_include') return undefined;
                    return record[
                        entry.field === 'content'
                            ? entry.type === 'template'
                                ? 'template'
                                : 'script'
                            : entry.field === 'recordId'
                              ? entry.type === 'template'
                                  ? 'id'
                                  : 'name'
                              : 'type'
                    ];
                }

                function _refreshLocalDraft(draft, requests) {
                    return _readLocalDraft(draft, requests)
                        .then(function (entries) {
                            if (
                                $scope.localDrafts.indexOf(draft) === -1 ||
                                localStorage.getItem(draft.key) !== draft.raw
                            )
                                return;
                            draft.entries = entries.filter(function (entry) {
                                return !_editorValuesEqual(entry.value, entry.current);
                            });
                            draft.fieldsLabel = _localDraftFieldSummary(draft);
                            if (!draft.entries.length) _removeRecoveredDraft(draft);
                        })
                        .catch(function () {
                            /* Keep recovery copies when saved content cannot be checked. */
                        });
                }

                function _validLocalDraft(draft) {
                    return (
                        draft &&
                        draft.version === 1 &&
                        Number.isFinite(draft.updatedAt) &&
                        Array.isArray(draft.entries) &&
                        draft.entries.length &&
                        draft.entries.every(function (entry) {
                            if (
                                !entry ||
                                typeof entry.key !== 'string' ||
                                !/^[\w-]*$/.test(entry.key) ||
                                typeof entry.id !== 'string' ||
                                (entry.id && !/^[a-f0-9]{32}$/.test(entry.id)) ||
                                !['string', 'boolean'].includes(typeof entry.value) ||
                                !['string', 'boolean'].includes(typeof entry.base)
                            ) {
                                return false;
                            }
                            if (entry.type === 'widget') {
                                var booleanField =
                                    ['is_public', 'static'].includes(entry.field) ||
                                    $scope.additionalWidgetFields.some(function (d) {
                                        return d.name === entry.field && d.type === 'boolean';
                                    });
                                var valueType = booleanField ? 'boolean' : 'string';
                                return (
                                    typeof entry.value === valueType &&
                                    typeof entry.base === valueType &&
                                    entry.id === SYS_ID &&
                                    _draftWidgetFields()
                                        .concat($scope.isWidgetRecord === false ? [] : ['option_schema', 'demo_data'])
                                        .includes(entry.field)
                                );
                            }
                            return (
                                typeof entry.value === 'string' &&
                                typeof entry.base === 'string' &&
                                ['template', 'provider', 'script_include'].includes(entry.type) &&
                                (entry.type !== 'script_include' || !!entry.id) &&
                                (entry.field === 'content' ||
                                    (entry.type !== 'script_include' && entry.field === 'recordId') ||
                                    (entry.type === 'provider' && entry.field === 'providerType'))
                            );
                        })
                    );
                }

                function _findLocalDrafts(onLoad) {
                    try {
                        _pruneLocalDrafts();
                        if (!_canDraft()) {
                            return;
                        }
                        $scope.localDrafts = [];
                        var requests = Object.create(null);
                        for (var i = localStorage.length - 1; i >= 0; i--) {
                            var key = localStorage.key(i);
                            if (key.indexOf(_draftPrefix()) !== 0 || key === _draftPrefix() + _draftPageId) {
                                continue;
                            }
                            var raw = localStorage.getItem(key);
                            var draft;
                            try {
                                draft = JSON.parse(raw);
                            } catch (e) {
                                continue;
                            }
                            if (_validLocalDraft(draft)) {
                                var entries = draft.entries.filter(function (entry) {
                                    var saved = _savedDraftValue(entry);
                                    return (
                                        !_editorValuesEqual(entry.value, entry.base) &&
                                        (saved === undefined || !_editorValuesEqual(entry.value, saved))
                                    );
                                });
                                if (!entries.length) {
                                    if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
                                    continue;
                                }
                                var recovery = {
                                    key: key,
                                    raw: raw,
                                    updatedAt: draft.updatedAt,
                                    entries: entries,
                                    fieldsLabel: _localDraftFieldSummary({ entries: entries }),
                                };
                                $scope.localDrafts.push(recovery);
                                if (
                                    entries.some(function (entry) {
                                        return _savedDraftValue(entry) === undefined;
                                    })
                                )
                                    _refreshLocalDraft(recovery, requests);
                            }
                        }
                        $scope.localDrafts.sort(function (a, b) {
                            return b.updatedAt - a.updatedAt;
                        });
                        _syncLocalDraftSelection();
                        if (onLoad) {
                            var previousKey;
                            try {
                                previousKey = sessionStorage.getItem(_draftPrefix());
                                sessionStorage.setItem(_draftPrefix(), _draftPrefix() + _draftPageId);
                            } catch (e) {
                                /* Manual recovery still works when tab storage is unavailable. */
                            }
                            if (document.wasDiscarded === true) {
                                var previousDraft = $scope.localDrafts.find(function (draft) {
                                    return draft.key === previousKey;
                                });
                                if (!previousKey && $scope.localDrafts.length === 1) {
                                    previousDraft = $scope.localDrafts[0];
                                }
                                if (previousDraft) {
                                    return $scope.restoreLocalDraft(previousDraft);
                                }
                            }
                        }
                    } catch (e) {
                        $scope.localDraftError = 'Local drafts are unavailable. Check browser storage settings.';
                    }
                }

                function _readLocalDraft(draft, requests) {
                    requests = requests || Object.create(null);
                    function request(action, params) {
                        var key = action + ':' + (params.sys_id || '');
                        if (!requests[key]) {
                            requests[key] = ajax(action, params).then(function (data) {
                                if (!data.success) {
                                    throw new Error(data.error || 'Could not load saved content.');
                                }
                                return data;
                            });
                        }
                        return requests[key];
                    }
                    return request('getWidget', { sys_id: SYS_ID }).then(function (data) {
                        if (data.widget.canWrite === false || data.widget.sys_policy || data.widget.deleted) {
                            throw new Error('This widget is no longer editable.');
                        }
                        return $q.all(
                            draft.entries.map(function (entry) {
                                var load;
                                if (entry.type === 'widget') {
                                    var action =
                                        entry.field === 'option_schema'
                                            ? 'getOptionSchema'
                                            : entry.field === 'demo_data'
                                              ? 'getDemoData'
                                              : 'getWidget';
                                    load = request(action, {
                                        sys_id: SYS_ID,
                                    }).then(function (data) {
                                        if (action !== 'getWidget') {
                                            var raw = data[entry.field] || '';
                                            return {
                                                value:
                                                    _editorValuesEqual(entry.value, raw) ||
                                                    _editorValuesEqual(entry.base, raw)
                                                        ? raw
                                                        : _draftPrettyJson(raw),
                                            };
                                        }
                                        if ($scope.isWidgetRecord === false) {
                                            var header = (data.additional_widget_fields || []).find(function (def) {
                                                return def.name === entry.field;
                                            });
                                            var code = (data.core_editor_defs || []).find(function (def) {
                                                return def.field === entry.field;
                                            });
                                            if (!(header && header.canWrite) && !(code && !code.readOnly))
                                                throw new Error('A draft field is no longer editable.');
                                        }
                                        return {
                                            value: data.widget[entry.field],
                                            record: data.widget,
                                        };
                                    });
                                } else if (!entry.id) {
                                    load = $q.resolve({
                                        value: '',
                                        record: {},
                                    });
                                } else if (entry.type === 'script_include') {
                                    load = request('getScriptInclude', {
                                        sys_id: entry.id,
                                    }).then(function (data) {
                                        return {
                                            value: data.si.script,
                                            record: data.si,
                                        };
                                    });
                                } else {
                                    load = request(entry.type === 'template' ? 'getTemplates' : 'getProviders', {
                                        sys_id: SYS_ID,
                                    }).then(function (data) {
                                        var record = (data.templates || data.providers).find(function (r) {
                                            return r.sys_id === entry.id;
                                        });
                                        if (!record) {
                                            throw new Error(
                                                'A draft record was deleted, unlinked or is no longer accessible.'
                                            );
                                        }
                                        var field =
                                            entry.field === 'content'
                                                ? entry.type === 'template'
                                                    ? 'template'
                                                    : 'script'
                                                : entry.field === 'recordId'
                                                  ? entry.type === 'template'
                                                      ? 'id'
                                                      : 'name'
                                                  : 'type';
                                        return {
                                            value: record[field],
                                            record: record,
                                        };
                                    });
                                }
                                return load.then(function (loaded) {
                                    if (loaded.record && loaded.record.readOnly) {
                                        throw new Error('A draft record is no longer editable.');
                                    }
                                    var current = loaded.value == null ? '' : loaded.value;
                                    if (typeof entry.value === 'boolean') {
                                        current = current === true || current === 'true' || current === '1';
                                    }
                                    if (entry.field === 'roles') {
                                        current = parseRoles(current).join(',');
                                    }
                                    return Object.assign({}, entry, {
                                        current: current,
                                        record: loaded.record,
                                        conflict:
                                            !_editorValuesEqual(current, entry.base) &&
                                            !_editorValuesEqual(current, entry.value),
                                    });
                                });
                            })
                        );
                    });
                }

                function _loadDraftRecovery(draft) {
                    if (!_canDraft() || $scope.draftRecovery.busy) {
                        return $q.reject('Draft recovery is unavailable.');
                    }
                    $scope.draftRecovery.busy = true;
                    $scope.localDraftError = null;
                    return _readLocalDraft(draft)
                        .then(function (entries) {
                            entries = entries.filter(function (entry) {
                                return !_editorValuesEqual(entry.value, entry.current);
                            });
                            if (!entries.length) _removeRecoveredDraft(draft);
                            $scope.draftRecovery = {
                                draft: draft,
                                entries: entries,
                                records: [],
                                busy: false,
                                conflict: entries.some(function (entry) {
                                    return entry.conflict;
                                }),
                            };
                            return entries;
                        })
                        .catch(function (err) {
                            $scope.draftRecovery.busy = false;
                            $scope.localDraftError = err.message || String(err);
                            throw err;
                        });
                }

                function _openLocalDraftCompare() {
                    var records = [];
                    $scope.draftRecovery.entries.forEach(function (entry) {
                        var key = entry.type + ':' + (entry.id || entry.key);
                        var record = records.find(function (r) {
                            return r.key === key;
                        });
                        if (!record) {
                            var name =
                                entry.type === 'widget'
                                    ? $scope.widget.name
                                    : (entry.record && (entry.record.name || entry.record.id)) ||
                                      {
                                          template: 'Angular template',
                                          provider: 'Angular provider',
                                          script_include: 'Script Include',
                                      }[entry.type];
                            record = {
                                key: key,
                                id: entry.id,
                                table: {
                                    widget: $scope.recordTable || 'sp_widget',
                                    template: 'sp_ng_template',
                                    provider: 'sp_angular_provider',
                                    script_include: 'sys_script_include',
                                }[entry.type],
                                label: name,
                                snapshot: { _unsaved: true },
                            };
                            if (!entry.id) {
                                record.snapshot._newRecord = true;
                            }
                            records.push(record);
                        }
                        var field = entry.field;
                        if (entry.type !== 'widget') {
                            field =
                                field === 'content'
                                    ? entry.type === 'template'
                                        ? 'template'
                                        : 'script'
                                    : field === 'recordId'
                                      ? entry.type === 'template'
                                          ? 'id'
                                          : 'name'
                                      : 'type';
                        }
                        record.snapshot[field] = entry.value;
                        if (!entry.id && entry.field === 'recordId' && entry.value) {
                            record.label = entry.value;
                        }
                        if (field === 'is_public') {
                            record.snapshot.public = entry.value;
                        }
                    });
                    $scope.draftRecovery.records = records;
                    $scope.draftRecovery.selectedRecord = records[0];
                    $scope.openDropdown = null;
                    $scope.showLocalDraftCompare();
                }

                $scope.showLocalDraftCompare = function () {
                    var record = $scope.draftRecovery.selectedRecord;
                    if (record && _openUnsavedSnapshotDiff(record.table, record.id, record.snapshot, 'Local draft')) {
                        $scope.versionDiffModal.localDraft = $scope.draftRecovery.draft;
                    }
                };

                $scope.compareLocalDraft = function (draft) {
                    return _loadDraftRecovery(draft)
                        .then(_openLocalDraftCompare)
                        .catch(function () {});
                };

                function _removeRecoveredDraft(draft) {
                    // Another tab may have updated this draft since the recovery prompt appeared.
                    var raw = localStorage.getItem(draft.key);
                    if (raw !== null && raw !== draft.raw) return false;
                    localStorage.removeItem(draft.key);
                    $scope.localDrafts = $scope.localDrafts.filter(function (d) {
                        return d !== draft;
                    });
                    _syncLocalDraftSelection();
                    return true;
                }

                $scope.discardLocalDraft = function (draft) {
                    try {
                        if (!_removeRecoveredDraft(draft)) {
                            _findLocalDrafts();
                            $scope.localDraftError =
                                'This draft changed in another tab. Review its latest contents before discarding it.';
                            return;
                        }
                        $scope.localDraftError = null;
                        $scope.openDropdown = null;
                        if ($scope.versionDiffModal.localDraft === draft) {
                            $scope.closeVersionDiffModal();
                        }
                    } catch (e) {
                        $scope.localDraftError = 'The local draft could not be discarded.';
                    }
                };

                $scope.restoreLocalDraft = function (draft, reviewed) {
                    return _loadDraftRecovery(draft)
                        .then(function (entries) {
                            if (!reviewed && ($scope.draftRecovery.conflict || hasUnsavedChanges())) {
                                _openLocalDraftCompare();
                                return;
                            }
                            var panes = Object.create(null);
                            entries.forEach(function (entry) {
                                if (entry.type === 'widget') {
                                    if (entry.field === 'option_schema' || entry.field === 'demo_data') {
                                        _draftJson[entry.field] = {
                                            base: entry.current,
                                            value: entry.value,
                                        };
                                    } else {
                                        var def = $scope.coreEditorDefs.find(function (d) {
                                            return d.field === entry.field;
                                        });
                                        $scope.widget[entry.field] = entry.value;
                                        if (entry.field === 'roles') {
                                            $scope.rolesList = parseRoles(entry.value);
                                        }
                                        if (def) {
                                            originalValues[entry.field] = lastServerValues[entry.field] = entry.current;
                                            if (monacoEditors[def.key]) {
                                                // Monaco callbacks use $apply; run them outside this digest.
                                                $timeout(
                                                    function () {
                                                        monacoEditors[def.key].setValue(entry.value);
                                                    },
                                                    0,
                                                    false
                                                );
                                            }
                                        } else {
                                            originalHeader[entry.field] = entry.current;
                                        }
                                    }
                                } else {
                                    var pane =
                                        panes[entry.key] ||
                                        extraPanes.find(function (p) {
                                            return (
                                                p.recordType === entry.type &&
                                                (entry.id ? p.sys_id === entry.id : p.key === entry.key)
                                            );
                                        });
                                    if (!pane) {
                                        pane =
                                            entry.type === 'template'
                                                ? makeTemplatePaneObj(entry.record)
                                                : entry.type === 'provider'
                                                  ? makeProviderPaneObj(entry.record)
                                                  : makeScriptIncludePaneObj(entry.record);
                                        pane._draftOriginalId = entry.record.id || entry.record.name || '';
                                        pane._draftOriginalType = entry.record.type || '';
                                        pane.lastServerContent = entry.record.template || entry.record.script || '';
                                        openExtraPane(pane);
                                    }
                                    panes[entry.key] = pane;
                                    pane[entry.field] = entry.value;
                                    if (entry.field === 'content') {
                                        pane.lastServerContent = entry.current;
                                        pane.dirty = !_editorValuesEqual(entry.value, entry.current);
                                        if (monacoEditors[pane.key]) {
                                            $timeout(
                                                function () {
                                                    monacoEditors[pane.key].setValue(entry.value);
                                                },
                                                0,
                                                false
                                            );
                                        }
                                    } else {
                                        pane.idDirty = true;
                                        if (entry.field === 'recordId') {
                                            pane._draftOriginalId = entry.current;
                                            $scope.onPaneIdChange(pane);
                                        } else {
                                            pane._draftOriginalType = entry.current;
                                        }
                                    }
                                }
                            });
                            $scope.openDropdown = null;
                            $timeout(function () {
                                try {
                                    // Explicit recovery also keeps a copy when automatic capture is off.
                                    var copy = _collectLocalDraft();
                                    if (copy.entries.length) {
                                        localStorage.setItem(_draftPrefix() + _draftPageId, JSON.stringify(copy));
                                        _lastDraftEntries = JSON.stringify(copy.entries);
                                        $scope.lastDraftSaveTime = new Date(copy.updatedAt);
                                    }
                                    if (!_removeRecoveredDraft(draft)) _findLocalDrafts();
                                } catch (e) {
                                    $scope.localDraftError =
                                        'The recovered draft could not be copied. Its original recovery copy has been retained.';
                                }
                            }, 0);
                            if ($scope.versionDiffModal.localDraft === draft) {
                                $scope.closeVersionDiffModal();
                            }
                        })
                        .catch(function () {});
                };

                $scope.$watch('userPrefs.autosaveInterval', function (seconds) {
                    if (_draftTimer) {
                        $timeout.cancel(_draftTimer);
                    }
                    if (!_validAutosaveInterval(seconds) || !seconds) {
                        return;
                    }
                    var dueAt = Date.now() + seconds * 1000;
                    function tick() {
                        if (Date.now() >= dueAt) {
                            _writeLocalDraft();
                            dueAt = Date.now() + seconds * 1000;
                        }
                        _draftTimer = $timeout(tick, Math.min(dueAt - Date.now(), 2147483647));
                    }
                    _draftTimer = $timeout(tick, Math.min(seconds * 1000, 2147483647));
                });
                function _flushLocalDraft() {
                    _writeLocalDraft();
                    $scope.$applyAsync();
                }
                function _draftVisibilityChanged() {
                    if (document.visibilityState === 'hidden') {
                        _flushLocalDraft();
                    }
                }
                function _draftStorageChanged(event) {
                    if (event.storageArea && event.storageArea !== localStorage) return;
                    if (event.key !== null && event.key.indexOf(_draftPrefix()) !== 0) return;
                    $scope.$evalAsync(function () {
                        _findLocalDrafts();
                    });
                }
                window.addEventListener('storage', _draftStorageChanged);
                document.addEventListener('visibilitychange', _draftVisibilityChanged);
                window.addEventListener('pagehide', _flushLocalDraft);
                $scope.$on('$destroy', function () {
                    if (_draftTimer) {
                        $timeout.cancel(_draftTimer);
                    }
                    document.removeEventListener('visibilitychange', _draftVisibilityChanged);
                    window.removeEventListener('pagehide', _flushLocalDraft);
                    window.removeEventListener('storage', _draftStorageChanged);
                });

                // Unsaved changes guard
                function hasUnsavedChanges() {
                    if ($scope.isNewWidget && ($scope.widget.name || $scope.widget.id || $scope.widget.description)) {
                        return true;
                    }

                    var hasHeaderChanges =
                        !!$scope.headerDirty.name ||
                        !!$scope.headerDirty.id ||
                        !!$scope.headerDirty.description ||
                        !!$scope.headerDirty.controller_as ||
                        !!$scope.headerDirty.is_public ||
                        !!$scope.headerDirty.roles ||
                        !!$scope.headerDirty.static ||
                        ($scope.additionalWidgetFields || []).some(function (fieldDef) {
                            return !!$scope.headerDirty[fieldDef.name];
                        });

                    return (
                        Object.keys(_draftJson).some(function (field) {
                            return !_editorValuesEqual(_draftJson[field].value, _draftJson[field].base);
                        }) ||
                        hasHeaderChanges ||
                        $scope.visibleItems.some(function (item) {
                            return item.type === 'pane' && (item.dirty || item.idDirty);
                        }) ||
                        $scope.coreEditorDefs.some(function (def) {
                            var ed = monacoEditors[def.key];
                            return !_editorValuesEqual(
                                ed ? ed.getValue() : $scope.widget[def.field],
                                originalValues[def.field]
                            );
                        })
                    );
                }

                $scope.hasUnsavedChanges = hasUnsavedChanges;

                $scope.openInPlatform = function () {
                    window.open(
                        '/nav_to.do?uri=' +
                            encodeURIComponent(($scope.recordTable || 'sp_widget') + '.do?sys_id=' + SYS_ID),
                        '_blank'
                    );
                    $scope.openDropdown = null;
                };

                $scope.cloneWidget = function () {
                    if ($scope.isNewWidget) {
                        return;
                    }
                    $scope.openDropdown = null;
                    ajax('cloneWidget', { sys_id: SYS_ID }).then(function (data) {
                        if (!data.success) {
                            $scope.saveError = data.error || 'Clone failed';
                            return;
                        }
                        window.location.href = buildWidgetEditorUrl(data.sys_id);
                    });
                };

                $scope.switchToWidgetScope = function () {
                    var scopeId = $scope.widget.application_sys_id;
                    $http({
                        method: 'PUT',
                        url: '/api/now/ui/concoursepicker/application',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-UserToken': window.g_ck || '',
                        },
                        data: { app_id: scopeId },
                    }).then(
                        function () {
                            window.location.reload();
                        },
                        function () {
                            $scope.saveError = 'Scope switch failed.';
                        }
                    );
                };

                $scope.openExtraPaneInEditor = function (item) {
                    if (!item.sys_id) return;
                    var table =
                        item.recordType === 'template'
                            ? 'sp_ng_template'
                            : item.recordType === 'script_include'
                              ? 'sys_script_include'
                              : 'sp_angular_provider';
                    $window.open(buildWidgetEditorUrl(item.sys_id, table), '_blank', 'noopener,noreferrer');
                };

                $scope.openScriptDebugger = function () {
                    window.top.launchScriptDebugger();
                };

                $scope.formatDocument = function (item) {
                    var edWrapper = monacoEditors[item.key];
                    if (!edWrapper || !edWrapper.format) {
                        return;
                    }
                    edWrapper.format($scope.userPrefs.formatTabsToSpaces);
                };

                // Detects available monospace fonts via a canvas width-measurement trick.
                function _getAvailableMonospaceFonts() {
                    var ua = navigator.userAgent.toLowerCase();
                    var os = 'unknown';
                    if (ua.indexOf('win') !== -1) {
                        os = 'windows';
                    } else if (ua.indexOf('mac') !== -1) {
                        os = 'macos';
                    } else if (ua.indexOf('linux') !== -1) {
                        os = 'linux';
                    }

                    var fontStacks = {
                        windows: [
                            'Consolas',
                            'Cascadia Mono',
                            'Cascadia Code',
                            'Lucida Console',
                            'Courier New',
                            'Fixedsys',
                        ],
                        macos: ['SF Mono', 'Menlo', 'Monaco', 'Andale Mono', 'Courier'],
                        linux: ['Ubuntu Mono', 'Liberation Mono', 'DejaVu Sans Mono', 'Hack', 'Fira Mono', 'FreeMono'],
                        unknown: ['Consolas', 'Menlo', 'Monaco', 'Courier New'],
                    };

                    var fontsToTest = fontStacks[os];
                    var canvas = document.createElement('canvas');
                    var ctx = canvas.getContext('2d');
                    var testString = 'mmmmmmmmmmllllliiii';
                    var baseSize = '72px';

                    ctx.font = baseSize + ' sans-serif';
                    var baselineWidth = ctx.measureText(testString).width;

                    var available = fontsToTest.filter(function (font) {
                        ctx.font = baseSize + ' "' + font + '", sans-serif';
                        return ctx.measureText(testString).width !== baselineWidth;
                    });

                    if (available.indexOf('monospace') === -1) {
                        available.push('monospace');
                    }
                    return available;
                }

                // Build a CSS font-family string for Monaco with appropriate fallbacks.
                function _buildFontFamily(name) {
                    if (!name) {
                        return 'Menlo, Monaco, "Courier New", monospace';
                    }
                    return '"' + name + '", "Courier New", monospace';
                }

                var _GOOGLE_FONTS = ['Fira Code', 'JetBrains Mono', 'Source Code Pro', 'Roboto Mono', 'IBM Plex Mono'];
                var _googleFontsLoaded = false;

                function _loadGoogleFonts() {
                    if (_googleFontsLoaded) {
                        return;
                    }
                    _googleFontsLoaded = true;
                    var link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href =
                        'https://fonts.googleapis.com/css2?family=Fira+Code&family=JetBrains+Mono&family=Source+Code+Pro&family=Roboto+Mono&family=IBM+Plex+Mono&display=swap';
                    document.head.appendChild(link);
                }

                $scope.openUserPrefsModal = function () {
                    _loadGoogleFonts();
                    var _savedOrder = $scope.userPrefs.editorOrder;
                    var _savedVis = $scope.userPrefs.editorVisibility;
                    var _editorKeys = _savedOrder.length
                        ? _savedOrder.concat(
                              $scope.coreEditorDefs
                                  .map(function (d) {
                                      return d.key;
                                  })
                                  .filter(function (k) {
                                      return _savedOrder.indexOf(k) === -1;
                                  })
                          )
                        : $scope.coreEditorDefs.map(function (d) {
                              return d.key;
                          });
                    $scope.userPrefsEdit = {
                        editors: _editorKeys.map(function (key) {
                            var def = $scope.coreEditorDefs.filter(function (d) {
                                return d.key === key;
                            })[0];
                            return {
                                key: key,
                                label: def ? def.label : key,
                                visible: _savedVis.hasOwnProperty(key) ? _savedVis[key] : def ? def.visible : true,
                            };
                        }),
                        formatTabsToSpaces: $scope.userPrefs.formatTabsToSpaces,
                        wordWrap: $scope.userPrefs.wordWrap,
                        editorTheme: $scope.userPrefs.editorTheme,
                        minimap: $scope.userPrefs.minimap,
                        alwaysShowLink: $scope.userPrefs.alwaysShowLink,
                        realtimeWidgetUpdates: $scope.userPrefs.realtimeWidgetUpdates,
                        autoIndent: $scope.userPrefs.autoIndent,
                        formatOnPaste: $scope.userPrefs.formatOnPaste,
                        formatOnType: $scope.userPrefs.formatOnType,
                        fontSize: $scope.userPrefs.fontSize,
                        fontFamily: $scope.userPrefs.fontFamily,
                        languageHelpers: $scope.userPrefs.languageHelpers,
                        showUnusedVars: $scope.userPrefs.showUnusedVars,
                        stickyScroll: $scope.userPrefs.stickyScroll,
                        htmlValidation: $scope.userPrefs.htmlValidation,
                        htmlAutoCloseTags: $scope.userPrefs.htmlAutoCloseTags,
                        autoSurround: $scope.userPrefs.autoSurround,
                        autoClosingBrackets: $scope.userPrefs.autoClosingBrackets,
                        autoClosingQuotes: $scope.userPrefs.autoClosingQuotes,
                        linkedEditing: $scope.userPrefs.linkedEditing,
                        insertSpaceBeforeFuncParen: $scope.userPrefs.insertSpaceBeforeFuncParen,
                        tabSize: $scope.userPrefs.tabSize,
                        remBase: $scope.userPrefs.remBase,
                        autosaveInterval: $scope.userPrefs.autosaveInterval,
                        draftRetentionDays: $scope.userPrefs.draftRetentionDays,
                        ctrlSSaveActiveOnly: $scope.userPrefs.ctrlSSaveActiveOnly,
                        flashOnEditorOpen: $scope.userPrefs.flashOnEditorOpen,
                        showOpenInVsCode: $scope.userPrefs.showOpenInVsCode !== false,
                        showRecentlyOpenedWidgets: $scope.userPrefs.showRecentlyOpenedWidgets !== false,
                        showOpenHistory: $scope.userPrefs.showOpenHistory !== false,
                        showAssistantButton: $scope.userPrefs.showAssistantButton,
                        contextMenuMode: $scope.userPrefs.contextMenuMode || 'enhanced',
                        htmlClassPortalSysId: $scope.userPrefs.htmlClassPortalSysId || '',
                        htmlClassIncludeStandardCss: !!$scope.userPrefs.htmlClassIncludeStandardCss,
                        availableFonts: _getAvailableMonospaceFonts(),
                        googleFonts: _GOOGLE_FONTS,
                    };
                    _loadClassPortals();
                    $scope.importPrefsStatus = null;
                    $scope.showUserPrefsModal = true;
                    $scope.openDropdown = null;
                };

                // Lazily loads portals for the "CSS theme" preference dropdown.
                function _loadClassPortals() {
                    if ($scope.classPortals !== null) {
                        return;
                    }
                    $scope.classPortals = [];
                    ajax('getPortalsForClassIndex', {}).then(function (res) {
                        if (res && res.success && res.portals) {
                            $scope.classPortals = res.portals;
                        }
                    });
                }

                $scope.saveUserPrefsModal = function () {
                    if (
                        !_validAutosaveInterval($scope.userPrefsEdit.autosaveInterval) ||
                        !_validDraftRetentionDays($scope.userPrefsEdit.draftRetentionDays)
                    ) {
                        return;
                    }
                    $scope.userPrefs.autosaveInterval = $scope.userPrefsEdit.autosaveInterval;
                    $scope.userPrefs.draftRetentionDays = $scope.userPrefsEdit.draftRetentionDays;
                    _draftRetentionLoaded = true;
                    _findLocalDrafts();
                    // Apply order and visibility from modal back to coreEditorDefs
                    if ($scope.isWidgetRecord !== false) {
                        var orderedDefs = [];
                        $scope.userPrefsEdit.editors.forEach(function (e) {
                            for (var i = 0; i < $scope.coreEditorDefs.length; i++) {
                                if ($scope.coreEditorDefs[i].key === e.key) {
                                    $scope.coreEditorDefs[i].visible = e.visible;
                                    orderedDefs.push($scope.coreEditorDefs[i]);
                                    break;
                                }
                            }
                        });
                        $scope.coreEditorDefs.length = 0;
                        orderedDefs.forEach(function (d) {
                            $scope.coreEditorDefs.push(d);
                        });
                    }
                    $scope.userPrefs.formatTabsToSpaces = $scope.userPrefsEdit.formatTabsToSpaces;
                    $scope.userPrefs.wordWrap = $scope.userPrefsEdit.wordWrap;
                    $scope.userPrefs.editorTheme = $scope.userPrefsEdit.editorTheme;
                    $scope.userPrefs.minimap = $scope.userPrefsEdit.minimap;
                    if ($scope.isWidgetRecord !== false)
                        $scope.userPrefs.alwaysShowLink = $scope.userPrefsEdit.alwaysShowLink;
                    $scope.userPrefs.realtimeWidgetUpdates = $scope.userPrefsEdit.realtimeWidgetUpdates;
                    $scope.userPrefs.autoIndent = $scope.userPrefsEdit.autoIndent;
                    $scope.userPrefs.formatOnPaste = $scope.userPrefsEdit.formatOnPaste;
                    $scope.userPrefs.formatOnType = $scope.userPrefsEdit.formatOnType;
                    $scope.userPrefs.fontSize = $scope.userPrefsEdit.fontSize;
                    $scope.userPrefs.fontFamily = $scope.userPrefsEdit.fontFamily || '';
                    $scope.userPrefs.languageHelpers = $scope.userPrefsEdit.languageHelpers;
                    $scope.userPrefs.showUnusedVars = !!$scope.userPrefsEdit.showUnusedVars;
                    $scope.userPrefs.stickyScroll = !!$scope.userPrefsEdit.stickyScroll;
                    $scope.userPrefs.htmlValidation = !!$scope.userPrefsEdit.htmlValidation;
                    $scope.userPrefs.htmlAutoCloseTags = !!$scope.userPrefsEdit.htmlAutoCloseTags;
                    $scope.userPrefs.autoSurround = $scope.userPrefsEdit.autoSurround;
                    $scope.userPrefs.autoClosingBrackets = $scope.userPrefsEdit.autoClosingBrackets;
                    $scope.userPrefs.autoClosingQuotes = $scope.userPrefsEdit.autoClosingQuotes;
                    $scope.userPrefs.linkedEditing = !!$scope.userPrefsEdit.linkedEditing;
                    $scope.userPrefs.insertSpaceBeforeFuncParen = !!$scope.userPrefsEdit.insertSpaceBeforeFuncParen;
                    $scope.userPrefs.ctrlSSaveActiveOnly = !!$scope.userPrefsEdit.ctrlSSaveActiveOnly;
                    $scope.userPrefs.flashOnEditorOpen = !!$scope.userPrefsEdit.flashOnEditorOpen;
                    $scope.userPrefs.showOpenInVsCode = !!$scope.userPrefsEdit.showOpenInVsCode;
                    $scope.userPrefs.showRecentlyOpenedWidgets =
                        $scope.userPrefsEdit.showRecentlyOpenedWidgets !== false;
                    $scope.userPrefs.showOpenHistory = $scope.userPrefsEdit.showOpenHistory !== false;
                    $scope.userPrefs.showAssistantButton = !!$scope.userPrefsEdit.showAssistantButton;
                    $scope.userPrefs.contextMenuMode = $scope.userPrefsEdit.contextMenuMode || 'enhanced';
                    var _selectedClassPortal = ($scope.classPortals || []).filter(function (p) {
                        return p.sys_id === $scope.userPrefsEdit.htmlClassPortalSysId;
                    })[0];
                    $scope.userPrefs.htmlClassPortalSysId = _selectedClassPortal ? _selectedClassPortal.sys_id : '';
                    $scope.userPrefs.htmlClassPortalUrlSuffix = _selectedClassPortal
                        ? _selectedClassPortal.url_suffix
                        : '';
                    $scope.userPrefs.htmlClassThemeSysId = _selectedClassPortal ? _selectedClassPortal.themeSysId : '';
                    $scope.userPrefs.htmlClassIncludeStandardCss = !!$scope.userPrefsEdit.htmlClassIncludeStandardCss;
                    var ts = parseInt($scope.userPrefsEdit.tabSize, 10);
                    if (ts >= 1 && ts <= 8) {
                        $scope.userPrefs.tabSize = ts;
                    }
                    var rb = parseFloat($scope.userPrefsEdit.remBase);
                    if (rb > 0) {
                        $scope.userPrefs.remBase = rb;
                    }
                    var wrapVal = $scope.userPrefs.wordWrap ? 'on' : 'off';
                    var minimapVal = { enabled: !!$scope.userPrefs.minimap };
                    var autoIndentVal = $scope.userPrefs.autoIndent ? 'full' : 'none';
                    var formatOnPasteVal = !!$scope.userPrefs.formatOnPaste;
                    var formatOnTypeVal = !!$scope.userPrefs.formatOnType;
                    var fontSizeVal = $scope.userPrefs.fontSize;
                    var fontFamilyVal = _buildFontFamily($scope.userPrefs.fontFamily);
                    var langHelpersEnabled = !!$scope.userPrefs.languageHelpers;
                    if (window.SNMonacoPlus && SNMonacoPlus.setUnusedVarsEnabled) {
                        SNMonacoPlus.setUnusedVarsEnabled($scope.userPrefs.showUnusedVars);
                    }
                    var stickyScrollVal = {
                        enabled: !!$scope.userPrefs.stickyScroll,
                    };
                    var tabSizeVal = $scope.userPrefs.tabSize;
                    var autoSurroundVal = $scope.userPrefs.autoSurround;
                    var autoClosingBracketsVal = $scope.userPrefs.autoClosingBrackets;
                    var autoClosingQuotesVal = $scope.userPrefs.autoClosingQuotes;
                    var linkedEditingVal = !!$scope.userPrefs.linkedEditing;
                    Object.keys(monacoEditors).forEach(function (k) {
                        monacoEditors[k].updateOptions({
                            wordWrap: wrapVal,
                            minimap: minimapVal,
                            autoIndent: autoIndentVal,
                            formatOnPaste: formatOnPasteVal,
                            formatOnType: formatOnTypeVal,
                            autoSurround: autoSurroundVal,
                            autoClosingBrackets: autoClosingBracketsVal,
                            autoClosingQuotes: autoClosingQuotesVal,
                            linkedEditing: linkedEditingVal,
                            fontSize: fontSizeVal,
                            fontFamily: fontFamilyVal,
                            hover: { enabled: langHelpersEnabled },
                            parameterHints: { enabled: langHelpersEnabled },
                            stickyScroll: stickyScrollVal,
                            tabSize: tabSizeVal,
                            insertSpaces: !!$scope.userPrefs.formatTabsToSpaces,
                        });
                    });
                    if (window.monaco) {
                        monaco.editor.setTheme(_resolveMonacoTheme());
                    }
                    _applyJsFormatOptions();
                    if (window.MONACO_LANGUAGE_HTML) {
                        if (MONACO_LANGUAGE_HTML.setValidationEnabled) {
                            MONACO_LANGUAGE_HTML.setValidationEnabled($scope.userPrefs.htmlValidation);
                        }
                        if (MONACO_LANGUAGE_HTML.setAutoCloseTagsEnabled) {
                            MONACO_LANGUAGE_HTML.setAutoCloseTagsEnabled($scope.userPrefs.htmlAutoCloseTags);
                        }
                    }
                    $scope.onEditorVisibilityChange();
                    // Editor layout is only committed as the new default here, since this
                    // is the one place the user explicitly chose to change it.
                    _snapshotEditorPrefs();
                    if ($scope.userPrefsEdit.widgetEditorLayout)
                        $scope.widgetEditorLayout = $scope.userPrefsEdit.widgetEditorLayout;
                    if ($scope.userPrefsEdit.recentRecords) {
                        $scope.userPrefs.recentRecords = $scope.userPrefsEdit.recentRecords;
                        _refreshRecentWidgetsResolved();
                    }
                    // Only an import overrides Credit choices saved from its own page.
                    saveUserPrefs($scope.userPrefsEdit.credit ? { credit: $scope.userPrefsEdit.credit } : undefined);
                    if ($scope.userPrefsEdit.debugMenu) {
                        var debugMenuPrefs = $scope.userPrefsEdit.debugMenu;
                        ajax('saveDebugMenuPrefs', {
                            value: JSON.stringify(debugMenuPrefs),
                        }).then(function (d) {
                            if (d && d.success && d.real_user_id) {
                                try {
                                    var json = JSON.stringify(debugMenuPrefs);
                                    localStorage.setItem('we_debug_menu_prefs_' + d.real_user_id, json);
                                    localStorage.setItem('we_debug_menu_prefs', json);
                                } catch (e) {}
                            }
                        });
                        $scope.userPrefsEdit.debugMenu = undefined;
                    }
                    if ($scope.userPrefsEdit.favouriteGroups) {
                        var importedGroups = $scope.userPrefsEdit.favouriteGroups;
                        $scope.userPrefsEdit.favouriteGroups = undefined;
                        var allRecords = [];
                        importedGroups.forEach(function (g) {
                            ((g && g.records) || []).forEach(function (r) {
                                if (r && r.table && r.sys_id)
                                    allRecords.push({
                                        table: r.table,
                                        sys_id: r.sys_id,
                                    });
                            });
                        });
                        var validated = allRecords.length
                            ? _assistantAjax('validateRecordsExist', {
                                  records: JSON.stringify(allRecords),
                              })
                            : $q.resolve({ success: true, records: [] });
                        // _assistantAjax always resolves (even on failure, with {success:false}) — every
                        // step's success flag has to be checked explicitly, and the modal stays open with
                        // an error instead of closing as though the import had actually been saved.
                        validated
                            .then(function (v) {
                                if (!v || !v.success) {
                                    return $q.reject('Could not validate the imported records.');
                                }
                                var validKeys = {};
                                (v.records || []).forEach(function (r) {
                                    validKeys[r.table + ':' + r.sys_id] = true;
                                });
                                return _assistantAjax('getFavouriteGroups', {}).then(function (existingRes) {
                                    if (!existingRes || !existingRes.success) {
                                        return $q.reject('Could not load your existing favourite groups.');
                                    }
                                    var existingGroups = Array.isArray(existingRes.groups) ? existingRes.groups : [];
                                    var now = new Date().toISOString();
                                    // A group with no valid records left after validation is never
                                    // imported; an existing group with the same name is overwritten.
                                    importedGroups.forEach(function (g) {
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
                                        var normalized = _normalizeGroupName(name);
                                        var existing = existingGroups.filter(function (eg) {
                                            return _normalizeGroupName(eg.name) === normalized;
                                        })[0];
                                        if (existing) {
                                            existing.records = validRecords;
                                            existing.updated = now;
                                        } else {
                                            existingGroups.push({
                                                id:
                                                    'fav_' +
                                                    Date.now().toString(36) +
                                                    Math.random().toString(36).slice(2, 8),
                                                name: name,
                                                records: validRecords,
                                                created: g.created || now,
                                                updated: now,
                                            });
                                        }
                                    });
                                    return _assistantAjax('saveFavouriteGroups', {
                                        groups: JSON.stringify(existingGroups),
                                    });
                                });
                            })
                            .then(
                                function (saveRes) {
                                    if (!saveRes || !saveRes.success) {
                                        return $q.reject('The server rejected the save.');
                                    }
                                    _closeModal(function () {
                                        $scope.showUserPrefsModal = false;
                                    });
                                },
                                function (reason) {
                                    $scope.importPrefsStatus = {
                                        type: 'error',
                                        text:
                                            'Your other preferences were saved, but importing favourite groups failed: ' +
                                            (reason || 'unknown error') +
                                            ' Try importing again.',
                                    };
                                }
                            );
                        return;
                    }
                    _closeModal(function () {
                        $scope.showUserPrefsModal = false;
                    });
                };

                $scope.cancelUserPrefsModal = function () {
                    _closeModal(function () {
                        $scope.showUserPrefsModal = false;
                    });
                };

                $scope.resetUserPrefsModal = function () {
                    if ($scope.isWidgetRecord !== false) {
                        var defaultOrder = ['template', 'css', 'client_script', 'link', 'script'];
                        var defaultVisible = {
                            template: true,
                            css: true,
                            client_script: true,
                            link: false,
                            script: true,
                        };
                        var sorted = [];
                        defaultOrder.forEach(function (key) {
                            for (var i = 0; i < $scope.userPrefsEdit.editors.length; i++) {
                                if ($scope.userPrefsEdit.editors[i].key === key) {
                                    var e = $scope.userPrefsEdit.editors[i];
                                    e.visible = !!defaultVisible[key];
                                    sorted.push(e);
                                    break;
                                }
                            }
                        });
                        $scope.userPrefsEdit.editors = sorted;
                    }
                    $scope.userPrefsEdit.formatTabsToSpaces = true;
                    $scope.userPrefsEdit.wordWrap = true;
                    $scope.userPrefsEdit.editorTheme = 'auto';
                    $scope.userPrefsEdit.minimap = false;
                    if ($scope.isWidgetRecord !== false) $scope.userPrefsEdit.alwaysShowLink = true;
                    $scope.userPrefsEdit.realtimeWidgetUpdates = false;
                    $scope.userPrefsEdit.autoIndent = true;
                    $scope.userPrefsEdit.formatOnPaste = true;
                    $scope.userPrefsEdit.formatOnType = true;
                    $scope.userPrefsEdit.fontSize = 13;
                    $scope.userPrefsEdit.fontFamily = '';
                    $scope.userPrefsEdit.languageHelpers = true;
                    $scope.userPrefsEdit.showUnusedVars = true;
                    $scope.userPrefsEdit.remBase = 16;
                    $scope.userPrefsEdit.stickyScroll = true;
                    $scope.userPrefsEdit.htmlValidation = true;
                    $scope.userPrefsEdit.htmlAutoCloseTags = true;
                    $scope.userPrefsEdit.autoSurround = 'languageDefined';
                    $scope.userPrefsEdit.autoClosingBrackets = 'languageDefined';
                    $scope.userPrefsEdit.autoClosingQuotes = 'languageDefined';
                    $scope.userPrefsEdit.linkedEditing = true;
                    $scope.userPrefsEdit.insertSpaceBeforeFuncParen = false;
                    $scope.userPrefsEdit.tabSize = 4;
                    $scope.userPrefsEdit.autosaveInterval = 30;
                    $scope.userPrefsEdit.draftRetentionDays = 7;
                    $scope.userPrefsEdit.ctrlSSaveActiveOnly = true;
                    $scope.userPrefsEdit.flashOnEditorOpen = !window.matchMedia('(prefers-reduced-motion: reduce)')
                        .matches;
                    $scope.userPrefsEdit.showOpenInVsCode = true;
                    $scope.userPrefsEdit.showRecentlyOpenedWidgets = true;
                    $scope.userPrefsEdit.showOpenHistory = true;
                    $scope.userPrefsEdit.showAssistantButton = false;
                };

                $scope.importPrefsStatus = null;

                function _downloadUserPrefsBlob(prefs) {
                    var blob = new Blob([JSON.stringify(prefs, null, 2)], {
                        type: 'application/json',
                    });
                    var url = URL.createObjectURL(blob);
                    var now = new Date();
                    var pad = function (n) {
                        return n < 10 ? '0' + n : '' + n;
                    };
                    var stamp =
                        now.getFullYear() +
                        '-' +
                        pad(now.getMonth() + 1) +
                        '-' +
                        pad(now.getDate()) +
                        '_' +
                        pad(now.getHours()) +
                        '-' +
                        pad(now.getMinutes()) +
                        '-' +
                        pad(now.getSeconds());
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = 'widget-editor-prefs-' + stamp + '.json';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }

                $scope.exportUserPrefs = function () {
                    $q.all([
                        ajax('getDebugMenuPrefs', {}),
                        _assistantAjax('getFavouriteGroups', {}),
                        ajax('getUserPrefs', {}),
                    ]).then(function (results) {
                        var d = results[0];
                        var f = results[1];
                        var prefs = _buildUserPrefsBlob();
                        if (results[2] && results[2].success && results[2].value) {
                            try {
                                var credit = JSON.parse(results[2].value).credit;
                                if (credit) prefs.credit = credit;
                            } catch (e) {}
                        }
                        if (d && d.success && d.value) {
                            try {
                                prefs.debugMenu = JSON.parse(d.value);
                            } catch (e) {}
                        }
                        if (f && f.success && Array.isArray(f.groups)) {
                            prefs.favouriteGroups = f.groups;
                        }
                        _downloadUserPrefsBlob(prefs);
                    });
                };

                $scope.triggerImportUserPrefs = function () {
                    document.getElementById('we-import-prefs-input').click();
                };

                function _applyPrefsBlobToEdit(p) {
                    var layout = $scope.isWidgetRecord === false ? {} : p;
                    if ($scope.isWidgetRecord === false) {
                        var widgetLayout = angular.copy($scope.widgetEditorLayout || {});
                        ['template', 'css', 'client_script', 'script', 'link', 'order'].forEach(function (key) {
                            if (p[key] !== undefined) widgetLayout[key] = angular.copy(p[key]);
                        });
                        $scope.userPrefsEdit.widgetEditorLayout = widgetLayout;
                    }
                    if (Array.isArray(p.recentRecords))
                        $scope.userPrefsEdit.recentRecords = p.recentRecords
                            .filter(function (entry) {
                                return entry && typeof entry.table === 'string' && /^[a-f0-9]{32}$/i.test(entry.sys_id);
                            })
                            .slice(0, 10);
                    if (layout.order && Array.isArray(layout.order)) {
                        var orderedKeys = layout.order
                            .filter(function (key) {
                                return $scope.coreEditorDefs.some(function (def) {
                                    return def.key === key;
                                });
                            })
                            .concat(
                                $scope.coreEditorDefs
                                    .map(function (d) {
                                        return d.key;
                                    })
                                    .filter(function (k) {
                                        return layout.order.indexOf(k) === -1;
                                    })
                            );
                        $scope.userPrefsEdit.editors = orderedKeys.map(function (key) {
                            var existing = $scope.userPrefsEdit.editors.filter(function (e) {
                                return e.key === key;
                            })[0];
                            var def = $scope.coreEditorDefs.filter(function (d) {
                                return d.key === key;
                            })[0];
                            return {
                                key: key,
                                label: def ? def.label : key,
                                visible: layout.hasOwnProperty(key)
                                    ? !!layout[key]
                                    : existing
                                      ? existing.visible
                                      : def
                                        ? def.visible
                                        : true,
                            };
                        });
                    } else {
                        $scope.userPrefsEdit.editors.forEach(function (e) {
                            if (layout.hasOwnProperty(e.key)) {
                                e.visible = !!layout[e.key];
                            }
                        });
                    }
                    [
                        'formatTabsToSpaces',
                        'wordWrap',
                        'editorTheme',
                        'minimap',
                        'alwaysShowLink',
                        'realtimeWidgetUpdates',
                        'autoIndent',
                        'formatOnPaste',
                        'formatOnType',
                        'fontFamily',
                        'languageHelpers',
                        'showUnusedVars',
                        'stickyScroll',
                        'htmlValidation',
                        'htmlAutoCloseTags',
                        'autoSurround',
                        'autoClosingBrackets',
                        'autoClosingQuotes',
                        'linkedEditing',
                        'insertSpaceBeforeFuncParen',
                        'ctrlSSaveActiveOnly',
                        'flashOnEditorOpen',
                        'showOpenInVsCode',
                        'showRecentlyOpenedWidgets',
                        'showOpenHistory',
                        'showAssistantButton',
                    ].forEach(function (k) {
                        if (p.hasOwnProperty(k)) {
                            $scope.userPrefsEdit[k] = p[k];
                        }
                    });
                    if (p.contextMenuMode === 'standard' || p.contextMenuMode === 'off') {
                        $scope.userPrefsEdit.contextMenuMode = p.contextMenuMode;
                    } else if (p.hasOwnProperty('contextMenuMode')) {
                        $scope.userPrefsEdit.contextMenuMode = 'enhanced';
                    }
                    if (_validAutosaveInterval(p.autosaveInterval)) {
                        $scope.userPrefsEdit.autosaveInterval = p.autosaveInterval;
                    }
                    if (_validDraftRetentionDays(p.draftRetentionDays)) {
                        $scope.userPrefsEdit.draftRetentionDays = p.draftRetentionDays;
                    }
                    if (p.hasOwnProperty('fontSize')) {
                        var fs = parseInt(p.fontSize, 10);
                        if (fs >= 8 && fs <= 32) {
                            $scope.userPrefsEdit.fontSize = fs;
                        }
                    }
                    if (p.hasOwnProperty('tabSize')) {
                        var ts = parseInt(p.tabSize, 10);
                        if (ts >= 1 && ts <= 8) {
                            $scope.userPrefsEdit.tabSize = ts;
                        }
                    }
                    if (p.hasOwnProperty('remBase')) {
                        var rb = parseFloat(p.remBase);
                        if (rb > 0) {
                            $scope.userPrefsEdit.remBase = rb;
                        }
                    }
                    if (p.hasOwnProperty('recentWidgets') && Array.isArray(p.recentWidgets)) {
                        $scope.userPrefs.recentWidgets = p.recentWidgets;
                        _refreshRecentWidgetsResolved();
                    }
                    if (
                        p.credit &&
                        ['grouped', 'columns'].indexOf(p.credit.view) !== -1 &&
                        ['none', 'all', 'changes', 'eol'].indexOf(p.credit.whitespace) !== -1
                    ) {
                        $scope.userPrefsEdit.credit = { view: p.credit.view, whitespace: p.credit.whitespace };
                    }
                    // Staged for saveUserPrefsModal() to push to sys_user_preference on Save;
                    // not part of the widget editor's own preference blob.
                    if (p.hasOwnProperty('debugMenu') && p.debugMenu && typeof p.debugMenu === 'object') {
                        $scope.userPrefsEdit.debugMenu = p.debugMenu;
                    }
                    // Also staged for Save — validated and merged into the Assistant's own
                    // favourite groups (a separate sys_user_preference row) at that point.
                    if (p.hasOwnProperty('favouriteGroups') && Array.isArray(p.favouriteGroups)) {
                        $scope.userPrefsEdit.favouriteGroups = p.favouriteGroups;
                    }
                }

                $scope.importUserPrefsFile = function (file) {
                    $scope.importPrefsStatus = null;
                    var reader = new FileReader();
                    reader.onload = function () {
                        $scope.$apply(function () {
                            try {
                                var parsed = JSON.parse(reader.result);
                                if (!parsed || typeof parsed !== 'object') {
                                    throw new Error('File does not contain a preferences object.');
                                }
                                _applyPrefsBlobToEdit(parsed);
                                var importedExtras = [];
                                if ($scope.userPrefsEdit.credit) importedExtras.push('Credit preferences');
                                if ($scope.userPrefsEdit.debugMenu) importedExtras.push('debug menu preferences');
                                if ($scope.userPrefsEdit.favouriteGroups)
                                    importedExtras.push('Assistant favourite groups');
                                $scope.importPrefsStatus = {
                                    type: 'success',
                                    text: importedExtras.length
                                        ? 'Preferences loaded, including ' +
                                          importedExtras.join(' and ') +
                                          '. Click Save to apply.'
                                        : 'Preferences loaded. Click Save to apply.',
                                };
                            } catch (e) {
                                $scope.importPrefsStatus = {
                                    type: 'error',
                                    text: 'Import failed: ' + (e.message || String(e)),
                                };
                            }
                        });
                    };
                    reader.onerror = function () {
                        $scope.$apply(function () {
                            $scope.importPrefsStatus = {
                                type: 'error',
                                text: 'Could not read the selected file.',
                            };
                        });
                    };
                    reader.readAsText(file);
                };

                /* Trigger the modal leave animation, then invoke the close callback after it
                   completes. Guards against double-calls during the animation window. */
                function _closeModal(fn) {
                    if ($scope._modalClosing) {
                        return;
                    }
                    $scope._modalClosing = true;
                    $timeout(function () {
                        $scope._modalClosing = false;
                        fn();
                    }, 150);
                }

                // Open on Portal modal

                function _openOnPortalStorageKey() {
                    return 'we_open_portal_params_' + SYS_ID;
                }

                function _loadOpenOnPortalParamsFromStorage() {
                    try {
                        return JSON.parse(localStorage.getItem(_openOnPortalStorageKey()) || '{}');
                    } catch (e) {
                        return {};
                    }
                }

                $scope.saveOpenOnPortalParams = function () {
                    var obj = {};
                    $scope.openOnPortalParams.forEach(function (p) {
                        obj[p.name] = p.value;
                    });
                    try {
                        localStorage.setItem(_openOnPortalStorageKey(), JSON.stringify(obj));
                    } catch (e) {
                        /* localStorage unavailable/full — ignore */
                    }
                };

                $scope.resetOpenOnPortalParams = function () {
                    $scope.openOnPortalParams.forEach(function (p) {
                        p.value = '';
                    });
                    try {
                        localStorage.removeItem(_openOnPortalStorageKey());
                    } catch (e) {}
                };

                // Detects $sp.getParameter('name') calls from the live editor (falling back to saved script).
                function _detectSpGetParameters() {
                    var script =
                        (monacoEditors.script && monacoEditors.script.getValue()) ||
                        ($scope.widget && $scope.widget.script) ||
                        '';
                    var names = [];
                    var seen = {};
                    var re = /\$sp\.getParameter\(\s*['"]([^'"]+)['"]\s*\)/g;
                    var m;
                    while ((m = re.exec(script)) !== null) {
                        if (!seen[m[1]]) {
                            seen[m[1]] = true;
                            names.push(m[1]);
                        }
                    }
                    // sys_id/"id" always sorts first regardless of detection order; sys_id outranks id.
                    ['id', 'sys_id'].forEach(function (priorityName) {
                        var idx = names.indexOf(priorityName);
                        if (idx > 0) {
                            names.splice(idx, 1);
                            names.unshift(priorityName);
                        }
                    });

                    var stored = _loadOpenOnPortalParamsFromStorage();
                    return names.map(function (name) {
                        return { name: name, value: stored[name] || '' };
                    });
                }

                function _loadOpenOnPortalInstancesAndPortals() {
                    $scope.openOnPortalLoading = true;
                    $scope.openOnPortalError = null;

                    ajax('getOpenPageOptions', { sys_id: SYS_ID }).then(
                        function (data) {
                            $scope.openOnPortalLoading = false;
                            if (!data.success) {
                                $scope.openOnPortalError = data.error || 'Failed to load pages/portals';
                                return;
                            }
                            $scope.openOnPortalInstances = data.instances || [];
                            $scope.openOnPortalPortals = data.portals || [];
                            $scope.openOnPortalStep = $scope.openOnPortalInstances.length > 1 ? 'instance' : 'portal';
                        },
                        function () {
                            $scope.openOnPortalLoading = false;
                            $scope.openOnPortalError = 'Failed to load pages/portals';
                        }
                    );
                }

                $scope.openOnPortalModal = function () {
                    $scope.openDropdown = null;
                    $scope.openOnPortalLoading = false;
                    $scope.openOnPortalError = null;
                    $scope.openOnPortalInstances = [];
                    $scope.openOnPortalPortals = [];
                    $scope.openOnPortalSelectedPage = null;
                    $scope.openOnPortalParams = _detectSpGetParameters();
                    $scope.showOpenOnPortalModal = true;

                    if ($scope.openOnPortalParams.length) {
                        // Show the params step immediately (no network round-trip needed yet);
                        // instances/portals are fetched once the user clicks Next.
                        $scope.openOnPortalStep = 'params';
                    } else {
                        _loadOpenOnPortalInstancesAndPortals();
                    }
                };

                $scope.openOnPortalParamsNext = function () {
                    $scope.saveOpenOnPortalParams();
                    _loadOpenOnPortalInstancesAndPortals();
                };

                $scope.selectOpenOnPortalInstance = function (inst) {
                    $scope.openOnPortalSelectedPage = {
                        id: inst.pageId,
                        title: inst.pageTitle,
                    };
                    $scope.openOnPortalStep = 'portal';
                };

                $scope.openOnPortalCanGoBack = function () {
                    if ($scope.openOnPortalStep === 'instance') {
                        return !!$scope.openOnPortalParams.length;
                    }
                    if ($scope.openOnPortalStep === 'portal') {
                        return $scope.openOnPortalInstances.length > 1 || !!$scope.openOnPortalParams.length;
                    }
                    return false;
                };

                $scope.openOnPortalBack = function () {
                    if ($scope.openOnPortalStep === 'portal' && $scope.openOnPortalInstances.length > 1) {
                        $scope.openOnPortalSelectedPage = null;
                        $scope.openOnPortalStep = 'instance';
                    } else if ($scope.openOnPortalParams.length) {
                        $scope.openOnPortalStep = 'params';
                    }
                };

                $scope.selectOpenOnPortalPortal = function (portal) {
                    var page =
                        $scope.openOnPortalSelectedPage ||
                        ($scope.openOnPortalInstances.length === 1
                            ? {
                                  id: $scope.openOnPortalInstances[0].pageId,
                                  title: $scope.openOnPortalInstances[0].pageTitle,
                              }
                            : null);
                    if (page && page.id) {
                        var url = '/' + portal.url_suffix + '?id=' + encodeURIComponent(page.id);
                        $scope.openOnPortalParams.forEach(function (p) {
                            if (p.value) {
                                url += '&' + encodeURIComponent(p.name) + '=' + encodeURIComponent(p.value);
                            }
                        });
                        window.open(url, '_blank');
                    }
                    $scope.closeOpenOnPortalModal();
                };

                $scope.closeOpenOnPortalModal = function () {
                    _closeModal(function () {
                        $scope.showOpenOnPortalModal = false;
                        $scope.openOnPortalSelectedPage = null;
                    });
                };

                // Keyboard shortcuts modal

                $scope.openKeyboardShortcutsModal = function () {
                    $scope.openDropdown = null;
                    $scope.showKeyboardShortcutsModal = true;
                };

                $scope.closeKeyboardShortcutsModal = function () {
                    _closeModal(function () {
                        $scope.showKeyboardShortcutsModal = false;
                    });
                };

                $scope.openApiDocs = function () {
                    var build = _getSnVersion();
                    var url = build
                        ? 'https://www.servicenow.com/docs/r/' + build + '/api-reference'
                        : 'https://www.servicenow.com/docs/';
                    window.open(url, '_blank', 'noopener,noreferrer');
                    $scope.openDropdown = null;
                };

                // Option Schema modal

                $scope.openOptionSchemaModal = function () {
                    $scope.openDropdown = null;
                    $scope.optionSchemaLoading = true;
                    $scope.optionSchemaLoadError = null;
                    $scope.optionSchemaSaveError = null;
                    $scope.optionSchemaSaving = false;
                    $scope.showOptionSchemaModal = true;

                    ajax('getOptionSchema', {
                        sys_id: $scope.widget.sys_id,
                    }).then(function (data) {
                        if (!data.success) {
                            $scope.optionSchemaLoading = false;
                            $scope.optionSchemaLoadError = data.error || 'Failed to load option schema';
                            return;
                        }
                        $scope.optionSchemaLoading = false;
                        $timeout(function () {
                            var container = document.getElementById('option-schema-editor');
                            if (!container) {
                                return;
                            }
                            if (_optionSchemaEditor) {
                                try {
                                    _optionSchemaEditor.dispose();
                                } catch (e) {}
                                _optionSchemaEditor = null;
                            }
                            var raw = data.option_schema || '';
                            var value = raw;
                            try {
                                if (value.trim()) value = JSON.stringify(JSON.parse(value), null, 4);
                            } catch (e) {}
                            var pendingDraft = _draftJson.option_schema;
                            _draftJson.option_schema = {
                                base: value,
                                value: pendingDraft ? pendingDraft.value : value,
                            };
                            value = _draftJson.option_schema.value;
                            _ensureMonacoThemes();
                            _ensureWeJsonLanguage();
                            function _create() {
                                $scope.optionSchemaJsonInvalid = false;
                                _optionSchemaEditor = monaco.editor.create(container, {
                                    value: value,
                                    language: 'we-json',
                                    theme: _resolveMonacoTheme(),
                                    readOnly: !$scope.canWriteWidget,
                                    automaticLayout: true,
                                    fontSize: 12,
                                    scrollBeyondLastLine: false,
                                    minimap: { enabled: false },
                                    tabSize: 4,
                                    insertSpaces: true,
                                    wordWrap: $scope.userPrefs.wordWrap ? 'on' : 'off',
                                    fixedOverflowWidgets: true,
                                    mouseWheelZoom: true,
                                });
                                // Validate JSON manually on every content change
                                function _validateJson() {
                                    var content = _optionSchemaEditor.getValue();
                                    _draftJson.option_schema.value = content;
                                    var invalid = !!content.trim();
                                    if (invalid) {
                                        try {
                                            JSON.parse(content);
                                            invalid = false;
                                        } catch (e) {}
                                    }
                                    $scope.$apply(function () {
                                        $scope.optionSchemaJsonInvalid = invalid;
                                    });
                                }
                                _optionSchemaEditor.onDidChangeModelContent(_validateJson);
                                _validateJson(); // run immediately in case initial value is invalid
                            }
                            if (window.monaco && window.monaco.editor) {
                                _create();
                            } else {
                                require(['vs/editor/editor.main'], function () {
                                    _ensureMonacoThemes();
                                    _ensureWeJsonLanguage();
                                    _create();
                                });
                            }
                        }, 50);
                    });
                };

                $scope.saveOptionSchemaModal = function () {
                    if (!_optionSchemaEditor || !$scope.canWriteWidget || $scope.optionSchemaJsonInvalid) {
                        return;
                    }
                    $scope.optionSchemaSaving = true;
                    $scope.optionSchemaSaveError = null;
                    var newValue = _optionSchemaEditor.getValue();
                    ajax('saveOptionSchema', {
                        sys_id: $scope.widget.sys_id,
                        value: newValue,
                    }).then(function (data) {
                        $scope.optionSchemaSaving = false;
                        if (!data.success) {
                            $scope.optionSchemaSaveError = data.error || 'Save failed';
                            return;
                        }
                        $scope.widget.option_schema_has_value = _hasProperJsonObjectValue(newValue);
                        if (_draftJson.option_schema) {
                            _draftJson.option_schema.base = newValue;
                        }
                        _writeLocalDraft(true);
                        if (_optionSchemaEditor && _optionSchemaEditor.getValue() === newValue) {
                            $scope.closeOptionSchemaModal();
                        }
                    });
                };

                $scope.closeOptionSchemaModal = function () {
                    _closeModal(function () {
                        $scope.showOptionSchemaModal = false;
                        delete _draftJson.option_schema;
                        _writeLocalDraft(true);
                        if (_optionSchemaEditor) {
                            try {
                                _optionSchemaEditor.dispose();
                            } catch (e) {}
                            _optionSchemaEditor = null;
                        }
                    });
                };

                // True when a raw JSON string parses to an object with at least one property.
                function _hasProperJsonObjectValue(raw) {
                    if (!raw || !raw.trim()) {
                        return false;
                    }
                    try {
                        var parsed = JSON.parse(raw);
                        return (
                            !!parsed &&
                            typeof parsed === 'object' &&
                            !Array.isArray(parsed) &&
                            Object.keys(parsed).length > 0
                        );
                    } catch (e) {
                        return false;
                    }
                }

                // Demo Data modal

                $scope.openDemoDataModal = function () {
                    $scope.openDropdown = null;
                    $scope.demoDataLoading = true;
                    $scope.demoDataLoadError = null;
                    $scope.demoDataSaveError = null;
                    $scope.demoDataSaving = false;
                    $scope.showDemoDataModal = true;

                    ajax('getDemoData', {
                        sys_id: $scope.widget.sys_id,
                    }).then(function (data) {
                        if (!data.success) {
                            $scope.demoDataLoading = false;
                            $scope.demoDataLoadError = data.error || 'Failed to load demo data';
                            return;
                        }
                        $scope.demoDataLoading = false;
                        $timeout(function () {
                            var container = document.getElementById('demo-data-editor');
                            if (!container) {
                                return;
                            }
                            if (_demoDataEditor) {
                                try {
                                    _demoDataEditor.dispose();
                                } catch (e) {}
                                _demoDataEditor = null;
                            }
                            var raw = data.demo_data || '';
                            var value = raw;
                            try {
                                if (value.trim()) value = JSON.stringify(JSON.parse(value), null, 4);
                            } catch (e) {}
                            var pendingDraft = _draftJson.demo_data;
                            _draftJson.demo_data = {
                                base: value,
                                value: pendingDraft ? pendingDraft.value : value,
                            };
                            value = _draftJson.demo_data.value;
                            _ensureMonacoThemes();
                            _ensureWeJsonLanguage();
                            function _create() {
                                $scope.demoDataJsonInvalid = false;
                                _demoDataEditor = monaco.editor.create(container, {
                                    value: value,
                                    language: 'we-json',
                                    theme: _resolveMonacoTheme(),
                                    readOnly: !$scope.canWriteWidget,
                                    automaticLayout: true,
                                    fontSize: 12,
                                    scrollBeyondLastLine: false,
                                    minimap: { enabled: false },
                                    tabSize: 4,
                                    insertSpaces: true,
                                    wordWrap: $scope.userPrefs.wordWrap ? 'on' : 'off',
                                    fixedOverflowWidgets: true,
                                    mouseWheelZoom: true,
                                });
                                // Validate JSON manually on every content change
                                function _validateJson() {
                                    var content = _demoDataEditor.getValue();
                                    _draftJson.demo_data.value = content;
                                    var invalid = !!content.trim();
                                    if (invalid) {
                                        try {
                                            JSON.parse(content);
                                            invalid = false;
                                        } catch (e) {}
                                    }
                                    $scope.$apply(function () {
                                        $scope.demoDataJsonInvalid = invalid;
                                    });
                                }
                                _demoDataEditor.onDidChangeModelContent(_validateJson);
                                _validateJson(); // run immediately in case initial value is invalid
                            }
                            if (window.monaco && window.monaco.editor) {
                                _create();
                            } else {
                                require(['vs/editor/editor.main'], function () {
                                    _ensureMonacoThemes();
                                    _ensureWeJsonLanguage();
                                    _create();
                                });
                            }
                        }, 50);
                    });
                };

                $scope.saveDemoDataModal = function () {
                    if (!_demoDataEditor || !$scope.canWriteWidget || $scope.demoDataJsonInvalid) {
                        return;
                    }
                    $scope.demoDataSaving = true;
                    $scope.demoDataSaveError = null;
                    var newValue = _demoDataEditor.getValue();
                    ajax('saveDemoData', {
                        sys_id: $scope.widget.sys_id,
                        value: newValue,
                    }).then(function (data) {
                        $scope.demoDataSaving = false;
                        if (!data.success) {
                            $scope.demoDataSaveError = data.error || 'Save failed';
                            return;
                        }
                        $scope.widget.demo_data_has_value = _hasProperJsonObjectValue(newValue);
                        if (_draftJson.demo_data) {
                            _draftJson.demo_data.base = newValue;
                        }
                        _writeLocalDraft(true);
                        if (_demoDataEditor && _demoDataEditor.getValue() === newValue) {
                            $scope.closeDemoDataModal();
                        }
                    });
                };

                $scope.closeDemoDataModal = function () {
                    _closeModal(function () {
                        $scope.showDemoDataModal = false;
                        delete _draftJson.demo_data;
                        _writeLocalDraft(true);
                        if (_demoDataEditor) {
                            try {
                                _demoDataEditor.dispose();
                            } catch (e) {}
                            _demoDataEditor = null;
                        }
                    });
                };

                // XML modal

                $scope.copyWidgetUrl = function () {
                    $scope.openDropdown = null;
                    var url =
                        window.location.protocol +
                        '//' +
                        window.location.host +
                        '/nav_to.do?uri=' +
                        encodeURIComponent(buildWidgetEditorUrl(SYS_ID, RECORD_TABLE).substring(1));
                    navigator.clipboard.writeText(url);
                };

                $scope.openXmlModal = function () {
                    $scope.openDropdown = null;
                    $scope.showXmlModal = true;
                    $scope.xmlLoading = true;
                    $scope.xmlLoadError = null;
                    $scope.xmlExportUrl = null;

                    var xmlUrl = '/' + ($scope.recordTable || 'sp_widget') + '.do?UNL&sysparm_query=sys_id=' + SYS_ID;

                    $q.all([
                        $http.get(xmlUrl, {
                            headers: { 'X-UserToken': window.g_ck || '' },
                            transformResponse: function (d) {
                                return d;
                            },
                        }),
                        $scope.isWidgetRecord === false
                            ? $q.resolve({ success: false })
                            : ajax('getHistorySetId', { sys_id: SYS_ID }),
                    ]).then(
                        function (results) {
                            var xmlContent = typeof results[0].data === 'string' ? results[0].data : '';
                            var histRes = results[1];
                            if (histRes.success && histRes.history_set_id) {
                                $scope.xmlExportUrl =
                                    '/sys_history_set.do?UNL&sysparm_query=sys_id=' + histRes.history_set_id;
                            } else if (SYS_ID) {
                                $scope.xmlExportUrl = xmlUrl;
                            }
                            $scope.xmlLoading = false;
                            $timeout(function () {
                                var container = document.getElementById('xml-modal-editor');
                                if (!container) {
                                    return;
                                }
                                if (_xmlEditor) {
                                    try {
                                        _xmlEditor.dispose();
                                    } catch (e) {}
                                    _xmlEditor = null;
                                }
                                _ensureMonacoThemes();
                                function _create() {
                                    _xmlEditor = monaco.editor.create(container, {
                                        value: xmlContent,
                                        language: 'xml',
                                        theme: _resolveMonacoTheme(),
                                        readOnly: true,
                                        automaticLayout: true,
                                        fontSize: 12,
                                        scrollBeyondLastLine: false,
                                        minimap: { enabled: false },
                                        wordWrap: 'on',
                                        fixedOverflowWidgets: true,
                                    });
                                }
                                if (window.monaco && window.monaco.editor) {
                                    _create();
                                } else {
                                    require(['vs/editor/editor.main'], function () {
                                        _ensureMonacoThemes();
                                        _create();
                                    });
                                }
                            }, 50);
                        },
                        function () {
                            $scope.xmlLoading = false;
                            $scope.xmlLoadError = 'Failed to load XML';
                        }
                    );
                };

                $scope.closeXmlModal = function () {
                    _closeModal(function () {
                        $scope.showXmlModal = false;
                        if (_xmlEditor) {
                            try {
                                _xmlEditor.dispose();
                            } catch (e) {}
                            _xmlEditor = null;
                        }
                    });
                };

                var _bypassUnloadWarning = false;
                window.onbeforeunload = function () {
                    if (_bypassUnloadWarning) {
                        return undefined;
                    }
                    if (hasUnsavedChanges()) {
                        return 'You have unsaved changes. Leave page?';
                    }
                };

                // Window resize → re-layout editors
                window.addEventListener('resize', layoutAllEditors);

                // Below this width the save-state pill (Unsaved/Saved) moves into the
                // alert pill bar; at/above it, it sits to the left of the Save button.
                var _pillBarBreakpoint = window.matchMedia('(max-width: 1699.98px)');
                $scope.isNarrowLayout = _pillBarBreakpoint.matches;
                function _onPillBarBreakpointChange(e) {
                    $scope.isNarrowLayout = e.matches;
                    $scope.$applyAsync();
                }
                if (_pillBarBreakpoint.addEventListener) {
                    _pillBarBreakpoint.addEventListener('change', _onPillBarBreakpointChange);
                } else if (_pillBarBreakpoint.addListener) {
                    _pillBarBreakpoint.addListener(_onPillBarBreakpointChange);
                }

                // Boot
                init();
            },
        ]);
})();

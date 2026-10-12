function link(scope, element, attrs, controller) {
    'use strict';

    if (scope.data.hasAccess === false) {
        return;
    }

    const spUtil = $injector.get('spUtil');

    scope.$watch('c.showPreferencesModal', function (show) {
        if (show) {
            setTimeout(function () {
                const elNode = element[0] || element;
                const dialog = elNode.querySelector('.we-prefs-dialog');
                if (dialog && typeof dialog.showModal === 'function') {
                    dialog.showModal();
                }
            }, 50);
        }
    });

    ///////////////////////////////////////////
    // 1. Guard / singleton setup
    ///////////////////////////////////////////

    if (window._weDebugMenuPatch) {
        return;
    }
    window._weDebugMenuPatch = true;

    (function preloadIcons() {
        const el = document.createElement('div');
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
        el.innerHTML =
            '<i class="icon-cog"></i><i class="icon-cog-selected"></i><i class="icon-open-document-new-tab"></i>';
        document.body.appendChild(el);
    })();

    /**
     * Resolves a ServiceNow design-token CSS variable to a usable CSS color value.
     * Next Experience tokens are normally unitless "r, g, b" triplets meant to be
     * wrapped in rgb(), but some instances/themes define the same token as a hex
     * code instead — wrapping a hex code in rgb() produces an invalid color, which
     * silently drops the whole declaration. Reading the resolved value at runtime
     * and branching on its shape avoids that mismatch regardless of instance.
     *
     * @param {string[]} varNames  - CSS custom property names to try, in order.
     * @param {string} fallbackRgb - "r, g, b" triplet used if none of varNames resolve.
     * @returns {string} A valid CSS color value.
     */
    function resolveThemeColor(varNames, fallbackRgb) {
        const rootStyle = getComputedStyle(document.documentElement);
        for (const name of varNames) {
            const raw = rootStyle.getPropertyValue(name).trim();
            if (
                !raw ||
                raw === 'transparent' ||
                /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*0(?:\.0+)?\s*\)$/.test(raw)
            ) {
                continue;
            }
            if (/^\d+\s*,\s*\d+\s*,\s*\d+$/.test(raw)) {
                return 'rgb(' + raw + ')';
            }
            return raw;
        }
        return 'rgb(' + fallbackRgb + ')';
    }

    const COLOR_MENU_BG = resolveThemeColor(['--now-dropdown-list--background-color'], '255, 255, 255');
    const COLOR_TEXT_PRIMARY = resolveThemeColor(['--now-color_text--primary'], '58, 63, 81');
    const COLOR_TEXT_SECONDARY = resolveThemeColor(['--now-color_text--secondary'], '100, 116, 139');
    const COLOR_BORDER = resolveThemeColor(
        ['--now-tabs--border-color', '--now-color_border--secondary'],
        '222, 229, 231'
    );
    const COLOR_PRIMARY_ACCENT = resolveThemeColor(['--now-button--primary--background-color'], '66, 139, 202');
    const COLOR_BTN_PRIMARY_TEXT = resolveThemeColor(['--now-button--primary--color'], '255, 255, 255');
    const COLOR_ALERT_SUCCESS = resolveThemeColor(
        ['--now-alert--success--color', '--now-color_alert--low-3'],
        '40, 167, 69'
    );
    const COLOR_ALERT_WARNING = resolveThemeColor(
        ['--now-alert--warning--color', '--now-color_alert--warning-4'],
        '253, 126, 20'
    );
    const COLOR_ALERT_CRITICAL = resolveThemeColor(
        ['--now-alert--critical--color', '--now-color_alert--critical-3'],
        '220, 53, 69'
    );

    (function injectContextMenuStyles() {
        const style = document.createElement('style');
        style.setAttribute('data-we-context-menu', '1');
        style.textContent = [
            '.we-custom-menu, .we-custom-menu *, .we-custom-menu *::before, .we-custom-menu *::after { box-sizing: border-box !important; -webkit-tap-highlight-color: transparent !important; }',
            '.we-custom-menu { position: fixed; margin: 0; padding: 0; border: none; background: transparent; outline: none; overflow: visible; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 13px; z-index: 2147483647; }',
            '.we-custom-menu a, .we-custom-menu button, .we-custom-menu li, .we-custom-menu span { outline: none !important; outline-width: 0 !important; outline-style: none !important; outline-offset: 0 !important; box-shadow: none !important; -webkit-focus-ring-color: transparent !important; }',
            '.we-custom-menu a:focus, .we-custom-menu a:focus-visible, .we-custom-menu a:active, .we-custom-menu a:hover, .we-custom-menu button:focus, .we-custom-menu button:focus-visible, .we-custom-menu button:active, .we-custom-menu button:hover, .we-custom-menu li:focus, .we-custom-menu li:focus-visible, .we-custom-menu li:active, .we-custom-menu li:hover { outline: none !important; outline-width: 0 !important; outline-style: none !important; outline-offset: 0 !important; box-shadow: none !important; -webkit-focus-ring-color: transparent !important; text-decoration: none !important; }',
            '.we-menu-container { width: 285px; overflow: hidden; position: relative; background: ' +
                COLOR_MENU_BG +
                '; color: ' +
                COLOR_TEXT_PRIMARY +
                '; border-radius: 10px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08) !important; border: 1px solid ' +
                COLOR_BORDER +
                '; transition: height 0.22s cubic-bezier(0.25, 1, 0.5, 1); max-height: calc(100vh - 16px); }',
            '.we-slider-track { display: flex; transition: transform 0.22s cubic-bezier(0.25, 1, 0.5, 1); align-items: flex-start; }',
            '.we-panel { width: 285px; flex-shrink: 0; overflow-x: hidden; overscroll-behavior: none; scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.2) transparent; }',
            '.we-panel::-webkit-scrollbar { width: 4px; }',
            '.we-panel::-webkit-scrollbar-track { background: transparent; }',
            '.we-panel::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.2); border-radius: 4px; }',
            '.we-menu-list { list-style: none; padding: 0 0 4px 0; margin: 0; width: 100%; }',
            '.we-menu-divider { margin: 4px 0; border-top: 1px solid ' + COLOR_BORDER + '; }',
            '.we-menu-list > li { margin: 0; }',
            '.we-menu-list > li:not(.we-menu-header):not(.we-back-li) > a { display: flex; align-items: center; justify-content: flex-start; padding: 6px 14px !important; margin: 0 !important; border: none !important; line-height: 1.35; text-decoration: none !important; color: inherit; cursor: pointer; transition: background 0.1s ease; outline: none !important; }',
            '.we-menu-list > li:not(.we-menu-header):not(.we-back-li) > a:hover, .we-menu-list > li:not(.we-menu-header):not(.we-back-li) > a:focus, .we-menu-list > li:not(.we-menu-header):not(.we-back-li) > a:active { background-color: rgba(0,0,0,0.08) !important; text-decoration: none !important; border: none !important; padding: 6px 14px !important; margin: 0 !important; outline: none !important; }',
            '.we-menu-list > li:not(.we-menu-header):not(.we-back-li) > a:hover .we-row-icon, .we-menu-list > li:not(.we-menu-header):not(.we-back-li) > a:focus .we-row-icon, .we-menu-list > li:not(.we-menu-header):not(.we-back-li) > a:active .we-row-icon { color: ' +
                COLOR_PRIMARY_ACCENT +
                '; }',
            '.we-row-icon { width: 18px; min-width: 18px; text-align: center; margin-right: 8px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; }',
            '.we-row-icon--primary { color: ' + COLOR_PRIMARY_ACCENT + '; }',
            '.we-row-label { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }',
            '.we-row-badge { margin-left: auto; flex-shrink: 0; }',
            '.we-menu-list code { font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; padding: 1px 4px; border-radius: 3px; background: rgba(0,0,0,0.06); color: inherit; }',
            '.we-menu-header.bg-primary { min-height: 42px; box-sizing: border-box; padding: 9px 12px 9px 14px; font-weight: 600; display: flex; align-items: center; justify-content: space-between; border-radius: 0 !important; margin-bottom: 6px; background-color: ' +
                COLOR_PRIMARY_ACCENT +
                ' !important; color: ' +
                COLOR_BTN_PRIMARY_TEXT +
                ' !important; }',
            '.we-menu-header.bg-primary.we-back-header { padding: 0; cursor: pointer; }',
            '.we-menu-header.bg-primary .we-header-title { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: ' +
                COLOR_BTN_PRIMARY_TEXT +
                ' !important; display: flex; align-items: center; min-width: 0; flex: 1 1 auto; margin-right: 8px; }',
            '.we-menu-header.bg-primary .we-header-title-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }',
            '.we-menu-header.bg-primary .we-cog-btn { width: 24px; height: 24px; flex-shrink: 0; padding: 0 !important; margin: 0 !important; font-size: 16px; line-height: 1; border: none !important; background: none !important; cursor: pointer; color: rgba(255, 255, 255, 0.85); outline: none !important; box-shadow: none !important; display: inline-flex; align-items: center; justify-content: center; }',
            '.we-menu-header.bg-primary .we-cog-btn:hover, .we-menu-header.bg-primary .we-cog-btn:focus, .we-menu-header.bg-primary .we-cog-btn:active { color: ' +
                COLOR_BTN_PRIMARY_TEXT +
                ' !important; background-color: rgba(255, 255, 255, 0.2) !important; border-radius: 4px; outline: none !important; box-shadow: none !important; border: none !important; padding: 0 !important; margin: 0 !important; }',
            '.we-section-header { padding: 6px 14px 2px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ' +
                COLOR_TEXT_SECONDARY +
                '; display: flex; align-items: center; }',
            '.we-submenu-arrow { margin-left: auto; opacity: 0.6; font-size: 11px; flex-shrink: 0; padding-left: 6px; }',
            '.we-timing-bars { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-left: 6px; flex-shrink: 0; cursor: help; vertical-align: middle; }',
            '.we-timing-bars svg { display: block; overflow: visible; }',
            '.we-row-icon .we-timing-bars { width: 100%; height: 100%; margin-left: 0; }',
            '.we-timing-bars .we-tb-bar { fill: rgba(0, 0, 0, 0.16); }',
            '.we-menu-header .we-timing-bars .we-tb-bar { fill: rgba(255, 255, 255, 0.3); }',
            '.we-timing-bars--green .we-tb-bar-1 { fill: ' + COLOR_ALERT_SUCCESS + '; }',
            '.we-menu-header .we-timing-bars--green .we-tb-bar-1 { fill: #4ade80; }',
            '.we-timing-bars--orange .we-tb-bar-1, .we-timing-bars--orange .we-tb-bar-2 { fill: ' +
                COLOR_ALERT_WARNING +
                '; }',
            '.we-menu-header .we-timing-bars--orange .we-tb-bar-1, .we-menu-header .we-timing-bars--orange .we-tb-bar-2 { fill: #fbbf24; }',
            '.we-timing-bars--red .we-tb-bar-1, .we-timing-bars--red .we-tb-bar-2, .we-timing-bars--red .we-tb-bar-3 { fill: ' +
                COLOR_ALERT_CRITICAL +
                '; }',
            '.we-menu-header .we-timing-bars--red .we-tb-bar-1, .we-menu-header .we-timing-bars--red .we-tb-bar-2, .we-menu-header .we-timing-bars--red .we-tb-bar-3 { fill: #f87171; }',
            '.we-back-row { display: flex !important; align-items: center; justify-content: space-between; width: 100%; min-height: 42px; box-sizing: border-box; padding: 9px 12px 9px 14px !important; margin: 0 !important; border: none !important; font-weight: 600; color: ' +
                COLOR_BTN_PRIMARY_TEXT +
                ' !important; text-decoration: none !important; border-radius: 0 !important; background: transparent; transition: background 0.1s ease; outline: none !important; box-shadow: none !important; }',
            '.we-back-row:hover, .we-back-row:focus, .we-back-row:active { background-color: rgba(0, 0, 0, 0.2) !important; text-decoration: none !important; padding: 9px 12px 9px 14px !important; margin: 0 !important; border: none !important; outline: none !important; box-shadow: none !important; }',
            '.we-back-left { display: inline-flex; align-items: center; font-size: 13px; font-weight: 600; color: ' +
                COLOR_BTN_PRIMARY_TEXT +
                '; }',
            '.we-back-arrow { margin-right: 6px; font-size: 11px; }',
            '.we-back-title { margin-left: auto; font-size: 11px; color: rgba(255, 255, 255, 0.85); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
            '.we-tooltip { position: fixed; z-index: 10; max-width: 220px; padding: 6px 9px; border-radius: 6px; background: rgba(20, 20, 24, 0.95); color: #fff; font-size: 11px; line-height: 1.5; white-space: pre-line; pointer-events: none; opacity: 0; transform: translateY(2px); transition: opacity 0.08s ease, transform 0.08s ease; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25); }',
            '.we-tooltip--visible { opacity: 1; transform: translateY(0); }',
        ].join(' ');
        document.head.appendChild(style);
    })();

    ///////////////////////////////////////////
    // 2. Shared constants
    ///////////////////////////////////////////

    const SHOW_SCOPE_MENUS_KEY = 'showScopeMenus';
    const WIDGET_OBSERVER_DELAY = 1000; // ms – wait for Angular to finish linking
    const PROCESSING_TIMEOUT_MS = 500; // ms – abort slow scope serialisation
    const MAX_SCOPE_DEPTH = 5; // max recursion depth for removeFunctions / deepSearch
    const MAX_SCOPE_PROPS = 100; // max top-level scope properties collected
    const MAX_OBJ_PROPS = 50; // max properties serialised per nested object
    const MAX_ARRAY_ITEMS = 50; // max array items serialised
    const MAX_TREE_KEYS = 100; // max keys rendered in a single tree node
    const MAX_SEARCH_RESULTS = 100; // max deepSearch hits returned
    const STRING_PREVIEW_LENGTH = 50; // chars shown before "show more"
    const NESTED_COLORS = ['#28a745', '#dc3545', '#fd7e14', '#6f42c1', '#20c997'];
    const ROOT_BUTTON_COLOR = '#007bff';
    const MONOSPACE_FONTS =
        'ui-monospace,Menlo,Monaco,"Cascadia Mono","Segoe UI Mono","Roboto Mono","Oxygen Mono","Ubuntu Mono","Source Code Pro","Fira Mono","Droid Sans Mono","Consolas","Courier New",monospace';

    ///////////////////////////////////////////
    // 3. Utils — small leaf helpers with no dependencies on other modules
    ///////////////////////////////////////////

    const Utils = (function () {
        /**
         * Escapes a string for safe use inside a RegExp constructor.
         * @param   {string} string
         * @returns {string}
         */
        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        /**
         * Escapes a string so it can be safely inserted as HTML text content.
         * @param   {*}      text  Value to escape (coerced to string).
         * @returns {string}
         */
        function escapeHtml(text) {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        /** Assigns value to window[name] so it's available in DevTools; ignores non-writable-property failures. */
        function assignConsoleVar(name, value) {
            try {
                window[name] = value;
            } catch (_e) {
                /* non-writable property — skip */
            }
        }

        return { escapeRegExp, escapeHtml, assignConsoleVar };
    })();

    ///////////////////////////////////////////
    // 4. UrlHelpers — editor URL builders
    ///////////////////////////////////////////

    const UrlHelpers = (function () {
        /**
         * Returns the Widget Editor+ URL for the given widget sys_id.
         * Uses the current NOW.scope to build a scoped page ID where applicable.
         * @param   {string} sysId  Widget sys_id.
         * @returns {string}
         */
        function getEditorPlusUrl(sysId) {
            return '/ui_page.do?sys_id=8b2e70458373fe1070b8b5dfeeaad35e&widget_id=' + encodeURIComponent(sysId);
        }

        /**
         * Returns the Service Portal Widget Editor URL (/sp_config) for the given widget sys_id.
         * @param   {string} sysId  Widget sys_id.
         * @returns {string}
         */
        function getSPEditorUrl(sysId) {
            return '/sp_config?id=widget_editor&sys_id=' + encodeURIComponent(sysId);
        }

        /**
         * Returns the platform (classic UI) form URL for the given widget sys_id.
         * @param   {string} sysId  Widget sys_id.
         * @returns {string}
         */
        function getEditorPlatformUrl(sysId) {
            return '/nav_to.do?uri=sp_widget.do%3Fsys_id=' + encodeURIComponent(sysId);
        }

        /**
         * Returns the Widget Editor+ Assistant URL for the given widget sys_id.
         * @param   {string} sysId  Widget sys_id.
         * @returns {string}
         */
        function getAssistantUrl(sysId) {
            return (
                '/ui_page.do?sys_id=584ed242cd934914bffa4b0bb3fb2974&record_table=sp_widget&record_sys_id=' +
                encodeURIComponent(sysId)
            );
        }

        /**
         * Returns the Compare+ diff UI page URL for the given widget sys_id.
         * @param   {string} sysId  Widget sys_id.
         * @returns {string}
         */
        function getCompareUrl(sysId) {
            return (
                '/ui_page.do?sys_id=51ec3d258363b61070b8b5dfeeaad36b&table=sp_widget&record_id=' +
                encodeURIComponent(sysId)
            );
        }

        return {
            getEditorPlusUrl,
            getSPEditorUrl,
            getEditorPlatformUrl,
            getAssistantUrl,
            getCompareUrl,
        };
    })();

    ///////////////////////////////////////////
    // 5. LoadTimeTracker — widget load-time overlay mode
    ///////////////////////////////////////////

    const LoadTimeTracker = (function () {
        let _active = false;
        const _WE_LT = 'data-we-load-times'; // attribute used to tag every injected element
        const _WE_LT_THRESHOLD = 750; // ms — widgets at or above this are highlighted red

        /**
         * Counts $$watchers on a widget's controller scope and its descendants, excluding nested widgets' own subtrees.
         * @param   {Object} rootScope
         * @returns {number}
         */
        function countWatchers(rootScope) {
            let total = 0;
            (function walk(sc, isRoot) {
                if (!sc) return;
                if (!isRoot && ScopeResolver.ownsWidgetProps(sc)) {
                    return;
                }
                total += (sc.$$watchers && sc.$$watchers.length) || 0;
                let child = sc.$$childHead;
                while (child) {
                    walk(child, false);
                    child = child.$$nextSibling;
                }
            })(rootScope, true);
            return total;
        }

        /**
         * Activates the widget load-time overlay mode.
         * Outlines every [widget] element on the page, injects a bar into each
         * showing its name and measured server refresh time, and displays a
         * summary panel for any widgets that exceed the slow threshold.
         */
        function activate() {
            _active = true;

            const style = document.createElement('style');
            style.setAttribute(_WE_LT, '1');
            style.textContent =
                '[widget="widget"] { outline: 1px dashed rgba(200,0,0,0.5) !important; position: relative !important; }';
            document.head.appendChild(style);

            const widgets = Array.from(document.querySelectorAll('[widget="widget"]'));
            const widgetData = [];

            (async function () {
                for (const widgetEl of widgets) {
                    let s;
                    try {
                        s = angular.element(widgetEl).scope();
                        if (!s || !s.widget) {
                            continue;
                        }
                    } catch (_ex) {
                        continue;
                    }

                    const widget = s.widget;
                    const uid = (widget.rectangle_id || 'w') + '_' + s.$id;

                    const bar = document.createElement('div');
                    bar.setAttribute(_WE_LT, '1');
                    bar.style.cssText = [
                        'position:absolute;top:0;left:0;right:0;z-index:9999;',
                        'background:rgba(255,255,255,0.93);',
                        'border-bottom:1px dashed rgba(200,0,0,0.4);',
                        'padding:2px 8px;font-size:11px;line-height:20px;',
                        'display:flex;align-items:center;gap:8px;font-family:' + MONOSPACE_FONTS + ';',
                    ].join('');

                    const nameLink = document.createElement('a');
                    nameLink.href = UrlHelpers.getEditorPlusUrl(widget.sys_id);
                    nameLink.target = '_blank';
                    nameLink.textContent = widget.name;
                    nameLink.style.fontWeight = 'bold';
                    bar.appendChild(nameLink);

                    const logLink = document.createElement('a');
                    logLink.href = 'javascript:void(0)';
                    logLink.textContent = 'Log scope';
                    logLink.style.color = '#666';
                    (function (capturedScope) {
                        logLink.addEventListener('click', (e) => {
                            e.preventDefault();
                            console.info(capturedScope);
                        });
                    })(s);
                    bar.appendChild(logLink);

                    const watcherSpan = document.createElement('span');
                    watcherSpan.style.cssText = 'color:#888;';
                    const watcherCount = countWatchers(s);
                    watcherSpan.textContent = watcherCount + (watcherCount === 1 ? ' watcher' : ' watchers');
                    bar.appendChild(watcherSpan);

                    // Load time indicator (right-aligned, filled after refresh)
                    const timeSpan = document.createElement('span');
                    timeSpan.id = 'we-lt-' + uid;
                    timeSpan.style.cssText = 'margin-left:auto;color:#aaa;';
                    timeSpan.textContent = '…';
                    bar.appendChild(timeSpan);

                    const refreshBtn = document.createElement('button');
                    refreshBtn.textContent = '⟳';
                    refreshBtn.title = 'Re-measure load time';
                    refreshBtn.style.cssText =
                        'border:1px solid #ccc;background:#fff;border-radius:50%;width:18px;height:18px;line-height:1;font-size:12px;cursor:pointer;padding:0;flex-shrink:0;';
                    (function (capturedScope, capturedSpan) {
                        refreshBtn.addEventListener('click', function () {
                            capturedSpan.textContent = '…';
                            capturedSpan.style.color = '#aaa';
                            const t0 = performance.now();
                            capturedScope.server.refresh().then(function () {
                                const ms = parseInt(performance.now() - t0);
                                capturedSpan.textContent = ms + 'ms';
                                capturedSpan.style.color = ms >= _WE_LT_THRESHOLD ? 'red' : 'green';
                            });
                        });
                    })(s, timeSpan);
                    bar.appendChild(refreshBtn);

                    widgetEl.appendChild(bar);

                    // Measure load time for non-nested widgets
                    const isNested = !!(s.$parent && s.$parent.widget);
                    if (!isNested) {
                        timeSpan.textContent = 'refreshing…';
                        const t0 = performance.now();
                        try {
                            await s.server.refresh();
                        } catch (_ex) {}
                        const ms = parseInt(performance.now() - t0);
                        timeSpan.textContent = ms + 'ms';
                        timeSpan.style.color = ms >= _WE_LT_THRESHOLD ? 'red' : 'green';
                        widgetData.push({
                            name: widget.name,
                            sys_id: widget.sys_id,
                            rectangle: widget.rectangle_id || '',
                            load_time_ms: ms,
                        });
                    }
                }

                const slow = widgetData.filter((e) => e.load_time_ms >= _WE_LT_THRESHOLD);
                slow.sort((a, b) => b.load_time_ms - a.load_time_ms);

                const panel = document.createElement('div');
                panel.setAttribute(_WE_LT, '1');
                panel.style.cssText = [
                    'position:fixed;bottom:20px;right:20px;z-index:99999;',
                    'background:#fff;border:1px solid #ccc;border-radius:6px;',
                    'padding:14px 16px 12px;font-size:12px;font-family:' + MONOSPACE_FONTS + ';',
                    'max-width:480px;box-shadow:0 2px 10px rgba(0,0,0,0.15);',
                ].join('');

                const titleEl = document.createElement('strong');
                titleEl.textContent =
                    slow.length > 0
                        ? 'Slow widgets (>' + _WE_LT_THRESHOLD + 'ms)'
                        : 'No slow widgets found (≥' + _WE_LT_THRESHOLD + 'ms)';
                panel.appendChild(titleEl);

                if (slow.length > 0) {
                    const table = document.createElement('table');
                    table.style.cssText = 'margin-top:8px;border-collapse:collapse;width:100%;';
                    table.innerHTML =
                        '<thead><tr>' +
                        '<th style="padding:3px 6px;text-align:left;">Name</th>' +
                        '<th style="padding:3px 6px;text-align:right;">Load (ms)</th>' +
                        '</tr></thead>';
                    const tbody = document.createElement('tbody');
                    slow.forEach((e) => {
                        const tr = document.createElement('tr');
                        tr.innerHTML =
                            '<td style="padding:3px 6px;"><a href="/nav_to.do?uri=sp_widget.do%3Fsys_id%3D' +
                            encodeURIComponent(e.sys_id) +
                            '" target="_blank">' +
                            Utils.escapeHtml(e.name) +
                            '</a></td>' +
                            '<td style="padding:3px 6px;text-align:right;color:red;">' +
                            e.load_time_ms +
                            '</td>';
                        tbody.appendChild(tr);
                    });
                    table.appendChild(tbody);
                    panel.appendChild(table);
                }

                const closeBtn = document.createElement('button');
                closeBtn.textContent = '×';
                closeBtn.title = 'Dismiss';
                closeBtn.style.cssText =
                    'position:absolute;top:6px;right:8px;background:none;border:none;font-size:16px;line-height:1;cursor:pointer;';
                closeBtn.addEventListener('click', function () {
                    panel.parentNode && panel.parentNode.removeChild(panel);
                });
                panel.appendChild(closeBtn);

                document.body.appendChild(panel);
            })();
        }

        /**
         * Deactivates the widget load-time overlay mode and removes all injected
         * elements (outlines, per-widget bars, summary panel).
         */
        function deactivate() {
            _active = false;
            // Remove every element tagged with _WE_LT (style, bars, panel).
            document.querySelectorAll('[' + _WE_LT + ']').forEach((el) => {
                el.parentNode && el.parentNode.removeChild(el);
            });
        }

        function isActive() {
            return _active;
        }

        return { activate, deactivate, isActive };
    })();

    ///////////////////////////////////////////
    // 6. Menu item configuration
    ///////////////////////////////////////////

    const MENU_ITEM_CONFIGS = [
        {
            label: function () {
                return document.querySelector('.scope-context-menu-button, .scope-context-menu')
                    ? 'Hide scope buttons'
                    : 'Show scope buttons';
            },
            fn: function (_s, _e) {
                const existing = document.querySelectorAll('.scope-context-menu-button, .scope-context-menu');
                if (existing.length > 0) {
                    localStorage.setItem(SHOW_SCOPE_MENUS_KEY, 'false');
                    existing.forEach((el) => {
                        el.remove();
                    });
                } else {
                    ScopeButtons.show();
                    localStorage.setItem(SHOW_SCOPE_MENUS_KEY, 'true');
                }
            },
        },
        {
            label: function () {
                return LoadTimeTracker.isActive() ? 'Hide load times' : 'Show load times';
            },
            fn: function () {
                if (LoadTimeTracker.isActive()) {
                    LoadTimeTracker.deactivate();
                } else {
                    LoadTimeTracker.activate();
                }
            },
        },
    ];

    /**
     * Returns the subset of MENU_ITEM_CONFIGS that should appear in the
     * debug context menu right now, based on URL state.
     * Each entry is the [label, fn] pair that SP's spWidgetDebug expects.
     * @returns {Array}
     */
    function getFilteredMenuItems() {
        return MENU_ITEM_CONFIGS.filter((item) => {
            if (item.condition && !item.condition()) {
                return false;
            }
            return true;
        }).map((item) => {
            const label = typeof item.label === 'function' ? item.label() : item.label;
            return [label, item.fn];
        });
    }

    ///////////////////////////////////////////
    // 7. ScopeResolver — Angular scope/widget resolution from a DOM element
    ///////////////////////////////////////////

    const ScopeResolver = (function () {
        /**
         * Whether a scope owns widget-controller properties directly (c, data, options,
         * or widget as own properties) — i.e. it's a widget's own controller scope, not
         * an inherited child scope (ng-repeat, ng-if, etc).
         * @param   {Object} sc
         * @returns {boolean}
         */
        function ownsWidgetProps(sc) {
            if (!sc) return false;
            try {
                return (
                    Object.prototype.hasOwnProperty.call(sc, 'c') ||
                    Object.prototype.hasOwnProperty.call(sc, 'data') ||
                    Object.prototype.hasOwnProperty.call(sc, 'options') ||
                    Object.prototype.hasOwnProperty.call(sc, 'widget')
                );
            } catch (_e) {
                return false;
            }
        }

        /**
         * Given any Angular scope s, walks up the $parent chain to find the actual
         * widget controller scope (where c, data, options, widget are defined as own
         * properties, or where s.$parent no longer shares the same c/data instance).
         * @param   {Object} s
         * @returns {Object|null}
         */
        function resolveToWidgetControllerScope(s) {
            if (!s) return null;

            let curr = s;
            while (curr && curr.$parent && curr.$root !== curr) {
                // If current scope owns widget props directly, it's the controller scope!
                if (ownsWidgetProps(curr)) {
                    return curr;
                }
                // If $parent shares the exact same 'c', 'data', or 'widget', then curr is an inherited child scope (e.g. ng-repeat, ng-if)
                if (
                    curr.$parent &&
                    ((curr.c && curr.$parent.c === curr.c) ||
                        (curr.data && curr.$parent.data === curr.data) ||
                        (curr.widget && curr.$parent.widget === curr.widget))
                ) {
                    curr = curr.$parent;
                    continue;
                }
                break;
            }
            return curr || s;
        }

        /**
         * Retrieves the actual AngularJS scope for a widget element or target node.
         * Handles element directives (like <sp-widget>) that create isolate scopes,
         * inner .ng-scope elements, and walks up to the scope that holds widget data.
         * @param   {Element} el
         * @returns {Object|null}
         */
        function getActualWidgetScope(el) {
            if (!el) return null;
            try {
                // Looks for inner .ng-scope elements whose scope belongs to this widget.
                if (el.querySelectorAll) {
                    const innerScopes = el.querySelectorAll('.ng-scope');
                    for (let i = 0; i < innerScopes.length; i++) {
                        const childNode = innerScopes[i];
                        // Ensure childNode belongs to el (not a deeper descendant [widget] element if el is [widget])
                        if (el.hasAttribute && el.hasAttribute('widget') && childNode !== el) {
                            const closestWidget = childNode.closest ? childNode.closest('[widget]') : null;
                            if (closestWidget && closestWidget !== el) {
                                continue; // skip nodes inside a nested child widget
                            }
                        }
                        const cand = angular.element(childNode).scope() || angular.element(childNode).isolateScope();
                        if (cand) {
                            const resolved = resolveToWidgetControllerScope(cand);
                            if (resolved && (resolved.c || resolved.data || resolved.widget || resolved.options)) {
                                return resolved;
                            }
                        }
                    }
                }

                // 2. Check isolate scope of el (e.g. if el itself is <sp-widget>)
                const isolate = angular.element(el).isolateScope();
                if (isolate) {
                    const resolvedIsolate = resolveToWidgetControllerScope(isolate);
                    if (resolvedIsolate && (resolvedIsolate.c || resolvedIsolate.data)) {
                        return resolvedIsolate;
                    }
                }

                // 3. Fallback to element's scope and resolve to widget controller scope
                const elScope = angular.element(el).scope() || isolate;
                if (elScope) {
                    const resolved = resolveToWidgetControllerScope(elScope);
                    if (resolved) return resolved;
                }

                return elScope || isolate || null;
            } catch (_ex) {
                return null;
            }
        }

        /**
         * Walks up from targetEl collecting every widget in its hierarchy (DOM and $scope ancestor chain, innermost first).
         * @param   {Element} targetEl  Starting element.
         * @returns {Array<{el: Element, sysId: string, name: string, widgetName: string}>}
         */
        function getEmbeddedWidgetInfos(targetEl) {
            const results = [];
            const seenSysIds = new Set();

            // 1. Walk up the DOM hierarchy
            let el = targetEl;
            while (el && el !== document.body && el !== document.documentElement) {
                let sysId = null;
                let widgetName = '';
                let instanceTitle = '';

                if (el.classList) {
                    for (const cls of el.classList) {
                        if (cls.length >= 33 && cls.charAt(0) === 'v' && /^[0-9a-f]{32}/.test(cls.slice(1))) {
                            sysId = cls.slice(1, 33);
                            break;
                        }
                    }
                }

                try {
                    const s = getActualWidgetScope(el);
                    if (s) {
                        if (!sysId) {
                            sysId = s.widget?.sys_id || s.rectangle?.widget?.sys_id || s.c?.widget?.sys_id || null;
                        }
                        widgetName = s.widget?.name || s.rectangle?.widget?.name || '';
                    }
                } catch (_ex) {}

                if (el.hasAttribute) {
                    instanceTitle = el.getAttribute('sn-atf-area') || '';
                }

                if (sysId && !seenSysIds.has(sysId)) {
                    seenSysIds.add(sysId);
                    let label = widgetName || instanceTitle || sysId;
                    if (widgetName && instanceTitle && instanceTitle !== widgetName) {
                        label = widgetName + ' [' + instanceTitle + ']';
                    }
                    results.push({
                        el: el,
                        sysId: sysId,
                        name: label,
                        widgetName: widgetName || instanceTitle || sysId,
                    });
                }

                el = el.parentElement;
            }

            // 2. Walk up the Angular $scope hierarchy from targetEl up to $rootScope to find any ancestor scopes that hold widgets
            try {
                let s = angular.element(targetEl).scope() || angular.element(targetEl).isolateScope();
                while (s && s !== s.$root) {
                    const w = s.widget || s.rectangle?.widget || s.c?.widget;
                    if (w && w.sys_id && !seenSysIds.has(w.sys_id)) {
                        seenSysIds.add(w.sys_id);
                        const wName = w.name || w.sys_id;
                        // No DOM element owns this scope, so capture it directly.
                        results.push({
                            el: targetEl,
                            scope: s,
                            sysId: w.sys_id,
                            name: wName,
                            widgetName: wName,
                        });
                    }
                    s = s.$parent;
                }
            } catch (_e) {}

            return results;
        }

        /**
         * Walks up the DOM from el and returns the sys_id of the nearest widget
         * whose Angular scope exposes rectangle.widget.sys_id, or null if not found.
         * An embedded widget (one included by another widget's template rather than
         * placed on the page) has its own [widget] wrapper and v{sys_id} class but no
         * rectangle, so the rectangle-based pass is checked to completion first —
         * across every DOM ancestor, past any embedded wrappers — before ever falling
         * back to a v{sys_id} class; otherwise an embedded widget's own class would
         * match first and mask the real placement further up.
         * @param   {Element} el  Starting element.
         * @returns {string|null}
         */
        function getWidgetSysId(el) {
            let cursor = el;
            while (cursor && cursor !== document.body) {
                try {
                    const s = getActualWidgetScope(cursor);
                    if (s) {
                        const rect = s.rectangle || s.$parent?.rectangle;
                        if (rect?.widget?.sys_id) {
                            return rect.widget.sys_id;
                        }
                    }
                } catch (_ex) {
                    /* angular not ready or detached node — keep walking */
                }
                cursor = cursor.parentElement;
            }
            // Fallback: no rectangle-bearing ancestor at all (e.g. header/footer
            // widgets, which are never embedded) — use the outermost v{sys_id}
            // class rather than the innermost, for the same reason as above.
            let outermostMatch = null;
            cursor = el;
            while (cursor && cursor !== document.body) {
                if (cursor.hasAttribute && cursor.hasAttribute('widget')) {
                    for (const cls of cursor.classList) {
                        if (cls.length >= 33 && cls[0] === 'v' && /^[0-9a-f]{32}/.test(cls.slice(1))) {
                            outermostMatch = cls.slice(1, 33);
                            break;
                        }
                    }
                }
                cursor = cursor.parentElement;
            }
            return outermostMatch;
        }

        /**
         * Walks up the DOM from el and returns the sys_id of the nearest widget's
         * sp_instance ("rectangle"), or null if the widget isn't rectangle-based
         * (e.g. header/footer widgets, standalone previews).
         * @param   {Element} el  Starting element.
         * @returns {string|null}
         */
        function getInstanceSysId(el) {
            while (el && el !== document.body) {
                try {
                    const s = getActualWidgetScope(el);
                    const rect = s && (s.rectangle || s.$parent?.rectangle);
                    if (rect) {
                        return rect.id || rect.sys_id || null;
                    }
                } catch (_ex) {
                    /* angular not ready or detached node — keep walking */
                }
                el = el.parentElement;
            }
            return null;
        }

        return {
            resolveToWidgetControllerScope,
            getActualWidgetScope,
            getEmbeddedWidgetInfos,
            getWidgetSysId,
            getInstanceSysId,
            ownsWidgetProps,
        };
    })();

    ///////////////////////////////////////////
    // 8. TreeViewer — collapsible object tree + search used by the scope inspector
    ///////////////////////////////////////////

    const TreeViewer = (function () {
        /**
         * Builds a collapsible HTML tree from a plain object or array.
         * Matching keys/values are highlighted when filterText is provided.
         * @param   {object|Array} obj
         * @param   {WeakSet}      [seen]        Tracks visited references to handle circular structures.
         * @param   {string}       [filterText]  Highlight text to apply to matching nodes.
         * @returns {HTMLUListElement}
         */
        function createTree(obj, seen, filterText) {
            seen = seen ?? new WeakSet();
            filterText = filterText ?? '';

            const ul = document.createElement('ul');
            Object.assign(ul.style, {
                listStyle: 'none',
                paddingLeft: '1em',
                maxWidth: '100%',
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
            });

            const isArray = Array.isArray(obj);
            let keys = isArray ? Object.keys(obj) : Object.keys(obj).sort((a, b) => a.localeCompare(b));

            if (filterText) {
                const lowerFilter = filterText.toLowerCase();
                keys = keys.filter((key) => {
                    if (key.toLowerCase().includes(lowerFilter)) {
                        return true;
                    }
                    try {
                        const value = obj[key];
                        if (value === null) {
                            return false;
                        }
                        if (typeof value !== 'object') {
                            return String(value).toLowerCase().includes(lowerFilter);
                        }
                        return Object.keys(value).some((k) => k.toLowerCase().includes(lowerFilter));
                    } catch (_e) {
                        return false;
                    }
                });
            }

            if (keys.length === 0 && filterText) {
                const noMatch = document.createElement('li');
                noMatch.textContent = 'No matches found for "' + filterText + '"';
                Object.assign(noMatch.style, {
                    color: '#999',
                    fontStyle: 'italic',
                });
                ul.appendChild(noMatch);
                return ul;
            }

            const totalKeys = keys.length;
            if (keys.length > MAX_TREE_KEYS) {
                keys = keys.slice(0, MAX_TREE_KEYS);
            }

            for (const key of keys) {
                const li = document.createElement('li');

                let value;
                try {
                    value = obj[key];
                } catch (_e) {
                    value = '[Unreadable]';
                }
                if (typeof value === 'function') {
                    continue;
                }

                const valueType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

                if ((valueType === 'object' || valueType === 'array') && value !== null && !seen.has(value)) {
                    const toggle = document.createElement('span');
                    toggle.textContent = '▶';
                    Object.assign(toggle.style, {
                        cursor: 'pointer',
                        marginRight: '4px',
                    });

                    const labelSpan = document.createElement('span');
                    labelSpan.style.cursor = 'pointer';

                    const safeKey = Utils.escapeHtml(key);
                    const typeInfo = ' [' + valueType + ']';
                    const countInfo =
                        valueType === 'object'
                            ? '(' + Object.keys(value).length + ')'
                            : valueType === 'array'
                              ? '(' + value.length + ')'
                              : '';

                    let keyHtml = safeKey;
                    if (filterText && key.toLowerCase().includes(filterText.toLowerCase())) {
                        keyHtml = safeKey.replace(
                            new RegExp('(' + Utils.escapeRegExp(filterText) + ')', 'gi'),
                            '<span style="background-color:yellow;font-weight:bold;">$1</span>'
                        );
                    }
                    labelSpan.innerHTML =
                        '<strong class="scope-node-key">' + keyHtml + '</strong>' + typeInfo + countInfo;

                    const childContainer = document.createElement('ul');
                    Object.assign(childContainer.style, {
                        display: 'none',
                        listStyle: 'none',
                        paddingLeft: '1em',
                    });

                    (function createToggleHandler(nodeValue, nodeContainer, nodeToggle, nodeFilterText) {
                        function handler(e) {
                            e.stopPropagation();
                            if (nodeContainer.childElementCount === 0) {
                                const childSeen = new WeakSet();
                                childSeen.add(nodeValue);
                                nodeContainer.appendChild(createTree(nodeValue, childSeen, nodeFilterText));
                            }
                            const isVisible = nodeContainer.style.display === 'block';
                            nodeContainer.style.display = isVisible ? 'none' : 'block';
                            nodeToggle.textContent = isVisible ? '▶' : '▼';
                        }
                        nodeToggle.addEventListener('click', handler);
                        labelSpan.addEventListener('click', handler);
                    })(value, childContainer, toggle, filterText);

                    li.appendChild(toggle);
                    li.appendChild(labelSpan);
                    li.appendChild(childContainer);
                } else {
                    const val =
                        valueType === 'object' || valueType === 'array' ? '[Circular]' : JSON.stringify(value, null, 0);

                    if (valueType === 'string' && value.length > STRING_PREVIEW_LENGTH) {
                        const shortVal = JSON.stringify(value.substring(0, STRING_PREVIEW_LENGTH) + '...', null, 0);
                        const fullVal = JSON.stringify(value, null, 0);

                        const container = document.createElement('span');
                        const keySpan = document.createElement('span');
                        let safeKey2 = Utils.escapeHtml(key);
                        if (filterText && key.toLowerCase().includes(filterText.toLowerCase())) {
                            safeKey2 = safeKey2.replace(
                                new RegExp('(' + Utils.escapeRegExp(filterText) + ')', 'gi'),
                                '<span style="background-color:yellow;font-weight:bold;">$1</span>'
                            );
                        }
                        keySpan.innerHTML = '<strong class="scope-node-key">' + safeKey2 + ': </strong>';

                        const valueSpan = document.createElement('span');
                        valueSpan.className = 'string-value';
                        const safeShortVal = Utils.escapeHtml(shortVal);
                        if (filterText && value.toLowerCase().includes(filterText.toLowerCase())) {
                            valueSpan.innerHTML = safeShortVal.replace(
                                new RegExp('(' + Utils.escapeRegExp(filterText) + ')', 'gi'),
                                '<span style="background-color:yellow;font-weight:bold;">$1</span>'
                            );
                        } else {
                            valueSpan.innerHTML = safeShortVal;
                        }

                        const typeSpan = document.createElement('span');
                        typeSpan.innerHTML = ' [' + valueType + '] ';

                        const toggleLink = document.createElement('a');
                        toggleLink.href = '#';
                        toggleLink.className = 'toggle-string';
                        toggleLink.textContent = 'show more';
                        Object.assign(toggleLink.style, {
                            marginLeft: '5px',
                            color: '#007bff',
                            textDecoration: 'none',
                            fontSize: '10px',
                            fontStyle: 'italic',
                        });

                        container.appendChild(keySpan);
                        container.appendChild(valueSpan);
                        container.appendChild(typeSpan);
                        container.appendChild(toggleLink);
                        li.appendChild(container);

                        (function (nodeValue, nodeValueSpan, nodeShortVal, nodeFullVal, nodeFilterText) {
                            toggleLink.addEventListener('click', function (e) {
                                e.preventDefault();
                                e.stopPropagation();
                                const isExpanded = this.textContent === 'show less';
                                const safeShort = Utils.escapeHtml(nodeShortVal);
                                const safeFull = Utils.escapeHtml(nodeFullVal);
                                const highlightRe =
                                    nodeFilterText && new RegExp('(' + Utils.escapeRegExp(nodeFilterText) + ')', 'gi');
                                const highlight = '<span style="background-color:yellow;font-weight:bold;">$1</span>';
                                const targetVal = isExpanded ? safeShort : safeFull;
                                const matchVal = isExpanded ? nodeShortVal : nodeFullVal;

                                nodeValueSpan.innerHTML =
                                    highlightRe && matchVal.toLowerCase().includes(nodeFilterText.toLowerCase())
                                        ? targetVal.replace(highlightRe, highlight)
                                        : targetVal;
                                this.textContent = isExpanded ? 'show more' : 'show less';
                            });
                        })(value, valueSpan, shortVal, fullVal, filterText);
                    } else {
                        let safeKey3 = Utils.escapeHtml(key);
                        const safeVal = Utils.escapeHtml(String(val));
                        if (filterText && key.toLowerCase().includes(filterText.toLowerCase())) {
                            safeKey3 = safeKey3.replace(
                                new RegExp('(' + Utils.escapeRegExp(filterText) + ')', 'gi'),
                                '<span style="background-color:yellow;font-weight:bold;">$1</span>'
                            );
                        }
                        let safeValHighlighted = safeVal;
                        if (filterText && String(val).toLowerCase().includes(filterText.toLowerCase())) {
                            safeValHighlighted = safeVal.replace(
                                new RegExp('(' + Utils.escapeRegExp(filterText) + ')', 'gi'),
                                '<span style="background-color:yellow;font-weight:bold;">$1</span>'
                            );
                        }
                        const contentSpan = document.createElement('span');
                        Object.assign(contentSpan.style, {
                            maxWidth: '100%',
                            display: 'inline-block',
                            overflowWrap: 'break-word',
                            wordBreak: 'break-word',
                        });
                        contentSpan.innerHTML =
                            '<strong class="scope-node-key">' +
                            safeKey3 +
                            '</strong>: ' +
                            safeValHighlighted +
                            ' [' +
                            valueType +
                            ']';
                        li.appendChild(contentSpan);
                    }
                }

                (function addTreeLogButton(liEl, logObj, label) {
                    const logButton = document.createElement('button');
                    logButton.innerHTML = '<i class="icon-script"></i>';
                    logButton.style.cssText = 'background:none;border:none;cursor:pointer;';
                    liEl.appendChild(logButton);
                    logButton.addEventListener('click', function (e) {
                        e.stopPropagation();
                        console.log(label + '\n', logObj);
                    });
                })(li, { objkey: obj[key], val: value }, Utils.escapeHtml(key));

                ul.appendChild(li);
            }

            if (totalKeys > MAX_TREE_KEYS) {
                const more = document.createElement('li');
                more.textContent = '... (' + (totalKeys - MAX_TREE_KEYS) + ' more items)';
                Object.assign(more.style, {
                    color: '#999',
                    fontStyle: 'italic',
                });
                ul.appendChild(more);
            }

            return ul;
        }

        /**
         * Recursively searches obj for keys or values that contain searchTerm.
         * Returns an array of match descriptors, capped at MAX_SEARCH_RESULTS.
         * @param   {object}   obj
         * @param   {string}   searchTerm
         * @param   {string}   [path='']      Dot-separated path to the current node.
         * @param   {Array}    [results=[]]   Accumulator for matches.
         * @param   {WeakSet}  [seen]         Tracks visited references.
         * @param   {number}   [depth=0]      Current recursion depth.
         * @returns {Array<{path: string, key: string, value: *, isKeyMatch: boolean}>}
         */
        function deepSearch(obj, searchTerm, path, results, seen, depth) {
            path = path ?? '';
            results = results ?? [];
            seen = seen ?? new WeakSet();
            depth = depth ?? 0;

            if (obj === null || typeof obj !== 'object' || seen.has(obj) || depth > MAX_SCOPE_DEPTH) {
                return results;
            }
            seen.add(obj);
            const lowerTerm = searchTerm.toLowerCase();

            for (const key in obj) {
                if (results.length >= MAX_SEARCH_RESULTS) {
                    break;
                }
                const value = obj[key];
                const currentPath = path ? path + '.' + key : key;

                if (key.toLowerCase().includes(lowerTerm)) {
                    results.push({
                        path: currentPath,
                        key: key,
                        value: value,
                        isKeyMatch: true,
                    });
                }
                if (value !== null && typeof value !== 'object' && typeof value !== 'function') {
                    if (String(value).toLowerCase().includes(lowerTerm)) {
                        results.push({
                            path: currentPath,
                            key: key,
                            value: value,
                            isKeyMatch: false,
                        });
                    }
                }
                if (value !== null && typeof value === 'object' && !seen.has(value)) {
                    deepSearch(value, searchTerm, currentPath, results, seen, depth + 1);
                }
            }
            return results;
        }

        /**
         * Briefly highlights a tree list item with a yellow background and a
         * "← MATCH" marker to draw the user's eye to the matched node.
         * @param {HTMLElement} item
         */
        function highlightItem(item) {
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const originalBg = item.style.backgroundColor;
            item.style.backgroundColor = '#ffff9e';
            item.style.transition = 'background-color 1s';

            const marker = document.createElement('span');
            marker.textContent = ' ← MATCH';
            Object.assign(marker.style, {
                color: '#e65100',
                fontWeight: 'bold',
                fontSize: '11px',
                marginLeft: '5px',
            });
            item.appendChild(marker);

            setTimeout(function () {
                item.style.backgroundColor = originalBg;
                if (item.contains(marker)) {
                    item.removeChild(marker);
                }
            }, 5000);
        }

        /**
         * Fallback search used by expandPathInTree when an exact key match fails.
         * Finds the best-matching list item by text content and expands it.
         * @param {Element}  container      Tree root element.
         * @param {string}   searchKey      Key name to look for.
         * @param {string[]} remainingPath  Remaining path segments to traverse after matching.
         */
        function searchForNodeByContent(container, searchKey, remainingPath) {
            const items = container.querySelectorAll('li');
            let bestMatch = null;

            for (const item of items) {
                if (item.textContent.includes(searchKey)) {
                    bestMatch = item;
                    if (item.textContent.includes(searchKey + ':') || item.textContent.includes(searchKey + ' [')) {
                        const toggle = item.querySelector('span[style*="cursor: pointer"]');
                        if (toggle && toggle.textContent === '▶') {
                            toggle.click();
                        }
                        if (remainingPath.length > 0) {
                            const childUl = item.querySelector('ul');
                            if (childUl) {
                                setTimeout(function () {
                                    expandPathInTree(childUl, remainingPath);
                                }, 50);
                                return;
                            }
                        }
                        highlightItem(item);
                        return;
                    }
                }
            }
            if (bestMatch) {
                highlightItem(bestMatch);
            }
        }

        /**
         * Expands the tree node at the given dot-split path inside container and
         * scrolls it into view.  Falls back to content-based search when an exact
         * key match is not found.
         * @param {Element} container  Root element of the tree.
         * @param {string[]} path      Array of key segments to traverse.
         */
        function expandPathInTree(container, path) {
            if (!path.length) {
                return;
            }
            const currentKey = path[0];
            const remainingPath = path.slice(1);
            let found = false;
            const items = container.querySelectorAll('li');

            for (const item of items) {
                const itemText = (item.textContent || '').replace(/[▶▼]/g, '').trim();
                const itemKey = itemText.includes(':')
                    ? itemText.split(':')[0].trim()
                    : itemText.includes('[')
                      ? itemText.split('[')[0].trim()
                      : itemText;

                if (itemKey === currentKey) {
                    const toggle = item.querySelector('span[style*="cursor: pointer"]');
                    if (toggle && (toggle.textContent === '▶' || toggle.textContent === '▼')) {
                        if (toggle.textContent === '▶') {
                            toggle.click();
                        }
                        if (remainingPath.length > 0) {
                            const childUl = Array.from(item.children).find((c) => c.tagName === 'UL') ?? null;
                            if (childUl) {
                                setTimeout(function () {
                                    expandPathInTree(childUl, remainingPath);
                                }, 50);
                            }
                        } else {
                            highlightItem(item);
                        }
                    } else if (remainingPath.length === 0) {
                        highlightItem(item);
                    }
                    found = true;
                    break;
                }
            }

            if (!found) {
                searchForNodeByContent(container, currentKey, remainingPath);
            }
        }

        return {
            createTree,
            deepSearch,
            expandPathInTree,
            highlightItem,
            searchForNodeByContent,
        };
    })();

    ///////////////////////////////////////////
    // 9. ScopeButtons — floating per-widget scope inspector buttons
    ///////////////////////////////////////////

    const ScopeButtons = (function () {
        /**
         * Injects a floating gear button onto each [widget] element that, when
         * clicked, opens an inspector panel showing the widget's Angular scope.
         * @param {Element} [singleElement]  When provided only that element is
         *   processed; otherwise all [widget="widget"] elements on the page.
         */
        function show(singleElement) {
            const elements = singleElement ? [singleElement] : document.querySelectorAll('[widget="widget"]');

            const occupiedPositions = [];
            const problematicWidgets = new Set();
            let activeMenu = null;

            function addStyles() {
                if (document.getElementById('scope-menu-stylesheet')) {
                    return;
                }
                const ss = document.createElement('style');
                ss.id = 'scope-menu-stylesheet';
                ss.textContent = '.scope-node-key { color: mediumblue; }';
                document.head.appendChild(ss);
            }

            function closeActiveMenu() {
                if (activeMenu) {
                    if (activeMenu.hidePopover) activeMenu.hidePopover();
                    activeMenu = null;
                }
            }

            function calculateButtonPosition(el) {
                try {
                    const rect = el.getBoundingClientRect();
                    const elTop = rect.top;
                    const elRight = rect.right;
                    let offset = 5;

                    let level = 0;
                    let parent = el.parentElement;
                    while (parent) {
                        if (parent.hasAttribute('widget')) {
                            level++;
                        }
                        parent = parent.parentElement;
                    }

                    let collision = true;
                    while (collision) {
                        collision = false;
                        for (const pos of occupiedPositions) {
                            if (Math.abs(pos.top - (elTop + offset)) < 30 && Math.abs(pos.right - elRight) < 150) {
                                offset += 30;
                                collision = true;
                                break;
                            }
                        }
                    }

                    occupiedPositions.push({
                        top: elTop + offset,
                        right: elRight,
                        el: el,
                    });
                    return { top: offset, level: level };
                } catch (error) {
                    console.warn('Error calculating button position:', error);
                    return { top: 5, level: 0 };
                }
            }

            function addLogButton(container, obj, label, buttonLabel) {
                const logButton = document.createElement('button');

                if (buttonLabel) {
                    logButton.innerHTML =
                        '<i class="icon-script" style="margin-right:4px;"></i>' + Utils.escapeHtml(buttonLabel);
                    logButton.style.cssText =
                        'margin-bottom:10px;margin-left:5px;background:none;border:1px solid black;border-radius:4px;cursor:pointer;';
                } else {
                    logButton.innerHTML = '<i class="icon-script"></i>';
                    logButton.style.cssText = 'background:none;border:none;cursor:pointer;';
                }

                container.appendChild(logButton);
                logButton.addEventListener('click', function (e) {
                    e.stopPropagation();
                    console.log(label + '\n', obj);
                });
            }

            function addOpenInEditor(container, widgetScope) {
                const editorButton = document.createElement('button');
                editorButton.innerHTML = '<i class="icon-search" style="margin-right:4px;"></i> Open in Widget Editor+';
                editorButton.style.cssText =
                    'margin-bottom:10px;margin-left:5px;background:none;border:1px solid black;border-radius:4px;cursor:pointer;';

                container.appendChild(editorButton);
                editorButton.addEventListener('click', function (e) {
                    e.stopPropagation();
                    window.open(UrlHelpers.getEditorPlusUrl(widgetScope.widget.sys_id), '_blank');
                });
            }

            addStyles();

            elements.forEach(function (el) {
                const widgetScope = angular.element(el).scope();
                const widgetName = widgetScope
                    ? (widgetScope.widget?.name ?? widgetScope.widgetName ?? widgetScope.name ?? 'widget')
                    : 'widget';

                if (document.getElementById(widgetName + '-scope-button')) {
                    return;
                }

                const btn = document.createElement('button');
                btn.classList.add('scope-context-menu-button');
                btn.id = widgetName + '-scope-button';

                const pos = calculateButtonPosition(el);
                const topOffset = pos.top;
                const level = pos.level;
                const buttonColor = level > 0 ? NESTED_COLORS[(level - 1) % NESTED_COLORS.length] : ROOT_BUTTON_COLOR;
                const nestedIndicator =
                    level > 0
                        ? '<span style="margin-right:4px;font-size:10px;">' + '●'.repeat(Math.min(level, 3)) + '</span>'
                        : '';

                btn.innerHTML =
                    nestedIndicator +
                    '<i class="icon-cog" style="margin-right:4px;"></i><span>' +
                    Utils.escapeHtml(widgetName) +
                    '</span>';

                Object.assign(btn.style, {
                    position: 'absolute',
                    top: topOffset + 'px',
                    right: '5px',
                    zIndex: '1000',
                    padding: '4px 8px',
                    fontSize: '12px',
                    border: 'none',
                    borderRadius: '4px',
                    background: buttonColor,
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                    maxWidth: '150px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                });

                el.style.position = 'relative';
                el.appendChild(btn);

                function positionMenu() {
                    if (!activeMenu || !activeMenu.matches(':popover-open')) {
                        return;
                    }
                    const btnRect = btn.getBoundingClientRect();
                    const menuRect = activeMenu.getBoundingClientRect();
                    let top = btnRect.bottom + 5;
                    let left = btnRect.left;

                    if (left + menuRect.width > window.innerWidth - 10) {
                        left = Math.max(10, window.innerWidth - menuRect.width - 10);
                    }
                    if (top + menuRect.height > window.innerHeight - 10) {
                        top = Math.max(10, btnRect.top - menuRect.height - 5);
                    }
                    top = Math.max(10, Math.min(window.innerHeight - menuRect.height - 10, top));

                    activeMenu.style.top = top + 'px';
                    activeMenu.style.left = left + 'px';
                }

                window.addEventListener('resize', positionMenu);

                btn.addEventListener('click', function (e) {
                    e.stopPropagation();

                    const menuId = widgetName + '-scope-menu';

                    if (activeMenu && activeMenu.id === menuId) {
                        closeActiveMenu();
                        return;
                    }

                    closeActiveMenu();
                    document.querySelectorAll('.scope-context-menu').forEach((m) => {
                        m.remove();
                    });

                    const menu = document.createElement('div');
                    menu.id = menuId;
                    menu.classList.add('scope-context-menu');
                    menu.setAttribute('popover', 'manual');

                    Object.assign(menu.style, {
                        position: 'fixed',
                        background: '#fff',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        padding: '10px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                        maxWidth: '450px',
                        maxHeight: '600px',
                        minWidth: '250px',
                        minHeight: '100px',
                        overflow: 'auto',
                        fontSize: '12px',
                        fontFamily: MONOSPACE_FONTS,
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                    });
                    document.body.appendChild(menu);

                    activeMenu = menu;

                    const widgetId = el.getAttribute('id') || el.getAttribute('data-id') || widgetScope?.$id;

                    // Slow / problematic widget path
                    if (widgetId && problematicWidgets.has(widgetId)) {
                        menu.innerHTML =
                            '<div style="color:orange;padding:10px;"><i class="icon-alert" style="margin-right:6px;"></i>This widget was slow to process previously. Showing limited information.</div>';
                        const basicInfo = document.createElement('div');
                        Object.assign(basicInfo.style, {
                            padding: '10px',
                            marginTop: '10px',
                            background: '#f5f5f5',
                            borderRadius: '4px',
                        });
                        basicInfo.innerHTML =
                            '<div><strong>Type:</strong> ' +
                            Utils.escapeHtml(el.getAttribute('widget') || 'widget') +
                            '</div>' +
                            '<div><strong>Name:</strong> ' +
                            Utils.escapeHtml(widgetName) +
                            '</div>' +
                            '<div><strong>ID:</strong> ' +
                            (widgetScope?.$id ?? 'Unknown') +
                            '</div>';
                        addLogButton(
                            menu,
                            widgetScope,
                            widgetName + ' - ' + (widgetScope?.$id ?? ''),
                            'Log widget scope to console'
                        );
                        addOpenInEditor(menu, widgetScope);
                        menu.appendChild(basicInfo);
                        menu.showPopover();
                        positionMenu();
                        return;
                    }

                    // Normal path
                    try {
                        if (!widgetScope) {
                            menu.textContent = 'No AngularJS scope found.';
                            menu.showPopover();
                            positionMenu();
                            return;
                        }

                        let processingTimedOut = false;
                        const processingTimeout = setTimeout(function () {
                            processingTimedOut = true;
                            if (widgetId) {
                                problematicWidgets.add(widgetId);
                            }
                            menu.innerHTML =
                                '<div style="color:orange;padding:10px;"><i class="icon-alert" style="margin-right:6px;"></i>Processing took too long and was aborted. Try again for limited information.</div>';
                            if (!menu.matches(':popover-open')) menu.showPopover();
                            positionMenu();
                        }, PROCESSING_TIMEOUT_MS);

                        function removeFunctions(obj, seen, depth) {
                            seen = seen ?? new WeakSet();
                            depth = depth ?? 0;
                            try {
                                if (processingTimedOut) {
                                    return '[Processing aborted]';
                                }
                                if (depth > MAX_SCOPE_DEPTH) {
                                    return '[Max depth reached]';
                                }
                                if (obj === null || typeof obj !== 'object') {
                                    return obj;
                                }
                                if (seen.has(obj)) {
                                    return '[Circular]';
                                }
                                seen.add(obj);

                                if (Array.isArray(obj)) {
                                    return obj
                                        .slice(0, MAX_ARRAY_ITEMS)
                                        .filter((item) => typeof item !== 'function')
                                        .map((item) => {
                                            try {
                                                return removeFunctions(item, seen, depth + 1);
                                            } catch (_e) {
                                                return '[Error]';
                                            }
                                        });
                                }

                                const result = {};
                                let propertyCount = 0;
                                for (const key in obj) {
                                    if (processingTimedOut) {
                                        break;
                                    }
                                    if (propertyCount >= MAX_OBJ_PROPS) {
                                        result['...'] =
                                            '[' + (Object.keys(obj).length - propertyCount) + ' more properties]';
                                        break;
                                    }
                                    try {
                                        if (typeof obj[key] !== 'function') {
                                            result[key] = removeFunctions(obj[key], seen, depth + 1);
                                            propertyCount++;
                                        }
                                    } catch (_e) {
                                        result[key] = '[Access Error]';
                                        propertyCount++;
                                    }
                                }
                                return result;
                            } catch (_e) {
                                return '[Error processing object]';
                            }
                        }

                        const output = {};
                        let propCount = 0;
                        try {
                            Object.keys(widgetScope).forEach((key) => {
                                if (processingTimedOut || propCount > MAX_SCOPE_PROPS) {
                                    return;
                                }
                                if (!key.startsWith('$$') && typeof widgetScope[key] !== 'function') {
                                    try {
                                        output[key] = widgetScope[key];
                                        propCount++;
                                    } catch (err) {
                                        output[key] = '[Error: ' + err.message + ']';
                                    }
                                }
                            });
                        } catch (scopeError) {
                            console.warn('Error accessing scope keys:', scopeError);
                            output.$error = 'Could not access all scope properties';
                        }

                        for (const key in output) {
                            if (processingTimedOut) {
                                break;
                            }
                            try {
                                if (typeof output[key] === 'object' && output[key] !== null) {
                                    output[key] = removeFunctions(output[key]);
                                }
                            } catch (err) {
                                output[key] = '[Error processing: ' + err.message + ']';
                            }
                        }

                        output.$widget = {
                            id: widgetScope.$id,
                            name: widgetName,
                            type: el.getAttribute('widget') || 'widget',
                        };
                        if (widgetScope.$parent) {
                            try {
                                output.$parent = {
                                    $id: widgetScope.$parent.$id,
                                };
                            } catch (_e) {
                                output.$parent = {
                                    $error: 'Could not access parent scope',
                                };
                            }
                        }

                        if (!processingTimedOut) {
                            clearTimeout(processingTimeout);

                            const header = document.createElement('div');
                            Object.assign(header.style, {
                                marginBottom: '10px',
                                padding: '5px',
                                background: '#f5f5f5',
                                borderRadius: '3px',
                                fontWeight: 'bold',
                                fontSize: '13px',
                            });
                            let headerText =
                                (el.getAttribute('widget') || 'widget') +
                                ': ' +
                                widgetName +
                                ' (ID: ' +
                                widgetScope.$id +
                                ')';
                            if (level > 0) {
                                headerText = '[Nested L' + level + '] ' + headerText;
                                Object.assign(header.style, {
                                    background: buttonColor,
                                    color: '#fff',
                                });
                            }
                            header.textContent = headerText;
                            menu.appendChild(header);

                            addLogButton(menu, widgetScope, headerText, 'Log widget scope to console');
                            addOpenInEditor(menu, widgetScope);

                            const searchContainer = document.createElement('div');
                            Object.assign(searchContainer.style, {
                                marginBottom: '10px',
                                padding: '5px',
                            });
                            const searchInput = document.createElement('input');
                            Object.assign(searchInput.style, {
                                width: '100%',
                                padding: '5px',
                                border: '1px solid #ccc',
                                borderRadius: '3px',
                                fontSize: '12px',
                            });
                            searchInput.setAttribute('placeholder', 'Search properties\u2026');
                            searchInput.setAttribute('type', 'search');
                            searchContainer.appendChild(searchInput);
                            menu.appendChild(searchContainer);

                            const treeContainer = document.createElement('div');
                            menu.appendChild(treeContainer);
                            treeContainer.appendChild(TreeViewer.createTree(output));

                            let searchTimeout;
                            searchInput.addEventListener('input', function (e) {
                                clearTimeout(searchTimeout);
                                searchTimeout = setTimeout(function () {
                                    const filterText = e.target.value.trim();
                                    if (!filterText) {
                                        treeContainer.innerHTML = '';
                                        treeContainer.appendChild(TreeViewer.createTree(output));
                                        setTimeout(positionMenu, 50);
                                        return;
                                    }

                                    const searchResults = TreeViewer.deepSearch(output, filterText);
                                    const resultsInfo = document.createElement('div');
                                    Object.assign(resultsInfo.style, {
                                        marginBottom: '10px',
                                        fontSize: '12px',
                                        fontStyle: 'italic',
                                        color: '#666',
                                    });

                                    treeContainer.innerHTML = '';

                                    if (searchResults.length > 0) {
                                        resultsInfo.textContent =
                                            'Found ' +
                                            searchResults.length +
                                            ' ' +
                                            (searchResults.length === 1 ? 'match' : 'matches') +
                                            ' for "' +
                                            filterText +
                                            '"';

                                        const resultsTree = document.createElement('div');
                                        searchResults.forEach((result) => {
                                            const resultItem = document.createElement('div');
                                            Object.assign(resultItem.style, {
                                                padding: '4px',
                                                border: '1px solid #eee',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                            });

                                            const pathDisplay = document.createElement('div');
                                            Object.assign(pathDisplay.style, {
                                                marginBottom: '4px',
                                                fontSize: '11px',
                                                opacity: '0.7',
                                            });
                                            const pathText = result.path.split('.').join(' → ');
                                            if (pathText.toLowerCase().includes(filterText.toLowerCase())) {
                                                pathDisplay.innerHTML = Utils.escapeHtml(pathText).replace(
                                                    new RegExp('(' + Utils.escapeRegExp(filterText) + ')', 'gi'),
                                                    '<span style="background-color:yellow;font-weight:bold;">$1</span>'
                                                );
                                            } else {
                                                pathDisplay.textContent = pathText;
                                            }
                                            resultItem.appendChild(pathDisplay);

                                            const valueDisplay = document.createElement('div');
                                            let displayValue;
                                            if (result.value === null) {
                                                displayValue = 'null';
                                            } else if (typeof result.value === 'object') {
                                                displayValue = Array.isArray(result.value)
                                                    ? 'Array(' + result.value.length + ')'
                                                    : 'Object(' + Object.keys(result.value).length + ')';
                                            } else {
                                                displayValue = String(result.value);
                                                if (typeof result.value === 'string') {
                                                    displayValue = '"' + displayValue + '"';
                                                }
                                            }

                                            let keyContent = Utils.escapeHtml(result.key);
                                            let valueContent = Utils.escapeHtml(displayValue);
                                            const highlightRe = new RegExp(
                                                '(' + Utils.escapeRegExp(filterText) + ')',
                                                'gi'
                                            );
                                            const highlightSpan =
                                                '<span style="background-color:yellow;font-weight:bold;">$1</span>';

                                            if (result.key.toLowerCase().includes(filterText.toLowerCase())) {
                                                keyContent = keyContent.replace(highlightRe, highlightSpan);
                                            }
                                            if (
                                                typeof result.value === 'string' &&
                                                result.value.toLowerCase().includes(filterText.toLowerCase())
                                            ) {
                                                valueContent = valueContent.replace(highlightRe, highlightSpan);
                                            }
                                            valueDisplay.innerHTML =
                                                '<strong class="scope-node-key">' +
                                                keyContent +
                                                '</strong>: ' +
                                                valueContent;
                                            resultItem.appendChild(valueDisplay);

                                            resultItem.addEventListener('click', function () {
                                                searchInput.value = '';
                                                treeContainer.innerHTML = '';
                                                treeContainer.appendChild(TreeViewer.createTree(output));
                                                TreeViewer.expandPathInTree(treeContainer, result.path.split('.'));
                                            });
                                            resultsTree.appendChild(resultItem);
                                        });

                                        treeContainer.appendChild(resultsInfo);
                                        treeContainer.appendChild(resultsTree);
                                    } else {
                                        resultsInfo.textContent = 'No matches found for "' + filterText + '"';
                                        treeContainer.appendChild(resultsInfo);
                                        treeContainer.appendChild(
                                            TreeViewer.createTree(output, new WeakSet(), filterText)
                                        );
                                    }

                                    setTimeout(positionMenu, 50);
                                }, 300);
                            });

                            menu.showPopover();
                            positionMenu();
                            setTimeout(function () {
                                searchInput.focus();
                            }, 50);
                        }
                    } catch (error) {
                        console.error('Error opening widget menu:', error);
                        menu.innerHTML =
                            '<div style="color:red;padding:10px;">Error opening widget inspector: ' +
                            Utils.escapeHtml(error.message) +
                            '</div>';
                        if (!menu.matches(':popover-open')) menu.showPopover();
                        positionMenu();
                        if (widgetId) {
                            problematicWidgets.add(widgetId);
                        }
                    }

                    menu.addEventListener('click', function (e) {
                        e.stopPropagation();
                    });
                });
            });

            document.addEventListener('click', function () {
                closeActiveMenu();
            });
        }

        return { show };
    })();

    ///////////////////////////////////////////
    // 10. ContextMenuState — transient state for the active right-click
    ///////////////////////////////////////////

    // The native Service Portal overlay is created asynchronously, so the
    // context-menu handler and CustomMenu cannot pass this data directly.
    // Keeping it behind one stable object avoids a group of loosely-related
    // globals and gives target discovery a single owner.
    const ContextMenuState = (function () {
        const state = {
            widgetSysId: null,
            instanceSysId: null,
            widgetEl: null,
            embeddedWidgets: [], // [{ el, sysId, name }, ...] innermost-first
            cursorX: 0,
            cursorY: 0,
            event: null,
        };

        function reset(event) {
            state.widgetSysId = null;
            state.instanceSysId = null;
            state.widgetEl = null;
            state.embeddedWidgets = [];
            state.cursorX = event.clientX;
            state.cursorY = event.clientY;
            state.event = event;
        }

        function captureTarget(target) {
            state.instanceSysId = ScopeResolver.getInstanceSysId(target);
            state.embeddedWidgets = ScopeResolver.getEmbeddedWidgetInfos(target);
            state.widgetSysId =
                (state.embeddedWidgets[0] && state.embeddedWidgets[0].sysId) || ScopeResolver.getWidgetSysId(target);
            state.widgetEl = target.closest ? target.closest('[widget]') : null;
            return !!(state.widgetSysId && state.widgetEl);
        }

        function snapshot() {
            return {
                widgetSysId: state.widgetSysId,
                instanceSysId: state.instanceSysId,
                widgetEl: state.widgetEl,
                embeddedWidgets: state.embeddedWidgets.slice(),
                cursorX: state.cursorX,
                cursorY: state.cursorY,
                event: state.event,
            };
        }

        function hasNativeMenuTrigger() {
            return !!(state.widgetEl && state.widgetEl.querySelector('span.context'));
        }

        return { reset, captureTarget, snapshot, hasNativeMenuTrigger };
    })();

    ///////////////////////////////////////////
    // 11. OverlayManager — SP debug overlay lifecycle
    ///////////////////////////////////////////

    const OverlayManager = (function () {
        /**
         * Returns true when node is the SP debug context-menu overlay element.
         * @param   {Node} node
         * @returns {boolean}
         */
        function isDebugOverlay(node) {
            return (
                node.nodeType === 1 &&
                node.getAttribute('role') === 'contentinfo' &&
                node.classList.contains('dropdown') &&
                node.classList.contains('clearfix')
            );
        }

        /**
         * Removes any stale SP debug overlays directly under <body> so they do not
         * stack up when the user opens the context menu multiple times.
         */
        function removeDebugOverlays() {
            document
                .querySelectorAll(
                    'body > [role="contentinfo"].dropdown.clearfix, dialog[open] [role="contentinfo"].dropdown.clearfix'
                )
                .forEach((el) => {
                    el.parentNode && el.parentNode.removeChild(el);
                });
        }

        /** Closes SP's debug overlay and resets reveal on every spWidgetDebug scope so Angular doesn't re-add it. */
        function closeSpOverlay(menuContainer) {
            try {
                document.querySelectorAll('span.context').forEach(function (el) {
                    const s = angular.element(el).scope();
                    if (s) {
                        s.$evalAsync(function () {
                            s.reveal = false;
                        });
                    }
                });
                menuContainer?.remove();
            } catch (_e) {}
        }

        // SP can insert the overlay container before its <ul> is populated (or replace/refill
        // the <ul> across more than one digest tick), so a single "did a fresh UL appear yet"
        // check can fire too early and see an empty list. This instead waits for the whole
        // subtree to stop mutating for QUIET_MS before treating it as settled, then calls
        // onSettled exactly once — safe to call from a single mutation or a burst of them.
        const SETTLE_QUIET_MS = 60;
        function whenSettled(overlayEl, onSettled) {
            let timer = null;
            const settleObserver = new MutationObserver(function () {
                clearTimeout(timer);
                timer = setTimeout(finish, SETTLE_QUIET_MS);
            });
            function finish() {
                settleObserver.disconnect();
                onSettled();
            }
            settleObserver.observe(overlayEl, {
                childList: true,
                subtree: true,
            });
            timer = setTimeout(finish, SETTLE_QUIET_MS);
        }

        // Mirrors spWidgetDebug: sets rectangle.debugModal on its scope so the SP template renders the modal, and reloads on sp.form.record.updated.
        function openWidgetFormModal(sysId) {
            scope.$applyAsync(function () {
                spUtil
                    .get('widget-options-config', {
                        table: 'sp_widget',
                        sys_id: sysId,
                    })
                    .then(function (widgetData) {
                        let debugScope = null;
                        document.querySelectorAll('span.context').forEach(function (el) {
                            const s = angular.element(el).scope();
                            if (s && s.rectangle !== undefined) {
                                debugScope = s;
                            }
                        });
                        if (!debugScope) {
                            return;
                        }
                        widgetData.options.afterClose = function () {
                            debugScope.rectangle.debugModal = null;
                        };
                        widgetData.options.afterOpen = function () {};
                        debugScope.rectangle.debugModal = widgetData;
                        debugScope.$on('sp.form.record.updated', function () {
                            debugScope.rectangle.debugModal = null;
                            scope.$broadcast('sp.page.reload');
                        });
                    });
            });
        }

        return {
            isDebugOverlay,
            removeDebugOverlays,
            closeSpOverlay,
            whenSettled,
            openWidgetFormModal,
        };
    })();

    ///////////////////////////////////////////
    // 11.5 PortalPicker — "Open page" portal-selection popover
    ///////////////////////////////////////////

    const PortalPicker = (function () {
        let _menu = null;
        let _closeOnOutsideClick = null;

        function close() {
            document.removeEventListener('click', _closeOnOutsideClick, true);
            _closeOnOutsideClick = null;
            if (_menu) {
                if (_menu.hidePopover) _menu.hidePopover();
                _menu.remove();
                _menu = null;
            }
        }

        function buildUrl(portal, pageId, table, sysId) {
            let url = '/' + portal.url_suffix + '?id=' + encodeURIComponent(pageId);
            if (table && sysId) {
                url += '&table=' + encodeURIComponent(table) + '&sys_id=' + encodeURIComponent(sysId);
            }
            return url;
        }

        /**
         * Builds a popover shell (positioned at x/y, styled consistently) with a
         * header and an empty body list ready to append items to.
         * @returns {{menu: Element, list: Element}}
         */
        function createShell(x, y, headerText) {
            close();

            const menu = document.createElement('div');
            menu.setAttribute('popover', 'manual');
            Object.assign(menu.style, {
                position: 'fixed',
                left: x + 'px',
                top: y + 'px',
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: '6px',
                padding: '6px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
                minWidth: '200px',
                maxWidth: '320px',
                maxHeight: '320px',
                overflow: 'auto',
                fontSize: '13px',
                zIndex: '100000',
            });

            const header = document.createElement('div');
            header.textContent = headerText;
            Object.assign(header.style, {
                fontWeight: '600',
                padding: '4px 8px 8px',
                color: '#425051',
            });
            menu.appendChild(header);

            document.body.appendChild(menu);
            if (menu.showPopover) menu.showPopover();
            _menu = menu;

            _closeOnOutsideClick = function (e) {
                if (!menu.contains(e.target)) {
                    close();
                }
            };
            setTimeout(function () {
                document.addEventListener('click', _closeOnOutsideClick, true);
            }, 0);

            return menu;
        }

        function addEmptyRow(menu, text) {
            const empty = document.createElement('div');
            empty.textContent = text;
            Object.assign(empty.style, {
                padding: '4px 8px',
                color: '#999',
                fontStyle: 'italic',
            });
            menu.appendChild(empty);
        }

        function addButtonRow(menu, label, onClick) {
            const item = document.createElement('button');
            item.textContent = label;
            Object.assign(item.style, {
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
                font: 'inherit',
            });
            item.addEventListener('mouseenter', function () {
                item.style.background = 'rgba(0,0,0,0.05)';
            });
            item.addEventListener('mouseleave', function () {
                item.style.background = 'none';
            });
            item.addEventListener('click', onClick);
            menu.appendChild(item);
        }

        /**
         * Renders the portal-selection step for a single, already-resolved page.
         * @param {number} x
         * @param {number} y
         * @param {{id: string, title: string}|null} page
         * @param {Array}  portals
         * @param {string} table  Only applied when this page is the widget's own instance.
         * @param {string} sysId  Only applied when this page is the widget's own instance.
         */
        function renderPortalMenu(x, y, page, portals, table, sysId) {
            const menu = createShell(
                x,
                y,
                page ? 'Open "' + page.title + '" in…' : 'Could not resolve the page for this widget.'
            );

            if (!page) return;

            if (!portals.length) {
                addEmptyRow(menu, 'No active portals found.');
                return;
            }

            portals.forEach(function (portal) {
                addButtonRow(menu, portal.title, function () {
                    window.open(buildUrl(portal, page.id, table, sysId), '_blank');
                    close();
                });
            });
        }

        /** Renders the instance-selection step when a widget has more than one active sp_instance. */
        function renderInstanceMenu(x, y, instances, portals, currentInstanceSysId, table, sysId) {
            const menu = createShell(x, y, 'This widget appears on multiple pages — select one:');

            instances.forEach(function (inst) {
                const label = inst.pageTitle || inst.pageId || 'Untitled page';
                addButtonRow(menu, label, function () {
                    // Only the right-clicked instance's widget was rendered, so only its table/sysId are known.
                    const isCurrent = inst.instanceSysId === currentInstanceSysId;
                    renderPortalMenu(
                        x,
                        y,
                        { id: inst.pageId, title: inst.pageTitle },
                        portals,
                        isCurrent ? table : null,
                        isCurrent ? sysId : null
                    );
                });
            });
        }

        /**
         * Fetches every active sp_instance placement of widgetSysId plus the active
         * portals, and hands { instances, portals } to callback.
         * @param {string}   widgetSysId
         * @param {Function} callback
         */
        function fetchOpenPageOptions(widgetSysId, callback) {
            if (!widgetSysId) {
                callback({ instances: [], portals: [] });
                return;
            }
            scope.$applyAsync(function () {
                scope.server
                    .get({
                        action: 'getOpenPageOptions',
                        widgetSysId: widgetSysId,
                    })
                    .then(function (response) {
                        // server.get() resolves with the whole widget payload (template, css, data, …),
                        // not just the server script's "data" object, and doesn't merge into scope.data.
                        const result = (response && response.data && response.data.openPageOptions) || {};
                        callback({
                            instances: result.instances || [],
                            portals: result.portals || [],
                        });
                    });
            });
        }

        /**
         * Resolves every active instance of widgetSysId plus the active portals,
         * then shows the instance picker (if more than one instance) or goes
         * straight to the portal picker.
         * @param {string} widgetSysId       sp_widget sys_id.
         * @param {string} instanceSysId     sp_instance sys_id of the right-clicked widget ("rectangle" scope).
         * @param {string} table             Table detected from URL/widget data, or null.
         * @param {string} sysId             sys_id detected from URL/widget data, or null.
         * @param {number} x
         * @param {number} y
         */
        function open(widgetSysId, instanceSysId, table, sysId, x, y) {
            fetchOpenPageOptions(widgetSysId, function (result) {
                const instances = result.instances;
                const portals = result.portals;
                if (instances.length > 1) {
                    renderInstanceMenu(x, y, instances, portals, instanceSysId, table, sysId);
                } else {
                    const inst = instances[0] || null;
                    const page = inst ? { id: inst.pageId, title: inst.pageTitle } : null;
                    renderPortalMenu(x, y, page, portals, table, sysId);
                }
            });
        }

        /** Navigates to the sp_page record itself (platform form view), by sys_id. */
        function navigateToPage(pageSysId) {
            window.open('/nav_to.do?uri=sp_page.do%3Fsys_id=' + encodeURIComponent(pageSysId), '_blank');
        }

        /** Renders a page picker (by sp_page record, not portal) when a widget has more than one active sp_instance. */
        function renderPageInstanceMenu(x, y, instances) {
            const menu = createShell(x, y, 'This widget appears on multiple pages — select one:');
            instances.forEach(function (inst) {
                const label = inst.pageTitle || inst.pageId || 'Untitled page';
                addButtonRow(menu, label, function () {
                    navigateToPage(inst.pageSysId);
                    close();
                });
            });
        }

        /**
         * Resolves widgetSysId to its sp_page and opens that page record directly
         * (platform form view) rather than prompting for a portal.
         * @param {string} widgetSysId
         * @param {number} x
         * @param {number} y
         */
        function openPage(widgetSysId, x, y) {
            if (!widgetSysId) return;
            fetchOpenPageOptions(widgetSysId, function (result) {
                const instances = result.instances;
                if (!instances.length) {
                    createShell(x, y, 'Could not resolve the page for this widget.');
                } else if (instances.length > 1) {
                    renderPageInstanceMenu(x, y, instances);
                } else {
                    navigateToPage(instances[0].pageSysId);
                }
            });
        }

        return { open, openPage };
    })();

    ///////////////////////////////////////////
    // 12. CustomMenu — fully custom-built context menu
    ///////////////////////////////////////////

    const CustomMenu = (function () {
        // Native SP action items we forward clicks into rather than reimplement.
        const NATIVE_ITEM_MATCHERS = [
            { id: 'instanceOptions', match: (t) => t === 'Instance Options' },
            {
                id: 'instanceInPageEditor',
                match: (t) => t.startsWith('Instance in Page Editor'),
            },
            {
                id: 'pageInDesigner',
                match: (t) => t.startsWith('Page in Designer'),
            },
            {
                id: 'showWidgetCustomizations',
                match: (t) => t === 'Show Widget Customizations' || t === 'Hide Widget Customizations',
            },
            {
                id: 'widgetOptionsSchema',
                match: (t) => t === 'Widget Options Schema',
            },
            {
                id: 'editContainerBackground',
                match: (t) => t === 'Edit Container Background',
            },
        ];

        let _shell = null;
        let _nativeOverlay = null;
        let _closeOnOutsideClick = null;
        let _closeOnEscape = null;

        function close() {
            if (_closeOnOutsideClick) {
                document.removeEventListener('click', _closeOnOutsideClick, true);
                _closeOnOutsideClick = null;
            }
            if (_closeOnEscape) {
                document.removeEventListener('keydown', _closeOnEscape, true);
                _closeOnEscape = null;
            }
            if (_shell) {
                if (_shell.hidePopover) _shell.hidePopover();
                _shell.remove();
                _shell = null;
            }
            OverlayManager.closeSpOverlay(_nativeOverlay);
            _nativeOverlay = null;
        }

        /**
         * Finds the <a> for each known native item still present in a hidden SP overlay's <ul>.
         * @param   {Element|null} ul
         * @returns {Object.<string, {a: Element, label: string, disabled: boolean}>}
         */
        function harvestNativeItems(ul) {
            const found = {};
            if (!ul) return found;
            ul.querySelectorAll('li').forEach((li) => {
                const a = li.querySelector('a');
                if (!a) return;
                const text = a.textContent.trim();
                const href = a.getAttribute('href') || '';
                NATIVE_ITEM_MATCHERS.forEach((def) => {
                    if (def.match(text)) {
                        found[def.id] = {
                            a: a,
                            label: text,
                            disabled: li.classList.contains('disabled'),
                            isLink: !!href && href !== '#' && href !== 'javascript:void(0)',
                        };
                    }
                });
            });
            return found;
        }

        let _lastIcon = null;

        function addRow(list, opts) {
            const li = document.createElement('li');
            li.setAttribute('role', 'menuitem');
            const a = document.createElement('a');
            a.setAttribute('tabindex', '-1');

            let iconHtml = '<span class="we-row-icon"></span>';
            if (opts.icon) {
                if (opts.icon !== _lastIcon) {
                    const iconColorClass = opts.iconPrimary ? 'we-row-icon--primary' : 'text-muted';
                    iconHtml = '<i class="' + opts.icon + ' ' + iconColorClass + ' we-row-icon"></i>';
                    _lastIcon = opts.icon;
                }
            } else {
                _lastIcon = null;
            }

            const badgeHtml = opts.badge ? '<span class="badge we-row-badge">' + opts.badge + '</span>' : '';
            const linkIconHtml = opts.isLink
                ? '<i class="icon-open-document-new-tab we-submenu-arrow" aria-hidden="true"></i>'
                : '';
            const labelHtml = '<span class="we-row-label">' + (opts.html || opts.label || '') + '</span>';
            const contentHtml = iconHtml + labelHtml + badgeHtml + linkIconHtml;
            if (opts.href) {
                a.href = opts.href;
                a.target = '_blank';
                a.innerHTML = contentHtml;
                a.addEventListener('click', () => close());
            } else {
                a.href = 'javascript:void(0)';
                a.innerHTML = contentHtml;
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    try {
                        opts.onClick && opts.onClick(e);
                    } finally {
                        close();
                    }
                });
            }
            li.appendChild(a);
            list.appendChild(li);
            return li;
        }

        function addSectionHeader(list, titleText, iconCls) {
            _lastIcon = null;
            const li = document.createElement('li');
            li.setAttribute('role', 'presentation');
            li.className = 'dropdown-header we-section-header';
            const iconHtml = iconCls ? '<i class="' + iconCls + ' we-row-icon"></i>' : '';
            li.innerHTML = iconHtml + '<span class="we-row-label">' + Utils.escapeHtml(titleText) + '</span>';
            list.appendChild(li);
            return li;
        }

        function addDivider(list) {
            _lastIcon = null;
            const li = document.createElement('li');
            li.className = 'we-menu-divider';
            li.setAttribute('role', 'separator');
            list.appendChild(li);
        }

        function forwardToNative(nativeItem) {
            return function () {
                if (nativeItem && nativeItem.a) {
                    nativeItem.a.click();
                }
            };
        }

        /**
         * Builds and positions the custom menu, harvesting/forward-clicking into a
         * hidden SP overlay for the handful of native-only actions when provided.
         * @param {Element|null} nativeOverlay
         */
        function open(nativeOverlay) {
            close();
            _lastIcon = null;
            _nativeOverlay = nativeOverlay;
            const native = harvestNativeItems(nativeOverlay ? nativeOverlay.querySelector('.dropdown-menu') : null);
            const menuContext = ContextMenuState.snapshot();

            const widgetSysId = menuContext.widgetSysId;
            if (!widgetSysId) return;

            const prefs = controller.preferences || {};

            // Builds a colored segmented latency indicator reflecting a widget's total load time
            // (1 bar green <500ms, 2 bars orange 500-1000ms, 3 bars red >1000ms), tooltip showing all
            // three available timing values. Returns '' when data or the preference is unavailable.
            function buildTimingIndicatorHtml(widget) {
                if (prefs.showTimingIndicators === false || !widget) return '';
                const serverMs = parseFloat(widget._server_time) * 1000;
                if (isNaN(serverMs)) return '';
                const scriptMs = parseFloat(widget._script_execution_time);
                const clientMs = parseFloat(widget.clientLoadTime);
                const maxMs = Math.max(serverMs, isNaN(scriptMs) ? 0 : scriptMs, isNaN(clientMs) ? 0 : clientMs);
                let colorClass = 'we-timing-bars--green';
                if (maxMs > 1000) colorClass = 'we-timing-bars--red';
                else if (maxMs >= 500) colorClass = 'we-timing-bars--orange';
                const fmt = (v) => (isNaN(v) ? 'n/a' : Math.round(v) + 'ms');
                const tooltip =
                    'Server round-trip: ' +
                    fmt(serverMs) +
                    '\nScript execution: ' +
                    fmt(scriptMs) +
                    '\nClient render: ' +
                    fmt(clientMs);
                return (
                    '<span class="we-timing-bars ' +
                    colorClass +
                    '" data-we-tooltip="' +
                    Utils.escapeHtml(tooltip) +
                    '">' +
                    '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                    '<rect class="we-tb-bar we-tb-bar-1" x="1" y="8" width="2.5" height="4.5" rx="0.75" />' +
                    '<rect class="we-tb-bar we-tb-bar-2" x="5.25" y="4.5" width="2.5" height="8" rx="0.75" />' +
                    '<rect class="we-tb-bar we-tb-bar-3" x="9.5" y="1" width="2.5" height="11.5" rx="0.75" />' +
                    '</svg>' +
                    '</span>'
                );
            }

            const PANEL_WIDTH = 285;
            const navStack = [];

            const shell = document.createElement('div');
            shell.className = 'we-custom-menu';
            shell.setAttribute('popover', 'manual');

            const container = document.createElement('div');
            container.className = 'we-menu-container';
            shell.appendChild(container);

            // Appended to shell (not container) so it isn't clipped by the container's
            // overflow: hidden, and positioned via getBoundingClientRect() rather than CSS
            // anchoring since .we-slider-track gets a transform for its slide animation,
            // which would otherwise become the containing block for a position: fixed child.
            const tooltipEl = document.createElement('div');
            tooltipEl.className = 'we-tooltip';
            shell.appendChild(tooltipEl);

            function showTooltip(target) {
                const text = target.getAttribute('data-we-tooltip');
                if (!text) return;
                tooltipEl.textContent = text;
                tooltipEl.classList.add('we-tooltip--visible');
                const targetRect = target.getBoundingClientRect();
                const tipRect = tooltipEl.getBoundingClientRect();
                let top = targetRect.top - tipRect.height - 8;
                if (top < 4) {
                    top = targetRect.bottom + 8;
                }
                let left = targetRect.left + targetRect.width / 2 - tipRect.width / 2;
                left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));
                tooltipEl.style.top = top + 'px';
                tooltipEl.style.left = left + 'px';
            }

            function hideTooltip() {
                tooltipEl.classList.remove('we-tooltip--visible');
            }

            container.addEventListener('mouseover', function (e) {
                const t = e.target.closest('[data-we-tooltip]');
                if (t) showTooltip(t);
            });
            container.addEventListener('mouseout', function (e) {
                const t = e.target.closest('[data-we-tooltip]');
                if (t && !t.contains(e.relatedTarget)) hideTooltip();
            });

            const track = document.createElement('div');
            track.className = 'we-slider-track';
            container.appendChild(track);

            const mainPanel = document.createElement('div');
            mainPanel.className = 'we-panel we-panel-main';
            const mainList = document.createElement('ul');
            mainList.className = 'we-menu-list';
            mainList.setAttribute('role', 'menu');
            mainPanel.appendChild(mainList);
            track.appendChild(mainPanel);
            navStack.push({ panel: mainPanel, list: mainList, title: '' });

            function navigateToSubmenu(titleText, buildItems) {
                _lastIcon = null;
                const nextLevel = navStack.length;
                const subPanel = document.createElement('div');
                subPanel.className = 'we-panel we-panel-sub';
                const subList = document.createElement('ul');
                subList.className = 'we-menu-list';
                subList.setAttribute('role', 'menu');
                subPanel.appendChild(subList);

                const backLi = document.createElement('li');
                backLi.setAttribute('role', 'presentation');
                backLi.className = 'we-menu-header bg-primary we-back-header';
                const backA = document.createElement('a');
                backA.setAttribute('tabindex', '-1');
                backA.className = 'we-back-row';
                backA.href = 'javascript:void(0)';
                backA.innerHTML =
                    '<span class="we-back-left"><i class="icon-chevron-left we-back-arrow" aria-hidden="true"></i> Back</span><span class="we-back-title">' +
                    Utils.escapeHtml(titleText) +
                    '</span>';
                backA.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigateBack();
                });
                backLi.appendChild(backA);
                subList.appendChild(backLi);

                buildItems(subList);

                track.appendChild(subPanel);
                track.style.width = PANEL_WIDTH * (nextLevel + 1) + 'px';
                navStack.push({
                    panel: subPanel,
                    list: subList,
                    title: titleText,
                });

                updateContainerHeight(subPanel);
                track.style.transform = 'translateX(-' + nextLevel * PANEL_WIDTH + 'px)';
            }

            function navigateBack() {
                if (navStack.length <= 1) return;
                const popped = navStack.pop();
                const current = navStack[navStack.length - 1];
                const currentLevel = navStack.length - 1;

                updateContainerHeight(current.panel);
                track.style.transform = 'translateX(-' + currentLevel * PANEL_WIDTH + 'px)';

                setTimeout(() => {
                    if (popped.panel && popped.panel.parentNode) {
                        popped.panel.parentNode.removeChild(popped.panel);
                    }
                    track.style.width = PANEL_WIDTH * navStack.length + 'px';
                }, 220);
            }

            function addSubmenu(list, labelText, titleText, buildItems, iconCls, indicatorHtml) {
                const li = document.createElement('li');
                li.setAttribute('role', 'presentation');
                li.className = 'we-submenu-li';
                const a = document.createElement('a');
                a.setAttribute('tabindex', '-1');
                a.href = 'javascript:void(0)';

                let iconHtml = '<span class="we-row-icon">' + (indicatorHtml || '') + '</span>';
                if (iconCls) {
                    if (iconCls !== _lastIcon) {
                        iconHtml = '<i class="' + iconCls + ' text-muted we-row-icon"></i>';
                        _lastIcon = iconCls;
                    }
                } else {
                    _lastIcon = null;
                }

                a.innerHTML =
                    iconHtml +
                    '<span class="we-row-label">' +
                    Utils.escapeHtml(labelText) +
                    '</span><i class="icon-chevron-right we-submenu-arrow" aria-hidden="true"></i>';
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigateToSubmenu(titleText, buildItems);
                });
                li.appendChild(a);
                list.appendChild(li);
                return li;
            }

            // Header row: widget name + preferences cog (bg-primary).
            const headerName = (menuContext.embeddedWidgets.length > 0 && menuContext.embeddedWidgets[0].name) || '';
            navStack[0].title = headerName;
            const headerLi = document.createElement('li');
            headerLi.setAttribute('role', 'presentation');
            headerLi.className = 'we-menu-header bg-primary';

            const headerWidgetEl = menuContext.embeddedWidgets.length > 0 ? menuContext.embeddedWidgets[0].el : null;
            const headerWidgetScope = headerWidgetEl ? ScopeResolver.getActualWidgetScope(headerWidgetEl) : null;
            const titleSpan = document.createElement('span');
            titleSpan.className = 'we-header-title';
            titleSpan.innerHTML =
                '<span class="we-header-title-text">' +
                Utils.escapeHtml(headerName) +
                '</span>' +
                buildTimingIndicatorHtml(headerWidgetScope && headerWidgetScope.widget);
            titleSpan.title = headerName;
            headerLi.appendChild(titleSpan);

            const cogBtn = document.createElement('button');
            cogBtn.type = 'button';
            cogBtn.className = 'we-cog-btn';
            cogBtn.setAttribute('data-we-cog', '1');
            cogBtn.setAttribute('title', 'Debug menu preferences');
            cogBtn.innerHTML = '<i class="icon-cog" aria-hidden="true"></i>';
            cogBtn.addEventListener('mouseenter', () => {
                cogBtn.querySelector('i').className = 'icon-cog-selected';
            });
            cogBtn.addEventListener('mouseleave', () => {
                cogBtn.querySelector('i').className = 'icon-cog';
            });
            cogBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                close();
                scope.$applyAsync(function () {
                    controller.openPreferences();
                });
            });
            headerLi.appendChild(cogBtn);
            mainList.appendChild(headerLi);

            // Reusable helper for Primary Editor Button + "Open with…" Submenu
            function addOpenWithRows(targetList, targetSysId, preferredEditorId, widgetName) {
                const openWithDefs = [
                    {
                        id: 'openWithEditorPlus',
                        label: 'Open in Widget Editor+',
                        href: UrlHelpers.getEditorPlusUrl(targetSysId),
                        icon: 'icon-document-code',
                    },
                    {
                        id: 'openWithEditorSP',
                        label: 'Open in Widget Editor',
                        href: UrlHelpers.getSPEditorUrl(targetSysId),
                        icon: 'icon-brand-now',
                    },
                    {
                        id: 'openWithFormModal',
                        label: 'Open in Form Modal',
                        href: null,
                        icon: 'icon-new-window',
                    },
                    {
                        id: 'openWithPlatform',
                        label: 'Open in Platform',
                        href: UrlHelpers.getEditorPlatformUrl(targetSysId),
                        icon: 'icon-form',
                    },
                ];
                const defaultId = openWithDefs.some((d) => d.id === preferredEditorId)
                    ? preferredEditorId
                    : 'openWithEditorPlus';
                const defaultDef = openWithDefs.find((d) => d.id === defaultId);

                if (defaultDef.href) {
                    addRow(targetList, {
                        label: defaultDef.label,
                        href: defaultDef.href,
                        icon: defaultDef.icon,
                        iconPrimary: true,
                    });
                } else {
                    addRow(targetList, {
                        label: defaultDef.label,
                        icon: defaultDef.icon,
                        iconPrimary: true,
                        onClick: () => OverlayManager.openWidgetFormModal(targetSysId),
                    });
                }

                const submenuHeaderTitle = widgetName || 'Open with\u2026';
                addSubmenu(
                    targetList,
                    'Open with\u2026',
                    submenuHeaderTitle,
                    (subUl) => {
                        openWithDefs.forEach((def) => {
                            const iconPrimary = def.id === defaultId;
                            if (def.href) {
                                addRow(subUl, {
                                    label: def.label,
                                    href: def.href,
                                    icon: def.icon,
                                    iconPrimary: iconPrimary,
                                });
                            } else {
                                addRow(subUl, {
                                    label: def.label,
                                    icon: def.icon,
                                    iconPrimary: iconPrimary,
                                    onClick: () => OverlayManager.openWidgetFormModal(targetSysId),
                                });
                            }
                        });
                        addDivider(subUl);
                        if (controller.data && controller.data.showAssistantButton) {
                            addRow(subUl, {
                                label: 'Widget Editor+ Assistant',
                                icon: 'icon-ai-sparkle-fill',
                                href: UrlHelpers.getAssistantUrl(targetSysId),
                            });
                        }
                        addRow(subUl, {
                            label: 'Compare+',
                            icon: 'icon-replace-all',
                            href: UrlHelpers.getCompareUrl(targetSysId),
                        });
                    },
                    'icon-open-document-new-tab'
                );
            }

            addOpenWithRows(mainList, widgetSysId, prefs.defaultEditor, headerName);

            // Used by both "Open page…" and "Open <table> record" below.
            const recordParams = new URLSearchParams(location.search);
            let recordTable = recordParams.get('table');
            let recordSysId = recordParams.get('sys_id');
            if ((!recordTable || !recordSysId) && menuContext.widgetEl) {
                const wScope0 = ScopeResolver.getActualWidgetScope(menuContext.widgetEl);
                const wData = wScope0 && wScope0.data;
                if (wData) {
                    if (!recordTable) recordTable = wData.table || wData.tableName || null;
                    if (!recordSysId) recordSysId = wData.sys_id || null;
                }
            }

            addDivider(mainList);

            // Page & Instance Submenu
            const pageItems = [];
            [
                ['instanceOptions', 'Instance Options'],
                ['instanceInPageEditor', 'Instance in Page Editor'],
                ['pageInDesigner', 'Page in Designer'],
                ['editContainerBackground', 'Edit Container Background'],
            ].forEach(([prefId, fallbackLabel]) => {
                const item = native[prefId];
                if (item && !item.disabled) {
                    pageItems.push({
                        label: item.label || fallbackLabel,
                        isLink: item.isLink,
                        icon: 'icon-layout',
                        onClick: forwardToNative(item),
                    });
                }
            });
            if (menuContext.instanceSysId) {
                pageItems.push({
                    label: 'Open portal',
                    icon: 'icon-panel-display-popout',
                    onClick: () => {
                        PortalPicker.open(
                            widgetSysId,
                            menuContext.instanceSysId,
                            recordTable,
                            recordSysId,
                            menuContext.cursorX,
                            menuContext.cursorY
                        );
                    },
                });
                pageItems.push({
                    label: 'Open page',
                    icon: 'icon-document',
                    onClick: () => {
                        PortalPicker.openPage(widgetSysId, menuContext.cursorX, menuContext.cursorY);
                    },
                });
            }
            if (pageItems.length) {
                addSubmenu(
                    mainList,
                    'Page & Instance',
                    'Page & Instance',
                    (subUl) => {
                        pageItems.forEach((opts) => addRow(subUl, opts));
                    },
                    'icon-layout'
                );
            }

            // Widget Submenu (includes toggle items)
            const widgetItems = [];
            [
                ['showWidgetCustomizations', 'Show Widget Customizations'],
                ['widgetOptionsSchema', 'Widget Options Schema'],
            ].forEach(([prefId, fallbackLabel]) => {
                const item = native[prefId];
                if (item && !item.disabled) {
                    widgetItems.push({
                        label: item.label || fallbackLabel,
                        isLink: item.isLink,
                        icon: 'icon-form',
                        onClick: forwardToNative(item),
                    });
                }
            });
            const toggleItems = [
                {
                    label: document.querySelector('.scope-context-menu-button, .scope-context-menu')
                        ? 'Hide scope buttons'
                        : 'Show scope buttons',
                    icon: 'icon-workflow',
                    fn: function (_s, _e) {
                        const existing = document.querySelectorAll('.scope-context-menu-button, .scope-context-menu');
                        if (existing.length > 0) {
                            localStorage.setItem(SHOW_SCOPE_MENUS_KEY, 'false');
                            existing.forEach((el) => {
                                el.remove();
                            });
                        } else {
                            ScopeButtons.show();
                            localStorage.setItem(SHOW_SCOPE_MENUS_KEY, 'true');
                        }
                    },
                },
                {
                    label: LoadTimeTracker.isActive() ? 'Hide load times' : 'Show load times',
                    icon: 'icon-history',
                    fn: function () {
                        if (LoadTimeTracker.isActive()) {
                            LoadTimeTracker.deactivate();
                        } else {
                            LoadTimeTracker.activate();
                        }
                    },
                },
            ];
            if (widgetItems.length || toggleItems.length) {
                addSubmenu(
                    mainList,
                    'Widget options',
                    'Widget options',
                    (subUl) => {
                        widgetItems.forEach((opts) => addRow(subUl, opts));
                        if (widgetItems.length && toggleItems.length) {
                            addDivider(subUl);
                        }
                        toggleItems.forEach((item) => {
                            addRow(subUl, {
                                label: item.label,
                                icon: item.icon,
                                onClick: () => item.fn(null, menuContext.event),
                            });
                        });
                    },
                    'icon-application-generic'
                );
            }

            if (recordTable && recordSysId) {
                addRow(mainList, {
                    label: 'Open <code>' + Utils.escapeHtml(recordTable) + '</code> record',
                    icon: 'icon-form',
                    href:
                        '/nav_to.do?uri=' +
                        encodeURIComponent(recordTable) +
                        '.do%3Fsys_id=' +
                        encodeURIComponent(recordSysId),
                });
            }

            addDivider(mainList);

            // Diagnostics Section (no row icons)
            addSectionHeader(mainList, 'Diagnostics', 'icon-code');

            const targetWidgetEl =
                menuContext.widgetEl ||
                (menuContext.embeddedWidgets.length > 0 ? menuContext.embeddedWidgets[0].el : null);
            const logVerb = prefs.assignConsoleVars !== false ? 'Add to console: ' : 'Log to console: ';
            if (targetWidgetEl) {
                addRow(mainList, {
                    label: 'Log to console: <code>$scope.data</code>',
                    onClick: () => {
                        const s = ScopeResolver.getActualWidgetScope(targetWidgetEl);
                        const wName =
                            (menuContext.embeddedWidgets.length > 0 && menuContext.embeddedWidgets[0].name) ||
                            (s && s.widget && s.widget.name) ||
                            '';
                        const label = wName ? '$scope.data (' + wName + ')' : '$scope.data';
                        console.log('%c' + label + '\n', 'color: #0891b2; font-weight: bold;', s && s.data);
                    },
                });
                addRow(mainList, {
                    label: logVerb + '<code>$scope</code>',
                    onClick: () => {
                        const s = ScopeResolver.getActualWidgetScope(targetWidgetEl);
                        const wName =
                            (menuContext.embeddedWidgets.length > 0 && menuContext.embeddedWidgets[0].name) ||
                            (s && s.widget && s.widget.name) ||
                            '';
                        const label = wName ? '$scope (' + wName + ')' : '$scope';
                        console.log('%c' + label + '\n', 'color: #0891b2; font-weight: bold;', s);
                        if (prefs.assignConsoleVars !== false) Utils.assignConsoleVar('$scope', s);
                    },
                });
            }
            addRow(mainList, {
                label: logVerb + '<code>$rootScope</code>',
                onClick: () => {
                    const rootScope = angular.element(document.body).scope();
                    console.log('%c$rootScope\n', 'color: #0891b2; font-weight: bold;', rootScope);
                    if (prefs.assignConsoleVars !== false) Utils.assignConsoleVar('$rootScope', rootScope);
                },
            });

            // Embedding / Ancestor Widgets Hierarchy as Drill-Down Submenus
            const embeddedWidgets = menuContext.embeddedWidgets.slice(1);
            if (embeddedWidgets.length > 0) {
                addDivider(mainList);
                addSectionHeader(mainList, 'Widget Hierarchy', 'icon-tree');
                embeddedWidgets.forEach((info) => {
                    const infoScope = info.scope || ScopeResolver.getActualWidgetScope(info.el);
                    const infoIndicatorHtml = buildTimingIndicatorHtml(infoScope && infoScope.widget);
                    addSubmenu(
                        mainList,
                        info.name,
                        info.name,
                        (parentSubList) => {
                            const embEditor = prefs.defaultEditor || 'openWithEditorPlus';

                            // 1. Open in default editor & Open with… for the parent widget
                            addOpenWithRows(parentSubList, info.sysId, embEditor, info.name);

                            // 2. Diagnostics for the parent widget (no row icons)
                            addDivider(parentSubList);
                            addSectionHeader(parentSubList, 'Diagnostics', 'icon-code');
                            addRow(parentSubList, {
                                label: 'Log to console: <code>$scope.data</code>',
                                onClick: () => {
                                    const s = info.scope || ScopeResolver.getActualWidgetScope(info.el);
                                    console.log(
                                        '%c$scope.data (' + info.name + ')\n',
                                        'color: #0891b2; font-weight: bold;',
                                        s && s.data
                                    );
                                },
                            });
                            addRow(parentSubList, {
                                label: logVerb + '<code>$scope</code>',
                                onClick: () => {
                                    const s = info.scope || ScopeResolver.getActualWidgetScope(info.el);
                                    console.log(
                                        '%c$scope (' + info.name + ')\n',
                                        'color: #0891b2; font-weight: bold;',
                                        s
                                    );
                                    if (prefs.assignConsoleVars !== false) Utils.assignConsoleVar('$scope', s);
                                },
                            });

                            // 3. Parent instance options / open page (if available)
                            const parentInstSysId = ScopeResolver.getInstanceSysId(info.el);
                            if (parentInstSysId) {
                                addDivider(parentSubList);
                                addRow(parentSubList, {
                                    label: 'Open page\u2026',
                                    icon: 'icon-layout',
                                    onClick: () => {
                                        PortalPicker.open(
                                            info.sysId,
                                            parentInstSysId,
                                            recordTable,
                                            recordSysId,
                                            menuContext.cursorX,
                                            menuContext.cursorY
                                        );
                                    },
                                });
                            }
                        },
                        undefined,
                        infoIndicatorHtml
                    );
                });
            }

            // Legacy widget-contributed items (widget._debugContextMenu / _weWidgetItems).
            if (menuContext.widgetEl) {
                try {
                    const wScope = ScopeResolver.getActualWidgetScope(menuContext.widgetEl);
                    let items = null;
                    let callbackScope = wScope;
                    if (
                        wScope &&
                        wScope.widget &&
                        Array.isArray(wScope.widget._weWidgetItems) &&
                        wScope.widget._weWidgetItems.length
                    ) {
                        items = wScope.widget._weWidgetItems;
                    } else if (wScope) {
                        let ps = wScope.$parent;
                        while (ps) {
                            if (
                                ps.widget &&
                                ps.widget._customEnhancement &&
                                Array.isArray(ps.widget._weWidgetItems) &&
                                ps.widget._weWidgetItems.length
                            ) {
                                items = ps.widget._weWidgetItems;
                                callbackScope = ps;
                                break;
                            }
                            ps = ps.$parent;
                        }
                    }
                    if (items && items.length) {
                        addDivider(mainList);
                        items.forEach((item) => {
                            if (!item) {
                                addDivider(mainList);
                            } else {
                                addRow(mainList, {
                                    label: item[0],
                                    onClick: () => {
                                        try {
                                            item[1](callbackScope, menuContext.event);
                                        } catch (_ex) {}
                                    },
                                });
                            }
                        });
                    }
                } catch (_e) {}
            }

            const activeDialog = document.querySelector('dialog[open]');
            if (activeDialog) {
                activeDialog.appendChild(shell);
            } else {
                document.body.appendChild(shell);
            }
            if (shell.showPopover) shell.showPopover();
            _shell = shell;

            function getActiveActionableItems() {
                if (!navStack.length) return [];
                const active = navStack[navStack.length - 1];
                if (!active || !active.panel) return [];
                return Array.from(
                    active.panel.querySelectorAll('a:not([aria-disabled="true"]), button:not([disabled])')
                );
            }

            function focusItem(el) {
                if (!el) return;
                try {
                    el.focus();
                } catch (_e) {}
            }

            _closeOnOutsideClick = (e) => {
                if (!shell.contains(e.target)) close();
            };
            _closeOnEscape = (e) => {
                const items = getActiveActionableItems();
                const currentIdx = items.indexOf(document.activeElement);

                if (e.key === 'Escape') {
                    e.preventDefault();
                    close();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (!items.length) return;
                    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % items.length : 0;
                    focusItem(items[nextIdx]);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (!items.length) return;
                    const prevIdx = currentIdx >= 0 ? (currentIdx - 1 + items.length) % items.length : items.length - 1;
                    focusItem(items[prevIdx]);
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    if (items.length) focusItem(items[0]);
                } else if (e.key === 'End') {
                    e.preventDefault();
                    if (items.length) focusItem(items[items.length - 1]);
                } else if (e.key === 'ArrowRight') {
                    if (document.activeElement && document.activeElement.closest('.we-submenu-li')) {
                        e.preventDefault();
                        document.activeElement.click();
                        requestAnimationFrame(() => {
                            const newItems = getActiveActionableItems();
                            if (newItems.length > 1) focusItem(newItems[1]);
                            else if (newItems.length) focusItem(newItems[0]);
                        });
                    }
                } else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && navStack.length > 1) {
                    e.preventDefault();
                    navigateBack();
                    requestAnimationFrame(() => {
                        const prevItems = getActiveActionableItems();
                        if (prevItems.length) focusItem(prevItems[0]);
                    });
                }
            };
            document.addEventListener('click', _closeOnOutsideClick, true);
            document.addEventListener('keydown', _closeOnEscape, true);

            let _menuFixedTop = null;
            let _menuFixedLeft = null;

            function updateContainerHeight(activePanel) {
                if (!activePanel) return;
                const pad = 8;
                const topPos = _menuFixedTop !== null ? _menuFixedTop : pad;
                const maxAvailableH = Math.max(120, window.innerHeight - topPos - pad);

                const list = activePanel.querySelector('.we-menu-list');
                const naturalH =
                    (list ? list.offsetHeight : activePanel.scrollHeight) || activePanel.scrollHeight || 300;

                if (naturalH + 2 <= maxAvailableH) {
                    const targetH = naturalH + 2;
                    container.style.height = targetH + 'px';
                    activePanel.style.overflowY = 'hidden';
                    activePanel.style.maxHeight = 'none';
                } else {
                    container.style.height = maxAvailableH + 'px';
                    activePanel.style.overflowY = 'auto';
                    activePanel.style.maxHeight = maxAvailableH - 2 + 'px';
                }
            }

            function initPosition() {
                const pad = 8;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const cursorX = menuContext.cursorX;
                const cursorY = menuContext.cursorY;
                const menuW = 285;

                const list = mainPanel.querySelector('.we-menu-list');
                const naturalH = (list ? list.offsetHeight : mainPanel.scrollHeight) || mainPanel.scrollHeight || 380;
                const menuH = Math.min(naturalH + 2, vh - 2 * pad);

                // 1. Fixed Horizontal positioning
                if (cursorX + menuW <= vw - pad) {
                    _menuFixedLeft = cursorX;
                } else if (cursorX - menuW >= pad) {
                    _menuFixedLeft = cursorX - menuW;
                } else {
                    _menuFixedLeft = Math.max(pad, Math.min(vw - menuW - pad, cursorX));
                }

                // 2. Fixed Vertical positioning (never changes during submenu transitions)
                if (cursorY + menuH <= vh - pad) {
                    _menuFixedTop = cursorY;
                } else if (cursorY - menuH >= pad) {
                    _menuFixedTop = cursorY - menuH;
                } else {
                    _menuFixedTop = Math.max(pad, vh - menuH - pad);
                }

                shell.style.setProperty('position', 'fixed', 'important');
                shell.style.setProperty('top', Math.round(_menuFixedTop) + 'px', 'important');
                shell.style.setProperty('left', Math.round(_menuFixedLeft) + 'px', 'important');
                shell.style.setProperty('margin', '0', 'important');

                updateContainerHeight(mainPanel);
            }

            initPosition();
            requestAnimationFrame(initPosition);
        }

        return { open, close };
    })();

    ///////////////////////////////////////////
    // 13. Widget load observer — wires the debug menu into newly-added widgets
    ///////////////////////////////////////////

    (function initWidgetObserver() {
        const observer = new MutationObserver((mutationList) => {
            for (const mutation of mutationList) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute('widget')) {
                        setTimeout(function () {
                            if (((controller.data && controller.data.contextMenuMode) || 'enhanced') !== 'enhanced') {
                                return;
                            }
                            const s = angular.element(node).scope();
                            if (s && s.widget && !s.widget._customEnhancement) {
                                s.widget._customEnhancement = true;

                                // Stable ref — cleared+refilled in place by the setter so bindings below stay valid.
                                const _widgetItems = (function () {
                                    try {
                                        const v = s.widget._debugContextMenu;
                                        return Array.isArray(v) ? v.slice() : [];
                                    } catch (_) {
                                        return [];
                                    }
                                })();

                                // Proxy routes mutators to _widgetItems so assign-empty-then-push patterns persist.
                                const _MUTATOR_FNS = {
                                    push: Array.prototype.push.bind(_widgetItems),
                                    unshift: Array.prototype.unshift.bind(_widgetItems),
                                    splice: Array.prototype.splice.bind(_widgetItems),
                                    pop: Array.prototype.pop.bind(_widgetItems),
                                    shift: Array.prototype.shift.bind(_widgetItems),
                                };
                                // Some widgets push onto an ancestor's _debugContextMenu rather than their own, so if ours is empty, walk up the scope chain for an enhanced ancestor's items.
                                function _getMergedItems() {
                                    const ours = getFilteredMenuItems();
                                    let widgetSpecific = _widgetItems;
                                    if (!widgetSpecific.length) {
                                        let ps = s.$parent;
                                        while (ps) {
                                            if (
                                                ps.widget &&
                                                ps.widget._customEnhancement &&
                                                Array.isArray(ps.widget._weWidgetItems) &&
                                                ps.widget._weWidgetItems.length
                                            ) {
                                                widgetSpecific = ps.widget._weWidgetItems;
                                                break;
                                            }
                                            ps = ps.$parent;
                                        }
                                    }
                                    if (!widgetSpecific.length) return ours;
                                    if (!ours.length) return widgetSpecific;
                                    return ours.concat([null], widgetSpecific);
                                }

                                const _proxyView = new Proxy([], {
                                    get: function (_target, prop) {
                                        if (Object.prototype.hasOwnProperty.call(_MUTATOR_FNS, prop)) {
                                            return _MUTATOR_FNS[prop];
                                        }
                                        const merged = _getMergedItems();
                                        const val = merged[prop];
                                        return typeof val === 'function' ? val.bind(merged) : val;
                                    },
                                    // Array.prototype.concat checks HasProperty(proxy, k) per index; without this trap it defaults to the empty target and every item becomes a hole.
                                    has: function (_target, prop) {
                                        if (Object.prototype.hasOwnProperty.call(_MUTATOR_FNS, prop)) return true;
                                        return prop in _getMergedItems();
                                    },
                                });

                                try {
                                    Object.defineProperty(s.widget, '_debugContextMenu', {
                                        get: function () {
                                            return _proxyView;
                                        },
                                        set: function (value) {
                                            _widgetItems.length = 0;
                                            if (Array.isArray(value)) {
                                                for (let i = 0; i < value.length; i++) {
                                                    _widgetItems.push(value[i]);
                                                }
                                            }
                                        },
                                        enumerable: true,
                                        configurable: true,
                                    });
                                    /* Expose _widgetItems so child widget proxies can read parent items. */
                                    s.widget._weWidgetItems = _widgetItems;
                                } catch (_e) {
                                    s.widget._debugContextMenu = getFilteredMenuItems();
                                }

                                if (
                                    localStorage.getItem(SHOW_SCOPE_MENUS_KEY) === 'true' &&
                                    window.location.pathname !== '/sp_config'
                                ) {
                                    ScopeButtons.show(node);
                                }
                            }
                        }, WIDGET_OBSERVER_DELAY);
                    }
                }
            }
        });
        observer.observe(document, { childList: true, subtree: true });
    })();

    ///////////////////////////////////////////
    // 14. CTRL+right-click debug menu injection — event wiring
    ///////////////////////////////////////////

    document.addEventListener(
        'contextmenu',
        function (e) {
            // stopPropagation isolates a right-click on an already-open menu item (e.g. "Copy Link Address") from our own teardown logic and other listeners, so only the browser's native context menu proceeds.
            const menuItem =
                e.target.closest &&
                e.target.closest(
                    '.we-custom-menu, [role="contentinfo"].dropdown ul.dropdown-menu, dialog[open] ul.dropdown-menu'
                );
            if (menuItem) {
                e.stopPropagation();
                return;
            }
            ContextMenuState.reset(e);

            if (!e.ctrlKey) {
                return;
            }
            const contextMenuMode = (controller.data && controller.data.contextMenuMode) || 'enhanced';
            if (contextMenuMode === 'off') {
                // Suppress both the browser's native menu and SP's own debug overlay.
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (contextMenuMode === 'standard') {
                // Leave Ctrl+Right-click entirely to the legacy Service Portal debug menu.
                return;
            }
            // Only clean up stale overlays when SP will actually create a new one.
            OverlayManager.removeDebugOverlays();
            if (!ContextMenuState.captureTarget(e.target)) {
                return;
            }
            e.preventDefault(); // suppress the browser's native context menu — CustomMenu replaces it entirely
            if (!ContextMenuState.hasNativeMenuTrigger()) {
                // Header/footer widgets lack SP's span.context, so SP never creates a debug overlay for them.
                setTimeout(function () {
                    CustomMenu.open(null);
                }, 50);
            }
            // Otherwise SP still builds (and reveals) its native overlay as before; bodyObserver below hides it and hands off to CustomMenu.
        },
        true
    );

    const bodyObserver = new MutationObserver((mutations) => {
        if (((controller.data && controller.data.contextMenuMode) || 'enhanced') !== 'enhanced') {
            // Not in enhanced mode — leave any SP-native overlay alone, untouched.
            return;
        }
        // Collect all overlays added in this batch.
        const addedOverlays = [];
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (OverlayManager.isDebugOverlay(node)) {
                    addedOverlays.push(node);
                }
            }
        }
        if (!addedOverlays.length) {
            return;
        }
        // A ghost overlay can linger if SP re-adds one via digest before our reveal=false $evalAsync runs; this keeps only the freshly-opened overlay.
        document
            .querySelectorAll('body > [role="contentinfo"].dropdown, dialog[open] [role="contentinfo"].dropdown')
            .forEach((existing) => {
                if (!addedOverlays.includes(existing)) {
                    existing.remove();
                }
            });
        // If SP added multiple overlays in one tick, discard all but the last.
        for (let i = 0; i < addedOverlays.length - 1; i++) {
            addedOverlays[i].parentNode && addedOverlays[i].parentNode.removeChild(addedOverlays[i]);
        }
        const targetOverlay = addedOverlays[addedOverlays.length - 1];
        const activeDialog = document.querySelector('dialog[open]');
        if (activeDialog) {
            activeDialog.appendChild(targetOverlay);
        }
        if (targetOverlay.showPopover) {
            targetOverlay.setAttribute('popover', 'manual');
            targetOverlay.showPopover();
        }
        // Kept in the DOM (not removed) so its own handlers still work — CustomMenu forward-clicks into it.
        targetOverlay.style.opacity = '0';
        targetOverlay.style.pointerEvents = 'none';
        // Wait for SP to finish populating its (hidden) <ul> before harvesting from it.
        OverlayManager.whenSettled(targetOverlay, function () {
            CustomMenu.open(targetOverlay);
        });
    });
    bodyObserver.observe(document.body, { childList: true });
}

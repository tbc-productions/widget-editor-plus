(function (global) {
    'use strict';

    if (global.customElements.get('we-app-drawer')) return;

    var apps = [
        {
            id: 'widget-editor',
            name: 'Widget Editor+',
            description: 'Edit code',
            icon: 'icon-code',
            page: '8b2e70458373fe1070b8b5dfeeaad35e',
        },
        {
            id: 'compare',
            name: 'Compare+',
            description: 'Compare versions',
            icon: 'icon-split-vertical',
            page: '51ec3d258363b61070b8b5dfeeaad36b',
        },
        {
            id: 'assistant',
            name: 'AI Assistant',
            description: 'Export AI context',
            icon: 'icon-ai-sparkle-fill',
            page: '584ed242cd934914bffa4b0bb3fb2974',
        },
        {
            id: 'credit',
            name: 'Credit+',
            description: 'Line-by-line statistics',
            icon: 'icon-history',
            page: '9c5bf170283e4d6394aa639c79936587',
        },
        {
            id: 'code-search',
            name: 'Code Search+',
            description: 'Search for code',
            icon: 'icon-search',
            page: '27a85cdf06a14eba97d2ffc3b57c4a46',
        },
    ];
    var nextId = 0;
    var style = document.createElement('style');
    // These pages use different root font sizes; keep the shared drawer at a consistent size.
    style.textContent = `
        we-app-drawer { display: inline-flex; flex-shrink: 0; align-items: center; }
        .we-app-drawer-heading { display: flex; flex: 1; min-width: 0; align-items: center; gap: 10px; }
        we-app-drawer .we-app-drawer-trigger {
            all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
            width: 36px; height: 36px; border: 1px solid transparent; border-radius: 4px;
            color: rgb(var(--now-color--neutral-0, var(--now-color--neutral-12, 38, 50, 56))); cursor: pointer;
        }
        we-app-drawer .we-app-drawer-trigger i { font-size: 20px; line-height: 1; }
        we-app-drawer .we-app-drawer-trigger:hover,
        we-app-drawer .we-app-drawer-trigger[aria-expanded="true"] {
            background: rgb(var(--now-color_background--primary, 255, 255, 255));
            color: rgb(var(--now-color_text--primary, 38, 50, 56));
            border-color: rgb(var(--now-color_border--secondary, 216, 223, 224));
        }
        we-app-drawer .we-app-drawer-popover {
            position: fixed; inset: auto; margin: 0; padding: 0; width: 352px; max-width: calc(100vw - 16px);
            overflow: auto; overscroll-behavior: contain; box-sizing: border-box;
            background: rgb(var(--now-color_background--primary, 255, 255, 255));
            color: rgb(var(--now-color_text--primary, 38, 50, 56));
            border: 1px solid rgb(var(--now-color_border--secondary, 216, 223, 224)); border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, .18), 0 1px 4px rgba(0, 0, 0, .1);
            font-family: -apple-system, 'Segoe UI', 'Inter', sans-serif; font-size: 13px; font-weight: 400;
            line-height: 1.45; white-space: normal; text-align: left;
        }
        /* ServiceNow's nav reset overrides the browser's default hidden popover style. */
        we-app-drawer .we-app-drawer-popover:not(:popover-open) { display: none; }
        we-app-drawer .we-app-drawer-title {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
            padding: 14px 16px 12px; font-size: 14px; font-weight: 600;
            background: rgb(var(--now-color_background--secondary, 246, 247, 249));
            border-bottom: 1px solid rgb(var(--now-color_border--secondary, 216, 223, 224));
        }
        we-app-drawer .we-app-drawer-properties {
            display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
            width: 26px; height: 26px; border-radius: 4px; font-size: 16px; line-height: 1;
            color: rgba(var(--now-color_text--primary, 38, 50, 56), .6); text-decoration: none;
        }
        we-app-drawer .we-app-drawer-properties:hover {
            background: rgba(var(--now-color_text--primary, 38, 50, 56), .08); color: inherit;
        }
        we-app-drawer .we-app-drawer-list { padding: 8px; }
        we-app-drawer .we-app-drawer-option {
            position: relative; display: flex; align-items: center; padding-right: 8px;
            border: 1px solid transparent; border-radius: 8px;
        }
        we-app-drawer .we-app-drawer-option + .we-app-drawer-option::before {
            content: ''; position: absolute; top: -1px; left: 12px; right: 12px; height: 1px;
            background: rgba(var(--now-color_text--primary, 38, 50, 56), .08); pointer-events: none;
        }
        we-app-drawer .we-app-drawer-option.is-current { background: rgba(var(--now-color--primary-1, 0, 118, 204), .05); }
        we-app-drawer .we-app-drawer-option:hover,
        we-app-drawer .we-app-drawer-option:focus-within { background: rgba(var(--now-color--primary-1, 0, 118, 204), .08); }
        we-app-drawer .we-app-drawer-option.is-current::before,
        we-app-drawer .we-app-drawer-option.is-current + .we-app-drawer-option::before,
        we-app-drawer .we-app-drawer-option:hover::before,
        we-app-drawer .we-app-drawer-option:focus-within::before,
        we-app-drawer .we-app-drawer-option:hover + .we-app-drawer-option::before,
        we-app-drawer .we-app-drawer-option:focus-within + .we-app-drawer-option::before { opacity: 0; }
        we-app-drawer .we-app-drawer-link {
            display: flex; flex: 1; min-width: 0; align-items: center; gap: 10px;
            min-height: 60px; padding: 10px; border-radius: 7px; color: inherit; text-decoration: none;
        }
        we-app-drawer .we-app-drawer-icon {
            display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
            width: 30px; height: 30px; border-radius: 6px;
            background: rgba(var(--now-color_text--primary, 38, 50, 56), .06);
            color: rgba(var(--now-color_text--primary, 38, 50, 56), .6);
        }
        we-app-drawer .we-app-drawer-icon i { font-size: 16px; line-height: 1; }
        we-app-drawer .we-app-drawer-option:hover .we-app-drawer-icon,
        we-app-drawer .we-app-drawer-option:focus-within .we-app-drawer-icon {
            background: rgba(var(--now-color--primary-1, 0, 118, 204), .15);
            color: rgb(var(--now-color--primary-2, 0, 118, 204));
        }
        we-app-drawer .we-app-drawer-copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
        we-app-drawer .we-app-drawer-name { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-weight: 500; }
        we-app-drawer .we-app-drawer-description { font-size: 11px; color: rgba(var(--now-color_text--primary, 38, 50, 56), .5); }
        we-app-drawer .we-app-drawer-new-tab {
            display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
            width: 26px; height: 26px; border-radius: 4px; opacity: 0; visibility: hidden;
            color: rgba(var(--now-color_text--primary, 38, 50, 56), .6); text-decoration: none;
        }
        we-app-drawer a[aria-disabled="true"] { opacity: .5; cursor: progress; }
        we-app-drawer .we-app-drawer-new-tab i { font-size: 14px; line-height: 1; }
        we-app-drawer .we-app-drawer-option:hover .we-app-drawer-new-tab,
        we-app-drawer .we-app-drawer-option:focus-within .we-app-drawer-new-tab { opacity: 1; visibility: visible; }
        we-app-drawer .we-app-drawer-new-tab:hover {
            background: rgba(var(--now-color_text--primary, 38, 50, 56), .12); color: inherit;
        }
        we-app-drawer :is(button, a):focus-visible {
            outline: 2px solid rgb(var(--now-color_focus--primary, 30, 133, 203)); outline-offset: 1px;
        }
        @media (hover: none), (pointer: coarse) {
            we-app-drawer .we-app-drawer-trigger,
            we-app-drawer .we-app-drawer-properties,
            we-app-drawer .we-app-drawer-new-tab { min-width: 44px; min-height: 44px; }
            we-app-drawer .we-app-drawer-new-tab { opacity: 1; visibility: visible; }
        }
    `;
    document.head.appendChild(style);

    // Native popovers stay above clipped app shells and own Escape, outside clicks and focus return.
    class AppDrawer extends global.HTMLElement {
        connectedCallback() {
            if (!this.querySelector('.we-app-drawer-trigger')) {
                var id = 'we-app-drawer-' + ++nextId;
                var current = this.getAttribute('current-app');
                var currentApp = apps.find(function (app) {
                    return app.id === current;
                });
                var creditAvailable = this.getAttribute('credit-available') === 'true';
                // Jelly evaluates dollar-brace expressions even inside client script strings.
                var rows = apps
                    .filter(function (app) {
                        return app.id !== 'credit' || creditAvailable;
                    })
                    .map(function (app) {
                        var selected = app.id === current;
                        var href = '/nav_to.do?uri=' + encodeURIComponent('ui_page.do?sys_id=' + app.page);
                        return [
                            '<div data-app="' +
                                app.id +
                                '" class="we-app-drawer-option' +
                                (selected ? ' is-current' : '') +
                                '">',
                            '<a class="we-app-drawer-link" href="' +
                                href +
                                '" aria-label="' +
                                app.name +
                                (selected ? ', current app' : '') +
                                '"' +
                                (selected ? ' aria-current="page"' : '') +
                                '>',
                            '<span class="we-app-drawer-icon"><i class="' +
                                app.icon +
                                '" aria-hidden="true"></i></span>',
                            '<span class="we-app-drawer-copy"><span class="we-app-drawer-name">' +
                                app.name +
                                '</span><span class="we-app-drawer-description">' +
                                app.description +
                                '</span></span></a>',
                            '<a class="we-app-drawer-new-tab" href="' +
                                href +
                                '" target="_blank" rel="noopener noreferrer" title="Open in a new tab" aria-label="Open ' +
                                app.name +
                                ' in a new tab"><i class="icon-open-document-new-tab" aria-hidden="true"></i></a></div>',
                        ].join('');
                    })
                    .join('');
                this.innerHTML = [
                    '<button type="button" class="we-app-drawer-trigger" aria-label="Apps" title="Apps" aria-expanded="false" aria-controls="' +
                        id +
                        '" popovertarget="' +
                        id +
                        '"><i class="' +
                        (current === 'properties' ? 'icon-cog' : currentApp.icon) +
                        '" aria-hidden="true"></i></button>',
                    '<nav class="we-app-drawer-popover" id="' +
                        id +
                        '" popover="auto" aria-label="Apps"><div class="we-app-drawer-title"><span>Apps</span>',
                    '<a class="we-app-drawer-properties" href="/nav_to.do?uri=' +
                        encodeURIComponent('ui_page.do?sys_id=47cb4ac08e0d4437b5c0a482d8411e30') +
                        '" title="Properties" aria-label="Properties"><i class="icon-cog" aria-hidden="true"></i></a></div><div class="we-app-drawer-list">',
                    rows,
                    '</div></nav>',
                ].join('');
            }
            var drawer = this;
            var trigger = this.querySelector('button');
            var popover = this.querySelector('nav');
            function position() {
                var rect = trigger.getBoundingClientRect();
                var width = parseFloat(global.getComputedStyle(popover).width);
                popover.style.left = Math.max(8, Math.min(rect.left, global.innerWidth - width - 8)) + 'px';
                popover.style.top = rect.bottom + 6 + 'px';
                popover.style.maxHeight = Math.max(0, global.innerHeight - rect.bottom - 14) + 'px';
            }
            this._beforeToggle = function (event) {
                if (event.newState === 'open') {
                    drawer.refreshLinks();
                    position();
                }
                trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
            };
            this._reposition = function () {
                if (popover.matches(':popover-open')) position();
            };
            this._click = function (event) {
                var link = event.target.closest('a');
                if (!link) return;
                if (link.getAttribute('aria-disabled') === 'true') {
                    event.preventDefault();
                    return;
                }
                if (
                    !link.matches('.we-app-drawer-link, .we-app-drawer-properties') ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                )
                    return;
                var navigation = new CustomEvent('we-app-navigate', {
                    bubbles: true,
                    cancelable: true,
                    detail: {
                        href: link.getAttribute('href'),
                        name: link.title || link.querySelector('.we-app-drawer-name').firstChild.textContent,
                    },
                });
                if (!drawer.dispatchEvent(navigation)) event.preventDefault();
                popover.hidePopover();
            };
            this._escape = function (event) {
                if (event.key === 'Escape' && popover.matches(':popover-open')) event.stopPropagation();
            };
            global.addEventListener('keydown', this._escape, true);
            this.addEventListener('click', this._click);
            this.refreshLinks();
            popover.addEventListener('beforetoggle', this._beforeToggle);
            global.addEventListener('resize', this._reposition);
            global.addEventListener('scroll', this._reposition, true);
        }

        refreshLinks() {
            var params = new URLSearchParams(global.location.search);
            var current = this.getAttribute('current-app');
            var table = '',
                record = '';
            if ((current === 'widget-editor' && params.get('new') !== '1') || current === 'assistant') {
                table = params.get('record_table') || (current === 'widget-editor' ? 'sp_widget' : '');
                record =
                    params.get('record_sys_id') || (current === 'widget-editor' ? params.get('widget_id') : '') || '';
            } else if (current === 'compare') {
                table = params.get('table') || 'sp_widget';
                record = params.get('record_id') || '';
            } else if (current === 'credit') {
                table = params.get('sysparm_table') || '';
                record = params.get('sysparm_record') || '';
            }
            if (!/^[a-z_][a-z0-9_]*$/i.test(table) || !/^[0-9a-f]{32}$/i.test(record)) table = record = '';
            var key = table + ':' + record;
            if (this._contextKey === key) return;
            this._contextKey = key;
            var request = (this._contextRequest = (this._contextRequest || 0) + 1);
            global.clearTimeout(this._contextTimer);
            var drawer = this;
            function update(supported, pending) {
                if (drawer._contextKey !== key || drawer._contextRequest !== request) return;
                drawer.querySelector('nav').setAttribute('aria-busy', String(pending));
                apps.forEach(function (app) {
                    var row = drawer.querySelector('[data-app="' + app.id + '"]');
                    if (!row) return;
                    var recordApp = ['widget-editor', 'compare', 'credit', 'assistant'].indexOf(app.id) !== -1;
                    var uri = 'ui_page.do?sys_id=' + app.page;
                    if (supported[app.id]) {
                        if (app.id === 'widget-editor' || app.id === 'assistant')
                            uri += '&record_table=' + encodeURIComponent(table) + '&record_sys_id=' + record;
                        if (app.id === 'compare') uri += '&table=' + encodeURIComponent(table) + '&record_id=' + record;
                        if (app.id === 'credit')
                            uri += '&sysparm_table=' + encodeURIComponent(table) + '&sysparm_record=' + record;
                    }
                    var href = '/nav_to.do?uri=' + encodeURIComponent(uri);
                    row.querySelectorAll('a').forEach(function (link) {
                        if (pending && recordApp) {
                            link.removeAttribute('href');
                            link.setAttribute('aria-disabled', 'true');
                        } else {
                            link.setAttribute('href', href);
                            link.removeAttribute('aria-disabled');
                        }
                    });
                });
            }
            update({}, !!record);
            if (!record) return;
            var settled = false;
            function complete(answer) {
                if (drawer._contextKey !== key || drawer._contextRequest !== request) return;
                if (settled) return;
                settled = true;
                global.clearTimeout(drawer._contextTimer);
                var supported = {};
                try {
                    var result = JSON.parse(answer);
                    if (result.success) supported = result.apps || {};
                } catch (error) {}
                update(supported, false);
            }
            // A failed compatibility check opens the app fresh, rather than passing an unsupported record.
            this._contextTimer = global.setTimeout(function () {
                complete('');
            }, 10000);
            try {
                var ga = new GlideAjax('WidgetEditorAjax');
                ga.addParam('sysparm_name', 'getAppDrawerContext');
                ga.addParam('table', table);
                ga.addParam('record_id', record);
                ga.getXMLAnswer(complete);
            } catch (error) {
                complete('');
            }
        }

        disconnectedCallback() {
            this.removeEventListener('click', this._click);
            global.removeEventListener('keydown', this._escape, true);
            global.clearTimeout(this._contextTimer);
            this._contextKey = null;
            var popover = this.querySelector('nav');
            if (popover.matches(':popover-open')) popover.hidePopover();
            popover.removeEventListener('beforetoggle', this._beforeToggle);
            global.removeEventListener('resize', this._reposition);
            global.removeEventListener('scroll', this._reposition, true);
        }
    }

    global.customElements.define('we-app-drawer', AppDrawer);
})(window);

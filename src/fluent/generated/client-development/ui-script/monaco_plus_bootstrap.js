/**
 * ============================================================================
 * UI Script: monaco_plus_bootstrap
 * ============================================================================
 * Purpose: Lightweight loader that lazy-loads monaco_plus_core exactly once
 * per page, and mounts/enhances a Monaco editor on a ServiceNow form field.
 *
 * Contains:
 *   - Blob constructor patch (fixes ServiceNow mangling Monaco worker URLs)
 *   - User editor-preference loading (via WidgetEditorAjax) and merging into
 *     monaco.editor.create() options
 *   - Theme resolution (from user prefs, or auto-detected from page background)
 *   - ensureCoreLoaded() — lazy-loads monaco_plus_core.jsdbx once
 *   - upgradeEditor() — mounts Monaco on a form field, tearing down CodeMirror
 *     or enhancing an already-rendered native Monaco editor as needed
 *   - Exposes window.SNMonacoPlusBootstrap { init, ensureCoreLoaded,
 *     upgradeEditor, getUserPrefs, coreUrl }
 * ============================================================================
 */
/* global ScriptLoader */
(function (global) {
    'use strict';

    // Patches Blob so worker source gets ?sysparm_substitute=false before ServiceNow can mangle it — MonacoEnvironment.getWorker overrides run too late (Monaco captures them in closures at bundle-eval time).
    if (!global._snBlobWorkerPatchInstalled) {
        global._snBlobWorkerPatchInstalled = true;
        var _OrigBlob = global.Blob;
        global.Blob = function (parts, options) {
            if (Array.isArray(parts)) {
                parts = parts.map(function (part) {
                    if (
                        typeof part === 'string' &&
                        part.indexOf('importScripts') !== -1 &&
                        part.indexOf('snc-code-editor') !== -1 &&
                        part.indexOf('sysparm_substitute') === -1
                    ) {
                        return part.replace(/(snc-code-editor\/[^"'?]+)/g, '$1?sysparm_substitute=false');
                    }
                    return part;
                });
            }
            return new _OrigBlob(parts, options);
        };
        global.Blob.prototype = _OrigBlob.prototype;
    }

    if (global.SNMonacoPlusBootstrap && typeof global.SNMonacoPlusBootstrap.init === 'function') {
        return;
    }

    var _v = '2026-10-17T01:00';
    var CORE_UI_SCRIPT_URL = '/monaco_plus_core.jsdbx?sysparm_substitute=false&v=' + _v;
    var MONACO_BUNDLE_URL = '/scripts/snc-code-editor/monaco.bundle.min.jsx?sysparm_substitute=false';
    var MONACO_WORKER_BASE = '/scripts/snc-code-editor/';
    var MONACO_CSS_URL = '/monacoIncludes.cssx';

    var _unicodeHoverMonaco = null;
    function registerUnicodeHover(monaco) {
        _ensureMonacoCss();
        _ensureHoverCodeColorFix();
        if (!monaco || !monaco.languages || !monaco.languages.registerHoverProvider || _unicodeHoverMonaco === monaco)
            return;
        _unicodeHoverMonaco = monaco;
        var provider = {
            provideHover: function (model, position) {
                var line = model.getLineContent(position.lineNumber);
                var language = model.getLanguageId();
                var escapes = /\\u(?:\{[0-9a-fA-F]+\}|[0-9a-fA-F]{4})/g;
                var match;
                while ((match = escapes.exec(line))) {
                    var start = match.index,
                        end = escapes.lastIndex,
                        preceding = 0;
                    for (var i = start - 1; i >= 0 && line.charAt(i) === '\\'; i--) preceding++;
                    if (preceding % 2) continue; // A literal backslash, not a Unicode escape.
                    var braced = match[0].charAt(2) === '{';
                    if (braced && (language === 'json' || language === 'jsonc')) continue;
                    var code = parseInt(braced ? match[0].slice(3, -1) : match[0].slice(2), 16);
                    if (code > 0x10ffff) continue;
                    if (code >= 0xd800 && code <= 0xdbff && !braced) {
                        var low = /^\\u([dD][c-fC-F][0-9a-fA-F]{2})/.exec(line.slice(end));
                        if (!low) continue;
                        code = 0x10000 + (code - 0xd800) * 0x400 + parseInt(low[1], 16) - 0xdc00;
                        end += low[0].length;
                        escapes.lastIndex = end;
                    } else if (code >= 0xd800 && code <= 0xdfff) continue;
                    var keycap = null,
                        keycapCodes = null;
                    var tail = /^(?:\\u[fF][eE]0[fF])?\\u20[eE]3/.exec(line.slice(end));
                    if (((code >= 48 && code <= 57) || code === 35 || code === 42) && tail) {
                        keycap = String.fromCodePoint(code) + '\ufe0f\u20e3';
                        keycapCodes = tail[0].length === 12 ? [code, 0xfe0f, 0x20e3] : [code, 0x20e3];
                        end += tail[0].length;
                    } else if (
                        (code === 0xfe0f || code === 0x20e3) &&
                        /[0-9#*]/.test(line.charAt(start - 1)) &&
                        start > 0
                    ) {
                        var suffix = /^\\u20[eE]3/.exec(line.slice(end));
                        if (code === 0x20e3 || suffix) {
                            var base = line.charCodeAt(start - 1);
                            keycap = String.fromCodePoint(base) + '\ufe0f\u20e3';
                            keycapCodes = code === 0xfe0f ? [base, 0xfe0f, 0x20e3] : [base, 0x20e3];
                            start--;
                            if (suffix && code === 0xfe0f) end += suffix[0].length;
                        }
                    }
                    escapes.lastIndex = end;
                    if (position.column < start + 1 || position.column >= end + 1) continue;
                    var labels = {
                        0: 'NULL',
                        9: 'TAB',
                        10: 'LINE FEED',
                        13: 'CARRIAGE RETURN',
                        32: 'SPACE',
                        160: 'NO-BREAK SPACE',
                        8203: 'ZERO WIDTH SPACE',
                        8204: 'ZERO WIDTH NON-JOINER',
                        8205: 'ZERO WIDTH JOINER',
                        65279: 'ZERO WIDTH NO-BREAK SPACE',
                        65038: 'TEXT VARIATION SELECTOR',
                        65039: 'EMOJI VARIATION SELECTOR',
                        8419: 'COMBINING ENCLOSING KEYCAP',
                    };
                    var hidden =
                        code < 32 ||
                        (code >= 0x7f && code <= 0x9f) ||
                        (code >= 0x200e && code <= 0x200f) ||
                        (code >= 0x2028 && code <= 0x202e) ||
                        (code >= 0x2060 && code <= 0x206f);
                    var preview =
                        keycap || labels[code] || (hidden ? 'Non-printing character' : String.fromCodePoint(code));
                    var codePoints = (keycapCodes || [code])
                        .map(function (point) {
                            var hex = point.toString(16).toUpperCase();
                            while (hex.length < 4) hex = '0' + hex;
                            return 'U+' + hex;
                        })
                        .join(' ');
                    // Plain Markdown avoids asynchronous code-block rendering in older Monaco bundles.
                    var text = preview
                        .replace(/[\\`*_{}\[\]()#+.!|~\-]/g, '\\$&')
                        .replace(/&/g, '&' + 'amp;')
                        .replace(/</g, '&' + 'lt;')
                        .replace(/>/g, '&' + 'gt;');
                    return {
                        range: new monaco.Range(position.lineNumber, start + 1, position.lineNumber, end + 1),
                        contents: [
                            {
                                value: '**Unicode preview:** ' + text + '\n\n' + codePoints,
                                isTrusted: false,
                                supportHtml: false,
                            },
                        ],
                    };
                }
                return null;
            },
        };
        ['json', 'jsonc', 'javascript', 'typescript'].forEach(function (language) {
            monaco.languages.registerHoverProvider(language, provider);
        });
    }

    var _coreLoadPromise = null;
    var _userPrefsPromise = null;

    /**
     * Loads the current user's Monaco+ prefs via WidgetEditorAjax, cached for the page lifetime.
     * @returns {Promise<Object>} Resolves to the prefs object (possibly empty).
     */
    function _loadUserPrefs() {
        if (_userPrefsPromise) {
            return _userPrefsPromise;
        }
        _userPrefsPromise = new Promise(function (resolve) {
            if (typeof global.GlideAjax !== 'function') {
                resolve({});
                return;
            }
            try {
                var ga = new global.GlideAjax('WidgetEditorAjax');
                ga.addParam('sysparm_name', 'getUserPrefs');
                ga.getXMLAnswer(function (answer) {
                    var prefs = {};
                    try {
                        var parsed = JSON.parse(answer);
                        if (parsed && parsed.success && parsed.value) {
                            var inner = JSON.parse(parsed.value);
                            if (inner && typeof inner === 'object') {
                                prefs = inner;
                            }
                        }
                    } catch (e) {}
                    resolve(prefs);
                });
            } catch (e) {
                resolve({});
            }
        });
        return _userPrefsPromise;
    }

    /**
     * Merges the user-pref subset that maps to Monaco editor.create options.
     * @param {Object} prefs - Parsed user prefs (may be empty).
     * @param {Object} base  - Base options to merge onto.
     * @returns {Object} New options object.
     */
    function _mergePrefsIntoOptions(prefs, base) {
        var out = {};
        for (var k in base) {
            if (Object.prototype.hasOwnProperty.call(base, k)) {
                out[k] = base[k];
            }
        }
        if (!prefs) {
            return out;
        }
        if (typeof prefs.fontSize === 'number' && prefs.fontSize >= 8 && prefs.fontSize <= 32) {
            out.fontSize = prefs.fontSize;
        }
        if (prefs.fontFamily) {
            out.fontFamily = prefs.fontFamily;
        }
        if (prefs.hasOwnProperty('wordWrap')) {
            out.wordWrap = prefs.wordWrap ? 'on' : 'off';
        }
        if (prefs.hasOwnProperty('minimap')) {
            out.minimap = { enabled: !!prefs.minimap };
        }
        if (typeof prefs.tabSize === 'number' && prefs.tabSize >= 1 && prefs.tabSize <= 8) {
            out.tabSize = prefs.tabSize;
        }
        if (prefs.hasOwnProperty('formatTabsToSpaces')) {
            out.insertSpaces = !!prefs.formatTabsToSpaces;
            out.detectIndentation = false;
        }
        if (prefs.hasOwnProperty('autoIndent')) {
            out.autoIndent = prefs.autoIndent ? 'advanced' : 'none';
        }
        if (prefs.hasOwnProperty('formatOnPaste')) {
            out.formatOnPaste = !!prefs.formatOnPaste;
        }
        if (prefs.hasOwnProperty('formatOnType')) {
            out.formatOnType = !!prefs.formatOnType;
        }
        if (prefs.autoSurround) {
            out.autoSurround = prefs.autoSurround;
        }
        if (prefs.autoClosingBrackets) {
            out.autoClosingBrackets = prefs.autoClosingBrackets;
        }
        if (prefs.autoClosingQuotes) {
            out.autoClosingQuotes = prefs.autoClosingQuotes;
        }
        if (prefs.hasOwnProperty('stickyScroll')) {
            out.stickyScroll = { enabled: !!prefs.stickyScroll };
        }
        if (prefs.hasOwnProperty('linkedEditing')) {
            out.linkedEditing = !!prefs.linkedEditing;
        }
        return out;
    }

    /**
     * Picks a Monaco theme from prefs.editorTheme, deferring to fallbackResolver when absent or 'auto'.
     * @param {Object}   prefs
     * @param {Function} fallbackResolver
     * @returns {string}
     */
    function _resolveThemeFromPrefs(prefs, fallbackResolver) {
        var pref = prefs && prefs.editorTheme;
        if (pref === 'light' || pref === 'vs') {
            return 'vs';
        }
        if (pref === 'dark' || pref === 'vs-dark') {
            return 'vs-dark';
        }
        return fallbackResolver();
    }

    function _loadScript(url, callback) {
        if (typeof ScriptLoader !== 'undefined' && ScriptLoader.getScripts) {
            ScriptLoader.getScripts(url, callback);
            return;
        }
        var script = global.document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = callback;
        script.onerror = callback;
        global.document.head.appendChild(script);
    }

    /**
     * Ensures monaco_plus_core is loaded, returning a Promise that resolves to
     * the SNMonacoPlus API object (or null if loading failed).
     *
     * @returns {Promise<Object|null>}
     */
    function ensureCoreLoaded() {
        if (global.SNMonacoPlus && typeof global.SNMonacoPlus.init === 'function') {
            return Promise.resolve(global.SNMonacoPlus);
        }

        if (_coreLoadPromise) {
            return _coreLoadPromise;
        }

        _coreLoadPromise = new Promise(function (resolve) {
            function finish() {
                resolve(global.SNMonacoPlus || null);
            }

            if (!global.document) {
                finish();
                return;
            }

            var coreStarted = false;
            var analysisTimer;
            function loadCore() {
                if (coreStarted) return;
                coreStarted = true;
                clearTimeout(analysisTimer);
                _loadScript(CORE_UI_SCRIPT_URL, finish);
            }
            if (global.WECodeAnalysis) loadCore();
            else {
                analysisTimer = setTimeout(loadCore, 3000);
                _loadScript('/widget_editor_code_analysis.jsdbx?sysparm_substitute=false&v=1', loadCore);
            }
        });

        return _coreLoadPromise;
    }

    /**
     * Loads the core Monaco plus UI Script on demand, then initialises it.
     * Safe to call multiple times across multiple Client Scripts.
     *
     * @param {Object} [config] - Optional config passed through to SNMonacoPlus.init.
     * @returns {Promise<Object|null>} Promise resolving to the enhancer API or null.
     */
    function init(config) {
        _ensureMonacoCss();
        _ensureHoverCodeColorFix();
        return ensureCoreLoaded().then(function (api) {
            if (api && typeof api.init === 'function') {
                api.init(config || {});
                return api;
            }
            return null;
        });
    }

    /**
     * Returns 'vs' (light) or 'vs-dark' based on the page's primary background
     * CSS variable luminance. Falls back to 'vs' if the variable is absent.
     *
     * @returns {string} Monaco theme id.
     */
    function _getDefaultTheme() {
        try {
            var bg = global
                .getComputedStyle(global.document.documentElement)
                .getPropertyValue('--now-color_background--primary')
                .trim();
            if (bg) {
                var parts = bg.split(/[\s,]+/).map(Number);
                if (parts.length >= 3 && !isNaN(parts[0])) {
                    return (parts[0] + parts[1] + parts[2]) / 3 >= 128 ? 'vs' : 'vs-dark';
                }
            }
        } catch (e) {}
        return 'vs';
    }

    /**
     * Injects monacoIncludes.cssx as a page stylesheet if not already present.
     * Pages that ServiceNow natively hosts Monaco on load this automatically;
     * other pages (e.g. sp_css.do) must have it injected to get hover and
     * suggest widget CSS.
     */
    function _ensureMonacoCss() {
        if (!global.document || global.document.querySelector('link[href*="monacoIncludes"]')) {
            return;
        }
        var link = global.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = MONACO_CSS_URL;
        global.document.head.appendChild(link);
    }

    /**
     * Pins hover-widget code-span text color to Monaco's own theme.
     */
    function _ensureHoverCodeColorFix() {
        if (!global.document || global.document.getElementById('sn-monaco-plus-hover-code-fix')) {
            return;
        }
        var style = global.document.createElement('style');
        style.id = 'sn-monaco-plus-hover-code-fix';
        style.textContent =
            '.monaco-editor .monaco-hover code {' +
            'color: var(--vscode-textPreformat-foreground, var(--vscode-editor-foreground));' +
            '}';
        global.document.head.appendChild(style);
    }

    /**
     * Ensures MonacoEnvironment.getWorker routes CSS/SCSS/LESS to the CSS worker
     * and all other languages to the generic editor worker.
     */
    function _configureWorkers() {
        if (!global.MonacoEnvironment) {
            global.MonacoEnvironment = {};
        }
        global.MonacoEnvironment.getWorker = function (_moduleId, label) {
            var file;
            if (label === 'css' || label === 'scss' || label === 'less') {
                file = 'css.worker.bundle.min.jsx';
            } else if (label === 'json') {
                file = 'json.worker.bundle.min.jsx';
            } else if (label === 'typescript' || label === 'javascript') {
                file = 'ts.worker.bundle.min.jsx';
            } else if (label === 'html' || label === 'handlebars' || label === 'razor') {
                file = 'html.worker.bundle.min.jsx';
            } else {
                file = 'editor.worker.bundle.min.jsx';
            }
            return new Worker(MONACO_WORKER_BASE + file + '?sysparm_substitute=false');
        };
    }

    /**
     * Loads the SCSS Monarch tokenizer (falling back to CSS) and applies it before editor creation.
     * @param {Function} done - Callback invoked once the language is ready.
     */
    function _ensureScssLanguageReady(done) {
        var langs = global.monaco.languages.getLanguages();
        var scssInfo = langs.filter(function (l) {
            return l.id === 'scss';
        })[0];

        function applyAndDone(mod) {
            if (mod && mod.language) {
                global.monaco.languages.setMonarchTokensProvider('scss', mod.language);
            }
            if (mod && mod.conf) {
                global.monaco.languages.setLanguageConfiguration('scss', mod.conf);
            }
            done();
        }

        if (scssInfo && typeof scssInfo.loader === 'function') {
            scssInfo.loader().then(applyAndDone);
            return;
        }

        // No dedicated SCSS loader — register the language id and fall back to CSS tokens
        global.monaco.languages.register({
            id: 'scss',
            extensions: ['.scss'],
            mimetypes: ['text/x-scss'],
        });

        var cssInfo = langs.filter(function (l) {
            return l.id === 'css';
        })[0];
        if (cssInfo && typeof cssInfo.loader === 'function') {
            cssInfo.loader().then(applyAndDone);
        } else {
            done();
        }
    }

    /**
     * Mounts a Monaco Editor over a ServiceNow form field — enhancing it in place if
     * Monaco already renders there, tearing down CodeMirror if present, or mounting
     * fresh against the textarea value otherwise.
     * @param {Object}   config
     * @param {Object}   config.gForm            - The ServiceNow GlideForm (g_form).
     * @param {string}   config.field            - Field name to mount the editor on.
     * @param {string}   [config.language]       - Monaco language id (default: 'javascript').
     * @param {string|number} [config.height]    - Fixed editor height (number treated as px); disables auto-grow. Defaults to the replaced textarea's rendered height as the auto-grow starting point.
     * @param {string}   [config.maxHeight]      - Cap for auto-grow (default '80vh'); ignored when config.height or config.containerStyle is set.
     * @param {string}   [config.containerStyle] - Inline CSS for the editor container div; overrides config.height/maxHeight and disables auto-grow when given.
     * @param {boolean}  [config.showToggle]     - Set false to omit the "toggle syntax editor" button (default: true).
     * @param {Function} [config.resolveTheme]   - Returns a Monaco theme id; defaults to auto-detect.
     * @param {Object}   [config.editorOptions]  - monaco.editor.create options, applied before create (wins over user prefs).
     * @param {Function} [config.onEditorReady]  - Called with the created editor instance.
     * @returns {Promise<Object|null>} Resolves to the Monaco editor instance, or null.
     */
    function upgradeEditor(config) {
        config = config || {};

        var gForm = config.gForm || global.g_form;
        var field = config.field;
        var language = config.language || 'javascript';
        var resolveTheme = config.resolveTheme || _getDefaultTheme;

        if (!gForm || !field) {
            return Promise.resolve(null);
        }

        var textarea = gForm.getElement(field);
        if (!textarea || !textarea.parentElement) {
            return Promise.resolve(null);
        }

        var parent = textarea.parentElement;
        var textareaId = textarea.id;
        function _liveTextarea() {
            // CodeMirror teardown can replace the node, so re-resolve instead of trusting a held reference
            return global.document.getElementById(textareaId) || textarea;
        }

        // Protection-policy read-only fields display via a separate "sys_readonly.<field>" element, not the real control.
        var readonlyShadow = global.document.getElementById('sys_readonly.' + textarea.id);
        var measureEl = readonlyShadow || textarea;

        // Grows with content up to maxHeight, like a native auto-expanding textarea; opt out with an explicit height or containerStyle.
        var explicitHeight = config.height;
        var autoGrow = !config.containerStyle && explicitHeight === undefined;
        var maxHeight = config.maxHeight || '80vh';

        var MIN_HEIGHT_PX = 125; // floor gives Monaco's quick-input widget (F1) enough room to render
        var height;
        var minHeightPx = MIN_HEIGHT_PX;
        if (explicitHeight) {
            height = typeof explicitHeight === 'number' ? explicitHeight + 'px' : explicitHeight;
        } else {
            var measuredHeight = measureEl.getBoundingClientRect().height || measureEl.offsetHeight;
            minHeightPx = Math.max(measuredHeight, MIN_HEIGHT_PX);
            height = minHeightPx + 'px';
        }

        /* SN border tokens are RGB triplets, so they must be wrapped in rgb(). */
        var containerStyle =
            config.containerStyle ||
            'width:100%;height:' +
                height +
                ';max-height:' +
                (autoGrow ? maxHeight : height) +
                ';' +
                'border:1px solid rgb(var(--now-form-field--border-color, var(--now-color_border--primary)));';

        function install() {
            /* Monaco already mounted — just enhance with core features */
            if (parent.querySelector('.monaco-editor')) {
                init({ language: language });
                return Promise.resolve(null);
            }

            _ensureMonacoCss();

            var cmEl = parent.querySelector('.CodeMirror');
            var cmInstance = cmEl && cmEl.CodeMirror;
            var initialValue = cmInstance ? cmInstance.getValue() : textarea.value || '';

            var showEditor = true; // shared with the toggle button below
            if (cmInstance) {
                cmEl.style.display = 'none'; // kept alive (not destroyed) so it can be restored as the "plain" view later
            }

            // ServiceNow may init its own CodeMirror asynchronously after this point (once); capture and reuse it rather than destroying it.
            var cmObserver = new MutationObserver(function () {
                if (cmInstance) {
                    return;
                }
                var lateCmEl = parent.querySelector('.CodeMirror');
                var lateCm = lateCmEl && lateCmEl.CodeMirror;
                if (!lateCm) {
                    return;
                }
                cmInstance = lateCm;
                cmEl = lateCmEl;
                if (showEditor) {
                    cmEl.style.display = 'none';
                } else {
                    if (editorInstance) {
                        cmInstance.setValue(editorInstance.getValue());
                    }
                    cmEl.style.display = '';
                    if (typeof cmInstance.refresh === 'function') {
                        cmInstance.refresh();
                    }
                }
            });
            cmObserver.observe(parent, { childList: true, subtree: true });

            _liveTextarea().style.display = 'none';

            if (readonlyShadow) {
                readonlyShadow.style.display = 'none';
            }

            // Reuse an existing container if mountFieldEditor was called before
            var containerId = (gForm.getTableName ? gForm.getTableName() : 'sn') + '_' + field + '_monaco';
            var container = parent.querySelector('[data-sn-monaco-field="' + field + '"]');
            if (!container) {
                container = global.document.createElement('div');
                container.setAttribute('data-sn-monaco-field', field);
                container.id = containerId;
                container.style.cssText = containerStyle;
                parent.appendChild(container);
            }

            // Mirrors ServiceNow's own "Toggle syntax editor" button (e.g. "js_editor_true.<table>.<field>").
            var TOGGLE_TITLE_ON = 'Click to disable syntax highlighting and script formatting';
            var TOGGLE_TITLE_OFF = 'Click to enable syntax highlighting and script formatting';
            var editorInstance = null;
            function _showPlain() {
                if (cmInstance) {
                    cmEl.style.display = '';
                    if (typeof cmInstance.refresh === 'function') {
                        cmInstance.refresh();
                    }
                } else {
                    (readonlyShadow || _liveTextarea()).style.display = '';
                }
            }
            function _hidePlain() {
                if (cmInstance) {
                    cmEl.style.display = 'none';
                } else {
                    (readonlyShadow || _liveTextarea()).style.display = 'none';
                }
            }
            function _getPlainValue() {
                return cmInstance ? cmInstance.getValue() : (readonlyShadow || _liveTextarea()).value;
            }
            function _setPlainValue(v) {
                if (cmInstance) {
                    cmInstance.setValue(v);
                } else {
                    (readonlyShadow || _liveTextarea()).value = v;
                }
            }
            if (config.showToggle !== false && !parent.querySelector('[data-sn-monaco-toggle="' + field + '"]')) {
                var toggleBtn = global.document.createElement('a');
                toggleBtn.href = '#';
                toggleBtn.className = 'btn btn-sm btn-default toolbar-button';
                toggleBtn.title = TOGGLE_TITLE_ON;
                toggleBtn.setAttribute('data-sn-monaco-toggle', field);
                toggleBtn.innerHTML =
                    '<span class="icon-edit-syntax"></span>' + '<span class="sr-only">' + TOGGLE_TITLE_ON + '</span>';
                toggleBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    showEditor = !showEditor;
                    var title = showEditor ? TOGGLE_TITLE_ON : TOGGLE_TITLE_OFF;
                    toggleBtn.title = title;
                    toggleBtn.querySelector('.sr-only').textContent = title;
                    if (showEditor) {
                        if (editorInstance) {
                            editorInstance.setValue(_getPlainValue());
                        }
                        _hidePlain();
                        container.style.display = '';
                    } else {
                        if (editorInstance) {
                            _setPlainValue(editorInstance.getValue());
                        }
                        container.style.display = 'none';
                        _showPlain();
                    }
                });

                var toolbarGroup = global.document.createElement('span');
                toolbarGroup.className = 'btn-group btn-group-sm script-editor-toolbar';
                toolbarGroup.appendChild(toggleBtn);

                // Prefer dropping into ServiceNow's own toolbar (the help-icon group) if this field already has one.
                var inputControls = parent.closest && parent.closest('.input_controls');
                var instructionalSpan = inputControls && inputControls.querySelector('.toolbar-instructional-info');
                if (instructionalSpan) {
                    instructionalSpan.insertAdjacentElement('afterend', toolbarGroup);
                    var instructionalRow = instructionalSpan.closest('.row');
                    if (instructionalRow) {
                        instructionalRow.style.marginBottom = '6px';
                    }
                } else {
                    var toolbarColumn = global.document.createElement('div');
                    toolbarColumn.className = 'col-lg-10 col-md-10 col-sm-10 col-xs-10';
                    toolbarColumn.appendChild(toolbarGroup);

                    var toolbarHost = inputControls || parent;
                    var existingRow = null;
                    for (var i = 0; i < toolbarHost.children.length; i++) {
                        if (toolbarHost.children[i].classList.contains('row')) {
                            existingRow = toolbarHost.children[i];
                            break;
                        }
                    }
                    if (existingRow) {
                        existingRow.style.marginBottom = '6px';
                        existingRow.appendChild(toolbarColumn);
                    } else {
                        var toolbarRow = global.document.createElement('div');
                        toolbarRow.className = 'row';
                        toolbarRow.style.cssText = 'margin-bottom:6px;';
                        toolbarRow.appendChild(toolbarColumn);
                        toolbarHost.insertBefore(toolbarRow, toolbarHost.firstChild);
                    }
                }
            }

            return new Promise(function (resolve) {
                /* Fetched in parallel with the bundle, awaited just before create. */
                var prefsPromise = _loadUserPrefs();
                _loadScript(MONACO_BUNDLE_URL, function () {
                    if (!global.monaco || !global.monaco.editor) {
                        resolve(null);
                        return;
                    }

                    _configureWorkers();

                    function createEditor(prefs) {
                        var theme = _resolveThemeFromPrefs(prefs, resolveTheme);
                        var options = _mergePrefsIntoOptions(prefs, {
                            value: initialValue,
                            language: language,
                            theme: theme,
                            automaticLayout: true,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            padding: { top: 6, bottom: 6 },
                            fixedOverflowWidgets: true,
                            readOnly: !!readonlyShadow,
                        });
                        options.fontSize = 12; // matches ServiceNow's native Monaco field editors
                        for (var optKey in config.editorOptions) {
                            if (Object.prototype.hasOwnProperty.call(config.editorOptions, optKey)) {
                                options[optKey] = config.editorOptions[optKey];
                            }
                        }
                        var editor = global.monaco.editor.create(container, options);
                        editorInstance = editor;
                        global.monaco.editor.setTheme(theme);

                        if (autoGrow) {
                            var updateGrowHeight = function () {
                                // container's CSS max-height clamps the rendered box; Monaco scrolls internally past that
                                var target = Math.max(minHeightPx, editor.getContentHeight());
                                container.style.height = target + 'px';
                            };
                            editor.onDidContentSizeChange(updateGrowHeight);
                            updateGrowHeight();
                        }

                        editor.onDidChangeModelContent(function () {
                            var liveTextarea = _liveTextarea();
                            liveTextarea.value = editor.getValue();
                            try {
                                liveTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                                liveTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                            } catch (e) {}
                        });

                        // Completions, IntelliSense, and language DTS are handled by core
                        init({ language: language });

                        if (typeof config.onEditorReady === 'function') {
                            config.onEditorReady(editor);
                        }

                        resolve(editor);
                    }

                    function readyWithPrefs() {
                        prefsPromise.then(createEditor);
                    }

                    // SCSS needs its Monarch tokenizer applied before the editor is created for correct first-render highlighting.
                    if (language === 'scss') {
                        _ensureScssLanguageReady(readyWithPrefs);
                    } else {
                        readyWithPrefs();
                    }
                });
            });
        }

        return install(); // _loadScript returns immediately if Monaco is already preloaded
    }

    global.SNMonacoPlusBootstrap = {
        init: init,
        registerUnicodeHover: registerUnicodeHover,
        ensureCoreLoaded: ensureCoreLoaded,
        upgradeEditor: upgradeEditor,
        getUserPrefs: _loadUserPrefs,
        coreUrl: CORE_UI_SCRIPT_URL,
    };
})(typeof window !== 'undefined' ? window : globalThis);

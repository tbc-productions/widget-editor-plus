/**
 * ============================================================================
 * UI Script: monaco_plus_core
 * ============================================================================
 * Purpose: Core Monaco enhancement library — the bulk of Widget Editor+'s
 * IntelliSense. Loaded on-demand via SNMonacoPlusBootstrap.init(); see
 * monaco_plus_bootstrap for config options and the loading sequence.
 *
 * Contains:
 *   - Script Include parsing (methods/typedefs/constants) and dot-completion,
 *     hover, and signature-help providers for this.X / instance.X
 *   - GlideRecord/GlideRecordSecure field completion & hover, including
 *     inherited fields via a sys_dictionary + sys_db_object.super_class walk
 *   - Table-name completions for GlideRecord/GlideAggregate constructors
 *   - SN server/client TypeScript DTS loading & runtime patching (strips
 *     primitive-type augmentations, fixes the non-constructable
 *     GlideRecordSecure declaration)
 *   - CSS/SCSS custom-property completions & hover
 *   - HTML class-attribute completion index, from the chosen portal/theme's compiled CSS
 *   - Angular Provider (service/factory) IntelliSense on api.controller's injected parameters
 *   - AngularJS widget 'api' object DI-aware typing (client panes)
 *   - Quick-info hover replacement (works around SN's broken JSDoc rendering)
 *   - window.SNMonacoPlus.init(config) — the main per-language entry point
 * ============================================================================
 */
/* global ScriptLoader */
(function (global) {
    'use strict';

    if (global.SNMonacoPlus && typeof global.SNMonacoPlus.init === 'function') {
        return;
    }

    var _initialized = false;
    var _globalSetupDone = false;
    var _initializedLangs = {};
    var _codeActionsGetRemBase = function () {
        return 16;
    };
    var _pollIntervalMs = 200;
    var _maxWaitMs = 10000;
    var _v = '2026-08-29T14:00';
    var _definitionUrl = 'monaco_language_server.jsdbx?sysparm_substitute=false&v=' + _v;
    var _clientDefinitionUrl = 'monaco_language_client.jsdbx?sysparm_substitute=false&v=' + _v;
    var _codeActionsUrl = 'monaco_code_actions.jsdbx?sysparm_substitute=false&v=' + _v;
    var _htmlMonarchUrl = 'monaco_language_html.jsdbx?sysparm_substitute=false&v=' + _v;
    var _cssLanguageUrl = 'monaco_language_css.jsdbx?sysparm_substitute=false&v=' + _v;
    var _api = {
        init: init,
        loadSnTypeDefinitions: function () {},
        loadServerMonarchDts: function () {},
        loadClientMonarchDts: function (cb) {
            if (typeof cb === 'function') {
                cb();
            }
        },
        loadHtmlMonarchDts: function (cb) {
            if (typeof cb === 'function') {
                cb();
            }
        },
        loadCssLanguageDts: function (cb) {
            if (typeof cb === 'function') {
                cb();
            }
        },
        loadCodeActions: function () {},
        markAngularModel: function (modelId) {
            _api.loadCodeActions({ modelId: modelId, isAngular: true });
        },
        scanAndFetchSIs: function () {},
        scanAndFetchProviders: function () {},
        scanLocalTypedefs: function () {},
        notifyScriptContextFocus: function () {},
        getSiSysId: function () {
            return null;
        },
        checkSiExists: function (name, cb) {
            cb(null, null);
        },
        loadCssVariables: function () {},
        loadScssVariables: function () {},
        loadHtmlClassIndex: function () {},
        loadCssEditorSupport: function () {},
        setUnusedVarsEnabled: function (enabled) {
            _showUnusedVars = !!enabled;
            if (!window.monaco || !monaco.editor) return;
            monaco.editor.getModels().forEach(function (model) {
                var lang = model.getLanguageId();
                if (lang !== 'javascript' && lang !== 'typescript') return;
                if (!_showUnusedVars) {
                    monaco.editor.setModelMarkers(model, 'we-unused', []);
                } else if (_scheduleUnusedRefresh) {
                    _scheduleUnusedRefresh(model);
                }
            });
        },
    };

    var _showUnusedVars = true;
    var _scheduleUnusedRefresh = null;

    /* Per-class SI parse caches: methods, typedef interfaces, static constants; keyed by class name. */
    var _siMethodCache = {};
    var _siInterfaceCache = {};
    var _siConstantCache = {};
    var _siPropertyCache = {};
    var _siPendingCache = {};

    /* { ClassName: true } — classes with a full d.ts, filtered from SN's untyped overloads to prevent type merging. */
    var _siProtectedClasses = {};
    var _addExtraLibFilterInstalled = false;

    /* Matches SN's Number/String/Boolean/Any-extends-GlideElement augmentations. */
    var _PRIM_AUG_RE =
        /(?:declare\s+)?interface\s+(?:Number|String|Boolean|Any)\s+extends\s+GlideElement\b[^{]*\{[^}]*\}/g;
    var _primitiveAugsCleaned = false;

    /* Lazy SI name cache: sys_id when confirmed, '' when confirmed non-SI, absent when unchecked. */
    var _siNameMap = {};
    var _siNameChecks = Object.create(null);

    /* { lowercasedPrefix: true } — prefixes whose _fetchSiByPrefix result was under SI_PREFIX_LIMIT, so _siNameMap is known-complete for that prefix (and any longer prefix built on it). */
    var _siCompletePrefixes = {};
    var SI_PREFIX_LIMIT = 500;

    /* { name: true } — SI names already fetched or in-flight via _fetchSIIntellisense. */
    var _siFetched = {};

    /* { TableName: FieldDescriptor[] } — merged own + inherited fields for the table. */
    var _tableFieldCache = {};
    var _tablePendingCache = {};

    /* { TableName: FieldDescriptor[] } — fields defined directly on one table (no inheritance). */
    var _ownTableFieldCache = {};
    var _ownTablePendingCache = {};

    /* { TableName: Promise<string[]> } — [table, parent, grandparent, ...] via super_class. */
    var _tableHierarchyCache = {};

    /* { name: string, value: string }[] — CSS custom properties loaded from sys_properties. */
    var _cssVarCache = null;
    var _cssVarCompletionRegistered = false;

    /* { name: string, value: string }[] — SCSS variables loaded from sys_properties. */
    var _scssVarCache = null; // null = not yet fetched; [] = fetched (empty or error)
    var _scssVarPromise = null; // in-flight XHR promise — deduplicates concurrent requests
    var _scssVarCompletionRegistered = false;
    var _scssVarHoverRegistered = false;

    /* HTML class-name completion index, sourced from monaco.plus.html.class_stylesheets (sp_css sys_ids). */
    var _htmlClassIndexPromise = null; // in-flight/completed load — deduplicates concurrent triggers for the same portal/theme
    var _htmlClassIndexContextKey = null; // 'portalUrlSuffix::themeSysId' the current/last promise was resolved for
    var _htmlClassIndexCacheKey = 'we_html_class_index_cache';
    var _htmlClassIndexHasRealContext = false; // true once any call has carried a real portal/theme

    /* Provider registration flags — prevent double-registration on the same page. */
    var _completionRegistered = false;
    var _hoverRegistered = false;
    var _sigHelpRegistered = false;
    var _newSiRegistered = false;
    var _grStringCompletionRegistered = false;
    var _grStringHoverRegistered = false;
    var _grConstructorCompletionRegistered = false;
    var _siParamStringCompletionRegistered = false;

    /* 'table.field' → field descriptor | null — for string-arg hover. */
    var _fieldDocCache = {};

    var _clientMonarchLoading = false;
    var _clientMonarchPending = [];
    /* AngularJS DI-aware api.controller signature (see _installClientDiWatcher). */
    var _clientDiWatcherInstalled = false;
    var _clientDiLastParamsKey = null;
    var _clientDiTimers = {};
    /* Replacement TS/JS quick-info hover (see _installQuickInfoHover). */
    var _qiHoverInstalled = false;
    var _qiKeepAliveTimer = null;
    var _htmlMonarchLoading = false;
    var _htmlMonarchPending = [];
    var _cssLanguageLoading = false;
    var _cssLanguagePending = [];
    var _codeActionsLoading = false;
    var _codeActionsReady = false;
    var _codeActionsPendingAngular = [];

    ///////////////////////////////////////////
    // Shared utilities
    ///////////////////////////////////////////

    function _logError(title, msg) {
        console.error(
            '%c[Monaco Editor+] ⚠️  ' + title + '%c\n' + msg,
            'color: #c21c0a; font-weight: bold; font-size: 12px;',
            'color: #666; font-size: 11px;'
        );
    }

    function _flushPending(pending) {
        pending.splice(0).forEach(function (fn) {
            fn();
        });
    }

    function _loadScript(url, onLoad, onError) {
        var script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = onLoad;
        script.onerror = onError;
        document.head.appendChild(script);
    }

    /* Extracts a scalar from a REST field that may be a plain string or a {value, display_value} object. */
    function _snVal(v, fallback) {
        if (v == null) {
            return fallback != null ? fallback : '';
        }
        return typeof v === 'object' ? v.value || v.display_value || fallback || '' : v || fallback || '';
    }

    ///////////////////////////////////////////
    // Polling
    ///////////////////////////////////////////

    /**
     * Polls until Monaco (and, for JS/TS languages, its TypeScript language
     * service) is available, then invokes cb. Gives up silently after _maxWaitMs.
     *
     * @param {Function} cb       - Callback invoked once Monaco is ready.
     * @param {string}  [langHint] - Optional language hint. When 'css', 'scss',
     *                               or 'html', TypeScript readiness is not required
     *                               because those languages don't use the TS service.
     */
    function waitForMonaco(cb, langHint) {
        var needsTypeScript = langHint !== 'css' && langHint !== 'scss' && langHint !== 'html';
        var elapsed = 0;
        var timer = setInterval(function () {
            elapsed += _pollIntervalMs;
            var monacoReady = window.monaco && monaco.languages;
            var tsReady = !needsTypeScript || (monaco.languages && monaco.languages.typescript);
            if (monacoReady && tsReady) {
                clearInterval(timer);
                cb();
            } else if (elapsed >= _maxWaitMs) {
                clearInterval(timer);
                _logError(
                    'Initialization Error',
                    'Timeout waiting for Monaco Editor to load (>' +
                        _maxWaitMs +
                        'ms).\n' +
                        'Ensure the page has loaded the Monaco Editor library before calling SNMonacoPlus.init().'
                );
            }
        }, _pollIntervalMs);
    }

    ///////////////////////////////////////////
    // JSDoc parsing
    ///////////////////////////////////////////

    /**
     * Converts a JSDoc type annotation string to its TypeScript equivalent.
     *
     * @param {string} jsType - JSDoc type string (e.g. 'boolean', 'Array<string>').
     * @returns {string} The corresponding TypeScript type, or 'any' if unrecognised.
     */
    function jsDocTypeToTs(jsType) {
        if (!jsType) {
            return 'any';
        }
        var t = jsType.trim();
        if (t.indexOf('|') !== -1) {
            return t.split('|').map(jsDocTypeToTs).join(' | ');
        }
        var arr = t.match(/^Array<(.+)>$/i);
        if (arr) {
            return jsDocTypeToTs(arr[1]) + '[]';
        }
        if (/\[\]$/.test(t)) {
            return jsDocTypeToTs(t.slice(0, -2)) + '[]';
        }
        var map = {
            string: 'string',
            String: 'string',
            number: 'number',
            Number: 'number',
            int: 'number',
            Integer: 'number',
            float: 'number',
            Float: 'number',
            boolean: 'boolean',
            Boolean: 'boolean',
            bool: 'boolean',
            object: 'object',
            Object: 'object',
            void: 'void',
            null: 'null',
            undefined: 'undefined',
            '*': 'any',
            any: 'any',
        };
        return map[t] !== undefined ? map[t] : t;
    }

    /**
     * Parses @param and @returns JSDoc tags from a block comment string.
     *
     * @param {string} comment - Raw block comment text including delimiters.
     * @returns {{ params: Object, returns: string }}
     */
    function parseSiDocComment(comment) {
        var result = {
            params: {},
            returns: 'any',
        };
        if (!comment) {
            return result;
        }
        var paramRe = /@param\s+\{([^}]+)\}\s+(\[?)(\w+)\]?[ \t]*(?:-[ \t]*)?([^\r\n]*)/g;
        var pm;
        while ((pm = paramRe.exec(comment)) !== null) {
            var desc = pm[4] ? pm[4].trim() : null;
            result.params[pm[3]] = {
                type: jsDocTypeToTs(pm[1]),
                optional: pm[2] === '[',
                description: desc || null,
            };
        }
        var retMatch = comment.match(/@returns?\s+\{([^}]+)\}/);
        if (retMatch) {
            result.returns = jsDocTypeToTs(retMatch[1]);
        }
        return result;
    }

    /**
     * Extracts all @typedef {Object} declarations from a Script Include script
     * and returns them as TypeScript interface declaration strings.
     *
     * @param {string} script - Full content of a Script Include script field.
     * @returns {string[]} Array of \`interface Name { ... }\` declaration strings.
     */
    function parseSiTypedefs(script) {
        var interfaces = [];
        var blockRe = /\/\*\*([\s\S]*?)\*\//g;
        var block;
        while ((block = blockRe.exec(script)) !== null) {
            var body = block[1];
            var typedefMatch = body.match(/@typedef\s+\{Object\}\s+(\w+)/i);
            if (!typedefMatch) {
                continue;
            }
            var name = typedefMatch[1];
            var props = [];
            /* Captures trailing description for hover; \`[name]\` marks the property optional. */
            var propRe = /@property\s*\{([^}]+)\}\s*(\[?)([\w$]+)\]?[ \t]*(?:-[ \t]*)?([^\r\n]*)/g;
            var pm;
            while ((pm = propRe.exec(body)) !== null) {
                var propDesc = pm[4].replace(/\s*\*+\/?\s*$/, '').trim();
                if (propDesc) {
                    props.push('    /** ' + propDesc + ' */');
                }
                props.push('    ' + pm[3] + (pm[2] ? '?' : '') + ': ' + jsDocTypeToTs(pm[1]) + ';');
            }
            interfaces.push('interface ' + name + ' {\n' + props.join('\n') + '\n}');
        }
        return interfaces;
    }

    /**
     * Registers a model's own \`@typedef {Object}\` blocks as real TypeScript
     * interfaces so \`@type\` references to them resolve immediately, without
     * waiting on an external \`new ClassName()\` reference (the SI-to-SI path)
     * to trigger a fetch. Each pane gets its own URI so switching panes doesn't
     * leak one widget's typedefs into another's model.
     *
     * @param {string} modelId - Unique key for the editing pane (e.g. pane.key).
     * @param {string} content - Full text of the model.
     */
    function _registerLocalTypedefs(modelId, content) {
        if (!window.monaco || !monaco.languages || !monaco.languages.typescript) {
            return;
        }
        var dts = parseSiTypedefs(content || '').join('\n\n');
        var uri = 'ts:snlib-local-typedefs-' + modelId + '.d.ts';
        monaco.languages.typescript.typescriptDefaults.addExtraLib(dts, uri);
        monaco.languages.typescript.javascriptDefaults.addExtraLib(dts, uri);
    }

    /**
     * Converts a raw JavaScript value string to a TypeScript type. Literal
     * primitives get their literal type; object/array/function values get a
     * best-effort structural or generic type — a static property is never
     * dropped just because its value isn't a simple literal.
     *
     * @param {string} rawValue - Right-hand side of an assignment (trimmed).
     * @returns {string}
     */
    function inferConstantType(rawValue) {
        var v = rawValue.trim().replace(/\s*;.*$/, '');
        if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(v)) {
            return v;
        }
        if (v === 'true' || v === 'false') {
            return v;
        }
        var q = v.charAt(0);
        if ((q === "'" || q === '"') && v.charAt(v.length - 1) === q) {
            return '"' + v.slice(1, -1).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        }
        if (/^(?:async\s+)?function\b/.test(v)) {
            return '(...args: any[]) => any';
        }
        if (v.charAt(0) === '{' && v.charAt(v.length - 1) === '}') {
            return _inferObjectLiteralType(v);
        }
        if (v.charAt(0) === '[' && v.charAt(v.length - 1) === ']') {
            return 'any[]';
        }
        return 'any';
    }

    /**
     * Infers a flat TypeScript object type from an object literal's source text,
     * recursing into each field's value via inferConstantType. Falls back to
     * Record<string, any> when no fields can be parsed out.
     *
     * @param {string} objLiteral - Object literal source, including braces.
     * @returns {string}
     */
    function _inferObjectLiteralType(objLiteral) {
        var inner = objLiteral.slice(1, -1);
        var pairRe = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(\{[\s\S]*?\}|\[[\s\S]*?\]|[^,}]+)/g;
        var fields = [];
        var m;
        while ((m = pairRe.exec(inner)) !== null) {
            fields.push(m[1] + ': ' + inferConstantType(m[2].trim()));
        }
        return fields.length ? '{ ' + fields.join('; ') + ' }' : 'Record<string, any>';
    }

    /**
     * Parses static property assignments of the form \`ClassName.PROP = value;\`
     * from a Script Include script, returning descriptors for use in DTS generation.
     * An optional JSDoc comment immediately above an assignment is captured as
     * documentation. Object, array, and function values are included with a
     * best-effort type via inferConstantType rather than being dropped.
     *
     * @param {string} script    - Full content of a Script Include script field.
     * @param {string} className - Script Include class name.
     * @returns {Array<{name: string, tsType: string, documentation: string}>}
     */
    function parseSiConstants(script, className) {
        var constants = [];
        var properties = [];
        var escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp(
            '(\\/\\*\\*(?:(?!\\*\\/)[\\s\\S])*\\*\\/)?\\s*' +
                escaped +
                '\\.(\\w+)\\s*=\\s*(\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\]|[^\\n;]+)',
            'g'
        );
        var m;
        while ((m = re.exec(script)) !== null) {
            if (m[2] === 'prototype') {
                continue;
            }
            var tsType = inferConstantType(m[3]);
            var doc = '';
            if (m[1]) {
                doc = m[1]
                    .replace(/^\/\*+\s*/, '')
                    .replace(/\s*\*+\/$/, '')
                    .replace(/^\s*\*\s?/gm, '')
                    .trim();
            }
            constants.push({ name: m[2], tsType: tsType, documentation: doc });
        }
        return constants;
    }

    /**
     * Infers the TypeScript type string for a prototype property value expression.
     *
     * @param {string} rawValue - Property value string.
     * @returns {string} TypeScript type string.
     */
    function inferPropertyValueType(rawValue) {
        if (!rawValue) {
            return 'any';
        }
        var v = rawValue
            .trim()
            .replace(/\s*;.*$/, '')
            .replace(/,$/, '')
            .trim();
        if (
            (v.charAt(0) === "'" || v.charAt(0) === '"' || v.charAt(0) === '`') &&
            v.charAt(v.length - 1) === v.charAt(0)
        ) {
            return 'string';
        }
        if (/^-?(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?|\.\d+)$/.test(v)) {
            return 'number';
        }
        if (v === 'true' || v === 'false') {
            return 'boolean';
        }
        if (v.charAt(0) === '[') {
            return 'any[]';
        }
        if (v.charAt(0) === '{') {
            return 'Record<string, any>';
        }
        var newMatch = v.match(/^new\s+([A-Z][A-Za-z0-9_]*)\b/);
        if (newMatch) {
            return newMatch[1];
        }
        if (v === 'null' || v === 'undefined') {
            return 'any';
        }
        return 'any';
    }

    /**
     * Replaces every function body with an empty block so prototype-property
     * scanning only sees top-level members. Brace-balanced (skipping strings
     * and comments) because a non-greedy regex stops at the first \`}\` and
     * leaks the keys of any object literal returned from a method.
     *
     * @param {string} script - Full content of a Script Include script field.
     * @returns {string} Script with all function bodies collapsed to \`{}\`.
     */
    function _stripFunctionBodies(script) {
        var out = '';
        var i = 0;
        var n = script.length;
        while (i < n) {
            var idx = script.indexOf('function', i);
            if (idx === -1) {
                out += script.slice(i);
                break;
            }
            var open = script.indexOf('{', idx);
            if (open === -1) {
                out += script.slice(i);
                break;
            }
            out += script.slice(i, open) + '{}';

            var depth = 0;
            var inStr = null;
            var j = open;
            for (; j < n; j++) {
                var ch = script.charAt(j);
                if (inStr) {
                    if (ch === '\\') {
                        j++;
                    } else if (ch === inStr) {
                        inStr = null;
                    }
                    continue;
                }
                if (ch === '"' || ch === "'") {
                    inStr = ch;
                    continue;
                }
                if (ch === '/' && script.charAt(j + 1) === '*') {
                    var blockEnd = script.indexOf('*/', j + 2);
                    j = blockEnd === -1 ? n : blockEnd + 1;
                    continue;
                }
                if (ch === '/' && script.charAt(j + 1) === '/') {
                    var lineEnd = script.indexOf('\n', j);
                    j = lineEnd === -1 ? n : lineEnd;
                    continue;
                }
                if (ch === '{') {
                    depth++;
                } else if (ch === '}') {
                    depth--;
                    if (depth === 0) {
                        j++;
                        break;
                    }
                }
            }
            i = j;
        }
        return out;
    }

    /**
     * Parses all PrototypeJS prototype properties from a Script Include script string.
     * Extracts property names, inferred or JSDoc-annotated TypeScript types, and
     * documentation comments for use in completions, hover tooltips, and DTS generation.
     *
     * @param {string} script - Full content of a Script Include script field.
     * @param {string} [className] - Script Include class name, used to recognise the
     *   PrototypeJS type: 'ClassName' boilerplate so it can be excluded without also
     *   hiding a real property named 'type'.
     * @returns {Array<{name: string, tsType: string, documentation: string}>}
     */
    function parseSiProperties(script, className) {
        var properties = [];
        var seen = {};

        function addProp(name, rawValue, comment) {
            if (!name || name === 'initialize' || seen[name]) {
                return;
            }
            /* Skip only PrototypeJS's auto-generated type: 'ClassName' marker, not a
             * real property that happens to be named 'type'. */
            if (name === 'type' && className && rawValue) {
                var _typeVal = rawValue.trim();
                var _quote = _typeVal.charAt(0);
                if (
                    (_quote === "'" || _quote === '"') &&
                    _typeVal.charAt(_typeVal.length - 1) === _quote &&
                    _typeVal.slice(1, -1) === className
                ) {
                    return;
                }
            }
            if (rawValue && /^\s*(?:async\s+)?function\b/.test(rawValue.trim())) {
                return;
            }

            var tsType = null;
            if (comment) {
                var typeMatch = comment.match(/@type\s*\{([^}]+)\}/);
                if (typeMatch) {
                    tsType = jsDocTypeToTs(typeMatch[1]);
                }
            }

            if (!tsType && rawValue) {
                tsType = inferPropertyValueType(rawValue);
            }

            var docLines = [];
            if (comment) {
                var descText = comment
                    .replace(/^\/\*+\s*/, '')
                    .replace(/\s*\*+\/$/, '')
                    .replace(/^\s*\*\s?/gm, '');
                var descMatch = descText.match(/^([\s\S]*?)(?=\s*@|\s*$)/);
                if (descMatch && descMatch[1].trim()) {
                    docLines.push(descMatch[1].trim());
                } else {
                    /* One-liners put the text after the tag: @type{X} Description. */
                    var tagDesc = descText.match(/@type\s*\{[^}]*\}[ \t]*([^\r\n]+)/);
                    if (tagDesc && tagDesc[1].trim()) {
                        docLines.push(tagDesc[1].trim());
                    }
                }
            }

            seen[name] = true;
            properties.push({
                name: name,
                tsType: tsType || 'any',
                documentation: docLines.join('\n\n'),
            });
        }

        /* Pattern 1: Object literal properties: key: value (not starting with function) */
        var prototypeScript = _stripFunctionBodies(script);
        var propRe =
            /(\/\*\*[\s\S]*?\*\/|\/\*[\s\S]*?\*\/)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(?!function\b)([^,\}\n]+|\[[\s\S]*?\]|\{[\s\S]*?\})/g;
        var m;
        while ((m = propRe.exec(prototypeScript)) !== null) {
            addProp(m[2], m[3], m[1] || null);
        }

        /* Pattern 2: Direct prototype assignments: ClassName.prototype.key = value; */
        var directRe =
            /(\/\*\*[\s\S]*?\*\/|\/\*[\s\S]*?\*\/)?\s*(?:[A-Z]\w*|this)\.prototype\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?!function\b)([^;\n]+)/g;
        while ((m = directRe.exec(script)) !== null) {
            addProp(m[2], m[3], m[1] || null);
        }

        /* Pattern 3: Property assignments to this inside methods/constructor: this.key = value; */
        var thisPropRe =
            /(\/\*\*[\s\S]*?\*\/|\/\*[\s\S]*?\*\/)?\s*\bthis\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?!function\b)([^;\n]+)/g;
        while ((m = thisPropRe.exec(script)) !== null) {
            addProp(m[2], m[3], m[1] || null);
        }

        return properties;
    }

    /**
     * Parses all PrototypeJS prototype methods from a Script Include script string.
     * Extracts method names, typed parameter signatures built from JSDoc @param
     * annotations, return types from @returns, and markdown documentation strings
     * for use in completions, hover tooltips, and signature help.
     *
     * @param {string} script - Full content of a Script Include script field.
     * @returns {Array<Object>} Parsed method descriptors.
     */
    function parseSiMethods(script) {
        var methods = [];
        var re = /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/|\/\*(?:(?!\*\/)[\s\S])*\*\/)?\s*(\w+)\s*:\s*function\s*\(([^)]*)\)/g;
        var m;
        while ((m = re.exec(script)) !== null) {
            var methodName = m[2];

            var comment = m[1] || null;
            var docInfo = parseSiDocComment(comment);
            var rawParams = m[3]
                .split(',')
                .map(function (p) {
                    return p.trim();
                })
                .filter(Boolean);

            var typedParams = rawParams
                .map(function (p) {
                    var info = docInfo.params[p];
                    return info ? p + (info.optional ? '?' : '') + ': ' + info.type : p + ': any';
                })
                .join(', ');

            var docLines = [];
            if (comment) {
                var descText = comment
                    .replace(/^\/\*+\s*/, '')
                    .replace(/\s*\*+\/$/, '')
                    .replace(/^\s*\*\s?/gm, '');
                var descMatch = descText.match(/^([\s\S]*?)(?=\s*@|\s*$)/);
                if (descMatch && descMatch[1].trim()) {
                    docLines.push(descMatch[1].trim());
                }
            }

            rawParams.forEach(function (p) {
                var info = docInfo.params[p];
                if (info && info.description) {
                    docLines.push('*@param* `' + p + '` \u2014 ' + info.description);
                }
            });

            if (docInfo.returns !== 'any') {
                docLines.push('*@returns* `' + docInfo.returns + '`');
            }

            if (methodName === 'initialize') {
                methods.unshift({
                    name: 'initialize',
                    signature: 'constructor(' + typedParams + ')',
                    documentation: docLines.join('\n\n'),
                    isConstructor: true,
                });
                continue;
            }

            var paramDocs = {};
            rawParams.forEach(function (p) {
                var info = docInfo.params[p];
                if (info && info.description) {
                    paramDocs[p] = info.description;
                }
            });

            methods.push({
                name: methodName,
                signature: methodName + '(' + typedParams + '): ' + docInfo.returns,
                documentation: docLines.join('\n\n'),
                params: rawParams,
                paramDocs: paramDocs,
                isConstructor: false,
            });
        }
        return methods;
    }

    /**
     * Fetches and parses methods for a named Script Include from the REST API.
     * Results are cached per class name; concurrent requests for the same name
     * are deduplicated via _siPendingCache.
     *
     * @param {string} className - Script Include name (e.g. 'MyUtils').
     * @returns {Promise<Array<Object>>}
     */
    function fetchSiMethods(className) {
        if (_siMethodCache[className]) {
            return Promise.resolve(_siMethodCache[className]);
        }

        if (!_siPendingCache[className]) {
            _siPendingCache[className] = new Promise(function (resolve) {
                var xhr = new XMLHttpRequest();
                var url =
                    '/api/now/table/sys_script_include' +
                    '?sysparm_query=name%3D' +
                    encodeURIComponent(className) +
                    '%5Eactive%3Dtrue' +
                    '&sysparm_fields=script%2Cname&sysparm_limit=1';
                xhr.open('GET', url, true);
                xhr.setRequestHeader('X-UserToken', window.g_ck || '');
                xhr.setRequestHeader('Accept', 'application/json');
                xhr.onload = function () {
                    var methods = null;
                    var interfaces = [];
                    var constants = [];
                    var properties = [];
                    try {
                        if (xhr.status === 200) {
                            var data = JSON.parse(xhr.responseText);
                            var records = data && data.result;
                            if (records && Array.isArray(records)) {
                                if (records.length > 0) {
                                    var script = records[0].script || '';
                                    methods = parseSiMethods(script);
                                    interfaces = parseSiTypedefs(script);
                                    constants = parseSiConstants(script, className);
                                    properties = parseSiProperties(script, className);
                                } else {
                                    methods = [];
                                }
                            }
                        }
                    } catch (e) {}
                    if (methods !== null) {
                        _siMethodCache[className] = methods;
                        _siInterfaceCache[className] = interfaces;
                        _siConstantCache[className] = constants;
                        _siPropertyCache[className] = properties;
                        _registerSiDts(className, methods, interfaces, constants, properties);
                    } else {
                        methods = [];
                    }
                    delete _siPendingCache[className];
                    resolve(methods);
                };
                xhr.onerror = function () {
                    delete _siPendingCache[className];
                    resolve([]);
                };
                xhr.send();
            });
        }

        return _siPendingCache[className];
    }

    /**
     * Fetches field descriptors defined directly on one table (no inheritance).
     * @param {string} tableName - ServiceNow table name (e.g. 'incident').
     * @returns {Promise<Array<Object>>}
     */
    function _fetchOwnTableFields(tableName) {
        if (_ownTableFieldCache[tableName]) {
            return Promise.resolve(_ownTableFieldCache[tableName]);
        }

        if (!_ownTablePendingCache[tableName]) {
            _ownTablePendingCache[tableName] = new Promise(function (resolve) {
                var xhr = new XMLHttpRequest();
                var url =
                    '/api/now/table/sys_dictionary' +
                    '?sysparm_query=name%3D' +
                    encodeURIComponent(tableName) +
                    '%5Einternal_type%21%3Dcollection%5EelementISNOTEMPTY' +
                    '&sysparm_fields=element%2Cinternal_type%2Ccolumn_label%2Cmandatory%2Cmax_length%2Creference' +
                    '&sysparm_limit=500';
                xhr.open('GET', url, true);
                xhr.setRequestHeader('X-UserToken', window.g_ck || '');
                xhr.setRequestHeader('Accept', 'application/json');
                xhr.onload = function () {
                    var fields = null;
                    try {
                        if (xhr.status === 200) {
                            var data = JSON.parse(xhr.responseText);
                            var records = data && data.result;
                            if (records && Array.isArray(records)) {
                                fields = records.map(function (r) {
                                    var name = _snVal(r.element);
                                    var type = _snVal(r.internal_type, 'string');
                                    var label = _snVal(r.column_label) || name;
                                    var maxLen = _snVal(r.max_length);
                                    var ref = _snVal(r.reference);
                                    return {
                                        name: String(name),
                                        type: String(type),
                                        label: String(label),
                                        mandatory: r.mandatory === 'true' || r.mandatory === true,
                                        max_length: maxLen ? Number(maxLen) : null,
                                        reference: ref ? String(ref) : null,
                                    };
                                });
                            }
                        }
                    } catch (e) {}
                    if (fields !== null) {
                        _ownTableFieldCache[tableName] = fields;
                    } else {
                        fields = [];
                    }
                    delete _ownTablePendingCache[tableName];
                    resolve(fields);
                };
                xhr.onerror = function () {
                    delete _ownTablePendingCache[tableName];
                    resolve([]);
                };
                xhr.send();
            });
        }

        return _ownTablePendingCache[tableName];
    }

    /**
     * Walks a table's super_class chain: [tableName, parent, grandparent, ...].
     * @param {string} tableName - ServiceNow table name.
     * @returns {Promise<string[]>}
     */
    function _fetchTableHierarchy(tableName) {
        if (_tableHierarchyCache[tableName]) {
            return _tableHierarchyCache[tableName];
        }

        _tableHierarchyCache[tableName] = new Promise(function (resolve) {
            var chain = [];

            function step(name) {
                if (!name || chain.indexOf(name) !== -1) {
                    resolve(chain);
                    return;
                }
                chain.push(name);

                var xhr = new XMLHttpRequest();
                var url =
                    '/api/now/table/sys_db_object' +
                    '?sysparm_query=name%3D' +
                    encodeURIComponent(name) +
                    '&sysparm_fields=super_class.name&sysparm_limit=1';
                xhr.open('GET', url, true);
                xhr.setRequestHeader('X-UserToken', window.g_ck || '');
                xhr.setRequestHeader('Accept', 'application/json');
                xhr.onload = function () {
                    var parent = null;
                    try {
                        if (xhr.status === 200) {
                            var data = JSON.parse(xhr.responseText);
                            var rec = data && data.result && data.result[0];
                            parent = rec ? _snVal(rec['super_class.name']) : null;
                        }
                    } catch (e) {}
                    step(parent || null);
                };
                xhr.onerror = function () {
                    resolve(chain);
                };
                xhr.send();
            }

            step(tableName);
        });

        return _tableHierarchyCache[tableName];
    }

    /**
     * Fetches field descriptors for a table, merged with all inherited fields.
     * @param {string} tableName - ServiceNow table name (e.g. 'incident').
     * @returns {Promise<Array<Object>>}
     */
    function fetchTableFields(tableName) {
        if (_tableFieldCache[tableName]) {
            return Promise.resolve(_tableFieldCache[tableName]);
        }

        if (!_tablePendingCache[tableName]) {
            _tablePendingCache[tableName] = _fetchTableHierarchy(tableName).then(function (chain) {
                return Promise.all((chain.length ? chain : [tableName]).map(_fetchOwnTableFields)).then(
                    function (fieldLists) {
                        var merged = {};
                        for (var i = fieldLists.length - 1; i >= 0; i--) {
                            fieldLists[i].forEach(function (f) {
                                merged[f.name] = f;
                            });
                        }
                        var fields = Object.keys(merged).map(function (k) {
                            return merged[k];
                        });
                        _tableFieldCache[tableName] = fields;
                        delete _tablePendingCache[tableName];
                        return fields;
                    }
                );
            });
        }

        return _tablePendingCache[tableName];
    }

    /**
     * Fetches dictionary metadata for a single field using the cached table fields.
     * Returns a Promise resolving to the field descriptor or null if not found.
     *
     * @param {string} table - ServiceNow table name.
     * @param {string} field - Field element name.
     * @returns {Promise<Object|null>}
     */
    function fetchFieldDoc(table, field) {
        var key = table + '.' + field;
        if (key in _fieldDocCache) {
            return Promise.resolve(_fieldDocCache[key]);
        }
        return fetchTableFields(table).then(function (fields) {
            var found = fields
                ? fields.find(function (f) {
                      return f.name === field;
                  })
                : null;
            _fieldDocCache[key] = found || null;
            return found || null;
        });
    }

    /**
     * Fetches up to TABLE_PREFIX_LIMIT table names from sys_db_object whose name starts
     * with the given prefix, excluding internal tables (nameNOT LIKE00). Always fires a
     * fresh XHR so results stay accurate as the user types. An empty prefix returns the
     * first TABLE_PREFIX_LIMIT matching tables alphabetically.
     *
     * @param {string} prefix - The typed prefix to match against table names.
     * @returns {Promise<Array<{name: string, label: string}>>}
     */
    var TABLE_PREFIX_LIMIT = 500;
    function fetchTablesMatching(prefix) {
        return new Promise(function (resolve) {
            var xhr = new XMLHttpRequest();
            var query = 'nameNOT LIKE00' + (prefix ? '^nameSTARTSWITH' + prefix : '') + '^ORDERBYname';
            var url =
                '/api/now/table/sys_db_object' +
                '?sysparm_query=' +
                encodeURIComponent(query) +
                '&sysparm_fields=name%2Clabel&sysparm_limit=' +
                TABLE_PREFIX_LIMIT;
            xhr.open('GET', url, true);
            xhr.setRequestHeader('X-UserToken', window.g_ck || '');
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.onload = function () {
                try {
                    if (xhr.status === 200) {
                        var data = JSON.parse(xhr.responseText);
                        var records = data && data.result;
                        if (records && Array.isArray(records)) {
                            resolve(
                                records
                                    .map(function (r) {
                                        var name = _snVal(r.name);
                                        var label = _snVal(r.label) || name;
                                        return {
                                            name: String(name),
                                            label: String(label),
                                        };
                                    })
                                    .filter(function (t) {
                                        return t.name;
                                    })
                            );
                            return;
                        }
                    }
                } catch (e) {}
                resolve([]);
            };
            xhr.onerror = function () {
                resolve([]);
            };
            xhr.send();
        });
    }

    /**
     * Scans a Monaco model for a GlideRecord or GlideRecordSecure assignment to
     * the given variable name and returns the table name string, or null if not found.
     *
     * @param {Object} model - Monaco editor model.
     * @param {string} varName - Variable name to look up.
     * @returns {string|null}
     */
    function getGlideRecordTable(model, varName) {
        var re = new RegExp(
            '(?:var|let|const)\\s+' + varName + '\\s*=\\s*new\\s+GlideRecord(?:Secure)?\\s*\\(\\s*[\'"]([^\'"]+)[\'"]',
            'g'
        );
        var m = re.exec(model.getValue());
        return m ? m[1] : null;
    }

    /**
     * Scans backward from upToLine (up to 150 lines) for an assignment of the form:
     *   [var|let|const] varName = new GlideRecord[Secure|Aggregate]('table')
     * Used by string-argument providers that need the table at the current cursor
     * line without scanning the entire file.
     *
     * @param {Object} model    - Monaco editor model.
     * @param {string} varName  - Variable name to look up.
     * @param {number} upToLine - Current line number (1-based); search starts here.
     * @returns {string|null}
     */
    function _findGrTable(model, varName, upToLine) {
        var searchFrom = Math.max(1, upToLine - 1);
        var searchTo = Math.max(1, searchFrom - 150);
        var pat = new RegExp(
            '(?:var\\s+|let\\s+|const\\s+)?' +
                varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                '\\s*=\\s*new\\s+(?:GlideRecord(?:Secure)?|GlideAggregate)\\s*\\(\\s*[\'"]([^\'"]+)[\'"]'
        );
        for (var i = searchFrom; i >= searchTo; i--) {
            var m = model.getLineContent(i).match(pat);
            if (m) {
                return m[1];
            }
        }
        return null;
    }

    /**
     * Resolves a dot-walk path through reference fields to find the final table.
     * E.g., _resolveFieldChain('incident', ['caller_id']) → 'sys_user'
     *       _resolveFieldChain('incident', ['caller_id', 'manager']) → table for manager on sys_user
     *
     * @param {string}   baseTable - The starting table name.
     * @param {string[]} dotPath   - Ordered reference-field names to traverse.
     * @returns {Promise<string|null>}
     */
    function _resolveFieldChain(baseTable, dotPath) {
        if (!dotPath || dotPath.length === 0) {
            return Promise.resolve(baseTable);
        }
        return dotPath.reduce(function (promise, seg) {
            return promise.then(function (table) {
                if (!table) {
                    return null;
                }
                return fetchTableFields(table).then(function (fields) {
                    if (!fields) {
                        return null;
                    }
                    var found = fields.find(function (f) {
                        return f.name === seg;
                    });
                    return found && found.reference ? found.reference : null;
                });
            });
        }, Promise.resolve(baseTable));
    }

    /**
     * Returns {varName, fieldName} if the cursor is over a field-name string literal
     * inside a GlideRecord method call (getValue, setValue, addQuery, orderBy, etc.).
     * Used by the string-arg hover provider.
     *
     * @param {Object} model - Monaco editor model.
     * @param {Object} pos   - Monaco position {lineNumber, column}.
     * @returns {{varName: string, fieldName: string}|null}
     */
    function _getFieldContextAtPos(model, pos) {
        var line = model.getLineContent(pos.lineNumber);
        var col = pos.column - 1; // 0-based

        var quoteChar = null,
            startIdx = -1;
        for (var i = col - 1; i >= 0; i--) {
            var c = line[i];
            if (c === '(' || c === ')' || c === ';') {
                break;
            }
            if (c === "'" || c === '"') {
                quoteChar = c;
                startIdx = i;
                break;
            }
        }
        if (quoteChar === null) {
            return null;
        }

        var endIdx = line.length;
        for (var j = col; j < line.length; j++) {
            if (line[j] === quoteChar) {
                endIdx = j;
                break;
            }
        }

        var fieldName = line.substring(startIdx + 1, endIdx);
        if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(fieldName)) {
            return null;
        }

        var before = line.substring(0, startIdx).replace(/\s+$/, '');
        var m = before.match(
            /(\w+)\.(getValue|setValue|getDisplayValue|getElement|isChanged|addQuery|addNullQuery|addNotNullQuery|orderBy|orderByDesc|addExtraField)\s*\($/
        );
        if (!m) {
            return null;
        }
        return { varName: m[1], fieldName: fieldName };
    }

    /**
     * Returns {varName, range, dotPath} if the cursor is INSIDE an opening string
     * that is the first arg of a GlideRecord/GlideAggregate field-name method, or
     * the second arg of addAggregate.  Does NOT require the string to be complete —
     * works while the developer is still typing (completion scenario).
     *
     * dotPath holds the already-completed reference-field segments before the last
     * dot, e.g. for 'caller_id.na|' dotPath=['caller_id'] and range covers 'na'.
     * For non-dot-walked strings dotPath is [].
     *
     * @param {Object} model    - Monaco editor model.
     * @param {Object} position - Monaco position {lineNumber, column}.
     * @returns {{varName: string, range: Object, dotPath: string[]}|null}
     */
    function _getFieldStringContext(model, position) {
        var line = model.getLineContent(position.lineNumber);
        var col = position.column - 1; // 0-based

        // Walk left from cursor to find the opening quote that encloses us.
        var quoteChar = null,
            startIdx = -1;
        for (var i = col - 1; i >= 0; i--) {
            var c = line[i];
            if (c === ')' || c === ';') {
                return null;
            }
            if (c === '(') {
                return null;
            } // paren-before-quote means not in a string arg
            if (c === "'" || c === '"') {
                quoteChar = c;
                startIdx = i;
                break;
            }
        }
        if (quoteChar === null) {
            return null;
        }

        // Only trigger when the partial text looks like a valid field/dot-walk fragment.
        var typed = line.substring(startIdx + 1, col);
        if (typed.length > 0 && !/^[a-zA-Z0-9_.]*$/.test(typed)) {
            return null;
        }

        // Find the closing quote (for the replacement range end).
        var endIdx = line.length;
        for (var j = col; j < line.length; j++) {
            if (line[j] === quoteChar) {
                endIdx = j;
                break;
            }
        }

        var before = line.substring(0, startIdx).replace(/\s+$/, '');
        var varName = null;

        // Primary: field name is the FIRST argument.
        var m = before.match(
            /(\w+)\.(getValue|getDisplayValue|setValue|getElement|isValidField|canRead|canWrite|addNullQuery|addNotNullQuery|orderBy|orderByDesc|addQuery|groupBy|addExtraField)\s*\($/
        );
        if (m) {
            varName = m[1];
        }

        if (!varName) {
            // Special case: addAggregate(type, fieldName) — field is SECOND argument.
            var m2 = before.match(/(\w+)\.addAggregate\s*\(\s*['"][^'"]*['"]\s*,\s*$/);
            if (m2) {
                varName = m2[1];
            }
        }

        if (!varName) {
            return null;
        }

        // Adjusts range to cover only the last dot-walk segment, so completions replace the current word, not the whole chain.
        var dotPath = [];
        var rangeStartCol = startIdx + 2; // 1-based, right after the opening quote

        var lastDot = typed.lastIndexOf('.');
        if (lastDot >= 0) {
            var pathPart = typed.substring(0, lastDot);
            dotPath = pathPart.length > 0 ? pathPart.split('.').filter(Boolean) : [];
            // rangeStartCol: 1-based column right after the last dot.
            rangeStartCol = startIdx + lastDot + 3;
        }

        var range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: rangeStartCol,
            endColumn: endIdx + 1, // 1-based, up to (not incl.) closing quote
        };

        return { varName: varName, range: range, dotPath: dotPath };
    }

    /**
     * Returns {prefix, range} if the cursor is INSIDE the table-name string argument
     * of a GlideRecord, GlideRecordSecure, or GlideAggregate constructor call.
     *   new GlideRecord('tas|')           → triggers table-name completions
     *   new GlideRecordSecure('incident|) → triggers table-name completions
     *   new GlideAggregate('|')           → triggers table-name completions
     *
     * @param {Object} model    - Monaco editor model.
     * @param {Object} position - Monaco position {lineNumber, column}.
     * @returns {{prefix: string, range: Object}|null}
     */
    function _getGrConstructorContext(model, position) {
        var line = model.getLineContent(position.lineNumber);
        var col = position.column - 1; // 0-based

        // Walk left from cursor to find the opening quote.
        var quoteChar = null,
            startIdx = -1;
        for (var i = col - 1; i >= 0; i--) {
            var c = line[i];
            if (c === ')' || c === ';') {
                return null;
            }
            if (c === '(') {
                return null;
            }
            if (c === "'" || c === '"') {
                quoteChar = c;
                startIdx = i;
                break;
            }
        }
        if (quoteChar === null) {
            return null;
        }

        var typed = line.substring(startIdx + 1, col);
        if (typed.length > 0 && !/^[a-zA-Z0-9_]*$/.test(typed)) {
            return null;
        }

        // Find the closing quote (for the replacement range end).
        var endIdx = line.length;
        for (var j = col; j < line.length; j++) {
            if (line[j] === quoteChar) {
                endIdx = j;
                break;
            }
        }

        var before = line.substring(0, startIdx).replace(/\s+$/, '');
        if (!/new\s+(?:GlideRecordSecure|GlideRecord|GlideAggregate)\s*\($/.test(before)) {
            return null;
        }

        return {
            prefix: typed,
            range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: startIdx + 2, // 1-based, right after the opening quote
                endColumn: endIdx + 1, // 1-based, up to (not incl.) closing quote
            },
        };
    }

    /**
     * Returns true if the constructor in an assignRe match is chained
     * (e.g. \`new Foo().method()\`), meaning the variable holds a return value,
     * not the SI instance.
     *
     * @param {string} modelText   - Full model text.
     * @param {Object} assignMatch - Result of \`assignRe.exec(modelText)\`.
     * @returns {boolean}
     */
    function _isChainedConstructor(modelText, assignMatch) {
        var after = modelText.substring(assignMatch.index + assignMatch[0].length);
        var depth = 1;
        for (var i = 0; i < after.length; i++) {
            if (after[i] === '(') {
                depth++;
            } else if (after[i] === ')') {
                if (--depth === 0) {
                    return (
                        after
                            .substring(i + 1)
                            .replace(/^\s*/, '')
                            .charAt(0) === '.'
                    );
                }
            }
        }
        return false;
    }

    /**
     * Generates a \`declare class\` TypeScript declaration from parsed SI methods
     * and registers it with Monaco's language service. Uses the same URI key as
     * \`_fetchSIIntellisense\` so our JSDoc-derived types take precedence when the
     * user triggers completions (which runs after the initial scan-based fetch).
     * Any interface declarations from @typedef blocks are prepended so that
     * custom return types are fully resolved rather than falling back to \`any\`.
     *
     * @param {string}        className   - Script Include class name.
     * @param {Array<Object>} methods     - Parsed method descriptors from \`parseSiMethods\`.
     * @param {string[]}      [interfaces] - Interface declarations from \`parseSiTypedefs\`.
     * @param {Array<Object>} [constants] - Static property descriptors from \`parseSiConstants\`.
     */
    function _registerSiDts(className, methods, interfaces, constants, properties) {
        if (!window.monaco || !monaco.languages || !monaco.languages.typescript) {
            return;
        }
        /* A Script Include may expose only properties, which is still worth a DTS. */
        if ((!methods || !methods.length) && (!properties || !properties.length)) {
            return;
        }

        /* Uses a distinct URI from SN's own — overwriting SN's entry in place doesn't propagate to the TS worker. */
        var ourUri = 'ts:snlib-si-plus-' + className + '.d.ts';
        var classMarker = 'class ' + className;

        /* One-time: strips SN's Number/String/Boolean/Any-extends-GlideElement augmentations from all registered libs. */
        if (!_primitiveAugsCleaned) {
            _primitiveAugsCleaned = true;
            ['javascriptDefaults', 'typescriptDefaults'].forEach(function (target) {
                var defs = monaco.languages.typescript[target];
                var libs = defs.getExtraLibs();
                Object.keys(libs).forEach(function (uri) {
                    var content = libs[uri].content || '';
                    if (content.indexOf('extends GlideElement') === -1) {
                        return;
                    }
                    var stripped = content.replace(_PRIM_AUG_RE, '');
                    if (stripped !== content) {
                        defs.addExtraLib(stripped, uri);
                    }
                });
            });
        }

        /* Reactive: clears random-URI libs with an untyped declaration for this class so TypeScript doesn't merge overloads. */
        ['javascriptDefaults', 'typescriptDefaults'].forEach(function (target) {
            var defs = monaco.languages.typescript[target];
            var libs = defs.getExtraLibs();
            Object.keys(libs).forEach(function (uri) {
                if (uri !== ourUri && (libs[uri].content || '').indexOf(classMarker) !== -1) {
                    defs.addExtraLib('', uri);
                }
            });
        });

        /* Proactive: patches addExtraLib to strip SN's untyped declarations for classes we own, except our own URIs. */
        if (!_addExtraLibFilterInstalled) {
            _addExtraLibFilterInstalled = true;
            var _OUR_URI_RE = /^ts:snlib-si-plus-/;
            ['javascriptDefaults', 'typescriptDefaults'].forEach(function (target) {
                var defs = monaco.languages.typescript[target];
                var _orig = defs.addExtraLib.bind(defs);
                defs.addExtraLib = function (content, libUri) {
                    if (content && !_OUR_URI_RE.test(libUri)) {
                        content = content.replace(/declare\s+class\s+(\w+)[^{]*\{[^}]*\}/g, function (match, name) {
                            return _siProtectedClasses[name] ? '' : match;
                        });
                        content = content.replace(_PRIM_AUG_RE, '');
                    }
                    return _orig(content, libUri);
                };
            });
        }
        _siProtectedClasses[className] = true;

        var lines = interfaces && interfaces.length ? interfaces.concat(['']) : [];
        lines.push('declare class ' + className + ' {');
        if (constants && constants.length) {
            constants.forEach(function (c) {
                if (c.documentation) {
                    lines.push('    /** ' + c.documentation + ' */');
                }
                lines.push('    static readonly ' + c.name + ': ' + c.tsType + ';');
            });
        }
        if (properties && properties.length) {
            properties.forEach(function (p) {
                if (p.documentation) {
                    lines.push('    /** ' + p.documentation + ' */');
                }
                lines.push('    ' + p.name + ': ' + p.tsType + ';');
            });
        }
        (methods || []).forEach(function (m) {
            lines.push('    ' + m.signature + ';');
        });
        lines.push('}');
        var dts = lines.join('\n');
        monaco.languages.typescript.typescriptDefaults.addExtraLib(dts, ourUri);
        monaco.languages.typescript.javascriptDefaults.addExtraLib(dts, ourUri);
    }

    /* TABLE_PARAM / FIELD_PARAM — param name patterns for SI string-arg completions. */
    var _TABLE_PARAM_RE = /^(table|table_name|tableName)$/;
    var _FIELD_PARAM_RE = /^(field|field_name|fieldName)$/;

    /**
     * Detects when the cursor is inside a string argument of a Script Include
     * method call and returns context needed to drive table/field suggestions.
     * Handles both \`varName.method('\` and \`new ClassName().method('\` shapes.
     *
     * @param {Object} model    - Monaco editor model.
     * @param {Object} position - Monaco position {lineNumber, column}.
     * @returns {{ className: string, methodName: string, paramIndex: number,
     *             prevArgs: (string|null)[], typed: string, range: Object }|null}
     */
    function _getSiCallContext(model, position) {
        var line = model.getLineContent(position.lineNumber);
        var col = position.column - 1; // 0-based

        /* Walk left to find the opening quote of the current string arg. */
        var quoteChar = null,
            quoteIdx = -1;
        for (var i = col - 1; i >= 0; i--) {
            var c = line[i];
            if (c === ')' || c === ';') {
                return null;
            }
            if (c === '(') {
                return null;
            }
            if (c === "'" || c === '"') {
                quoteChar = c;
                quoteIdx = i;
                break;
            }
        }
        if (quoteChar === null) {
            return null;
        }

        var typed = line.substring(quoteIdx + 1, col);
        if (typed.length > 0 && !/^[a-zA-Z0-9_.]*$/.test(typed)) {
            return null;
        }

        var endIdx = line.length;
        for (var j = col; j < line.length; j++) {
            if (line[j] === quoteChar) {
                endIdx = j;
                break;
            }
        }

        /* Forward scan to find the outermost unmatched '(' before quoteIdx. */
        var openParenIdx = -1,
            depth = 0,
            inSc = false,
            scCh = null;
        for (var k = 0; k < quoteIdx; k++) {
            var ch = line[k];
            if (inSc) {
                if (ch === scCh) {
                    inSc = false;
                }
                continue;
            }
            if (ch === "'" || ch === '"') {
                inSc = true;
                scCh = ch;
                continue;
            }
            if (ch === '(') {
                depth++;
                if (depth === 1) {
                    openParenIdx = k;
                }
            } else if (ch === ')') {
                depth--;
                if (depth === 0) {
                    openParenIdx = -1;
                }
            }
        }
        if (openParenIdx === -1 || depth === 0) {
            return null;
        }

        /* Parse the text between '(' and the current quote to find prev args. */
        var argText = line.substring(openParenIdx + 1, quoteIdx);
        var prevArgs = [];
        var paramIndex = 0;
        if (argText.trim().length > 0) {
            var args = [],
                d = 0,
                inSa = false,
                saCh = null,
                cur = '';
            for (var p = 0; p < argText.length; p++) {
                var ap = argText[p];
                if (inSa) {
                    if (ap === saCh) {
                        inSa = false;
                    }
                    cur += ap;
                } else if (ap === "'" || ap === '"') {
                    inSa = true;
                    saCh = ap;
                    cur += ap;
                } else if (ap === '(' || ap === '[' || ap === '{') {
                    d++;
                    cur += ap;
                } else if (ap === ')' || ap === ']' || ap === '}') {
                    d--;
                    cur += ap;
                } else if (ap === ',' && d === 0) {
                    args.push(cur.trim());
                    cur = '';
                } else {
                    cur += ap;
                }
            }
            if (cur.trim()) {
                args.push(cur.trim());
            }
            paramIndex = args.length;
            prevArgs = args.map(function (a) {
                var mv = a.match(/^['"]([^'"]*)['"]\s*$/);
                return mv ? mv[1] : null;
            });
        }

        /* Identify the class and method being called. */
        var beforeParen = line.substring(0, openParenIdx).replace(/\s*$/, '');
        var methodName = null,
            className = null;

        /* new ClassName().method( — check first (more specific). */
        var newM = beforeParen.match(/\bnew\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\.(\w+)$/);
        if (newM) {
            className = newM[1];
            methodName = newM[2];
        }

        /* varName.method( */
        if (!className) {
            var varM = beforeParen.match(/(\w+)\.(\w+)$/);
            if (varM) {
                methodName = varM[2];
                var aRe = new RegExp(
                    '(?:var|let|const)\\s+' + varM[1] + '\\s*=\\s*new\\s+([A-Z][A-Za-z0-9_]*)\\s*\\(',
                    'g'
                );
                var aM = aRe.exec(model.getValue());
                if (aM && !_isChainedConstructor(model.getValue(), aM)) {
                    className = aM[1];
                }
            }
        }

        if (!className || !methodName) {
            return null;
        }

        return {
            className: className,
            methodName: methodName,
            paramIndex: paramIndex,
            prevArgs: prevArgs,
            typed: typed,
            range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: quoteIdx + 2,
                endColumn: endIdx + 1,
            },
        };
    }

    /**
     * Scans a Monaco model for all GlideRecord/Aggregate constructor calls and
     * pre-fetches field lists for each unique table, warming the cache before
     * the user triggers completions.
     *
     * @param {Object} model - Monaco editor model.
     */
    function _prewarmFieldCompletions(model) {
        var text = model.getValue();
        var pat = /new\s+(?:GlideRecord(?:Secure)?|GlideAggregate)\s*\(\s*['"](\S+?)['"]/g;
        var m;
        while ((m = pat.exec(text)) !== null) {
            if (!(_tableFieldCache[m[1]] || _tablePendingCache[m[1]])) {
                fetchTableFields(m[1]); // fire-and-forget; populates cache
            }
        }
    }

    ///////////////////////////////////////////
    // Initialisation
    ///////////////////////////////////////////

    /**
     * Merges compiler options into Monaco's TypeScript and JavaScript language
     * services. Suppresses semantic false-positives common in plain JavaScript
     * server scripts while retaining syntax checking and completions.
     * Enables checkJs so JSDoc @param types yield typed completions in JS mode.
     */
    function applyCompilerOptions() {
        if (!window.monaco || !monaco.languages || !monaco.languages.typescript) {
            return;
        }

        var tsDef = monaco.languages.typescript.typescriptDefaults;
        var tsExisting = tsDef.getCompilerOptions
            ? tsDef.getCompilerOptions()
            : {
                  allowNonTsExtensions: true,
              };
        tsDef.setCompilerOptions(
            Object.assign({}, tsExisting, {
                noImplicitAny: false,
                strictNullChecks: false,
                strict: false,
                noUnusedLocals: true,
                noUnusedParameters: true,
            })
        );
        tsDef.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: false,
            noSuggestionDiagnostics: true,
            diagnosticCodesToIgnore: [7006, 7043, 7019, 7016, 80001, 80004, 1005],
        });
        tsDef.setEagerModelSync(true);

        var jsDef = monaco.languages.typescript.javascriptDefaults;
        var jsExisting = jsDef.getCompilerOptions ? jsDef.getCompilerOptions() : {};
        jsDef.setCompilerOptions(
            Object.assign({}, jsExisting, {
                checkJs: true,
                noImplicitAny: false,
                strictNullChecks: false,
                strict: false,
                noUnusedLocals: true,
                noUnusedParameters: true,
            })
        );
        jsDef.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: false,
            noSuggestionDiagnostics: true,
            diagnosticCodesToIgnore: [7006, 7043, 7019, 7016, 80001, 80004, 1005],
        });
        jsDef.setEagerModelSync(true);
    }

    /* Installs per-model watchers that fetch only unused-var/param diagnostics (6133/6196) as separate 'we-unused' markers. */
    var _unusedVarPatchInstalled = false;
    function _installUnusedVarSeverityPatch() {
        if (_unusedVarPatchInstalled || !window.monaco || !monaco.editor) {
            return;
        }
        _unusedVarPatchInstalled = true;

        var OWNER = 'we-unused';
        var DEBOUNCE_MS = 1200;
        var _timers = {};

        function _msgText(mt) {
            if (typeof mt === 'string') return mt;
            if (mt && typeof mt.messageText === 'string') return mt.messageText;
            return 'Unused';
        }

        function _refresh(model) {
            if (model.isDisposed()) return;
            var lang = model.getLanguageId();
            if (lang !== 'javascript' && lang !== 'typescript') return;

            if (!_showUnusedVars) {
                monaco.editor.setModelMarkers(model, OWNER, []);
                return;
            }

            var getWorker =
                lang === 'typescript'
                    ? monaco.languages.typescript.getTypeScriptWorker
                    : monaco.languages.typescript.getJavaScriptWorker;
            if (!getWorker) return;

            var uriStr = model.uri.toString();
            getWorker()
                .then(function (factory) {
                    return factory(model.uri);
                })
                .then(function (client) {
                    return client.getSemanticDiagnostics(uriStr);
                })
                .then(function (diags) {
                    if (model.isDisposed()) return;
                    var markers = [];
                    for (var i = 0; i < diags.length; i++) {
                        var d = diags[i];
                        if (d.code !== 6133 && d.code !== 6196) continue;
                        if (d.start == null || d.length == null) continue;
                        var start = model.getPositionAt(d.start);
                        var end = model.getPositionAt(d.start + d.length);
                        markers.push({
                            severity: monaco.MarkerSeverity.Warning,
                            message: _msgText(d.messageText),
                            startLineNumber: start.lineNumber,
                            startColumn: start.column,
                            endLineNumber: end.lineNumber,
                            endColumn: end.column,
                            code: String(d.code),
                            source: 'ts',
                            tags: monaco.MarkerTag ? [monaco.MarkerTag.Unnecessary] : undefined,
                        });
                    }
                    monaco.editor.setModelMarkers(model, OWNER, markers);
                });
        }

        function _schedule(model) {
            var id = model.id;
            if (_timers[id]) clearTimeout(_timers[id]);
            _timers[id] = setTimeout(function () {
                delete _timers[id];
                _refresh(model);
            }, DEBOUNCE_MS);
        }

        function _watch(model) {
            var lang = model.getLanguageId();
            if (lang !== 'javascript' && lang !== 'typescript') return;
            _schedule(model);
            model.onDidChangeContent(function () {
                _schedule(model);
            });
            model.onWillDispose(function () {
                if (_timers[model.id]) {
                    clearTimeout(_timers[model.id]);
                    delete _timers[model.id];
                }
            });
        }

        _scheduleUnusedRefresh = _schedule;
        monaco.editor.getModels().forEach(_watch);
        monaco.editor.onDidCreateModel(_watch);
    }

    /** Fetches and registers SN's server-side type declarations, patching the mis-declared GlideRecordSecure. */
    function loadSnTypeDefinitions(scopeOverride, targetLang) {
        if (!window.monaco || !monaco.languages || !monaco.languages.typescript) {
            return;
        }

        var scope = scopeOverride || (typeof g_form !== 'undefined' ? g_form.getValue('sys_scope') : 'global');
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/now/syntax_editor/completions?scope=' + encodeURIComponent(scope || 'global'), true);
        xhr.setRequestHeader('X-UserToken', window.g_ck || '');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.onload = function () {
            if (xhr.status !== 200) {
                return;
            }
            var declarations;
            try {
                var data = JSON.parse(xhr.responseText);
                var r = data && data.result;
                declarations = typeof r === 'string' ? r : r && typeof r.result === 'string' ? r.result : null;
            } catch (e) {
                return;
            }
            if (!declarations) {
                return;
            }

            /* Patches GlideRecordSecure to extend GlideRecordGenerated instead of GlideRecord, which TS marks non-constructable (TS2351). */
            declarations = declarations.replace(
                /\/\*\*[\s\S]*?GlideRecordSecure is a class[\s\S]*?\*\/\s*declare class GlideRecordSecure extends GlideRecord \{[\s\S]*?\n\}/,
                'declare class GlideRecordSecure extends GlideRecordGenerated {\n' +
                    '    constructor(tableName: string);\n' +
                    '    enableSecurityFeature(feature: string): void;\n' +
                    '    disableSecurityFeature(feature: string): void;\n' +
                    '}'
            );

            var _snDtsTargets = targetLang
                ? [monaco.languages.typescript[targetLang + 'Defaults']]
                : [monaco.languages.typescript.typescriptDefaults, monaco.languages.typescript.javascriptDefaults];
            _snDtsTargets.forEach(function (def) {
                if (def === monaco.languages.typescript.javascriptDefaults) {
                    // Cached and applied only while the server profile is
                    // active — see _applyJsScriptContextLibs.
                    _cachedServerSnDts = declarations;
                    _applyJsScriptContextLibs();
                } else {
                    def.addExtraLib(declarations, 'ts:snlib-servicenow.d.ts');
                }
                def.setEagerModelSync(true);
            });
        };
        xhr.send();
    }

    /** Injects the server language DTS (GlideRecordSecure + $sp), loading the UI script if not already present. */
    function loadServerMonarchDts(targetLang) {
        if (!window.monaco || !monaco.languages || !monaco.languages.typescript) {
            return;
        }

        // Registers the DTS string with both language services.
        function _register(dts) {
            var _serverDtsTargets = targetLang
                ? [monaco.languages.typescript[targetLang + 'Defaults']]
                : [monaco.languages.typescript.typescriptDefaults, monaco.languages.typescript.javascriptDefaults];
            _serverDtsTargets.forEach(function (def) {
                if (def === monaco.languages.typescript.javascriptDefaults) {
                    _cachedServerMonarchDts = dts;
                    _applyJsScriptContextLibs();
                } else {
                    def.addExtraLib(dts, 'ts:snlib-server-monarch.d.ts');
                }
            });
        }

        if (window.MONACO_LANGUAGE_SERVER_DTS) {
            _register(window.MONACO_LANGUAGE_SERVER_DTS);
            return;
        }

        _loadScript(
            _definitionUrl,
            function () {
                if (window.MONACO_LANGUAGE_SERVER_DTS) {
                    _register(window.MONACO_LANGUAGE_SERVER_DTS);
                } else {
                    _logError(
                        'Server DTS Load Error',
                        'Script loaded but MONACO_LANGUAGE_SERVER_DTS not found.\nURL: ' + _definitionUrl
                    );
                }
            },
            function () {
                _logError(
                    'Server DTS Network Error',
                    'Failed to load server language definitions.\nURL: ' + _definitionUrl
                );
            }
        );
    }

    function _applyClientMonarchCompilerOptions() {
        var jsDef = monaco.languages.typescript.javascriptDefaults;
        if (!jsDef || !jsDef.setCompilerOptions) {
            return;
        }
        var existing = jsDef.getCompilerOptions ? jsDef.getCompilerOptions() : {};
        jsDef.setCompilerOptions(
            Object.assign({}, existing, {
                checkJs: true,
                noImplicitAny: false,
                strictNullChecks: false,
                strict: false,
                noUnusedLocals: true,
                noUnusedParameters: true,
            })
        );
    }

    /* Server and client panes share one 'javascript' language service, so only one side's API declarations are registered at a time, swapped on focus. */
    var _activeJsScriptContext = 'server'; // 'server' | 'client'
    var _cachedServerSnDts = '';
    var _cachedServerMonarchDts = '';
    var _cachedClientMonarchDts = '';

    function _findModelById(modelId) {
        if (!window.monaco || !monaco.editor) {
            return null;
        }
        var models = monaco.editor.getModels();
        for (var i = 0; i < models.length; i++) {
            if (models[i].id === modelId) {
                return models[i];
            }
        }
        return null;
    }

    /** Pushes whichever profile's cached DTS is active into javascriptDefaults,
     * clearing the other profile's URIs so its declarations disappear. */
    function _applyJsScriptContextLibs() {
        if (!window.monaco || !monaco.languages || !monaco.languages.typescript) {
            return;
        }
        var jsDef = monaco.languages.typescript.javascriptDefaults;
        if (_activeJsScriptContext === 'server') {
            jsDef.addExtraLib(_cachedServerSnDts, 'ts:snlib-servicenow.d.ts');
            jsDef.addExtraLib(_cachedServerMonarchDts, 'ts:snlib-server-monarch.d.ts');
            jsDef.addExtraLib('', 'ts:snlib-client-monarch.d.ts');
            jsDef.addExtraLib('', _CLIENT_API_LIB_URI);
        } else {
            jsDef.addExtraLib('', 'ts:snlib-servicenow.d.ts');
            jsDef.addExtraLib('', 'ts:snlib-server-monarch.d.ts');
            jsDef.addExtraLib(_cachedClientMonarchDts, 'ts:snlib-client-monarch.d.ts');
            // Client DI signature (_CLIENT_API_LIB_URI) is re-populated by
            // _refreshClientApiLib, called separately once this context is live.
        }
    }

    /**
     * Switches which side's server/client API declarations are live in
     * javascriptDefaults. Called on editor focus from the Widget Editor+ page.
     *
     * @param {string} kind - 'server' or 'client'.
     */
    function setActiveScriptContext(kind) {
        if ((kind !== 'server' && kind !== 'client') || kind === _activeJsScriptContext) {
            return;
        }
        _activeJsScriptContext = kind;
        _applyJsScriptContextLibs();
    }

    /**
     * Notifies the core that a pane's editor gained focus, switching the
     * active server/client API profile and — for client panes — immediately
     * resyncing the 'api' DI signature for the focused model rather than
     * waiting for the next keystroke.
     *
     * @param {string} modelId - \`ed.getModel().id\` of the focused pane.
     * @param {string} kind    - 'server' or 'client'.
     */
    function notifyScriptContextFocus(modelId, kind) {
        setActiveScriptContext(kind);
        if (kind === 'client') {
            _clientDiLastParamsKey = null;
            _refreshClientApiLib(_findModelById(modelId));
        }
    }

    /* AngularJS injects api.controller args by name, not position, so this watcher regenerates the signature from the developer's actual parameter list. */
    var _CLIENT_API_LIB_URI = 'ts:snlib-client-api.d.ts';

    /**
     * Extracts the api.controller parameter names from client-controller
     * source. Handles function expressions (named/anonymous/async), arrow
     * functions, and $inject-style array notation. Multi-line parameter lists
     * are supported. Returns null when no controller assignment is found.
     *
     * @param {string} source - Full model text.
     * @returns {string[]|null}
     */
    function _parseControllerParams(source) {
        var m =
            /api\s*\.\s*controller\s*=\s*(?:\[[^\]]*?)?(?:async\s+)?function\s*[\w$]*\s*\(([^)]*)\)/.exec(source) ||
            /api\s*\.\s*controller\s*=\s*(?:\[[^\]]*?)?(?:async\s*)?\(([^)]*)\)\s*=>/.exec(source) ||
            // Some (mostly older/OOB) widgets omit 'api.controller =' entirely — the platform
            // implicitly assigns the whole field content to api.controller either way, so a
            // bare function as the script's very first statement is an equally valid controller.
            /^\s*(?:\/\*(?:[^*]|\*(?!\/))*\*\/\s*|\/\/[^\n]*\n\s*)*(?:async\s+)?function\s*[\w$]*\s*\(([^)]*)\)/.exec(
                source
            );
        if (!m) {
            return null;
        }
        return m[1]
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '')
            .split(',')
            .map(function (p) {
                // Strip default values: (a = 0) → 'a'
                return p.replace(/\s*=[\s\S]*$/, '').trim();
            })
            .filter(Boolean);
    }

    /** Rebuilds 'declare var api' to mirror model's controller param order; no-ops if unchanged. */
    function _refreshClientApiLib(model) {
        var di = window.MONACO_LANGUAGE_CLIENT_DI;
        if (
            !di ||
            !window.monaco ||
            !monaco.languages ||
            !monaco.languages.typescript ||
            _activeJsScriptContext !== 'client'
        ) {
            return;
        }

        var params = null;
        if (model && !model.isDisposed()) {
            params = _parseControllerParams(model.getValue());
        }
        // Mid-edit/unparseable: keep the last good signature instead of reverting to default.
        if (!params && _clientDiLastParamsKey !== null) {
            return;
        }

        var key = params ? params.join(',') : '';
        if (key === _clientDiLastParamsKey) {
            return;
        }
        _clientDiLastParamsKey = key;

        monaco.languages.typescript.javascriptDefaults.addExtraLib(di.buildApiDts(params), _CLIENT_API_LIB_URI);
    }

    /** Installs the per-model DI signature watcher. Idempotent. */
    function _installClientDiWatcher() {
        if (_clientDiWatcherInstalled || !window.monaco || !monaco.editor) {
            return;
        }
        _clientDiWatcherInstalled = true;

        // Register the default signature immediately so 'api' is always typed.
        _refreshClientApiLib(null);

        var DEBOUNCE_MS = 400;

        function _schedule(model) {
            var id = model.id;
            if (_clientDiTimers[id]) {
                clearTimeout(_clientDiTimers[id]);
            }
            _clientDiTimers[id] = setTimeout(function () {
                delete _clientDiTimers[id];
                _refreshClientApiLib(model);
            }, DEBOUNCE_MS);
        }

        function _watch(model) {
            if (model.getLanguageId() !== 'javascript') {
                return;
            }
            _refreshClientApiLib(model);
            model.onDidChangeContent(function () {
                _schedule(model);
            });
            model.onWillDispose(function () {
                if (_clientDiTimers[model.id]) {
                    clearTimeout(_clientDiTimers[model.id]);
                    delete _clientDiTimers[model.id];
                }
            });
        }

        monaco.editor.getModels().forEach(_watch);
        monaco.editor.onDidCreateModel(_watch);
    }

    function loadClientMonarchDts(cb) {
        if (!window.monaco || !monaco.languages || !monaco.languages.typescript) {
            if (typeof cb === 'function') {
                cb();
            }
            return;
        }

        if (window.MONACO_LANGUAGE_CLIENT_DTS) {
            _cachedClientMonarchDts = window.MONACO_LANGUAGE_CLIENT_DTS;
            _applyJsScriptContextLibs();
            _applyClientMonarchCompilerOptions();
            _installClientDiWatcher();
            if (typeof cb === 'function') {
                cb();
            }
            return;
        }

        if (typeof cb === 'function') {
            _clientMonarchPending.push(cb);
        }
        if (_clientMonarchLoading) {
            return;
        }
        _clientMonarchLoading = true;

        _loadScript(
            _clientDefinitionUrl,
            function () {
                _clientMonarchLoading = false;
                if (window.MONACO_LANGUAGE_CLIENT_DTS) {
                    _cachedClientMonarchDts = window.MONACO_LANGUAGE_CLIENT_DTS;
                    _applyJsScriptContextLibs();
                    _applyClientMonarchCompilerOptions();
                    _installClientDiWatcher();
                } else {
                    _logError(
                        'Client DTS Load Error',
                        'Script loaded but MONACO_LANGUAGE_CLIENT_DTS not found.\nURL: ' + _clientDefinitionUrl
                    );
                }
                _flushPending(_clientMonarchPending);
            },
            function () {
                _clientMonarchLoading = false;
                _logError(
                    'Client DTS Network Error',
                    'Failed to load client language definitions.\nURL: ' + _clientDefinitionUrl
                );
                _flushPending(_clientMonarchPending);
            }
        );
    }

    function loadHtmlMonarchDts(cb) {
        if (!window.monaco || !monaco.languages) {
            if (typeof cb === 'function') {
                cb();
            }
            return;
        }

        if (window.MONACO_LANGUAGE_HTML) {
            window.MONACO_LANGUAGE_HTML.register(monaco);
            if (typeof cb === 'function') {
                cb();
            }
            return;
        }

        if (typeof cb === 'function') {
            _htmlMonarchPending.push(cb);
        }
        if (_htmlMonarchLoading) {
            return;
        }
        _htmlMonarchLoading = true;

        _loadScript(
            _htmlMonarchUrl,
            function () {
                _htmlMonarchLoading = false;
                if (window.MONACO_LANGUAGE_HTML) {
                    window.MONACO_LANGUAGE_HTML.register(monaco);
                } else {
                    _logError(
                        'HTML Monarch Load Error',
                        'Script loaded but MONACO_LANGUAGE_HTML not found.\nURL: ' + _htmlMonarchUrl
                    );
                }
                _flushPending(_htmlMonarchPending);
            },
            function () {
                _htmlMonarchLoading = false;
                _logError(
                    'HTML Monarch Network Error',
                    'Failed to load HTML language definitions.\nURL: ' + _htmlMonarchUrl
                );
                _flushPending(_htmlMonarchPending);
            }
        );
    }

    /**
     * Loads the CSS language definition UI Script (MONACO_LANGUAGE_CSS) on demand,
     * then registers its at-rule and descriptor completion providers. Queues
     * callbacks if a load is already in-flight. Safe to call multiple times.
     *
     * @param {Function} [cb] - Optional callback invoked after registration completes.
     */
    function loadCssLanguageDts(cb) {
        if (!window.monaco || !monaco.languages) {
            if (typeof cb === 'function') {
                cb();
            }
            return;
        }

        if (window.MONACO_LANGUAGE_CSS) {
            window.MONACO_LANGUAGE_CSS.register(monaco);
            if (typeof cb === 'function') {
                cb();
            }
            return;
        }

        if (typeof cb === 'function') {
            _cssLanguagePending.push(cb);
        }
        if (_cssLanguageLoading) {
            return;
        }
        _cssLanguageLoading = true;

        function _onCssLoaded() {
            _cssLanguageLoading = false;
            if (window.MONACO_LANGUAGE_CSS) {
                window.MONACO_LANGUAGE_CSS.register(monaco);
            } else {
                _logError(
                    'CSS Language Load Error',
                    'Script loaded but MONACO_LANGUAGE_CSS not found.\nURL: ' + _cssLanguageUrl
                );
            }
            _flushPending(_cssLanguagePending);
        }

        function _onCssError() {
            _cssLanguageLoading = false;
            _logError(
                'CSS Language Network Error',
                'Failed to load CSS language definitions.\nURL: ' + _cssLanguageUrl
            );
            _flushPending(_cssLanguagePending);
        }

        /* Prefer ServiceNow's ScriptLoader (handles caching and .jsdbx URLs
         * consistently) with a fallback to direct DOM script injection. */
        if (typeof ScriptLoader !== 'undefined' && ScriptLoader.getScripts) {
            ScriptLoader.getScripts(_cssLanguageUrl, _onCssLoaded);
        } else {
            _loadScript(_cssLanguageUrl, _onCssLoaded, _onCssError);
        }
    }

    function loadCodeActions(options) {
        if (!window.monaco || !monaco.languages) {
            return;
        }

        options = options || {};
        var modelId = options.modelId;
        var isAngular = !!options.isAngular;
        if (typeof options.getRemBase === 'function') {
            _codeActionsGetRemBase = options.getRemBase;
        }

        var config = {
            getRemBase: function () {
                return Number(_codeActionsGetRemBase()) || 16;
            },
        };

        if (_codeActionsReady && window.MONACO_CODE_ACTIONS) {
            window.MONACO_CODE_ACTIONS.register(monaco, config);
            if (isAngular && modelId) {
                window.MONACO_CODE_ACTIONS.markAngular(modelId);
            }
            return;
        }

        if (isAngular && modelId) {
            _codeActionsPendingAngular.push(modelId);
        }
        if (_codeActionsLoading) {
            return;
        }
        _codeActionsLoading = true;

        _loadScript(
            _codeActionsUrl,
            function () {
                _codeActionsLoading = false;
                _codeActionsReady = true;
                if (window.MONACO_CODE_ACTIONS) {
                    window.MONACO_CODE_ACTIONS.register(monaco, config);
                    _codeActionsPendingAngular.splice(0).forEach(function (id) {
                        window.MONACO_CODE_ACTIONS.markAngular(id);
                    });
                } else {
                    _logError(
                        'Code Actions Load Error',
                        'Script loaded but MONACO_CODE_ACTIONS not found.\nURL: ' + _codeActionsUrl
                    );
                }
            },
            function () {
                _codeActionsLoading = false;
                _logError('Code Actions Network Error', 'Failed to load code actions module.\nURL: ' + _codeActionsUrl);
            }
        );
    }

    /**
     * Fetches up to 50 active Script Include names whose names start with the
     * given prefix (pass '' for no prefix filter). Results are cached into
     * _siNameMap and returned to the callback as an array of {name, sys_id}.
     *
     * @param {string}   prefix   - Name prefix to filter by (may be empty).
     * @param {Function} callback - Called with (records: Array<{name, sys_id}>).
     */
    function _fetchSiByPrefix(prefix, callback) {
        var query =
            'active%3Dtrue' + (prefix ? '%5EnameSTARTSWITH' + encodeURIComponent(prefix) : '') + '%5EORDERBYname';
        var url =
            '/api/now/table/sys_script_include' +
            '?sysparm_query=' +
            query +
            '&sysparm_fields=name%2Csys_id&sysparm_limit=' +
            SI_PREFIX_LIMIT;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('X-UserToken', window.g_ck || '');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.onload = function () {
            if (xhr.status !== 200) {
                callback([]);
                return;
            }
            try {
                var records = (JSON.parse(xhr.responseText) || {}).result || [];
                records.forEach(function (r) {
                    _siNameMap[r.name] = r.sys_id;
                });
                if (records.length < SI_PREFIX_LIMIT) {
                    _siCompletePrefixes[prefix.toLowerCase()] = true;
                }
                callback(records);
            } catch (e) {
                callback([]);
            }
        };
        xhr.send();
    }

    /**
     * Checks whether a Script Include with the given name exists. Uses the
     * local cache (_siNameMap) when available; otherwise queries the API and
     * caches the result (positive or negative) before invoking the callback.
     *
     * @param {string}   name     - Script Include class name to look up.
     * @param {Function} callback - Called with (name|null, sysId|null).
     */
    function _checkSiExists(name, callback) {
        if (_siNameMap[name] !== undefined) {
            callback(_siNameMap[name] ? name : null, _siNameMap[name] || null);
            return;
        }
        var url =
            '/api/now/table/sys_script_include' +
            '?sysparm_query=active%3Dtrue%5Ename%3D' +
            encodeURIComponent(name) +
            '&sysparm_fields=name%2Csys_id&sysparm_limit=1';
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('X-UserToken', window.g_ck || '');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.onload = function () {
            if (xhr.status !== 200) {
                callback(null, null);
                return;
            }
            try {
                var records = (JSON.parse(xhr.responseText) || {}).result || [];
                if (records.length) {
                    _siNameMap[records[0].name] = records[0].sys_id;
                    callback(records[0].name, records[0].sys_id);
                } else {
                    _siNameMap[name] = '';
                    callback(null, null);
                }
            } catch (e) {
                callback(null, null);
            }
        };
        xhr.send();
    }

    /**
     * Fetches TypeScript type definitions for a named Script Include from the
     * ServiceNow syntax editor intellisense endpoint and registers them with Monaco.
     *
     * @param {string} name  - Script Include class name (used as the lib filename key).
     * @param {string} sysId - sys_id of the Script Include record.
     */
    function _fetchSIIntellisense(name, sysId) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/now/v1/syntax_editor/intellisense/sys_script_include', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-UserToken', window.g_ck || '');
        xhr.onload = function () {
            if (xhr.status < 200 || xhr.status >= 300) {
                delete _siFetched[name];
                _logError(
                    'Script Include IntelliSense Error',
                    'Failed to fetch type definitions for: ' + name + '\nStatus: ' + xhr.status
                );
                return;
            }
            try {
                var data = JSON.parse(xhr.responseText);
                var result = data && data.result && data.result.result;
                var typeDef = result && result[sysId];
                if (typeDef && typeof typeDef === 'string') {
                    monaco.languages.typescript.typescriptDefaults.addExtraLib(
                        typeDef,
                        'ts:snlib-si-' + name + '.d.ts'
                    );
                }
            } catch (e) {
                _logError(
                    'Script Include Parse Error',
                    'Failed to parse response for: ' + name + '\nError: ' + (e.message || e)
                );
            }
            /* Overwrite SN's DTS with our JSDoc-derived types. If methods are already
             * cached (e.g. the user triggered completions before the scan ran), apply
             * them immediately; otherwise fetch them now. */
            if (_siMethodCache[name]) {
                _registerSiDts(
                    name,
                    _siMethodCache[name],
                    _siInterfaceCache[name],
                    _siConstantCache[name],
                    _siPropertyCache[name]
                );
            } else {
                fetchSiMethods(name);
            }
        };
        xhr.onerror = function () {
            delete _siFetched[name];
            _logError('Script Include Network Error', 'Network error while fetching type definitions for: ' + name);
        };
        xhr.send(JSON.stringify({ scriptIncludes: [sysId] }));
    }

    var _SI_SCAN_BUILTINS = {
        Array: true,
        ArrayBuffer: true,
        Boolean: true,
        DataView: true,
        Date: true,
        Error: true,
        EvalError: true,
        Float32Array: true,
        Float64Array: true,
        Function: true,
        Int8Array: true,
        Int16Array: true,
        Int32Array: true,
        Map: true,
        Number: true,
        Object: true,
        Promise: true,
        Proxy: true,
        RangeError: true,
        ReferenceError: true,
        RegExp: true,
        Set: true,
        SharedArrayBuffer: true,
        String: true,
        Symbol: true,
        SyntaxError: true,
        TypeError: true,
        URIError: true,
        Uint8Array: true,
        Uint8ClampedArray: true,
        Uint16Array: true,
        Uint32Array: true,
        WeakMap: true,
        WeakRef: true,
        WeakSet: true,
        Class: true /* SN PrototypeJS helper — not a user Script Include */,
    };

    /**
     * Scans script content for 'new ClassName(' patterns and lazily fetches
     * TypeScript type definitions for any recognised Script Include class names.
     *
     * @param {string} content - The full text of a Monaco editor model.
     */
    function _scanAndFetchSIs(content) {
        if (window.WECodeAnalysis) {
            return window.WECodeAnalysis.analyse({ content: content }).then(
                function (result) {
                    _batchCheckSiNames(
                        result.scriptIncludes.map(function (candidate) {
                            return candidate.name;
                        })
                    );
                },
                function () {
                    _scanAndFetchSIsLocally(content);
                }
            );
        }
        _scanAndFetchSIsLocally(content);
    }

    function _scanAndFetchSIsLocally(content) {
        if (!window.monaco) {
            return;
        }
        var seen = {};
        var names = [];
        // Matches identifiers only right after 'new' so referenced built-ins (String, Date, Set) aren't queued as SI candidates.
        var re = /\bnew\s+([A-Z][a-zA-Z0-9_]*)\s*\(/g;
        var m;
        while ((m = re.exec(content)) !== null) {
            var name = m[1];
            if (!seen[name] && !_SI_SCAN_BUILTINS[name]) {
                seen[name] = true;
                names.push(name);
            }
        }
        _batchCheckSiNames(names);
    }

    /**
     * Checks a list of potential Script Include names against the instance in
     * batches of 50, using a single nameIN query per batch. Results are cached
     * into _siNameMap; confirmed SIs also trigger an intellisense fetch.
     *
     * @param {string[]} names - Candidate Script Include class names.
     */
    function _batchCheckSiNames(names) {
        var toCheck = [];
        names.forEach(function (n) {
            if (_siNameMap[n] === undefined && !_siNameChecks[n]) {
                _siNameChecks[n] = true;
                toCheck.push(n);
            }
        });
        if (!toCheck.length) {
            return;
        }

        var BATCH_SIZE = 50;
        var i;
        for (i = 0; i < toCheck.length; i += BATCH_SIZE) {
            (function (batch) {
                var url =
                    '/api/now/table/sys_script_include' +
                    '?sysparm_query=active%3Dtrue%5EnameIN' +
                    encodeURIComponent(batch.join(',')) +
                    '&sysparm_fields=name%2Csys_id&sysparm_limit=' +
                    batch.length;
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.setRequestHeader('X-UserToken', window.g_ck || '');
                xhr.setRequestHeader('Accept', 'application/json');
                xhr.onload = function () {
                    if (xhr.status !== 200) {
                        return;
                    }
                    try {
                        var records = (JSON.parse(xhr.responseText) || {}).result || [];
                        var found = {};
                        records.forEach(function (r) {
                            _siNameMap[r.name] = r.sys_id;
                            found[r.name] = true;
                        });
                        batch.forEach(function (n) {
                            if (!found[n]) {
                                _siNameMap[n] = '';
                            }
                        });
                        records.forEach(function (r) {
                            if (!_siFetched[r.name]) {
                                _siFetched[r.name] = true;
                                _fetchSIIntellisense(r.name, r.sys_id);
                            }
                        });
                    } catch (e) {}
                };
                xhr.timeout = 30000;
                xhr.onloadend = function () {
                    batch.forEach(function (name) {
                        delete _siNameChecks[name];
                    });
                };
                xhr.send();
            })(toCheck.slice(i, i + BATCH_SIZE));
        }
    }

    ///////////////////////////////////////////
    // Angular Provider (service/factory) IntelliSense — typed api.controller injected parameters
    ///////////////////////////////////////////
    // Isolated from the Script Include engine above: own name map, own caches, own DTS URIs.
    // Directive-type providers are out of scope here — see monaco_language_html for their
    // data-<prop> HTML completions instead.

    var _providerNameChecks = Object.create(null);
    var _providerNameMap = {}; // name -> sys_id ('' = confirmed not a service/factory provider)
    var _providerMethodCache = {};
    var _providerPropertyCache = {};

    /** Parses \`this.name = function (...) {}\` methods from a 'service' provider's script. */
    function parseServiceMethods(script) {
        var methods = [];
        var re =
            /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/|\/\*(?:(?!\*\/)[\s\S])*\*\/)?\s*\bthis\.(\w+)\s*=\s*function\s*\(([^)]*)\)/g;
        var m;
        while ((m = re.exec(script)) !== null) {
            var methodName = m[2];
            var comment = m[1] || null;
            var docInfo = parseSiDocComment(comment);
            var rawParams = m[3]
                .split(',')
                .map(function (p) {
                    return p.trim();
                })
                .filter(Boolean);
            var typedParams = rawParams
                .map(function (p) {
                    var info = docInfo.params[p];
                    return info ? p + (info.optional ? '?' : '') + ': ' + info.type : p + ': any';
                })
                .join(', ');

            var docLines = [];
            if (comment) {
                var descText = comment
                    .replace(/^\/\*+\s*/, '')
                    .replace(/\s*\*+\/$/, '')
                    .replace(/^\s*\*\s?/gm, '');
                var descMatch = descText.match(/^([\s\S]*?)(?=\s*@|\s*$)/);
                if (descMatch && descMatch[1].trim()) {
                    docLines.push(descMatch[1].trim());
                }
            }
            rawParams.forEach(function (p) {
                var info = docInfo.params[p];
                if (info && info.description) {
                    docLines.push('*@param* `' + p + '` \u2014 ' + info.description);
                }
            });
            if (docInfo.returns !== 'any') {
                docLines.push('*@returns* `' + docInfo.returns + '`');
            }

            methods.push({
                name: methodName,
                signature: methodName + '(' + typedParams + '): ' + docInfo.returns,
                documentation: docLines.join('\n\n'),
            });
        }
        return methods;
    }

    /** Finds the '}' matching the '{' at openIndex, skipping string/comment contents. */
    function _findMatchingBraceSkippingStrings(script, openIndex) {
        var depth = 0;
        var inStr = null;
        var n = script.length;
        for (var j = openIndex; j < n; j++) {
            var ch = script.charAt(j);
            if (inStr) {
                if (ch === '\\') {
                    j++;
                } else if (ch === inStr) {
                    inStr = null;
                }
                continue;
            }
            if (ch === '"' || ch === "'") {
                inStr = ch;
                continue;
            }
            if (ch === '/' && script.charAt(j + 1) === '*') {
                var blockEnd = script.indexOf('*/', j + 2);
                j = blockEnd === -1 ? n : blockEnd + 1;
                continue;
            }
            if (ch === '/' && script.charAt(j + 1) === '/') {
                var lineEnd = script.indexOf('\n', j);
                j = lineEnd === -1 ? n : lineEnd;
                continue;
            }
            if (ch === '{') {
                depth++;
            } else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    return j;
                }
            }
        }
        return -1;
    }

    /**
     * Unwraps a provider DDF's outer \`function () { ... }\` wrapper, exposing its body
     * (helper declarations + \`return {...}\`) as top-level content for member scanning.
     * Without this, _stripFunctionBodies collapses the whole script from the first
     * 'function' keyword it finds — which for a provider script is this outer wrapper.
     */
    function _unwrapProviderFunctionBody(script) {
        var idx = script.indexOf('function');
        if (idx === -1) {
            return script;
        }
        var open = script.indexOf('{', idx);
        if (open === -1) {
            return script;
        }
        var close = _findMatchingBraceSkippingStrings(script, open);
        if (close === -1) {
            return script;
        }
        return script.slice(open + 1, close);
    }

    /**
     * Resolves \`key: identifierName\` shorthand exports (a very common revealing-module
     * pattern: declare a named function, then return \`{ key: identifierName }\`) to a real
     * method signature from that function's own declaration, instead of an untyped property.
     */
    function _resolveBareRefMethods(body, decls) {
        var methods = [];
        var handledKeys = {};
        var re = /([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*(?=[,\}])/g;
        var m;
        while ((m = re.exec(body)) !== null) {
            var decl = decls[m[2]];
            if (!decl) {
                continue;
            }
            var docInfo = parseSiDocComment(decl.comment);
            var rawParams = decl.params
                .split(',')
                .map(function (p) {
                    return p.trim();
                })
                .filter(Boolean);
            var typedParams = rawParams
                .map(function (p) {
                    var info = docInfo.params[p];
                    return info ? p + (info.optional ? '?' : '') + ': ' + info.type : p + ': any';
                })
                .join(', ');
            methods.push({
                name: m[1],
                signature: m[1] + '(' + typedParams + '): ' + docInfo.returns,
                documentation: decl.comment
                    ? decl.comment
                          .replace(/^\/\*+\s*/, '')
                          .replace(/\s*\*+\/$/, '')
                          .replace(/^\s*\*\s?/gm, '')
                          .trim()
                    : '',
            });
            handledKeys[m[1]] = true;
        }
        return { methods: methods, handledKeys: handledKeys };
    }

    /**
     * Parses a service/factory provider's script for its public members. Runs every
     * strategy unconditionally (inline \`key: function(){}\`, \`this.key = ...\`, and
     * shorthand \`key: namedFn\` exports) rather than branching on the provider's declared
     * type, since developer code frequently doesn't match the type dropdown's convention.
     */
    function parseProviderMembers(script) {
        var body = _unwrapProviderFunctionBody(script);

        var decls = {};
        var declRe = /(\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*)?function\s+(\w+)\s*\(([^)]*)\)/g;
        var dm;
        while ((dm = declRe.exec(body)) !== null) {
            decls[dm[2]] = { comment: dm[1] || null, params: dm[3] };
        }

        var bareRefs = _resolveBareRefMethods(body, decls);
        var methods = parseSiMethods(body).concat(parseServiceMethods(body)).concat(bareRefs.methods);
        var properties = parseSiProperties(body, null).filter(function (p) {
            return !bareRefs.handledKeys[p.name];
        });
        return { methods: methods, properties: properties };
    }

    /** Builds and registers a \`declare class ProviderName {...}\` ambient lib, for typing the matching api.controller parameter as this provider. */
    function _registerProviderDts(providerName, methods, properties) {
        if (!window.monaco || !monaco.languages || !monaco.languages.typescript) {
            return;
        }
        if ((!methods || !methods.length) && (!properties || !properties.length)) {
            return;
        }
        var ourUri = 'ts:snlib-provider-plus-' + providerName + '.d.ts';
        var lines = ['declare class ' + providerName + ' {'];
        (properties || []).forEach(function (p) {
            if (p.documentation) {
                lines.push('    /** ' + p.documentation + ' */');
            }
            lines.push('    ' + p.name + ': ' + (p.tsType || 'any') + ';');
        });
        (methods || []).forEach(function (m) {
            if (m.documentation) {
                lines.push('    /** ' + m.documentation + ' */');
            }
            lines.push('    ' + m.signature + ';');
        });
        lines.push('}');
        var content = lines.join('\n');
        ['javascriptDefaults', 'typescriptDefaults'].forEach(function (target) {
            monaco.languages.typescript[target].addExtraLib(content, ourUri);
        });
    }

    /** Fetches + parses a service/factory provider's script by name, then registers its DTS. Cached per name. */
    function fetchProviderMembers(providerName, sysId) {
        if (_providerMethodCache[providerName]) {
            return;
        }
        var xhr = new XMLHttpRequest();
        var url =
            '/api/now/table/sp_angular_provider' +
            '?sysparm_query=sys_id%3D' +
            encodeURIComponent(sysId) +
            '&sysparm_fields=script%2Ctype&sysparm_limit=1';
        xhr.open('GET', url, true);
        xhr.setRequestHeader('X-UserToken', window.g_ck || '');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.onload = function () {
            try {
                if (xhr.status !== 200) {
                    return;
                }
                var records = (JSON.parse(xhr.responseText) || {}).result || [];
                if (!records.length) {
                    return;
                }
                var script = records[0].script || '';
                var parsed = parseProviderMembers(script);
                _providerMethodCache[providerName] = parsed.methods;
                _providerPropertyCache[providerName] = parsed.properties;
                _registerProviderDts(providerName, parsed.methods, parsed.properties);

                // Type the matching api.controller parameter as this provider, then
                // force the ambient 'declare var api' signature to pick it up.
                if (window.MONACO_LANGUAGE_CLIENT_DI) {
                    window.MONACO_LANGUAGE_CLIENT_DI.types[providerName] = providerName;
                }
                _clientDiLastParamsKey = null;
                if (window.monaco && monaco.editor) {
                    monaco.editor.getModels().forEach(function (m) {
                        if (m.getLanguageId() === 'javascript') {
                            _refreshClientApiLib(m);
                        }
                    });
                }
            } catch (e) {}
        };
        xhr.send();
    }

    /** Checks candidate names against sp_angular_provider in batches of 50; confirmed service/factory providers trigger a fetch. */
    function _batchCheckProviderNames(names) {
        var toCheck = names.filter(function (n) {
            if (_providerNameMap[n] !== undefined || _providerNameChecks[n]) return false;
            _providerNameChecks[n] = true;
            return true;
        });
        if (!toCheck.length) {
            return;
        }
        var BATCH_SIZE = 50;
        for (var i = 0; i < toCheck.length; i += BATCH_SIZE) {
            (function (batch) {
                var url =
                    '/api/now/table/sp_angular_provider' +
                    '?sysparm_query=nameIN' +
                    encodeURIComponent(batch.join(',')) +
                    '%5EtypeINfactory%2Cservice' +
                    '&sysparm_fields=name%2Csys_id&sysparm_limit=' +
                    batch.length;
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.setRequestHeader('X-UserToken', window.g_ck || '');
                xhr.setRequestHeader('Accept', 'application/json');
                xhr.onload = function () {
                    if (xhr.status !== 200) {
                        return;
                    }
                    try {
                        var records = (JSON.parse(xhr.responseText) || {}).result || [];
                        var found = {};
                        records.forEach(function (r) {
                            _providerNameMap[r.name] = r.sys_id;
                            found[r.name] = true;
                        });
                        batch.forEach(function (n) {
                            if (!found[n]) {
                                _providerNameMap[n] = '';
                            }
                        });
                        records.forEach(function (r) {
                            fetchProviderMembers(r.name, r.sys_id);
                        });
                    } catch (e) {}
                };
                xhr.timeout = 30000;
                xhr.onloadend = function () {
                    batch.forEach(function (name) {
                        delete _providerNameChecks[name];
                    });
                };
                xhr.send();
            })(toCheck.slice(i, i + BATCH_SIZE));
        }
    }

    /**
     * Scans the Client Controller's \`api.controller\` parameter list (AngularJS injects
     * services/factories/directives by name as a parameter, never via \`new\`) and fetches
     * any matching service/factory provider so it can be typed in DI_TYPES.
     */
    function _scanAndFetchProviders(content) {
        if (window.WECodeAnalysis) {
            return window.WECodeAnalysis.analyse({ clientScript: content }).then(
                function (result) {
                    _fetchScannedProviders(result.controllerParams);
                },
                function () {
                    _fetchScannedProviders(_parseControllerParams(content));
                }
            );
        }
        _fetchScannedProviders(_parseControllerParams(content));
    }

    function _fetchScannedProviders(params) {
        if (!window.monaco) {
            return;
        }
        if (!params || !params.length) {
            return;
        }
        // Already-confirmed providers retry here on every scan (fetchProviderMembers itself
        // no-ops once _providerMethodCache is populated), so a transient fetch failure doesn't
        // permanently disable IntelliSense for that name.
        params.forEach(function (n) {
            if (_providerNameMap[n]) {
                fetchProviderMembers(n, _providerNameMap[n]);
            }
        });
        _batchCheckProviderNames(params);
    }

    ///////////////////////////////////////////
    // CSS variable completions
    ///////////////////////////////////////////

    /** Fetches and caches CSS custom properties from monaco.plus.css.variables; first call only fires the XHR. */
    function _loadCssVariables() {
        if (_cssVarCache) {
            return;
        }
        var xhr = new XMLHttpRequest();
        xhr.open(
            'GET',
            '/api/now/table/sys_properties' +
                '?sysparm_query=name%3Dmonaco.plus.css.variables' +
                '&sysparm_fields=value&sysparm_limit=1',
            true
        );
        xhr.setRequestHeader('X-UserToken', window.g_ck || '');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.onload = function () {
            if (xhr.status !== 200) {
                _cssVarCache = [];
                return;
            }
            try {
                var data = JSON.parse(xhr.responseText);
                var records = data && data.result;
                if (!records || !records.length) {
                    _cssVarCache = [];
                    return;
                }
                var varMap = {};
                try {
                    varMap = JSON.parse(records[0].value || '{}');
                } catch (e) {}
                var vars = Object.keys(varMap).map(function (k) {
                    return { name: k, value: varMap[k] };
                });
                vars.sort(function (a, b) {
                    return a.name.localeCompare(b.name);
                });
                _cssVarCache = vars;
            } catch (e) {
                _cssVarCache = [];
            }
        };
        xhr.send();
    }

    /** Suggests CSS custom properties inside a var() call, for CSS/SCSS; registers once. */
    function _registerCssVarCompletions() {
        if (_cssVarCompletionRegistered || !window.monaco || !monaco.languages) {
            return;
        }
        _cssVarCompletionRegistered = true;

        function provideCssVarItems(model, position) {
            var textBefore = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
            });

            // Match inside var(-- while typing: \`var(--token\` or \`var(-- token\`
            var varCallMatch = textBefore.match(/var\(\s*--\s*([\w-]*)$/);
            if (!varCallMatch) {
                return { suggestions: [] };
            }

            var typedSuffix = varCallMatch[1] || '';
            var range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - typedSuffix.length,
                endColumn: position.column,
            };

            var vars = _cssVarCache || [];
            if (!vars.length) {
                _loadCssVariables(); // lazy fetch on first trigger
                return { suggestions: [] };
            }

            return {
                suggestions: vars.map(function (v) {
                    return {
                        label: v.name,
                        kind: monaco.languages.CompletionItemKind.Variable,
                        detail: v.value || '',
                        insertText: v.name + (v.value ? ', ' + v.value : ''),
                        range: range,
                    };
                }),
            };
        }

        ['scss', 'css'].forEach(function (lang) {
            monaco.languages.registerCompletionItemProvider(lang, {
                triggerCharacters: ['-', ' ', '('],
                provideCompletionItems: provideCssVarItems,
            });
        });
    }

    // SCSS variable completions
    ///////////////////////////////////////////

    /** Fetches and caches SCSS variables from monaco.plus.scss.variables; concurrent callers share the in-flight promise. */
    function _loadScssVariables() {
        if (_scssVarCache !== null) {
            return Promise.resolve(_scssVarCache);
        }
        if (_scssVarPromise) {
            return _scssVarPromise;
        }
        _scssVarPromise = new Promise(function (resolve) {
            var xhr = new XMLHttpRequest();
            xhr.open(
                'GET',
                '/api/now/table/sys_properties' +
                    '?sysparm_query=name%3Dmonaco.plus.scss.variables' +
                    '&sysparm_fields=value&sysparm_limit=1',
                true
            );
            xhr.setRequestHeader('X-UserToken', window.g_ck || '');
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.onload = function () {
                if (xhr.status !== 200) {
                    _scssVarCache = [];
                    resolve([]);
                    return;
                }
                try {
                    var data = JSON.parse(xhr.responseText);
                    var records = data && data.result;
                    if (!records || !records.length) {
                        _scssVarCache = [];
                        resolve([]);
                        return;
                    }
                    var varMap = {};
                    try {
                        varMap = JSON.parse(records[0].value || '{}');
                    } catch (e) {}
                    var vars = Object.keys(varMap).map(function (k) {
                        return { name: k, value: varMap[k] };
                    });
                    _scssVarCache = vars;
                    resolve(vars);
                } catch (e) {
                    _scssVarCache = [];
                    resolve([]);
                }
            };
            xhr.onerror = function () {
                _scssVarCache = [];
                resolve([]);
            };
            xhr.send();
        });
        return _scssVarPromise;
    }

    /** Suggests SCSS variables (e.g. $breakpoint-sm) on '$', for SCSS/Less; registers once. */
    function _registerScssVarCompletions() {
        if (_scssVarCompletionRegistered || !window.monaco || !monaco.languages) {
            return;
        }
        _scssVarCompletionRegistered = true;

        function provideScssVarItems(model, position) {
            var textBefore = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
            });

            // Match a $ followed by optional identifier characters at end of line
            var match = textBefore.match(/\$([\w-]*)$/);
            if (!match) {
                return { suggestions: [] };
            }

            var typedSuffix = match[1] || '';
            var range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - typedSuffix.length - 1,
                endColumn: position.column,
            };

            function buildSuggestions(vars) {
                return {
                    suggestions: vars.map(function (v) {
                        return {
                            label: v.name,
                            kind: monaco.languages.CompletionItemKind.Variable,
                            detail: v.value || '',
                            insertText: v.name,
                            range: range,
                        };
                    }),
                };
            }

            // Cache already populated — synchronous fast path
            if (_scssVarCache !== null) {
                return buildSuggestions(_scssVarCache);
            }

            // First trigger — fetch and let Monaco await the promise
            return _loadScssVariables().then(buildSuggestions);
        }

        ['scss', 'less'].forEach(function (lang) {
            monaco.languages.registerCompletionItemProvider(lang, {
                triggerCharacters: ['$'],
                provideCompletionItems: provideScssVarItems,
            });
        });
    }

    /** Shows a SCSS variable's resolved value from _scssVarCache on hover; registers once. */
    function _registerScssVarHover() {
        if (_scssVarHoverRegistered || !window.monaco) {
            return;
        }
        _scssVarHoverRegistered = true;

        var provider = {
            provideHover: function (model, position) {
                var vars = _scssVarCache;
                if (!vars || !vars.length) {
                    return null;
                }

                var word = model.getWordAtPosition(position);
                if (!word) {
                    return null;
                }

                // Check that the character immediately before the word is '$'
                var lineText = model.getLineContent(position.lineNumber);
                var charBeforeWord = lineText[word.startColumn - 2]; // startColumn is 1-based
                if (charBeforeWord !== '$') {
                    return null;
                }

                var varName = '$' + word.word;
                var entry = null;
                for (var i = 0; i < vars.length; i++) {
                    if (vars[i].name === varName) {
                        entry = vars[i];
                        break;
                    }
                }
                if (!entry) {
                    return null;
                }

                return {
                    contents: [
                        {
                            value: '```scss\n' + entry.name + ': ' + entry.value + '\n```',
                        },
                    ],
                    range: new monaco.Range(
                        position.lineNumber,
                        word.startColumn - 1,
                        position.lineNumber,
                        word.endColumn
                    ),
                };
            },
        };

        monaco.languages.registerHoverProvider('scss', provider);
        monaco.languages.registerHoverProvider('less', provider);
    }

    // HTML class-name completion index
    ///////////////////////////////////////////

    /** Extracts unique class-selector names from CSS/SCSS text (top-level and nested alike — no attempt to resolve full nesting context). */
    function _extractCssClassNames(cssText) {
        var seen = {};
        if (!cssText) {
            return [];
        }
        var re = /\.(-?[a-zA-Z_][\w-]*)/g;
        var match;
        while ((match = re.exec(cssText)) !== null) {
            var prevChar = match.index > 0 ? cssText.charAt(match.index - 1) : '';
            if (/[\w.]/.test(prevChar)) {
                continue; // decimal number (e.g. 1.5rem) or already part of a longer token
            }
            seen[match[1]] = true;
        }
        return Object.keys(seen);
    }

    function _readHtmlClassIndexCache() {
        try {
            return JSON.parse(global.localStorage.getItem(_htmlClassIndexCacheKey) || '{}');
        } catch (e) {
            return {};
        }
    }

    function _writeHtmlClassIndexCache(cache) {
        try {
            global.localStorage.setItem(_htmlClassIndexCacheKey, JSON.stringify(cache));
        } catch (e) {}
    }

    function _rebuildHtmlClassIndex(bundles) {
        var sources = {}; // className -> { labelText: true }
        Object.keys(bundles).forEach(function (key) {
            var bundle = bundles[key];
            var label = bundle.label || key;
            (bundle.classes || []).forEach(function (c) {
                if (!sources[c]) {
                    sources[c] = {};
                }
                sources[c][label] = true;
            });
        });
        global.MONACO_HTML_CLASS_INDEX = Object.keys(sources)
            .sort()
            .map(function (name) {
                return {
                    name: name,
                    detail: Object.keys(sources[name]).sort().join(', '),
                };
            });
    }

    /** HEAD request for a URL's Last-Modified header, without downloading the body. */
    function _xhrHeadLastModified(url) {
        return new Promise(function (resolve) {
            var xhr = new XMLHttpRequest();
            xhr.open('HEAD', url, true);
            xhr.onload = function () {
                resolve(xhr.status === 200 ? xhr.getResponseHeader('Last-Modified') : null);
            };
            xhr.onerror = function () {
                resolve(null);
            };
            xhr.send();
        });
    }

    function _xhrGetText(url) {
        return new Promise(function (resolve) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.onload = function () {
                resolve(xhr.status === 200 ? xhr.responseText : '');
            };
            xhr.onerror = function () {
                resolve('');
            };
            xhr.send();
        });
    }

    function _xhrGetJson(url) {
        return new Promise(function (resolve) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.setRequestHeader('X-UserToken', global.g_ck || '');
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.onload = function () {
                if (xhr.status !== 200) {
                    resolve(null);
                    return;
                }
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                    resolve(null);
                }
            };
            xhr.onerror = function () {
                resolve(null);
            };
            xhr.send();
        });
    }

    /** Fetches a CSS bundle, skipping the body fetch if its Last-Modified header is unchanged. */
    function _loadCssBundle(url, cachedEntry, label) {
        return _xhrHeadLastModified(url).then(function (lastModified) {
            if (lastModified && cachedEntry && cachedEntry.lastModified === lastModified) {
                return cachedEntry;
            }
            return _xhrGetText(url).then(function (cssText) {
                return {
                    lastModified: lastModified,
                    classes: _extractCssClassNames(cssText),
                    label: label,
                };
            });
        });
    }

    /** Resolves sp_css_include sys_ids to a map of underlying sp_css sys_id -> stylesheet name. */
    function _resolveCssIncludesToSpCss(includeIds) {
        if (!includeIds.length) {
            return Promise.resolve({});
        }
        return _xhrGetJson(
            '/api/now/table/sp_css_include' +
                '?sysparm_query=sys_idIN' +
                includeIds.join(',') +
                '&sysparm_fields=sp_css%2Cname&sysparm_limit=200'
        ).then(function (includeData) {
            var map = {};
            ((includeData && includeData.result) || []).forEach(function (r) {
                var cssSysId = r.sp_css && r.sp_css.value;
                if (cssSysId && !map[cssSysId]) {
                    map[cssSysId] = r.name || cssSysId;
                }
            });
            return map;
        });
    }

    /** Resolves to a map of sp_css sys_id -> stylesheet name for a theme and/or widget dependencies. */
    function _getCssIncludeSysIds(themeSysId, dependencySysIds) {
        var lookups = [
            _xhrGetJson(
                '/api/now/table/m2m_sp_theme_css_include' +
                    '?sysparm_query=sp_theme=' +
                    encodeURIComponent(themeSysId) +
                    '&sysparm_fields=sp_css_include&sysparm_limit=200'
            ),
        ];
        if (dependencySysIds && dependencySysIds.length) {
            lookups.push(
                _xhrGetJson(
                    '/api/now/table/m2m_sp_dependency_css_include' +
                        '?sysparm_query=sp_dependencyIN' +
                        dependencySysIds.join(',') +
                        '&sysparm_fields=sp_css_include&sysparm_limit=200'
                )
            );
        }
        return Promise.all(lookups).then(function (results) {
            var seen = {};
            // Reference fields come back as {value, display_value, link} objects, not strings.
            results.forEach(function (data) {
                ((data && data.result) || []).forEach(function (r) {
                    var includeId = r.sp_css_include && r.sp_css_include.value;
                    if (includeId) {
                        seen[includeId] = true;
                    }
                });
            });
            return _resolveCssIncludesToSpCss(Object.keys(seen));
        });
    }

    /** Loads HTML class-name completions from the chosen portal/theme (and widget dependencies') compiled CSS. */
    function _loadHtmlClassIndex(context) {
        var portalSysId = (context && context.portalSysId) || '';
        var portalUrlSuffix = (context && context.portalUrlSuffix) || '';
        var themeSysId = (context && context.themeSysId) || '';
        var dependencySysIds = (context && context.dependencySysIds) || [];
        var includeStandardCss = !!(context && context.includeStandardCss);
        var contextKey =
            portalSysId +
            '::' +
            portalUrlSuffix +
            '::' +
            themeSysId +
            '::' +
            dependencySysIds.slice().sort().join(',') +
            '::' +
            includeStandardCss;

        if (_htmlClassIndexPromise && _htmlClassIndexContextKey === contextKey) {
            return _htmlClassIndexPromise;
        }

        var isEmptyContext = !portalSysId || !portalUrlSuffix || !themeSysId;
        if (isEmptyContext && _htmlClassIndexHasRealContext) {
            // A real portal/theme has already been supplied by some caller (or is still
            // resolving) — ignore this no-context call instead of wiping/cancelling that
            // work. Callers race an early call before user preferences finish loading
            // against a retrigger once they do; preferences never revert to unset once
            // loaded, so a later no-context call here is a caller that simply doesn't
            // have them, not a legitimate "preference cleared" signal.
            return _htmlClassIndexPromise || Promise.resolve();
        }
        _htmlClassIndexContextKey = contextKey;

        if (isEmptyContext) {
            global.MONACO_HTML_CLASS_INDEX = [];
            _htmlClassIndexPromise = Promise.resolve();
            return _htmlClassIndexPromise;
        }
        _htmlClassIndexHasRealContext = true;

        var stored = _readHtmlClassIndexCache();
        var cachedBundles = (stored.contextKey === contextKey && stored.bundles) || {};

        _htmlClassIndexPromise = _getCssIncludeSysIds(themeSysId, dependencySysIds)
            .then(function (cssNamesBySysId) {
                var bundleUrls = {};
                var bundleLabels = {};
                if (includeStandardCss) {
                    bundleUrls.standard_main = '/styles/css_includes_$sp.css';
                    bundleUrls.standard_later = '/styles/css_includes_$sp_later.css';
                    bundleLabels.standard_main = 'Service Portal (base)';
                    bundleLabels.standard_later = 'Service Portal (deferred)';
                }
                Object.keys(cssNamesBySysId).forEach(function (cssSysId) {
                    bundleUrls[cssSysId] =
                        '/' +
                        cssSysId +
                        '.spcssdbx' +
                        '?portal=' +
                        encodeURIComponent(portalSysId) +
                        '&theme=' +
                        encodeURIComponent(themeSysId);
                    bundleLabels[cssSysId] = cssNamesBySysId[cssSysId];
                });

                return Promise.all(
                    Object.keys(bundleUrls).map(function (key) {
                        return _loadCssBundle(bundleUrls[key], cachedBundles[key], bundleLabels[key]).then(
                            function (entry) {
                                return { key: key, entry: entry };
                            }
                        );
                    })
                ).then(function (results) {
                    var nextBundles = {};
                    results.forEach(function (r) {
                        nextBundles[r.key] = r.entry;
                    });
                    if (_htmlClassIndexContextKey !== contextKey) {
                        return;
                    }
                    _writeHtmlClassIndexCache({
                        contextKey: contextKey,
                        bundles: nextBundles,
                    });
                    _rebuildHtmlClassIndex(nextBundles);
                });
            })
            .catch(function () {});

        return _htmlClassIndexPromise;
    }

    ///////////////////////////////////////////
    // Providers
    ///////////////////////////////////////////

    /**
     * Resolves the Script Include class assigned via \`this.prop = new ClassName();\`,
     * since TypeScript can't type \`this\` inside the Class.create() pattern.
     * @param {string} content  - Full model text.
     * @param {string} propName - Property name after \`this.\`.
     * @returns {string|null} Class name, or null when no assignment is found.
     */
    function _getThisPropClass(content, propName) {
        var re = new RegExp('\\bthis\\s*\\.\\s*' + propName + '\\s*=\\s*new\\s+([A-Z][A-Za-z0-9_]*)\\s*\\(');
        var m = re.exec(content);
        return m ? m[1] : null;
    }

    /**
     * Builds instance-member suggestions (methods + properties) for a fetched
     * Script Include, for use as the direct result of a completion request.
     *
     * @param {Array}  methods    - Result of fetchSiMethods(className).
     * @param {string} className
     * @param {Object} targetRange
     * @returns {Array}
     */
    function _buildSiInstanceSuggestions(methods, className, targetRange) {
        var methodSugs = (methods || [])
            .filter(function (m) {
                return !m.isConstructor && m.name;
            })
            .map(function (m) {
                return {
                    label: String(m.name),
                    kind: monaco.languages.CompletionItemKind.Method,
                    detail: String(m.signature),
                    documentation: {
                        value: String(m.documentation),
                        isTrusted: true,
                    },
                    insertText: String(m.name),
                    range: targetRange,
                };
            });
        var props = _siPropertyCache[className] || [];
        var propSugs = props.map(function (p) {
            return {
                label: String(p.name),
                kind: monaco.languages.CompletionItemKind.Property,
                detail: String(p.name) + ': ' + String(p.tsType),
                documentation: p.documentation ? { value: String(p.documentation), isTrusted: true } : undefined,
                insertText: String(p.name),
                range: targetRange,
            };
        });
        return methodSugs.concat(propSugs);
    }

    /**
     * Builds constant suggestions for a fetched Script Include referenced by
     * bare class name (e.g. IncidentUtilsSNC.SOME_CONSTANT).
     *
     * @param {string} className
     * @param {Object} targetRange
     * @returns {Array}
     */
    function _buildSiConstantSuggestions(className, targetRange) {
        var consts = _siConstantCache[className] || [];
        return consts.map(function (c) {
            return {
                label: String(c.name),
                kind: monaco.languages.CompletionItemKind.Constant,
                detail: className + '.' + c.name + ': ' + c.tsType,
                documentation: c.documentation ? { value: c.documentation, isTrusted: true } : undefined,
                insertText: String(c.name),
                range: targetRange,
            };
        });
    }

    /** Dot-completion provider for TypeScript/JavaScript: this. (live-parsed) and instance. (via REST fetch of the assigned SI). */
    function registerDotCompletions() {
        if (_completionRegistered || !window.monaco) {
            return;
        }
        _completionRegistered = true;

        var provider = {
            triggerCharacters: ['.'],
            provideCompletionItems: function (model, position) {
                var lineText = model.getLineContent(position.lineNumber);
                var beforeCursor = lineText.substring(0, position.column - 1);

                var wordInfo = model.getWordUntilPosition(position);
                var targetRange = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: wordInfo.startColumn,
                    endColumn: wordInfo.endColumn,
                };

                // this. — parse current model directly, no server fetch needed
                var thisMatch = beforeCursor.match(/\bthis\.(\w*)$/);
                if (thisMatch) {
                    var content = model.getValue();
                    if (!/\bClass\.create\s*\(\s*\)/.test(content)) {
                        return {
                            suggestions: [],
                        };
                    }
                    var methodSugs = parseSiMethods(content)
                        .filter(function (m) {
                            return !m.isConstructor && m.name;
                        })
                        .map(function (m) {
                            return {
                                label: String(m.name),
                                kind: monaco.languages.CompletionItemKind.Method,
                                detail: String(m.signature),
                                documentation: {
                                    value: String(m.documentation),
                                    isTrusted: true,
                                },
                                insertText: String(m.name),
                                range: targetRange,
                            };
                        });
                    var propSugs = parseSiProperties(content).map(function (p) {
                        return {
                            label: String(p.name),
                            kind: monaco.languages.CompletionItemKind.Property,
                            detail: String(p.name) + ': ' + String(p.tsType),
                            documentation: p.documentation
                                ? {
                                      value: String(p.documentation),
                                      isTrusted: true,
                                  }
                                : undefined,
                            insertText: String(p.name),
                            range: targetRange,
                        };
                    });
                    return {
                        suggestions: methodSugs.concat(propSugs),
                    };
                }

                /* this.prop. — TypeScript types 'this' as any inside Class.create(), so we supply completions manually. */
                var thisPropMatch = beforeCursor.match(/\bthis\.(\w+)\.(\w*)$/);
                if (thisPropMatch) {
                    var thisPropClass = _getThisPropClass(model.getValue(), thisPropMatch[1]);
                    if (thisPropClass) {
                        return fetchSiMethods(thisPropClass).then(function (methods) {
                            var methodSugs = (methods || [])
                                .filter(function (m) {
                                    return !m.isConstructor && m.name;
                                })
                                .map(function (m) {
                                    return {
                                        label: String(m.name),
                                        kind: monaco.languages.CompletionItemKind.Method,
                                        detail: String(m.signature),
                                        documentation: {
                                            value: String(m.documentation),
                                            isTrusted: true,
                                        },
                                        insertText: String(m.name),
                                        range: targetRange,
                                    };
                                });
                            var props = _siPropertyCache[thisPropClass] || [];
                            var propSugs = props.map(function (p) {
                                return {
                                    label: String(p.name),
                                    kind: monaco.languages.CompletionItemKind.Property,
                                    detail: String(p.name) + ': ' + String(p.tsType),
                                    documentation: p.documentation
                                        ? {
                                              value: String(p.documentation),
                                              isTrusted: true,
                                          }
                                        : undefined,
                                    insertText: String(p.name),
                                    range: targetRange,
                                };
                            });
                            return {
                                suggestions: methodSugs.concat(propSugs),
                            };
                        });
                    }
                }

                /* new ClassName(). — direct chain without a variable assignment */
                var newChainMatch = beforeCursor.match(/\bnew\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\.(\w*)$/);
                if (newChainMatch) {
                    var siClassName = newChainMatch[1];
                    /* Once the DTS is registered, TypeScript is the sole provider — avoids duplicate suggestions. */
                    if (_siMethodCache[siClassName]) {
                        return null;
                    }
                    return fetchSiMethods(siClassName).then(function (methods) {
                        return {
                            suggestions: _buildSiInstanceSuggestions(methods, siClassName, targetRange),
                        };
                    });
                }

                /* Multi-segment GlideRecord dot-walk (gr.company., gr.caller_id.manager.); requires ≥2 segments. */
                var multiSegMatch = beforeCursor.match(/(\w+)((?:\.\w+)+)\.(\w*)$/);
                if (multiSegMatch) {
                    var chainRoot = multiSegMatch[1];
                    var chainSegments = multiSegMatch[2].slice(1).split('.');
                    var chainBaseTable = getGlideRecordTable(model, chainRoot);
                    if (chainBaseTable) {
                        return _resolveFieldChain(chainBaseTable, chainSegments).then(function (resolvedTable) {
                            if (!resolvedTable) return { suggestions: [] };
                            return fetchTableFields(resolvedTable).then(function (fields) {
                                return {
                                    suggestions: fields.map(function (f) {
                                        return {
                                            label: String(f.name),
                                            kind: monaco.languages.CompletionItemKind.Field,
                                            detail: String(f.label) + ' (' + String(f.type) + ')',
                                            insertText: String(f.name),
                                            range: targetRange,
                                        };
                                    }),
                                };
                            });
                        });
                    }
                }

                // varName. — scan the model for var varName = new ClassName(
                var dotMatch = beforeCursor.match(/(\w+)\.(\w*)$/);
                if (!dotMatch) {
                    return {
                        suggestions: [],
                    };
                }
                var varName = dotMatch[1];

                // GlideRecord/GlideRecordSecure — show table field names
                var grTable = getGlideRecordTable(model, varName);
                if (grTable) {
                    return fetchTableFields(grTable).then(function (fields) {
                        return {
                            suggestions: fields.map(function (f) {
                                return {
                                    label: String(f.name),
                                    kind: monaco.languages.CompletionItemKind.Field,
                                    detail: String(f.label) + ' (' + String(f.type) + ')',
                                    insertText: String(f.name),
                                    range: targetRange,
                                };
                            }),
                        };
                    });
                }

                /* ClassName. within the SI being edited — suggest its own constants */
                var content = model.getValue();
                var classCreateRe = new RegExp(
                    '(?:var|let|const)\\s+(' + varName + ')\\s*=\\s*Class\\.create\\s*\\(\\s*\\)'
                );
                if (classCreateRe.test(content)) {
                    return {
                        suggestions: parseSiConstants(content, varName).map(function (c) {
                            return {
                                label: String(c.name),
                                kind: monaco.languages.CompletionItemKind.Constant,
                                detail: varName + '.' + c.name + ': ' + c.tsType,
                                documentation: c.documentation
                                    ? {
                                          value: c.documentation,
                                          isTrusted: true,
                                      }
                                    : undefined,
                                insertText: String(c.name),
                                range: targetRange,
                            };
                        }),
                    };
                }

                /* ClassName. — registers the SI DTS and defers to TypeScript as sole provider; skips names with an instance assignment (handled below). */
                var instanceAssignRe = new RegExp(
                    '(?:var|let|const)\\s+' + varName + '\\s*=\\s*new\\s+[A-Z][A-Za-z0-9_]*\\s*\\('
                );
                if (/^[A-Z]/.test(varName) && _siNameMap[varName] !== '' && !instanceAssignRe.test(content)) {
                    if (_siNameMap[varName]) {
                        /* Already confirmed as an SI — DTS is registered, defer to TypeScript */
                        if (_siMethodCache[varName]) {
                            return null;
                        }
                        return fetchSiMethods(varName).then(function () {
                            return {
                                suggestions: _buildSiConstantSuggestions(varName, targetRange),
                            };
                        });
                    }
                    /* Not checked yet — verify name, register DTS if found */
                    return new Promise(function (resolve) {
                        _checkSiExists(varName, function (name) {
                            if (!name) {
                                resolve({ suggestions: [] });
                                return;
                            }
                            fetchSiMethods(name).then(function () {
                                resolve({
                                    suggestions: _buildSiConstantSuggestions(name, targetRange),
                                });
                            });
                        });
                    });
                }

                var assignRe = new RegExp(
                    '(?:var|let|const)\\s+' + varName + '\\s*=\\s*new\\s+([A-Z][A-Za-z0-9_]*)\\s*\\(',
                    'g'
                );
                var assignMatch = assignRe.exec(content);
                if (!assignMatch || _isChainedConstructor(content, assignMatch)) {
                    return {
                        suggestions: [],
                    };
                }

                var className = assignMatch[1];

                /* DTS registered — TypeScript is the sole provider. */
                if (_siMethodCache[className]) {
                    return null;
                }
                return fetchSiMethods(className).then(function (methods) {
                    return {
                        suggestions: _buildSiInstanceSuggestions(methods, className, targetRange),
                    };
                });
            },
        };

        monaco.languages.registerCompletionItemProvider('typescript', provider);
        monaco.languages.registerCompletionItemProvider('javascript', provider);
    }

    ///////////////////////////////////////////
    // Quick-info hover replacement
    ///////////////////////////////////////////

    /* SN's bundled hover renderer expects string JSDoc tags but TS 5.x returns parts arrays, so native hover shows nothing useful; this suppresses it and re-renders quick info from the worker client, with a keep-alive to survive worker recycling. */

    /** Joins a TS displayParts array (or passes a plain string through). */
    function _qiPartsToString(parts) {
        if (!parts) {
            return '';
        }
        if (typeof parts === 'string') {
            return parts;
        }
        return parts
            .map(function (p) {
                return p.text;
            })
            .join('');
    }

    /** Renders one JSDoc tag as markdown, e.g. *@param* `name` — description. */
    function _qiRenderTag(tag) {
        var label = '*@' + tag.name + '*';
        var text = _qiPartsToString(tag.text);
        if (!text) {
            return label;
        }
        if (tag.name === 'param') {
            var m = /^\s*(\S+)\s*([\s\S]*)$/.exec(text);
            if (m) {
                var rest = m[2].replace(/^[-\u2014]\s*/, '');
                label += ' `' + m[1] + '`';
                if (rest) {
                    label += ' \u2014 ' + rest;
                }
                return label;
            }
        }
        return label + ' \u2014 ' + text.replace(/^[-\u2014]\s*/, '');
    }

    /** Patches getQuickInfoAtPosition to suppress the native hover; the original is kept for our own provider. Idempotent per client. */
    function _qiEnsurePatched(client) {
        if (!client || client.__weQiPatched) {
            return;
        }
        client.__weQiPatched = true;
        client.__weOrigQi = client.getQuickInfoAtPosition.bind(client);
        client.getQuickInfoAtPosition = function () {
            return Promise.resolve(undefined);
        };
    }

    /** Patches the worker client for one language; resolves quietly on failure. */
    function _qiPatchLanguage(lang) {
        var ts = monaco.languages.typescript;
        var getWorker = lang === 'typescript' ? ts.getTypeScriptWorker : ts.getJavaScriptWorker;
        if (!getWorker) {
            return Promise.resolve(null);
        }
        var models = monaco.editor.getModels().filter(function (m) {
            return m.getLanguageId() === lang;
        });
        if (!models.length) {
            return Promise.resolve(null);
        }
        return getWorker()
            .then(function (worker) {
                return worker(models[0].uri);
            })
            .then(function (client) {
                _qiEnsurePatched(client);
                return client;
            })
            .catch(function () {
                return null;
            });
    }

    /**
     * Suppresses the native (broken) TS/JS hover and registers a replacement
     * that renders quick info with correct JSDoc tag formatting. Idempotent.
     */
    function _installQuickInfoHover() {
        if (_qiHoverInstalled || !window.monaco || !monaco.languages || !monaco.languages.typescript) {
            return;
        }
        _qiHoverInstalled = true;

        // Eager patch + keep-alive: re-applies after any worker recycle and,
        // by touching the worker, prevents idle recycling in the first place.
        function _patchAll() {
            _qiPatchLanguage('javascript');
            _qiPatchLanguage('typescript');
        }
        _patchAll();
        if (!_qiKeepAliveTimer) {
            _qiKeepAliveTimer = setInterval(_patchAll, 30000);
        }

        var provider = {
            provideHover: function (model, position) {
                var lang = model.getLanguageId();
                if (lang !== 'javascript' && lang !== 'typescript') {
                    return null;
                }
                var ts = monaco.languages.typescript;
                var getWorker = lang === 'typescript' ? ts.getTypeScriptWorker : ts.getJavaScriptWorker;
                if (!getWorker) {
                    return null;
                }
                var offset = model.getOffsetAt(position);
                return getWorker()
                    .then(function (worker) {
                        return worker(model.uri);
                    })
                    .then(function (client) {
                        _qiEnsurePatched(client);
                        return client.__weOrigQi(model.uri.toString(), offset);
                    })
                    .then(function (info) {
                        if (!info || model.isDisposed()) {
                            return null;
                        }
                        var sig = _qiPartsToString(info.displayParts);
                        var doc = _qiPartsToString(info.documentation);
                        var tagsMd = (info.tags || []).map(_qiRenderTag).join('  \n\n');
                        /* Bare 'any' with no docs is noise — this.utils.* is handled by the SI hover provider instead. */
                        if (sig === 'any' && !doc && !tagsMd) {
                            return null;
                        }
                        var contents = [];
                        if (sig) {
                            contents.push({
                                value: '```typescript\n' + sig + '\n```',
                            });
                        }
                        var body = [doc, tagsMd].filter(Boolean).join('\n\n');
                        if (body) {
                            contents.push({ value: body, isTrusted: true });
                        }
                        if (!contents.length) {
                            return null;
                        }
                        var start = model.getPositionAt(info.textSpan.start);
                        var end = model.getPositionAt(info.textSpan.start + info.textSpan.length);
                        return {
                            contents: contents,
                            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
                        };
                    })
                    .catch(function () {
                        return null;
                    });
            },
        };

        monaco.languages.registerHoverProvider('javascript', provider);
        monaco.languages.registerHoverProvider('typescript', provider);
    }

    /** Shows JSDoc on hover for this.methodName and instance.methodName (assigned via new). */
    function registerHoverProvider() {
        if (_hoverRegistered || !window.monaco) {
            return;
        }
        _hoverRegistered = true;

        var provider = {
            provideHover: function (model, position) {
                var word = model.getWordAtPosition(position);
                if (!word) {
                    return null;
                }

                var lineText = model.getLineContent(position.lineNumber);
                var preWord = lineText.substring(0, word.startColumn - 1);
                var varMatch = preWord.match(/(\w+)\.\s*$/);
                var newDotMatch = preWord.match(/\bnew\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\.\s*$/);
                if (!varMatch && !newDotMatch) {
                    return null;
                }

                var varName = varMatch ? varMatch[1] : null;

                /* Builds the hover result from a method descriptor array. */
                function buildResult(methods) {
                    var found = methods.find(function (m) {
                        return m.name === word.word;
                    });
                    if (!found) {
                        return null;
                    }
                    var contents = [
                        {
                            value: '```typescript\n' + found.signature + '\n```',
                        },
                    ];
                    if (found.documentation) {
                        contents.push({
                            value: found.documentation,
                            isTrusted: true,
                        });
                    }
                    return {
                        contents: contents,
                        range: new monaco.Range(
                            position.lineNumber,
                            word.startColumn,
                            position.lineNumber,
                            word.endColumn
                        ),
                    };
                }

                if (newDotMatch) {
                    return fetchSiMethods(newDotMatch[1]).then(buildResult);
                }

                if (varName === 'this') {
                    var content = model.getValue();
                    if (!/\bClass\.create\s*\(\s*\)/.test(content)) {
                        return null;
                    }
                    return buildResult(parseSiMethods(content));
                }

                /* this.prop.method — TS types 'this' as any here, so native hover shows nothing useful. */
                var thisPropHover = preWord.match(/\bthis\.(\w+)\.\s*$/);
                if (thisPropHover) {
                    var thisPropClass = _getThisPropClass(model.getValue(), thisPropHover[1]);
                    if (thisPropClass) {
                        return fetchSiMethods(thisPropClass).then(buildResult);
                    }
                }

                // GlideRecord/GlideRecordSecure — show field type on hover
                var grTable = getGlideRecordTable(model, varName);
                if (grTable) {
                    return fetchTableFields(grTable).then(function (fields) {
                        var found = fields.find(function (f) {
                            return f.name === word.word;
                        });
                        if (!found) {
                            return null;
                        }
                        return {
                            contents: [
                                {
                                    value: '```typescript\n(field) ' + found.name + ': GlideElement\n```',
                                },
                                {
                                    value:
                                        '**' +
                                        found.label +
                                        '**' +
                                        (found.mandatory ? ' *(required)*' : '') +
                                        '\n\nType: `' +
                                        found.type +
                                        '`',
                                    isTrusted: true,
                                },
                            ],
                            range: new monaco.Range(
                                position.lineNumber,
                                word.startColumn,
                                position.lineNumber,
                                word.endColumn
                            ),
                        };
                    });
                }

                /* ClassName.PROP — registers DTS, defers hover to TypeScript; same instance-assignment guard as completions. */
                var hoverInstanceRe = new RegExp(
                    '(?:var|let|const)\\s+' + varName + '\\s*=\\s*new\\s+[A-Z][A-Za-z0-9_]*\\s*\\('
                );
                if (/^[A-Z]/.test(varName) && _siNameMap[varName] !== '' && !hoverInstanceRe.test(model.getValue())) {
                    if (_siNameMap[varName]) {
                        if (_siMethodCache[varName]) {
                            return null;
                        }
                        return fetchSiMethods(varName).then(function () {
                            return null;
                        });
                    }
                    return new Promise(function (resolve) {
                        _checkSiExists(varName, function (name) {
                            if (!name) {
                                resolve(null);
                                return;
                            }
                            fetchSiMethods(name).then(function () {
                                resolve(null);
                            });
                        });
                    });
                }

                var assignRe = new RegExp(
                    '(?:var|let|const)\\s+' + varName + '\\s*=\\s*new\\s+([A-Z][A-Za-z0-9_]*)\\s*\\(',
                    'g'
                );
                var assignMatch = assignRe.exec(model.getValue());
                if (!assignMatch || _isChainedConstructor(model.getValue(), assignMatch)) {
                    return null;
                }

                return fetchSiMethods(assignMatch[1]).then(function (methods) {
                    return buildResult(methods, assignMatch[1]);
                });
            },
        };

        monaco.languages.registerHoverProvider('typescript', provider);
        monaco.languages.registerHoverProvider('javascript', provider);
    }

    /** Shows parameter hints for this.methodName( and instance.methodName( (assigned via new). */
    function registerSignatureHelp() {
        if (_sigHelpRegistered || !window.monaco) {
            return;
        }
        _sigHelpRegistered = true;

        var provider = {
            signatureHelpTriggerCharacters: ['('],
            signatureHelpRetriggerCharacters: [','],
            provideSignatureHelp: function (model, position) {
                var lineText = model.getLineContent(position.lineNumber);
                var beforeCursor = lineText.substring(0, position.column - 1);
                var callMatch = beforeCursor.match(/(\w+)\.(\w+)\s*\(([^)]*)$/);
                var newCallMatch = beforeCursor.match(/\bnew\s+([A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\.(\w+)\s*\(([^)]*)$/);
                if (!callMatch && !newCallMatch) {
                    return null;
                }

                var varName = callMatch ? callMatch[1] : null;
                var methodName = callMatch ? callMatch[2] : newCallMatch[2];
                var argsTyped = callMatch ? callMatch[3] : newCallMatch[3];

                /* Builds the signature help result from a method descriptor array. */
                function buildResult(methods) {
                    var found = methods.find(function (m) {
                        return m.name === methodName;
                    });
                    if (!found) {
                        return null;
                    }
                    var activeParam = argsTyped.split(',').length - 1;
                    var parameters = (found.params || []).map(function (p) {
                        var desc = found.paramDocs && found.paramDocs[p];
                        return desc
                            ? {
                                  label: p,
                                  documentation: {
                                      value: desc,
                                      isTrusted: true,
                                  },
                              }
                            : { label: p };
                    });
                    return {
                        value: {
                            signatures: [
                                {
                                    label: found.signature,
                                    documentation: {
                                        value: found.documentation,
                                        isTrusted: true,
                                    },
                                    parameters: parameters,
                                },
                            ],
                            activeSignature: 0,
                            activeParameter: activeParam,
                        },
                        dispose: function () {},
                    };
                }

                if (newCallMatch) {
                    return fetchSiMethods(newCallMatch[1]).then(buildResult);
                }

                if (varName === 'this') {
                    var content = model.getValue();
                    if (!/\bClass\.create\s*\(\s*\)/.test(content)) {
                        return null;
                    }
                    return buildResult(parseSiMethods(content));
                }

                /* this.prop.method( — instance property assigned via
                 * this.prop = new SI(). */
                var thisPropCall = beforeCursor.match(/\bthis\.(\w+)\.(\w+)\s*\(([^)]*)$/);
                if (thisPropCall) {
                    var thisPropClass = _getThisPropClass(model.getValue(), thisPropCall[1]);
                    if (thisPropClass) {
                        return fetchSiMethods(thisPropClass).then(buildResult);
                    }
                }

                var assignRe = new RegExp(
                    '(?:var|let|const)\\s+' + varName + '\\s*=\\s*new\\s+([A-Z][A-Za-z0-9_]*)\\s*\\(',
                    'g'
                );
                var assignMatch = assignRe.exec(model.getValue());
                if (!assignMatch || _isChainedConstructor(model.getValue(), assignMatch)) {
                    return null;
                }

                return fetchSiMethods(assignMatch[1]).then(function (methods) {
                    return buildResult(methods, assignMatch[1]);
                });
            },
        };

        monaco.languages.registerSignatureHelpProvider('typescript', provider);
        monaco.languages.registerSignatureHelpProvider('javascript', provider);
    }

    /** Suggests SI class names after 'new' (debounced fetch, snippet) and on any capitalised word (from cache). */
    function registerNewSiCompletions() {
        if (_newSiRegistered || !window.monaco) {
            return;
        }
        _newSiRegistered = true;

        // Debounce state for the 'new' provider fallback fetch.
        var _siDebounceTimer = null;
        var _siPending = []; // { prefix, range, resolve }[]

        function _getCachedSIs(prefix) {
            var lower = prefix ? prefix.toLowerCase() : '';
            var results = [];
            Object.keys(_siNameMap).forEach(function (name) {
                if (_siNameMap[name] && (!lower || name.toLowerCase().indexOf(lower) === 0)) {
                    results.push({ name: name, sys_id: _siNameMap[name] });
                }
            });
            results.sort(function (a, b) {
                return a.name.localeCompare(b.name);
            });
            return results.slice(0, SI_PREFIX_LIMIT);
        }

        /* A prefix is only safe to serve from cache if some already-fetched prefix it extends
         * came back under SI_PREFIX_LIMIT — otherwise that fetch may have been truncated and
         * _siNameMap can be silently missing matches for this narrower/longer prefix. */
        function _isPrefixKnownComplete(prefix) {
            var lower = prefix ? prefix.toLowerCase() : '';
            if (_siCompletePrefixes[lower]) {
                return true;
            }
            for (var p in _siCompletePrefixes) {
                if (_siCompletePrefixes.hasOwnProperty(p) && lower.indexOf(p) === 0) {
                    return true;
                }
            }
            return false;
        }

        function _toSuggestions(cachedList, range) {
            return cachedList.map(function (r) {
                return {
                    label: r.name,
                    kind: monaco.languages.CompletionItemKind.Constructor,
                    detail: 'Script Include',
                    insertText: r.name + '($1)',
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range: range,
                };
            });
        }

        // Provider 1 — after 'new ' keyword, triggered by space / tab.
        var newKeywordProvider = {
            triggerCharacters: [' ', '\t'],
            provideCompletionItems: function (model, position) {
                var lineText = model.getLineContent(position.lineNumber);
                var textBefore = lineText.substring(0, position.column - 1);
                var m = textBefore.match(/\bnew\s+(\w*)$/);
                if (!m) {
                    return { suggestions: [] };
                }
                var prefix = m[1];
                var word = model.getWordUntilPosition(position);
                var range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };
                if (_isPrefixKnownComplete(prefix)) {
                    return {
                        suggestions: _toSuggestions(_getCachedSIs(prefix), range),
                    };
                }
                // Cache not provably complete for this prefix — debounce the fetch so rapid keystrokes share one request.
                return new Promise(function (resolve) {
                    _siPending.push({
                        prefix: prefix,
                        range: range,
                        resolve: resolve,
                    });
                    clearTimeout(_siDebounceTimer);
                    _siDebounceTimer = setTimeout(function () {
                        var pending = _siPending.splice(0);
                        var latestPrefix = pending[pending.length - 1].prefix;
                        _fetchSiByPrefix(latestPrefix, function () {
                            pending.forEach(function (p) {
                                p.resolve({
                                    suggestions: _toSuggestions(_getCachedSIs(p.prefix), p.range),
                                });
                            });
                        });
                    }, 300);
                });
            },
        };

        // Only returns results for 2+ char words with matching cache entries, so the widget stays closed otherwise.
        var capitalWordProvider = {
            triggerCharacters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
            provideCompletionItems: function (model, position) {
                var word = model.getWordUntilPosition(position);
                if (!word || !word.word || !/^[A-Z]/.test(word.word) || word.word.length < 2) {
                    return { suggestions: [] };
                }
                // Defer to the 'new' provider when the word is immediately after new
                var lineText = model.getLineContent(position.lineNumber);
                var textBefore = lineText.substring(0, word.startColumn - 1);
                if (/\bnew\s+$/.test(textBefore)) {
                    return { suggestions: [] };
                }
                var range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn,
                };
                var cached = _getCachedSIs(word.word);
                if (!cached.length) {
                    return { suggestions: [] };
                }
                return {
                    suggestions: cached.map(function (r) {
                        return {
                            label: r.name,
                            kind: monaco.languages.CompletionItemKind.Class,
                            detail: 'Script Include',
                            insertText: r.name,
                            range: range,
                        };
                    }),
                };
            },
        };

        monaco.languages.registerCompletionItemProvider('typescript', newKeywordProvider);
        monaco.languages.registerCompletionItemProvider('javascript', newKeywordProvider);
        monaco.languages.registerCompletionItemProvider('typescript', capitalWordProvider);
        monaco.languages.registerCompletionItemProvider('javascript', capitalWordProvider);
    }

    /** Suggests GlideRecord field names (dot-walk aware) inside field-consuming method string args. */
    function registerGrFieldStringCompletions() {
        if (_grStringCompletionRegistered || !window.monaco) {
            return;
        }
        _grStringCompletionRegistered = true;

        var provider = {
            triggerCharacters: ["'", '"', '.'],
            provideCompletionItems: function (model, position) {
                var ctx = _getFieldStringContext(model, position);
                if (!ctx) {
                    return { suggestions: [] };
                }
                var baseTable = _findGrTable(model, ctx.varName, position.lineNumber);
                if (!baseTable) {
                    return { suggestions: [] };
                }

                function buildSuggestions(fields) {
                    if (!fields) {
                        return { suggestions: [] };
                    }
                    return {
                        suggestions: fields.map(function (f) {
                            return {
                                label: f.name,
                                kind: monaco.languages.CompletionItemKind.Field,
                                detail: f.label !== f.name ? f.label : '',
                                documentation: f.type + (f.reference ? ' → ' + f.reference : ''),
                                insertText: f.name,
                                range: ctx.range,
                            };
                        }),
                    };
                }

                // No dot-walk — fast synchronous path when the table is already cached.
                if (!ctx.dotPath || ctx.dotPath.length === 0) {
                    var cached = _tableFieldCache[baseTable];
                    if (cached && !_tablePendingCache[baseTable]) {
                        return buildSuggestions(cached);
                    }
                    fetchTableFields(baseTable); // fire-and-forget
                    return { incomplete: true, suggestions: [] };
                }

                // Dot-walk: resolve the reference chain, then return fields of the
                // target table.  Always async because this needs at least one fetch.
                return _resolveFieldChain(baseTable, ctx.dotPath).then(function (targetTable) {
                    if (!targetTable) {
                        return { suggestions: [] };
                    }
                    return fetchTableFields(targetTable).then(buildSuggestions);
                });
            },
        };

        monaco.languages.registerCompletionItemProvider('javascript', provider);
        monaco.languages.registerCompletionItemProvider('typescript', provider);
    }

    /** Shows dictionary metadata on hover for a GlideRecord field-name string, resolving each dot-walked segment's table. */
    function registerGrFieldStringHover() {
        if (_grStringHoverRegistered || !window.monaco) {
            return;
        }
        _grStringHoverRegistered = true;

        var provider = {
            provideHover: function (model, position) {
                var ctx = _getFieldContextAtPos(model, position);
                if (!ctx) {
                    return null;
                }
                var baseTable = _findGrTable(model, ctx.varName, position.lineNumber);
                if (!baseTable) {
                    return null;
                }

                var segments = ctx.fieldName.split('.');

                // Find the opening quote so we can locate the cursor within the string.
                var lineContent = model.getLineContent(position.lineNumber);
                var col = position.column - 1; // 0-based
                var sIdx = -1;
                for (var i = col - 1; i >= 0; i--) {
                    var ch = lineContent[i];
                    if (ch === "'" || ch === '"') {
                        sIdx = i;
                        break;
                    }
                    if (ch === '(') {
                        break;
                    }
                }
                if (sIdx === -1) {
                    return null;
                }

                // Cursor offset within the string content (0-based).
                var cursorOffset = col - sIdx - 1;

                // Identify which segment the cursor sits in, and its start offset.
                var segIdx = 0,
                    segStart = 0;
                var off = 0;
                for (var k = 0; k < segments.length; k++) {
                    segIdx = k;
                    segStart = off;
                    if (cursorOffset <= off + segments[k].length - 1) {
                        break;
                    }
                    off += segments[k].length + 1; // +1 for the '.'
                }

                var dotPathForSeg = segments.slice(0, segIdx);
                var hoveredField = segments[segIdx];

                return _resolveFieldChain(baseTable, dotPathForSeg).then(function (resolvedTable) {
                    if (!resolvedTable) {
                        return null;
                    }
                    return fetchFieldDoc(resolvedTable, hoveredField).then(function (info) {
                        if (!info) {
                            return null;
                        }

                        // Range covers the hovered segment only (not the full string).
                        // 1-based: (0-based quote pos) + (0-based segment start) + 2
                        var segStartCol = sIdx + segStart + 2;
                        var segEndCol = segStartCol + hoveredField.length; // exclusive
                        var range = new monaco.Range(position.lineNumber, segStartCol, position.lineNumber, segEndCol);

                        var header = '**' + info.label + '**';
                        if (info.type) {
                            header += '&nbsp;&nbsp;`' + info.type + '`';
                        }
                        var contents = [
                            {
                                value: header,
                                isTrusted: true,
                                supportHtml: true,
                            },
                        ];
                        var meta = [];
                        if (info.max_length) {
                            meta.push('Max length: ' + info.max_length);
                        }
                        if (info.mandatory) {
                            meta.push('Mandatory');
                        }
                        if (meta.length) {
                            contents.push({ value: meta.join(' · ') });
                        }
                        contents.push({
                            value: '*' + resolvedTable + '.' + hoveredField + '*',
                        });
                        if (info.reference) {
                            contents.push({
                                value: 'References: `' + info.reference + '`',
                            });
                        }
                        return { range: range, contents: contents };
                    });
                });
            },
        };

        monaco.languages.registerHoverProvider('javascript', provider);
        monaco.languages.registerHoverProvider('typescript', provider);
    }

    /** Suggests table names (fetched 50 at a time, cached per prefix) in a GlideRecord/GlideAggregate constructor's first arg. */
    function registerGrConstructorCompletions() {
        if (_grConstructorCompletionRegistered || !window.monaco) {
            return;
        }
        _grConstructorCompletionRegistered = true;

        var provider = {
            triggerCharacters: ["'", '"'],
            provideCompletionItems: function (model, position) {
                var ctx = _getGrConstructorContext(model, position);
                if (!ctx) {
                    return { suggestions: [] };
                }

                return fetchTablesMatching(ctx.prefix).then(function (tables) {
                    return {
                        incomplete: true,
                        suggestions: tables.map(function (t) {
                            return {
                                label: t.name,
                                kind: monaco.languages.CompletionItemKind.Class,
                                detail: t.label !== t.name ? t.label : '',
                                insertText: t.name,
                                range: ctx.range,
                            };
                        }),
                    };
                });
            },
        };

        monaco.languages.registerCompletionItemProvider('javascript', provider);
        monaco.languages.registerCompletionItemProvider('typescript', provider);
    }

    /** Suggests table/field names in a Script Include call's string arg, based on the SI's JSDoc @param name. */
    function registerSiParamStringCompletions() {
        if (_siParamStringCompletionRegistered || !window.monaco) {
            return;
        }
        _siParamStringCompletionRegistered = true;

        var provider = {
            triggerCharacters: ["'", '"'],
            provideCompletionItems: function (model, position) {
                var ctx = _getSiCallContext(model, position);
                if (!ctx) {
                    return { suggestions: [] };
                }

                return fetchSiMethods(ctx.className).then(function (methods) {
                    var method = methods.find(function (m) {
                        return m.name === ctx.methodName;
                    });
                    if (!method || !method.params || !method.params.length) {
                        return { suggestions: [] };
                    }

                    var currentParam = method.params[ctx.paramIndex];
                    if (!currentParam) {
                        return { suggestions: [] };
                    }

                    if (_TABLE_PARAM_RE.test(currentParam)) {
                        return fetchTablesMatching(ctx.typed).then(function (tables) {
                            return {
                                incomplete: true,
                                suggestions: tables.map(function (t) {
                                    return {
                                        label: t.name,
                                        kind: monaco.languages.CompletionItemKind.Value,
                                        detail: t.label !== t.name ? t.label : '',
                                        insertText: t.name,
                                        range: ctx.range,
                                    };
                                }),
                            };
                        });
                    }

                    if (_FIELD_PARAM_RE.test(currentParam)) {
                        /* Find the sibling table param and the value the caller passed for it. */
                        var tableParamIdx = -1;
                        for (var i = 0; i < method.params.length; i++) {
                            if (_TABLE_PARAM_RE.test(method.params[i])) {
                                tableParamIdx = i;
                                break;
                            }
                        }
                        if (tableParamIdx === -1) {
                            return { suggestions: [] };
                        }
                        var tableValue = ctx.prevArgs[tableParamIdx];
                        if (!tableValue) {
                            return { suggestions: [] };
                        }

                        return fetchTableFields(tableValue).then(function (fields) {
                            if (!fields) {
                                return { suggestions: [] };
                            }
                            return {
                                suggestions: fields.map(function (f) {
                                    return {
                                        label: f.name,
                                        kind: monaco.languages.CompletionItemKind.Field,
                                        detail: f.label !== f.name ? f.label : '',
                                        documentation: f.type + (f.reference ? ' → ' + f.reference : ''),
                                        insertText: f.name,
                                        range: ctx.range,
                                    };
                                }),
                            };
                        });
                    }

                    return { suggestions: [] };
                });
            },
        };

        monaco.languages.registerCompletionItemProvider('javascript', provider);
        monaco.languages.registerCompletionItemProvider('typescript', provider);
    }

    /**
     * Initialises Monaco helpers for ServiceNow Script Includes.
     * Safe to call multiple times; only the first call performs setup.
     *
     * @param {Object} [config] - Optional runtime overrides.
     * @param {number} [config.pollIntervalMs] - Poll interval while waiting for Monaco.
     * @param {number} [config.maxWaitMs] - Max wait before aborting Monaco polling.
     * @param {string} [config.definitionUrl] - UI script URL that exposes MONACO_LANGUAGE_SERVER_DTS.
     * @param {string} [config.clientDefinitionUrl] - UI script URL that exposes MONACO_LANGUAGE_CLIENT_DTS.
     * @param {string} [config.codeActionsUrl] - UI script URL that exposes MONACO_CODE_ACTIONS.
     * @param {string} [config.htmlMonarchUrl] - UI script URL that exposes MONACO_LANGUAGE_HTML.
     * @param {boolean} [config.enableClientEnhancements] - Preload client DTS during init.
     * @param {boolean} [config.enableCodeActions] - Preload Monaco code actions during init.
     * @param {Function} [config.getRemBase] - Returns SCSS px->rem conversion base.
     * @param {string}  [config.language] - Editor language: 'javascript' (default), 'html', 'css', 'scss'.
     * @param {boolean} [config.isClient] - When language is 'javascript', load client-side DTS instead of server.
     * @param {string}  [config.appSysId] - Application scope sys_id passed to loadSnTypeDefinitions.
     * @param {string}  [config.htmlClassPortalSysId] - Portal sys_id for class-completion bundles.
     * @param {string}  [config.htmlClassPortalUrlSuffix] - Portal url_suffix for class-completion bundles.
     * @param {string}  [config.htmlClassThemeSysId] - Theme sys_id for class-completion bundles.
     * @param {Array}   [config.htmlClassDependencySysIds] - sp_dependency sys_ids whose CSS includes should also be indexed.
     * @param {boolean} [config.htmlClassIncludeStandardCss] - Also index the standard Service Portal base CSS bundle.
     * @param {string}  [config.fieldName] - Form field name the Monaco editor is bound to (informational).
     */
    function init(config) {
        config = config || {};

        if (typeof config.getRemBase === 'function') {
            _codeActionsGetRemBase = config.getRemBase;
        }

        var _lang = config.language || 'javascript';
        var _isClient = !!config.isClient;
        var _langKey = _lang + (_isClient ? ':client' : ':server');

        if (!_initialized) {
            _initialized = true;

            if (config.pollIntervalMs) {
                _pollIntervalMs = Number(config.pollIntervalMs) || 200;
            }
            if (config.maxWaitMs) {
                _maxWaitMs = Number(config.maxWaitMs) || 10000;
            }
            if (config.definitionUrl) {
                _definitionUrl = config.definitionUrl;
            }
            if (config.clientDefinitionUrl) {
                _clientDefinitionUrl = config.clientDefinitionUrl;
            }
            if (config.codeActionsUrl) {
                _codeActionsUrl = config.codeActionsUrl;
            }
            if (config.htmlMonarchUrl) {
                _htmlMonarchUrl = config.htmlMonarchUrl;
            }
            if (config.cssLanguageUrl) {
                _cssLanguageUrl = config.cssLanguageUrl;
            }

            if (!global.document) {
                _initialized = false;
                return;
            }

            _api.loadSnTypeDefinitions = loadSnTypeDefinitions;
            _api.loadServerMonarchDts = loadServerMonarchDts;
            _api.loadClientMonarchDts = loadClientMonarchDts;
            _api.loadHtmlMonarchDts = loadHtmlMonarchDts;
            _api.loadCodeActions = loadCodeActions;
            _api.scanAndFetchSIs = _scanAndFetchSIs;
            _api.scanAndFetchProviders = _scanAndFetchProviders;
            _api.scanLocalTypedefs = _registerLocalTypedefs;
            _api.notifyScriptContextFocus = notifyScriptContextFocus;
            _api.getSiSysId = function (name) {
                return _siNameMap[name] || null;
            };
            _api.checkSiExists = _checkSiExists;
            _api.loadCssVariables = _loadCssVariables;
            _api.loadScssVariables = _loadScssVariables;
            _api.loadHtmlClassIndex = _loadHtmlClassIndex;
            _api.loadCssLanguageDts = loadCssLanguageDts;
            _api.loadCssEditorSupport = function () {
                loadCssLanguageDts();
                _loadCssVariables();
            };
            _api._waitForMonaco = waitForMonaco;
            _api.markAngularModel = function (modelId) {
                loadCodeActions({ modelId: modelId, isAngular: true });
            };
        } // end of if (!_initialized)

        // ---- Per-language init ----
        if (_initializedLangs[_langKey]) {
            return;
        }
        _initializedLangs[_langKey] = true;

        var _capturedLang = _lang;
        var _capturedIsClient = _isClient;
        var _capturedAppSysId = config.appSysId;
        var _capturedHtmlClassPortalSysId = config.htmlClassPortalSysId;
        var _capturedHtmlClassPortalUrlSuffix = config.htmlClassPortalUrlSuffix;
        var _capturedHtmlClassThemeSysId = config.htmlClassThemeSysId;
        var _capturedHtmlClassDependencySysIds = config.htmlClassDependencySysIds;
        var _capturedHtmlClassIncludeStandardCss = config.htmlClassIncludeStandardCss;

        _api._waitForMonaco(function () {
            var _isJs = _capturedLang === 'javascript' || _capturedLang === 'typescript';

            // One-time global setup — providers, compiler options.
            // Always runs from the first init() call's closure where these functions are accessible.
            // _globalSetupDone prevents re-execution on subsequent language inits.
            if (!_globalSetupDone) {
                _globalSetupDone = true;
                monaco.editor.addEditorAction({
                    id: 'we.search-code',
                    label: 'Search in Code Search+',
                    contextMenuGroupId: 'navigation',
                    contextMenuOrder: 3,
                    precondition: 'editorHasSelection',
                    run: function (editor) {
                        var model = editor.getModel();
                        var selection = editor.getSelection();
                        if (!model || !selection || selection.isEmpty()) return;
                        var query = model.getValueInRange(selection).trim();
                        if (!query) return;
                        global.open(
                            '/ui_page.do?sys_id=27a85cdf06a14eba97d2ffc3b57c4a46&q=' + encodeURIComponent(query),
                            '_blank',
                            'noopener'
                        );
                    },
                });
                if (global.SNMonacoPlusBootstrap && global.SNMonacoPlusBootstrap.registerUnicodeHover) {
                    global.SNMonacoPlusBootstrap.registerUnicodeHover(monaco);
                }
                applyCompilerOptions();
                _installUnusedVarSeverityPatch();
                _registerCssVarCompletions();
                _registerScssVarCompletions();
                _registerScssVarHover();
                if (_isJs) {
                    _installQuickInfoHover();
                    registerDotCompletions();
                    registerHoverProvider();
                    registerSignatureHelp();
                    registerNewSiCompletions();
                    registerGrFieldStringCompletions();
                    registerGrFieldStringHover();
                    registerGrConstructorCompletions();
                    registerSiParamStringCompletions();
                    if (monaco.editor && monaco.editor.getModels) {
                        monaco.editor.getModels().forEach(_prewarmFieldCompletions);
                        monaco.editor.getModels().forEach(function (m) {
                            _scanAndFetchSIs(m.getValue());
                            _registerLocalTypedefs(m.id, m.getValue());
                        });
                    }
                }
            }

            // Language-specific DTS loading.
            if (_isJs) {
                if (_capturedIsClient) {
                    // Client mode: AngularJS / g_form / spUtil etc. on javascriptDefaults.
                    _api.loadClientMonarchDts();
                } else {
                    // Server mode: SN server APIs on the target language service.
                    // Skip loadSnTypeDefinitions when GlideEditorMonaco is present —
                    // ServiceNow's native editor already loads the SN completions DTS.
                    if (typeof global.GlideEditorMonaco === 'undefined') {
                        _api.loadSnTypeDefinitions(_capturedAppSysId, _capturedLang);
                    }
                    _api.loadServerMonarchDts(_capturedLang);
                }
            }

            // Code actions
            if (_isJs || _capturedLang === 'css' || _capturedLang === 'scss') {
                _api.loadCodeActions({ getRemBase: _codeActionsGetRemBase });
            }

            // CSS language definition + vars
            if (_capturedLang === 'css' || _capturedLang === 'scss') {
                _api.loadCssLanguageDts();
                _api.loadCssVariables();
            }

            // SCSS vars: pre-warm fetch for SCSS/Less editors.
            if (_capturedLang === 'scss' || _capturedLang === 'less') {
                _api.loadScssVariables();
            }

            // HTML Monarch: AngularJS ng-* / sp-* tokenizer for HTML editors.
            if (_capturedLang === 'html') {
                _api.loadHtmlMonarchDts();
                _api.loadHtmlClassIndex({
                    portalSysId: _capturedHtmlClassPortalSysId,
                    portalUrlSuffix: _capturedHtmlClassPortalUrlSuffix,
                    themeSysId: _capturedHtmlClassThemeSysId,
                    dependencySysIds: _capturedHtmlClassDependencySysIds,
                    includeStandardCss: _capturedHtmlClassIncludeStandardCss,
                });
            }

            // ════ Success: Monaco Editor+ is ready ════
            var _langDisplay = _capturedLang.toUpperCase();
            if (_capturedLang === 'javascript') {
                _langDisplay = _capturedIsClient ? 'JAVASCRIPT (Client)' : 'JAVASCRIPT (Server)';
            }
            console.info(
                '%cMonaco Editor+%c ready ✓%c\n' + 'Language: ' + _langDisplay,
                'background-color: #004a9f; color: #fff; font-weight: bold; padding: 5px 0 5px 5px;',
                'background-color: #004a9f; color: #86ffa6; font-weight: bold; padding: 5px 5px 5px 0;',
                'padding: 5px;'
            );
        }, _capturedLang);
    }

    global.SNMonacoPlus = _api;
})(typeof window !== 'undefined' ? window : globalThis);

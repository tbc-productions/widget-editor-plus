/**
 * ============================================================================
 * UI Script: monaco_code_actions
 * ============================================================================
 * Purpose: Built-in Monaco code actions (lightbulb quick-fixes) for
 * JavaScript/TypeScript and SCSS. Also establishes the
 * window.MONACO_CUSTOM_CODE_ACTIONS extension registry that
 * monaco_custom_code_actions.jsdbx hooks into for user-added actions.
 *
 * Contains:
 *   - AngularJS/ServiceNow DI token → TypeScript type map (ANGULAR_TYPES)
 *   - "Add JSDoc comment" code action for JS/TS (with AngularJS DI-aware
 *     parameter typing on editors marked via markAngular())
 *   - "Convert Npx → Nrem" code action for SCSS
 *   - window.MONACO_CUSTOM_CODE_ACTIONS registry + register(language,
 *     provider, options) — the hook monaco_custom_code_actions.jsdbx uses
 *   - window.MONACO_CODE_ACTIONS.register(monaco, config) — entry point
 * ============================================================================
 */
(function () {
    'use strict';

    // AngularJS/SN DI token → TypeScript type name; monaco_language_client's DI map takes precedence when loaded (see _diTypes()).
    var ANGULAR_TYPES = {
        $scope: 'angular.IScope',
        $rootScope: 'angular.IRootScopeService',
        $http: 'angular.IHttpService',
        $q: 'angular.IQService',
        $timeout: 'angular.ITimeoutService',
        $interval: 'angular.IIntervalService',
        $location: 'angular.ILocationService',
        $filter: 'angular.IFilterService',
        $log: 'angular.ILogService',
        $window: 'Window',
        $document: 'JQLite',
        $element: 'JQLite',
        $attrs: 'angular.IAttributes',
        $sce: 'angular.ISCEService',
        $animate: 'angular.IAnimateService',
        $anchorScroll: 'angular.IAnchorScrollService',
        $cacheFactory: 'angular.ICacheFactoryService',
        $compile: 'angular.ICompileService',
        $controller: 'angular.IControllerService',
        $interpolate: 'angular.IInterpolateService',
        $parse: 'angular.IParseService',
        $templateCache: 'angular.ITemplateCacheService',
        $exceptionHandler: 'angular.IExceptionHandlerService',
        $uibModal: 'SpModal',
        spUtil: 'SpUtil',
        spModal: 'SpModal',
        snRecordWatcher: 'SnRecordWatcher',
        cabrillo: 'Cabrillo',
        i18n: 'I18n',
        spAriaUtil: 'SpAriaUtil',
        spNavServiceClient: 'SpNavServiceClient',
    };

    /** DI token → type map, preferring the one shipped with the client DTS. */
    function _diTypes() {
        return (window.MONACO_LANGUAGE_CLIENT_DI && window.MONACO_LANGUAGE_CLIENT_DI.types) || ANGULAR_TYPES;
    }

    // Matches @param with no type, an empty {}, or a placeholder {*}/{any}; never a real type annotation.
    var RE_UNTYPED_PARAM = /@param\s+(?:\{\s*(?:\*|any)?\s*\}\s+)?([\w$]+)/;
    var RE_NG_TYPE_PARAM = /@param\s+\{\s*ng\.([\w$.]+)\s*\}(\s+\$\w+)/;

    /**
     * Scan model lines [startLine, endLine] for untyped @param $name entries whose name
     * is in ANGULAR_TYPES.  Returns an array of edit descriptors.
     */
    function _collectParamEdits(model, startLine, endLine) {
        var edits = [];
        for (var i = startLine; i <= endLine; i++) {
            var line = model.getLineContent(i);
            var m = RE_UNTYPED_PARAM.exec(line);
            if (!m) {
                continue;
            }
            var name = m[1];
            var type = _diTypes()[name];
            if (!type) {
                continue;
            }
            var col = line.indexOf(m[0]) + 1; // 1-based column
            var textEdit = {
                range: {
                    startLineNumber: i,
                    startColumn: col,
                    endLineNumber: i,
                    endColumn: col + m[0].length,
                },
                text: '@param {' + type + '} ' + name,
            };
            edits.push({ name: name, type: type, textEdit: textEdit });
        }
        return edits;
    }

    // Finds @param {ng.*} JSDoc entries and rewrites them to @param {angular.*}.
    function _collectNgAliasEdits(model, startLine, endLine) {
        var edits = [];
        for (var i = startLine; i <= endLine; i++) {
            var line = model.getLineContent(i);
            var m = RE_NG_TYPE_PARAM.exec(line);
            if (!m) {
                continue;
            }
            var full = m[0];
            var converted = '@param {angular.' + m[1] + '}' + m[2];
            var col = line.indexOf(full) + 1;
            edits.push({
                textEdit: {
                    range: {
                        startLineNumber: i,
                        startColumn: col,
                        endLineNumber: i,
                        endColumn: col + full.length,
                    },
                    text: converted,
                },
            });
        }
        return edits;
    }

    // Each entry: { re, nameGroup (1-based or null for anonymous), paramsGroup (1-based) }; group 1 is leading whitespace.
    var FUNC_PATTERNS = [
        // Named function declaration: function foo(...)  /  async function foo(...)
        {
            re: /^(\s*)(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
            nameGroup: 2,
            paramsGroup: 3,
        },
        // Anonymous function: function(...)  — covers controller DI callbacks
        {
            re: /^(\s*)(?:async\s+)?function\s*\(([^)]*)\)/,
            nameGroup: null,
            paramsGroup: 2,
        },
        // var/let/const name = function(...)  /  async function(...)
        {
            re: /^(\s*)(?:var|let|const)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)/,
            nameGroup: 2,
            paramsGroup: 3,
        },
        // x.name = function(...)  — $scope.foo, this.bar, vm.baz, prototype methods …
        {
            re: /^(\s*)(?:[\w$]+(?:\.[\w$]+)*)\.(\w+)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)/,
            nameGroup: 2,
            paramsGroup: 3,
        },
        // name: function(...)  — object literal property
        {
            re: /^(\s*)(\w+)\s*:\s*(?:async\s+)?function\s*\(([^)]*)\)/,
            nameGroup: 2,
            paramsGroup: 3,
        },
        // var/let/const name = (...) =>  /  async (...) =>
        {
            re: /^(\s*)(?:var|let|const)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/,
            nameGroup: 2,
            paramsGroup: 3,
        },
        // x.name = (...) =>
        {
            re: /^(\s*)(?:[\w$]+(?:\.[\w$]+)*)\.(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/,
            nameGroup: 2,
            paramsGroup: 3,
        },
    ];

    // model.id → true  for editors where Angular type hints should be applied.
    var _angularModels = {};
    var _registered = false;
    var _customCodeActionsUrl = 'monaco_custom_code_actions.jsdbx?sysparm_substitute=false';
    var _customCodeActionsReady = false;
    var _customCodeActionsLoading = false;
    var _customCodeActionsPending = [];
    var _customCodeActionEntries = [];
    var _customCodeActionIdSet = {};

    function _logCustomError(title, err) {
        console.error('[MONACO_CODE_ACTIONS] ' + title, err && err.message ? err.message : err);
    }

    function _flushCustomPending() {
        _customCodeActionsPending.splice(0).forEach(function (fn) {
            if (typeof fn === 'function') {
                fn();
            }
        });
    }

    function _wrapCustomProvider(provider) {
        var wrapped = {
            provideCodeActions: function (model, range, context, token) {
                try {
                    return provider.provideCodeActions(model, range, context, token);
                } catch (err) {
                    _logCustomError('Custom provideCodeActions failed', err);
                    return { actions: [], dispose: function () {} };
                }
            },
        };

        if (typeof provider.resolveCodeAction === 'function') {
            wrapped.resolveCodeAction = function (codeAction, token) {
                try {
                    return provider.resolveCodeAction(codeAction, token);
                } catch (err) {
                    _logCustomError('Custom resolveCodeAction failed', err);
                    return null;
                }
            };
        }

        return wrapped;
    }

    function _ensureCustomRegistry() {
        if (window.MONACO_CUSTOM_CODE_ACTIONS && typeof window.MONACO_CUSTOM_CODE_ACTIONS.register === 'function') {
            return;
        }

        window.MONACO_CUSTOM_CODE_ACTIONS = {
            register: function (language, provider, options) {
                if (typeof language !== 'string' || !language) {
                    _logCustomError('Custom register(language, provider) requires a non-empty language', language);
                    return;
                }
                if (!provider || typeof provider.provideCodeActions !== 'function') {
                    _logCustomError('Custom register(...) requires provider.provideCodeActions', provider);
                    return;
                }

                var id =
                    options && typeof options.id === 'string'
                        ? options.id
                        : typeof options === 'string'
                          ? options
                          : null;

                if (id && _customCodeActionIdSet[id]) {
                    return;
                }

                _customCodeActionEntries.push({
                    id: id,
                    language: language,
                    provider: provider,
                    applied: false,
                });
                if (id) {
                    _customCodeActionIdSet[id] = true;
                }
            },
        };
    }

    function _applyCustomProviders(monaco) {
        _customCodeActionEntries.forEach(function (entry) {
            if (entry.applied) {
                return;
            }
            try {
                monaco.languages.registerCodeActionProvider(entry.language, _wrapCustomProvider(entry.provider));
                entry.applied = true;
            } catch (err) {
                _logCustomError('Failed to register custom provider for ' + entry.language, err);
            }
        });
    }

    function _ensureCustomLoaded(monaco) {
        _ensureCustomRegistry();

        if (_customCodeActionsReady) {
            _applyCustomProviders(monaco);
            return;
        }

        _customCodeActionsPending.push(function () {
            _applyCustomProviders(monaco);
        });

        if (_customCodeActionsLoading) {
            return;
        }
        _customCodeActionsLoading = true;

        function _onLoaded() {
            _customCodeActionsLoading = false;
            _customCodeActionsReady = true;
            _flushCustomPending();
        }

        function _onError(err) {
            _customCodeActionsLoading = false;
            _logCustomError('Failed loading monaco_custom_code_actions from ' + _customCodeActionsUrl, err || '');
            _flushCustomPending();
        }

        if (typeof ScriptLoader !== 'undefined' && ScriptLoader.getScripts) {
            ScriptLoader.getScripts(_customCodeActionsUrl, _onLoaded);
        } else {
            var script = document.createElement('script');
            script.src = _customCodeActionsUrl;
            script.async = true;
            script.onload = _onLoaded;
            script.onerror = _onError;
            (document.head || document.documentElement || document.body).appendChild(script);
        }
    }

    // -------------------------------------------------------------------------
    // JSDoc helpers
    // -------------------------------------------------------------------------

    /**
     * Scan the model at lineNumber and up to 3 lines above for a recognisable
     * function declaration.  Returns { name, params, insertLine, indent } or null.
     */
    function _findFunctionNearLine(model, lineNumber) {
        for (var delta = 0; delta <= 3; delta++) {
            var ln = lineNumber - delta;
            if (ln < 1) {
                break;
            }
            var lineText = model.getLineContent(ln);
            for (var i = 0; i < FUNC_PATTERNS.length; i++) {
                var m = FUNC_PATTERNS[i].re.exec(lineText);
                if (m) {
                    return {
                        name: FUNC_PATTERNS[i].nameGroup ? m[FUNC_PATTERNS[i].nameGroup] : null,
                        params: m[FUNC_PATTERNS[i].paramsGroup] || '',
                        insertLine: ln,
                        indent: m[1] || '',
                    };
                }
            }
        }
        return null;
    }

    /** Returns true when the line immediately above lineNumber ends a block comment. */
    function _hasJsDocAbove(model, lineNumber) {
        if (lineNumber <= 1) {
            return false;
        }
        var prev = model.getLineContent(lineNumber - 1).trim();
        return prev === '*/' || (prev.length > 1 && prev.slice(-2) === '*/');
    }

    /**
     * Build a JSDoc block string (no trailing newline).
     * @param {string|null} name       — function name, null for anonymous
     * @param {string}      paramsStr  — raw params string from regex capture
     * @param {boolean}     isAngular  — whether to map $-prefixed params to ng interfaces
     * @param {string}      indent     — leading whitespace of the function line
     */
    function _buildJsDoc(name, paramsStr, isAngular, indent) {
        var params = paramsStr
            .split(',')
            .map(function (p) {
                // Strip default values: (a = 0, b = 'x') → ['a', 'b']
                return p
                    .trim()
                    .replace(/\s*=\s*[\s\S]*$/, '')
                    .trim();
            })
            .filter(Boolean);

        var lines = [indent + '/**'];
        lines.push(indent + ' * ' + (name || 'TODO: Description'));

        if (params.length > 0) {
            lines.push(indent + ' *');
            var types = isAngular ? _diTypes() : {};
            params.forEach(function (p) {
                var type = types[p] || null;
                if (type) {
                    lines.push(indent + ' * @param {' + type + '} ' + p);
                } else {
                    lines.push(indent + ' * @param {*} ' + p);
                }
            });
        }

        lines.push(indent + ' * @returns {*}');
        lines.push(indent + ' */');
        return lines.join('\n');
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Register all code action providers.  Idempotent — safe to call multiple times.
     * @param {object} monaco
     * @param {object} [config]
     * @param {function():number} [config.getRemBase]  Returns the current rem base (default 16).
     */
    function register(monaco, config) {
        if (_registered) {
            return;
        }
        _registered = true;

        var getRemBase =
            config && typeof config.getRemBase === 'function'
                ? config.getRemBase
                : function () {
                      return 16;
                  };

        if (config && typeof config.customCodeActionsUrl === 'string') {
            _customCodeActionsUrl = config.customCodeActionsUrl;
        }

        // Registered for 'javascript' (client editors) and 'typescript' (server script editor).
        var _jsDocProvider = {
            provideCodeActions: function (model, range) {
                var lineNumber = range.startLineNumber;
                var isAngular = !!_angularModels[model.id];
                var actions = [];

                // ---- "Add JSDoc comment" ----------------------------------------
                var fn = _findFunctionNearLine(model, lineNumber);
                if (fn && !_hasJsDocAbove(model, fn.insertLine)) {
                    var jsDoc = _buildJsDoc(fn.name, fn.params, isAngular, fn.indent);
                    var ln = fn.insertLine;
                    // Supply both 'textEdit' (Monaco ≥0.34) and 'edit' (Monaco <0.34).
                    var textEdit = {
                        range: {
                            startLineNumber: ln,
                            startColumn: 1,
                            endLineNumber: ln,
                            endColumn: 1,
                        },
                        text: jsDoc + '\n',
                    };
                    actions.push({
                        title: 'Add JSDoc comment',
                        kind: 'refactor',
                        isPreferred: false,
                        edit: {
                            edits: [
                                {
                                    resource: model.uri,
                                    versionId: model.getVersionId(),
                                    textEdit: textEdit,
                                    edit: textEdit,
                                },
                            ],
                        },
                    });
                }

                // ---- "Annotate AngularJS @param type" (Angular editors only) ------
                if (isAngular) {
                    // Per-line quick fix for the current cursor line.
                    var lineEdits = _collectParamEdits(model, lineNumber, lineNumber);
                    lineEdits.forEach(function (e) {
                        actions.push({
                            title: "Annotate '" + e.name + "' as {" + e.type + '}',
                            kind: 'quickfix',
                            edit: {
                                edits: [
                                    {
                                        resource: model.uri,
                                        versionId: model.getVersionId(),
                                        textEdit: e.textEdit,
                                        edit: e.textEdit,
                                    },
                                ],
                            },
                        });
                    });

                    // "Fix all" source action — annotates every untyped @param in the file.
                    var allEdits = _collectParamEdits(model, 1, model.getLineCount());
                    if (allEdits.length > 0) {
                        actions.push({
                            title: 'Annotate all AngularJS @param types in file',
                            kind: 'source.fixAll',
                            edit: {
                                edits: allEdits.map(function (e) {
                                    return {
                                        resource: model.uri,
                                        versionId: model.getVersionId(),
                                        textEdit: e.textEdit,
                                        edit: e.textEdit,
                                    };
                                }),
                            },
                        });
                    }

                    // Converts legacy ng.* JSDoc types to angular.* to match our DTS namespace.
                    var lineNgAliasEdits = _collectNgAliasEdits(model, lineNumber, lineNumber);
                    lineNgAliasEdits.forEach(function (e) {
                        actions.push({
                            title: 'Convert ng.* JSDoc type to angular.*',
                            kind: 'quickfix',
                            edit: {
                                edits: [
                                    {
                                        resource: model.uri,
                                        versionId: model.getVersionId(),
                                        textEdit: e.textEdit,
                                        edit: e.textEdit,
                                    },
                                ],
                            },
                        });
                    });

                    var allNgAliasEdits = _collectNgAliasEdits(model, 1, model.getLineCount());
                    if (allNgAliasEdits.length > 0) {
                        actions.push({
                            title: 'Convert all ng.* JSDoc types in file',
                            kind: 'source.fixAll',
                            edit: {
                                edits: allNgAliasEdits.map(function (e) {
                                    return {
                                        resource: model.uri,
                                        versionId: model.getVersionId(),
                                        textEdit: e.textEdit,
                                        edit: e.textEdit,
                                    };
                                }),
                            },
                        });
                    }
                }

                return { actions: actions, dispose: function () {} };
            },
        };
        monaco.languages.registerCodeActionProvider('javascript', _jsDocProvider);
        monaco.languages.registerCodeActionProvider('typescript', _jsDocProvider);

        // ---------------------------------------------------------------------
        // SCSS — Convert px → rem
        // ---------------------------------------------------------------------
        monaco.editor.registerCommand('we.css.applyPxToRem', function (accessor, model, edits) {
            model.applyEdits(edits);
        });

        monaco.languages.registerCodeActionProvider('scss', {
            provideCodeActions: function (model, range) {
                var remBase = Math.max(1, getRemBase());
                var line = model.getLineContent(range.startLineNumber);
                var pxRegex = /(\d*\.?\d+)px/g;
                var match;
                var actions = [];

                while ((match = pxRegex.exec(line)) !== null) {
                    var pxVal = parseFloat(match[1]);
                    var remVal = parseFloat((pxVal / remBase).toFixed(4)) + '';
                    var title = 'Convert ' + match[0] + ' \u2192 ' + remVal + 'rem';
                    actions.push({
                        title: title,
                        command: {
                            id: 'we.css.applyPxToRem',
                            title: title,
                            arguments: [
                                model,
                                [
                                    {
                                        range: new monaco.Range(
                                            range.startLineNumber,
                                            match.index + 1,
                                            range.startLineNumber,
                                            match.index + match[0].length + 1
                                        ),
                                        text: remVal + 'rem',
                                    },
                                ],
                            ],
                        },
                    });
                }

                return { actions: actions, dispose: function () {} };
            },
            resolveCodeAction: function () {
                return null;
            },
        });

        _ensureCustomLoaded(monaco);
    }

    function markAngular(modelId) {
        _angularModels[modelId] = true;
    }

    window.MONACO_CODE_ACTIONS = {
        register: register,
        markAngular: markAngular,
    };
})();

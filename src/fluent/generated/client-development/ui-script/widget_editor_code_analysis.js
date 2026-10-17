// Shared dependency extraction; source text is parsed, never executed.
(function (root) {
    'use strict';
    var builtins = {
        Array: true,
        Object: true,
        Date: true,
        RegExp: true,
        Error: true,
        TypeError: true,
        RangeError: true,
        Map: true,
        Set: true,
        WeakMap: true,
        WeakSet: true,
        Promise: true,
        XMLHttpRequest: true,
        FormData: true,
        Blob: true,
        File: true,
        URL: true,
        URLSearchParams: true,
        Function: true,
        Number: true,
        String: true,
        Boolean: true,
        JSON: true,
        Math: true,
        Symbol: true,
        Reflect: true,
        Intl: true,
        Class: true,
        Packages: true,
        GlideRecord: true,
        GlideRecordSecure: true,
        GlideAggregate: true,
        GlideDateTime: true,
        GlideDate: true,
        GlideDuration: true,
        GlideForm: true,
        GlideUser: true,
        GlideSession: true,
        GlideAjax: true,
        GlideModal: true,
        GlideDialogWindow: true,
        GlideList2: true,
        GlideQuery: true,
        GlideTime: true,
        GlideElement: true,
        GlideSystem: true,
        GlideStringUtil: true,
        GlideFilter: true,
        GlideSchedule: true,
        GlideTableHierarchy: true,
        GlideEncrypter: true,
        GlideSecureRandomUtil: true,
        GlideSysAttachment: true,
        GlideScopedEvaluator: true,
        GlideHTTPRequest: true,
        GlideURL: true,
        GlideNavigation: true,
        GlideEmailOutbound: true,
        GlideExcelParser: true,
        GlideXMLUtil: true,
        XMLDocument2: true,
        GlideImportSetTransformer: true,
        GlideSPScriptable: true,
        GlideElementDescriptor: true,
        RESTMessageV2: true,
        SOAPMessageV2: true,
        FlowAPI: true,
        Workflow: true,
        NotifyClient: true,
    };
    var patterns = [
        // new Foo( / new global.Foo(
        /\bnew\s+(?:([a-zA-Z_][a-zA-Z0-9_]*)\.)?([A-Z][a-zA-Z0-9_]*)\s*\(/g,
        // Object.extendsObject(Foo, / Object.extendsObject(global.Foo,
        /\bextendsObject\s*\(\s*(?:([a-zA-Z_][a-zA-Z0-9_]*)\.)?([A-Z][a-zA-Z0-9_]*)\s*,/g,
        // Static usage: Foo.bar( / global.Foo.bar( — not preceded by another member access
        /(?:^|[^\w$.])(?:(global|sn_[a-z0-9_]+|x_[a-z0-9_]+)\.)?([A-Z][a-zA-Z0-9_]*)\.[a-zA-Z_$][\w$]*\s*\(/gm,
        // new GlideAjax('Foo') / gs.include('Foo') — the name is a string argument
        /\b(?:GlideAjax\s*\(|gs\.include\s*\()\s*['"](?:([a-zA-Z_][a-zA-Z0-9_]*)\.)?([A-Za-z_][a-zA-Z0-9_]*)['"]/g,
    ];
    var resources = [
        {
            re: /\bgs\.(?:getProperty|setProperty)\s*\(\s*['"]([a-zA-Z0-9_.\-]+)['"]/g,
            table: 'sys_properties',
            field: 'name',
            category: 'System Property (referenced)',
        },
        {
            re: /\bgs\.eventQueue(?:Scheduled)?\s*\(\s*['"]([a-zA-Z0-9_.\-]+)['"]/g,
            table: 'sysevent_register',
            field: 'event_name',
            category: 'Event (referenced)',
        },
        {
            re: /\bnew\s+(?:sn_ws\.)?RESTMessageV2\s*\(\s*['"]([^'"]+)['"]/g,
            table: 'sys_rest_message',
            field: 'name',
            category: 'REST Message (referenced)',
        },
        {
            re: /\bnew\s+(?:sn_ws\.)?SOAPMessageV2\s*\(\s*['"]([^'"]+)['"]/g,
            table: 'sys_soap_message',
            field: 'name',
            category: 'SOAP Message (referenced)',
        },
        {
            re: /\bFlowAPI\s*\.\s*(?:start|execute)(?:Flow|Subflow)\w*\s*\(\s*['"](?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)['"]/g,
            table: 'sys_hub_flow',
            field: 'internal_name',
            category: 'Flow (referenced)',
        },
        {
            re: /\bstartFlow\s*\(\s*['"]([0-9a-f]{32})['"]/g,
            table: 'wf_workflow',
            field: 'sys_id',
            category: 'Workflow (referenced)',
        },
    ];
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

    function captures(text, re) {
        var values = [],
            seen = Object.create(null),
            match;
        re.lastIndex = 0;
        while ((match = re.exec(text)) !== null) {
            var value = (match[1] || '').trim();
            if (value && !seen[value]) {
                seen[value] = true;
                values.push(value);
            }
        }
        return values;
    }

    function analyse(input) {
        var content = input.content || '',
            seen = Object.create(null),
            names = [];
        patterns.forEach(function (re) {
            re.lastIndex = 0;
            var match;
            while ((match = re.exec(content)) !== null) {
                var scope = match[1] || '',
                    name = match[2],
                    key = scope + '.' + name;
                if (!builtins[name] && !seen[key]) {
                    seen[key] = true;
                    names.push({ name: name, scope: scope });
                }
            }
        });
        var clientScript = input.clientScript || '';
        var injected = /\bfunction\b[^(]*\(([^)]*)\)/.exec(clientScript);
        return {
            scriptIncludes: names,
            tables: captures(
                content,
                /\bnew\s+(?:global\.)?(?:GlideRecord|GlideRecordSecure|GlideAggregate|GlideQuery)\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/g
            ),
            resources: resources.map(function (scan) {
                return captures(content, scan.re);
            }),
            providers: injected
                ? injected[1]
                      .split(',')
                      .map(function (name) {
                          return name.trim();
                      })
                      .filter(function (name) {
                          return /^[a-zA-Z_$][\w$]*$/.test(name) && name.charAt(0) !== '$';
                      })
                : [],
            controllerParams: _parseControllerParams(clientScript),
        };
    }

    if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
        root.onmessage = function (event) {
            try {
                root.postMessage({ id: event.data.id, result: analyse(event.data.input) });
            } catch (error) {
                root.postMessage({ id: event.data.id, error: String(error) });
            }
        };
        return;
    }
    if (root.WECodeAnalysis) return;
    var worker = null,
        sequence = 0,
        pending = new Map(),
        cache = new Map(),
        cachedChars = 0;
    var url = '/widget_editor_code_analysis.jsdbx?sysparm_substitute=false&v=1';

    function stop(error) {
        if (worker) worker.terminate();
        worker = null;
        pending.forEach(function (job) {
            clearTimeout(job.timer);
            job.reject(error);
        });
        pending.clear();
        cache.clear();
        cachedChars = 0;
    }

    root.WECodeAnalysis = {
        analyse: function (input) {
            var key = JSON.stringify([input.content || '', input.clientScript || '']);
            if (cache.has(key)) return cache.get(key);
            var promise = new Promise(function (resolve, reject) {
                try {
                    if (!worker) {
                        worker = new Worker(url);
                        var instance = worker;
                        worker.onmessage = function (event) {
                            var job = pending.get(event.data.id);
                            if (!job) return;
                            pending.delete(event.data.id);
                            clearTimeout(job.timer);
                            if (event.data.error) job.reject(new Error(event.data.error));
                            else job.resolve(event.data.result);
                        };
                        worker.onerror = function () {
                            if (worker === instance) stop(new Error('Background analysis unavailable'));
                        };
                        worker.onmessageerror = worker.onerror;
                    }
                    var id = ++sequence;
                    pending.set(id, {
                        resolve: resolve,
                        reject: reject,
                        timer: setTimeout(function () {
                            stop(new Error('Background analysis timed out'));
                        }, 30000),
                    });
                    worker.postMessage({ id: id, input: input });
                } catch (error) {
                    stop(error);
                    reject(error);
                }
            });
            // Bound source retained in memory; failed jobs remain retryable.
            if (key.length <= 2 * 1024 * 1024) {
                while (cache.size >= 32 || cachedChars + key.length > 2 * 1024 * 1024) {
                    var oldest = cache.keys().next().value;
                    cachedChars -= oldest.length;
                    cache.delete(oldest);
                }
                cache.set(key, promise);
                cachedChars += key.length;
                promise.catch(function () {
                    if (cache.get(key) === promise) {
                        cache.delete(key);
                        cachedChars -= key.length;
                    }
                });
            }
            return promise;
        },
        dispose: function () {
            stop(new Error('Background analysis closed'));
        },
    };
    root.addEventListener('pagehide', function () {
        root.WECodeAnalysis.dispose();
    });
})(typeof self !== 'undefined' ? self : this);

/**
 * UI Script: we_history_sync
 * Reconciles the Next Experience History row for the current UI page.
 */
(function () {
    'use strict';
    if (window.WE_HISTORY_SYNC) {
        return;
    }

    var HISTORY_API = '/api/now/ui/history';
    var TABLE_API = '/api/now/table/sys_ui_navigator_history';
    var SHELL_WRITE_DELAY = 750;
    var DEFAULT_DELAY = 4000;

    var _state = null;
    var _timer = null;
    var _inflight = false;
    var _dirty = false;

    function _headers(json) {
        var h = {
            Accept: 'application/json',
            'X-UserToken': window.g_ck || '',
        };
        if (json) {
            h['Content-Type'] = 'application/json';
        }
        return h;
    }

    function _pageUrl() {
        return location.pathname.substring(1) + location.search;
    }

    function _userId() {
        try {
            return (
                (window.NOW && window.NOW.user && window.NOW.user.userID) ||
                (window.top.NOW && window.top.NOW.user && window.top.NOW.user.userID) ||
                ''
            );
        } catch (e) {
            return '';
        }
    }

    // Pushes the corrected item into the shell's in-memory History menu (replaces by id).
    function _refreshDropdown(sysId, fallback) {
        var userId = _userId();
        if (!userId || typeof BroadcastChannel !== 'function') {
            return;
        }
        fetch(HISTORY_API, { headers: _headers() })
            .then(function (r) {
                return r.json();
            })
            .then(function (json) {
                var list = (json.result && json.result.list) || [];
                var item = null;
                for (var i = 0; i < list.length; i++) {
                    if (list[i].id === sysId) {
                        item = list[i];
                        break;
                    }
                }
                return item || fallback;
            })
            .catch(function () {
                return fallback;
            })
            .then(function (item) {
                if (!item) {
                    return;
                }
                var channel = new BroadcastChannel('historySync');
                channel.postMessage({
                    payload: item,
                    type: 'POLARIS_HISTORY_ITEMS',
                    user_sys_id: userId,
                });
                channel.close();
            });
    }

    function _reconcile() {
        var s = _state;
        if (!s || _inflight) {
            return;
        }
        _inflight = true;
        _dirty = false;
        fetch(
            TABLE_API +
                '?sysparm_query=' +
                encodeURIComponent(s.match + '^ORDERBYDESCsys_created_on') +
                '&sysparm_fields=sys_id,title,description,url&sysparm_limit=1',
            { headers: _headers() }
        )
            .then(function (r) {
                return r.json();
            })
            .then(function (json) {
                var rec = json.result && json.result[0];
                if (!rec) {
                    return;
                }
                var body = { description: s.description, title: s.title };
                if (s.url) {
                    body.url = s.url === true ? _pageUrl() : s.url;
                }
                var same =
                    rec.title === body.title &&
                    rec.description === body.description &&
                    (!body.url || rec.url === body.url);
                if (same) {
                    return;
                }
                return fetch(TABLE_API + '/' + rec.sys_id, {
                    body: JSON.stringify(body),
                    headers: _headers(true),
                    method: 'PATCH',
                })
                    .then(function (r) {
                        return r.json();
                    })
                    .then(function (patched) {
                        var row = (patched && patched.result) || rec;
                        var now = Date.now();
                        _refreshDropdown(rec.sys_id, {
                            description: body.description,
                            id: rec.sys_id,
                            prettyTitle: body.title,
                            timestamp: now,
                            timestampOffset: now,
                            title: body.title,
                            url: body.url || row.url,
                        });
                    });
            })
            .catch(function () {})
            .then(function () {
                _inflight = false;
                if (_dirty) {
                    _schedule(SHELL_WRITE_DELAY);
                }
            });
    }

    function _schedule(delay) {
        if (_timer) {
            clearTimeout(_timer);
        }
        if (_inflight) {
            _dirty = true;
        }
        _timer = setTimeout(function () {
            _timer = null;
            _reconcile();
        }, delay);
    }

    // The shell writes its own row once the iframe finishes loading; re-run after every write it makes.
    function _observeShell() {
        try {
            if (window.top === window || !window.top.PerformanceObserver) {
                return;
            }
            var observer = new window.top.PerformanceObserver(function (entries) {
                var list = entries.getEntries();
                for (var i = 0; i < list.length; i++) {
                    if (list[i].name.indexOf(HISTORY_API) !== -1) {
                        _schedule(SHELL_WRITE_DELAY);
                        return;
                    }
                }
            });
            observer.observe({ type: 'resource' });
        } catch (e) {}
    }
    _observeShell();

    window.WE_HISTORY_SYNC = {
        /**
         * Sets the desired History entry and reconciles it once the shell has written its row.
         * @param {{ title: string, description?: string, match?: string, url?: string|boolean, delay?: number }} opts
         *   match: encoded-query fragment identifying the row (defaults to exact current url).
         *   url: also rewrites the row url so reopening the entry restores this state; true = url at sync time.
         */
        set: function (opts) {
            _state = {
                description: opts.description || '',
                match: opts.match || 'url=' + _pageUrl(),
                title: opts.title,
                url: opts.url || '',
            };
            _schedule(typeof opts.delay === 'number' ? opts.delay : DEFAULT_DELAY);
        },
    };
})();

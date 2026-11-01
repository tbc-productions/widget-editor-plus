---
name: servicenow-es-compatibility
description: Decides which JavaScript syntax is safe in ServiceNow server and client scripts by release, scope and ES12 mode. Use before writing any ServiceNow script.
---

# ServiceNow ECMAScript compatibility

## Widget server scripts

Write Service Portal widget server scripts (`sp_widget.script`) in ES5 style, on every release and regardless of ES12 mode. Use `var`, `function`, string concatenation and `for` loops. Do not use `const`/`let`, arrow functions, template literals, optional chaining or nullish coalescing.

The one exception is parameter destructuring, which works whenever ES12 is enabled for the widget. Use a `params` object only when it is not.

## Parameter destructuring

Destructured parameters (`function ({ userId, limit = 10 } = {})`) work in any server script with ES12 enabled, on any release. They need no further release check.

## Other server-side scripts

| Release | Default | Guidance |
|---|---|---|
| Australia and later | Modern JavaScript | Use ES6+ freely: `const`/`let`, arrow functions, template literals, destructuring, default and rest parameters, spread, classes, `for...of`, `Map`/`Set`, optional chaining and nullish coalescing. |
| Zurich and earlier, ES12 enabled | ES2021 (ES12) | ES6+ syntax is fine. Confirm ES12 is enabled for the script or application before relying on it. |
| Zurich and earlier, ES12 not enabled | ES5 | Use `var`, `function`, string concatenation and `for` loops. Ask whether ES12 can be enabled if modern syntax would help. |

How to tell whether ES12 is enabled:

- In a Widget Editor+ AI Assistant export, read `es12_override_at_export` on the record wrapper. `true` or `false` is the per-script override. `not_found` or `unavailable` means no override was found, so the application default applies and the mode is unknown.
- Otherwise, ask the user or check the script's ECMAScript mode on the record or application.

Regardless of release:

- Avoid `async`/`await`, top-level Promises and ES modules in server scripts. Server code runs synchronously.
- Do not use Node.js or browser APIs in server scripts. There is no DOM: no `window`, `document`, `DOMParser`, `XMLSerializer`, `fetch`, `setTimeout`, `localStorage`, `require` or `fs`. Use platform equivalents such as `XMLDocument2`, `sn_ws.RESTMessageV2` and `GlideDateTime`.
- Always define Script Includes with `Class.create()`, never `class` syntax.
- Do not use shorthand method syntax in server scripts. Write `getTasks: function ({ userId } = {}) {`, not `getTasks({ userId } = {}) {`.
- Convert Java strings with `String(...)` or `getValue()` before comparing with `===`. `gr.field` is a `GlideElement`, not a string.

## Client-side scripts

- Service Portal client controllers, UI scripts and browser-only code run in the user's browser and can use modern JavaScript supported by the instance's browsers.
- Classic client scripts and UI policies also run in the browser. Modern syntax works, but keep them consistent with surrounding scripts.
- Do not use `async`/`await` with `GlideAjax` callbacks unless you wrap them in a Promise. `getXMLWait()` is unavailable in Service Portal.

## Quick conversion for ES5 targets

| ES6+ | ES5 |
|---|---|
| `const x = 1;` | `var x = 1;` |
| `` `Hi ${name}` `` | `'Hi ' + name` |
| `(a) => a * 2` | `function (a) { return a * 2; }` |
| `for (const x of list)` | `for (var i = 0; i < list.length; i++)` |
| `{ ...a, b: 1 }` | Copy properties in a loop |
| `a?.b ?? 'x'` | `(a && a.b != null) ? a.b : 'x'` |

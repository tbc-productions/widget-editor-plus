---
name: servicenow-es-compatibility
description: Decides which JavaScript syntax is safe in ServiceNow server and client scripts by release, script type and ES12 mode. Use before writing any ServiceNow script.
---

# ServiceNow ECMAScript compatibility

## Server-side scripts

| Script | Syntax |
|---|---|
| Widget server script (`sp_widget.script`), any release | ES5 style: `var`, `function`, string concatenation, `for` loops. No `const`/`let`, arrow functions, template literals, optional chaining or nullish coalescing. |
| Any other server script with ES12 enabled (the default from Australia) | ES6+: `const`/`let`, arrow functions, template literals, destructuring, default and rest parameters, spread, `for...of`, `Map`/`Set`, optional chaining, nullish coalescing. |
| Any other server script without ES12 (Zurich and earlier) | ES5. Ask whether ES12 can be enabled if modern syntax would help. |

Destructured parameters (`function ({ userId, limit = 10 } = {})`) work in any server script with ES12 enabled, including widget server scripts. Without ES12, take a `params` object and read its properties.

To tell whether ES12 is enabled, read `es12_override_at_export` in an AI Assistant export: `true` or `false` is the per-script override, while `not_found` or `unavailable` means the application default applies. Otherwise, ask.

On every release, server scripts:

- Have no DOM or browser APIs: no `window`, `document`, `DOMParser`, `XMLSerializer`, `fetch`, `setTimeout`, `localStorage`, `require` or `fs`. Use `XMLDocument2`, `sn_ws.RESTMessageV2` and `GlideDateTime` instead.
- Run synchronously. Avoid `async`/`await`, Promises and ES modules.
- Return Java objects from some APIs. Convert with `String(...)` or `getValue()` before comparing with `===`; `gr.field` is a `GlideElement`, not a string.

## Client-side scripts

Client scripts, UI policies, UI scripts and Service Portal client controllers run in the browser and can use modern JavaScript. Keep classic client scripts consistent with the surrounding scripts.

## ES5 conversions

| ES6+ | ES5 |
|---|---|
| `const x = 1;` | `var x = 1;` |
| `` `Hi ${name}` `` | `'Hi ' + name` |
| `(a) => a * 2` | `function (a) { return a * 2; }` |
| `for (const x of list)` | `for (var i = 0; i < list.length; i++)` |
| `{ ...a, b: 1 }` | Copy properties in a loop |
| `a?.b ?? 'x'` | `(a && a.b != null) ? a.b : 'x'` |

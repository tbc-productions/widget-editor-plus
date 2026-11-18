---
name: servicenow-es-compatibility
description: Decides which JavaScript syntax is safe in each ServiceNow script type, including widget server scripts, other server scripts, ES12 mode, client scripts and UI pages. Use before writing any ServiceNow script.
---

# ServiceNow ECMAScript compatibility

Assume the instance runs the Australia release or later. Do not ask which release it runs.

## Server-side scripts

| Script | Syntax |
|---|---|
| Widget server script (`sp_widget.script`) | ES5 only, always. Never ES12, even when ES12 is enabled: no `const`/`let`, arrow functions, template literals, destructuring, default parameters, spread, `for...of`, optional chaining or nullish coalescing. |
| Any other server script | ES12: `const`/`let`, arrow functions, template literals, destructuring, default and rest parameters, spread, `for...of`, `Map`/`Set`, optional chaining, nullish coalescing. |
| Any other server script with `es12_override_at_export="false"` in an AI Assistant export | ES5. |

In an export, `es12_override_at_export="true"` or a value of `not_found` or `unavailable` means ES12 applies.

### Zurich

Add one short line after the code when you know something in it does not work on Zurich, such as ES12 syntax that Zurich only runs with ES12 mode enabled. Mention a release only when you know about the incompatibility. When you are unsure, say nothing about releases.

### Every server script

- Has no DOM or browser APIs: no `window`, `document`, `DOMParser`, `XMLSerializer`, `fetch`, `setTimeout`, `localStorage`, `require` or `fs`. Use `XMLDocument2`, `sn_ws.RESTMessageV2` and `GlideDateTime` instead.
- Runs synchronously. Do not use `async`/`await`, Promises or ES modules.
- Gets Java objects from some APIs. Convert with `String(...)` or `getValue()` before comparing with `===`; `gr.field` is a `GlideElement`, not a string.

## Client-side scripts

Client scripts, UI policies, UI scripts, UI action client code, Angular providers and Service Portal client controllers run in the browser and can use modern JavaScript.

UI pages are processed by Jelly first:

- Never use `${…}` placeholders in a UI page's `html` or `client_script`, including inside template literals. Jelly evaluates them before the browser sees the code. Concatenate strings instead.
- Use descendant selectors in a UI page's `<style>` blocks, not `>` child selectors. Jelly can turn `>` into `&gt;`.

## ES5 conversions

| ES12 | ES5 |
|---|---|
| `const x = 1;` | `var x = 1;` |
| `` `Hi ${name}` `` | `'Hi ' + name` |
| `(a) => a * 2` | `function (a) { return a * 2; }` |
| `for (const x of list)` | `for (var i = 0; i < list.length; i++)` |
| `function ({ userId })` | `function (params)`, then `var userId = params.userId;` |
| `function (limit = 10)` | `limit = limit || 10;` |
| `{ ...a, b: 1 }` | Copy properties in a loop |
| `a?.b ?? 'x'` | `(a && a.b != null) ? a.b : 'x'` |

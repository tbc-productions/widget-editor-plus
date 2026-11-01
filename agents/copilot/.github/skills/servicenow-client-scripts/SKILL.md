---
name: servicenow-client-scripts
description: Patterns for classic ServiceNow client scripts, UI policies, g_form and client-side GlideAjax. Use when writing or editing sys_script_client, catalog client scripts or UI policy scripts.
---

# ServiceNow client scripts

## Choose the lightest option

1. UI policy without a script for mandatory, visible and read-only fields.
2. Display business rule writing to `g_scratchpad` for values needed on load.
3. Client script, calling GlideAjax only when the value depends on user input.

## Script types

| Type | Signature | Notes |
|---|---|---|
| onLoad | `function onLoad()` | Keep it light; it delays the form. |
| onChange | `function onChange(control, oldValue, newValue, isLoading, isTemplate)` | Start with `if (isLoading \|\| newValue === '') return;` unless the script must also run on load or when cleared. |
| onSubmit | `function onSubmit()` | Return `false` to stop the save. Do not call GlideAjax here; the form submits before it answers. |

## g_form

- `g_form.getValue()` returns a string. On the client, a checkbox returns `'true'` or `'false'`, unlike server-side `getValue()`.
- Set reference fields with a display value to avoid an extra lookup: `g_form.setValue('assigned_to', userId, userName)`.
- Use `g_form.getUniqueValue()` for the current record's sys_id and `g_user.userID` for the current user.
- Use `g_form.addInfoMessage()`, `addErrorMessage()` and `showFieldMsg()` for feedback, not `alert()`.
- Avoid `g_form.getReference()`. Use GlideAjax to fetch only the fields you need.
- Do not touch the DOM, `document` or jQuery. Such scripts break in Service Portal and on upgrade.

## GlideAjax

Always call asynchronously with `getXMLAnswer()`. Never use `getXMLWait()`; it blocks the browser and is unavailable in Service Portal.

```javascript
/**
 * Shows how many open child tasks the parent has.
 * @param {HTMLElement} control Field element.
 * @param {string} oldValue `task.parent` before the change.
 * @param {string} newValue `task.parent`
 * @param {boolean} isLoading True while the form loads.
 */
function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading || newValue === '') return;

    /* Ask the server for the open child count */
    const ga = new GlideAjax('TaskUtils');
    ga.addParam('sysparm_name', 'getOpenChildCount');
    ga.addParam('sysparm_parent', newValue);
    ga.getXMLAnswer((answer) => {
        g_form.showFieldMsg('parent', `${answer} open child tasks`, 'info');
    });
}
```

The matching Script Include is in the `servicenow-server-scripting` skill.

## Service Portal

Client scripts with UI Type set to All also run in Service Portal, where only the documented `g_form` API is available. Do not rely on `g_form.getControl()` or other DOM access there.

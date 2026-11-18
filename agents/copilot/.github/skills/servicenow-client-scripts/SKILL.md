---
name: servicenow-client-scripts
description: Patterns for classic ServiceNow client scripts, UI policies, g_form, client-side GlideAjax, UI action client code, UI scripts and UI pages. Use when writing or editing sys_script_client, catalog client scripts, UI policy scripts, client-side sys_ui_action, sys_ui_script or sys_ui_page records.
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
| onChange | `function onChange(control, oldValue, newValue, isLoading, isTemplate)` | Start by returning early when `isLoading` is true or `newValue` is empty, unless the script must also run on load or when cleared. |
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
 * @param {HTMLElement} control - Field element.
 * @param {string} oldValue - `task.parent` before the change.
 * @param {string} newValue - `task.parent`
 * @param {boolean} isLoading - True while the form loads.
 */
function onChange(control, oldValue, newValue, isLoading) {
    if (isLoading || newValue === '') {
        return;
    }

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

## UI actions with client and server code

Tick **Client**, set **Onclick** to the client function, and give the action an **Action name**. The client function validates, then resubmits the form with `gsftSubmit()`, which runs the same script again on the server.

```javascript
/**
 * Checks the close notes, then runs the server side of the action.
 * @returns {boolean|undefined} False when the close notes are empty.
 */
function closeTask() {
    if (!g_form.getValue('close_notes')) {
        g_form.showFieldMsg('close_notes', 'Enter close notes.', 'error');
        return false;
    }
    gsftSubmit(null, g_form.getFormElement(), 'close_task');
}

/* Run the server side after the form is resubmitted */
if (typeof window === 'undefined') {
    closeTaskOnServer();
}

/**
 * Closes the task and returns to it.
 */
function closeTaskOnServer() {
    current.setValue('state', 3);
    current.update();
    action.setRedirectURL(current);
}
```

- The third argument to `gsftSubmit()` must match the **Action name**.
- The whole script runs in the browser and on the server, so code outside the two functions must work in both.
- This pattern applies to the classic form. Workspaces use the action's workspace client script instead.

## UI scripts

- UI scripts (`sys_ui_script`) hold shared browser code. Leave **Global** off unless every classic page needs the script; global scripts load everywhere.
- In Service Portal, load a UI script through the theme's or widget's JS includes, not a `<script>` tag.
- Wrap the script so it does not add global variables, apart from one deliberate namespace object.

## UI pages

UI pages (`sys_ui_page`) have three script fields:

| Field | Runs | Contents |
|---|---|---|
| `html` | Server, then browser | Jelly XML that renders the page. |
| `client_script` | Browser | JavaScript for the page. |
| `processing_script` | Server, on form submit | See the `servicenow-server-scripting` skill. |

- Put JavaScript in `client_script`, not in `<script>` tags inside `html`. The `html` field is XML, so `&&` and `<` in inline scripts break it.
- Never use `${…}` placeholders in `html` or `client_script`, including inside template literals; Jelly evaluates them first. Concatenate strings instead.
- Use descendant selectors in `<style>` blocks, not `>` child selectors, which Jelly can turn into `&gt;`.
- Values from the URL or the user reach the page through Jelly. Escape them, and never write them into HTML or scripts unescaped.

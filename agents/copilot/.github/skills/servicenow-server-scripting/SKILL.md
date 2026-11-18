---
name: servicenow-server-scripting
description: Lean, secure patterns for ServiceNow server-side scripts, including GlideRecord, GlideAggregate, Script Includes, GlideAjax, business rules, Scripted REST APIs, outbound REST, UI actions, scheduled jobs, fix scripts, email scripts, UI page processing scripts, ACL scripts, scoped applications and system properties. Use when writing or reviewing server-side ServiceNow code.
---

# ServiceNow server scripting

Examples use ES12. Widget server scripts are always ES5; follow the `servicenow-es-compatibility` skill.

## GlideRecord

- Use `GlideRecordSecure` by default so ACLs apply. Use `GlideRecord` only when the script must bypass ACLs, such as system-level work in a scheduled job, with a short comment on the line above saying why. When editing, keep a `GlideRecord` that already has a justifying comment; switch an unexplained one to `GlideRecordSecure`, or ask if bypassing ACLs looks intentional.
- `GlideRecordSecure` already enforces ACLs. Do not add `canRead()`, `canWrite()` or `canDelete()` checks to it; use those only with `GlideRecord`.
- Read with `gr.getValue('field')` (a string, or `null` when empty) and `gr.getDisplayValue('field')`. Write with `gr.setValue('field', value)`.
- `getValue()` on a boolean field returns `'1'` or `'0'`, never `true`, `false`, `'true'` or `'false'`. Compare with `gr.getValue('active') === '1'`; `if (gr.getValue('active'))` is always truthy.
- Check the result of `gr.get(sysId)` before using the record.
- Use `setLimit()` when only some rows are needed, and `addActiveQuery()` for active records.
- Use `GlideAggregate` for counts and sums, never a loop with a counter.
- To check whether at least one record exists, use `setLimit(1)`, `query()` and `hasNext()`. Do not count rows or use `getRowCount()`.
- Dot-walk (`gr.caller_id.department.getDisplayValue()`) instead of a second query.
- Call `addExtraField()` before `query()` for every dot-walked field you read, so the values load with the query instead of one lookup per record. Use it wherever you dot-walk, especially in loops.
- Filter by related records in the same query instead of looping a second query:
  - `addJoinQuery(table, primaryField, joinField)` keeps records that have at least one matching related record. Add conditions to the returned join with `addCondition()`. Joined fields cannot be read.
  - `RLQUERY` in an encoded query filters on a count of related records, including none: `RLQUERY<table>.<reference field>,<operator><count>^<conditions>^ENDRLQUERY`.
- Use `chooseWindow(first, last)` to page through large result sets instead of reading every row.
- Use `updateMultiple()` or `deleteMultiple()` for bulk changes when per-record business rules are not needed.

```javascript
/* Get active incidents with their caller's department */
const gr = new GlideRecordSecure('incident');
gr.addActiveQuery();
gr.addExtraField('caller_id.department.name');
gr.query();
while (gr.next()) {
    gs.info(`${gr.getValue('number')}: ${gr.caller_id.department.name}`);
}

/* Check if the user has an active incident */
const incident = new GlideRecordSecure('incident');
incident.addActiveQuery();
incident.addQuery('caller_id', gs.getUserID());
incident.setLimit(1);
incident.query();
const hasIncident = incident.hasNext();

/* Get users who are callers on an active incident */
const callers = new GlideRecordSecure('sys_user');
const join = callers.addJoinQuery('incident', 'sys_id', 'caller_id');
join.addCondition('active', true);
callers.query();

/* Get active users with no open incidents */
const idle = new GlideRecordSecure('sys_user');
idle.addEncodedQuery('active=true^RLQUERYincident.caller_id,=0^active=true^ENDRLQUERY');
idle.query();

/* Count active incidents */
const count = new GlideAggregate('incident');
count.addActiveQuery();
count.addAggregate('COUNT');
count.query();
const total = count.next() ? Number(count.getAggregate('COUNT')) : 0;
```

## Security

- Never build an encoded query from client input: widget `input`, GlideAjax parameters, REST parameters or form values. A user can add `^OR` or `^NQ` conditions and read records they should not. Pass each value to `addQuery(field, value)` instead. Encoded queries built only from fixed strings, properties or values from the database are fine.
- Limit client input that chooses a table, field or action to a fixed list of allowed values.
- `setWorkflow(false)` skips business rules, notifications and auditing. `autoSysFields(false)` stops `sys_updated_on`, `sys_updated_by` and `sys_mod_count` from updating. Use either only with a short comment saying why, and never in code users trigger directly.
- Check roles with `gs.hasRole('role_name')`. It also returns true for admins.
- Never log passwords, tokens, request bodies with credentials or personal data.

## Anti-patterns

| Wrong | Right |
|---|---|
| `gr.addEncodedQuery('number=' + input.number)` | `gr.addQuery('number', input.number)` |
| `if (gr.getValue('active'))` | `if (gr.getValue('active') === '1')` |
| `if (gr.assigned_to == userId)` | `if (gr.getValue('assigned_to') === userId)` |
| `gr.query(); if (gr.getRowCount() > 0)` | `gr.setLimit(1); gr.query(); if (gr.hasNext())` |
| A `GlideRecord` query inside a `while (gr.next())` loop | Dot-walk with `addExtraField()`, `addJoinQuery()` or one query with `IN` |
| `current.update()` in a before business rule | Set fields on `current`; the save writes them |
| `gs.sleep()` to wait for another process | An async business rule, event or flow |
| `new GlideRecord('x').get(id)` with no comment | `new GlideRecordSecure('x')`, or a comment on the line above saying why ACLs are bypassed |
| `gs.getProperty('x')` compared with `true` | `gs.getProperty('x', 'false') === 'true'` |

## Script Includes

- Define with `Class.create()` and a prototype object, never `class` syntax. Write methods as `name: function () {}`, never shorthand `name() {}`.
- Keep related logic in one Script Include. Prefix private methods with `_`.
- Public functions check required parameters and, where it matters, expected values. Return early with an empty or neutral result rather than throwing.
- Client-callable Script Includes extend `AbstractAjaxProcessor`, read input with `this.getParameter('sysparm_…')` and return a string or JSON string, never a GlideRecord. Use `GlideRecordSecure` where a parameter decides which data is read or changed.

```javascript
var TaskUtils = Class.create();
TaskUtils.prototype = Object.extendsObject(AbstractAjaxProcessor, {
    /**
     * Returns the open child task count for a parent task.
     * Reads `sysparm_parent` (`task.parent`) from the request.
     * @returns {string} Number of open child tasks.
     */
    getOpenChildCount: function () {
        const parentId = this.getParameter('sysparm_parent');
        if (!parentId) {
            return '0';
        }
        const ga = new GlideAggregate('task');
        ga.addQuery('parent', parentId);
        ga.addActiveQuery();
        ga.addAggregate('COUNT');
        ga.query();
        return ga.next() ? ga.getAggregate('COUNT') : '0';
    },

    type: 'TaskUtils',
});
```

## Business rules

- Before rules: change `current` directly. Never call `current.update()`.
- After rules: update other records, not `current`.
- Async rules: slow work the user does not need to wait for, including outbound REST calls.
- Display rules: put values the form needs on load in `g_scratchpad` instead of making client scripts call GlideAjax.
- Use conditions on the rule record instead of `if` statements in the script where possible.

## Scripted REST APIs

Resource scripts (`sys_ws_operation`) receive `request` and `response`.

- Keep **Requires authentication** and **Requires ACL authorization** on, and use `GlideRecordSecure`.
- Read path parameters from `request.pathParams`, query parameters from `request.queryParams` (each value is an array of strings) and the body from `request.body.data`. Treat them all as untrusted.
- Return errors with `sn_ws_err` classes, such as `NotFoundError` and `BadRequestError`, rather than a 200 response containing an error.
- Return only the fields the caller needs, not whole records.

```javascript
/**
 * Returns an incident's state by number.
 * @param {RESTAPIRequest} request Reads the `number` path parameter.
 * @param {RESTAPIResponse} response
 */
(function process(request, response) {
    const number = request.pathParams.number;

    /* Find the incident */
    const incident = new GlideRecordSecure('incident');
    if (!incident.get('number', number)) {
        response.setError(new sn_ws_err.NotFoundError(`Incident ${number} not found`));
        return;
    }

    response.setBody({ number, state: incident.getDisplayValue('state') });
})(request, response);
```

## Outbound REST

- Use a REST Message record with an authentication profile, `new sn_ws.RESTMessageV2('Message name', 'method name')`, so endpoints and credentials stay out of scripts. Never hard-code credentials, tokens or instance URLs.
- Call from an async business rule, scheduled job or flow, never from code the user waits on. `executeAsync()` returns at once but `waitForResponse()` blocks again.
- Check `getStatusCode()` and log failures with `gs.error()`, without the request body if it contains personal data.

```javascript
/* Send the incident to the monitoring system */
const message = new sn_ws.RESTMessageV2('Monitoring', 'Create event');
message.setRequestBody(JSON.stringify({ number: current.getValue('number'), priority: current.getValue('priority') }));
const result = message.execute();
if (result.getStatusCode() !== 201) {
    gs.error(`Monitoring rejected ${current.getValue('number')}: ${result.getStatusCode()}`);
}
```

## UI actions

- Use the **Condition** field to decide when the action shows, such as `current.canWrite() && current.getValue('state') !== '3'`, not script checks after the click.
- A server-only action changes `current`, calls `current.update()` and sets the next page with `action.setRedirectURL(current)`. Calling `current.update()` here is correct; the action is not a before rule.
- For an action that runs client code and then server code, see the `servicenow-client-scripts` skill.

## Scheduled jobs and fix scripts

- Scheduled jobs (`sysauto_script`) run as the job's **Run as** user, often system. Fix scripts (`sys_script_fix`) run as the administrator who runs them. In neither case is `gs.getUserID()` the end user affected by the change.
- `GlideRecord` is acceptable for system-level work here, still with a comment saying why.
- Make fix scripts safe to run twice: query only records that still need the change.
- Process large tables in batches with `setLimit()`, and log one summary line with the count changed, not one line per record.
- Use `setWorkflow(false)` in a fix script only when business rules and notifications must not run, with a comment saying why.

## Email scripts

Email scripts (`sys_script_email`) run inside a notification, called with `${mail_script:script_name}`.

```javascript
/**
 * Prints the incident's caller and their manager.
 * @param {GlideRecord} current `incident` record
 * @param {TemplatePrinter} template Email body printer.
 * @param {GlideEmailOutbound} email Outbound email.
 * @param {GlideRecord} email_action `sysevent_email_action` record
 * @param {GlideRecord} event `sysevent` record
 */
(function runMailScript(current, template, email, email_action, event) {
    template.print(`Caller: ${current.caller_id.getDisplayValue()}<br>`);
    template.print(`Manager: ${current.caller_id.manager.getDisplayValue()}`);
})(current, template, email, email_action, event);
```

- Print with `template.print()`. Do not return HTML.
- Values users can enter end up in the email's HTML. Escape them with `GlideStringUtil.escapeHTML()` in the global scope before printing.
- Change recipients and the subject with `email.addAddress()` and `email.setSubject()`, not by rebuilding the notification.

## UI page processing scripts

The `processing_script` of a UI page (`sys_ui_page`) runs on the server when the page's form is submitted. Read submitted values as global variables named after the form inputs, treat them as untrusted, and use `GlideRecordSecure`.

## ACL scripts

- Set `answer` to `true` or `false`. Keep the script fast: it runs for every record and field it protects, so avoid queries and use roles or conditions on the ACL where possible.
- Never return true for everyone as a shortcut.

## Scoped applications

- `gs.log()` is unavailable. Use `gs.info()`, `gs.warn()`, `gs.error()` or `gs.debug()`.
- Call a Script Include from another scope by its full name, such as `new x_acme_app.TaskUtils()`. It must be accessible from all application scopes.

## Properties and logging

- Use `gs.getProperty('name', 'default')` for values the user wants configurable. Properties are strings, so compare with `'true'` or parse numbers.
- Use `gs.info()` for temporary diagnostics and remove it when done.

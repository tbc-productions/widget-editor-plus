---
name: servicenow-server-scripting
description: Lean patterns for ServiceNow server-side scripts, including GlideRecord, GlideAggregate, Script Includes, GlideAjax, business rules, scoped applications and system properties. Use when writing or reviewing server-side ServiceNow code.
---

# ServiceNow server scripting

Examples use ES6+. Follow the `servicenow-es-compatibility` skill for widget server scripts and scripts without ES12.

## GlideRecord

- Use `GlideRecordSecure` by default so ACLs apply. Use `GlideRecord` only when the script must bypass ACLs, such as system-level work in a scheduled job, with a short comment on the line above saying why. When editing, keep a `GlideRecord` that already has a justifying comment; switch an unexplained one to `GlideRecordSecure`, or ask if bypassing ACLs looks intentional.
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

## Script Includes

- Define with `Class.create()` and a prototype object, never `class` syntax. Write methods as `name: function () {}`, never shorthand `name() {}`.
- Keep related logic in one Script Include. Prefix private methods with `_`.
- Public functions check required parameters and, where it matters, expected values. Return early with an empty or neutral result rather than throwing.
- Client-callable Script Includes extend `AbstractAjaxProcessor`, read input with `this.getParameter('sysparm_…')` and return a string or JSON string, never a GlideRecord. Use `GlideRecordSecure` or `canRead()`/`canWrite()` where a parameter decides which data is read or changed.

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
- Async rules: slow work the user does not need to wait for.
- Display rules: put values the form needs on load in `g_scratchpad` instead of making client scripts call GlideAjax.
- Use conditions on the rule record instead of `if` statements in the script where possible.

## Scoped applications

- `gs.log()` is unavailable. Use `gs.info()`, `gs.warn()`, `gs.error()` or `gs.debug()`.
- Call a Script Include from another scope by its full name, such as `new x_acme_app.TaskUtils()`. It must be accessible from all application scopes.

## Properties and logging

- Use `gs.getProperty('name', 'default')` for values the user wants configurable.
- Use `gs.info()` for temporary diagnostics and remove it when done.

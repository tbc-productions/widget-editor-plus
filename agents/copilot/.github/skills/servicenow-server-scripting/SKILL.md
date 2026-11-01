---
name: servicenow-server-scripting
description: Lean patterns for ServiceNow server-side scripts, including GlideRecord, GlideAggregate, Script Includes, GlideAjax, business rules and system properties. Use when writing or reviewing server-side ServiceNow code.
---

# ServiceNow server scripting

Examples use ES6+. Follow the `servicenow-es-compatibility` skill for older targets and widget server scripts, which are ES5 style apart from destructured parameters. Server scripts have no DOM or browser APIs.

## GlideRecord

- Read values with `gr.getValue('field')` (string or `null`) and display values with `gr.getDisplayValue('field')`.
- `getValue()` on a boolean field always returns the string `'1'` (true) or `'0'` (false), never `true`, `false`, `'true'` or `'false'`. Compare with `gr.getValue('active') === '1'`. `if (gr.getValue('active'))` is always truthy because `'0'` is a non-empty string.
- Set values with `gr.setValue('field', value)`.
- Never pass `null`, `undefined` or an empty string to `addQuery()` or `get()`. Return early when a required value is missing.
- Use `gr.get(sysId)` for a single record and check its return value before using the record.
- Use `setLimit()` when only some rows are needed, and `addActiveQuery()` for active records.
- Use `GlideAggregate` for counts and sums, never a loop with a counter.
- Use `updateMultiple()` or `deleteMultiple()` for bulk changes when business rules are not needed per record.
- Use `GlideRecordSecure` by default so ACLs apply. Use `GlideRecord` only when the script must bypass ACLs, such as system-level work in scheduled jobs or business rules, and add a short comment on the line above explaining why.
- When editing existing code, leave a `GlideRecord` that already has a justifying comment. Switch an unexplained one to `GlideRecordSecure`, or ask if bypassing ACLs looks intentional.
- Dot-walk (`gr.caller_id.department.getDisplayValue()`) instead of a second query.

```javascript
const count = new GlideAggregate('incident');
count.addActiveQuery();
count.addAggregate('COUNT');
count.query();
const total = count.next() ? Number(count.getAggregate('COUNT')) : 0;
```

## Script Includes

- Always define Script Includes with `Class.create()` and a prototype object, never `class` syntax.
- Write methods as `name: function () {}`, never shorthand `name() {}`.
- Keep related logic in one Script Include. Prefix private methods with `_`.
- Functions take a single destructured object, such as `getTasks: function ({ userId, limit = 10 } = {})`, so parameters can be added later. See the `servicenow-jsdoc` skill.
- Public functions check that required parameters are present and, where it matters, one of the expected values. Return early with an empty or neutral result rather than throwing. A truthy sys_id is enough; do not check its pattern.
- Client-callable Script Includes extend `AbstractAjaxProcessor` and read input with `this.getParameter('sysparm_…')`. Treat every parameter as untrusted, and use `GlideRecordSecure` or `canRead()`/`canWrite()` where it decides which data is read or changed.
- Return strings or JSON from GlideAjax methods. Do not return GlideRecords.

```javascript
var TaskUtils = Class.create();
TaskUtils.prototype = Object.extendsObject(AbstractAjaxProcessor, {
    /**
     * Returns the open child task count for a parent task.
     * Reads `sysparm_parent` from the request.
     * @returns {string} Number of open child tasks.
     */
    getOpenChildCount: function () {
        const parentId = this.getParameter('sysparm_parent');
        if (!parentId) return '0';
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
- Async rules: heavy or slow work that the user does not need to wait for.
- Use conditions on the rule record instead of `if` statements in the script where possible.

## Properties and messages

- Use `gs.getProperty('name', 'default')` for values the user wants configurable.
- Use `gs.getMessage('key')` for user-facing text that must be translated.
- Use `gs.info()` for temporary diagnostics and remove it when done.

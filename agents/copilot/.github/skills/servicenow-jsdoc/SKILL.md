---
name: servicenow-jsdoc
description: JSDoc and parameter conventions for ServiceNow scripts, including Script Includes, business rules, client scripts, GlideAjax and Service Portal widgets. Use whenever writing or editing a ServiceNow function.
---

# ServiceNow JSDoc

Every function gets a JSDoc block. Keep it short: a description, then `@param` and `@returns`. No editorialising, examples or change history.

## Rules

- First line: one sentence in the present tense saying what the function does, ending with a full stop.
- `@param {Type} name Description` for every parameter. Mark optional parameters as `[name]` and defaults as `[name=default]`.
- `@returns {Type} Description.` when the function returns a value. Omit it for `void`. When the function returns early for missing input, say what it returns.
- Use `@throws` only when the function deliberately throws.
- Use `@private` for Script Include methods prefixed with `_`.
- Do not describe validation the function does not perform.
- Use Australian English.

## Parameter descriptions

| Parameter | Description |
|---|---|
| sys_id or field value | The table and field it comes from, in backticks: `` `task.assigned_to` ``. For a record's own sys_id, use `` `sys_user.sys_id` ``. |
| GlideRecord or GlideRecordSecure | The table, in backticks, followed by "record": `` `task` record ``. |
| Anything else | A short plain-English description. |

## Destructured parameters

Functions take a single destructured object so parameters can be added later without changing callers. This applies especially to Script Include functions.

- Destructure in the signature and default the object to `{}`: `getTasks: function ({ userId, limit = 10 } = {})`.
- Document the object as `params` and each property as `params.name`.
- Keep positional parameters only where the platform calls the function with fixed arguments, such as business rules (`current`, `previous`), client scripts and GlideAjax methods.
- Parameter destructuring works in any script with ES12 enabled, on any release, including widget server scripts. Only scripts without ES12 take a `params` object and read its properties instead.

## Types

| Value | JSDoc type |
|---|---|
| Record | `{GlideRecordSecure}`, or `{GlideRecord}` for platform-supplied records such as `current` |
| Date/time | `{GlideDateTime}` |
| sys_id | `{string}` |
| Value from `getValue()` | `{string}` (it may be `null` for an empty field) |
| Widget server data | `{Object}` |
| Client form | `{GlideForm}` |
| Array | `{string[]}`, `{Object[]}`, `{{number: string}[]}`; never `Array<…>` |
| Small object | Inline: `{{sys_id: string, is_active: boolean}}` |
| Complex object | `@typedef` (see below) |

## Angular provider scope bindings

Document each directive scope binding with a one-line `@type` comment: `/** @type {string} Tooltip text */`. See the `service-portal-widgets` skill for an example.

## `@typedef`

Use `@typedef` in moderation. It suits a non-private Script Include function that returns a complex object: many properties, nested objects or arrays of objects. Use inline notation for small, flat objects, and for private functions. Place the `@typedef` immediately above the Script Include.

## Examples

Script Include with a destructured parameter and a `@typedef`:

```javascript
/**
 * @typedef {Object} GroupSummary
 * @property {string} sys_id `sys_user_group.sys_id`.
 * @property {string} name Group name.
 * @property {{sys_id: string, name: string}} manager Group manager.
 * @property {{number: string, short_description: string}[]} incidents Active incidents assigned to the group.
 */

/**
 * Utilities for assignment groups.
 * @class
 */
var GroupUtils = Class.create();
GroupUtils.prototype = {
    /**
     * Initialises the utility.
     */
    initialize: function () {},

    /**
     * Returns a group with its manager and active incidents.
     * @param {Object} params
     * @param {string} params.groupId `incident.assignment_group`
     * @param {number} [params.limit=50] Maximum number of incidents to return.
     * @returns {GroupSummary|null} Group summary, or null if the group is missing or not found.
     */
    getGroupSummary: function ({ groupId, limit = 50 } = {}) {
        if (!groupId) return null;
        const group = new GlideRecordSecure('sys_user_group');
        if (!group.get(groupId)) return null;
        const incidents = [];
        const gr = new GlideRecordSecure('incident');
        gr.addActiveQuery();
        gr.addQuery('assignment_group', groupId);
        gr.setLimit(limit);
        gr.query();
        while (gr.next()) {
            incidents.push({ number: gr.getValue('number'), short_description: gr.getValue('short_description') });
        }
        return {
            incidents,
            manager: { name: group.getDisplayValue('manager'), sys_id: group.getValue('manager') },
            name: group.getValue('name'),
            sys_id: group.getUniqueValue(),
        };
    },

    /**
     * Returns whether a user is active.
     * @param {Object} params
     * @param {string} params.userId `sys_user.sys_id`
     * @returns {{sys_id: string, is_active: boolean}|null} User status, or null if the user is missing or not found.
     */
    getUserStatus: function ({ userId } = {}) {
        if (!userId) return null;
        const user = new GlideRecordSecure('sys_user');
        return user.get(userId) ? { is_active: user.getValue('active') === '1', sys_id: userId } : null;
    },

    type: 'GroupUtils',
};
```

Private helper taking a record:

```javascript
/**
 * Returns the caller's manager for a task.
 * @private
 * @param {Object} params
 * @param {GlideRecordSecure} params.task `task` record
 * @returns {string} `sys_user.manager`, or an empty string if none is set.
 */
_getCallerManager: function ({ task } = {}) {
    return task ? task.caller_id.manager.toString() : '';
},
```

ES5 equivalent for scripts without ES12:

```javascript
/**
 * Returns the number of open tasks assigned to a user.
 * @param {Object} params
 * @param {string} params.userId `task.assigned_to`
 * @returns {number} Open task count, or 0 if no user is given.
 */
function getOpenTaskCount(params) {
    var userId = params && params.userId;
    if (!userId) return 0;
    var ga = new GlideAggregate('task');
    ga.addActiveQuery();
    ga.addQuery('assigned_to', userId);
    ga.addAggregate('COUNT');
    ga.query();
    return ga.next() ? Number(ga.getAggregate('COUNT')) : 0;
}
```

Client-callable GlideAjax method:

```javascript
/**
 * Returns a user's department name for the client.
 * Reads `sysparm_user_id` (`sys_user.sys_id`) from the request.
 * @returns {string} Department display value, or an empty string if the user is missing or not found.
 */
getDepartment: function () {
    const userId = this.getParameter('sysparm_user_id');
    if (!userId) return '';
    const user = new GlideRecordSecure('sys_user');
    return user.get(userId) ? user.getDisplayValue('department') : '';
},
```

Business rule:

```javascript
/**
 * Copies the caller's location to the incident when none is set.
 * @param {GlideRecord} current `incident` record
 * @param {GlideRecord} previous `incident` record before the save
 */
(function executeRule(current, previous) {
    if (current.location.nil()) current.setValue('location', current.caller_id.location.toString());
})(current, previous);
```

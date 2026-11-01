---
name: service-portal-widgets
description: Patterns for Service Portal widgets, including server scripts, client controllers, HTML templates, CSS, options and Angular providers. Use when writing or editing an sp_widget or sp_angular_provider record.
---

# Service Portal widgets

## Fields

| Field | Contents |
|---|---|
| `template` | AngularJS HTML. Read data with `c.data` (or `data`). |
| `script` | Server script. Runs on load and on each `c.server.get()`/`c.server.update()`. |
| `client_script` | Client controller: `api.controller = function ($scope) { const c = this; … };` |
| `css` | SCSS scoped to the widget. Use theme variables such as `$brand-primary`, not hex codes. |
| `option_schema` | JSON array of widget options, read with `options.name` on the server. |
| `link` | Link function for direct DOM work. Use only when the controller cannot do it. |

## Server script

Write widget server scripts in ES5 style (`var`, `function`, no optional chaining). Destructured function parameters are fine when ES12 is enabled for the widget. See the `servicenow-es-compatibility` skill.

```javascript
(function () {
    /* populate the 'data' object */
    if (input && input.action === 'close' && input.sysId) {
        var task = new GlideRecordSecure('task');
        if (task.get(input.sysId) && task.canWrite()) {
            task.setValue('state', 3);
            task.update();
        }
    }

    data.tasks = [];
    var gr = new GlideRecordSecure('task');
    gr.addActiveQuery();
    gr.addQuery('assigned_to', gs.getUserID());
    gr.setLimit(options.limit || 10);
    gr.query();
    while (gr.next()) {
        data.tasks.push({ number: gr.getValue('number'), sys_id: gr.getUniqueValue() });
    }
})();
```

- Branch on `input` for client actions. `input` is `undefined` on the first load.
- Treat `input` as untrusted: check required values are present before querying, and limit actions to a known set.
- Use `GlideRecordSecure` because widget input comes from the browser.
- Put only what the template needs in `data`.

## Client controller

```javascript
api.controller = function ($scope) {
    const c = this;

    /**
     * Closes a task and refreshes the list.
     * @param {string} sysId sys_id of the task to close.
     */
    c.close = function (sysId) {
        c.server.get({ action: 'close', sysId }).then((response) => {
            c.data.tasks = response.data.tasks;
        });
    };
};
```

- Use `c.server.get(payload)` to send a specific payload and receive fresh `data`.
- Use `c.server.update()` to send all of `c.data`, and `c.server.refresh()` to reload without input.
- Inject only the services you use: `spUtil`, `$timeout`, `$location`, `spModal`.
- Use `spUtil.recordWatch($scope, table, filter, callback)` for live updates.

## Template

- Use `ng-repeat` with `track by` for lists from the server.
- Write plain text in templates. Do not use `${…}` message tags or `gs.getMessage()` for template text unless asked.
- Use `<sp-widget widget="c.data.embedded">` with `$sp.getWidget()` to embed widgets.

## Angular providers

Directives, services and factories live in `sp_angular_provider` and are attached through the widget's Angular Providers related list. Put shared client logic there instead of copying it between widgets.

Document each directive scope binding with an inline `@type` comment:

```javascript
/**
 * Shows an icon with a tooltip.
 * @returns {Object} Directive definition.
 */
function iconTooltip() {
    return {
        restrict: 'E',
        scope: {
            /** @type {string} Icon class name */
            icon: '@',
            /** @type {string} Tooltip text */
            tooltip: '@',
            /** @type {function} Called when the icon is clicked */
            onClick: '&',
        },
        template: '<i class="fa {{icon}}" title="{{tooltip}}" ng-click="onClick()"></i>',
    };
}
```

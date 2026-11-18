---
name: service-portal-widgets
description: Patterns for Service Portal widgets, including server scripts, client controllers, HTML templates, CSS, options, Angular providers, Angular HTML templates and style sheets. Use when writing or editing an sp_widget, sp_angular_provider, sp_ng_template or sp_css record.
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

Widget server scripts are ES5 only, never ES12; see the `servicenow-es-compatibility` skill.

```javascript
(function () {
    /* Close the task the user selected */
    if (input && input.action === 'close' && input.sysId) {
        var task = new GlideRecordSecure('task');
        if (task.get(input.sysId)) {
            task.setValue('state', 3);
            task.update();
        }
    }

    /* Get the user's open tasks */
    data.tasks = [];
    var gr = new GlideRecordSecure('task');
    gr.addActiveQuery();
    gr.addQuery('assigned_to', gs.getUserID());
    gr.setLimit(parseInt(options.limit, 10) || 10);
    gr.query();
    while (gr.next()) {
        data.tasks.push({ number: gr.getValue('number'), sys_id: gr.getUniqueValue() });
    }
})();
```

- Branch on `input` for client actions. `input` is `undefined` on the first load.
- Treat `input` as untrusted: check required values before querying, limit actions to a known set, and use `GlideRecordSecure`.
- Put only what the template needs in `data`.
- `GlideRecordSecure` already enforces read and write ACLs, so do not add `canRead()` or `canWrite()` checks to it. Use those checks only with `GlideRecord`.
- Option values arrive as strings. Parse numbers with `parseInt(options.name, 10)` and compare booleans with `options.name === 'true'`.

## Client controller

```javascript
api.controller = function ($scope) {
    const c = this;

    /**
     * Closes a task and refreshes the list.
     * @param {Object} params
     * @param {string} params.sysId - `task.sys_id`
     */
    c.close = function ({ sysId }) {
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

```html
<ul>
  <li ng-repeat="task in c.data.tasks track by task.sys_id">
    {{task.number}}
    <button type="button" ng-click="c.close({ sysId: task.sys_id })">Close</button>
  </li>
</ul>
```

- Use `ng-repeat` with `track by`.
- Repeat semantic elements so screen readers announce the group and item count: `<li>` in `<ul>`/`<ol>`, `<dt>`/`<dd>` in `<dl>` for term–description pairs, `<tr>` for tabular data. Repeat `<div>`s only for purely visual layouts that are not a list.
- Prefer native HTML elements (`<button>`, `<a>`, `<label>`, `<table>`) over `role` attributes on generic elements.
- Keep form labels, `alt` text, `aria-*` attributes where needed, and keyboard access for anything clickable.
- Bootstrap grid classes (`container`, `row`, `col-*`) are fine for layout. Do not add Bootstrap component classes (`alert`, `form-group`, `form-control`, `btn`, `list-group`, `panel`, `help-block` and so on) unless the user asks for them. Style with the widget's own `css` instead.
- If a stylesheet is attached as knowledge, read it before writing a template or CSS. Use its classes and variables instead of writing new styles, and never invent classes it does not define. Write widget `css` only for what the stylesheet does not cover.
- Write plain text in templates. Do not use `${…}` message tags or `gs.getMessage()` for template text unless asked.
- Use `<sp-widget widget="c.data.embedded">` with `$sp.getWidget()` to embed widgets.

### `ng-bind-html`

Use `{{ }}` or `ng-bind` for text; AngularJS escapes it. Use `ng-bind-html` only for trusted HTML, such as an HTML field written by administrators, a knowledge article body, or markup the server script builds from fixed strings.

Never bind user-entered content with `ng-bind-html`: comments, work notes, short descriptions, `input` values or anything an end user can type. Show it as text instead. Never call `$sce.trustAsHtml()` on user-entered content; it switches off sanitising.

```html
<!-- Wrong: the comment comes from a user -->
<p ng-bind-html="c.data.comment"></p>

<!-- Right -->
<p>{{c.data.comment}}</p>
```

## Angular templates and style sheets

- Angular HTML templates (`sp_ng_template`) hold reusable markup in their `template` field. Attach them through the widget's Angular ng-templates related list and load them with `ng-include="'template-id'"`, where `template-id` is the template's ID, in quotes inside the attribute.
- Style sheets (`sp_css`) hold portal or theme CSS in their `css` field and apply outside a single widget. Put styles for one widget in the widget's `css`, not a style sheet. Use theme variables such as `$brand-primary`, not hex codes.

## Forms

Build forms with `ngForm` and AngularJS validation, not hand-written checks in the controller.

```html
<form name="c.taskForm" novalidate ng-submit="c.submit()">
  <div>
    <label for="short-description">Short description</label>
    <input id="short-description" name="shortDescription" ng-model="c.data.shortDescription"
           required ng-maxlength="160" aria-describedby="short-description-error"
           ng-attr-aria-invalid="{{c.taskForm.shortDescription.$invalid && (c.taskForm.shortDescription.$touched || c.taskForm.$submitted)}}">
    <div id="short-description-error" ng-messages="c.taskForm.shortDescription.$error"
         ng-if="c.taskForm.shortDescription.$touched || c.taskForm.$submitted">
      <p ng-message="required">Enter a short description.</p>
      <p ng-message="maxlength">Use 160 characters or fewer.</p>
    </div>
  </div>
  <button type="submit">Save</button>
</form>
```

```javascript
/**
 * Saves the task when the form is valid.
 */
c.submit = function () {
    if (c.taskForm.$invalid) {
        return;
    }
    c.server.get({ action: 'save', shortDescription: c.data.shortDescription }).then((response) => {
        c.data = response.data;
    });
};
```

- Name the form on the controller (`name="c.taskForm"`) and add `novalidate` so AngularJS, not the browser, shows the errors.
- Use built-in validators (`required`, `ng-required`, `ng-minlength`, `ng-maxlength`, `ng-pattern`, `type="email"`) before writing a custom one.
- Show errors with `ng-messages` and `ng-message`, after the field is touched or the form is submitted, linked to the input with `aria-describedby`.
- Return early from the submit function when `$invalid`. The server script still validates `input`, because client checks can be bypassed.

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
        template: '<button type="button" title="{{tooltip}}" aria-label="{{tooltip}}" ng-click="onClick()"><i class="fa {{icon}}" aria-hidden="true"></i></button>',
    };
}
```

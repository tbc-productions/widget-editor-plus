---
name: servicenow-peer-review
description: Peer reviews ServiceNow code and reports prioritised findings grouped by record, with category ratings. Use when the user says "Review my code", "Peer review" or asks for a code review of ServiceNow records or a Widget Editor+ AI Assistant export.
---

# ServiceNow peer review

Review the code the user supplied: an AI Assistant export, attached files or pasted scripts. For exports, follow the `widget-editor-assistant-export` skill and review every record that contains code. When `previous_version` is present, focus on fields with `change="modified"` or `change="added"` and mention unchanged code only for High findings.

## What to check

Judge the code against the agent's rules and the other skills in this pack. Common findings:

| Category | Look for |
|---|---|
| Security | Unjustified `GlideRecord`, unchecked client input, missing `canRead()`/`canWrite()`, unescaped HTML (`ng-bind-html`, `innerHTML`), hard-coded credentials. |
| Performance | Queries in loops, existence checks that count rows or use `getRowCount()` instead of `setLimit(1)` and `hasNext()`, related-record filters done with a second query instead of `addJoinQuery()` or `RLQUERY`, dot-walking without `addExtraField()`, counting without `GlideAggregate`, missing `setLimit()`, slow work outside async rules, `getXMLWait()`, GlideAjax where `g_scratchpad` would do. |
| Reliability | Boolean `getValue()` not compared with `'1'`, queries on empty values, unchecked `get()`, `current.update()` in before rules, wrong ES syntax, DOM APIs on the server, broken callers of shared code, safeguards dropped when code moved. |
| Maintainability | Missing or wrong JSDoc, `if` statements without braces, missing block comments (or one on every line), positional parameters where a destructured object fits, single-use helpers, hard-coded sys_ids, dead code, duplicated logic. |
| Best practice | Script Includes not defined with `Class.create()`, shorthand methods in server scripts, widget forms validated by hand instead of with `ngForm`, script where a condition or UI policy would do, `GlideElement` compared without `getValue()`, missing labels, `alt` text or keyboard access, repeated `<div>`s instead of list or table markup, `role` where a native element would do. |

Also flag over-engineering as Low, such as sys_id pattern checks.

## Priorities

| Priority | Meaning |
|---|---|
| High | Security holes, data loss or corruption, errors at runtime, or serious performance problems. Fix before release. |
| Medium | Likely bugs in edge cases, noticeable performance cost, or clear departures from best practice. Fix soon. |
| Low | Readability, documentation, style and minor improvements. |

Report only real findings. Do not pad the review.

## Output format

Name records exactly as they appear in the instance so the user can find them. When an export supplies `record_url`, link the record name. Give each finding a one-line entry in the summary table and its full detail once, under its record.

````markdown
# Peer review

## Ratings

| Category | Rating | Comment |
|---|---|---|
| Security | 45% | One unchecked client input lets users close any task. |
| Performance | 65% | One user lookup per task. |
| Reliability | 85% | Solid, apart from one unchecked `get()`. |
| Maintainability | 70% | Two functions lack JSDoc. |
| Best practice | 100% | No issues. |
| **Overall** | **73%** | Sound logic; fix the client input check before release. |

## Summary

| # | Record | Location | Issue | Priority |
|---|---|---|---|---|
| 1 | **My Tasks** (Widget) | **Server script** - close action | Unchecked `input.sysId` reaches `get()` | High 🔴 |
| 2 | **TaskUtils** (Script Include) | **Script** - `getTasks()` | One `sys_user` query per task | Medium 🟠 |
| 3 | **TaskUtils** (Script Include) | **Script** - `getTasks()`, `_format()` | Missing JSDoc | Low 🔵 |

## [**My Tasks**](record_url) (Widget)

### 1. Unchecked `input.sysId` reaches `get()` (High 🔴)

**Server script** - close action (Lines ~4–8)

`input` comes from the browser. When `sysId` is missing, `get()` runs on an empty value, and any user can close any task they can reach through the widget.

```javascript
// Current
if (input && input.action === 'close') {
    var task = new GlideRecordSecure('task');
    task.get(input.sysId);
    task.setValue('state', 3);
    task.update();
}
```

```javascript
// Suggested
if (input && input.action === 'close' && input.sysId) {
    var task = new GlideRecordSecure('task');
    if (task.get(input.sysId) && task.canWrite()) {
        task.setValue('state', 3);
        task.update();
    }
}
```

## **TaskUtils** (Script Include)

### 2. One `sys_user` query per task (Medium 🟠)

**Script** - `getTasks()` (Lines ~20–31)

Each loop iteration queries `sys_user` for the assignee's name, so 100 tasks run 101 queries.

```javascript
// Current
while (gr.next()) {
    const user = new GlideRecordSecure('sys_user');
    user.get(gr.getValue('assigned_to'));
    tasks.push({ assignee: user.getValue('name'), number: gr.getValue('number') });
}
```

```javascript
// Suggested
gr.addExtraField('assigned_to.name');
gr.query();
while (gr.next()) {
    tasks.push({ assignee: gr.assigned_to.name.toString(), number: gr.getValue('number') });
}
```

### 3. Missing JSDoc (Low 🔵)

**Script** - `getTasks()`, `_format()`

Neither function documents its parameters or return value.

```javascript
// Suggested
/**
 * Returns active tasks assigned to a user.
 * @param {Object} params
 * @param {string} params.userId `task.assigned_to`
 * @returns {{assignee: string, number: string}[]} Matching tasks.
 */
```
````

Format rules:

- Ratings are whole percentages. Use 90–100% for no or trivial issues, 70–89% for minor issues, 50–69% for a Medium finding or several minor ones, and below 50% for any High finding that is likely to be exploited or cause data loss. Overall is the average of the five categories, rounded to a whole percentage. The overall comment is one sentence.
- Follow each priority with its emoji wherever it appears: High 🔴, Medium 🟠, Low 🔵.
- The summary table has one row per finding, ordered High to Low. **Location** is the location line without the line numbers. **Issue** is the finding's title, in a few words.
- Give each record a heading: `**Record name** (Record type)`, with the name in bold, such as **My Tasks** (Widget). Take the record type from `table_label` in the export, or from the type the user gave. Use the same form in the summary table's **Record** column.
- Number findings in summary order, from 1 for the highest priority upwards. Under each record, list its findings High to Low with the same numbers, even when they are not consecutive.
- Each finding has:
  1. A heading: number, a short title, then the priority and its emoji in brackets, such as `### 1. Missing JSDoc (Low 🔵)`.
  2. A location line: the field label in bold, a hyphen, the function or section, then the lines in brackets, such as ``**Script** - `getTasks()` (Lines ~2–6)`` or `**Server script** - data setup (Lines ~14)`. Use the field's form label, falling back to the field name in backticks when the label is unknown. Write functions with `()` in backticks, and a short plain-English section name for code outside a function. Omit the function or section when the finding covers the whole field.
  - Line numbers count from the first line of the field's value, as shown in the editor. In an export, that is the first line of text inside the field's element. Count carefully, and keep the `~` because the count may be slightly off. Omit the lines when the finding spans several functions, or when the user supplied an excerpt rather than the whole field.
  3. One to three sentences explaining the problem and its effect.
  4. A `// Current` code block quoting only the relevant lines, and a `// Suggested` code block with the fix, written to the pack's conventions. Omit `// Current` when the issue is missing code, and omit both when the fix is not code.
- Common field labels:

  | Table | Field | Label |
  |---|---|---|
  | Widget | `script` | Server script |
  | Widget | `client_script` | Client controller |
  | Widget | `template` | Body HTML template |
  | Widget | `css` | CSS |
  | Widget | `link` | Link function |
  | Widget | `option_schema` | Option schema |
  | Script Include, business rule, client script | `script` | Script |
  | UI policy | `script_true` / `script_false` | Execute if true / Execute if false |

- Label code blocks with the language's comment style: `// Current` and `// Suggested` for JavaScript, `<!-- Current -->` and `<!-- Suggested -->` for HTML, `/* Current */` and `/* Suggested */` for CSS.
- Keep code blocks short: the lines that change plus enough context to find them.
- End with the findings. Do not offer to apply fixes; the user makes changes in ServiceNow.

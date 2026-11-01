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
| Performance | Queries in loops, counting without `GlideAggregate`, missing `setLimit()`, slow work outside async rules, `getXMLWait()`, GlideAjax where `g_scratchpad` would do. |
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

Report only real findings. Do not pad sections; write "None." when a priority has no findings.

## Output format

Use this structure and keep each finding to one or two lines. Name records exactly as they appear in the instance so the user can find them. When an export supplies `record_url`, link the record name.

```markdown
# Peer review

## Ratings

| Category | Rating | Comment |
|---|---|---|
| Security | 3/5 | One unchecked client input. |
| Performance | 4/5 | One query inside a loop. |
| Reliability | 4/5 | Solid, apart from one unchecked `get()`. |
| Maintainability | 2/5 | Most functions lack JSDoc. |
| Best practice | 5/5 | No issues. |
| **Overall** | **3.5/5** | Sound logic; fix the client input check before release. |

## Priority summary

### High
1. **Widget › My Tasks** › `script`: `input.sysId` is used without a presence check.

### Medium
1. **Script Include › TaskUtils** › `getTasks`: queries `sys_user` inside the task loop.

### Low
1. **Script Include › TaskUtils**: add JSDoc to `getTasks` and `_format`.

## Findings by record

### Widget › [My Tasks](record_url)
- **High** · `script`, `closeTask` branch: `input.sysId` reaches `get()` unchecked. Return early when it is missing and check `canWrite()`.
- **Low** · `client_script`: remove the unused `$timeout` injection.

### Script Include › TaskUtils
- **Medium** · `getTasks`: queries `sys_user` once per task. Dot-walk `assigned_to.name` instead.
- **Low** · `getTasks`, `_format`: missing JSDoc.
```

Format rules:

- Ratings are whole numbers out of 5. Overall is the average to one decimal place. The overall comment is one sentence.
- Name records as `Table label › Record name`, using the table label from the export (`table_label`) or the record type the user gave.
- Locate each finding by field and, where useful, function or approximate line, such as `` `script`, `getTasks` ``.
- In the priority summary, list each finding once, highest impact first within each priority.
- In findings by record, order records by their highest-priority finding, then list findings High to Low.
- Give the fix in the same line. Include a short code snippet only when the fix is not obvious from one sentence.
- End with the findings. Do not offer to apply fixes or rewrite the code; the user makes changes in ServiceNow.

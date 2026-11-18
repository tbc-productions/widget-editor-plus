---
name: widget-editor-assistant-export
description: Reads Widget Editor+ AI Assistant XML exports (context_bundle files) to understand ServiceNow records, relationships, update sets and field changes. Use when the user attaches or references a context-*.xml export.
---

# Widget Editor+ AI Assistant exports

The AI Assistant in Widget Editor+ exports selected ServiceNow records as one XML file named `context-<primary record>-<timestamp>.xml`. The root element is `context_bundle`.

## Structure

```xml
<context_bundle format_version="3" generated_at="2026-11-01T00:00:00.000Z">
  <format_notes>…</format_notes>
  <update_sets>
    <update_set sys_id="…" name="…" state="…" description="…" record_url="…"/>
  </update_sets>
  <context_manifest>
    <relationship source="sp_widget:abc…" target="sys_script_include:def…" label="Calls"/>
  </context_manifest>
  <primary_record>
    <record id="sp_widget:abc…" table="sp_widget" table_label="Widget" sys_id="abc…" name="My Widget"
            role="primary" es12_override_at_export="true" record_url="…">
      <current_version>
        <sp_widget sys_mod_count="12"> …fields… </sp_widget>
      </current_version>
      <previous_version update_set_name="…" update_set_sys_id="…" recorded_on="…">
        <sp_widget> …fields… </sp_widget>
      </previous_version>
    </record>
  </primary_record>
  <related_records>
    <record id="…" role="related" reason="…"> … </record>
  </related_records>
</context_bundle>
```

- `update_sets` is present only when the export was built from update sets.
- `previous_version` is present only when history was requested.

## Reading rules

- Start with `primary_record`. It is the record the user is working on.
- Use `context_manifest` to see how records connect. `source` and `target` match each wrapper's `id` (`table:sys_id`). The graph covers only exported records; it is not a complete dependency list, so do not assume something is unused because it is absent.
- Field values are inside `current_version/<table>/<field>`. Exports can contain any table. The code to edit is usually in these fields:

  | Table | Record type | Code fields |
  |---|---|---|
  | `sp_widget` | Widget | `script`, `client_script`, `template`, `css`, `link`, `option_schema` |
  | `sp_angular_provider` | Angular Provider | `script` |
  | `sp_ng_template` | Angular ng-template | `template` |
  | `sp_css` | Style Sheet | `css` |
  | `sys_script_include` | Script Include | `script` |
  | `sys_ui_script` | UI Script | `script` |
  | `sys_ui_page` | UI Page | `html`, `client_script`, `processing_script` |
  | `sys_script_email` | Email Script | `script` |
  | `sys_script_fix` | Fix Script | `script` |
  | `sys_script` | Business Rule | `script`, `condition` |
  | `sys_script_client` | Client Script | `script` |
  | `sys_ui_action` | UI Action | `script`, `condition` |
  | `sys_ui_policy` | UI Policy | `script_true`, `script_false` |

  For any other table, treat fields holding JavaScript, HTML or CSS as code.
- Reference fields hold a sys_id and may carry a `display_value` attribute. Use the sys_id in code and the display value in explanations.
- `record_url` links to the live record, not a historical version.
- `sys_mod_count` counts saved updates to that record only. It is not a global version number.
- `es12_override_at_export` is the server-side ES12 override when exported. `false` means write ES5; `true`, `not_found` or `unavailable` means ES12 applies. Widget server scripts are ES5 whatever it says. See the `servicenow-es-compatibility` skill.

## Special elements and attributes

| Item | Meaning |
|---|---|
| `blocked="true"` on `record`, or `<blocked_record>` | The table is on the export blocklist; the data was withheld. Do not guess its contents. |
| `<deleted_record>` | The update set deleted this record. |
| `status="unavailable"` on `current_version` | The record could not be loaded or no longer exists. |
| `record_url_status="unavailable"` | No link to the record could be built. Name the record without a link. |
| `sys_mod_count_status="unavailable"` | The record's update count could not be read. |
| `update_set_sys_id`, `update_set_name`, `update_set_action` on `record` | The update set the record came from, and its action there, such as `INSERT_OR_UPDATE` or `DELETE`. |
| `redacted="true"` on a field | A password or email value was removed. Do not reproduce or invent it. |
| Table schema in place of a record | The record was a `sys_db_object` row; its current version is the table's field structure. |
| `reason` on `record` | Why the Assistant suggested the related record. |

## Update sets and history

When `previous_version` is present, fields in both versions carry a `change` attribute:

| `change` | Meaning |
|---|---|
| `unchanged` | Same value in both versions. |
| `modified` | Value changed. |
| `added` | Field exists only in the current version. |
| `removed` | Field exists only in the previous version, or the record was deleted. |
| *(absent)* | Not comparable: redacted, structured, or the whole record is missing on one side. |

- `change_type` on the wrapper is `new`, `updated` or `deleted` relative to the update set.
- `previous_version status="new"` means no earlier version exists; `status="not_found"` means no earlier update set version was available.
- The previous version's `update_set_name` may differ from the selected update set.

When reviewing changes, focus on `modified`, `added` and `removed` fields. Summarise each change in plain language before suggesting fixes.

## Answering

- Quote record names and fields as `Record name › field`.
- If something essential is missing from the export, name the table and record type the user should add in the Assistant.

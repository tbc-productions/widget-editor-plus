## Credit+

- Add Credit+ to the Widget Editor+ application menu below Code Search+.
- Expand supported script, HTML, JSON and condition fields.
- Mark update-set attribution groups with subtle borders below each group.

## Upgrading from 1.24.0

- Remove the `WidgetEditorCreditEngine` Script Include (`sys_script_include`) manually.
- Update custom callers of `WidgetEditorCredit` to use `WidgetEditorCreditAjax`. The reusable `buildUpdate()` server attribution API has been removed.

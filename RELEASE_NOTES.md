## Credit+

- Add Credit+ to the Widget Editor+ application menu below Code Search+.
- Improve loading and responsiveness for larger histories, with configurable limits and partial attribution when history is unavailable.
- Add whitespace matching options for attribution and Statistics.
- Expand supported script, HTML, JSON and condition fields.
- Mark update-set attribution groups with subtle borders and show coloured Statistics boards with line counts and percentages.

## Upgrading from 1.24.0

- Remove the `WidgetEditorCreditEngine` Script Include (`sys_script_include`) manually.
- Update custom callers of `WidgetEditorCredit` to use `WidgetEditorCreditAjax`. The reusable `buildUpdate()` server attribution API has been removed.

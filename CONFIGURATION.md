# Configuration

[Back to README](README.md)

## System Properties
All system properties are managed under the `monaco.plus.*` namespace:

Admins can edit settings in **Widget Editor+ → Properties**.

| Property Name | Default | Description |
|---|---|---|
| `monaco.plus.assistant.export_blocklist_prefixes` | `pwd,sys_activity,sys_amb,...` | Comma-separated table prefixes excluded from Assistant search, browsing, and XML export. |
| `monaco.plus.assistant.export_blocklist_tables` | *(credential & audit tables)* | Comma-separated table names excluded from Assistant search, browsing, and XML export. |
| `monaco.plus.assistant.table_config.<table_name>` | *(JSON rule configs)* | Declarative relationship rules for Assistant dependency detection per table (e.g. `sp_page`, `sp_widget`, `sc_cat_item_producer`, `sysevent_email_action`). |
| `monaco.plus.code_search.display_fields.<table_name>` | *(table-specific)* | Comma-separated secondary fields shown in Code Search+ result headers. Properties are included for common Studio, Service Portal, and record-producer/catalog development tables. |
| `monaco.plus.code_search.default_search_group` | *(empty)* | Sys_id of the default `sn_codesearch_search_group` for users without an available saved group. Saved choices and shared-link selections take priority. Empty, invalid or unavailable defaults use the first available group. Automatic selection does not save a user preference. |
| `monaco.plus.css.variables` | `{ "example-variable": "#a4c5ea" }` | JSON string of CSS custom property name-value pairs for autocomplete suggestions. |
| `monaco.plus.record_limit` | `500` | Page size for record pickers (widgets, versions, providers, dependencies) with infinite scroll. |
| `monaco.plus.update_sets.markdown_formatting` | Emoji, `,`, `↪`, `()` | Configure `new`, `deleted` and `update_set` indicators, plus `display_field_separator`, `context_indicator` and `display_field_wrapper`. Empty strings hide markers or wrappers. |
| `monaco.plus.update_sets.markdown_escape_characters` | `false` | Escape Markdown punctuation with backslashes in Export Markdown+ labels and text. When false, no escaping is added. |
| `monaco.plus.update_sets.markdown_max_list_levels` | `9` | Maximum bullet indentation levels, counting the top level as 1. Records at the limit and deeper share the final level, formatted as name, additional display values, emoji and bold record type. Invalid or non-positive values fall back to 9. |
| `monaco.plus.scss.variables` | `{ "$breakpoint-xs": "480px", ... }` | JSON string of SCSS variable name-value pairs for autocomplete suggestions. |
| `monaco.plus.widget.deprecated` | `descriptionLIKEdeprecated` | Encoded query string evaluated against `sp_widget` to flag widgets as deprecated. |
| `monaco.plus.widget.fields` | *(empty)* | Comma-separated list of additional fields on `sp_widget` to display inside Widget Editor+. |
| `monaco.plus.widget.related_list_exclusions` | *(empty)* | Comma-separated list of `sys_ui_related_list_entry.related_list` values to exclude from related lists. |

## Markdown formatting

`monaco.plus.update_sets.markdown_escape_characters` defaults to `false`, so exported labels and display values retain their punctuation without added backslashes. This replaces the underscore-only setting; the old `monaco.plus.update_sets.markdown_escape_underscores` property is no longer read.

Enable it to escape backslashes, backticks, asterisks, underscores, braces, square brackets, parentheses, hashes, plus signs, full stops, exclamation marks, pipes, angle brackets, tildes and hyphens. These characters can participate in Markdown syntax, depending on the renderer and context. For example, `+` can start a bullet list, although it does not need escaping in a name such as “Widget Editor+”. When enabled, the exporter conservatively escapes every occurrence in labels and display values. Generated bullets, links and emphasis, configured formatting indicators and URL handling remain unchanged.

Edit `monaco.plus.update_sets.markdown_formatting` in **Widget Editor+ → Properties**. Each update-set number has its own literal value, for example `{"new":":new:","deleted":"Deleted","update_set":{"1":":one:","2":":two:","10":"TEN"}}`. The shipped property lists emoji for numbers 1–10. Add further number keys as needed.

Emoji in the formatting JSON are stored as Unicode escapes (for example, `\ud83c\udd95` for 🆕) to preserve them through property storage and XML transport. They appear as emoji in the exported Markdown.

Empty or unspecified set numbers have no indicator. Use `{"new":"","deleted":"","update_set":{}}` to hide all three indicator types. There are no default formats or placeholders. Values are used beside records and in the update-set legend, with set markers appearing only for multiple sets. Custom marker text and intentional Markdown formatting remain intact. Deleted record names retain strikethrough. Context-only records use the configured marker without automatic italics, keeping links and additional values simpler for Markdown editors.

Additional values use `"display_field_separator":","` and `"display_field_wrapper":"()"`, producing `(value one, value two)`. The separator gets a trailing space for readability unless it is empty or already ends in whitespace. The wrapper is two characters, such as `[]`, or an empty string for no wrapper. `"context_indicator":"↪"` controls both context-only record prefixes and the explanatory footer; an empty string hides the symbol. The symbol is stored as a JSON Unicode escape in the shipped default.

## Markdown primary display fields

In **Widget Editor+ → Properties**, Enter comma-separated primary fields for ordered fallbacks, or period-separated fields to combine their values with a period. Empty or unreadable fields are skipped. A field is shown only once: fields used in the primary value are omitted from additional values, and repeated fields are ignored.

Per-table properties use `monaco.plus.update_sets.markdown_display.<table>`. Set `display_value` to `name,sp_widget` for fallbacks or `name.element` to join the two fields. Periods in primary fields refer to separate fields on the same record, not reference dot-walks. Additional fields still support reference dot-walks.

The default `monaco.plus.update_sets.markdown_display.sys_dictionary` uses `{"display_value":"name.element","additional_fields":"column_label,internal_type"}`, producing names such as `incident.short_description` with the column label and internal type as additional values. A table-level dictionary entry with no element displays only its table name as the primary value.

The default `monaco.plus.update_sets.markdown_display.sp_instance` uses primary fallbacks `name,sp_widget` and additional field `sp_widget`. An instance with a name shows its widget separately; an unnamed instance uses the widget as its primary name without repeating it.

## UI Scripts Reference

| UI Script | Purpose |
|---|---|
| `monaco_plus_core` | Core engine. Manages Script Include IntelliSense, GlideRecord field completions, JSDoc hovers, and property suggestions. |
| `monaco_plus_bootstrap` | Initialises and upgrades Monaco Editor instances on target ServiceNow pages. |
| `monaco_language_client` | Client-side TypeScript ambient declarations covering AngularJS, `g_form`, `g_user`, `spUtil`, `$sp`, and jQuery. |
| `monaco_language_server` | Server-side TypeScript ambient declarations covering `GlideRecord`, `GlideRecordSecure`, and `$sp`. |
| `monaco_language_html` | Monarch tokenizer and directive autocompletion provider for HTML and AngularJS directives (`ng-*`, `sp-widget`, etc.). |
| `monaco_language_css` | Completion provider for CSS/SCSS at-rules and style descriptors. |
| `monaco_code_actions` | Built-in code actions for JavaScript (JSDoc generation) and SCSS (`px` to `rem` conversion). |
| `monaco_custom_code_actions` | Extension point for custom per-language code actions. |

### Embedding Monaco on Any Form Field

`monaco_plus_bootstrap` isn't limited to Widget Editor+ itself — add it as a UI Script dependency on an `onLoad` Client Script for any table/field to mount a full Monaco editor in place of the native textarea, in whatever language you choose:

```javascript
function onLoad() {
    if (typeof SNMonacoPlusBootstrap === 'undefined') {
        return;
    }
    SNMonacoPlusBootstrap.upgradeEditor({
        gForm: g_form,
        field: 'my_json_field',
        language: 'json',
        editorOptions: {
            minimap: { enabled: true },
            tabSize: 4,
        },
    });
}
```

- `field` / `language` — the form field to mount on, and the Monaco language id (`json`, `javascript`, `css`, `scss`, `html`, etc.).
- By default the editor auto-grows with content, like a native expanding textarea, starting from the replaced textarea's rendered height (floored at `125px` — enough room for Monaco's quick-input widget, e.g. F1 — even for a short or hidden/collapsed field) and capped at `maxHeight` (default `'80vh'`) before it scrolls internally.
- `height` — pass a fixed height (a number is treated as px, or a CSS size string like `'40vh'`) to opt out of auto-grow entirely.
- `maxHeight` — override the auto-grow cap (ignored once `height` or `containerStyle` is set).
- `showToggle` — set `false` to omit the toggle-syntax-editor button (default: `true`).
- `editorOptions` — any [`IStandaloneEditorConstructionOptions`](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IStandaloneEditorConstructionOptions.html) accepted by `monaco.editor.create()`, applied before the editor is created and taking precedence over the user's synced editor preferences.
- `onEditorReady(editor)` — optional callback given the created Monaco editor instance for further customisation.

Need full control over the container instead? Pass `containerStyle` (a CSS string) — it overrides `height`/`maxHeight` and disables auto-grow.

The bootstrap script lazy-loads `monaco_plus_core` on demand, so completions/IntelliSense for the chosen `language` come free without any additional wiring.

## User Preferences
User preferences (including editor themes, Assistant visibility, and Debug Menu settings) persist in `localStorage` and synchronise to the ServiceNow instance as `sys_user_preference` records under `monaco_plus.user_prefs`.


### Local draft autosave

In **User Preferences → Editor**, set **Auto-save local drafts** to an interval in whole seconds. The default is **30**; **0** turns automatic capture off, including capture when leaving the tab. **Keep drafts for** below it sets retention in whole days (minimum **1**, default **7**). Both preferences synchronise through `monaco_plus.user_prefs` and are included in preference exports and imports.

For widgets already saved to ServiceNow, drafts capture changed widget fields, open Angular templates, providers and Script Includes, and unfinished Option Schema and Demo Data edits. Capture also runs when the tab becomes hidden or the page is left. Brand-new widgets and read-only version views are excluded. Capture is silent unless browser storage fails. When autosave is enabled, the Unsaved changes popover shows when the current draft was last saved in this browser.

After reopening a widget, the **Local drafts found** info pill appears on the left of the alert bar. Select a draft by its last-edited time and changed-field summary, then choose **Compare**, **Restore** or **Discard**. The newest draft is selected initially. When the browser reports `document.wasDiscarded`, the editor automatically restores that tab’s draft and shows **Unsaved changes** instead. If the tab cannot be identified, automatic restoration requires a single recovery draft; otherwise the Local drafts found pill remains available. Browsers without this signal use manual recovery. Previous recovery drafts remain available while editing, even when automatic capture is off. Drafts changed by another tab are retained. Restoring loads changes into the editor without saving to ServiceNow. Compare opens the existing Compare+ modal, with a record selector when a draft includes related records. Conflicting saved content or current edits require review before restoration. Normal access checks still apply. A successful widget Save removes all local drafts for that widget and user, including earlier sessions. Per-field saves remove only the saved content from the current page’s draft; failed saves preserve drafts. Subsequent unsaved edits can create a fresh draft. Setting the interval to 0 does not itself remove existing recovery copies.

Drafts are separated by instance, user, widget and open page. Expired drafts are removed across this user’s widgets when the editor opens and before draft writes, based on the last content change. The current tab’s working copy is retained while it is open. Drafts are also removed when saved or discarded; clearing site data removes them. Local storage is not an encrypted store for sensitive content. Explicitly cancelling an Option Schema or Demo Data dialog discards its edits.

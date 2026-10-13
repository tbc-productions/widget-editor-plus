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

## Credit+

Credit+ appears only in the administrator list context menu on `sys_update_xml`, including conventional Updates related lists on widgets. It opens the right-clicked row; where a row ID is not supplied by the platform, exactly one checked customer update is required. The selected update and code fields are validated on the server at launch. The earlier preview form link is disabled.

The global `CreditPlus` Script Include is accessible from its own application scope. Its `buildUpdate(customerUpdateSysId, fieldName)` method compares Customer Update XML snapshots across update sets, ending at the selected update. It does not read `sys_update_version` or track intermediate edits within an update set. Launch links use `sysparm_update`. The UI Page (`credit_plus`) and client-callable Script Include have admin ACLs; every public method also checks the role. Historical records remain read-only and historical code is never saved, reverted or executed.

The viewer uses the platform's AngularJS runtime for page state, field containers and Statistics, with directives managing Monaco and Select2. Statistics emoji use JavaScript Unicode escapes to keep supplementary characters out of update-set source text. The viewer follows Compare+'s themed header with searchable Select2 table and record pickers, a themed Update set dropdown and read-only Monaco editors, with a plain text fallback if Monaco cannot load. The table picker lists update-synchronised tables with supported code fields, including inherited fields. Record search uses the table display field and both pickers page their results. Choosing a table clears the record; choosing a record loads its newest Customer Update by Customer Update timestamp. Records without Customer Updates show Compare+’s centred, themed empty state. Deleted records remain accessible through Customer Update launches. Widget records offer **Open in Widget Editor+**; record, Customer Update and update-set links open through `nav_to.do?uri=`. Selection updates both the content-frame URL and the outer ServiceNow URL, so refreshes and bookmarks retain the chosen update set. History entries include the record name and current selection. All supported fields appear as independent collapsible sections, sorted by label, and start collapsed on load and after an update-set change. The initial request returns field and update-set metadata without calculating or returning code attribution. Expanding a field loads its history and scrolls its heading into view once its editor is ready; collapsing it disposes its Monaco editor. Reopening uses cached data for the same update set. Multiple fields can remain open together. Right-click a Created by or Update set value (or use Shift+F10, Enter or a tap) for a ServiceNow context menu. Show matching and Filter out apply to that field only; small removable filters keep clearing available even with no matching rows. Created by and Update set values use link colour, a dotted underline and a hand cursor to indicate their menus. Monaco keeps the complete code model and original line numbers while hiding non-matching lines. Syntax colouring, line numbers, selection and find accompany an attribution table showing time, author and linked update set. Empty code is indicated in a full-width table row. Drag the divider or use its arrow keys to resize attribution and code across all field tables. Long attribution values use ellipses with full-value tooltips. Monaco owns the line positions, font metrics and scrolling, including after resizing or zooming. Wrapping and folding are disabled to keep attribution aligned. On narrow screens the time remains available in attribution tooltips and comparison metadata. Record loading updates the title immediately and notifies the ServiceNow shell. Page and parent-frame titles show the record name, table and instance product name; the shared `we_history_sync` helper records `Credit+` History entries with the last expanded field.

Code fields come from the table's effective elements, including inherited dictionary fields, and are sorted by field label ascending. Supported types are `script`, `script_plain`, `html_template`, `condition_string`, `conditions` and `condition`. HTML templates use HTML colouring, JavaScript conditions use JavaScript colouring, and encoded conditions remain plain text. Set links come directly from each Customer Update's `update_set` or `remote_update_set`; missing or unreadable sets show a dash. XML parsing reads the target record's direct children, including empty fields, CDATA and XML entities, and ignores companion application-file records. Invalid, duplicate-target and DTD/entity declaration payloads fail safely.

History is grouped by update name, with one snapshot per referenced update set. Identical duplicate Customer Updates within a set are consolidated; conflicting duplicates fail. Snapshots are ordered by Customer Update `sys_updated_on`, falling back to `sys_created_on` when absent. The dropdown shows this timestamp, set name and captured author in three columns; imported updates are ordered by their local Customer Update timestamps. Missing ordering keys, tied Customer Update timestamps, target mismatches and unreadable payloads produce an error. Malformed or field-missing intermediate snapshots interrupt attribution; the next available snapshot becomes a new baseline. Unknown set references are treated as separate snapshots.

Attribution describes changes between available update-set snapshots, not individual edits or complete authorship. The earliest snapshot is a baseline. Authors come from payload `sys_updated_by`, falling back to the Customer Update's `sys_updated_by`. Imported metadata can identify source authors or importers; fallback times can reflect import or later update activity. Missing snapshots, intermediate edits within a set and revert/branch relationships cannot be reconstructed. Explicit DELETE snapshots use Customer Update author/time metadata because their XML can retain the previous editor's metadata.

The diff uses an exact longest common subsequence after stripping whitespace, then matches unmatched moved blocks and unique meaningful lines without reusing origins for copies. Repeated delimiters and ambiguous fragments are handled conservatively. Whitespace inside strings, comments and templates is also ignored; this can hide meaningful literal changes. Original code is always displayed. The **Update set** selector includes all available sets for the record, newest first. Choosing a set loads its metadata and collapses the fields; expanding a field loads its code and attribution; the URL follows the selection for reload and History links. The Compare+ menu item opens read-only Compare+ in a new tab for that Customer Update and the immediately preceding update set. Quick compare replaces the field editor with a read-only inline diff from the row’s update set to the selected update set; Stop comparing sits immediately beside the field label in the table header and returns to attribution. Loading messages appear below the header. Comparisons use Customer Update payloads directly, including retrieved sets; the first snapshot compares with an empty baseline. Missing, unreadable or ambiguous snapshots return an error. Both comparison menu items are disabled for the selected set; self-comparisons are disabled and rejected on the server. Credit+ retains its page title and History entry.

The server rejects oversized work explicitly: 500 Customer Updates per record, 2 MB per payload, 10 MB total payload text, 5,000 lines per field, one million cells per LCS matrix, ten million cumulative comparison operations. Payload limits are character-based. No partial attribution is returned when a limit is exceeded. Whitespace-only comparisons take a linear fast path. Reload/retry is available and late responses after the 30-second timeout are ignored.

The **Statistics** pie-chart button beside the Update set selector loads statistics on demand, using the Assistant’s themed skeleton bars while calculating (static with reduced motion). Four leaderboards rank all Created by users and update sets (including zero totals), with a trophy for first place and larger medals for second and third for lines added and removed: Builders/Destroyers for people and Expansions/Demolitions for update sets, across all available update sets and supported code fields, including sets after the selected snapshot. A replacement counts as one removal and one addition; the first snapshot counts as additions. The existing whitespace/move matching rules and comparison limits apply, with a shared calculation budget across all fields. Missing fields interrupt comparison rather than inventing additions; malformed, mismatched or ambiguously ordered snapshots fail the request. These are captured-snapshot totals, not individual-edit counts. Unknown or unreadable set references are identified separately from the update-set count.

Statistics also show record age in whole days, founder, contributor count, total lines created/destroyed, busiest field and biggest makeover (both ranked by additions plus removals). Age and founder use readable record creation metadata, falling back to the earliest snapshot only when the record is unavailable; absent metadata remains unknown. The Statistics button uses the standard active toggle styling. Opening it adds `sysparm_statistics=true` to both the content and ServiceNow shell URLs; shared links and browser refreshes open and load Statistics automatically. Closing it removes that parameter. Results stay cached while toggling the panel, and reset on record/update-set changes or Reload. Statistics remain admin-only and read-only.

User names (including the founder) and update-set names open their records in the same tab through `nav_to.do?uri=`. User records are resolved by username with read access enforced; unavailable references remain plain text. Statistics have no tooltips or external-link icons. Rank emoji sit outside hyperlinks so they do not underline on hover. Statistics labels and medal placements use trailing emoji, including lipstick for Biggest makeover. Age uses a baby below 90 days, a child below 365, an adult below 1,000 and an older person thereafter; unknown age uses a question mark.

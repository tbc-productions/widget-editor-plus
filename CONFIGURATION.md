# Configuration

## Continuous integration

Checks and releases use the official Playwright container with browsers and Linux dependencies already installed. Keep the image version in both `.github/workflows/*.yaml` files aligned with the Playwright version in `package-lock.json` when upgrading. Node.js 24 is selected from `.nvmrc` and verified before installing dependencies.

Both workflows cache npm downloads and run `npm ci --prefer-offline`, retaining clean installs and dependency auditing.

Credit+ and scrolling browser tests reuse one Chromium process per file and close each test's browser context in a `finally` block. Tests retain separate cookies, storage and page state. For local unit tests, install only the headless browser with `npx playwright install --only-shell chromium` (add `--with-deps` on Linux if system dependencies are missing).

[Back to README](README.md)

## App drawer

Click the app icon in the header to switch between Widget Editor+, Compare+, AI Assistant, Code Search+ and, for administrators, Credit+. Select a row to use the current tab, or its hover action to open a new tab. Widget Editor+ prompts you to save or discard unsaved changes before leaving.

Supported apps carry the saved record between them; AI Assistant uses its primary record. Unsupported or unreadable records open the destination fresh. Unsaved edits and historical version selections do not carry between apps.

## Supported editor records

Use **Open…** and click the dotted record type in the title to choose a type:

| Record type | Table | Code panes |
|---|---|---|
| Widgets | `sp_widget` | HTML template, CSS/SCSS, client controller, link and server script |
| Script Includes | `sys_script_include` | Script |
| CSS | `sp_css` | CSS/SCSS |
| UI Scripts | `sys_ui_script` | Script |
| Angular Providers | `sp_angular_provider` | Script |
| UI Pages | `sys_ui_page` | HTML/Jelly, client script and processing script |
| Angular Templates | `sp_ng_template` | HTML template |
| Email Scripts | `sys_script_email` | Script |
| Fix Scripts | `sys_script_fix` | Script |

**New** opens an unsaved record of the selected type, using dictionary defaults and create permissions. Use the toolbar **Save** to create it; per-pane saves and local draft recovery become available after the first save. The parent widget of an Angular HTML template can be selected using Select2.

Save individual code panes or use the toolbar **Save** for all changed fields. **Revert** in the Unsaved changes popover discards this tab’s edits after confirmation. Saves respect record and field permissions, protection policies and validation. If a changed field also changed in ServiceNow, saving stops and retains your edits for comparison.

The header shows Active where available. **More fields** includes descriptions, API name and application, plus Mobile callable and the read-only Protection policy for Script Includes. It also shows the established year and founder from the earliest readable update version. Related Script Includes, Angular HTML templates and Angular Providers offer **Open in Editor+** in a new tab.

Fix Scripts show **Name** and **Rollback** in the header, with **Description**, **Unloadable** and **Before** in **More fields**.

Editor visibility and order preferences apply only to widgets; other types start with all code panes visible. ES12 controls are available for widget server scripts, Script Includes and UI Page processing scripts. Widget-specific actions, related lists, live presence, real-time updates and SN Utils integration are limited to widgets. Other types retain version comparison, Assistant, XML and native-form access. History and drafts distinguish record types.

Existing `widget_id` links remain supported. Other records use `record_table` and `record_sys_id`, for example:

```text
ui_page.do?sys_id=8b2e70458373fe1070b8b5dfeeaad35e&record_table=sys_ui_page&record_sys_id=<record sys_id>
```

These links edit the record; they do not execute the target UI Page or script.

### Table configuration

In **Properties → Widget Editor+**, edit `monaco.plus.editor.table_config.*` to configure non-widget record types. Each row saves one `sys_properties` record, with up to 4,000 characters of JSON; its table-name suffix selects the table. The supplied properties cover the non-widget types above and preserve local changes on upgrades. Removing a row removes that type from the editor.

For example, `monaco.plus.editor.table_config.sys_script_email`:

```json
{
  "primaryField": "name",
  "icon": "icon-envelope-subscribe",
  "allowCreate": true,
  "scriptFields": [
    { "name": "script", "language": "javascript", "scriptKind": "server" }
  ],
  "headerFields": ["name", "new_lines_to_html"],
  "additionalFields": [{ "name": "sys_policy", "readOnly": true }]
}
```

Arrays set field order. `scriptFields` defines the Monaco panes; JavaScript fields require `scriptKind: "client"` or `"server"`. `headerFields` and `additionalFields` accept field-name strings or objects with `name` and optional `label`, `readOnly` and `multiline` options. Additional fields appear in **More fields**. Readable application scope (where the table has `sys_scope`) and available founder details appear there automatically, even when `additionalFields` is empty; neither needs a config entry. Labels, boolean/choice controls, mandatory status and bounded-string lengths come from the dictionary; label overrides retain the dictionary label in the tooltip. Reference fields use Select2 to search readable records and save their sys_ids; field permissions and explicit `readOnly` settings still apply. Static dictionary reference qualifiers are honoured. Scripted qualifiers require the native form.

`primaryField` must appear in `headerFields` and supplies the record title and picker search/sort field. Optional `secondaryField` displays a readable field’s display value beneath the primary field in the picker and recent records; it does not need to appear in the header or additional fields. Angular Provider defaults to `"secondaryField": "type"`; Angular Template defaults to `"secondaryField": "sp_widget"`, showing the widget’s name. Add these options to existing properties to enable them on an installed instance.

Table names use their singular dictionary label unless the optional top-level `label` overrides it, for example `"label": "Angular Template"`. `icon` accepts a Retina class and defaults to `icon-document-code`. `allowCreate` defaults to `false`; include the required fields before enabling creation. `supportsEs12` also defaults to `false` and should only be enabled for tables that support per-record ES12 settings.

Only administrators can save configuration. Properties rejects invalid tables, fields, duplicate placements and unsupported options. At runtime, fields unavailable on the instance are skipped; the primary field and at least one code field must exist. Invalid properties disable their table and log a warning. Record and field permissions, protection policies and save-conflict checks still apply. Reload the editor after configuration changes.

## Editor formatting

**Use spaces for indentation and formatting** applies to typing, paste formatting and **Format document**. Set the indentation width with **Tab size**. Existing tabs in indentation are converted when formatting; tabs inside JavaScript strings and template text are preserved.

JavaScript block comments starting with `/*` and `/**` align their leading `*` characters one space after the opening `/`, including unfinished comment blocks.

## Compare and merge

In Merge+, hover over or focus a block arrow to highlight the middle-editor code it would replace in amber, including its position beside the scrollbar. Moving away clears the preview. With text selected in the middle editor, clicking a block arrow replaces only that selection. Otherwise, it replaces the entire matching block, which can cover the whole script even when its source is a single line. To copy only part of a source block, select the source text and use its selection arrow.

When a field diff is expanded, clicking **Merge+** opens its three editors immediately. The URL includes `merge_field` and the selected version IDs while the field is being merged, so opening that link restores the same field in Merge+. From the editor's comparison modal, use **Open in new tab** to get the shareable URL. Links use saved versions or the current record; unsaved comparison snapshots and merge edits are not included. The recipient still needs permission to edit the field.

## Debug Menu

Properties includes a **Debug Menu** section with a copyable embed snippet for a Service Portal header or footer widget:

```html
<widget id="widget_editor_debug_menu"></widget>
```

No instance options or dedicated system properties are required. Default editor, timing indicators and console variables are per-user Debug Menu preferences; context-menu mode and Assistant visibility use Widget Editor+ user preferences.

## Backup and uninstall

Administrators can use **Backup and uninstall** at the bottom of Properties. Uninstall requires active elevation to **security_admin**; use the profile menu to elevate before reviewing records.

- **Export preferences** downloads preferences for all users of Widget Editor+ apps, including shared defaults. It covers `monaco_plus.user_prefs`, `we_debug_menu_prefs`, `widget_editor.visible_editors`, `widget_editor_assistant.favourite_tables` and `widget_editor_assistant.favourite_groups`.
- **Restore preferences** accepts a preferences XML export up to 10 MiB. Restore matches by user and preference name, updating existing records and creating missing ones. User sys_ids must match; missing users and duplicate preferences block review. Review the counts and confirm before restoring. Interrupted imports can be reviewed and retried safely. Reload Widget Editor+ apps afterwards.
- **Uninstall Widget Editor+ apps** shows linked records with all selected by default. Uncheck records to preserve them; their required parents are preserved automatically. Preferences are kept unless **Delete all users’ app preferences** is selected. The recommended backup includes all app records and preferences, including preserved records. Save the XML file, acknowledge it and type `UNINSTALL` before deleting the selected records.

Uninstall covers current and retired source records, all records owned by the application, and `monaco.plus.*` system properties. Local and test records appear in the same selection table. Records edited using Widget Editor+ apps remain. Permissions and selections are validated on the server before deletion; changed records require a fresh review.

Backups contain current record values, not attachments, update history or browser-only settings and drafts. Save exports outside the instance before a clone or upgrade. If deletion fails, removal stops and reports partial progress. Keep the page open until it finishes. To recover app configuration, reinstall Widget Editor+ apps, then load the complete backup using ServiceNow’s standard [Import XML](https://www.servicenow.com/docs/r/platform-administration/table-administration-and-data-management/import-xml-file.html) action. Use the preferences-only export with the preference restore controls. Backups contain user settings and application scripts.

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
| `monaco.plus.editor.table_config.<table_name>` | *(JSON editor profiles)* | Ordered code panes, header and additional fields, Retina icon and creation options for non-widget types. |
| `monaco.plus.widget.fields` | *(empty)* | Comma-separated list of additional fields on `sp_widget` to display inside Widget Editor+. |
| `monaco.plus.widget.related_list_exclusions` | *(empty)* | Comma-separated list of `sys_ui_related_list_entry.related_list` values to exclude from related lists. |

## Markdown formatting

`monaco.plus.update_sets.markdown_escape_characters` adds backslashes to Markdown punctuation in exported labels and display values. It defaults to `false` and replaces the obsolete `markdown_escape_underscores` property. Generated Markdown and configured indicators are unaffected.

Edit `monaco.plus.update_sets.markdown_formatting` in **Widget Editor+ → Properties**:

```json
{
  "new": ":new:",
  "deleted": "Deleted",
  "update_set": { "1": ":one:", "2": ":two:", "10": "TEN" },
  "display_field_separator": ",",
  "display_field_wrapper": "()",
  "context_indicator": "↪"
}
```

- `new`, `deleted` and numbered `update_set` values are literal indicators. The shipped defaults use emoji, with set numbers 1–10; add more keys as needed. Missing or empty indicators are hidden. Set indicators appear only for multiple sets, beside records and in the legend. Deleted names retain strikethrough.
- `display_field_separator` and `display_field_wrapper` format additional values, for example `(value one, value two)`. Separators gain a trailing space unless empty or already ending in whitespace. Wrappers must contain two characters, such as `[]`, or be empty.
- `context_indicator` prefixes context-only records and their explanatory footer. An empty string hides the symbol.

Use `{"new":"","deleted":"","update_set":{}}` to hide all three record/set indicator types. Shipped emoji are stored as JSON Unicode escapes to preserve them through property storage and XML transport.

## Markdown primary display fields

In **Widget Editor+ → Properties**, enter comma-separated primary fields for ordered fallbacks, or period-separated fields to combine their values with a period. Empty or unreadable fields are skipped. A field is shown only once: fields used in the primary value are omitted from additional values, and repeated fields are ignored.

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
| `widget_editor_code_analysis` | Shared background dependency scanner for Widget Editor+ and Assistant. |

### Embedding Monaco on Any Form Field

Add `monaco_plus_bootstrap` as a UI Script dependency on an `onLoad` Client Script to replace a form textarea with Monaco:

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
- The editor grows from the textarea’s height (minimum `125px`) to `maxHeight` (default `'80vh'`), then scrolls internally.
- `height` — pass a fixed height (a number is treated as px, or a CSS size string like `'40vh'`) to opt out of auto-grow entirely.
- `maxHeight` — override the auto-grow cap (ignored once `height` or `containerStyle` is set).
- `showToggle` — set `false` to omit the toggle-syntax-editor button (default: `true`).
- `editorOptions` — any [`IStandaloneEditorConstructionOptions`](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IStandaloneEditorConstructionOptions.html) accepted by `monaco.editor.create()`, applied before the editor is created and taking precedence over the user's synced editor preferences.
- `onEditorReady(editor)` — optional callback given the created Monaco editor instance for further customisation.

Need full control over the container instead? Pass `containerStyle` (a CSS string) — it overrides `height`/`maxHeight` and disables auto-grow.

The bootstrap script lazy-loads `monaco_plus_core` on demand, so completions/IntelliSense for the chosen `language` come free without any additional wiring.

## Background code analysis

Widget Editor+ and Assistant scan code dependencies in a browser worker without executing the code. The server validates Assistant candidates and read access. Analysis falls back to server discovery or the editor’s local scanner if the worker fails. Results are cached in memory for the current page; XML exports fetch current content.

In Assistant, use the history button in a record’s **Actions** or graph card to include its preceding Customer Update snapshot in the XML and token estimate. A **+ Previous** badge identifies included history. Toggle off and on to retry a failed lookup. Blocked records and table structure exports do not support this option. The sidebar history option includes snapshots from before each selected update set.

## User Preferences
User preferences (including editor themes and Assistant visibility) persist in `localStorage` and synchronise to the ServiceNow instance as `sys_user_preference` records under `monaco_plus.user_prefs`. Debug Menu editor, timing and console preferences synchronise separately under `we_debug_menu_prefs`.


### Local draft autosave

In **User Preferences → Editor**, set **Auto-save local drafts** in whole seconds (default **30**; **0** disables capture), and **Keep drafts for** in whole days (minimum **1**, default **7**). Both settings synchronise with your preferences and are included in preference exports.

Drafts capture unsaved changes to saved records, including open related templates, providers, Script Includes, Option Schema and Demo Data edits. Capture also runs when leaving or hiding the tab. New records and read-only versions are excluded. Drafts stay in this browser and never save to ServiceNow automatically.

Reopen a record and select **Local drafts found** to **Compare**, **Restore** or **Discard** a recovery copy. Restoration loads edits without saving them; conflicting saved content or current edits require review. Browsers that report a discarded tab can restore its draft automatically when the recovery copy is unambiguous.

Successful saves remove matching recovery content; failed saves and drafts with different unsaved content remain recoverable. Turning capture off does not delete existing drafts. Drafts are separated by instance, user, record and tab, and expire from their last content change; the current tab’s working copy is retained while open. Clearing site data removes drafts. Browser storage is not encrypted, so avoid relying on it for sensitive content. Cancelling an Option Schema or Demo Data dialog discards its edits.

## Credit+

Credit+ requires administrator access and is read-only. Open it from the application menu, the app drawer for a supported saved record, or a Customer Update list context menu. If the platform supplies no right-clicked row, select exactly one Customer Update. Launch URLs use `sysparm_update`.

Choose a table, record and update set, then expand a code field to load attribution. Supported fields include inherited CSS, JavaScript, HTML, JSON and condition fields. Records without Customer Updates show an empty history; deleted records remain accessible through their Customer Updates. Selection and expanded-field links support bookmarks and ServiceNow History.

### Attribution and comparisons

Credit+ compares available Customer Update snapshots, rather than individual edits or complete authorship. It does not use `sys_update_version`. Authors come from captured source metadata, falling back to Customer Update metadata. Imports may identify an importer, and missing snapshots or intermediate edits cannot be reconstructed. Snapshots use Customer Update timestamps with stable tie-breakers; indistinguishable imported timestamps cannot prove original order.

- Use **Grouped view** or **Column view** to change attribution layout. Right-click an author or update set to show matching lines or filter them out. Drag the divider, or use its arrow keys, to resize attribution columns.
- **Whitespace** defaults to ignoring all whitespace, including inside strings and templates, which can hide meaningful literal changes. Exact matching, ignoring whitespace amounts and ignoring trailing whitespace are also available. Original code remains visible. View and whitespace choices synchronise in user preferences; explicit URL options take priority.
- **Quick compare** shows an inline diff against the selected snapshot; **Stop comparing** returns to attribution. **Compare+** opens the chosen Customer Update against its preceding snapshot in a new tab. The first snapshot compares with an empty baseline. Whitespace attribution settings do not affect these diffs.

History is retrieved through the Table API with platform access checks; attribution and statistics run in a browser worker. Missing, malformed, oversized or unreadable snapshots can leave partial attribution. Uncertain lines remain unattributed. Use **Reload** to refresh changed history.

### Limits

Credit+ limits are positive integer properties in **Widget Editor+ → Properties**. Upgrades preserve administrator settings; invalid or non-positive values use the defaults. XML limits count characters, not encoded bytes.

| Property | Default | Effect |
|---|---:|---|
| `monaco.plus.credit.max_updates` | 5,000 | Maximum retained Customer Updates. Newest updates and the selected update remain available when capped. |
| `monaco.plus.credit.max_payload_chars` | 20,000,000 | Maximum characters in one XML payload. Oversized historical payloads are skipped; an oversized selected payload must be allowed by raising this value. |
| `monaco.plus.credit.max_history_chars` | 100,000,000 | Maximum extracted code characters retained in the browser history cache (the selected snapshot is always retained). |
| `monaco.plus.credit.max_lines` | 50,000 | Maximum lines per field for matching. Larger code still displays with partial attribution. |
| `monaco.plus.credit.diff_work` | 20,000,000 | Matching work units per browser comparison, including retained traceback links. |
| `monaco.plus.credit.request_timeout_seconds` | 180 | Timeout for Table API requests, field/statistics loading and worker calculations, capped at the browser timer maximum. Platform transaction limits still apply. |

When a limit is reached, available code remains visible and partial results are identified. Statistics exclude uncertain comparisons. Higher limits can increase transfer size, browser memory and calculation time. The legacy `monaco.plus.credit.statistics_batch_size` setting is no longer read by the current viewer.

### Statistics

Expand **Statistics** to calculate additions and removals across all available update sets and supported code fields, including sets after the selected snapshot. Builders/Destroyers rank contributors; Expansions/Demolitions rank update sets. Replacements count as one removal and one addition; the first snapshot counts as additions. These are captured-snapshot totals, not individual-edit counts.

Statistics include record age, founder, contributor count, lines created/destroyed, busiest field and month, biggest makeover and longest quiet spell between updates. Age and founder use readable record creation metadata, falling back to the earliest snapshot if the record is unavailable. Activity dates use UTC.

The activity chart plots known additions and removals for each Customer Update. Hover or focus points and author avatars for details. Drag a region to zoom, or use the zoom, reset and full-screen controls. Incomplete comparisons show only known totals; updates without known totals remain available through their avatars.

Links with `sysparm_statistics=true` open Statistics automatically. Results stay cached while toggling the panel and reset when the record or update set changes, or on Reload.

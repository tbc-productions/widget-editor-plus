# Widget Editor+ development guide

## Working conventions

- Do not commit or push unless the user explicitly asks. Leave edits uncommitted until they are ready.
- When starting work on a branch for a new application version, always update `package.json` and both application version entries in `package-lock.json` to match the branch version.
- Never create new ServiceNow records, including Fluent record definitions and fix scripts, without asking the user and receiving explicit approval first.
- Use Australian English. Keep README feature summaries brief; configuration details belong in `CONFIGURATION.md`.
- Keep this guide project-specific and platform-neutral. Do not document personal hosting arrangements, remote mappings, or repository visibility settings.

## Project context

ServiceNow global application built with the Fluent SDK, AngularJS and Monaco. `now.config.json` defines the scope and application ID; `package.json` defines versions and commands.

Edit source under `src/fluent/generated/` despite its name. `.now.ts` files declare metadata; scripts may be inline or loaded from adjacent `.js` files with `Now.include()`. `keys.ts` maps record identifiers to sys_ids. Build output is in `dist/`; release packages are in `target/`.

Widget Editor+ also edits Script Includes, Style Sheets, UI Scripts, Angular Providers, UI Pages and Angular HTML templates. Supported types and fields are defined in `WidgetEditorAjax._getEditorProfiles()`. Preserve dictionary labels, record and field permissions, protection policies and save-conflict checks. Record links use `record_table` and `record_sys_id`; legacy widget links still use `widget_id`.

Key paths beneath `src/fluent/generated/`:

| Path | Purpose |
|---|---|
| `other/sys-ui-page/` | Widget Editor+, Compare+, AI Assistant, Code Search+, Credit+ and Properties pages. Most metadata files include adjacent `.html` and `.client.js` files; Properties keeps its HTML inline. The editor and Compare+ metadata filenames use sys_ids. |
| `other/sys-ui-page/widget_editor_app_drawer.js` | Shared app navigation and record context; preserve the editor's unsaved-change guard. |
| `other/sys-ui-page/widget_editor_maintenance.client.js` | Preference backup, restore and uninstall controls in Properties. |
| `other/sp-widget/sp_widget_widget_editor_debug_menu/` | Debug Context Menu template, scripts and styles. |
| `client-development/ui-script/` | Monaco bootstrap, language services, code actions and shared worker-based dependency analysis. |
| `server-development/script-include/` | Server APIs for the editor, Assistant, Code Search, Credit+, Markdown export and Properties maintenance. |
| `server-development/ui-action/widget_editor_markdown_copy.client.js` | Markdown tree construction, formatting and clipboard export. |
| `properties/` | System properties and category links. |
| `security/`, `user-interface/` | ACLs, modules and navigation metadata. |

## Commands and checks

Run from the repository root:

Use Node.js 24 LTS, as specified in `.nvmrc` and `package.json`.

| Command | Purpose |
|---|---|
| `npm run build` | Regenerate the uninstall manifest and compile Fluent metadata; run after source changes and inspect relevant `dist/app/update/` output. |
| `npm run test:unit` | Unit suite; some checks launch a browser. Use relevant test files during development. |
| `npm run lint` / `npm run format:check` | Check JavaScript correctness and formatting. Use `npm run format` to format runtime scripts and tooling. |
| `npm run test:e2e` | Playwright against the instance configured in `.env`; fixtures create and remove test records. |
| `npm run pack` | Package the build and generate retrieved update-set XML in `target/`. |
| `npm run deploy` | Install on the configured ServiceNow instance. |
| `npm run transform` / `npm run types` | Transform metadata / refresh instance typings. |

Documentation-only edits need diff and link checks, not a build.

`scripts/generate-uninstall-manifest.js` generates `server-development/script-include/widget_editor_uninstall_manifest.json` beneath the source root from `keys.ts` and `now.config.json`. Retain retired record IDs in `keys.ts` so older installations remain covered. Tests reading included Fluent fields should use `tests/helpers/fluent-source.cjs`.

Pull requests run the build, formatting, lint and unit suite through the `Build and unit tests` check. Require this check in the target branch's protection settings before merging. Release workflows also run formatting, lint and the unit suite before packaging or publishing; never bypass a failing check.

## Platform pitfalls

- Modules opening UI pages must use `ui_page.do?sys_id=<verified sys_id>`, never a named `.do` endpoint. Resolve IDs from `keys.ts` or the actual record.
- Outside Widget Editor+, use Bootstrap 3 checkbox markup: `input-group-checkbox`, an input with class `checkbox`, and a sibling `checkbox-label` linked by `for` and `id`. Use the corresponding radio-group markup for mutually exclusive choices. Do not introduce custom checkbox styling.
- Jelly can turn CSS `>` selectors inside UI-page `<style>` blocks into literal `&gt;`, breaking them. Use descendant selectors.
- Embedded JavaScript has two escaping layers. When generated JS needs an escaped backtick, use three backslashes before it in the outer TypeScript template literal; verify the compiled output.
- Debug Menu preferences use `we_debug_menu_prefs`; shared editor preferences use `monaco_plus.user_prefs`. Preserve unrelated settings when saving. Pass preference objects directly to `$scope.server.get`, without pre-stringifying.
- Markdown groups form a table hierarchy: reject duplicate child placements and cycles. Primary display fields use commas for ordered fallbacks and periods to join fields on the same record; additional fields are separate. Retain server-side validation when changing the Properties editor.

## Releases

### Release-note writing style

- Use short product headings and brief bullets in plain Australian English.
- Start bullets with direct verbs such as Add, Improve, Copy, Mark or Update.
- Summarise user-visible capabilities. Combine related changes into one bullet instead of listing every implementation detail or edge case.
- Omit internal terminology, validation mechanics, test results and minor UI details unless they are essential to understanding the change. Keep technical validation in the PR.
- Describe changes relative to the previous release. Omit fixes to issues introduced and resolved during development of the current release.

Annotated tags are the source of truth for published release notes. Keep the annotation and release body identical, using concise product sections matching recent releases and Australian English. Use `git tag -a --cleanup=verbatim -F <notes-file>` to preserve Markdown headings.

Pushing a `v*` tag triggers `.github/workflows/release.yaml`, which builds and publishes the application ZIP and retrieved update-set XML. Verify workflow success, both assets and matching notes before reporting completion.

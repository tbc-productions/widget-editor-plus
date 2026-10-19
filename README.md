# Widget Editor+

Widget Editor+ is a ServiceNow Service Portal development suite built around Monaco, with tools for editing, version comparison, script attribution, runtime diagnostics, code search and AI context export.

The installed application uses libraries and APIs already available in ServiceNow; no external runtime dependencies are required.

---

## Table of Contents
- [Core Components](#core-components)
  - [1. Widget Editor+](#1-widget-editor)
  - [2. Compare+](#2-compare)
  - [3. Debug Context Menu](#3-debug-context-menu)
  - [4. Code Search+](#4-code-search)
  - [5. Widget Editor+ Assistant](#5-widget-editor-assistant)
  - [6. Credit+](#6-credit)
- [Installation & Deployment](#installation--deployment)
  - [Prerequisites](#prerequisites)
  - [Build with ServiceNow SDK](#build-with-servicenow-sdk)
  - [Direct Deployment](#direct-deployment)
- [End-to-End Testing](#end-to-end-testing)
- [Configuration](#configuration)
- [AI Disclosure](#ai-disclosure)
- [Licence](#licence)

---

## Core Components

| Component | Purpose |
|---|---|
| **Widget Editor+** | Monaco-powered IDE for Service Portal widgets, with ServiceNow client/server IntelliSense |
| **Credit+** | Admin-only historical script attribution across update sets |
| **Compare+** | Side-by-side Monaco diff viewer, including a condition-builder diff |
| **Debug Context Menu** | Runtime diagnostics overlay on live Service Portal pages |
| **Code Search+** | Cross-table source search with advanced filtering and Monaco-highlighted results |
| **Widget Editor+ Assistant** | AI-ready XML context bundle exporter and dependency traversal engine |

---

### 1. Widget Editor+

A Monaco-based editor for Service Portal widgets.

- Edit widget templates, styles, scripts and JSON, with per-field saving.
- Open Script Includes, CSS, UI Scripts, Angular Providers, UI Pages, Angular HTML templates and Email Scripts in the same editor.
- Recover unsaved changes from automatic local drafts.
- ServiceNow and AngularJS IntelliSense, including table fields, Script Includes and providers.
- AngularJS expression validation and syntax highlighting.
- Hover over Unicode escapes in JSON and scripts to preview characters and emoji.
- Widget search, recent history, live developer presence and SN Utils integration.

---

### 2. Compare+

Compare record versions from the editor, Debug Context Menu or version lists.

- Side-by-side code and condition-builder diffs.
- Readable reference and list values.
- Export both versions as XML, including unsaved changes where applicable.

---

### 3. Debug Context Menu

Use **Ctrl + Right-Click** on a Service Portal widget to inspect it.

- Navigate nested widgets and open editors or platform records.
- Inspect generation times, scopes, data and instance customisations.
- Choose Enhanced, Standard or Off in User Preferences.

---

### 4. Code Search+

Search across widget and related script fields from the Widget Editor+ menu.

- Use ServiceNow search groups with additional AND/OR conditions.
- Browse highlighted results with configurable display fields.
- Share searches by URL, monitor progress and cancel scans.
- Access requires the `sp_admin` role.

---

### 5. Widget Editor+ Assistant

Export selected ServiceNow records as XML context for AI tools.

- Discover related records and inspect their relationships in a graph.
- Select records or update sets, and save favourites and bundles.
- Include previous versions, field changes, record links and ES12 context.
- Estimate token counts, with export blocklists and password redaction.
- **Export Markdown+**: Copy filtered Customer Updates as linked, grouped Markdown.

---

### 6. Credit+

- Open Credit+ from a Customer Update list context menu, including Updates related lists.
- Trace script lines across update sets to their captured authors, ignoring whitespace and moved blocks.
- Inspect scripts, templates and conditions with attribution filters and Compare+ comparisons.
- View contributor and update-set statistics, record history and an activity chart.
- Require administrator access for both the viewer and server API.

---

## Installation & Deployment

### Prerequisites
- Node.js 24 LTS (`.nvmrc` selects the 24.x release line)
- ServiceNow SDK (`@servicenow/sdk`)
- A ServiceNow instance to deploy to

### Build with ServiceNow SDK
1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/tchris3/widget-editor-plus.git
   cd widget-editor-plus
   nvm install
   nvm use
   npm ci
   ```
   If you use another Node version manager, select Node.js 24 LTS before installing dependencies.
2. Build the Fluent source definitions into update set XML:
   ```bash
   npm run build
   ```
   The compiled metadata is output to the `dist/app/` directory.

### Direct Deployment
Deploy the application directly to your configured ServiceNow instance:
```bash
npm run deploy
```
This runs `now-sdk install` against the configured instance.

Alternatively, deploy the retrieved update set XML artifact located in the latest [GitHub Release](https://github.com/tchris3/widget-editor-plus/releases) via **System Update Sets → Retrieved Update Sets**.

---

## End-to-End Testing

Playwright tests cover editor features, language services and context menus against a live ServiceNow instance.

1. Create a local `.env` configuration:
   ```bash
   cp .env.example .env
   ```
2. Set your instance credentials:
   ```env
   SN_INSTANCE_URL=https://devXXXXX.service-now.com
   SN_USERNAME=admin
   SN_PASSWORD=your_pdi_password
   SN_PORTAL_SUFFIX=sp
   ```
3. Install browser binaries and run the tests:
   ```bash
   npx playwright install
   npm run test:e2e        # Headless mode
   npm run test:e2e:ui     # Interactive UI runner
   ```

*Note: Test fixtures automatically seed and tear down necessary test records via the ServiceNow Table API.*

---

## Configuration

Admins can edit settings in **Widget Editor+ → Properties**. See the [configuration guide](CONFIGURATION.md) for system properties, UI scripts, Monaco embedding and user preferences.

---

## AI Disclosure

This project was developed with assistance from OpenAI GPT, Anthropic Claude and Google Gemini.

---

## Licence

Copyright (c) 2026 [TBC Productions](https://tbcproductions.net/widget-editor-plus). Licensed under the [MIT Licence](LICENSE).

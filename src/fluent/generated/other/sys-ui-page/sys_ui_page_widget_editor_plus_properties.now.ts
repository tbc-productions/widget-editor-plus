import { UiPage } from '@servicenow/sdk/core'

UiPage({
    $id: Now.ID['widget-editor-plus-properties-page'],
    category: 'general',
    endpoint: 'widget_editor_plus_properties.do',
    description: 'Settings for Widget Editor+, Assistant+, Code Search+ and Export Markdown+.',
    html: `<?xml version="1.0" encoding="utf-8" ?>
<j:jelly trim="false" xmlns:j="jelly:core" xmlns:g="glide">
  <g:requires name="scripts/snc-code-editor/monaco.bundle.min.jsx" params="sysparm_substitute=false" />
  <g:requires name="monaco_plus_bootstrap.jsdbx" params="sysparm_substitute=false" />
  <g:requires name="we_history_sync.jsdbx" params="sysparm_substitute=false" />
  <link rel="stylesheet" href="/styles/retina_icons/retina_icons.css" />
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html {
      font-size: 16px;
    }
    body {
      margin: 0;
      padding: 0 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: var(--now-global-font-size--md, 14px);
      line-height: 1.45;
      background: rgb(var(--now-color_background--secondary, 246, 247, 249));
      color: rgb(var(--now-color_text--primary, 22, 27, 28));
      -webkit-font-smoothing: antialiased;
    }

    /* App Shell */
    .wep-shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: rgb(var(--now-color_background--secondary, 246, 247, 249));
    }

    /* Suite Header Bar */
    .dc-header {
        position: sticky;
        top: 0;
        background: rgb(var(--now-color_chrome--brand-5,var(--now-color--primary-0,221,237,233)));
        flex-shrink: 0;
        z-index: 10;
        margin: 0;
    }
    .dc-header-row {
        padding: 0.75rem 1.25rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }
    .dc-title {
        font-size: var(--now-font-size--lg, 18px);
        font-weight: 600;
        color: rgb(var(--now-color--neutral-0, var(--now-color_text--primary, 38, 50, 56)));
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .dc-title { margin: 0; line-height: inherit; }

    /* Header Search and Status */
    .wep-header-right {
        display: flex;
        flex: 1;
        gap: 0.5rem;
        margin: 0 auto;
        justify-content: center;
        align-items: center;
    }

    .wep-search-group {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
        max-width: 38rem;
    }

    .wep-search { width: 100%; }

    .wep-search-actions {
        display: flex;
        align-items: center;
        gap: 0.2rem;
    }


    .wep-search::-webkit-search-cancel-button { -webkit-appearance: none; }

    /* Status Pill */
    .wep-header-status-pill {
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      background: rgba(var(--now-color_background--primary, 255, 255, 255), 0.75);
      border: 1px solid rgba(var(--now-color_border--secondary, 205, 212, 217), 0.6);
      color: rgb(var(--now-color_text--secondary, 91, 101, 111));
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .wep-header-status-pill.success {
      background: rgb(var(--now-color_alert--positive-0, 201, 224, 202));
      color: rgb(var(--now-color_alert--positive-5, 15, 52, 17));
      border-color: rgb(var(--now-color_alert--positive-2, 81, 174, 0));
    }
    .wep-header-status-pill.error {
      background: rgb(var(--now-color_alert--critical-0, 255, 235, 235));
      color: rgb(var(--now-color_alert--critical-5, 102, 20, 30));
      border-color: rgb(var(--now-color_alert--critical-2, 255, 51, 75));
    }
    .wep-header-status-pill:empty {
      display: none !important;
    }

    mark {
      background-color: rgba(var(--now-color--primary-1, 30, 133, 109), 0.22);
      color: rgb(var(--now-color_text--primary, 22, 27, 28));
      font-weight: 600;
      padding: 0 0.15rem;
      border-radius: 2px;
    }

    /* Main App Body */
    .container-fluid.wep-app {
      max-width: 1240px;
      margin: 0 auto;
      padding: 1.25rem 1.25rem 48px;
      color: rgb(var(--now-color_text--primary, 22, 27, 28));
      background: transparent;
      width: 100%;
    }

    /* Native feature buttons, arranged horizontally. */
    .wep-nav-container { margin-bottom: 1.25rem; }
    .wep-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .wep-nav li { display: flex; min-width: 0; max-width: 100%; }
    .wep-feature-pill {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .we-sidebar-item-label {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .we-type-count-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.375rem;
        height: 1.375rem;
        padding: 0 0.4rem;
        font-size: 0.75rem;
        font-weight: 700;
        border-radius: 9999px;
        background: rgba(var(--now-color--primary-1, 0, 118, 204), 0.15);
        color: rgb(var(--now-color--primary-2, 0, 118, 204));
    }

    /* Sections and Section Headings */
    .wep-section {
      margin: 0 0 2.5rem;
      scroll-margin-top: calc(var(--wep-header-height, 0px) + 16px);
    }
    .wep-feature-heading {
      margin: 0 0 1rem;
      color: rgb(var(--now-color_text--primary, 29, 29, 29));
      font-size: var(--now-font-size--lg, 18px);
      font-weight: 600;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .wep-section-count {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      background: rgba(var(--now-color--primary-1, 30, 133, 109), 0.12);
      color: rgb(var(--now-color--primary-2, 23, 100, 82));
    }

    /* Property Cards */
    .wep-card {
      border: 1px solid rgb(var(--now-color_border--secondary, var(--now-color_divider--secondary, 228, 230, 235))) !important;
      border-radius: var(--now-form-field--border-radius, 6px) !important;
      background: rgb(var(--now-color_background--primary, 255, 255, 255)) !important;
      margin-bottom: 1rem !important;
      overflow: visible;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .wep-card .panel-heading {
      border-radius: var(--now-form-field--border-radius, 6px) var(--now-form-field--border-radius, 6px) 0 0;
      border-bottom: 1px solid rgb(var(--now-color_border--secondary, var(--now-color_divider--secondary, 228, 230, 235))) !important;
      background: rgb(var(--now-color_background--secondary, 246, 248, 249)) !important;
      color: rgb(var(--now-color_text--primary, 22, 27, 28)) !important;
      padding: 0.625rem 1rem !important;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .wep-card .panel-title {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: 0.8125rem !important;
      font-weight: 600 !important;
      color: rgb(var(--now-color_text--primary, 22, 27, 28)) !important;
      letter-spacing: -0.01em;
      margin: 0 !important;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      overflow-wrap: anywhere;
      min-width: 0;
    }
    .wep-type-tag {
      font-family: inherit;
      font-size: 0.6875rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .wep-type-tag {
      background: rgb(var(--now-color_background--tertiary, 243, 244, 246));
      color: rgb(var(--now-color_text--secondary, 96, 100, 108));
      border: 1px solid rgb(var(--now-color_border--secondary, 205, 212, 217));
    }
    .wep-updated-pill {
      margin-left: auto;
      font-weight: 400;
    }
    .wep-updated-cell { font-size: 0.75rem; white-space: nowrap; }
    .wep-updated-pill[hidden] { display: none !important; }
    .wep-card .panel-body {
      padding: 1rem !important;
    }
    .wep-description {
      font-size: 0.8125rem;
      line-height: 1.5;
      color: rgb(var(--now-color_text--secondary, 91, 101, 111));
      margin: 0 0 0.75rem;
    }

    /* Shared table headers stick to the page viewport within each table. */
    .wep-card .wep-properties-table { border-collapse: separate; border-spacing: 0; }
    .wep-card .wep-properties-table thead tr th {
      position: sticky;
      top: var(--wep-header-height, 0px);
      z-index: 5;
      padding: 10px;
      text-align: left;
      vertical-align: middle;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.45;
      color: rgb(var(--now-color_text--primary, 22, 27, 28));
      background: rgb(var(--now-color_background--secondary, 246, 248, 249));
      border: 0;
      box-shadow: inset 0 -1px rgb(var(--now-color_border--secondary, 205, 212, 217));
    }

    /* Form Inputs */
    .wep-config-table { width:100%; table-layout:fixed; }
    .wep-config-table td { vertical-align:top !important; overflow-wrap:anywhere; }
    .wep-config-table th:first-child { width:22%; }
    .wep-assistant-config-table th:nth-child(2) { width:20%; }
    .wep-config-table th:nth-last-child(2) { width:130px; }
    .wep-config-table th:last-child { width:120px; }
    .wep-config-table .wep-status { display:block; margin-top:6px; }
    .wep-properties-table .btn + .btn { margin-left:4px; }
    .wep-config-table textarea { resize:vertical; }
    select.wep-value { max-width: 14rem; }
    textarea.wep-value { min-height:76px; max-height:50vh; overflow-y:auto; resize:vertical; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; font-size:0.8125rem; line-height:1.45; }
    textarea.wep-value.wep-plain-textarea { min-height:0; max-height:none; overflow-y:hidden; }
    textarea.wep-json-fallback[hidden] { display:none !important; }
    .wep-monaco {
      height: 76px;
      max-height: 50vh;
      border: 1px solid rgb(var(--now-color_border--secondary, 205, 212, 217));
      border-radius: var(--now-form-field--border-radius, 4px);
      overflow: hidden;
    }

    /* Buttons */
    .wep-character-count { display: block; text-align: right; margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .wep-actions button[hidden] { display: none !important; }
    .wep-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 0.875rem;
    }

    /* Status Notifications */
    .wep-status {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 500;
      color: rgb(var(--now-color_text--secondary, 91, 101, 111));
    }
    .wep-status.dirty {
      color: rgb(var(--now-alert--warning--color, 180, 83, 9));
      font-weight: 600;
    }
    .wep-status.success {
      color: rgb(var(--now-alert--positive--color, var(--now-color_alert--positive-3, 22, 122, 66)));
      font-weight: 600;
    }
    .wep-status.error {
      color: rgb(var(--now-alert--critical--color, var(--now-color_alert--critical-3, 168, 30, 30)));
      font-weight: 600;
    }

    /* Compact alphabetical table hierarchy */
    .wep-hierarchy-toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .wep-tree[hidden] { display: none; }
    .wep-rule-scroll { overflow: visible; }
    .wep-rule-table { width: 100%; table-layout: fixed; font-size: 13px; }
    .wep-rule-table th:nth-child(2) { width: 24%; }
    .wep-rule-table th:nth-child(3) { width: 112px; }
    .wep-rule-table th:last-child { width: 120px; }
    .wep-rule-table td { overflow-wrap: anywhere; }
    .wep-updated-cell time span { white-space: nowrap; }
    .wep-rule-table td {
      padding: 7px 10px;
      border-bottom: 1px solid rgb(var(--now-color_border--secondary, 205, 212, 217));
      vertical-align: middle;
    }
    .wep-rule-name { display: grid; grid-template-columns: 38px minmax(0, 1fr); align-items: center; column-gap: 16px; }
    .wep-rule-label { grid-column: 2; grid-row: 1; min-width: 0; }
    .wep-rule-name code { display: block; padding: 0; background: transparent; color: inherit; font-size: 11px; }
    .wep-rule-reference { font-family: monospace; font-size: 12px; }
    .wep-rule-actions { white-space: nowrap; }
    .wep-empty {
      padding: 1.5rem;
      text-align: center;
      color: rgb(var(--now-color_text--secondary, 91, 101, 111));
      font-style: italic;
    }

    /* Empty Search State */
    .wep-empty-state {
      padding: 3rem 1.5rem;
      text-align: center;
      background: rgb(var(--now-color_background--primary, 255, 255, 255));
      border: 1px dashed rgb(var(--now-color_border--secondary, 205, 212, 217));
      border-radius: var(--now-form-field--border-radius, 6px);
      margin: 1.5rem 0;
    }
    .wep-empty-icon {
      font-size: 2rem;
      color: rgb(var(--now-color_text--secondary, 126, 133, 146));
      margin-bottom: 0.75rem;
      display: block;
    }
    .wep-empty-state h3 {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0 0 0.5rem;
      color: rgb(var(--now-color_text--primary, 22, 27, 28));
    }
    .wep-empty-state p {
      font-size: 0.8125rem;
      margin: 0;
      color: rgb(var(--now-color_text--secondary, 91, 101, 111));
    }

    @media (max-width: 767px) {
      .dc-header-row.wep-header-row {
        flex-direction: column;
        align-items: stretch;
      }
      .wep-header-right {
        width: 100%;
        flex-wrap: wrap;
        max-width: 100%;
        justify-content: stretch;
      }
      .wep-search-group {
        max-width: 100%;
      }
    }
  </style>
  <div class="wep-shell">
    <header id="wep-header" class="dc-header wep-header">
      <div class="dc-header-row wep-header-row">
        <div class="we-app-drawer-heading">
          <we-app-drawer current-app="properties" credit-available="\${gs.hasRole('admin')}"></we-app-drawer>
          <h1 class="dc-title">Widget Editor+ Properties</h1>
        </div>
        <div class="wep-header-right">
          <div class="wep-search-group">
            <input id="wep-search" class="form-control wep-search" type="search" placeholder="Search properties..." aria-label="Search properties" />
            <div class="wep-search-actions">
              <button type="button" class="btn btn-icon wep-search-clear" id="wep-search-clear" title="Clear search" aria-label="Clear search" style="display:none">
                <span class="icon-error-circle" aria-hidden="true"></span>
              </button>
            </div>
          </div>
          <div id="wep-message" class="wep-status wep-header-status-pill" role="status" style="display:none"></div>
        </div>
      </div>
    </header>
    <main class="container-fluid wep-app">
      <div class="wep-nav-container">
        <ul id="wep-nav" class="wep-nav" aria-label="Features"></ul>
      </div>
      <div id="wep-empty-search" class="wep-empty-state" style="display:none">
        <span class="icon-search wep-empty-icon" aria-hidden="true"></span>
        <h3>No matching properties found</h3>
        <p>Try adjusting your search query.</p>
      </div>
      <div id="wep-sections"></div>
    </main>
  </div>
</j:jelly>`,
    clientScript: `${Now.include('./widget_editor_app_drawer.js')}
${Now.include('./widget_editor_plus_properties.client.js')}`,
})

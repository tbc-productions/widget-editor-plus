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
    .wep-section:last-child {
      min-height: calc(100vh - var(--wep-header-height, 0px) - 16px);
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
    [hidden] { display: none !important; }
    .wep-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; min-height: 60vh; color: rgba(var(--now-color_text--primary, 29, 29, 29), 0.65); font-size: var(--now-font-size--lg, 1.25rem); }
    #wep-loading .stroke-element { fill: none; stroke: url(#wep-loading-gradient); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
    #wep-loading .fill-element { fill: url(#wep-loading-gradient); }
    #wep-loading .container { animation: wep-fadeOut 3s ease-in-out infinite; }
    #wep-loading .frame { animation: wep-drawFrame 3s ease-in-out infinite; stroke-dasharray: 320; stroke-dashoffset: 320; }
    #wep-loading .header { animation: wep-dropHeader 3s ease-in-out infinite; }
    #wep-loading .block1 { animation: wep-popBlock1 3s ease-in-out infinite; transform-origin: 32.5px 60px; }
    #wep-loading .block2 { animation: wep-popBlock2 3s ease-in-out infinite; transform-origin: 66px 47.5px; }
    #wep-loading .block3 { animation: wep-popBlock3 3s ease-in-out infinite; transform-origin: 66px 71px; }
    @keyframes wep-drawFrame { 0%, 5% { stroke-dashoffset: 320; } 30%, 90% { stroke-dashoffset: 0; } 90.1%, 100% { stroke-dashoffset: 320; } }
    @keyframes wep-dropHeader { 0%, 20% { opacity: 0; transform: translateY(-10px); } 35%, 90% { opacity: 1; transform: translateY(0); } 90.1%, 100% { opacity: 0; transform: translateY(-10px); } }
    @keyframes wep-popBlock1 { 0%, 30% { opacity: 0; transform: scale(0.5); } 45%, 90% { opacity: 1; transform: scale(1); } 90.1%, 100% { opacity: 0; transform: scale(0.5); } }
    @keyframes wep-popBlock2 { 0%, 40% { opacity: 0; transform: scale(0.5); } 55%, 90% { opacity: 1; transform: scale(1); } 90.1%, 100% { opacity: 0; transform: scale(0.5); } }
    @keyframes wep-popBlock3 { 0%, 50% { opacity: 0; transform: scale(0.5); } 65%, 90% { opacity: 1; transform: scale(1); } 90.1%, 100% { opacity: 0; transform: scale(0.5); } }
    @keyframes wep-fadeOut { 0%, 80% { opacity: 1; } 90%, 100% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { #wep-loading .container, #wep-loading .frame, #wep-loading .header, #wep-loading .block1, #wep-loading .block2, #wep-loading .block3 { animation: none; stroke-dashoffset: 0; } }
    .wep-maintenance .panel-heading .panel-title { font-family: inherit !important; font-size: 0.875rem !important; letter-spacing: normal; }
    .wep-maintenance fieldset { border: 0; padding: 0; margin: 1rem 0; min-width: 0; }
    .wep-maintenance label { display: block; margin: 0.75rem 0; font-weight: 600; }
    .wep-maintenance .input-group-checkbox input.checkbox ~ label.checkbox-label { font-weight: 600; }
    .wep-maintenance .input-group-checkbox { display: flex; margin: 0.75rem 0; }
    .wep-maintenance summary.panel-heading { cursor: pointer; list-style: none; justify-content: flex-start; }
    .wep-maintenance summary.panel-heading::-webkit-details-marker { display: none; }
    .wep-maintenance .wep-accordion-chevron { display: inline-block; }
    .wep-maintenance details[open] .wep-accordion-chevron { transform: rotate(90deg); }
    .wep-maintenance-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin: 1rem 0; }
    .wep-maintenance-actions p { margin: 0; font-size: 0.8125rem; }
    .wep-maintenance-actions .alert { flex-basis: 100%; }
    .wep-maintenance-progress { max-width: 24rem; height: 8px; margin-top: 0.75rem; }
    .wep-maintenance-progress .progress-bar { width: 100%; height: 100%; }
    .wep-maintenance-list { max-height: 25rem; overflow: auto; margin: 1rem 0; border: 1px solid rgb(var(--now-color_border--secondary, 205, 212, 217)); border-radius: var(--now-form-field--border-radius, 4px); }
    .wep-maintenance .wep-records-table { width: 100%; min-width: 44rem; table-layout: fixed; font-size: 0.8125rem; margin: 0; }
    .wep-records-table th:first-child { width: 32%; }
    .wep-records-table th:nth-child(2) { width: 26%; }
    .wep-records-table th:nth-child(3) { width: 28%; }
    .wep-selection-table th:first-child { width: 44px; }
    .wep-selection-table th:nth-child(2) { width: 30%; }
    .wep-selection-table th:nth-child(3) { width: 24%; }
    .wep-selection-table th:nth-child(4) { width: 30%; }
    .wep-records-table .input-group-checkbox { margin: 0; }
    .wep-records-table td { text-align: left; vertical-align: top; padding: 10px; overflow-wrap: anywhere; border-bottom: 1px solid rgb(var(--now-color_border--secondary, 205, 212, 217)); }
    .wep-maintenance-list .wep-properties-table thead tr th { top: 0; }
    .wep-maintenance-feedback { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-top: 0.875rem; }
    .wep-maintenance-feedback p { margin: 0; font-size: 0.8125rem; }
    .wep-maintenance-feedback .alert { width: 100%; }
    .wep-maintenance-warning { font-size: 0.8125rem; margin: 1rem 0; }
    .wep-maintenance-warning p { margin: 0.5rem 0; }
    .wep-maintenance .form-control { max-width: 24rem; }
    .wep-maintenance input[type="file"] { height: auto; padding: 0; }
    .wep-maintenance input[type="file"]::file-selector-button {
      padding: 0.5rem 0.75rem;
      margin-right: 0.75rem;
      border: 0;
      border-right: 1px solid rgb(var(--now-color_border--secondary, 205, 212, 217));
      background: rgb(var(--now-color_background--secondary, 246, 247, 249));
      color: inherit;
      font: inherit;
    }
    .wep-maintenance .btn, .wep-maintenance summary { min-height: 44px; }
    .wep-maintenance :focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .wep-maintenance [hidden] { display: none !important; }

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
      ${Now.include('./widget_editor_properties_loading.html')}
      <div id="wep-content" hidden="hidden">
      <div class="wep-nav-container">
        <ul id="wep-nav" class="wep-nav" aria-label="Features"></ul>
      </div>
      <div id="wep-empty-search" class="wep-empty-state" style="display:none">
        <span class="icon-search wep-empty-icon" aria-hidden="true"></span>
        <h3>No matching properties found</h3>
        <p>Try adjusting your search query.</p>
      </div>
      <div id="wep-sections"></div>
      <section id="wep-maintenance" class="wep-section wep-maintenance" data-feature="Backup and uninstall" aria-labelledby="wep-maintenance-title">
        <h2 id="wep-maintenance-title" class="wep-feature-heading">Backup and uninstall</h2>
        <details id="wep-export-details" class="panel panel-default wep-card" data-search="backup and uninstall export preferences all users shared defaults clone upgrade xml">
          <summary class="panel-heading"><span class="glyphicon glyphicon-chevron-right wep-accordion-chevron" aria-hidden="true"></span><span class="panel-title">Export preferences</span></summary>
          <div class="panel-body">
            <p class="wep-description">Export Widget Editor+ apps preferences for all users, including shared defaults.</p>
            <div class="wep-maintenance-actions">
              <button id="wep-export-preferences" type="button" class="btn btn-default">Export all users’ preferences</button>
              <p id="wep-export-status" role="status" aria-live="polite" tabindex="-1" hidden="hidden"></p>
            </div>
          </div>
        </details>
        <details id="wep-restore-details" class="panel panel-default wep-card" data-search="backup and uninstall restore import preferences all users clone upgrade xml">
          <summary class="panel-heading"><span class="glyphicon glyphicon-chevron-right wep-accordion-chevron" aria-hidden="true"></span><span class="panel-title">Restore preferences</span></summary>
          <div class="panel-body">
            <p class="wep-description">Matches preferences by <code>sys_user.sys_id</code>.</p>
            <label for="wep-preference-file">Preferences XML file (up to 10 MiB)</label>
            <input id="wep-preference-file" class="form-control" type="file" accept=".xml,application/xml,text/xml" />
            <div class="wep-maintenance-actions"><button id="wep-review-import" type="button" class="btn btn-default" disabled="disabled">Review import</button></div>
            <div id="wep-import-preview" hidden="hidden">
              <p id="wep-import-count"></p>
              <div class="input-group-checkbox"><input id="wep-import-confirm" class="checkbox" type="checkbox" /><label class="checkbox-label" for="wep-import-confirm">Overwrite matching preferences</label></div>
              <button id="wep-import-preferences" type="button" class="btn btn-default" disabled="disabled">Restore preferences</button>
            </div>
            <div class="wep-maintenance-feedback" hidden="hidden">
              <button id="wep-restore-cancel" type="button" class="btn btn-default" hidden="hidden">Stop import</button>
              <p id="wep-restore-status" role="status" aria-live="polite" tabindex="-1" hidden="hidden"></p>
            </div>
          </div>
        </details>
        <details id="wep-uninstall-details" class="panel panel-default wep-card" data-search="backup and uninstall remove delete records preferences all users xml">
          <summary class="panel-heading"><span class="glyphicon glyphicon-chevron-right wep-accordion-chevron" aria-hidden="true"></span><span class="panel-title">Uninstall Widget Editor+ apps</span></summary>
          <div class="panel-body">
          <div class="alert alert-warning" role="alert">
            <p>Permanently remove Widget Editor+ apps (including local changes). Elevated&#160;<code>security_admin</code>&#160;is required.</p>
          </div>
          <fieldset id="wep-uninstall-options" disabled="disabled">
            <legend class="sr-only">Uninstall options</legend>
            <div class="input-group-checkbox"><input id="wep-delete-preferences" class="checkbox" type="checkbox" /><label class="checkbox-label" for="wep-delete-preferences">Delete all users’ app preferences</label></div>
            <div class="input-group-checkbox"><input id="wep-backup-required" class="checkbox" type="checkbox" checked="checked" /><label class="checkbox-label" for="wep-backup-required">Back up records and preferences first (recommended)</label></div>
            <button id="wep-review-uninstall" type="button" class="btn btn-default" disabled="disabled">Review records to remove</button>
          </fieldset>
          <div id="wep-uninstall-preview" hidden="hidden">
            <p id="wep-uninstall-count"></p>
            <div class="wep-maintenance-list" tabindex="0" role="region" aria-label="Records to remove">
              <table class="table wep-properties-table wep-records-table wep-selection-table">
                <caption class="sr-only">All records that will be removed</caption>
                <thead><tr><th scope="col"><div class="input-group-checkbox"><input id="wep-select-all-records" class="checkbox" type="checkbox" checked="checked" /><label class="checkbox-label" for="wep-select-all-records"><span class="sr-only">Select all records for removal</span></label></div></th><th scope="col">Record</th><th scope="col">Table</th><th scope="col">Sys ID</th><th scope="col">User</th></tr></thead>
                <tbody id="wep-uninstall-records"></tbody>
              </table>
            </div>
            <p id="wep-preserved-dependencies" class="wep-description" hidden="hidden">Required parent records are also preserved.</p>
            <div id="wep-uninstall-warnings" class="alert alert-warning wep-maintenance-warning" role="alert" hidden="hidden">
              <p id="wep-uninstall-blocked"></p>
            </div>
            <div class="wep-maintenance-actions">
              <button id="wep-download-backup" type="button" class="btn btn-default">Download backup</button>
              <p id="wep-backup-status" role="status" aria-live="polite" tabindex="-1" hidden="hidden"></p>
            </div>
            <div id="wep-backup-saved-label" class="input-group-checkbox" hidden="hidden"><input id="wep-backup-saved" class="checkbox" type="checkbox" /><label class="checkbox-label" for="wep-backup-saved">I have saved the backup</label></div>
            <label for="wep-uninstall-confirmation">Type <code>UNINSTALL</code> to confirm</label>
            <input id="wep-uninstall-confirmation" class="form-control" type="text" autocomplete="off" spellcheck="false" aria-describedby="wep-uninstall-count wep-uninstall-blocked" disabled="disabled" />
            <div class="wep-maintenance-actions"><button id="wep-uninstall" type="button" class="btn btn-danger" disabled="disabled">Uninstall Widget Editor+ apps</button></div>
          </div>
            <div class="wep-maintenance-feedback" hidden="hidden">
              <p id="wep-uninstall-status" role="status" aria-live="polite" tabindex="-1" hidden="hidden"></p>
            </div>
            <div id="wep-uninstall-progress" class="progress wep-maintenance-progress" hidden="hidden">
              <div class="progress-bar progress-bar-striped active" role="progressbar" aria-label="Uninstalling Widget Editor+ apps"></div>
            </div>
          </div>
        </details>
      </section>
      </div>
    </main>
  </div>
</j:jelly>`,
    clientScript: `${Now.include('./widget_editor_app_drawer.js')}
${Now.include('./widget_editor_plus_properties.client.js')}
${Now.include('./widget_editor_maintenance.client.js')}`,
})

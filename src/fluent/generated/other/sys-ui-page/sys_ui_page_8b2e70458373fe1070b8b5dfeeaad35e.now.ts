import { UiPage } from '@servicenow/sdk/core'

UiPage({
    $id: Now.ID['8b2e70458373fe1070b8b5dfeeaad35e'],
    category: 'htmleditor',
    endpoint: 'widget_editor.do',
    description: `Full-featured editor for Service Portal widgets. Supports editing of HTML template, CSS, server script, client script, link function, and option schema in a multi-pane layout. Includes support for editing script includes, Angular providers, and AngularJS templates.

Features version history, side-by-side diff comparison, related lists, and user preferences. Enforces read-only mode for protected widgets and displays volatility risk warnings for files subject to future platform updates.`,
    html: Now.include('./widget_editor_plus.html'),
    clientScript: `${Now.include('./widget_editor_app_drawer.js')}
${Now.include('./widget_editor_plus.client.js')}`,
    processingScript: `// Server-side logic is handled by the WidgetEditorAjax Script Include (AbstractAjaxProcessor).
// Client calls are made via GlideAjax from client script.
`,
})

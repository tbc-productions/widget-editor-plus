import { UiPage } from '@servicenow/sdk/core'

export const widgetEditorCodeSearchUiPage = UiPage({
    $id: Now.ID['widget-editor-code-search-ui-page'],
    category: 'htmleditor',
    endpoint: 'widget_editor_code_search.do',
    description: 'Advanced cross-table code search for Widget Editor+, with per-table runtime and saved encoded-query filters.',
    html: Now.include('./widget_editor_code_search.html'),
    clientScript: `${Now.include('./widget_editor_app_drawer.js')}
${Now.include('./widget_editor_code_search.client.js')}`,
    processingScript: `// Server-side work is handled by WidgetEditorCodeSearchAjax via GlideAjax.`,
})

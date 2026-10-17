import { UiPage } from '@servicenow/sdk/core'

export const widgetEditorAssistantUiPage = UiPage({
    $id: Now.ID['widget-editor-assistant-ui-page'],
    category: 'htmleditor',
    endpoint: 'widget_editor_assistant.do',
    description:
        'Builds a redacted XML export of a primary record plus its related components (script includes, Angular templates/providers, and any manually added records) for use as AI tool context. Standalone page; can be launched with a primary record pre-selected from Widget Editor+.',
    html: Now.include('./widget_editor_assistant.html'),
    clientScript: `${Now.include('./widget_editor_app_drawer.js')}
${Now.include('./widget_editor_assistant.client.js')}`,
    processingScript: `// This page is fully client-rendered; all data access goes through the
// WidgetEditorAssistantAjax client-callable script include via GlideAjax.`,
})

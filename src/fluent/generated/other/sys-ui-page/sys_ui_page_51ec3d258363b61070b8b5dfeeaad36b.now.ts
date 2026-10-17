import { UiPage } from '@servicenow/sdk/core'

UiPage({
    $id: Now.ID['51ec3d258363b61070b8b5dfeeaad36b'],
    category: 'htmleditor',
    endpoint: 'widget_editor_diff.do',
    description:
        'Side-by-side diff viewer for comparing two versions of a Service Portal widget. Displays field-level differences across all widget fields and supports reverting.',
    html: Now.include('./widget_editor_compare.html'),
    clientScript: `${Now.include('./widget_editor_app_drawer.js')}
${Now.include('./widget_editor_compare.client.js')}`,
    processingScript: `// Server-side logic lives in the WidgetEditorAjax Script Include, called via GlideAjax.
`,
})

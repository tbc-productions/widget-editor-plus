import { UiPage } from '@servicenow/sdk/core'

UiPage({
    $id: '9c5bf170283e4d6394aa639c79936587',
    category: 'htmleditor',
    endpoint: 'widget_editor_credit.do',
    description: 'Read-only historical script attribution for administrators.',
    html: Now.include('./widget_editor_credit.html'),
    clientScript: `${Now.include('./widget_editor_app_drawer.js')}
${Now.include('./widget_editor_credit.client.js')}`,
    processingScript: "if (!gs.hasRole('admin')) { response.setStatus(403); }",
})

import { UiPage } from '@servicenow/sdk/core'

UiPage({
    $id: '9c5bf170283e4d6394aa639c79936587',
    category: 'htmleditor',
    endpoint: 'credit_plus.do',
    description: 'Read-only historical script attribution for administrators.',
    html: Now.include('./credit_plus.html'),
    clientScript: Now.include('./credit_plus.client.js'),
    processingScript: "if (!gs.hasRole('admin')) { response.setStatus(403); }",
})

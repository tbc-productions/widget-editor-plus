import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['widget-editor-credit-worker'],
    table: 'sys_ui_script',
    data: {
        active: 'true', global: 'false', name: 'widget_editor_credit_worker', ui_type: '0',
        description: 'Credit+ browser worker: matches authorised Customer Update snapshots without blocking the UI.',
        script: Now.include('../../server-development/script-include/sys_script_include_widget_editor_credit_engine.server.js'),
    },
})

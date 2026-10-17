import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['widget-editor-code-analysis'],
    table: 'sys_ui_script',
    data: {
        active: 'true', global: 'false', name: 'widget_editor_code_analysis', ui_type: '0',
        description: 'Widget Editor+ and Assistant shared browser worker for code dependency analysis.',
        script: Now.include('./widget_editor_code_analysis.js'),
    },
})

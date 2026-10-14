import { ScriptInclude } from '@servicenow/sdk/core'

ScriptInclude({
    $id: Now.ID['credit-plus-script-include'],
    name: 'WidgetEditorCreditAjax',
    apiName: 'global.WidgetEditorCreditAjax',
    description: 'Admin-only metadata, launch validation and Compare+ snapshots for Credit+.',
    script: Now.include('./sys_script_include_widget_editor_credit_ajax.server.js'),
    accessibleFrom: 'package_private',
    clientCallable: true,
    mobileCallable: false,
    sandboxCallable: false,
    active: true,
})

import { ScriptInclude } from '@servicenow/sdk/core'

ScriptInclude({
    $id: Now.ID['credit-plus-script-include'],
    name: 'WidgetEditorCredit',
    apiName: 'global.WidgetEditorCredit',
    description: 'Admin-only, read-only historical script attribution.',
    script: Now.include('./sys_script_include_widget_editor_credit.server.js'),
    accessibleFrom: 'package_private',
    clientCallable: true,
    mobileCallable: false,
    sandboxCallable: false,
    active: true,
})

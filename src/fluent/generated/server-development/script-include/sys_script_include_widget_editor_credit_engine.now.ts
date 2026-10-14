import { ScriptInclude } from '@servicenow/sdk/core'

ScriptInclude({
    $id: Now.ID['widget-editor-credit-engine'],
    name: 'WidgetEditorCreditEngine',
    apiName: 'global.WidgetEditorCreditEngine',
    description: 'Pure Credit+ matching shared with the browser worker; no record access.',
    script: Now.include('./sys_script_include_widget_editor_credit_engine.server.js'),
    accessibleFrom: 'package_private',
    clientCallable: false,
    active: true,
})

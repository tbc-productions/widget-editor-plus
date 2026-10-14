import { ScriptInclude } from '@servicenow/sdk/core'

ScriptInclude({
    $id: Now.ID['cac17b058363f21070b8b5dfeeaad361'],
    name: 'WidgetEditorAjax',
    script: Now.include('./sys_script_include_widget_editor_ajax.server.js'),
    description:
        'Helper functions for the Widget Editor (widget_editor) and Widget Editor Diff (widget_editor_diff) UI pages.',
    apiName: 'global.WidgetEditorAjax',
    clientCallable: true,
    mobileCallable: false,
    sandboxCallable: false,
    active: true,
})

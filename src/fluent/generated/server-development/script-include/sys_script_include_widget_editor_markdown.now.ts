import { ScriptInclude } from '@servicenow/sdk/core'

ScriptInclude({
    $id: Now.ID['widget-editor-assistant-markdown-ajax'],
    name: 'WidgetEditorMarkdownAjax',
    apiName: 'global.WidgetEditorMarkdownAjax',
    script: `var WidgetEditorUninstallRecords = ${Now.include('./widget_editor_uninstall_manifest.json')};
${Now.include('./sys_script_include_widget_editor_markdown.server.js')}`,
    description: 'Update set Markdown data and admin-managed grouping rules.',
    clientCallable: true,
    mobileCallable: false,
    sandboxCallable: false,
    active: true,
})

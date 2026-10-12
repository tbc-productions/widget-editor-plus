import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['9996546a8327321070b8b5dfeeaad317'],
    table: 'sys_ui_script',
    data: {
        active: 'true',
        description: `AngularJS ng-directive completions and HTML Monarch tokenizer for Monaco, covering ng-* and ServiceNow SP directives (sp-widget, sp-model, etc.).
Registers as window.MONACO_LANGUAGE_HTML.`,
        global: 'false',
        ignore_in_now_experience: 'false',
        name: 'monaco_language_html',
        script: Now.include('./monaco_language_html.js'),
        ui_type: '0',
        use_scoped_format: 'false',
    },
})

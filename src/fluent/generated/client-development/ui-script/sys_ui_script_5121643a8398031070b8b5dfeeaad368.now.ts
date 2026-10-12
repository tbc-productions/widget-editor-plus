import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['5121643a8398031070b8b5dfeeaad368'],
    $meta: { installMethod: 'first install' },
    table: 'sys_ui_script',
    data: {
        active: 'true',
        description: `Extends the Widget Editor+ Monaco code actions system with custom per-language actions. 

Register custom lightbulb menu actions using the standard Monaco CodeActionProvider API via MONACO_CUSTOM_CODE_ACTIONS.register(language, provider). 

Errors in custom providers are isolated and logged to the console without affecting built-in editor functionality.`,
        global: 'false',
        ignore_in_now_experience: 'false',
        name: 'monaco_custom_code_actions',
        script: Now.include('./monaco_custom_code_actions.js'),
        ui_type: '0',
        use_scoped_format: 'false',
    },
})

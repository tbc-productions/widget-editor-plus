import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['a424391983f7725070b8b5dfeeaad3cc'],
    table: 'sys_ui_script',
    data: {
        active: 'true',
        description:
            'Supports loading enhancements for the Monaco Editor to add IntelliSense, code actions and method signatures.',
        global: 'false',
        ignore_in_now_experience: 'false',
        name: 'monaco_plus_core',
        script: Now.include('./monaco_plus_core.js'),
        ui_type: '0',
        use_scoped_format: 'false',
    },
})

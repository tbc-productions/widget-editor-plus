import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['cd77d062832b321070b8b5dfeeaad3ac'],
    table: 'sys_ui_script',
    data: {
        active: 'true',
        description: `Provides Monaco code actions for JavaScript (Add JSDoc comment with AngularJS type inference) and SCSS (Convert px → rem).
Registers as window.MONACO_CODE_ACTIONS.`,
        global: 'false',
        ignore_in_now_experience: 'false',
        name: 'monaco_code_actions',
        script: Now.include('./monaco_code_actions.js'),
        ui_type: '0',
        use_scoped_format: 'false',
    },
})

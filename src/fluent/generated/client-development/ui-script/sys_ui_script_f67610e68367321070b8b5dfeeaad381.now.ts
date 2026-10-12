import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['f67610e68367321070b8b5dfeeaad381'],
    table: 'sys_ui_script',
    data: {
        active: 'true',
        description: `TypeScript ambient declarations supplementing ServiceNow's server-side completions, adding GlideRecordSecure and the $sp widget API.
Registers as window.MONACO_LANGUAGE_SERVER_DTS.`,
        global: 'false',
        ignore_in_now_experience: 'false',
        name: 'monaco_language_server',
        script: Now.include('./monaco_language_server.js'),
        ui_type: '0',
        use_scoped_format: 'false',
    },
})

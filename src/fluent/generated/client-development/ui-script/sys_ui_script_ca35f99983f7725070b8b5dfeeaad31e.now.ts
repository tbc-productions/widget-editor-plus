import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['ca35f99983f7725070b8b5dfeeaad31e'],
    table: 'sys_ui_script',
    data: {
        active: 'true',
        description:
            'Bootstrap script to be used with monaco_plus_core UI script.',
        global: 'true',
        ignore_in_now_experience: 'false',
        name: 'monaco_plus_bootstrap',
        script: Now.include('./monaco_plus_bootstrap.js'),
        ui_type: '0',
        use_scoped_format: 'false',
    },
})

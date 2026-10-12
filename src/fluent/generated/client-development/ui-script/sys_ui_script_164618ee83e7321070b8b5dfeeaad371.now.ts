import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['164618ee83e7321070b8b5dfeeaad371'],
    table: 'sys_ui_script',
    data: {
        active: 'true',
        description: `TypeScript ambient declarations for ServiceNow client-side APIs — AngularJS, jQuery, GlideForm, GlideUser, GlideAjax, and SP widget globals.
Registers as window.MONACO_LANGUAGE_CLIENT_DTS, plus window.MONACO_LANGUAGE_CLIENT_DI (DI token → type map and api.controller signature builder used by monaco_plus_core for name-based injection typing).`,
        global: 'false',
        ignore_in_now_experience: 'false',
        name: 'monaco_language_client',
        script: Now.include('./monaco_language_client.js'),
        ui_type: '0',
        use_scoped_format: 'false',
    },
})

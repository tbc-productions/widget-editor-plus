import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['widget-editor-code-actions-module'],
    table: 'sys_app_module',
    data: {
        active: true,
        application: '1c00c11047322100ba13a5554ee490f2',
        hint: 'Configure custom code actions',
        link_type: 'DIRECT',
        mobile_title: 'Code Actions',
        mobile_view_name: 'Mobile',
        order: 1477,
        override_menu_roles: true,
        query: 'sys_ui_script.do?sys_id=5121643a8398031070b8b5dfeeaad368',
        require_confirmation: true,
        roles: ['admin'],
        sys_domain: 'global',
        sys_domain_path: '/',
        title: 'Code Actions',
        uncancelable: false,
    },
})

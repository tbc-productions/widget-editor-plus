import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['widget-editor-credit-module'],
    table: 'sys_app_module',
    data: {
        active: true,
        application: '1c00c11047322100ba13a5554ee490f2',
        hint: 'View historical script attribution across update sets',
        link_type: 'DIRECT',
        mobile_title: 'Credit+',
        mobile_view_name: 'Mobile',
        order: 1475,
        override_menu_roles: true,
        query: 'ui_page.do?sys_id=9c5bf170283e4d6394aa639c79936587',
        require_confirmation: true,
        roles: ['admin'],
        sys_domain: 'global',
        sys_domain_path: '/',
        title: 'Credit+',
        uncancelable: false,
    },
})

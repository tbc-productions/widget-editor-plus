import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['widget-editor-properties-module'],
    table: 'sys_app_module',
    data: {
        active: true,
        application: '1c00c11047322100ba13a5554ee490f2',
        hint: 'Edit Widget Editor+ properties by feature',
        link_type: 'DIRECT',
        mobile_title: 'System Properties',
        mobile_view_name: 'Mobile',
        query: 'ui_page.do?sys_id=47cb4ac08e0d4437b5c0a482d8411e30',
        order: 1479,
        override_menu_roles: true,
        require_confirmation: true,
        roles: ['admin'],
        sys_domain: 'global',
        sys_domain_path: '/',
        title: 'Properties',
        uncancelable: false,
    },
})

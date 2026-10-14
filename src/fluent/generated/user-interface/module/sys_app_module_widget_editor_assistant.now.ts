import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['widget-editor-assistant-module'],
    table: 'sys_app_module',
    data: {
        active: true,
        application: '1c00c11047322100ba13a5554ee490f2',
        hint: 'Export XML context bundles for AI tools',
        link_type: 'DIRECT',
        mobile_title: 'AI Assistant',
        mobile_view_name: 'Mobile',
        order: 1476,
        override_menu_roles: true,
        query: 'ui_page.do?sys_id=584ed242cd934914bffa4b0bb3fb2974',
        require_confirmation: true,
        roles: ['sp_admin'],
        sys_domain: 'global',
        sys_domain_path: '/',
        title: 'AI Assistant',
        uncancelable: false,
    },
})

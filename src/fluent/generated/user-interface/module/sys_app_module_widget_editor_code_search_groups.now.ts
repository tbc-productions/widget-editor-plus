import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['widget-editor-code-search-groups-module'],
    table: 'sys_app_module',
    data: {
        active: true,
        application: '1c00c11047322100ba13a5554ee490f2',
        hint: 'Configure code search tables',
        link_type: 'LIST',
        mobile_title: 'Code Search Groups',
        mobile_view_name: 'Mobile',
        name: 'sn_codesearch_search_group',
        order: 1478,
        override_menu_roles: true,
        require_confirmation: true,
        roles: ['admin'],
        sys_domain: 'global',
        sys_domain_path: '/',
        title: 'Code Search Groups',
        uncancelable: false,
    },
})

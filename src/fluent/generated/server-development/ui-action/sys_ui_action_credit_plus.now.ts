import { UiAction } from '@servicenow/sdk/core'

UiAction({
    $id: Now.ID['credit-plus-list-action'],
    table: 'sys_update_xml',
    name: 'Credit+',
    actionName: 'credit_plus_list',
    list: { showContextMenu: true },
    client: { isClient: true, isUi11Compatible: true, onClick: 'openCreditPlus()' },
    condition: "gs.hasRole('admin')",
    roles: ['admin'],
    isolateScript: false,
    showInsert: false,
    showUpdate: true,
    script: Now.include('./credit_plus.client.js'),
})

// Retire the form link installed by the earlier Credit+ preview.
UiAction({
    $id: '28b873b73b36441ab6175ebeacffaab9',
    table: 'sys_update_version',
    name: 'Credit+',
    actionName: 'credit_plus_form',
    active: false,
    condition: 'false',
    showInsert: false,
    showUpdate: false,
    script: '',
})

import { Acl } from '@servicenow/sdk/core'

Acl({
    $id: Now.ID['credit-plus-ui-page-acl'],
    localOrExisting: 'Existing',
    type: 'ui_page',
    operation: 'read',
    roles: ['admin'],
    name: 'credit_plus',
})

Acl({
    $id: Now.ID['credit-plus-script-include-acl'],
    localOrExisting: 'Existing',
    type: 'client_callable_script_include',
    operation: 'execute',
    roles: ['admin'],
    name: 'WidgetEditorCredit',
})

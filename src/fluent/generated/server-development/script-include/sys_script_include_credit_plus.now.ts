import { ScriptInclude } from '@servicenow/sdk/core'

ScriptInclude({
    $id: Now.ID['credit-plus-script-include'],
    name: 'CreditPlus',
    apiName: 'global.CreditPlus',
    description: 'Admin-only, read-only historical script attribution.',
    script: Now.include('./credit_plus.server.js'),
    accessibleFrom: 'package_private',
    clientCallable: true,
    mobileCallable: false,
    sandboxCallable: false,
    active: true,
})

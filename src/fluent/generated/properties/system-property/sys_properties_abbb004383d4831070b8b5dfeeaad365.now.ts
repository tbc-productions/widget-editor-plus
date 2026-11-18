import { Property } from '@servicenow/sdk/core'

export const widgetRelatedListExclusionsProperty = Property({
    $id: Now.ID['abbb004383d4831070b8b5dfeeaad365'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.widget.related_list_exclusions',
    value: '',
    description:
        'Excludes Widget Editor+ related lists using a comma-separated list of sys_ui_related_list_entry.related_list values.',
    ignoreCache: true,
    roles: {
        read: ['sp_admin'],
    },
})

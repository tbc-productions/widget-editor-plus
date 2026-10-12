import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['f9b36a6b0a89408580516b62837b5cc4'],
    $meta: { installMethod: 'first install' },
    table: 'sys_ui_script',
    data: {
        active: 'true',
        description: `Keeps the Next Experience History entry for a Widget Editor+ UI page accurate.

The shell records one sys_ui_navigator_history row per navigation using whatever the iframe title was when the iframe finished loading, and it only ever writes a flat title. This script waits for that write, then patches the row's title/description via the Table API and pushes the corrected item into the shell's in-memory History menu over the historySync BroadcastChannel so the dropdown updates without a reload.

Usage: window.WE_HISTORY_SYNC.set({ title, description, match, url })`,
        global: 'false',
        ignore_in_now_experience: 'false',
        name: 'we_history_sync',
        script: Now.include('./we_history_sync.js'),
        ui_type: '0',
        use_scoped_format: 'false',
    },
})

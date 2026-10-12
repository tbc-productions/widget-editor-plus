import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['widget-editor-xml-export'],
    table: 'sys_ui_script',
    data: {
        active: true,
        global: false,
        name: 'widget_editor_xml_export',
        description:
            'Shared XML field comparison for Compare+ and the Assistant.',
        script: Now.include('./widget_editor_xml_export.js'),
    },
})

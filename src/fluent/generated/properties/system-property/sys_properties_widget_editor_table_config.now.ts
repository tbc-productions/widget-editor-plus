import { Property, Record } from '@servicenow/sdk/core'
import { widgetEditorPlusPropertiesCategory } from '../system-property-category/sys_properties_category_widget_editor_plus.now'

export const editorTableConfigSysScriptIncludeProperty = Property({
    $id: Now.ID['widget-editor-editor-table-config-sys-script-include'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.editor.table_config.sys_script_include',
    value: `{
  "primaryField": "name",
  "icon": "icon-document-code",
  "allowCreate": true,
  "supportsEs12": true,
  "scriptFields": [
    {
      "name": "script",
      "language": "javascript",
      "scriptKind": "server"
    }
  ],
  "headerFields": [
    "name",
    "active",
    {
      "name": "client_callable",
      "label": "Client"
    },
    {
      "name": "sandbox_callable",
      "label": "Sandbox"
    },
    "access"
  ],
  "additionalFields": [
    {
      "name": "description",
      "multiline": true
    },
    {
      "name": "api_name",
      "readOnly": true
    },
    "mobile_callable",
    {
      "name": "sys_policy",
      "readOnly": true
    }
  ]
}`,
    description: 'Widget Editor+ table configuration for sys_script_include.',
    ignoreCache: true,
    roles: { read: ['sp_admin'], write: ['admin'] },
})

Record({
    $id: Now.ID['widget-editor-editor-table-config-sys-script-include-category'],
    table: 'sys_properties_category_m2m',
    data: {
        property: editorTableConfigSysScriptIncludeProperty,
        category: widgetEditorPlusPropertiesCategory,
        order: 6000,
    },
})

export const editorTableConfigSpCssProperty = Property({
    $id: Now.ID['widget-editor-editor-table-config-sp-css'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.editor.table_config.sp_css',
    value: `{
  "primaryField": "name",
  "icon": "icon-marker",
  "allowCreate": true,
  "scriptFields": [
    {
      "name": "css",
      "language": "scss"
    }
  ],
  "headerFields": [
    "name",
    "active"
  ],
  "additionalFields": [
    "turn_off_scss_compilation"
  ]
}`,
    description: 'Widget Editor+ table configuration for sp_css.',
    ignoreCache: true,
    roles: { read: ['sp_admin'], write: ['admin'] },
})

Record({
    $id: Now.ID['widget-editor-editor-table-config-sp-css-category'],
    table: 'sys_properties_category_m2m',
    data: {
        property: editorTableConfigSpCssProperty,
        category: widgetEditorPlusPropertiesCategory,
        order: 6100,
    },
})

export const editorTableConfigSysUiScriptProperty = Property({
    $id: Now.ID['widget-editor-editor-table-config-sys-ui-script'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.editor.table_config.sys_ui_script',
    value: `{
  "primaryField": "name",
  "icon": "icon-code",
  "allowCreate": true,
  "scriptFields": [
    {
      "name": "script",
      "language": "javascript",
      "scriptKind": "client"
    }
  ],
  "headerFields": [
    "name",
    "active",
    "global",
    "ui_type"
  ],
  "additionalFields": [
    {
      "name": "description",
      "multiline": true
    }
  ]
}`,
    description: 'Widget Editor+ table configuration for sys_ui_script.',
    ignoreCache: true,
    roles: { read: ['sp_admin'], write: ['admin'] },
})

Record({
    $id: Now.ID['widget-editor-editor-table-config-sys-ui-script-category'],
    table: 'sys_properties_category_m2m',
    data: {
        property: editorTableConfigSysUiScriptProperty,
        category: widgetEditorPlusPropertiesCategory,
        order: 6200,
    },
})

export const editorTableConfigSpAngularProviderProperty = Property({
    $id: Now.ID['widget-editor-editor-table-config-sp-angular-provider'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.editor.table_config.sp_angular_provider',
    value: `{
  "label": "Angular Provider",
  "primaryField": "name",
  "secondaryField": "type",
  "icon": "icon-console",
  "allowCreate": true,
  "scriptFields": [
    {
      "name": "script",
      "language": "javascript",
      "scriptKind": "client"
    }
  ],
  "headerFields": [
    "name",
    "active",
    "type"
  ],
  "additionalFields": []
}`,
    description: 'Widget Editor+ table configuration for sp_angular_provider.',
    ignoreCache: true,
    roles: { read: ['sp_admin'], write: ['admin'] },
})

Record({
    $id: Now.ID['widget-editor-editor-table-config-sp-angular-provider-category'],
    table: 'sys_properties_category_m2m',
    data: {
        property: editorTableConfigSpAngularProviderProperty,
        category: widgetEditorPlusPropertiesCategory,
        order: 6300,
    },
})

export const editorTableConfigSysUiPageProperty = Property({
    $id: Now.ID['widget-editor-editor-table-config-sys-ui-page'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.editor.table_config.sys_ui_page',
    value: `{
  "primaryField": "name",
  "icon": "icon-application-generic",
  "allowCreate": true,
  "supportsEs12": true,
  "scriptFields": [
    {
      "name": "html",
      "language": "html"
    },
    {
      "name": "client_script",
      "language": "javascript",
      "scriptKind": "client"
    },
    {
      "name": "processing_script",
      "language": "javascript",
      "scriptKind": "server"
    }
  ],
  "headerFields": [
    "name",
    "active",
    "category",
    "direct"
  ],
  "additionalFields": [
    {
      "name": "description",
      "multiline": true
    }
  ]
}`,
    description: 'Widget Editor+ table configuration for sys_ui_page.',
    ignoreCache: true,
    roles: { read: ['sp_admin'], write: ['admin'] },
})

Record({
    $id: Now.ID['widget-editor-editor-table-config-sys-ui-page-category'],
    table: 'sys_properties_category_m2m',
    data: {
        property: editorTableConfigSysUiPageProperty,
        category: widgetEditorPlusPropertiesCategory,
        order: 6400,
    },
})

export const editorTableConfigSpNgTemplateProperty = Property({
    $id: Now.ID['widget-editor-editor-table-config-sp-ng-template'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.editor.table_config.sp_ng_template',
    value: `{
  "label": "Angular Template",
  "primaryField": "id",
  "secondaryField": "sp_widget",
  "icon": "icon-layout",
  "allowCreate": true,
  "scriptFields": [
    {
      "name": "template",
      "language": "html"
    }
  ],
  "headerFields": [
    "id",
    "active",
    "sp_widget"
  ],
  "additionalFields": []
}`,
    description: 'Widget Editor+ table configuration for sp_ng_template.',
    ignoreCache: true,
    roles: { read: ['sp_admin'], write: ['admin'] },
})

Record({
    $id: Now.ID['widget-editor-editor-table-config-sp-ng-template-category'],
    table: 'sys_properties_category_m2m',
    data: {
        property: editorTableConfigSpNgTemplateProperty,
        category: widgetEditorPlusPropertiesCategory,
        order: 6500,
    },
})

export const editorTableConfigSysScriptEmailProperty = Property({
    $id: Now.ID['widget-editor-editor-table-config-sys-script-email'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.editor.table_config.sys_script_email',
    value: `{
  "primaryField": "name",
  "icon": "icon-envelope-subscribe",
  "allowCreate": true,
  "scriptFields": [
    {
      "name": "script",
      "language": "javascript",
      "scriptKind": "server"
    }
  ],
  "headerFields": [
    "name",
    "new_lines_to_html"
  ],
  "additionalFields": [
    {
      "name": "sys_policy",
      "readOnly": true
    }
  ]
}`,
    description: 'Widget Editor+ table configuration for sys_script_email.',
    ignoreCache: true,
    roles: { read: ['sp_admin'], write: ['admin'] },
})

Record({
    $id: Now.ID['widget-editor-editor-table-config-sys-script-email-category'],
    table: 'sys_properties_category_m2m',
    data: {
        property: editorTableConfigSysScriptEmailProperty,
        category: widgetEditorPlusPropertiesCategory,
        order: 6600,
    },
})

export const editorTableConfigSysScriptFixProperty = Property({
    $id: Now.ID['widget-editor-editor-table-config-sys-script-fix'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.editor.table_config.sys_script_fix',
    value: `{
  "primaryField": "name",
  "icon": "icon-document-code",
  "allowCreate": true,
  "scriptFields": [
    {
      "name": "script",
      "language": "javascript",
      "scriptKind": "server"
    }
  ],
  "headerFields": [
    "name",
    {
      "name": "record_as_rollback",
      "label": "Rollback"
    }
  ],
  "additionalFields": [
    {
      "name": "description",
      "multiline": true
    },
    "unloadable",
    "before"
  ]
}`,
    description: 'Widget Editor+ table configuration for sys_script_fix.',
    ignoreCache: true,
    roles: { read: ['sp_admin'], write: ['admin'] },
})

Record({
    $id: Now.ID['widget-editor-editor-table-config-sys-script-fix-category'],
    table: 'sys_properties_category_m2m',
    data: {
        property: editorTableConfigSysScriptFixProperty,
        category: widgetEditorPlusPropertiesCategory,
        order: 6700,
    },
})

import { Record } from '@servicenow/sdk/core'
import { widgetEditorPlusPropertiesCategory } from '../system-property-category/sys_properties_category_widget_editor_plus.now'
import {
    creditMaxUpdatesProperty,
    creditMaxPayloadCharsProperty,
    creditMaxHistoryCharsProperty,
    creditMaxLinesProperty,
    creditDiffWorkProperty,
    creditRequestTimeoutSecondsProperty,
    creditStatisticsBatchSizeProperty,
} from '../system-property/sys_properties_widget_editor_credit.now'

Record({
    $id: Now.ID['widget-editor-credit-max-updates-category'],
    table: 'sys_properties_category_m2m',
    data: { property: creditMaxUpdatesProperty, category: widgetEditorPlusPropertiesCategory, order: 4000 },
})

Record({
    $id: Now.ID['widget-editor-credit-max-payload-chars-category'],
    table: 'sys_properties_category_m2m',
    data: { property: creditMaxPayloadCharsProperty, category: widgetEditorPlusPropertiesCategory, order: 4010 },
})

Record({
    $id: Now.ID['widget-editor-credit-max-history-chars-category'],
    table: 'sys_properties_category_m2m',
    data: { property: creditMaxHistoryCharsProperty, category: widgetEditorPlusPropertiesCategory, order: 4020 },
})

Record({
    $id: Now.ID['widget-editor-credit-max-lines-category'],
    table: 'sys_properties_category_m2m',
    data: { property: creditMaxLinesProperty, category: widgetEditorPlusPropertiesCategory, order: 4030 },
})

Record({
    $id: Now.ID['widget-editor-credit-diff-work-category'],
    table: 'sys_properties_category_m2m',
    data: { property: creditDiffWorkProperty, category: widgetEditorPlusPropertiesCategory, order: 4040 },
})

Record({
    $id: Now.ID['widget-editor-credit-request-timeout-seconds-category'],
    table: 'sys_properties_category_m2m',
    data: { property: creditRequestTimeoutSecondsProperty, category: widgetEditorPlusPropertiesCategory, order: 4050 },
})

Record({
    $id: Now.ID['widget-editor-credit-statistics-batch-size-category'],
    table: 'sys_properties_category_m2m',
    data: { property: creditStatisticsBatchSizeProperty, category: widgetEditorPlusPropertiesCategory, order: 4060 },
})

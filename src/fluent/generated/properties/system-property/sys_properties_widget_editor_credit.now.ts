import { Property } from '@servicenow/sdk/core'

export const creditMaxUpdatesProperty = Property({
    $id: Now.ID['widget-editor-credit-max-updates'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.credit.max_updates',
    type: 'integer',
    value: '5000',
    description: 'Maximum Customer Updates retained for Credit+ history. When exceeded, the newest snapshots and the selected update remain available with partial attribution.',
    ignoreCache: true,
    roles: { read: ['admin'], write: ['admin'] },
})

export const creditMaxPayloadCharsProperty = Property({
    $id: Now.ID['widget-editor-credit-max-payload-chars'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.credit.max_payload_chars',
    type: 'integer',
    value: '20000000',
    description: 'Maximum XML characters per Customer Update payload read by Credit+. Oversized historical snapshots are skipped; raise this value to include larger payloads.',
    ignoreCache: true,
    roles: { read: ['admin'], write: ['admin'] },
})

export const creditMaxHistoryCharsProperty = Property({
    $id: Now.ID['widget-editor-credit-max-history-chars'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.credit.max_history_chars',
    type: 'integer',
    value: '100000000',
    description: 'Maximum extracted code characters retained in the Credit+ browser history cache; the selected snapshot is always retained. Also limits XML read per legacy server snapshot batch or reusable attribution request.',
    ignoreCache: true,
    roles: { read: ['admin'], write: ['admin'] },
})

export const creditMaxLinesProperty = Property({
    $id: Now.ID['widget-editor-credit-max-lines'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.credit.max_lines',
    type: 'integer',
    value: '50000',
    description: 'Maximum lines per field for Credit+ matching. Larger fields still display their code, with unavailable attribution clearly indicated.',
    ignoreCache: true,
    roles: { read: ['admin'], write: ['admin'] },
})

export const creditDiffWorkProperty = Property({
    $id: Now.ID['widget-editor-credit-diff-work'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.credit.diff_work',
    type: 'integer',
    value: '20000000',
    description: 'Maximum matching operations per Credit+ browser comparison (or reusable server attribution request). Matching stops conservatively with partial results when exceeded.',
    ignoreCache: true,
    roles: { read: ['admin'], write: ['admin'] },
})

export const creditRequestTimeoutSecondsProperty = Property({
    $id: Now.ID['widget-editor-credit-request-timeout-seconds'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.credit.request_timeout_seconds',
    type: 'integer',
    value: '180',
    description: 'Browser timeout in seconds for Credit+ Table API requests, field/statistics loading and worker calculations.',
    ignoreCache: true,
    roles: { read: ['admin'], write: ['admin'] },
})

export const creditStatisticsBatchSizeProperty = Property({
    $id: Now.ID['widget-editor-credit-statistics-batch-size'],
    $meta: { installMethod: 'first install' },
    name: 'monaco.plus.credit.statistics_batch_size',
    type: 'integer',
    value: '10',
    description: 'Maximum Customer Updates loaded per legacy Credit+ server field or statistics batch. Smaller batches reduce server request duration. Table API retrieval uses up to 100 records per request.',
    ignoreCache: true,
    roles: { read: ['admin'], write: ['admin'] },
})

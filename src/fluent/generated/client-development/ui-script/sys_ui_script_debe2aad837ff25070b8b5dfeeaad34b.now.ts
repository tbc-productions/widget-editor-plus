import { Record } from '@servicenow/sdk/core'

Record({
    $id: Now.ID['debe2aad837ff25070b8b5dfeeaad34b'],
    table: 'sys_ui_script',
    data: {
        active: 'true',
        description: `Monaco Editor completion providers for CSS including at rules (@media, @font-face, @keyframes, etc.) and their valid descriptors.
Registers as window.MONACO_LANGUAGE_CSS.`,
        global: 'false',
        ignore_in_now_experience: 'false',
        name: 'monaco_language_css',
        script: Now.include('./monaco_language_css.js'),
        ui_type: '0',
        use_scoped_format: 'false',
    },
})

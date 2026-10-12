/**
 * ============================================================================
 * UI Script: monaco_custom_code_actions
 * ============================================================================
 * Purpose: Designated extension point for adding your own Monaco code actions
 * (lightbulb quick-fixes) without editing monaco_code_actions.jsdbx, which
 * defines the window.MONACO_CUSTOM_CODE_ACTIONS registry this file hooks into.
 *
 * Contains:
 *   - Guard that no-ops if the registry isn't available yet
 *   - The "Custom actions below here" section — add your register() calls there
 *
 * How to add a custom code action:
 *   1. Below the guard, call:
 *        window.MONACO_CUSTOM_CODE_ACTIONS.register('language', provider, { id: 'unique-id' });
 *      - 'language' is the Monaco language id (e.g. 'javascript', 'html', 'scss').
 *      - 'provider' is an object with a provideCodeActions(model, range) method.
 *      - 'id' is a unique string for your action; it prevents duplicate
 *        registration if this script runs more than once on a page.
 *   2. provideCodeActions(model, range) must return
 *        { actions: [ ... ], dispose: function () {} }
 *      — one Monaco CodeAction per quick-fix you want to offer.
 *   3. Errors thrown inside your provider are caught and logged to the
 *      console; they won't break built-in code actions or other custom ones.
 * ============================================================================
 */
(function () {
    'use strict';
    if (!window.MONACO_CUSTOM_CODE_ACTIONS || typeof window.MONACO_CUSTOM_CODE_ACTIONS.register !== 'function') return;

    // -------------------------------------------------------------------------
    // Custom actions below here
    // -------------------------------------------------------------------------
})();

api.controller = function ($scope, spUtil) {
    const c = this;

    if (c.data.hasAccess === false) {
        return;
    }

    const LOCAL_PREFS_KEY = 'we_debug_menu_prefs';

    const DEFAULT_PREFS = {
        defaultEditor: 'openWithEditorPlus',
        showTimingIndicators: true,
        assignConsoleVars: true,
    };

    // Preference modal items, in dropdown order; type:'section' renders a group header.
    c.menuItemDefs = [
        { type: 'section', label: 'Open with' },
        {
            id: 'defaultEditor',
            type: 'select',
            label: 'Default editor',
            description: 'Sets the primary button in the menu. All editors remain available under "Open with…".',
            options: [
                { value: 'openWithEditorPlus', label: 'Widget Editor+' },
                {
                    value: 'openWithEditorSP',
                    label: 'Widget Editor (Service Portal)',
                },
                { value: 'openWithFormModal', label: 'Form Modal' },
                { value: 'openWithPlatform', label: 'Platform' },
            ],
        },
        { type: 'section', label: 'Widget' },
        {
            id: 'showTimingIndicators',
            label: 'Show generation-time indicator',
            description:
                'An indicator with tooltip displaying widget execution time (green &lt;500ms, orange 500–1000ms, red &gt;1000ms).',
        },
        { type: 'section', label: 'Console logging' },
        {
            id: 'assignConsoleVars',
            label: 'Expose $scope / $rootScope on window',
            description:
                'Assigns <code>$scope</code> and <code>$rootScope</code> directly on <code>window</code> to allow access in the browser console.',
        },
    ];

    // Preference source order: localStorage, then sys_user_preference, then defaults.
    // Keyed by realUserId so impersonation doesn't shadow the real user's preferences.
    const userPrefsKey = c.data.realUserId ? LOCAL_PREFS_KEY + '_' + c.data.realUserId : LOCAL_PREFS_KEY;

    try {
        const rawPrefs =
            localStorage.getItem(userPrefsKey) || $scope.data.preferences || localStorage.getItem(LOCAL_PREFS_KEY);
        c.preferences = rawPrefs ? JSON.parse(rawPrefs) : angular.copy(DEFAULT_PREFS);
    } catch (e) {
        c.preferences = angular.copy(DEFAULT_PREFS);
    }

    // Backfill any keys added after the user's preferences were first saved.
    angular.forEach(DEFAULT_PREFS, (val, key) => {
        if (c.preferences[key] === undefined) {
            c.preferences[key] = val;
        }
    });

    c.showPreferencesModal = false;
    c.editPreferences = {};
    c.saving = false;

    /**
     * Opens the preferences modal, populating the edit copy from the current preferences.
     */
    c.openPreferences = function () {
        c.editPreferences = angular.copy(c.preferences);
        c.showPreferencesModal = true;
    };

    /**
     * Closes the preferences modal without saving changes.
     */
    c.closePreferences = function () {
        c.showPreferencesModal = false;
    };

    /**
     * Persists the edited preferences to localStorage and syncs them to the
     * server (sys_user_preference) for cross-device availability.
     */
    c.savePreferences = function () {
        c.saving = true;

        const json = JSON.stringify(c.editPreferences);

        // Persist to user-scoped localStorage key immediately
        if (c.data.realUserId) {
            localStorage.setItem(LOCAL_PREFS_KEY + '_' + c.data.realUserId, json);
        }
        localStorage.setItem(LOCAL_PREFS_KEY, json);

        c.preferences = angular.copy(c.editPreferences);
        c.showPreferencesModal = false;
        c.saving = false;

        // Pass the object directly; SP serializes it to JSON itself, so pre-stringifying double-encodes it.
        $scope.server.get({
            action: 'savePreferences',
            preferences: c.preferences,
        });
    };
};

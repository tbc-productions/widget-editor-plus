/** Saves/returns debug menu preferences; while impersonating, always uses the real user, not the impersonated one. */
(function () {
    var PREF_KEY = 'we_debug_menu_prefs';
    var impersonatedUser = gs.getImpersonatingUserName();
    var realUserId = null;
    var hasAccess = false;

    if (impersonatedUser) {
        // When impersonating, gs.getImpersonatingUserName() returns the username of the real user
        var grUser = new GlideRecord('sys_user');
        grUser.addQuery('user_name', impersonatedUser);
        grUser.query();
        if (grUser.next()) {
            realUserId = grUser.getValue('sys_id');
        }

        if (realUserId) {
            var grRole = new GlideRecord('sys_user_has_role');
            grRole.addQuery('user', realUserId);
            grRole.addQuery('role.name', 'IN', 'sp_admin,admin');
            grRole.query();
            hasAccess = grRole.hasNext();
        }
    } else {
        // Not impersonating — real user is current session user
        realUserId = gs.getUserID();
        hasAccess = gs.hasRole('sp_admin');
    }

    data.hasAccess = hasAccess;
    data.isImpersonating = !!impersonatedUser;
    data.realUserId = realUserId;

    if (data.hasAccess === false || !realUserId) {
        return;
    }

    // sp_instance -> sp_page resolution is shared with WidgetEditorAjax, which already
    // implements the sp_row/sp_column nesting walk.
    var widgetEditorAjax = new WidgetEditorAjax();
    var resolvePageForInstance = function (grInstance) {
        return widgetEditorAjax._resolvePageForInstance(grInstance);
    };

    if (input && input.action === 'getOpenPageOptions') {
        var result = { instances: [], portals: [] };

        // A widget can be placed via more than one sp_instance (e.g. on several
        // pages), so every active instance is resolved and offered separately —
        // the client shows an instance picker (labeled by page) when there's more than one.
        if (input.widgetSysId) {
            var grInstances = new GlideRecordSecure('sp_instance');
            grInstances.addQuery('sp_widget', input.widgetSysId);
            grInstances.addQuery('active', true);
            grInstances.setLimit(200);
            grInstances.query();
            while (grInstances.next()) {
                var page = resolvePageForInstance(grInstances);
                if (page) {
                    result.instances.push({
                        instanceSysId: grInstances.getValue('sys_id'),
                        pageId: page.id,
                        pageSysId: page.sysId,
                        pageTitle: page.title,
                    });
                }
            }
            result.instances.sort(function (a, b) {
                return (a.pageTitle || '').localeCompare(b.pageTitle || '');
            });
        }

        var grPortal = new GlideRecordSecure('sp_portal');
        // "inactive" is blank/unset on most portals (that also means active), not
        // explicitly "false" — an exact-match query on false alone misses those.
        grPortal.addEncodedQuery('inactive=false^ORinactiveISEMPTY');
        grPortal.orderBy('title');
        grPortal.query();
        while (grPortal.next()) {
            result.portals.push({
                sys_id: grPortal.getValue('sys_id'),
                title: grPortal.getValue('title'),
                url_suffix: grPortal.getValue('url_suffix'),
            });
        }

        data.openPageOptions = result;
    }

    if (input && input.action === 'savePreferences') {
        // input.preferences is a Rhino object; JSON.stringify it before storing.
        var toStore = '';
        try {
            toStore = JSON.stringify(input.preferences) || '{}';
        } catch (e) {
            toStore = '{}';
        }

        // Use GlideRecord (not GlideRecordSecure) so the real user's preference record can be updated even when impersonating
        var grSave = new GlideRecord('sys_user_preference');
        grSave.addQuery('user', realUserId);
        grSave.addQuery('name', PREF_KEY);
        grSave.query();
        if (grSave.next()) {
            grSave.setValue('value', toStore);
            grSave.update();
        } else {
            grSave.initialize();
            grSave.setValue('user', realUserId);
            grSave.setValue('name', PREF_KEY);
            grSave.setValue('value', toStore);
            grSave.setValue('type', 'string');
            grSave.insert();
        }
    }

    // Return stored preferences string of the real user; client parses it and backfills defaults.
    // Use GlideRecord (not GlideRecordSecure) so the real user's preference record can be loaded even when impersonating.
    var grLoad = new GlideRecord('sys_user_preference');
    grLoad.addQuery('user', realUserId);
    grLoad.addQuery('name', PREF_KEY);
    grLoad.query();
    data.preferences = grLoad.next() ? grLoad.getValue('value') : null;

    // Sourced from Widget Editor+'s own user preferences, not this widget's own.
    data.contextMenuMode = 'enhanced';
    data.showAssistantButton = false;
    var grMainPrefs = new GlideRecord('sys_user_preference');
    grMainPrefs.addQuery('user', realUserId);
    grMainPrefs.addQuery('name', widgetEditorAjax.USER_PREF_NAME);
    grMainPrefs.query();
    if (grMainPrefs.next()) {
        try {
            var mainPrefs = JSON.parse(grMainPrefs.getValue('value') || '{}');
            if (mainPrefs.contextMenuMode === 'standard' || mainPrefs.contextMenuMode === 'off') {
                data.contextMenuMode = mainPrefs.contextMenuMode;
            }
            data.showAssistantButton = mainPrefs.showAssistantButton === true;
        } catch (e) {
            /* keep defaults */
        }
    }
})();

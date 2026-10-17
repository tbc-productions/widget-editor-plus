var WidgetEditorAjax = Class.create();
WidgetEditorAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {
    RECORD_LIMIT: parseInt(gs.getProperty('monaco.plus.record_limit', '500'), 10) || 500,

    ALLOWED_WIDGET_FIELDS: [
        'name',
        'id',
        'description',
        'controller_as',
        'public',
        'roles',
        'template',
        'css',
        'client_script',
        'script',
        'link',
        'static',
    ],

    ADDITIONAL_WIDGET_FIELDS_PROPERTY: 'monaco.plus.widget.fields',
    DEPRECATED_WIDGET_PROPERTY: 'monaco.plus.widget.deprecated',
    RELATED_LIST_EXCLUSIONS_PROPERTY: 'monaco.plus.widget.related_list_exclusions',

    RELATED_CELL_MAX_LENGTH: 100,

    _getEditorProfiles: function () {
        return {
            sys_script_include: {
                label: 'Script Includes',
                singular: 'Script Include',
                primary: 'name',
                fields: [
                    { name: 'name', required: true },
                    { name: 'active', type: 'boolean' },
                    { name: 'client_callable', shortLabel: 'Client', type: 'boolean' },
                    { name: 'sandbox_callable', shortLabel: 'Sandbox', type: 'boolean' },
                    { name: 'access', type: 'choice' },
                    { name: 'description', multiline: true, more: true },
                    { name: 'api_name', readOnly: true, more: true },
                    { name: 'mobile_callable', type: 'boolean', more: true },
                    { name: 'sys_policy', readOnly: true, more: true },
                    { name: 'script', language: 'javascript', scriptKind: 'server' },
                ],
            },
            sp_css: {
                label: 'CSS',
                singular: 'Style Sheet',
                primary: 'name',
                fields: [
                    { name: 'name', required: true },
                    { name: 'active', type: 'boolean' },
                    { name: 'css', language: 'scss' },
                ],
            },
            sys_ui_script: {
                label: 'UI Scripts',
                singular: 'UI Script',
                primary: 'name',
                fields: [
                    { name: 'name', required: true },
                    { name: 'active', type: 'boolean' },
                    { name: 'global', type: 'boolean' },
                    { name: 'ui_type', type: 'choice' },
                    { name: 'description', multiline: true, more: true },
                    { name: 'script', language: 'javascript', scriptKind: 'client' },
                ],
            },
            sp_angular_provider: {
                label: 'Angular Providers',
                singular: 'Angular Provider',
                primary: 'name',
                fields: [
                    { name: 'name', required: true },
                    { name: 'active', type: 'boolean' },
                    { name: 'type', type: 'choice' },
                    { name: 'script', language: 'javascript', scriptKind: 'client' },
                ],
            },
            sys_ui_page: {
                label: 'UI Pages',
                singular: 'UI Page',
                primary: 'name',
                fields: [
                    { name: 'name', required: true },
                    { name: 'active', type: 'boolean' },
                    { name: 'category', type: 'choice' },
                    { name: 'direct', type: 'boolean' },
                    { name: 'description', multiline: true, more: true },
                    { name: 'html', language: 'html' },
                    { name: 'client_script', language: 'javascript', scriptKind: 'client' },
                    {
                        name: 'processing_script',
                        language: 'javascript',
                        scriptKind: 'server',
                    },
                ],
            },
            sp_ng_template: {
                label: 'Angular HTML templates',
                singular: 'Angular HTML Template',
                primary: 'id',
                fields: [
                    { name: 'id', required: true },
                    { name: 'active', type: 'boolean' },
                    { name: 'sp_widget', type: 'reference', readOnly: true },
                    { name: 'template', language: 'html' },
                ],
            },
        };
    },

    _getEditorTable: function () {
        return String(this.getParameter('record_table') || 'sp_widget');
    },

    getEditorRecordTypes: function () {
        var types = [{ table: 'sp_widget', label: 'Widgets', singular: 'Widget' }];
        var profiles = this._getEditorProfiles();
        Object.keys(profiles).forEach(function (table) {
            types.push({ table: table, label: profiles[table].label, singular: profiles[table].singular });
        });
        return this._answer({ success: true, types: types });
    },

    getAppDrawerContext: function () {
        var table = String(this.getParameter('table') || '');
        var recordId = String(this.getParameter('record_id') || '');
        var apps = {};
        if (/^[a-z_][a-z0-9_]*$/i.test(table) && /^[0-9a-f]{32}$/i.test(recordId)) {
            var record = new GlideRecordSecure(table);
            if (record.isValid() && record.get(recordId) && record.canRead()) {
                apps.assistant = true;
                apps['widget-editor'] =
                    table === 'sp_widget' || Object.prototype.hasOwnProperty.call(this._getEditorProfiles(), table);
                try {
                    apps.compare = this._getDiffFieldDefs(table).success === true;
                } catch (error) {}
                if (gs.hasRole('admin')) {
                    try {
                        apps.credit = new global.WidgetEditorCreditAjax()._fields(table).length > 0;
                    } catch (error) {}
                }
            }
        }
        return this._answer({ success: true, apps: apps });
    },

    _getEditorChoices: function (table, field) {
        var choices = [];
        var gr = new GlideRecord('sys_choice');
        gr.addQuery('name', table);
        gr.addQuery('element', field);
        gr.addQuery('inactive', false);
        gr.addQuery('language', 'en');
        gr.orderBy('sequence');
        gr.query();
        while (gr.next()) {
            choices.push({ value: gr.getValue('value'), label: gr.getValue('label') });
        }
        return choices;
    },

    _getEditorFieldDefs: function (gr, profile) {
        var defs = [];
        for (var i = 0; i < profile.fields.length; i++) {
            var source = profile.fields[i];
            if (!gr.isValidField(source.name)) continue;
            var element = gr.getElement(source.name);
            if (!element.canRead()) continue;
            var def = {};
            Object.keys(source).forEach(function (key) {
                def[key] = source[key];
            });
            def.label = String(element.getLabel());
            def.type = def.type || 'string';
            def.canWrite = !def.readOnly && element.canWrite();
            if (def.type === 'choice') def.choices = this._getEditorChoices(gr.getTableName(), def.name);
            defs.push(def);
        }
        return defs;
    },

    _editorValue: function (gr, def) {
        var value = gr.getValue(def.name) || '';
        return def.type === 'boolean' ? value === '1' || value === 'true' : String(value);
    },

    _getRecordOrigin: function (table, sysId) {
        if (!sysId) return null;
        // Use the oldest readable update version, matching the widget's established date and founder.
        var gr = new GlideRecordSecure('sys_update_version');
        gr.addQuery('name', table + '_' + sysId);
        gr.orderBy('sys_created_on');
        gr.setLimit(1);
        gr.query();
        if (!gr.next() || !gr.getElement('sys_created_on').canRead() || !gr.getElement('sys_created_by').canRead())
            return null;
        var founder = gr.getValue('sys_created_by') || '';
        var user = new GlideRecordSecure('sys_user');
        user.addQuery('user_name', founder);
        user.setLimit(1);
        user.query();
        if (user.next() && user.getElement('name').canRead()) founder = user.getDisplayValue('name') || founder;
        return { created_on: gr.getValue('sys_created_on'), founder: founder };
    },

    getEditorRecords: function () {
        var table = this._getEditorTable();
        var profiles = this._getEditorProfiles();
        if (!Object.prototype.hasOwnProperty.call(profiles, table)) {
            return this._answer({ success: false, error: 'Record type not supported.' });
        }
        var profile = profiles[table];
        var search = String(this.getParameter('search') || '');
        var ids = String(this.getParameter('sys_ids') || '');
        var offset = Math.max(0, parseInt(this.getParameter('offset'), 10) || 0);
        var limit = Math.max(1, this.RECORD_LIMIT);
        var records = [];
        var gr = new GlideRecordSecure(table);
        if (ids) {
            var validIds = ids
                .split(',')
                .filter(function (id) {
                    return /^[a-f0-9]{32}$/i.test(id);
                })
                .slice(0, 10);
            if (!validIds.length) return this._answer({ success: true, widgets: [] });
            gr.addQuery('sys_id', 'IN', validIds.join(','));
        } else if (search) {
            var query = gr.addQuery(profile.primary, 'CONTAINS', search);
            query.addOrCondition('sys_id', search);
        }
        gr.orderBy(profile.primary);
        gr.chooseWindow(offset, offset + limit + 1);
        gr.query();
        var scanned = 0,
            hasMore = false;
        while (gr.next()) {
            if (scanned++ === limit) {
                hasMore = true;
                break;
            }
            var primary = gr.getElement(profile.primary);
            if (!primary.canRead()) continue;
            records.push({
                table: table,
                sys_id: gr.getUniqueValue(),
                name: gr.getValue(profile.primary) || '',
                id: '',
                canWrite: gr.canWrite(),
                servicenow: false,
            });
        }
        return this._answer({
            success: true,
            widgets: records,
            total: offset + records.length,
            has_more: hasMore,
            next_offset: offset + limit,
        });
    },

    _getEditorRecord: function (isNew) {
        var table = this._getEditorTable();
        var profiles = this._getEditorProfiles();
        if (!Object.prototype.hasOwnProperty.call(profiles, table)) {
            return this._answer({ success: false, error: 'Record type not supported.' });
        }
        var sysId = String(this.getParameter('sys_id') || '');
        if (!isNew && !/^[a-f0-9]{32}$/i.test(sysId))
            return this._answer({ success: false, error: 'An existing record is required.' });
        var gr = new GlideRecordSecure(table);
        if (isNew) {
            gr.newRecord();
            if (!gr.canCreate())
                return this._answer({
                    success: false,
                    error: 'You do not have permission to create this record type.',
                });
        } else if (!gr.get(sysId) || !gr.canRead())
            return this._answer({ success: false, error: 'Record not found or access denied.' });
        return this._answer(this._editorRecordData(gr, profiles[table], isNew ? '' : sysId, isNew));
    },

    _editorRecordData: function (gr, profile, sysId, isNew) {
        var defs = this._getEditorFieldDefs(gr, profile);
        var values = {
            sys_id: sysId,
            name: '',
            application: '',
            application_sys_id: '',
            canWrite: isNew ? gr.canCreate() : gr.canWrite(),
            widgetOrigin: this._getRecordOrigin(gr.getTableName(), sysId),
        };
        var editors = [],
            fields = [];
        for (var i = 0; i < defs.length; i++) {
            var def = defs[i];
            values[def.name] = this._editorValue(gr, def);
            if (def.type === 'reference' || def.readOnly) def.displayValue = gr.getDisplayValue(def.name) || '';
            if (def.language) {
                editors.push({
                    key: def.name,
                    field: def.name,
                    label: def.label,
                    language: def.language,
                    scriptKind: def.scriptKind || '',
                    visible: true,
                    readOnly: !def.canWrite,
                });
            } else fields.push(def);
        }
        if (
            !defs.some(function (def) {
                return def.name === profile.primary;
            })
        ) {
            return { success: false, error: 'Record not found or access denied.' };
        }
        values.es12_supported = editors.some(function (editor) {
            return editor.scriptKind === 'server';
        });
        values.es12 = false;
        values.es12_record_exists = false;
        if (sysId && values.es12_supported) {
            var esGr = new GlideRecordSecure('sys_es_latest_script');
            esGr.addQuery('id', sysId);
            esGr.addQuery('table', gr.getTableName());
            esGr.query();
            if (esGr.next() && esGr.getElement('use_es_latest').canRead()) {
                values.es12_record_exists = true;
                var esValue = esGr.getValue('use_es_latest');
                values.es12 = esValue === '1' || esValue === 'true';
            }
        }
        if (profile.primary === 'id') values.name = values.id;
        ['sys_scope', 'sys_policy', 'sys_updated_on', 'sys_updated_by', 'sys_mod_count'].forEach(function (name) {
            if (gr.isValidField(name) && gr.getElement(name).canRead()) values[name] = gr.getValue(name) || '';
        });
        if (gr.isValidField('sys_scope') && gr.getElement('sys_scope').canRead())
            values.application_label = String(gr.getElement('sys_scope').getLabel());
        if (values.sys_scope) {
            values.application_sys_id = values.sys_scope;
            values.application = gr.getDisplayValue('sys_scope');
        }
        if (values.sys_policy) values.sys_policy_display = gr.getDisplayValue('sys_policy') || '';
        values.canWrite = values.canWrite && !values.sys_policy;
        return {
            success: true,
            widget: values,
            core_editor_defs: editors,
            additional_widget_fields: fields,
            record_label: profile.singular,
            primary_field: profile.primary,
        };
    },

    _saveEditorRecord: function (singleField) {
        try {
            var table = this._getEditorTable(),
                profiles = this._getEditorProfiles();
            if (!Object.prototype.hasOwnProperty.call(profiles, table)) throw new Error('Record type not supported.');
            var sysId = String(this.getParameter('sys_id') || '');
            var isNew = !singleField && String(this.getParameter('new_record') || '') === 'true';
            if ((isNew && sysId) || (!isNew && !/^[a-f0-9]{32}$/i.test(sysId)))
                throw new Error('An existing record is required.');
            var data = singleField ? Object.create(null) : JSON.parse(this.getParameter('data') || '{}');
            var original = JSON.parse(this.getParameter('original') || '{}');
            if (singleField) {
                var fieldValue = this.getParameter('value');
                data[String(this.getParameter('field') || '')] = fieldValue == null ? fieldValue : String(fieldValue);
            }
            if (
                !data ||
                Array.isArray(data) ||
                typeof data !== 'object' ||
                !original ||
                Array.isArray(original) ||
                typeof original !== 'object'
            )
                throw new Error('Invalid save payload.');
            var gr = new GlideRecordSecure(table);
            if (isNew) {
                gr.newRecord();
                if (!gr.canCreate()) throw new Error('You do not have permission to create this record type.');
            } else if (!gr.get(sysId) || !gr.canRead() || !gr.canWrite())
                throw new Error('Record not found or write access denied.');
            if (gr.isValidField('sys_policy') && gr.getValue('sys_policy'))
                throw new Error('This record is protected.');
            var defs = this._getEditorFieldDefs(gr, profiles[table]);
            if (
                !defs.some(function (def) {
                    return def.name === profiles[table].primary;
                })
            )
                throw new Error('Record not found or access denied.');
            var names = Object.keys(data),
                values = {};
            for (var i = 0; i < names.length; i++) {
                var name = names[i];
                var def = defs.filter(function (item) {
                    return item.name === name;
                })[0];
                if (!def || !def.canWrite) throw new Error('Field is not editable: ' + name);
                var value = data[name];
                if (singleField && def.type === 'boolean' && (value === 'true' || value === 'false'))
                    value = value === 'true';
                if (typeof value !== (def.type === 'boolean' ? 'boolean' : 'string'))
                    throw new Error('Invalid value for ' + def.label + '.');
                if (
                    !isNew &&
                    (!Object.prototype.hasOwnProperty.call(original, name) ||
                        original[name] !== this._editorValue(gr, def))
                )
                    throw new Error(
                        def.label +
                            ' changed in ServiceNow. Reload or review the current record before saving. Your local edits are preserved.'
                    );
                if (def.required && !String(value).trim()) throw new Error(def.label + ' is required.');
                if (
                    def.type === 'choice' &&
                    value &&
                    !def.choices.some(function (choice) {
                        return choice.value === value;
                    })
                )
                    throw new Error('Invalid choice for ' + def.label + '.');
                var element = gr.getElement(name);
                if (element.isMandatory && element.isMandatory() && (value === '' || value === null))
                    throw new Error(def.label + ' is required.');
                var maxLength = Number(element.getED().getLength());
                if (typeof value === 'string' && maxLength > 0 && value.length > maxLength)
                    throw new Error(def.label + ' exceeds its maximum length.');
                values[name] = def.type === 'boolean' ? (value ? '1' : '0') : value;
            }
            if (isNew) {
                for (var d = 0; d < defs.length; d++) {
                    var required = defs[d];
                    var requiredElement = gr.getElement(required.name);
                    var candidate = Object.prototype.hasOwnProperty.call(values, required.name)
                        ? values[required.name]
                        : gr.getValue(required.name);
                    if ((required.required || requiredElement.isMandatory()) && !String(candidate || '').trim())
                        throw new Error(required.label + ' is required.');
                }
            }
            for (var j = 0; j < names.length; j++) gr.setValue(names[j], values[names[j]]);
            if (isNew) {
                sysId = String(gr.insert() || '');
                if (!sysId) throw new Error('Record creation failed. Check access and record validation.');
            } else if (names.length && !gr.update())
                throw new Error('Save failed. Check access and record validation.');
            var readable = gr.get(sysId) && gr.canRead();
            return this._answer({
                success: true,
                sys_id: sysId,
                sys_updated_on: gr.getValue('sys_updated_on') || '',
                sys_mod_count: gr.getValue('sys_mod_count') || '',
                created_record: isNew && readable ? this._editorRecordData(gr, profiles[table], sysId) : null,
            });
        } catch (error) {
            return this._answer({ success: false, error: error.message || 'Save failed.' });
        }
    },

    ////////////////////////////////////////////////////////////
    // Widget
    ////////////////////////////////////////////////////////////

    /**
     * Returns the name of a single sp_widget record.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, name: string}} Return value.
     */
    getWidgetName: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({ success: false, name: '' });
        }
        var gr = new GlideRecordSecure('sp_widget');
        if (!gr.get(sysId)) {
            return this._answer({ success: false, name: '' });
        }
        return this._answer({ success: true, name: gr.getValue('name') || '' });
    },

    /**
     * Returns a page of sp_widget records, optionally filtered by name or id.
     * Accepts `search` (optional substring to filter by name or id) and `offset`
     * (row to start the page at, for infinite-scroll pagination).
     * @returns {{success: boolean, widgets: Array.<{sys_id: string, name: string, id: string,
     *   servicenow: boolean, deprecated: boolean, canWrite: boolean}>,
     *   total: number, offset: number}} Return value.
     */
    getWidgets: function () {
        var search = this.getParameter('search') || '';
        var offset = parseInt(this.getParameter('offset'), 10) || 0;
        var pageSize = this.RECORD_LIMIT;
        var widgets = [];
        var deprecatedFilter = this._getDeprecatedWidgetFilter();

        var countGa = new GlideAggregate('sp_widget');
        if (search) {
            var cq = countGa.addQuery('name', 'CONTAINS', search);
            cq.addOrCondition('id', 'CONTAINS', search);
        }
        countGa.addAggregate('COUNT');
        countGa.query();
        var total = countGa.next() ? parseInt(countGa.getAggregate('COUNT'), 10) || 0 : 0;

        var gr = new GlideRecordSecure('sp_widget');
        if (search) {
            var q = gr.addQuery('name', 'CONTAINS', search);
            q.addOrCondition('id', 'CONTAINS', search);
        }
        gr.orderBy('name');
        gr.chooseWindow(offset, offset + pageSize);
        gr.query();
        while (gr.next()) {
            var isServiceNow = gr.getValue('servicenow') == '1';
            widgets.push({
                sys_id: gr.getUniqueValue(),
                name: gr.getValue('name'),
                id: gr.getValue('id'),
                servicenow: isServiceNow,
                deprecated: deprecatedFilter ? deprecatedFilter.match(gr, false) : false,
                canWrite: gr.canWrite() && !isServiceNow,
            });
        }
        return this._answer({
            success: true,
            widgets: widgets,
            total: total,
            offset: offset,
        });
    },

    /**
     * Returns name/id for a set of sp_widget records, for resolving recent-widget history.
     * Accepts `sys_ids` (comma-separated sys_ids).
     * @returns {{success: boolean, widgets: Array.<{sys_id: string, name: string, id: string,
     *   servicenow: boolean, deprecated: boolean, canWrite: boolean}>}} Return value.
     */
    getWidgetsBySysIds: function () {
        var sysIds = (this.getParameter('sys_ids') || '').split(',').filter(function (id) {
            return !!id;
        });
        var widgets = [];
        if (sysIds.length) {
            var deprecatedFilter = this._getDeprecatedWidgetFilter();
            var gr = new GlideRecordSecure('sp_widget');
            gr.addQuery('sys_id', 'IN', sysIds.join(','));
            gr.setLimit(this.RECORD_LIMIT);
            gr.query();
            while (gr.next()) {
                var isServiceNow = gr.getValue('servicenow') == '1';
                widgets.push({
                    sys_id: gr.getUniqueValue(),
                    name: gr.getValue('name'),
                    id: gr.getValue('id'),
                    servicenow: isServiceNow,
                    deprecated: deprecatedFilter ? deprecatedFilter.match(gr, false) : false,
                    canWrite: gr.canWrite() && !isServiceNow,
                });
            }
        }
        return this._answer({
            success: true,
            widgets: widgets,
        });
    },

    /**
     * Returns the full field set for a single sp_widget record, including ES12 state,
     * write access flags, and the earliest update-version origin info.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, widget: {sys_id: string, name: string, id: string,
     *   description: string, controller_as: string, application: string,
     *   application_sys_id: string, is_public: boolean, roles: string, template: string,
     *   css: string, client_script: string, script: string, link: string, es12: boolean,
     *   es12_record_exists: boolean, sys_updated_on: string, sys_updated_by: string,
     *   canWrite: boolean, scope_mismatch: boolean,
     *   widgetOrigin: {created_on: string, founder: string}|null,
     *   sys_policy: string, sys_policy_display: string, servicenow: boolean,
     *   volatility_level: string, volatility_level_display: string,
     *   deprecated: boolean,
     *   update_set_mismatch: boolean, widget_update_set_id: string,
     *   widget_update_set_name: string}}} Return value.
     */
    getWidget: function () {
        if (this._getEditorTable() !== 'sp_widget') return this._getEditorRecord();
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }

        var gr = new GlideRecordSecure('sp_widget');
        if (!gr.get(sysId)) {
            var deletedResult = this._getDeletedWidget(sysId);
            if (deletedResult) {
                return this._answer({
                    success: true,
                    widget: deletedResult.widget,
                    additional_widget_fields: deletedResult.additional_widget_fields,
                });
            }
            return this._answer({
                success: false,
                error: 'Widget not found',
            });
        }

        var es12 = false;
        var es12RecordExists = false;
        var esGr = new GlideRecordSecure('sys_es_latest_script');
        esGr.addQuery('id', sysId);
        esGr.query();
        if (esGr.next()) {
            es12RecordExists = true;
            es12 = esGr.getValue('use_es_latest') == '1';
        }

        var widgetScopeId = gr.getValue('sys_scope');
        var currentAppId = gs.getCurrentApplicationId();
        var isServiceNow = gr.getValue('servicenow') == '1';
        var canWrite = gr.canWrite() && !isServiceNow;
        var scopeMismatch = widgetScopeId !== currentAppId;
        var isDeprecated = this._isDeprecatedWidget(gr);
        var sysClassName = gr.getValue('sys_class_name') || 'sp_widget';
        var isHeaderFooter = sysClassName === 'sp_header_footer';

        var sysPolicy = gr.getValue('sys_policy') || '';
        var sysPolicyDisplay = sysPolicy ? gr.getDisplayValue('sys_policy') : '';

        var widgetOrigin = this._getRecordOrigin('sp_widget', sysId);

        // Volatility risk
        var widgetVolLevel = '';
        var widgetVolDisplay = '';
        var widgetVolGr = new GlideRecordSecure('sys_metadata_volatility');
        widgetVolGr.addQuery('sys_update_name', 'sp_widget_' + sysId);
        widgetVolGr.setLimit(1);
        widgetVolGr.query();
        if (widgetVolGr.next()) {
            widgetVolLevel = widgetVolGr.getValue('volatility_level') || '';
            widgetVolDisplay = widgetVolLevel ? widgetVolGr.getDisplayValue('volatility_level') : '';
        }

        // Only flag if the update set is still in progress; follows the reverted_from chain to the version whose update set the content actually reflects.
        var widgetUpdateSetId = '';
        var widgetUpdateSetName = '';
        var updateSetMismatch = false;
        var uvGr = new GlideRecordSecure('sys_update_version');
        uvGr.addQuery('name', sysClassName + '_' + sysId);
        uvGr.orderByDesc('sys_created_on');
        uvGr.setLimit(1);
        uvGr.query();
        if (uvGr.next()) {
            var seen = {};
            seen[uvGr.getUniqueValue()] = true;
            var revertedFrom = uvGr.getValue('reverted_from');
            var resolvedGr = uvGr;
            while (revertedFrom && !seen[revertedFrom]) {
                seen[revertedFrom] = true;
                var chainGr = new GlideRecordSecure('sys_update_version');
                if (!chainGr.get(revertedFrom)) {
                    break;
                }
                resolvedGr = chainGr;
                revertedFrom = chainGr.getValue('reverted_from');
            }
            var uxSetId = resolvedGr.getValue('source');
            var usGr = new GlideRecordSecure('sys_update_set');
            if (usGr.get(uxSetId) && usGr.getValue('state') === 'in progress') {
                widgetUpdateSetId = uxSetId;
                widgetUpdateSetName = usGr.getDisplayValue('name');
                var currentUpdateSetId = gs.getPreference('sys_update_set');
                updateSetMismatch = widgetUpdateSetId !== currentUpdateSetId;
            }
        }

        var instGr = new GlideRecordSecure('sp_instance');
        instGr.addQuery('sp_widget', sysId);
        instGr.addQuery('active', true);
        instGr.setLimit(1);
        instGr.query();
        var hasActiveInstances = instGr.hasNext();

        var additionalDefs = this._getAdditionalWidgetFieldDefs(gr);

        var widget = {
            sys_id: gr.getUniqueValue(),
            name: gr.getValue('name'),
            id: gr.getValue('id'),
            description: gr.getValue('description'),
            controller_as: gr.getValue('controller_as') || 'c',
            application: gr.getDisplayValue('sys_scope'),
            application_sys_id: widgetScopeId,
            is_public: gr.getValue('public') == '1',
            roles: gr.getValue('roles') || '',
            template: gr.getValue('template') || '',
            css: gr.getValue('css') || '',
            client_script: gr.getValue('client_script') || '',
            script: gr.getValue('script') || '',
            link: gr.getValue('link') || '',
            es12: es12,
            es12_record_exists: es12RecordExists,
            sys_updated_on: gr.getValue('sys_updated_on') || '',
            sys_updated_by: gr.getValue('sys_updated_by') || '',
            canWrite: canWrite,
            scope_mismatch: scopeMismatch,
            widgetOrigin: widgetOrigin,
            sys_policy: sysPolicy,
            sys_policy_display: sysPolicyDisplay,
            servicenow: isServiceNow,
            volatility_level: widgetVolLevel,
            volatility_level_display: widgetVolDisplay,
            deprecated: isDeprecated,
            update_set_mismatch: updateSetMismatch,
            widget_update_set_id: widgetUpdateSetId,
            widget_update_set_name: widgetUpdateSetName,
            sys_class_name: sysClassName,
            is_header_footer: isHeaderFooter,
            'static': isHeaderFooter && gr.getValue('static') == '1',
            option_schema_has_value: this._hasProperJsonObjectValue(gr.getValue('option_schema')),
            demo_data_has_value: this._hasProperJsonObjectValue(gr.getValue('demo_data')),
            has_active_instances: hasActiveInstances,
        };

        for (var ai = 0; ai < additionalDefs.length; ai++) {
            var addDef = additionalDefs[ai];
            var addVal = gr.getValue(addDef.name);
            if (addDef.type === 'boolean') {
                widget[addDef.name] = addVal == '1';
            } else {
                widget[addDef.name] = addVal || '';
            }
        }

        return this._answer({
            success: true,
            widget: widget,
            additional_widget_fields: additionalDefs,
        });
    },

    /**
     * Returns the name and sys_id of every active sys_script_include record.
     * Used to populate the "new ClassName()" IntelliSense name map.
     * @returns {{success: boolean, includes: Array.<{name: string, sys_id: string}>}} Return value.
     */
    getScriptIncludeNames: function () {
        var result = [];
        var gr = new GlideRecordSecure('sys_script_include');
        gr.addActiveQuery();
        gr.orderBy('name');
        gr.query();
        while (gr.next()) {
            result.push({
                name: gr.getValue('name'),
                sys_id: gr.getUniqueValue(),
            });
        }
        return this._answer({ success: true, includes: result });
    },

    /**
     * Returns all active syntax_editor_macro records for use as Monaco snippet completions.
     * @returns {{success: boolean, macros: Array.<{name: string, comments: string, script: string}>}} Return value.
     */
    getMacros: function () {
        var result = [];
        try {
            var gr = new GlideRecordSecure('syntax_editor_macro');
            gr.addActiveQuery();
            gr.orderBy('name');
            gr.query();
            while (gr.next()) {
                var script = gr.getValue('text') || '';
                if (!script) {
                    continue;
                }
                result.push({
                    name: gr.getValue('name') || '',
                    comments: gr.getValue('comments') || '',
                    script: script,
                });
            }
        } catch (e) {}
        return this._answer({ success: true, macros: result });
    },

    /**
     * Creates or updates an sp_widget record. Omit sys_id to create a new widget.
     * Only fields present in the allowed list (name, id, description, public, roles,
     * template, css, client_script, script, link) are written.
     * Accepts `sys_id` (optional, omit to create) and `data` (JSON-encoded field values to write).
     * @returns {{success: boolean, sys_id: string, sys_updated_on: string,
     *   sys_mod_count: string, update_set_sys_id: string|null, update_set_name: string|null}} Return value.
     */
    saveWidget: function () {
        if (this._getEditorTable() !== 'sp_widget') return this._saveEditorRecord(false);
        try {
            var sysId = this.getParameter('sys_id');
            var data;

            try {
                data = JSON.parse(this.getParameter('data') || '{}');
            } catch (e) {
                // Invalid JSON
                return this._answer({
                    success: false,
                    error: 'Invalid JSON payload',
                });
            }

            var gr = new GlideRecordSecure('sp_widget');
            var isNew = !sysId;
            if (isNew) {
                gr.initialize();
                if (!gr.canCreate()) {
                    return this._answer({
                        success: false,
                        error: 'Write permission denied. You do not have permission to create widgets.',
                    });
                }
            } else {
                if (!gr.get(sysId)) {
                    return this._answer({
                        success: false,
                        error: 'Widget not found or you lack read access.',
                    });
                }
                if (gr.getValue('servicenow') == '1') {
                    return this._answer({
                        success: false,
                        error: 'Write permission denied. Out-of-the-box ServiceNow widgets cannot be edited.',
                    });
                }
                if (!gr.canWrite()) {
                    return this._answer({
                        success: false,
                        error: 'Write permission denied. You lack the required role (sp_admin) to edit widgets.',
                    });
                }
            }

            var allowed = this._getAllowedWidgetFields();
            for (var i = 0; i < allowed.length; i++) {
                var f = allowed[i];
                if (data[f] !== undefined) {
                    this._setWidgetFieldValue(gr, f, data[f]);
                }
            }

            var resultId;
            if (isNew) {
                resultId = gr.insert();
                if (!resultId) {
                    return this._answer({
                        success: false,
                        error: 'Failed to create widget. Write permission denied.',
                    });
                }
                resultId = resultId + '';
            } else {
                if (!gr.update()) {
                    return this._answer({
                        success: false,
                        error: 'Save failed. Write permission denied. You may lack the sp_admin role.',
                    });
                }
                resultId = sysId;
            }
            // Re-read after update so the returned sys_updated_on reflects what the DB committed
            // (AJAX processor context may suppress auto-sys-field updates until commit).
            gr.get(resultId);
            var updateSetSysId = null;
            var updateSetName = null;
            try {
                var usId = new global.GlideUpdateSet().get();
                if (usId) {
                    var usGr = new GlideRecordSecure('sys_update_set');
                    if (usGr.get(usId)) {
                        updateSetSysId = usGr.getUniqueValue();
                        updateSetName = usGr.getValue('name');
                    }
                }
            } catch (e) {}
            return this._answer({
                success: true,
                sys_id: resultId,
                sys_updated_on: gr.getValue('sys_updated_on') || '',
                sys_mod_count: gr.getValue('sys_mod_count') || '',
                update_set_sys_id: updateSetSysId,
                update_set_name: updateSetName,
            });
        } catch (ex) {
            return this._answer({
                success: false,
                error: 'Save failed: ' + (ex.message || 'Server error occurred'),
            });
        }
    },

    /**
     * Saves a single allowed field on an sp_widget record.
     * Accepts `sys_id` (sp_widget sys_id), `field` (name to update, must be in the allowed list),
     * and `value` (new field value).
     * @returns {{success: boolean, sys_updated_on: string, sys_mod_count: string}} Return value.
     */
    saveField: function () {
        if (this._getEditorTable() !== 'sp_widget') return this._saveEditorRecord(true);
        try {
            var sysId = this.getParameter('sys_id');
            var field = String(this.getParameter('field'));
            var value = this.getParameter('value');
            if (!sysId || !field) {
                return this._answer({
                    success: false,
                    error: 'Missing required parameters',
                });
            }

            var allowed = this._getAllowedWidgetFields();
            if (allowed.indexOf(field) === -1) {
                return this._answer({
                    success: false,
                    error: 'Field not allowed: ' + field,
                });
            }

            var gr = new GlideRecordSecure('sp_widget');
            if (!gr.get(sysId)) {
                return this._answer({
                    success: false,
                    error: 'Widget not found or you lack read access.',
                });
            }

            if (gr.getValue('servicenow') == '1') {
                return this._answer({
                    success: false,
                    error: 'Write permission denied. Out-of-the-box ServiceNow widgets cannot be edited.',
                });
            }

            if (!gr.canWrite()) {
                return this._answer({
                    success: false,
                    error: 'Write permission denied. You lack the required role (sp_admin) to edit widgets.',
                });
            }

            this._setWidgetFieldValue(gr, field, value);
            gr.setValue('sys_mod_count', parseInt(gr.getValue('sys_mod_count') || '0', 10) + 1);
            if (!gr.update()) {
                return this._answer({
                    success: false,
                    error: 'Save failed. Write permission denied. You may lack the sp_admin role.',
                });
            }
            // Re-read so returned sys_updated_on reflects the committed value.
            gr.get(sysId);
            return this._answer({
                success: true,
                sys_updated_on: gr.getValue('sys_updated_on') || '',
                sys_mod_count: gr.getValue('sys_mod_count') || '',
            });
        } catch (ex) {
            return this._answer({
                success: false,
                error: 'Save failed: ' + (ex.message || 'Server error occurred'),
            });
        }
    },

    ////////////////////////////////////////////////////////////
    // Versions
    ////////////////////////////////////////////////////////////

    /**
     * Resolves the two sys_update_version records needed to compare a Customer
     * Update with the state immediately before its update set.
     * Accepts `update_id` (sys_update_xml sys_id).
     *
     * @returns {{success: boolean, table: string, record_id: string,
     *   version_1: string, version_2: string, error: string}} Comparison target.
     */
    getCustomerUpdateComparison: function () {
        var updateId = this.getParameter('update_id');
        var update = new GlideRecordSecure('sys_update_xml');
        if (!updateId || !update.get(updateId)) {
            return this._answer({
                success: false,
                error: 'Customer update not found.',
            });
        }

        var targetRecord = this._parseCustomerUpdateTarget(update.getValue('payload'));
        if (!targetRecord) {
            return this._answer({
                success: false,
                error: 'The customer update payload has no target record.',
            });
        }

        var name = update.getValue('name');
        var updateSet = update.getValue('update_set') || update.getValue('remote_update_set');
        var payload = update.getValue('payload');
        var target = null;

        // Prefer the same relationship used by the platform: Customer Update is
        // one final payload per object/update set; Versions uses that set as its
        // source. Retrieved/moved updates fall back to exact payload matching.
        if (name && updateSet) {
            var bySource = new GlideRecordSecure('sys_update_version');
            bySource.addQuery('name', name);
            bySource.addQuery('source', updateSet);
            bySource.orderByDesc('sys_recorded_at');
            bySource.setLimit(1);
            bySource.query();
            if (bySource.next()) {
                target = bySource;
            }
        }

        if (!target && name && payload) {
            var byPayload = new GlideRecordSecure('sys_update_version');
            byPayload.addQuery('name', name);
            byPayload.orderByDesc('sys_recorded_at');
            byPayload.query();
            while (byPayload.next()) {
                if (byPayload.getValue('payload') === payload) {
                    target = byPayload;
                    break;
                }
            }
        }

        if (!target) {
            return this._answer({
                success: false,
                error: 'Compare+ could not find the version captured by this customer update.',
            });
        }

        var recordedAt = target.getValue('sys_recorded_at');
        var firstInSetAt = recordedAt;
        var source = target.getValue('source');
        if (source) {
            var firstInSet = new GlideRecordSecure('sys_update_version');
            firstInSet.addQuery('name', name);
            firstInSet.addQuery('source', source);
            firstInSet.addQuery('sys_recorded_at', '<=', recordedAt);
            firstInSet.orderBy('sys_recorded_at');
            firstInSet.setLimit(1);
            firstInSet.query();
            if (firstInSet.next()) {
                firstInSetAt = firstInSet.getValue('sys_recorded_at');
            }
        }

        var previous = new GlideRecordSecure('sys_update_version');
        previous.addQuery('name', name);
        previous.addQuery('sys_recorded_at', '<', firstInSetAt);
        previous.orderByDesc('sys_recorded_at');
        previous.setLimit(1);
        previous.query();
        if (!previous.next()) {
            return this._answer({
                success: false,
                reason: 'no_previous_update_set',
                error: 'No previous update set found.',
            });
        }

        return this._answer({
            success: true,
            table: targetRecord.table,
            record_id: targetRecord.sys_id,
            version_1: previous.getUniqueValue(),
            version_2: target.getUniqueValue(),
        });
    },

    /**
     * Resolves a widget/header-footer target from a Customer Update.
     * Accepts `update_id` (sys_update_xml sys_id).
     * @returns {{success: boolean, record_id: string, error: string}} Target.
     */
    getCustomerUpdateWidgetTarget: function () {
        var updateId = this.getParameter('update_id');
        var update = new GlideRecordSecure('sys_update_xml');
        if (!updateId || !update.get(updateId)) {
            return this._answer({
                success: false,
                error: 'Customer update not found.',
            });
        }

        var target = this._parseCustomerUpdateTarget(update.getValue('payload'));
        if (!target || (target.table !== 'sp_widget' && target.table !== 'sp_header_footer')) {
            return this._answer({
                success: false,
                error: 'This customer update is not a widget or header/footer.',
            });
        }

        return this._answer({ success: true, record_id: target.sys_id });
    },

    /**
     * Resolves the target table and sys_id from a Customer Update.
     * Accepts `update_id` (sys_update_xml sys_id).
     * @returns {{success: boolean, table: string, record_id: string, error: string}} Target.
     */
    getCustomerUpdateTarget: function () {
        var updateId = this.getParameter('update_id');
        var update = new GlideRecordSecure('sys_update_xml');
        if (!updateId || !update.get(updateId)) {
            return this._answer({
                success: false,
                error: 'Customer update not found.',
            });
        }

        var target = this._parseCustomerUpdateTarget(update.getValue('payload'), update.getValue('name'));
        if (!target) {
            return this._answer({
                success: false,
                error: 'The customer update payload has no target record.',
            });
        }

        return this._answer({
            success: true,
            table: target.table,
            record_id: target.sys_id,
        });
    },

    /**
     * Returns all sys_update_version records for a given widget, ordered newest-first.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, versions: Array.<{sys_id: string, sys_created_on: string,
     *   sys_created_by: string, update_set_name: string, update_set_sys_id: string,
     *   update_set_state: string, update_set_state_label: string, state: string}>}} Return value.
     */
    getVersions: function () {
        var editorTable = this._getEditorTable();
        if (
            editorTable !== 'sp_widget' &&
            !Object.prototype.hasOwnProperty.call(this._getEditorProfiles(), editorTable)
        ) {
            return this._answer({ success: false, error: 'Record type not supported.' });
        }
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }

        var widgetGr = new GlideRecordSecure(editorTable);
        if (!widgetGr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Widget not found',
            });
        }
        // version name uses sys_class_name, e.g. sp_header_footer, not always sp_widget
        var className = widgetGr.getValue('sys_class_name') || editorTable;

        var versions = [];
        var gr = new GlideRecordSecure('sys_update_version');
        gr.addQuery('name', className + '_' + sysId);
        gr.addExtraField('source.name');
        gr.addExtraField('source.state');
        gr.orderByDesc('sys_created_on');
        gr.setLimit(this.RECORD_LIMIT);
        gr.query();

        while (gr.next()) {
            versions.push({
                sys_id: gr.getUniqueValue(),
                sys_created_on: gr.getValue('sys_created_on'),
                sys_created_by: gr.getValue('sys_created_by'),
                update_set_name: gr.source.name.getValue(),
                update_set_sys_id: gr.getValue('source') || gr.source.sys_id.getValue(),
                update_set_state: gr.source.state.getValue(),
                update_set_state_label: gr.source.state.getDisplayValue(),
                state: gr.getValue('state'),
            });
        }
        return this._answer({
            success: true,
            versions: versions,
        });
    },

    /**
     * Returns the metadata and parsed field values for a single sys_update_version record.
     * Accepts `version_id` (sys_update_version sys_id).
     * @returns {{success: boolean, sys_created_on: string, sys_created_by: string,
     *   update_set_name: string, update_set_sys_id: string,
     *   fields: {template: string, css: string, client_script: string, script: string,
     *   link: string, name: string, id: string, description: string,
     *   public: string, roles: string}}} Return value.
     */
    getVersion: function () {
        var versionId = this.getParameter('version_id');
        if (!versionId) {
            return this._answer({
                success: false,
                error: 'No version_id provided',
            });
        }

        var gr = new GlideRecordSecure('sys_update_version');
        if (!gr.get(versionId)) {
            return this._answer({
                success: false,
                error: 'Version not found',
            });
        }

        if (this._getEditorTable() !== 'sp_widget') {
            var editorTable = this._getEditorTable();
            var editorProfiles = this._getEditorProfiles();
            var profile =
                Object.prototype.hasOwnProperty.call(editorProfiles, editorTable) && editorProfiles[editorTable];
            var recordId = String(this.getParameter('sys_id') || '');
            if (!profile || gr.getValue('name') !== editorTable + '_' + recordId)
                return this._answer({ success: false, error: 'Version does not belong to this record.' });
            var current = new GlideRecordSecure(editorTable);
            if (!current.get(recordId) || !current.canRead())
                return this._answer({ success: false, error: 'Record not found or access denied.' });
            var parsed = this._parseVersionPayloadAll(gr.getValue('payload')).fields;
            var fields = {};
            this._getEditorFieldDefs(current, profile).forEach(function (def) {
                if (parsed[def.name] !== undefined) fields[def.name] = parsed[def.name];
            });
            return this._answer({
                success: true,
                fields: fields,
                sys_created_on: gr.getValue('sys_created_on'),
                sys_created_by: gr.getValue('sys_created_by'),
                update_set_name: gr.source.name.getValue(),
            });
        }

        return this._answer({
            success: true,
            sys_created_on: gr.getValue('sys_created_on'),
            sys_created_by: gr.getValue('sys_created_by'),
            update_set_name: gr.source.name.getValue(),
            update_set_sys_id: gr.getValue('source') || gr.source.sys_id.getValue(),
            fields: this._parseVersionPayload(gr.getValue('payload')),
        });
    },

    ////////////////////////////////////////////////////////////
    // Generic Diff support
    ////////////////////////////////////////////////////////////

    // Tables allowed for comparison. Empty array = all valid tables allowed.
    DIFF_ALLOWED_TABLES: [],

    /**
     * Returns ordered field definitions for the diff page, based on the table's Default view.
     * Always validates the table against DIFF_ALLOWED_TABLES.
     * Accepts `table` (ServiceNow table name).
     * @returns {{success: boolean, fields: Array.<{key: string, label: string, type: string,
     *   max_length: number, reference: string, renderAs: string, language: string}>,
     *   table_label: string}} Return value.
     */
    getDiffFieldDefs: function () {
        return this._answer(this._getDiffFieldDefs(String(this.getParameter('table') || 'sp_widget')));
    },

    _getDiffFieldDefs: function (table) {
        if (this.DIFF_ALLOWED_TABLES.length > 0 && this.DIFF_ALLOWED_TABLES.indexOf(table) === -1) {
            return {
                success: false,
                error: 'Table not allowed: ' + table,
            };
        }

        var labelGr = new GlideRecord('sys_db_object');
        if (!labelGr.get('name', table)) {
            return {
                success: false,
                error: 'Table not found: ' + table,
            };
        }

        var fieldNames = [];
        var ueGr = new GlideRecordSecure('sys_ui_element');
        ueGr.addQuery('sys_ui_section.name', table);
        ueGr.addQuery('sys_ui_section.view', 'Default view');
        ueGr.addQuery('type', '');
        ueGr.orderBy('position');
        ueGr.query();
        while (ueGr.next()) {
            var elem = ueGr.getValue('element');
            if (elem && elem.indexOf('.') === -1 && fieldNames.indexOf(elem) === -1) {
                fieldNames.push(elem);
            }
        }

        if (fieldNames.length === 0) {
            return {
                success: false,
                error: 'No Default view fields found for table: ' + table,
            };
        }

        // Queries the full table hierarchy so inherited fields (e.g. active from sys_metadata) get the correct type/renderAs.
        var _fdHierArr = [];
        try {
            if (typeof TableUtils !== 'undefined') {
                var _fdHierList = new TableUtils(table).getHierarchy();
                for (var _fdH = 0; _fdH < _fdHierList.size(); _fdH++) {
                    _fdHierArr.push(String(_fdHierList.get(_fdH)));
                }
            } else {
                var _fdHierList = new GlideTableHierarchy(table).getHierarchy();
                for (var _fdH = 0; _fdH < _fdHierList.length; _fdH++) {
                    _fdHierArr.push(String(_fdHierList[_fdH]));
                }
            }
        } catch (_fdErr) {
            _fdHierArr = [table];
        }
        // Queries each hierarchy level separately (leaf first) so leaf-table definitions take precedence.
        var dictMap = {};
        for (var _fdI = 0; _fdI < _fdHierArr.length; _fdI++) {
            var dictGr = new GlideRecord('sys_dictionary');
            dictGr.addQuery('name', _fdHierArr[_fdI]);
            dictGr.addNotNullQuery('element');
            dictGr.addQuery('internal_type', '!=', 'collection');
            dictGr.query();
            while (dictGr.next()) {
                var dElem = dictGr.getValue('element');
                if (!dElem || dictMap[dElem]) {
                    continue; // skip if already set by a more-derived table
                }
                dictMap[dElem] = {
                    type: dictGr.getValue('internal_type') || 'string',
                    max_length: parseInt(dictGr.getValue('max_length') || '0', 10) || 0,
                    reference: dictGr.getValue('reference') || '',
                    choice: parseInt(dictGr.getValue('choice') || '0', 10) || 0,
                    dependent: dictGr.getValue('dependent') || '',
                };
            }
        }

        // Get field labels via GlideElement.getLabel() on a temporary record
        var demoGr = new GlideRecordSecure(table);
        demoGr.initialize();

        var CODE_TYPES = ['script', 'script_plain', 'css', 'html', 'html_script', 'html_template', 'xml', 'json'];

        var _buildDef = function (fname, dict) {
            var fieldType = dict.type || 'string';
            var maxLen = dict.max_length || 0;
            var refTable = dict.reference || '';
            var label = fname;
            try {
                label = demoGr[fname].getLabel() || fname;
            } catch (e) {}
            var renderAs = 'text';
            if (
                fieldType === 'conditions' ||
                fieldType === 'rebuilt_conditions' ||
                fieldType === 'variable_conditions'
            ) {
                renderAs = 'conditions';
            } else if (fieldType === 'boolean') {
                renderAs = 'boolean';
            } else if (CODE_TYPES.indexOf(fieldType) !== -1) {
                renderAs = 'code';
            } else if (fieldType === 'glide_list') {
                renderAs = 'list';
            } else if (fieldType === 'reference') {
                renderAs = 'reference';
            } else if (fieldType === 'user_image') {
                renderAs = 'image';
            } else if (dict.choice > 0) {
                renderAs = 'choice';
            } else if (fieldType === 'properties' || (fieldType === 'string' && maxLen > 100)) {
                renderAs = 'textarea';
            }
            var language = 'plaintext';
            if (fieldType === 'css') {
                language = 'css';
            } else if (fieldType === 'html' || fieldType === 'html_script' || fieldType === 'html_template') {
                language = 'html';
            } else if (fieldType === 'json') {
                language = 'json';
            } else if (fieldType === 'script' || fieldType === 'script_plain' || fieldType === 'xml') {
                language = 'javascript';
            }
            return {
                key: fname,
                label: label,
                type: fieldType,
                max_length: maxLen,
                reference: refTable,
                renderAs: renderAs,
                language: language,
                dependent: dict.dependent || '',
            };
        };

        var fieldDefs = [];
        for (var i = 0; i < fieldNames.length; i++) {
            var fname = fieldNames[i];
            fieldDefs.push(_buildDef(fname, dictMap[fname] || {}));
        }

        // Build extra field defs: all fields NOT in the layout and NOT system metadata.
        var SYS_SKIP_FIELDS = [
            'sys_id',
            'sys_created_on',
            'sys_created_by',
            'sys_updated_on',
            'sys_updated_by',
            'sys_mod_count',
            'sys_tags',
            'sys_class_name',
            'sys_package',
            'sys_policy',
            'sys_replace_on_upgrade',
            'sys_scope',
            'sys_overrides',
            'sys_customer_update',
            'sys_domain',
            'sys_domain_path',
            'sys_view',
        ];
        var layoutKeySet = {};
        for (var li = 0; li < fieldNames.length; li++) {
            layoutKeySet[fieldNames[li]] = true;
        }

        var extraFieldDefs = [];
        var allElemKeys = Object.keys(dictMap).sort();
        for (var ei = 0; ei < allElemKeys.length; ei++) {
            var eKey = allElemKeys[ei];
            if (layoutKeySet[eKey]) {
                continue;
            }
            if (SYS_SKIP_FIELDS.indexOf(eKey) !== -1) {
                continue;
            }
            extraFieldDefs.push(_buildDef(eKey, dictMap[eKey]));
        }

        var tableLabel = '';
        try {
            tableLabel = demoGr.getClassDisplayValue() || table;
        } catch (e) {
            tableLabel = table;
        }

        return {
            success: true,
            fields: fieldDefs,
            extra_fields: extraFieldDefs,
            table_label: tableLabel,
        };
    },

    /**
     * Returns the list of tables available for diff comparison.
     * If DIFF_ALLOWED_TABLES is non-empty, returns only those tables filtered by search.
     * Otherwise searches sys_db_object for tables whose label or name contains the search term.
     * Accepts `search` (optional substring to filter by table label or name).
     * @returns {{success: boolean, tables: Array.<{name: string, label: string}>}} Return value.
     */
    getTablesForDiff: function () {
        var search = String(this.getParameter('search') || '').toLowerCase();
        var page = parseInt(this.getParameter('page') || '1', 10) || 1;
        var pageSize = 50;
        var results = [];
        var allowed = this.DIFF_ALLOWED_TABLES;

        if (allowed.length > 0) {
            for (var i = 0; i < allowed.length; i++) {
                var tableName = allowed[i];
                var dictGr = new GlideRecord('sys_dictionary');
                dictGr.addQuery('name', tableName);
                dictGr.addQuery('internal_type', 'collection');
                dictGr.addQuery('attributes', 'CONTAINS', 'update_synch=true');
                dictGr.setLimit(1);
                dictGr.query();
                if (!dictGr.next()) {
                    continue;
                }
                var labelGr = new GlideRecord('sys_db_object');
                var label = labelGr.get('name', tableName) ? labelGr.getDisplayValue('label') || tableName : tableName;
                if (
                    !search ||
                    label.toLowerCase().indexOf(search) !== -1 ||
                    tableName.toLowerCase().indexOf(search) !== -1
                ) {
                    results.push({ name: tableName, label: label });
                }
            }
            var offset = (page - 1) * pageSize;
            var hasMore = results.length > offset + pageSize;
            results = results.slice(offset, offset + pageSize);
        } else {
            var offset = (page - 1) * pageSize;
            var dbGr = new GlideRecordSecure('sys_db_object');
            var joinGr = dbGr.addJoinQuery('sys_dictionary', 'name', 'name');
            joinGr.addCondition('internal_type', 'collection');
            joinGr.addCondition('attributes', 'CONTAINS', 'update_synch=true');
            if (search) {
                var qc = dbGr.addQuery('label', 'CONTAINS', search);
                qc.addOrCondition('name', 'CONTAINS', search);
            }
            dbGr.orderBy('label');
            dbGr.chooseWindow(offset, offset + pageSize + 1);
            dbGr.query();
            while (dbGr.next()) {
                results.push({
                    name: dbGr.getValue('name'),
                    label: dbGr.getDisplayValue('label') || dbGr.getValue('name'),
                });
            }
            var hasMore = results.length > pageSize;
            if (hasMore) {
                results.pop();
            }
        }

        return this._answer({
            success: true,
            tables: results,
            has_more: hasMore,
        });
    },

    /**
     * Returns the current field values for a single record on any allowed table.
     * Also returns metadata (name, canWrite, sys_policy, update set).
     * Accepts `table` (ServiceNow table name) and `record_id` (sys_id of the record).
     * @returns {{success: boolean, record: {sys_id: string, name: string, values: Object,
     *   sys_updated_on: string, sys_updated_by: string, canWrite: boolean,
     *   sys_policy: string, sys_policy_display: string,
     *   update_set_sys_id: string, update_set_name: string}}} Return value.
     */
    getRecordForDiff: function () {
        var table = String(this.getParameter('table') || 'sp_widget');
        var recordId = String(this.getParameter('record_id') || '');
        if (this.DIFF_ALLOWED_TABLES.length > 0 && this.DIFF_ALLOWED_TABLES.indexOf(table) === -1) {
            return this._answer({
                success: false,
                error: 'Table not allowed: ' + table,
            });
        }
        if (!recordId) {
            return this._answer({
                success: false,
                error: 'No record_id provided',
            });
        }

        var gr = new GlideRecordSecure(table);
        if (!gr.get(recordId)) {
            return this._answer({
                success: false,
                error: 'Record not found or access denied (' + table + ': ' + recordId + ')',
            });
        }

        // Queries the full table hierarchy via sys_dictionary so inherited fields (e.g. sys_scope) are included.
        var values = {};
        var displayValues = {};
        // Convert the GlideTableHierarchy/TableUtils list to a plain JS array of strings
        var _hierArr = [];
        try {
            if (typeof TableUtils !== 'undefined') {
                var _hierList = new TableUtils(table).getHierarchy();
                for (var _h = 0; _h < _hierList.size(); _h++) {
                    _hierArr.push(String(_hierList.get(_h)));
                }
            } else {
                var _hierList = new GlideTableHierarchy(table).getHierarchy();
                for (var _h = 0; _h < _hierList.length; _h++) {
                    _hierArr.push(String(_hierList[_h]));
                }
            }
        } catch (_hierErr) {
            _hierArr = [table];
        }
        var fdGr = new GlideRecord('sys_dictionary');
        fdGr.addQuery('name', 'IN', _hierArr.join(','));
        fdGr.addNotNullQuery('element');
        fdGr.addQuery('internal_type', '!=', 'collection');
        fdGr.query();
        while (fdGr.next()) {
            var fName = fdGr.getValue('element');
            if (!fName) {
                continue;
            }
            try {
                var v = gr.getValue(fName);
                values[fName] = v !== null && v !== undefined ? v : null;
                var fType = fdGr.getValue('internal_type');
                var fChoice = parseInt(fdGr.getValue('choice') || '0', 10) || 0;
                if (fType === 'reference' || fType === 'glide_list' || fChoice > 0) {
                    displayValues[fName] = gr.getDisplayValue(fName) || '';
                }
            } catch (e) {}
        }

        // sp_widget compatibility: expose is_public
        if (table === 'sp_widget') {
            values['is_public'] = gr.getValue('public') == '1';
        }

        var sysPolicy = gr.getValue('sys_policy') || '';
        var sysPolicyDisplay = sysPolicy ? gr.getDisplayValue('sys_policy') : '';

        // Find latest update set via sys_update_xml
        var ussId = '',
            ussName = '';
        var uxGr = new GlideRecordSecure('sys_update_xml');
        uxGr.addQuery('name', table + '_' + recordId);
        uxGr.orderByDesc('sys_created_on');
        uxGr.setLimit(1);
        uxGr.query();
        if (uxGr.next()) {
            var setId = uxGr.getValue('update_set');
            var usGr = new GlideRecordSecure('sys_update_set');
            if (usGr.get(setId)) {
                ussId = usGr.getUniqueValue();
                ussName = usGr.getValue('name');
            }
        }

        return this._answer({
            success: true,
            record: {
                sys_id: gr.getUniqueValue(),
                name: gr.getDisplayValue() || '',
                es12_override: new WidgetEditorAssistantAjax()._getExportEs12Override(recordId),
                values: values,
                display_values: displayValues,
                sys_updated_on: gr.getValue('sys_updated_on') || '',
                sys_updated_by: gr.getValue('sys_updated_by') || '',
                canWrite: gr.canWrite(),
                sys_policy: sysPolicy,
                sys_policy_display: sysPolicyDisplay,
                update_set_sys_id: ussId,
                update_set_name: ussName,
            },
        });
    },

    /**
     * Returns a map of field names to display labels for a given table.
     * Accepts `table` (ServiceNow table name).
     * @returns {{success: boolean, labels: Object}} Return value.
     */
    getFieldLabels: function () {
        var table = String(this.getParameter('table') || '');
        if (!table) {
            return this._answer({
                success: false,
                error: 'No table provided',
            });
        }
        var gr = new GlideRecordSecure(table);
        gr.initialize();

        var labels = {};
        var fields = {};
        var _hierArr = [];
        try {
            if (typeof TableUtils !== 'undefined') {
                var _hierList = new TableUtils(table).getHierarchy();
                for (var _h = 0; _h < _hierList.size(); _h++) {
                    _hierArr.push(String(_hierList.get(_h)));
                }
            } else {
                var _hierList = new GlideTableHierarchy(table).getHierarchy();
                for (var _h = 0; _h < _hierList.length; _h++) {
                    _hierArr.push(String(_hierList[_h]));
                }
            }
        } catch (e) {
            _hierArr = [table];
        }

        var dictGr = new GlideRecord('sys_dictionary');
        dictGr.addQuery('name', 'IN', _hierArr.join(','));
        dictGr.addNotNullQuery('element');
        dictGr.query();
        while (dictGr.next()) {
            var fName = dictGr.getValue('element');
            if (fName) {
                var label = fName;
                try {
                    label = gr[fName].getLabel() || fName;
                } catch (e) {}
                labels[fName] = label;
                fields[fName] = {
                    label: label,
                    type: dictGr.getValue('internal_type') || 'string',
                    reference: dictGr.getValue('reference') || '',
                    choice: parseInt(dictGr.getValue('choice') || '0', 10) || 0,
                };
            }
        }
        return this._answer({
            success: true,
            labels: labels,
            fields: fields,
        });
    },

    /**
     * Resolves raw condition values (Sys IDs or choices) to human-readable display values.
     * Accepts `table` (ServiceNow table name) and `conditions` (JSON string array of field/value pairs).
     * @returns {{success: boolean, results: Object}} Return value.
     */
    resolveConditionDisplayValues: function () {
        var table = String(this.getParameter('table') || '');
        var conditionsJson = String(this.getParameter('conditions') || '[]');
        if (!table || !conditionsJson) {
            return this._answer({ success: false, results: {} });
        }
        var conditions = [];
        try {
            conditions = JSON.parse(conditionsJson);
        } catch (e) {
            return this._answer({
                success: false,
                error: 'Invalid conditions JSON',
            });
        }

        var gr = new GlideRecordSecure(table);
        gr.initialize();

        var results = {};

        var hierarchy = [];
        try {
            if (typeof TableUtils !== 'undefined') {
                var list = new TableUtils(table).getHierarchy();
                for (var h = 0; h < list.size(); h++) {
                    hierarchy.push(String(list.get(h)));
                }
            } else {
                var list = new GlideTableHierarchy(table).getHierarchy();
                for (var h = 0; h < list.length; h++) {
                    hierarchy.push(String(list[h]));
                }
            }
        } catch (e) {
            hierarchy = [table];
        }

        for (var i = 0; i < conditions.length; i++) {
            var item = conditions[i];
            var f = item.field;
            var val = item.value;
            if (!f || val === undefined || val === null || val === '') {
                continue;
            }
            var key = f + '|||' + val;
            if (results[key]) {
                continue;
            }

            try {
                if (!gr.isValidField(f)) {
                    results[key] = val;
                    continue;
                }

                // Get field dictionary info
                var refTable = '';
                var isChoice = false;
                var dict = new GlideRecord('sys_dictionary');
                dict.addQuery('name', 'IN', hierarchy.join(','));
                dict.addQuery('element', f);
                dict.query();
                if (dict.next()) {
                    refTable = dict.getValue('reference') || '';
                    isChoice = parseInt(dict.getValue('choice') || '0', 10) > 0;
                }

                if (refTable) {
                    var valParts = val.split(',');
                    var displayParts = [];
                    for (var p = 0; p < valParts.length; p++) {
                        var part = valParts[p].trim();
                        if (/^[0-9a-f]{32}$/i.test(part)) {
                            var refGr = new GlideRecordSecure(refTable);
                            if (refGr.get(part)) {
                                displayParts.push(refGr.getDisplayValue() || part);
                            } else {
                                displayParts.push(part);
                            }
                        } else {
                            displayParts.push(part);
                        }
                    }
                    results[key] = displayParts.join(', ');
                } else if (isChoice) {
                    gr.setValue(f, val);
                    results[key] = gr.getDisplayValue(f) || val;
                } else {
                    gr.setValue(f, val);
                    var dVal = gr.getDisplayValue(f);
                    results[key] = dVal || val;
                }
            } catch (ex) {
                results[key] = val;
            }
        }

        return this._answer({ success: true, results: results });
    },

    /**
     * Returns label/type metadata for a set of catalog item variables (item_option_new), for
     * rendering variable_conditions fields with the same builder used for table-field conditions.
     * Accepts `variables` (JSON string array of item_option_new Sys IDs).
     * @returns {{success: boolean, variables: Object}} Return value.
     */
    getVariableLabels: function () {
        var variablesJson = String(this.getParameter('variables') || '[]');
        var variableIds = [];
        try {
            variableIds = JSON.parse(variablesJson);
        } catch (e) {
            return this._answer({
                success: false,
                error: 'Invalid variables JSON',
            });
        }
        variableIds = variableIds.filter(function (id) {
            return /^[0-9a-f]{32}$/i.test(id);
        });
        if (!variableIds.length) {
            return this._answer({ success: true, variables: {} });
        }

        var variables = {};
        var gr = new GlideRecordSecure('item_option_new');
        gr.addQuery('sys_id', 'IN', variableIds.join(','));
        gr.query();
        while (gr.next()) {
            var id = gr.getUniqueValue();
            var choiceGr = new GlideRecordSecure('question_choice');
            choiceGr.addQuery('question', id);
            choiceGr.setLimit(1);
            choiceGr.query();
            variables[id] = {
                label: gr.getValue('question_text') || gr.getValue('name') || id,
                name: gr.getValue('name') || '',
                type: gr.getValue('type') || '',
                reference: gr.getValue('reference') || '',
                isChoice: choiceGr.hasNext(),
            };
        }
        return this._answer({ success: true, variables: variables });
    },

    /**
     * Resolves raw variable_conditions values (question_choice values or reference Sys IDs) to
     * human-readable display values, mirroring resolveConditionDisplayValues for table fields.
     * Accepts `pairs` (JSON string array of {variable, value} objects).
     * @returns {{success: boolean, results: Object}} Return value.
     */
    resolveVariableConditionDisplayValues: function () {
        var pairsJson = String(this.getParameter('pairs') || '[]');
        var pairs = [];
        try {
            pairs = JSON.parse(pairsJson);
        } catch (e) {
            return this._answer({
                success: false,
                error: 'Invalid pairs JSON',
            });
        }

        var results = {};
        for (var i = 0; i < pairs.length; i++) {
            var item = pairs[i];
            var variableId = item.variable;
            var val = item.value;
            if (!variableId || val === undefined || val === null || val === '') {
                continue;
            }
            var key = variableId + '|||' + val;
            if (results[key]) {
                continue;
            }

            try {
                var varGr = new GlideRecordSecure('item_option_new');
                if (!varGr.get(variableId)) {
                    results[key] = val;
                    continue;
                }
                var refTable = varGr.getValue('reference') || '';

                if (refTable) {
                    var valParts = val.split(',');
                    var displayParts = [];
                    for (var p = 0; p < valParts.length; p++) {
                        var part = valParts[p].trim();
                        if (/^[0-9a-f]{32}$/i.test(part)) {
                            var refGr = new GlideRecordSecure(refTable);
                            displayParts.push(refGr.get(part) ? refGr.getDisplayValue() || part : part);
                        } else {
                            displayParts.push(part);
                        }
                    }
                    results[key] = displayParts.join(', ');
                    continue;
                }

                var choiceGr = new GlideRecordSecure('question_choice');
                choiceGr.addQuery('question', variableId);
                choiceGr.addQuery('value', val);
                choiceGr.query();
                results[key] = choiceGr.next() ? choiceGr.getValue('text') || val : val;
            } catch (ex) {
                results[key] = val;
            }
        }

        return this._answer({ success: true, results: results });
    },

    /**
     * Returns a list of records from any allowed table for the compare picker.
     * Accepts `table` (ServiceNow table name) and `search` (optional substring to filter by name).
     * @returns {{success: boolean, records: Array.<{sys_id: string, name: string}>}} Return value.
     */
    getRecordsForTable: function () {
        var table = String(this.getParameter('table') || 'sp_widget');
        var search = String(this.getParameter('search') || '');
        var page = parseInt(this.getParameter('page') || '1', 10) || 1;
        var pageSize = 50;
        if (this.DIFF_ALLOWED_TABLES.length > 0 && this.DIFF_ALLOWED_TABLES.indexOf(table) === -1) {
            return this._answer({
                success: false,
                error: 'Table not allowed: ' + table,
            });
        }

        var offset = (page - 1) * pageSize;
        var gr = new GlideRecordSecure(table);
        if (search) {
            gr.addQuery('name', 'CONTAINS', search);
        }
        gr.orderBy('name');
        gr.chooseWindow(offset, offset + pageSize + 1);
        gr.query();

        var records = [];
        while (gr.next()) {
            records.push({
                sys_id: gr.getUniqueValue(),
                name: gr.getValue('name') || gr.getDisplayValue(),
            });
        }
        var hasMore = records.length > pageSize;
        if (hasMore) {
            records.pop();
        }
        return this._answer({
            success: true,
            records: records,
            has_more: hasMore,
        });
    },

    /**
     * Returns the version history for a record on any allowed table, ordered newest-first.
     * Uses sys_update_version where name = '<table>_<record_id>'.
     * Accepts `table` (ServiceNow table name) and `record_id` (sys_id of the record).
     * @returns {{success: boolean, versions: Array.<{sys_id: string, sys_created_on: string,
     *   sys_created_by: string, update_set_name: string, update_set_sys_id: string,
     *   update_set_state: string, update_set_state_label: string, state: string}>}} Return value.
     */
    getVersionsForTable: function () {
        var table = String(this.getParameter('table') || 'sp_widget');
        var recordId = String(this.getParameter('record_id') || '');
        if (this.DIFF_ALLOWED_TABLES.length > 0 && this.DIFF_ALLOWED_TABLES.indexOf(table) === -1) {
            return this._answer({
                success: false,
                error: 'Table not allowed: ' + table,
            });
        }
        if (!recordId) {
            return this._answer({
                success: false,
                error: 'No record_id provided',
            });
        }

        var versions = [];
        var gr = new GlideRecordSecure('sys_update_version');
        gr.addQuery('name', table + '_' + recordId);
        gr.addExtraField('source.name');
        gr.addExtraField('source.state');
        gr.orderByDesc('sys_created_on');
        gr.setLimit(this.RECORD_LIMIT);
        gr.query();
        while (gr.next()) {
            versions.push({
                sys_id: gr.getUniqueValue(),
                sys_created_on: gr.getValue('sys_created_on'),
                sys_created_by: gr.getValue('sys_created_by'),
                update_set_name: gr.source.name.getValue(),
                update_set_sys_id: gr.getValue('source') || gr.source.sys_id.getValue(),
                update_set_state: gr.source.state.getValue(),
                update_set_state_label: gr.source.state.getDisplayValue(),
                state: gr.getValue('state'),
            });
        }
        return this._answer({ success: true, versions: versions });
    },

    /**
     * Returns the metadata and all field values for a single sys_update_version record.
     * Parses all field elements from the XML payload without requiring a predefined list.
     * Accepts `version_id` (sys_update_version sys_id).
     * @returns {{success: boolean, sys_created_on: string, sys_created_by: string,
     *   update_set_name: string, update_set_sys_id: string,
     *   fields: Object.<string, string>}} Return value.
     */
    getVersionForTable: function () {
        var versionId = String(this.getParameter('version_id') || '');
        if (!versionId) {
            return this._answer({
                success: false,
                error: 'No version_id provided',
            });
        }

        var gr = new GlideRecordSecure('sys_update_version');
        if (!gr.get(versionId)) {
            return this._answer({ success: false, error: 'Version not found' });
        }

        var parsed = this._parseVersionPayloadAll(gr.getValue('payload'));

        // Choice fields in the XML payload are raw integers with no display_value; resolve labels via a temp GlideRecord.
        var versionName = gr.getValue('name') || '';
        var lastUnder = versionName.lastIndexOf('_');
        var tableName = lastUnder > 0 ? versionName.substring(0, lastUnder) : '';
        if (tableName) {
            try {
                var tempGr = new GlideRecord(tableName);
                tempGr.initialize();
                for (var _fk in parsed.fields) {
                    if (parsed.fields.hasOwnProperty(_fk)) {
                        try {
                            tempGr.setValue(_fk, parsed.fields[_fk]);
                        } catch (e) {}
                    }
                }
                for (var _fk2 in parsed.fields) {
                    if (!parsed.fields.hasOwnProperty(_fk2)) {
                        continue;
                    }
                    if (parsed.display_values[_fk2]) {
                        continue;
                    } // already resolved by XML attr
                    var _rawVal = parsed.fields[_fk2];
                    if (_rawVal === '' || _rawVal === null || _rawVal === undefined) {
                        continue;
                    }
                    try {
                        var _dv = tempGr.getDisplayValue(_fk2);
                        if (_dv && _dv !== String(_rawVal)) {
                            parsed.display_values[_fk2] = _dv;
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }

        return this._answer({
            success: true,
            sys_created_on: gr.getValue('sys_created_on'),
            sys_created_by: gr.getValue('sys_created_by'),
            update_set_name: gr.source.name.getValue(),
            update_set_sys_id: gr.getValue('source') || gr.source.sys_id.getValue(),
            fields: parsed.fields,
            display_values: parsed.display_values,
        });
    },

    /**
     * Parses all field name/value pairs from a sys_update_version XML payload.
     * Extracts every element at depth 2 (record_update/<table>/<field>).
     * @param {string} payload - Raw XML payload string.
     * @returns {Object} Map of field names to string values.
     */
    _parseVersionPayloadAll: function (payload) {
        var fields = {};
        var displayValues = {};
        if (!payload) {
            return { fields: fields, display_values: displayValues };
        }
        try {
            var xmlDoc = new XMLDocument2();
            xmlDoc.parseXML(payload);
            // XMLDocument2 only reliably supports descendant-or-self ("//") node lookups, not absolute XPaths or attribute predicates, so the table name is extracted from the payload with a regex instead.
            var tableNameMatch = payload.match(/<([a-z_][a-z0-9_]*)\s[^>]*action=/i);
            var tableName = tableNameMatch ? tableNameMatch[1] : '';
            if (!tableName) {
                return { fields: fields, display_values: displayValues };
            }
            var tableEl = xmlDoc.getFirstNode('//' + tableName);
            if (!tableEl) {
                return { fields: fields, display_values: displayValues };
            }
            var childIter = tableEl.getChildNodeIterator();
            while (childIter.hasNext()) {
                var child = childIter.next();
                var fieldName = child.getNodeName();
                if (!fieldName || fieldName === '#text') {
                    continue;
                }
                fields[fieldName] = child.getTextContent() || '';
                var dv = child.getAttribute('display_value');
                if (dv) {
                    displayValues[fieldName] = dv;
                }
            }
        } catch (e) {
            gs.error('WidgetEditorAjax: _parseVersionPayloadAll error: ' + e.message);
        }
        return { fields: fields, display_values: displayValues };
    },

    ////////////////////////////////////////////////////////////
    // Roles lookup
    ////////////////////////////////////////////////////////////

    /**
     * Returns sys_user_role names matching an optional search term. Capped at 100 results.
     * Accepts `term` (optional substring to filter role names).
     * @returns {{success: boolean, roles: Array.<string>}} Return value.
     */
    searchRoles: function () {
        var term = this.getParameter('term') || '';
        var gr = new GlideRecordSecure('sys_user_role');
        if (term) {
            gr.addQuery('name', 'CONTAINS', term);
        }
        gr.orderBy('name');
        gr.setLimit(100);
        gr.query();
        var roles = [];
        while (gr.next()) {
            roles.push(gr.getValue('name'));
        }
        return this._answer({ success: true, roles: roles });
    },

    ////////////////////////////////////////////////////////////
    // Presence
    ////////////////////////////////////////////////////////////

    /**
     * Returns other users currently present on the widget or its related Angular templates
     * and providers, by querying sys_amb_channel_presence across all relevant channels.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, users: Array.<{sys_id: string, name: string,
     *   initials: string, viewing: Array.<string>}>}} Return value.
     */
    getPresence: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }

        var currentUser = gs.getUserID();

        // /sn/rp/ is platform record presence; /sp/rp/ is the SP fallback.
        var channelLabels = {};
        channelLabels['/sn/rp/sp_widget/' + sysId] = 'Widget';
        channelLabels['/sp/rp/sp_widget/' + sysId] = 'Widget';

        var tGr = new GlideRecordSecure('sp_ng_template');
        tGr.addQuery('sp_widget', sysId);
        tGr.query();
        while (tGr.next()) {
            channelLabels['/sp/rp/sp_ng_template/' + tGr.getUniqueValue()] = tGr.getValue('id') + ' (Angular template)';
        }

        var m2m = new GlideRecordSecure('m2m_sp_ng_pro_sp_widget');
        m2m.addQuery('sp_widget', sysId);
        m2m.addExtraField('sp_angular_provider.name');
        m2m.query();
        while (m2m.next()) {
            var pId = m2m.getValue('sp_angular_provider');
            if (!pId) {
                continue;
            }
            channelLabels['/sp/rp/sp_angular_provider/' + pId] =
                (m2m.sp_angular_provider.name.getValue() || pId) + ' (Angular provider)';
        }

        var channels = Object.keys(channelLabels);

        var pr = new GlideRecordSecure('sys_amb_channel_presence');
        var qc = pr.addQuery('channel_id', 'STARTSWITH', channels[0]);
        for (var i = 1; i < channels.length; i++) {
            qc.addOrCondition('channel_id', 'STARTSWITH', channels[i]);
        }
        pr.addQuery('user', '!=', currentUser);
        pr.query();

        var userMap = {};
        var channelPrefixes = Object.keys(channelLabels);
        while (pr.next()) {
            var userId = pr.getValue('user');
            var channel = pr.getValue('channel_id');
            var label = null;
            for (var pi = 0; pi < channelPrefixes.length; pi++) {
                if (channel.indexOf(channelPrefixes[pi]) === 0) {
                    label = channelLabels[channelPrefixes[pi]];
                    break;
                }
            }
            if (!label) {
                continue;
            }
            if (!userMap[userId]) {
                userMap[userId] = {
                    sys_id: userId,
                    name: userId,
                    initials: '?',
                    viewing: [],
                };
            }
            if (userMap[userId].viewing.indexOf(label) === -1) {
                userMap[userId].viewing.push(label);
            }
        }

        var userIds = [];
        for (var k in userMap) {
            if (userMap.hasOwnProperty(k)) userIds.push(k);
        }
        if (userIds.length > 0) {
            var uGr = new GlideRecordSecure('sys_user');
            uGr.addQuery('sys_id', 'IN', userIds.join(','));
            uGr.query();
            while (uGr.next()) {
                var uid = uGr.getUniqueValue();
                if (userMap[uid]) {
                    var displayName = uGr.getDisplayValue('name');
                    userMap[uid].name = displayName;
                    userMap[uid].initials = this._getInitials(displayName);
                }
            }
            /* Drop entries whose sys_user record was not found */
            for (var di = 0; di < userIds.length; di++) {
                if (userMap[userIds[di]] && userMap[userIds[di]].name === userIds[di]) {
                    delete userMap[userIds[di]];
                }
            }
        }

        var users = [];
        for (var uid2 in userMap) {
            if (userMap.hasOwnProperty(uid2)) users.push(userMap[uid2]);
        }
        return this._answer({
            success: true,
            users: users,
        });
    },

    ////////////////////////////////////////////////////////////
    // ES12
    ////////////////////////////////////////////////////////////

    /**
     * Upserts a sys_es_latest_script record to enable or disable ES12 mode for a server-script record.
     * Never deletes the record; sets use_es_latest=false to disable.
     * Accepts `sys_id`, `record_table` (defaults to sp_widget) and `enabled` ('true' to enable).
     * @returns {{success: boolean, result: boolean}} Return value.
     */
    saveEs12: function () {
        var sysId = this.getParameter('sys_id');
        var enabled = this.getParameter('enabled') == 'true';
        var table = this._getEditorTable();
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }

        if (table !== 'sp_widget') {
            var profiles = this._getEditorProfiles();
            if (!Object.prototype.hasOwnProperty.call(profiles, table))
                return this._answer({ success: false, error: 'Record type not supported.' });
            var record = new GlideRecordSecure(table);
            if (
                !/^[a-f0-9]{32}$/i.test(sysId) ||
                !record.get(sysId) ||
                !record.canRead() ||
                !record.canWrite() ||
                (record.isValidField('sys_policy') && record.getValue('sys_policy')) ||
                !this._getEditorFieldDefs(record, profiles[table]).some(function (def) {
                    return def.scriptKind === 'server' && def.canWrite;
                })
            )
                return this._answer({ success: false, error: 'ES12 is not supported or write access is denied.' });
        }

        var gr = new GlideRecordSecure('sys_es_latest_script');
        gr.addQuery('id', sysId);
        gr.addQuery('table', table);
        gr.query();

        if (gr.next()) {
            gr.setValue('use_es_latest', enabled);
            if (!gr.update()) {
                return this._answer({
                    success: false,
                    error: 'Could not save ES12 setting.',
                });
            }
        } else {
            gr.initialize();
            gr.setValue('id', sysId);
            gr.setValue('table', table);
            gr.setValue('use_es_latest', enabled);
            if (!gr.insert()) {
                return this._answer({
                    success: false,
                    error: 'Could not create ES12 setting.',
                });
            }
        }
        return this._answer({
            success: true,
            result: enabled,
        });
    },

    ////////////////////////////////////////////////////////////
    // Angular Templates (sp_ng_template)
    ////////////////////////////////////////////////////////////

    /**
     * Returns all sp_ng_template records linked to a widget.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, templates: Array.<{sys_id: string, id: string,
     *   template: string, canDelete: boolean, volatility_level: string,
     *   volatility_level_display: string}>}} Return value.
     */
    getTemplates: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }

        var templates = [];
        var currentAppId = gs.getCurrentApplicationId();
        var gr = new GlideRecordSecure('sp_ng_template');
        gr.addQuery('sp_widget', sysId);
        gr.orderBy('id');
        gr.query();
        while (gr.next()) {
            var tNoWrite = !gr.canWrite();
            var tScopeMismatch = gr.getValue('sys_scope') !== currentAppId;
            templates.push({
                sys_id: gr.getUniqueValue(),
                id: gr.getValue('id'),
                template: gr.getValue('template') || '',
                canDelete: gr.canDelete(),
                readOnly: tNoWrite,
                readOnlyReason: tScopeMismatch ? 'scope' : tNoWrite ? 'access' : '',
                scopeName: tScopeMismatch ? gr.getDisplayValue('sys_scope') : '',
                volatility_level: '',
                volatility_level_display: '',
            });
        }

        if (templates.length > 0) {
            var tUpdateNames = [];
            for (var ti = 0; ti < templates.length; ti++) {
                tUpdateNames.push('sp_ng_template_' + templates[ti].sys_id);
            }
            var tVolGr = new GlideRecordSecure('sys_metadata_volatility');
            tVolGr.addQuery('sys_update_name', 'IN', tUpdateNames.join(','));
            tVolGr.query();
            while (tVolGr.next()) {
                var vName = tVolGr.getValue('sys_update_name');
                var vId = vName.replace('sp_ng_template_', '');
                for (var vi = 0; vi < templates.length; vi++) {
                    if (templates[vi].sys_id !== vId) {
                        continue;
                    }
                    var vLevel = tVolGr.getValue('volatility_level') || '';
                    templates[vi].volatility_level = vLevel;
                    templates[vi].volatility_level_display = vLevel ? tVolGr.getDisplayValue('volatility_level') : '';
                    break;
                }
            }
        }

        return this._answer({
            success: true,
            templates: templates,
        });
    },

    /**
     * Creates or updates an sp_ng_template record linked to a widget.
     * Omit data.sys_id to create a new template.
     * Accepts `sys_id` (parent sp_widget sys_id) and `data` (JSON-encoded object: { sys_id?, id, template? }).
     * @returns {{success: boolean, sys_id: string}} Return value.
     */
    saveTemplate: function () {
        var widgetSysId = this.getParameter('sys_id');
        var data = JSON.parse(this.getParameter('data') || '{}');
        if (!data.id) {
            return this._answer({
                success: false,
                error: 'Template ID is required',
            });
        }

        var gr = new GlideRecordSecure('sp_ng_template');
        if (data.sys_id) {
            if (!gr.get(data.sys_id)) {
                return this._answer({
                    success: false,
                    error: 'Template not found',
                });
            }
        } else {
            gr.initialize();
            gr.setValue('sp_widget', widgetSysId);
        }

        gr.setValue('id', data.id);
        if (data.template !== undefined) {
            gr.setValue('template', data.template);
        }

        var resultId = data.sys_id ? gr.update() : gr.insert();
        if (!resultId) {
            return this._answer({
                success: false,
                error: 'Could not save template.',
            });
        }
        return this._answer({
            success: true,
            sys_id: String(resultId),
        });
    },

    ////////////////////////////////////////////////////////////
    // Angular Providers (sp_angular_provider + m2m)
    ////////////////////////////////////////////////////////////

    /**
     * Returns all sp_angular_provider records linked to a widget via m2m_sp_ng_pro_sp_widget,
     * including a flag indicating whether each provider is shared with other widgets.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, providers: Array.<{sys_id: string, name: string,
     *   type: string, script: string, canDelete: boolean, linkedToOtherWidgets: boolean,
     *   volatility_level: string, volatility_level_display: string}>}} Return value.
     */
    getProviders: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }

        var providerIds = [];
        var m2m = new GlideRecordSecure('m2m_sp_ng_pro_sp_widget');
        m2m.addQuery('sp_widget', sysId);
        m2m.query();
        while (m2m.next()) {
            var pid = m2m.getValue('sp_angular_provider');
            if (pid && providerIds.indexOf(pid) === -1) providerIds.push(pid);
        }

        if (providerIds.length === 0) {
            return this._answer({ success: true, providers: [] });
        }

        var providerMap = {};
        var pCurrentAppId = gs.getCurrentApplicationId();
        var pGrBatch = new GlideRecordSecure('sp_angular_provider');
        pGrBatch.addQuery('sys_id', 'IN', providerIds.join(','));
        pGrBatch.orderBy('name');
        pGrBatch.query();
        var sortedProviderIds = [];
        while (pGrBatch.next()) {
            var pbId = pGrBatch.getUniqueValue();
            sortedProviderIds.push(pbId);
            var pNoWrite = !pGrBatch.canWrite();
            var pScopeMismatch = pGrBatch.getValue('sys_scope') !== pCurrentAppId;
            providerMap[pbId] = {
                sys_id: pbId,
                name: pGrBatch.getValue('name'),
                type: pGrBatch.getValue('type') || '',
                script: pGrBatch.getValue('script') || '',
                canDelete: pGrBatch.canDelete(),
                linkedToOtherWidgets: false,
                readOnly: pNoWrite,
                readOnlyReason: pScopeMismatch ? 'scope' : pNoWrite ? 'access' : '',
                scopeName: pScopeMismatch ? pGrBatch.getDisplayValue('sys_scope') : '',
                volatility_level: '',
                volatility_level_display: '',
            };
        }

        var pUpdateNames = [];
        for (var pi = 0; pi < providerIds.length; pi++) {
            pUpdateNames.push('sp_angular_provider_' + providerIds[pi]);
        }
        var pVolGr = new GlideRecordSecure('sys_metadata_volatility');
        pVolGr.addQuery('sys_update_name', 'IN', pUpdateNames.join(','));
        pVolGr.query();
        while (pVolGr.next()) {
            var pvName = pVolGr.getValue('sys_update_name');
            var pvId = pvName.replace('sp_angular_provider_', '');
            if (!providerMap[pvId]) {
                continue;
            }
            var pvLevel = pVolGr.getValue('volatility_level') || '';
            providerMap[pvId].volatility_level = pvLevel;
            providerMap[pvId].volatility_level_display = pvLevel ? pVolGr.getDisplayValue('volatility_level') : '';
        }

        var m2mOtherGr = new GlideRecordSecure('m2m_sp_ng_pro_sp_widget');
        m2mOtherGr.addQuery('sp_angular_provider', 'IN', providerIds.join(','));
        m2mOtherGr.addQuery('sp_widget', '!=', sysId);
        m2mOtherGr.query();
        while (m2mOtherGr.next()) {
            var linkedPid = m2mOtherGr.getValue('sp_angular_provider');
            if (providerMap[linkedPid]) providerMap[linkedPid].linkedToOtherWidgets = true;
        }

        var providers = [];
        for (var poi = 0; poi < sortedProviderIds.length; poi++) {
            if (providerMap[sortedProviderIds[poi]]) providers.push(providerMap[sortedProviderIds[poi]]);
        }
        return this._answer({
            success: true,
            providers: providers,
        });
    },

    /**
     * Creates or updates an sp_angular_provider record. On creation, also inserts
     * the m2m_sp_ng_pro_sp_widget linking record to the given widget.
     * Accepts `sys_id` (parent sp_widget sys_id) and `data` (JSON-encoded object: { sys_id?, name, type?, script? }).
     * @returns {{success: boolean, sys_id: string}} Return value.
     */
    saveProvider: function () {
        var widgetSysId = this.getParameter('sys_id');
        var data = JSON.parse(this.getParameter('data') || '{}');
        var isNew = !data.sys_id;
        if (!data.name) {
            return this._answer({
                success: false,
                error: 'Provider name is required',
            });
        }

        var gr = new GlideRecordSecure('sp_angular_provider');
        if (!isNew) {
            if (!gr.get(data.sys_id)) {
                return this._answer({
                    success: false,
                    error: 'Provider not found',
                });
            }
        } else {
            gr.initialize();
        }

        gr.setValue('name', data.name);
        if (data.type !== undefined) {
            gr.setValue('type', data.type);
        }
        if (data.script !== undefined) {
            gr.setValue('script', data.script);
        }

        var resultId = isNew ? gr.insert() : gr.update();
        if (!resultId) {
            return this._answer({
                success: false,
                error: 'Could not save provider.',
            });
        }
        resultId = String(resultId);
        if (isNew && widgetSysId) {
            var m2m = new GlideRecordSecure('m2m_sp_ng_pro_sp_widget');
            m2m.initialize();
            m2m.setValue('sp_angular_provider', resultId);
            m2m.setValue('sp_widget', widgetSysId);
            if (!m2m.insert()) {
                var removed = gr.deleteRecord();
                return this._answer({
                    success: false,
                    error: removed
                        ? 'Could not link provider. The new provider was removed; your edits are still unsaved.'
                        : 'Provider ' +
                          resultId +
                          ' was created but could not be linked or removed. Link it using Link existing provider.',
                });
            }
        }
        return this._answer({
            success: true,
            sys_id: resultId,
        });
    },

    /**
     * Fetches a sys_script_include record by sys_id or name.
     * Returns readOnly=true if canWrite() is false.
     * Accepts `sys_id` (optional sys_script_include sys_id) or `name` (Script Include name,
     * used if sys_id is not provided).
     * @returns {{success: boolean, si: {sys_id: string, name: string, script: string,
     *   readOnly: boolean, readOnlyReason: string, volatility_level: string,
     *   volatility_level_display: string}}} Return value.
     */
    getScriptInclude: function () {
        var sysId = this.getParameter('sys_id');
        var name = this.getParameter('name');
        if (!sysId && !name) {
            return this._answer({
                success: false,
                error: 'Missing sys_id or name',
            });
        }

        var gr = new GlideRecordSecure('sys_script_include');
        var found;
        if (sysId) {
            found = gr.get(sysId);
        } else {
            gr.addQuery('name', name);
            gr.setLimit(1);
            gr.query();
            found = gr.next();
        }
        if (!found) {
            return this._answer({
                success: false,
                error: 'Script Include not found',
            });
        }

        var noWrite = !gr.canWrite();
        var readOnly = noWrite;
        var siScopeMismatch = gr.getValue('sys_scope') !== gs.getCurrentApplicationId();
        var siReadOnlyReason = siScopeMismatch ? 'scope' : noWrite ? 'access' : '';
        var siScopeName = siScopeMismatch ? gr.getDisplayValue('sys_scope') : '';

        var siVolLevel = '';
        var siVolDisplay = '';
        var siVolGr = new GlideRecordSecure('sys_metadata_volatility');
        siVolGr.addQuery('sys_update_name', 'sys_script_include_' + gr.getUniqueValue());
        siVolGr.setLimit(1);
        siVolGr.query();
        if (siVolGr.next()) {
            siVolLevel = siVolGr.getValue('volatility_level') || '';
            siVolDisplay = siVolLevel ? siVolGr.getDisplayValue('volatility_level') : '';
        }

        return this._answer({
            success: true,
            si: {
                sys_id: gr.getUniqueValue(),
                name: gr.getValue('name'),
                script: gr.getValue('script') || '',
                readOnly: readOnly,
                readOnlyReason: siReadOnlyReason,
                scopeName: siScopeName,
                volatility_level: siVolLevel,
                volatility_level_display: siVolDisplay,
            },
        });
    },

    /**
     * Saves the script field of an existing sys_script_include record.
     * Update only — script includes cannot be created or deleted from this editor.
     * Accepts `sys_id` (sys_script_include sys_id) and `data` (JSON-encoded object: { script: string }).
     * @returns {{success: boolean}} Return value.
     */
    saveScriptInclude: function () {
        var sysId = this.getParameter('sys_id');
        var data = JSON.parse(this.getParameter('data') || '{}');
        if (!sysId) {
            return this._answer({ success: false, error: 'Missing sys_id' });
        }

        var gr = new GlideRecordSecure('sys_script_include');
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Script Include not found',
            });
        }
        if (!gr.canWrite()) {
            return this._answer({ success: false, error: 'No write access' });
        }

        gr.setValue('script', data.script || '');
        if (!gr.update()) {
            return this._answer({
                success: false,
                error: 'Could not save Script Include.',
            });
        }
        return this._answer({ success: true });
    },

    /**
     * Returns label, internal type, max length, mandatory flag, and reference table for a
     * single field from sys_dictionary. Used for inline hover documentation in JS editors.
     * Accepts `table` (table name) and `field` (element name).
     * @returns {{success: boolean, field: {label: string, type: string,
     *   max_length: number|null, mandatory: boolean, reference: string|null}}} Return value.
     */
    getFieldDictionary: function () {
        var table = this.getParameter('table');
        var field = this.getParameter('field');
        if (!table || !field) {
            return this._answer({ success: false, error: 'Missing params' });
        }
        var gr = new GlideRecord('sys_dictionary');
        gr.addQuery('name', table);
        gr.addQuery('element', field);
        gr.setLimit(1);
        gr.query();
        if (!gr.next()) {
            return this._answer({ success: false });
        }
        var maxLen = gr.getValue('max_length');
        return this._answer({
            success: true,
            field: {
                label: gr.getValue('column_label') || field,
                type: gr.getValue('internal_type') || '',
                max_length: maxLen ? parseInt(maxLen, 10) : null,
                mandatory: gr.getValue('mandatory') === '1' || gr.getValue('mandatory') === 'true',
                reference: gr.getValue('reference') || null,
            },
        });
    },

    /**
     * Returns all field names, labels, types, and reference tables for a table, including
     * inherited fields from parent tables. Used to power field-name autocomplete in JS editors.
     * Accepts `table` (table name).
     * @returns {{success: boolean, fields: Array.<{name: string, label: string,
     *   type: string, reference: string|null}>}} Return value.
     */
    getTableFields: function () {
        var table = this.getParameter('table');
        if (!table) {
            return this._answer({
                success: false,
                error: 'Missing table param',
            });
        }

        // Collect the full table hierarchy so inherited fields are included
        var tables = [];
        try {
            var hier = new GlideTableHierarchy(table);
            var hierList = hier.getTables();
            for (var h = 0; h < hierList.size(); h++) {
                tables.push('' + hierList.get(h));
            }
        } catch (e) {
            /* fall through */
        }
        if (tables.indexOf(table) === -1) {
            tables.push(table);
        }

        var fields = [];
        var seen = {};
        var gr = new GlideRecord('sys_dictionary');
        gr.addQuery('name', 'IN', tables.join(','));
        gr.addNotNullQuery('element');
        gr.addQuery('internal_type', '!=', 'collection');
        gr.orderBy('element');
        gr.query();
        while (gr.next()) {
            var elem = gr.getValue('element');
            if (!elem || seen[elem]) {
                continue;
            }
            seen[elem] = true;
            fields.push({
                name: elem,
                label: gr.getValue('column_label') || elem,
                type: gr.getValue('internal_type') || '',
                reference: gr.getValue('reference') || null,
            });
        }
        return this._answer({ success: true, fields: fields });
    },

    /**
     * Deletes an sp_ng_template record if the current user has delete access.
     * Accepts `sys_id` (sp_ng_template sys_id).
     * @returns {{success: boolean}} Return value.
     */
    deleteTemplate: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }
        var gr = new GlideRecordSecure('sp_ng_template');
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Template not found',
            });
        }
        if (!gr.canDelete()) {
            return this._answer({ success: false, error: 'No delete access' });
        }
        if (!gr.deleteRecord()) {
            return this._answer({
                success: false,
                error: 'Could not delete template.',
            });
        }
        return this._answer({ success: true });
    },

    /**
     * Deletes an sp_angular_provider and its m2m link to the given widget,
     * provided it is not linked to any other widgets.
     * Accepts `sys_id` (sp_angular_provider sys_id) and `widget_sys_id` (owning sp_widget sys_id,
     * used to scope the m2m delete).
     * @returns {{success: boolean}} Return value.
     */
    deleteProvider: function () {
        var sysId = this.getParameter('sys_id');
        var widgetSysId = this.getParameter('widget_sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }
        var gr = new GlideRecordSecure('sp_angular_provider');
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Provider not found',
            });
        }
        if (!gr.canDelete()) {
            return this._answer({ success: false, error: 'No delete access' });
        }
        // Ensure not linked to any other widget
        var m2mOther = new GlideRecordSecure('m2m_sp_ng_pro_sp_widget');
        m2mOther.addQuery('sp_angular_provider', sysId);
        if (widgetSysId) {
            m2mOther.addQuery('sp_widget', '!=', widgetSysId);
        }
        m2mOther.setLimit(1);
        m2mOther.query();
        if (m2mOther.hasNext()) {
            return this._answer({
                success: false,
                error: 'Provider is linked to other widgets',
            });
        }
        // Keep widget links intact if deleting the provider fails.
        var m2mDel = new GlideRecordSecure('m2m_sp_ng_pro_sp_widget');
        m2mDel.addQuery('sp_angular_provider', sysId);
        if (widgetSysId) {
            m2mDel.addQuery('sp_widget', widgetSysId);
        }
        m2mDel.query();
        while (m2mDel.next()) {
            if (!m2mDel.canDelete()) {
                return this._answer({
                    success: false,
                    error: 'No delete access on provider link.',
                });
            }
        }
        if (!gr.deleteRecord()) {
            return this._answer({
                success: false,
                error: 'Could not delete provider.',
            });
        }
        m2mDel.query();
        while (m2mDel.next()) {
            if (!m2mDel.deleteRecord()) {
                return this._answer({
                    success: false,
                    error: 'Provider deleted, but its widget link could not be removed.',
                });
            }
        }
        return this._answer({ success: true });
    },

    /**
     * Returns a page of sp_angular_provider records NOT already linked to the given widget,
     * optionally filtered by name. Used to populate the "link existing provider" picker.
     * Accepts `sys_id` (optional sp_widget sys_id to exclude already-linked providers),
     * `search` (optional substring to filter provider names), and `offset` (row to start
     * the page at, for infinite-scroll pagination).
     * @returns {{success: boolean, providers: Array.<{sys_id: string, name: string,
     *   type: string, script: string}>, total: number, offset: number}} Return value.
     */
    getAllProviders: function () {
        var sysId = this.getParameter('sys_id');
        var search = this.getParameter('search') || '';
        var offset = parseInt(this.getParameter('offset'), 10) || 0;
        var pageSize = this.RECORD_LIMIT;

        var linkedIds = [];
        var m2m = new GlideRecordSecure('m2m_sp_ng_pro_sp_widget');
        if (sysId) {
            m2m.addQuery('sp_widget', sysId);
            m2m.query();
            while (m2m.next()) linkedIds.push(m2m.getValue('sp_angular_provider'));
        }

        var countGa = new GlideAggregate('sp_angular_provider');
        if (search) {
            countGa.addQuery('name', 'CONTAINS', search);
        }
        if (linkedIds.length) {
            countGa.addQuery('sys_id', 'NOT IN', linkedIds.join(','));
        }
        countGa.addAggregate('COUNT');
        countGa.query();
        var total = countGa.next() ? parseInt(countGa.getAggregate('COUNT'), 10) || 0 : 0;

        var providers = [];
        var gr = new GlideRecordSecure('sp_angular_provider');
        if (search) {
            gr.addQuery('name', 'CONTAINS', search);
        }
        if (linkedIds.length) {
            gr.addQuery('sys_id', 'NOT IN', linkedIds.join(','));
        }
        gr.orderBy('name');
        gr.chooseWindow(offset, offset + pageSize);
        gr.query();

        while (gr.next()) {
            providers.push({
                sys_id: gr.getUniqueValue(),
                name: gr.getValue('name'),
                type: gr.getValue('type') || '',
                script: gr.getValue('script') || '',
            });
        }
        return this._answer({
            success: true,
            providers: providers,
            total: total,
            offset: offset,
        });
    },

    /**
     * Creates a m2m_sp_ng_pro_sp_widget record linking a provider to a widget.
     * No-ops silently if the link already exists.
     * Accepts `sys_id` (sp_widget sys_id) and `provider_sys_id` (sp_angular_provider sys_id to link).
     * @returns {{success: boolean}} Return value.
     */
    linkProvider: function () {
        var sysId = this.getParameter('sys_id');
        var providerSysId = this.getParameter('provider_sys_id');
        if (!sysId || !providerSysId) {
            return this._answer({
                success: false,
                error: 'Missing params',
            });
        }

        var m2m = new GlideRecordSecure('m2m_sp_ng_pro_sp_widget');
        m2m.addQuery('sp_widget', sysId);
        m2m.addQuery('sp_angular_provider', providerSysId);
        m2m.query();
        if (m2m.next()) {
            return this._answer({
                success: true,
            });
        }

        m2m.initialize();
        m2m.setValue('sp_angular_provider', providerSysId);
        m2m.setValue('sp_widget', sysId);
        if (!m2m.insert()) {
            return this._answer({ success: false, error: 'Could not link provider.' });
        }
        return this._answer({
            success: true,
        });
    },

    /**
     * Removes the m2m_sp_ng_pro_sp_widget link between a widget and a provider.
     * No-ops silently if the link does not exist.
     * Accepts `sys_id` (sp_widget sys_id) and `provider_sys_id` (sp_angular_provider sys_id to unlink).
     * @returns {{success: boolean}} Return value.
     */
    unlinkProvider: function () {
        var widgetSysId = this.getParameter('sys_id');
        var providerSysId = this.getParameter('provider_sys_id');
        if (!widgetSysId || !providerSysId) {
            return this._answer({ success: false, error: 'Missing params' });
        }
        var m2m = new GlideRecordSecure('m2m_sp_ng_pro_sp_widget');
        m2m.addQuery('sp_widget', widgetSysId);
        m2m.addQuery('sp_angular_provider', providerSysId);
        m2m.query();
        if (!m2m.next()) {
            return this._answer({ success: true }); // already unlinked
        }
        if (!m2m.canDelete()) {
            return this._answer({
                success: false,
                error: 'No delete access on m2m record',
            });
        }
        if (!m2m.deleteRecord()) {
            return this._answer({ success: false, error: 'Could not unlink provider.' });
        }
        return this._answer({ success: true });
    },

    ////////////////////////////////////////////////////////////
    // Widget Dependencies (m2m_sp_widget_dependency)
    ////////////////////////////////////////////////////////////

    /**
     * Returns all sp_dependency records linked to a widget via m2m_sp_widget_dependency.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, dependencies: Array.<{sys_id: string,
     *   m2m_sys_id: string, name: string}>}} Return value.
     */
    getDependencies: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }

        var deps = [];
        var m2m = new GlideRecordSecure('m2m_sp_widget_dependency');
        m2m.addQuery('sp_widget', sysId);
        m2m.query();
        while (m2m.next()) {
            var depGr = new GlideRecordSecure('sp_dependency');
            if (depGr.get(m2m.getValue('sp_dependency'))) {
                deps.push({
                    sys_id: depGr.getUniqueValue(),
                    m2m_sys_id: m2m.getUniqueValue(),
                    name: depGr.getValue('name') || '',
                });
            }
        }
        return this._answer({ success: true, dependencies: deps });
    },

    /**
     * Returns a page of sp_dependency records NOT already linked to the given widget,
     * optionally filtered by name. Used to populate the "link dependency" picker.
     * Accepts `sys_id` (optional sp_widget sys_id to exclude already-linked dependencies),
     * `search` (optional substring to filter dependency names), and `offset` (row to start
     * the page at, for infinite-scroll pagination).
     * @returns {{success: boolean, dependencies: Array.<{sys_id: string, name: string}>,
     *   total: number, offset: number}} Return value.
     */
    getAllDependencies: function () {
        var sysId = this.getParameter('sys_id');
        var search = this.getParameter('search') || '';
        var offset = parseInt(this.getParameter('offset'), 10) || 0;
        var pageSize = this.RECORD_LIMIT;

        var linkedIds = [];
        var m2m = new GlideRecordSecure('m2m_sp_widget_dependency');
        if (sysId) {
            m2m.addQuery('sp_widget', sysId);
            m2m.query();
            while (m2m.next()) linkedIds.push(m2m.getValue('sp_dependency'));
        }

        var countGa = new GlideAggregate('sp_dependency');
        if (search) {
            countGa.addQuery('name', 'CONTAINS', search);
        }
        if (linkedIds.length) {
            countGa.addQuery('sys_id', 'NOT IN', linkedIds.join(','));
        }
        countGa.addAggregate('COUNT');
        countGa.query();
        var total = countGa.next() ? parseInt(countGa.getAggregate('COUNT'), 10) || 0 : 0;

        var deps = [];
        var gr = new GlideRecordSecure('sp_dependency');
        if (search) {
            gr.addQuery('name', 'CONTAINS', search);
        }
        if (linkedIds.length) {
            gr.addQuery('sys_id', 'NOT IN', linkedIds.join(','));
        }
        gr.orderBy('name');
        gr.chooseWindow(offset, offset + pageSize);
        gr.query();
        while (gr.next()) {
            deps.push({
                sys_id: gr.getUniqueValue(),
                name: gr.getValue('name') || '',
            });
        }
        return this._answer({
            success: true,
            dependencies: deps,
            total: total,
            offset: offset,
        });
    },

    /**
     * Creates a m2m_sp_widget_dependency record linking a dependency to a widget.
     * No-ops silently if the link already exists.
     * Accepts `sys_id` (sp_widget sys_id) and `dep_sys_id` (sp_dependency sys_id to link).
     * @returns {{success: boolean}} Return value.
     */
    linkDependency: function () {
        var sysId = this.getParameter('sys_id');
        var depSysId = this.getParameter('dep_sys_id');
        if (!sysId || !depSysId) {
            return this._answer({ success: false, error: 'Missing params' });
        }

        var m2m = new GlideRecordSecure('m2m_sp_widget_dependency');
        m2m.addQuery('sp_widget', sysId);
        m2m.addQuery('sp_dependency', depSysId);
        m2m.setLimit(1);
        m2m.query();
        if (m2m.next()) {
            return this._answer({ success: true }); // already linked
        }

        m2m.initialize();
        m2m.setValue('sp_widget', sysId);
        m2m.setValue('sp_dependency', depSysId);
        if (!m2m.insert()) {
            return this._answer({ success: false, error: 'Could not link dependency.' });
        }
        return this._answer({ success: true });
    },

    /**
     * Removes the m2m_sp_widget_dependency link between a widget and a dependency.
     * No-ops silently if the link does not exist.
     * Accepts `sys_id` (sp_widget sys_id) and `dep_sys_id` (sp_dependency sys_id to unlink).
     * @returns {{success: boolean}} Return value.
     */
    unlinkDependency: function () {
        var sysId = this.getParameter('sys_id');
        var depSysId = this.getParameter('dep_sys_id');
        if (!sysId || !depSysId) {
            return this._answer({ success: false, error: 'Missing params' });
        }

        var m2m = new GlideRecordSecure('m2m_sp_widget_dependency');
        m2m.addQuery('sp_widget', sysId);
        m2m.addQuery('sp_dependency', depSysId);
        m2m.query();
        if (!m2m.next()) {
            return this._answer({ success: true }); // already unlinked
        }
        if (!m2m.canDelete()) {
            return this._answer({ success: false, error: 'No delete access' });
        }
        if (!m2m.deleteRecord()) {
            return this._answer({ success: false, error: 'Could not unlink dependency.' });
        }
        return this._answer({ success: true });
    },

    ////////////////////////////////////////////////////////////
    // Related lists (driven by sys_ui_related_list / sys_ui_related_list_entry)
    ////////////////////////////////////////////////////////////

    /**
     * Reads the related-list configuration for sp_widget from sys_ui_related_list and
     * returns one tab descriptor per list entry (excluding internal/dependency lists).
     * Each tab descriptor includes the record count and column definitions for the tab.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, tabs: Array.<{related_list: string, type: number,
     *   table: string, field: string, title: string, count: number, rel_sys_id: string,
     *   columns: Array.<{field: string, label: string, refTable: string|null}>}>}} Return value.
     */
    getRelatedDefinitions: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }

        var EXCLUDED_LISTS = [
            'm2m_sp_widget_dependency.sp_widget',
            'm2m_sp_ng_pro_sp_widget.sp_widget',
            'sp_ng_template.sp_widget',
        ];
        var EXCLUDED_TABLES = ['sys_update_version', 'm2m_sp_public_widget_allow_table'];
        var CUSTOM_EXCLUSIONS = this._getRelatedListExclusions();

        var rlGr = new GlideRecordSecure('sys_ui_related_list');
        rlGr.addQuery('name', 'sp_widget');
        rlGr.addQuery('view', 'Default view');
        rlGr.setLimit(1);
        rlGr.query();
        if (!rlGr.next()) {
            return this._answer({ success: true, tabs: [] });
        }

        var listId = rlGr.getUniqueValue();

        var entryGr = new GlideRecordSecure('sys_ui_related_list_entry');
        entryGr.addQuery('list_id', listId);
        entryGr.orderBy('position');
        entryGr.query();

        var tabs = [];
        while (entryGr.next()) {
            var rlValue = entryGr.getValue('related_list');
            if (EXCLUDED_LISTS.indexOf(rlValue) !== -1) {
                continue;
            }
            if (CUSTOM_EXCLUSIONS[rlValue]) {
                continue;
            }

            var tab = null;
            if (rlValue.indexOf('REL:') === 0) {
                tab = this._relatedBuildRelTab(sysId, rlValue.substring(4), rlValue);
                if (tab && EXCLUDED_TABLES.indexOf(tab.table) !== -1) tab = null;
            } else {
                var dotIdx = rlValue.indexOf('.');
                if (dotIdx < 1) {
                    continue;
                }
                var table = rlValue.substring(0, dotIdx);
                var field = rlValue.substring(dotIdx + 1);
                if (EXCLUDED_TABLES.indexOf(table) !== -1) {
                    continue;
                }
                tab = this._relatedBuildFieldTab(sysId, table, field, rlValue);
            }
            if (tab) {
                tabs.push(tab);
            }
        }

        return this._answer({ success: true, tabs: tabs });
    },

    /**
     * Returns a paginated set of rows for a given related-list tab on a widget.
     * Supports both field-based (table.field=sys_id) and relationship-based (REL:...) lists.
     * Accepts `sys_id` (sp_widget sys_id), `related_list` (tab identifier, e.g. "sp_page.widget" or
     * "REL:<sys_id>"), and `page` (optional zero-based page index; defaults to 0).
     * @returns {{success: boolean, rows: Array.<Object>,
     *   columns: Array.<{field: string, label: string, refTable: string|null}>,
     *   page: number}} Return value.
     */
    getRelatedData: function () {
        var sysId = this.getParameter('sys_id');
        var relatedList = this.getParameter('related_list');
        var page = parseInt(this.getParameter('page') || '0');
        var PAGE_SIZE = 20;

        if (!sysId || !relatedList) {
            return this._answer({ success: false, error: 'Missing params' });
        }

        var offset = page * PAGE_SIZE;
        var rows = [];
        var columns = [];

        try {
            if (relatedList.indexOf('REL:') === 0) {
                var relSysId = relatedList.substring(4);
                var relGr = new GlideRecordSecure('sys_relationship');
                if (!relGr.get(relSysId)) {
                    return this._answer({
                        success: false,
                        error: 'Relationship not found',
                    });
                }
                var targetTable = relGr.getValue('basic_query_from');
                var queryWith = relGr.getValue('query_with');
                columns = this._relatedGetColumns(targetTable);
                var parent = new GlideRecordSecure('sp_widget');
                parent.get(sysId);
                var gr = new GlideRecordSecure(targetTable);
                var evaluator = new GlideScopedEvaluator();
                evaluator.putVariable('current', gr);
                evaluator.putVariable('parent', parent);
                evaluator.evaluateScript(relGr, 'query_with');
                gr.chooseWindow(offset, offset + PAGE_SIZE);
                gr.query();
                while (gr.next()) rows.push(this._relatedExtractRow(gr, columns));
            } else {
                var dotIdx = relatedList.indexOf('.');
                var table = relatedList.substring(0, dotIdx);
                var field = relatedList.substring(dotIdx + 1);
                columns = this._relatedGetColumns(table);
                var gr2 = new GlideRecordSecure(table);
                gr2.addQuery(field, sysId);
                gr2.chooseWindow(offset, offset + PAGE_SIZE);
                gr2.query();
                while (gr2.next()) rows.push(this._relatedExtractRow(gr2, columns));
            }
        } catch (e) {
            gs.error('Widget Editor getRelatedData error: ' + e.message);
            return this._answer({ success: false, error: e.message });
        }

        return this._answer({
            success: true,
            rows: rows,
            columns: columns,
            page: page,
        });
    },

    /**
     * Builds a tab descriptor for a field-based related list (table.field = sysId).
     * Returns null if the table does not exist on this instance.
     * @param {string} sysId - sys_id of the sp_widget.
     * @param {string} table - Name of the related table.
     * @param {string} field - Name of the reference field pointing back to sp_widget.
     * @param {string} rlValue - Raw related_list value from sys_ui_related_list_entry.
     * @returns {Object|null} Tab descriptor or null if table is invalid.
     */
    _relatedBuildFieldTab: function (sysId, table, field, rlValue) {
        if (!new GlideRecordSecure(table).isValid()) {
            return null; // table doesn't exist in this instance
        }
        var title = this._relatedGetTableLabel(table);
        var count = this._relatedGetCount(table, field, sysId, null);
        var columns = this._relatedGetColumns(table);
        return {
            related_list: rlValue,
            type: 1,
            table: table,
            field: field,
            title: title,
            count: count,
            columns: columns,
        };
    },

    /**
     * Builds a tab descriptor for a relationship-based related list (REL:<sys_id>).
     * Returns null if the sys_relationship record is not found.
     * @param {string} sysId - sys_id of the sp_widget.
     * @param {string} relSysId - sys_id of the sys_relationship record.
     * @param {string} rlValue - Raw related_list value from sys_ui_related_list_entry.
     * @returns {Object|null} Tab descriptor or null if relationship not found.
     */
    _relatedBuildRelTab: function (sysId, relSysId, rlValue) {
        var relGr = new GlideRecordSecure('sys_relationship');
        if (!relGr.get(relSysId)) {
            return null;
        }
        var targetTable = relGr.getValue('basic_query_from');
        var title = relGr.getValue('name') || this._relatedGetTableLabel(targetTable);
        var count = this._relatedGetCount(targetTable, null, sysId, relGr);
        var columns = this._relatedGetColumns(targetTable);
        return {
            related_list: rlValue,
            type: 2,
            table: targetTable,
            rel_sys_id: relSysId,
            title: title,
            count: count,
            columns: columns,
        };
    },

    /**
     * Returns the number of records matching either a field equality query or a
     * relationship query_with script. Returns 0 on error.
     * @param {string} table - Table to count records from.
     * @param {string|null} field - Field to match sysId against (null when using relGr).
     * @param {string} sysId - sys_id of the sp_widget (also exposed as `parent` in query_with).
     * @param {GlideRecord|null} relGr - sys_relationship GlideRecord whose query_with is evaluated.
     * @returns {number} Record count.
     */
    _relatedGetCount: function (table, field, sysId, relGr) {
        try {
            if (relGr) {
                var parent = new GlideRecordSecure('sp_widget');
                parent.get(sysId);
                var gr = new GlideRecordSecure(table);
                var evaluator = new GlideScopedEvaluator();
                evaluator.putVariable('current', gr);
                evaluator.putVariable('parent', parent);
                evaluator.evaluateScript(relGr, 'query_with');
                gr.query();
                return gr.getRowCount();
            }
            var ga = new GlideAggregate(table);
            ga.addQuery(field, sysId);
            ga.addAggregate('COUNT');
            ga.query();
            if (ga.next()) {
                return parseInt(ga.getAggregate('COUNT')) || 0;
            }
            return 0;
        } catch (e) {
            gs.error('Widget Editor _relatedGetCount error: ' + e.message);
            return 0;
        }
    },

    /**
     * Returns the ordered column definitions for a table based on its default sys_ui_list,
     * resolving field labels and reference table names. Back-references to sp_widget
     * are automatically excluded.
     * @param {string} table - Table name.
     * @returns {Array<{field: string, label: string, refTable: string|null}>}
     */
    _relatedGetColumns: function (table) {
        var listSysId = this._relatedFindListSysId(table);
        if (!listSysId) {
            return [];
        }
        var fieldNames = [];
        var elemGr = new GlideRecordSecure('sys_ui_list_element');
        elemGr.addQuery('list_id', listSysId);
        elemGr.orderBy('position');
        elemGr.setLimit(8);
        elemGr.query();
        while (elemGr.next()) {
            var fn = elemGr.getValue('element');
            if (fn) {
                fieldNames.push(fn);
            }
        }
        if (fieldNames.length === 0) {
            return [];
        }
        // grProbe.getLabel() resolves labels through the inheritance chain (e.g. sys_updated_on from sys_metadata).
        var grProbe = new GlideRecordSecure(table);
        grProbe.initialize();
        var cols = [];
        for (var i = 0; i < fieldNames.length; i++) {
            var elementName = fieldNames[i];
            var label = elementName;
            var refTable = null;
            if (!grProbe.isValidField(elementName)) {
                continue;
            }
            try {
                var glideEl = grProbe.getElement(elementName);
                label = glideEl.getLabel() || elementName;
                var ed = glideEl.getED();
                if (ed && ed.getInternalType() === 'reference') {
                    refTable = ed.getReference() || null;
                }
            } catch (e) {}
            if (refTable === 'sp_widget') {
                continue; // omit back-reference to current widget
            }
            cols.push({
                field: elementName,
                label: label,
                refTable: refTable,
            });
        }
        return cols;
    },

    /**
     * Finds the sys_id of the default sys_ui_list for a given table,
     * preferring the empty-view list and falling back to any list for the table.
     * @param {string} table - Table name.
     * @returns {string|null} sys_id of the sys_ui_list record, or null if not found.
     */
    _relatedFindListSysId: function (table) {
        var gr = new GlideRecordSecure('sys_ui_list');
        gr.addQuery('name', table);
        gr.addQuery('view', '');
        gr.setLimit(1);
        gr.query();
        if (gr.next()) {
            return gr.getUniqueValue();
        }
        var gr2 = new GlideRecordSecure('sys_ui_list');
        gr2.addQuery('name', table);
        gr2.setLimit(1);
        gr2.query();
        if (gr2.next()) {
            return gr2.getUniqueValue();
        }
        return null;
    },

    /**
     * Returns the plural (or singular) display label for a table from sys_db_object.
     * Falls back to the table name itself if no record is found.
     * @param {string} table - Table name.
     * @returns {string} Human-readable table label.
     */
    _relatedGetTableLabel: function (table) {
        var gr = new GlideRecordSecure('sys_db_object');
        gr.addQuery('name', table);
        gr.setLimit(1);
        gr.query();
        if (gr.next()) {
            return gr.getValue('label_plural') || gr.getValue('label') || table;
        }
        return table;
    },

    /**
     * Extracts display values for the given columns from a GlideRecord row,
     * including reference sys_ids for reference fields.
     * @param {GlideRecord} gr - The current GlideRecord.
     * @param {Array<{field: string, label: string, refTable: string|null}>} columns - Column definitions.
     * @returns {Object} Row object with sys_id, _table, and one key per column field.
     */
    _relatedExtractRow: function (gr, columns) {
        var row = { sys_id: gr.getUniqueValue(), _table: gr.getTableName() };
        var max = this.RELATED_CELL_MAX_LENGTH;
        for (var i = 0; i < columns.length; i++) {
            var f = columns[i].field;
            try {
                var val = gr.getDisplayValue(f) || '';
                if (val.length > max) {
                    val = val.substring(0, max) + '\u2026';
                }
                row[f] = val;
                if (columns[i].refTable) {
                    row[f + '__ref_id'] = gr.getValue(f) || '';
                }
            } catch (e) {
                row[f] = '';
            }
        }
        return row;
    },

    /**
     * Checks whether an sp_angular_provider with the given name already exists,
     * optionally excluding a specific record (for edit-mode uniqueness validation).
     * Accepts `id` (provider name to check) and `sys_id` (optional sys_id to exclude from the check).
     * @returns {{success: boolean, exists: boolean}} Return value.
     */
    checkProviderId: function () {
        var id = this.getParameter('id');
        var excludeSysId = this.getParameter('sys_id') || '';
        var gr = new GlideRecordSecure('sp_angular_provider');
        gr.addQuery('name', id);
        if (excludeSysId) {
            gr.addQuery('sys_id', '!=', excludeSysId);
        }
        gr.setLimit(1);
        gr.query();
        return this._answer({
            success: true,
            exists: gr.hasNext(),
        });
    },

    /**
     * Returns the script, name, type, and last-updated-by for a single sp_angular_provider.
     * Accepts `sys_id` (sp_angular_provider sys_id).
     * @returns {{success: boolean, script: string, name: string, type: string,
     *   sys_updated_by: string}} Return value.
     */
    getProviderRecord: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }
        var gr = new GlideRecordSecure('sp_angular_provider');
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Provider not found',
            });
        }
        return this._answer({
            success: true,
            script: gr.getValue('script') || '',
            name: gr.getValue('name') || '',
            type: gr.getValue('type') || '',
            sys_updated_by: gr.getValue('sys_updated_by'),
        });
    },

    /**
     * Returns the choice list for the sp_angular_provider.type field in the current session language.
     * @returns {{success: boolean, choices: Array.<{label: string, value: string}>}} Return value.
     */
    getProviderChoices: function () {
        var choices = [];
        var gr = new GlideRecordSecure('sys_choice');
        gr.addQuery('name', 'sp_angular_provider');
        gr.addQuery('element', 'type');
        gr.addQuery('language', gs.getSession().getLanguage());
        gr.orderBy('sequence');
        gr.query();
        while (gr.next()) {
            choices.push({
                label: gr.getValue('label'),
                value: gr.getValue('value'),
            });
        }
        return this._answer({
            success: true,
            choices: choices,
        });
    },

    /**
     * Checks whether an sp_ng_template with the given id already exists,
     * optionally excluding a specific record (for edit-mode uniqueness validation).
     * Accepts `id` (template id to check) and `sys_id` (optional sys_id to exclude from the check).
     * @returns {{success: boolean, exists: boolean}} Return value.
     */
    checkTemplateId: function () {
        var id = this.getParameter('id');
        var excludeSysId = this.getParameter('sys_id') || '';
        var gr = new GlideRecordSecure('sp_ng_template');
        gr.addQuery('id', id);
        if (excludeSysId) {
            gr.addQuery('sys_id', '!=', excludeSysId);
        }
        gr.setLimit(1);
        gr.query();
        return this._answer({
            success: true,
            exists: gr.hasNext(),
        });
    },

    ////////////////////////////////////////////////////////////
    // User Preferences
    ////////////////////////////////////////////////////////////

    USER_PREF_NAME: 'monaco_plus.user_prefs',
    /* Read-only fallback so prefs saved before the rename still load. */
    LEGACY_USER_PREF_NAME: 'widget_editor.visible_editors',

    /**
     * Lists active portals with their default theme, for the "CSS theme" user preference.
     * @returns {{success: boolean, portals: Array.<{sys_id: string, title: string,
     *   url_suffix: string, themeSysId: string, themeTitle: string}>}} Return value.
     */
    getPortalsForClassIndex: function () {
        var portals = [];
        var gr = new GlideRecordSecure('sp_portal');
        // inactive is blank on most portals, not explicitly false.
        gr.addEncodedQuery('inactive=false^ORinactiveISEMPTY');
        gr.orderBy('title');
        gr.query();
        while (gr.next()) {
            portals.push({
                sys_id: gr.getValue('sys_id'),
                title: gr.getValue('title'),
                url_suffix: gr.getValue('url_suffix'),
                themeSysId: gr.getValue('theme'),
                themeTitle: gr.getDisplayValue('theme'),
            });
        }
        return this._answer({ success: true, portals: portals });
    },

    /**
     * Returns the current user's Monaco+ preference value, falling back to the legacy key.
     * @returns {{success: boolean, value: string|null}} Return value.
     */
    getUserPrefs: function () {
        var gr = new GlideRecordSecure('sys_user_preference');
        gr.addQuery('user', gs.getUserID());
        gr.addQuery('name', this.USER_PREF_NAME);
        gr.query();
        if (gr.next()) {
            return this._answer({
                success: true,
                value: gr.getValue('value'),
            });
        }
        var legacy = new GlideRecordSecure('sys_user_preference');
        legacy.addQuery('user', gs.getUserID());
        legacy.addQuery('name', this.LEGACY_USER_PREF_NAME);
        legacy.query();
        return this._answer({
            success: true,
            value: legacy.next() ? legacy.getValue('value') : null,
        });
    },

    /**
     * Reads a shared JSON sys_user_preference blob for the current user.
     * @param {string} prefName Preference name.
     * @returns {Object} The parsed blob, or {} if missing/unparseable.
     */
    _readUserPrefsBlob: function (prefName) {
        var gr = new GlideRecordSecure('sys_user_preference');
        gr.addQuery('user', gs.getUserID());
        gr.addQuery('name', prefName);
        gr.setLimit(1);
        gr.query();
        if (!gr.next()) return {};
        try {
            return JSON.parse(gr.getValue('value')) || {};
        } catch (e) {
            return {};
        }
    },

    /**
     * Upserts a shared JSON sys_user_preference blob for the current user.
     * @param {string} prefName Preference name.
     * @param {Object} blob Value to store, JSON-encoded.
     */
    _writeUserPrefsBlob: function (prefName, blob) {
        var gr = new GlideRecordSecure('sys_user_preference');
        gr.addQuery('user', gs.getUserID());
        gr.addQuery('name', prefName);
        gr.query();
        var json = JSON.stringify(blob);
        if (gr.next()) {
            gr.setValue('value', json);
            gr.update();
        } else {
            gr.initialize();
            gr.setValue('user', gs.getUserID());
            gr.setValue('name', prefName);
            gr.setValue('value', json);
            gr.insert();
        }
    },

    /**
     * Reads one key out of a shared JSON sys_user_preference blob.
     * @param {string} prefName Preference name.
     * @param {string} key Key within the blob.
     * @param {*} defaultValue Value to return when the blob or key is missing.
     * @returns {*} The stored value, or defaultValue.
     */
    getMergedUserPref: function (prefName, key, defaultValue) {
        var blob = this._readUserPrefsBlob(prefName);
        return key in blob ? blob[key] : defaultValue;
    },

    /**
     * Merges one key into a shared JSON sys_user_preference blob without disturbing
     * other keys already stored there by other callers.
     * @param {string} prefName Preference name.
     * @param {string} key Key to set within the blob.
     * @param {*} value Value to store.
     */
    saveMergedUserPref: function (prefName, key, value) {
        var blob = this._readUserPrefsBlob(prefName);
        blob[key] = value;
        this._writeUserPrefsBlob(prefName, blob);
    },

    /**
     * Upserts the current user's Monaco+ preference.
     * Accepts `value` (JSON-encoded preference blob to store).
     * @returns {{success: boolean}} Return value.
     */
    saveUserPrefs: function () {
        var incoming = {};
        try {
            incoming = JSON.parse(this.getParameter('value')) || {};
        } catch (e) {}
        var existing = this._readUserPrefsBlob(this.USER_PREF_NAME);
        for (var key in incoming) {
            existing[key] = incoming[key];
        }
        this._writeUserPrefsBlob(this.USER_PREF_NAME, existing);
        return this._answer({
            success: true,
        });
    },

    DEBUG_MENU_PREF_NAME: 'we_debug_menu_prefs',

    /**
     * Resolves the "real" user for debug menu preferences the same way the debug menu
     * widget does: while impersonating, that's the impersonator, not the impersonated user.
     * @returns {string|null} sys_id of the real user, or null if it can't be resolved.
     */
    _getDebugMenuRealUserId: function () {
        var impersonatedUser = gs.getImpersonatingUserName();
        if (!impersonatedUser) {
            return gs.getUserID();
        }
        var gr = new GlideRecord('sys_user');
        gr.addQuery('user_name', impersonatedUser);
        gr.query();
        return gr.next() ? gr.getUniqueValue() : null;
    },

    /**
     * Returns the current real user's debug menu (sp_widget_widget_editor_debug_menu)
     * preferences, for inclusion in the widget editor's preferences export.
     * Uses GlideRecord (not GlideRecordSecure) so the real user's record is readable
     * even while impersonating.
     * @returns {{success: boolean, value: string|null, real_user_id: string|null}} Return value.
     */
    getDebugMenuPrefs: function () {
        var realUserId = this._getDebugMenuRealUserId();
        if (!realUserId) {
            return this._answer({
                success: true,
                value: null,
                real_user_id: null,
            });
        }
        var gr = new GlideRecord('sys_user_preference');
        gr.addQuery('user', realUserId);
        gr.addQuery('name', this.DEBUG_MENU_PREF_NAME);
        gr.query();
        return this._answer({
            success: true,
            value: gr.next() ? gr.getValue('value') : null,
            real_user_id: realUserId,
        });
    },

    /**
     * Upserts the current real user's debug menu preferences, e.g. when restoring
     * them from an imported widget editor preferences file.
     * Accepts `value` (JSON-encoded preference blob to store).
     * @returns {{success: boolean, real_user_id: string|null}} Return value.
     */
    saveDebugMenuPrefs: function () {
        var realUserId = this._getDebugMenuRealUserId();
        if (!realUserId) {
            return this._answer({ success: false, real_user_id: null });
        }
        var value = this.getParameter('value') || '{}';
        var gr = new GlideRecord('sys_user_preference');
        gr.addQuery('user', realUserId);
        gr.addQuery('name', this.DEBUG_MENU_PREF_NAME);
        gr.query();
        if (gr.next()) {
            gr.setValue('value', value);
            gr.update();
        } else {
            gr.initialize();
            gr.setValue('user', realUserId);
            gr.setValue('name', this.DEBUG_MENU_PREF_NAME);
            gr.setValue('value', value);
            gr.setValue('type', 'string');
            gr.insert();
        }
        return this._answer({ success: true, real_user_id: realUserId });
    },

    /**
     * Returns the sys_dictionary default values for sp_widget script fields,
     * plus the current application name and sys_id.
     * @returns {{success: boolean, defaults: {template: string, css: string,
     *   client_script: string, script: string, link: string},
     *   application: string, application_sys_id: string}} Return value.
     */
    getWidgetDefaults: function () {
        if (this._getEditorTable() !== 'sp_widget') return this._getEditorRecord(true);
        var fields = ['template', 'css', 'client_script', 'script', 'link'];
        var defaults = {};
        var gr = new GlideRecord('sys_dictionary');
        gr.addQuery('name', 'sp_widget');
        gr.addQuery('element', fields);
        gr.query();
        while (gr.next()) {
            var el = gr.getValue('element');
            defaults[el] = gr.getValue('default_value') || '';
        }
        var appSysId = gs.getCurrentApplicationId();
        var appName = '';
        if (appSysId) {
            var appGr = new GlideRecordSecure('sys_scope');
            if (appGr.get(appSysId)) appName = appGr.getValue('name') || '';
        }
        return this._answer({
            success: true,
            defaults: defaults,
            application: appName,
            application_sys_id: appSysId || '',
            additional_widget_fields: this._getAdditionalWidgetFieldDefs(this._buildWidgetFieldAccessProbe()),
        });
    },

    ////////////////////////////////////////////////////////////
    // Clone
    ////////////////////////////////////////////////////////////

    /**
     * Clones an sp_widget record into the current application scope, copying
     * all dependency and provider m2m relationships, and recording the clone
     * relationship to the source widget.
     * Accepts `sys_id` (sp_widget sys_id to clone).
     * @returns {{success: boolean, sys_id: string}} sys_id is the new cloned widget's sys_id.
     */
    cloneWidget: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }

        var gr = new GlideRecordSecure('sp_widget');
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Widget not found',
            });
        }
        if (!gr.canRead()) {
            return this._answer({
                success: false,
                error: 'No read access to widget',
            });
        }
        if (!new GlideRecordSecure('sp_widget').canCreate()) {
            return this._answer({
                success: false,
                error: 'No permission to create widgets',
            });
        }

        var oldSysId = gr.getUniqueValue();
        gr.sys_scope = gs.getCurrentApplicationId();
        gr.sys_policy = '';
        gr.name = 'Copy of ' + gr.getValue('name');
        gr.id = '';
        gr.servicenow = false;
        gr.internal = false;

        var newSysId = gr.insert();
        if (!newSysId) {
            return this._answer({
                success: false,
                error: 'Failed to clone widget',
            });
        }
        newSysId = newSysId + '';

        // Ensure cloned widget explicitly has servicenow and internal set to false
        var updateGR = new GlideRecord('sp_widget');
        if (updateGR.get(newSysId)) {
            updateGR.setValue('servicenow', false);
            updateGR.setValue('internal', false);
            updateGR.setValue('sys_policy', '');
            updateGR.update();
        }

        // Clone widget dependencies
        var depGR = new GlideRecordSecure('m2m_sp_widget_dependency');
        depGR.query('sp_widget', oldSysId);
        while (depGR.next()) {
            depGR.sp_widget = newSysId;
            depGR.insert();
        }

        // Clone provider relationships
        var proGR = new GlideRecordSecure('m2m_sp_ng_pro_sp_widget');
        proGR.query('sp_widget', oldSysId);
        while (proGR.next()) {
            proGR.sp_widget = newSysId;
            proGR.insert();
        }

        // Record clone relationship to OOB parent (best-effort)
        try {
            new SPWidgetCloneUtils().createCloneRelationship(oldSysId, newSysId);
        } catch (e) {}

        return this._answer({
            success: true,
            sys_id: newSysId,
        });
    },

    ////////////////////////////////////////////////////////////
    // XML / History Set
    ////////////////////////////////////////////////////////////

    /**
     * Returns the sys_history_set sys_id for a widget, if one exists.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, history_set_id: string|null}} Return value.
     */
    getHistorySetId: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }
        var gr = new GlideRecordSecure('sys_history_set');
        gr.addQuery('id', sysId);
        gr.setLimit(1);
        gr.query();
        if (!gr.next()) {
            return this._answer({ success: true, history_set_id: null });
        }
        return this._answer({
            success: true,
            history_set_id: gr.getUniqueValue(),
        });
    },

    ////////////////////////////////////////////////////////////
    // Option Schema
    ////////////////////////////////////////////////////////////

    /**
     * Returns the option_schema JSON field for a widget.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, option_schema: string}} Return value.
     */
    getOptionSchema: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }
        var gr = new GlideRecordSecure('sp_widget');
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Widget not found',
            });
        }
        return this._answer({
            success: true,
            option_schema: gr.getValue('option_schema') || '',
        });
    },

    /**
     * Saves the option_schema field on an sp_widget record.
     * Accepts `sys_id` (sp_widget sys_id) and `value` (new option_schema value, JSON string).
     * @returns {{success: boolean}} Return value.
     */
    saveOptionSchema: function () {
        var sysId = this.getParameter('sys_id');
        var value = this.getParameter('value');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }
        var gr = new GlideRecordSecure('sp_widget');
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Widget not found',
            });
        }
        gr.setValue('option_schema', value);
        if (!gr.update()) {
            return this._answer({
                success: false,
                error: 'Save failed. You may not have write access.',
            });
        }
        return this._answer({
            success: true,
        });
    },

    ////////////////////////////////////////////////////////////
    // Demo Data
    ////////////////////////////////////////////////////////////

    /**
     * Returns the demo_data JSON field for a widget.
     * Accepts `sys_id` (sp_widget sys_id).
     * @returns {{success: boolean, demo_data: string}} Return value.
     */
    getDemoData: function () {
        var sysId = this.getParameter('sys_id');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }
        var gr = new GlideRecordSecure('sp_widget');
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Widget not found',
            });
        }
        return this._answer({
            success: true,
            demo_data: gr.getValue('demo_data') || '',
        });
    },

    /**
     * Saves the demo_data field on an sp_widget record.
     * Accepts `sys_id` (sp_widget sys_id) and `value` (new demo_data value, JSON string).
     * @returns {{success: boolean}} Return value.
     */
    saveDemoData: function () {
        var sysId = this.getParameter('sys_id');
        var value = this.getParameter('value');
        if (!sysId) {
            return this._answer({
                success: false,
                error: 'No sys_id provided',
            });
        }
        var gr = new GlideRecordSecure('sp_widget');
        if (!gr.get(sysId)) {
            return this._answer({
                success: false,
                error: 'Widget not found',
            });
        }
        gr.setValue('demo_data', value);
        if (!gr.update()) {
            return this._answer({
                success: false,
                error: 'Save failed. You may not have write access.',
            });
        }
        return this._answer({
            success: true,
        });
    },

    ////////////////////////////////////////////////////////////
    // Private helpers
    ////////////////////////////////////////////////////////////

    /**
     * True when a raw JSON string parses to an object with at least one property.
     * Used to decide whether option_schema/demo_data have a "proper" value.
     * @param {string} raw - Raw field value (JSON string).
     * @returns {boolean} True if the value is a non-empty object.
     */
    _hasProperJsonObjectValue: function (raw) {
        if (!raw) {
            return false;
        }
        try {
            var parsed = JSON.parse(raw);
            return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0;
        } catch (e) {
            return false;
        }
    },

    /**
     * Returns the set of sys_ui_related_list_entry.related_list values configured to
     * be hidden via the system property monaco.plus.widget.related_list_exclusions.
     * @returns {Object.<string, boolean>} Map of excluded related_list identifiers.
     */
    _getRelatedListExclusions: function () {
        var raw = gs.getProperty(this.RELATED_LIST_EXCLUSIONS_PROPERTY, '') || '';
        var tokens = raw.split(',');
        var out = {};
        for (var i = 0; i < tokens.length; i++) {
            var name = (tokens[i] || '').trim();
            if (name) {
                out[name] = true;
            }
        }
        return out;
    },

    /**
     * Returns additional sp_widget field names configured in the system property
     * monaco.plus.widget.fields.
     * @returns {Array.<string>} Sanitised field element names, preserving order.
     */
    _getConfiguredAdditionalWidgetFields: function () {
        var raw = gs.getProperty(this.ADDITIONAL_WIDGET_FIELDS_PROPERTY, '') || '';
        var tokens = raw.split(/[\n,;]+/);
        var seen = {};
        var out = [];
        for (var i = 0; i < tokens.length; i++) {
            var name = (tokens[i] || '').trim();
            if (!name) {
                continue;
            }
            if (!/^[A-Za-z0-9_]+$/.test(name)) {
                continue;
            }
            if (seen[name]) {
                continue;
            }
            if (this.ALLOWED_WIDGET_FIELDS.indexOf(name) !== -1) {
                continue;
            }
            seen[name] = true;
            out.push(name);
        }
        return out;
    },

    /* Standard sp_widget fields to pull out of a sys_audit_delete payload XML. */
    DELETED_WIDGET_PAYLOAD_FIELDS: [
        'name',
        'id',
        'description',
        'controller_as',
        'public',
        'roles',
        'static',
        'template',
        'css',
        'client_script',
        'script',
        'link',
        'option_schema',
        'demo_data',
        'sys_policy',
        'servicenow',
        'sys_class_name',
        'sys_updated_on',
        'sys_updated_by',
    ],

    /**
     * Parses an sp_widget XML snapshot (as stored in sys_audit_delete.payload) into a
     * field name → text content map, mirroring how sys_update_version payloads are parsed.
     * @param {string} payload - Raw XML string.
     * @returns {{fields: Object, display_values: Object}} Parsed field values and any
     *   accompanying display_value attributes (currently just sys_scope).
     */
    _parseDeletedWidgetPayload: function (payload) {
        var fields = {};
        var displayValues = {};
        if (!payload) {
            return { fields: fields, display_values: displayValues };
        }
        try {
            var xmlDoc = new XMLDocument2();
            xmlDoc.parseXML(payload);
            var names = this.DELETED_WIDGET_PAYLOAD_FIELDS.concat(this._getConfiguredAdditionalWidgetFields());
            for (var i = 0; i < names.length; i++) {
                var node = xmlDoc.getFirstNode('//' + names[i]);
                if (node) {
                    fields[names[i]] = node.getTextContent() || '';
                }
            }
            var scopeNode = xmlDoc.getFirstNode('//sys_scope');
            if (scopeNode) {
                fields.sys_scope = scopeNode.getTextContent() || '';
                var scopeDisplay = scopeNode.getAttribute('display_value');
                if (scopeDisplay) {
                    displayValues.sys_scope = scopeDisplay;
                }
            }
        } catch (e) {
            gs.error('WidgetEditorAjax: _parseDeletedWidgetPayload error: ' + e.message);
        }
        return { fields: fields, display_values: displayValues };
    },

    /**
     * Reconstructs a deleted sp_widget record from its sys_audit_delete XML payload.
     * @param {string} sysId - sys_id of the widget that no longer exists in sp_widget.
     * @returns {{widget: Object, additional_widget_fields: Array}|null} Widget-shaped
     *   object (all fields read-only, canWrite false) with a `deleted` flag, plus
     *   additional field defs — or null when no delete audit trail exists for this sys_id.
     */
    _getDeletedWidget: function (sysId) {
        var auditGr = new GlideRecordSecure('sys_audit_delete');
        auditGr.addQuery('tablename', 'sp_widget');
        auditGr.addQuery('documentkey', sysId);
        auditGr.orderByDesc('sys_created_on');
        auditGr.setLimit(1);
        auditGr.query();
        if (!auditGr.next()) {
            return null;
        }

        var parsed = this._parseDeletedWidgetPayload(auditGr.getValue('payload'));
        var fields = parsed.fields;
        var displayValues = parsed.display_values;
        var isBool = function (v) {
            return v === 'true' || v === '1';
        };

        var sysClassName = fields.sys_class_name || 'sp_widget';
        var isHeaderFooter = sysClassName === 'sp_header_footer';
        var additionalDefs = this._getAdditionalWidgetFieldDefs(this._buildWidgetFieldAccessProbe());

        var widget = {
            sys_id: sysId,
            name: fields.name || '',
            id: fields.id || '',
            description: fields.description || '',
            controller_as: fields.controller_as || 'c',
            application: displayValues.sys_scope || '',
            application_sys_id: fields.sys_scope || '',
            is_public: isBool(fields.public),
            roles: fields.roles || '',
            template: fields.template || '',
            css: fields.css || '',
            client_script: fields.client_script || '',
            script: fields.script || '',
            link: fields.link || '',
            es12: false,
            es12_record_exists: false,
            sys_updated_on: fields.sys_updated_on || '',
            sys_updated_by: fields.sys_updated_by || '',
            canWrite: false,
            scope_mismatch: false,
            widgetOrigin: null,
            sys_policy: fields.sys_policy || '',
            sys_policy_display: fields.sys_policy || '',
            servicenow: isBool(fields.servicenow),
            volatility_level: '',
            volatility_level_display: '',
            deprecated: false,
            update_set_mismatch: false,
            widget_update_set_id: '',
            widget_update_set_name: '',
            sys_class_name: sysClassName,
            is_header_footer: isHeaderFooter,
            'static': isHeaderFooter && isBool(fields['static']),
            option_schema_has_value: this._hasProperJsonObjectValue(fields.option_schema),
            demo_data_has_value: this._hasProperJsonObjectValue(fields.demo_data),
            has_active_instances: false,
            deleted: true,
            deleted_on: auditGr.getValue('sys_created_on') || '',
            deleted_by: auditGr.getValue('sys_created_by') || '',
        };

        for (var ai = 0; ai < additionalDefs.length; ai++) {
            var addDef = additionalDefs[ai];
            var addVal = fields[addDef.name];
            widget[addDef.name] = addDef.type === 'boolean' ? isBool(addVal) : addVal || '';
        }

        return { widget: widget, additional_widget_fields: additionalDefs };
    },

    /**
     * Evaluates the configured encoded query against the widget record to determine
     * whether the widget should be treated as deprecated.
     * @param {GlideRecord} widgetGr - sp_widget record to test.
     * @returns {boolean} True when the property query matches the widget.
     */
    _isDeprecatedWidget: function (widgetGr) {
        var filter = this._getDeprecatedWidgetFilter();
        return filter ? filter.match(widgetGr, false) : false;
    },

    /**
     * Builds the GlideFilter for the configured deprecated-widget encoded query, for reuse
     * across a batch of widget records without re-parsing the property each time.
     * @returns {GlideFilter|null} Filter instance, or null when unconfigured/invalid.
     */
    _getDeprecatedWidgetFilter: function () {
        var encodedQuery = gs.getProperty(this.DEPRECATED_WIDGET_PROPERTY, '') || '';
        encodedQuery = (encodedQuery + '').trim();
        if (!encodedQuery) {
            return null;
        }

        try {
            var filter = new GlideFilter(encodedQuery, 'deprecated');
            filter.setCaseSensitive(false);
            return filter;
        } catch (e) {
            gs.warn(
                'WidgetEditorAjax: failed to evaluate property ' +
                    this.DEPRECATED_WIDGET_PROPERTY +
                    '. ' +
                    (e && e.message ? e.message : e)
            );
            return null;
        }
    },

    /**
     * Returns dictionary metadata for configured additional sp_widget fields.
     * @param {GlideRecord} accessGr - Optional sp_widget GlideRecord used to resolve field ACLs.
     * @returns {Array.<{name: string, label: string, type: string, canWrite: boolean}>} Field definitions.
     */
    _getAdditionalWidgetFieldDefs: function (accessGr) {
        var names = this._getConfiguredAdditionalWidgetFields();
        if (!names.length) {
            return [];
        }

        var dict = {};
        var gr = new GlideRecord('sys_dictionary');
        gr.addQuery('name', 'sp_widget');
        gr.addQuery('element', 'IN', names.join(','));
        gr.query();
        while (gr.next()) {
            var element = gr.getValue('element');
            if (!element) {
                continue;
            }
            dict[element] = {
                name: element,
                label: gr.getValue('column_label') || element,
                type: gr.getValue('internal_type') || 'string',
                canWrite: this._canWriteWidgetField(accessGr, element),
            };
        }

        var defs = [];
        for (var i = 0; i < names.length; i++) {
            if (dict[names[i]]) {
                defs.push(dict[names[i]]);
            }
        }
        return defs;
    },

    /**
     * Builds a probe sp_widget record for field-level ACL checks in new-widget flows.
     * @returns {GlideRecord} Initialised sp_widget record.
     */
    _buildWidgetFieldAccessProbe: function () {
        var gr = new GlideRecordSecure('sp_widget');
        gr.initialize();
        return gr;
    },

    /**
     * Returns the complete allowed set of fields for save operations.
     * @returns {Array.<string>} Base + configured additional fields.
     */
    _getAllowedWidgetFields: function () {
        return this.ALLOWED_WIDGET_FIELDS.concat(this._getConfiguredAdditionalWidgetFields());
    },

    /**
     * True when a widget field should be handled as a boolean checkbox value.
     * @param {string} fieldName - sp_widget element name.
     * @returns {boolean} True if the field type is boolean.
     */
    _isBooleanWidgetField: function (fieldName) {
        if (fieldName === 'public' || fieldName === 'static') {
            return true;
        }
        var defs = this._getAdditionalWidgetFieldDefs();
        for (var i = 0; i < defs.length; i++) {
            if (defs[i].name === fieldName) {
                return this._isBooleanWidgetType(defs[i].type);
            }
        }
        return false;
    },

    /**
     * Returns whether the current user can write a specific widget field.
     * @param {GlideRecord} gr - sp_widget record or initialised probe.
     * @param {string} fieldName - Field element name.
     * @returns {boolean} True if the field is writable.
     */
    _canWriteWidgetField: function (gr, fieldName) {
        if (!gr || !fieldName) {
            return false;
        }
        try {
            if (!gr.isValidField(fieldName)) {
                return false;
            }
            var element = gr.getElement(fieldName);
            return !!(element && element.canWrite && element.canWrite());
        } catch (e) {
            return false;
        }
    },

    /**
     * True when the dictionary internal type represents a boolean field.
     * @param {string} type - sys_dictionary.internal_type value.
     * @returns {boolean} True if the type is boolean-like.
     */
    _isBooleanWidgetType: function (type) {
        var normalised = String(type || '').toLowerCase();
        return normalised === 'boolean' || normalised === 'glide_boolean' || normalised === 'true_false';
    },

    /**
     * Normalises supported client/server boolean representations.
     * @param {*} value - Raw field value.
     * @returns {boolean} Boolean equivalent.
     */
    _coerceWidgetBooleanValue: function (value) {
        if (value === true || value === false) {
            return value;
        }
        var normalised = String(value == null ? '' : value)
            .toLowerCase()
            .trim();
        return normalised === 'true' || normalised === '1' || normalised === 'yes' || normalised === 'y';
    },

    /**
     * Writes a widget field using explicit boolean handling for checkbox fields.
     * @param {GlideRecord} gr - Target sp_widget record.
     * @param {string} fieldName - Field element name.
     * @param {*} value - Incoming value.
     * @returns {void} Return value.
     */
    _setWidgetFieldValue: function (gr, fieldName, value) {
        if (this._isBooleanWidgetField(fieldName)) {
            gr[fieldName] = this._coerceWidgetBooleanValue(value);
            return;
        }
        gr.setValue(fieldName, value);
    },

    /**
     * Resolves every active sp_instance placement of a widget to its containing
     * page, and lists all active portals. Used by the "Open on Portal" action.
     * @returns {void} Writes JSON { success, instances, portals } via _answer.
     */
    getOpenPageOptions: function () {
        var sysId = this.getParameter('sys_id');
        var instances = [];

        if (sysId) {
            var seenPageIds = {};
            var grInstances = new GlideRecordSecure('sp_instance');
            grInstances.addQuery('sp_widget', sysId);
            grInstances.addQuery('active', true);
            grInstances.setLimit(200);
            grInstances.query();
            while (grInstances.next()) {
                var page = this._resolvePageForInstance(grInstances);
                if (page && page.id && !seenPageIds[page.id]) {
                    seenPageIds[page.id] = true;
                    instances.push({
                        instanceSysId: grInstances.getValue('sys_id'),
                        pageId: page.id,
                        pageSysId: page.sysId,
                        pageTitle: page.title,
                    });
                }
            }
            instances.sort(function (a, b) {
                return (a.pageTitle || '').localeCompare(b.pageTitle || '');
            });
        }

        var portals = [];
        var grPortal = new GlideRecordSecure('sp_portal');
        // "inactive" is blank/unset on most portals (that also means active), not
        // explicitly "false" — an exact-match query on false alone misses those.
        grPortal.addEncodedQuery('inactive=false^ORinactiveISEMPTY');
        grPortal.orderBy('title');
        grPortal.query();
        while (grPortal.next()) {
            portals.push({
                sys_id: grPortal.getValue('sys_id'),
                title: grPortal.getValue('title'),
                url_suffix: grPortal.getValue('url_suffix'),
            });
        }

        return this._answer({
            success: true,
            instances: instances,
            portals: portals,
        });
    },

    /**
     * Resolves the sp_page (id/title) that an sp_instance record is placed on by
     * walking sp_instance -> sp_column -> sp_row -> sp_container -> sp_page.
     * @param {GlideRecord} grInstance - A queried sp_instance GlideRecord.
     * @returns {Object|null} { id, title } or null if the chain can't be resolved.
     */
    _resolvePageForInstance: function (grInstance) {
        var grColumn = new GlideRecordSecure('sp_column');
        if (!grColumn.get(grInstance.getValue('sp_column'))) {
            return null;
        }
        var containerSysId = this._resolveContainerForRow(grColumn.getValue('sp_row'), 0);
        if (!containerSysId) {
            return null;
        }
        var grContainer = new GlideRecordSecure('sp_container');
        if (!grContainer.get(containerSysId)) {
            return null;
        }
        var grPage = new GlideRecordSecure('sp_page');
        if (!grPage.get(grContainer.getValue('sp_page'))) {
            return null;
        }
        return {
            id: grPage.getValue('id'),
            sysId: grPage.getValue('sys_id'),
            title: grPage.getValue('title'),
        };
    },

    /**
     * Walks up from a row to the container it sits in, following sp_column parents
     * when the row is nested inside another column instead of a container directly.
     * @param {string} rowSysId - sp_row sys_id to resolve a container for.
     * @param {number} depth - Recursion guard against unexpectedly deep nesting.
     * @returns {string|null} sp_container sys_id, or null if unresolved.
     */
    _resolveContainerForRow: function (rowSysId, depth) {
        if (!rowSysId || depth > 20) {
            return null;
        }
        var grRow = new GlideRecordSecure('sp_row');
        if (!grRow.get(rowSysId)) {
            return null;
        }
        var containerSysId = grRow.getValue('sp_container');
        if (containerSysId) {
            return containerSysId;
        }
        var parentColumnSysId = grRow.getValue('sp_column');
        if (!parentColumnSysId) {
            return null;
        }
        var grParentColumn = new GlideRecordSecure('sp_column');
        if (!grParentColumn.get(parentColumnSysId)) {
            return null;
        }
        return this._resolveContainerForRow(grParentColumn.getValue('sp_row'), depth + 1);
    },

    /**
     * Serialises a response object to JSON and passes it to AbstractAjaxProcessor.setAnswer.
     * @param {Object} obj - The response payload to serialise.
     * @returns {void} Return value.
     */
    _answer: function (obj) {
        return this.setAnswer(JSON.stringify(obj));
    },

    /**
     * Extracts the table and sys_id from a Customer Update/Version payload.
     * @param {string} payload - Raw record_update XML.
     * @param {string} [updateName] Update name for forced records with sparse payloads.
     * @returns {?{table: string, sys_id: string}} Parsed target, or null.
     */
    _parseCustomerUpdateTarget: function (payload, updateName) {
        var nameMatch = String(updateName || '').match(/^([a-z_][a-z0-9_]*)_([0-9a-f]{32})$/i);
        var namedTarget = nameMatch ? { table: nameMatch[1], sys_id: nameMatch[2] } : null;
        if (!payload) {
            return namedTarget;
        }
        try {
            var xmlDoc = new XMLDocument2();
            xmlDoc.parseXML(String(payload));
            var root = xmlDoc.getFirstNode('/record_update');
            if (!root) return null;
            var records = root.getChildNodeIterator(),
                recordEl = null,
                table = '';
            while (records.hasNext()) {
                var candidate = records.next();
                var nodeName = String(candidate.getNodeName() || '');
                if (/^[a-z_][a-z0-9_]*$/i.test(nodeName)) {
                    recordEl = candidate;
                    table = nodeName;
                    break;
                }
            }
            if (!recordEl) {
                var rootTable = String(root.getAttribute('table') || '');
                return namedTarget && (!rootTable || rootTable === namedTarget.table) ? namedTarget : null;
            }

            // Read only the target record's direct fields, never a companion record's ID.
            var fields = {},
                children = recordEl.getChildNodeIterator();
            while (children.hasNext()) {
                var child = children.next(),
                    field = String(child.getNodeName());
                if (field === 'sys_id' || field === 'name' || field === 'element') {
                    fields[field] = String(child.getTextContent() || '').trim();
                }
            }
            if (fields.sys_id) {
                return /^[0-9a-f]{32}$/i.test(fields.sys_id) ? { table: table, sys_id: fields.sys_id } : null;
            }
            // Dictionary updates may identify the field by table and element instead of sys_id.
            if (table === 'sys_dictionary') {
                var dictionaryTable = String(recordEl.getAttribute('table') || fields.name || '');
                var element = String(recordEl.getAttribute('element') || fields.element || '');
                if (!/^[a-z_][a-z0-9_]*$/i.test(dictionaryTable) || !/^[a-z0-9_]*$/i.test(element)) return null;
                var dictionary = new GlideRecordSecure('sys_dictionary');
                dictionary.addQuery('name', dictionaryTable);
                dictionary.addQuery('element', element);
                dictionary.setLimit(2);
                dictionary.query();
                if (dictionary.next()) {
                    var sysId = String(dictionary.getUniqueValue() || '');
                    if (!dictionary.next() && /^[0-9a-f]{32}$/i.test(sysId)) return { table: table, sys_id: sysId };
                }
            }
            return namedTarget && namedTarget.table === table ? namedTarget : null;
        } catch (e) {
            gs.error('WidgetEditorAjax: customer update target parse failed: ' + e.message);
            return null;
        }
    },

    /**
     * Parses the XML payload from a sys_update_version record and extracts
     * sp_widget field values by element name.
     * @param {string} payload - Raw XML string from sys_update_version.payload.
     * @returns {Object} Map of field name to text content for known widget fields.
     */
    _parseVersionPayload: function (payload) {
        var fields = {};
        if (!payload) {
            return fields;
        }
        try {
            var xmlDoc = new XMLDocument2();
            xmlDoc.parseXML(payload);
            var names = [
                'template',
                'css',
                'client_script',
                'script',
                'link',
                'name',
                'id',
                'description',
                'public',
                'roles',
            ];
            for (var i = 0; i < names.length; i++) {
                var node = xmlDoc.getFirstNode('//' + names[i]);
                if (node) {
                    fields[names[i]] = node.getTextContent();
                }
            }
        } catch (e) {
            gs.error('Widget Editor: parseVersionPayload error: ' + e.message);
        }
        return fields;
    },

    /**
     * Derives 1–2 character initials from a display name (first + last word initials).
     * @param {string} name - Full display name.
     * @returns {string} Uppercased initials, or '?' if name is empty.
     */
    _getInitials: function (name) {
        if (!name) {
            return '?';
        }
        var parts = name.trim().split(/\s+/);
        if (parts.length === 1) {
            return parts[0].charAt(0).toUpperCase();
        }
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    },

    type: 'WidgetEditorAjax',
});

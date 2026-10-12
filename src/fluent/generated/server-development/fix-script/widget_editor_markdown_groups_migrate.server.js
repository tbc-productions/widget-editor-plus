(function () {
    var legacyName = 'monaco.plus.update_sets.markdown_groups';
    var raw = String(gs.getProperty(legacyName, '') || '').trim();
    if (!raw) return;
    var legacy = JSON.parse(raw);
    if (!legacy || legacy.version !== 1 || !Array.isArray(legacy.groups)) {
        throw new Error('Cannot migrate the legacy Markdown hierarchy: invalid JSON structure.');
    }
    var configs = {};
    function visit(nodes) {
        nodes.forEach(function (node) {
            var children = node.children || [];
            if (children.length)
                configs[node.table] = children.map(function (child) {
                    return child.table;
                });
            visit(children);
        });
    }
    visit(legacy.groups);
    // Empty formerly supplied roots stay disabled when first-install defaults arrive.
    ['sp_widget', 'sc_cat_item_producer', 'sys_security_acl', 'sys_user_group'].forEach(function (table) {
        if (!configs[table]) configs[table] = [];
    });
    Object.keys(configs).forEach(function (table) {
        if (
            !/^[a-z][a-z0-9_]*$/i.test(table) ||
            configs[table].some(function (child) {
                return !/^[a-z][a-z0-9_]*$/i.test(child);
            })
        ) {
            throw new Error('Cannot migrate Markdown configuration for ' + table);
        }
    });
    Object.keys(configs).forEach(function (table) {
        var name = legacyName + '.' + table;
        var property = new GlideRecord('sys_properties');
        if (property.get('name', name)) return;
        property.initialize();
        property.setValue('name', name);
        property.setValue('type', 'string');
        property.setValue('value', configs[table].length ? JSON.stringify(configs[table], null, 4) : '');
        property.setValue('read_roles', 'sp_admin');
        property.setValue('write_roles', 'admin');
        property.setValue('ignore_cache', true);
        property.setValue('description', 'Child tables grouped under ' + table + ' in update set Markdown export.');
        if (!property.insert()) throw new Error('Could not migrate Markdown property: ' + name);
    });
    gs.setProperty(legacyName, '');
})();

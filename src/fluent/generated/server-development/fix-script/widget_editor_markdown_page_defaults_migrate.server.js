(function () {
    var prefix = 'monaco.plus.update_sets.markdown_groups.';
    var previous = [
        'sp_ng_template',
        'm2m_sp_ng_pro_sp_widget',
        'sp_instance',
        'm2m_sp_public_widget_allow_table',
        'm2m_sp_widget_dependency',
    ];
    var widgets, columns;
    try {
        widgets = JSON.parse(gs.getProperty(prefix + 'sp_widget', '[]'));
        columns = JSON.parse(gs.getProperty(prefix + 'sp_column', '[]'));
    } catch (e) {
        return;
    }
    if (!Array.isArray(widgets) || !Array.isArray(columns) || columns.indexOf('sp_instance') === -1) return;
    if (
        widgets.length !== previous.length ||
        previous.some(function (table) {
            return widgets.indexOf(table) === -1;
        })
    )
        return;
    gs.setProperty(
        prefix + 'sp_widget',
        JSON.stringify(
            widgets.filter(function (table) {
                return table !== 'sp_instance';
            }),
            null,
            4
        )
    );
})();

function openCreditPlus() {
    var updateId;
    if (typeof rowSysId !== 'undefined') {
        updateId = rowSysId;
    } else {
        var checked = typeof g_list !== 'undefined' && g_list ? g_list.getChecked() : '';
        var ids = checked ? checked.split(',').filter(Boolean) : [];
        if (ids.length !== 1) {
            alert('Select one customer update for Credit+.');
            return;
        }
        updateId = ids[0];
    }
    if (!/^[0-9a-f]{32}$/i.test(String(updateId || ''))) {
        alert('Select one valid customer update for Credit+.');
        return;
    }
    var ga = new GlideAjax('WidgetEditorCreditAjax');
    ga.addParam('sysparm_name', 'validateLaunch');
    ga.addParam('sysparm_update', updateId);
    ga.getXMLAnswer(function (answer) {
        var result;
        try {
            result = JSON.parse(answer || '{}');
        } catch (e) {
            result = {};
        }
        if (!result.success) {
            alert(result.error || 'Credit+ could not load this customer update.');
            return;
        }
        g_navigation.open(
            '/nav_to.do?uri=' +
                encodeURIComponent(
                    'ui_page.do?sys_id=9c5bf170283e4d6394aa639c79936587&sysparm_update=' + encodeURIComponent(updateId)
                ),
            '_blank'
        );
    });
}

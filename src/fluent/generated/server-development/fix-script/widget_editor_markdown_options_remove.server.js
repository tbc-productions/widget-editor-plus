(function () {
    var name = 'widget_editor_assistant_markdown_options';
    var page = new GlideRecord('sys_ui_page');
    if (page.get('ab5f85327c2c4140989f03c3c99a47f4') && String(page.getValue('name')) === name) page.deleteRecord();
    var acl = new GlideRecord('sys_security_acl');
    if (
        acl.get('47f134b02be946949f3bd14433c39135') &&
        String(acl.getValue('name')) === name &&
        String(acl.getValue('type')) === 'ui_page'
    ) {
        var roles = new GlideRecord('sys_security_acl_role');
        roles.addQuery('sys_security_acl', acl.getUniqueValue());
        roles.query();
        while (roles.next()) roles.deleteRecord();
        acl.deleteRecord();
    }
})();

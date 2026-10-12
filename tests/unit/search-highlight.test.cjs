const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFluentField } = require('../helpers/fluent-source.cjs');

for (const page of ['sys_ui_page_8b2e70458373fe1070b8b5dfeeaad35e', 'sys_ui_page_widget_editor_assistant']) {
    const source = readFluentField('src/fluent/generated/other/sys-ui-page/' + page + '.now.ts', 'clientScript');
    const registration = source.match(/\.filter\('weHighlight', \[[\s\S]*?\n        \]\)/);
    assert.ok(registration, 'search highlight filter exists');
    let highlight;
    vm.runInNewContext('app' + registration[0], {
        app: { filter(_name, dependencies) { highlight = dependencies.at(-1)({ trustAsHtml: value => value }); } },
    });

    test(page + ' highlights regex punctuation as literal text', () => {
        for (const query of ['\\', '^', '$', '*', '+', '?', '.', '(', ')', '|', '[', ']', '{', '}', '-', '/', '[a-z]+', 'a.b', '\\d']) {
            assert.equal(highlight('before ' + query + ' after', query), 'before <mark>' + query + '</mark> after');
            assert.equal(highlight('plain text', query), 'plain text');
        }
        assert.equal(highlight('A.B a.b axb', ' a.b '), '<mark>A.B</mark> <mark>a.b</mark> axb');
    });

    test(page + ' escapes HTML inside and outside search matches', () => {
        assert.equal(highlight('<b>A&B</b> "quoted"', 'A&B'), '&lt;b&gt;<mark>A&amp;B</mark>&lt;/b&gt; &quot;quoted&quot;');
        assert.equal(highlight('<b>A&B</b>', '<b>'), '<mark>&lt;b&gt;</mark>A&amp;B&lt;/b&gt;');
        for (const query of [undefined, '', '  ', 123]) {
            assert.equal(highlight('<>&"\'', query), '&lt;&gt;&amp;&quot;&#39;');
        }
        assert.equal(highlight(null, 'a'), '');
        assert.equal(highlight(undefined, 'a'), '');
        assert.equal(highlight(123, '2'), '1<mark>2</mark>3');
    });
}

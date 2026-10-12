const { readUiPageSource } = require('../helpers/fluent-source.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const serverSource = fs.readFileSync(
    'src/fluent/generated/server-development/script-include/sys_script_include_widget_editor_code_search.server.js',
    'utf8'
);
const pageSource = readUiPageSource('src/fluent/generated/other/sys-ui-page/sys_ui_page_widget_editor_code_search.now.ts');

function searchOneScript(script, query, configure = () => {}) {
    let configRead = false;
    let recordRead = false;

    function GlideRecord(table) {
        if (table === 'sn_codesearch_table') {
            return {
                addQuery() {},
                orderBy() {},
                query() {},
                next() { if (configRead) return false; configRead = true; return true; },
                getUniqueValue() { return 'config-id'; },
                getValue(field) {
                    return { table: 'x_test_script', search_fields: 'script', additional_filter: '' }[field] || '';
                }
            };
        }
        return {
            addQuery() { return { addOrCondition() {} }; },
            addEncodedQuery() {},
            setLimit() {},
            query() {},
            next() { if (recordRead) return false; recordRead = true; return true; },
            isValidField(field) { return field === 'script'; },
            getValue(field) { return field === 'script' ? script : ''; },
            getDisplayValue(field) { return field ? '' : 'Example'; },
            getElement() { return { getLabel() { return 'Script'; } }; },
            getUniqueValue() { return 'record-id'; }
        };
    }

    const context = {
        AbstractAjaxProcessor: {},
        Class: { create() { return function WidgetEditorCodeSearchAjax() {}; } },
        GlideRecord,
        JSON,
        encodeURIComponent
    };
    context.Object = Object.create(Object);
    context.Object.extendsObject = (_base, members) => members;
    vm.runInNewContext(serverSource, context);

    const instance = new context.WidgetEditorCodeSearchAjax();
    instance._getParam = name => ({
        group_id: 'a'.repeat(32),
        query,
        limit: '10',
        secondary_filters: '[]'
    }[name] || '');
    instance._validTable = () => true;
    instance._validFields = () => ['script'];
    instance._validateFilter = () => ({ valid: true });
    instance._getTableDisplayConfig = () => ({ primaryField: '', secondaryFields: [] });
    instance._tableLabel = () => 'Test script';
    instance._answer = value => value;
    configure(instance);
    return instance.search().results[0].matches[0];
}

test('dense matches parse a field once and retain every line of the merged snippet', () => {
    const lines = Array.from({ length: 2000 }, (_, index) => `var incident${index} = 'incident';`);
    let parses = 0;
    const match = searchOneScript(lines.join('\n'), 'incident', instance => {
        const parse = instance._getBlockCommentStates;
        instance._getBlockCommentStates = function (sourceLines) {
            parses++;
            return parse.call(this, sourceLines);
        };
    });
    assert.equal(parses, 1, 'Repeated occurrences must reuse the parsed field');
    assert.equal(match.totalLines, lines.length);
    assert.equal(match.allLinesShown, true);
    assert.deepEqual(Array.from(match.lines, line => line.text), lines);
});

test('line positions and comment context stay correct with CRLF and mixed newlines', () => {
    for (const newline of ['\r\n', '\r', '\n']) {
        const lines = ['/*', 'detail', 'detail', 'detail', 'detail', 'incident', '*/', 'after'];
        const match = searchOneScript(lines.join(newline), 'incident');
        assert.equal(match.line, 6);
        assert.equal(match.totalLines, 8);
        assert.deepEqual(Array.from(match.lines, line => line.num), [4, 5, 6, 7, 8]);
        assert.equal(match.lines.find(line => line.num === 6).inBlockComment, true);
        assert.equal(match.lines.find(line => line.num === 8).inBlockComment, false);
    }
    const mixed = searchOneScript('first\r\nsecond\rthird\nfourth\r\nincident\r\n', 'incident');
    assert.equal(mixed.line, 5);
    assert.equal(mixed.totalLines, 6);
});

test('repeated occurrences on a line reuse its excerpt and stop once the field is fully shown', () => {
    for (const script of [
        'var incident = true;'.repeat(5000),
        ['incident '.repeat(1000), ...Array(10).fill('context')].join('\n')
    ]) {
        let excerpts = 0;
        const match = searchOneScript(script, 'incident', instance => {
            const extract = instance._extractSnippetWithLines;
            instance._extractSnippetWithLines = function (...args) {
                excerpts++;
                return extract.apply(this, args);
            };
        });
        assert.equal(excerpts, 1);
        assert.equal(match.snippet, script.split('\n').slice(0, 3).join('\n'));
        assert.equal(match.allLinesShown, !script.includes('\n'));
    }
});

test('separated snippets retain the five-window limit in long scripts', () => {
    const lines = Array.from({ length: 150 }, (_, index) => index % 20 === 5 ? 'incident' : 'context');
    const match = searchOneScript(lines.join('\n'), 'incident');
    assert.equal(match.lines.filter(line => line.separator).length, 4);
    assert.equal(match.allLinesShown, false);
    assert.equal(match.lines.at(-1).num, 88);
});

test('nearby keyword matches extend one continuous snippet instead of leaving tiny holes', () => {
    const lines = Array.from({ length: 21 }, (_, index) => {
        const line = index + 1;
        return [3, 6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19].includes(line)
            ? `line ${line}: incident`
            : `line ${line}`;
    });
    const match = searchOneScript(lines.join('\n'), 'incident');

    assert.deepEqual(Array.from(match.lines, line => line.num), Array.from({ length: 21 }, (_, i) => i + 1));
    assert.equal(match.lines.some(line => line.separator), false);
    assert.equal(match.allLinesShown, true);
});

test('a separator remains when keyword matches have a genuinely large gap', () => {
    const lines = Array.from({ length: 30 }, (_, index) =>
        [3, 25].includes(index + 1) ? `line ${index + 1}: incident` : `line ${index + 1}`
    );
    const match = searchOneScript(lines.join('\n'), 'incident');
    const separatorIndex = match.lines.findIndex(line => line.separator);

    assert.ok(separatorIndex > 0);
    assert.equal(match.lines[separatorIndex - 1].num, 5);
    assert.equal(match.lines[separatorIndex + 1].num, 23);
    assert.equal(match.allLinesShown, false);
});

test('a few omitted lines are cheaper to show than to replace with a separator', () => {
    const lines = Array.from({ length: 12 }, (_, index) =>
        [3, 10].includes(index + 1) ? `line ${index + 1}: incident` : `line ${index + 1}`
    );
    const match = searchOneScript(lines.join('\n'), 'incident');

    assert.deepEqual(Array.from(match.lines, line => line.num), Array.from({ length: 12 }, (_, i) => i + 1));
    assert.equal(match.lines.some(line => line.separator), false);
    assert.equal(match.allLinesShown, true);
});

test('snippet separator is a shared row spanning gutter and code', () => {
    assert.ok(pageSource.includes('.cs-code-row.cs-sep::after'));
    assert.equal(pageSource.includes('.cs-gutter-num.cs-sep::after'), false);
    assert.equal(pageSource.includes('.cs-code-line.cs-sep::after'), false);
    assert.equal((pageSource.match(/class="cs-code-row" ng-class="\{'cs-sep': line\.separator\}"/g) || []).length, 2);
});

test('line-number gutter spans the snippet padding without removing that spacing', () => {
    assert.ok(pageSource.includes('padding: 0.45rem 0;'));
    assert.ok(pageSource.includes('.cs-code-editor-box.cs-has-gutter::before'));
    assert.ok(pageSource.includes('inset: 0 auto 0 0;'));
    assert.equal((pageSource.match(/class="cs-code-editor-box" ng-class="\{'cs-has-gutter':/g) || []).length, 2);

    const gutterRule = pageSource.slice(
        pageSource.indexOf('        .cs-gutter-num {'),
        pageSource.indexOf('        .cs-code-line {')
    );
    assert.equal(gutterRule.includes('background:'), false);
    assert.equal(gutterRule.includes('border-right:'), false);
});

test('snippet lines retain block-comment context from outside the visible excerpt', () => {
    const match = searchOneScript([
        '/* documentation',
        ' * first detail',
        ' * second detail',
        ' * incident handling detail',
        ' */',
        'var active = true;'
    ].join('\n'), 'incident');

    assert.equal(match.lines.find(line => line.num === 2).inBlockComment, true);
    assert.equal(match.lines.find(line => line.num === 4).inBlockComment, true);
    assert.equal(match.lines.find(line => line.num === 5).inBlockComment, true);
    assert.equal(match.lines.find(line => line.num === 6).inBlockComment, false);
});

test('comment-like delimiters inside strings do not alter following line context', () => {
    const match = searchOneScript([
        'var example = "/* not a comment";',
        'var path = "// also not a comment";',
        'var incident = true;'
    ].join('\n'), 'incident');

    assert.equal(match.lines.every(line => line.inBlockComment === false), true);
});

test('code snippet renderer applies syntax classes while preserving search highlights', () => {
    assert.ok(pageSource.includes('.cs-token-comment'));
    assert.ok(pageSource.includes('.cs-token-string'));
    assert.ok(pageSource.includes('.cs-token-keyword'));
    assert.ok(pageSource.includes('vm.highlightCode = function'));
    assert.equal((pageSource.match(/ctrl\.highlightCode\(/g) || []).length, 4);
    assert.ok(pageSource.includes('<mark class="'), 'highlightCode should still wrap matches in a <mark> element');
});

test('code snippet renderer also highlights secondary CONTAINS filter terms with a distinct mark', () => {
    const start = pageSource.indexOf('vm.highlightCode = function');
    const end = pageSource.indexOf('function _disposeAllEditors');
    const fnSource = pageSource.slice(start, end);

    assert.ok(
        fnSource.includes("f.operator === 'contains' && f.term && f.term.trim()"),
        'Only enabled CONTAINS secondary filters with a non-empty term should be eligible for highlighting'
    );
    assert.ok(
        fnSource.includes('_subtractRanges(secondaryRanges, primaryRanges)'),
        'Secondary-filter matches that overlap the primary query match should yield to the primary highlight'
    );
    assert.ok(
        /range.kind === 'secondary'\s*\? 'cs-highlight cs-highlight-secondary'\s*: 'cs-highlight'/.test(fnSource),
        'Secondary-filter matches should render with the cs-highlight-secondary mark, distinct from the primary query highlight'
    );
    assert.ok(pageSource.includes('mark.cs-highlight-secondary'), 'CSS should style the secondary highlight distinctly from the primary one');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFluentField } = require('../helpers/fluent-source.cjs');

const script = readFluentField(
    'src/fluent/generated/client-development/ui-script/sys_ui_script_a424391983f7725070b8b5dfeeaad3cc.now.ts', 'script'
);
const context = vm.createContext({});
vm.runInContext(script.slice(script.indexOf('    function _parseControllerParams'),
    script.indexOf('    /** Rebuilds \'declare var api\'')), context);

function parse(source) {
    context.source = source;
    const result = vm.runInContext('_parseControllerParams(source)', context, { timeout: 500 });
    return result && Array.from(result);
}

test('controller parameters preserve assignment, arrow, array and bare function forms', () => {
    for (const source of [
        'api.controller = function ($scope, spUtil) {};',
        'api.controller = async function controller($scope, spUtil) {};',
        'api.controller = ($scope, spUtil) => {};',
        'api.controller = async ($scope, spUtil) => {};',
        'api.controller = ["$scope", "spUtil", function ($scope, spUtil) {}];',
        'function ($scope, spUtil) {};',
        ' \n/* first */ /** stars **/ // line\n async function controller(\n$scope, /* service */ spUtil\n) {};',
        '/* comment */function ($scope = null, // service\n spUtil) {};'
    ]) {
        assert.deepEqual(parse(source), ['$scope', 'spUtil'], source);
    }
    assert.deepEqual(parse('function () {}'), []);
    for (const source of ['', '/* unfinished', '/* comment */ other(); function ($scope) {}']) {
        assert.equal(parse(source), null, source);
    }
});

test('adjacent block comments cannot cause exponential backtracking', () => {
    assert.equal(parse('/*' + '*//*'.repeat(20000)), null);
    const comments = '/**/ \n'.repeat(20000);
    assert.equal(parse(comments + 'other();'), null);
    assert.deepEqual(parse(comments + 'function ($scope) {}'), ['$scope']);
});

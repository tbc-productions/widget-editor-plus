const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function headers(env) {
    const source = fs.readFileSync('tests/helpers/instance-auth.ts', 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const context = vm.createContext({ exports: {}, process: { env }, Buffer });
    vm.runInContext(code, context);
    return { ...context.exports.instanceAuthHeaders() };
}

test('E2E API authentication uses the configured SDK session before basic credentials', () => {
    assert.deepEqual(
        headers({
            SN_SDK_SESSION_COOKIE: 'session=test',
            SN_SDK_SESSION_TOKEN: 'token',
            SN_USERNAME: 'old',
            SN_PASSWORD: 'old',
        }),
        {
            Cookie: 'session=test',
            'X-UserToken': 'token',
        }
    );
    assert.deepEqual(headers({ SN_USERNAME: 'test', SN_PASSWORD: 'password' }), {
        Authorization: 'Basic ' + Buffer.from('test:password').toString('base64'),
    });
    assert.throws(() => headers({}), /credentials are missing/);
});

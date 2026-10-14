const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('CI browser images match the locked Playwright browser revision', () => {
    const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
    const version = lock.packages['node_modules/playwright-core'].version;
    for (const name of ['checks', 'release']) {
        const workflow = fs.readFileSync(`.github/workflows/${name}.yaml`, 'utf8');
        const image = workflow.match(/^\s+image: mcr\.microsoft\.com\/playwright:v([^\s]+)-noble$/m);
        assert.equal(image?.[1], version, `${name} must use the browsers expected by Playwright ${version}`);
    }
});

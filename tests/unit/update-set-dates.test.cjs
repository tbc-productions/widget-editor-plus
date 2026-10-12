const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

test('packaging dates follow included source changes without taking unrelated changes', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-dates-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const metadata = path.join(dir, 'page.now.ts');
    fs.writeFileSync(
        metadata,
        "Now.include('./client.js'); Now.include('./page.html');"
    );
    fs.writeFileSync(path.join(dir, 'client.js'), 'first script');
    fs.writeFileSync(path.join(dir, 'page.html'), 'first page');
    const git = (...args) =>
        execFileSync('git', args, {
            cwd: dir,
            env: {
                ...process.env,
                GIT_CONFIG_GLOBAL: '/dev/null',
                GIT_CONFIG_NOSYSTEM: '1',
                GIT_AUTHOR_NAME: 'Test',
                GIT_AUTHOR_EMAIL: 'test@example.invalid',
                GIT_COMMITTER_NAME: 'Test',
                GIT_COMMITTER_EMAIL: 'test@example.invalid',
            },
        });
    git('init');
    function commit(date) {
        git('add', '.');
        git('commit', '--date', date, '-m', 'Fixture');
    }
    commit('2026-01-01T12:00:00Z');
    const context = vm.createContext({
        require,
        console,
        process,
        __dirname: path.resolve('scripts'),
    });
    vm.runInContext(
        fs
            .readFileSync('scripts/generate-update-set-xml.js', 'utf8')
            .replace(/\nmain\(\);\s*$/, ''),
        context
    );
    assert.equal(
        Date.parse(context.getLastGitCommitIso(dir, metadata)),
        Date.parse('2026-01-01T12:00:00Z')
    );
    for (const [file, date] of [
        ['client.js', '2026-02-01T12:00:00Z'],
        ['page.html', '2026-03-01T12:00:00Z'],
    ]) {
        fs.appendFileSync(path.join(dir, file), '\nchanged');
        commit(date);
        assert.equal(Date.parse(context.getLastGitCommitIso(dir, metadata)), Date.parse(date));
    }
    fs.writeFileSync(path.join(dir, 'unrelated.js'), 'unrelated');
    commit('2026-04-01T12:00:00Z');
    assert.equal(
        Date.parse(context.getLastGitCommitIso(dir, metadata)),
        Date.parse('2026-03-01T12:00:00Z')
    );
});

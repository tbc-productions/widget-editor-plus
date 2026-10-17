const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'src/fluent/generated');
const keys = fs.readFileSync(path.join(directory, 'keys.ts'), 'utf8');
const records = {};
// Include retired IDs too: older installations can still contain those records.
for (const match of keys.matchAll(/table:\s*'([a-z_][a-z0-9_]*)'\s+id:\s*'([0-9a-f]{32})'/g)) {
    (records[match[1]] ||= new Set()).add(match[2]);
}
const config = JSON.parse(fs.readFileSync(path.join(root, 'now.config.json'), 'utf8'));
records.sys_app = new Set([config.scopeId]);
const manifest = Object.fromEntries(
    Object.keys(records)
        .sort()
        .map((table) => [table, [...records[table]].sort()])
);
fs.writeFileSync(
    path.join(directory, 'server-development/script-include/widget_editor_uninstall_manifest.json'),
    JSON.stringify(manifest, null, 4) + '\n'
);

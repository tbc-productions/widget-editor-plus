const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function escapeXml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Decodes entities from values read out of already-escaped XML, so escapeXml runs exactly once on output.
function unescapeXml(str) {
    return str
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, '&');
}

function generateSysId() {
    return crypto.randomBytes(16).toString('hex');
}

function getJavaHashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return hash;
}

// Builds a map of Now.ID key -> sys_id from keys.ts's `explicit` block, so
// Now.ID['some-friendly-name'] references in source files can be resolved to the record's
// real sys_id.
function buildKeyToSysIdMap(content) {
    const map = {};
    const entryPattern = /'([^']+)':\s*{\s*table:\s*'[^']*'\s*id:\s*'([^']+)'/g;
    let match;
    while ((match = entryPattern.exec(content)) !== null) {
        map[match[1]] = match[2];
    }
    return map;
}

// Some record types (e.g. sys_ui_page) are declared `composite: true` in now-sdk's own
// plugins, meaning they're ALWAYS identified by a coalescing key (table + a natural field
// like `endpoint`), never a pinned explicit id — now-sdk's own KeysRegistry.commit() strips
// any explicit entry that duplicates a composite one on the next build/deploy. Builds a
// `table::name` -> sys_id map from keys.ts's `composite` array so those records can still
// be resolved without fighting that behavior.
function buildCompositeSysIdMap(content) {
    const map = {};
    const entryPattern = /\{\s*table:\s*'([^']+)'\s*id:\s*'([^']+)'\s*key:\s*\{\s*name:\s*'([^']+)'\s*\}/g;
    let match;
    while ((match = entryPattern.exec(content)) !== null) {
        map[`${match[1]}::${match[3]}`] = match[2];
    }
    return map;
}

// A sys_ui_page's own coalescing name is its `endpoint` field with the trailing `.do`
// stripped (see UiPagePlugin's `coalesce`), so a page defined without an explicit keys.ts
// pin can still be located in the composite map via its own source.
function getUiPageCoalesceName(fileContent) {
    const endpointMatch = fileContent.match(/endpoint:\s*'([^']+)'/);
    return endpointMatch ? endpointMatch[1].replace(/\.do$/, '') : null;
}

// Maps a dist XML basename's sys_id (e.g. the "2a53..." in "sys_properties_2a53....xml")
// to its tracked source .now.ts file, so we can read that file's real git history. A
// dist record's sys_id is resolved from each source file's Now.ID['...'] references
// rather than the file's own name, since a file may be named descriptively and/or
// define multiple records (e.g. a table of related properties in one file).
function indexSourceFiles(srcRoot) {
    const keysPath = path.join(srcRoot, 'keys.ts');
    const keysContent = fs.existsSync(keysPath) ? fs.readFileSync(keysPath, 'utf8') : '';
    const keyToSysId = buildKeyToSysIdMap(keysContent);
    const compositeSysId = buildCompositeSysIdMap(keysContent);
    const index = {};
    const idRefPattern = /Now\.ID\[['"]([^'"]+)['"]\]/g;
    function walkSrc(dir) {
        for (const entry of fs.readdirSync(dir)) {
            const full = path.join(dir, entry);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                walkSrc(full);
            } else if (entry.endsWith('.now.ts')) {
                const content = fs.readFileSync(full, 'utf8');
                let match;
                while ((match = idRefPattern.exec(content)) !== null) {
                    const key = match[1];
                    let sysId = keyToSysId[key];
                    if (!sysId && /^[0-9a-f]{32}$/i.test(key)) {
                        sysId = key; // legacy self-referential Now.ID['<sys_id>']
                    }
                    if (!sysId && content.includes('UiPage(')) {
                        const coalesceName = getUiPageCoalesceName(content);
                        if (coalesceName) sysId = compositeSysId[`sys_ui_page::${coalesceName}`];
                    }
                    if (!sysId) {
                        // Neither keys.ts's explicit nor composite entries resolve this symbolic
                        // Now.ID, so it falls back to its own literal name here, which never matches
                        // a real dist sys_id — the git-history lookup below then silently falls back
                        // to build time, defeating the Preview-collision check entirely.
                        console.warn(
                            `Warning: Now.ID['${key}'] in ${full} could not be resolved to a real sys_id — its shipped sys_updated_on will fall back to build time instead of its real last-modified date.`
                        );
                        sysId = key;
                    }
                    index[sysId] = full;
                }
            }
        }
    }
    walkSrc(srcRoot);
    return index;
}

// Last commit date for a tracked file, so a shipped record's sys_updated_on reflects
// when it actually last changed — not the build time — letting ServiceNow's Update Set
// Preview flag a local customization as a collision instead of silently overwriting it.
function getLastGitCommitIso(rootDir, filePath) {
    try {
        const includes = Array.from(
            fs.readFileSync(filePath, 'utf8').matchAll(/Now\.include\(['"]([^'"]+)['"]\)/g),
            (match) => path.resolve(path.dirname(filePath), match[1])
        );
        const out = execFileSync('git', ['log', '-1', '--format=%aI', '--', filePath, ...includes], {
            cwd: rootDir,
            encoding: 'utf8',
        }).trim();
        return out || null;
    } catch (e) {
        return null;
    }
}

// Scopes sys_updated_on to one property's own Property({...}) block instead of the whole file.
function findPropertyBlockLines(fileContent, propertyName) {
    const lines = fileContent.split('\n');
    const nameLineText = `name: '${propertyName}'`;
    let start = 0;
    while (start < lines.length) {
        if (lines[start].indexOf('Property({') === -1) {
            start++;
            continue;
        }
        let end = start;
        while (end < lines.length - 1 && lines[end].trim() !== '})') end++;
        if (lines[end].trim() !== '})') return null;
        if (lines.slice(start, end + 1).some((l) => l.includes(nameLineText))) {
            return { startLine: start + 1, endLine: end + 1 }; // 1-indexed, inclusive
        }
        start = end + 1;
    }
    return null;
}

// True while `line` (without its +/-/space diff prefix) is part of the value assignment,
// from the `value:` line up to (excluding) the next top-level field.
function valueSectionTracker() {
    let inValue = false;
    return function (body) {
        if (/^\s*value:/.test(body)) {
            inValue = true;
            return true;
        }
        if (inValue && /^\s*(description|ignoreCache|roles|\$meta):/.test(body)) {
            inValue = false;
            return false;
        }
        return inValue;
    };
}

function getLastPropertyValueChangeIso(rootDir, relFilePath, propertyName) {
    const absPath = path.join(rootDir, relFilePath);
    let block;
    try {
        block = findPropertyBlockLines(fs.readFileSync(absPath, 'utf8'), propertyName);
    } catch (e) {
        return null;
    }
    if (!block) return null;

    let log;
    try {
        log = execFileSync(
            'git',
            ['log', `-L${block.startLine},${block.endLine}:${relFilePath}`, '--format=@@COMMIT@@%aI'],
            { cwd: rootDir, encoding: 'utf8', maxBuffer: 1024 * 1024 * 50 }
        );
    } catch (e) {
        return null;
    }

    const commits = log.split('@@COMMIT@@').filter(Boolean);
    let fallbackDate = null;
    for (const commitBlock of commits) {
        const headerEnd = commitBlock.indexOf('\n');
        const date = commitBlock.slice(0, headerEnd);
        const diff = commitBlock.slice(headerEnd + 1);
        if (!fallbackDate) fallbackDate = date;

        const oldTracker = valueSectionTracker();
        const newTracker = valueSectionTracker();
        const oldValueLines = [];
        const newValueLines = [];
        diff.split('\n').forEach((line) => {
            const prefix = line[0];
            if (prefix !== '+' && prefix !== '-' && prefix !== ' ') return;
            const body = line.slice(1);
            if (prefix !== '+' && oldTracker(body)) oldValueLines.push(body.trim());
            if (prefix !== '-' && newTracker(body)) newValueLines.push(body.trim());
        });

        if (oldValueLines.join('\n') !== newValueLines.join('\n')) {
            return date;
        }
    }
    return fallbackDate;
}

const TABLE_TYPE_MAP = {
    sp_widget: 'Widget',
    sys_ui_page: 'UI Page',
    sys_ui_script: 'UI Script',
    sys_script_include: 'Script Include',
    sys_script_client: 'Client Script',
    sys_properties: 'System Property',
    sys_ui_action: 'UI Action',
    sys_security_acl: 'Access Control',
    sys_security_acl_role: 'Access Control Role',
    sys_app_module: 'Module',
    sys_module: 'EcmaScript Module',
    sys_app: 'Application',
};

function main() {
    const rootDir = path.resolve(__dirname, '..');
    const pkgPath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    const appVersion = pkg.version;
    const appName = 'Widget Editor+';
    const distAppDir = path.join(rootDir, 'dist', 'app');
    const targetDir = path.join(rootDir, 'target');

    if (!fs.existsSync(distAppDir)) {
        console.error(`Error: dist/app directory does not exist. Run 'npm run build' first.`);
        process.exit(1);
    }

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const remoteSysId = generateSysId();
    const updateSetSysId = generateSysId();
    const now = new Date();
    const formattedDate = now.toISOString().replace('T', ' ').substring(0, 19);

    let xml = `<?xml version="1.0" encoding="UTF-8"?><unload unload_date="${formattedDate}">\n`;

    // sys_remote_update_set header
    xml += `<sys_remote_update_set action="INSERT_OR_UPDATE">\n`;
    xml += `<application display_value="Global">global</application>\n`;
    xml += `<application_name>Global</application_name>\n`;
    xml += `<application_scope>global</application_scope>\n`;
    xml += `<application_version/>\n`;
    xml += `<collisions/>\n`;
    xml += `<commit_date/>\n`;
    xml += `<deleted/>\n`;
    xml += `<description> </description>\n`;
    xml += `<inserted/>\n`;
    xml += `<name>${appName} (${appVersion})</name>\n`;
    xml += `<origin_sys_id/>\n`;
    xml += `<parent display_value=""/>\n`;
    xml += `<release_date/>\n`;
    xml += `<remote_base_update_set display_value=""/>\n`;
    xml += `<remote_parent_id/>\n`;
    xml += `<remote_sys_id>${remoteSysId}</remote_sys_id>\n`;
    xml += `<state>loaded</state>\n`;
    xml += `<summary/>\n`;
    xml += `<sys_class_name>sys_remote_update_set</sys_class_name>\n`;
    xml += `<sys_created_by>admin</sys_created_by>\n`;
    xml += `<sys_created_on>${formattedDate}</sys_created_on>\n`;
    xml += `<sys_id>${updateSetSysId}</sys_id>\n`;
    xml += `<sys_mod_count>0</sys_mod_count>\n`;
    xml += `<sys_updated_by>admin</sys_updated_by>\n`;
    xml += `<sys_updated_on>${formattedDate}</sys_updated_on>\n`;
    xml += `<update_set display_value=""/>\n`;
    xml += `<update_source display_value=""/>\n`;
    xml += `<updated/>\n`;
    xml += `</sys_remote_update_set>\n`;

    function walk(dir) {
        let results = [];
        const list = fs.readdirSync(dir);
        list.forEach((file) => {
            file = path.join(dir, file);
            const stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                if (!file.includes('author_elective_update')) {
                    results = results.concat(walk(file));
                }
            } else if (file.endsWith('.xml')) {
                results.push(file);
            }
        });
        return results;
    }

    const xmlFiles = walk(distAppDir);
    console.log(`Generating Update Set XML from ${xmlFiles.length} dist records...`);

    const sourceFileIndex = indexSourceFiles(path.join(rootDir, 'src', 'fluent', 'generated'));

    xmlFiles.forEach((file) => {
        let content = fs.readFileSync(file, 'utf8').trim();

        const updateNameMatch = content.match(/<sys_update_name>(.*?)<\/sys_update_name>/);
        const sysNameMatch = content.match(/<sys_name>(.*?)<\/sys_name>/) || content.match(/<name>(.*?)<\/name>/);
        const tableMatch = content.match(/<record_update table="([^"]+)">/);

        const table = tableMatch ? unescapeXml(tableMatch[1]) : '';
        const updateName = updateNameMatch ? unescapeXml(updateNameMatch[1]) : path.basename(file, '.xml');
        const targetName = sysNameMatch ? unescapeXml(sysNameMatch[1]) : updateName;

        // Every record ships with its real last-git-commit date rather than the build time,
        // so a local customization made after that date shows up as a Preview collision on
        // re-import instead of being silently overwritten. Falls back to build time if the
        // source file has no git history (e.g. new/untracked).
        const basename = path.basename(file, '.xml');
        const sysIdMatch = basename.match(/[0-9a-f]{32}$/i);
        const srcFile = sysIdMatch ? sourceFileIndex[sysIdMatch[0]] : undefined;
        const relSrcFile = srcFile ? path.relative(rootDir, srcFile) : undefined;
        // sys_properties can share one source file across many properties (see the code-search
        // display-fields file), so resolve this specific property's own value-change history
        // instead of the whole file's last commit.
        const gitDate =
            table === 'sys_properties' && relSrcFile
                ? getLastPropertyValueChangeIso(rootDir, relSrcFile, targetName) ||
                  getLastGitCommitIso(rootDir, srcFile)
                : srcFile
                  ? getLastGitCommitIso(rootDir, srcFile)
                  : null;
        const recordDate = gitDate ? new Date(gitDate).toISOString().replace('T', ' ').substring(0, 19) : formattedDate;
        content = content.replace(
            /(<sys_id>[^<]*<\/sys_id>)/,
            `$1\n    <sys_created_on>${recordDate}</sys_created_on>\n    <sys_updated_on>${recordDate}</sys_updated_on>`
        );
        const type = TABLE_TYPE_MAP[table] || table || 'Custom Record';

        const entrySysId = generateSysId();
        const payloadHash = getJavaHashCode(content);

        xml += `<sys_update_xml action="INSERT_OR_UPDATE">\n`;
        xml += `<action>INSERT_OR_UPDATE</action>\n`;
        xml += `<application display_value="Widget Editor+">d65bb60783e7321070b8b5dfeeaad3b2</application>\n`;
        xml += `<category>customer</category>\n`;
        xml += `<comments/>\n`;
        xml += `<name>${escapeXml(updateName)}</name>\n`;
        xml += `<payload>${escapeXml(content)}</payload>\n`;
        xml += `<payload_hash>${payloadHash}</payload_hash>\n`;
        xml += `<remote_update_set display_value="${appName} (${appVersion})">${updateSetSysId}</remote_update_set>\n`;
        xml += `<replace_on_upgrade>false</replace_on_upgrade>\n`;
        xml += `<sys_created_by>admin</sys_created_by>\n`;
        xml += `<sys_created_on>${recordDate}</sys_created_on>\n`;
        xml += `<sys_id>${entrySysId}</sys_id>\n`;
        xml += `<sys_mod_count>0</sys_mod_count>\n`;
        xml += `<sys_recorded_at>19f7fb59e130000001</sys_recorded_at>\n`;
        xml += `<sys_updated_by>admin</sys_updated_by>\n`;
        xml += `<sys_updated_on>${recordDate}</sys_updated_on>\n`;
        xml += `<table/>\n`;
        xml += `<target_name>${escapeXml(targetName)}</target_name>\n`;
        xml += `<type>${escapeXml(type)}</type>\n`;
        xml += `<update_domain>global</update_domain>\n`;
        xml += `<update_guid/>\n`;
        xml += `<update_guid_history/>\n`;
        xml += `</sys_update_xml>\n`;
    });

    xml += `</unload>\n`;

    const outputFileName = `sys_remote_update_set_widget_editor_plus_${appVersion.replace(/\./g, '_')}.xml`;
    const outputPath = path.join(targetDir, outputFileName);
    fs.writeFileSync(outputPath, xml);

    console.log(`Update Set XML created successfully: ${outputPath}`);
}

main();

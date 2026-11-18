const path = require('path');

/**
 * Reports numbered file progress and running test totals for the Node.js test runner.
 * @param {AsyncIterable<object>} source Test runner events.
 * @returns {AsyncGenerator<string>} Progress lines.
 */
module.exports = async function* testProgressReporter(source) {
    const files = new Set();
    let completedFiles = 0;
    let failed = 0;
    let passed = 0;

    for await (const { data, type } of source) {
        const isFileEntry = data?.file && data.nesting === 0 && data.name === path.relative(process.cwd(), data.file);
        if (type === 'test:enqueue' && isFileEntry) {
            files.add(data.file);
        } else if ((type === 'test:pass' || type === 'test:fail') && !isFileEntry && data.details?.type !== 'suite') {
            if (type === 'test:pass') passed++;
            else failed++;
        } else if (type === 'test:summary' && data.file) {
            completedFiles++;
            const total = Math.max(files.size, completedFiles);
            const percent = Math.floor((completedFiles / total) * 100);
            const width = String(total).length;
            yield `[${String(completedFiles).padStart(width)}/${total} ${String(percent).padStart(3)}%] ${path.basename(data.file)} (${passed} passed, ${failed} failed so far)\n`;
        }
    }
};

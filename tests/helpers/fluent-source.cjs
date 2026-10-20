const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Read the field's build-time value, whether it is inline or in an adjacent file.
function readFluentField(file, property, declaration) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let value;
    function visit(node) {
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === property) {
            const initialiser = node.initializer;
            if (ts.isNoSubstitutionTemplateLiteral(initialiser) || ts.isStringLiteral(initialiser)) {
                value = initialiser.text;
            } else if (ts.isCallExpression(initialiser) && initialiser.expression.getText(source) === 'Now.include'
                && initialiser.arguments.length === 1 && ts.isStringLiteral(initialiser.arguments[0])) {
                value = fs.readFileSync(path.resolve(path.dirname(file), initialiser.arguments[0].text), 'utf8');
            } else if (ts.isTemplateExpression(initialiser)) {
                value = initialiser.head.text;
                for (const span of initialiser.templateSpans) {
                    const include = span.expression;
                    if (!ts.isCallExpression(include) || include.expression.getText(source) !== 'Now.include'
                        || include.arguments.length !== 1 || !ts.isStringLiteral(include.arguments[0])) {
                        throw new Error('Unsupported Fluent template: ' + file + ':' + property);
                    }
                    value += fs.readFileSync(path.resolve(path.dirname(file), include.arguments[0].text), 'utf8') + span.literal.text;
                }
            } else {
                throw new Error('Unsupported Fluent field: ' + file + ':' + property);
            }
        }
        ts.forEachChild(node, visit);
    }
    if (declaration) {
        for (const statement of source.statements) {
            if (ts.isVariableStatement(statement)) {
                for (const item of statement.declarationList.declarations)
                    if (item.name.getText(source) === declaration) visit(item);
            }
        }
    } else visit(source);
    if (value === undefined) throw new Error('Missing Fluent field: ' + file + ':' + property);
    return value;
}

// Source assertions inspect metadata together with the actual HTML and script.
function readUiPageSource(file) {
    return [fs.readFileSync(file, 'utf8'), readFluentField(file, 'html'), readFluentField(file, 'clientScript')].join('\n');
}

module.exports = { readFluentField, readUiPageSource };

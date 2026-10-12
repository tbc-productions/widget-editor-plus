module.exports = [
    {
        ignores: ['dist/**', 'target/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'],
    },
    {
        files: ['**/*.js', '**/*.cjs'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'script' },
        rules: {
            'no-dupe-args': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
            'no-unsafe-finally': 'error',
            'valid-typeof': 'error',
        },
    },
    {
        files: ['src/fluent/generated/server-development/**/*.js'],
        rules: {
            'quote-props': ['error', 'as-needed', { keywords: true, unnecessary: false }],
        },
    },
];

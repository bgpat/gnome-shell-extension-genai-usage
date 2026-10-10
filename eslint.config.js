import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'build/**',
            'node_modules/**',
            '**/*.zip',
            'tests/gjs/**',
            'scripts/prefs-dev-entry.js',
            'scripts/verify-prefs-tab-icons.js',
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
);

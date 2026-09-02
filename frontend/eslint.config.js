// ESLint flat config for the frontend (ESM + browser). Lints plain JS sources;
// .vue SFC files need eslint-plugin-vue and are out of this minimal gate for now.
module.exports = [
  {
    files: ['src/**/*.js'],
    ignores: ['node_modules/**', 'dist/**'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
        AbortController: 'readonly',
        FormData: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
];

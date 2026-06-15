module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react-refresh'],
  rules: {
    // Codebase uses `any` extensively — enforcing this causes 1000+ errors
    '@typescript-eslint/no-explicit-any': 'off',
    // Files often export utilities alongside components — not a production bug
    'react-refresh/only-export-components': 'off',
    // Unused vars: allow underscore-prefixed params (common convention here)
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Hook dependency warnings: downgrade so they don't break CI
    'react-hooks/exhaustive-deps': 'warn',
  },
};

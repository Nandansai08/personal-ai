// MIT License — personal-ai
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', 'coverage/', 'src/ui/web/client/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      // Project rule: no `any` types (CLAUDE.md)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Errors returned as values — but allow throw in constructors/factories
      'no-console': 'off',
      // Noisy on init-then-assign patterns (let x = 0; …; x = parsed)
      'no-useless-assignment': 'off',
    },
  },
)

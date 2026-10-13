import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'packages/api-contract/generated/**',
      'apps/api/src/generated/**',
      'apps/web/src/api/generated/**',
      '.agents/**',
      '.idea/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: [
      'apps/api/**/*.ts',
      'scripts/**/*.{js,mjs}',
      'packages/**/scripts/**/*.{js,mjs}',
      '**/*.config.{js,cjs,mjs,ts}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
    },
  },
)

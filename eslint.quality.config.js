import sonarjs from 'eslint-plugin-sonarjs'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'

import baseConfig from './eslint.config.js'

function asWarnings(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, setting]) => {
      const [severity, ...options] = Array.isArray(setting)
        ? setting
        : [setting]

      if (severity === 'off' || severity === 0) {
        return [name, setting]
      }

      return [name, options.length === 0 ? 'warn' : ['warn', ...options]]
    }),
  )
}

const strictTypeCheckedRules = Object.assign(
  {},
  ...tseslint.configs.strictTypeChecked.map((config) => config.rules ?? {}),
)

export default defineConfig(...baseConfig, {
  name: 'quality/type-aware-sonar-report',
  files: ['apps/**/*.{ts,tsx}'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint.plugin,
    sonarjs,
  },
  rules: {
    ...asWarnings(strictTypeCheckedRules),
    ...asWarnings(sonarjs.configs.recommended.rules),
  },
  settings: sonarjs.configs.recommended.settings,
})

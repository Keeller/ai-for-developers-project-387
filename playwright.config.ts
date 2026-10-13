import { defineConfig } from '@playwright/test'

const playwrightPort = process.env.PLAYWRIGHT_PORT ?? '3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${playwrightPort}`,
    trace: 'retain-on-failure',
  },
})

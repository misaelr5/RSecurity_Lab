import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser', workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4331', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/browser-server.ts', url: 'http://127.0.0.1:4331/api/operator/status', reuseExistingServer: false },
})

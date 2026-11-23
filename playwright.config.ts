import { defineConfig } from '@playwright/test'
const baseURL = 'http://127.0.0.1:' + (process.env.REAC_E2E_PORT ?? '4331')
export default defineConfig({
  testDir: './tests/browser', workers: 1, reporter: 'list',
  use: { baseURL, channel: 'chrome', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/browser-server.ts', url: baseURL + '/api/operator/status', reuseExistingServer: false },
})

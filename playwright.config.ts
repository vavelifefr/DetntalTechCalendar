import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: '3001',
        DTC_DB_PATH: ':memory:',
      },
    },
    {
      command: 'npm run dev:web',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        VITE_PORT: '5174',
        VITE_API_PORT: '3001',
      },
    },
  ],
})

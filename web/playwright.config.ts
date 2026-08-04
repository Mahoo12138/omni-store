import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.OMNISTORE_E2E_BASE_URL ?? 'http://127.0.0.1:18080'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env.OMNISTORE_E2E_BASE_URL ? undefined : {
    command: '../scripts/test-env.sh run',
    url: `${baseURL}/api/v1/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

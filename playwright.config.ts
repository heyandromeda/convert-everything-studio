import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against the production build (with its Content Security Policy),
 * so they exercise exactly what is deployed.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4792',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  webServer: {
    command: 'npx vite preview --port 4792 --strictPort',
    url: 'http://localhost:4792',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 15'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})

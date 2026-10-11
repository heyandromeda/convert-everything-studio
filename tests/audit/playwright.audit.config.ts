import { defineConfig, devices } from '@playwright/test'

/**
 * Audit-only Playwright config. Lives beside the audit specs so the app's own config is untouched.
 * AUDIT_CHROMIUM points at a preinstalled Chromium when Playwright's bundled browsers are unavailable.
 * The "chromium-iphone-emu" project is Chromium with the iPhone 15 user agent and viewport. It is not WebKit or Safari.
 */
const exe = process.env.AUDIT_CHROMIUM ? { launchOptions: { executablePath: process.env.AUDIT_CHROMIUM } } : {}

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.audit\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4792', trace: 'retain-on-failure', acceptDownloads: true },
  webServer: { command: 'npx vite preview --port 4792 --strictPort', cwd: '../..', url: 'http://localhost:4792', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...exe } },
    { name: 'chromium-iphone-emu', use: { ...devices['iPhone 15'], browserName: 'chromium', ...exe } },
  ],
})

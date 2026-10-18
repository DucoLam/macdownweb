import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // F-155: a fresh browser profile is a "first launch", which opens the help
    // document. Every test starts as a returning visitor; the F-155 tests use
    // an empty storage state instead.
    storageState: {
      cookies: [],
      origins: [{ origin: 'http://localhost:5173', localStorage: [{ name: 'macdown.firstVersionInstalled', value: '0.7.3' }] }],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

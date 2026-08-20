const { defineConfig, devices } = require('@playwright/test');
const { getStagingConfig } = require('./tests/e2e/support/staging-config.cjs');

// This config intentionally fails closed when the staging-only credentials are absent
// or identify the production project. It never starts a local server.
const staging = getStagingConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: staging.baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'staging-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'staging-mobile-chromium', use: { ...devices['Pixel 7'] } }
  ]
});

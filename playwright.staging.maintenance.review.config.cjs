const { defineConfig, devices } = require('@playwright/test');
const { getStagingConfig } = require('./tests/e2e/support/staging-config.cjs');

// Separate controlled-data staging journey for Maintenance. It creates only
// explicitly labelled review data; production configuration is rejected by
// staging-config.cjs before Playwright starts.
const staging = getStagingConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/maintenance-review.spec.cjs',
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
  projects: [{ name: 'staging-maintenance-review-chromium', use: { ...devices['Desktop Chrome'] } }]
});

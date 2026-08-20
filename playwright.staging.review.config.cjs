const { defineConfig, devices } = require('@playwright/test');
const { getStagingConfig } = require('./tests/e2e/support/staging-config.cjs');

// Separate from the read-only preflight: this journey creates labelled staging review data.
const staging = getStagingConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/vehicle-check-review.spec.cjs',
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
  projects: [{ name: 'staging-review-chromium', use: { ...devices['Desktop Chrome'] } }]
});

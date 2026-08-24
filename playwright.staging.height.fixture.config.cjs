const { defineConfig, devices } = require('@playwright/test');
const { getStagingConfig } = require('./tests/e2e/support/staging-config.cjs');

// This config is only used by the separately confirmed fixture workflow.
// It creates a single persistent, labelled staging record when absent.
const staging = getStagingConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/height-equipment-fixture.spec.cjs',
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
  projects: [{ name: 'staging-height-fixture-chromium', use: { ...devices['Desktop Chrome'] } }]
});

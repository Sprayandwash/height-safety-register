const { defineConfig, devices } = require('@playwright/test');
const { getStagingAdminReadOnlyConfig } = require('./tests/e2e/support/staging-admin-readonly-config.cjs');

const staging = getStagingAdminReadOnlyConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/notification-records-review.spec.cjs',
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
  projects: [{ name: 'staging-notification-records', use: { ...devices['Desktop Chrome'] } }]
});

const { defineConfig, devices } = require('@playwright/test');
const { getStagingPreloadedClaimConfig } = require('./tests/e2e/support/staging-preloaded-claim-config.cjs');

const staging = getStagingPreloadedClaimConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/preloaded-user-claim-review.spec.cjs',
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
  projects: [{ name: 'staging-preloaded-claim-chromium', use: { ...devices['Desktop Chrome'] } }]
});

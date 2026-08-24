const { defineConfig, devices } = require('@playwright/test');
const { getStagingConfig } = require('./tests/e2e/support/staging-config.cjs');

// A separate, read-only Height Equipment review. staging-config.cjs refuses
// missing configuration and the production Supabase project before testing.
const staging = getStagingConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/height-equipment-read-only-review.spec.cjs',
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
    { name: 'staging-height-review-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'staging-height-review-mobile-chromium', use: { ...devices['Pixel 7'] } }
  ]
});

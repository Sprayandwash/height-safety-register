const { defineConfig, devices } = require('@playwright/test');
const { getStagingHeightReadOnlySecurityConfig } = require('./tests/e2e/support/staging-height-readonly-security-config.cjs');

const staging = getStagingHeightReadOnlySecurityConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/height-readonly-security.spec.cjs',
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
  projects: [{ name: 'staging-height-readonly-security-chromium', use: { ...devices['Desktop Chrome'] } }]
});

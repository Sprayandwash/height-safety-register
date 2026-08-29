const { defineConfig, devices } = require('@playwright/test');
const { getStagingConfig } = require('./tests/e2e/support/staging-config.cjs');

const staging = getStagingConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/mobile-ui-audit.spec.cjs',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['line'], ['html', { open: 'never' }]],
  use: { baseURL: staging.baseURL, screenshot: 'off', trace: 'retain-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'mobile-audit-pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-audit-iphone-narrow', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 375, height: 667 } } }
  ]
});

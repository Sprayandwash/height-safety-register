const { defineConfig, devices } = require('@playwright/test');
const { getStagingConfig } = require('./tests/e2e/support/staging-config.cjs');
const staging = getStagingConfig({ ...process.env, E2E_STAGING_TEST_EMAIL: process.env.E2E_STAGING_ADMIN_EMAIL, E2E_STAGING_TEST_PASSWORD: process.env.E2E_STAGING_ADMIN_PASSWORD });
module.exports = defineConfig({ testDir: './tests/e2e/staging', testMatch: '**/bootstrap-mobile-audit-fixtures.spec.cjs', timeout: 120_000, use: { baseURL: staging.baseURL, trace: 'retain-on-failure' }, projects: [{ name: 'staging-fixtures', use: { ...devices['Pixel 7'] } }] });

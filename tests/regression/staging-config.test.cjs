const test = require('node:test');
const assert = require('node:assert/strict');
const { PRODUCTION_PROJECT_REF, REVIEW_PREFIX, getStagingConfig } = require('../e2e/support/staging-config.cjs');

const valid = {
  E2E_STAGING_PROJECT_REF: 'staging-ref-123',
  E2E_STAGING_BASE_URL: 'https://staging.example.test/',
  E2E_STAGING_TEST_EMAIL: 'e2e@example.test',
  E2E_STAGING_TEST_PASSWORD: 'not-a-real-secret'
};

test('STAGING-SAFETY-001: staging test configuration is accepted only with all required values', () => {
  const config = getStagingConfig(valid);
  assert.equal(config.baseURL, 'https://staging.example.test');
  assert.equal(config.reviewPrefix, REVIEW_PREFIX);
  assert.throws(() => getStagingConfig({ ...valid, E2E_STAGING_TEST_EMAIL: '' }), /E2E_STAGING_TEST_EMAIL/);
});

test('STAGING-SAFETY-002: staging tests refuse the production project or production URL', () => {
  assert.throws(() => getStagingConfig({ ...valid, E2E_STAGING_PROJECT_REF: PRODUCTION_PROJECT_REF }), /SAFETY STOP/);
  assert.throws(() => getStagingConfig({ ...valid, E2E_STAGING_BASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co` }), /SAFETY STOP/);
});

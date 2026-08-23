const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('STAGING-SAFETY-003: the read-only preflight cannot collect data-creating review tests', () => {
  const preflightConfig = fs.readFileSync(path.resolve(__dirname, '../../playwright.staging.config.cjs'), 'utf8');
  const reviewConfig = fs.readFileSync(path.resolve(__dirname, '../../playwright.staging.review.config.cjs'), 'utf8');
  assert.match(preflightConfig, /testMatch:\s*'\*\*\/staging-preflight\.spec\.cjs'/);
  assert.match(reviewConfig, /testMatch:\s*'\*\*\/vehicle-check-review\.spec\.cjs'/);
  assert.doesNotMatch(preflightConfig, /vehicle-check-review/);
});

test('STAGING-AUTOMATION-001: a main merge builds staging, then starts only the read-only preflight', () => {
  const buildWorkflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/build-staging-app.yml'), 'utf8');
  const preflightWorkflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/staging-browser-review.yml'), 'utf8');

  assert.match(buildWorkflow, /push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(buildWorkflow, /Automatic staging build authorised by a push to main/);
  assert.match(preflightWorkflow, /workflow_run:/);
  assert.match(preflightWorkflow, /- Build staging app/);
  assert.match(preflightWorkflow, /workflow_run\.conclusion == 'success'/);
  assert.doesNotMatch(preflightWorkflow, /vehicle-check-review/);
  assert.doesNotMatch(preflightWorkflow, /maintenance-review/);
});

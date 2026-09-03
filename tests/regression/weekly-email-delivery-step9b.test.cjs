const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const spec = fs.readFileSync(path.join(root, 'tests/e2e/staging/weekly-email-delivery-step9b.spec.cjs'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/staging-weekly-email-delivery-step9b.yml'), 'utf8');

test('NOTIFY-WEEKLY-EMAIL-STEP9B-001: delivery test sends only the secret staging recipient and verifies one ledger increment', () => {
  assert.match(spec, /action: 'send_staging_test_weekly_email'/);
  assert.match(spec, /confirmation: 'SEND_ONE_STAGING_TEST_WEEKLY_EMAIL'/);
  assert.match(spec, /recipient: 'staging_test_recipient'/);
  assert.match(spec, /notifications: before\.notifications \+ 1/);
  assert.match(spec, /deliveries: before\.deliveries \+ 1/);
  assert.doesNotMatch(spec, /@sprayandwash\.co\.nz|@updates\.sprayandwash\.co\.nz/);
});

test('NOTIFY-WEEKLY-EMAIL-STEP9B-002: delivery workflow is exact-confirmation, staging-only and records outcomes without secrets', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /SEND ONE STAGING WEEKLY EMAIL/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /PRODUCTION_PROJECT_REF: twkgfmctuffmkvkmdkct/);
  assert.match(workflow, /E2E_STAGING_PROJECT_REF/);
  assert.match(workflow, /Create permanent Step 9B delivery record/);
  assert.match(workflow, /git commit -m/);
  assert.doesNotMatch(workflow, /RESEND_API_KEY|RESEND_FROM|STAGING_EMAIL_TEST_RECIPIENT|api\.resend\.com/);
});

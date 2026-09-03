const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/employee-notifications/index.ts'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/configure-staging-weekly-email-delivery.yml'), 'utf8');

test('NOTIFY-WEEKLY-EMAIL-STAGING-001: provider send is restricted to the dedicated staging test action', () => {
  assert.match(source, /action === 'send_staging_test_weekly_email'/);
  assert.match(source, /STAGING_EMAIL_TEST_DELIVERY_ENABLED/);
  assert.match(source, /SEND_ONE_STAGING_TEST_WEEKLY_EMAIL/);
  assert.match(source, /await isActiveAdmin\(service, user\.id\)/);
  assert.match(source, /https:\/\/api\.resend\.com\/emails/);
  assert.match(source, /'Idempotency-Key': idempotencyKey/);
  assert.match(source, /stagingEmailTestVersion = 'branded-template-v1'/);
  assert.match(source, /staging-weekly-email-test:\$\{stagingEmailTestVersion\}:\$\{userId\}/);
  assert.match(source, /recipient: 'staging_secret'/);
  assert.match(source, /function configuredAppPublicUrl\(\)/);
  assert.match(source, /Deno\.env\.get\('APP_PUBLIC_URL'\)/);
  assert.match(source, /url\.protocol === 'https:'/);
  assert.match(source, /Staging app link is not configured with a valid HTTPS APP_PUBLIC_URL/);
  assert.doesNotMatch(source, /href="\.\/"/);
  assert.doesNotMatch(source, /action === 'send_weekly_email'/);
});

test('NOTIFY-WEEKLY-EMAIL-STAGING-002: secret configuration is main-only, staging-only and does not deliver', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /CONFIGURE STAGING WEEKLY EMAIL TEST DELIVERY/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /STAGING_PROJECT_REF: tsnmbvezrweciaitkquf/);
  assert.match(workflow, /PRODUCTION_PROJECT_REF: twkgfmctuffmkvkmdkct/);
  assert.match(workflow, /RESEND_STAGING_API_KEY/);
  assert.match(workflow, /RESEND_STAGING_FROM/);
  assert.match(workflow, /RESEND_STAGING_TEST_RECIPIENT/);
  assert.match(workflow, /STAGING_APP_PUBLIC_URL/);
  assert.match(workflow, /APP_PUBLIC_URL=\$APP_PUBLIC_URL/);
  assert.match(workflow, /supabase secrets set/);
  assert.match(workflow, /supabase functions deploy employee-notifications/);
  assert.doesNotMatch(workflow, /api\.resend\.com|send_staging_test_weekly_email|curl .*emails/);
});

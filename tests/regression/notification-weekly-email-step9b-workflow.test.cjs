const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../../.github/workflows/apply-notification-weekly-email-preference-staging.yml'),
  'utf8'
);

test('NOTIFY-STEP9B-001: weekly-email preference migration is staging-only and explicitly confirmed', () => {
  assert.match(workflow, /APPLY NOTIFICATION EMAIL STAGING STEP 9B/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(workflow, /STAGING_PROJECT_REF: tsnmbvezrweciaitkquf/);
  assert.match(workflow, /PRODUCTION_PROJECT_REF: twkgfmctuffmkvkmdkct/);
  assert.match(workflow, /SUPABASE_STAGING_DB_URL/);
  assert.doesNotMatch(workflow, /SUPABASE_ACCESS_TOKEN|SUPABASE_PRODUCTION_DB_URL/);
});

test('NOTIFY-STEP9B-002: only the reviewed migration can be applied once', () => {
  assert.match(workflow, /20260902082102_disable_implicit_weekly_email\.sql/);
  assert.match(workflow, /expected_sha='5609b57661b76f45a148bf75d6f5e5bdc898117309466d8c0f05a7226d75bd79'/);
  assert.match(workflow, /expected exactly one legacy implicit enabled row/);
  assert.match(workflow, /--single-transaction/);
  assert.match(workflow, /test "\$default_value" = 'false'/);
  assert.match(workflow, /test "\$enabled_rows" = '0'/);
});

test('NOTIFY-STEP9B-003: a permanent record is written only after verified staging success', () => {
  const verifyPosition = workflow.indexOf('Verify staging result');
  const recordPosition = workflow.indexOf('Commit permanent Step 9B record');
  assert.ok(verifyPosition >= 0 && recordPosition > verifyPosition);
  assert.match(workflow, /docs\/notifications\/STEP-9B-WEEKLY-EMAIL-PREFERENCE-\$\{GITHUB_RUN_ID\}\.md/);
  assert.match(workflow, /git push origin HEAD:main/);
  assert.match(workflow, /Production contacted:\*\* No/);
  assert.doesNotMatch(workflow, /RESEND|SMTP|send-notification|functions deploy/i);
});

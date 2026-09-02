const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const spec = fs.readFileSync(
  path.resolve(__dirname, '../../tests/e2e/staging/weekly-email-renderer-review.spec.cjs'),
  'utf8'
);
const workflow = fs.readFileSync(
  path.resolve(__dirname, '../../.github/workflows/staging-weekly-email-renderer-review.yml'),
  'utf8'
);

test('NOTIFY-WEEKLY-RENDER-STEP9A-001: review renders both scopes and keeps both ledgers unchanged', () => {
  assert.match(spec, /action: 'render_weekly_email', scope: 'admin'/);
  assert.match(spec, /action: 'render_weekly_email', scope: 'self'/);
  assert.match(spec, /await expect\.poll\(\(\) => ledgerCounts\(page\)\)\.toEqual\(before\)/);
  assert.match(spec, /Weekly operations update/);
  assert.match(spec, /No open tasks are assigned to this employee/);
  assert.match(spec, /expectNoEmployeeInternals/);
});

test('NOTIFY-WEEKLY-RENDER-STEP9A-002: the renderer Step 9A workflow is main-only, staging-only and has no delivery path', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /E2E_STAGING_ADMIN_EMAIL/);
  assert.match(workflow, /E2E_STAGING_PROJECT_REF=\$ref/);
  assert.match(workflow, /PRODUCTION_PROJECT_REF/);
  assert.match(workflow, /playwright\.staging\.weekly-email-renderer\.config\.cjs/);
  assert.doesNotMatch(workflow, /RESEND_API_KEY|api\.resend\.com|supabase functions deploy|operations_notifications.*insert|cron\.schedule/);
});

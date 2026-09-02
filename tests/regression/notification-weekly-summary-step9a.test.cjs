const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const spec = fs.readFileSync(
  path.resolve(__dirname, '../../tests/e2e/staging/weekly-summary-preview-review.spec.cjs'),
  'utf8'
);
const workflow = fs.readFileSync(
  path.resolve(__dirname, '../../.github/workflows/staging-weekly-summary-preview-review.yml'),
  'utf8'
);

test('NOTIFY-WEEKLY-STEP9A-001: staging weekly preview review checks both scopes and leaves the delivery ledger unchanged', () => {
  assert.match(spec, /scope: 'admin'/);
  assert.match(spec, /scope: 'self'/);
  assert.match(spec, /await expect\.poll\(\(\) => ledgerCounts\(page\)\)\.toEqual\(before\)/);
  assert.match(workflow, /Employee task lines exposed no assignment identifier/);
  assert.match(spec, /not\.toHaveProperty\('assigned_to'\)/);
  assert.match(spec, /not\.toHaveProperty\('description'\)/);
});

test('NOTIFY-WEEKLY-STEP9A-002: the Step 9A workflow is main-only, staging-only and runs no delivery path', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /E2E_STAGING_ADMIN_EMAIL/);
  assert.match(workflow, /E2E_STAGING_PROJECT_REF=\$ref/);
  assert.match(workflow, /PRODUCTION_PROJECT_REF/);
  assert.match(workflow, /playwright\.staging\.weekly-summary-preview\.config\.cjs/);
  assert.doesNotMatch(workflow, /RESEND_API_KEY|api\.resend\.com|supabase functions deploy|operations_notifications.*insert|cron\.schedule/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../../.github/workflows/deploy-staging-weekly-summary-preview.yml'),
  'utf8'
);

test('NOTIFY-WEEKLY-DEPLOY-001: staging preview deployment is manual, confirmed, and locked to the isolated staging project', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /DEPLOY STAGING NOTIFICATION PREVIEW/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /tsnmbvezrweciaitkquf/);
  assert.match(workflow, /twkgfmctuffmkvkmdkct/);
  assert.match(workflow, /discovered_ref.*STAGING_PROJECT_REF/s);
});

test('NOTIFY-WEEKLY-DEPLOY-002: staging deployment publishes only the preview function and cannot schedule or deliver email', () => {
  assert.match(workflow, /supabase functions deploy employee-notifications/);
  assert.doesNotMatch(workflow, /RESEND_API_KEY|api\.resend\.com|cron\.schedule|pg_cron|operations_notifications/);
  assert.match(workflow, /No database migration, notification record, schedule, email provider, push delivery or production access/);
});

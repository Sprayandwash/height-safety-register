const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../../.github/workflows/create-notification-weekly-email-migration.yml'),
  'utf8'
);

test('NOTIFY-MIGRATION-001: weekly-email migration source is generated only after explicit confirmation', () => {
  assert.match(workflow, /CREATE NOTIFICATION EMAIL MIGRATION/);
  assert.match(workflow, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(workflow, /TARGET_BRANCH: notification\/weekly-email-preference-migration/);
  assert.match(workflow, /supabase migration new disable_implicit_weekly_email/);
  assert.match(workflow, /git push origin "HEAD:\$TARGET_BRANCH"/);
});

test('NOTIFY-MIGRATION-002: migration generator has no database or delivery access', () => {
  assert.doesNotMatch(workflow, /SUPABASE_ACCESS_TOKEN|SUPABASE_STAGING_DB_URL|SUPABASE_PROJECT_ID/);
  assert.doesNotMatch(workflow, /psql|database\/query|functions deploy|secrets set/);
  assert.doesNotMatch(workflow, /sendNotification|send-notification|RESEND|SMTP/i);
  assert.match(workflow, /No Supabase project, database URL, provider, scheduler, email or push delivery was accessed/);
});

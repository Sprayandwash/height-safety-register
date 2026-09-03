const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const edgeFunction = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/functions/employee-notifications/index.ts'),
  'utf8'
);
const client = fs.readFileSync(
  path.resolve(__dirname, '../../push-notifications.js'),
  'utf8'
);
const preferenceAction = edgeFunction.slice(
  edgeFunction.indexOf("if (action === 'set_weekly_email_preference')"),
  edgeFunction.indexOf("if (action === 'register_push_subscription')")
);

test('NOTIFY-WEEKLY-001: a signed-in employee can independently change only their weekly-email preference', () => {
  assert.match(preferenceAction, /action === 'set_weekly_email_preference'/);
  assert.match(preferenceAction, /user_id: user\.id, weekly_email_enabled: enabled/);
  assert.match(preferenceAction, /delivery: 'disabled'/);
  assert.doesNotMatch(preferenceAction, /RESEND_API_KEY|api\.resend\.com|sendStagingTestEmail/);
});

test('NOTIFY-WEEKLY-002: the account panel presents an optional weekly task email separately from phone push', () => {
  assert.match(client, /Weekly task email/);
  assert.match(client, /Enable weekly task email/);
  assert.match(client, /setWeeklyEmailPreference\(true\)/);
  assert.match(client, /No email is sent when you have no open tasks/);
  assert.match(client, /Routine email delivery is not enabled yet/);
  assert.match(client, /functionCall\('set_weekly_email_preference'/);
});

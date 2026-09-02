const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const edgeFunction = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/functions/employee-notifications/index.ts'),
  'utf8'
);

const weeklyRendererAction = edgeFunction.slice(
  edgeFunction.indexOf("if (action === 'render_weekly_email')"),
  edgeFunction.indexOf("if (action === 'set_weekly_email_preference')")
);

test('NOTIFY-WEEKLY-RENDER-001: weekly email drafting is authenticated and has no provider, scheduler, or delivery path', () => {
  assert.match(weeklyRendererAction, /action === 'render_weekly_email'/);
  assert.match(edgeFunction, /delivery: 'disabled'/);
  assert.doesNotMatch(weeklyRendererAction, /RESEND_API_KEY|api\.resend\.com|sendWeeklyEmail|cron\.schedule|operations_notification_deliveries.*insert/s);
});

test('NOTIFY-WEEKLY-RENDER-002: Admin drafts include activity and assignment labels; employee drafts are task-only and suppress empty sends', () => {
  assert.match(edgeFunction, /preview\.kind === 'admin_weekly_preview'/);
  assert.match(edgeFunction, /includeAssignment \? \{ assigned_to/);
  assert.match(edgeFunction, /preview\.kind === 'employee_weekly_preview' && preview\.suppressed/);
  assert.match(edgeFunction, /subject: 'Spray & Wash — your weekly task update'/);
  assert.match(edgeFunction, /No open tasks are assigned to this employee/);
  const employeeDraft = edgeFunction.slice(
    edgeFunction.indexOf("if (preview.kind === 'employee_weekly_preview')"),
    edgeFunction.indexOf("const activity = preview.activity")
  );
  assert.doesNotMatch(employeeDraft, /assigned_to/);
});

test('NOTIFY-WEEKLY-RENDER-003: both draft scopes enforce the existing Admin boundary', () => {
  assert.match(edgeFunction, /scope === 'admin' && !admin/);
  assert.match(edgeFunction, /scope === 'admin'\n        \? await weeklyAdminPreview/);
  assert.match(edgeFunction, /: await weeklyEmployeePreview\(service, user\.id\)/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const edgeFunction = fs.readFileSync(
  path.resolve(__dirname, '../../supabase/functions/employee-notifications/index.ts'),
  'utf8'
);
const previewAction = edgeFunction.slice(
  edgeFunction.indexOf("if (action === 'preview_weekly_summary')"),
  edgeFunction.indexOf("if (action === 'render_weekly_email')")
);

test('NOTIFY-WEEKLY-PREVIEW-001: weekly previews are authenticated and never send, schedule, or record delivery', () => {
  assert.match(previewAction, /action === 'preview_weekly_summary'/);
  assert.match(edgeFunction, /delivery: 'disabled'/);
  assert.doesNotMatch(previewAction, /RESEND_API_KEY|api\.resend\.com|cron\.schedule|sendWeeklyEmail/);
  assert.match(edgeFunction, /preview creates no notification or delivery record/);
});

test('NOTIFY-WEEKLY-PREVIEW-002: the Admin scope is restricted to active Admins and returns the defined activity sections', () => {
  assert.match(edgeFunction, /scope === 'admin' && !admin/);
  assert.match(edgeFunction, /active_admin_recipient_count/);
  assert.match(edgeFunction, /tasks_created/);
  assert.match(edgeFunction, /vehicle_checks_completed/);
  assert.match(edgeFunction, /maintenance_records_created/);
  assert.match(edgeFunction, /height_equipment_inspections_completed/);
});

test('NOTIFY-WEEKLY-PREVIEW-003: employee previews include only direct or role-assigned open tasks and suppress empty reports', () => {
  assert.match(edgeFunction, /task\.assigned_user_id === userId \|\|/);
  assert.match(edgeFunction, /roleNames\.has\(task\.assigned_role\)/);
  assert.match(edgeFunction, /not\('status', 'in', '\(Completed,Deferred\)'\)/);
  assert.match(edgeFunction, /suppressed: tasks\.length === 0/);
  assert.match(edgeFunction, /No open tasks are assigned to this employee/);
  const employeePreview = edgeFunction.slice(
    edgeFunction.indexOf('async function weeklyEmployeePreview'),
    edgeFunction.indexOf('async function reconcileTaskNotifications')
  );
  assert.match(employeePreview, /weeklyTaskLine\(task, false\)/);
  assert.doesNotMatch(employeePreview, /weeklyTaskLine\(task, true\)/);
});

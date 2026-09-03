const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const edgeFunction = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/employee-notifications/index.ts'), 'utf8');

test('NOTIFY-WEEKLY-BRAND-001: Admin overdue tasks are grouped by employee with unassigned tasks kept distinct', () => {
  assert.match(edgeFunction, /function overdueTasksByEmployee/);
  assert.match(edgeFunction, /const employee = String\(task\.assigned_to \|\| 'Unassigned'\)/);
  assert.match(edgeFunction, /Overdue tasks by employee/);
  assert.match(edgeFunction, /new Set\(\['overdue'\]\)/);
  assert.match(edgeFunction, /Other pending tasks/);
});

test('NOTIFY-WEEKLY-BRAND-002: branded HTML preserves employee task-only content and app link', () => {
  assert.match(edgeFunction, /function brandedEmail/);
  assert.match(edgeFunction, /Spray <span style="color:#74c948">&amp;<\/span> Wash/);
  assert.match(edgeFunction, /background:#003b73/);
  assert.match(edgeFunction, /background:#0b9b50/);
  assert.match(edgeFunction, /Open Operations App/);
  const employeeBody = edgeFunction.slice(edgeFunction.indexOf("if (preview.kind === 'employee_weekly_preview')"), edgeFunction.indexOf('const activity = preview.activity'));
  assert.doesNotMatch(employeeBody, /assigned_to|assigned_user_id|description/);
});

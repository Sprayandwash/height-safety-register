const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../supabase/functions/employee-notifications/index.ts'), 'utf8');

test('NOTIFY-WEEKLY-ROUTINE-001: schedule preview is Monday 7:30 Auckland time and inactive', () => {
  assert.match(source, /const weeklyRoutineSchedule/);
  assert.match(source, /timezone: 'Pacific\/Auckland'/);
  assert.match(source, /cron_utc: '30 18 \* \* 0'/);
  assert.match(source, /local_time: 'Monday 7:30 am'/);
  assert.match(source, /active: false/);
  assert.match(source, /action === 'preview_weekly_routine_schedule'/);
});
test('NOTIFY-WEEKLY-ROUTINE-002: candidates respect active access and employee opt-in', () => {
  assert.match(source, /eq\('status', 'Active'\)/);
  assert.match(source, /row\.must_change_password !== true/);
  assert.match(source, /row\.role === 'Admin'/);
  assert.match(source, /eq\('weekly_email_enabled', true\)/);
  assert.match(source, /weekly-admin:/);
  assert.match(source, /weekly-employee:/);
  assert.match(source, /No provider call, notification record, delivery record or scheduler job is created by preview/);
});

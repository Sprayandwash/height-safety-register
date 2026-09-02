const { test, expect } = require('@playwright/test');
const { getStagingAdminReadOnlyConfig } = require('../support/staging-admin-readonly-config.cjs');

test.setTimeout(90_000);

async function signInAsAdmin(page) {
  const staging = getStagingAdminReadOnlyConfig();
  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ops-home-admin')).toBeVisible({ timeout: 15_000 });
}

async function invoke(page, body) {
  return page.evaluate(async request => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Supabase client is unavailable after sign-in.');
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw new Error(sessionError?.message || 'Staging Admin session token is unavailable after sign-in.');
    }
    const { data, error } = await client.functions.invoke('employee-notifications', {
      body: request,
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    return { data, error: error?.message || null };
  }, body);
}

async function ledgerCounts(page) {
  return page.evaluate(async () => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Supabase client is unavailable after sign-in.');
    const [notifications, deliveries] = await Promise.all([
      client.from('operations_notifications').select('id', { count: 'exact', head: true }),
      client.from('operations_notification_deliveries').select('id', { count: 'exact', head: true })
    ]);
    if (notifications.error || deliveries.error) throw new Error(notifications.error?.message || deliveries.error?.message);
    return { notifications: notifications.count || 0, deliveries: deliveries.count || 0 };
  });
}

function assertTaskLinesAreEmployeeSafe(groups) {
  for (const rows of Object.values(groups || {})) {
    for (const task of rows) {
      expect(task).toEqual(expect.objectContaining({ title: expect.any(String), deep_link: './' }));
      expect(task).not.toHaveProperty('assigned_to');
      expect(task).not.toHaveProperty('description');
      expect(task).not.toHaveProperty('assigned_user_id');
    }
  }
}

test('weekly summary previews are read-only and keep the employee view task-only', async ({ page }) => {
  await signInAsAdmin(page);
  const before = await ledgerCounts(page);

  const adminPreview = await invoke(page, { action: 'preview_weekly_summary', scope: 'admin' });
  expect(adminPreview.error).toBeNull();
  expect(adminPreview.data).toMatchObject({
    ok: true,
    scope: 'admin',
    kind: 'admin_weekly_preview',
    delivery: 'disabled',
    period_nz: { start: expect.any(String), end: expect.any(String) },
    activity: expect.objectContaining({
      tasks_created: expect.any(Number),
      tasks_completed: expect.any(Number),
      tasks_deferred: expect.any(Number),
      vehicle_checks_completed: expect.any(Number),
      maintenance_records_created: expect.any(Number),
      height_equipment_inspections_completed: expect.any(Number)
    })
  });
  expect(adminPreview.data).toHaveProperty('pending_tasks');
  expect(adminPreview.data).toHaveProperty('exceptions');

  const selfPreview = await invoke(page, { action: 'preview_weekly_summary', scope: 'self' });
  expect(selfPreview.error).toBeNull();
  expect(selfPreview.data).toMatchObject({
    ok: true,
    scope: 'self',
    kind: 'employee_weekly_preview',
    delivery: 'disabled',
    recipient: 'current_user',
    suppressed: expect.any(Boolean)
  });
  assertTaskLinesAreEmployeeSafe(selfPreview.data.pending_tasks);
  if (selfPreview.data.suppressed) {
    expect(selfPreview.data.suppression_reason).toBe('No open tasks are assigned to this employee.');
  }

  await expect.poll(() => ledgerCounts(page)).toEqual(before);
});

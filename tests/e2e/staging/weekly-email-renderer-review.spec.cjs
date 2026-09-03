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

function expectNoEmployeeInternals(draft) {
  const visible = [draft.subject, draft.text, draft.html].filter(Boolean).join('\n');
  expect(visible).not.toMatch(/assigned_to|assigned_user_id|description/i);
}

test('weekly email renderer is read-only and produces safe Admin and employee drafts', async ({ page }) => {
  await signInAsAdmin(page);
  const before = await ledgerCounts(page);

  const adminDraft = await invoke(page, { action: 'render_weekly_email', scope: 'admin' });
  expect(adminDraft.error).toBeNull();
  expect(adminDraft.data).toMatchObject({
    ok: true,
    scope: 'admin',
    kind: 'admin_weekly_preview',
    delivery: 'disabled',
    suppressed: false,
    subject: expect.stringContaining('weekly operations update'),
    text: expect.stringContaining('Weekly operations update'),
    html: expect.stringContaining('Weekly operations update')
  });
  expect(adminDraft.data.text).toContain('Activity');
  expect(adminDraft.data.text).toContain('Overdue tasks by employee');
  expect(adminDraft.data.text).toContain('Other pending tasks');
  expect(adminDraft.data.text).toContain('Exceptions');
  expect(adminDraft.data.html).toContain('Spray <span style="color:#74c948">&amp;</span> Wash');
  expect(adminDraft.data.html).toContain('Open Operations App');

  const employeeDraft = await invoke(page, { action: 'render_weekly_email', scope: 'self' });
  expect(employeeDraft.error).toBeNull();
  expect(employeeDraft.data).toMatchObject({
    ok: true,
    scope: 'self',
    kind: 'employee_weekly_preview',
    delivery: 'disabled',
    suppressed: expect.any(Boolean)
  });
  if (employeeDraft.data.suppressed) {
    expect(employeeDraft.data).toMatchObject({
      suppression_reason: 'No open tasks are assigned to this employee.',
      subject: null,
      text: null,
      html: null
    });
  } else {
    expect(employeeDraft.data).toMatchObject({
      subject: 'Spray & Wash — your weekly task update',
      text: expect.stringContaining('Your open tasks'),
      html: expect.stringContaining('Your open tasks')
    });
    expectNoEmployeeInternals(employeeDraft.data);
  }

  await expect.poll(() => ledgerCounts(page)).toEqual(before);
});

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
    if (sessionError || !session?.access_token) throw new Error(sessionError?.message || 'Staging Admin session token is unavailable.');
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
    const [notifications, deliveries] = await Promise.all([
      client.from('operations_notifications').select('id', { count: 'exact', head: true }),
      client.from('operations_notification_deliveries').select('id', { count: 'exact', head: true })
    ]);
    if (notifications.error || deliveries.error) throw new Error(notifications.error?.message || deliveries.error?.message);
    return { notifications: notifications.count || 0, deliveries: deliveries.count || 0 };
  });
}

test('one separately-approved staging weekly email is delivered and recorded', async ({ page }) => {
  await signInAsAdmin(page);
  const before = await ledgerCounts(page);
  const response = await invoke(page, {
    action: 'send_staging_test_weekly_email',
    confirmation: 'SEND_ONE_STAGING_TEST_WEEKLY_EMAIL'
  });
  expect(response.error).toBeNull();
  expect(response.data).toMatchObject({ ok: true, delivery: 'email', recipient: 'staging_test_recipient' });
  expect(response.data.notification_id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(response.data.provider_message_id).toBeTruthy();
  await expect.poll(() => ledgerCounts(page)).toEqual({
    notifications: before.notifications + 1,
    deliveries: before.deliveries + 1
  });
});

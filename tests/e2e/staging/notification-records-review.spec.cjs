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
      // Override the Functions client's default anonymous Authorization header.
      // Header names are case-insensitive on the wire, but this client merges
      // the request-header objects before constructing the Fetch Headers.
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    return { data, error: error?.message || null };
  }, body);
}

async function counts(page) {
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

test('notification reconciliation creates records only and is idempotent', async ({ page }) => {
  await signInAsAdmin(page);
  const before = await counts(page);

  const preview = await invoke(page, { action: 'reconcile_staging', mode: 'preview' });
  expect(preview.error).toBeNull();
  expect(preview.data).toMatchObject({ ok: true, mode: 'preview', delivery: 'disabled' });
  expect(preview.data.eligible).toBeGreaterThan(0);
  expect(preview.data.preview.length).toBeGreaterThan(0);
  await expect.poll(() => counts(page)).toEqual(before);

  const record = await invoke(page, {
    action: 'reconcile_staging', mode: 'record', confirmation: 'STAGING_RECORDS_ONLY'
  });
  expect(record.error).toBeNull();
  expect(record.data).toMatchObject({ ok: true, mode: 'record', delivery: 'disabled' });
  expect(record.data.created).toBeGreaterThan(0);
  const afterRecord = await counts(page);
  expect(afterRecord.notifications).toBe(before.notifications + record.data.created);
  expect(afterRecord.deliveries).toBe(before.deliveries);

  const repeat = await invoke(page, {
    action: 'reconcile_staging', mode: 'record', confirmation: 'STAGING_RECORDS_ONLY'
  });
  expect(repeat.error).toBeNull();
  expect(repeat.data.created).toBe(0);
  expect(repeat.data.duplicates).toBeGreaterThan(0);
  await expect.poll(() => counts(page)).toEqual(afterRecord);
});

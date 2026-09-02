const { test, expect } = require('@playwright/test');
const { getStagingAdminReadOnlyConfig } = require('../support/staging-admin-readonly-config.cjs');

test.setTimeout(60_000);

async function signIn(page) {
  const staging = getStagingAdminReadOnlyConfig();
  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
}

test('staging push enrolment is ready but does not create a subscription', async ({ page }) => {
  await signIn(page);
  const result = await page.evaluate(async () => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Supabase client is unavailable after sign-in.');
    const { data: { session }, error: sessionError } = await client.auth.getSession();
    if (sessionError || !session?.access_token) throw new Error(sessionError?.message || 'Staging session is unavailable.');
    const { data, error } = await client.functions.invoke('employee-notifications', {
      body: { action: 'status' },
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    return { data, error: error?.message || null };
  });

  expect(result.error).toBeNull();
  expect(result.data?.vapid_public_key).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  expect(result.data?.subscriptions || []).toEqual([]);
  expect(result.data?.push_enabled).toBe(false);
});

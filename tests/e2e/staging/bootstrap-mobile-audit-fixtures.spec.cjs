const { test, expect } = require('@playwright/test');
const { getStagingConfig } = require('../support/staging-config.cjs');

const FIXTURES = [
  { key: 'HEIGHT_READONLY', email: process.env.E2E_STAGING_HEIGHT_READONLY_EMAIL, role: 'Height equipment user', first: 'Mobile Audit', last: 'Height Readonly', completePassword: true },
  { key: 'FIRST_PASSWORD', email: process.env.E2E_STAGING_FIRST_PASSWORD_EMAIL, role: 'Height equipment user', first: 'Mobile Audit', last: 'First Password', completePassword: false },
  { key: 'BLOCKED', email: process.env.E2E_STAGING_BLOCKED_EMAIL, role: 'Height equipment user', first: 'Mobile Audit', last: 'Blocked', completePassword: false, block: true }
].map(fixture => ({ ...fixture, password: process.env[`E2E_STAGING_${fixture.key}_PASSWORD`] }));

function required(value, name) {
  if (!String(value || '').trim()) throw new Error(`Missing required Staging fixture setting: ${name}`);
  return value;
}

async function signIn(page, credentials) {
  await page.goto('/');
  await page.locator('#loginEmail').fill(credentials.email);
  await page.locator('#loginPassword').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('BOOTSTRAP: create dedicated read-only mobile audit fixtures in Staging', async ({ page, browser }) => {
  const staging = getStagingConfig({ ...process.env, E2E_STAGING_TEST_EMAIL: process.env.E2E_STAGING_ADMIN_EMAIL, E2E_STAGING_TEST_PASSWORD: process.env.E2E_STAGING_ADMIN_PASSWORD });
  for (const fixture of FIXTURES) {
    required(fixture.email, `E2E_STAGING_${fixture.key}_EMAIL`);
    required(fixture.password, `E2E_STAGING_${fixture.key}_PASSWORD`);
  }
  await signIn(page, staging);
  await expect(page.locator('.ops-home-admin')).toBeVisible({ timeout: 15_000 });

  async function adminCall(body) {
    return page.evaluate(async payload => {
      const client = window.SWOperationsV4?.state?.sb;
      if (!client) return { error: 'Admin client is unavailable.' };
      const result = await client.functions.invoke('account-admin', { body: payload });
      return { error: result.error?.message || result.data?.error || '', data: result.data || null };
    }, body);
  }

  for (const fixture of FIXTURES) {
    const profile = await page.evaluate(async email => {
      const client = window.SWOperationsV4?.state?.sb;
      const result = await client.from('profiles').select('user_id').eq('email', email).maybeSingle();
      return { error: result.error?.message || '', data: result.data || null };
    }, fixture.email);
    if (profile.error) throw new Error(profile.error);
    let userId = profile.data?.user_id;
    if (!userId) {
      const created = await adminCall({ action: 'create', first_name: fixture.first, last_name: fixture.last, email: fixture.email, password: fixture.password, roles: [fixture.role] });
      if (created.error) throw new Error(`Could not create ${fixture.key}: ${created.error}`);
      const createdProfile = await page.evaluate(async email => {
        const client = window.SWOperationsV4?.state?.sb;
        const result = await client.from('profiles').select('user_id').eq('email', email).single();
        return { error: result.error?.message || '', data: result.data || null };
      }, fixture.email);
      if (createdProfile.error || !createdProfile.data?.user_id) throw new Error(`Could not verify ${fixture.key} profile: ${createdProfile.error || 'missing user id'}`);
      userId = createdProfile.data.user_id;
    }
    if (fixture.completePassword) {
      const context = await browser.newContext();
      const candidate = await context.newPage();
      await signIn(candidate, fixture);
      await expect(candidate.locator('#opsFirstPasswordForm')).toBeVisible({ timeout: 15_000 });
      const completed = await candidate.evaluate(async password => {
        const client = window.SWOperationsV4?.state?.sb;
        const result = await client.functions.invoke('account-admin', { body: { action: 'complete_first_password', password } });
        return { error: result.error?.message || result.data?.error || '' };
      }, fixture.password);
      await context.close();
      if (completed.error) throw new Error(`Could not activate ${fixture.key}: ${completed.error}`);
    }
    if (fixture.block) {
      const blocked = await adminCall({ action: 'block', user_id: userId });
      if (blocked.error) throw new Error(`Could not block ${fixture.key}: ${blocked.error}`);
    }
  }
});

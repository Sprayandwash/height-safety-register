const { test, expect } = require('@playwright/test');
const { getStagingPreloadedClaimConfig } = require('../support/staging-preloaded-claim-config.cjs');

const config = getStagingPreloadedClaimConfig();

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function runStagingSql(query) {
  if (config.projectRef === 'twkgfmctuffmkvkmdkct') {
    throw new Error('SAFETY STOP: REG-049 will never run database commands against production.');
  }
  const response = await fetch(`https://api.supabase.com/v1/projects/${config.projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Staging database command failed (${response.status}).`);
  let parsed;
  try { parsed = JSON.parse(body); } catch { throw new Error('Staging database command returned invalid JSON.'); }
  if (parsed?.error) throw new Error('Staging database command returned an error.');
  return parsed;
}

function cleanupSql() {
  const claimEmail = sqlLiteral(config.claimEmail);
  const selfSignupEmail = sqlLiteral(config.selfSignupEmail);
  const marker = sqlLiteral(config.marker);
  return `
begin;
alter table public.operations_preloaded_users disable trigger operations_preloaded_users_protect_claimed;
delete from public.operations_preloaded_users
 where email in (${claimEmail}, ${selfSignupEmail})
    or notes = ${marker};
alter table public.operations_preloaded_users enable trigger operations_preloaded_users_protect_claimed;
delete from public.user_roles
 where user_id in (select id from auth.users where email in (${claimEmail}, ${selfSignupEmail}));
delete from auth.users where email in (${claimEmail}, ${selfSignupEmail});
commit;
`;
}

async function cleanupTemporaryIdentities() {
  await runStagingSql(cleanupSql());
}

async function createPendingPreload() {
  await runStagingSql(`
insert into public.operations_preloaded_users
  (email, first_name, last_name, display_name, roles, active, status, notes)
values
  (${sqlLiteral(config.claimEmail)}, 'E2E', 'REG-049', 'E2E REG-049 claim user',
   array['Height equipment user', 'Vehicle inspector']::text[], true, 'Pending', ${sqlLiteral(config.marker)});
`);
}

async function confirmTemporaryEmail(email) {
  // Staging has email confirmation enabled.  The browser must perform the
  // registration itself; this narrowly confirms only the generated test
  // identity so the rest of the test can exercise its normal sign-in flow.
  await runStagingSql(`
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email = ${sqlLiteral(email)};
`);
}

async function removeVehicleInspectorRole() {
  await runStagingSql(`
delete from public.user_roles
where user_id = (select id from auth.users where email = ${sqlLiteral(config.claimEmail)})
  and role = 'Vehicle inspector';
`);
}

async function currentOperationRoles(page) {
  return page.evaluate(() => [...(window.SWOperationsV4?.state?.roles || [])].sort());
}

async function signOut(page) {
  await page.evaluate(async () => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Supabase client is unavailable.');
    await client.auth.signOut();
  });
  await expect(page.locator('#signedOut')).toBeVisible({ timeout: 15_000 });
}

async function signIn(page, email) {
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(config.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
}

async function createAccountThroughUi(page, email) {
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(config.password);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => Boolean(window.SWOperationsV4?.state?.sb)), { timeout: 5_000 }).toBe(true);
}

test.afterEach(async () => {
  await cleanupTemporaryIdentities();
});

test('REG-049: a claimed pre-load keeps an Admin role edit and a self-sign-up receives no roles', async ({ page }) => {
  await cleanupTemporaryIdentities();
  await createPendingPreload();

  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');

  await createAccountThroughUi(page, config.claimEmail);
  await confirmTemporaryEmail(config.claimEmail);
  await signOut(page);
  await signIn(page, config.claimEmail);
  await expect.poll(() => currentOperationRoles(page), { timeout: 15_000 }).toEqual([
    'Height equipment user',
    'Vehicle inspector'
  ]);

  await removeVehicleInspectorRole();
  await signOut(page);
  await signIn(page, config.claimEmail);
  await expect.poll(() => currentOperationRoles(page), { timeout: 15_000 }).toEqual(['Height equipment user']);

  await signOut(page);
  await createAccountThroughUi(page, config.selfSignupEmail);
  await confirmTemporaryEmail(config.selfSignupEmail);
  await signOut(page);
  await signIn(page, config.selfSignupEmail);
  await expect.poll(() => currentOperationRoles(page), { timeout: 15_000 }).toEqual([]);
});

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

async function temporaryIdentityCount(email) {
  const rows = await runStagingSql(`
select count(*)::int as user_count
from auth.users
where email = ${sqlLiteral(email)};
`);
  return Number(rows?.[0]?.user_count ?? 0);
}

async function currentOperationRoles(page) {
  return page.evaluate(() => [...(window.SWOperationsV4?.state?.roles || [])].sort());
}

async function currentOperationRoleState(page) {
  return page.evaluate(async () => {
    const state = window.SWOperationsV4?.state;
    if (!state?.sb || !state.user) {
      return { stateRoles: [], queryRoles: [], queryError: 'No authenticated V4 session.' };
    }
    const result = await state.sb
      .from('user_roles')
      .select('role')
      .eq('user_id', state.user.id)
      .order('role');
    return {
      stateRoles: [...(state.roles || [])].sort(),
      queryRoles: (result.data || []).map(row => row.role).filter(Boolean).sort(),
      queryError: result.error?.message || ''
    };
  });
}

async function signOut(page) {
  await page.evaluate(async () => {
    if (typeof window.signOut !== 'function') {
      throw new Error('Staging app signOut function is unavailable.');
    }
    await window.signOut();
  });
  await expect(page.locator('#signedOut')).toBeVisible({ timeout: 15_000 });
}

async function signIn(page, email, password = config.password) {
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
}

async function expectCurrentRoles(page, roles) {
  await expect.poll(async () => (await currentOperationRoleState(page)).queryError, {
    timeout: 15_000
  }).toBe('');
  await expect.poll(() => currentOperationRoles(page), { timeout: 15_000 }).toEqual(roles);
  await expect.poll(async () => (await currentOperationRoleState(page)).queryRoles, {
    timeout: 15_000
  }).toEqual(roles);
}

async function removeVehicleInspectorThroughAdminUi(page) {
  await signIn(page, config.adminEmail, config.adminPassword);
  await expect.poll(() => currentOperationRoles(page), { timeout: 15_000 }).toContain('Admin');

  const adminCard = page.locator('.ops-home-admin');
  await expect(adminCard, 'E2E_STAGING_ADMIN_EMAIL must be assigned the Admin role for REG-049.').toBeVisible({ timeout: 15_000 });
  await adminCard.click();
  await expect(page.locator('#opsShell h2')).toHaveText('Admin');

  // Open the visible summary and wait for its content. Targeting the summary
  // avoids attempting to click an Edit user button while the details panel is
  // still closed.
  const currentUsersSummary = page.getByText('Current Users', { exact: true });
  await expect(currentUsersSummary).toHaveCount(1);
  await currentUsersSummary.click();
  await expect(page.getByRole('heading', { name: 'Current signed-in users', exact: true })).toBeVisible();

  const currentUsers = page.locator('details').filter({
    has: page.getByText('Current Users', { exact: true })
  });

  const claimedUser = currentUsers.locator('.ops-user-row').filter({ hasText: config.claimEmail });
  await expect(claimedUser).toHaveCount(1, { timeout: 15_000 });
  const editButton = claimedUser.locator('[data-ops-edit-user]');
  const claimedUserId = await editButton.getAttribute('data-ops-edit-user');
  expect(claimedUserId, 'The claimed temporary account must appear in Current Users.').toBeTruthy();
  await editButton.click();

  const vehicleInspector = page.locator(`input[data-ops-role-user="${claimedUserId}"][value="Vehicle inspector"]`);
  await expect(vehicleInspector).toBeChecked({ timeout: 15_000 });
  await vehicleInspector.uncheck();

  const saved = page.waitForEvent('dialog');
  await page.locator(`[data-ops-save-user="${claimedUserId}"]`).click();
  const dialog = await saved;
  expect(dialog.message()).toBe('User saved. The full name will now be used in Performed by.');
  await dialog.accept();

  await expect(claimedUser).toContainText('Height equipment user', { timeout: 15_000 });
  await expect(claimedUser).not.toContainText('Vehicle inspector', { timeout: 15_000 });
  await signOut(page);
}

async function createAccountThroughUi(page, email) {
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(config.password);
  const dialogPromise = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const dialog = await dialogPromise;
  const message = dialog.message();
  await dialog.accept();
  expect(message).toMatch(/^Account created\./);
  await expect.poll(() => temporaryIdentityCount(email), { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => page.evaluate(() => Boolean(window.SWOperationsV4?.state?.sb)), { timeout: 5_000 }).toBe(true);
}

test.afterEach(async () => {
  await cleanupTemporaryIdentities();
});

test('REG-049: a claimed pre-load keeps a real Admin UI role edit and a self-sign-up receives no roles', async ({ page }) => {
  await cleanupTemporaryIdentities();
  await createPendingPreload();

  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');

  await createAccountThroughUi(page, config.claimEmail);
  await confirmTemporaryEmail(config.claimEmail);
  await signOut(page);
  await signIn(page, config.claimEmail);
  await expectCurrentRoles(page, [
    'Height equipment user',
    'Vehicle inspector'
  ]);

  await signOut(page);
  await removeVehicleInspectorThroughAdminUi(page);
  await signIn(page, config.claimEmail);
  await expectCurrentRoles(page, ['Height equipment user']);

  await signOut(page);
  await createAccountThroughUi(page, config.selfSignupEmail);
  await confirmTemporaryEmail(config.selfSignupEmail);
  await signOut(page);
  await signIn(page, config.selfSignupEmail);
  await expectCurrentRoles(page, []);
});

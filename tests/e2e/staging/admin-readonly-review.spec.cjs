const { test, expect } = require('@playwright/test');
const { getStagingAdminReadOnlyConfig } = require('../support/staging-admin-readonly-config.cjs');

// This suite is deliberately browse-only. It must never submit a user form,
// save permissions/settings, upload a logo, export a backup, or use database
// administration APIs. Controlled Admin write coverage is planned separately.
async function signInAndOpenAdmin(page) {
  const staging = getStagingAdminReadOnlyConfig();
  await page.goto('/');

  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
  const adminCard = page.locator('.ops-home-admin');
  await expect(adminCard).toBeVisible({ timeout: 15_000 });
  await adminCard.click();
  await expect(page.locator('#opsShell h2')).toHaveText('Admin');
}

test('REG-043/046/048: Admin screens are available, stable, and browseable without writes', async ({ page }, testInfo) => {
  await signInAndOpenAdmin(page);

  // Admin must render one final header, rather than duplicate Home controls
  // or replace the layout after navigation has settled.
  const home = page.locator('.ops-home-btn');
  await expect(home).toHaveCount(1);
  await expect(home).toBeVisible();
  await page.waitForTimeout(350);
  await expect(page.locator('.ops-home-btn')).toHaveCount(1);
  await expect(page.locator('#opsNav')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Users & Permissions', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Backup', exact: true })).toBeVisible();

  // Select the Users & Permissions view before opening Current Users. Its
  // content is intentionally hidden while another Admin view is active.
  await page.getByRole('button', { name: 'Users & Permissions', exact: true }).click();

  // Current Users is opened and inspected only. The test never presses Save.
  const currentUsers = page.locator('details').filter({
    has: page.getByText('Current Users', { exact: true }),
    visible: true
  });
  await currentUsers.locator('summary').click();
  await expect(currentUsers.getByRole('heading', { name: 'Current signed-in users', exact: true })).toBeVisible();
  const ownUserId = await page.evaluate(() => window.SWOperationsV4?.state?.user?.id || '');
  expect(ownUserId, 'The Admin review account must expose its authenticated user id.').not.toBe('');
  const editOwnUser = currentUsers.locator(`[data-ops-edit-user="${ownUserId}"]`);
  await expect(editOwnUser).toBeVisible();
  await editOwnUser.click();
  const ownRoleInputs = currentUsers.locator(`input[data-ops-role-user="${ownUserId}"]`);
  await expect(ownRoleInputs.first()).toBeVisible();
  await expect(ownRoleInputs).toHaveCount(5);
  await expect(ownRoleInputs).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  // The unclaimed-preload form begins safe: no default permissions and no save.
  const addUser = page.locator('details').filter({ has: page.getByText('Add User', { exact: true }) });
  await addUser.locator('summary').click();
  await expect(page.locator('#opsPreloadUserForm')).toBeVisible();
  await expect(page.locator('input[data-ops-preload-role]:checked')).toHaveCount(0);

  // Settings and backup controls must render, but deliberately are not used.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#opsAppSettingsForm')).toBeVisible();
  await expect(page.locator('#opsAdminNotifyLead')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save app settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload logo', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Backup', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Full JSON backup', exact: true })).toBeVisible();

  // A phone viewport may horizontally scroll an intentionally wide table only
  // within its table wrapper; it must not create page-wide horizontal overflow.
  if (testInfo.project.name.includes('mobile')) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  }
});

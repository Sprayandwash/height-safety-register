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
  const staging = getStagingAdminReadOnlyConfig();
  await page.goto('/');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });

  // Home attention summaries are toggles. Selecting a summary opens its
  // matching list; selecting it again clears that selection and closes the
  // panel. Returning Home from another module also starts with the panel
  // closed.
  const attentionList = page.locator('.ops-attention-list');
  const dueSoonSummary = page.locator('.ops-attention-summary.soon');
  await expect(attentionList).not.toHaveAttribute('open', '');
  await dueSoonSummary.click();
  await expect(attentionList).toHaveAttribute('open', '');
  await dueSoonSummary.click();
  await expect(attentionList).not.toHaveAttribute('open', '');
  await dueSoonSummary.click();
  await expect(attentionList).toHaveAttribute('open', '');
  await page.locator('.ops-home-admin').click();
  await expect(page.locator('#opsShell h2')).toHaveText('Admin');
  await page.locator('.ops-home-btn').click();
  await expect(attentionList).not.toHaveAttribute('open', '');

  await page.locator('.ops-home-admin').click();
  await expect(page.locator('#opsShell h2')).toHaveText('Admin');

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
  const currentUsersSummary = page.getByText('Current Users', { exact: true });
  await expect(currentUsersSummary).toHaveCount(1);
  await currentUsersSummary.click();
  await expect(page.getByRole('heading', { name: 'Current signed-in users', exact: true })).toBeVisible();

  // The unclaimed-preload form begins safe: no default permissions and no save.
  const addUserSummary = page.locator('details > summary').filter({ hasText: /^Add User$/ });
  await expect(addUserSummary).toBeVisible();
  await addUserSummary.click();
  await expect(page.locator('#opsPreloadUserForm')).toBeVisible();
  await expect(page.locator('input[data-ops-preload-role]:checked')).toHaveCount(0);

  // Settings and backup controls must render, but deliberately are not used.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#opsAppSettingsForm')).toBeVisible();
  await expect(page.locator('#opsAdminNotifyLead')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save app settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload logo', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'App Backups', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Complete Backup', exact: true })).toBeVisible();

  // A phone viewport may horizontally scroll an intentionally wide table only
  // within its table wrapper; it must not create page-wide horizontal overflow.
  if (testInfo.project.name.includes('mobile')) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  }
});

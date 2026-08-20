const { test, expect } = require('@playwright/test');
const { getStagingConfig } = require('../support/staging-config.cjs');

async function signInToStaging(page) {
  const staging = getStagingConfig();
  await page.goto('/');

  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await expect(page.locator('#signedOut')).toBeVisible();

  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#appMain')).toBeVisible({ timeout: 15_000 });
}

async function returnToModuleHome(page) {
  const home = page.locator('.ops-home-btn').first();
  await expect(home).toBeVisible({ timeout: 15_000 });
  await home.click();
  await expect(page.locator('#moduleHomeShell')).toContainText('Choose the area you need.');
}

test('STAGING-PREFLIGHT-001: staging app is labelled and dedicated account can sign in', async ({ page }) => {
  await signInToStaging(page);
});

test('STAGING-PREFLIGHT-002: dedicated account can browse every module without writing data', async ({ page }) => {
  await signInToStaging(page);

  // This journey deliberately opens views only. It must not submit forms,
  // start inspections, generate tasks, download backups, or change settings.
  await expect(page.locator('.ops-home-management')).toBeVisible();
  await expect(page.locator('.ops-home-admin')).toBeVisible();
  await expect(page.locator('.ops-home-height')).toBeVisible();
  await expect(page.locator('.ops-home-vehicle')).toBeVisible();

  await page.locator('.ops-home-management').click();
  await expect(page.locator('#opsShell h2')).toHaveText('Maintenance');

  await page.locator('[data-ops-view="assets"]').click();
  await expect(page.locator('#opsShell')).toContainText('Standalone machinery');

  await page.locator('[data-ops-view="schedules"]').click();
  await expect(page.locator('#opsShell')).toContainText('Preventive maintenance');

  await page.locator('[data-ops-view="history"]').click();
  await expect(page.locator('#opsShell')).toContainText('Maintenance Log');

  await page.locator('[data-ops-view="management-dashboard"]').click();
  await expect(page.locator('[data-ops-shortcut="tasks-open"]')).toBeVisible();
  await page.locator('[data-ops-shortcut="tasks-open"]').click();
  await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();

  await returnToModuleHome(page);
  await page.locator('.ops-home-admin').click();
  await expect(page.locator('#opsShell h2')).toHaveText('Admin');
  await expect(page.locator('#opsShell')).toContainText(/Users & Permissions/i);

  await page.locator('[data-ops-view="admin-app-settings"]').click();
  await expect(page.locator('#opsShell')).toContainText('Height Register Settings');

  await page.locator('[data-ops-view="admin-settings"]').click();
  await expect(page.locator('#opsShell')).toContainText('Backup');

  await returnToModuleHome(page);
  await page.locator('.ops-home-height').click();
  await expect(page.locator('#heightModuleHeader')).toContainText('Height Equipment');
  await expect(page.locator('.tab[data-tab="equipment"]')).toBeVisible();

  await page.locator('#heightHomeButton').click();
  await expect(page.locator('#moduleHomeShell')).toContainText('Choose the area you need.');
  await page.locator('.ops-home-vehicle').click();
  await expect(page.locator('#opsShell h2')).toHaveText('Vehicle Checks');
  await expect(page.locator('#opsInspectionForm')).toBeVisible();
});

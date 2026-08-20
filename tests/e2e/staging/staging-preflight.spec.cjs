const { test, expect } = require('@playwright/test');
const { getStagingConfig } = require('../support/staging-config.cjs');

test('STAGING-PREFLIGHT-001: staging app is labelled and dedicated account can sign in', async ({ page }) => {
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
});

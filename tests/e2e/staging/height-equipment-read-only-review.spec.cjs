const { test, expect } = require('@playwright/test');
const { getStagingConfig } = require('../support/staging-config.cjs');

// This is deliberately a browse-only journey. It must not submit an
// inspection, edit equipment, generate a certificate, upload a photo, or
// change any other record in staging.
async function signInAndOpenHeightEquipment(page) {
  const staging = getStagingConfig();
  await page.goto('/');

  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ops-home-height')).toBeVisible({ timeout: 15_000 });
  await page.locator('.ops-home-height').click();
  await expect(page.locator('#heightModuleHeader')).toContainText('Height Equipment');
  await page.locator('.tab[data-tab="equipment"]').click();
  await expect(page.locator('#equipmentFilterSearch')).toBeVisible();
  await expect(page.locator('#equipmentFilterCount')).toHaveText(/\d+ items? shown\./, { timeout: 30_000 });
}

test('STAGING-HEIGHT-READ-ONLY-001: Height Equipment register filters, detail and certificate view are browseable without writes', async ({ page }) => {
  await signInAndOpenHeightEquipment(page);

  const register = page.locator('#equipmentList');
  const firstItem = register.locator('.listItem').first();
  await expect(firstItem).toBeVisible({ timeout: 15_000 });

  const serial = (await firstItem.locator('b').innerText()).trim();
  expect(serial, 'Staging needs at least one readable Height Equipment record for this read-only review.').not.toBe('');

  // Search for the selected record, then ensure a read-only detail view can
  // be opened and returned from without losing the active filter.
  const search = page.locator('#equipmentFilterSearch');
  await search.fill(serial);
  await expect(register).toContainText(serial);
  await expect(register.locator('.listItem')).toHaveCount(1);
  const selectedItem = register.locator('.listItem').first();
  await search.evaluate(input=>input.blur());
  await selectedItem.evaluate(node => node.scrollIntoView({ block: 'end', inline: 'nearest' }));
  await expect(selectedItem).toBeInViewport();
  await selectedItem.click();

  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#detailContent')).toContainText(serial);
  await expect(page.locator('#detailContent')).toContainText('Inspection History');
  await expect(page.getByRole('button', { name: '← Register', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Register', exact: true }).click();
  await expect(page.locator('#equipment')).toBeVisible();
  await expect(search).toHaveValue(serial);
  await expect(register.locator('.listItem')).toHaveCount(1);

  // The dedicated staging account has the Height Equipment Manager role, so
  // it may browse certificate history. This opens the view only: no
  // certificate is generated or downloaded.
  await expect(page.locator('#certificateTabButton')).toBeVisible();
  await page.locator('#certificateTabButton').click();
  await expect(page.locator('#certificates')).toBeVisible();
  await expect(page.locator('#certificates')).not.toContainText('Certificates are loading...', { timeout: 15_000 });
});

const { test, expect } = require('@playwright/test');
const { getStagingConfig } = require('../support/staging-config.cjs');

// This is the only controlled data-write used to support the separate
// Height Equipment browse-only review. It is persistent, uniquely labelled,
// and idempotent: later runs read it but never create duplicates.
const FIXTURE_SERIAL = 'E2E-HEIGHT-TEST';
const FIXTURE_NOTES = 'E2E REVIEW — dedicated Height Equipment browse-only review fixture';

async function signInAndOpenHeightEquipment(page, staging) {
  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ops-home-height')).toBeVisible({ timeout: 15_000 });
  await page.locator('.ops-home-height').click();
  await page.locator('.tab[data-tab="equipment"]').click();
  await expect(page.locator('#equipmentFilterSearch')).toBeVisible();
}

async function readFixture(page) {
  return page.evaluate(async serial => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Height Equipment client is unavailable.');
    const result = await client.from('equipment')
      .select('id,serial,type,status,notes,initial_inspection_required')
      .eq('serial', serial)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }, FIXTURE_SERIAL);
}

test('STAGING-HEIGHT-FIXTURE-001: create the single labelled Height Equipment read-only fixture only when absent', async ({ page }) => {
  const staging = getStagingConfig();
  await signInAndOpenHeightEquipment(page, staging);

  let fixture = await readFixture(page);
  if (!fixture) {
    await page.getByRole('button', { name: '+ Add item', exact: true }).click();
    await expect(page.locator('#editEquipment')).toBeVisible();
    await page.locator('#eqSerial').fill(FIXTURE_SERIAL);
    await page.locator('#eqType').selectOption({ label: 'Harness' });
    await page.locator('#eqMaker').fill('E2E REVIEW');
    await page.locator('#eqModel').fill('Staging fixture');
    await page.locator('#eqNotes').fill(FIXTURE_NOTES);

    const dialogPromise = page.waitForEvent('dialog');
    await page.getByRole('button', { name: 'Save equipment', exact: true }).click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Item saved. Start the initial inspection now?');
    await dialog.dismiss();
    await expect(page.locator('#detail')).toBeVisible();
    fixture = await readFixture(page);
  }

  expect(fixture).toMatchObject({
    serial: FIXTURE_SERIAL,
    type: 'Harness',
    status: 'In Service',
    notes: FIXTURE_NOTES,
    initial_inspection_required: true
  });
});

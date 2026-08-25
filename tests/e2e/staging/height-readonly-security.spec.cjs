const { test, expect } = require('@playwright/test');
const { getStagingHeightReadOnlySecurityConfig } = require('../support/staging-height-readonly-security-config.cjs');

const PREFIX = 'E2E SECURITY — HEIGHT READONLY —';

async function signInAsHeightReadOnlyUser(page, staging) {
  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ops-home-height')).toBeVisible({ timeout: 15_000 });
}

test('REG-047: a Height equipment user cannot directly insert equipment or upload a Height photo', async ({ page }) => {
  const staging = getStagingHeightReadOnlySecurityConfig();
  await signInAsHeightReadOnlyUser(page, staging);

  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const serial = `${PREFIX}${nonce}`;
  const path = `e2e-security-height-readonly/${nonce}.txt`;
  const result = await page.evaluate(async ({ serial, path }) => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Supabase client is unavailable.');
    const equipmentInsert = await client.from('equipment').insert({
      serial,
      type: 'Harness',
      manufacturer: 'E2E SECURITY',
      model: 'Must be rejected',
      status: 'In Service',
      inspection_frequency: '6 monthly',
      notes: 'This direct write must be rejected by RLS.',
      initial_inspection_required: true
    }).select('id');
    const file = new File(['read-only security probe'], 'blocked-write.txt', { type: 'text/plain' });
    const storageUpload = await client.storage.from('equipment-photos').upload(path, file, { upsert: false });
    const retainedEquipment = await client.from('equipment').select('id').eq('serial', serial);
    const retainedFile = await client.storage.from('equipment-photos').list('e2e-security-height-readonly', { search: path.split('/').pop() });
    return {
      equipmentError: equipmentInsert.error?.message || '',
      storageError: storageUpload.error?.message || '',
      retainedEquipment: retainedEquipment.data || [],
      retainedFile: retainedFile.data || []
    };
  }, { serial, path });

  expect(result.equipmentError, 'equipment insert must be rejected by database RLS').not.toBe('');
  expect(result.storageError, 'equipment photo upload must be rejected by Storage RLS').not.toBe('');
  expect(result.retainedEquipment, 'a denied equipment insert must not create a record').toEqual([]);
  expect(result.retainedFile, 'a denied Storage upload must not create an object').toEqual([]);
});

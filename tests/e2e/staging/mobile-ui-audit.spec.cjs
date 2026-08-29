const { test, expect } = require('@playwright/test');
const { getStagingConfig } = require('../support/staging-config.cjs');
const INVENTORY_IDS = ['AUTH-01','AUTH-02','AUTH-03','HOME-01','HOME-02','HOME-03','HEIGHT-01','HEIGHT-02','HEIGHT-03','HEIGHT-04','HEIGHT-05','HEIGHT-06','HEIGHT-07','VEH-01','VEH-02','VEH-03','VEH-04','MAINT-01','MAINT-02','MAINT-03','MAINT-04','MAINT-05','MAINT-06','MAINT-07','MAINT-08','MAINT-09','ADMIN-01','ADMIN-02','ADMIN-03','ADMIN-04','ADMIN-05','PERM-01','SHELL-01','SHELL-02','PWA-01'];

// This suite is intentionally browse-only. It must not submit a form, start
// an inspection, create/change a record, upload/download a file, or call a
// Supabase administration API. Each capture records the actual safe-fixture
// outcome, including unavailable states, in the Playwright artifact.
async function capture(page, testInfo, id, state, note = '') {
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
  const file = `${String(testInfo.attachments.filter(a => a.name.startsWith('audit-')).length + 1).padStart(2, '0')}-${testInfo.project.name}-${id}-${state}.png`;
  const path = testInfo.outputPath('screenshots', file);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(`audit-${id}-${state}`, { path, contentType: 'image/png' });
  return { id, state, result: 'tested', note, pageOverflow: !overflow, screenshot: file };
}

async function signIn(page) {
  const staging = getStagingConfig();
  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
}

test('MOBILE-UI-AUDIT: safe fixture navigation, screenshots and overflow evidence', async ({ page }, testInfo) => {
  const manifest = [];
  await page.goto('/');
  manifest.push(await capture(page, testInfo, 'AUTH-01', 'signed-out', 'Sign-in form and Staging banner.'));
  await signIn(page);
  manifest.push(await capture(page, testInfo, 'HOME-01', 'role-landing'));

  const attention = page.locator('.ops-attention-summary').first();
  if (await attention.count()) {
    await attention.click();
    manifest.push(await capture(page, testInfo, 'HOME-02', 'attention-filter'));
    await attention.click();
    manifest.push(await capture(page, testInfo, 'HOME-02', 'attention-cleared'));
  } else manifest.push({ id: 'HOME-02', result: 'unavailable', note: 'No attention summary is present in the safe fixture.' });

  if (await page.locator('.ops-home-height').count()) {
    await page.locator('.ops-home-height').click();
    manifest.push(await capture(page, testInfo, 'HEIGHT-01', 'dashboard'));
    await page.locator('.tab[data-tab="equipment"]').click();
    manifest.push(await capture(page, testInfo, 'HEIGHT-02', 'equipment-register'));
    const item = page.locator('#equipmentList .listItem').first();
    if (await item.count()) { await item.click(); manifest.push(await capture(page, testInfo, 'HEIGHT-03', 'equipment-detail')); }
    else manifest.push({ id: 'HEIGHT-03', result: 'unavailable', note: 'No readable Height Equipment item in the safe fixture.' });
    if (await page.locator('#certificateTabButton').count()) { await page.locator('#certificateTabButton').click(); manifest.push(await capture(page, testInfo, 'HEIGHT-06', 'certificates')); }
  }

  await page.locator('.logo').click();
  if (await page.locator('.ops-home-vehicle').count()) {
    await page.locator('.ops-home-vehicle').click();
    manifest.push(await capture(page, testInfo, 'VEH-01', 'checklist'));
  }
  await page.locator('.logo').click();
  if (await page.locator('.ops-home-management').count()) {
    await page.locator('.ops-home-management').click();
    manifest.push(await capture(page, testInfo, 'MAINT-01', 'dashboard'));
    for (const [id, view, state] of [['MAINT-02', 'assets', 'assets'], ['MAINT-04', 'schedules', 'maintenance-items'], ['MAINT-06', 'tasks', 'tasks'], ['MAINT-08', 'history', 'log']]) {
      const button = page.locator(`[data-ops-view="${view}"]:visible`);
      if (await button.count()) { await button.click(); manifest.push(await capture(page, testInfo, id, state)); }
    }
  }

  // Preserve a formal result for every plan item. The audit never fabricates
  // data or roles merely to turn an unavailable state into a passing result.
  for (const id of INVENTORY_IDS) if (!manifest.some(entry => entry.id === id)) {
    manifest.push({ id, result: 'unavailable', note: 'Not reachable with the current authorised role and safe Staging fixture; no write, email, upload, download, or fixture change was attempted.' });
  }

  const manifestPath = testInfo.outputPath(`mobile-ui-audit-manifest-${testInfo.project.name}.json`);
  require('fs').writeFileSync(manifestPath, JSON.stringify({ viewport: testInfo.project.name, entries: manifest }, null, 2));
  await testInfo.attach('mobile-ui-audit-manifest', { path: manifestPath, contentType: 'application/json' });
  expect(manifest.some(entry => entry.pageOverflow)).toBeFalsy();
  expect(new Set(manifest.map(entry => entry.id)).size).toBe(INVENTORY_IDS.length);
});

test('MOBILE-UI-AUDIT: Admin read-only evidence', async ({ page }, testInfo) => {
  const admin = getStagingConfig({ ...process.env, E2E_STAGING_TEST_EMAIL: process.env.E2E_STAGING_ADMIN_EMAIL, E2E_STAGING_TEST_PASSWORD: process.env.E2E_STAGING_ADMIN_PASSWORD });
  await page.goto('/');
  await page.locator('#loginEmail').fill(admin.email);
  await page.locator('#loginPassword').fill(admin.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.ops-home-admin')).toBeVisible({ timeout: 15_000 });
  await page.locator('.ops-home-admin').click();
  const manifest = [await capture(page, testInfo, 'ADMIN-01', 'landing')];
  await page.getByRole('button', { name: 'Users & Permissions', exact: true }).click();
  const users = page.getByText('Current Users', { exact: true }); if (await users.count()) { await users.click(); manifest.push(await capture(page, testInfo, 'ADMIN-02', 'current-users')); }
  const add = page.locator('details > summary').filter({ hasText: /^Add User$/ }); if (await add.count()) { await add.click(); manifest.push(await capture(page, testInfo, 'ADMIN-03', 'preload-form')); }
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); manifest.push(await capture(page, testInfo, 'ADMIN-04', 'settings'));
  await page.getByRole('button', { name: 'Backup', exact: true }).click(); manifest.push(await capture(page, testInfo, 'ADMIN-05', 'backup'));
  const path = testInfo.outputPath(`mobile-ui-audit-manifest-admin-${testInfo.project.name}.json`);
  require('fs').writeFileSync(path, JSON.stringify({ viewport: testInfo.project.name, entries: manifest }, null, 2));
  await testInfo.attach('mobile-ui-audit-admin-manifest', { path, contentType: 'application/json' });
  expect(manifest.some(entry => entry.pageOverflow)).toBeFalsy();
});

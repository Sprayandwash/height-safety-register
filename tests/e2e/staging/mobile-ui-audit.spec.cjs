const { test, expect } = require('@playwright/test');
const { getStagingConfig } = require('../support/staging-config.cjs');

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
      const button = page.locator(`[data-ops-view="${view}"]`);
      if (await button.count()) { await button.click(); manifest.push(await capture(page, testInfo, id, state)); }
    }
  }

  const manifestPath = testInfo.outputPath(`mobile-ui-audit-manifest-${testInfo.project.name}.json`);
  require('fs').writeFileSync(manifestPath, JSON.stringify({ viewport: testInfo.project.name, entries: manifest }, null, 2));
  await testInfo.attach('mobile-ui-audit-manifest', { path: manifestPath, contentType: 'application/json' });
  expect(manifest.some(entry => entry.pageOverflow)).toBeFalsy();
});

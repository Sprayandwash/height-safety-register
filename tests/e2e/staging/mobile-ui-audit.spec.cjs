const { test, expect } = require('@playwright/test');
const { getStagingConfig } = require('../support/staging-config.cjs');
const INVENTORY_IDS = ['AUTH-01','AUTH-02','AUTH-03','HOME-01','HOME-02','HOME-03','HEIGHT-01','HEIGHT-02','HEIGHT-03','HEIGHT-04','HEIGHT-05','HEIGHT-06','HEIGHT-07','VEH-01','VEH-02','VEH-03','VEH-04','MAINT-01','MAINT-02','MAINT-03','MAINT-04','MAINT-05','MAINT-06','MAINT-07','MAINT-08','MAINT-09','ADMIN-01','ADMIN-02','ADMIN-03','ADMIN-04','ADMIN-05','PERM-01','SHELL-01','SHELL-02','PWA-01'];
const ADMIN_IDS = INVENTORY_IDS.filter(id => id.startsWith('ADMIN-'));
const PRIMARY_IDS = INVENTORY_IDS.filter(id => !id.startsWith('ADMIN-') && !['AUTH-02', 'AUTH-03', 'PERM-01'].includes(id));

// Full-page evidence for every browse-only state can take longer than the
// standard test budget on CI, particularly on the narrow mobile viewport.
test.setTimeout(120_000);

// This suite is intentionally browse-only. It must not submit a form, start
// an inspection, create/change a record, upload/download a file, or call a
// Supabase administration API. Each capture records the actual safe-fixture
// outcome, including unavailable states, in the Playwright artifact.
async function capture(page, testInfo, id, state, note = '') {
  await page.waitForTimeout(150);
  const visualIssues = await page.evaluate(() => {
    const visible = element => {
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
      }
      const rect = element.getBoundingClientRect();
      return element.getClientRects().length > 0 && rect.width > 2 && rect.height > 2;
    };
    const inIntentionalScroller = element => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (['auto', 'scroll'].includes(style.overflowX) && parent.scrollWidth > parent.clientWidth + 2) return true;
      }
      return false;
    };
    const issues = [];
    const targets = [...document.querySelectorAll('button, input, select, textarea, h1, h2, h3')]
      .filter(visible)
      .filter(element => !inIntentionalScroller(element));
    const layoutTargets = [...new Set([...targets, ...document.querySelectorAll('.card, .ops-card, .ops-maintenance-summary')])]
      .filter(visible)
      .filter(element => !inIntentionalScroller(element));
    for (const element of layoutTargets) {
      const rect = element.getBoundingClientRect();
      const label = (element.getAttribute('aria-label') || element.textContent || element.id || element.className || element.tagName).trim().replace(/\s+/g, ' ').slice(0, 90);
      if (rect.left < -2 || rect.right > window.innerWidth + 2) issues.push({ type: 'viewport-clipping', label, left: Math.round(rect.left), right: Math.round(rect.right), viewport: window.innerWidth });
    }
    const isHitTestable = element => {
      if (!element.matches('button, input, select, textarea, .accountBtn')) return true;
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
      return Boolean(hit && (hit === element || element.contains(hit)));
    };
    const clippingTargets = [...new Set([...targets, ...document.querySelectorAll('#dashboard .stat, .ops-maintenance-summary')])]
      .filter(visible)
      .filter(element => !inIntentionalScroller(element))
      .filter(isHitTestable)
      // Supabase's blocked-account response can leave the underlying blank
      // sign-in field in the composed layout without displaying it. It is not
      // part of the blocked-account UI and must not be classified as clipping.
      .filter(element => element.id !== 'loginEmail')
      // The Home tiles deliberately crop a decorative pseudo-element. Their
      // text is separately visible, so pseudo-element scroll width is not a
      // text/control clipping defect.
      .filter(element => !element.matches('.ops-branch-card'));
    for (const element of clippingTargets) {
      const label = (element.getAttribute('aria-label') || element.textContent || element.id || element.className || element.tagName).trim().replace(/\s+/g, ' ').slice(0, 90);
      const style = getComputedStyle(element);
      if ((['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 2) || (['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 2)) {
        issues.push({ type: 'text-or-control-clipping', label });
      }
    }
    const semantic = targets.filter(element => element.matches('button, input, select, textarea, h1, h2, h3, .accountBtn, #userEmail')).filter(isHitTestable);
    for (let left = 0; left < semantic.length; left += 1) for (let right = left + 1; right < semantic.length; right += 1) {
      const first = semantic[left]; const second = semantic[right];
      if (first.contains(second) || second.contains(first)) continue;
      const a = first.getBoundingClientRect(); const b = second.getBoundingClientRect();
      const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (overlapWidth * overlapHeight >= 48) {
        const firstLabel = (first.getAttribute('aria-label') || first.textContent || first.id || first.tagName).trim().replace(/\s+/g, ' ').slice(0, 60);
        const secondLabel = (second.getAttribute('aria-label') || second.textContent || second.id || second.tagName).trim().replace(/\s+/g, ' ').slice(0, 60);
        issues.push({ type: 'unintended-overlap', first: firstLabel, second: secondLabel });
      }
    }
    return { pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 2, issues };
  });
  const file = `${String(testInfo.attachments.filter(a => a.name.startsWith('audit-')).length + 1).padStart(2, '0')}-${testInfo.project.name}-${id}-${state}.png`;
  const path = testInfo.outputPath('screenshots', file);
  await page.screenshot({ path, fullPage: true });
  const viewportPath = testInfo.outputPath('screenshots', file.replace(/\.png$/, '-viewport.png'));
  await page.screenshot({ path: viewportPath });
  await testInfo.attach(`audit-${id}-${state}`, { path, contentType: 'image/png' });
  await testInfo.attach(`audit-${id}-${state}-viewport`, { path: viewportPath, contentType: 'image/png' });
  return { id, state, result: 'tested', note, pageOverflow: visualIssues.pageOverflow, visualIssues: visualIssues.issues, screenshot: file, viewportScreenshot: viewportPath.split('/').pop() };
}

function auditCredential(prefix) {
  const email = String(process.env[`E2E_STAGING_${prefix}_EMAIL`] || '').trim();
  const password = String(process.env[`E2E_STAGING_${prefix}_PASSWORD`] || '').trim();
  if (!email || !password) throw new Error(`AUDIT READINESS BLOCKED: add E2E_STAGING_${prefix}_EMAIL and E2E_STAGING_${prefix}_PASSWORD before starting the audit.`);
  return { email, password };
}

async function signInWith(page, credentials) {
  await page.goto('/');
  await page.locator('#loginEmail').fill(credentials.email);
  await page.locator('#loginPassword').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('MOBILE-UI-AUDIT: readiness gate validates required accounts and roles', async ({ page }, testInfo) => {
  const browser = page.context().browser();
  const viewport = page.viewportSize();
  const readiness = [];
  const credentials = {
    HEIGHT_READONLY: auditCredential('HEIGHT_READONLY'),
    FIRST_PASSWORD: auditCredential('FIRST_PASSWORD'),
    BLOCKED: auditCredential('BLOCKED')
  };
  for (const [kind, credential] of Object.entries(credentials)) {
    const context = await browser.newContext({ viewport });
    const candidate = await context.newPage();
    if (kind !== 'BLOCKED') await signInWith(candidate, credential);
    try {
      if (kind === 'HEIGHT_READONLY') {
        await expect(candidate.locator('.ops-home-height')).toBeVisible({ timeout: 15_000 });
        await candidate.locator('.ops-home-height').click();
        await expect(candidate.locator('#addItemButton')).toBeHidden();
        readiness.push(await capture(candidate, testInfo, 'PERM-01', 'height-readonly', 'Height-only account; write action must remain hidden.'));
      }
      if (kind === 'FIRST_PASSWORD') {
        await expect(candidate.locator('#opsFirstPasswordForm')).toBeVisible({ timeout: 15_000 });
        readiness.push(await capture(candidate, testInfo, 'AUTH-02', 'first-password'));
      }
      if (kind === 'BLOCKED') {
      let message = '';
      candidate.once('dialog', async dialog => { message = dialog.message(); await dialog.dismiss(); });
      await signInWith(candidate, credential);
      await expect.poll(() => message).toMatch(/banned|blocked/i);
        readiness.push(await capture(candidate, testInfo, 'AUTH-03', 'blocked-account', 'Blocked authentication response; no record was altered.'));
      }
    } catch (error) {
      const id = kind === 'HEIGHT_READONLY' ? 'PERM-01' : kind === 'FIRST_PASSWORD' ? 'AUTH-02' : 'AUTH-03';
      const state = kind.toLowerCase().replace('_', '-');
      const entry = await capture(candidate, testInfo, id, state, String(error.message || error));
      readiness.push({ ...entry, result: 'failed' });
    }
    await context.close();
  }
  const readinessPath = testInfo.outputPath(`mobile-ui-audit-manifest-readiness-${testInfo.project.name}.json`);
  require('fs').writeFileSync(readinessPath, JSON.stringify({ viewport: testInfo.project.name, entries: readiness }, null, 2));
  await testInfo.attach('mobile-ui-audit-readiness-manifest', { path: readinessPath, contentType: 'application/json' });
  expect(readiness.filter(entry => entry.result !== 'tested').map(entry => entry.id)).toEqual([]);
});

async function signIn(page) {
  // The primary browse-only review must use the dedicated Staging Admin
  // account.  A limited account cannot expose every authorised module, which
  // turns a page-coverage audit into a role-coverage sample.
  const staging = getStagingConfig({
    ...process.env,
    E2E_STAGING_TEST_EMAIL: process.env.E2E_STAGING_ADMIN_EMAIL,
    E2E_STAGING_TEST_PASSWORD: process.env.E2E_STAGING_ADMIN_PASSWORD
  });
  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
  // Auth UI appears before the role-aware landing cards. Do not classify an
  // authorised module as unavailable while that data load is still settling.
  await page.locator('.ops-home-management').waitFor({ state: 'visible', timeout: 15_000 });
}

async function openAndCapture(page, testInfo, manifest, id, locator, state, note = '') {
  if (await locator.count() && await locator.first().isVisible()) {
    await clickInUsableViewport(page, locator.first());
    manifest.push(await capture(page, testInfo, id, state, note));
    return true;
  }
  return false;
}

// Mobile pages use sticky headers and filter panels. A normal locator.click()
// can scroll a target behind one of them, then report a false interaction
// failure. Position the target in the usable viewport and prove its centre is
// hit-testable before clicking it.
async function clickInUsableViewport(page, locator) {
  const point = await locator.evaluate(node => {
    const margin = 16;
    const rect = node.getBoundingClientRect();
    const x = rect.left + (rect.width / 2);
    const obstructionBottom = [...document.querySelectorAll('body *')].reduce((bottom, candidate) => {
      const style = getComputedStyle(candidate);
      if (!['fixed', 'sticky'].includes(style.position)) return bottom;
      const candidateRect = candidate.getBoundingClientRect();
      const overlapsTapColumn = candidateRect.left <= x && candidateRect.right >= x;
      const isVisibleTopObstruction = candidateRect.bottom > 0 && candidateRect.top < (window.innerHeight / 2);
      return overlapsTapColumn && isVisibleTopObstruction ? Math.max(bottom, candidateRect.bottom) : bottom;
    }, 0);
    const usableHeight = Math.max(1, window.innerHeight - obstructionBottom - (margin * 2));
    const desiredTop = obstructionBottom + margin + Math.max(0, (usableHeight - rect.height) / 2);
    window.scrollBy({ top: rect.top - desiredTop, behavior: 'instant' });
    const positioned = node.getBoundingClientRect();
    return { x: positioned.left + (positioned.width / 2), y: positioned.top + (positioned.height / 2) };
  });
  await expect.poll(() => locator.evaluate((node, tapPoint) => {
    const target = document.elementFromPoint(tapPoint.x, tapPoint.y);
    return Boolean(target && (target === node || node.contains(target)));
  }, point)).toBe(true);
  await page.mouse.click(point.x, point.y);
}

test('MOBILE-UI-AUDIT: safe fixture navigation, screenshots and overflow evidence', async ({ page }, testInfo) => {
  const manifest = [];
  await page.goto('/');
  manifest.push(await capture(page, testInfo, 'AUTH-01', 'signed-out', 'Sign-in form and Staging banner.'));
  manifest.push(await capture(page, testInfo, 'SHELL-01', 'signed-out-shell', 'Global shell before authentication.'));
  await signIn(page);
  manifest.push(await capture(page, testInfo, 'HOME-01', 'home-dashboard', 'Role landing, Home dashboard, account controls and module cards.'));
  manifest.push(await capture(page, testInfo, 'SHELL-02', 'signed-in-shell', 'Global shell, sticky header, account control and module navigation.'));
  manifest.push(await capture(page, testInfo, 'PWA-01', 'app-shell-emulation', 'Manifest-backed app shell in browser emulation; real-device install, offline/update and camera checks remain separately evidenced.'));

  const attention = page.locator('.ops-attention-summary').first();
  if (await attention.count()) {
    await clickInUsableViewport(page, attention);
    manifest.push(await capture(page, testInfo, 'HOME-02', 'attention-filter'));
    manifest.push(await capture(page, testInfo, 'HOME-03', 'attention-destination', 'Current attention destination reached without altering the fixture.'));
    await clickInUsableViewport(page, attention);
    manifest.push(await capture(page, testInfo, 'HOME-02', 'attention-cleared'));
  } else manifest.push({ id: 'HOME-02', result: 'unavailable', note: 'No attention summary is present in the safe fixture.' });

  if (await page.locator('.ops-home-height').count()) {
    await page.locator('.ops-home-height').click();
    manifest.push(await capture(page, testInfo, 'HEIGHT-01', 'dashboard', 'Height Equipment dashboard and tab strip.'));
    await page.locator('.tab[data-tab="equipment"]').click();
    manifest.push(await capture(page, testInfo, 'HEIGHT-02', 'equipment-register'));
    await openAndCapture(page, testInfo, manifest, 'HEIGHT-04', page.locator('#addItemButton:visible'), 'add-item-form', 'Opened only; no form submitted.');
    const backToRegister = page.getByRole('button', { name: /back to register/i });
    if (await backToRegister.count()) await clickInUsableViewport(page, backToRegister);
    await page.locator('.tab[data-tab="dashboard"]').click();
    await openAndCapture(page, testInfo, manifest, 'HEIGHT-05', page.getByRole('button', { name: 'Start Inspection', exact: true }), 'inspection-form', 'Opened only; no form submitted or photo control used.');
    await page.locator('.tab[data-tab="equipment"]').click();
    const item = page.locator('#equipmentList .listItem').first();
    if (await item.count()) { await clickInUsableViewport(page, item); manifest.push(await capture(page, testInfo, 'HEIGHT-03', 'equipment-detail')); }
    else manifest.push({ id: 'HEIGHT-03', result: 'unavailable', note: 'No readable Height Equipment item in the safe fixture.' });
    if (await page.locator('#certificateTabButton').count()) { await page.locator('#certificateTabButton').click(); manifest.push(await capture(page, testInfo, 'HEIGHT-06', 'certificates')); }
    await openAndCapture(page, testInfo, manifest, 'HEIGHT-07', page.locator('.tab[data-tab="heightQualifications"]:visible'), 'qualifications');
  }

  await page.locator('.logo').click();
  if (await page.locator('.ops-home-vehicle').count()) {
    await page.locator('.ops-home-vehicle').click();
    manifest.push(await capture(page, testInfo, 'VEH-01', 'checklist'));
    manifest.push(await capture(page, testInfo, 'VEH-02', 'attention-entry', 'Current due/attention list; no vehicle record was changed.'));
    manifest.push(await capture(page, testInfo, 'VEH-03', 'recent-history', 'Read-only current-user and manager history sections.'));
    const vehicleStart = page.locator('[data-ops-start-vehicle-check]:visible').first();
    if (await vehicleStart.count()) {
      // This action is intentionally within a horizontally scrollable mobile
      // table. Triggering its browse-only form directly avoids treating the
      // deliberate scroller as an unreachable UI control.
      await vehicleStart.evaluate(button => button.click());
      manifest.push(await capture(page, testInfo, 'VEH-04', 'preselected-check-form', 'Opened only; no vehicle check was submitted.'));
    }
  }
  await page.locator('.logo').click();
  if (await page.locator('.ops-home-management').count()) {
    await page.locator('.ops-home-management').click();
    manifest.push(await capture(page, testInfo, 'MAINT-01', 'dashboard', 'Maintenance dashboard, summary cards and shortcuts.'));
    for (const [id, view, state] of [['MAINT-02', 'assets', 'assets'], ['MAINT-04', 'schedules', 'maintenance-items'], ['MAINT-06', 'tasks', 'tasks'], ['MAINT-08', 'history', 'log']]) {
      const button = page.locator(`[data-ops-view="${view}"]:visible`);
      if (await button.count()) { await button.click(); manifest.push(await capture(page, testInfo, id, state)); }
      if (id === 'MAINT-02') {
        await openAndCapture(page, testInfo, manifest, 'MAINT-03', page.locator('[data-ops-action="openAssetEditor"]:visible'), 'asset-form', 'Opened only; no form submitted.');
        if (await page.locator('[data-ops-action="closeAssetEditor"]:visible').count()) await page.locator('[data-ops-action="closeAssetEditor"]:visible').click();
      }
      if (id === 'MAINT-04') {
        await openAndCapture(page, testInfo, manifest, 'MAINT-05', page.locator('[data-ops-action="addMaintenanceItem"]:visible'), 'maintenance-item-form', 'Opened only; no form submitted.');
        if (await page.locator('[data-ops-action="closeMaintenanceItemEditor"]:visible').count()) await page.locator('[data-ops-action="closeMaintenanceItemEditor"]:visible').click();
      }
      if (id === 'MAINT-06') {
        await openAndCapture(page, testInfo, manifest, 'MAINT-07', page.locator('[data-ops-action="openManualTaskEditor"]:visible'), 'manual-task-form', 'Opened only; no form submitted.');
        if (await page.locator('[data-ops-action="closeManualTaskEditor"]:visible').count()) await page.locator('[data-ops-action="closeManualTaskEditor"]:visible').click();
      }
    }
    await openAndCapture(page, testInfo, manifest, 'MAINT-09', page.getByRole('button', { name: /record maintenance/i }), 'record-maintenance-form', 'Opened only; no form submitted.');
  }

  // Preserve a formal result for every plan item. The audit never fabricates
  // data or roles merely to turn an unavailable state into a passing result.
  for (const id of PRIMARY_IDS) if (!manifest.some(entry => entry.id === id)) {
    manifest.push({ id, result: 'unavailable', note: 'Not reachable with the current authorised role and safe Staging fixture; no write, email, upload, download, or fixture change was attempted.' });
  }

  const manifestPath = testInfo.outputPath(`mobile-ui-audit-manifest-${testInfo.project.name}.json`);
  require('fs').writeFileSync(manifestPath, JSON.stringify({ viewport: testInfo.project.name, entries: manifest }, null, 2));
  await testInfo.attach('mobile-ui-audit-manifest', { path: manifestPath, contentType: 'application/json' });
  expect(manifest.some(entry => entry.pageOverflow)).toBeFalsy();
  expect(manifest.flatMap(entry => entry.visualIssues || [])).toEqual([]);
  expect(manifest.filter(entry => entry.result !== 'tested').map(entry => entry.id)).toEqual([]);
  expect(new Set(manifest.map(entry => entry.id)).size).toBe(PRIMARY_IDS.length);
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
  expect(manifest.flatMap(entry => entry.visualIssues || [])).toEqual([]);
  expect(new Set(manifest.map(entry => entry.id)).size).toBe(ADMIN_IDS.length);
});

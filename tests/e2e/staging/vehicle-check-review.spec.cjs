const { test, expect } = require('@playwright/test');
const { getStagingConfig } = require('../support/staging-config.cjs');

const REVIEW_JPEG = {
  name: 'e2e-review-evidence.jpg',
  mimeType: 'image/jpeg',
  // Valid 1×1 JPEG for any configured checklist item that requires photo evidence.
  buffer: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z', 'base64')
};

function reviewLabel(kind) {
  return `E2E REVIEW — Vehicle Check ${kind} — ${new Date().toISOString()}`;
}

async function signInAndOpenVehicleChecks(page, staging) {
  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
  // #signedIn changes before Operations has necessarily received the auth
  // event and loaded the user's roles. Wait for the actual authorised module
  // card, then use its normal UI path rather than calling an app global early.
  await page.waitForFunction(() => Boolean(window.SWOperationsV4?.state?.user?.id));
  try {
    await expect(page.locator('.ops-home-vehicle')).toBeVisible({ timeout: 15_000 });
  } catch {
    const details = await page.evaluate(() => ({
      signedInUser: window.SWOperationsV4?.state?.user?.email || null,
      loadedRoles: window.SWOperationsV4?.state?.roles || []
    }));
    throw new Error(`Staging test account cannot access Vehicle Checks. Assign it the Vehicle inspector or Admin role. Loaded roles: ${details.loadedRoles.join(', ') || 'none'}; user: ${details.signedInUser || 'not loaded'}.`);
  }
  await page.locator('.ops-home-vehicle').click();
  await expect(page.locator('#opsInspectionForm')).toBeVisible({ timeout: 15_000 });
}

async function chooseSafeAnswer(input) {
  const tag = await input.evaluate(element => element.tagName.toLowerCase());
  if (tag === 'select') {
    const options = await input.locator('option').evaluateAll(rows => rows.map(row => row.value));
    const value = ['Completed OK', 'No', 'N/A'].find(option => options.includes(option))
      || options.find(option => option && !/issue|fail|^yes$/i.test(option));
    if (!value) throw new Error(`No safe pass answer is available: ${options.join(', ')}`);
    await input.selectOption(value);
    return;
  }
  const inputType = await input.getAttribute('type');
  // Photo-only checklist items use a hidden answer pre-set by the app. The
  // review must preserve that value and attach the required evidence below.
  if (inputType === 'hidden') return;
  await input.fill(inputType === 'number' ? '0' : 'Completed OK');
}

async function completeChecklist(page, { issueItemId, issueNote } = {}) {
  const questions = page.locator('.ops-question');
  const total = await questions.count();
  expect(total).toBeGreaterThan(0);
  for (let index = 0; index < total; index += 1) {
    const question = questions.nth(index);
    const itemId = await question.getAttribute('data-item-id');
    const answer = question.locator('.ops-answer-value');
    await expect(answer).toHaveCount(1);
    if (itemId === issueItemId) {
      await answer.selectOption('Issue to report');
      await question.locator('.ops-answer-notes').fill(issueNote);
    } else {
      await chooseSafeAnswer(answer);
    }
    const photos = question.locator('.ops-item-photo');
    if (await photos.count()) await photos.first().setInputFiles(REVIEW_JPEG);
  }
}

async function submitAndReadAlert(page) {
  const dialogPromise = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'Submit vehicle check', exact: true }).click();
  const dialog = await dialogPromise;
  const message = dialog.message();
  await dialog.accept();
  return message;
}

async function inspectionWithReviewNote(page, note) {
  return page.evaluate(async reviewNote => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Operations client is unavailable.');
    const result = await client.from('operations_inspections')
      .select('id,overall_result,vehicle_id,notes,submitted_by_email')
      .eq('notes', reviewNote).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }, note);
}

async function taskRowsForInspection(page, inspectionId) {
  return page.evaluate(async id => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Operations client is unavailable.');
    const result = await client.from('operations_maintenance_tasks')
      .select('id,status,source_module,source_inspection_id,description')
      .eq('source_inspection_id', id);
    if (result.error) throw result.error;
    return result.data || [];
  }, inspectionId);
}

test('STAGING-REVIEW-001: one pass makes no task and one reported issue makes exactly one task', async ({ page }) => {
  const staging = getStagingConfig();
  const passNote = reviewLabel('pass');
  const issueNote = reviewLabel('single issue');

  await signInAndOpenVehicleChecks(page, staging);
  await page.locator('#opsInspectionVehicle').selectOption({ index: 1 });
  await page.locator('#opsInspectionNotes').fill(passNote);
  await completeChecklist(page);
  expect(await submitAndReadAlert(page)).toContain('0 maintenance tasks created');

  const passInspection = await inspectionWithReviewNote(page, passNote);
  expect(passInspection).toMatchObject({ overall_result: 'Pass', notes: passNote, submitted_by_email: staging.email });
  expect(await taskRowsForInspection(page, passInspection.id)).toEqual([]);

  await expect(page.locator('#opsInspectionForm')).toBeVisible({ timeout: 15_000 });
  await page.locator('#opsInspectionVehicle').selectOption({ index: 1 });
  await page.locator('#opsInspectionNotes').fill(issueNote);
  const issueItemId = await page.locator('.ops-question').evaluateAll(questions => {
    const issueQuestion = questions.find(question =>
      Array.from(question.querySelectorAll('select.ops-answer-value option')).some(option => option.value === 'Issue to report')
    );
    return issueQuestion?.dataset.itemId || null;
  });
  expect(issueItemId).toBeTruthy();
  await completeChecklist(page, { issueItemId, issueNote: 'E2E REVIEW — one reported issue only' });
  expect(await submitAndReadAlert(page)).toContain('1 maintenance task created');

  const issueInspection = await inspectionWithReviewNote(page, issueNote);
  expect(issueInspection).toMatchObject({ overall_result: 'Problem', notes: issueNote, submitted_by_email: staging.email });
  const issueTasks = await taskRowsForInspection(page, issueInspection.id);
  expect(issueTasks).toHaveLength(1);
  expect(issueTasks[0]).toMatchObject({ status: 'Open', source_module: 'vehicle_checks', source_inspection_id: issueInspection.id });
  expect(issueTasks[0].description).toContain('E2E REVIEW — one reported issue only');
});

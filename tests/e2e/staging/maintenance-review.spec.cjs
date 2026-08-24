const { test, expect } = require('@playwright/test');
const { getStagingConfig } = require('../support/staging-config.cjs');

// This journey intentionally retains its labelled staging evidence. Cleanup is
// a separate, explicitly approved operation.
const TEST_REGO = 'E2E-MAINT-TEST';
const TEST_NAME = 'E2E Maintenance Test Vehicle';

function reviewLabel(kind) {
  return `E2E REVIEW — Maintenance ${kind} — ${new Date().toISOString()}`;
}

async function signInAndOpenMaintenance(page, staging) {
  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');
  await page.locator('#loginEmail').fill(staging.email);
  await page.locator('#loginPassword').fill(staging.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => Boolean(window.SWOperationsV4?.state?.user?.id));
  try {
    await expect(page.locator('.ops-home-management')).toBeVisible({ timeout: 15_000 });
  } catch {
    const details = await page.evaluate(() => ({
      signedInUser: window.SWOperationsV4?.state?.user?.email || null,
      loadedRoles: window.SWOperationsV4?.state?.roles || []
    }));
    throw new Error(`Staging test account cannot access Maintenance. Assign it the Maintenance manager or Admin role. Loaded roles: ${details.loadedRoles.join(', ') || 'none'}; user: ${details.signedInUser || 'not loaded'}.`);
  }
  await page.locator('.ops-home-management').click();
  await expect(page.getByRole('button', { name: 'Assets', exact: true })).toBeVisible({ timeout: 15_000 });
}

async function existingTestVehicle(page) {
  return page.evaluate(async rego => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Operations client is unavailable.');
    const result = await client.from('operations_vehicles')
      .select('id,rego,name,status')
      .eq('rego', rego)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }, TEST_REGO);
}

async function ensureDedicatedTestVehicle(page) {
  let vehicle = await existingTestVehicle(page);
  if (vehicle) return vehicle;

  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page.getByRole('button', { name: 'Add Asset', exact: true }).click();
  await page.locator('#opsAssetAddType').selectOption('vehicle');
  await expect(page.locator('#opsVehicleForm')).toBeVisible();
  await page.locator('#opsVehicleRego').fill(TEST_REGO);
  await page.locator('#opsVehicleName').fill(TEST_NAME);
  await page.locator('#opsVehicleServiceNotes').fill('Dedicated automated staging Maintenance review target. No schedules or sub-assets.');
  const dialogPromise = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'Save vehicle', exact: true }).click();
  const dialog = await dialogPromise;
  const message = dialog.message();
  await dialog.accept();
  expect(message).toContain('Vehicle saved');
  vehicle = await existingTestVehicle(page);
  expect(vehicle).toMatchObject({ rego: TEST_REGO, name: TEST_NAME, status: 'Active' });
  return vehicle;
}

async function submitAndReadAlert(page) {
  const dialogPromise = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'Save maintenance record', exact: true }).click();
  const dialog = await dialogPromise;
  const message = dialog.message();
  await dialog.accept();
  return message;
}

async function chooseVehicleMaintenanceTarget(page, vehicleId) {
  const vehicle = page.locator('#opsLogEntryVehicle');
  const target = page.locator('#opsLogEntryTarget');

  await vehicle.selectOption(vehicleId);
  await expect(vehicle).toHaveValue(vehicleId);
  await expect(target).toBeEnabled();
  await target.selectOption('vehicle');
  await expect(target).toHaveValue('vehicle');
}

async function maintenanceEvidence(page, note) {
  return page.evaluate(async reviewNote => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Operations client is unavailable.');
    const logResult = await client.from('operations_maintenance_log')
      .select('id,record_date,vehicle_id,washing_equipment_id,performed_by,parts_used,notes,further_maintenance_required,generated_task_id')
      .eq('notes', reviewNote)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (logResult.error) throw logResult.error;
    const log = logResult.data;
    if (!log) return { log: null, items: [], tasks: [] };
    const [itemResult, taskResult] = await Promise.all([
      client.from('operations_maintenance_log_items')
        .select('maintenance_done,description,parts_used')
        .eq('maintenance_log_id', log.id)
        .order('sort_order'),
      client.from('operations_maintenance_tasks')
        .select('id,status,title,description,source_module,source_record_type,source_record_id,target_type,target_record_id,vehicle_id,washing_equipment_id,priority,due_date,assigned_role')
        .eq('source_record_id', log.id)
    ]);
    if (itemResult.error) throw itemResult.error;
    if (taskResult.error) throw taskResult.error;
    return { log, items: itemResult.data || [], tasks: taskResult.data || [] };
  }, note);
}

async function machineryForVehicle(page, vehicleId) {
  return page.evaluate(async id => {
    const client = window.SWOperationsV4?.state?.sb;
    if (!client) throw new Error('Staging Operations client is unavailable.');
    const result = await client.from('operations_washing_equipment')
      .select('id')
      .eq('assigned_vehicle_id', id);
    if (result.error) throw result.error;
    return result.data || [];
  }, vehicleId);
}

test('STAGING-MAINT-001: other maintenance retains its log and creates exactly one follow-up task', async ({ page }) => {
  const staging = getStagingConfig();
  const note = reviewLabel('record');
  const otherDescription = 'E2E REVIEW — vehicle condition checked';
  const itemParts = 'E2E REVIEW — item consumable';
  const generalParts = 'E2E REVIEW — general consumable';
  const followUp = 'E2E REVIEW — inspect vehicle condition at next service';

  await signInAndOpenMaintenance(page, staging);
  const vehicle = await ensureDedicatedTestVehicle(page);
  // The target is deliberately vehicle-only: the workflow must not seed
  // machinery, sub-assets, schedules, or future maintenance attention.
  expect(await machineryForVehicle(page, vehicle.id)).toEqual([]);

  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('button', { name: 'Record Maintenance', exact: true }).click();
  await expect(page.locator('#opsMaintenanceLogForm')).toBeVisible();
  await chooseVehicleMaintenanceTarget(page, vehicle.id);
  // Target selection regenerates this group. Click its visible label rather
  // than the transient checkbox node itself, then confirm the detail item
  // has been created before filling it in.
  const otherMaintenanceChoice = page.locator('.ops-maintenance-choice', { hasText: 'Other maintenance' });
  await expect(otherMaintenanceChoice).toBeVisible();
  await otherMaintenanceChoice.click();
  await expect(otherMaintenanceChoice.locator('.ops-maintenance-repeatable-toggle')).toBeChecked();
  await expect(page.locator('.ops-maintenance-detail-item')).toHaveCount(1);
  await page.locator('.ops-maintenance-detail-item').first().locator('.ops-maintenance-item-description').fill(otherDescription);
  await page.locator('.ops-maintenance-detail-item').first().locator('.ops-maintenance-item-parts').fill(itemParts);
  await page.locator('#opsLogEntryParts').fill(generalParts);
  await page.locator('#opsLogEntryNotes').fill(note);
  await page.locator('#opsLogEntryFurtherMaintenance').fill(followUp);
  expect(await submitAndReadAlert(page)).toContain('follow-up Task was created');

  const evidence = await maintenanceEvidence(page, note);
  expect(evidence.log).toMatchObject({
    vehicle_id: vehicle.id,
    washing_equipment_id: null,
    parts_used: generalParts,
    notes: note,
    further_maintenance_required: followUp
  });
  expect(evidence.items).toEqual([{ maintenance_done: 'Other maintenance', description: otherDescription, parts_used: itemParts }]);
  expect(evidence.tasks).toHaveLength(1);
  expect(evidence.tasks[0]).toMatchObject({
    status: 'Open',
    title: 'Further maintenance required',
    description: followUp,
    source_module: 'maintenance',
    source_record_type: 'maintenance_log',
    source_record_id: evidence.log.id,
    target_type: 'vehicle',
    target_record_id: vehicle.id,
    vehicle_id: vehicle.id,
    washing_equipment_id: null,
    priority: 'Medium',
    assigned_role: 'Maintenance manager'
  });
  expect(evidence.log.generated_task_id).toBe(evidence.tasks[0].id);
});

test('STAGING-MAINT-002: an approved routine vehicle type retains its exact label and creates no task', async ({ page }) => {
  const staging = getStagingConfig();
  const note = reviewLabel('routine vehicle');

  await signInAndOpenMaintenance(page, staging);
  const vehicle = await ensureDedicatedTestVehicle(page);
  expect(await machineryForVehicle(page, vehicle.id)).toEqual([]);

  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.getByRole('button', { name: 'Record Maintenance', exact: true }).click();
  await expect(page.locator('#opsMaintenanceLogForm')).toBeVisible();
  await chooseVehicleMaintenanceTarget(page, vehicle.id);
  const routineChoice = page.locator('.ops-maintenance-choice', { hasText: 'Engine oil changed' });
  await expect(routineChoice).toBeVisible();
  // Target selection regenerates this group. Click its visible label rather
  // than the transient checkbox node itself.
  await routineChoice.click();
  await expect(routineChoice.locator('.ops-maintenance-routine')).toBeChecked();
  await page.locator('#opsLogEntryNotes').fill(note);
  expect(await submitAndReadAlert(page)).toContain('Maintenance record saved');

  const evidence = await maintenanceEvidence(page, note);
  expect(evidence.log).toMatchObject({
    vehicle_id: vehicle.id,
    washing_equipment_id: null,
    notes: note,
    further_maintenance_required: null,
    generated_task_id: null
  });
  expect(evidence.items).toEqual([{ maintenance_done: 'Engine oil changed', description: null, parts_used: null }]);
  expect(evidence.tasks).toEqual([]);
});

const { test, expect } = require('@playwright/test');
const { getStagingAdminReadOnlyConfig } = require('../support/staging-admin-readonly-config.cjs');
test.setTimeout(90000);
test('weekly routine schedule preview is read-only and disabled', async ({ page }) => {
 const staging=getStagingAdminReadOnlyConfig(); await page.goto('/');
 await page.locator('#loginEmail').fill(staging.email); await page.locator('#loginPassword').fill(staging.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click(); await expect(page.locator('#signedIn')).toBeVisible({timeout:15000});
 const result=await page.evaluate(async () => { const client=window.SWOperationsV4?.state?.sb; const {data:{session}}=await client.auth.getSession(); const {data,error}=await client.functions.invoke('employee-notifications',{body:{action:'preview_weekly_routine_schedule'},headers:{Authorization:'Bearer '+session.access_token}}); return {data,error:error?.message||null}; });
 expect(result.error).toBeNull(); expect(result.data).toMatchObject({ok:true,kind:'weekly_routine_schedule_preview',delivery:'disabled',schedule:{timezone:'Pacific/Auckland',local_time:'Monday 7:30 am',active:false},candidates:{admin_weekly_summary:expect.any(Number),employee_task_only_summary:expect.any(Number),total:expect.any(Number)}});
});

const {test,expect}=require('@playwright/test');
const {getStagingConfig}=require('../support/staging-config.cjs');
const required=name=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`Missing required controlled staging test setting: ${name}`);return value;};
const config={...getStagingConfig(),accessToken:required('SUPABASE_ACCESS_TOKEN'),adminEmail:required('E2E_STAGING_ADMIN_EMAIL').toLowerCase(),adminPassword:required('E2E_STAGING_ADMIN_PASSWORD'),claimEmail:required('E2E_REG049_CLAIM_EMAIL').toLowerCase(),password:required('E2E_STAGING_TEST_PASSWORD')};
test.setTimeout(120000);
const literal=v=>`'${String(v).replaceAll("'","''")}'`;
async function sql(query){if(config.projectRef==='twkgfmctuffmkvkmdkct')throw new Error('SAFETY STOP: REG-058 never writes to production.');const r=await fetch(`https://api.supabase.com/v1/projects/${config.projectRef}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw new Error(`Staging database command failed (${r.status}).`);return r.json();}
async function cleanup(){await sql(`delete from auth.users where email=${literal(config.claimEmail)};`);}
async function expectOperationsUser(page,email){await expect.poll(()=>page.evaluate(()=>String(window.SWOperationsV4?.state?.user?.email||'').toLowerCase()),{timeout:15000}).toBe(String(email).toLowerCase());}
async function expectOperationsSignedOut(page){await expect.poll(()=>page.evaluate(()=>window.SWOperationsV4?.state?.user?false:true),{timeout:15000}).toBe(true);}
async function signIn(page,email,password){
  let authDialog='';
  const captureDialog=async dialog=>{authDialog=dialog.message();await dialog.dismiss();};
  page.on('dialog',captureDialog);
  try{
    await page.locator('#loginEmail').fill(email);
    await page.locator('#loginPassword').fill(password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    try{
      await expect(page.locator('#signedIn')).toBeVisible({timeout:15000});
      await expectOperationsUser(page,email);
    }catch(error){
      const detail=authDialog?` Supabase reported: ${authDialog}`:'';
      throw new Error(`Sign-in did not complete for the controlled staging test.${detail}`,{cause:error});
    }
  }finally{page.off('dialog',captureDialog);}
}
async function acceptDialogDuring(page, action, {message, promptText}={}){
  const handled=new Promise((resolve,reject)=>{
    page.once('dialog',async dialog=>{
      try{
        if(message) expect(dialog.message()).toMatch(message);
        if(promptText!==undefined) expect(dialog.type()).toBe('prompt');
        await dialog.accept(promptText);
        resolve();
      }catch(error){
        try{await dialog.dismiss();}catch{}
        reject(error);
      }
    });
  });
  await Promise.all([handled,action()]);
}
async function signOut(page){await page.evaluate(()=>window.signOut());await expect(page.locator('#signedOut')).toBeVisible();await expectOperationsSignedOut(page);}
async function openAdmin(page){
  await signIn(page,config.adminEmail,config.adminPassword);
  // A new sign-in settles on Home. Wait for that route before navigating so
  // the test cannot click Admin while the asynchronous route reset is active.
  const card=page.locator('.ops-home-admin');
  await expect(card).toBeVisible({timeout:15000});
  const heading=page.locator('#opsShell h2');
  await card.click();
  await expect(heading).toHaveText('Admin',{timeout:15000});
}
async function openCurrentUser(page,email,actionSelector){
  await expect.poll(()=>page.evaluate(expected=>window.SWOperationsV4?.state?.actualUsers?.some(user=>String(user.email||'').toLowerCase()===expected),String(email).toLowerCase()),{timeout:15000}).toBe(true);
  await page.getByText('Current Users',{exact:true}).click();
  const row=page.locator('.ops-user-row').filter({hasText:email});
  await expect(row).toHaveCount(1);
  await expect(row.locator(actionSelector)).toBeVisible({timeout:15000});
  return row;
}
test.afterEach(cleanup);
test('REG-058: Admin creates, blocks, unblocks, signs out and deletes a controlled private account',async({page})=>{
  const temporaryPassword=`Staging!REG058-${Date.now()}Aa`;
  await cleanup(); await page.goto('/'); await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION'); await expect(page.getByText('Create account',{exact:true})).toHaveCount(0);
  await openAdmin(page); await page.locator('summary',{hasText:'Create staff account'}).click();
  await page.locator('#opsAccountFirst').fill('E2E');await page.locator('#opsAccountLast').fill('REG058');await page.locator('#opsAccountEmail').fill(config.claimEmail);await page.locator('#opsAccountTempPassword').fill(temporaryPassword);await page.locator('input[data-ops-account-role][value="Vehicle inspector"]').check();
  await acceptDialogDuring(page,()=>page.getByRole('button',{name:'Create staff account',exact:true}).click(),{message:/Account created/});
  await signOut(page);await signIn(page,config.claimEmail,temporaryPassword);await expect(page.getByText('Create your own password',{exact:true})).toBeVisible();const personalPassword=`Staging!REG058Personal-${Date.now()}Aa`;await page.locator('#opsFirstPassword').fill(personalPassword);await page.locator('#opsFirstPasswordConfirm').fill(personalPassword);await page.getByRole('button',{name:'Save password and continue',exact:true}).click();await expect(page.locator('#opsFirstPassword')).toBeHidden({timeout:15000});await expect(page.locator('#opsShell')).not.toContainText('Create your own password',{timeout:15000});await signOut(page);
  await openAdmin(page);const row=await openCurrentUser(page,config.claimEmail,'[data-ops-account-block]');await acceptDialogDuring(page,()=>row.locator('[data-ops-account-block]').click());await expect(row).toContainText('Blocked');await signOut(page);
  await page.locator('#loginEmail').fill(config.claimEmail);await page.locator('#loginPassword').fill(personalPassword);await acceptDialogDuring(page,()=>page.getByRole('button',{name:'Sign in',exact:true}).click(),{message:/banned|disabled|blocked/i});await expect(page.locator('#signedOut')).toBeVisible();await expectOperationsSignedOut(page);
  await openAdmin(page);const blockedRow=await openCurrentUser(page,config.claimEmail,'[data-ops-account-unblock]');await acceptDialogDuring(page,()=>blockedRow.locator('[data-ops-account-unblock]').click());await expect(blockedRow).toContainText('Active',{timeout:15000});await signOut(page);await signIn(page,config.claimEmail,personalPassword);const vehicleCard=page.locator('.ops-home-vehicle');await expect(vehicleCard).toBeVisible({timeout:15000});await vehicleCard.click();await expect(page.locator('#opsShell h2')).toHaveText('Vehicle Checks');await signOut(page);
  await openAdmin(page);const deleteRow=await openCurrentUser(page,config.claimEmail,'[data-ops-account-delete]');await acceptDialogDuring(page,()=>deleteRow.locator('[data-ops-account-delete]').click(),{promptText:config.claimEmail});await expect(deleteRow).toHaveCount(0,{timeout:15000});
});

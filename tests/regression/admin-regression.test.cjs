const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname, '../..');
const app=fs.readFileSync(path.join(root, 'operations-v4.js'), 'utf8');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function functionSource(name, occurrence='last'){
  const marker=`function ${name}(`;
  const start=occurrence==='first' ? app.indexOf(marker) : app.lastIndexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const following=app.slice(start+1).match(/\n  (?:async )?function /);
  const end=following ? start+1+following.index : app.length;
  return app.slice(start, end);
}

test('REG-046: Admin uses one canonical role definition and one Admin-only management route',()=>{
  assert.match(app, /const ROLE_DEFS = \['Admin','Height equipment manager','Height equipment user','Maintenance manager','Vehicle inspector'\];/);
  assert.equal((app.match(/const ROLE_DEFS =/g)||[]).length,1,'role definitions must have one canonical source');
  assert.match(functionSource('hideLegacyUserAdminControls'), /\['usersTabButton','adminTabButton'\]/);
  assert.match(functionSource('openAdminModule'), /if\(!isAdmin\(\)\) return alert\('Admin access is required\.'\);/);
  assert.match(functionSource('showOperations'), /if\(isAdminView\(state\.currentView\) && !isAdmin\(\)\) state\.currentView = 'vehicle-checks';/);
  assert.match(functionSource('headerHtml'), /isAdminModule \? `\n        \$\{navButton\('admin-users','Users & Permissions'\)\}/);
});

test('REG-043: editing a signed-in user remains in the Admin user-management view',()=>{
  const users=functionSource('usersHtml');
  const actualUsers=functionSource('actualUsersHtml');
  const events=functionSource('bindRenderedEvents');
  assert.match(users, /<h3>Current signed-in users<\/h3>/);
  assert.match(users, /<details \$\{state\.editingActualUserId\?'open':''\}><summary>Current Users<\/summary>/);
  assert.match(actualUsers, /data-ops-edit-user=/);
  assert.match(actualUsers, /data-ops-save-user=/);
  assert.match(events, /state\.editingActualUserId=b\.dataset\.opsEditUser; render\(\);/);
  assert.match(events, /state\.editingActualUserId=''; render\(\);/);
});

test('REG-044: an Admin cannot change their own role selection through the Admin screen',()=>{
  const grid=functionSource('roleCheckboxGridForUser');
  const save=functionSource('saveActualUser');
  assert.match(grid, /const lockOwnPermissions=String\(userId\)===String\(state\.user\?\.id\);/);
  assert.match(grid, /\$\{lockOwnPermissions \? 'disabled' : ''\}/);
  assert.match(save, /const editingOwnAccount=String\(userId\)===String\(state\.user\?\.id\);/);
  assert.match(save, /if\(currentRoles\.join\('\|'\)!==selectedRoles\.join\('\|'\)\)/);
  assert.match(save, /cannot change your own permissions here\. Another Admin can do that for you\./);
});

test('REG-048: opening Admin renders a single immediate Home control without delayed Admin routing',()=>{
  const openAdmin=functionSource('openAdminModule');
  const header=functionSource('headerHtml');
  assert.match(openAdmin, /state\.currentModule = 'admin';/);
  assert.match(openAdmin, /showOperations\(target\);/);
  assert.doesNotMatch(openAdmin, /setTimeout|insertAdjacentHTML|appendChild/);
  assert.equal((header.match(/ops-home-btn/g)||[]).length,1,'Admin header must render one Home button');
});

test('REG-047: Height read-only security test requires a separate account and refuses the production project',()=>{
  const config=read('tests/e2e/support/staging-height-readonly-security-config.cjs');
  const workflow=read('.github/workflows/staging-height-readonly-security.yml');
  const spec=read('tests/e2e/staging/height-readonly-security.spec.cjs');
  assert.match(config, /E2E_STAGING_HEIGHT_READONLY_EMAIL/);
  assert.match(config, /E2E_STAGING_HEIGHT_READONLY_PASSWORD/);
  assert.match(config, /getStagingConfig/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /VERIFY STAGING HEIGHT READONLY SECURITY/);
  assert.match(workflow, /E2E_STAGING_HEIGHT_READONLY_EMAIL/);
  assert.match(workflow, /twkgfmctuffmkvkmdkct/);
  assert.match(spec, /equipment insert must be rejected by database RLS/);
  assert.match(spec, /equipment photo upload must be rejected by Storage RLS/);
  assert.match(spec, /retained equipment insert must not create a record|a denied equipment insert must not create a record/);
});

test('REG-049: pre-loaded permissions are explicit, claimed once, and never restored on a later login',()=>{
  const users=functionSource('usersHtml');
  const save=functionSource('savePreloadedUser');
  const remove=functionSource('deletePreloadedUser');
  const migration=read('supabase/migrations/20260825_secure_preloaded_user_claims.sql');

  assert.equal((app.match(/function usersHtml\(/g)||[]).length,1,'Admin user-management markup must have one active definition');
  assert.doesNotMatch(users, /roleCheckboxGridForPreload\(\['Vehicle inspector'\]\)/);
  assert.match(users, /roleCheckboxGridForPreload\(editingPreload\?\.roles \|\| \[\]\)/);
  assert.match(users, /Nothing is selected by default/);
  assert.match(users, /data-ops-edit-preload-user=/);
  assert.match(users, /data-ops-delete-preload-user=/);
  assert.match(users, /Manage under Current Users/);
  assert.doesNotMatch(save, /\.upsert\(/);
  assert.match(save, /\.is\('claimed_user_id', null\)/);
  assert.match(remove, /preloadedUserIsClaimed\(user\)/);

  assert.match(migration, /status = 'Pending'/);
  assert.match(migration, /claimed_user_id is null/);
  assert.match(migration, /claimed_at is null/);
  assert.match(migration, /for update/);
  assert.match(migration, /Claimed pre-loaded users are audit records and cannot be changed/);
  assert.match(migration, /Claimed pre-loaded users are audit records and cannot be deleted/);
  assert.match(migration, /array\[\]::text\[\]/);
});

test('REG-049 controlled staging claim review refuses production and removes its own temporary identities',()=>{
  const config=read('tests/e2e/support/staging-preloaded-claim-config.cjs');
  const workflow=read('.github/workflows/staging-preloaded-user-claim-review.yml');
  const spec=read('tests/e2e/staging/preloaded-user-claim-review.spec.cjs');
  assert.match(config, /E2E_REG049_CLAIM_EMAIL/);
  assert.match(config, /E2E_REG049_SELF_SIGNUP_EMAIL/);
  assert.match(config, /E2E_STAGING_ADMIN_EMAIL/);
  assert.match(config, /E2E_STAGING_ADMIN_PASSWORD/);
  assert.match(config, /dedicated Admin account and two distinct temporary mailboxes/);
  assert.match(workflow, /VERIFY STAGING PRELOADED CLAIM TEST/);
  assert.match(workflow, /E2E_REG049_CLAIM_EMAIL: \$\{\{ secrets\.E2E_REG049_CLAIM_EMAIL \}\}/);
  assert.match(workflow, /E2E_REG049_SELF_SIGNUP_EMAIL: \$\{\{ secrets\.E2E_REG049_SELF_SIGNUP_EMAIL \}\}/);
  assert.match(workflow, /E2E_STAGING_ADMIN_EMAIL: \$\{\{ secrets\.E2E_STAGING_ADMIN_EMAIL \}\}/);
  assert.match(workflow, /E2E_STAGING_ADMIN_PASSWORD: \$\{\{ secrets\.E2E_STAGING_ADMIN_PASSWORD \}\}/);
  assert.doesNotMatch(workflow, /e2e-reg049-claim-\$\{nonce\}@sprayandwash\.co\.nz/);
  assert.doesNotMatch(workflow, /e2e-reg049-self-\$\{nonce\}@sprayandwash\.co\.nz/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /SUPABASE_ACCESS_TOKEN/);
  assert.match(workflow, /twkgfmctuffmkvkmdkct/);
  assert.match(spec, /SAFETY STOP: REG-049 will never run database commands against production/);
  assert.match(spec, /disable trigger operations_preloaded_users_protect_claimed/);
  assert.match(spec, /delete from auth\.users/);
  assert.match(spec, /'Vehicle inspector'/);
  assert.match(spec, /signIn\(page, config\.adminEmail, config\.adminPassword\)/);
  assert.match(spec, /removeVehicleInspectorThroughAdminUi/);
  assert.match(spec, /ops-home-admin/);
  assert.match(spec, /data-ops-edit-user/);
  assert.match(spec, /data-ops-save-user/);
  assert.match(spec, /currentUsersSummary\.click\(\)/);
  assert.match(spec, /await expect\(editButton\)\.toBeVisible\(\)/);
  assert.ok(
    spec.indexOf('await expect(claimedUser).toHaveCount(1') < spec.indexOf('await currentUsersSummary.click()'),
    'the controlled test must wait for users to load before opening Current Users'
  );
  assert.doesNotMatch(spec, /async function removeVehicleInspectorRole/);
  assert.match(workflow, /real Admin → Current Users removal/);
  assert.match(spec, /expectCurrentRoles\(page, \[\]\)/);
  assert.match(spec, /Account created/);
  assert.match(spec, /temporaryIdentityCount/);
  assert.match(spec, /window\.signOut/);
});

test('REG-043/046/048: Admin read-only browser review covers desktop and mobile without write actions',()=>{
  const config=read('tests/e2e/support/staging-admin-readonly-config.cjs');
  const browserConfig=read('playwright.staging.admin.readonly.config.cjs');
  const workflow=read('.github/workflows/staging-admin-readonly-review.yml');
  const spec=read('tests/e2e/staging/admin-readonly-review.spec.cjs');

  assert.match(config, /E2E_STAGING_ADMIN_EMAIL/);
  assert.match(config, /E2E_STAGING_ADMIN_PASSWORD/);
  assert.match(browserConfig, /Desktop Chrome/);
  assert.match(browserConfig, /Pixel 7/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /E2E_STAGING_ADMIN_EMAIL/);
  assert.match(workflow, /twkgfmctuffmkvkmdkct/);
  assert.match(spec, /ops-home-admin/);
  assert.match(spec, /Users & Permissions', exact: true \}\)\.click\(\)/);
  assert.match(spec, /currentUsersSummary/);
  assert.match(spec, /currentUsersSummary\.click\(\)/);
  assert.match(spec, /input\[data-ops-preload-role\]:checked/);
  assert.match(spec, /Save app settings/);
  assert.match(spec, /Create Complete Backup/);
  assert.doesNotMatch(spec, /\.click\(\).*Save app settings/);
  assert.doesNotMatch(spec, /\.click\(\).*Create Complete Backup/);
});

test('Admin controlled-test design prohibits unsafe normal-user, production, and real-backup actions',()=>{
  const plan=read('docs/admin-controlled-staging-test-plan.md');
  assert.match(plan, /not an executable workflow/);
  assert.match(plan, /twkgfmctuffmkvkmdkct/);
  assert.match(plan, /must never manufacture email addresses that could bounce/);
  assert.match(plan, /must never edit, delete, demote, or depend on a normal staff account/);
  assert.match(plan, /must never download a real backup, upload a logo, or save App Settings/);
  assert.match(plan, /separate Stage 9B approval/);
});

test('REG-058: private account lifecycle has no public sign-up path and uses a server-side function',()=>{
  const index=read('index.html');
  const legacyApp=read('app.js');
  const migration=read('supabase/migrations/20260828_private_account_lifecycle.sql');
  const fn=read('supabase/functions/account-admin/index.ts');
  const users=functionSource('usersHtml');
  assert.doesNotMatch(index,/Create account/);
  assert.doesNotMatch(legacyApp,/function signUp\(/);
  assert.match(users,/Create staff account/);
  assert.match(app,/functions\.invoke\('account-admin'/);
  assert.match(migration,/app_user_access/);
  assert.match(migration,/must_change_password/);
  assert.match(migration,/Cannot remove the final active Admin role/);
  assert.match(fn,/auth\.admin\.createUser/);
  assert.match(fn,/auth\.admin\.signOut/);
  assert.match(fn,/auth\.admin\.deleteUser/);
  assert.match(fn,/complete_first_password/);
  assert.doesNotMatch(fn,/SUPABASE_SERVICE_ROLE_KEY.*window|localStorage/);
});

test.todo('REG-044: a different Admin cannot remove the final active Admin role');
test.todo('REG-047: run the controlled staging Height read-only role-matrix verification after its separate account is configured');
test.todo('REG-048: browser review records no delayed Admin layout shift after opening the module');

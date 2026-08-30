const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname, '../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('REG-009: every active browser script parses before a release can proceed',()=>{
  const runtimeScripts=[
    'config.js','app.js','operations-rules.js','operations-v4.js',
    'backup-v4-core.js','backup-v4.js','photo-storage-v4.0.84.js',
    'release-v4.0.83.js','service-worker.js'
  ];
  for(const file of runtimeScripts){
    assert.equal(fs.existsSync(path.join(root,file)),true,`${file} must exist`);
    const checked=spawnSync(process.execPath,['--check',file],{cwd:root,encoding:'utf8'});
    assert.equal(checked.status,0,`${file} did not parse:\n${checked.stderr}`);
  }
});

test('REG-015: vehicle-check selects start blank and never offer No response',()=>{
  const operations=read('operations-v4.js');
  assert.match(operations,/let opts = \['Completed OK','Issue to report','N\/A'\];/);
  assert.match(operations,/<select class="ops-answer-value"[^>]*><option value=""><\/option>/);
  assert.doesNotMatch(operations,/No response/i);
});

test('REG-016: shared vehicle-check history is restricted to managers and admins',()=>{
  const operations=read('operations-v4.js');
  assert.match(operations,/const sharedRecent = canManage\(\) \? newestFirst\(\[\.\.\.state\.inspections\]\)\.slice\(0,10\) : \[\];/);
  assert.match(operations,/Recent checks \(all staff\)/);
  assert.match(operations,/includeInspector\?'<th>Inspector<\/th>':''/);
});

test('REG-051: manifest and index reference the approved packaged app icons',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  const index=read('index.html');
  assert.equal(manifest.name,'Spray and Wash Operations App');
  assert.match(index,/<link rel="manifest" href="manifest\.webmanifest\?v=4\.0\.86">/);
  assert.match(index,/spray-wash-app-icon-192-v4\.0\.86\.png/);
  assert.match(index,/favicon-v4\.0\.86\.ico/);
  for(const icon of manifest.icons){
    assert.equal(fs.existsSync(path.join(root,icon.src)),true,`manifest icon missing: ${icon.src}`);
    assert.ok(fs.statSync(path.join(root,icon.src)).size>0,`manifest icon is empty: ${icon.src}`);
  }
});

test('REG-059: narrow mobile header uses the compact app label and reserves the account control',()=>{
  const index=read('index.html');
  assert.match(index,/header\{align-items:flex-start;padding-right:128px\}/);
  assert.match(index,/@media\(max-width:640px\)\{header\{padding-top:10px;padding-bottom:10px;gap:8px\}header h1\{font-size:20px;white-space:nowrap\}\.appTitleFull\{display:none\}\.appTitleMobile\{display:inline\}/);
  assert.match(index,/<h1 aria-label="Spray and Wash Operations App"><span class="appTitleFull">Spray and Wash Operations App<\/span><span class="appTitleMobile" aria-hidden="true">Spray &amp; Wash<\/span><\/h1>/);
});

test('REG-052: service worker takes control and serves navigation network-first',()=>{
  const worker=read('service-worker.js');
  assert.match(worker,/self\.skipWaiting\(\)/);
  assert.match(worker,/self\.clients\.claim\(\)/);
  assert.match(worker,/event\.request\.mode === 'navigate'/);
  assert.match(worker,/cache: 'no-store'/);
  assert.match(worker,/backup-v4\.js\?v=4\.0\.84/);
  assert.match(worker,/photo-storage-v4\.0\.84\.js\?v=4\.0\.84/);
});

test('REG-053: the index loads one coherent versioned entry-script set',()=>{
  const index=read('index.html');
  const scripts=['app.js','operations-rules.js','operations-v4.js','backup-v4.js'];
  const versions=scripts.map(file=>{
    const match=index.match(new RegExp(`src=["'](?:\\./)?${file.replace('.','\\.')}\\?v=([0-9.]+)["']`));
    assert.ok(match,`missing versioned ${file} script tag`);
    return match[1];
  });
  assert.equal(new Set(versions).size,1,`entry scripts use mixed versions: ${versions.join(', ')}`);
});

test('REG-054: Height Equipment Add Item code uses the current form field IDs',()=>{
  const index=read('index.html');
  const app=read('app.js');
  for(const id of ['eqFirst','eqRetired','eqServiceLife','eqFrequency','eqRopeLenWrap']){
    assert.match(index,new RegExp(`id=["']${id}["']`),`missing Height Equipment form field: ${id}`);
    assert.match(app,new RegExp(`\\b${id}\\b`),`Height Equipment code does not use ${id}`);
  }
  for(const staleId of ['eqFirstUsed','eqRetire','eqServiceLifeYears','eqFreq','eqAutoRetire','ropeLengthWrap']){
    assert.doesNotMatch(app,new RegExp(`\\b${staleId}\\b`),`stale Height Equipment form ID remains: ${staleId}`);
  }
  assert.match(app,/function newEquipment\(\).*showTab\("editEquipment"\)/);
  assert.match(app,/function autoCalculateRetirementDate\(\)/);
});

test('REG-057: Height Equipment register distinguishes loading from an empty register and the mobile review uses a visible card tap',()=>{
  const index=read('index.html');
  const app=read('app.js');
  const review=read('tests/e2e/staging/height-equipment-read-only-review.spec.cjs');
  assert.match(app,/let heightEquipmentDataState="idle";/);
  assert.match(app,/heightEquipmentDataState="loading";/);
  assert.match(app,/Loading equipment…/);
  assert.match(app,/heightEquipmentDataState="ready";/);
  assert.match(app,/equipment=eq\.data\|\|\[\]; inspections=ins\.data\|\|\[\]; heightEquipmentDataState="ready"; renderAll\(\); renderSuggestions\(\);[\s\S]*let ph=await sb\.from\("equipment_photos"\)/);
  assert.match(index,/#equipmentList \.listItem\{scroll-margin-block:150px 18px\}/);
  assert.match(review,/locator\('#equipmentFilterCount'\)\)\.toHaveText\(/);
  assert.match(review,/input=>input\.blur\(\)/);
  assert.doesNotMatch(review,/search\.press\('Escape'\)/);
  assert.match(review,/const stickyTop=170;/);
  assert.match(review,/window\.scrollTo\(\{top:Math\.max\(0,target\),behavior:'instant'\}\)/);
  assert.match(review,/document\.elementFromPoint\(x,y\)/);
  assert.match(review,/await page\.mouse\.click\(tapPoint\.x,tapPoint\.y\);/);
  assert.doesNotMatch(review,/force\s*:\s*true/);
  assert.doesNotMatch(review,/await selectedItem\.click\(\);/);
});

test('REG-058: mobile layout keeps dashboard cards and Staging account controls in view',()=>{
  const index=read('index.html');
  assert.match(index,/\.stagingEnvironment\{--staging-banner-height:52px\}/);
  assert.match(index,/\.stagingEnvironment \.accountTray\{top:calc\(var\(--staging-banner-height\) \+ 14px\)\}/);
  assert.match(index,/@media\(max-width:760px\)\{[\s\S]*?#dashboard>\.grid\.five\{grid-template-columns:1fr;margin-top:0\}/);
  assert.match(index,/header>div\{flex:1;min-width:0\}/);
  assert.match(index,/\.tagline,\.topUserSummary\{max-width:100%;white-space:normal;overflow-wrap:anywhere\}/);
  assert.match(index,/V4 dashboard grid rule above[\s\S]*?#dashboard>\.grid\.five\{grid-template-columns:1fr;margin-top:0\}/);
});

test('REG-062: a first-password account is routed to its account gate',()=>{
  const operations=read('operations-v4.js');
  assert.match(operations,/state\.accountAccess\?\.status === 'Blocked' \|\| state\.accountAccess\?\.must_change_password/);
  assert.match(operations,/state\.currentModule = 'account-gate';[\s\S]*?showOperations\('account-gate'\);/);
});

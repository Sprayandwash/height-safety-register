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
  assert.equal(manifest.name,'Spray & Wash Operations');
  assert.match(index,/<link rel="manifest" href="manifest\.webmanifest\?v=4\.0\.83">/);
  assert.match(index,/spray-wash-app-icon-192\.png\?v=4\.0\.83/);
  for(const icon of manifest.icons){
    assert.equal(fs.existsSync(path.join(root,icon.src)),true,`manifest icon missing: ${icon.src}`);
    assert.ok(fs.statSync(path.join(root,icon.src)).size>0,`manifest icon is empty: ${icon.src}`);
  }
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
  for(const id of ['eqFirst','eqRetired','eqServiceLife','eqFrequency']){
    assert.match(index,new RegExp(`id=["']${id}["']`),`missing Height Equipment form field: ${id}`);
    assert.match(app,new RegExp(`\\b${id}\\b`),`Height Equipment code does not use ${id}`);
  }
  for(const staleId of ['eqFirstUsed','eqRetire','eqServiceLifeYears','eqFreq','eqAutoRetire']){
    assert.doesNotMatch(app,new RegExp(`\\b${staleId}\\b`),`stale Height Equipment form ID remains: ${staleId}`);
  }
  assert.match(app,/function newEquipment\(\).*showTab\("editEquipment"\)/);
  assert.match(app,/function autoCalculateRetirementDate\(\)/);
});

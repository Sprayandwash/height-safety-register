const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rules=require('../../operations-rules.js');

const root=path.resolve(__dirname, '../..');
const app=fs.readFileSync(path.join(root, 'operations-v4.js'), 'utf8');

function functionSource(name){
  const start=app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const following=app.slice(start+1).match(/\n  (?:async )?function /);
  const end=following ? start+1+following.index : app.length;
  return app.slice(start, end);
}

test('REG-016: the Maintenance form presents only approved routine types for each target',()=>{
  const source=functionSource('maintenanceRoutineTypesForTarget');
  assert.match(source, /targetValue==='vehicle'.*Engine oil changed.*Oil filter changed.*Brake fluid replaced/s);
  assert.match(source, /machineryType\(machinery\)==='Engine'.*Oil changed.*Spark plug changed.*Air filter changed/s);
  assert.match(source, /machineryType\(machinery\)==='Gearbox'.*Oil changed/s);
  assert.match(source, /machineryType\(machinery\)==='Pump'.*Oil changed.*Valves changed.*Seals replaced/s);
  assert.match(functionSource('updateMaintenanceLogEntryRoutineChoices'), /data-maintenance-repeatable="Repair"/);
  assert.match(functionSource('updateMaintenanceLogEntryRoutineChoices'), /data-maintenance-repeatable="Other maintenance"/);
});

test('REG-017: the Maintenance save sends selected item types unchanged to the maintenance RPC',()=>{
  const source=functionSource('saveMaintenanceLogEntry');
  assert.match(source, /operations_add_maintenance_record_v4053/);
  assert.match(source, /p_items:maintenanceItems/);
  assert.doesNotMatch(source, /normalizeLegacyMaintenanceReportItem/);
});

test('REG-020: a standard Maintenance item may remain on-demand without creating a schedule',()=>{
  const editor=functionSource('maintenanceItemEditorHtml');
  const save=functionSource('saveStandardMaintenanceItem');
  assert.match(editor, /id="opsStandardMaintenanceFrequency"[^>]*placeholder="Leave blank for on-demand"/);
  assert.doesNotMatch(editor.match(/id="opsStandardMaintenanceFrequency"[^>]*>/)?.[0]||'', /required/);
  assert.match(save, /const frequency=raw\?Number\(raw\):null/);
  assert.match(save, /frequency_days:frequency/);
  assert.doesNotMatch(save, /operations_equipment_maintenance_schedules/);
});

test('REG-023: Maintenance attention routes due-soon and overdue schedules to their matching lists',()=>{
  assert.equal(rules.maintenanceScheduleAttentionFilter('soon'), 'upcoming');
  assert.equal(rules.maintenanceScheduleAttentionFilter('critical'), 'overdue');
  assert.match(functionSource('attentionHomeHtml'), /openAttentionItem\([\s\S]*esc\(item\.group\)/);
  const openAttention=functionSource('openAttentionItem');
  assert.match(openAttention, /maintenanceScheduleAttentionFilter\(group\)/);
  assert.match(openAttention, /group==='soon'\?'upcoming':'overdue'/);
});

test('REG-025: reports normalise recognised legacy Maintenance labels without mutating source records',()=>{
  const normalize=functionSource('normalizeLegacyMaintenanceReportItem');
  assert.match(normalize, /type==='Oil changed'&&description==='Engine oil changed'/);
  assert.match(normalize, /type==='Other maintenance'&&routineTypes\.has\(description\)/);
  assert.match(normalize, /type==='Other maintenance'&&\/\^Repair:/);
  assert.match(functionSource('downloadMaintenanceReportCsv'), /maintenanceReportRowData/);
});

test('REG-026: printable Maintenance reports use a clean landscape document layout',()=>{
  const print=functionSource('printMaintenanceReport');
  assert.match(print, /@page\{size:A4 landscape;margin:0\}/);
  assert.match(print, /@media print\{\.noPrint\{display:none\}/);
  assert.match(print, /thead\{display:table-header-group\}/);
  assert.match(print, /window\.open\('', '_blank'\)/);
  assert.match(print, /Print \/ Save as PDF/);
});

test.todo('REG-021: task status, steps, and parts save atomically and retries are idempotent');

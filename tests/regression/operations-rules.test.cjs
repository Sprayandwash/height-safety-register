const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rules=require('../../operations-rules.js');

test('REG-001: a passed vehicle check produces no follow-up task candidates',()=>{
  const answers=[{problem:false},{problem:false},{problem:false}];
  assert.deepEqual(rules.issueAnswerRows(answers), []);
});

test('REG-002: each reported vehicle-check issue produces one task candidate',()=>{
  const answers=[{item:{id:'pass'},problem:false},{item:{id:'issue-1'},problem:true},{item:{id:'issue-2'},problem:true}];
  assert.deepEqual(rules.issueAnswerRows(answers).map(row=>row.item.id), ['issue-1','issue-2']);
});

test('REG-003: vehicle checks are due soon only within seven days',()=>{
  assert.equal(rules.vehicleCheckDueSoonLeadDays(14), 7);
  assert.equal(rules.vehicleCheckNeedsAttention(7, 14), true);
  assert.equal(rules.vehicleCheckNeedsAttention(8, 14), false);
  assert.equal(rules.vehicleCheckNeedsAttention(-1, 14), true);
  assert.equal(rules.vehicleCheckNeedsAttention(1, 3), true);
  assert.equal(rules.vehicleCheckNeedsAttention(4, 3), false);
});

test('REG-004: reported answers are recognised, while a completed answer is not',()=>{
  assert.equal(rules.itemIsProblem({problem_values:['Issue to report']}, 'Completed OK'), false);
  assert.equal(rules.itemIsProblem({problem_values:['Issue to report']}, 'Issue to report'), true);
  assert.equal(rules.itemIsProblem({question_text:'Measure pure water system'}, '10'), false);
  assert.equal(rules.itemIsProblem({question_text:'Measure pure water system'}, '10.1'), true);
});

test('REG-005: routine procedures may only be scheduled on compatible machinery',()=>{
  const engine={machinery_type:'Engine',equipment_type:'Water Blaster Engine'};
  const pump={machinery_type:'Pump',equipment_type:'Water Blaster Pump'};
  const waterBlaster={equipment_type:'Water Blaster'};
  assert.equal(rules.scheduleProcedureMatchesMachinery({category:'Engine'}, engine), true);
  assert.equal(rules.scheduleProcedureMatchesMachinery({category:'Engine'}, pump), false);
  assert.equal(rules.scheduleProcedureMatchesMachinery({category:'Pump'}, pump), true);
  assert.equal(rules.scheduleProcedureMatchesMachinery({category:'General'}, waterBlaster), true);
  assert.equal(rules.scheduleProcedureMatchesMachinery({category:'General'}, engine), false);
  assert.equal(rules.scheduleProcedureMatchesMachinery({name:'PM planned 123',category:'Anything'}, engine), true);
});

test('REG-006: completed and deferred tasks are excluded from the open-task list',()=>{
  assert.equal(rules.taskIsOpen({status:'Open'}), true);
  assert.equal(rules.taskIsOpen({status:'Waiting on Parts'}), true);
  assert.equal(rules.taskIsOpen({status:'Completed'}), false);
  assert.equal(rules.taskIsOpen({status:'Deferred'}), false);
});

test('REG-007: the schedule migration retains the server-side compatibility guard',()=>{
  const root=path.resolve(__dirname, '../..');
  const migration=fs.readFileSync(path.join(root, 'supabase/migrations/20260819_prevent_misassigned_schedules.sql'), 'utf8');
  assert.match(migration, /create trigger operations_validate_maintenance_schedule_category/i);
  assert.match(migration, /v_category = 'engine' and v_machinery_type = 'Engine'/i);
  assert.match(migration, /v_category = 'general' and v_equipment_type = 'water blaster'/i);
  assert.match(migration, /raise exception 'Procedure category/i);
});

test('REG-008: the browser app loads and uses the tested shared rules',()=>{
  const root=path.resolve(__dirname, '../..');
  const index=fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app=fs.readFileSync(path.join(root, 'operations-v4.js'), 'utf8');
  assert.ok(index.indexOf('operations-rules.js') < index.indexOf('operations-v4.js'));
  assert.match(app, /REGRESSION_RULES\.vehicleCheckNeedsAttention/);
  assert.match(app, /REGRESSION_RULES\.scheduleProcedureMatchesMachinery/);
  assert.match(app, /REGRESSION_RULES\.issueAnswerRows/);
  assert.match(app, /REGRESSION_RULES\.taskIsOpen/);
});

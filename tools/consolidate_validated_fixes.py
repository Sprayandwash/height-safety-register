from pathlib import Path
import re
import textwrap


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Missing consolidation anchor: {label}")
    return text.replace(old, new, 1)


# app.js: keep date-only values aligned with the business timezone.
app = Path("app.js")
s = app.read_text(encoding="utf-8")
s = replace_once(
    s,
    'function today(){return new Date().toISOString().slice(0,10);}',
    '''const APP_TIME_ZONE="Pacific/Auckland";\nfunction dateInTimeZone(value=new Date()){const parts=new Intl.DateTimeFormat("en-NZ",{timeZone:APP_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);const get=t=>parts.find(p=>p.type===t)?.value||"";return `${get("year")}-${get("month")}-${get("day")}`;}\nfunction today(){return dateInTimeZone(new Date());}''',
    "app today()",
)
s = replace_once(
    s,
    'function addMonths(d,m){let x=new Date((d||today())+"T00:00:00");x.setMonth(x.getMonth()+m);return x.toISOString().slice(0,10);}',
    'function addMonths(d,m){const [y,mo,da]=(d||today()).split("-").map(Number);const x=new Date(Date.UTC(y,mo-1,da));x.setUTCMonth(x.getUTCMonth()+Number(m||0));return x.toISOString().slice(0,10);}',
    "app addMonths()",
)
s = replace_once(
    s,
    'function datePlus(days){let d=new Date(today()+"T00:00:00"); d.setDate(d.getDate()+Number(days)); return d.toISOString().slice(0,10);}',
    'function datePlus(days){const [y,m,d]=today().split("-").map(Number);const x=new Date(Date.UTC(y,m-1,d));x.setUTCDate(x.getUTCDate()+Number(days||0));return x.toISOString().slice(0,10);}',
    "app datePlus()",
)
app.write_text(s, encoding="utf-8")


# operations-v4.js: consolidate the Vehicle Checks behavior that passed staging.
ops = Path("operations-v4.js")
s = ops.read_text(encoding="utf-8")
s = replace_once(
    s,
    "  function today(){ return new Date().toISOString().slice(0,10); }",
    "  const APP_TIME_ZONE = 'Pacific/Auckland';\n  function dateInTimeZone(value = new Date()){ const parts = new Intl.DateTimeFormat('en-NZ',{timeZone:APP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value); const get=t => parts.find(p=>p.type===t)?.value || ''; return `${get('year')}-${get('month')}-${get('day')}`; }\n  function today(){ return dateInTimeZone(new Date()); }",
    "operations today()",
)
s = replace_once(
    s,
    "  function nzDate(value){ if(!value) return '—'; const d = new Date(String(value).includes('T') ? value : value + 'T00:00:00'); return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString('en-NZ'); }",
    "  function nzDate(value){ if(!value) return '—'; const raw=String(value); if(/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)){const [y,m,d]=raw.split('-');return `${d}/${m}/${y}`;} const dt=new Date(raw); return Number.isNaN(dt.getTime()) ? esc(value) : dt.toLocaleDateString('en-NZ',{timeZone:APP_TIME_ZONE}); }",
    "operations nzDate()",
)
s = replace_once(
    s,
    "  function addDays(dateStr, days){ const d = new Date((dateStr || today()) + 'T00:00:00'); d.setDate(d.getDate() + Number(days || 0)); return d.toISOString().slice(0,10); }",
    "  function addDays(dateStr, days){ const [y,m,d]=(dateStr||today()).split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d)); dt.setUTCDate(dt.getUTCDate()+Number(days||0)); return dt.toISOString().slice(0,10); }",
    "operations addDays()",
)
s = replace_once(
    s,
    '    return `<form id="opsInspectionForm" class="ops-form">',
    '    return `<form id="opsInspectionForm" class="ops-form" autocomplete="off">',
    "Vehicle Checks form autocomplete",
)

submit_pattern = re.compile(
    r"  async function submitInspection\(e\)\{.*?\n  \}\n\n  async function uploadInspectionPhoto",
    re.S,
)
submit_replacement = r'''  async function submitInspection(e){
    e.preventDefault(); if(!canSubmit()) return alert('Your role cannot submit Operations inspections.');
    const submit=e.submitter; if(submit?.disabled) return; if(submit) submit.disabled=true;
    try{
      const template=state.templates.find(t=>t.id===byId('opsInspectionTemplate').value)||vehicleChecklistTemplate();
      if(!template||!template.id)return alert('Vehicle Inspection Checklist is not available.');
      const targetType=template.target_type;
      const vehicleId=byId('opsInspectionVehicle')?.value||null;
      const washId=byId('opsInspectionWash')?.value||null;
      if(['vehicle','combined'].includes(targetType)&&!vehicleId)return alert('Select a vehicle before submitting.');
      const answerRows=[]; const itemPhotos=[]; let hasProblem=false;
      try{
        document.querySelectorAll('.ops-question').forEach(q=>{
          const item=state.checklistItems.find(i=>i.id===q.dataset.itemId); if(!item)return;
          const input=q.querySelector('.ops-answer-value'); const answer=input?.value||'';
          if(input?.hasAttribute('required')&&!answer)throw new Error('Please answer every checklist item before submitting.');
          const notes=q.querySelector('.ops-answer-notes')?.value||''; const problem=itemIsProblem(item,answer);
          if(problem)hasProblem=true;
          const photoFiles=Array.from(q.querySelectorAll('.ops-item-photo')).flatMap(el=>Array.from(el.files||[]));
          if(q.dataset.photoRequired==='true'&&!photoFiles.length)throw new Error('Upload at least one photo of the cleaned vehicle or cab before submitting.');
          answerRows.push({item,answer,notes,problem}); photoFiles.forEach(file=>itemPhotos.push({item,file}));
        });
      }catch(err){return alert(err.message);}
      if(!answerRows.length)return alert('No checklist answers were captured. The inspection was not saved.');
      const insRow={template_id:template.id,target_type:targetType,vehicle_id:vehicleId,washing_equipment_id:washId,submitted_by:state.user.id,submitted_by_email:state.user.email||'',inspector_name:inspectorDisplayName(),inspection_date:byId('opsInspectionDate').value||today(),odometer:byId('opsInspectionOdo').value?Number(byId('opsInspectionOdo').value):null,overall_result:hasProblem?'Problem':'Pass',notes:byId('opsInspectionNotes').value.trim()||null};
      const created=await state.sb.from('operations_inspections').insert(insRow).select().single();
      if(created.error)return alert('Inspection was not saved: '+created.error.message);
      const inspectionId=created.data.id;
      const answerInserts=answerRows.map(a=>({inspection_id:inspectionId,checklist_item_id:a.item.id,question_text:a.item.question_text,answer_value:a.answer,answer_number:a.item.response_type==='number'&&a.answer!==''?Number(a.answer):null,is_problem:a.problem,severity:a.item.default_severity||'Medium',notes:a.notes||null}));
      const ans=await state.sb.from('operations_inspection_answers').insert(answerInserts).select();
      if(ans.error){await state.sb.from('operations_inspections').delete().eq('id',inspectionId);return alert('Inspection was not completed because its answers failed to save: '+ans.error.message);}
      if((ans.data||[]).length!==answerInserts.length)return alert('Inspection verification failed: not all checklist answers were returned after save.');
      const taskRows=[];
      (ans.data||[]).forEach(answerRecord=>{
        const source=answerRows.find(a=>a.item.id===answerRecord.checklist_item_id);
        if(!source||!source.problem)return;
        taskRows.push({source_type:'Inspection',source_module:'vehicle_checks',source_record_type:'inspection_answer',source_record_id:answerRecord.id,source_inspection_id:inspectionId,source_answer_id:answerRecord.id,target_type:washId?'washing_equipment':'vehicle',target_record_id:washId||vehicleId,target_label:targetName({vehicle_id:vehicleId,washing_equipment_id:washId}),vehicle_id:vehicleId,washing_equipment_id:washId,title:source.item.default_task_title||source.item.question_text,description:`${source.item.question_text}\nAnswer: ${source.answer}${source.notes?'\nNotes: '+source.notes:''}`,status:'Open',priority:source.item.default_severity||'Medium',created_by:state.user.id,due_date:today(),assigned_role:'Maintenance manager',automatic_key:`vehicle_check_answer:${answerRecord.id}`});
      });
      if(taskRows.length){
        const tr=await state.sb.from('operations_maintenance_tasks').insert(taskRows).select('id');
        if(tr.error)return alert('Inspection answers saved, but the required follow-up task could not be created: '+tr.error.message);
        if((tr.data||[]).length!==taskRows.length)return alert('Inspection task verification failed. Please report this test result.');
      }
      for(const p of itemPhotos)await uploadInspectionPhoto(inspectionId,p.file,p.item.id,p.item.question_text);
      const verify=await state.sb.from('operations_inspections').select('id,overall_result,inspector_name').eq('id',inspectionId).single();
      if(verify.error||!verify.data?.id)return alert('Inspection save verification failed. Please report this test result.');
      state.currentView='vehicle-checks'; await loadAll();
      const fresh=byId('opsInspectionForm');
      if(fresh){fresh.reset();if(byId('opsInspectionDate'))byId('opsInspectionDate').value=today();if(byId('opsInspectorName'))byId('opsInspectorName').value=inspectorDisplayName();}
      alert(`Inspection saved and verified. ${taskRows.length} maintenance task${taskRows.length===1?'':'s'} created.`);
    }finally{if(submit)submit.disabled=false;}
  }

  async function uploadInspectionPhoto'''

s, count = submit_pattern.subn(lambda _: submit_replacement, s, count=1)
if count != 1:
    raise SystemExit(f"Vehicle submitInspection replacement count was {count}, expected 1")
ops.write_text(s, encoding="utf-8")


# Persist the staging-tested Maintenance function + check constraint as a migration,
# but deliberately omit the one-time staging cleanup UPDATE so production history is not rewritten.
workflow = Path(".github/workflows/apply-staging-maintenance-db-fix.yml").read_text(encoding="utf-8")
match = re.search(r"cat > patch\.sql <<'SQL'\n(.*?)\n\s*SQL\n", workflow, re.S)
if not match:
    raise SystemExit("Could not extract staging-tested Maintenance SQL")
sql = textwrap.dedent(match.group(1)).strip()
sql = re.sub(r"\nUPDATE public\.operations_maintenance_tasks AS task.*\Z", "", sql, flags=re.S).rstrip() + "\n"
if "CREATE OR REPLACE FUNCTION public.operations_add_maintenance_record_v4053" not in sql:
    raise SystemExit("Maintenance RPC definition missing from extracted SQL")
if "operations_maintenance_log_items_maintenance_done_check" not in sql:
    raise SystemExit("Maintenance item constraint missing from extracted SQL")
if "UPDATE public.operations_maintenance_tasks AS task" in sql:
    raise SystemExit("Historical Maintenance task cleanup must not be included in permanent migration")

migration = Path("supabase/migrations/20260816_consolidate_validated_maintenance.sql")
migration.parent.mkdir(parents=True, exist_ok=True)
migration.write_text(
    "-- Consolidated from the staging-validated Maintenance DB repair.\n"
    "-- Apply through the normal migration path only. This migration does not rewrite historical task rows.\n\n"
    + sql,
    encoding="utf-8",
)

print("Core validated source transformations prepared.")

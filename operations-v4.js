/* Spray & Wash Operations App V4.0
   Additive module for vehicles, washing equipment, inspections, maintenance tasks,
   preventive schedules, and maintenance guides. Load after config.js, Supabase JS, and app.js.
*/
(function(){
  'use strict';

  const VERSION = '4.0.1';
  const PHOTO_BUCKET = 'inspection-photos';
  const TASK_STATUSES = ['Open','In Progress','Waiting on Parts','Completed','Deferred'];
  const PRIORITIES = ['Low','Medium','High','Critical'];
  const state = {
    sb: null,
    user: null,
    roles: [],
    vehicles: [],
    washEquipment: [],
    templates: [],
    checklistItems: [],
    inspections: [],
    answers: [],
    photos: [],
    procedures: [],
    procedureSteps: [],
    schedules: [],
    tasks: [],
    taskSteps: [],
    parts: [],
    currentView: 'dashboard',
    editingVehicleId: '',
    editingWashId: '',
    openTaskId: '',
    lastError: ''
  };

  function byId(id){ return document.getElementById(id); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
  function today(){ return new Date().toISOString().slice(0,10); }
  function nowIso(){ return new Date().toISOString(); }
  function nzDate(value){ if(!value) return '—'; const d = new Date(String(value).includes('T') ? value : value + 'T00:00:00'); return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString('en-NZ'); }
  function addDays(dateStr, days){ const d = new Date((dateStr || today()) + 'T00:00:00'); d.setDate(d.getDate() + Number(days || 0)); return d.toISOString().slice(0,10); }
  function daysUntil(dateStr){ if(!dateStr) return null; const d = new Date(dateStr + 'T00:00:00'); const n = new Date(today() + 'T00:00:00'); return Math.ceil((d - n) / 86400000); }
  function optionList(values, selected){ return values.map(v => `<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(v)}</option>`).join(''); }
  function roleText(){ return state.roles.length ? state.roles.join(', ') : 'No V4 role loaded'; }
  function isAdmin(){ return state.roles.includes('Admin'); }
  function hasRole(role){ return isAdmin() || state.roles.includes(role); }
  function hasAny(roles){ return isAdmin() || roles.some(r => state.roles.includes(r)); }
  function canView(){ return hasAny(['Inspector','Equipment Manager','Office / Reports','Viewer']); }
  function canSubmit(){ return hasAny(['Inspector','Equipment Manager']); }
  function canManage(){ return hasAny(['Equipment Manager']); }
  function canMaintain(){ return hasAny(['Equipment Manager']); }
  function targetName(taskOrInspection){
    const v = state.vehicles.find(x => x.id === taskOrInspection.vehicle_id);
    const w = state.washEquipment.find(x => x.id === taskOrInspection.washing_equipment_id);
    if(v && w) return `${v.rego || v.name || 'Vehicle'} / ${w.name}`;
    if(w) return w.name;
    if(v) return v.rego || v.name || 'Vehicle';
    return 'Unknown target';
  }
  function targetDueStatus(days){
    if(days === null) return '<span class="ops-pill ops-warn">No history</span>';
    if(days < 0) return `<span class="ops-pill ops-bad">${Math.abs(days)}d overdue</span>`;
    if(days <= 7) return `<span class="ops-pill ops-warn">Due in ${days}d</span>`;
    return `<span class="ops-pill ops-ok">Due in ${days}d</span>`;
  }
  function latestInspectionFor(targetType, id){
    const rows = state.inspections.filter(i => targetType === 'vehicle' ? i.vehicle_id === id : i.washing_equipment_id === id)
      .sort((a,b) => String(b.inspection_date || '').localeCompare(String(a.inspection_date || '')));
    return rows[0] || null;
  }
  function dueDateFor(targetType, item){
    const latest = latestInspectionFor(targetType, item.id);
    if(!latest) return null;
    return addDays(latest.inspection_date, item.inspection_frequency_days || 14);
  }
  function openTasks(){ return state.tasks.filter(t => !['Completed','Deferred'].includes(t.status)); }

  function injectStyles(){
    if(byId('operationsV4Styles')) return;
    const css = `
      #operations.ops-v4 { padding-bottom: 3rem; }
      .ops-shell { max-width: 1200px; margin: 0 auto; }
      .ops-header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1rem; }
      .ops-header h2 { margin:.1rem 0; }
      .ops-subtle { color:#65758b; font-size:.92rem; }
      .ops-nav { display:flex; flex-wrap:wrap; gap:.45rem; margin:1rem 0; }
      .ops-nav button, .ops-btn { border:0; border-radius:.65rem; padding:.62rem .85rem; background:#eef3f7; color:#1f2937; font-weight:700; cursor:pointer; }
      .ops-nav button.active, .ops-btn.primary { background:#1f6feb; color:white; }
      .ops-btn.danger { background:#fee2e2; color:#991b1b; }
      .ops-btn.ghost { background:transparent; border:1px solid #d7dee8; }
      .ops-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; }
      .ops-card { background:white; border:1px solid #dbe3ec; border-radius:1rem; padding:1rem; box-shadow:0 1px 2px rgba(15,23,42,.05); }
      .ops-card h3 { margin-top:0; }
      .ops-stat { font-size:2rem; font-weight:800; line-height:1; }
      .ops-table-wrap { overflow-x:auto; border:1px solid #dbe3ec; border-radius:.9rem; background:white; }
      table.ops-table { width:100%; border-collapse:collapse; min-width:760px; }
      .ops-table th, .ops-table td { text-align:left; padding:.65rem .75rem; border-bottom:1px solid #edf1f5; vertical-align:top; }
      .ops-table th { background:#f8fafc; font-size:.85rem; color:#475569; }
      .ops-pill { display:inline-block; border-radius:999px; padding:.18rem .55rem; font-size:.78rem; font-weight:800; }
      .ops-ok { background:#dcfce7; color:#166534; }
      .ops-warn { background:#fef3c7; color:#92400e; }
      .ops-bad { background:#fee2e2; color:#991b1b; }
      .ops-muted { background:#e5e7eb; color:#374151; }
      .ops-form { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:.8rem; }
      .ops-form label { display:flex; flex-direction:column; gap:.25rem; font-size:.9rem; font-weight:700; color:#344054; }
      .ops-form input, .ops-form select, .ops-form textarea { width:100%; border:1px solid #cfd8e3; border-radius:.6rem; padding:.58rem .65rem; font:inherit; box-sizing:border-box; }
      .ops-form textarea { min-height:90px; }
      .ops-span-2 { grid-column: 1 / -1; }
      .ops-question { border:1px solid #e5ebf2; border-radius:.85rem; padding:.8rem; margin:.65rem 0; background:#fff; }
      .ops-question strong { display:block; margin-bottom:.45rem; }
      .ops-question .ops-form { align-items:end; }
      .ops-actions { display:flex; flex-wrap:wrap; gap:.5rem; margin-top:1rem; }
      .ops-error { border:1px solid #fecaca; background:#fef2f2; color:#991b1b; padding:.8rem; border-radius:.75rem; margin:.8rem 0; }
      .ops-success { border:1px solid #bbf7d0; background:#f0fdf4; color:#166534; padding:.8rem; border-radius:.75rem; margin:.8rem 0; }
      .ops-step { border-left:4px solid #dbe3ec; padding:.7rem .8rem; margin:.55rem 0; background:#f8fafc; border-radius:.5rem; }
      .ops-step h4 { margin:.1rem 0 .35rem; }
      .ops-hidden { display:none !important; }
      @media (max-width: 720px){ .ops-header { flex-direction:column; } .ops-table { min-width:620px; } }
    `;
    const style = document.createElement('style');
    style.id = 'operationsV4Styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectTab(){
    if(byId('operations')) return;
    injectStyles();
    const main = byId('appMain') || document.querySelector('main') || document.body;
    const pane = document.createElement('section');
    pane.id = 'operations';
    pane.className = 'tabpane hidden ops-v4';
    pane.innerHTML = `<div class="ops-shell" id="opsShell"></div>`;
    main.appendChild(pane);

    const btn = document.createElement('button');
    btn.id = 'operationsTabButton';
    btn.className = 'tab';
    btn.type = 'button';
    btn.dataset.tab = 'operations';
    btn.textContent = 'Operations';
    btn.addEventListener('click', () => showOperations());

    const tabParent = document.querySelector('.tabs') || document.querySelector('.tabbar') || document.querySelector('[role="tablist"]') || (byId('dashboard') && document.querySelector('button[data-tab="dashboard"]')?.parentElement);
    if(tabParent) tabParent.appendChild(btn);
    else {
      const top = document.createElement('div');
      top.className = 'ops-nav';
      top.appendChild(btn);
      main.insertBefore(top, pane);
    }
  }

  function showOperations(view){
    state.currentView = view || state.currentView || 'dashboard';
    document.querySelectorAll('.tabpane').forEach(x => x.classList.add('hidden'));
    byId('operations')?.classList.remove('hidden');
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    byId('operationsTabButton')?.classList.add('active');
    render();
    setTimeout(() => window.scrollTo({top:0, behavior:'smooth'}), 10);
  }

  async function initSupabase(){
    if(!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
      state.lastError = 'Supabase config not loaded. Keep your existing V3.4 config.js and load operations-v4.js after it.';
      render();
      return;
    }
    state.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    state.sb.auth.onAuthStateChange(async (_event, session) => {
      state.user = session?.user || null;
      await refreshAuthAndData();
    });
    const { data } = await state.sb.auth.getSession();
    state.user = data?.session?.user || null;
    await refreshAuthAndData();
  }

  async function refreshAuthAndData(){
    if(!state.sb) return;
    state.lastError = '';
    if(!state.user){ state.roles = []; render(); return; }
    await loadRoles();
    await loadAll();
  }

  async function loadRoles(){
    state.roles = [];
    const r = await state.sb.from('user_roles').select('role').eq('user_id', state.user.id).order('role');
    if(!r.error) state.roles = (r.data || []).map(x => x.role).filter(Boolean);
  }

  async function loadTable(table, select='*', order){
    let q = state.sb.from(table).select(select);
    if(order) q = q.order(order.column, { ascending: order.ascending ?? true });
    const r = await q;
    if(r.error){ throw new Error(`${table}: ${r.error.message}`); }
    return r.data || [];
  }

  async function loadAll(){
    if(!state.user || !canView()) { render(); return; }
    try{
      const [vehicles, washEquipment, templates, checklistItems, inspections, answers, photos, procedures, procedureSteps, schedules, tasks, taskSteps, parts] = await Promise.all([
        loadTable('operations_vehicles','*',{column:'rego'}),
        loadTable('operations_washing_equipment','*',{column:'name'}),
        loadTable('operations_checklist_templates','*',{column:'name'}),
        loadTable('operations_checklist_items','*',{column:'sort_order'}),
        loadTable('operations_inspections','*',{column:'inspection_date', ascending:false}),
        loadTable('operations_inspection_answers','*',{column:'created_at', ascending:false}),
        loadTable('operations_inspection_photos','*',{column:'created_at', ascending:false}),
        loadTable('operations_maintenance_procedures','*',{column:'name'}),
        loadTable('operations_maintenance_procedure_steps','*',{column:'step_number'}),
        loadTable('operations_equipment_maintenance_schedules','*',{column:'next_due_at'}),
        loadTable('operations_maintenance_tasks','*',{column:'created_at', ascending:false}),
        loadTable('operations_maintenance_task_steps','*',{column:'created_at', ascending:false}),
        loadTable('operations_maintenance_parts_used','*',{column:'created_at', ascending:false})
      ]);
      Object.assign(state,{vehicles,washEquipment,templates,checklistItems,inspections,answers,photos,procedures,procedureSteps,schedules,tasks,taskSteps,parts});
      render();
    }catch(err){
      state.lastError = `V4 tables are not ready or access is blocked. Run supabase-schema-v4.0-operations.sql first. Details: ${err.message}`;
      render();
    }
  }

  function render(){
    const shell = byId('opsShell');
    if(!shell) return;
    shell.innerHTML = headerHtml() + (state.lastError ? `<div class="ops-error">${esc(state.lastError)}</div>` : '') + bodyHtml();
    bindRenderedEvents();
  }

  function headerHtml(){
    return `
      <div class="ops-header">
        <div>
          <h2>Spray &amp; Wash Operations</h2>
          <div class="ops-subtle">V${VERSION} vehicle, washing equipment, inspection and maintenance module.</div>
        </div>
        <div class="ops-subtle">${state.user ? `Signed in as ${esc(state.user.email)}<br>Roles: ${esc(roleText())}` : 'Sign in to use Operations.'}</div>
      </div>
      <div class="ops-nav" id="opsNav">
        ${navButton('dashboard','Dashboard')}
        ${navButton('vehicles','Vehicles')}
        ${navButton('washing','Washing Equipment')}
        ${navButton('inspection','New Inspection')}
        ${navButton('history','Inspection History')}
        ${navButton('maintenance','Maintenance')}
        ${navButton('schedules','Preventive Maintenance')}
        ${navButton('guides','Guides')}
      </div>`;
  }
  function navButton(id, label){ return `<button type="button" class="${state.currentView===id?'active':''}" data-ops-view="${id}">${label}</button>`; }

  function bodyHtml(){
    if(!state.user) return `<div class="ops-card"><h3>Sign in required</h3><p>Use the existing V3.4 sign-in area first, then open this Operations tab.</p></div>`;
    if(!canView()) return `<div class="ops-card"><h3>No Operations access yet</h3><p>Your account needs one of these existing roles: Admin, Inspector, Equipment Manager, Office / Reports, or Viewer.</p></div>`;
    if(state.currentView === 'vehicles') return vehiclesHtml();
    if(state.currentView === 'washing') return washingHtml();
    if(state.currentView === 'inspection') return inspectionHtml();
    if(state.currentView === 'history') return historyHtml();
    if(state.currentView === 'maintenance') return maintenanceHtml();
    if(state.currentView === 'schedules') return schedulesHtml();
    if(state.currentView === 'guides') return guidesHtml();
    return dashboardHtml();
  }

  function dashboardHtml(){
    const vehicleDue = state.vehicles.filter(v => v.status === 'Active').filter(v => { const d = daysUntil(dueDateFor('vehicle',v)); return d === null || d <= 0; });
    const washDue = state.washEquipment.filter(w => ['Active','Quarantined'].includes(w.status)).filter(w => { const d = daysUntil(dueDateFor('washing_equipment',w)); return d === null || d <= 0; });
    const open = openTasks();
    const waiting = state.tasks.filter(t => t.status === 'Waiting on Parts');
    const scheduledDue = state.schedules.filter(s => s.is_active !== false).filter(s => scheduleIsDue(s));
    return `
      <div class="ops-grid">
        ${statCard('Vehicles due/overdue', vehicleDue.length, 'Fortnightly vehicle checks needing action')}
        ${statCard('Washing gear due/overdue', washDue.length, 'Water blasters, pumps and gear needing checks')}
        ${statCard('Open maintenance', open.length, 'Reactive, scheduled and manual tasks')}
        ${statCard('Waiting on parts', waiting.length, 'Tasks blocked by parts or supplies')}
        ${statCard('Preventive services due', scheduledDue.length, 'Scheduled engine/pump/gear maintenance')}
      </div>
      <div class="ops-grid" style="margin-top:1rem">
        <div class="ops-card"><h3>Overdue / due inspections</h3>${dueListHtml()}</div>
        <div class="ops-card"><h3>Open maintenance items</h3>${taskMiniListHtml(open.slice(0,8))}</div>
      </div>`;
  }
  function statCard(title, value, note){ return `<div class="ops-card"><div class="ops-subtle">${esc(title)}</div><div class="ops-stat">${esc(value)}</div><div class="ops-subtle">${esc(note)}</div></div>`; }
  function dueListHtml(){
    const rows = [];
    state.vehicles.filter(v=>v.status==='Active').forEach(v => rows.push({type:'Vehicle', name:v.rego || v.name, due:dueDateFor('vehicle',v)}));
    state.washEquipment.filter(w=>['Active','Quarantined'].includes(w.status)).forEach(w => rows.push({type:'Washing equipment', name:w.name, due:dueDateFor('washing_equipment',w)}));
    rows.sort((a,b)=> (a.due || '').localeCompare(b.due || '')).splice(10);
    if(!rows.length) return '<p class="ops-subtle">No registered active items yet.</p>';
    return `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Type</th><th>Item</th><th>Due</th><th>Status</th></tr>${rows.map(r=>`<tr><td>${esc(r.type)}</td><td>${esc(r.name || 'Unnamed')}</td><td>${nzDate(r.due)}</td><td>${targetDueStatus(daysUntil(r.due))}</td></tr>`).join('')}</table></div>`;
  }

  function vehiclesHtml(){
    return `
      <div class="ops-card">
        <h3>${state.editingVehicleId ? 'Edit vehicle' : 'Add vehicle'}</h3>
        ${canManage() ? vehicleFormHtml() : '<p class="ops-subtle">Read-only. Ask an Admin or Equipment Manager to edit vehicles.</p>'}
      </div>
      <div class="ops-card" style="margin-top:1rem"><h3>Vehicle register</h3>${vehicleTableHtml()}</div>`;
  }
  function vehicleFormHtml(){
    const v = state.vehicles.find(x=>x.id===state.editingVehicleId) || {};
    return `<form id="opsVehicleForm" class="ops-form">
      <input type="hidden" id="opsVehicleId" value="${esc(v.id||'')}">
      <label>Rego *<input id="opsVehicleRego" required value="${esc(v.rego||'')}"></label>
      <label>Name<input id="opsVehicleName" value="${esc(v.name||'')}"></label>
      <label>Make/model<input id="opsVehicleMake" value="${esc(v.make_model||'')}"></label>
      <label>Year<input id="opsVehicleYear" type="number" value="${esc(v.year||'')}"></label>
      <label>Status<select id="opsVehicleStatus">${optionList(['Active','Inactive','Sold','Retired'], v.status||'Active')}</select></label>
      <label>Assigned driver<input id="opsVehicleDriver" value="${esc(v.assigned_driver||'')}"></label>
      <label>Inspection frequency days<input id="opsVehicleFreq" type="number" min="1" value="${esc(v.inspection_frequency_days||14)}"></label>
      <label class="ops-span-2">Notes<textarea id="opsVehicleNotes">${esc(v.notes||'')}</textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save vehicle</button><button class="ops-btn ghost" type="button" data-ops-action="clearVehicle">Clear</button></div>
    </form>`;
  }
  function vehicleTableHtml(){
    if(!state.vehicles.length) return '<p class="ops-subtle">No vehicles added yet.</p>';
    return `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Rego</th><th>Name</th><th>Status</th><th>Last inspection</th><th>Next due</th><th>Actions</th></tr>${state.vehicles.map(v=>{ const latest=latestInspectionFor('vehicle',v.id); const due=dueDateFor('vehicle',v); return `<tr><td><strong>${esc(v.rego)}</strong></td><td>${esc(v.name||v.make_model||'')}</td><td>${statusPill(v.status)}</td><td>${latest?nzDate(latest.inspection_date):'—'}</td><td>${nzDate(due)} ${targetDueStatus(daysUntil(due))}</td><td>${canManage()?`<button class="ops-btn ghost" data-ops-edit-vehicle="${v.id}">Edit</button>`:''}</td></tr>`; }).join('')}</table></div>`;
  }

  function washingHtml(){
    return `
      <div class="ops-card">
        <h3>${state.editingWashId ? 'Edit washing equipment' : 'Add washing equipment'}</h3>
        ${canManage() ? washingFormHtml() : '<p class="ops-subtle">Read-only. Ask an Admin or Equipment Manager to edit washing equipment.</p>'}
      </div>
      <div class="ops-card" style="margin-top:1rem"><h3>Washing equipment register</h3>${washingTableHtml()}</div>`;
  }
  function washingFormHtml(){
    const w = state.washEquipment.find(x=>x.id===state.editingWashId) || {};
    return `<form id="opsWashingForm" class="ops-form">
      <input type="hidden" id="opsWashId" value="${esc(w.id||'')}">
      <label>Name *<input id="opsWashName" required value="${esc(w.name||'')}"></label>
      <label>Type<input id="opsWashType" value="${esc(w.equipment_type||'Water Blaster')}"></label>
      <label>Serial number<input id="opsWashSerial" value="${esc(w.serial_number||'')}"></label>
      <label>Assigned vehicle<select id="opsWashVehicle"><option value="">Not assigned</option>${state.vehicles.map(v=>`<option value="${v.id}" ${v.id===w.assigned_vehicle_id?'selected':''}>${esc(v.rego || v.name)}</option>`).join('')}</select></label>
      <label>Status<select id="opsWashStatus">${optionList(['Active','Inactive','Retired','Quarantined'], w.status||'Active')}</select></label>
      <label>Inspection frequency days<input id="opsWashFreq" type="number" min="1" value="${esc(w.inspection_frequency_days||14)}"></label>
      <label>Engine make/model<input id="opsWashEngine" value="${esc(w.engine_make_model||'')}"></label>
      <label>Pump make/model<input id="opsWashPump" value="${esc(w.pump_make_model||'')}"></label>
      <label>Has hour meter?<select id="opsWashHourMeter">${optionList(['No','Yes'], w.has_hour_meter?'Yes':'No')}</select></label>
      <label>Current engine hours<input id="opsWashEngineHours" type="number" step="0.1" value="${esc(w.current_engine_hours||'')}"></label>
      <label>Current pump hours<input id="opsWashPumpHours" type="number" step="0.1" value="${esc(w.current_pump_hours||'')}"></label>
      <label class="ops-span-2">Notes<textarea id="opsWashNotes">${esc(w.notes||'')}</textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save washing equipment</button><button class="ops-btn ghost" type="button" data-ops-action="clearWash">Clear</button></div>
    </form>`;
  }
  function washingTableHtml(){
    if(!state.washEquipment.length) return '<p class="ops-subtle">No washing equipment added yet.</p>';
    return `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Name</th><th>Type</th><th>Vehicle</th><th>Status</th><th>Engine / pump</th><th>Next due</th><th>Actions</th></tr>${state.washEquipment.map(w=>{ const v=state.vehicles.find(x=>x.id===w.assigned_vehicle_id); const due=dueDateFor('washing_equipment',w); return `<tr><td><strong>${esc(w.name)}</strong><br><span class="ops-subtle">${esc(w.serial_number||'')}</span></td><td>${esc(w.equipment_type)}</td><td>${esc(v?.rego || v?.name || '—')}</td><td>${statusPill(w.status)}</td><td>${esc(w.engine_make_model||'—')}<br><span class="ops-subtle">${esc(w.pump_make_model||'—')}</span></td><td>${nzDate(due)} ${targetDueStatus(daysUntil(due))}</td><td>${canManage()?`<button class="ops-btn ghost" data-ops-edit-wash="${w.id}">Edit</button>`:''}</td></tr>`; }).join('')}</table></div>`;
  }

  function inspectionHtml(){
    if(!canSubmit()) return '<div class="ops-card"><h3>New inspection</h3><p>Your role can view Operations, but cannot submit inspections.</p></div>';
    const defaultTemplate = state.templates.find(t=>t.name==='Periodic Vehicle Checks - Google Form') || state.templates.find(t=>t.target_type==='washing_equipment') || state.templates[0] || {};
    return `<div class="ops-card"><h3>New fortnightly inspection</h3>${inspectionFormHtml(defaultTemplate.id || '')}</div>`;
  }
  function inspectionFormHtml(templateId){
    const template = state.templates.find(t => t.id === templateId) || state.templates[0] || {};
    const type = template.target_type || 'washing_equipment';
    return `<form id="opsInspectionForm" class="ops-form">
      <label>Inspection template<select id="opsInspectionTemplate">${state.templates.filter(t=>t.is_active!==false).map(t=>`<option value="${t.id}" ${t.id===template.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label>Inspection date<input id="opsInspectionDate" type="date" value="${today()}"></label>
      <label>Inspector name<input id="opsInspectorName" value="${esc(state.user?.email?.split('@')[0] || '')}"></label>
      ${['vehicle','combined'].includes(type) ? `<label>Vehicle<select id="opsInspectionVehicle">${state.vehicles.filter(v=>v.status==='Active').map(v=>`<option value="${v.id}">${esc(v.rego || v.name)}</option>`).join('')}</select></label>` : ''}
      ${['washing_equipment','combined'].includes(type) ? `<label>Washing equipment<select id="opsInspectionWash">${state.washEquipment.filter(w=>['Active','Quarantined'].includes(w.status)).map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>` : ''}
      <label>Odometer<input id="opsInspectionOdo" type="number" step="0.1"></label>
      <label>Engine hours<input id="opsInspectionEngineHours" type="number" step="0.1"></label>
      <label>Pump hours<input id="opsInspectionPumpHours" type="number" step="0.1"></label>
      <label class="ops-span-2">General notes<textarea id="opsInspectionNotes"></textarea></label>
      <div class="ops-span-2"><h3>Checklist</h3>${checklistQuestionsHtml(template.id)}</div>
      <label class="ops-span-2">Photos<input id="opsInspectionPhotos" type="file" accept="image/*" multiple></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Submit inspection</button></div>
    </form>`;
  }
  function checklistQuestionsHtml(templateId){
    const items = state.checklistItems.filter(i=>i.template_id===templateId && i.is_active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    if(!items.length) return '<p class="ops-subtle">No checklist questions found. Run the V4 SQL seed or add checklist items in Supabase.</p>';
    return items.map(item => `<div class="ops-question" data-item-id="${item.id}">
      <strong>${esc(item.section || 'Checklist')} · ${esc(item.question_text)}</strong>
      ${item.help_text ? `<div class="ops-subtle">${esc(item.help_text)}</div>` : ''}
      <div class="ops-form">
        <label>Answer${answerInputHtml(item)}</label>
        <label>Notes<input class="ops-answer-notes" placeholder="Notes if needed"></label>
      </div>
    </div>`).join('');
  }
  function answerInputHtml(item){
    const type = item.response_type;
    if(type === 'number') return `<input class="ops-answer-value" type="number" step="0.1" ${item.required?'required':''}>`;
    if(type === 'text') return `<input class="ops-answer-value" ${item.required?'required':''}>`;
    let opts = ['Pass','Fail','N/A'];
    if(type === 'pass_fail') opts = ['Pass','Fail'];
    if(type === 'yes_no') opts = ['No','Yes'];
    if(type === 'choice' && Array.isArray(item.response_options) && item.response_options.length) opts = item.response_options;
    return `<select class="ops-answer-value" ${item.required?'required':''}>${opts.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
  }

  function historyHtml(){
    const rows = state.inspections.slice(0,100);
    if(!rows.length) return '<div class="ops-card"><h3>Inspection history</h3><p>No Operations inspections submitted yet.</p></div>';
    return `<div class="ops-card"><h3>Inspection history</h3><div class="ops-table-wrap"><table class="ops-table"><tr><th>Date</th><th>Target</th><th>Inspector</th><th>Result</th><th>Problems</th><th>Notes</th></tr>${rows.map(i=>{ const problems=state.answers.filter(a=>a.inspection_id===i.id && a.is_problem).length; return `<tr><td>${nzDate(i.inspection_date)}</td><td>${esc(targetName(i))}</td><td>${esc(i.inspector_name||i.submitted_by_email||'')}</td><td>${statusPill(i.overall_result)}</td><td>${problems}</td><td>${esc(i.notes||'')}</td></tr>`; }).join('')}</table></div></div>`;
  }

  function maintenanceHtml(){
    return `<div class="ops-card"><h3>Maintenance to-do list</h3>${canMaintain()?manualTaskFormHtml():''}${taskTableHtml()}</div>${state.openTaskId ? taskDetailHtml(state.openTaskId) : ''}`;
  }
  function manualTaskFormHtml(){
    return `<details><summary><strong>Add manual maintenance task</strong></summary><form id="opsManualTaskForm" class="ops-form" style="margin-top:.8rem">
      <label>Target type<select id="opsManualTargetType"><option value="washing_equipment">Washing equipment</option><option value="vehicle">Vehicle</option></select></label>
      <label>Washing equipment<select id="opsManualWash"><option value="">None</option>${state.washEquipment.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>
      <label>Vehicle<select id="opsManualVehicle"><option value="">None</option>${state.vehicles.map(v=>`<option value="${v.id}">${esc(v.rego || v.name)}</option>`).join('')}</select></label>
      <label>Title<input id="opsManualTitle" required></label>
      <label>Priority<select id="opsManualPriority">${optionList(PRIORITIES,'Medium')}</select></label>
      <label>Due date<input id="opsManualDue" type="date"></label>
      <label class="ops-span-2">Description<textarea id="opsManualDescription"></textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Create task</button></div>
    </form></details>`;
  }
  function taskMiniListHtml(rows){
    if(!rows.length) return '<p class="ops-subtle">No open maintenance items.</p>';
    return rows.map(t=>`<div class="ops-step"><strong>${esc(t.title)}</strong><br>${statusPill(t.status)} ${statusPill(t.priority)}<br><span class="ops-subtle">${esc(targetName(t))} · Due ${nzDate(t.due_date)}</span></div>`).join('');
  }
  function taskTableHtml(){
    const rows = state.tasks.slice().sort((a,b)=> statusRank(a.status)-statusRank(b.status) || String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')));
    if(!rows.length) return '<p class="ops-subtle">No maintenance tasks yet.</p>';
    return `<div class="ops-table-wrap" style="margin-top:1rem"><table class="ops-table"><tr><th>Status</th><th>Priority</th><th>Task</th><th>Target</th><th>Source</th><th>Due</th><th>Actions</th></tr>${rows.map(t=>`<tr><td>${statusPill(t.status)}</td><td>${statusPill(t.priority)}</td><td><strong>${esc(t.title)}</strong><br><span class="ops-subtle">${esc(t.description||'')}</span></td><td>${esc(targetName(t))}</td><td>${esc(t.source_type)}</td><td>${nzDate(t.due_date)}</td><td><button class="ops-btn ghost" data-ops-open-task="${t.id}">Open</button></td></tr>`).join('')}</table></div>`;
  }
  function statusRank(s){ return {'Open':0,'In Progress':1,'Waiting on Parts':2,'Deferred':3,'Completed':4}[s] ?? 5; }

  function taskDetailHtml(taskId){
    const t = state.tasks.find(x=>x.id===taskId); if(!t) return '';
    const proc = state.procedures.find(p=>p.id===t.procedure_id);
    const steps = state.procedureSteps.filter(s=>s.procedure_id===t.procedure_id).sort((a,b)=>a.step_number-b.step_number);
    return `<div class="ops-card" style="margin-top:1rem"><h3>${esc(t.title)}</h3>
      <p>${statusPill(t.status)} ${statusPill(t.priority)} <span class="ops-subtle">${esc(targetName(t))}</span></p>
      ${proc ? `<h3>Guide: ${esc(proc.name)}</h3><p>${esc(proc.description||'')}</p><p><strong>Safety:</strong> ${esc(proc.safety_summary||'')}</p><p><strong>Tools:</strong> ${esc(proc.tools_required||'')}</p><p><strong>Parts:</strong> ${esc(proc.parts_required||'')}</p>` : ''}
      ${steps.length ? `<form id="opsTaskCompleteForm" class="ops-form"><div class="ops-span-2">${steps.map(s=>`<div class="ops-step"><label><input type="checkbox" class="ops-task-step" value="${s.id}"> <strong>${s.step_number}. ${esc(s.title)}</strong></label><p>${esc(s.instruction)}</p>${s.safety_note?`<p class="ops-subtle"><strong>Safety:</strong> ${esc(s.safety_note)}</p>`:''}</div>`).join('')}</div>
        <label>New status<select id="opsTaskStatus">${optionList(TASK_STATUSES,t.status)}</select></label>
        <label>Completed engine hours<input id="opsTaskEngineHours" type="number" step="0.1" value="${esc(t.completed_engine_hours||'')}"></label>
        <label>Completed pump hours<input id="opsTaskPumpHours" type="number" step="0.1" value="${esc(t.completed_pump_hours||'')}"></label>
        <label class="ops-span-2">Completion / status notes<textarea id="opsTaskNotes">${esc(t.completion_notes||'')}</textarea></label>
        <label class="ops-span-2">Parts used, one per line<textarea id="opsTaskParts" placeholder="Engine oil - 0.6 L\nSpark plug - 1"></textarea></label>
        <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save task update</button><button class="ops-btn ghost" type="button" data-ops-action="closeTask">Close</button></div>
      </form>` : taskStatusFormHtml(t)}
    </div>`;
  }
  function taskStatusFormHtml(t){
    return `<form id="opsTaskSimpleForm" class="ops-form">
      <label>Status<select id="opsTaskStatus">${optionList(TASK_STATUSES,t.status)}</select></label>
      <label>Priority<select id="opsTaskPriority">${optionList(PRIORITIES,t.priority)}</select></label>
      <label class="ops-span-2">Notes<textarea id="opsTaskNotes">${esc(t.completion_notes||'')}</textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save task update</button><button class="ops-btn ghost" type="button" data-ops-action="closeTask">Close</button></div>
    </form>`;
  }

  function schedulesHtml(){
    return `<div class="ops-card"><h3>Preventive maintenance schedules</h3>${canMaintain()?scheduleFormHtml():''}${scheduleTableHtml()}${canMaintain()?'<div class="ops-actions"><button class="ops-btn primary" data-ops-action="generateDueTasks">Generate due tasks</button></div>':''}</div>`;
  }
  function scheduleFormHtml(){
    return `<details><summary><strong>Add/update schedule</strong></summary><form id="opsScheduleForm" class="ops-form" style="margin-top:.8rem">
      <label>Washing equipment<select id="opsScheduleWash" required>${state.washEquipment.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>
      <label>Procedure<select id="opsScheduleProcedure" required>${state.procedures.filter(p=>p.is_active!==false).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <label>Frequency days<input id="opsScheduleFreqDays" type="number" min="1" placeholder="e.g. 180"></label>
      <label>Frequency hours<input id="opsScheduleFreqHours" type="number" step="0.1" placeholder="e.g. 50"></label>
      <label>Next due date<input id="opsScheduleNextDate" type="date"></label>
      <label>Next due hours<input id="opsScheduleNextHours" type="number" step="0.1"></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save schedule</button></div>
    </form></details>`;
  }
  function scheduleTableHtml(){
    if(!state.schedules.length) return '<p class="ops-subtle">No preventive maintenance schedules yet.</p>';
    return `<div class="ops-table-wrap" style="margin-top:1rem"><table class="ops-table"><tr><th>Equipment</th><th>Procedure</th><th>Frequency</th><th>Next due</th><th>Status</th></tr>${state.schedules.map(s=>{ const w=state.washEquipment.find(x=>x.id===s.washing_equipment_id); const p=state.procedures.find(x=>x.id===s.procedure_id); return `<tr><td>${esc(w?.name||'Unknown')}</td><td>${esc(p?.name||'Unknown')}</td><td>${esc(s.frequency_days||'—')} days / ${esc(s.frequency_hours||'—')} hrs</td><td>${nzDate(s.next_due_at)}${s.next_due_hours?` / ${esc(s.next_due_hours)} hrs`:''}</td><td>${scheduleIsDue(s)?'<span class="ops-pill ops-bad">Due</span>':'<span class="ops-pill ops-ok">Scheduled</span>'}</td></tr>`; }).join('')}</table></div>`;
  }
  function scheduleIsDue(s){
    if(s.is_active === false) return false;
    const dueByDate = s.next_due_at && daysUntil(s.next_due_at) <= 0;
    const w = state.washEquipment.find(x=>x.id===s.washing_equipment_id);
    const currentHours = Number(w?.current_engine_hours ?? w?.current_pump_hours ?? 0);
    const dueByHours = s.next_due_hours && currentHours && Number(currentHours) >= Number(s.next_due_hours);
    return !!(dueByDate || dueByHours);
  }

  function guidesHtml(){
    if(!state.procedures.length) return '<div class="ops-card"><h3>Maintenance guides</h3><p>No guides found. Run the V4 SQL seed.</p></div>';
    return `<div class="ops-card"><h3>Maintenance guides</h3><p class="ops-subtle">General guide templates. Confirm exact service intervals, oil types, quantities, spark plug specs and torque settings from the actual engine/pump manuals before relying on these.</p>${state.procedures.map(p=>guideCardHtml(p)).join('')}</div>`;
  }
  function guideCardHtml(p){
    const steps = state.procedureSteps.filter(s=>s.procedure_id===p.id).sort((a,b)=>a.step_number-b.step_number);
    return `<details class="ops-step"><summary><strong>${esc(p.name)}</strong> · ${esc(p.category)} · ${esc(p.skill_level)}</summary><p>${esc(p.description||'')}</p><p><strong>Safety:</strong> ${esc(p.safety_summary||'')}</p><p><strong>Tools:</strong> ${esc(p.tools_required||'')}</p><p><strong>Parts:</strong> ${esc(p.parts_required||'')}</p>${steps.map(s=>`<div class="ops-step"><h4>${s.step_number}. ${esc(s.title)}</h4><p>${esc(s.instruction)}</p>${s.safety_note?`<p class="ops-subtle"><strong>Safety:</strong> ${esc(s.safety_note)}</p>`:''}</div>`).join('')}</details>`;
  }

  function statusPill(value){
    const v = String(value || '—');
    const cls = ['Pass','Active','Completed','Low'].includes(v) ? 'ops-ok' : ['Problem','Fail','Quarantined','Open','High','Critical'].includes(v) ? 'ops-bad' : ['In Progress','Waiting on Parts','Medium'].includes(v) ? 'ops-warn' : 'ops-muted';
    return `<span class="ops-pill ${cls}">${esc(v)}</span>`;
  }

  function bindRenderedEvents(){
    byId('opsNav')?.querySelectorAll('[data-ops-view]').forEach(btn => btn.addEventListener('click', () => { state.currentView = btn.dataset.opsView; state.openTaskId=''; render(); }));
    byId('opsVehicleForm')?.addEventListener('submit', saveVehicle);
    byId('opsWashingForm')?.addEventListener('submit', saveWashing);
    byId('opsInspectionTemplate')?.addEventListener('change', e => { byId('opsInspectionForm').outerHTML = inspectionFormHtml(e.target.value); bindRenderedEvents(); });
    byId('opsInspectionForm')?.addEventListener('submit', submitInspection);
    byId('opsManualTaskForm')?.addEventListener('submit', createManualTask);
    byId('opsTaskCompleteForm')?.addEventListener('submit', saveTaskUpdate);
    byId('opsTaskSimpleForm')?.addEventListener('submit', saveTaskUpdate);
    byId('opsScheduleForm')?.addEventListener('submit', saveSchedule);
    document.querySelectorAll('[data-ops-edit-vehicle]').forEach(b => b.addEventListener('click', () => { state.editingVehicleId = b.dataset.opsEditVehicle; render(); }));
    document.querySelectorAll('[data-ops-edit-wash]').forEach(b => b.addEventListener('click', () => { state.editingWashId = b.dataset.opsEditWash; render(); }));
    document.querySelectorAll('[data-ops-open-task]').forEach(b => b.addEventListener('click', () => { state.openTaskId = b.dataset.opsOpenTask; render(); }));
    document.querySelectorAll('[data-ops-action]').forEach(b => b.addEventListener('click', () => handleAction(b.dataset.opsAction)));
  }
  async function handleAction(action){
    if(action === 'clearVehicle'){ state.editingVehicleId=''; render(); }
    if(action === 'clearWash'){ state.editingWashId=''; render(); }
    if(action === 'closeTask'){ state.openTaskId=''; render(); }
    if(action === 'generateDueTasks'){ await generateDueTasks(); }
  }

  async function saveVehicle(e){
    e.preventDefault(); if(!canManage()) return alert('Only Admin or Equipment Manager users can save vehicles.');
    const id = byId('opsVehicleId').value;
    const row = {
      rego: byId('opsVehicleRego').value.trim(),
      name: byId('opsVehicleName').value.trim() || null,
      make_model: byId('opsVehicleMake').value.trim() || null,
      year: byId('opsVehicleYear').value ? Number(byId('opsVehicleYear').value) : null,
      status: byId('opsVehicleStatus').value,
      assigned_driver: byId('opsVehicleDriver').value.trim() || null,
      inspection_frequency_days: Number(byId('opsVehicleFreq').value || 14),
      notes: byId('opsVehicleNotes').value.trim() || null,
      created_by: state.user.id
    };
    if(!row.rego) return alert('Rego is required.');
    const r = id ? await state.sb.from('operations_vehicles').update(row).eq('id', id) : await state.sb.from('operations_vehicles').insert(row);
    if(r.error) return alert(r.error.message);
    state.editingVehicleId=''; await loadAll();
  }

  async function saveWashing(e){
    e.preventDefault(); if(!canManage()) return alert('Only Admin or Equipment Manager users can save washing equipment.');
    const id = byId('opsWashId').value;
    const row = {
      name: byId('opsWashName').value.trim(),
      equipment_type: byId('opsWashType').value.trim() || 'Water Blaster',
      serial_number: byId('opsWashSerial').value.trim() || null,
      assigned_vehicle_id: byId('opsWashVehicle').value || null,
      status: byId('opsWashStatus').value,
      inspection_frequency_days: Number(byId('opsWashFreq').value || 14),
      engine_make_model: byId('opsWashEngine').value.trim() || null,
      pump_make_model: byId('opsWashPump').value.trim() || null,
      has_hour_meter: byId('opsWashHourMeter').value === 'Yes',
      current_engine_hours: byId('opsWashEngineHours').value ? Number(byId('opsWashEngineHours').value) : null,
      current_pump_hours: byId('opsWashPumpHours').value ? Number(byId('opsWashPumpHours').value) : null,
      notes: byId('opsWashNotes').value.trim() || null,
      created_by: state.user.id
    };
    if(!row.name) return alert('Name is required.');
    const r = id ? await state.sb.from('operations_washing_equipment').update(row).eq('id', id) : await state.sb.from('operations_washing_equipment').insert(row);
    if(r.error) return alert(r.error.message);
    state.editingWashId=''; await loadAll();
  }

  function itemIsProblem(item, answer){
    const problems = Array.isArray(item.problem_values) ? item.problem_values : [];
    return problems.map(String).includes(String(answer));
  }

  async function submitInspection(e){
    e.preventDefault(); if(!canSubmit()) return alert('Your role cannot submit Operations inspections.');
    const template = state.templates.find(t=>t.id===byId('opsInspectionTemplate').value);
    if(!template) return alert('Choose an inspection template.');
    const targetType = template.target_type;
    const vehicleId = byId('opsInspectionVehicle')?.value || null;
    const washId = byId('opsInspectionWash')?.value || null;
    const answerRows = [];
    let hasProblem = false;
    document.querySelectorAll('.ops-question').forEach(q => {
      const item = state.checklistItems.find(i=>i.id===q.dataset.itemId);
      if(!item) return;
      const answer = q.querySelector('.ops-answer-value')?.value || '';
      const notes = q.querySelector('.ops-answer-notes')?.value || '';
      const problem = itemIsProblem(item, answer);
      if(problem) hasProblem = true;
      answerRows.push({ item, answer, notes, problem });
    });
    const insRow = {
      template_id: template.id,
      target_type: targetType,
      vehicle_id: vehicleId,
      washing_equipment_id: washId,
      submitted_by: state.user.id,
      submitted_by_email: state.user.email || '',
      inspector_name: byId('opsInspectorName').value.trim() || null,
      inspection_date: byId('opsInspectionDate').value || today(),
      odometer: byId('opsInspectionOdo').value ? Number(byId('opsInspectionOdo').value) : null,
      engine_hours: byId('opsInspectionEngineHours').value ? Number(byId('opsInspectionEngineHours').value) : null,
      pump_hours: byId('opsInspectionPumpHours').value ? Number(byId('opsInspectionPumpHours').value) : null,
      overall_result: hasProblem ? 'Problem' : 'Pass',
      notes: byId('opsInspectionNotes').value.trim() || null
    };
    const created = await state.sb.from('operations_inspections').insert(insRow).select().single();
    if(created.error) return alert(created.error.message);
    const inspectionId = created.data.id;
    const answerInserts = answerRows.map(a => ({
      inspection_id: inspectionId,
      checklist_item_id: a.item.id,
      question_text: a.item.question_text,
      answer_value: a.answer,
      answer_number: a.item.response_type === 'number' && a.answer !== '' ? Number(a.answer) : null,
      is_problem: a.problem,
      severity: a.item.default_severity || 'Medium',
      notes: a.notes || null
    }));
    const ans = await state.sb.from('operations_inspection_answers').insert(answerInserts).select();
    if(ans.error) return alert('Inspection saved, but answers failed: ' + ans.error.message);

    const taskRows = [];
    (ans.data || []).forEach(answerRecord => {
      const source = answerRows.find(a => a.item.id === answerRecord.checklist_item_id);
      if(!source || !source.problem || !source.item.creates_task_on_problem) return;
      taskRows.push({
        source_type: 'Inspection',
        source_inspection_id: inspectionId,
        source_answer_id: answerRecord.id,
        target_type: targetType,
        vehicle_id: vehicleId,
        washing_equipment_id: washId,
        title: source.item.default_task_title || source.item.question_text,
        description: `${source.item.question_text}\nAnswer: ${source.answer}${source.notes ? '\nNotes: ' + source.notes : ''}`,
        status: 'Open',
        priority: source.item.default_severity || 'Medium',
        created_by: state.user.id,
        due_date: today()
      });
    });
    if(taskRows.length){
      const tr = await state.sb.from('operations_maintenance_tasks').insert(taskRows);
      if(tr.error) alert('Inspection saved, but task generation failed: ' + tr.error.message);
    }

    const files = Array.from(byId('opsInspectionPhotos')?.files || []);
    for(const file of files){ await uploadInspectionPhoto(inspectionId, file); }

    if(washId && (insRow.engine_hours !== null || insRow.pump_hours !== null)){
      await state.sb.from('operations_washing_equipment').update({
        current_engine_hours: insRow.engine_hours,
        current_pump_hours: insRow.pump_hours
      }).eq('id', washId);
    }

    alert(`Inspection saved. ${taskRows.length} maintenance task${taskRows.length===1?'':'s'} created.`);
    state.currentView = 'history';
    await loadAll();
  }

  async function uploadInspectionPhoto(inspectionId, file){
    const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `operations-inspections/${inspectionId}/${Date.now()}-${clean}`;
    const up = await state.sb.storage.from(PHOTO_BUCKET).upload(path, file, { cacheControl:'3600', upsert:false, contentType:file.type || 'image/jpeg' });
    if(up.error){ alert('Photo upload failed: ' + up.error.message); return; }
    const r = await state.sb.from('operations_inspection_photos').insert({ inspection_id: inspectionId, bucket: PHOTO_BUCKET, storage_path: path, file_name: file.name, uploaded_by: state.user.id });
    if(r.error) alert('Photo metadata failed: ' + r.error.message);
  }

  async function createManualTask(e){
    e.preventDefault(); if(!canMaintain()) return alert('Only Admin or Equipment Manager users can create maintenance tasks.');
    const targetType = byId('opsManualTargetType').value;
    const row = {
      source_type: 'Manual',
      target_type: targetType,
      vehicle_id: byId('opsManualVehicle').value || null,
      washing_equipment_id: byId('opsManualWash').value || null,
      title: byId('opsManualTitle').value.trim(),
      description: byId('opsManualDescription').value.trim() || null,
      status: 'Open',
      priority: byId('opsManualPriority').value,
      due_date: byId('opsManualDue').value || null,
      created_by: state.user.id
    };
    if(!row.title) return alert('Task title is required.');
    const r = await state.sb.from('operations_maintenance_tasks').insert(row);
    if(r.error) return alert(r.error.message);
    await loadAll();
  }

  async function saveTaskUpdate(e){
    e.preventDefault(); if(!canMaintain()) return alert('Only Admin or Equipment Manager users can update maintenance tasks.');
    const task = state.tasks.find(t=>t.id===state.openTaskId); if(!task) return;
    const status = byId('opsTaskStatus').value;
    const update = {
      status,
      completion_notes: byId('opsTaskNotes')?.value.trim() || null,
      completed_engine_hours: byId('opsTaskEngineHours')?.value ? Number(byId('opsTaskEngineHours').value) : task.completed_engine_hours,
      completed_pump_hours: byId('opsTaskPumpHours')?.value ? Number(byId('opsTaskPumpHours').value) : task.completed_pump_hours,
      completed_at: status === 'Completed' ? nowIso() : task.completed_at,
      completed_by: status === 'Completed' ? state.user.id : task.completed_by
    };
    if(byId('opsTaskPriority')) update.priority = byId('opsTaskPriority').value;
    const r = await state.sb.from('operations_maintenance_tasks').update(update).eq('id', task.id);
    if(r.error) return alert(r.error.message);

    const checked = Array.from(document.querySelectorAll('.ops-task-step:checked'));
    if(checked.length){
      const rows = checked.map(input => {
        const step = state.procedureSteps.find(s=>s.id===input.value) || {};
        return { maintenance_task_id: task.id, procedure_step_id: input.value, step_number: step.step_number || null, title: step.title || null, completed: true, completed_by: state.user.id, completed_at: nowIso() };
      });
      await state.sb.from('operations_maintenance_task_steps').insert(rows);
    }

    const partsText = byId('opsTaskParts')?.value || '';
    const parts = partsText.split('\n').map(x=>x.trim()).filter(Boolean).map(line => ({ maintenance_task_id: task.id, item_name: line }));
    if(parts.length) await state.sb.from('operations_maintenance_parts_used').insert(parts);

    if(status === 'Completed' && task.schedule_id){
      const schedule = state.schedules.find(s=>s.id===task.schedule_id);
      const next = {};
      next.last_completed_at = nowIso();
      next.last_completed_hours = update.completed_engine_hours || update.completed_pump_hours || null;
      if(schedule?.frequency_days) next.next_due_at = addDays(today(), schedule.frequency_days);
      if(schedule?.frequency_hours && next.last_completed_hours !== null) next.next_due_hours = Number(next.last_completed_hours) + Number(schedule.frequency_hours);
      await state.sb.from('operations_equipment_maintenance_schedules').update(next).eq('id', task.schedule_id);
    }

    state.openTaskId = '';
    await loadAll();
  }

  async function saveSchedule(e){
    e.preventDefault(); if(!canMaintain()) return alert('Only Admin or Equipment Manager users can save maintenance schedules.');
    const washId = byId('opsScheduleWash').value;
    const procId = byId('opsScheduleProcedure').value;
    const existing = state.schedules.find(s=>s.washing_equipment_id===washId && s.procedure_id===procId);
    const row = {
      washing_equipment_id: washId,
      procedure_id: procId,
      frequency_days: byId('opsScheduleFreqDays').value ? Number(byId('opsScheduleFreqDays').value) : null,
      frequency_hours: byId('opsScheduleFreqHours').value ? Number(byId('opsScheduleFreqHours').value) : null,
      next_due_at: byId('opsScheduleNextDate').value || null,
      next_due_hours: byId('opsScheduleNextHours').value ? Number(byId('opsScheduleNextHours').value) : null,
      is_active: true,
      created_by: state.user.id
    };
    const r = existing ? await state.sb.from('operations_equipment_maintenance_schedules').update(row).eq('id', existing.id) : await state.sb.from('operations_equipment_maintenance_schedules').insert(row);
    if(r.error) return alert(r.error.message);
    await loadAll();
  }

  async function generateDueTasks(){
    if(!canMaintain()) return alert('Only Admin or Equipment Manager users can generate preventive maintenance tasks.');
    const due = state.schedules.filter(scheduleIsDue);
    let created = 0;
    for(const s of due){
      const existingOpen = state.tasks.some(t => t.schedule_id === s.id && !['Completed','Deferred'].includes(t.status));
      if(existingOpen) continue;
      const w = state.washEquipment.find(x=>x.id===s.washing_equipment_id);
      const p = state.procedures.find(x=>x.id===s.procedure_id);
      const row = {
        source_type: 'Scheduled',
        target_type: 'washing_equipment',
        washing_equipment_id: s.washing_equipment_id,
        procedure_id: s.procedure_id,
        schedule_id: s.id,
        title: `${p?.name || 'Scheduled maintenance'} - ${w?.name || 'Washing equipment'}`,
        description: p?.description || 'Scheduled preventive maintenance.',
        status: 'Open',
        priority: 'Medium',
        due_date: s.next_due_at || today(),
        due_engine_hours: s.next_due_hours || null,
        created_by: state.user.id
      };
      const r = await state.sb.from('operations_maintenance_tasks').insert(row);
      if(!r.error) created++;
    }
    alert(`Created ${created} due maintenance task${created===1?'':'s'}.`);
    state.currentView = 'maintenance';
    await loadAll();
  }

  function boot(){
    injectTab();
    initSupabase().catch(err => { state.lastError = err.message; render(); });
    window.SWOperationsV4 = { refresh: loadAll, show: showOperations, state };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

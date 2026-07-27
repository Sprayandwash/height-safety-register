/* Spray & Wash Operations App V4.0.63
   Additive module for height-safety-adjacent operations workflows: periodic vehicle checks,
   operations management, inspections, maintenance tasks, preventive schedules, and guides.
   Load after config.js, Supabase JS, and app.js. Do not replace config.js.
*/
(function(){
  'use strict';

  const VERSION = '4.0.63';
  const PHOTO_BUCKET = 'inspection-photos';
  const TASK_STATUSES = ['Open','In Progress','Waiting on Parts','Waiting on Someone','Completed','Deferred'];
  const PRIORITIES = ['Low','Medium','High','Critical'];
  const MACHINERY_TYPE_CODES = { Engine:'ENG', Gearbox:'GBX', Pump:'PMP' };
  const MACHINERY_TYPE_LABELS = { Engine:'Engine', Gearbox:'Reduction gearbox', Pump:'Pump' };
  const MACHINERY_SIDE_CODES = { Driver:'DS', Passenger:'PS' };
  const ROLE_DEFS = ['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports','Viewer'];
  const ROLE_PRESETS = {
    'Field Staff': ['Inspector'],
    'Ops Manager': ['Inspector','Equipment Manager','Office / Reports','Certificate Approver'],
    'Office / Reports': ['Office / Reports','Certificate Approver','Viewer'],
    'Viewer': ['Viewer'],
    'Admin': ['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports','Viewer']
  };
  const state = {
    sb: null,
    user: null,
    roles: [],
    profile: null,
    currentModule: 'home',
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
    maintenanceLog: [],
    maintenanceLogItems: [],
    maintenanceUsers: [],
    pendingUsers: [],
    actualUsers: [],
    actualUserRoles: [],
    editingActualUserId: '',
    qualifications: [],
    certFilterType: '',
    certFilterStatus: '',
    certFilterResult: '',
    certFilterDue: '',
    certFilterSearch: '',
    certSelectedIds: new Set(),
    serviceRunAssetId: '',
    assetEditorOpen: false,
    assetAddType: '',
    currentView: 'vehicle-checks',
    editingVehicleId: '',
    editingWashId: '',
    prefillMachineryVehicleId: '',
    prefillMachinerySide: '',
    transferringMachineryId: '',
    maintenanceEditorOpen: false,
    logAssetId: '',
    logMachineryId: '',
    logType: '',
    logDateFrom: '',
    logDateTo: '',
    logKeyword: '',
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
  function normalizeRego(value){ return String(value || '').toUpperCase().replace(/\s+/g,'').trim(); }
  function machineryType(item){
    const saved = String(item?.machinery_type || '').trim();
    if(MACHINERY_TYPE_CODES[saved]) return saved;
    const legacy = `${item?.equipment_type || ''} ${item?.name || ''}`.toLowerCase();
    if(legacy.includes('gear')) return 'Gearbox';
    if(legacy.includes('pump')) return 'Pump';
    return 'Engine';
  }
  function machineryTypeLabel(itemOrType){
    const type = typeof itemOrType === 'string' ? itemOrType : machineryType(itemOrType);
    return MACHINERY_TYPE_LABELS[type] || type || 'Machinery';
  }
  function buildInstalledMachineryIdentifier(rego, side, type){
    const reg = normalizeRego(rego);
    const sideCode = MACHINERY_SIDE_CODES[side] || '';
    const typeCode = MACHINERY_TYPE_CODES[type] || '';
    return reg && sideCode && typeCode ? `${reg}-${sideCode}-${typeCode}` : '';
  }
  function machineryIdentifier(item){
    const vehicle = state.vehicles.find(v => String(v.id) === String(item?.assigned_vehicle_id || ''));
    const installed = buildInstalledMachineryIdentifier(vehicle?.rego, item?.mounting_side, machineryType(item));
    return installed || item?.asset_identifier || item?.name || 'Unassigned machinery';
  }
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
    if(v && w) return `${normalizeRego(v.rego) || v.name || 'Vehicle'} / ${machineryIdentifier(w)}`;
    if(w) return machineryIdentifier(w);
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
  function openTasks(){ return state.tasks.filter(t => !['Completed','Deferred'].includes(t.status)); }
  function canUseManagement(){ return hasAny(['Equipment Manager','Office / Reports','Viewer']); }
  function canUseHeight(){ return hasAny(['Inspector','Equipment Manager','Office / Reports','Viewer','Certificate Approver']); }
  function canUseVehicleChecks(){ return hasAny(['Inspector','Equipment Manager']); }
  function isManagementView(view){ return ['management-dashboard','assets','history','tasks','schedules','guides'].includes(view) || ['vehicles','washing','maintenance'].includes(view); }
  function isAdminView(view){ return ['admin-users','admin-app-settings','admin-settings'].includes(view); }
  function displayStatusLabel(value){
    const v = String(value || '—');
    if(v === 'Pass') return 'Completed OK';
    if(v === 'Fail' || v === 'Problem') return 'Issue to report';
    return v;
  }
  function itemAllowsPhoto(item){
    const q = String(item?.question_text || '');
    return /Upload photos of cleaned vehicle and cab/i.test(q);
  }

  function titleCaseName(value){
    return String(value || '').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  function inspectorDisplayName(){
    const name = maintenanceUserName(state.profile || {}, state.user || {});
    if(name) return name;
    const emailName = String(state.user?.email || '').split('@')[0];
    return titleCaseName(emailName) || 'Inspector';
  }

  function injectStyles(){
    if(byId('operationsV4Styles')) return;
    const css = `
      #operations.ops-v4 { padding-bottom: 3rem; }
      .ops-shell { max-width: 1200px; margin: 0 auto; }
      .ops-header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; margin-bottom:1rem; }
      .ops-module-title { display:flex; flex-direction:column; gap:.15rem; }
      .ops-section-title { display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
      .ops-search { margin:.75rem 0; }
      .ops-search input { width:100%; border:1px solid #cfd8e3; border-radius:.7rem; padding:.68rem .75rem; font:inherit; }
      .ops-actions .ops-btn, .ops-nav button, .ops-btn { text-align:center; }
      .ops-header h2 { margin:.1rem 0; }
      .ops-subtle { color:#65758b; font-size:.92rem; }
      .ops-nav { display:flex; flex-wrap:wrap; gap:.5rem; margin:1rem 0; align-items:center; }
      .height-module-heading{margin:0 0 .8rem 0;}
      .height-module-heading .ops-home-row{margin:0 0 .65rem 0;}
      .height-module-heading h2{margin:.1rem 0 .1rem 0;font-size:20px;}
      .height-module-heading .ops-subtle{font-size:.92rem;}
      .tabs{position:static!important;top:auto!important;background:transparent!important;margin:.75rem 0 1rem 0!important;display:flex;flex-wrap:wrap;gap:.5rem!important;padding:0 0 .5rem 0!important;}
      .ops-nav button, .ops-btn { border:0; border-radius:12px; padding:11px 14px; background:#e2e8f0; color:#0f172a; font-weight:800; cursor:pointer; min-height:42px; }
      .ops-nav button.active, .ops-btn.primary { background:#0f766e; color:white; }
      .tabs { align-items:center; gap:.5rem !important; padding:6px 0 12px !important; }
      .tabs .tab, .tabs button.tab { border:0; border-radius:12px !important; padding:11px 14px !important; background:#e2e8f0 !important; color:#0f172a !important; font-weight:800 !important; min-height:42px; white-space:nowrap; }
      .tabs .tab.active, .tabs button.tab.active { background:#0f766e !important; color:white !important; }
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
      .ops-branch-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:1rem; margin:1rem 0; }
      .ops-branch-card { text-align:left; border:1px solid #dbe3ec; background:white; border-radius:1rem; padding:1rem; cursor:pointer; box-shadow:0 1px 2px rgba(15,23,42,.05); }
      .ops-branch-card strong { display:block; font-size:1.1rem; margin-bottom:.25rem; }
      .ops-question-photo { margin-top:.65rem; padding:.65rem; border-radius:.7rem; background:#f8fafc; border:1px dashed #cfd8e3; }
      .ops-photo-button { display:inline-flex; align-items:center; justify-content:center; }
      .ops-photo-button input { display:none; }
      .ops-photo-count { margin-top:.5rem; }
      .ops-check-section { margin:1rem 0; padding:.8rem; border:1px solid #dbe3ec; border-radius:1rem; background:#f8fafc; }
      .ops-check-section h4 { margin:.1rem 0 .6rem; }
      .ops-check { display:flex; gap:.5rem; align-items:center; font-weight:700; margin:.35rem 0; }
      .ops-check input { width:auto; }

      .ops-user-card { border:1px solid #dbe3ec; border-radius:.85rem; padding:.8rem; margin:.7rem 0; background:#fff; }
      .ops-role-chip { display:inline-block; border-radius:999px; padding:.2rem .55rem; margin:.12rem; background:#e0f2fe; color:#075985; font-size:.78rem; font-weight:800; }
      .ops-cert-search { border:2px solid #0f766e; background:#ecfdf5; border-radius:14px; padding:12px; margin:10px 0; }
      .ops-home-tab { background:#0f766e !important; color:white !important; flex:0 0 auto; }
      #users .roleGrid { grid-template-columns: repeat(auto-fit,minmax(150px,1fr)); }
      #usersTabButton,#adminTabButton,.legacyAdminOnly { display:none !important; }
      #users details.ops-legacy-roles { margin-top:.5rem; }
      .ops-permission-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.5rem;margin-top:.5rem}
      .ops-permission-check{display:flex;gap:.45rem;align-items:center;border:1px solid #dbe3ec;border-radius:.75rem;background:#f8fafc;padding:.55rem .65rem;font-weight:800}
      .ops-permission-check input{width:auto}
      .ops-permission-check small{display:block;color:#64748b;font-size:.76rem;font-weight:600;margin-top:.12rem}
      .ops-user-row{border:1px solid #dbe3ec;border-radius:1rem;background:#fff;padding:.9rem;margin:.75rem 0}
      .ops-user-row-head{display:flex;justify-content:space-between;gap:.75rem;flex-wrap:wrap;align-items:flex-start}
      .ops-admin-users>h3{margin:0 0 .8rem}
      .ops-admin-users details{background:#fff;border:1px solid #dbe7ee;border-radius:14px;margin:0 0 14px;overflow:hidden}
      .ops-admin-users summary{cursor:pointer;font-weight:900;padding:14px 16px;background:#f8fafc}
      .ops-admin-users-body{padding:14px 16px}
      .ops-admin-users-body>h3:first-child{margin-top:0}
      .ops-logo-setting{display:grid;grid-template-columns:minmax(180px,260px) minmax(240px,1fr);gap:1rem;align-items:start;border:1px solid #dbe3ec;border-radius:1rem;background:#f8fafc;padding:1rem}
      .ops-logo-preview{display:block;max-width:220px;max-height:110px;object-fit:contain;background:white;border:1px solid #dbe3ec;border-radius:.75rem;padding:.5rem;box-sizing:border-box}
      .ops-home-row { display:flex; justify-content:flex-start; margin-bottom:.45rem; }
      .ops-home-btn { min-width:150px; border-radius:.85rem; background:#0f766e !important; color:white !important; box-shadow:0 6px 16px rgba(15,23,42,.08); }
      .ops-dashboard-stat { color:white; min-height:118px; display:flex; flex-direction:column; justify-content:space-between; position:relative; overflow:hidden; border:0; box-shadow:0 14px 35px rgba(15,23,42,.14); cursor:pointer; }
      .ops-dashboard-stat:focus { outline:3px solid rgba(15,118,110,.35); outline-offset:3px; }
      .ops-dashboard-stat::after { content:""; position:absolute; right:-28px; top:-28px; width:115px; height:115px; border-radius:999px; background:rgba(255,255,255,.16); }
      .ops-dashboard-stat .ops-subtle { color:rgba(255,255,255,.92); }
      .ops-stat-total { background:linear-gradient(135deg,#0f766e,#14b8a6); }
      .ops-stat-green { background:linear-gradient(135deg,#15803d,#22c55e); }
      .ops-stat-amber { background:linear-gradient(135deg,#c2410c,#f59e0b); }
      .ops-stat-red { background:linear-gradient(135deg,#991b1b,#ef4444); }
      .ops-stat-blue { background:linear-gradient(135deg,#334155,#64748b); }
      .ops-branch-card { color:white; border:0; min-height:128px; box-shadow:0 14px 35px rgba(15,23,42,.14); position:relative; overflow:hidden; }
      .ops-branch-card .ops-subtle { color:rgba(255,255,255,.92); font-weight:700; }
      .ops-branch-card::after { content:""; position:absolute; right:-30px; top:-30px; width:120px; height:120px; border-radius:999px; background:rgba(255,255,255,.15); }
      .ops-home-height { background:linear-gradient(135deg,#0f766e,#14b8a6); }
      .ops-home-vehicle { background:linear-gradient(135deg,#15803d,#22c55e); }
      .ops-home-management { background:linear-gradient(135deg,#c2410c,#f59e0b); }
      .ops-home-admin { background:linear-gradient(135deg,#334155,#64748b); }
      .ops-filter-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:.75rem; margin:.75rem 0; }
      .ops-filter-grid label { display:flex; flex-direction:column; gap:.25rem; font-size:.86rem; font-weight:800; color:#334155; }
      .ops-filter-grid select,.ops-filter-grid input { border:1px solid #cfd8e3; border-radius:.65rem; padding:.58rem .65rem; font:inherit; background:white; }
      .ops-vehicle-asset{border:1px solid #dbe3ec;border-radius:1rem;background:#fff;margin:1rem 0;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.05)}
      .ops-vehicle-asset-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;padding:1rem;background:#f8fafc;border-bottom:1px solid #e5ebf2}
      .ops-asset-id{font-size:1.15rem;font-weight:900;letter-spacing:.02em;color:#0f4f4a}
      .ops-asset-meta{display:flex;gap:.45rem .8rem;flex-wrap:wrap;margin-top:.35rem;color:#64748b;font-size:.88rem}
      .ops-service-note{margin-top:.65rem;padding:.65rem .75rem;background:#fff7ed;border:1px solid #fed7aa;border-radius:.7rem;color:#7c2d12;white-space:pre-wrap}
      .ops-machinery-sides{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;padding:1rem}
      .ops-machinery-side{border:1px solid #dbe3ec;border-radius:.85rem;padding:.85rem;background:#fbfdff}
      .ops-machinery-side-head{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.6rem}
      .ops-machinery-side h4{margin:0}
      .ops-machinery-card{border:1px solid #e5ebf2;border-radius:.75rem;padding:.75rem;background:white;margin:.55rem 0}
      .ops-machinery-card-head{display:flex;justify-content:space-between;gap:.65rem;align-items:flex-start;flex-wrap:wrap}
      .ops-spec-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.35rem .75rem;margin-top:.55rem;font-size:.86rem;color:#475569}
      .ops-unassigned{margin-top:1rem}
      .ops-assets-actions{display:flex;justify-content:flex-start;margin:0 0 1rem}
      .ops-machinery-fields[hidden]{display:none!important}
      .ops-form [hidden]{display:none!important}
      .ops-log-filter{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr)) auto;gap:.65rem;align-items:end}
      .ops-log-filter label{display:flex;flex-direction:column;gap:.25rem;font-size:.84rem;font-weight:800;color:#334155}
      .ops-log-filter input,.ops-log-filter select{width:100%;border:1px solid #cfd8e3;border-radius:.65rem;padding:.62rem .68rem;font:inherit;background:white;box-sizing:border-box}
      .ops-history-stack{display:grid;gap:1rem}
      .ops-log-list{display:grid;gap:.65rem;margin-top:1rem}
      .ops-log-entry{border:1px solid #dbe3ec;border-radius:.8rem;background:white;overflow:hidden}
      .ops-log-entry summary{list-style:none;cursor:pointer;padding:.8rem .9rem;display:grid;grid-template-columns:105px 115px minmax(150px,1fr) minmax(180px,2fr);gap:.65rem;align-items:center}
      .ops-log-entry summary::-webkit-details-marker{display:none}
      .ops-log-entry[open] summary{background:#f8fafc;border-bottom:1px solid #e5ebf2}
      .ops-log-body{padding:.9rem}
      .ops-maintenance-item-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.55rem;margin-top:.45rem}
      .ops-maintenance-choice{display:flex!important;flex-direction:row!important;align-items:center;gap:.55rem!important;border:1px solid #dbe3ec;border-radius:.7rem;padding:.7rem;background:#f8fafc}
      .ops-maintenance-choice input{width:auto!important;margin:0}
      .ops-repeatable-maintenance{border:1px solid #cbd5e1;border-radius:.85rem;padding:.8rem;background:#f8fafc}
      .ops-repeatable-maintenance h4{margin:0}
      .ops-repeatable-maintenance-list{display:grid;gap:.7rem;margin-top:.7rem}
      .ops-maintenance-detail-item{border:1px solid #dbe3ec;border-radius:.75rem;padding:.75rem;background:white}
      .ops-maintenance-detail-item .ops-form{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
      .ops-maintenance-detail-item textarea{resize:vertical}
      @media(max-width:640px){.ops-maintenance-detail-item .ops-form{grid-template-columns:1fr}}
      .ops-record-items{display:grid;gap:.5rem}
      .ops-record-items>div{border:1px solid #e5ebf2;border-radius:.7rem;padding:.65rem .75rem;background:#f8fafc}
      .ops-transfer-card{border:2px solid #99f6e4;background:#f0fdfa}
      .ops-cert-generate-step { margin-top:1rem; }
      .ops-cert-generate-step button { width:100%; }
      /* Spray & Wash brand system: logo navy, blue and green. */
      .ops-shell{color:#003b73}
      .ops-btn,.ops-nav button{background:#edf6fc!important;border:1px solid #c2dcef!important;color:#003b73!important;box-shadow:none}
      .ops-btn.primary,.ops-nav button.active,.ops-home-btn,.ops-home-tab{background:#003b73!important;border-color:#003b73!important;color:white!important}
      .ops-btn.ghost{background:white!important;border-color:#a9d2ed!important;color:#4f9bd0!important}
      .ops-btn.danger{background:#fbe6e6!important;border-color:#efb5b5!important;color:#b60909!important}
      .ops-card,.ops-user-row,.ops-vehicle-asset,.ops-table-wrap,.ops-log-entry{border-color:#d9e2f0!important;box-shadow:0 5px 18px rgba(48,45,126,.08)}
      .ops-card,.ops-user-row,.ops-vehicle-asset,.ops-table-wrap,.ops-log-entry,.ops-machinery-card{background:#fff!important}
      .ops-table th,.ops-vehicle-asset-head,.ops-log-entry[open] summary,.ops-maintenance-choice,.ops-repeatable-maintenance,.ops-permission-check,.ops-question,.ops-check-section{background:#f6f9fe!important;border-color:#d9e2f0!important;color:#003b73}
      .ops-form input,.ops-form select,.ops-form textarea,.ops-filter-grid input,.ops-filter-grid select,.ops-log-filter input,.ops-log-filter select{border-color:#c5d8ee!important;color:#003b73}
      .ops-form input:focus,.ops-form select:focus,.ops-form textarea:focus,.ops-filter-grid input:focus,.ops-filter-grid select:focus{outline:3px solid rgba(56,182,255,.20);border-color:#38b6ff!important}
      .ops-subtle,.ops-asset-meta{color:#61729b!important}
      .ops-role-chip,.ops-cert-search,.ops-transfer-card{background:#edf6fc!important;border-color:#a9d2ed!important;color:#003b73!important}
      .ops-dashboard-stat,.ops-branch-card{box-shadow:0 14px 30px rgba(48,45,126,.18)!important}
      .ops-stat-total,.ops-home-height{background:#003b73!important}
      .ops-stat-green,.ops-home-vehicle{background:#0d9649!important}
      .ops-stat-amber,.ops-home-management{background:#4f9bd0!important}
      .ops-stat-blue,.ops-home-admin{background:#003b73!important}
      .ops-ok{background:#e1f7e9!important;color:#007d34!important}.ops-warn{background:#fff0d6!important;color:#8b510a!important}.ops-bad{background:#fbe4e4!important;color:#b60909!important}
      .ops-card-icon,.ops-stat-icon{display:grid;place-items:center;flex:0 0 auto;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.16);color:currentColor}
      .ops-card-icon svg,.ops-stat-icon svg{width:29px;height:29px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
      .ops-branch-card{display:flex!important;align-items:center;gap:.85rem;text-align:left!important}
      .ops-branch-card>span:last-child{display:flex;flex:1;flex-direction:column;gap:.2rem}
      .ops-branch-card .ops-subtle{color:rgba(255,255,255,.88)!important}
      .certSelectList{max-height:360px!important;}
      .v415-photo-options{display:flex;gap:1rem;flex-wrap:wrap;align-items:center;}
      .v415-photo-options label{display:flex!important;flex-direction:row!important;align-items:center;gap:.5rem;margin:0;font-weight:800;}
      .v415-photo-options input{width:auto;}
      .v415-selected-review{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px;margin-top:8px;}
      .v415-compact-card{padding:12px!important;}
      .v415-card-hidden{display:none!important;}
      @media (max-width: 720px){ .ops-header { flex-direction:column; } .ops-table { min-width:620px; } .ops-logo-setting{grid-template-columns:1fr}.ops-machinery-sides{grid-template-columns:1fr}.ops-log-filter{grid-template-columns:1fr}.ops-log-entry summary{grid-template-columns:1fr;gap:.25rem} }
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

    if(!byId('moduleHome')){
      const home = document.createElement('section');
      home.id = 'moduleHome';
      home.className = 'tabpane';
      home.innerHTML = '<div class="ops-shell" id="moduleHomeShell"></div>';
      main.insertBefore(home, main.firstChild);
    }

    const pane = document.createElement('section');
    pane.id = 'operations';
    pane.className = 'tabpane hidden ops-v4';
    pane.innerHTML = `<div class="ops-shell" id="opsShell"></div>`;
    main.appendChild(pane);
  }

  let originalShowTab = null;
  function installModulePortal(){
    if(window.__swModulePortalInstalled) return;
    window.__swModulePortalInstalled = true;
    originalShowTab = typeof window.showTab === 'function' ? window.showTab.bind(window) : null;
    window.showModuleHome = showModuleHome;
    window.openHeightModule = openHeightModule;
    window.openVehicleChecksModule = openVehicleChecksModule;
    window.openOpsManagementModule = openOpsManagementModule;
    window.openAdminModule = openAdminModule;
    window.openLegacyUserTools = openLegacyUserTools;
    window.openHeightQualifications = openHeightQualifications;
    setupLogoHomeClick();
    if(originalShowTab){
      window.showTab = function(id){
        if(id === 'users' || id === 'admin'){
          if(isAdmin()) return openAdminModule('admin-users');
          return alert('Admin access is required.');
        }
        state.currentModule = 'height';
        originalShowTab(id);
        setTopTabsMode('height');
        hideLegacyUserAdminControls();
        refreshTopUserSummary();
        setTimeout(()=>postHeightEnhancementsV415(id), 80);
      };
    }
    setTimeout(showModuleHome, 450);
  }




  function hideLegacyUserAdminControls(){
    ['usersTabButton','adminTabButton'].forEach(id => { const el = byId(id); if(el) el.style.display = 'none'; });
    document.querySelectorAll('.legacyAdminOnly,#users,#admin').forEach(el => { if(el){ el.classList.add('hidden'); if(el.classList.contains('legacyAdminOnly')) el.style.display = 'none'; } });
  }

  function ensureHeightHomeButton(){
    const tabs = document.querySelector('.tabs');
    if(!tabs) return;
    let header = byId('heightModuleHeader');
    if(!header){
      header = document.createElement('div');
      header.id = 'heightModuleHeader';
      header.className = 'height-module-heading';
      header.innerHTML = `<div class="ops-home-row"><button type="button" class="ops-btn ops-home-btn" id="heightHomeButton">← Home</button></div>
        <div class="ops-module-title"><h2>Height Equipment</h2></div>`;
      tabs.parentNode.insertBefore(header, tabs);
      byId('heightHomeButton')?.addEventListener('click', showModuleHome);
    }
    header.style.display = '';
  }


  function setupLogoHomeClick(){
    const logo = document.querySelector('header .logo');
    if(!logo || logo.dataset.homeClick === '1') return;
    logo.dataset.homeClick = '1';
    logo.setAttribute('role','button');
    logo.setAttribute('tabindex','0');
    logo.setAttribute('title','Home');
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', showModuleHome);
    logo.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); showModuleHome(); } });
  }

  function ensureHeightQualificationTab(){
    const tabs = document.querySelector('.tabs');
    if(!tabs) return;
    let btn = byId('heightQualTabButton');
    if(!btn){
      btn = document.createElement('button');
      btn.id = 'heightQualTabButton';
      btn.type = 'button';
      btn.className = 'tab';
      btn.dataset.tab = 'heightQualifications';
      btn.textContent = 'Qualifications';
      btn.addEventListener('click', openHeightQualifications);
      const certBtn = byId('certificateTabButton');
      if(certBtn && certBtn.nextSibling) tabs.insertBefore(btn, certBtn.nextSibling); else tabs.appendChild(btn);
    }
    btn.style.display = '';
  }

  function openHeightQualifications(){
    if(!state.user) return alert('Sign in first.');
    if(!canUseHeight()) return alert('Your account does not have Height Equipment access.');
    state.currentModule = 'height';
    setTopTabsMode('height');
    document.querySelectorAll('.tabpane').forEach(x => x.classList.add('hidden'));
    let pane = byId('heightQualifications');
    if(!pane){
      const main = byId('appMain') || document.querySelector('main') || document.body;
      pane = document.createElement('section');
      pane.id = 'heightQualifications';
      pane.className = 'tabpane';
      main.appendChild(pane);
    }
    pane.classList.remove('hidden');
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    byId('heightQualTabButton')?.classList.add('active');
    const renderCurrentQualifications = window.SWOperationsV4?.renderHeightQualificationsV431;
    if(typeof renderCurrentQualifications === 'function') renderCurrentQualifications();
    else pane.innerHTML = '<div class="card"><p class="muted">Qualifications are loading. Please reopen this tab.</p></div>';
    window.scrollTo({top:0, left:0, behavior:'auto'});
  }

  function enhanceCertificateSelector(){
    const panel = byId('certItemsPanel');
    const list = byId('certItemList');
    if(!panel || !list) return;
    let box = byId('certEquipmentSearchBox');
    if(!box){
      box = document.createElement('div');
      box.id = 'certEquipmentSearchBox';
      box.className = 'ops-cert-search';
      box.innerHTML = `<label style="margin-top:0">Search equipment items</label><input id="certEquipmentSearch" type="search" placeholder="Search by serial, type, manufacturer, model or description"><div id="certEquipmentSearchCount" class="muted" style="margin-top:6px"></div>`;
      const tools = panel.querySelector('.certSelectionTools') || list;
      panel.insertBefore(box, tools);
      byId('certEquipmentSearch')?.addEventListener('input', filterCertificateItems);
    }
    filterCertificateItems();
    reorderCertificateGenerateStep();
    enhanceQualificationCertificatePanel();
  }

  function reorderCertificateGenerateStep(){
    const box = document.querySelector('.certActionBox');
    const validation = document.getElementById('certValidation');
    if(!box || !validation || box.dataset.v409Moved) return;
    box.dataset.v409Moved = '1';
    box.classList.add('ops-cert-generate-step');
    const h = document.createElement('h3');
    h.textContent = '4. Generate certificates';
    h.className = 'ops-cert-step-title';
    box.insertBefore(h, box.firstChild);
    validation.parentElement?.insertBefore(box, validation.nextSibling);
  }

  function filterCertificateItems(){
    const q = String(byId('certEquipmentSearch')?.value || '').trim().toLowerCase();
    const rows = Array.from(document.querySelectorAll('#certItemList .certItemCheckRow'));
    let shown = 0;
    rows.forEach(row => {
      const match = !q || row.textContent.toLowerCase().includes(q);
      row.style.display = match ? '' : 'none';
      if(match) shown++;
    });
    const count = byId('certEquipmentSearchCount');
    if(count) count.textContent = rows.length ? `${shown} of ${rows.length} items shown` : 'No equipment items loaded yet.';
  }

  function shortCertificateNumber(seed){
    const d = new Date();
    const stamp = d.getFullYear();
    const clean = String(seed || 'CERT').replace(/[^a-zA-Z0-9]+/g,'').toUpperCase().slice(0, 8) || 'CERT';
    const suffix = String(Date.now()).slice(-4);
    return `SW-${stamp}-${clean}-${suffix}`;
  }

  function installShortCertificateNumberPatch(){
    try{
      if('certNumber' in window) window.certNumber = shortCertificateNumber;
    }catch(e){ console.warn('Certificate number patch skipped', e); }
  }


  function enhanceQualificationCertificatePanel(){
    const section = byId('certificates');
    const history = byId('certificateHistory')?.closest('.card');
    if(!section) return;
    let panel = byId('qualificationCertPanel');
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'qualificationCertPanel';
      panel.className = 'card';
      if(history) section.insertBefore(panel, history);
      else section.appendChild(panel);
    }
    panel.innerHTML = qualificationCertificatePanelHtml();
  }

  function qualificationCertificatePanelHtml(){
    const rows = (state.qualifications || []).filter(q => q.active !== false);
    const options = rows.map(q => `<option value="${esc(q.id)}">${esc(q.inspector_name)} - ${esc(q.qualification_type)}${q.expiry_date ? ' - exp ' + esc(nzDate(q.expiry_date)) : ''}</option>`).join('');
    return `<h2>Inspector Qualification Certificate</h2>
      <p class="muted">Generate a printable certificate/summary for a saved height inspector qualification.</p>
      <div class="grid two">
        <div><label>Inspector qualification</label><select id="qualCertSelect"><option value="">Select qualification</option>${options}</select></div>
        <div><label>Certificate number style</label><select id="qualCertNumberStyle"><option value="short">Short readable number</option></select></div>
      </div>
      <div class="row"><button type="button" class="primary" onclick="SWOperationsV4.generateQualificationCertificate()">Generate inspector qualification certificate</button></div>
      ${rows.length ? '' : '<p class="muted">No qualifications saved yet. Add qualifications under Height Equipment - Inspector Qualifications first.</p>'}`;
  }

  async function generateQualificationCertificate(){
    if(!hasAny(['Admin','Office / Reports','Certificate Approver','Equipment Manager'])) return alert('You do not have permission to generate qualification certificates.');
    const id = byId('qualCertSelect')?.value || '';
    if(!id) return alert('Select an inspector qualification first.');
    const q = (state.qualifications || []).find(x => String(x.id) === String(id));
    if(!q) return alert('Qualification record not found.');
    const certNo = shortCertificateNumber(q.reference_number || q.inspector_name || 'QUAL');
    let fileUrl = '';
    if(q.storage_path){
      try{
        const r = await state.sb.storage.from(PHOTO_BUCKET).createSignedUrl(q.storage_path, 3600);
        if(!r.error) fileUrl = r.data.signedUrl;
      }catch(e){ console.warn('Qualification file link skipped', e); }
    }
    const html = qualificationCertificateHtml(q, certNo, fileUrl);
    const w = window.open('', '_blank');
    if(!w){
      const blob = new Blob([html], {type:'text/html'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `inspector-qualification-${certNo}.html`;
      a.click();
      URL.revokeObjectURL(a.href);
      alert('Popup blocked. The certificate HTML file has been downloaded instead.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function qualificationCertificateHtml(q, certNo, fileUrl){
    const generated = new Date().toLocaleString('en-NZ');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(certNo)}</title><style>
      body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:40px;color:#0f172a} .cert{max-width:850px;margin:auto;border:1px solid #cbd5e1;padding:34px;border-radius:18px} h1{margin:0 0 8px;color:#0f766e}.muted{color:#64748b}.grid{display:grid;grid-template-columns:180px 1fr;gap:10px;margin-top:24px}.label{font-weight:800;color:#334155;border-bottom:1px solid #e2e8f0;padding:8px}.value{border-bottom:1px solid #e2e8f0;padding:8px}.footer{margin-top:30px;font-size:12px;color:#64748b}.badge{display:inline-block;background:#ecfdf5;color:#0f766e;border-radius:999px;padding:6px 12px;font-weight:800} @media print{button{display:none} body{margin:0}.cert{border:0}}
    </style></head><body><div class="cert"><button onclick="window.print()">Print / Save as PDF</button><h1>Spray &amp; Wash Inspector Qualification Certificate</h1><div class="muted">Certificate No: <strong>${esc(certNo)}</strong></div><p class="badge">Height Equipment Inspector Qualification</p><div class="grid">
      <div class="label">Inspector</div><div class="value">${esc(q.inspector_name)}</div>
      <div class="label">Email</div><div class="value">${esc(q.email || '—')}</div>
      <div class="label">Qualification</div><div class="value">${esc(q.qualification_type)}</div>
      <div class="label">Provider</div><div class="value">${esc(q.provider || '—')}</div>
      <div class="label">Reference</div><div class="value">${esc(q.reference_number || '—')}</div>
      <div class="label">Issue date</div><div class="value">${esc(nzDate(q.issue_date))}</div>
      <div class="label">Expiry date</div><div class="value">${esc(nzDate(q.expiry_date))}</div>
      <div class="label">Uploaded evidence</div><div class="value">${fileUrl ? `<a href="${fileUrl}" target="_blank">Open uploaded PDF / scan</a>` : 'No file attached'}</div>
      <div class="label">Notes</div><div class="value">${esc(q.notes || '—')}</div>
    </div><div class="footer">Generated ${esc(generated)} from Spray &amp; Wash Operations. Verify against the live app before relying on a downloaded copy.</div></div></body></html>`;
  }

  function enhanceLegacyUserUI(){ hideLegacyUserAdminControls(); }

  function setTopTabsMode(mode){
    const tabs = document.querySelector('.tabs');
    const heightHeader = byId('heightModuleHeader');
    if(!tabs){ if(heightHeader) heightHeader.style.display = 'none'; return; }
    tabs.style.display = (mode === 'height') ? 'flex' : 'none';
    if(mode === 'height'){
      ensureHeightHomeButton();
      ensureHeightQualificationTab();
      tabs.querySelectorAll('.tab').forEach(btn => {
        const tab = btn.dataset.tab || '';
        btn.style.display = ['dashboard','equipment','export','certificates','heightQualifications'].includes(tab) ? '' : 'none';
      });
    } else {
      if(heightHeader) heightHeader.style.display = 'none';
    }
  }

  function showModuleHome(){
    hideLegacyUserAdminControls();
    state.currentModule = 'home';
    setTopTabsMode('none');
    document.querySelectorAll('.tabpane').forEach(x => x.classList.add('hidden'));
    byId('moduleHome')?.classList.remove('hidden');
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    renderModuleHome();
    refreshTopUserSummary();
    window.scrollTo({top:0, left:0, behavior:'auto'});
  }

  function openHeightModule(){
    hideLegacyUserAdminControls();
    if(!state.user) return alert('Sign in first.');
    if(!canUseHeight()) return alert('Your account does not have Height Safety access.');
    state.currentModule = 'height';
    setTopTabsMode('height');
    if(originalShowTab) originalShowTab('dashboard');
    setTimeout(()=>postHeightEnhancementsV415('dashboard'), 120);
  }

  function openVehicleChecksModule(){
    if(!state.user) return alert('Sign in first.');
    if(!canUseVehicleChecks()) return alert('Your account cannot submit vehicle checks.');
    state.currentModule = 'vehicle-checks';
    setTopTabsMode('none');
    showOperations('vehicle-checks');
  }

  function openOpsManagementModule(){
    if(!state.user) return alert('Sign in first.');
    if(!canUseManagement()) return alert('Maintenance requires Admin, Equipment Manager, Office / Reports, or Viewer access.');
    state.currentModule = 'ops-management';
    setTopTabsMode('none');
    showOperations('management-dashboard');
  }

  function openAdminModule(view){
    if(!state.user) return alert('Sign in first.');
    if(!isAdmin()) return alert('Admin access is required.');
    state.currentModule = 'admin';
    setTopTabsMode('none');
    const target = ['admin-users','admin-app-settings','admin-settings'].includes(view) ? view : 'admin-users';
    showOperations(target);
  }

  function openLegacyUserTools(){
    if(!isAdmin()) return alert('Admin access is required.');
    return openAdminModule('admin-users');
  }

  function renderModuleHome(){
    const shell = byId('moduleHomeShell');
    if(!shell) return;
    const signedIn = !!state.user;
    const cards = [];
    if(!signedIn){
      cards.push(`<div class="ops-card"><h3>Sign in required</h3><p class="ops-subtle">Use the Account button to sign in, then choose the module you need.</p></div>`);
    } else {
      if(canUseHeight()) cards.push(moduleCard('Height Equipment', '', 'openHeightModule()'));
      if(canUseVehicleChecks()) cards.push(moduleCard('Vehicle Checks', '', 'openVehicleChecksModule()'));
      if(canUseManagement()) cards.push(moduleCard('Maintenance', '', 'openOpsManagementModule()'));
      if(isAdmin()) cards.push(moduleCard('Admin', '', 'openAdminModule()'));
      if(!cards.length) cards.push(`<div class="ops-card"><h3>No app access yet</h3><p class="ops-subtle">Your account needs an assigned role before modules will appear.</p></div>`);
    }
    shell.innerHTML = `
      <div class="ops-header">
        <div class="ops-module-title"><h2>Spray &amp; Wash Operations</h2><div class="ops-subtle">Choose the area you need.</div></div>
      </div>
      <div class="ops-branch-grid">${cards.join('')}</div>`;
  }
  function appIcon(name, className){
    const icons={
      height:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
      vehicle:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM14 9h3l4 3v4h-7z"/><path d="M6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM3 10h11"/></svg>',
      maintenance:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4.5 4.5 0 0 0-5.8 5.8L3 18l3 3 5.9-5.9a4.5 4.5 0 0 0 5.8-5.8l-3.1 3.1-2.4-2.4 2.5-3.7Z"/></svg>',
      admin:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z"/><path d="m19.4 13.5 1.4 1-1.8 3.1-1.7-.7a7.6 7.6 0 0 1-1.8 1l-.3 1.8h-3.6l-.3-1.8a7.6 7.6 0 0 1-1.8-1l-1.7.7-1.8-3.1 1.4-1a7.4 7.4 0 0 1 0-2.1l-1.4-1 1.8-3.1 1.7.7a7.6 7.6 0 0 1 1.8-1l.3-1.8h3.6l.3 1.8a7.6 7.6 0 0 1 1.8 1l1.7-.7 1.8 3.1-1.4 1a7.4 7.4 0 0 1 0 2.1Z"/></svg>',
      task:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6v3H9zM9 12h6M9 16h4"/></svg>',
      schedule:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14h3M8 17h5"/></svg>'
    };
    return `<span class="${className||'ops-card-icon'}">${icons[name]||icons.task}</span>`;
  }
  function moduleCard(title, body, action){
    const cls = /Height/i.test(title) ? 'ops-home-height' : /Vehicle/i.test(title) ? 'ops-home-vehicle' : /Maintenance/i.test(title) ? 'ops-home-management' : 'ops-home-admin';
    const icon = /Height/i.test(title) ? 'height' : /Vehicle/i.test(title) ? 'vehicle' : /Maintenance/i.test(title) ? 'maintenance' : 'admin';
    return `<button type="button" class="ops-branch-card ${cls}" onclick="${action}">${appIcon(icon)}<span><strong>${esc(title)}</strong>${body?`<span class="ops-subtle">${esc(body)}</span>`:''}</span></button>`;
  }

  function showOperations(view){
    state.currentView = view || state.currentView || 'vehicle-checks';
    if(state.currentView === 'vehicles' || state.currentView === 'washing') state.currentView = 'assets';
    if(state.currentView === 'maintenance') state.currentView = 'tasks';
    if(isAdminView(state.currentView) && !isAdmin()) state.currentView = 'vehicle-checks';
    if(isManagementView(state.currentView) && !canUseManagement()) state.currentView = 'vehicle-checks';
    setTopTabsMode('none');
    document.querySelectorAll('.tabpane').forEach(x => x.classList.add('hidden'));
    byId('operations')?.classList.remove('hidden');
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    render();
    window.scrollTo({top:0, left:0, behavior:'auto'});
  }

  function updateExternalTabVisibility(){ /* V4.0.3 uses the module dashboard instead of top-level Operations tabs. */ }

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



  async function claimPreloadedUserSetup(){
    if(!state.user?.email || !state.sb) return;
    try{
      const r = await state.sb.rpc('claim_preloaded_user_setup');
      if(r.error && !/does not exist|Could not find/i.test(r.error.message || '')) console.warn('Preloaded user setup skipped:', r.error.message);
      if(!r.error && typeof window.loadRoles === 'function') setTimeout(()=>window.loadRoles().catch?.(()=>{}), 300);
    }catch(err){ console.warn('Preloaded user setup skipped:', err.message); }
  }

  async function loadRoles(){
    state.roles = [];
    state.profile = null;
    await claimPreloadedUserSetup();
    const r = await state.sb.from('user_roles').select('role').eq('user_id', state.user.id).order('role');
    if(!r.error) state.roles = (r.data || []).map(x => x.role).filter(Boolean);
    const p = await state.sb.from('profiles').select('*').eq('user_id', state.user.id).maybeSingle();
    if(!p.error) state.profile = p.data || null;
    renderModuleHome();
    refreshTopUserSummary();
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
      const [vehicles, washEquipment, templates, checklistItems, inspections, answers, photos, procedures, procedureSteps, schedules, tasks, taskSteps, parts, maintenanceLog, maintenanceLogItems] = await Promise.all([
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
        loadTable('operations_maintenance_parts_used','*',{column:'created_at', ascending:false}),
        loadTable('operations_maintenance_log','*',{column:'record_date', ascending:false}),
        loadTable('operations_maintenance_log_items','*',{column:'sort_order'})
      ]);
      Object.assign(state,{vehicles,washEquipment,templates,checklistItems,inspections,answers,photos,procedures,procedureSteps,schedules,tasks,taskSteps,parts,maintenanceLog,maintenanceLogItems});
      if(isAdmin()||canMaintain()){
        try { state.pendingUsers = await loadTable('operations_preloaded_users','*',{column:'email'}); }
        catch(e){ console.warn('Preloaded users table unavailable:', e.message); state.pendingUsers = []; }
      } else state.pendingUsers = [];
      if(isAdmin()){
        try { state.actualUsers = await loadTable('profiles','*'); }
        catch(e){ console.warn('Profiles unavailable:', e.message); state.actualUsers = []; }
        try { state.actualUserRoles = await loadTable('user_roles','*'); }
        catch(e){ console.warn('User roles unavailable:', e.message); state.actualUserRoles = []; }
      } else { state.actualUsers = []; state.actualUserRoles = []; }
      if(canMaintain()){
        if(isAdmin()) state.maintenanceUsers = state.actualUsers.slice();
        else {
          try { state.maintenanceUsers = await loadTable('profiles','*'); }
          catch(e){ console.warn('Maintenance user names unavailable:', e.message); state.maintenanceUsers = state.profile ? [state.profile] : []; }
        }
      } else state.maintenanceUsers = [];
      try { state.qualifications = await loadTable('height_inspector_qualifications','*',{column:'expiry_date'}); }
      catch(e){ console.warn('Height inspector qualifications table unavailable:', e.message); state.qualifications = []; }
      render();
    }catch(err){
      state.lastError = `V4 tables are not ready or access is blocked. Run supabase-schema-v4.0-operations.sql first. Details: ${err.message}`;
      render();
    }
  }

  function render(){
    const shell = byId('opsShell');
    if(!shell) return;
    updateExternalTabVisibility();
    shell.innerHTML = headerHtml() + (state.lastError ? `<div class="ops-error">${esc(state.lastError)}</div>` : '') + bodyHtml();
    bindRenderedEvents();
    refreshTopUserSummary();
    if(state.currentModule === 'home') renderModuleHome();
    setTimeout(()=>postHeightEnhancementsV415(), 30);
  }


  function headerHtml(){
    const isVehicle = state.currentView === 'vehicle-checks';
    const isAdminModule = isAdminView(state.currentView);
    const managementNav = canUseManagement() && !isVehicle && !isAdminModule ? `
        ${navButton('management-dashboard','Dashboard')}
        ${navButton('assets','Assets')}
        ${navButton('history','Maintenance Log')}
        ${navButton('tasks','Tasks')}
        ${navButton('schedules','Preventive Maintenance')}
        ${navButton('guides','Guides')}` : '';
    const adminNav = isAdminModule ? `
        ${navButton('admin-users','Users & Permissions')}
        ${navButton('admin-app-settings','App Settings')}
        ${navButton('admin-settings','Backup')}` : '';
    const staffNav = isVehicle ? '' : (isAdminModule ? adminNav : managementNav);
    const title = isVehicle ? 'Vehicle Checks' : isAdminModule ? 'Admin' : 'Maintenance';
    const note = isVehicle ? '' : isAdminModule ? 'Users, permissions, app settings and backups' : '';
    return `
      <div class="ops-header">
        <div class="ops-module-title">
          <div class="ops-home-row"><button type="button" class="ops-btn ops-home-btn" onclick="showModuleHome()">← Home</button></div>
          <h2>${title}</h2>
          ${note ? `<div class="ops-subtle">${note}</div>` : ''}
        </div>
      </div>
      ${staffNav ? `<div class="ops-nav" id="opsNav">${staffNav}</div>` : ''}`;
  }

  function navButton(id, label){ return `<button type="button" class="${state.currentView===id?'active':''}" data-ops-view="${id}">${label}</button>`; }

  function bodyHtml(){
    if(!state.user) return `<div class="ops-card"><h3>Sign in required</h3><p>Use the existing sign-in area first, then open Vehicle Checks or Maintenance.</p></div>`;
    if(!canView()) return `<div class="ops-card"><h3>No Operations access yet</h3><p>Your account needs one of these existing roles: Admin, Inspector, Equipment Manager, Office / Reports, or Viewer.</p></div>`;
    if(state.currentView === 'vehicle-checks') return periodicVehicleChecksHtml();
    if(isAdminView(state.currentView)){
      if(!isAdmin()) return `<div class="ops-card"><h3>Admin access required</h3><p>This module is only available to Admin users.</p></div>`;
      if(state.currentView === 'admin-app-settings') return appSettingsHtml();
      if(state.currentView === 'admin-settings') return adminSettingsHtml();
      return usersHtml();
    }
    if(isManagementView(state.currentView) && !canUseManagement()) return `<div class="ops-card"><h3>Maintenance access required</h3><p>Use Vehicle Checks for staff vehicle checks. Maintenance views require Admin, Equipment Manager, Office / Reports, or Viewer access.</p></div>`;
    if(state.currentView === 'assets') return assetsHtml();
    if(state.currentView === 'history') return historyHtml();
    if(state.currentView === 'tasks') return tasksHtml();
    if(state.currentView === 'schedules') return schedulesHtml();
    if(state.currentView === 'guides') return guidesHtml();
    return dashboardHtml();
  }

  function vehicleChecklistTemplate(){
    return state.templates.find(t=>t.name==='Vehicle Inspection Checklist')
      || state.templates.find(t=>t.name==='Periodic Vehicle Checks - Google Form')
      || state.templates.find(t=>t.target_type==='vehicle')
      || state.templates[0]
      || {};
  }
  function periodicVehicleChecksHtml(){
    if(!canSubmit()) return `<div class="ops-card"><h3>Vehicle Inspection Checklist</h3><p>Your role can view Operations, but cannot submit vehicle checks.</p></div>`;
    const template = vehicleChecklistTemplate();
    const myRecent = state.inspections.filter(i => i.submitted_by === state.user?.id || i.submitted_by_email === state.user?.email).slice(0,5);
    return `
      <div class="ops-card">
        <h3>Vehicle Inspection Checklist</h3>
        <p class="ops-subtle">Complete the periodic vehicle, equipment, PPE, engine, pump, hose reel and unloader checks. Any item marked Issue to report will create a management maintenance task.</p>
        ${inspectionFormHtml(template.id || '')}
      </div>
      <div class="ops-card" style="margin-top:1rem">
        <h3>My recent checks</h3>
        ${myRecent.length ? `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Date</th><th>Vehicle</th><th>Result</th><th>Notes</th></tr>${myRecent.map(i=>`<tr><td>${nzDate(i.inspection_date)}</td><td>${esc(targetName(i))}</td><td>${statusPill(i.overall_result)}</td><td>${esc(i.notes||'')}</td></tr>`).join('')}</table></div>` : '<p class="ops-subtle">No recent checks submitted by you yet.</p>'}
      </div>`;
  }

  function dashboardHtml(){
    const vehicleAttention = state.vehicles.filter(v => v.status === 'Active' && assetNeedsAttention('vehicle',v));
    const machineryAttention = state.washEquipment.filter(w => ['Active','Quarantined'].includes(w.status) && assetNeedsAttention('machinery',w));
    const open = openTasks();
    const waiting = state.tasks.filter(t => t.status === 'Waiting on Parts');
    const scheduledDue = state.schedules.filter(s => s.is_active !== false).filter(s => scheduleIsDue(s));
    return `
      <div class="ops-grid">
        ${statCard('Vehicles needing attention', vehicleAttention.length, 'Vehicles with open maintenance tasks','ops-stat-amber','assets-due-vehicles')}
        ${statCard('Machinery needing attention', machineryAttention.length, 'Open tasks or quarantined machinery','ops-stat-green','assets-due-washing')}
        ${statCard('Open tasks', open.length, 'Reactive, scheduled and manual work items','ops-stat-total','tasks-open')}
        ${statCard('Waiting on parts', waiting.length, 'Tasks blocked by parts or supplies','ops-stat-red','tasks-waiting')}
        ${statCard('Preventive services due', scheduledDue.length, 'Scheduled date-based maintenance','ops-stat-blue','schedules-due')}
      </div>
      <div class="ops-grid" style="margin-top:1rem">
        <div class="ops-card"><h3>Assets needing attention</h3>${dueListHtml()}</div>
        <div class="ops-card"><h3>Open tasks</h3>${taskMiniListHtml(open.slice(0,8))}</div>
      </div>`;
  }
  function statCard(title, value, note, variant, shortcut){ const attr = shortcut ? ` role="button" tabindex="0" data-ops-shortcut="${esc(shortcut)}"` : ''; const icon=/Machinery|Vehicle/.test(title)?'vehicle':/Preventive/.test(title)?'schedule':/task/i.test(title)?'task':'maintenance'; return `<div class="ops-card ops-dashboard-stat ${variant || 'ops-stat-total'}"${attr}><div style="display:flex;justify-content:space-between;gap:.7rem;align-items:flex-start"><div><div class="ops-subtle">${esc(title)}</div><div class="ops-stat">${esc(value)}</div></div>${appIcon(icon,'ops-stat-icon')}</div><div class="ops-subtle">${esc(note)}</div></div>`; }
  function dueListHtml(){
    const rows = [];
    state.vehicles.filter(v=>v.status==='Active' && assetNeedsAttention('vehicle',v)).forEach(v => rows.push({type:'Vehicle', name:v.rego || v.name, reason:'Open task'}));
    state.washEquipment.filter(w=>['Active','Quarantined'].includes(w.status) && assetNeedsAttention('machinery',w)).forEach(w => rows.push({type:'Machinery', name:machineryIdentifier(w), reason:w.status==='Quarantined'?'Quarantined':'Open task'}));
    rows.splice(10);
    if(!rows.length) return '<p class="ops-subtle">No active assets currently need attention.</p>';
    return `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Type</th><th>Item</th><th>Reason</th></tr>${rows.map(r=>`<tr><td>${esc(r.type)}</td><td>${esc(r.name || 'Unnamed')}</td><td>${statusPill(r.reason)}</td></tr>`).join('')}</table></div>`;
  }


  function handleDashboardShortcut(shortcut){
    state.currentModule = 'management';
    state.currentView = 'management-dashboard';
    if(shortcut === 'assets-due-vehicles'){
      state.currentView = 'assets';
    } else if(shortcut === 'assets-due-washing'){
      state.currentView = 'assets';
    } else if(shortcut === 'tasks-open'){
      state.currentView = 'tasks';
      state.taskQuickFilter = 'open';
    } else if(shortcut === 'tasks-waiting'){
      state.currentView = 'tasks';
      state.taskQuickFilter = 'waiting';
    } else if(shortcut === 'schedules-due'){
      state.currentView = 'schedules';
      state.scheduleQuickFilter = 'due';
    }
    render();
    window.scrollTo({top:0,left:0,behavior:'auto'});
  }

  function vehiclesHtml(){
    return `
      <div class="ops-card">
        <h3>${state.editingVehicleId ? 'Edit vehicle' : 'Add vehicle'}</h3>
        ${canManage() ? vehicleFormHtml() : '<p class="ops-subtle">Read-only. Ask an Admin or Equipment Manager to edit vehicles.</p>'}
      </div>
      <div class="ops-card" style="margin-top:1rem"><h3>Vehicle register</h3>${vehicleTableHtml()}</div>`;
  }
  function vehicleTableHtml(rows){
    rows = rows || state.vehicles;
    if(!rows.length) return '<p class="ops-subtle">No vehicles added yet.</p>';
    return `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Rego</th><th>Name</th><th>Status</th><th>Last inspection</th><th>Actions</th></tr>${rows.map(v=>{ const latest=latestInspectionFor('vehicle',v.id); return `<tr><td><strong>${esc(v.rego)}</strong></td><td>${esc(v.name||v.make_model||'')}</td><td>${statusPill(v.status)}</td><td>${latest?nzDate(latest.inspection_date):'—'}</td><td>${canManage()?`<button class="ops-btn ghost" data-ops-edit-vehicle="${v.id}">Edit</button>`:''}</td></tr>`; }).join('')}</table></div>`;
  }

  function washingHtml(){
    return `
      <div class="ops-card">
        <h3>${state.editingWashId ? 'Edit machinery' : 'Add machinery'}</h3>
        ${canManage() ? washingFormHtml() : '<p class="ops-subtle">Read-only. Ask an Admin or Equipment Manager to edit machinery.</p>'}
      </div>
      <div class="ops-card" style="margin-top:1rem"><h3>Machinery register</h3>${washingTableHtml()}</div>`;
  }
  function washingTableHtml(rows){
    rows = rows || state.washEquipment;
    if(!rows.length) return '<p class="ops-subtle">No machinery added yet.</p>';
    return `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Identifier</th><th>Type</th><th>Vehicle / side</th><th>Status</th><th>Make / model</th><th>Actions</th></tr>${rows.map(w=>{ const v=state.vehicles.find(x=>x.id===w.assigned_vehicle_id); return `<tr><td><strong>${esc(machineryIdentifier(w))}</strong><br><span class="ops-subtle">${esc(w.serial_number||'')}</span></td><td>${esc(machineryTypeLabel(w))}</td><td>${esc(v?.rego || 'Unassigned')}${w.mounting_side?` · ${esc(w.mounting_side)} side`:''}</td><td>${statusPill(w.status)}</td><td>${esc(w.make_model||'—')}</td><td>${canManage()?`<button class="ops-btn ghost" data-ops-edit-wash="${w.id}">Edit</button>`:''}</td></tr>`; }).join('')}</table></div>`;
  }


  function uniqueValues(values){ return Array.from(new Set(values.map(v=>String(v||'').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)); }

  function assetHasOpenTasks(kind, item){
    return openTasks().some(t => kind === 'vehicle' ? String(t.vehicle_id) === String(item.id) : String(t.washing_equipment_id) === String(item.id));
  }
  function assetNeedsAttention(kind, item){
    if(String(item.status || '') === 'Quarantined') return true;
    return assetHasOpenTasks(kind, item);
  }
  function vehicleMachinery(vehicleId){
    return state.washEquipment
      .filter(w=>String(w.assigned_vehicle_id||'')===String(vehicleId))
      .sort((a,b)=>String(a.mounting_side||'').localeCompare(String(b.mounting_side||'')) || machineryTypeLabel(a).localeCompare(machineryTypeLabel(b)));
  }
  function specValue(label, value, suffix=''){
    if(value === null || value === undefined || value === '') return '';
    return `<div><strong>${esc(label)}:</strong> ${esc(value)}${esc(suffix)}</div>`;
  }
  function machinerySpecsHtml(w){
    const type = machineryType(w);
    const common = [
      specValue('Make/model', w.make_model),
      specValue('Serial', w.serial_number),
      specValue('Oil', [w.oil_grade, w.oil_volume_l ? `${w.oil_volume_l} L` : ''].filter(Boolean).join(' · '))
    ];
    if(type === 'Engine'){
      common.push(specValue('Spark plug',w.spark_plug_part_number),specValue('Air filter',w.air_filter_part_number));
    }
    if(type === 'Pump'){
      common.push(specValue('Pressure',w.pressure_psi,' PSI'),specValue('Max output',w.max_output_lpm,' L/min'));
    }
    return common.filter(Boolean).join('') || '<div class="ops-subtle">No machinery specifications entered.</div>';
  }
  function machineryCardHtml(w){
    return `<div class="ops-machinery-card">
      <div class="ops-machinery-card-head">
        <div><div class="ops-asset-id">${esc(machineryIdentifier(w))}</div><strong>${esc(machineryTypeLabel(w))}</strong></div>
        <div>${statusPill(w.status)} ${canManage()?`<button class="ops-btn ghost" type="button" data-ops-transfer-machinery="${esc(w.id)}">Transfer</button> <button class="ops-btn ghost" type="button" data-ops-edit-wash="${esc(w.id)}">Edit</button>`:''}</div>
      </div>
      <div class="ops-spec-list">${machinerySpecsHtml(w)}</div>
      ${w.service_notes || w.notes ? `<div class="ops-service-note"><strong>Current service state / notes</strong><br>${esc(w.service_notes || w.notes)}</div>` : ''}
    </div>`;
  }
  function sideMachineryHtml(vehicle, side, rows){
    return `<div class="ops-machinery-side">
      <div class="ops-machinery-side-head"><h4>${esc(side)} side</h4>${canManage()?`<button class="ops-btn ghost" type="button" data-ops-add-machinery="${esc(vehicle.id)}" data-ops-machinery-side="${esc(side)}">+ Add machinery</button>`:''}</div>
      ${rows.length ? rows.map(machineryCardHtml).join('') : '<p class="ops-subtle">No machinery installed on this side.</p>'}
    </div>`;
  }
  function vehicleServiceSpecsHtml(v){
    return [
      specValue('Make/model',v.make_model),
      specValue('Year',v.year),
      specValue('Fuel',v.fuel_type),
      specValue('Engine',v.engine_code),
      specValue('Engine oil',[v.engine_oil_grade,v.engine_oil_volume_l?`${v.engine_oil_volume_l} L`:''].filter(Boolean).join(' · ')),
      specValue('Oil filter',v.oil_filter_part_number),
      specValue('Air filter',v.engine_air_filter_part_number),
      specValue('Service interval',[v.service_interval_km?`${v.service_interval_km} km`:'',v.service_interval_months?`${v.service_interval_months} months`:''].filter(Boolean).join(' or '))
    ].filter(Boolean).join('');
  }
  function vehicleAssetCardHtml(v, machineryRows){
    const driver = machineryRows.filter(w=>w.mounting_side==='Driver');
    const passenger = machineryRows.filter(w=>w.mounting_side==='Passenger');
    return `<div class="ops-vehicle-asset">
      <div class="ops-vehicle-asset-head">
        <div>
          <div class="ops-asset-id">${esc(normalizeRego(v.rego) || 'Vehicle')}</div>
          <strong>${esc(v.name || v.make_model || 'Vehicle')}</strong>
          <div class="ops-asset-meta"><span>${statusPill(v.status)}</span>${v.assigned_driver?`<span>Driver: ${esc(v.assigned_driver)}</span>`:''}${v.current_odometer?`<span>Odometer: ${esc(v.current_odometer)} km</span>`:''}</div>
          <div class="ops-spec-list">${vehicleServiceSpecsHtml(v) || '<div class="ops-subtle">No vehicle service specifications entered.</div>'}</div>
          ${v.service_notes || v.notes ? `<div class="ops-service-note"><strong>Current service state / notes</strong><br>${esc(v.service_notes || v.notes)}</div>` : ''}
        </div>
        ${canManage()?`<button class="ops-btn ghost" type="button" data-ops-edit-vehicle="${esc(v.id)}">Edit vehicle</button>`:''}
      </div>
      <div class="ops-machinery-sides">${sideMachineryHtml(v,'Driver',driver)}${sideMachineryHtml(v,'Passenger',passenger)}</div>
    </div>`;
  }
  function assetEditorHtml(){
    const editingVehicle=Boolean(state.editingVehicleId);
    const editingMachinery=Boolean(state.editingWashId);
    const selectedType=editingVehicle?'vehicle':editingMachinery?'machinery':state.assetAddType;
    const title=editingVehicle?'Edit vehicle':editingMachinery?'Edit machinery':'Add Asset';
    return `<div class="ops-card" style="margin-top:1rem">
      <div class="ops-section-title"><h3>${title}</h3><button class="ops-btn ghost" type="button" data-ops-action="closeAssetEditor">Cancel</button></div>
      ${!editingVehicle&&!editingMachinery?`<label style="display:block;max-width:420px;margin-bottom:1rem"><strong>What type of asset do you want to add?</strong><select id="opsAssetAddType" style="display:block;width:100%;margin-top:.35rem"><option value=""></option><option value="vehicle" ${selectedType==='vehicle'?'selected':''}>Vehicle (asset)</option><option value="machinery" ${selectedType==='machinery'?'selected':''}>Machinery (sub-asset)</option></select></label>`:''}
      ${selectedType==='vehicle'?vehicleFormHtml():selectedType==='machinery'?washingFormHtml():'<p class="ops-subtle">Choose Vehicle or Machinery to continue.</p>'}
    </div>`;
  }
  function assetsHtml(){
    const vehicles = state.vehicles.map(v=>({v,rows:vehicleMachinery(v.id)}));
    const unassigned = state.washEquipment.filter(w=>!w.assigned_vehicle_id);
    return `${canManage()?'<div class="ops-actions ops-assets-actions"><button class="ops-btn primary" type="button" data-ops-action="openAssetEditor">Add Asset</button></div>':''}
    ${canManage()&&(state.assetEditorOpen||state.editingVehicleId||state.editingWashId||state.prefillMachineryVehicleId)?assetEditorHtml():''}
    ${canManage()&&state.transferringMachineryId?machineryTransferFormHtml():''}
    ${!canManage()?'<div class="ops-card"><p class="ops-subtle">Read-only. Ask an Admin or Equipment Manager to edit assets.</p></div>':''}
    ${vehicles.length ? vehicles.map(x=>vehicleAssetCardHtml(x.v,x.rows)).join('') : '<div class="ops-card"><p class="ops-subtle">No vehicles added yet.</p></div>'}
    <div class="ops-card ops-unassigned"><div class="ops-section-title"><div><h3>Unassigned machinery</h3><p class="ops-subtle">Machinery held as a spare or not currently installed on a vehicle.</p></div></div>
      ${unassigned.length ? unassigned.map(machineryCardHtml).join('') : '<p class="ops-subtle">No unassigned machinery.</p>'}
    </div>`;
  }

  function inspectionHtml(){
    if(!canSubmit()) return '<div class="ops-card"><h3>New inspection</h3><p>Your role can view Operations, but cannot submit inspections.</p></div>';
    const defaultTemplate = state.templates.find(t=>t.name==='Periodic Vehicle Checks - Google Form') || state.templates.find(t=>t.target_type==='washing_equipment') || state.templates[0] || {};
    return `<div class="ops-card"><h3>New inspection</h3>${inspectionFormHtml(defaultTemplate.id || '')}</div>`;
  }
  function inspectionFormHtml(templateId){
    const template = state.templates.find(t => t.id === templateId) || vehicleChecklistTemplate() || {};
    const type = template.target_type || 'vehicle';
    return `<form id="opsInspectionForm" class="ops-form">
      <input type="hidden" id="opsInspectionTemplate" value="${esc(template.id || '')}">
      <label>Inspection date *<input id="opsInspectionDate" type="date" value="${today()}" required></label>
      <label>Inspector<input id="opsInspectorName" value="${esc(inspectorDisplayName())}" readonly></label>
      ${['vehicle','combined'].includes(type) ? `<label>Vehicle *<select id="opsInspectionVehicle" required><option value="">Select vehicle</option>${state.vehicles.filter(v=>v.status==='Active').map(v=>`<option value="${v.id}">${esc(v.rego || v.name)}</option>`).join('')}</select></label>` : ''}
      ${['washing_equipment','combined'].includes(type) ? `<label>Machinery<select id="opsInspectionWash"><option value="">Select machinery</option>${state.washEquipment.filter(w=>['Active','Quarantined'].includes(w.status)).map(w=>`<option value="${w.id}">${esc(machineryIdentifier(w))}</option>`).join('')}</select></label>` : ''}
      <label>Odometer / mileage<input id="opsInspectionOdo" type="number" step="0.1"></label>
      <label class="ops-span-2">General notes<textarea id="opsInspectionNotes"></textarea></label>
      <div class="ops-span-2"><h3>Checklist</h3>${checklistQuestionsHtml(template.id)}</div>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Submit vehicle check</button></div>
    </form>`;
  }
  function checklistQuestionsHtml(templateId){
    const template = state.templates.find(t=>t.id===templateId);
    const isVehicleChecklist = ['vehicle','combined'].includes(template?.target_type);
    const items = state.checklistItems
      .filter(i=>i.template_id===templateId && i.is_active!==false)
      .filter(i=>!isVehicleChecklist || String(i.section||'').trim().toLowerCase()!=='vehicle checks')
      .sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    if(!items.length) return '<p class="ops-subtle">No checklist questions found. Run the V4 SQL migration or add checklist items in Supabase.</p>';
    const groups = [];
    items.forEach(item => {
      const section = item.section || 'Checklist';
      let g = groups.find(x => x.section === section);
      if(!g){ g = { section, items: [] }; groups.push(g); }
      g.items.push(item);
    });
    return groups.map(g => `<div class="ops-check-section"><h4>${esc(g.section)}</h4>${g.items.map(item => { const photoItem=itemAllowsPhoto(item); return `<div class="ops-question" data-item-id="${item.id}" ${photoItem?'data-photo-required="true"':''}>
      <strong>${esc(item.question_text)}</strong>
      ${item.help_text ? `<div class="ops-subtle">${esc(item.help_text)}</div>` : ''}
      ${photoItem ? `<input class="ops-answer-value" type="hidden" value="Completed OK">
      <div class="ops-question-photo">
        <div class="ops-actions">
          <label class="ops-btn primary ops-photo-button">Camera<input class="ops-item-photo" type="file" accept="image/*" capture="environment"></label>
          <label class="ops-btn ghost ops-photo-button">Gallery<input class="ops-item-photo" type="file" accept="image/*" multiple></label>
        </div>
        <div class="ops-subtle ops-photo-count">No photos selected.</div>
      </div>` : `<div class="ops-form">
        <label>Status / response *${answerInputHtml(item)}</label>
        <label>Notes<input class="ops-answer-notes" placeholder="Notes if needed"></label>
      </div>`}
    </div>`; }).join('')}</div>`).join('');
  }
  function answerInputHtml(item){
    const type = item.response_type;
    if(type === 'number') return `<input class="ops-answer-value" type="number" step="0.1" ${item.required?'required':''}>`;
    if(type === 'text') return `<input class="ops-answer-value" ${item.required?'required':''}>`;
    let opts = ['Completed OK','Issue to report','N/A'];
    if(type === 'choice' && Array.isArray(item.response_options) && item.response_options.length) opts = item.response_options;
    return `<select class="ops-answer-value" ${item.required?'required':''}><option value=""></option>${opts.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
  }

  function updateInspectionPhotoCount(input){
    const panel = input.closest('.ops-question-photo');
    if(!panel) return;
    const count = Array.from(panel.querySelectorAll('.ops-item-photo')).reduce((total, el)=>total+(el.files?.length||0),0);
    const label = panel.querySelector('.ops-photo-count');
    if(label) label.textContent = count ? `${count} photo${count===1?'':'s'} selected.` : 'No photos selected.';
  }

  function tasksHtml(){
    const label = state.taskQuickFilter ? `<span class="badge">Filtered: ${esc(taskQuickFilterLabel())}</span> <button class="ops-btn ghost" type="button" data-ops-action="clearTaskFilter">Clear filter</button>` : '';
    return `<div class="ops-card"><div class="ops-section-title"><h3>Tasks</h3><div>${label}</div></div>${canMaintain()?manualTaskFormHtml():''}${taskTableHtml()}</div>${state.openTaskId ? taskDetailHtml(state.openTaskId) : ''}`;
  }
  function taskQuickFilterLabel(){ return ({open:'Open tasks', waiting:'Waiting on parts/someone'}[state.taskQuickFilter] || state.taskQuickFilter || 'Filtered'); }
  function manualTaskFormHtml(){
    return `<details><summary><strong>Add manual task</strong></summary><form id="opsManualTaskForm" class="ops-form" style="margin-top:.8rem">
      <label>Target type<select id="opsManualTargetType"><option value="washing_equipment">Machinery</option><option value="vehicle">Vehicle</option></select></label>
      <label>Machinery<select id="opsManualWash"><option value="">None</option>${state.washEquipment.map(w=>`<option value="${w.id}">${esc(machineryIdentifier(w))}</option>`).join('')}</select></label>
      <label>Vehicle<select id="opsManualVehicle"><option value="">None</option>${state.vehicles.map(v=>`<option value="${v.id}">${esc(v.rego || v.name)}</option>`).join('')}</select></label>
      <label>Title<input id="opsManualTitle" required></label>
      <label><span>Apply to matching machinery type</span><select id="opsManualApplyScope"><option value="single">Standalone/single task only</option><option value="same_type">Create one for all machinery of the same type</option></select></label>
      <label>Priority<select id="opsManualPriority">${optionList(PRIORITIES,'Medium')}</select></label>
      <label>Due date<input id="opsManualDue" type="date"></label>
      <label class="ops-span-2">Description<textarea id="opsManualDescription"></textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Create task</button></div>
    </form></details>`;
  }
  function taskMiniListHtml(rows){
    if(!rows.length) return '<p class="ops-subtle">No open tasks.</p>';
    return rows.map(t=>`<div class="ops-step"><strong>${esc(t.title)}</strong><br>${statusPill(t.status)} ${statusPill(t.priority)}<br><span class="ops-subtle">${esc(targetName(t))} · Due ${nzDate(t.due_date)}</span></div>`).join('');
  }
  function taskTableHtml(){
    let rows = state.tasks.slice();
    if(state.taskQuickFilter === 'open') rows = rows.filter(t => !['Completed','Deferred'].includes(t.status));
    if(state.taskQuickFilter === 'waiting') rows = rows.filter(t => ['Waiting on Parts','Waiting on Someone'].includes(t.status));
    rows = rows.sort((a,b)=> statusRank(a.status)-statusRank(b.status) || String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')));
    if(!rows.length) return '<p class="ops-subtle">No tasks yet.</p>';
    return `<div class="ops-table-wrap" style="margin-top:1rem"><table class="ops-table"><tr><th>Status</th><th>Priority</th><th>Task</th><th>Target</th><th>Source</th><th>Due</th><th>Actions</th></tr>${rows.map(t=>`<tr><td>${statusPill(t.status)}</td><td>${statusPill(t.priority)}</td><td><strong>${esc(t.title)}</strong><br><span class="ops-subtle">${esc(t.description||'')}</span></td><td>${esc(targetName(t))}</td><td>${esc(t.source_type)}</td><td>${nzDate(t.due_date)}</td><td><button class="ops-btn ghost" data-ops-open-task="${t.id}">Open</button></td></tr>`).join('')}</table></div>`;
  }
  function statusRank(s){ return {'Open':0,'In Progress':1,'Waiting on Parts':2,'Waiting on Someone':3,'Deferred':4,'Completed':5}[s] ?? 5; }

  function taskDetailHtml(taskId){
    const t = state.tasks.find(x=>x.id===taskId); if(!t) return '';
    const proc = state.procedures.find(p=>p.id===t.procedure_id);
    const steps = state.procedureSteps.filter(s=>s.procedure_id===t.procedure_id).sort((a,b)=>a.step_number-b.step_number);
    return `<div class="ops-card" style="margin-top:1rem"><h3>${esc(t.title)}</h3>
      <p>${statusPill(t.status)} ${statusPill(t.priority)} <span class="ops-subtle">${esc(targetName(t))}</span></p>
      ${proc ? `<h3>Guide: ${esc(proc.name)}</h3><p>${esc(proc.description||'')}</p><p><strong>Safety:</strong> ${esc(proc.safety_summary||'')}</p><p><strong>Tools:</strong> ${esc(proc.tools_required||'')}</p><p><strong>Parts:</strong> ${esc(proc.parts_required||'')}</p>` : ''}
      ${steps.length ? `<form id="opsTaskCompleteForm" class="ops-form"><div class="ops-span-2">${steps.map(s=>`<div class="ops-step"><label><input type="checkbox" class="ops-task-step" value="${s.id}"> <strong>${s.step_number}. ${esc(s.title)}</strong></label><p>${esc(s.instruction)}</p>${s.safety_note?`<p class="ops-subtle"><strong>Safety:</strong> ${esc(s.safety_note)}</p>`:''}</div>`).join('')}</div>
        <label>New status<select id="opsTaskStatus">${optionList(TASK_STATUSES,t.status)}</select></label>
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
    const label = state.scheduleQuickFilter === 'due' ? `<span class="badge">Filtered: Due/overdue</span> <button class="ops-btn ghost" type="button" data-ops-action="clearScheduleFilter">Clear filter</button>` : '';
    return `<div class="ops-card"><div class="ops-section-title"><div><h3>Preventive maintenance</h3><p class="ops-subtle">Use standard templates for water blaster engines, pumps, hose reels and unloaders, or add a standalone schedule.</p></div><div>${label}</div></div>${canMaintain()?standardMaintenanceHtml()+scheduleFormHtml():''}${scheduleTableHtml()}${canMaintain()?'<div class="ops-actions"><button class="ops-btn primary" data-ops-action="generateDueTasks">Generate due tasks</button></div>':''}</div>`;
  }
  function standardProcedures(){
    const names = ['Engine pre-start inspection','Engine oil level check','Engine oil change','Air filter check/replacement','Spark plug inspection/replacement','Fuel tank water/grit removal with syringe','Fuel line and leak inspection','Pump oil level and condition check','Pump oil change','Pump leak and fitting check','Unloader valve check','Hose reel inspection','Trigger gun and lance inspection','Quick-connect fitting and O-ring replacement','Nozzle inspection and replacement','End-of-day rinse-down and storage procedure'];
    return state.procedures.filter(p => p.is_active !== false && names.includes(p.name));
  }
  function standardMaintenanceHtml(){
    return `<details open><summary><strong>Standard maintenance templates</strong></summary><div class="ops-form" style="margin-top:.8rem">
      <label>Machinery<select id="opsStdWash">${state.washEquipment.map(w=>`<option value="${w.id}">${esc(machineryIdentifier(w))} (${esc(machineryTypeLabel(w))})</option>`).join('')}</select></label>
      <label>Default next due date<input id="opsStdNextDate" type="date" value="${addDays(today(), 30)}"></label>
      <div class="ops-span-2"><div class="ops-subtle">These procedure templates will be attached as date-based schedules. Adding a new Water Blaster item also automatically receives these templates.</div>${standardProcedures().map(p=>`<label class="ops-check"><input type="checkbox" class="ops-std-proc" value="${p.id}" checked> ${esc(p.name)} ${p.frequency_days?`(${p.frequency_days} days)`:''}</label>`).join('') || '<p class="ops-subtle">No standard procedures found. Run the V4.0.4 migration.</p>'}</div>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="button" data-ops-action="applyStdSelected">Apply to selected machinery</button><button class="ops-btn ghost" type="button" data-ops-action="applyStdSameType">Apply to all machinery of same type</button></div>
    </div></details>`;
  }
  function scheduleFormHtml(){
    return `<details><summary><strong>Add standalone maintenance schedule</strong></summary><form id="opsScheduleForm" class="ops-form" style="margin-top:.8rem">
      <label>Machinery<select id="opsScheduleWash" required>${state.washEquipment.map(w=>`<option value="${w.id}">${esc(machineryIdentifier(w))}</option>`).join('')}</select></label>
      <label>Procedure<select id="opsScheduleProcedure" required>${state.procedures.filter(p=>p.is_active!==false).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <label>Frequency days<input id="opsScheduleFreqDays" type="number" min="1" placeholder="e.g. 180"></label>
      <label>Next due date<input id="opsScheduleNextDate" type="date"></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save standalone schedule</button></div>
    </form></details>`;
  }
  function scheduleTableHtml(){
    let scheduleRows = state.schedules.slice();
    if(state.scheduleQuickFilter === 'due') scheduleRows = scheduleRows.filter(scheduleIsDue);
    if(!scheduleRows.length) return '<p class="ops-subtle">No preventive maintenance schedules match the current filter.</p>';
    return `<div class="ops-table-wrap" style="margin-top:1rem"><table class="ops-table"><tr><th>Machinery</th><th>Procedure</th><th>Frequency</th><th>Next due</th><th>Status</th></tr>${scheduleRows.map(s=>{ const w=state.washEquipment.find(x=>x.id===s.washing_equipment_id); const p=state.procedures.find(x=>x.id===s.procedure_id); return `<tr><td>${esc(w ? machineryIdentifier(w) : 'Unknown')}</td><td>${esc(p?.name||'Unknown')}</td><td>${esc(s.frequency_days||p?.frequency_days||'—')} days</td><td>${nzDate(s.next_due_at)}</td><td>${scheduleIsDue(s)?'<span class="ops-pill ops-bad">Due</span>':'<span class="ops-pill ops-ok">Scheduled</span>'}</td></tr>`; }).join('')}</table></div>`;
  }
  function scheduleIsDue(s){
    if(s.is_active === false) return false;
    return !!(s.next_due_at && daysUntil(s.next_due_at) <= 0);
  }

  async function applyDefaultSchedulesForEquipment(wash){
    const w = typeof wash === 'string' ? (state.washEquipment.find(x=>x.id===wash) || {id:wash, equipment_type:''}) : (wash || {});
    if(!/water\s*blaster|engine|gearbox|pump/i.test(String(w.equipment_type || ''))) return;
    const procs = standardProcedures();
    if(procs.length) await upsertSchedulesForWashIds([w.id], procs.map(p=>p.id), addDays(today(), 30));
  }
  async function applyStandardSchedules(scope){
    if(!canMaintain()) return alert('Only Admin or Equipment Manager users can apply schedules.');
    const washId = byId('opsStdWash')?.value;
    if(!washId) return alert('Choose machinery first.');
    const selectedProcIds = Array.from(document.querySelectorAll('.ops-std-proc:checked')).map(x=>x.value);
    if(!selectedProcIds.length) return alert('Choose at least one maintenance template.');
    let washIds = [washId];
    if(scope === 'same_type'){
      const base = state.washEquipment.find(w=>w.id===washId);
      if(base) washIds = state.washEquipment.filter(w=>w.equipment_type === base.equipment_type).map(w=>w.id);
    }
    await upsertSchedulesForWashIds(washIds, selectedProcIds, byId('opsStdNextDate')?.value || addDays(today(),30));
    alert(`Applied ${selectedProcIds.length} template${selectedProcIds.length===1?'':'s'} to ${washIds.length} machinery item${washIds.length===1?'':'s'}.`);
    await loadAll();
  }
  async function upsertSchedulesForWashIds(washIds, procedureIds, nextDate){
    const rows = [];
    for(const washId of washIds){
      for(const procId of procedureIds){
        const p = state.procedures.find(x=>x.id===procId) || {};
        const existing = state.schedules.find(s=>s.washing_equipment_id===washId && s.procedure_id===procId);
        const row = { washing_equipment_id:washId, procedure_id:procId, frequency_days:p.frequency_days || 90, next_due_at:nextDate || addDays(today(), p.frequency_days || 90), is_active:true, created_by:state.user.id };
        if(existing) await state.sb.from('operations_equipment_maintenance_schedules').update(row).eq('id', existing.id);
        else rows.push(row);
      }
    }
    if(rows.length) await state.sb.from('operations_equipment_maintenance_schedules').insert(rows);
  }



  function roleChips(roles){
    return (roles || []).map(r=>`<span class="ops-role-chip">${esc(r)}</span>`).join('') || '<span class="ops-subtle">No roles</span>';
  }

  function roleHelpText(role){
    return {
      'Admin':'Full app administration and user management.',
      'Inspector':'Run inspections and complete vehicle checks.',
      'Equipment Manager':'Manage equipment, assets, tasks and schedules.',
      'Certificate Approver':'Generate and manage certificates.',
      'Office / Reports':'View and export reports.',
      'Viewer':'Read-only access.'
    }[role] || '';
  }

  function roleCheckboxGridForUser(userId, roles){
    const lockOwnPermissions=String(userId)===String(state.user?.id);
    return ROLE_DEFS.map(role => `<label class="ops-permission-check"><input type="checkbox" data-ops-role-user="${esc(userId)}" value="${esc(role)}" ${roles.includes(role) ? 'checked' : ''} ${lockOwnPermissions ? 'disabled' : ''}> <span><strong>${esc(role)}</strong><small>${esc(roleHelpText(role))}</small></span></label>`).join('');
  }

  function roleCheckboxGridForPreload(roles){
    return ROLE_DEFS.map(role => `<label class="ops-permission-check"><input type="checkbox" data-ops-preload-role value="${esc(role)}" ${roles.includes(role) ? 'checked' : ''}> <span><strong>${esc(role)}</strong><small>${esc(roleHelpText(role))}</small></span></label>`).join('');
  }

  function userIdOfProfile(u){ return u.user_id || u.id || ''; }
  function emailOfProfile(u){ return u.email || u.user_email || ''; }
  function displayNameOfProfile(u){
    return titleCaseName(u.display_name || u.full_name || u.name || [u.first_name,u.last_name].filter(Boolean).join(' ') || String(emailOfProfile(u)).split('@')[0] || 'User');
  }
  function matchingPreloadedUser(u, fallbackUser={}){
    const email=String(emailOfProfile(u||{})||emailOfProfile(fallbackUser||{})).trim().toLowerCase();
    return email ? (state.pendingUsers||[]).find(candidate=>String(emailOfProfile(candidate||{})).trim().toLowerCase()===email) : null;
  }
  function maintenanceUserName(u, fallbackUser={}){
    const matched=matchingPreloadedUser(u,fallbackUser);
    const records=[u,matched,fallbackUser].filter(Boolean);
    for(const record of records){
      const first=String(record.first_name||record.firstName||record.user_metadata?.first_name||record.user_metadata?.firstName||'').trim();
      const last=String(record.last_name||record.lastName||record.user_metadata?.last_name||record.user_metadata?.lastName||'').trim();
      if(first&&last)return titleCaseName(`${first} ${last}`);
    }
    for(const record of records){
      const name=record.display_name||record.full_name||record.name||record.user_metadata?.full_name||record.user_metadata?.name||'';
      if(name)return titleCaseName(name);
    }
    const first=String(u?.first_name||u?.firstName||fallbackUser?.user_metadata?.first_name||fallbackUser?.user_metadata?.firstName||'').trim();
    return titleCaseName(first||String(emailOfProfile(u||fallbackUser||{})).split('@')[0]);
  }
  function maintenancePerformedByOptions(){
    const current=inspectorDisplayName();
    const userNames=[...(state.maintenanceUsers||[]),...(state.pendingUsers||[])]
      .filter(user=>user&&user.active!==false)
      .map(user=>maintenanceUserName(user))
      .filter(Boolean);
    const ordered=[current,...userNames.filter(name=>name!==current).sort((a,b)=>a.localeCompare(b))];
    const users=[...new Set(ordered)];
    return users.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('')
      +['Pressure Solutions','Blastpro','Agripower','Other service agent'].map(name=>`<option value="${name}">${name}</option>`).join('');
  }
  function rolesForActualUser(userId){
    return (state.actualUserRoles || []).filter(r => String(r.user_id) === String(userId)).map(r => r.role).filter(Boolean);
  }
  function actualUsersHtml(){
    const users = (state.actualUsers || []).slice().sort((a,b) => displayNameOfProfile(a).localeCompare(displayNameOfProfile(b)) || emailOfProfile(a).localeCompare(emailOfProfile(b)));
    if(!users.length) return '<p class="ops-subtle">No signed-in user profiles found yet.</p>';
    return users.map(u => {
      const id = userIdOfProfile(u);
      const email = emailOfProfile(u);
      const roles = rolesForActualUser(id);
      const editing=String(state.editingActualUserId)===String(id);
      return `<div class="ops-user-row">
        <div class="ops-user-row-head">
          <div><strong>${esc(displayNameOfProfile(u))}</strong><div class="ops-subtle">${esc(email || id)}${u.last_seen ? ' · Last seen: ' + esc(nzDate(u.last_seen)) : ''}</div></div>
          <div>${roleChips(roles)}</div>
        </div>
        ${editing?`<label class="ops-user-full-name">Full name<input type="text" data-ops-user-full-name="${esc(id)}" value="${esc(displayNameOfProfile(u))}" placeholder="First and last name"></label>
        <div class="ops-permission-grid" style="margin-top:.75rem">${roleCheckboxGridForUser(id, roles)}</div>
        <div class="ops-actions"><button class="ops-btn primary" type="button" data-ops-save-user="${esc(id)}">Save user</button><button class="ops-btn ghost" type="button" data-ops-cancel-user-edit>Cancel</button></div>`:`<div class="ops-actions"><button class="ops-btn" type="button" data-ops-edit-user="${esc(id)}">Edit user</button></div>`}
      </div>`;
    }).join('');
  }

  function usersHtml(){
    if(!isAdmin()) return `<div class="ops-card"><h3>Users & permissions</h3><p>Only Admin users can pre-load and manage users.</p></div>`;
    const rows = state.pendingUsers || [];
    const defaultRoles = ['Inspector'];
    return `<div class="ops-card">
      <h3>Users & permissions</h3>
      <p class="ops-subtle">One clean permissions list is used across the app. Tick the roles each user needs, then save.</p>
      <form id="opsPreloadUserForm" class="ops-form">
        <label>First name<input id="opsPreloadFirst" required placeholder="e.g. Jamie"></label>
        <label>Last name<input id="opsPreloadLast" required placeholder="e.g. Benioni"></label>
        <label>Email<input id="opsPreloadEmail" type="email" required placeholder="name@example.com"></label>
        <label>Status<select id="opsPreloadActive"><option value="true">Active</option><option value="false">Inactive</option></select></label>
        <div class="ops-span-2"><strong>Permissions for pre-loaded user</strong><div class="ops-permission-grid">${roleCheckboxGridForPreload(defaultRoles)}</div></div>
        <label class="ops-span-2">Notes<textarea id="opsPreloadNotes" placeholder="Optional setup notes"></textarea></label>
        <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Pre-load user</button></div>
      </form>
    </div>
    <div class="ops-card">
      <h3>Signed-in users</h3>
      <p class="ops-subtle">Manage the same standard role checkboxes for each signed-in user.</p>
      ${actualUsersHtml()}
    </div>
    <div class="ops-card">
      <h3>Pre-loaded users</h3>
      ${rows.length ? `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th>Claimed</th></tr>${rows.map(u=>`<tr><td>${esc(u.display_name || [u.first_name,u.last_name].filter(Boolean).join(' '))}</td><td>${esc(u.email)}</td><td>${roleChips(u.roles||[])}</td><td>${u.active ? statusPill('Active') : statusPill('Inactive')}</td><td>${u.claimed_at ? nzDate(u.claimed_at) : 'Not yet'}</td></tr>`).join('')}</table></div>` : '<p class="ops-subtle">No pre-loaded users yet.</p>'}
    </div>`;
  }

  function updatePreloadRolePreview(){ /* Permission presets removed in V4.0.30. */ }

  async function saveActualUserRoles(userId){
    if(!isAdmin()) return alert('Only Admin users can manage permissions.');
    const roles = Array.from(document.querySelectorAll('input[data-ops-role-user]'))
      .filter(i => String(i.dataset.opsRoleUser) === String(userId) && i.checked)
      .map(i => i.value);
    await writeActualUserRoles(userId, roles);
    alert('User permissions saved.');
    await loadAll();
  }

  async function saveActualUser(userId){
    if(!isAdmin()) return alert('Only Admin users can update users.');
    const input=document.querySelector(`[data-ops-user-full-name="${CSS.escape(String(userId))}"]`);
    const displayName=titleCaseName(input?.value||'');
    if(!displayName)return alert('Enter a first and last name.');
    if(displayName.split(' ').length<2)return alert('Enter both the first and last name.');
    const r=await state.sb.from('profiles').update({display_name:displayName}).eq('user_id',userId);
    if(r.error)return alert('Could not save the full name: '+r.error.message);
    const roles = Array.from(document.querySelectorAll('input[data-ops-role-user]'))
      .filter(i => String(i.dataset.opsRoleUser) === String(userId) && i.checked)
      .map(i => i.value);
    const editingOwnAccount=String(userId)===String(state.user?.id);
    if(editingOwnAccount){
      const currentRoles=rolesForActualUser(userId).slice().sort();
      const selectedRoles=roles.slice().sort();
      if(currentRoles.join('|')!==selectedRoles.join('|')){
        return alert('To protect access, you cannot change your own permissions here. Another Admin can do that for you.');
      }
    }else{
      if(!roles.length)return alert('Select at least one permission for this user.');
      await writeActualUserRoles(userId, roles);
    }
    state.editingActualUserId='';
    alert('User saved. The full name will now be used in Performed by.');
    await loadAll();
  }

  async function writeActualUserRoles(userId, roles){
    if(!userId) throw new Error('Missing user id.');
    const del = await state.sb.from('user_roles').delete().eq('user_id', userId);
    if(del.error) return alert(del.error.message);
    const rows = (roles || []).map(role => ({ user_id:userId, role }));
    if(rows.length){
      const ins = await state.sb.from('user_roles').insert(rows);
      if(ins.error) return alert(ins.error.message);
    }
    if(String(userId) === String(state.user?.id)) await loadRoles();
  }

  async function savePreloadedUser(e){
    e.preventDefault();
    if(!isAdmin()) return alert('Only Admin users can pre-load users.');
    const first = titleCaseName(byId('opsPreloadFirst')?.value || '');
    const last = titleCaseName(byId('opsPreloadLast')?.value || '');
    const email = String(byId('opsPreloadEmail')?.value || '').trim().toLowerCase();
    const roles = Array.from(document.querySelectorAll('input[data-ops-preload-role]:checked')).map(i => i.value);
    if(!first || !last || !email) return alert('First name, last name and email are required.');
    if(!roles.length) return alert('Select at least one permission for this user.');
    const row = { first_name:first, last_name:last, display_name:`${first} ${last}`, email, role_preset:null, roles, active: byId('opsPreloadActive')?.value !== 'false', notes: byId('opsPreloadNotes')?.value || null, created_by: state.user.id };
    const r = await state.sb.from('operations_preloaded_users').upsert(row, { onConflict:'email' }).select().single();
    if(r.error) return alert(r.error.message);
    alert('User pre-loaded. When they sign in with this email, their profile and roles will be applied.');
    state.currentView = 'admin-users';
    await loadAll();
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
    const raw = String(value || '—');
    const v = displayStatusLabel(raw);
    const good = ['Pass','Completed OK','Active','Completed','Low'];
    const bad = ['Problem','Fail','Issue to report','Quarantined','Open','High','Critical'];
    const warn = ['In Progress','Waiting on Parts','Medium'];
    const cls = good.includes(raw) || good.includes(v) ? 'ops-ok' : bad.includes(raw) || bad.includes(v) ? 'ops-bad' : warn.includes(raw) || warn.includes(v) ? 'ops-warn' : 'ops-muted';
    return `<span class="ops-pill ${cls}">${esc(v)}</span>`;
  }



  async function openQualificationFile(path){
    try{
      const r = await state.sb.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 10);
      if(r.error) throw r.error;
      window.open(r.data.signedUrl, '_blank');
    }catch(err){ alert('Could not open file: ' + (err.message || err)); }
  }

  function itemIsProblem(item, answer){
    if(/(?:Record reading from TDS Meter|Measure pure water system)/i.test(String(item?.question_text||''))){
      const reading=Number(answer);
      return Number.isFinite(reading) && reading>10;
    }
    const problems = Array.isArray(item.problem_values) ? item.problem_values : [];
    const problemStrings = problems.map(String);
    return problemStrings.includes(String(answer)) || ['Issue to report','Fail','Yes'].includes(String(answer));
  }


  async function submitInspection(e){
    e.preventDefault(); if(!canSubmit()) return alert('Your role cannot submit Operations inspections.');
    const template = state.templates.find(t=>t.id===byId('opsInspectionTemplate').value) || vehicleChecklistTemplate();
    if(!template || !template.id) return alert('Vehicle Inspection Checklist is not available. Run the V4.0.4 migration.');
    const targetType = template.target_type;
    const vehicleId = byId('opsInspectionVehicle')?.value || null;
    const washId = byId('opsInspectionWash')?.value || null;
    const answerRows = [];
    const itemPhotos = [];
    let hasProblem = false;
    try{
      document.querySelectorAll('.ops-question').forEach(q => {
      const item = state.checklistItems.find(i=>i.id===q.dataset.itemId);
      if(!item) return;
      const input = q.querySelector('.ops-answer-value');
      const answer = input?.value || '';
      if(input?.hasAttribute('required') && !answer){ throw new Error('Please answer every checklist item before submitting.'); }
      const notes = q.querySelector('.ops-answer-notes')?.value || '';
      const problem = itemIsProblem(item, answer);
      if(problem) hasProblem = true;
      const photoFiles = Array.from(q.querySelectorAll('.ops-item-photo')).flatMap(input=>Array.from(input.files||[]));
      if(q.dataset.photoRequired==='true' && !photoFiles.length){ throw new Error('Upload at least one photo of the cleaned vehicle or cab before submitting.'); }
      answerRows.push({ item, answer, notes, problem });
      photoFiles.forEach(file=>itemPhotos.push({ item, file }));
    });
    }catch(err){ return alert(err.message); }
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

    for(const p of itemPhotos){ await uploadInspectionPhoto(inspectionId, p.file, p.item.id, p.item.question_text); }

    alert(`Inspection saved. ${taskRows.length} maintenance task${taskRows.length===1?'':'s'} created.`);
    state.currentView = 'history';
    await loadAll();
  }

  async function uploadInspectionPhoto(inspectionId, file, checklistItemId, caption){
    const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `operations-inspections/${inspectionId}/${Date.now()}-${clean}`;
    const up = await state.sb.storage.from(PHOTO_BUCKET).upload(path, file, { cacheControl:'3600', upsert:false, contentType:file.type || 'image/jpeg' });
    if(up.error){ alert('Photo upload failed: ' + up.error.message); return; }
    const r = await state.sb.from('operations_inspection_photos').insert({ inspection_id: inspectionId, checklist_item_id: checklistItemId || null, bucket: PHOTO_BUCKET, storage_path: path, file_name: file.name, caption: caption || null, uploaded_by: state.user.id });
    if(r.error) alert('Photo metadata failed: ' + r.error.message);
  }

  async function createManualTask(e){
    e.preventDefault(); if(!canMaintain()) return alert('Only Admin or Equipment Manager users can create tasks.');
    const targetType = byId('opsManualTargetType').value;
    const selectedMachineryId = byId('opsManualWash').value || null;
    const selectedMachinery = state.washEquipment.find(w=>String(w.id)===String(selectedMachineryId||''));
    const row = {
      source_type: 'Manual',
      target_type: targetType,
      vehicle_id: targetType==='washing_equipment'?(selectedMachinery?.assigned_vehicle_id||null):(byId('opsManualVehicle').value || null),
      washing_equipment_id: selectedMachineryId,
      title: byId('opsManualTitle').value.trim(),
      description: byId('opsManualDescription').value.trim() || null,
      status: 'Open',
      priority: byId('opsManualPriority').value,
      due_date: byId('opsManualDue').value || null,
      created_by: state.user.id
    };
    if(!row.title) return alert('Task title is required.');
    let rows = [row];
    const scope = byId('opsManualApplyScope')?.value || 'single';
    if(scope === 'same_type' && row.target_type === 'washing_equipment' && row.washing_equipment_id){
      const base = state.washEquipment.find(w=>w.id===row.washing_equipment_id);
      if(base){
        rows = state.washEquipment.filter(w=>w.equipment_type === base.equipment_type).map(w => ({...row, washing_equipment_id:w.id, vehicle_id:w.assigned_vehicle_id||null, title: row.title}));
      }
    }
    const r = await state.sb.from('operations_maintenance_tasks').insert(rows);
    if(r.error) return alert(r.error.message);
    await loadAll();
  }

  async function saveTaskUpdate(e){
    e.preventDefault(); if(!canMaintain()) return alert('Only Admin or Equipment Manager users can update tasks.');
    const task = state.tasks.find(t=>t.id===state.openTaskId); if(!task) return;
    const status = byId('opsTaskStatus').value;
    const update = {
      status,
      completion_notes: byId('opsTaskNotes')?.value.trim() || null,
      completed_at: status === 'Completed' ? nowIso() : task.completed_at,
      completed_by: status === 'Completed' ? state.user.id : task.completed_by
    };
    if(status==='Completed'&&task.washing_equipment_id){
      update.vehicle_id=state.washEquipment.find(w=>String(w.id)===String(task.washing_equipment_id))?.assigned_vehicle_id||null;
    }
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
      if(schedule?.frequency_days) next.next_due_at = addDays(today(), schedule.frequency_days);
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
      next_due_at: byId('opsScheduleNextDate').value || null,
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
        vehicle_id: w?.assigned_vehicle_id || null,
        procedure_id: s.procedure_id,
        schedule_id: s.id,
        title: `${p?.name || 'Scheduled maintenance'} - ${w ? machineryIdentifier(w) : 'Machinery'}`,
        description: p?.description || 'Scheduled preventive maintenance.',
        status: 'Open',
        priority: 'Medium',
        due_date: s.next_due_at || today(),
        created_by: state.user.id
      };
      const r = await state.sb.from('operations_maintenance_tasks').insert(row);
      if(!r.error) created++;
    }
    alert(`Created ${created} due task${created===1?'':'s'}.`);
    state.currentView = 'tasks';
    await loadAll();
  }


  // V4.0.5 certificate generator hardening.
  // The original certificate generator was too dependent on exact app-side filters.
  // This replacement fetches current Height Equipment and inspections directly from Supabase,
  // handles status values such as "In Service", and matches latest inspections by equipment_id or serial.
  function certNorm(v){
    return String(v || '')
      .trim()
      .toLowerCase()
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ');
  }
  function certTypeNorm(v){
    const s = certNorm(v);
    return s.endsWith('s') ? s.slice(0, -1) : s;
  }
  function certDateVal(v){ return String(v || '').slice(0, 10); }
  function certWithinDate(v, start, end){
    const d = certDateVal(v);
    if(!d) return false;
    if(start && d < start) return false;
    if(end && d > end) return false;
    return true;
  }
  function certIsArchivedEquipment(e){
    const status = certNorm(e.status);
    return e.archived === true || !!e.disposed_at || status === 'retired' || status === 'disposed' || status === 'archived';
  }
  function certIsActiveEquipment(e){
    return !certIsArchivedEquipment(e);
  }
  function certInspectionForEquipment(e, inspections){
    const serial = certNorm(e.serial);
    const matches = (inspections || []).filter(i => {
      if(i.equipment_id && e.id && String(i.equipment_id) === String(e.id)) return true;
      return serial && certNorm(i.serial) === serial;
    });
    return matches.sort((a,b) => certDateVal(b.inspection_date).localeCompare(certDateVal(a.inspection_date)))[0] || null;
  }
  function certLatestInspectionMap(equipmentRows, inspectionRows){
    return (equipmentRows || []).map(e => ({ equipment: e, inspection: certInspectionForEquipment(e, inspectionRows || []) }));
  }
  async function certFetchHeightData(){
    if(!state.sb) throw new Error('Supabase is not ready yet. Please wait a moment and try again.');
    const [eq, ins] = await Promise.all([
      state.sb.from('equipment').select('*'),
      state.sb.from('inspections').select('*').order('inspection_date', { ascending: false })
    ]);
    if(eq.error) throw eq.error;
    if(ins.error) throw ins.error;
    return { equipmentRows: eq.data || [], inspectionRows: ins.data || [] };
  }
  function certSelectedIds(){
    return Array.from(document.querySelectorAll('.certItemCheck:checked')).map(x => x.value);
  }
  function certNoPairsMessage(kind, before, type){
    if(before > 0) return `Found ${before} matching item${before === 1 ? '' : 's'}, but none had inspection history to certify.`;
    if(kind === 'type_latest') return `No active equipment items were found for type “${type || 'selected type'}”. Check type spelling/status, or use selected items.`;
    if(kind === 'selected_items') return 'Select at least one item with inspection history.';
    return 'No matching certificate items were found for the selected parameters. Please check the selected certificate mode and items.';
  }
  function certIsDueFromPair(pair){
    const i = pair.inspection;
    if(!i) return true;
    const todayText = new Date().toISOString().slice(0, 10);
    if(i.next_due && String(i.next_due).slice(0,10) <= todayText) return true;
    if(String(i.result || '').toLowerCase().includes('fail')) return true;
    return false;
  }
  async function buildCertificatePairsV405(kind){
    const { equipmentRows, inspectionRows } = await certFetchHeightData();
    const active = equipmentRows.filter(certIsActiveEquipment);
    let pairs = [];
    let before = 0;
    let type = '';

    if(kind === 'selected_items'){
      const ids = certSelectedIds();
      if(!ids.length) return { pairs: [], before: 0, type: '' };
      const selected = equipmentRows.filter(e => ids.includes(String(e.id)));
      before = selected.length;
      pairs = certLatestInspectionMap(selected, inspectionRows);
    } else if(kind === 'type_latest'){
      type = document.getElementById('certTypeFilter')?.value || '';
      const wanted = certTypeNorm(type);
      const selected = active.filter(e => certTypeNorm(e.type) === wanted);
      before = selected.length;
      pairs = certLatestInspectionMap(selected, inspectionRows);
    } else if(kind === 'inspection_date_range'){
      const start = document.getElementById('certStartDate')?.value || '';
      const end = document.getElementById('certEndDate')?.value || '';
      const rows = inspectionRows.filter(i => certWithinDate(i.inspection_date, start, end));
      before = rows.length;
      pairs = rows.map(i => ({ inspection: i, equipment: equipmentRows.find(e => String(e.id) === String(i.equipment_id)) || equipmentRows.find(e => certNorm(e.serial) === certNorm(i.serial)) }));
    } else if(kind === 'inspection_result'){
      const result = document.getElementById('certResult')?.value || '';
      const rows = inspectionRows.filter(i => String(i.result || '') === result);
      before = rows.length;
      pairs = rows.map(i => ({ inspection: i, equipment: equipmentRows.find(e => String(e.id) === String(i.equipment_id)) || equipmentRows.find(e => certNorm(e.serial) === certNorm(i.serial)) }));
    } else if(kind === 'due_overdue'){
      const allPairs = certLatestInspectionMap(active, inspectionRows);
      pairs = allPairs.filter(certIsDueFromPair);
      before = pairs.length;
    } else {
      return { pairs: [], before: 0, type: '' };
    }

    pairs = pairs.filter(p => p.equipment && p.inspection);
    return { pairs, before, type };
  }
  async function generateCertificatesV405(kind){
    kind = kind || document.getElementById('certMode')?.value || 'selected_items';
    const btn = document.getElementById('certGenerateBtn');
    try{
      if(btn) btn.disabled = true;
      if(window.setCertValidation) window.setCertValidation('Checking matching equipment and inspections...', 'warn');
      const built = await buildCertificatePairsV405(kind);
      if(!built.pairs.length){
        const msg = certNoPairsMessage(kind, built.before, built.type);
        if(window.setCertValidation) window.setCertValidation(msg, 'warn');
        alert(msg);
        return;
      }
      const title = {
        selected_items: 'Selected item certificates',
        type_latest: 'Equipment type certificates',
        inspection_date_range: 'Date range inspection certificates',
        inspection_result: 'Inspection result certificates',
        due_overdue: 'Due / overdue certificates'
      }[kind] || 'Inspection certificates';
      if(window.withBusy && window.buildCertificatePacket){
        await window.withBusy('Generating certificates...', async () => { await window.buildCertificatePacket(built.pairs, title); });
      } else if(window.buildCertificatePacket){
        await window.buildCertificatePacket(built.pairs, title);
      } else {
        throw new Error('Certificate builder was not found. Please refresh and try again.');
      }
      if(window.setCertValidation) window.setCertValidation(`Generated ${built.pairs.length} certificate${built.pairs.length === 1 ? '' : 's'}.`, 'ready');
    } catch(err){
      alert('Certificate generation failed: ' + (err.message || err));
      if(window.setCertValidation) window.setCertValidation('Certificate generation failed: ' + (err.message || err), 'warn');
    } finally {
      if(btn) btn.disabled = false;
      if(window.updateCertificateUI) window.updateCertificateUI();
    }
  }
  async function refreshCertificateTypeCountsV405(){
    const sel = document.getElementById('certTypeFilter');
    if(!sel) return;
    let note = document.getElementById('certTypeMatchCount');
    if(!note){
      note = document.createElement('div');
      note.id = 'certTypeMatchCount';
      note.className = 'muted';
      note.style.marginTop = '6px';
      sel.parentElement?.appendChild(note);
    }
    const type = sel.value || '';
    if(!type){ note.textContent = ''; return; }
    try{
      const { equipmentRows, inspectionRows } = await certFetchHeightData();
      const active = equipmentRows.filter(certIsActiveEquipment).filter(e => certTypeNorm(e.type) === certTypeNorm(type));
      const withInspections = certLatestInspectionMap(active, inspectionRows).filter(p => p.inspection).length;
      note.textContent = `${active.length} active ${type} item${active.length === 1 ? '' : 's'} found; ${withInspections} with inspection history.`;
    } catch(err){
      note.textContent = 'Could not check matching item count.';
    }
  }
  function installCertificateV405Patch(){
    window.generateCertificates = generateCertificatesV405;
    const sel = document.getElementById('certTypeFilter');
    if(sel && !sel.dataset.v405CountListener){
      sel.dataset.v405CountListener = '1';
      sel.addEventListener('change', refreshCertificateTypeCountsV405);
    }
    refreshCertificateTypeCountsV405();
    reorderCertificateGenerateStep();
    enhanceQualificationCertificatePanel();
    installShortCertificateNumberPatch();
  }

  function refreshTopUserSummary(){
    let el = document.getElementById('topUserSummary');
    if(!el){
      const header = document.querySelector('header');
      if(header){
        el = document.createElement('div');
        el.id = 'topUserSummary';
        el.className = 'topUserSummary';
        const titleBlock = header.querySelector('h1')?.parentElement || header;
        titleBlock.appendChild(el);
      }
    }
    if(!el) return;
    if(state.user){
      const roles = roleText();
      el.textContent = `Signed in: ${state.user.email}${roles ? ' | ' + roles : ''}`;
      el.classList.remove('hidden');
    } else {
      el.textContent = 'Not signed in';
    }
  }



  // V4.0.30 - certificate filters, asset photos, inspection read-only records and preventive maintenance redesign.

  function certSetFilterFromDom(){
    state.certFilterType = byId('certFilterType')?.value || '';
    state.certFilterStatus = byId('certFilterStatus')?.value || '';
    state.certFilterResult = byId('certFilterResult')?.value || '';
    state.certFilterDue = byId('certFilterDue')?.value || '';
    state.certFilterSearch = String(byId('certFilterSearch')?.value || '').trim().toLowerCase();
  }
  function certFilterState(){
    return { type: state.certFilterType || '', status: state.certFilterStatus || '', result: state.certFilterResult || '', due: state.certFilterDue || '', q: state.certFilterSearch || '' };
  }
  function certPairHaystack(pair){
    const e = pair.equipment || {}; const i = pair.inspection || {};
    return [e.serial,e.type,e.manufacturer,e.model,e.notes,e.status,i.inspector,i.inspection_date,i.result].join(' ').toLowerCase();
  }
  function certStatusMatches(rowStatus, selected){
    if(!selected) return true;
    return certNorm(rowStatus) === certNorm(selected);
  }
  function certResultMatches(result, selected){
    if(!selected) return true;
    return certNorm(result) === certNorm(selected);
  }
  async function renderCertificateFilterSelector(){
    const list = byId('certItemList');
    if(!list || !state.sb) return;
    const filters = certFilterState();
    try{
      const { equipmentRows, inspectionRows } = await certFetchHeightData();
      const activeRows = equipmentRows.filter(certIsActiveEquipment);
      const allPairs = certLatestInspectionMap(activeRows, inspectionRows);
      const types = uniqueValues(activeRows.map(e=>e.type));
      const statuses = uniqueValues(activeRows.map(e=>e.status));
      let panel = byId('certFilterPanel');
      if(!panel){
        panel = document.createElement('div');
        panel.id = 'certFilterPanel';
        panel.className = 'ops-cert-search';
        const panelParent = list.parentElement || byId('certItemsPanel') || byId('certificates');
        panelParent.insertBefore(panel, list);
      }
      panel.innerHTML = `<h3 style="margin-top:0">2. Filter and select items</h3>
        <p class="muted">Use filters to narrow the list, then tick only the items you want included.</p>
        <div class="ops-filter-grid">
          <label>Equipment type<select id="certFilterType"><option value="">All equipment types</option>${types.map(t=>`<option value="${esc(t)}" ${filters.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
          <label>Status<select id="certFilterStatus"><option value="">All statuses</option>${statuses.map(t=>`<option value="${esc(t)}" ${filters.status===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
          <label>Inspection result<select id="certFilterResult"><option value="" ${!filters.result?'selected':''}>All results</option><option value="Pass" ${filters.result==='Pass'?'selected':''}>Completed OK</option><option value="Fail - Repair Required" ${filters.result==='Fail - Repair Required'?'selected':''}>Issue - repair required</option><option value="Fail - Remove From Service / Disposal" ${filters.result==='Fail - Remove From Service / Disposal'?'selected':''}>Remove from service / disposal</option></select></label>
          <label>Due status<select id="certFilterDue"><option value="" ${!filters.due?'selected':''}>All due states</option><option value="due" ${filters.due==='due'?'selected':''}>Due / overdue</option><option value="ok" ${filters.due==='ok'?'selected':''}>Not due</option><option value="no_inspection" ${filters.due==='no_inspection'?'selected':''}>No inspection history</option></select></label>
          <label>Keyword search<input id="certFilterSearch" type="search" value="${esc(filters.q)}" placeholder="Serial, type, manufacturer, model"></label>
        </div>
        <div class="ops-actions"><button class="ops-btn ghost" type="button" id="certFilterClear">Clear filters</button><button class="ops-btn ghost" type="button" id="certSelectVisible">Select visible items with inspections</button><button class="ops-btn ghost" type="button" id="certClearSelected">Clear selected</button></div>
        <div id="certFilterCount" class="muted" style="margin-top:6px"></div>`;
      let pairs = allPairs.filter(pair => {
        const e = pair.equipment || {}; const i = pair.inspection || null;
        if(filters.type && certTypeNorm(e.type) !== certTypeNorm(filters.type)) return false;
        if(filters.status && !certStatusMatches(e.status, filters.status)) return false;
        if(filters.result && (!i || !certResultMatches(i.result, filters.result))) return false;
        if(filters.due === 'due' && !certIsDueFromPair(pair)) return false;
        if(filters.due === 'ok' && certIsDueFromPair(pair)) return false;
        if(filters.due === 'no_inspection' && i) return false;
        if(filters.q && !certPairHaystack(pair).includes(filters.q)) return false;
        return true;
      });
      list.innerHTML = pairs.map(pair => {
        const e = pair.equipment || {}; const i = pair.inspection;
        const disabled = i ? '' : 'disabled';
        const disabledText = i ? '' : ' <span class="ops-pill ops-warn">No inspection history</span>';
        const checked = state.certSelectedIds.has(String(e.id)) ? 'checked' : '';
        return `<label class="certItemCheckRow ops-cert-row"><input type="checkbox" class="certItemCheck" value="${esc(e.id)}" ${checked} ${disabled}> <span><strong>${esc(e.serial || 'No serial')} ${esc(e.type || '')}</strong><br><span class="muted">${esc(e.manufacturer || '')} ${esc(e.model || '')} · ${esc(e.status || '')} · Latest: ${i ? nzDate(i.inspection_date) + ' ' + displayStatusLabel(i.result) : 'none'}</span>${disabledText}</span></label>`;
      }).join('') || '<p class="muted">No items match the current filters.</p>';
      const count = byId('certFilterCount');
      if(count) count.textContent = `${pairs.length} item${pairs.length===1?'':'s'} shown; ${pairs.filter(p=>p.inspection).length} with inspection history; ${state.certSelectedIds.size} selected.`;
      if(byId('certMode')) byId('certMode').value = 'selected_items';
    }catch(err){
      list.innerHTML = `<div class="ops-error">Could not load certificate items: ${esc(err.message || err)}</div>`;
    }
  }

  function hideCertificateHistoryPanel(){
    const history = byId('certificateHistory')?.closest('.card');
    if(history) history.style.display = 'none';
  }
  function enhanceCertificateSelector(){
    hideCertificateHistoryPanel();
    const mode = byId('certMode');
    if(mode) mode.value = 'selected_items';
    const oldSearch = byId('certEquipmentSearchBox');
    if(oldSearch) oldSearch.style.display = 'none';
    renderCertificateFilterSelector();
    reorderCertificateGenerateStep();
    enhanceQualificationCertificatePanel();
  }
  function qualificationNames(){
    const seen = new Set();
    return (state.qualifications || []).filter(q=>q.active !== false && q.inspector_name).map(q=>q.inspector_name).filter(name => { const key = certNorm(name); if(seen.has(key)) return false; seen.add(key); return true; }).sort((a,b)=>a.localeCompare(b));
  }
  function latestQualificationForInspector(name){
    const key = certNorm(name);
    return (state.qualifications || []).filter(q=>q.active !== false && certNorm(q.inspector_name) === key).sort((a,b)=>String(b.expiry_date||'9999').localeCompare(String(a.expiry_date||'9999')) || String(b.issue_date||'').localeCompare(String(a.issue_date||'')))[0] || null;
  }
  function qualificationCertificatePanelHtml(){
    const names = qualificationNames();
    const options = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    return `<h2>Inspector Qualification Certificate</h2>
      <p class="muted">Generate a printable certificate/summary for a saved height inspector qualification. Certificate numbers are generated automatically.</p>
      <div class="grid two">
        <div><label>Inspector</label><select id="qualCertSelect"><option value="">Select inspector</option>${options}</select></div>
      </div>
      <div class="row"><button type="button" class="primary" onclick="SWOperationsV4.generateQualificationCertificate()">Generate inspector qualification certificate</button></div>
      ${names.length ? '' : '<p class="muted">No qualifications saved yet. Add qualifications under Height Equipment - Inspector Qualifications first.</p>'}`;
  }
  async function generateQualificationCertificate(){
    if(!hasAny(['Admin','Office / Reports','Certificate Approver','Equipment Manager'])) return alert('You do not have permission to generate qualification certificates.');
    const name = byId('qualCertSelect')?.value || '';
    if(!name) return alert('Select an inspector first.');
    const q = latestQualificationForInspector(name);
    if(!q) return alert('Qualification record not found for this inspector.');
    const certNo = shortCertificateNumber(q.reference_number || q.inspector_name || 'QUAL');
    let fileUrl = '';
    if(q.storage_path){
      try{ const r = await state.sb.storage.from(PHOTO_BUCKET).createSignedUrl(q.storage_path, 3600); if(!r.error) fileUrl = r.data.signedUrl; }catch(e){ console.warn('Qualification file link skipped', e); }
    }
    const html = qualificationCertificateHtml(q, certNo, fileUrl);
    const w = window.open('', '_blank');
    if(!w){
      const blob = new Blob([html], {type:'text/html'}); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `inspector-qualification-${certNo}.html`; a.click(); URL.revokeObjectURL(a.href);
      alert('Popup blocked. The certificate HTML file has been downloaded instead.'); return;
    }
    w.document.open(); w.document.write(html); w.document.close();
  }
  function shortCertificateNumber(seed){
    const yy = String(new Date().getFullYear()).slice(-2);
    const suffix = String(Date.now()).slice(-4);
    return `SW-${yy}-${suffix}`;
  }
  async function uploadAssetPhoto(file, kind, id){
    if(!file || !id) return null;
    if(!file.size){ alert('The selected asset photo is empty. Choose a valid image file.'); return null; }
    const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `operations-assets/${kind}/${id}/${Date.now()}-${clean}`;
    const up = await state.sb.storage.from(PHOTO_BUCKET).upload(path, file, { cacheControl:'3600', upsert:false, contentType:file.type || 'image/jpeg' });
    if(up.error){ alert('Asset photo upload failed: ' + up.error.message); return null; }
    const check = await state.sb.storage.from(PHOTO_BUCKET).download(path);
    if(check.error || !check.data || !check.data.size){
      await state.sb.storage.from(PHOTO_BUCKET).remove([path]);
      alert('The asset photo could not be verified after upload. The asset was not changed.');
      return null;
    }
    return { path, name: file.name };
  }
  function numberOrNull(id){
    const value = byId(id)?.value;
    return value === '' || value === null || value === undefined ? null : Number(value);
  }
  function textOrNull(id){ return String(byId(id)?.value || '').trim() || null; }
  function nextSpareIdentifier(type, excludeId=''){
    const code = MACHINERY_TYPE_CODES[type] || 'MCH';
    const rx = new RegExp(`^SPARE-${code}-(\\d+)$`,'i');
    const used = state.washEquipment
      .filter(w=>String(w.id)!==String(excludeId))
      .map(w=>String(w.asset_identifier||'').match(rx))
      .filter(Boolean)
      .map(m=>Number(m[1])||0);
    return `SPARE-${code}-${String((used.length?Math.max(...used):0)+1).padStart(3,'0')}`;
  }
  async function refreshMachineryIdentifiersForVehicle(vehicle){
    const children = state.washEquipment.filter(w=>String(w.assigned_vehicle_id||'')===String(vehicle.id));
    const failures = [];
    for(const w of children){
      const identifier = buildInstalledMachineryIdentifier(vehicle.rego,w.mounting_side,machineryType(w));
      if(!identifier) continue;
      const r = await state.sb.from('operations_washing_equipment').update({
        asset_identifier:identifier,
        name:`${machineryTypeLabel(w)} - ${identifier}`
      }).eq('id',w.id);
      if(r.error) failures.push(machineryIdentifier(w));
    }
    return failures;
  }
  async function removeReplacedAssetPhoto(oldPath, newPath){
    if(oldPath && oldPath !== newPath) await state.sb.storage.from(PHOTO_BUCKET).remove([oldPath]);
  }
  function vehicleFormHtml(){
    const v = state.vehicles.find(x=>x.id===state.editingVehicleId) || {};
    return `<form id="opsVehicleForm" class="ops-form">
      <input type="hidden" id="opsVehicleId" value="${esc(v.id||'')}">
      <label>Registration *<input id="opsVehicleRego" required value="${esc(normalizeRego(v.rego||''))}" placeholder="ABC123"></label>
      <label>Name<input id="opsVehicleName" value="${esc(v.name||'')}"></label>
      <label>Make/model<input id="opsVehicleMake" value="${esc(v.make_model||'')}"></label>
      <label>Year<input id="opsVehicleYear" type="number" value="${esc(v.year||'')}"></label>
      <label>Status<select id="opsVehicleStatus">${optionList(['Active','Inactive','Sold','Retired'], v.status||'Active')}</select></label>
      <label>Assigned driver<input id="opsVehicleDriver" value="${esc(v.assigned_driver||'')}"></label>
      <label>VIN / chassis number<input id="opsVehicleVin" value="${esc(v.vin_chassis_number||'')}"></label>
      <label>Engine model / code<input id="opsVehicleEngineCode" value="${esc(v.engine_code||'')}"></label>
      <label>Fuel type<select id="opsVehicleFuelType"><option value="">Select fuel type</option>${optionList(['Petrol','Diesel','Hybrid','Electric','Other'],v.fuel_type||'')}</select></label>
      <label>Current odometer (km)<input id="opsVehicleOdometer" type="number" min="0" step="1" value="${esc(v.current_odometer??'')}"></label>
      <label>Engine oil grade<input id="opsVehicleOilGrade" value="${esc(v.engine_oil_grade||'')}" placeholder="e.g. 5W-30"></label>
      <label>Engine oil volume (L)<input id="opsVehicleOilVolume" type="number" min="0" step="0.01" value="${esc(v.engine_oil_volume_l??'')}"></label>
      <label>Oil filter part number<input id="opsVehicleOilFilter" value="${esc(v.oil_filter_part_number||'')}"></label>
      <label>Engine air-filter part number<input id="opsVehicleAirFilter" value="${esc(v.engine_air_filter_part_number||'')}"></label>
      <label>Fuel-filter part number<input id="opsVehicleFuelFilter" value="${esc(v.fuel_filter_part_number||'')}"></label>
      <label>Spark-plug part number<input id="opsVehicleSparkPlug" value="${esc(v.spark_plug_part_number||'')}"></label>
      <label>Service interval (km)<input id="opsVehicleServiceKm" type="number" min="1" step="1" value="${esc(v.service_interval_km??'')}"></label>
      <label>Service interval (months)<input id="opsVehicleServiceMonths" type="number" min="1" step="1" value="${esc(v.service_interval_months??'')}"></label>
      <label>Asset photo<input id="opsVehiclePhoto" type="file" accept="image/*"></label>
      ${v.photo_path ? `<div class="ops-span-2"><span class="ops-pill ops-ok">Photo saved</span></div>` : ''}
      <details class="ops-span-2"><summary><strong>Additional service specifications</strong></summary><div class="ops-form" style="margin-top:.8rem">
        <label>Coolant type<input id="opsVehicleCoolantType" value="${esc(v.coolant_type||'')}"></label>
        <label>Coolant capacity (L)<input id="opsVehicleCoolantCapacity" type="number" min="0" step="0.01" value="${esc(v.coolant_capacity_l??'')}"></label>
        <label>Transmission-fluid grade<input id="opsVehicleTransmissionFluid" value="${esc(v.transmission_fluid_grade||'')}"></label>
        <label>Transmission-fluid capacity (L)<input id="opsVehicleTransmissionCapacity" type="number" min="0" step="0.01" value="${esc(v.transmission_fluid_capacity_l??'')}"></label>
        <label>Differential-oil grade<input id="opsVehicleDifferentialOil" value="${esc(v.differential_oil_grade||'')}"></label>
        <label>Differential-oil capacity (L)<input id="opsVehicleDifferentialCapacity" type="number" min="0" step="0.01" value="${esc(v.differential_oil_capacity_l??'')}"></label>
        <label>Brake-fluid specification<input id="opsVehicleBrakeFluid" value="${esc(v.brake_fluid_spec||'')}"></label>
        <label>Drive-belt part number<input id="opsVehicleDriveBelt" value="${esc(v.drive_belt_part_number||'')}"></label>
        <label>Battery type / size<input id="opsVehicleBattery" value="${esc(v.battery_type_size||'')}"></label>
        <label>Front tyre size<input id="opsVehicleFrontTyre" value="${esc(v.front_tyre_size||'')}"></label>
        <label>Rear tyre size<input id="opsVehicleRearTyre" value="${esc(v.rear_tyre_size||'')}"></label>
        <label>Front tyre pressure (PSI)<input id="opsVehicleFrontPressure" type="number" min="0" step="0.1" value="${esc(v.front_tyre_pressure_psi??'')}"></label>
        <label>Rear tyre pressure (PSI)<input id="opsVehicleRearPressure" type="number" min="0" step="0.1" value="${esc(v.rear_tyre_pressure_psi??'')}"></label>
        <label>Front wiper-blade size<input id="opsVehicleFrontWiper" value="${esc(v.front_wiper_size||'')}"></label>
        <label>Rear wiper-blade size<input id="opsVehicleRearWiper" value="${esc(v.rear_wiper_size||'')}"></label>
      </div></details>
      <label class="ops-span-2">Current service state / notes<textarea id="opsVehicleServiceNotes" placeholder="Current condition, recent work and anything requiring attention">${esc(v.service_notes||v.notes||'')}</textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save vehicle</button><button class="ops-btn ghost" type="button" data-ops-action="clearVehicle">Clear</button></div>
    </form>`;
  }
  function washingFormHtml(){
    const w = state.washEquipment.find(x=>x.id===state.editingWashId) || {};
    const selectedVehicle = w.assigned_vehicle_id || state.prefillMachineryVehicleId || '';
    const selectedSide = w.mounting_side || state.prefillMachinerySide || '';
    const selectedType = machineryType(w);
    const selectedOilGrade = selectedType==='Pump'?'15W40':'10W30';
    const identifier = w.id ? machineryIdentifier(w) : buildInstalledMachineryIdentifier(state.vehicles.find(v=>String(v.id)===String(selectedVehicle))?.rego,selectedSide,selectedType);
    return `<form id="opsWashingForm" class="ops-form">
      <input type="hidden" id="opsWashId" value="${esc(w.id||'')}">
      <label>Machinery type *<select id="opsMachineryType" required><option value="Engine" ${selectedType==='Engine'?'selected':''}>Engine</option><option value="Gearbox" ${selectedType==='Gearbox'?'selected':''}>Reduction gearbox</option><option value="Pump" ${selectedType==='Pump'?'selected':''}>Pump</option></select></label>
      <label>Identifier<input id="opsMachineryIdentifier" value="${esc(identifier)}" placeholder="Generated when saved" readonly></label>
      <label>Vehicle<select id="opsWashVehicle" ${w.id?'disabled':''}><option value="">Unassigned / spare</option>${state.vehicles.map(v=>`<option value="${v.id}" ${String(v.id)===String(selectedVehicle)?'selected':''}>${esc(normalizeRego(v.rego) || v.name)}</option>`).join('')}</select>${w.id?'<small class="ops-subtle">Use Transfer on the asset card to change its vehicle.</small>':''}</label>
      <label>Installation side<select id="opsMachinerySide" ${w.id?'disabled':''}><option value="">Not installed</option>${optionList(['Driver','Passenger'],selectedSide)}</select></label>
      <label>Make/model<input id="opsMachineryMakeModel" value="${esc(w.make_model||'')}"></label>
      <label>Serial number<input id="opsWashSerial" value="${esc(w.serial_number||'')}"></label>
      <label>Status<select id="opsWashStatus">${optionList(['Active','Inactive','Retired','Quarantined'], w.status||'Active')}</select></label>
      <label>Oil grade<input id="opsMachineryOilGrade" value="${selectedOilGrade}" readonly><small class="ops-subtle">Set automatically from machinery type.</small></label>
      <label>Oil volume (L)<input id="opsMachineryOilVolume" type="number" min="0" step="0.01" value="${esc(w.oil_volume_l??'')}"></label>
      <div class="ops-machinery-fields ops-span-2" data-machinery-types="Engine"><div class="ops-form">
        <label>Spark-plug part number<input id="opsMachinerySparkPlug" value="${esc(w.spark_plug_part_number||'')}"></label>
        <label>Air-filter part number<input id="opsMachineryAirFilter" value="${esc(w.air_filter_part_number||'')}"></label>
      </div></div>
      <div class="ops-machinery-fields ops-span-2" data-machinery-types="Pump"><div class="ops-form">
        <label>PSI rating<input id="opsMachineryPressure" type="number" min="0" step="1" value="${esc(w.pressure_psi??'')}"></label>
        <label>Maximum volume output (L/min)<input id="opsMachineryOutput" type="number" min="0" step="0.1" value="${esc(w.max_output_lpm??'')}"></label>
      </div></div>
      <label>Asset photo<input id="opsWashPhoto" type="file" accept="image/*"></label>
      ${w.photo_path ? `<div class="ops-span-2"><span class="ops-pill ops-ok">Photo saved</span></div>` : ''}
      <label class="ops-span-2">Current service state / notes<textarea id="opsMachineryServiceNotes" placeholder="Current condition, recent work and anything requiring attention">${esc(w.service_notes||w.notes||'')}</textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save machinery</button><button class="ops-btn ghost" type="button" data-ops-action="clearWash">Clear</button></div>
    </form>`;
  }
  function machineryTransferFormHtml(){
    const w=state.washEquipment.find(x=>String(x.id)===String(state.transferringMachineryId));
    if(!w)return '';
    const currentVehicle=state.vehicles.find(v=>String(v.id)===String(w.assigned_vehicle_id||''));
    return `<div class="ops-card ops-transfer-card" style="margin-top:1rem">
      <div class="ops-section-title"><div><h3>Transfer ${esc(machineryIdentifier(w))}</h3><p class="ops-subtle">The machinery record and all linked service history stay intact. Only its current vehicle, side and displayed identifier change.</p></div><button class="ops-btn ghost" type="button" data-ops-action="cancelMachineryTransfer">Cancel</button></div>
      <form id="opsMachineryTransferForm" class="ops-form">
        <input id="opsTransferMachineryId" type="hidden" value="${esc(w.id)}">
        <div><strong>Current location</strong><br>${esc(currentVehicle ? `${normalizeRego(currentVehicle.rego)} · ${w.mounting_side||'No side'}` : 'Unassigned / spare')}</div>
        <label>Transfer date<input id="opsTransferDate" type="date" value="${today()}" required></label>
        <label>New vehicle<select id="opsTransferVehicle"><option value="">Unassigned / spare</option>${state.vehicles.filter(v=>!['Sold','Retired'].includes(v.status)).map(v=>`<option value="${esc(v.id)}">${esc(normalizeRego(v.rego)||v.name)}</option>`).join('')}</select></label>
        <label>New installation side<select id="opsTransferSide" disabled><option value="">Not installed</option>${optionList(['Driver','Passenger'],'')}</select></label>
        <label>New identifier<input id="opsTransferIdentifier" readonly placeholder="Choose a vehicle and side"></label>
        <label class="ops-span-2">Transfer notes<textarea id="opsTransferNotes" placeholder="Reason for transfer or installation notes"></textarea></label>
        <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Complete transfer</button></div>
      </form>
    </div>`;
  }
  function updateMachineryTransferPreview(){
    const w=state.washEquipment.find(x=>String(x.id)===String(byId('opsTransferMachineryId')?.value||''));
    const vehicleId=byId('opsTransferVehicle')?.value||'';
    const side=byId('opsTransferSide');
    if(side){side.disabled=!vehicleId;if(!vehicleId)side.value='';}
    const vehicle=state.vehicles.find(v=>String(v.id)===String(vehicleId));
    const preview=w?(vehicleId?buildInstalledMachineryIdentifier(vehicle?.rego,side?.value,machineryType(w)):nextSpareIdentifier(machineryType(w),w.id)):'';
    if(byId('opsTransferIdentifier'))byId('opsTransferIdentifier').value=preview;
  }
  function updateMachineryFormVisibility(){
    const type = byId('opsMachineryType')?.value || 'Engine';
    const vehicleId = byId('opsWashVehicle')?.value || '';
    const side = byId('opsMachinerySide');
    const existing = state.washEquipment.find(w=>String(w.id)===String(byId('opsWashId')?.value||''));
    document.querySelectorAll('.ops-machinery-fields').forEach(group=>{
      const types = String(group.dataset.machineryTypes||'').split(',');
      group.hidden = !types.includes(type);
    });
    if(side){
      side.disabled = Boolean(existing) || !vehicleId;
      if(!vehicleId) side.value = '';
    }
    const vehicle = state.vehicles.find(v=>String(v.id)===String(vehicleId));
    const preview = buildInstalledMachineryIdentifier(vehicle?.rego,side?.value,type) || existing?.asset_identifier || '';
    if(byId('opsMachineryIdentifier')) byId('opsMachineryIdentifier').value = preview;
    if(byId('opsMachineryOilGrade'))byId('opsMachineryOilGrade').value=type==='Pump'?'15W40':'10W30';
  }
  async function saveVehicle(e){
    e.preventDefault(); if(!canManage()) return alert('Only Admin or Equipment Manager users can save vehicles.');
    const submit = e.submitter; if(submit?.disabled) return; if(submit) submit.disabled=true;
    const id = byId('opsVehicleId').value;
    const existing = state.vehicles.find(v=>String(v.id)===String(id)) || {};
    const row = {
      rego:normalizeRego(byId('opsVehicleRego').value), name:textOrNull('opsVehicleName'), make_model:textOrNull('opsVehicleMake'),
      year:numberOrNull('opsVehicleYear'), status:byId('opsVehicleStatus').value, assigned_driver:textOrNull('opsVehicleDriver'),
      vin_chassis_number:textOrNull('opsVehicleVin'), engine_code:textOrNull('opsVehicleEngineCode'), fuel_type:textOrNull('opsVehicleFuelType'),
      current_odometer:numberOrNull('opsVehicleOdometer'), engine_oil_grade:textOrNull('opsVehicleOilGrade'), engine_oil_volume_l:numberOrNull('opsVehicleOilVolume'),
      oil_filter_part_number:textOrNull('opsVehicleOilFilter'), engine_air_filter_part_number:textOrNull('opsVehicleAirFilter'),
      fuel_filter_part_number:textOrNull('opsVehicleFuelFilter'), spark_plug_part_number:textOrNull('opsVehicleSparkPlug'),
      service_interval_km:numberOrNull('opsVehicleServiceKm'), service_interval_months:numberOrNull('opsVehicleServiceMonths'),
      coolant_type:textOrNull('opsVehicleCoolantType'), coolant_capacity_l:numberOrNull('opsVehicleCoolantCapacity'),
      transmission_fluid_grade:textOrNull('opsVehicleTransmissionFluid'), transmission_fluid_capacity_l:numberOrNull('opsVehicleTransmissionCapacity'),
      differential_oil_grade:textOrNull('opsVehicleDifferentialOil'), differential_oil_capacity_l:numberOrNull('opsVehicleDifferentialCapacity'),
      brake_fluid_spec:textOrNull('opsVehicleBrakeFluid'), drive_belt_part_number:textOrNull('opsVehicleDriveBelt'),
      battery_type_size:textOrNull('opsVehicleBattery'), front_tyre_size:textOrNull('opsVehicleFrontTyre'), rear_tyre_size:textOrNull('opsVehicleRearTyre'),
      front_tyre_pressure_psi:numberOrNull('opsVehicleFrontPressure'), rear_tyre_pressure_psi:numberOrNull('opsVehicleRearPressure'),
      front_wiper_size:textOrNull('opsVehicleFrontWiper'), rear_wiper_size:textOrNull('opsVehicleRearWiper'),
      service_notes:textOrNull('opsVehicleServiceNotes'), created_by:state.user.id
    };
    if(!row.rego){ if(submit)submit.disabled=false; return alert('Registration is required.'); }
    if(state.vehicles.some(v=>String(v.id)!==String(id) && normalizeRego(v.rego)===row.rego)){ if(submit)submit.disabled=false; return alert('That vehicle registration is already in use.'); }
    const file = byId('opsVehiclePhoto')?.files?.[0] || null;
    let upload = null;
    try{
      if(file){
        upload = await uploadAssetPhoto(file,'vehicles',id||crypto.randomUUID());
        if(!upload) return;
        row.photo_path=upload.path; row.photo_file_name=upload.name;
      }
      const r = id ? await state.sb.from('operations_vehicles').update(row).eq('id',id).select().single() : await state.sb.from('operations_vehicles').insert(row).select().single();
      if(r.error){ if(upload) await state.sb.storage.from(PHOTO_BUCKET).remove([upload.path]); return alert(r.error.message); }
      if(upload) await removeReplacedAssetPhoto(existing.photo_path,upload.path);
      const failed = await refreshMachineryIdentifiersForVehicle(r.data);
      state.editingVehicleId='';
      state.assetEditorOpen=false;state.assetAddType='';
      await loadAll();
      alert(failed.length ? `Vehicle saved. ${failed.length} linked machinery identifier${failed.length===1?'':'s'} could not be refreshed.` : 'Vehicle saved.');
    }finally{ if(submit) submit.disabled=false; }
  }
  async function saveWashing(e){
    e.preventDefault(); if(!canManage()) return alert('Only Admin or Equipment Manager users can save machinery.');
    const submit=e.submitter; if(submit?.disabled)return; if(submit)submit.disabled=true;
    const id = byId('opsWashId').value;
    const existing=state.washEquipment.find(w=>String(w.id)===String(id))||{};
    const type=byId('opsMachineryType').value;
    const vehicleId=id?(existing.assigned_vehicle_id||null):(byId('opsWashVehicle').value||null);
    const side=id?(existing.mounting_side||null):(vehicleId?(byId('opsMachinerySide').value||null):null);
    if(vehicleId&&!side){ if(submit)submit.disabled=false; return alert('Choose Driver or Passenger side for machinery installed on a vehicle.'); }
    if(vehicleId&&state.washEquipment.some(w=>String(w.id)!==String(id)&&String(w.assigned_vehicle_id||'')===String(vehicleId)&&w.mounting_side===side&&machineryType(w)===type&&w.status!=='Retired')){
      if(submit)submit.disabled=false;
      return alert(`That vehicle already has a ${machineryTypeLabel(type).toLowerCase()} recorded on the ${side.toLowerCase()} side.`);
    }
    const vehicle=state.vehicles.find(v=>String(v.id)===String(vehicleId||''));
    let identifier=vehicleId?buildInstalledMachineryIdentifier(vehicle?.rego,side,type):'';
    if(!identifier){
      const sameSpareType=String(existing.asset_identifier||'').startsWith(`SPARE-${MACHINERY_TYPE_CODES[type]}-`);
      identifier=sameSpareType?existing.asset_identifier:nextSpareIdentifier(type,id);
    }
    const row={
      asset_identifier:identifier, name:`${machineryTypeLabel(type)} - ${identifier}`, machinery_type:type,
      equipment_type:machineryTypeLabel(type), make_model:textOrNull('opsMachineryMakeModel'), serial_number:textOrNull('opsWashSerial'),
      assigned_vehicle_id:vehicleId, mounting_side:side, status:byId('opsWashStatus').value,
      oil_grade:type==='Pump'?'15W40':'10W30',
      oil_volume_l:numberOrNull('opsMachineryOilVolume'), spark_plug_part_number:type==='Engine'?textOrNull('opsMachinerySparkPlug'):null,
      air_filter_part_number:type==='Engine'?textOrNull('opsMachineryAirFilter'):null,
      pressure_psi:type==='Pump'?numberOrNull('opsMachineryPressure'):null,
      max_output_lpm:type==='Pump'?numberOrNull('opsMachineryOutput'):null,
      service_notes:textOrNull('opsMachineryServiceNotes'), created_by:state.user.id
    };
    const file=byId('opsWashPhoto')?.files?.[0]||null;
    let upload=null;
    try{
      if(file){
        upload=await uploadAssetPhoto(file,'machinery',id||crypto.randomUUID());
        if(!upload)return;
        row.photo_path=upload.path; row.photo_file_name=upload.name;
      }
      const r=id?await state.sb.from('operations_washing_equipment').update(row).eq('id',id).select().single():await state.sb.from('operations_washing_equipment').insert(row).select().single();
      if(r.error){ if(upload)await state.sb.storage.from(PHOTO_BUCKET).remove([upload.path]); return alert(r.error.message); }
      if(upload)await removeReplacedAssetPhoto(existing.photo_path,upload.path);
      if(!id&&r.data)await applyDefaultSchedulesForEquipment(r.data);
      state.editingWashId='';state.prefillMachineryVehicleId='';state.prefillMachinerySide='';state.assetEditorOpen=false;state.assetAddType='';
      await loadAll();
      alert('Machinery saved.');
    }finally{if(submit)submit.disabled=false;}
  }
  async function saveMachineryTransfer(e){
    e.preventDefault(); if(!canManage())return alert('Only Admin or Equipment Manager users can transfer machinery.');
    const submit=e.submitter;if(submit?.disabled)return;if(submit)submit.disabled=true;
    try{
      const machineryId=byId('opsTransferMachineryId')?.value||'';
      const w=state.washEquipment.find(x=>String(x.id)===String(machineryId));
      if(!w)return alert('Machinery record not found.');
      const vehicleId=byId('opsTransferVehicle')?.value||null;
      const side=vehicleId?(byId('opsTransferSide')?.value||null):null;
      if(vehicleId&&!side)return alert('Choose Driver or Passenger side for the new installation.');
      if(String(vehicleId||'')===String(w.assigned_vehicle_id||'')&&String(side||'')===String(w.mounting_side||''))return alert('Choose a different vehicle, side, or unassigned status.');
      if(vehicleId&&state.washEquipment.some(other=>String(other.id)!==String(w.id)&&String(other.assigned_vehicle_id||'')===String(vehicleId)&&other.mounting_side===side&&machineryType(other)===machineryType(w)&&other.status!=='Retired')){
        return alert(`The destination already has a ${machineryTypeLabel(w).toLowerCase()} recorded on the ${side.toLowerCase()} side.`);
      }
      const vehicle=state.vehicles.find(v=>String(v.id)===String(vehicleId||''));
      const identifier=vehicleId?buildInstalledMachineryIdentifier(vehicle?.rego,side,machineryType(w)):nextSpareIdentifier(machineryType(w),w.id);
      const r=await state.sb.rpc('operations_transfer_machinery_v4049',{
        p_machinery_id:w.id,p_to_vehicle_id:vehicleId,p_to_side:side,p_new_identifier:identifier,
        p_transfer_date:byId('opsTransferDate')?.value||today(),p_notes:textOrNull('opsTransferNotes'),
        p_performed_by:inspectorDisplayName(),p_changed_by:state.user.id
      });
      if(r.error)return alert('Machinery transfer failed: '+r.error.message);
      state.transferringMachineryId='';
      await loadAll();
      alert(`Machinery transferred. Its identifier is now ${identifier}; its complete history remains linked.`);
    }finally{if(submit)submit.disabled=false;}
  }
  function maintenanceLogRecords(){
    const inspectionRows=state.inspections.filter(i=>i.vehicle_id).map(i=>({
      key:`inspection-${i.id}`,source:'inspection',sourceRow:i,recordType:'Periodic inspection',date:String(i.inspection_date||'').slice(0,10),
      vehicleId:i.vehicle_id||'',machineryId:i.washing_equipment_id||'',title:'Periodic inspection',
      target:targetName(i),person:i.inspector_name||i.submitted_by_email||'',
      summary:`${displayStatusLabel(i.overall_result)}${i.notes?' · '+i.notes:''}`,createdSort:i.created_at||''
    }));
    const manualRows=(state.maintenanceLog||[]).filter(row=>!row.previous_identifier&&!row.new_identifier&&!row.from_vehicle_id&&!row.to_vehicle_id).flatMap(row=>{
      const machinery=state.washEquipment.find(w=>String(w.id)===String(row.washing_equipment_id||''));
      const vehicle=state.vehicles.find(v=>String(v.id)===String(row.vehicle_id||''));
      const target=row.asset_identifier_snapshot||(machinery?machineryIdentifier(machinery):(normalizeRego(vehicle?.rego)||vehicle?.name||'Asset'));
      const items=maintenanceItemsForRecord(row.id);
      const visibleItems=items.length?items:[{id:'legacy',maintenance_done:row.maintenance_done||row.title||'Other maintenance',description:row.description||''}];
      return visibleItems.map(item=>({
        key:`log-${row.id}-${item.id}`,source:'log',sourceRow:row,itemRow:item,recordType:item.maintenance_done||'Other maintenance',
        date:String(row.record_date||row.created_at||'').slice(0,10),vehicleId:row.vehicle_id||machinery?.assigned_vehicle_id||'',
        machineryId:row.washing_equipment_id||'',title:item.maintenance_done||'Maintenance item',target,
        person:row.performed_by||'',summary:item.description||item.parts_used||row.notes||'',createdSort:row.created_at||''
      }));
    });
    return inspectionRows.concat(manualRows).sort((a,b)=>
      String(b.date).localeCompare(String(a.date))
      ||String(b.createdSort).localeCompare(String(a.createdSort))
      ||String(a.key).localeCompare(String(b.key))
    );
  }
  function maintenanceItemsForRecord(recordId){
    return (state.maintenanceLogItems||[])
      .filter(item=>String(item.maintenance_log_id)===String(recordId))
      .sort((a,b)=>(Number(a.sort_order)||0)-(Number(b.sort_order)||0)||String(a.created_at||'').localeCompare(String(b.created_at||'')));
  }
  function maintenanceRecordMatches(row){
    if(state.logAssetId&&String(row.vehicleId)!==String(state.logAssetId)){
      const raw=row.sourceRow||{};
      if(String(raw.from_vehicle_id||'')!==String(state.logAssetId)&&String(raw.to_vehicle_id||'')!==String(state.logAssetId))return false;
    }
    if(state.logMachineryId&&String(row.machineryId)!==String(state.logMachineryId))return false;
    if(state.logType&&row.recordType!==state.logType)return false;
    if(state.logDateFrom&&row.date<state.logDateFrom)return false;
    if(state.logDateTo&&row.date>state.logDateTo)return false;
    if(state.logKeyword){
      const source=row.sourceRow||{};
      const item=row.itemRow||{};
      const haystack=[
        row.recordType,row.target,row.person,row.summary,
        item.maintenance_done,item.description,item.parts_used,
        source.notes,source.parts_used,source.further_maintenance_required
      ].filter(Boolean).join(' ').toLowerCase();
      if(!haystack.includes(String(state.logKeyword).trim().toLowerCase()))return false;
    }
    return true;
  }
  function maintenanceLogFilterHtml(resultCount){
    const machinery=state.logAssetId?state.washEquipment.filter(w=>String(w.assigned_vehicle_id||'')===String(state.logAssetId)):state.washEquipment;
    return `<div class="registerFilterPanel"><div class="registerFilterHeader"><h3>Search Maintenance Log</h3></div><div class="registerFilterGrid">
      <label>Vehicle<select id="opsLogAsset"><option value="">All vehicles</option>${state.vehicles.map(v=>`<option value="${esc(v.id)}" ${String(v.id)===String(state.logAssetId)?'selected':''}>${esc(normalizeRego(v.rego)||v.name)}</option>`).join('')}</select></label>
      <label>Machinery<select id="opsLogMachinery"><option value="">All machinery</option>${machinery.map(w=>`<option value="${esc(w.id)}" ${String(w.id)===String(state.logMachineryId)?'selected':''}>${esc(machineryIdentifier(w))}</option>`).join('')}</select></label>
      <label>Maintenance done<select id="opsLogType"><option value="">All record types</option>${['Periodic inspection','Oil changed','Spark plug changed','Air filter changed','Valves changed','Seals replaced','Repair','Other maintenance'].map(t=>`<option value="${t}" ${state.logType===t?'selected':''}>${t}</option>`).join('')}</select></label>
      <label>Date from<input id="opsLogDateFrom" type="date" value="${esc(state.logDateFrom||'')}"></label>
      <label>Date to<input id="opsLogDateTo" type="date" value="${esc(state.logDateTo||'')}"></label>
      <label>Keyword search<input id="opsLogKeyword" type="search" value="${esc(state.logKeyword||'')}" placeholder="Repair, description, part or consumable"></label>
    </div><div class="registerFilterActions"><button type="button" data-ops-action="clearMaintenanceLogFilters">Clear filters</button></div><div id="opsLogFilterCount" class="ops-subtle registerFilterCount">${resultCount} item${resultCount===1?'':'s'} shown.</div></div>`;
  }
  function maintenanceLogEntryFormHtml(){
    return `<div class="ops-card"><div class="ops-section-title"><h3>Record Maintenance</h3><button class="ops-btn ghost" type="button" data-ops-action="closeMaintenanceEditor">Cancel</button></div><form id="opsMaintenanceLogForm" class="ops-form">
      <label>Date<input id="opsLogEntryDate" type="date" value="${today()}" required></label>
      <label>Vehicle<select id="opsLogEntryVehicle" required><option value="">Select vehicle</option>${state.vehicles.map(v=>`<option value="${esc(v.id)}">${esc(normalizeRego(v.rego)||v.name)}</option>`).join('')}</select></label>
      <label>Odometer (km)<input id="opsLogEntryOdometer" type="number" min="0" step="1"></label>
      <label>Maintenance target<select id="opsLogEntryTarget" required disabled><option value="">Select a vehicle first</option></select></label>
      <label>Performed by<select id="opsLogEntryPerformedBy">${maintenancePerformedByOptions()}</select></label>
      <label id="opsLogEntryOtherAgentWrap" hidden>Service agent name<input id="opsLogEntryOtherAgent" placeholder="Enter the service agent's name"></label>
      <div class="ops-span-2"><strong>Maintenance completed *</strong><div id="opsMaintenanceChoices" class="ops-maintenance-item-grid"></div></div>
      <label class="ops-span-2">General parts or consumables used<textarea id="opsLogEntryParts" placeholder="Parts used for the routine maintenance items above"></textarea></label>
      <label class="ops-span-2">Notes<textarea id="opsLogEntryNotes"></textarea></label>
      <div id="opsRepairItemsWrap" class="ops-span-2 ops-repeatable-maintenance" hidden><div class="ops-section-title"><h4>Repairs completed</h4><button class="ops-btn ghost" type="button" data-ops-add-maintenance-detail="Repair">+ Add another repair</button></div><div id="opsRepairItems" class="ops-repeatable-maintenance-list"></div></div>
      <div id="opsOtherMaintenanceItemsWrap" class="ops-span-2 ops-repeatable-maintenance" hidden><div class="ops-section-title"><h4>Other maintenance completed</h4><button class="ops-btn ghost" type="button" data-ops-add-maintenance-detail="Other maintenance">+ Add another item</button></div><div id="opsOtherMaintenanceItems" class="ops-repeatable-maintenance-list"></div></div>
      <label class="ops-span-2">Further maintenance tasks required<textarea id="opsLogEntryFurtherMaintenance" placeholder="Describe any additional maintenance tasks identified. This will create a Task."></textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save maintenance record</button></div>
    </form></div>`;
  }
  function updateMaintenanceLogEntryAssetOptions(){
    const vehicleId=byId('opsLogEntryVehicle')?.value||'';
    const target=byId('opsLogEntryTarget');
    if(!target)return;
    const rows=state.washEquipment
      .filter(w=>String(w.assigned_vehicle_id||'')===String(vehicleId)&&w.status!=='Retired')
      .sort((a,b)=>{
        const order={Engine:1,Pump:2,Gearbox:3};
        return (order[machineryType(a)]||9)-(order[machineryType(b)]||9)||String(machineryIdentifier(a)).localeCompare(String(machineryIdentifier(b)));
      });
    target.disabled=!vehicleId;
    target.innerHTML=vehicleId
      ? `<option value="">Select maintenance target</option><option value="vehicle">Vehicle itself</option>${rows.map(w=>`<option value="machinery:${esc(w.id)}">${esc(machineryTypeLabel(w))} · ${esc(w.mounting_side?`${w.mounting_side} side · `:'')}${esc(machineryIdentifier(w))}</option>`).join('')}`
      : '<option value="">Select a vehicle first</option>';
    updateMaintenanceLogEntryRoutineChoices();
  }
  function maintenanceRoutineTypesForTarget(){
    const targetValue=byId('opsLogEntryTarget')?.value||'';
    if(!targetValue.startsWith('machinery:'))return [];
    const machinery=state.washEquipment.find(w=>String(w.id)===String(targetValue.slice('machinery:'.length)));
    if(machineryType(machinery)==='Engine')return ['Oil changed','Spark plug changed','Air filter changed'];
    if(machineryType(machinery)==='Gearbox')return ['Oil changed'];
    if(machineryType(machinery)==='Pump')return ['Oil changed','Valves changed','Seals replaced'];
    return [];
  }
  function updateMaintenanceLogEntryRoutineChoices(){
    const choices=byId('opsMaintenanceChoices');
    if(!choices)return;
    const routineTypes=maintenanceRoutineTypesForTarget();
    choices.innerHTML=`${routineTypes.map(t=>`<label class="ops-maintenance-choice"><input type="checkbox" class="ops-maintenance-routine" value="${t}"> <span>${t}</span></label>`).join('')}
      <label class="ops-maintenance-choice"><input type="checkbox" class="ops-maintenance-repeatable-toggle" data-maintenance-repeatable="Repair"> <span>Repair</span></label>
      <label class="ops-maintenance-choice"><input type="checkbox" class="ops-maintenance-repeatable-toggle" data-maintenance-repeatable="Other maintenance"> <span>Other maintenance</span></label>`;
    document.querySelectorAll('.ops-maintenance-repeatable-toggle').forEach(input=>input.addEventListener('change',()=>updateRepeatableMaintenanceItems(input)));
  }
  function updateMaintenanceLogEntryConditionalFields(){
    const otherAgent=byId('opsLogEntryPerformedBy')?.value==='Other service agent';
    if(byId('opsLogEntryOtherAgentWrap'))byId('opsLogEntryOtherAgentWrap').hidden=!otherAgent;
    if(byId('opsLogEntryOtherAgent'))byId('opsLogEntryOtherAgent').required=otherAgent;
  }
  function repeatableMaintenanceElements(type){
    return type==='Repair'
      ? {wrap:byId('opsRepairItemsWrap'),list:byId('opsRepairItems')}
      : {wrap:byId('opsOtherMaintenanceItemsWrap'),list:byId('opsOtherMaintenanceItems')};
  }
  function addMaintenanceDetailItem(type){
    const {wrap,list}=repeatableMaintenanceElements(type);
    if(!wrap||!list)return;
    wrap.hidden=false;
    const row=document.createElement('div');
    row.className='ops-maintenance-detail-item';
    row.dataset.maintenanceItemType=type;
    row.innerHTML=`<div class="ops-form">
      <label>Description *<textarea class="ops-maintenance-item-description" required placeholder="Describe this ${type==='Repair'?'repair':'maintenance item'}"></textarea></label>
      <label>Parts or consumables used<textarea class="ops-maintenance-item-parts" placeholder="Parts or consumables used for this item"></textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn ghost" type="button" data-ops-remove-maintenance-detail>Remove item</button></div>
    </div>`;
    row.querySelector('[data-ops-remove-maintenance-detail]')?.addEventListener('click',()=>{
      row.remove();
      if(!list.children.length){
        wrap.hidden=true;
        const toggle=document.querySelector(`.ops-maintenance-repeatable-toggle[data-maintenance-repeatable="${type}"]`);
        if(toggle)toggle.checked=false;
      }
    });
    list.appendChild(row);
  }
  function updateRepeatableMaintenanceItems(input){
    const type=input?.dataset?.maintenanceRepeatable||'';
    if(!type)return;
    const {wrap,list}=repeatableMaintenanceElements(type);
    if(!wrap||!list)return;
    if(input.checked){
      wrap.hidden=false;
      if(!list.children.length)addMaintenanceDetailItem(type);
    }else{
      list.innerHTML='';
      wrap.hidden=true;
    }
  }
  function inspectionLogDetails(i){
    const answers=state.answers.filter(a=>String(a.inspection_id)===String(i.id));
    const photos=state.photos.filter(p=>String(p.inspection_id)===String(i.id));
    return `<div class="ops-grid two"><div><strong>Inspector</strong><br>${esc(i.inspector_name||i.submitted_by_email||'—')}</div><div><strong>Result</strong><br>${statusPill(i.overall_result)}</div><div><strong>Odometer</strong><br>${esc(i.odometer??'—')}</div><div><strong>General notes</strong><br>${esc(i.notes||'—')}</div></div>
      <h4>Checklist answers</h4>${answers.length?`<div class="ops-table-wrap"><table class="ops-table"><tr><th>Question</th><th>Answer</th><th>Issue?</th><th>Notes</th></tr>${answers.map(a=>`<tr><td>${esc(a.question_text)}</td><td>${esc(displayStatusLabel(a.answer_value))}</td><td>${a.is_problem?statusPill('Issue to report'):statusPill('Completed OK')}</td><td>${esc(a.notes||'')}</td></tr>`).join('')}</table></div>`:'<p class="ops-subtle">No answers recorded.</p>'}
      <p class="ops-subtle">${photos.length} photo${photos.length===1?'':'s'} recorded.</p>`;
  }
  function manualLogDetails(row){
    const items=maintenanceItemsForRecord(row.id);
    const visibleItems=items.length?items:[{maintenance_done:row.maintenance_done||row.title||'Maintenance',description:row.description||''}];
    return `<div class="ops-grid two"><div><strong>Performed by</strong><br>${esc(row.performed_by||'—')}</div><div><strong>Odometer</strong><br>${esc(row.odometer??'—')}</div><div><strong>Notes</strong><br>${esc(row.notes||'—')}</div></div>
      <h4>Maintenance completed</h4><div class="ops-record-items">${visibleItems.map(item=>`<div><strong>${esc(item.maintenance_done||'Maintenance')}</strong>${item.description?`<br><span>${esc(item.description)}</span>`:''}${item.parts_used?`<br><span class="ops-subtle"><strong>Parts or consumables:</strong> ${esc(item.parts_used)}</span>`:''}</div>`).join('')}</div>
      ${row.parts_used?`<h4>Parts or consumables used</h4><div style="white-space:pre-wrap">${esc(row.parts_used)}</div>`:''}
      ${row.further_maintenance_required?`<h4>Further maintenance tasks required</h4><div style="white-space:pre-wrap">${esc(row.further_maintenance_required)}</div>`:''}`;
  }
  function maintenanceLogRecordHtml(row){
    const body=row.source==='inspection'?inspectionLogDetails(row.sourceRow):manualLogDetails(row.sourceRow);
    return `<details class="ops-log-entry"><summary><span><strong>${nzDate(row.date)}</strong></span><span>${statusPill(row.recordType)}</span><span><strong>${esc(row.target)}</strong></span><span><strong>${esc(row.person||row.title)}</strong>${row.summary?`<br><span class="ops-subtle">${esc(row.summary)}</span>`:''}</span></summary><div class="ops-log-body">${body}</div></details>`;
  }
  function historyHtml(){
    const rows=maintenanceLogRecords().filter(maintenanceRecordMatches);
    return `<div class="ops-history-stack">${canMaintain()?(state.maintenanceEditorOpen?maintenanceLogEntryFormHtml():'<div class="ops-actions ops-assets-actions"><button class="ops-btn primary" type="button" data-ops-action="openMaintenanceEditor">Record Maintenance</button></div>'):''}${maintenanceLogFilterHtml(rows.length)}
      <div class="ops-card"><h3>Maintenance Log</h3>
      <div class="ops-log-list" id="opsMaintenanceLogList">${rows.length?rows.map(maintenanceLogRecordHtml).join(''):'<p class="ops-subtle">No maintenance records match the current filters.</p>'}</div>
    </div></div>`;
  }
  function renderMaintenanceLogResults(){
    const rows=maintenanceLogRecords().filter(maintenanceRecordMatches);
    const list=byId('opsMaintenanceLogList');
    if(list)list.innerHTML=rows.length?rows.map(maintenanceLogRecordHtml).join(''):'<p class="ops-subtle">No maintenance records match the current filters.</p>';
    const count=byId('opsLogFilterCount');
    if(count)count.textContent=`${rows.length} item${rows.length===1?'':'s'} shown.`;
  }
  async function saveMaintenanceLogEntry(e){
    e.preventDefault();if(!canMaintain())return alert('Only Admin or Equipment Manager users can add maintenance records.');
    const submit=e.submitter;if(submit?.disabled)return;if(submit)submit.disabled=true;
    try{
      const vehicleId=byId('opsLogEntryVehicle')?.value||null;
      const targetValue=byId('opsLogEntryTarget')?.value||'';
      const machineryId=targetValue.startsWith('machinery:')?targetValue.slice('machinery:'.length):null;
      const machinery=state.washEquipment.find(w=>String(w.id)===String(machineryId||''));
      const performedByChoice=byId('opsLogEntryPerformedBy')?.value||inspectorDisplayName();
      const performedBy=performedByChoice==='Other service agent'?textOrNull('opsLogEntryOtherAgent'):performedByChoice;
      const routineItems=Array.from(document.querySelectorAll('.ops-maintenance-routine:checked')).map(input=>({
        maintenance_done:input.value,
        description:null,
        parts_used:null
      }));
      const detailedItems=Array.from(document.querySelectorAll('.ops-maintenance-detail-item')).map(row=>({
        maintenance_done:row.dataset.maintenanceItemType||'',
        description:row.querySelector('.ops-maintenance-item-description')?.value.trim()||null,
        parts_used:row.querySelector('.ops-maintenance-item-parts')?.value.trim()||null
      }));
      const maintenanceItems=routineItems.concat(detailedItems);
      if(!vehicleId)return alert('Choose a vehicle.');
      if(!targetValue)return alert('Choose the vehicle or machinery maintained.');
      if(machineryId&&!machinery)return alert('The selected machinery could not be found.');
      if(!maintenanceItems.length)return alert('Choose at least one maintenance item.');
      if(maintenanceItems.some(item=>['Repair','Other maintenance'].includes(item.maintenance_done)&&!item.description))return alert('Describe each repair or other maintenance item completed.');
      if(!performedBy)return alert('Enter the service agent name.');
      const r=await state.sb.rpc('operations_add_maintenance_record_v4053',{
        p_record_date:byId('opsLogEntryDate')?.value||today(),
        p_vehicle_id:vehicleId,
        p_machinery_id:machineryId,
        p_items:maintenanceItems,
        p_performed_by:performedBy,
        p_odometer:numberOrNull('opsLogEntryOdometer'),
        p_parts_used:textOrNull('opsLogEntryParts'),
        p_notes:textOrNull('opsLogEntryNotes'),
        p_further_maintenance_required:textOrNull('opsLogEntryFurtherMaintenance'),
        p_created_by:state.user.id
      });
      if(r.error)return alert('Maintenance record could not be saved: '+r.error.message);
      const taskCreated=Boolean(r.data?.task_id);
      state.maintenanceEditorOpen=false;
      await loadAll();alert(taskCreated?'Maintenance record saved and a follow-up Task was created.':'Maintenance record saved.');
    }finally{if(submit)submit.disabled=false;}
  }

  function scheduleSubnav(){
    const current = state.pmView || 'due';
    const tab = (id,label) => `<button type="button" class="${current===id?'active':''}" data-ops-pm-view="${id}">${label}</button>`;
    return `<div class="ops-nav ops-subnav">${tab('due','Due Now')}${tab('service','Record Service')}${tab('items','Service Items')}${tab('completed','Completed Services')}</div>`;
  }
  function schedulesHtml(){
    const current = state.pmView || 'due';
    return `<div class="ops-card"><div class="ops-section-title"><div><h3>Preventive maintenance</h3><p class="ops-subtle">Use Due Now to see upcoming work, Record Service when you actually service machinery, and Service Items to define the routine work list.</p></div></div>${scheduleSubnav()}${preventiveBodyHtml(current)}</div>`;
  }
  function preventiveBodyHtml(view){
    if(view === 'service') return serviceRunHtml();
    if(view === 'items') return serviceItemsHtml();
    if(view === 'completed') return completedServicesHtml();
    return dueNowPreventiveHtml();
  }
  function dueNowPreventiveHtml(){
    const due = state.schedules.filter(s=>s.is_active !== false && scheduleIsDue(s));
    const soon = state.schedules.filter(s=>s.next_due_at && daysUntil(s.next_due_at)>0 && daysUntil(s.next_due_at)<=14);
    return `<div class="ops-grid four" style="margin:.8rem 0"><div class="ops-card ops-dashboard-stat ops-stat-amber"><span>Due / overdue</span><div class="ops-stat">${due.length}</div><small>Service intervals that need attention</small></div><div class="ops-card ops-dashboard-stat ops-stat-total"><span>Due soon</span><div class="ops-stat">${soon.length}</div><small>Due within 14 days</small></div><div class="ops-card ops-dashboard-stat ops-stat-green"><span>Active schedules</span><div class="ops-stat">${state.schedules.filter(s=>s.is_active!==false).length}</div><small>Current scheduled items</small></div><div class="ops-card ops-dashboard-stat ops-stat-blue"><span>Completed this month</span><div class="ops-stat">${completedServiceRows().length}</div><small>Completed service records</small></div></div>${due.length ? `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Asset</th><th>Service item</th><th>Due</th><th>Action</th></tr>${due.map(s=>{ const w=state.washEquipment.find(x=>x.id===s.washing_equipment_id); const p=state.procedures.find(x=>x.id===s.procedure_id); return `<tr><td>${esc(w ? machineryIdentifier(w) : 'Unknown')}</td><td><strong>${esc(p?.name || 'Unknown')}</strong><br><span class="ops-subtle">${esc(p?.category || '')}</span></td><td>${nzDate(s.next_due_at)} ${targetDueStatus(daysUntil(s.next_due_at))}</td><td>${canMaintain()?`<button class="ops-btn primary" data-ops-pm-view="service" onclick="SWOperationsV4.state.serviceRunAssetId='${esc(w?.id||'')}';">Record service</button>`:''}</td></tr>`; }).join('')}</table></div>` : '<p class="ops-subtle">No preventive service items are due right now.</p>'}<div class="ops-actions"><button class="ops-btn primary" data-ops-pm-view="service">Record a service</button><button class="ops-btn ghost" data-ops-pm-view="items">Manage service items</button></div>`;
  }
  function serviceItemAppliesTo(proc, asset){
    if(!proc || !asset) return false;
    const cat = certNorm(proc.category || 'General');
    const type = certNorm(asset.equipment_type || asset.type || '');
    if(!cat || cat === 'general' || cat === 'all' || cat === 'washing equipment' || cat === 'machinery') return true;
    return cat === type || type.includes(cat) || cat.includes(type);
  }
  function applicableServiceItemsForAsset(assetId){
    const asset = state.washEquipment.find(w=>String(w.id)===String(assetId));
    if(!asset) return [];
    return state.procedures.filter(p=>p.is_active!==false && p.target_type !== 'vehicle' && serviceItemAppliesTo(p, asset)).sort((a,b)=>String(a.category||'').localeCompare(String(b.category||'')) || String(a.name||'').localeCompare(String(b.name||'')));
  }
  function serviceRunHtml(){
    const activeAssets = state.washEquipment.filter(w=>w.status !== 'Inactive' && w.status !== 'Retired').sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    if(!state.serviceRunAssetId && activeAssets[0]) state.serviceRunAssetId = activeAssets[0].id;
    const asset = activeAssets.find(w=>String(w.id)===String(state.serviceRunAssetId)) || activeAssets[0] || null;
    const items = asset ? applicableServiceItemsForAsset(asset.id) : [];
    return `<h3>Record service</h3><p class="ops-subtle">Choose the asset being serviced. The app lists service items that match that asset type. Tick what you actually completed, add any one-off items, then save. Completed routine items reset their date-based service interval.</p>
      <form id="opsServiceRunForm">
        <div class="ops-form"><label>Machinery being serviced<select id="opsServiceRunAsset" required><option value="">Select machinery</option>${activeAssets.map(w=>`<option value="${esc(w.id)}" ${asset && w.id===asset.id?'selected':''}>${esc(machineryIdentifier(w))} - ${esc(machineryTypeLabel(w))}</option>`).join('')}</select></label><label>Service date<input id="opsServiceRunDate" type="date" value="${esc(today())}"></label></div>
        ${asset ? `<div class="ops-card" style="margin-top:1rem"><h4>Routine service items for ${esc(machineryIdentifier(asset))}</h4>${items.length ? items.map(p=>`<label class="ops-check"><input type="checkbox" data-service-item="${esc(p.id)}"> <span><strong>${esc(p.name)}</strong><br><span class="ops-subtle">${esc(p.category || 'General')} · every ${esc(p.frequency_days || '—')} days</span></span></label>`).join('') : '<p class="ops-subtle">No service items match this machinery type yet. Add them under Service Items.</p>'}</div>` : '<p class="ops-subtle">Add machinery first.</p>'}
        <label style="margin-top:1rem">Additional one-off service items completed<textarea id="opsServiceRunAdhoc" placeholder="One item per line, e.g. Replaced cracked hose fitting"></textarea></label>
        <label>Service notes<textarea id="opsServiceRunNotes" placeholder="General service notes"></textarea></label>
        <div class="ops-actions"><button class="ops-btn primary" type="submit">Save completed service</button></div>
      </form>`;
  }
  function serviceItemsHtml(){
    const types = uniqueValues(state.washEquipment.map(w=>machineryTypeLabel(w))).concat(['General']);
    const rows = state.procedures.filter(p=>p.is_active!==false).sort((a,b)=>String(a.category||'').localeCompare(String(b.category||'')) || String(a.name||'').localeCompare(String(b.name||'')));
    return `<h3>Service items</h3><p class="ops-subtle">Create routine service items once. Each item has a machinery type/tag, a task description and a date-based interval.</p>${canMaintain()?`<form id="opsServiceItemForm" class="ops-form"><label>Machinery type / tag<select id="opsServiceItemCategory"><option value="General">General / all machinery</option>${types.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></label><label>Service item / task<input id="opsServiceItemName" required placeholder="e.g. Engine oil change"></label><label>Frequency days<input id="opsServiceItemFrequency" type="number" min="1" value="90"></label><label>Priority<select id="opsServiceItemPriority"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select></label><label class="ops-span-2">Description / notes<textarea id="opsServiceItemDescription" placeholder="What is done and anything important to check"></textarea></label><div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Add service item</button></div></form>`:''}${rows.length ? `<div class="ops-table-wrap" style="margin-top:1rem"><table class="ops-table"><tr><th>Machinery type / tag</th><th>Service item</th><th>Frequency</th><th>Description</th></tr>${rows.map(p=>`<tr><td>${esc(p.category || 'General')}</td><td><strong>${esc(p.name)}</strong></td><td>${esc(p.frequency_days || '—')} days</td><td>${esc(p.description || '')}</td></tr>`).join('')}</table></div>` : '<p class="ops-subtle">No service items saved yet.</p>'}`;
  }
  function completedServiceRows(){
    const firstDay = new Date(); firstDay.setDate(1); const start = firstDay.toISOString().slice(0,10);
    return state.tasks.filter(t => t.status === 'Completed' && (t.procedure_id || t.schedule_id || t.source_type === 'Manual') && String(t.completed_at || t.updated_at || t.created_at || '').slice(0,10) >= start);
  }
  function completedServicesHtml(){
    const rows = state.tasks.filter(t => t.status === 'Completed').sort((a,b)=>String(b.completed_at||b.updated_at||b.created_at||'').localeCompare(String(a.completed_at||a.updated_at||a.created_at||'')));
    return `<h3>Completed services</h3>${rows.length ? `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Date</th><th>Asset</th><th>Service item</th><th>Notes</th></tr>${rows.map(t=>`<tr><td>${nzDate(t.completed_at || t.updated_at || t.created_at)}</td><td>${esc(targetName(t))}</td><td>${esc(t.title)}</td><td>${esc(t.completion_notes || t.description || '')}</td></tr>`).join('')}</table></div>` : '<p class="ops-subtle">No completed service records yet.</p>'}`;
  }
  async function saveServiceItem(e){
    e.preventDefault();
    if(!canMaintain()) return alert('Only Admin or Equipment Manager users can create service items.');
    const row = { name: byId('opsServiceItemName')?.value || '', category: byId('opsServiceItemCategory')?.value || 'General', target_type:'washing_equipment', description: byId('opsServiceItemDescription')?.value || null, frequency_days: Number(byId('opsServiceItemFrequency')?.value || 0) || null, skill_level:'Basic', requires_signoff:false, is_active:true, created_by: state.user.id };
    if(!row.name) return alert('Service item name is required.');
    const r = await state.sb.from('operations_maintenance_procedures').upsert(row, { onConflict:'name' });
    if(r.error) return alert(r.error.message);
    alert('Service item saved.');
    await loadAll(); state.pmView='items'; render();
  }
  async function saveServiceRun(e){
    e.preventDefault();
    if(!canMaintain()) return alert('Only Admin or Equipment Manager users can record services.');
    const assetId = byId('opsServiceRunAsset')?.value || '';
    if(!assetId) return alert('Choose an asset.');
    const serviceDate = byId('opsServiceRunDate')?.value || today();
    const notes = byId('opsServiceRunNotes')?.value || '';
    const servicedAsset = state.washEquipment.find(w=>String(w.id)===String(assetId));
    const serviceVehicleId = servicedAsset?.assigned_vehicle_id || null;
    const selected = Array.from(document.querySelectorAll('input[data-service-item]:checked')).map(i=>i.dataset.serviceItem);
    const adhoc = String(byId('opsServiceRunAdhoc')?.value || '').split('\n').map(x=>x.trim()).filter(Boolean);
    if(!selected.length && !adhoc.length) return alert('Tick at least one service item or enter a one-off service item.');
    let created = 0;
    for(const procId of selected){
      const p = state.procedures.find(x=>String(x.id)===String(procId)); if(!p) continue;
      let schedule = state.schedules.find(s=>String(s.washing_equipment_id)===String(assetId) && String(s.procedure_id)===String(procId));
      const freq = Number(p.frequency_days || schedule?.frequency_days || 0) || null;
      const schedRow = { washing_equipment_id:assetId, procedure_id:procId, frequency_days:freq, last_completed_at:serviceDate, next_due_at:freq?addDays(serviceDate, freq):null, is_active:true, created_by:state.user.id };
      if(schedule){ const up = await state.sb.from('operations_equipment_maintenance_schedules').update(schedRow).eq('id', schedule.id); if(up.error) return alert(up.error.message); }
      else { const ins = await state.sb.from('operations_equipment_maintenance_schedules').insert(schedRow).select().single(); if(ins.error) return alert(ins.error.message); schedule = ins.data; }
      const task = { source_type:'Manual', procedure_id:procId, schedule_id:schedule?.id || null, target_type:'washing_equipment', washing_equipment_id:assetId, vehicle_id:serviceVehicleId, title:p.name, description:p.description || null, status:'Completed', priority:'Medium', completed_at:serviceDate, completed_by:state.user.id, completion_notes:notes || null, created_by:state.user.id };
      const tr = await state.sb.from('operations_maintenance_tasks').insert(task); if(tr.error) return alert(tr.error.message); created++;
    }
    for(const title of adhoc){
      const tr = await state.sb.from('operations_maintenance_tasks').insert({ source_type:'Manual', target_type:'washing_equipment', washing_equipment_id:assetId, vehicle_id:serviceVehicleId, title, description:'One-off service item recorded during service.', status:'Completed', priority:'Medium', completed_at:serviceDate, completed_by:state.user.id, completion_notes:notes || null, created_by:state.user.id });
      if(tr.error) return alert(tr.error.message); created++;
    }
    alert(`Recorded ${created} service item${created===1?'':'s'}.`);
    state.pmView='completed'; await loadAll();
  }

  // V4.0.30 - certificate filter fix, admin tab cleanup, service-item workflow.
  function certSelectedIds(){
    return Array.from(state.certSelectedIds || []);
  }

  function appSettingsHtml(){
    const settings=window.adminSettingsSnapshot?.()||{notificationLeadDays:30,defaultInspectionFrequency:'6 monthly',companyName:'Spray & Wash',certificateFooter:'',logoDataUrl:'',logoFileName:''};
    const logo=settings.logoDataUrl||'assets/logo.png';
    return `<div class="ops-card"><h3>App Settings</h3><form id="opsAppSettingsForm" class="ops-form">
      <label>Due-soon notification lead time<select id="opsAdminNotifyLead">${optionList(['7','14','30','60','90'],String(settings.notificationLeadDays||30))}</select></label>
      <label>Default inspection frequency<select id="opsAdminDefaultFrequency">${optionList(['6 monthly','Annual','Other'],settings.defaultInspectionFrequency||'6 monthly')}</select></label>
      <label class="ops-span-2">Company name on certificates<input id="opsAdminCompanyName" value="${esc(settings.companyName||'Spray & Wash')}" placeholder="Spray & Wash"></label>
      <label class="ops-span-2">Default certificate footer note<textarea id="opsAdminCertFooter" placeholder="Certificate footer wording">${esc(settings.certificateFooter||'')}</textarea></label>
      <div class="ops-span-2 ops-logo-setting"><div><strong>Company logo</strong><p id="opsCompanyLogoStatus" class="ops-subtle">${settings.logoDataUrl?`Current logo: ${esc(settings.logoFileName||'Uploaded company logo')}`:'Using the packaged Spray & Wash logo.'}</p><img id="opsCompanyLogoPreview" class="ops-logo-preview" src="${esc(logo)}" alt="Company logo preview"></div><div><label>Choose logo image<input id="opsCompanyLogoFile" type="file" accept="image/*"></label><div class="ops-actions"><button class="ops-btn" type="button" data-ops-action="uploadCompanyLogo">Upload logo</button></div><p class="ops-subtle">PNG, JPEG or WebP up to 5 MB. The verified logo will appear in the app banner and certificates.</p></div></div>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save app settings</button></div>
    </form></div>`;
  }

  function adminSettingsHtml(){
    return `<div class="ops-card"><h3>Backup</h3><p class="ops-subtle">Use these backup tools before major app or database updates.</p><div class="ops-actions"><button class="ops-btn primary" onclick="exportJSONBackup&&exportJSONBackup()">Full JSON backup</button><button class="ops-btn" onclick="SWOperationsV4.downloadTableCsvV424('equipment','equipment-register-backup.csv')">Download equipment register</button><button class="ops-btn" onclick="SWOperationsV4.downloadTableCsvV424('inspections','inspection-register-backup.csv')">Download inspection register</button></div><div class="dangerBox"><b>Photo buckets</b><p>These CSV backups do not contain files from the equipment-photos or inspection-photos storage buckets.</p></div></div>`;
  }

  function usersHtml(){
    if(!isAdmin()) return `<div class="ops-card"><h3>Users & permissions</h3><p>Only Admin users can pre-load and manage users.</p></div>`;
    const rows = state.pendingUsers || [];
    return `<div class="ops-admin-users"><h3>Users & Permissions</h3>
      <details><summary>Add User</summary><div class="ops-admin-users-body">
        <form id="opsPreloadUserForm" class="ops-form">
          <label>First name<input id="opsPreloadFirst" required placeholder="e.g. Jamie"></label>
          <label>Last name<input id="opsPreloadLast" required placeholder="e.g. Benioni"></label>
          <label>Email<input id="opsPreloadEmail" type="email" required placeholder="name@example.com"></label>
          <label>Status<select id="opsPreloadActive"><option value="true">Active</option><option value="false">Inactive</option></select></label>
          <div class="ops-span-2"><strong>Permissions</strong><div class="ops-permission-grid">${roleCheckboxGridForPreload(['Inspector'])}</div></div>
          <label class="ops-span-2">Notes<textarea id="opsPreloadNotes" placeholder="Optional setup notes"></textarea></label>
          <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save pre-loaded user</button></div>
        </form>
      </div></details>
      <details><summary>Current Users</summary><div class="ops-admin-users-body">
        <h3>Current signed-in users</h3><p class="ops-subtle">Edit roles directly here. These are the live permissions used by the app.</p>${actualUsersHtml()}
        <h3>Pre-loaded users</h3>${rows.length ? `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th>Claimed</th></tr>${rows.map(u=>`<tr><td>${esc(u.display_name || [u.first_name,u.last_name].filter(Boolean).join(' '))}</td><td>${esc(u.email)}</td><td>${roleChips(u.roles||[])}</td><td>${u.active ? statusPill('Active') : statusPill('Inactive')}</td><td>${u.claimed_at ? nzDate(u.claimed_at) : 'Not yet'}</td></tr>`).join('')}</table></div>` : '<p class="ops-subtle">No pre-loaded users yet.</p>'}
      </div></details>
    </div>`;
  }

  function bindRenderedEvents(){
    document.querySelectorAll('[data-ops-view]').forEach(btn => btn.addEventListener('click', () => { state.currentView = btn.dataset.opsView; state.openTaskId=''; render(); }));
    document.querySelectorAll('[data-ops-pm-view]').forEach(btn => btn.addEventListener('click', () => { state.pmView = btn.dataset.opsPmView; state.scheduleQuickFilter=''; render(); }));
    document.querySelectorAll('[data-ops-shortcut]').forEach(card => { const go = () => handleDashboardShortcut(card.dataset.opsShortcut); card.addEventListener('click', go); card.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } }); });
    byId('opsVehicleForm')?.addEventListener('submit', saveVehicle);
    byId('opsWashingForm')?.addEventListener('submit', saveWashing);
    byId('opsMachineryTransferForm')?.addEventListener('submit', saveMachineryTransfer);
    byId('opsMaintenanceLogForm')?.addEventListener('submit', saveMaintenanceLogEntry);
    byId('opsInspectionForm')?.addEventListener('submit', submitInspection);
    byId('opsManualTaskForm')?.addEventListener('submit', createManualTask);
    byId('opsTaskCompleteForm')?.addEventListener('submit', saveTaskUpdate);
    byId('opsTaskSimpleForm')?.addEventListener('submit', saveTaskUpdate);
    byId('opsScheduleForm')?.addEventListener('submit', saveSchedule);
    byId('opsServiceItemForm')?.addEventListener('submit', saveServiceItem);
    byId('opsServiceRunForm')?.addEventListener('submit', saveServiceRun);
    byId('opsServiceRunAsset')?.addEventListener('change', e => { state.serviceRunAssetId = e.target.value; state.pmView='service'; render(); });
    document.querySelectorAll('.ops-item-photo').forEach(input=>input.addEventListener('change',()=>updateInspectionPhotoCount(input)));
    byId('opsAppSettingsForm')?.addEventListener('submit',event=>window.saveAdminSettingsFromOperations?.(event));
    byId('opsPreloadUserForm')?.addEventListener('submit', savePreloadedUser);
    document.querySelectorAll('[data-ops-edit-user]').forEach(b => b.addEventListener('click', () => { state.editingActualUserId=b.dataset.opsEditUser; render(); }));
    document.querySelectorAll('[data-ops-save-user]').forEach(b => b.addEventListener('click', () => saveActualUser(b.dataset.opsSaveUser)));
    document.querySelectorAll('[data-ops-cancel-user-edit]').forEach(b => b.addEventListener('click', () => { state.editingActualUserId=''; render(); }));
    document.querySelectorAll('[data-ops-save-user-roles]').forEach(b => b.addEventListener('click', () => saveActualUserRoles(b.dataset.opsSaveUserRoles)));
    document.querySelectorAll('[data-ops-create-schedule-task]').forEach(b => b.addEventListener('click', () => createTaskFromSchedule(b.dataset.opsCreateScheduleTask)));
    ['certFilterType','certFilterStatus','certFilterResult','certFilterDue'].forEach(id => byId(id)?.addEventListener('change', () => { certSetFilterFromDom(); renderCertificateFilterSelector(); }));
    byId('certFilterSearch')?.addEventListener('input', () => { certSetFilterFromDom(); renderCertificateFilterSelector(); });
    byId('certFilterClear')?.addEventListener('click', () => { state.certFilterType=''; state.certFilterStatus=''; state.certFilterResult=''; state.certFilterDue=''; state.certFilterSearch=''; state.certSelectedIds = new Set(); renderCertificateFilterSelector(); });
    byId('certSelectVisible')?.addEventListener('click', () => { document.querySelectorAll('#certItemList .certItemCheck:not(:disabled)').forEach(i=>{ i.checked=true; state.certSelectedIds.add(String(i.value)); }); renderCertificateFilterSelector(); });
    byId('certClearSelected')?.addEventListener('click', () => { state.certSelectedIds = new Set(); renderCertificateFilterSelector(); });
    document.querySelectorAll('#certItemList .certItemCheck').forEach(i => i.addEventListener('change', () => { if(i.checked) state.certSelectedIds.add(String(i.value)); else state.certSelectedIds.delete(String(i.value)); renderCertificateFilterSelector(); }));
    byId('opsAssetAddType')?.addEventListener('change',e=>{state.assetAddType=e.target.value;render();});
    byId('opsLogAsset')?.addEventListener('change',e=>{state.logAssetId=e.target.value;state.logMachineryId='';render();});
    byId('opsLogMachinery')?.addEventListener('change',e=>{state.logMachineryId=e.target.value;render();});
    byId('opsLogType')?.addEventListener('change',e=>{state.logType=e.target.value;render();});
    byId('opsLogDateFrom')?.addEventListener('change',e=>{state.logDateFrom=e.target.value;render();});
    byId('opsLogDateTo')?.addEventListener('change',e=>{state.logDateTo=e.target.value;render();});
    byId('opsLogKeyword')?.addEventListener('input',e=>{state.logKeyword=e.target.value;renderMaintenanceLogResults();});
    byId('opsLogEntryVehicle')?.addEventListener('change',updateMaintenanceLogEntryAssetOptions);
    document.querySelectorAll('.ops-maintenance-repeatable-toggle').forEach(input=>input.addEventListener('change',()=>updateRepeatableMaintenanceItems(input)));
    document.querySelectorAll('[data-ops-add-maintenance-detail]').forEach(button=>button.addEventListener('click',()=>addMaintenanceDetailItem(button.dataset.opsAddMaintenanceDetail)));
    byId('opsLogEntryPerformedBy')?.addEventListener('change',updateMaintenanceLogEntryConditionalFields);
    byId('opsLogEntryTarget')?.addEventListener('change',updateMaintenanceLogEntryRoutineChoices);
    updateMaintenanceLogEntryAssetOptions();
    updateMaintenanceLogEntryRoutineChoices();
    updateMaintenanceLogEntryConditionalFields();
    ['opsMachineryType','opsWashVehicle','opsMachinerySide'].forEach(id=>byId(id)?.addEventListener('change',updateMachineryFormVisibility));
    updateMachineryFormVisibility();
    ['opsTransferVehicle','opsTransferSide'].forEach(id=>byId(id)?.addEventListener('change',updateMachineryTransferPreview));
    updateMachineryTransferPreview();
    document.querySelectorAll('[data-ops-edit-vehicle]').forEach(b => b.addEventListener('click', () => { state.editingVehicleId = b.dataset.opsEditVehicle;state.editingWashId='';state.assetEditorOpen=true;state.assetAddType='vehicle'; render(); }));
    document.querySelectorAll('[data-ops-edit-wash]').forEach(b => b.addEventListener('click', () => { state.editingWashId = b.dataset.opsEditWash;state.editingVehicleId='';state.assetEditorOpen=true;state.assetAddType='machinery'; state.prefillMachineryVehicleId=''; state.prefillMachinerySide=''; render(); }));
    document.querySelectorAll('[data-ops-transfer-machinery]').forEach(b=>b.addEventListener('click',()=>{state.transferringMachineryId=b.dataset.opsTransferMachinery;state.editingWashId='';state.editingVehicleId='';state.assetEditorOpen=false;render();}));
    document.querySelectorAll('[data-ops-add-machinery]').forEach(b => b.addEventListener('click', () => {
      state.editingWashId='';
      state.editingVehicleId='';
      state.assetEditorOpen=true;
      state.assetAddType='machinery';
      state.prefillMachineryVehicleId=b.dataset.opsAddMachinery||'';
      state.prefillMachinerySide=b.dataset.opsMachinerySide||'';
      render();
    }));
    document.querySelectorAll('[data-ops-open-task]').forEach(b => b.addEventListener('click', () => { state.openTaskId = b.dataset.opsOpenTask; render(); }));
    document.querySelectorAll('[data-ops-action]').forEach(b => b.addEventListener('click', () => handleAction(b.dataset.opsAction)));
  }

  async function handleAction(action){
    if(action === 'openAssetEditor'){ state.assetEditorOpen=true;state.assetAddType='';state.editingVehicleId='';state.editingWashId='';state.prefillMachineryVehicleId='';state.prefillMachinerySide='';state.transferringMachineryId='';render(); }
    if(action === 'closeAssetEditor'||action === 'clearVehicle'||action === 'clearWash'){ state.assetEditorOpen=false;state.assetAddType='';state.editingVehicleId='';state.editingWashId='';state.prefillMachineryVehicleId='';state.prefillMachinerySide='';render(); }
    if(action === 'openMaintenanceEditor'){ state.maintenanceEditorOpen=true;render(); }
    if(action === 'closeMaintenanceEditor'){ state.maintenanceEditorOpen=false;render(); }
    if(action === 'cancelMachineryTransfer'){ state.transferringMachineryId=''; render(); }
    if(action === 'closeTask'){ state.openTaskId=''; render(); }
    if(action === 'generateDueTasks'){ await generateDueTasks(); }
    if(action === 'applyStdSelected'){ await applyStandardSchedules('selected'); }
    if(action === 'applyStdSameType'){ await applyStandardSchedules('same_type'); }
    if(action === 'legacyUserTools'){ openLegacyUserTools(); }
    if(action === 'uploadCompanyLogo'){ await window.uploadCompanyLogo?.(byId('opsCompanyLogoFile')?.files?.[0]); }
    if(action === 'clearMaintenanceLogFilters'){ state.logAssetId='';state.logMachineryId='';state.logType='';state.logDateFrom='';state.logDateTo='';state.logKeyword='';render(); }
    if(action === 'clearTaskFilter'){ state.taskQuickFilter=''; render(); }
    if(action === 'clearScheduleFilter'){ state.scheduleQuickFilter=''; state.pmView='due'; render(); }
    if(action === 'pmSchedules'){ state.pmView='items'; render(); }
    if(action === 'pmTemplates'){ state.pmView='items'; render(); }
    if(action === 'pmCompleted'){ state.pmView='completed'; render(); }
  }



  // V4.0.30 - Height dashboard cleanup and certificate flow simplification.
  function postHeightEnhancementsV415(activeId){
    try{
      hideHeightActionTabsV415();
      const visible = Array.from(document.querySelectorAll('.tabpane')).find(x => !x.classList.contains('hidden'));
      const id = activeId || visible?.id || '';
      if(id === 'dashboard') enhanceHeightDashboardV415();
      if(id === 'equipment') enhanceHeightEquipmentTabV415();
    }catch(err){ console.warn('V4.0.30 UI enhancement skipped:', err); }
  }

  function hideHeightActionTabsV415(){
    const inspectBtn = byId('inspectTabButton') || document.querySelector('.tab[data-tab="inspect"]');
    const dueBtn = document.querySelector('.tab[data-tab="due"]');
    if(inspectBtn) inspectBtn.style.display = 'none';
    if(dueBtn) dueBtn.style.display = 'none';
  }

  function findCardByHeadingV415(text, root){
    const scope = root || document;
    const heads = Array.from(scope.querySelectorAll('h2,h3'));
    const target = text.toLowerCase();
    const h = heads.find(x => String(x.textContent || '').trim().toLowerCase() === target);
    return h ? h.closest('.card,.ops-card') : null;
  }

  function openNewHeightInspectionV415(){
    state.currentModule = 'height';
    setTopTabsMode('height');
    if(originalShowTab) originalShowTab('inspect');
    setTimeout(()=>postHeightEnhancementsV415('inspect'), 80);
  }

  function enhanceHeightDashboardV415(){
    const dash = byId('dashboard');
    if(!dash || dash.classList.contains('hidden')) return;
    hideHeightActionTabsV415();
    // Remove the old Notification Centre card because the coloured dashboard buttons already surface this information.
    const notificationCard = findCardByHeadingV415('Notification Centre', dash);
    if(notificationCard) notificationCard.classList.add('v415-card-hidden');
    // Equipment by type belongs with the Equipment register, not the Dashboard.
    const typeCard = findCardByHeadingV415('Equipment by Type', dash);
    if(typeCard) typeCard.style.display = 'none';
    enhanceRecentInspectionsV415();
  }

  function enhanceHeightEquipmentTabV415(){
    const equipment = byId('equipment');
    if(!equipment || equipment.classList.contains('hidden')) return;
    hideHeightActionTabsV415();
    let typeCard = findCardByHeadingV415('Equipment by Type');
    if(typeCard){
      typeCard.style.display = '';
      typeCard.classList.add('v415-compact-card');
      if(!equipment.contains(typeCard)){
        const list = byId('equipmentList');
        equipment.insertBefore(typeCard, list || null);
      }
    }
  }

  function enhanceRecentInspectionsV415(){
    const recent = byId('dashRecentLegacy');
    if(!recent) return;
    const card = recent.closest('.card');
    if(!card || card.dataset.v415Recent === '1') { applyRecentLimitV415(); return; }
    card.dataset.v415Recent = '1';
    const original = recent;
    const details = document.createElement('details');
    details.id = 'heightRecentInspectionDetails';
    details.className = 'v415-recent-details';
    const summary = document.createElement('summary');
    summary.innerHTML = '<strong>Recent Inspection History</strong> <span class="muted">Click to show/hide</span>';
    const controls = document.createElement('div');
    controls.className = 'row';
    controls.innerHTML = `<label style="max-width:220px">Show last<select id="heightRecentLimitLegacy"><option>10</option><option>20</option><option>30</option><option>50</option></select></label>`;
    card.innerHTML = '';
    details.appendChild(summary);
    details.appendChild(controls);
    details.appendChild(original);
    card.appendChild(details);
    byId('heightRecentLimitLegacy')?.addEventListener('change', applyRecentLimitV415);
    applyRecentLimitV415();
  }

  function applyRecentLimitV415(){
    const recent = byId('dashRecentLegacy');
    const limit = Number(byId('heightRecentLimitLegacy')?.value || 10);
    if(!recent) return;
    const rows = Array.from(recent.querySelectorAll('.lineItem, tr, .listItem, .inspectionRow')).filter(el => !el.querySelector('th'));
    if(rows.length) rows.forEach((row, idx) => { row.style.display = idx < limit ? '' : 'none'; });
  }

  function enhanceCertificatesV415(){
    const certs = byId('certificates');
    if(!certs) return;
    // Hide old batch controls; V4.0.30 certificate generation is filter/search/list based.
    const mode = byId('certMode');
    if(mode){ mode.value = 'selected_items'; const modeLabel = mode.closest('label') || mode.previousElementSibling; if(modeLabel) modeLabel.style.display = 'none'; mode.style.display='none'; }
    ['certTypePanel','certDatePanel','certResultPanel'].forEach(id => { const el = byId(id); if(el) el.style.display = 'none'; });
    document.querySelectorAll('#certItemsPanel .certSelectionTools button').forEach(btn => {
      if(/select all/i.test(btn.textContent || '')) btn.style.display = 'none';
    });
    enhancePhotoOptionsV415();
    hideCertificateHistoryPanel();
    renderCertificateFilterSelector();
    reorderCertificateGenerateStep();
  }

  function enhancePhotoOptionsV415(){
    const eq = byId('certIncludeEquipmentPhotos');
    const ins = byId('certIncludeInspectionPhotos');
    if(!eq || !ins || byId('certPhotoOptionsCompact')) return;
    const panel = eq.closest('.certPanel');
    if(!panel) return;
    eq.style.display = 'none'; ins.style.display = 'none';
    const oldGrid = eq.closest('.grid'); if(oldGrid) oldGrid.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.id = 'certPhotoOptionsCompact';
    wrap.className = 'v415-photo-options';
    wrap.innerHTML = `<label><input type="checkbox" id="certIncludeEquipmentPhotosCheck" checked> Include equipment photos</label><label><input type="checkbox" id="certIncludeInspectionPhotosCheck" checked> Include inspection photos</label>`;
    panel.appendChild(wrap);
    const sync = () => { eq.value = byId('certIncludeEquipmentPhotosCheck')?.checked ? 'yes' : 'no'; ins.value = byId('certIncludeInspectionPhotosCheck')?.checked ? 'yes' : 'no'; };
    byId('certIncludeEquipmentPhotosCheck')?.addEventListener('change', sync);
    byId('certIncludeInspectionPhotosCheck')?.addEventListener('change', sync);
    sync();
  }

  function certSelectedIds(){
    return Array.from(state.certSelectedIds || []);
  }

  async function buildCertificatePairsV405(kind){
    const { equipmentRows, inspectionRows } = await certFetchHeightData();
    const ids = certSelectedIds();
    if(!ids.length) return { pairs: [], before: 0, type: '' };
    const selected = equipmentRows.filter(e => ids.includes(String(e.id)));
    const pairs = certLatestInspectionMap(selected, inspectionRows).filter(p => p.equipment && p.inspection);
    return { pairs, before: selected.length, type: '' };
  }

  async function generateCertificatesV405(kind){
    const btn = document.getElementById('certGenerateBtn');
    try{
      if(btn) btn.disabled = true;
      if(window.setCertValidation) window.setCertValidation('Checking selected equipment and inspections...', 'warn');
      const built = await buildCertificatePairsV405('selected_items');
      if(!built.pairs.length){
        const msg = built.before > 0 ? 'The selected item(s) do not have inspection history to certify.' : 'Tick at least one item with inspection history.';
        if(window.setCertValidation) window.setCertValidation(msg, 'warn');
        alert(msg);
        return;
      }
      if(window.withBusy && window.buildCertificatePacket) await window.withBusy('Generating certificates...', async () => { await window.buildCertificatePacket(built.pairs, 'Selected item certificates'); });
      else if(window.buildCertificatePacket) await window.buildCertificatePacket(built.pairs, 'Selected item certificates');
      else throw new Error('Certificate builder was not found. Please refresh and try again.');
      if(window.setCertValidation) window.setCertValidation(`Generated ${built.pairs.length} certificate${built.pairs.length === 1 ? '' : 's'}.`, 'ready');
    } catch(err){
      alert('Certificate generation failed: ' + (err.message || err));
      if(window.setCertValidation) window.setCertValidation('Certificate generation failed: ' + (err.message || err), 'warn');
    } finally {
      if(btn) btn.disabled = false;
      if(window.updateCertificateUI) window.updateCertificateUI();
      setTimeout(enhanceCertificatesV415, 60);
    }
  }

  function qualificationCertificatePanelHtml(){
    const names = qualificationNames();
    const options = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    return `<h2>Inspector Details</h2>
      <p class="muted">Generate a clean printable inspector details sheet from saved height inspector qualification records. No certificate number is generated.</p>
      <div class="grid two"><div><label>Inspector</label><select id="qualCertSelect"><option value="">Select inspector</option>${options}</select></div></div>
      <div class="row"><button type="button" class="primary" onclick="SWOperationsV4.generateQualificationCertificate()">Generate Inspector Details</button></div>
      ${names.length ? '' : '<p class="muted">No qualifications saved yet. Add qualifications under Height Equipment - Qualifications first.</p>'}`;
  }

  async function generateQualificationCertificate(){
    if(!hasAny(['Admin','Office / Reports','Certificate Approver','Equipment Manager'])) return alert('You do not have permission to generate inspector details.');
    const name = byId('qualCertSelect')?.value || '';
    if(!name) return alert('Select an inspector first.');
    const q = latestQualificationForInspector(name);
    if(!q) return alert('Qualification record not found for this inspector.');
    let fileUrl = '';
    if(q.storage_path){
      try{ const r = await state.sb.storage.from(PHOTO_BUCKET).createSignedUrl(q.storage_path, 3600); if(!r.error) fileUrl = r.data.signedUrl; }catch(e){ console.warn('Qualification file link skipped', e); }
    }
    const html = inspectorDetailsHtmlV415(q, fileUrl);
    const w = window.open('', '_blank');
    if(!w){
      const blob = new Blob([html], {type:'text/html'}); const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `inspector-details-${String(q.inspector_name||'inspector').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}.html`; a.click(); URL.revokeObjectURL(a.href);
      alert('Popup blocked. The inspector details HTML file has been downloaded instead.'); return;
    }
    w.document.open(); w.document.write(html); w.document.close();
  }

  function inspectorDetailsHtmlV415(q, fileUrl){
    return `<!doctype html><html><head><meta charset="utf-8"><title>Inspector Details - ${esc(q.inspector_name)}</title><style>
      body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:40px;color:#0f172a}.doc{max-width:850px;margin:auto;border:1px solid #cbd5e1;padding:34px;border-radius:18px}h1{margin:0 0 8px;color:#0f766e}.muted{color:#64748b}.grid{display:grid;grid-template-columns:180px 1fr;gap:10px;margin-top:24px}.label{font-weight:800;color:#334155;border-bottom:1px solid #e2e8f0;padding:8px}.value{border-bottom:1px solid #e2e8f0;padding:8px}.footer{margin-top:30px;font-size:12px;color:#64748b}.badge{display:inline-block;background:#ecfdf5;color:#0f766e;border-radius:999px;padding:6px 12px;font-weight:800}@media print{button{display:none}body{margin:0}.doc{border:0}}
    </style></head><body><div class="doc"><button onclick="window.print()">Print / Save as PDF</button><h1>Spray &amp; Wash Inspector Details</h1><p class="muted">Height Equipment Inspector Qualification Details</p><p class="badge">Inspector details</p><div class="grid">
      <div class="label">Inspector</div><div class="value">${esc(q.inspector_name || '—')}</div>
      <div class="label">Email</div><div class="value">${esc(q.email || '—')}</div>
      <div class="label">Qualification</div><div class="value">${esc(q.qualification_type || '—')}</div>
      <div class="label">Provider</div><div class="value">${esc(q.provider || '—')}</div>
      <div class="label">Reference</div><div class="value">${esc(q.reference_number || '—')}</div>
      <div class="label">Issue date</div><div class="value">${nzDate(q.issue_date)}</div>
      <div class="label">Expiry date</div><div class="value">${nzDate(q.expiry_date)}</div>
      <div class="label">Uploaded file</div><div class="value">${fileUrl ? `<a href="${esc(fileUrl)}" target="_blank">Open saved qualification file</a>` : '—'}</div>
      <div class="label">Notes</div><div class="value">${esc(q.notes || '—')}</div>
    </div><div class="footer">Generated ${new Date().toLocaleString('en-NZ')} from Spray &amp; Wash Operations.</div></div></body></html>`;
  }

  async function renderCertificateFilterSelector(){
    const list = byId('certItemList');
    if(!list || !state.sb) return;
    const filters = certFilterState();
    try{
      const { equipmentRows, inspectionRows } = await certFetchHeightData();
      const activeRows = equipmentRows.filter(certIsActiveEquipment);
      const allPairs = certLatestInspectionMap(activeRows, inspectionRows);
      const types = uniqueValues(activeRows.map(e=>e.type));
      const statuses = uniqueValues(activeRows.map(e=>e.status));
      let panel = byId('certFilterPanel');
      if(!panel){
        panel = document.createElement('div');
        panel.id = 'certFilterPanel';
        panel.className = 'ops-cert-search';
        const panelParent = list.parentElement || byId('certItemsPanel') || byId('certificates');
        panelParent.insertBefore(panel, list);
      }
      panel.innerHTML = `<h3 style="margin-top:0">2. Filter and select items</h3>
        <p class="muted">Use filters to narrow the list, then tick only the individual items you want included.</p>
        <div class="ops-filter-grid">
          <label>Equipment type<select id="certFilterType"><option value="">All equipment types</option>${types.map(t=>`<option value="${esc(t)}" ${filters.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
          <label>Status<select id="certFilterStatus"><option value="">All statuses</option>${statuses.map(t=>`<option value="${esc(t)}" ${filters.status===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
          <label>Inspection result<select id="certFilterResult"><option value="" ${!filters.result?'selected':''}>All results</option><option value="Pass" ${filters.result==='Pass'?'selected':''}>Completed OK</option><option value="Fail - Repair Required" ${filters.result==='Fail - Repair Required'?'selected':''}>Issue - repair required</option><option value="Fail - Remove From Service / Disposal" ${filters.result==='Fail - Remove From Service / Disposal'?'selected':''}>Remove from service / disposal</option></select></label>
          <label>Due status<select id="certFilterDue"><option value="" ${!filters.due?'selected':''}>All due states</option><option value="due" ${filters.due==='due'?'selected':''}>Due / overdue</option><option value="ok" ${filters.due==='ok'?'selected':''}>Not due</option><option value="no_inspection" ${filters.due==='no_inspection'?'selected':''}>No inspection history</option></select></label>
          <label>Keyword search<input id="certFilterSearch" type="search" value="${esc(filters.q)}" placeholder="Serial, type, manufacturer, model"></label>
        </div>
        <div class="ops-actions"><button class="ops-btn ghost" type="button" id="certFilterClear">Clear filters</button><button class="ops-btn ghost" type="button" id="certClearSelected">Clear selected</button></div>
        <div id="certFilterCount" class="muted" style="margin-top:6px"></div><div id="certSelectedReview" class="v415-selected-review"></div>`;
      let pairs = allPairs.filter(pair => {
        const e = pair.equipment || {}; const i = pair.inspection || null;
        if(filters.type && certTypeNorm(e.type) !== certTypeNorm(filters.type)) return false;
        if(filters.status && !certStatusMatches(e.status, filters.status)) return false;
        if(filters.result && (!i || !certResultMatches(i.result, filters.result))) return false;
        if(filters.due === 'due' && !certIsDueFromPair(pair)) return false;
        if(filters.due === 'ok' && certIsDueFromPair(pair)) return false;
        if(filters.due === 'no_inspection' && i) return false;
        if(filters.q && !certPairHaystack(pair).includes(filters.q)) return false;
        return true;
      });
      list.innerHTML = pairs.map(pair => {
        const e = pair.equipment || {}; const i = pair.inspection;
        const disabled = i ? '' : 'disabled';
        const disabledText = i ? '' : ' <span class="ops-pill ops-warn">No inspection history</span>';
        const checked = state.certSelectedIds.has(String(e.id)) ? 'checked' : '';
        return `<label class="certItemCheckRow ops-cert-row"><input type="checkbox" class="certItemCheck" value="${esc(e.id)}" ${checked} ${disabled}> <span><strong>${esc(e.serial || 'No serial')} ${esc(e.type || '')}</strong><br><span class="muted">${esc(e.manufacturer || '')} ${esc(e.model || '')} · ${esc(e.status || '')} · Latest: ${i ? nzDate(i.inspection_date) + ' ' + displayStatusLabel(i.result) : 'none'}</span>${disabledText}</span></label>`;
      }).join('') || '<p class="muted">No items match the current filters.</p>';
      bindCertificateFilterEventsV415();
      updateCertificateSelectionSummaryV415(pairs);
      if(byId('certMode')) byId('certMode').value = 'selected_items';
      enhancePhotoOptionsV415();
    }catch(err){
      list.innerHTML = `<div class="ops-error">Could not load certificate items: ${esc(err.message || err)}</div>`;
    }
  }

  function bindCertificateFilterEventsV415(){
    ['certFilterType','certFilterStatus','certFilterResult','certFilterDue'].forEach(id => byId(id)?.addEventListener('change', () => { certSetFilterFromDom(); renderCertificateFilterSelector(); }));
    byId('certFilterSearch')?.addEventListener('input', () => { certSetFilterFromDom(); renderCertificateFilterSelector(); });
    byId('certFilterClear')?.addEventListener('click', () => { state.certFilterType=''; state.certFilterStatus=''; state.certFilterResult=''; state.certFilterDue=''; state.certFilterSearch=''; renderCertificateFilterSelector(); });
    byId('certClearSelected')?.addEventListener('click', () => { state.certSelectedIds = new Set(); renderCertificateFilterSelector(); });
    document.querySelectorAll('#certItemList .certItemCheck').forEach(i => i.addEventListener('change', () => { if(i.checked) state.certSelectedIds.add(String(i.value)); else state.certSelectedIds.delete(String(i.value)); updateCertificateSelectionSummaryV415(); }));
  }

  function updateCertificateSelectionSummaryV415(currentPairs){
    const selectedIds = Array.from(state.certSelectedIds || []);
    const countText = `${selectedIds.length} selected`;
    if(byId('certSelectedCount')) byId('certSelectedCount').textContent = countText;
    const count = byId('certFilterCount');
    const pairs = currentPairs || Array.from(document.querySelectorAll('#certItemList .certItemCheckRow')).map(row => null);
    const visibleRows = document.querySelectorAll('#certItemList .certItemCheckRow').length;
    const withHistory = document.querySelectorAll('#certItemList .certItemCheck:not(:disabled)').length;
    if(count) count.textContent = `${visibleRows} item${visibleRows===1?'':'s'} shown; ${withHistory} with inspection history; ${selectedIds.length} selected.`;
    const review = byId('certSelectedReview');
    if(review){
      const selectedLabels = Array.from(document.querySelectorAll('#certItemList .certItemCheck:checked')).map(x => x.closest('.certItemCheckRow')?.innerText.trim()).filter(Boolean);
      review.innerHTML = selectedIds.length ? `<strong>Selected for generation:</strong><ul>${selectedLabels.slice(0,8).map(t=>`<li>${esc(t.split('\n')[0])}</li>`).join('')}${selectedIds.length>8?`<li>...and ${selectedIds.length-8} more</li>`:''}</ul>` : '<strong>No items selected.</strong> Tick items from the filtered list below.';
    }
    if(window.setCertValidation){
      window.setCertValidation(selectedIds.length ? `${selectedIds.length} selected. Ready to generate certificates.` : 'Tick at least one item with inspection history.', selectedIds.length ? 'ready' : 'warn');
    }
  }

  function boot(){
    injectTab();
    installModulePortal();
    installShortCertificateNumberPatch();
    installCertificateV405Patch();
    initSupabase().catch(err => { state.lastError = err.message; render(); });
    window.SWOperationsV4 = { refresh: loadAll, show: showOperations, state, openQualificationFile, generateQualificationCertificate, handleDashboardShortcut, openNewHeightInspectionV415 };
    setupLogoHomeClick();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* V4.0.30 corrective UI and certificate patch */
(function(){
  const VERSION = '4.0.63';
  const PHOTO_BUCKET = 'inspection-photos';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = v => String(v || '').trim().toLowerCase();
  const todayIso = () => new Date().toISOString().slice(0,10);
  const nzDate = v => { if(!v) return '—'; const d = new Date(v); return isNaN(d) ? String(v).slice(0,10) : d.toLocaleDateString('en-NZ'); };
  const statusLabel = r => {
    const raw = String(r || '—');
    if(raw === 'Pass') return 'Completed OK';
    if(raw === 'Fail - Repair Required') return 'Issue - repair required';
    if(raw === 'Fail - Remove From Service / Disposal') return 'Remove from service';
    return raw || '—';
  };
  const statusClass = r => /pass|completed ok|in service/i.test(String(r||'')) ? 'ok' : /fail|issue|quarantine|remove/i.test(String(r||'')) ? 'bad' : 'warn';
  function api(){ return window.SWOperationsV4 || {}; }
  function state(){ return api().state || {}; }
  function sb(){ return state().sb; }

  function injectCss(){
    if($('sw417Styles')) return;
    const st = document.createElement('style');
    st.id = 'sw417Styles';
    st.textContent = `
      .sw417-filter-panel{background:#ecfdf5;border:1px solid #14b8a6;border-radius:14px;padding:14px;margin:12px 0;}
      .sw417-filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;}
      .sw417-filter-grid label{display:flex;flex-direction:column;font-weight:800;font-size:.88rem;gap:5px;}
      .sw417-filter-grid input,.sw417-filter-grid select{border:1px solid #cbd5e1;border-radius:10px;padding:10px;background:white;min-height:42px;}
      .sw417-row-list{border:1px solid #dbe7ee;border-radius:14px;background:white;max-height:420px;overflow:auto;padding:8px;margin:10px 0;}
      .sw417-check-row{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;padding:11px;border-bottom:1px solid #e5edf3;cursor:pointer;}
      .sw417-check-row:last-child{border-bottom:0;}
      .sw417-meta{color:#475569;font-size:.88rem;margin-top:2px;}
      .sw417-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px;}
      .sw417-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-weight:800;font-size:.78rem;}
      .sw417-pill.ok{background:#dcfce7;color:#047857;}.sw417-pill.bad{background:#fee2e2;color:#b91c1c;}.sw417-pill.warn{background:#fef3c7;color:#b45309;}
      .sw417-history-scroll{max-height:520px;overflow:auto;border:1px solid #e5edf3;border-radius:12px;background:#fff;}
      .sw417-table{width:100%;border-collapse:collapse;}.sw417-table th,.sw417-table td{padding:9px 10px;border-bottom:1px solid #e5edf3;text-align:left;vertical-align:top}.sw417-table th{background:#f8fafc;font-weight:900;}
      .sw417-cert-panel-compact{display:flex;gap:12px;flex-wrap:wrap;align-items:center;}
      .sw417-cert-panel-compact button{min-width:220px;}
      .sw417-asset-filters{margin-bottom:12px;}
    `;
    document.head.appendChild(st);
  }

  async function loadHeightData(){
    const client = sb();
    if(!client) throw new Error('Supabase is not ready.');
    const [eq, ins] = await Promise.all([
      client.from('equipment').select('*').order('type', {ascending:true}).order('serial', {ascending:true}),
      client.from('inspections').select('*').order('inspection_date', {ascending:false})
    ]);
    if(eq.error) throw eq.error;
    if(ins.error) throw ins.error;
    return { equipment: eq.data || [], inspections: ins.data || [] };
  }
  function latestInspectionFor(e, inspections){
    const id = String(e.id || ''); const serial = norm(e.serial);
    return (inspections || []).filter(i => String(i.equipment_id || '') === id || norm(i.serial) === serial)
      .sort((a,b)=>String(b.inspection_date||b.created_at||'').localeCompare(String(a.inspection_date||a.created_at||'')))[0] || null;
  }
  function certHaystack(pair){
    const e = pair.equipment || {}; const i = pair.inspection || {};
    return [e.serial,e.type,e.manufacturer,e.model,e.status,i.result,i.inspector].map(norm).join(' ');
  }
  function isDue(pair){
    const i = pair.inspection;
    if(!i) return true;
    const due = String(i.next_due || i.next_inspection_due || i.due_date || '').slice(0,10);
    return !due || due <= todayIso();
  }
  function pairMatchesFilters(pair, filters){
    const e = pair.equipment || {}; const i = pair.inspection || null;
    if(filters.type && norm(e.type) !== norm(filters.type)) return false;
    if(filters.status && norm(e.status) !== norm(filters.status)) return false;
    if(filters.result && (!i || norm(i.result) !== norm(filters.result))) return false;
    if(filters.due === 'due' && !isDue(pair)) return false;
    if(filters.due === 'ok' && isDue(pair)) return false;
    if(filters.due === 'no_inspection' && i) return false;
    if(filters.q && !certHaystack(pair).includes(norm(filters.q))) return false;
    return true;
  }
  function getCertFilters(){
    return {
      type: $('certFilterType')?.value || '',
      status: $('certFilterStatus')?.value || '',
      result: $('certFilterResult')?.value || '',
      due: $('certFilterDue')?.value || '',
      q: $('certFilterSearch')?.value || ''
    };
  }
  function selectedSet(){
    const st = state();
    if(!st.certSelectedIds) st.certSelectedIds = new Set();
    if(!window.__sw417CertSelected) window.__sw417CertSelected = st.certSelectedIds;
    return window.__sw417CertSelected;
  }
  function selectedIds(){ return Array.from(selectedSet()).map(String); }
  function setValidation(msg, good){
    const box = $('certValidation');
    if(box){ box.textContent = msg; box.className = 'certValidation ' + (good ? 'ready' : 'warn'); }
    const btn = $('certGenerateBtn'); if(btn) btn.disabled = false;
    const btn2 = $('certGenerateCombinedBtn'); if(btn2) btn2.disabled = false;
  }
  function updateCertSelectedCount(){
    const count = selectedIds().length;
    if($('certSelectedCount')) $('certSelectedCount').textContent = `${count} selected`;
    const btn = $('certGenerateBtn'); if(btn) btn.disabled = false;
    const btn2 = $('certGenerateCombinedBtn'); if(btn2) btn2.disabled = false;
    setValidation(count ? `${count} selected. Ready to generate.` : 'Tick at least one item with inspection history.', !!count);
  }

  async function renderCertificateFilterList(){
    const list = $('certItemList');
    if(!list) return;
    try{
      const { equipment, inspections } = await loadHeightData();
      const pairs = equipment.map(e => ({ equipment:e, inspection:latestInspectionFor(e, inspections) }));
      const filters = getCertFilters();
      const filtered = pairs.filter(p => pairMatchesFilters(p, filters));
      list.classList.add('sw417-row-list');
      list.innerHTML = filtered.map(pair => {
        const e = pair.equipment, i = pair.inspection;
        const disabled = i ? '' : 'disabled';
        const checked = selectedSet().has(String(e.id)) ? 'checked' : '';
        return `<label class="sw417-check-row"><input type="checkbox" class="sw417-cert-check" value="${esc(e.id)}" ${checked} ${disabled}><span><strong>${esc(e.serial || 'No serial')} ${esc(e.type || '')}</strong><div class="sw417-meta">${esc(e.manufacturer || '')} ${esc(e.model || '')} · ${esc(e.status || '')} · ${i ? `Latest: ${nzDate(i.inspection_date)} ${statusLabel(i.result)}` : 'No inspection history'}</div></span></label>`;
      }).join('') || '<p class="muted">No items match the current filters.</p>';
      const info = $('certFilterCount');
      const withHistory = filtered.filter(p=>p.inspection).length;
      if(info) info.textContent = `${filtered.length} item${filtered.length===1?'':'s'} shown; ${withHistory} with inspection history; ${selectedIds().length} selected.`;
      list.querySelectorAll('.sw417-cert-check').forEach(ch => ch.addEventListener('change', () => {
        if(ch.checked) selectedSet().add(String(ch.value)); else selectedSet().delete(String(ch.value));
        updateCertSelectedCount();
        renderSelectedReview(filtered);
      }));
      renderSelectedReview(filtered);
      updateCertSelectedCount();
    }catch(err){ list.innerHTML = `<div class="ops-error">Could not load certificate items: ${esc(err.message || err)}</div>`; }
  }
  function renderSelectedReview(filtered){
    const review = $('certSelectedReview');
    if(!review) return;
    const ids = new Set(selectedIds());
    const labels = (filtered || []).filter(p=>ids.has(String(p.equipment.id))).map(p=>`${p.equipment.serial || 'No serial'} ${p.equipment.type || ''}`);
    review.innerHTML = ids.size ? `<strong>${ids.size} selected:</strong> ${labels.slice(0,6).map(esc).join(', ')}${ids.size>6?'...':''}` : '<strong>No items selected.</strong> Tick items from the list below.';
  }
  function installCertificateUi(){
    const cert = $('certificates');
    if(!cert) return;
    // Remove legacy/confusing bulk buttons.
    Array.from(cert.querySelectorAll('button')).forEach(b => {
      const t = (b.textContent || '').trim().toLowerCase();
      if(t.includes('select visible items') || t.includes('select all with inspections')) b.remove();
    });
    const action = cert.querySelector('.ops-cert-generate-step') || $('certGenerateBtn')?.parentElement;
    if(action){
      action.classList.add('sw417-cert-panel-compact');
      const h = action.querySelector('h3'); if(h) h.remove();
      const btn = $('certGenerateBtn');
      if(btn){ btn.textContent = 'Generate separate certificates'; btn.disabled = false; btn.onclick = () => generateSeparateCertificates(); }
      if(!$('certGenerateCombinedBtn')){
        const b = document.createElement('button');
        b.id = 'certGenerateCombinedBtn'; b.className = 'primary'; b.type = 'button'; b.textContent = 'Generate one combined certificate';
        b.addEventListener('click', generateCombinedCertificates);
        action.appendChild(b);
      }
    }
    ['certFilterType','certFilterStatus','certFilterResult','certFilterDue','certFilterSearch'].forEach(id => {
      const el = $(id); if(el && !el.dataset.sw417Bound){ el.dataset.sw417Bound='1'; el.addEventListener(id==='certFilterSearch'?'input':'change', () => setTimeout(renderCertificateFilterList, 30)); }
    });
    $('certFilterClear')?.addEventListener('click', () => setTimeout(renderCertificateFilterList, 30));
    $('certClearSelected')?.addEventListener('click', () => { selectedSet().clear(); setTimeout(renderCertificateFilterList, 30); });
    renderCertificateFilterList();
  }

  async function selectedCertificatePairs(){
    const ids = new Set(selectedIds());
    const { equipment, inspections } = await loadHeightData();
    return equipment.filter(e => ids.has(String(e.id))).map(e => ({ equipment:e, inspection:latestInspectionFor(e, inspections) })).filter(p => p.inspection);
  }
  async function generateSeparateCertificates(){
    const pairs = await selectedCertificatePairs();
    if(!pairs.length) return alert('Tick at least one item with inspection history.');
    if(window.withBusy && window.buildCertificatePacket) await window.withBusy('Generating certificates...', async()=>window.buildCertificatePacket(pairs, 'Selected item certificates'));
    else if(window.buildCertificatePacket) await window.buildCertificatePacket(pairs, 'Selected item certificates');
    else return alert('Certificate builder was not found. Refresh and try again.');
    setValidation(`Generated ${pairs.length} separate certificate${pairs.length===1?'':'s'}.`, true);
  }
  function combinedCertificateHtml(pairs){
    const rows = pairs.map(p => {
      const e = p.equipment || {}, i = p.inspection || {};
      const result = statusLabel(i.result);
      const cls = statusClass(i.result);
      return `<tr><td>${esc(e.serial || '')}</td><td>${esc(e.type || '')}</td><td>${esc(e.manufacturer || '')}</td><td>${esc(e.model || '')}</td><td>${nzDate(i.inspection_date)}</td><td><span class="pill ${cls}">${esc(result)}</span></td><td>${esc(i.inspector || '')}</td></tr>`;
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Spray & Wash Equipment Inspection Summary</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#0f172a}.doc{max-width:1100px;margin:auto}.head{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #0f766e;padding-bottom:16px;margin-bottom:18px}h1{margin:0;color:#0f766e}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #dbe7ee;padding:9px;text-align:left;vertical-align:top}th{background:#f1f5f9}.pill{border-radius:999px;padding:4px 8px;font-weight:800;display:inline-block}.ok{background:#dcfce7;color:#047857}.bad{background:#fee2e2;color:#b91c1c}.warn{background:#fef3c7;color:#b45309}.muted{color:#64748b}.footer{margin-top:28px;font-size:12px;color:#64748b}@media print{button{display:none}}</style></head><body><div class="doc"><button onclick="print()">Print / Save as PDF</button><div class="head"><div><h1>Spray & Wash Equipment Inspection Summary</h1><p class="muted">Combined inspection certificate/report for selected height equipment.</p></div><div><strong>Generated</strong><br>${new Date().toLocaleString('en-NZ')}</div></div><table><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer</th><th>Model</th><th>Inspection date</th><th>Result</th><th>Inspector</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">This document summarises the latest inspection record for each selected item in Spray & Wash Operations.</div></div></body></html>`;
  }
  async function generateCombinedCertificates(){
    const pairs = await selectedCertificatePairs();
    if(!pairs.length) return alert('Tick at least one item with inspection history.');
    const html = combinedCertificateHtml(pairs);
    const w = window.open('', '_blank');
    if(w){ w.document.open(); w.document.write(html); w.document.close(); }
    else { const blob = new Blob([html], {type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='spray-wash-combined-inspection-summary.html'; a.click(); URL.revokeObjectURL(a.href); }
    setValidation(`Generated one combined certificate/report for ${pairs.length} item${pairs.length===1?'':'s'}.`, true);
  }

  async function renderRecentHistory(){
    const box = $('dashRecentLegacy'); if(!box) return;
    try{
      const limit = Number($('heightRecentLimitLegacy')?.value || 10);
      const { equipment, inspections } = await loadHeightData();
      const eqById = new Map(equipment.map(e=>[String(e.id), e]));
      const eqBySerial = new Map(equipment.map(e=>[norm(e.serial), e]));
      const rows = inspections.slice(0, limit).map(i => {
        const e = eqById.get(String(i.equipment_id || '')) || eqBySerial.get(norm(i.serial)) || {};
        return `<tr><td>${nzDate(i.inspection_date || i.created_at)}</td><td><strong>${esc(e.serial || i.serial || '')}</strong></td><td>${esc(e.type || i.type || '')}</td><td><span class="sw417-pill ${statusClass(i.result)}">${esc(statusLabel(i.result))}</span></td><td>${esc(i.inspector || '')}</td></tr>`;
      }).join('');
      box.innerHTML = `<div class="sw417-history-scroll"><table class="sw417-table"><thead><tr><th>Date</th><th>Serial</th><th>Type</th><th>Result</th><th>Inspector</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }catch(e){ console.warn('Recent history patch failed', e); }
  }
  function installRecentHistory(){
    const sel = $('heightRecentLimitLegacy');
    if(sel && !sel.dataset.sw417){ sel.dataset.sw417='1'; sel.value = sel.value || '10'; sel.addEventListener('change', renderRecentHistory); }
    renderRecentHistory();
  }

  async function installEquipmentFilters(){
    const list = $('equipmentList'); if(!list) return;
    const oldSearch = $('search')?.closest('.row'); if(oldSearch) oldSearch.style.display = 'none';
    if(!$('heightEquipmentFilterPanel')){
      const panel = document.createElement('div'); panel.id='heightEquipmentFilterPanel'; panel.className='sw417-filter-panel sw417-asset-filters';
      panel.innerHTML = `<h3 style="margin-top:0">Filter equipment</h3><div class="sw417-filter-grid"><label>Equipment type<select id="eqFilterType"><option value="">All types</option></select></label><label>Status<select id="eqFilterStatus"><option value="">All statuses</option></select></label><label>Due status<select id="eqFilterDue"><option value="">All due states</option><option value="due">Due / overdue</option><option value="ok">Not due</option><option value="no_inspection">No inspection history</option></select></label><label>Keyword search<input id="eqFilterSearch" type="search" placeholder="Serial, type, manufacturer, model"></label></div><div class="sw417-actions"><button type="button" id="eqFilterClear">Clear filters</button></div><div id="eqFilterCount" class="muted" style="margin-top:6px"></div>`;
      list.parentElement.insertBefore(panel, list);
      ['eqFilterType','eqFilterStatus','eqFilterDue','eqFilterSearch'].forEach(id => panel.querySelector('#'+id).addEventListener(id==='eqFilterSearch'?'input':'change', renderEquipmentFilteredList));
      panel.querySelector('#eqFilterClear').addEventListener('click', () => { ['eqFilterType','eqFilterStatus','eqFilterDue','eqFilterSearch'].forEach(id => { const el=$(id); if(el) el.value=''; }); renderEquipmentFilteredList(); });
    }
    await populateEquipmentFilterOptions();
    renderEquipmentFilteredList();
  }
  async function populateEquipmentFilterOptions(){
    const { equipment } = await loadHeightData();
    const types = [...new Set(equipment.map(e=>e.type).filter(Boolean))].sort();
    const statuses = [...new Set(equipment.map(e=>e.status).filter(Boolean))].sort();
    const typeSel = $('eqFilterType'), statusSel = $('eqFilterStatus');
    if(typeSel && typeSel.options.length <= 1) typeSel.innerHTML = '<option value="">All types</option>' + types.map(t=>`<option>${esc(t)}</option>`).join('');
    if(statusSel && statusSel.options.length <= 1) statusSel.innerHTML = '<option value="">All statuses</option>' + statuses.map(t=>`<option>${esc(t)}</option>`).join('');
  }
  async function renderEquipmentFilteredList(){
    const list = $('equipmentList'); if(!list) return;
    try{
      const { equipment, inspections } = await loadHeightData();
      const filters = { type:$('eqFilterType')?.value||'', status:$('eqFilterStatus')?.value||'', due:$('eqFilterDue')?.value||'', q:norm($('eqFilterSearch')?.value||'') };
      let pairs = equipment.map(e=>({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p=>pairMatchesFilters(p, filters));
      $('eqFilterCount') && ($('eqFilterCount').textContent = `${pairs.length} item${pairs.length===1?'':'s'} shown.`);
      list.innerHTML = `<div class="sw417-row-list"><table class="sw417-table"><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer / model</th><th>Status</th><th>Latest inspection</th></tr></thead><tbody>${pairs.map(p=>{ const e=p.equipment,i=p.inspection; return `<tr onclick="${window.openDetail?'openDetail(\''+esc(e.id)+'\')':''}" style="cursor:pointer"><td><strong>${esc(e.serial||'')}</strong></td><td>${esc(e.type||'')}</td><td>${esc(e.manufacturer||'')} ${esc(e.model||'')}</td><td>${esc(e.status||'')}</td><td>${i?`${nzDate(i.inspection_date)} ${statusLabel(i.result)}`:'No inspection history'}</td></tr>`; }).join('')}</tbody></table></div>`;
    }catch(err){ list.innerHTML = `<div class="ops-error">Could not load equipment list: ${esc(err.message || err)}</div>`; }
  }

  async function generateInspectorDetails(){
    const client = sb();
    const name = $('qualCertSelect')?.value || '';
    if(!name) return alert('Select an inspector first.');
    const q = (state().qualifications || []).filter(x => norm(x.inspector_name) === norm(name)).sort((a,b)=>String(b.expiry_date||'9999').localeCompare(String(a.expiry_date||'9999')))[0];
    if(!q) return alert('Qualification record not found for this inspector.');
    let embed = '', fileNote = '—';
    if(q.storage_path && client){
      try{
        const dl = await client.storage.from(PHOTO_BUCKET).download(q.storage_path);
        if(dl.error) throw dl.error;
        const blob = dl.data;
        const dataUrl = await new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=reject; fr.readAsDataURL(blob); });
        if(String(blob.type || q.file_name || '').toLowerCase().includes('pdf')){
          embed = `<p><a href="${esc(dataUrl)}" download="${esc(q.file_name || 'qualification.pdf')}">Download saved qualification file</a></p>`;
        }else{
          embed = `<img src="${esc(dataUrl)}" style="max-width:100%;max-height:620px;border:1px solid #dbe7ee;border-radius:12px" alt="Inspector qualification image">`;
        }
        fileNote = q.file_name || 'Saved file embedded';
      }catch(e){ fileNote = 'Saved file could not be embedded: ' + (e.message || e); }
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Inspector Details</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#0f172a}.doc{max-width:900px;margin:auto}.head{border-bottom:3px solid #0f766e;padding-bottom:14px;margin-bottom:18px}h1{color:#0f766e;margin:0}.grid{display:grid;grid-template-columns:210px 1fr;gap:0}.label,.value{border-bottom:1px solid #e5edf3;padding:9px}.label{font-weight:800;background:#f8fafc}.muted{color:#64748b}@media print{button{display:none}}</style></head><body><div class="doc"><button onclick="print()">Print / Save as PDF</button><div class="head"><h1>Spray &amp; Wash Inspector Details</h1><p class="muted">Height equipment inspector qualification details</p></div><div class="grid"><div class="label">Inspector</div><div class="value">${esc(q.inspector_name)}</div><div class="label">Email</div><div class="value">${esc(q.email||'—')}</div><div class="label">Qualification</div><div class="value">${esc(q.qualification_type||'—')}</div><div class="label">Provider</div><div class="value">${esc(q.provider||'—')}</div><div class="label">Reference</div><div class="value">${esc(q.reference_number||'—')}</div><div class="label">Issue date</div><div class="value">${nzDate(q.issue_date)}</div><div class="label">Expiry date</div><div class="value">${nzDate(q.expiry_date)}</div><div class="label">Saved file</div><div class="value">${esc(fileNote)}</div><div class="label">Notes</div><div class="value">${esc(q.notes||'—')}</div></div>${embed ? `<h2>Uploaded qualification file</h2>${embed}` : ''}<p class="muted">Generated ${new Date().toLocaleString('en-NZ')} from Spray &amp; Wash Operations.</p></div></body></html>`;
    const w = window.open('', '_blank');
    if(w){ w.document.open(); w.document.write(html); w.document.close(); }
    else { const blob = new Blob([html], {type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='inspector-details.html'; a.click(); URL.revokeObjectURL(a.href); }
  }

  function install(){
    injectCss();
    document.querySelector('.tagline') && (document.querySelector('.tagline').textContent = 'Version 4.0.63 • Height Safety • Vehicle Checks • Equipment • Maintenance');
    installRecentHistory();
    /* equipment register is owned by app.js in V4.0.30 */
    const old = api();
    window.SWOperationsV4 = Object.assign(old, {
      renderEquipmentFilteredListV417: renderEquipmentFilteredList,
      renderRecentHistoryV417: renderRecentHistory
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(install, 700)); else setTimeout(install, 700);
  // V4.0.30: disabled V4.0.30 repeating DOM patch timer to prevent version/layout flicker.
})();

/* V4.0.30 corrective UI/certificate/equipment/inspection patch */
(function(){
  const VERSION = '4.0.63';
  const PHOTO_BUCKET = 'inspection-photos';
  const EQUIP_BUCKET = 'equipment-photos';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = v => String(v || '').trim().toLowerCase();
  const nzDate = v => { if(!v) return '—'; const d = new Date(v); return isNaN(d) ? String(v).slice(0,10) : d.toLocaleDateString('en-NZ'); };
  function api(){ return window.SWOperationsV4 || {}; }
  function state(){ return api().state || {}; }
  function sb(){ return state().sb || window.sb || null; }
  function statusLabel(r){ const raw=String(r||'—'); if(raw==='Pass') return 'Completed OK'; if(raw==='Fail - Repair Required') return 'Issue - repair required'; if(raw==='Fail - Remove From Service / Disposal') return 'Remove from service'; return raw; }
  function statusClass(r){ return /pass|completed ok|in service/i.test(String(r||'')) ? 'ok' : /fail|issue|quarantine|remove/i.test(String(r||'')) ? 'bad' : 'warn'; }
  function isArchived(e){ return e && (e.archived === true || e.status === 'Retired' || !!e.disposed_at); }
  function certNorm(v){ return String(v || '').trim().toLowerCase().replace(/\s+/g,' '); }
  function certTypeNorm(v){ return certNorm(v).replace(/s$/,''); }
  function selectedSet(){ if(!window.__sw417CertSelected) window.__sw417CertSelected = new Set(); return window.__sw417CertSelected; }
  function selectedIds(){ return Array.from(selectedSet()).map(String); }
  function dueFromInspection(i){ if(!i) return 'no_inspection'; const next = String(i.next_due || '').slice(0,10); if(!next) return 'ok'; return next <= new Date().toISOString().slice(0,10) ? 'due' : 'ok'; }

  function injectCss(){
    if($('sw418Styles')) return;
    const st = document.createElement('style');
    st.id = 'sw418Styles';
    st.textContent = `
      #filterLabel,#dashTypes,.v415-compact-card:has(#dashTypes){display:none!important;}
      .sw418-clean-hidden{display:none!important;}
      .sw418-filter-panel{background:#ecfdf5;border:1px solid #14b8a6;border-radius:14px;padding:14px;margin:12px 0;}
      .sw418-filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px;align-items:end;}
      .sw418-filter-grid label{display:flex;flex-direction:column;font-weight:800;font-size:.88rem;gap:5px;}
      .sw418-filter-grid input,.sw418-filter-grid select{border:1px solid #cbd5e1;border-radius:10px;padding:10px;background:white;min-height:42px;}
      .sw418-row-list{border:1px solid #dbe7ee;border-radius:14px;background:white;max-height:460px;overflow:auto;padding:4px;margin:10px 0;}
      .sw418-list-item{border-bottom:1px solid #e5edf3;padding:12px 14px;cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;}
      .sw418-list-item:hover{background:#f8fafc}.sw418-list-item:last-child{border-bottom:0}
      .sw418-item-title{font-weight:900}.sw418-meta{color:#475569;font-size:.9rem;margin-top:3px;line-height:1.35}
      .sw418-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-weight:900;font-size:.78rem;white-space:nowrap;}
      .sw418-pill.ok{background:#dcfce7;color:#047857}.sw418-pill.bad{background:#fee2e2;color:#b91c1c}.sw418-pill.warn{background:#fef3c7;color:#b45309}.sw418-pill.neutral{background:#e2e8f0;color:#334155}
      .sw418-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px}.sw418-actions button{min-width:0}
      .sw418-cert-actions{display:flex!important;gap:12px!important;flex-wrap:wrap!important;align-items:center!important}.sw418-cert-actions button{min-width:230px!important;}
      .sw418-cert-title-card,.sw418-old-cert-heading,.certSelectionTools{display:none!important;}
      .sw418-history-scroll{max-height:560px;overflow:auto;border:1px solid #e5edf3;border-radius:12px;background:#fff;}
      .sw418-table{width:100%;border-collapse:collapse}.sw418-table th,.sw418-table td{padding:9px 10px;border-bottom:1px solid #e5edf3;text-align:left;vertical-align:top}.sw418-table th{background:#f8fafc;font-weight:900;}
      .sw418-inspection-select .sw418-list-item{grid-template-columns:1fr auto}.sw418-qual-details details{border:1px solid #dbe7ee;border-radius:14px;background:white;margin:10px 0;overflow:hidden}.sw418-qual-details summary{cursor:pointer;padding:12px 14px;font-weight:900;background:#f8fafc}.sw418-qual-details .sw418-qual-inner{padding:14px}
      @media print{.noPrint{display:none!important}.page{page-break-after:always}.photoPage{page-break-before:always}}
    `;
    document.head.appendChild(st);
  }

  async function loadHeightData(){
    const client = sb(); if(!client) throw new Error('Supabase is not ready.');
    const [eq, ins, eph, iph] = await Promise.all([
      client.from('equipment').select('*').order('type', {ascending:true}).order('serial', {ascending:true}),
      client.from('inspections').select('*').order('inspection_date', {ascending:false}),
      client.from('equipment_photos').select('*').order('created_at',{ascending:false}),
      client.from('inspection_photos').select('*').order('created_at',{ascending:false})
    ]);
    if(eq.error) throw eq.error; if(ins.error) throw ins.error;
    return { equipment:eq.data||[], inspections:ins.data||[], equipmentPhotos:eph.error?[]:(eph.data||[]), inspectionPhotos:iph.error?[]:(iph.data||[]) };
  }
  function latestInspectionFor(e, inspections){
    const id = String(e.id || ''); const serial = norm(e.serial);
    return (inspections || []).filter(i => String(i.equipment_id || '') === id || norm(i.serial) === serial)
      .sort((a,b)=>String(b.inspection_date||b.created_at||'').localeCompare(String(a.inspection_date||a.created_at||'')))[0] || null;
  }
  function pairHaystack(pair){ const e=pair.equipment||{}, i=pair.inspection||{}; return [e.serial,e.type,e.manufacturer,e.model,e.status,e.notes,i.result,i.inspector,i.inspection_date].map(norm).join(' '); }
  function pairMatches(pair, filters){
    const e=pair.equipment||{}, i=pair.inspection||null;
    if(filters.type && certTypeNorm(e.type)!==certTypeNorm(filters.type)) return false;
    if(filters.status && certNorm(e.status)!==certNorm(filters.status)) return false;
    if(filters.result && (!i || certNorm(i.result)!==certNorm(filters.result))) return false;
    if(filters.due && dueFromInspection(i)!==filters.due) return false;
    if(filters.q && !pairHaystack(pair).includes(norm(filters.q))) return false;
    return true;
  }
  async function populateSelectOptions(typeSel, statusSel){
    const { equipment } = await loadHeightData();
    const types = [...new Set(equipment.map(e=>e.type).filter(Boolean))].sort();
    const statuses = [...new Set(equipment.map(e=>e.status).filter(Boolean))].sort();
    const oldType = typeSel?.value || ''; const oldStatus = statusSel?.value || '';
    if(typeSel) typeSel.innerHTML = '<option value="">All types</option>' + types.map(t=>`<option value="${esc(t)}" ${oldType===t?'selected':''}>${esc(t)}</option>`).join('');
    if(statusSel) statusSel.innerHTML = '<option value="">All statuses</option>' + statuses.map(t=>`<option value="${esc(t)}" ${oldStatus===t?'selected':''}>${esc(t)}</option>`).join('');
  }
  function itemRow(pair, opts={}){
    const e=pair.equipment||{}, i=pair.inspection||null;
    const latest = i ? `${nzDate(i.inspection_date)} · ${statusLabel(i.result)}` : 'No inspection history';
    const cls = i ? statusClass(i.result) : 'neutral';
    const action = opts.action || 'open';
    const extra = opts.checkbox ? `<input type="checkbox" class="sw418-cert-check" value="${esc(e.id)}" ${selectedSet().has(String(e.id))?'checked':''} ${i?'':'disabled'}>` : `<span class="sw418-pill ${cls}">${esc(i ? statusLabel(i.result) : 'No inspection')}</span>`;
    return `<div class="sw418-list-item" tabindex="0" role="button" data-sw418-action="${esc(action)}" data-equipment-id="${esc(e.id)}">${opts.checkbox?extra:''}<div><div class="sw418-item-title">${esc(e.serial||'No serial')} ${esc(e.type||'')}</div><div class="sw418-meta">${esc(e.manufacturer||'')} ${esc(e.model||'')} · ${esc(e.status||'')} · Latest: ${esc(latest)}</div></div>${opts.checkbox?'':extra}</div>`;
  }
  function openEquipment(id){
    if(!id) return;
    if(typeof window.openItem === 'function') return window.openItem(id);
    if(typeof window.openDetail === 'function') return window.openDetail(id);
    if(typeof window.showDetail === 'function') return window.showDetail(id);
    if(typeof window.showTab === 'function') window.showTab('detail');
  }

  async function renderEquipmentFilterList(){
    const list = $('equipmentList'); if(!list) return;
    try{
      const { equipment, inspections } = await loadHeightData();
      const filters = { type:$('eqFilterType')?.value||'', status:$('eqFilterStatus')?.value||'', due:$('eqFilterDue')?.value||'', q:$('eqFilterSearch')?.value||'' };
      const pairs = equipment.map(e=>({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p=>pairMatches(p, filters));
      const count=$('eqFilterCount'); if(count) count.textContent = `${pairs.length} item${pairs.length===1?'':'s'} shown.`;
      list.innerHTML = `<div class="sw418-row-list">${pairs.map(p=>itemRow(p,{action:'open'})).join('') || '<p class="muted">No equipment matches the current filters.</p>'}</div>`;
      list.querySelectorAll('[data-sw418-action="open"]').forEach(row=>{
        row.addEventListener('click',()=>openEquipment(row.dataset.equipmentId));
        row.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openEquipment(row.dataset.equipmentId); }});
      });
    }catch(err){ list.innerHTML = `<div class="ops-error">Could not load equipment list: ${esc(err.message||err)}</div>`; }
  }
  async function installEquipmentRegister(){
    const list = $('equipmentList'); if(!list) return;
    const typeCard = $('dashTypes')?.closest('.card'); if(typeCard) typeCard.remove();
    const label = $('filterLabel'); if(label) label.remove();
    const oldSearch = $('search')?.closest('.row'); if(oldSearch) oldSearch.remove();
    let panel = $('heightEquipmentFilterPanel');
    if(!panel){
      panel = document.createElement('div'); panel.id='heightEquipmentFilterPanel'; panel.className='sw418-filter-panel';
      panel.innerHTML = `<h3 style="margin-top:0">Filter equipment</h3><div class="sw418-filter-grid"><label>Equipment type<select id="eqFilterType"><option value="">All types</option></select></label><label>Status<select id="eqFilterStatus"><option value="">All statuses</option></select></label><label>Due status<select id="eqFilterDue"><option value="">All due states</option><option value="due">Due / overdue</option><option value="ok">Not due</option><option value="no_inspection">No inspection history</option></select></label><label>Keyword search<input id="eqFilterSearch" type="search" placeholder="Serial, type, manufacturer, model"></label></div><div class="sw418-actions"><button type="button" id="eqFilterClear">Clear filters</button></div><div id="eqFilterCount" class="muted" style="margin-top:6px"></div>`;
      list.parentElement.insertBefore(panel, list);
    }
    await populateSelectOptions($('eqFilterType'), $('eqFilterStatus'));
    ['eqFilterType','eqFilterStatus','eqFilterDue','eqFilterSearch'].forEach(id=>{ const el=$(id); if(el && !el.dataset.sw418){ el.dataset.sw418='1'; el.addEventListener(id==='eqFilterSearch'?'input':'change', renderEquipmentFilterList); }});
    $('eqFilterClear')?.addEventListener('click',()=>{ ['eqFilterType','eqFilterStatus','eqFilterDue','eqFilterSearch'].forEach(id=>{const el=$(id); if(el) el.value='';}); renderEquipmentFilterList(); });
    renderEquipmentFilterList();
  }

  async function renderInspectionEquipmentPicker(){
    const box = $('heightInspectionPickerList'); if(!box) return;
    try{
      const { equipment, inspections } = await loadHeightData();
      const filters = { type:$('inspectFilterType')?.value||'', status:$('inspectFilterStatus')?.value||'', due:$('inspectFilterDue')?.value||'', q:$('inspectFilterSearch')?.value||'' };
      const pairs = equipment.filter(e=>!isArchived(e)).map(e=>({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p=>pairMatches(p, filters));
      $('inspectFilterCount') && ($('inspectFilterCount').textContent = `${pairs.length} item${pairs.length===1?'':'s'} shown. Click an item to start an inspection.`);
      box.innerHTML = `<div class="sw418-row-list sw418-inspection-select">${pairs.map(p=>itemRow(p,{action:'inspect'})).join('') || '<p class="muted">No equipment matches the current filters.</p>'}</div>`;
      box.querySelectorAll('[data-sw418-action="inspect"]').forEach(row=>row.addEventListener('click',()=>{
        const id=row.dataset.equipmentId;
        if(typeof window.startInspection === 'function') return window.startInspection(id, 'New Inspection');
        const e = pairs.find(p=>String(p.equipment.id)===String(id))?.equipment;
        if(e){ if($('inSerial')) $('inSerial').value=e.serial||''; if($('inType')) $('inType').value=e.type||''; if(typeof window.loadEquipmentForInspection === 'function') window.loadEquipmentForInspection(); if(typeof window.renderChecklist === 'function') window.renderChecklist(); }
      }));
    }catch(err){ box.innerHTML = `<div class="ops-error">Could not load equipment picker: ${esc(err.message||err)}</div>`; }
  }
  async function installInspectionPicker(){
    const pane = $('inspect'); if(!pane || $('heightInspectionPicker')) return;
    const firstCard = pane.querySelector('.card'); if(!firstCard) return;
    const oldSerialInput = $('inSerial')?.closest('div'); if(oldSerialInput) oldSerialInput.style.display='none';
    const panel = document.createElement('div'); panel.id='heightInspectionPicker'; panel.className='sw418-filter-panel';
    panel.innerHTML = `<h3 style="margin-top:0">Select equipment to inspect</h3><div class="sw418-filter-grid"><label>Equipment type<select id="inspectFilterType"><option value="">All types</option></select></label><label>Status<select id="inspectFilterStatus"><option value="">All statuses</option></select></label><label>Due status<select id="inspectFilterDue"><option value="">All due states</option><option value="due">Due / overdue</option><option value="ok">Not due</option><option value="no_inspection">No inspection history</option></select></label><label>Keyword search<input id="inspectFilterSearch" type="search" placeholder="Serial, type, manufacturer, model"></label></div><div class="sw418-actions"><button type="button" id="inspectFilterClear">Clear filters</button></div><div id="inspectFilterCount" class="muted" style="margin-top:6px"></div><div id="heightInspectionPickerList"></div>`;
    firstCard.insertBefore(panel, firstCard.querySelector('.grid.two') || firstCard.firstChild.nextSibling);
    await populateSelectOptions($('inspectFilterType'), $('inspectFilterStatus'));
    ['inspectFilterType','inspectFilterStatus','inspectFilterDue','inspectFilterSearch'].forEach(id=>{ const el=$(id); if(el) el.addEventListener(id==='inspectFilterSearch'?'input':'change', renderInspectionEquipmentPicker); });
    $('inspectFilterClear')?.addEventListener('click',()=>{ ['inspectFilterType','inspectFilterStatus','inspectFilterDue','inspectFilterSearch'].forEach(id=>{const el=$(id); if(el) el.value='';}); renderInspectionEquipmentPicker(); });
    renderInspectionEquipmentPicker();
  }

  function certFilterValues(){ return { type:$('certFilterType')?.value||'', status:$('certFilterStatus')?.value||'', result:$('certFilterResult')?.value||'', due:$('certFilterDue')?.value||'', q:$('certFilterSearch')?.value||'' }; }
  async function renderCertificateFilterList(){
    const list = $('certItemList'); if(!list) return;
    try{
      const { equipment, inspections } = await loadHeightData();
      const pairs = equipment.filter(e=>!isArchived(e)).map(e=>({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p=>pairMatches(p, certFilterValues()));
      list.innerHTML = `<div class="sw418-row-list">${pairs.map(p=>itemRow(p,{checkbox:true, action:'cert'})).join('') || '<p class="muted">No items match the current filters.</p>'}</div>`;
      const count=$('certFilterCount'); if(count) count.textContent = `${pairs.length} item${pairs.length===1?'':'s'} shown; ${pairs.filter(p=>p.inspection).length} with inspection history; ${selectedIds().length} selected.`;
      list.querySelectorAll('.sw418-cert-check').forEach(ch=>ch.addEventListener('change',()=>{ if(ch.checked) selectedSet().add(String(ch.value)); else selectedSet().delete(String(ch.value)); updateCertificateButtons(); renderCertificateFilterList(); }));
      updateCertificateButtons();
    }catch(err){ list.innerHTML = `<div class="ops-error">Could not load certificate items: ${esc(err.message||err)}</div>`; }
  }
  function updateCertificateButtons(){
    const count=selectedIds().length;
    const validation=$('certValidation'); if(validation){ validation.textContent = count ? `${count} selected. Ready to generate.` : 'Tick at least one item with inspection history.'; validation.className = 'certValidation ' + (count?'ready':'warn'); }
    const b1=$('certGenerateBtn'), b2=$('certGenerateCombinedBtn'); if(b1) b1.disabled = count===0; if(b2) b2.disabled = count===0;
  }
  async function selectedCertificatePairs(){
    const ids = new Set(selectedIds());
    const { equipment, inspections } = await loadHeightData();
    return equipment.filter(e=>ids.has(String(e.id))).map(e=>({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p=>p.inspection);
  }
  async function signedUrl(bucket,path){ if(!path) return ''; const client=sb(); if(!client) return ''; try{ const r=await client.storage.from(bucket).createSignedUrl(path,3600); return r.error ? '' : r.data.signedUrl; }catch(e){ return ''; } }
  async function certImages(e,i,equipmentPhotos,inspectionPhotos){
    const includeEq = $('certIncludeEquipmentPhotosCheck') ? $('certIncludeEquipmentPhotosCheck').checked : (($('certIncludeEquipmentPhotos')?.value||'yes')==='yes');
    const includeIns = $('certIncludeInspectionPhotosCheck') ? $('certIncludeInspectionPhotosCheck').checked : (($('certIncludeInspectionPhotos')?.value||'yes')==='yes');
    const eq=[]; const ip=[];
    if(includeEq){ for(const p of (equipmentPhotos||[]).filter(p=>String(p.equipment_id)===String(e.id)).slice(0,3)){ const u=await signedUrl(EQUIP_BUCKET,p.file_path); if(u) eq.push(u); } }
    if(includeIns){ for(const p of (inspectionPhotos||[]).filter(p=>String(p.inspection_id)===String(i.id)).slice(0,6)){ const u=await signedUrl(PHOTO_BUCKET,p.file_path); if(u) ip.push(u); } }
    return {equipmentUrls:eq, inspectionUrls:ip};
  }
  function certificateDocumentCss(){ return `body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;background:#f8fafc}.page{background:white;max-width:920px;min-height:1180px;margin:22px auto;padding:36px;box-shadow:0 10px 35px #0f172a22;page-break-after:always}.head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:4px solid #0f766e;padding-bottom:14px;margin-bottom:18px}.brand{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#0f766e;font-weight:900}.title{font-size:28px;font-weight:900;margin:4px 0}.muted{color:#64748b}.grid{display:grid;grid-template-columns:170px 1fr;gap:0;margin:16px 0}.label,.value{border-bottom:1px solid #e2e8f0;padding:8px}.label{font-weight:900;background:#f8fafc;color:#334155}.pill{border-radius:999px;padding:5px 10px;font-weight:900;display:inline-block}.ok{background:#dcfce7;color:#047857}.bad{background:#fee2e2;color:#b91c1c}.warn{background:#fef3c7;color:#b45309}.photoGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:14px}.photoGrid img{width:100%;height:320px;object-fit:contain;border:1px solid #dbe7ee;border-radius:14px;background:#f8fafc}.checklist{columns:2;column-gap:32px;font-size:13px}.footer{margin-top:20px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:12px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #dbe7ee;padding:9px;text-align:left;vertical-align:top}th{background:#f1f5f9;color:#334155;font-weight:900}.noPrint{position:sticky;top:0;background:#0f766e;color:white;padding:10px;text-align:center}.noPrint button{background:white;color:#0f766e;border:0;border-radius:10px;padding:9px 14px;font-weight:900}@media print{body{background:white}.noPrint{display:none}.page{box-shadow:none;margin:0;max-width:none;min-height:auto;page-break-after:always}.photoGrid img{height:310px}}`; }
  function checklistHtml(i){ const checks=Array.isArray(i.checklist)?i.checklist:[]; return checks.length ? `<h3>Checklist completed</h3><div class="checklist">${checks.map(c=>`<div>✓ ${esc(c)}</div>`).join('')}</div>` : ''; }
  function certificatePage(record){ const e=record.equipment||{}, i=record.inspection||{}, result=statusLabel(i.result); const cls=statusClass(i.result); return `<section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Height Equipment Inspection Certificate</div><div class="muted">Generated ${new Date().toLocaleDateString('en-NZ')}</div></div><div><span class="pill ${cls}">${esc(result)}</span></div></div><div class="grid"><div class="label">Serial</div><div class="value"><strong>${esc(e.serial||'')}</strong></div><div class="label">Equipment type</div><div class="value">${esc(e.type||'')}</div><div class="label">Manufacturer</div><div class="value">${esc(e.manufacturer||'—')}</div><div class="label">Model</div><div class="value">${esc(e.model||'—')}</div><div class="label">Status</div><div class="value">${esc(e.status||'—')}</div><div class="label">Inspection date</div><div class="value">${nzDate(i.inspection_date)}</div><div class="label">Inspector</div><div class="value">${esc(i.inspector||'—')}</div><div class="label">Next due</div><div class="value">${nzDate(i.next_due)}</div><div class="label">Inspection result</div><div class="value"><span class="pill ${cls}">${esc(result)}</span></div><div class="label">Notes</div><div class="value">${esc(i.notes||'—')}</div></div>${checklistHtml(i)}<div class="footer">This certificate is generated from the latest saved inspection record for the selected item in Spray &amp; Wash Operations.</div></section>`; }
  function photoPage(record){ const urls=[...(record.images?.equipmentUrls||[]),...(record.images?.inspectionUrls||[])]; if(!urls.length) return ''; return `<section class="page photoPage"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Inspection Photo Evidence</div><div class="muted">${esc(record.equipment.serial||'')} ${esc(record.equipment.type||'')}</div></div></div><div class="photoGrid">${urls.slice(0,6).map(u=>`<img src="${esc(u)}" alt="Certificate evidence photo">`).join('')}</div><div class="footer">Photos shown are selected equipment photos and photos attached to the latest inspection used for this certificate.</div></section>`; }
  async function buildCertificatePacketV418(pairs,title){
    const { equipmentPhotos, inspectionPhotos } = await loadHeightData();
    const records=[];
    for(const p of pairs){ records.push({...p, images: await certImages(p.equipment,p.inspection,equipmentPhotos,inspectionPhotos)}); }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title||'Height Equipment Certificates')}</title><style>${certificateDocumentCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div>${records.map(r=>certificatePage(r)+photoPage(r)).join('')}</body></html>`;
    const w=window.open('', '_blank'); if(w){ w.document.open(); w.document.write(html); w.document.close(); }
    else { const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='spray-wash-height-certificates.html'; a.click(); URL.revokeObjectURL(a.href); }
  }
  function combinedCertificateHtml(pairs){ const rows=pairs.map(p=>{ const e=p.equipment||{}, i=p.inspection||{}, result=statusLabel(i.result), cls=statusClass(i.result); return `<tr><td><strong>${esc(e.serial||'')}</strong></td><td>${esc(e.type||'')}</td><td>${esc(e.manufacturer||'')}</td><td>${esc(e.model||'')}</td><td>${nzDate(i.inspection_date)}</td><td><span class="pill ${cls}">${esc(result)}</span></td><td>${esc(i.inspector||'')}</td><td>${nzDate(i.next_due)}</td></tr>`; }).join(''); return `<!doctype html><html><head><meta charset="utf-8"><title>Selected Height Equipment Inspection Summary</title><style>${certificateDocumentCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Selected Height Equipment Inspection Summary</div><div class="muted">Combined report for ${pairs.length} selected item${pairs.length===1?'':'s'} · Generated ${new Date().toLocaleString('en-NZ')}</div></div></div><table><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer</th><th>Model</th><th>Inspection date</th><th>Result</th><th>Inspector</th><th>Next due</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">This combined document summarises the latest inspection record for each selected item.</div></section></body></html>`; }
  async function generateSeparate(){ const pairs=await selectedCertificatePairs(); if(!pairs.length) return alert('Tick at least one item with inspection history.'); await buildCertificatePacketV418(pairs,'Selected item certificates'); }
  async function generateCombined(){ const pairs=await selectedCertificatePairs(); if(!pairs.length) return alert('Tick at least one item with inspection history.'); const html=combinedCertificateHtml(pairs); const w=window.open('', '_blank'); if(w){w.document.open(); w.document.write(html); w.document.close();} else { const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='spray-wash-selected-equipment-summary.html'; a.click(); URL.revokeObjectURL(a.href);} }

  async function installCertificates(){
    const cert=$('certificates'); if(!cert) return;
    Array.from(cert.querySelectorAll('.card')).forEach(card=>{ const text=(card.textContent||'').trim(); if(/^Inspection Certificates/.test(text)) card.remove(); });
    cert.querySelectorAll('h3').forEach(h=>{ const t=(h.textContent||'').trim(); if(/Choose certificate batch type|Inspection date range|Inspection result|Select individual items|Photo options|Equipment type|Generate certificates/i.test(t)) h.remove(); });
    const panel=$('certItemsPanel'); if(panel){ const p=panel.querySelector('p.muted'); if(p) p.textContent='Use the filters below, then tick the individual items to include.'; }
    const tools=cert.querySelector('.certSelectionTools'); if(tools) tools.remove();
    const action=$('certGenerateBtn')?.parentElement; if(action){ action.classList.add('sw418-cert-actions'); action.querySelector('h3')?.remove(); const b1=$('certGenerateBtn'); if(b1){b1.textContent='Generate separate certificates'; b1.onclick=generateSeparate;} let b2=$('certGenerateCombinedBtn'); if(!b2){b2=document.createElement('button'); b2.id='certGenerateCombinedBtn'; b2.className='primary'; b2.type='button'; action.appendChild(b2);} b2.textContent='Generate one combined certificate'; b2.onclick=generateCombined; }
    ['certFilterType','certFilterStatus','certFilterResult','certFilterDue','certFilterSearch'].forEach(id=>{ const el=$(id); if(el && !el.dataset.sw418){ el.dataset.sw418='1'; el.addEventListener(id==='certFilterSearch'?'input':'change', renderCertificateFilterList); }});
    $('certFilterClear')?.addEventListener('click',()=>setTimeout(renderCertificateFilterList,30));
    $('certClearSelected')?.remove(); $('certSelectVisible')?.remove();
    await renderCertificateFilterList();
    installInspectorDetailsPanel();
    window.buildCertificatePacket = buildCertificatePacketV418;
    window.generateCertificates = generateSeparate;
  }

  function qualificationNames(){ const seen=new Set(); return (state().qualifications||[]).filter(q=>q.active!==false && q.inspector_name).map(q=>q.inspector_name).filter(n=>{ const k=norm(n); if(seen.has(k)) return false; seen.add(k); return true; }).sort((a,b)=>a.localeCompare(b)); }
  function latestQual(name){ const k=norm(name); return (state().qualifications||[]).filter(q=>q.active!==false && norm(q.inspector_name)===k).sort((a,b)=>String(b.expiry_date||'9999').localeCompare(String(a.expiry_date||'9999')) || String(b.issue_date||'').localeCompare(String(a.issue_date||'')))[0] || null; }
  function installInspectorDetailsPanel(){
    const panel=$('qualificationCertPanel'); if(!panel) return;
    const names=qualificationNames();
    panel.innerHTML = `<h2>Inspector Details Verification</h2><div class="grid two"><div><label>Inspector</label><select id="qualCertSelect"><option value="">Select inspector</option>${names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select></div></div><div class="row"><button type="button" class="primary" onclick="SWOperationsV4.generateQualificationCertificate()">Generate inspector details</button></div>${names.length?'':'<p class="muted">No qualifications saved yet. Add qualifications under Height Equipment - Qualifications first.</p>'}`;
  }
  async function generateInspectorDetails(){
    const name=$('qualCertSelect')?.value||''; if(!name) return alert('Select an inspector first.');
    const q=latestQual(name); if(!q) return alert('Qualification record not found for this inspector.');
    let embed='', fileNote='—';
    if(q.storage_path && sb()){
      try{ const dl=await sb().storage.from(PHOTO_BUCKET).download(q.storage_path); if(dl.error) throw dl.error; const blob=dl.data; const dataUrl=await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(blob); }); const type=String(blob.type||q.file_name||'').toLowerCase(); if(type.includes('pdf')) embed=`<iframe src="${esc(dataUrl)}" style="width:100%;height:720px;border:1px solid #dbe7ee;border-radius:12px"></iframe><p><a href="${esc(dataUrl)}" download="${esc(q.file_name||'qualification.pdf')}">Download qualification PDF</a></p>`; else embed=`<img src="${esc(dataUrl)}" style="max-width:100%;max-height:720px;border:1px solid #dbe7ee;border-radius:12px" alt="Inspector qualification image">`; fileNote=q.file_name||'Saved file embedded'; }catch(e){ fileNote='Saved file could not be embedded: '+(e.message||e); }
    }
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Inspector Details Verification</title><style>${certificateDocumentCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Inspector Details Verification</div><div class="muted">Height equipment inspector qualification record</div></div></div><div class="grid"><div class="label">Inspector</div><div class="value">${esc(q.inspector_name||'—')}</div><div class="label">Email</div><div class="value">${esc(q.email||'—')}</div><div class="label">Qualification</div><div class="value">${esc(q.qualification_type||'—')}</div><div class="label">Provider</div><div class="value">${esc(q.provider||'—')}</div><div class="label">Reference</div><div class="value">${esc(q.reference_number||'—')}</div><div class="label">Issue date</div><div class="value">${nzDate(q.issue_date)}</div><div class="label">Expiry date</div><div class="value">${nzDate(q.expiry_date)}</div><div class="label">Saved file</div><div class="value">${esc(fileNote)}</div><div class="label">Notes</div><div class="value">${esc(q.notes||'—')}</div></div><div class="footer">Generated ${new Date().toLocaleString('en-NZ')} from Spray &amp; Wash Operations.</div></section>${embed?`<section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Uploaded Qualification Evidence</div></div></div>${embed}</section>`:''}</body></html>`;
    const w=window.open('', '_blank'); if(w){w.document.open();w.document.write(html);w.document.close();} else {const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='inspector-details-verification.html'; a.click(); URL.revokeObjectURL(a.href);}
  }
  function cleanQualificationsTab(){
    const pane=$('heightQualifications'); if(!pane) return;
    pane.querySelectorAll('p.muted').forEach(p=>{ if((p.textContent||'').includes('Files are stored')) p.remove(); });
    if(!$('sw418QualWrapper')){
      const form=$('heightQualForm'); const card=form?.closest('.card');
      if(card){ const details=document.createElement('details'); details.id='sw418QualWrapper'; details.className='sw418-qual-details'; details.open=false; details.innerHTML='<summary>Inspector Qualifications</summary><div class="sw418-qual-inner"></div>'; card.parentElement.insertBefore(details, card); details.querySelector('.sw418-qual-inner').appendChild(card); }
    }
  }

  function installRecentHistoryFix(){
    const sel=$('heightRecentLimitLegacy'); if(sel){ if(!sel.value) sel.value='10'; sel.querySelector('option[value="10"]')?.setAttribute('selected','selected'); }
    if(typeof window.SWOperationsV4?.renderRecentHistoryV417 === 'function') window.SWOperationsV4.renderRecentHistoryV417();
  }
  function cleanStaticUi(){
    document.querySelector('.tagline') && (document.querySelector('.tagline').textContent='Version 4.0.63 • Height Safety • Vehicle Checks • Equipment • Maintenance');
    const reports=$('exportTabButton'), cert=$('certificateTabButton'); if(reports && cert && cert.nextSibling !== reports){ reports.parentElement.appendChild(reports); }
    const typeCard=$('dashTypes')?.closest('.card'); if(typeCard) typeCard.remove();
    const filterLabel=$('filterLabel'); if(filterLabel) filterLabel.remove();
    Array.from(document.querySelectorAll('.card')).forEach(card=>{ const t=(card.textContent||'').trim(); if(/^Inspection Certificates/.test(t)) card.remove(); });
  }

  function install(){
    injectCss(); cleanStaticUi(); installRecentHistoryFix();
    /* equipment register is owned by app.js in V4.0.30 */
    if($('inspect')) installInspectionPicker();
    const old=api(); window.SWOperationsV4=Object.assign(old,{renderEquipmentFilteredListV418:renderEquipmentFilterList,renderCertificateFilterListV418:renderCertificateFilterList,generateCombinedCertificates:generateCombined});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,800)); else setTimeout(install,800);
  document.addEventListener('click', e=>{ /* equipment tab handled by app.js */ if(e.target?.closest?.('[data-tab="inspect"],#inspect')) setTimeout(installInspectionPicker,500); });
  // V4.0.30: disabled V4.0.30 repeating DOM patch timer to prevent version/layout flicker.
})();

/* V4.0.30 - height history, certificate photos, equipment scroll, qualifications and account cleanup */
(function(){
  'use strict';
  const VERSION = '4.0.63';
  const PHOTO_BUCKET = 'inspection-photos';
  const EQUIP_BUCKET = 'equipment-photos';
  const $ = id => document.getElementById(id);
  const api = () => window.SWOperationsV4 || {};
  const appState = () => api().state || {};
  const sb = () => appState().sb;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const norm = v => String(v || '').trim().toLowerCase().replace(/\s+/g,' ');
  const titleCase = v => String(v||'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  function nzDate(value){ if(!value) return '—'; const d = new Date(String(value).includes('T') ? value : value + 'T00:00:00'); return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString('en-NZ'); }
  function statusLabel(value){ const v=String(value||'—'); if(v==='Pass') return 'Completed OK'; if(v==='Fail'||v==='Problem') return 'Issue to report'; return v; }
  function statusClass(value){ const v=norm(value); if(v.includes('pass') || v.includes('completed ok')) return 'ok'; if(v.includes('remove') || v.includes('fail') || v.includes('issue')) return 'bad'; return 'warn'; }
  function isArchived(e){ return /archived|disposed|retired/i.test(String(e?.status||'')); }
  function pathFromPhoto(row){ return row?.file_path || row?.storage_path || row?.path || row?.object_path || ''; }
  function dueState(inspection){
    if(!inspection || !inspection.next_due) return 'no_inspection';
    const d = new Date(String(inspection.next_due).includes('T') ? inspection.next_due : inspection.next_due + 'T00:00:00');
    const today = new Date(new Date().toISOString().slice(0,10) + 'T00:00:00');
    return d < today ? 'due' : 'ok';
  }
  async function loadHeightData(){
    const client = sb();
    if(!client) throw new Error('Supabase is not ready.');
    const [eq, ins, eph, iph] = await Promise.all([
      client.from('equipment').select('*').order('type', {ascending:true}).order('serial', {ascending:true}),
      client.from('inspections').select('*').order('inspection_date', {ascending:false}).order('created_at', {ascending:false}),
      client.from('equipment_photos').select('*').order('created_at', {ascending:false}),
      client.from('inspection_photos').select('*').order('created_at', {ascending:false})
    ]);
    if(eq.error) throw eq.error;
    if(ins.error) throw ins.error;
    return { equipment:eq.data||[], inspections:ins.data||[], equipmentPhotos:eph.error?[]:(eph.data||[]), inspectionPhotos:iph.error?[]:(iph.data||[]) };
  }
  function latestInspectionFor(e, inspections){
    const id = String(e?.id || ''); const serial = norm(e?.serial);
    return (inspections||[]).filter(i => String(i.equipment_id||'') === id || norm(i.serial) === serial)
      .sort((a,b)=>String(b.inspection_date||b.created_at||'').localeCompare(String(a.inspection_date||a.created_at||'')))[0] || null;
  }
  function pairHaystack(pair){ const e=pair.equipment||{}, i=pair.inspection||{}; return [e.serial,e.type,e.manufacturer,e.model,e.status,e.location,e.notes,i.result,i.inspector,i.inspection_date].map(norm).join(' '); }
  function typeNorm(v){ return norm(v).replace(/s$/,''); }
  function pairMatches(pair, filters){
    const e = pair.equipment || {}, i = pair.inspection || null;
    if(filters.type && typeNorm(e.type) !== typeNorm(filters.type)) return false;
    if(filters.status && norm(e.status) !== norm(filters.status)) return false;
    if(filters.result && (!i || norm(i.result) !== norm(filters.result))) return false;
    if(filters.due && dueState(i) !== filters.due) return false;
    if(filters.q && !pairHaystack(pair).includes(norm(filters.q))) return false;
    return true;
  }
  async function storageUrl(bucket, path){
    if(!path || !sb()) return '';
    try{ const r = await sb().storage.from(bucket).createSignedUrl(path, 3600); return r.error ? '' : r.data.signedUrl; }catch(e){ return ''; }
  }
  async function storageDataUrl(bucket, path){
    if(!path || !sb()) return {url:'', type:'', name:''};
    const dl = await sb().storage.from(bucket).download(path);
    if(dl.error) throw dl.error;
    const blob = dl.data;
    const url = await new Promise((resolve,reject)=>{ const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(blob); });
    return {url, type:String(blob.type||'').toLowerCase(), name:String(path).split('/').pop()};
  }

  function injectV419Css(){
    if($('sw419Styles')) return;
    const style = document.createElement('style');
    style.id = 'sw419Styles';
    style.textContent = `
      .notifyBtn,#notifyBadge,#notificationPanel{display:none!important;}
      #accountPanel.hidden{display:none!important;}
      .sw419-history-scroll{max-height:365px;overflow-y:auto;overflow-x:auto;border:1px solid #e2e8f0;border-radius:14px;background:#fff;}
      .sw419-table{width:100%;border-collapse:collapse;font-size:14px;}
      .sw419-table th,.sw419-table td{padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top;}
      .sw419-table th{position:sticky;top:0;background:#f8fafc;z-index:1;font-weight:900;color:#334155;}
      .sw419-filter-panel{background:#ecfdf5;border:1px solid #14b8a6;border-radius:14px;padding:14px;margin:12px 0;}
      .sw419-filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end;}
      .sw419-filter-grid label{display:flex;flex-direction:column;font-weight:800;font-size:.88rem;gap:5px;}
      .sw419-row-list{border:1px solid #dbe7ee;border-radius:14px;background:white;max-height:480px;overflow:auto;padding:8px;margin:10px 0;}
      .sw419-list-item{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;text-align:left;padding:12px;border-bottom:1px solid #e5edf3;cursor:pointer;}
      .sw419-list-item:last-child{border-bottom:0;}
      .sw419-list-item:hover{background:#f8fafc;}
      .sw419-list-title{font-weight:900;color:#0f172a;}
      .sw419-meta{font-size:.88rem;color:#475569;margin-top:2px;}
      .sw419-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-weight:800;font-size:.78rem;white-space:nowrap;}
      .sw419-pill.ok{background:#dcfce7;color:#047857;}.sw419-pill.bad{background:#fee2e2;color:#b91c1c;}.sw419-pill.warn{background:#fef3c7;color:#b45309;}.sw419-pill.neutral{background:#e2e8f0;color:#334155;}
      .sw419-cert-row{grid-template-columns:auto 1fr!important;justify-items:start;text-align:left;}
      .sw419-cert-row input{width:auto;margin-top:3px;}
      #certItemList,.certSelectList,.sw418-row-list{text-align:left!important;}
      #certificates .certPanel h3,#certificates .certificateControls>h2,#certificates #certModeHelp,#certificates #certItemsPanel>p.muted{display:none!important;}
      #certificates .certActionBox{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:flex-start;}
      .sw419-qual-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
      @media print{.noPrint{display:none!important}.page{box-shadow:none!important;margin:0!important;max-width:none!important;}}
    `;
    document.head.appendChild(style);
  }

  async function renderRecentHistoryV419(){
    const box = $('dashRecentLegacy');
    if(!box) return;
    try{
      const limit = Number($('heightRecentLimitLegacy')?.value || 10);
      const { equipment, inspections } = await loadHeightData();
      const eqById = new Map(equipment.map(e => [String(e.id), e]));
      const eqBySerial = new Map(equipment.map(e => [norm(e.serial), e]));
      const rows = inspections
        .slice()
        .sort((a,b)=>String(b.inspection_date||b.created_at||'').localeCompare(String(a.inspection_date||a.created_at||'')))
        .slice(0, limit);
      box.innerHTML = `<div class="sw419-history-scroll"><table class="sw419-table"><thead><tr><th>Date</th><th>Serial</th><th>Type</th><th>Result</th><th>Inspector</th></tr></thead><tbody>${rows.map(i=>{
        const e = eqById.get(String(i.equipment_id||'')) || eqBySerial.get(norm(i.serial)) || {};
        const cls = statusClass(i.result);
        return `<tr><td>${nzDate(i.inspection_date||i.created_at)}</td><td><strong>${esc(e.serial||i.serial||'')}</strong></td><td>${esc(e.type||i.type||'')}</td><td><span class="sw419-pill ${cls}">${esc(statusLabel(i.result))}</span></td><td>${esc(i.inspector||'')}</td></tr>`;
      }).join('')}</tbody></table></div>`;
      const details = box.closest('details'); if(details) details.open = true;
    }catch(err){ box.innerHTML = `<p class="muted">Could not load recent inspection history: ${esc(err.message||err)}</p>`; }
  }
  function installRecentHistoryV419(){
    const sel = $('heightRecentLimitLegacy');
    if(sel){
      if(!sel.value) sel.value = '10';
      if(!sel.dataset.sw419){ sel.dataset.sw419 = '1'; sel.addEventListener('change', renderRecentHistoryV419); }
    }
    renderRecentHistoryV419();
  }

  function openEquipmentPreserveScroll(id){
    if(!id) return;
    const y = window.scrollY;
    const x = window.scrollX;
    const fn = window.openItem || window.openDetail || window.showDetail;
    if(typeof fn === 'function') fn(id);
    else if(typeof window.showTab === 'function') window.showTab('detail');
    [0,50,150,350,700].forEach(ms => setTimeout(()=>window.scrollTo(x,y), ms));
  }
  async function populateEquipmentFilterOptions(){
    const { equipment } = await loadHeightData();
    const types = [...new Set(equipment.map(e=>e.type).filter(Boolean))].sort();
    const statuses = [...new Set(equipment.map(e=>e.status).filter(Boolean))].sort();
    const typeSel = $('eqFilterType'), statusSel = $('eqFilterStatus');
    const oldType = typeSel?.value || '', oldStatus = statusSel?.value || '';
    if(typeSel) typeSel.innerHTML = '<option value="">All types</option>' + types.map(t=>`<option value="${esc(t)}" ${oldType===t?'selected':''}>${esc(t)}</option>`).join('');
    if(statusSel) statusSel.innerHTML = '<option value="">All statuses</option>' + statuses.map(t=>`<option value="${esc(t)}" ${oldStatus===t?'selected':''}>${esc(t)}</option>`).join('');
  }
  function equipmentRow(pair){
    const e = pair.equipment || {}, i = pair.inspection || null;
    const latest = i ? `${nzDate(i.inspection_date)} · ${statusLabel(i.result)}` : 'No inspection history';
    const cls = i ? statusClass(i.result) : 'neutral';
    return `<div class="sw419-list-item" data-sw419-equipment-id="${esc(e.id)}" tabindex="0" role="button"><div><div class="sw419-list-title">${esc(e.serial||'No serial')} ${esc(e.type||'')}</div><div class="sw419-meta">${esc(e.manufacturer||'')} ${esc(e.model||'')} · ${esc(e.status||'')} · Latest: ${esc(latest)}</div></div><span class="sw419-pill ${cls}">${esc(i ? statusLabel(i.result) : 'No inspection')}</span></div>`;
  }
  async function renderEquipmentFilterV419(){
    const list = $('equipmentList'); if(!list) return;
    try{
      const { equipment, inspections } = await loadHeightData();
      const filters = { type:$('eqFilterType')?.value||'', status:$('eqFilterStatus')?.value||'', due:$('eqFilterDue')?.value||'', q:$('eqFilterSearch')?.value||'' };
      const pairs = equipment.map(e=>({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p=>pairMatches(p, filters));
      const count = $('eqFilterCount'); if(count) count.textContent = `${pairs.length} item${pairs.length===1?'':'s'} shown.`;
      list.innerHTML = `<div class="sw419-row-list">${pairs.map(equipmentRow).join('') || '<p class="muted">No equipment matches the current filters.</p>'}</div>`;
      list.querySelectorAll('[data-sw419-equipment-id]').forEach(row=>{
        const open = () => openEquipmentPreserveScroll(row.dataset.sw419EquipmentId);
        row.addEventListener('click', open);
        row.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }});
      });
    }catch(err){ list.innerHTML = `<div class="ops-error">Could not load equipment list: ${esc(err.message||err)}</div>`; }
  }
  async function installEquipmentV419(){
    const list = $('equipmentList'); if(!list) return;
    $('dashTypes')?.closest('.card')?.remove();
    $('filterLabel')?.remove();
    const oldSearch = $('search')?.closest('.row'); if(oldSearch) oldSearch.remove();
    let panel = $('heightEquipmentFilterPanel');
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'heightEquipmentFilterPanel';
      panel.className = 'sw419-filter-panel';
      panel.innerHTML = `<h3 style="margin-top:0">Filter equipment</h3><div class="sw419-filter-grid"><label>Equipment type<select id="eqFilterType"><option value="">All types</option></select></label><label>Status<select id="eqFilterStatus"><option value="">All statuses</option></select></label><label>Due status<select id="eqFilterDue"><option value="">All due states</option><option value="due">Due / overdue</option><option value="ok">Not due</option><option value="no_inspection">No inspection history</option></select></label><label>Keyword search<input id="eqFilterSearch" type="search" placeholder="Serial, type, manufacturer, model"></label></div><div class="row"><button type="button" id="eqFilterClear">Clear filters</button></div><div id="eqFilterCount" class="muted" style="margin-top:6px"></div>`;
      list.parentElement.insertBefore(panel, list);
    } else {
      panel.className = 'sw419-filter-panel';
    }
    await populateEquipmentFilterOptions();
    ['eqFilterType','eqFilterStatus','eqFilterDue','eqFilterSearch'].forEach(id=>{
      const el=$(id); if(el && !el.dataset.sw419){ el.dataset.sw419='1'; el.addEventListener(id==='eqFilterSearch'?'input':'change', renderEquipmentFilterV419); }
    });
    if($('eqFilterClear') && !$('eqFilterClear').dataset.sw419){ $('eqFilterClear').dataset.sw419='1'; $('eqFilterClear').addEventListener('click',()=>{ ['eqFilterType','eqFilterStatus','eqFilterDue','eqFilterSearch'].forEach(id=>{const el=$(id); if(el) el.value='';}); renderEquipmentFilterV419(); }); }
    renderEquipmentFilterV419();
  }

  function selectedCertificateIds(){
    const set = new Set();
    document.querySelectorAll('#certItemList input[type="checkbox"]:checked').forEach(ch => set.add(String(ch.value)));
    if(api().state?.certSelectedIds instanceof Set) api().state.certSelectedIds.forEach(id => set.add(String(id)));
    return [...set];
  }
  function certificateFilterValues(){ return { type:$('certFilterType')?.value||'', status:$('certFilterStatus')?.value||'', result:$('certFilterResult')?.value||'', due:$('certFilterDue')?.value||'', q:$('certFilterSearch')?.value||'' }; }
  function certRow(pair){
    const e=pair.equipment||{}, i=pair.inspection||null;
    const checked = selectedCertificateIds().includes(String(e.id)) ? 'checked' : '';
    const disabled = i ? '' : 'disabled';
    const latest = i ? `${nzDate(i.inspection_date)} · ${statusLabel(i.result)}` : 'No inspection history';
    return `<label class="sw419-list-item sw419-cert-row"><input type="checkbox" class="sw419-cert-check" value="${esc(e.id)}" ${checked} ${disabled}><span><span class="sw419-list-title">${esc(e.serial||'No serial')} ${esc(e.type||'')}</span><br><span class="sw419-meta">${esc(e.manufacturer||'')} ${esc(e.model||'')} · ${esc(e.status||'')} · Latest: ${esc(latest)}</span></span></label>`;
  }
  function setSelectedIds(ids){
    const st = api().state;
    if(st?.certSelectedIds instanceof Set){ st.certSelectedIds.clear(); ids.forEach(id=>st.certSelectedIds.add(String(id))); }
  }
  function updateCertificateActionState(){
    const count = selectedCertificateIds().length;
    const val = $('certValidation');
    if(val){ val.textContent = count ? `${count} selected. Ready to generate.` : 'Tick at least one item with inspection history.'; val.className = 'certValidation ' + (count ? 'ready' : 'warn'); }
    ['certGenerateBtn','certGenerateCombinedBtn'].forEach(id=>{ const b=$(id); if(b) b.disabled = count === 0; });
    const countEl = $('certFilterCount');
    if(countEl && !/selected\.$/.test(countEl.textContent||'')) countEl.textContent = (countEl.textContent||'').replace(/; \d+ selected\.?$/, '') + `; ${count} selected.`;
  }
  async function renderCertificateFilterV419(){
    const list = $('certItemList'); if(!list) return;
    try{
      const { equipment, inspections } = await loadHeightData();
      const pairs = equipment.filter(e=>!isArchived(e)).map(e=>({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p=>pairMatches(p, certificateFilterValues()));
      list.innerHTML = `<div class="sw419-row-list">${pairs.map(certRow).join('') || '<p class="muted">No items match the current filters.</p>'}</div>`;
      const count = $('certFilterCount'); if(count) count.textContent = `${pairs.length} item${pairs.length===1?'':'s'} shown; ${pairs.filter(p=>p.inspection).length} with inspection history; ${selectedCertificateIds().length} selected.`;
      list.querySelectorAll('.sw419-cert-check').forEach(ch => ch.addEventListener('change',()=>{
        const ids = new Set(selectedCertificateIds());
        if(ch.checked) ids.add(String(ch.value)); else ids.delete(String(ch.value));
        setSelectedIds([...ids]);
        updateCertificateActionState();
        renderCertificateFilterV419();
      }));
      updateCertificateActionState();
    }catch(err){ list.innerHTML = `<div class="ops-error">Could not load certificate items: ${esc(err.message||err)}</div>`; }
  }
  async function selectedCertificatePairs(){
    const ids = new Set(selectedCertificateIds());
    const { equipment, inspections } = await loadHeightData();
    return equipment.filter(e=>ids.has(String(e.id))).map(e=>({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p=>p.inspection);
  }
  async function certImages(e,i,equipmentPhotos,inspectionPhotos){
    const includeEq = $('certIncludeEquipmentPhotosCheck') ? $('certIncludeEquipmentPhotosCheck').checked : (($('certIncludeEquipmentPhotos')?.value||'yes')==='yes');
    const includeIns = $('certIncludeInspectionPhotosCheck') ? $('certIncludeInspectionPhotosCheck').checked : (($('certIncludeInspectionPhotos')?.value||'yes')==='yes');
    const equipmentUrls = [];
    const inspectionUrls = [];
    if(includeEq){
      const eqRows = (equipmentPhotos||[]).filter(p => String(p.equipment_id) === String(e.id));
      for(const p of eqRows.slice(0,2)){ const u = await storageUrl(EQUIP_BUCKET, pathFromPhoto(p)); if(u) equipmentUrls.push(u); }
    }
    if(includeIns && i){
      const insRows = (inspectionPhotos||[]).filter(p => String(p.inspection_id) === String(i.id));
      for(const p of insRows.slice(0,6)){ const u = await storageUrl(PHOTO_BUCKET, pathFromPhoto(p)); if(u) inspectionUrls.push(u); }
    }
    return {equipmentUrls, inspectionUrls};
  }
  function certCss(){ return `body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;background:#f8fafc}.page{background:white;max-width:920px;min-height:1180px;margin:22px auto;padding:36px;box-shadow:0 10px 35px #0f172a22;page-break-after:always}.head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:4px solid #0f766e;padding-bottom:14px;margin-bottom:18px}.brand{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#0f766e;font-weight:900}.title{font-size:26px;font-weight:900;margin:4px 0}.muted{color:#64748b}.grid{display:grid;grid-template-columns:170px 1fr;gap:0;margin:16px 0}.label,.value{border-bottom:1px solid #e2e8f0;padding:7px 8px}.label{font-weight:900;background:#f8fafc;color:#334155}.pill{border-radius:999px;padding:5px 10px;font-weight:900;display:inline-block}.ok{background:#dcfce7;color:#047857}.bad{background:#fee2e2;color:#b91c1c}.warn{background:#fef3c7;color:#b45309}.photoGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:14px}.photoGrid img{width:100%;height:310px;object-fit:contain;border:1px solid #dbe7ee;border-radius:14px;background:#f8fafc}.equipmentPhotoStrip{margin-top:18px;border-top:1px solid #e2e8f0;padding-top:14px}.equipmentPhotoStrip img{width:48%;max-height:230px;object-fit:contain;border:1px solid #dbe7ee;border-radius:14px;background:#f8fafc;margin-right:10px}.checklist{columns:2;column-gap:32px;font-size:12px}.footer{margin-top:18px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:10px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #dbe7ee;padding:9px;text-align:left;vertical-align:top}th{background:#f1f5f9;color:#334155;font-weight:900}.noPrint{position:sticky;top:0;background:#0f766e;color:white;padding:10px;text-align:center}.noPrint button{background:white;color:#0f766e;border:0;border-radius:10px;padding:9px 14px;font-weight:900}@media print{body{background:white}.noPrint{display:none}.page{box-shadow:none;margin:0;max-width:none;min-height:auto;page-break-after:always}.photoGrid img{height:310px}}`; }
  function checklistHtml(i){ const checks = Array.isArray(i?.checklist) ? i.checklist : []; return checks.length ? `<h3>Checklist completed</h3><div class="checklist">${checks.map(c=>`<div>✓ ${esc(c)}</div>`).join('')}</div>` : ''; }
  function equipmentPhotoBlock(record){
    const urls = record.images?.equipmentUrls || [];
    if(!urls.length) return '';
    return `<div class="equipmentPhotoStrip"><h3>Equipment photo</h3>${urls.slice(0,2).map(u=>`<img src="${esc(u)}" alt="Equipment photo">`).join('')}</div>`;
  }
  function certificatePage(record){
    const e=record.equipment||{}, i=record.inspection||{}; const result=statusLabel(i.result); const cls=statusClass(i.result);
    return `<section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Height Equipment Inspection Certificate</div><div class="muted">Generated ${new Date().toLocaleDateString('en-NZ')}</div></div><div><span class="pill ${cls}">${esc(result)}</span></div></div><div class="grid"><div class="label">Serial</div><div class="value"><strong>${esc(e.serial||'')}</strong></div><div class="label">Equipment type</div><div class="value">${esc(e.type||'')}</div><div class="label">Manufacturer</div><div class="value">${esc(e.manufacturer||'—')}</div><div class="label">Model</div><div class="value">${esc(e.model||'—')}</div><div class="label">Status</div><div class="value">${esc(e.status||'—')}</div><div class="label">Inspection date</div><div class="value">${nzDate(i.inspection_date)}</div><div class="label">Inspector</div><div class="value">${esc(i.inspector||'—')}</div><div class="label">Next due</div><div class="value">${nzDate(i.next_due)}</div><div class="label">Inspection result</div><div class="value"><span class="pill ${cls}">${esc(result)}</span></div><div class="label">Notes</div><div class="value">${esc(i.notes||'—')}</div></div>${checklistHtml(i)}${equipmentPhotoBlock(record)}<div class="footer">This certificate is generated from the latest saved inspection record for the selected item in Spray &amp; Wash Operations.</div></section>`;
  }
  function inspectionPhotoPage(record){
    const urls = record.images?.inspectionUrls || [];
    if(!urls.length) return '';
    return `<section class="page photoPage"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Latest Inspection Photos</div><div class="muted">${esc(record.equipment?.serial||'')} ${esc(record.equipment?.type||'')}</div></div></div><div class="photoGrid">${urls.slice(0,6).map(u=>`<img src="${esc(u)}" alt="Latest inspection photo">`).join('')}</div><div class="footer">Photos shown here are attached to the latest inspection used for this certificate only.</div></section>`;
  }
  async function buildSeparateCertificates(pairs, title){
    const { equipmentPhotos, inspectionPhotos } = await loadHeightData();
    const records=[];
    for(const p of pairs){ records.push({...p, images: await certImages(p.equipment, p.inspection, equipmentPhotos, inspectionPhotos)}); }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title||'Height Equipment Certificates')}</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div>${records.map(r=>certificatePage(r)+inspectionPhotoPage(r)).join('')}</body></html>`;
    const w = window.open('', '_blank');
    if(w){ w.document.open(); w.document.write(html); w.document.close(); }
    else { const blob = new Blob([html], {type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='spray-wash-height-certificates.html'; a.click(); URL.revokeObjectURL(a.href); }
  }
  function combinedCertificateHtml(pairs){
    const rows = pairs.map(p=>{ const e=p.equipment||{}, i=p.inspection||{}, result=statusLabel(i.result), cls=statusClass(i.result); return `<tr><td><strong>${esc(e.serial||'')}</strong></td><td>${esc(e.type||'')}</td><td>${esc(e.manufacturer||'')}</td><td>${esc(e.model||'')}</td><td>${nzDate(i.inspection_date)}</td><td><span class="pill ${cls}">${esc(result)}</span></td><td>${esc(i.inspector||'')}</td><td>${nzDate(i.next_due)}</td></tr>`; }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Selected Height Equipment Inspection Summary</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Selected Height Equipment Inspection Summary</div><div class="muted">Combined report for ${pairs.length} selected item${pairs.length===1?'':'s'} · Generated ${new Date().toLocaleString('en-NZ')}</div></div></div><table><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer</th><th>Model</th><th>Inspection date</th><th>Result</th><th>Inspector</th><th>Next due</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">This combined document summarises the latest inspection record for each selected item.</div></section></body></html>`;
  }
  async function generateSeparateV419(){ const pairs = await selectedCertificatePairs(); if(!pairs.length) return alert('Tick at least one item with inspection history.'); await buildSeparateCertificates(pairs, 'Selected item certificates'); }
  async function generateCombinedV419(){ const pairs = await selectedCertificatePairs(); if(!pairs.length) return alert('Tick at least one item with inspection history.'); const html = combinedCertificateHtml(pairs); const w=window.open('', '_blank'); if(w){w.document.open(); w.document.write(html); w.document.close();} else {const blob=new Blob([html], {type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='spray-wash-selected-equipment-summary.html'; a.click(); URL.revokeObjectURL(a.href);} }
  function cleanCertificatesV419(){
    const cert = $('certificates'); if(!cert) return;
    cert.querySelectorAll('h2,h3').forEach(h=>{
      const t=(h.textContent||'').trim();
      if(/^Certificates$/i.test(t) || /Choose certificate batch type|Photo options|Generate certificates|Select individual items|Equipment type|Inspection date range|Inspection result/i.test(t)) h.remove();
      if(/^2\.\s*Filter and select items/i.test(t)) h.textContent = 'Filter and select items';
    });
    const modeHelp=$('certModeHelp'); if(modeHelp) modeHelp.remove();
    const p = $('certItemsPanel')?.querySelector('p.muted'); if(p) p.remove();
    cert.querySelector('.certSelectionTools')?.remove();
    $('certSelectVisible')?.remove(); $('certClearSelected')?.remove();
    const action = $('certGenerateBtn')?.parentElement;
    if(action){ action.classList.add('certActionBox'); const b1=$('certGenerateBtn'); if(b1){ b1.textContent='Generate separate certificates'; b1.onclick=generateSeparateV419; } let b2=$('certGenerateCombinedBtn'); if(!b2){ b2=document.createElement('button'); b2.id='certGenerateCombinedBtn'; b2.className='primary'; b2.type='button'; action.appendChild(b2); } b2.textContent='Generate one combined certificate'; b2.onclick=generateCombinedV419; }
    ['certFilterType','certFilterStatus','certFilterResult','certFilterDue','certFilterSearch'].forEach(id=>{ const el=$(id); if(el && !el.dataset.sw419){ el.dataset.sw419='1'; el.addEventListener(id==='certFilterSearch'?'input':'change', renderCertificateFilterV419); }});
    renderCertificateFilterV419();
  }

  async function printQualificationDetailsV419(id){
    const q = (appState().qualifications||[]).find(x => String(x.id) === String(id)) || (appState().qualifications||[]).find(x => norm(x.inspector_name) === norm(id));
    if(!q) return alert('Qualification record not found.');
    let embed='', fileNote='—';
    if(q.storage_path){
      try{
        const d = await storageDataUrl(PHOTO_BUCKET, q.storage_path);
        const type = d.type || String(q.file_name||'').toLowerCase();
        fileNote = q.file_name || d.name || 'Saved file embedded';
        if(type.includes('pdf')) embed = `<iframe src="${esc(d.url)}" style="width:100%;height:720px;border:1px solid #dbe7ee;border-radius:12px"></iframe><p><a href="${esc(d.url)}" download="${esc(q.file_name||'qualification.pdf')}">Download qualification PDF</a></p>`;
        else embed = `<img src="${esc(d.url)}" style="max-width:100%;max-height:720px;border:1px solid #dbe7ee;border-radius:12px" alt="Inspector qualification image">`;
      }catch(e){ fileNote = 'Saved file could not be embedded: ' + (e.message || e); }
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Inspector Details Verification</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Inspector Details Verification</div><div class="muted">Height equipment inspector qualification record</div></div></div><div class="grid"><div class="label">Inspector</div><div class="value">${esc(q.inspector_name||'—')}</div><div class="label">Email</div><div class="value">${esc(q.email||'—')}</div><div class="label">Qualification</div><div class="value">${esc(q.qualification_type||'—')}</div><div class="label">Provider</div><div class="value">${esc(q.provider||'—')}</div><div class="label">Reference</div><div class="value">${esc(q.reference_number||'—')}</div><div class="label">Issue date</div><div class="value">${nzDate(q.issue_date)}</div><div class="label">Expiry date</div><div class="value">${nzDate(q.expiry_date)}</div><div class="label">Saved file</div><div class="value">${esc(fileNote)}</div><div class="label">Notes</div><div class="value">${esc(q.notes||'—')}</div></div><div class="footer">Generated ${new Date().toLocaleString('en-NZ')} from Spray &amp; Wash Operations.</div></section>${embed?`<section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Uploaded Qualification Evidence</div></div></div>${embed}</section>`:''}</body></html>`;
    const w=window.open('', '_blank'); if(w){w.document.open();w.document.write(html);w.document.close();} else {const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='inspector-details-verification.html'; a.click(); URL.revokeObjectURL(a.href);}
  }
  async function openQualificationFileV419(idOrPath){
    let q = (appState().qualifications||[]).find(x=>String(x.id)===String(idOrPath));
    const path = q?.storage_path || idOrPath;
    if(!path) return alert('No saved file is attached.');
    try{
      const dl = await sb().storage.from(PHOTO_BUCKET).download(path);
      if(dl.error) throw dl.error;
      const url = URL.createObjectURL(dl.data);
      const w = window.open(url, '_blank');
      if(!w){ const a=document.createElement('a'); a.href=url; a.download=(q?.file_name || String(path).split('/').pop() || 'qualification-file'); a.click(); }
      setTimeout(()=>URL.revokeObjectURL(url), 60000);
    }catch(e){ alert('Could not open file: ' + (e.message || e)); }
  }
  function renderSavedQualificationsV419(){
    const pane = $('heightQualifications'); if(!pane) return;
    const wrapper = $('sw418QualWrapper');
    if(wrapper){
      const innerCard = wrapper.querySelector('.card');
      if(innerCard){ wrapper.parentElement.insertBefore(innerCard, wrapper); wrapper.remove(); }
    }
    pane.querySelectorAll('p.muted').forEach(p=>{ if((p.textContent||'').includes('Files are stored')) p.remove(); });
    const form = $('heightQualForm');
    if(form){ const card = form.closest('.card'); const h2=card?.querySelector('h2'); if(h2) h2.textContent='Add Inspector'; }
    const cards = Array.from(pane.querySelectorAll('.card'));
    let saved = cards.find(c => /Saved inspector qualifications/i.test(c.textContent||''));
    if(!saved){ saved = document.createElement('div'); saved.className='card'; pane.appendChild(saved); }
    const rows = (appState().qualifications||[]).filter(q=>q.active!==false).sort((a,b)=>String(a.inspector_name||'').localeCompare(String(b.inspector_name||'')));
    saved.innerHTML = `<h2>Saved Inspector Qualifications</h2>${rows.length ? `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Inspector</th><th>Qualification</th><th>Provider</th><th>Reference</th><th>Expiry</th><th>Actions</th><th>Notes</th></tr>${rows.map(r=>`<tr><td>${esc(titleCase(r.inspector_name))}<br><span class="ops-subtle">${esc(r.email||'')}</span></td><td>${esc(r.qualification_type||'—')}</td><td>${esc(r.provider||'—')}</td><td>${esc(r.reference_number||'—')}</td><td>${nzDate(r.expiry_date)}</td><td><div class="sw419-qual-actions">${r.storage_path ? `<button type="button" class="ops-btn ghost" data-sw419-open-qual="${esc(r.id)}">Open File</button>` : ''}<button type="button" class="ops-btn primary" data-sw419-print-qual="${esc(r.id)}">Print Qualification Details</button></div></td><td>${esc(r.notes||'—')}</td></tr>`).join('')}</table></div>` : '<p class="muted">No inspector qualifications saved yet.</p>'}`;
    saved.querySelectorAll('[data-sw419-open-qual]').forEach(btn=>btn.addEventListener('click',()=>openQualificationFileV419(btn.dataset.sw419OpenQual)));
    saved.querySelectorAll('[data-sw419-print-qual]').forEach(btn=>btn.addEventListener('click',()=>printQualificationDetailsV419(btn.dataset.sw419PrintQual)));
    $('qualificationCertPanel')?.remove();
  }

  function installAccountBehaviourV419(){
    const signed = $('signedIn'); if(!signed) return;
    const notify = signed.querySelector('.notifyBtn'); if(notify) notify.remove();
    $('notificationPanel')?.remove(); $('notifyBadge')?.remove();
    if(!document.documentElement.dataset.sw419Account){
      document.documentElement.dataset.sw419Account = '1';
      document.addEventListener('click', e => {
        const panel = $('accountPanel');
        if(!panel || panel.classList.contains('hidden')) return;
        if(e.target.closest('#accountPanel') || e.target.closest('.accountBtn')) return;
        panel.classList.add('hidden');
      });
    }
  }
  function cleanStaticV419(){
    const tagline = document.querySelector('.tagline'); if(tagline) tagline.textContent = 'Version 4.0.63 • Height Safety • Vehicle Checks • Equipment • Maintenance';
    installAccountBehaviourV419();
  }
  function install(){
    injectV419Css();
    installAccountBehaviourV419();
    installRecentHistoryV419();
    /* equipment register is owned by app.js in V4.0.30 */
    const old = api();
    window.SWOperationsV4 = Object.assign(old, {
      renderRecentHistoryV419,
      renderEquipmentFilterV419,
      renderCertificateFilterV419,
      generateCombinedCertificates: generateCombinedV419
    });
    cleanStaticV419();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,900)); else setTimeout(install,900);
  document.addEventListener('change', e=>{ if(e.target?.id === 'heightRecentLimitLegacy') setTimeout(renderRecentHistoryV419,20); }, true);
  document.addEventListener('click', e=>{
    const row = e.target.closest('#equipmentList [data-sw418-action="open"], #equipmentList [data-sw419-equipment-id]');
    if(row){ e.preventDefault(); e.stopImmediatePropagation(); openEquipmentPreserveScroll(row.dataset.equipmentId || row.dataset.sw419EquipmentId); }
  }, true);
  // V4.0.30: removed repeating cleanup timer from V4.0.30 because it could fight the main app renderer and cause flickering.
})();

/* V4.0.30 - stabilisation patch: stop flicker and make certificate/qualification output deterministic */
(function(){
  'use strict';
  const VERSION = '4.0.63';
  const PHOTO_BUCKET = 'inspection-photos';
  const EQUIP_BUCKET = 'equipment-photos';
  const $ = id => document.getElementById(id);
  const api = () => window.SWOperationsV4 || {};
  const state = () => api().state || {};
  const sb = () => state().sb;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const norm = v => String(v || '').trim().toLowerCase().replace(/\s+/g,' ');
  function nzDate(value){ if(!value) return '—'; const d = new Date(String(value).includes('T') ? value : value + 'T00:00:00'); return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString('en-NZ'); }
  function statusLabel(value){ const v=String(value||'—'); if(v==='Pass') return 'Completed OK'; if(v==='Fail'||v==='Problem') return 'Issue to report'; return v; }
  function statusClass(value){ const v=norm(value); if(v.includes('pass') || v.includes('completed ok')) return 'ok'; if(v.includes('remove') || v.includes('fail') || v.includes('issue')) return 'bad'; return 'warn'; }
  function pathFromPhoto(row){ return row?.file_path || row?.storage_path || row?.path || row?.object_path || ''; }
  function qualPath(q){ return q?.storage_path || q?.file_path || q?.path || q?.object_path || ''; }
  function qualFileName(q){ return q?.file_name || String(qualPath(q)).split('/').pop() || 'qualification-file'; }
  async function loadHeightData(){
    if(!sb()) throw new Error('Supabase is not ready.');
    const [eq, ins, eph, iph] = await Promise.all([
      sb().from('equipment').select('*').order('type', {ascending:true}).order('serial', {ascending:true}),
      sb().from('inspections').select('*').order('inspection_date', {ascending:false}).order('created_at', {ascending:false}),
      sb().from('equipment_photos').select('*').order('created_at', {ascending:false}),
      sb().from('inspection_photos').select('*').order('created_at', {ascending:false})
    ]);
    if(eq.error) throw eq.error;
    if(ins.error) throw ins.error;
    return {equipment:eq.data||[], inspections:ins.data||[], equipmentPhotos:eph.error?[]:(eph.data||[]), inspectionPhotos:iph.error?[]:(iph.data||[])};
  }
  function latestInspectionFor(e, inspections){
    const id = String(e?.id || ''); const serial = norm(e?.serial);
    return (inspections||[]).filter(i => String(i.equipment_id||'') === id || norm(i.serial) === serial)
      .sort((a,b)=>String(b.inspection_date||b.created_at||'').localeCompare(String(a.inspection_date||a.created_at||'')))[0] || null;
  }
  async function storageSignedUrl(bucket, path){
    if(!path || !sb()) return '';
    try{ const r = await sb().storage.from(bucket).createSignedUrl(path, 3600); return r.error ? '' : r.data.signedUrl; }catch(e){ return ''; }
  }
  async function storageDataUrl(bucket, path){
    if(!path || !sb()) return {url:'', type:'', name:''};
    const dl = await sb().storage.from(bucket).download(path);
    if(dl.error) throw dl.error;
    const blob = dl.data;
    const url = await new Promise((resolve,reject)=>{ const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(blob); });
    return {url, type:String(blob.type||'').toLowerCase(), name:String(path).split('/').pop()};
  }
  function selectedCertificateIds(){
    const set = new Set();
    document.querySelectorAll('#certItemList input[type="checkbox"]:checked').forEach(ch => set.add(String(ch.value)));
    const st = state();
    if(st?.certSelectedIds instanceof Set) st.certSelectedIds.forEach(id => set.add(String(id)));
    return [...set];
  }
  async function selectedPairs(){
    const ids = new Set(selectedCertificateIds());
    const {equipment, inspections} = await loadHeightData();
    return equipment.filter(e => ids.has(String(e.id))).map(e => ({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p => p.inspection);
  }
  async function certImages(e, i, equipmentPhotos, inspectionPhotos){
    const includeEq = $('certIncludeEquipmentPhotosCheck') ? $('certIncludeEquipmentPhotosCheck').checked : true;
    const includeIns = $('certIncludeInspectionPhotosCheck') ? $('certIncludeInspectionPhotosCheck').checked : true;
    const equipmentUrls = [], inspectionUrls = [];
    if(includeIns && i){
      const rows = (inspectionPhotos||[]).filter(p => String(p.inspection_id) === String(i.id));
      for(const p of rows.slice(0,4)){ const u = await storageSignedUrl(PHOTO_BUCKET, pathFromPhoto(p)); if(u) inspectionUrls.push(u); }
    }
    if(includeEq && e){
      const rows = (equipmentPhotos||[]).filter(p => String(p.equipment_id) === String(e.id));
      for(const p of rows.slice(0,2)){ const u = await storageSignedUrl(EQUIP_BUCKET, pathFromPhoto(p)); if(u) equipmentUrls.push(u); }
    }
    return {equipmentUrls, inspectionUrls};
  }
  function certCss(){ return `body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;background:#f8fafc}.page{background:white;max-width:920px;min-height:1180px;margin:22px auto;padding:34px;box-shadow:0 10px 35px #0f172a22;page-break-after:always}.head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:4px solid #0f766e;padding-bottom:14px;margin-bottom:16px}.brand{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#0f766e;font-weight:900}.title{font-size:26px;font-weight:900;margin:4px 0}.muted{color:#64748b}.grid{display:grid;grid-template-columns:165px 1fr;gap:0;margin:14px 0}.label,.value{border-bottom:1px solid #e2e8f0;padding:7px 8px}.label{font-weight:900;background:#f8fafc;color:#334155}.pill{border-radius:999px;padding:5px 10px;font-weight:900;display:inline-block}.ok{background:#dcfce7;color:#047857}.bad{background:#fee2e2;color:#b91c1c}.warn{background:#fef3c7;color:#b45309}.checklist{columns:2;column-gap:28px;font-size:12px}.photoStrip{margin-top:14px;border-top:1px solid #e2e8f0;padding-top:12px}.photoStrip h3{margin:0 0 8px;font-size:15px}.photoGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.photoGrid img{width:100%;height:210px;object-fit:contain;border:1px solid #dbe7ee;border-radius:12px;background:#f8fafc}.evidencePage .photoGrid img{height:360px}.footer{margin-top:16px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:10px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #dbe7ee;padding:9px;text-align:left;vertical-align:top}th{background:#f1f5f9;color:#334155;font-weight:900}.noPrint{position:sticky;top:0;background:#0f766e;color:white;padding:10px;text-align:center}.noPrint button{background:white;color:#0f766e;border:0;border-radius:10px;padding:9px 14px;font-weight:900}@media print{body{background:white}.noPrint{display:none}.page{box-shadow:none;margin:0;max-width:none;min-height:auto;page-break-after:always}.photoGrid img{max-height:250px}}`; }
  function checklistHtml(i){ const checks = Array.isArray(i?.checklist) ? i.checklist : []; return checks.length ? `<h3>Checklist completed</h3><div class="checklist">${checks.map(c=>`<div>✓ ${esc(c)}</div>`).join('')}</div>` : ''; }
  function inspectionPhotoBlock(record){
    const urls = record.images?.inspectionUrls || [];
    if(!urls.length) return '';
    return `<div class="photoStrip"><h3>Latest inspection photos</h3><div class="photoGrid">${urls.slice(0,4).map(u=>`<img src="${esc(u)}" alt="Latest inspection photo">`).join('')}</div></div>`;
  }
  function equipmentPhotoPage(record){
    const urls = record.images?.equipmentUrls || [];
    if(!urls.length) return '';
    return `<section class="page evidencePage"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Equipment Photo Evidence</div><div class="muted">${esc(record.equipment?.serial||'')} ${esc(record.equipment?.type||'')}</div></div></div><div class="photoGrid">${urls.slice(0,4).map(u=>`<img src="${esc(u)}" alt="Equipment photo">`).join('')}</div><div class="footer">Equipment photos are separated from latest inspection photos.</div></section>`;
  }
  function certificatePage(record){
    const e=record.equipment||{}, i=record.inspection||{}; const result=statusLabel(i.result); const cls=statusClass(i.result);
    return `<section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Height Equipment Inspection Certificate</div><div class="muted">Generated ${new Date().toLocaleDateString('en-NZ')}</div></div><div><span class="pill ${cls}">${esc(result)}</span></div></div><div class="grid"><div class="label">Serial</div><div class="value"><strong>${esc(e.serial||'')}</strong></div><div class="label">Equipment type</div><div class="value">${esc(e.type||'')}</div><div class="label">Manufacturer</div><div class="value">${esc(e.manufacturer||'—')}</div><div class="label">Model</div><div class="value">${esc(e.model||'—')}</div><div class="label">Status</div><div class="value">${esc(e.status||'—')}</div><div class="label">Inspection date</div><div class="value">${nzDate(i.inspection_date)}</div><div class="label">Inspector</div><div class="value">${esc(i.inspector||'—')}</div><div class="label">Next due</div><div class="value">${nzDate(i.next_due)}</div><div class="label">Inspection result</div><div class="value"><span class="pill ${cls}">${esc(result)}</span></div><div class="label">Notes</div><div class="value">${esc(i.notes||'—')}</div></div>${checklistHtml(i)}${inspectionPhotoBlock(record)}<div class="footer">Inspection photos shown on this page are attached to the latest inspection used for this certificate.</div></section>`;
  }
  async function buildSeparateCertificatesV420(pairs, title){
    const {equipmentPhotos, inspectionPhotos} = await loadHeightData();
    const records = [];
    for(const p of pairs) records.push({...p, images: await certImages(p.equipment, p.inspection, equipmentPhotos, inspectionPhotos)});
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title||'Height Equipment Certificates')}</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div>${records.map(r => certificatePage(r) + equipmentPhotoPage(r)).join('')}</body></html>`;
    const w = window.open('', '_blank');
    if(w){ w.document.open(); w.document.write(html); w.document.close(); }
    else { const blob = new Blob([html], {type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='spray-wash-height-certificates.html'; a.click(); URL.revokeObjectURL(a.href); }
  }
  function combinedCertificateHtmlV420(pairs){
    const rows = pairs.map(p=>{ const e=p.equipment||{}, i=p.inspection||{}, result=statusLabel(i.result), cls=statusClass(i.result); return `<tr><td><strong>${esc(e.serial||'')}</strong></td><td>${esc(e.type||'')}</td><td>${esc(e.manufacturer||'')}</td><td>${esc(e.model||'')}</td><td>${nzDate(i.inspection_date)}</td><td><span class="pill ${cls}">${esc(result)}</span></td><td>${esc(i.inspector||'')}</td><td>${nzDate(i.next_due)}</td></tr>`; }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Selected Height Equipment Inspection Summary</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Selected Height Equipment Inspection Summary</div><div class="muted">Combined report for ${pairs.length} selected item${pairs.length===1?'':'s'} · Generated ${new Date().toLocaleString('en-NZ')}</div></div></div><table><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer</th><th>Model</th><th>Inspection date</th><th>Result</th><th>Inspector</th><th>Next due</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">This combined document summarises the latest inspection record for each selected item.</div></section></body></html>`;
  }
  async function generateSeparateV420(){ const pairs = await selectedPairs(); if(!pairs.length) return alert('Tick at least one item with inspection history.'); await buildSeparateCertificatesV420(pairs, 'Selected item certificates'); }
  async function generateCombinedV420(){ const pairs = await selectedPairs(); if(!pairs.length) return alert('Tick at least one item with inspection history.'); const html=combinedCertificateHtmlV420(pairs); const w=window.open('', '_blank'); if(w){w.document.open();w.document.write(html);w.document.close();} else {const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='spray-wash-selected-equipment-summary.html'; a.click(); URL.revokeObjectURL(a.href);} }
  async function qualificationEvidence(q){
    const path = qualPath(q);
    if(!path) return {html:'<p class="muted">No qualification file is attached.</p>', note:'No file attached'};
    const signed = await storageSignedUrl(PHOTO_BUCKET, path);
    try{
      const data = await storageDataUrl(PHOTO_BUCKET, path);
      const name = q?.file_name || data.name || qualFileName(q);
      const type = data.type || String(name).toLowerCase();
      if(type.includes('pdf')) return {note:name, html:`<iframe src="${esc(data.url || signed)}" style="width:100%;height:760px;border:1px solid #dbe7ee;border-radius:12px"></iframe><p><a href="${esc(signed || data.url)}" target="_blank" download="${esc(name)}">Open/download qualification PDF</a></p>`};
      return {note:name, html:`<img src="${esc(data.url || signed)}" style="display:block;max-width:100%;max-height:760px;margin:auto;border:1px solid #dbe7ee;border-radius:12px;background:#f8fafc" alt="Inspector qualification image"><p><a href="${esc(signed || data.url)}" target="_blank" download="${esc(name)}">Open/download qualification file</a></p>`};
    }catch(e){
      return {note:'File attached, preview unavailable', html: signed ? `<p>The saved file could not be embedded, but it can be opened here: <a href="${esc(signed)}" target="_blank">Open qualification file</a></p>` : `<p class="muted">The saved file could not be loaded: ${esc(e.message||e)}</p>`};
    }
  }
  async function printQualificationDetailsV420(id){
    const q = (state().qualifications||[]).find(x => String(x.id) === String(id)) || (state().qualifications||[]).find(x => norm(x.inspector_name) === norm(id));
    if(!q) return alert('Qualification record not found.');
    const ev = await qualificationEvidence(q);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Inspector Details Verification</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Inspector Details Verification</div><div class="muted">Height equipment inspector qualification record</div></div></div><div class="grid"><div class="label">Inspector</div><div class="value">${esc(q.inspector_name||'—')}</div><div class="label">Email</div><div class="value">${esc(q.email||'—')}</div><div class="label">Qualification</div><div class="value">${esc(q.qualification_type||'—')}</div><div class="label">Provider</div><div class="value">${esc(q.provider||'—')}</div><div class="label">Reference</div><div class="value">${esc(q.reference_number||'—')}</div><div class="label">Issue date</div><div class="value">${nzDate(q.issue_date)}</div><div class="label">Expiry date</div><div class="value">${nzDate(q.expiry_date)}</div><div class="label">Saved file</div><div class="value">${esc(ev.note)}</div><div class="label">Notes</div><div class="value">${esc(q.notes||'—')}</div></div><div class="footer">Generated ${new Date().toLocaleString('en-NZ')} from Spray &amp; Wash Operations.</div></section><section class="page evidencePage"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Uploaded Qualification Evidence</div></div></div>${ev.html}</section></body></html>`;
    const w = window.open('', '_blank');
    if(w){ w.document.open(); w.document.write(html); w.document.close(); }
    else { const blob = new Blob([html], {type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='inspector-details-verification.html'; a.click(); URL.revokeObjectURL(a.href); }
  }
  async function openQualificationFileV420(idOrPath){
    let q = (state().qualifications||[]).find(x=>String(x.id)===String(idOrPath));
    const path = q ? qualPath(q) : idOrPath;
    if(!path) return alert('No saved file is attached.');
    const signed = await storageSignedUrl(PHOTO_BUCKET, path);
    if(signed){ window.open(signed, '_blank'); return; }
    try{ const data = await storageDataUrl(PHOTO_BUCKET, path); const w = window.open(data.url, '_blank'); if(!w){ const a=document.createElement('a'); a.href=data.url; a.download=qualFileName(q); a.click(); } }
    catch(e){ alert('Could not open file: ' + (e.message || e)); }
  }
  function bindStableHandlers(){
    const tagline = document.querySelector('.tagline'); if(tagline) tagline.textContent = 'Version 4.0.63 • Height Safety • Vehicle Checks • Equipment • Maintenance';
    const b1 = $('certGenerateBtn'); if(b1){ b1.onclick = generateSeparateV420; b1.disabled = selectedCertificateIds().length === 0; }
    const b2 = $('certGenerateCombinedBtn'); if(b2){ b2.onclick = generateCombinedV420; b2.disabled = selectedCertificateIds().length === 0; }
    const apiObj = api();
    window.SWOperationsV4 = Object.assign(apiObj, {
      generateSeparateCertificates: generateSeparateV420,
      generateCombinedCertificates: generateCombinedV420
    });
    window.generateCertificates = generateSeparateV420;
    window.buildCertificatePacket = buildSeparateCertificatesV420;
  }
})();

/* V4.0.30 - dashboard, equipment, certificate, qualification and reports cleanup */
(function(){
  const VERSION = '4.0.63';
  const PHOTO_BUCKET = 'inspection-photos';
  const EQUIP_BUCKET = 'equipment-photos';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = v => String(v || '').trim().toLowerCase();
  const titleCase = v => String(v || '').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const todayIso = () => new Date().toISOString().slice(0,10);
  const nzDate = v => { if(!v) return '—'; const d = new Date(v); return isNaN(d) ? String(v).slice(0,10) : d.toLocaleDateString('en-NZ'); };
  const api = () => window.SWOperationsV4 || {};
  const state = () => api().state || {};
  const sb = () => state().sb || (window.supabaseClient || window.sbClient || null);
  const statusLabel = r => {
    const raw = String(r || '—');
    if(raw === 'Pass') return 'Completed OK';
    if(raw === 'Fail - Repair Required') return 'Issue - repair required';
    if(raw === 'Fail - Remove From Service / Disposal') return 'Remove from service';
    return raw || '—';
  };
  const statusClass = r => /pass|completed ok|in service/i.test(String(r||'')) ? 'ok' : /fail|issue|quarantine|remove|dispose/i.test(String(r||'')) ? 'bad' : 'warn';
  let eqRenderToken = 0;
  let eqOpenScrollY = null;

  function injectCss(){
    if($('sw421Styles')) return;
    const st = document.createElement('style'); st.id = 'sw421Styles';
    st.textContent = `
      .sw421-hidden{display:none!important}.sw421-left{text-align:left!important}.sw421-panel-flat{border:0!important;box-shadow:none!important;background:transparent!important;padding:0!important;margin:0!important}
      #certItemList,#certItemList *{text-align:left!important}.certItemCheckRow,.sw417-check-row{justify-content:flex-start!important;text-align:left!important}.sw421-cert-card h2:first-child{display:none!important}
      #certItemsPanel>h3,#certItemsPanel>p,.certSelectionTools{display:none!important}.certificateControls>h3:first-child{display:none!important}
      #certFilterPanel{margin-top:0!important}
      .sw421-row-list{border:1px solid #dbe7ee;border-radius:14px;background:white;max-height:460px;overflow:auto;margin-top:10px}.sw421-table{width:100%;border-collapse:collapse}.sw421-table th,.sw421-table td{padding:9px 10px;border-bottom:1px solid #e5edf3;text-align:left;vertical-align:top}.sw421-table th{background:#f8fafc;font-weight:900}.sw421-click-row{cursor:pointer}.sw421-click-row:hover{background:#f8fafc}.sw421-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-weight:800;font-size:.78rem}.sw421-pill.ok{background:#dcfce7;color:#047857}.sw421-pill.bad{background:#fee2e2;color:#b91c1c}.sw421-pill.warn{background:#fef3c7;color:#b45309}
      .sw421-history-scroll{max-height:420px;overflow:auto;border:1px solid #e5edf3;border-radius:12px;background:white}.sw421-detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.sw421-add-photo-menu{display:flex;gap:8px;flex-wrap:wrap}.sw421-qual-actions{display:flex;gap:8px;flex-wrap:wrap}.sw421-archive-modal{position:fixed;inset:0;background:rgba(15,23,42,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px}.sw421-archive-box{background:white;border-radius:18px;max-width:560px;width:100%;padding:16px;box-shadow:0 20px 80px #0008}.sw421-archive-box textarea{width:100%;min-height:110px}.sw421-report-active{background:#0f766e!important;color:white!important}
    `;
    document.head.appendChild(st);
  }

  async function loadHeightData(extraPhotos=false){
    const client = sb(); if(!client) throw new Error('Supabase is not ready.');
    const calls = [
      client.from('equipment').select('*').order('type', {ascending:true}).order('serial', {ascending:true}),
      client.from('inspections').select('*').order('inspection_date', {ascending:false})
    ];
    if(extraPhotos){
      calls.push(client.from('equipment_photos').select('*').order('created_at', {ascending:false}));
      calls.push(client.from('inspection_photos').select('*').order('created_at', {ascending:false}));
    }
    const res = await Promise.all(calls);
    res.forEach(r => { if(r.error) throw r.error; });
    return { equipment: res[0].data || [], inspections: res[1].data || [], equipmentPhotos: res[2]?.data || [], inspectionPhotos: res[3]?.data || [] };
  }
  function latestInspectionFor(e, inspections){
    const id = String(e?.id || ''); const serial = norm(e?.serial);
    return (inspections || []).filter(i => String(i.equipment_id || '') === id || norm(i.serial) === serial)
      .sort((a,b)=>String(b.inspection_date||b.created_at||'').localeCompare(String(a.inspection_date||a.created_at||'')))[0] || null;
  }
  function isArchived(e){ return /archived|disposed|retired/i.test(String(e?.status||'')) || e?.archived === true || !!e?.disposed_at; }
  function isDue(pair){
    const i = pair.inspection; if(!i) return true;
    const due = String(i.next_due || i.next_inspection_due || i.due_date || '').slice(0,10);
    return !due || due <= todayIso();
  }
  function hay(pair){ const e=pair.equipment||{}, i=pair.inspection||{}; return [e.serial,e.type,e.manufacturer,e.model,e.status,i.result,i.inspector].map(norm).join(' '); }
  function matches(pair, filters){
    const e = pair.equipment || {}, i = pair.inspection || null;
    if(filters.type && norm(e.type) !== norm(filters.type)) return false;
    if(filters.status && norm(e.status) !== norm(filters.status)) return false;
    if(filters.result && (!i || norm(i.result) !== norm(filters.result))) return false;
    if(filters.due === 'due' && !isDue(pair)) return false;
    if(filters.due === 'ok' && isDue(pair)) return false;
    if(filters.due === 'no_inspection' && i) return false;
    if(filters.q && !hay(pair).includes(norm(filters.q))) return false;
    return true;
  }
  async function signedUrl(bucket, path){
    if(!path) return '';
    const client = sb(); if(!client) return '';
    let p = String(path || '').trim().replace(/^\/+/, '');
    p = p.replace(/^inspection-photos\//,'').replace(/^equipment-photos\//,'');
    try{ const r = await client.storage.from(bucket).createSignedUrl(p, 3600); if(!r.error) return r.data.signedUrl; }catch(e){}
    return '';
  }
  async function dataUrl(bucket, path){
    if(!path) return '';
    const client = sb(); if(!client) return '';
    let p = String(path || '').trim().replace(/^\/+/, '');
    p = p.replace(/^inspection-photos\//,'').replace(/^equipment-photos\//,'');
    const r = await client.storage.from(bucket).download(p);
    if(r.error) throw r.error;
    return await new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve({url:fr.result,type:r.data.type||'',name:p.split('/').pop()}); fr.onerror=reject; fr.readAsDataURL(r.data); });
  }

  function installPhotoButtons(){
    const bind = (btnId, menuId, camBtnId, uploadBtnId, camInputId, uploadInputId) => {
      const btn=$(btnId), menu=$(menuId); if(btn && menu && !btn.dataset.sw421){ btn.dataset.sw421='1'; btn.addEventListener('click',()=>menu.classList.toggle('hidden')); }
      $(camBtnId)?.addEventListener('click',()=>$(camInputId)?.click());
      $(uploadBtnId)?.addEventListener('click',()=>$(uploadInputId)?.click());
    };
    bind('sw421EqAddPhotoBtn','sw421EqPhotoOptions','sw421EqCameraBtn','sw421EqUploadBtn','sw421EqCameraInput','sw421EqUploadInput');
    bind('sw421InspAddPhotoBtn','sw421InspPhotoOptions','sw421InspCameraBtn','sw421InspUploadBtn','sw421InspCameraInput','sw421InspUploadInput');
    // Detail pages may still have legacy photo source buttons; collapse them visually into one menu.
    document.querySelectorAll('#detailContent .photoPanel .row, #detailContent .row').forEach(row=>{
      const labels = Array.from(row.querySelectorAll('label.uploadBtn'));
      if(labels.length >= 2 && !row.dataset.sw421Photo){
        row.dataset.sw421Photo='1';
        const wrap=document.createElement('span'); wrap.className='sw421-add-photo-menu hidden';
        labels.forEach(l=>wrap.appendChild(l));
        const b=document.createElement('button'); b.type='button'; b.className='primary'; b.textContent='Add Photo';
        b.addEventListener('click',()=>wrap.classList.toggle('hidden'));
        row.prepend(wrap); row.prepend(b);
      }
    });
  }

  async function populateEquipmentOptions421(){
    const typeSel=$('eqFilterType'), statusSel=$('eqFilterStatus'); if(!typeSel || !statusSel) return;
    const {equipment}=await loadHeightData();
    const currentType=typeSel.value, currentStatus=statusSel.value;
    typeSel.innerHTML='<option value="">All types</option>'+[...new Set(equipment.map(e=>e.type).filter(Boolean))].sort().map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
    statusSel.innerHTML='<option value="">All statuses</option>'+[...new Set(equipment.map(e=>e.status).filter(Boolean))].sort().map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
    typeSel.value=currentType; statusSel.value=currentStatus;
  }
  function eqFilters(){ return { type:$('eqFilterType')?.value||'', status:$('eqFilterStatus')?.value||'', due:$('eqFilterDue')?.value||'', q:norm($('eqFilterSearch')?.value||'') }; }
  async function renderEquipmentFilteredList421(){
    const token=++eqRenderToken;
    const list=$('equipmentList'); if(!list) return;
    const scrollY = window.scrollY;
    list.innerHTML = '<div class="sw421-row-list"><p class="muted" style="padding:10px">Filtering equipment...</p></div>';
    try{
      await populateEquipmentOptions421();
      const {equipment, inspections}=await loadHeightData();
      if(token!==eqRenderToken) return;
      const pairs=equipment.map(e=>({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p=>matches(p, eqFilters()));
      const rows = pairs.map(p=>{ const e=p.equipment, i=p.inspection; return `<tr class="sw421-click-row" data-eq-id="${esc(e.id)}"><td><strong>${esc(e.serial||'')}</strong></td><td>${esc(e.type||'')}</td><td>${esc(e.manufacturer||'')} ${esc(e.model||'')}</td><td>${esc(e.status||'')}</td><td>${i?`${nzDate(i.inspection_date)} <span class="sw421-pill ${statusClass(i.result)}">${esc(statusLabel(i.result))}</span>`:'No inspection history'}</td></tr>`; }).join('');
      list.innerHTML = `<div class="sw421-row-list"><table class="sw421-table"><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer / model</th><th>Status</th><th>Latest inspection</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No items match the current filters.</td></tr>'}</tbody></table></div>`;
      const c=$('eqFilterCount'); if(c) c.textContent = `${pairs.length} item${pairs.length===1?'':'s'} shown.`;
      list.querySelectorAll('[data-eq-id]').forEach(row=>row.addEventListener('click',()=>openEquipmentRecord(row.dataset.eqId)));
      requestAnimationFrame(()=>window.scrollTo({top:scrollY,left:0,behavior:'auto'}));
    }catch(err){ list.innerHTML = `<div class="ops-error">Could not load equipment list: ${esc(err.message || err)}</div>`; }
  }
  function installEquipmentFilterStabiliser(){
    const panel=$('heightEquipmentFilterPanel'); if(!panel) return;
    // Remove old filter listeners by replacing controls with clones, then attach stable handlers.
    ['eqFilterType','eqFilterStatus','eqFilterDue','eqFilterSearch','eqFilterClear'].forEach(id=>{
      const el=$(id); if(el && !el.dataset.sw421Cloned){ const clone=el.cloneNode(true); clone.dataset.sw421Cloned='1'; el.parentNode.replaceChild(clone, el); }
    });
    ['eqFilterType','eqFilterStatus','eqFilterDue'].forEach(id=>$(id)?.addEventListener('change', renderEquipmentFilteredList421));
    $('eqFilterSearch')?.addEventListener('input', renderEquipmentFilteredList421);
    $('eqFilterClear')?.addEventListener('click',()=>{ ['eqFilterType','eqFilterStatus','eqFilterDue','eqFilterSearch'].forEach(id=>{ const el=$(id); if(el) el.value=''; }); renderEquipmentFilteredList421(); });
    renderEquipmentFilteredList421();
  }
  function openEquipmentRecord(id){
    eqOpenScrollY = window.scrollY;
    window.__sw421CurrentEquipmentId = id;
    if(typeof window.openDetail === 'function') window.openDetail(id);
    else if(typeof window.openItem === 'function') window.openItem(id);
    else if(typeof window.showDetail === 'function') window.showDetail(id);
    else window.showTab?.('detail');
    setTimeout(()=>{ installPhotoButtons(); if(eqOpenScrollY != null) window.scrollTo({top:eqOpenScrollY,left:0,behavior:'auto'}); }, 250);
  }

  function addDetailCertificateButton(){
    const box=$('detailContent'); if(!box || box.querySelector('#sw421PrintItemCertificate')) return;
    const actions = document.createElement('div'); actions.className='sw421-detail-actions';
    actions.innerHTML = `<button type="button" class="primary" id="sw421PrintItemCertificate">Print Certificate</button>`;
    const firstCard = box.querySelector('.card,.detailHero') || box.firstElementChild;
    if(firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(actions, firstCard.nextSibling); else box.prepend(actions);
    $('sw421PrintItemCertificate')?.addEventListener('click', printCurrentItemCertificate);
  }
  async function currentEquipmentRecord(){
    const {equipment, inspections}=await loadHeightData();
    let id = window.__sw421CurrentEquipmentId || '';
    let e = equipment.find(x=>String(x.id)===String(id));
    if(!e){
      const text = $('detailContent')?.innerText || '';
      e = equipment.find(x => x.serial && text.includes(x.serial));
    }
    if(!e) throw new Error('Could not identify this equipment item. Open the item from the Equipment Register and try again.');
    return {equipment:e, inspection:latestInspectionFor(e, inspections)};
  }
  async function printCurrentItemCertificate(){
    try{
      const pair = await currentEquipmentRecord();
      if(!pair.inspection) return alert('This item does not have inspection history to certify.');
      if(window.buildCertificatePacket) return window.buildCertificatePacket([pair], 'Item certificate');
      await buildSeparateCertificates421([pair], 'Item certificate');
    }catch(err){ alert('Could not print certificate: ' + (err.message||err)); }
  }

  async function renderRecentHistory421(){
    const box=$('dashRecentLegacy'); if(!box) return;
    try{
      const limit = Number($('heightRecentLimitLegacy')?.value || 10);
      const {equipment, inspections}=await loadHeightData();
      const byId=new Map(equipment.map(e=>[String(e.id),e])); const bySerial=new Map(equipment.map(e=>[norm(e.serial),e]));
      const rows=inspections.slice(0,limit).map(i=>{ const e=byId.get(String(i.equipment_id||'')) || bySerial.get(norm(i.serial)) || {}; return `<tr><td>${nzDate(i.inspection_date||i.created_at)}</td><td><strong>${esc(e.serial||i.serial||'')}</strong></td><td>${esc(e.type||i.type||'')}</td><td><span class="sw421-pill ${statusClass(i.result)}">${esc(statusLabel(i.result))}</span></td><td>${esc(i.inspector||'')}</td></tr>`; }).join('');
      box.innerHTML = `<div class="sw421-history-scroll"><table class="sw421-table"><thead><tr><th>Date</th><th>Serial</th><th>Type</th><th>Result</th><th>Inspector</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      const details=box.closest('details'); if(details) details.open = true;
    }catch(e){ console.warn('Recent inspection history v421 failed', e); }
  }
  function installRecentHistory421(){
    const sel=$('heightRecentLimitLegacy'); if(sel && !sel.dataset.sw421){ sel.dataset.sw421='1'; if(!sel.value) sel.value='10'; sel.addEventListener('change', renderRecentHistory421); }
    renderRecentHistory421();
  }

  function selectedCertificateIds(){
    const st=state(); if(!st.certSelectedIds) st.certSelectedIds = new Set();
    const ids=new Set(Array.from(st.certSelectedIds).map(String));
    document.querySelectorAll('#certItemList input[type="checkbox"]:checked').forEach(ch=>ids.add(String(ch.value)));
    st.certSelectedIds=ids; window.__sw417CertSelected=ids; return Array.from(ids);
  }
  async function selectedPairs(){
    const ids=new Set(selectedCertificateIds());
    const {equipment, inspections}=await loadHeightData();
    return equipment.filter(e=>ids.has(String(e.id))).map(e=>({equipment:e, inspection:latestInspectionFor(e, inspections)})).filter(p=>p.inspection);
  }
  function certCss(){ return `body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;background:#f8fafc}.page{background:white;max-width:920px;min-height:1180px;margin:22px auto;padding:34px;box-shadow:0 10px 35px #0f172a22;page-break-after:always}.head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:4px solid #0f766e;padding-bottom:14px;margin-bottom:16px}.brand{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:#0f766e;font-weight:900}.title{font-size:26px;font-weight:900;margin:4px 0}.muted{color:#64748b}.grid{display:grid;grid-template-columns:165px 1fr;gap:0;margin:14px 0}.label,.value{border-bottom:1px solid #e2e8f0;padding:7px 8px}.label{font-weight:900;background:#f8fafc;color:#334155}.pill{border-radius:999px;padding:5px 10px;font-weight:900;display:inline-block}.ok{background:#dcfce7;color:#047857}.bad{background:#fee2e2;color:#b91c1c}.warn{background:#fef3c7;color:#b45309}.checklist{columns:2;column-gap:28px;font-size:12px}.photoStrip{margin-top:14px;border-top:1px solid #e2e8f0;padding-top:12px}.photoStrip h3{margin:0 0 8px;font-size:15px}.photoGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.photoGrid img{width:100%;height:210px;object-fit:contain;border:1px solid #dbe7ee;border-radius:12px;background:#f8fafc}.evidencePage .photoGrid img{height:360px}.qualEvidence img{display:block;max-width:100%;max-height:780px;margin:auto;border:1px solid #dbe7ee;border-radius:12px;background:#f8fafc}.qualEvidence iframe{width:100%;height:780px;border:1px solid #dbe7ee;border-radius:12px}.footer{margin-top:16px;font-size:12px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:10px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #dbe7ee;padding:9px;text-align:left;vertical-align:top}th{background:#f1f5f9;color:#334155;font-weight:900}.noPrint{position:sticky;top:0;background:#0f766e;color:white;padding:10px;text-align:center}.noPrint button{background:white;color:#0f766e;border:0;border-radius:10px;padding:9px 14px;font-weight:900}@media print{body{background:white}.noPrint{display:none}.page{box-shadow:none;margin:0;max-width:none;min-height:auto;page-break-after:always}.photoGrid img{max-height:250px}}`; }
  async function imagesFor(e,i,eqPhotos,insPhotos){
    const eqId=String(e.id||''), serial=norm(e.serial), insId=String(i?.id||'');
    const eqRows=(eqPhotos||[]).filter(p=>String(p.equipment_id||'')===eqId || norm(p.serial)===serial).slice(0,4);
    const insRows=(insPhotos||[]).filter(p=>String(p.inspection_id||'')===insId).slice(0,4);
    const equipment=[]; for(const p of eqRows){ const u=await signedUrl(EQUIP_BUCKET,p.storage_path); if(u) equipment.push(u); }
    const inspection=[]; for(const p of insRows){ const u=await signedUrl(PHOTO_BUCKET,p.storage_path); if(u) inspection.push(u); }
    return {equipment, inspection};
  }
  function checklistHtml(i){
    const notes = String(i?.notes || '').trim();
    return notes ? `<div class="photoStrip"><h3>Inspection comments</h3><p>${esc(notes)}</p></div>` : '';
  }
  function inspectionPhotoBlock(record){
    const urls=record.images?.inspection || [];
    if(!urls.length) return '';
    return `<div class="photoStrip"><h3>Latest inspection photos</h3><div class="photoGrid">${urls.map(u=>`<img src="${esc(u)}" alt="Latest inspection photo">`).join('')}</div></div>`;
  }
  function equipmentPhotoPage(record){
    const urls=record.images?.equipment || [];
    if(!urls.length) return '';
    return `<section class="page evidencePage"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Equipment Photo Evidence</div><div class="muted">${esc(record.equipment?.serial||'')} ${esc(record.equipment?.type||'')}</div></div></div><div class="photoGrid">${urls.map(u=>`<img src="${esc(u)}" alt="Equipment photo">`).join('')}</div><div class="footer">Equipment photos are separated from latest inspection photos.</div></section>`;
  }
  function certificatePage(record){
    const e=record.equipment||{}, i=record.inspection||{}, result=statusLabel(i.result), cls=statusClass(i.result);
    return `<section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Height Equipment Inspection Certificate</div><div class="muted">Generated ${new Date().toLocaleDateString('en-NZ')}</div></div><div><span class="pill ${cls}">${esc(result)}</span></div></div><div class="grid"><div class="label">Serial</div><div class="value"><strong>${esc(e.serial||'')}</strong></div><div class="label">Equipment type</div><div class="value">${esc(e.type||'')}</div><div class="label">Manufacturer</div><div class="value">${esc(e.manufacturer||'—')}</div><div class="label">Model</div><div class="value">${esc(e.model||'—')}</div><div class="label">Status</div><div class="value">${esc(e.status||'—')}</div><div class="label">Inspection date</div><div class="value">${nzDate(i.inspection_date)}</div><div class="label">Inspector</div><div class="value">${esc(i.inspector||'—')}</div><div class="label">Next due</div><div class="value">${nzDate(i.next_due)}</div><div class="label">Inspection result</div><div class="value"><span class="pill ${cls}">${esc(result)}</span></div><div class="label">Notes</div><div class="value">${esc(i.notes||'—')}</div></div>${checklistHtml(i)}${inspectionPhotoBlock(record)}<div class="footer">Latest inspection photos are shown on this first page when included.</div></section>`;
  }
  async function buildSeparateCertificates421(pairs, title){
    const {equipmentPhotos, inspectionPhotos}=await loadHeightData(true);
    const records=[]; for(const p of pairs) records.push({...p, images: await imagesFor(p.equipment,p.inspection,equipmentPhotos,inspectionPhotos)});
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title||'Height Equipment Certificates')}</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div>${records.map(r=>certificatePage(r)+equipmentPhotoPage(r)).join('')}</body></html>`;
    const w=window.open('', '_blank'); if(w){w.document.open();w.document.write(html);w.document.close();} else {const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='spray-wash-height-certificates.html'; a.click(); URL.revokeObjectURL(a.href);}
  }
  function combinedHtml(pairs){
    const rows=pairs.map(p=>{ const e=p.equipment||{}, i=p.inspection||{}, result=statusLabel(i.result), cls=statusClass(i.result); return `<tr><td><strong>${esc(e.serial||'')}</strong></td><td>${esc(e.type||'')}</td><td>${esc(e.manufacturer||'')}</td><td>${esc(e.model||'')}</td><td>${nzDate(i.inspection_date)}</td><td><span class="pill ${cls}">${esc(result)}</span></td><td>${esc(i.inspector||'')}</td><td>${nzDate(i.next_due)}</td></tr>`; }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Selected Height Equipment Inspection Summary</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Selected Height Equipment Inspection Summary</div><div class="muted">Combined report for ${pairs.length} selected item${pairs.length===1?'':'s'} · Generated ${new Date().toLocaleString('en-NZ')}</div></div></div><table><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer</th><th>Model</th><th>Inspection date</th><th>Result</th><th>Inspector</th><th>Next due</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">This combined document summarises the latest inspection record for each selected item.</div></section></body></html>`;
  }
  async function generateSeparate421(){ const pairs=await selectedPairs(); if(!pairs.length) return alert('Tick at least one item with inspection history.'); await buildSeparateCertificates421(pairs,'Selected item certificates'); }
  async function generateCombined421(){ const pairs=await selectedPairs(); if(!pairs.length) return alert('Tick at least one item with inspection history.'); const html=combinedHtml(pairs); const w=window.open('', '_blank'); if(w){w.document.open();w.document.write(html);w.document.close();} else {const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='spray-wash-selected-equipment-summary.html'; a.click(); URL.revokeObjectURL(a.href);} }
  function installCertificateCleanup(){
    const cert=$('certificates'); if(!cert) return;
    cert.querySelector('h2')?.remove();
    cert.querySelectorAll('h3').forEach(h=>{ h.textContent = h.textContent.replace(/^\s*\d+\.\s*/, ''); if(/choose certificate batch type/i.test(h.textContent)) h.remove(); });
    cert.querySelectorAll('p.muted').forEach(p=>{ if(/tick one or more items|choose certificate options|certificate history/i.test(p.textContent||'')) p.remove(); });
    cert.querySelectorAll('.certSelectionTools, #certSelectedCount').forEach(e=>e.remove());
    const card=cert.querySelector('.card'); if(card) card.classList.add('sw421-cert-card');
    ['certGenerateBtn','certGenerateCombinedBtn'].forEach(id=>{ const b=$(id); if(b) b.disabled=false; });
    const b1=$('certGenerateBtn'); if(b1){ b1.textContent='Generate separate certificates'; b1.onclick=generateSeparate421; b1.disabled=false; }
    const b2=$('certGenerateCombinedBtn'); if(b2){ b2.textContent='Generate one combined certificate'; b2.onclick=generateCombined421; b2.disabled=false; }
    document.querySelectorAll('#certItemList input[type="checkbox"]').forEach(ch=>{ if(!ch.dataset.sw421){ ch.dataset.sw421='1'; ch.addEventListener('change',()=>{ const st=state(); if(!st.certSelectedIds) st.certSelectedIds=new Set(); if(ch.checked) st.certSelectedIds.add(String(ch.value)); else st.certSelectedIds.delete(String(ch.value)); ['certGenerateBtn','certGenerateCombinedBtn'].forEach(id=>{ const b=$(id); if(b) b.disabled=false; }); }); }});
  }

  function installArchiveDisposeGuard(){
    document.addEventListener('click', e => {
      const btn = e.target.closest('button'); if(!btn) return;
      const text = norm(btn.textContent);
      if(!(text.includes('archive') || text.includes('dispose') || text.includes('retire'))) return;
      if(btn.dataset.sw421Confirmed === '1'){ delete btn.dataset.sw421Confirmed; return; }
      e.preventDefault(); e.stopImmediatePropagation();
      showArchiveModal(btn);
    }, true);
  }
  function showArchiveModal(originalBtn){
    if($('sw421ArchiveModal')) $('sw421ArchiveModal').remove();
    const m=document.createElement('div'); m.id='sw421ArchiveModal'; m.className='sw421-archive-modal';
    m.innerHTML=`<div class="sw421-archive-box"><h2>Confirm Archive / Dispose</h2><p class="muted">This is a two-step confirmation. Add the reason and a photo of the fault or disposal reason before continuing.</p><label>Explanation / reason<textarea id="sw421ArchiveReason" placeholder="Describe the fault or reason for archiving/disposal"></textarea></label><label>Fault / disposal photo<input id="sw421ArchivePhoto" type="file" accept="image/*" capture="environment"></label><label style="display:flex;gap:8px;align-items:flex-start"><input id="sw421ArchiveConfirm" type="checkbox" style="width:auto;margin-top:4px"> I confirm this item should be archived/disposed and the reason has been recorded.</label><div class="row"><button type="button" class="danger" id="sw421ArchiveProceed">Confirm and continue</button><button type="button" id="sw421ArchiveCancel">Cancel</button></div></div>`;
    document.body.appendChild(m);
    $('sw421ArchiveCancel').onclick=()=>m.remove();
    $('sw421ArchiveProceed').onclick=async()=>{
      const reason=String($('sw421ArchiveReason')?.value||'').trim(), file=$('sw421ArchivePhoto')?.files?.[0], ok=$('sw421ArchiveConfirm')?.checked;
      if(!reason) return alert('Enter an explanation before continuing.');
      if(!file) return alert('Add a photo of the fault or disposal reason before continuing.');
      if(!ok) return alert('Tick the confirmation box before continuing.');
      try{ await uploadArchiveEvidence(file, reason); }catch(err){ if(!confirm('The confirmation details were entered, but the photo could not be uploaded: '+(err.message||err)+'\n\nContinue anyway?')) return; }
      m.remove(); originalBtn.dataset.sw421Confirmed='1'; originalBtn.click();
    };
  }
  async function uploadArchiveEvidence(file, reason){
    const client=sb(); if(!client) throw new Error('Supabase not ready');
    const id=window.__sw421CurrentEquipmentId || '';
    if(!id) throw new Error('Equipment item not identified');
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'); const path=`archive-disposal-evidence/${id}/${Date.now()}-${safe}`;
    const up=await client.storage.from(EQUIP_BUCKET).upload(path,file,{upsert:false,contentType:file.type||undefined});
    if(up.error) throw up.error;
    const ins=await client.from('equipment_photos').insert({equipment_id:id, storage_path:path, file_name:file.name, caption:`Archive/disposal evidence: ${reason}`, uploaded_at:new Date().toISOString()});
    if(ins.error) console.warn('Archive evidence upload saved to storage, but photo row was not inserted:', ins.error.message);
  }

  async function qualificationEvidence(q){
    const raw = q?.storage_path || q?.file_path || q?.path || '';
    if(!raw) return {note:'No file attached', html:'<p class="muted">No qualification file is attached.</p>'};
    let path = String(raw).trim().replace(/^\/+/, '').replace(/^inspection-photos\//,'');
    let signed = await signedUrl(PHOTO_BUCKET, path);
    try{
      const data = await dataUrl(PHOTO_BUCKET, path);
      const name = q.file_name || data.name || path.split('/').pop();
      const isPdf = /pdf/i.test(data.type) || /\.pdf$/i.test(name);
      if(isPdf) return {note:name, html:`<iframe src="${esc(data.url || signed)}"></iframe><p><a href="${esc(signed || data.url)}" target="_blank" download="${esc(name)}">Open/download qualification PDF</a></p>`};
      return {note:name, html:`<img src="${esc(data.url || signed)}" alt="Uploaded qualification image"><p><a href="${esc(signed || data.url)}" target="_blank" download="${esc(name)}">Open/download qualification file</a></p>`};
    }catch(e){
      return {note:'File attached, preview unavailable', html: signed ? `<p>The saved file could not be embedded. <a href="${esc(signed)}" target="_blank">Open qualification file</a></p>` : `<p class="muted">The saved file could not be loaded. It may need to be re-uploaded.</p>`};
    }
  }
  async function printQualDetails(id){
    const rows=state().qualifications || [];
    const q=rows.find(x=>String(x.id)===String(id)) || rows.find(x=>norm(x.inspector_name)===norm(id));
    if(!q) return alert('Qualification record not found.');
    const ev=await qualificationEvidence(q);
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Inspector Qualification Details</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Inspector Qualification Details</div><div class="muted">Height equipment inspector qualification record</div></div></div><div class="grid"><div class="label">Inspector</div><div class="value">${esc(titleCase(q.inspector_name)||'—')}</div><div class="label">Email</div><div class="value">${esc(q.email||'—')}</div><div class="label">Qualification</div><div class="value">${esc(q.qualification_type||'—')}</div><div class="label">Provider</div><div class="value">${esc(q.provider||'—')}</div><div class="label">Reference</div><div class="value">${esc(q.reference_number||'—')}</div><div class="label">Issue date</div><div class="value">${nzDate(q.issue_date)}</div><div class="label">Expiry date</div><div class="value">${nzDate(q.expiry_date)}</div><div class="label">Saved file</div><div class="value">${esc(ev.note)}</div><div class="label">Notes</div><div class="value">${esc(q.notes||'—')}</div></div><div class="footer">Generated ${new Date().toLocaleString('en-NZ')} from Spray &amp; Wash Operations.</div></section><section class="page evidencePage"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Uploaded Qualification Evidence</div></div></div><div class="qualEvidence">${ev.html}</div></section></body></html>`;
    const w=window.open('', '_blank'); if(w){w.document.open();w.document.write(html);w.document.close();} else {const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='inspector-qualification-details.html'; a.click(); URL.revokeObjectURL(a.href);}
  }
  async function openQualFile(idOrPath){
    const q=(state().qualifications||[]).find(x=>String(x.id)===String(idOrPath));
    let path = q ? (q.storage_path || q.file_path || q.path || '') : idOrPath;
    path = String(path||'').replace(/^\/+/, '').replace(/^inspection-photos\//,'');
    if(!path) return alert('No saved file is attached.');
    const url=await signedUrl(PHOTO_BUCKET,path); if(url) return window.open(url,'_blank');
    try{ const d=await dataUrl(PHOTO_BUCKET,path); window.open(d.url,'_blank'); }catch(e){ alert('Could not open file. This record may point to a missing/corrupted upload. Re-upload the qualification file.'); }
  }
  function patchQualificationsUi(){
    // Rename and order cards once they appear in the Qualifications tab.
    const qualHead=Array.from(document.querySelectorAll('h2')).find(h=>/inspector qualifications/i.test(h.textContent||''));
    if(qualHead){ qualHead.textContent='Add Inspector'; const p=qualHead.parentElement?.querySelector('p.muted'); if(p) p.remove(); }
    const saved=Array.from(document.querySelectorAll('h2')).find(h=>/saved inspector qualifications/i.test(h.textContent||''));
    if(saved){ saved.textContent='Saved Inspectors'; const savedCard=saved.closest('.card,.ops-card'); const addCard=qualHead?.closest('.card,.ops-card'); if(savedCard && addCard && addCard.previousElementSibling !== savedCard){ addCard.parentElement.insertBefore(savedCard, addCard); } }
    document.querySelectorAll('[data-sw419-print-qual]').forEach(b=>{ b.textContent='Print Qualification Details'; if(!b.dataset.sw421){ b.dataset.sw421='1'; b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();printQualDetails(b.dataset.sw419PrintQual);},true); }});
    document.querySelectorAll('[data-sw419-open-qual]').forEach(b=>{ if(!b.dataset.sw421){ b.dataset.sw421='1'; b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();openQualFile(b.dataset.sw419OpenQual);},true); }});
  }

  function installReportsPatch(){
    const btn=$('sw421ReportClearFilters'); if(btn && !btn.dataset.sw421){ btn.dataset.sw421='1'; btn.addEventListener('click',()=>{ ['reportTypeFilter','reportManufacturer','reportModel','reportStartDate','reportEndDate','reportResult','reportInspectionType','reportDueDays'].forEach(id=>{ const el=$(id); if(el) el.selectedIndex ? el.selectedIndex=0 : el.value=''; }); }); }
    const oldRun=window.runReport;
    if(typeof oldRun === 'function' && !oldRun.sw421){
      const wrapped=function(name){
        document.querySelectorAll('.reportPanel button').forEach(b=>b.classList.remove('primary','sw421-report-active'));
        const clicked = Array.from(document.querySelectorAll('.reportPanel button')).find(b => (b.getAttribute('onclick')||'').includes(`'${name}'`) || (b.getAttribute('onclick')||'').includes(`\"${name}\"`));
        if(clicked){ clicked.classList.add('primary','sw421-report-active'); }
        return oldRun.apply(this, arguments);
      };
      wrapped.sw421=true; window.runReport=wrapped;
    }
  }

  function refreshAll(){
    injectCss(); installPhotoButtons(); installRecentHistory421(); /* equipment filter stabiliser retired; app.js owns filter */ installReportsPatch();
    const tagline=document.querySelector('.tagline'); if(tagline) tagline.textContent='Version 4.0.63 • Height Safety • Vehicle Checks • Equipment • Maintenance';
    const apiObj=api();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(refreshAll,1700)); else setTimeout(refreshAll,1700);
  document.addEventListener('click', ()=>{ setTimeout(refreshAll,250); }, true);
  document.addEventListener('change', e=>{ if(e.target?.id==='heightRecentLimitLegacy') setTimeout(renderRecentHistory421,30); }, true);
  ['dashboard','equipment','detail','certificates','export'].forEach(id => {
    const btn = document.querySelector(`[data-tab="${id}"]`);
    if(btn) btn.addEventListener('click', () => setTimeout(refreshAll, 350));
  });
  installArchiveDisposeGuard();
})();

/* V4.0.30 - stabilisation and completion patch */
(function(){
  'use strict';
  const VERSION = '4.0.63';
  const PHOTO_BUCKET = 'inspection-photos';
  const EQUIP_BUCKET = 'equipment-photos';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = v => String(v || '').trim().toLowerCase().replace(/\s+/g,' ');
  const api = () => window.SWOperationsV4 || {};
  const appState = () => api().state || {};
  const sb = () => appState().sb || window.sb || null;
  const nzDate = v => { if(!v) return '—'; const d = new Date(String(v).includes('T') ? v : String(v)+'T00:00:00'); return isNaN(d) ? String(v).slice(0,10) : d.toLocaleDateString('en-NZ'); };
  const titleCase = v => String(v||'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');
  function statusLabel(v){ const s=String(v||''); if(s==='Pass') return 'Completed OK'; if(/fail - repair/i.test(s)) return 'Issue - repair required'; if(/remove|disposal/i.test(s)) return 'Remove from service'; return s || '—'; }
  function statusClass(v){ const s=norm(v); if(/pass|completed ok|in service/.test(s)) return 'ok'; if(/fail|issue|remove|quarantined|disposed|retired/.test(s)) return 'bad'; return 'warn'; }
  function isArchived(e){ return !!(e && (e.archived === true || e.disposed_at || /archived|disposed|retired/i.test(String(e.status||'')))); }
  function pathFrom(row){ return row?.storage_path || row?.file_path || row?.path || row?.object_path || ''; }
  async function loadHeight(){
    const c=sb(); if(!c) throw new Error('Supabase is not ready.');
    const [eq,ins,ep,ip,q] = await Promise.all([
      c.from('equipment').select('*').order('type',{ascending:true}).order('serial',{ascending:true}),
      c.from('inspections').select('*').order('inspection_date',{ascending:false}).order('created_at',{ascending:false}),
      c.from('equipment_photos').select('*').order('created_at',{ascending:false}),
      c.from('inspection_photos').select('*').order('created_at',{ascending:false}),
      c.from('height_inspector_qualifications').select('*').order('inspector_name',{ascending:true})
    ]);
    if(eq.error) throw eq.error; if(ins.error) throw ins.error;
    return { equipment:eq.data||[], inspections:ins.data||[], equipmentPhotos:ep.error?[]:(ep.data||[]), inspectionPhotos:ip.error?[]:(ip.data||[]), qualifications:q.error?((appState().qualifications)||[]):(q.data||[]) };
  }
  function latestInspection(e, inspections){
    const id=String(e?.id||''), serial=norm(e?.serial);
    return (inspections||[]).filter(i=>String(i.equipment_id||'')===id || norm(i.serial)===serial)
      .sort((a,b)=>String(b.inspection_date||b.created_at||'').localeCompare(String(a.inspection_date||a.created_at||'')))[0] || null;
  }
  function dueStatus(i){
    if(!i) return 'no_inspection';
    const d=String(i.next_due||i.next_inspection_due||i.due_date||'').slice(0,10);
    if(!d) return 'ok';
    return d <= new Date().toISOString().slice(0,10) ? 'due' : 'ok';
  }
  function pairText(p){ const e=p.equipment||{}, i=p.inspection||{}; return [e.serial,e.type,e.manufacturer,e.model,e.status,e.notes,e.location,i.result,i.inspector,i.inspection_date].map(norm).join(' '); }
  function matchesPair(p,f){
    const e=p.equipment||{}, i=p.inspection||null;
    if(f.type && norm(e.type)!==norm(f.type)) return false;
    if(f.status && norm(e.status)!==norm(f.status)) return false;
    if(f.result && (!i || norm(i.result)!==norm(f.result))) return false;
    if(f.due==='due' && dueStatus(i)!=='due') return false;
    if(f.due==='ok' && dueStatus(i)!=='ok') return false;
    if(f.due==='no_inspection' && i) return false;
    if(f.q && !pairText(p).includes(norm(f.q))) return false;
    return true;
  }
  function injectCss(){
    if($('sw422Styles')) return;
    const st=document.createElement('style'); st.id='sw422Styles'; st.textContent=`
      .sw422-hidden{display:none!important}.notifyBtn,#notifyBadge,#notificationPanel{display:none!important}
      .sw422-filter{background:#ecfdf5;border:1px solid #14b8a6;border-radius:16px;padding:14px;margin:12px 0}.sw422-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px}.sw422-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.sw422-rowlist{border:1px solid #e2e8f0;border-radius:14px;overflow:auto;background:white}.sw422-rowlist table{width:100%;border-collapse:collapse;font-size:13px}.sw422-rowlist th,.sw422-rowlist td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}.sw422-rowlist tr[data-id],.sw422-rowlist tr[data-eqid]{cursor:pointer}.sw422-rowlist tr:hover{background:#f8fafc}.sw422-pill{display:inline-block;border-radius:999px;padding:3px 8px;font-weight:800;font-size:12px}.sw422-pill.ok{background:#dcfce7;color:#166534}.sw422-pill.bad{background:#fee2e2;color:#991b1b}.sw422-pill.warn{background:#fef3c7;color:#92400e}.sw422-scroll{max-height:395px;overflow:auto;border:1px solid #e2e8f0;border-radius:14px;background:white}.sw422-cert-list{max-height:430px;overflow:auto;border:1px solid #cbd5e1;border-radius:14px;background:white}.sw422-cert-list label{display:flex!important;justify-content:flex-start!important;align-items:flex-start!important;gap:10px;text-align:left!important;margin:0!important;padding:12px;border-bottom:1px solid #e2e8f0;width:100%}.sw422-cert-list input{width:auto!important;margin-top:4px}.sw422-selected{text-align:left!important;margin-top:8px;font-weight:800}.certSelectList,.certItemCheckRow,.ops-cert-row{text-align:left!important;justify-content:flex-start!important;align-items:flex-start!important}.sw422-photo-choice{display:inline-block}.sw422-photo-choice .hidden{display:none!important}.sw422-archive-modal{position:fixed;inset:0;background:rgba(15,23,42,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:14px}.sw422-archive-box{background:white;border-radius:18px;max-width:540px;width:100%;padding:16px;box-shadow:0 20px 70px #0008}.sw422-qual-card details{border:1px solid #e2e8f0;border-radius:16px;background:white;margin:12px 0}.sw422-qual-card summary{padding:14px;font-weight:900;cursor:pointer}.sw422-qual-inner{padding:0 14px 14px}.sw422-report-active{background:#0f766e!important;color:white!important}
    `; document.head.appendChild(st);
  }
  async function renderRecent(){
    const box=$('dashRecentLegacy'); if(!box) return;
    try{
      const limit=Number($('heightRecentLimitLegacy')?.value||10);
      const {equipment,inspections}=await loadHeight();
      const idMap=new Map(equipment.map(e=>[String(e.id),e])); const serialMap=new Map(equipment.map(e=>[norm(e.serial),e]));
      const rows=inspections.slice(0,limit).map(i=>{ const e=idMap.get(String(i.equipment_id||''))||serialMap.get(norm(i.serial))||{}; return `<tr data-id="${esc(i.id||'')}"><td>${nzDate(i.inspection_date||i.created_at)}</td><td><strong>${esc(e.serial||i.serial||'')}</strong></td><td>${esc(e.type||i.type||'')}</td><td><span class="sw422-pill ${statusClass(i.result)}">${esc(statusLabel(i.result))}</span></td><td>${esc(i.inspector||'')}</td></tr>`; }).join('');
      box.innerHTML=`<div class="sw422-scroll"><table><thead><tr><th>Date</th><th>Serial</th><th>Type</th><th>Result</th><th>Inspector</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No inspections found.</td></tr>'}</tbody></table></div>`;
      box.querySelectorAll('tr[data-id]').forEach(r=>r.addEventListener('click',()=>{ if(api().openInspectionRecord) api().openInspectionRecord(r.dataset.id); }));
    }catch(e){ box.innerHTML='<p class="muted">Could not load recent inspections.</p>'; console.warn(e); }
  }
  function installRecent(){ const sel=$('heightRecentLimitLegacy'); if(sel){ if(!sel.value) sel.value='10'; if(!sel.dataset.sw422){sel.dataset.sw422='1'; sel.addEventListener('change',renderRecent);} } renderRecent(); }
  let eqToken=0;
  async function ensureEqFilter(){
    const list=$('equipmentList'); if(!list) return;
    const old=$('search')?.closest('.row'); if(old) old.style.display='none'; const label=$('filterLabel'); if(label) label.remove();
    let panel=$('sw422EqFilter');
    const {equipment}=await loadHeight();
    const types=[...new Set(equipment.map(e=>e.type).filter(Boolean))].sort(); const statuses=[...new Set(equipment.map(e=>e.status).filter(Boolean))].sort();
    const cur={type:$('sw422EqType')?.value||'',status:$('sw422EqStatus')?.value||'',due:$('sw422EqDue')?.value||'',q:$('sw422EqQ')?.value||''};
    if(!panel){ panel=document.createElement('div'); panel.id='sw422EqFilter'; panel.className='sw422-filter'; list.parentElement.insertBefore(panel,list); }
    panel.innerHTML=`<h3 style="margin-top:0">Filter Equipment</h3><div class="sw422-grid"><label>Equipment type<select id="sw422EqType"><option value="">All types</option>${types.map(t=>`<option ${cur.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label><label>Status<select id="sw422EqStatus"><option value="">All statuses</option>${statuses.map(s=>`<option ${cur.status===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>Due status<select id="sw422EqDue"><option value="" ${!cur.due?'selected':''}>All due states</option><option value="due" ${cur.due==='due'?'selected':''}>Due / overdue</option><option value="ok" ${cur.due==='ok'?'selected':''}>Not due</option><option value="no_inspection" ${cur.due==='no_inspection'?'selected':''}>No inspection history</option></select></label><label>Keyword search<input id="sw422EqQ" type="search" value="${esc(cur.q)}" placeholder="Serial, type, manufacturer, model"></label></div><div class="sw422-actions"><button type="button" id="sw422EqClear">Clear filters</button></div><div id="sw422EqCount" class="muted" style="margin-top:6px"></div>`;
    ['sw422EqType','sw422EqStatus','sw422EqDue'].forEach(id=>$(id)?.addEventListener('change',renderEqList)); $('sw422EqQ')?.addEventListener('input',renderEqList); $('sw422EqClear')?.addEventListener('click',()=>{['sw422EqType','sw422EqStatus','sw422EqDue','sw422EqQ'].forEach(id=>{const el=$(id); if(el) el.value='';}); renderEqList();});
  }
  async function renderEqList(){
    const list=$('equipmentList'); if(!list) return; const token=++eqToken; const y=window.scrollY;
    try{ await ensureEqFilter(); const {equipment,inspections}=await loadHeight(); if(token!==eqToken) return; const f={type:$('sw422EqType')?.value||'',status:$('sw422EqStatus')?.value||'',due:$('sw422EqDue')?.value||'',q:$('sw422EqQ')?.value||''}; const pairs=equipment.filter(e=>!isArchived(e)).map(e=>({equipment:e,inspection:latestInspection(e,inspections)})).filter(p=>matchesPair(p,f));
      $('sw422EqCount') && ($('sw422EqCount').textContent=`${pairs.length} item${pairs.length===1?'':'s'} shown.`);
      list.innerHTML=`<div class="sw422-rowlist"><table><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer / model</th><th>Status</th><th>Latest inspection</th></tr></thead><tbody>${pairs.map(p=>{const e=p.equipment,i=p.inspection;return `<tr data-eqid="${esc(e.id)}"><td><strong>${esc(e.serial||'')}</strong></td><td>${esc(e.type||'')}</td><td>${esc(e.manufacturer||'')} ${esc(e.model||'')}</td><td>${esc(e.status||'')}</td><td>${i?`${nzDate(i.inspection_date)} <span class="sw422-pill ${statusClass(i.result)}">${esc(statusLabel(i.result))}</span>`:'No inspection history'}</td></tr>`;}).join('')||'<tr><td colspan="5">No items match the current filters.</td></tr>'}</tbody></table></div>`;
      list.querySelectorAll('tr[data-eqid]').forEach(r=>r.addEventListener('click',()=>openEq(r.dataset.eqid,y)));
      requestAnimationFrame(()=>window.scrollTo({top:y,behavior:'auto'}));
    }catch(e){ list.innerHTML='<div class="warning">Could not load equipment filter.</div>'; console.warn(e); }
  }
  function openEq(id,y){ if(typeof window.openDetail==='function') window.openDetail(id); else window.showTab?.('detail'); setTimeout(()=>{ window.scrollTo({top:y||window.scrollY,behavior:'auto'});},250); }
  function addDetailButtons(){
    const box=$('detailContent'); if(!box || box.querySelector('#sw422PrintCert')) return;
    const actions=document.createElement('div'); actions.className='row'; actions.innerHTML='<button type="button" class="primary" id="sw422PrintCert">Print Certificate</button>';
    (box.querySelector('.card,.detailHero')||box.firstElementChild||box).after(actions); $('sw422PrintCert')?.addEventListener('click',printCurrentCertificate);
    installPhotoChoiceButtons();
  }
  function installPhotoChoiceButtons(){
    // keep existing upload inputs, but present one visible Add Photo menu where possible
    document.querySelectorAll('.sw421-photo-source').forEach(row=>{ const btn=row.querySelector('[id$="AddPhotoBtn"]'); if(btn) btn.textContent='Add Photo'; const up=row.querySelector('[id$="UploadBtn"]'); if(up) up.textContent='Upload from device'; });
  }
  function currentDetailId(){ return window.__sw421CurrentEquipmentId || window.currentEquipmentId || document.querySelector('#detailContent [data-equipment-id]')?.dataset.equipmentId || ''; }
  async function printCurrentCertificate(){ const id=currentDetailId(); if(!id) return alert('Open an equipment item first.'); const {equipment,inspections,equipmentPhotos,inspectionPhotos}=await loadHeight(); const e=equipment.find(x=>String(x.id)===String(id)); if(!e) return alert('Could not find the selected equipment item.'); const i=latestInspection(e,inspections); if(!i) return alert('This item has no inspection history.'); const html=await certHtml([{equipment:e,inspection:i}], {equipmentPhotos,inspectionPhotos}, 'single'); openDoc(html,'equipment-certificate.html'); }
  async function fileUrl(bucket,path){ if(!path) return ''; let p=String(path).replace(/^\/+/, '').replace(/^inspection-photos\//,'').replace(/^equipment-photos\//,''); try{ const d=await sb().storage.from(bucket).download(p); if(d.error) throw d.error; return await new Promise((res,rej)=>{const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(d.data);}); }catch(e){ try{ const s=await sb().storage.from(bucket).createSignedUrl(p,3600); return s.error?'':s.data.signedUrl; }catch(_){ return ''; }} }
  async function certHtml(pairs, photos, mode){
    let pages='';
    for(const p of pairs){ const e=p.equipment,i=p.inspection; const eqPics=(photos.equipmentPhotos||[]).filter(x=>String(x.equipment_id||'')===String(e.id)||norm(x.serial)===norm(e.serial)).slice(0,3); const inspPics=(photos.inspectionPhotos||[]).filter(x=>String(x.inspection_id||'')===String(i.id)).slice(0,4); const inspUrls=[]; for(const ph of inspPics){ const u=await fileUrl(PHOTO_BUCKET,pathFrom(ph)); if(u) inspUrls.push(u); } const eqUrls=[]; for(const ph of eqPics){ const u=await fileUrl(EQUIP_BUCKET,pathFrom(ph)); if(u) eqUrls.push(u); }
      pages += `<section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><h1>Height Equipment Inspection Certificate</h1></div><div class="meta">Generated ${new Date().toLocaleDateString('en-NZ')}</div></div><div class="grid"><div class="label">Serial</div><div class="value">${esc(e.serial||'')}</div><div class="label">Type</div><div class="value">${esc(e.type||'')}</div><div class="label">Manufacturer / Model</div><div class="value">${esc(e.manufacturer||'')} ${esc(e.model||'')}</div><div class="label">Inspection Date</div><div class="value">${nzDate(i.inspection_date)}</div><div class="label">Inspector</div><div class="value">${esc(i.inspector||'')}</div><div class="label">Result</div><div class="value"><span class="pill ${statusClass(i.result)}">${esc(statusLabel(i.result))}</span></div><div class="label">Next Due</div><div class="value">${nzDate(i.next_due||i.next_inspection_due)}</div><div class="label">Notes</div><div class="value">${esc(i.notes||'—')}</div></div>${inspUrls.length?`<h2>Latest Inspection Photos</h2><div class="photos">${inspUrls.map(u=>`<img src="${esc(u)}">`).join('')}</div>`:''}</section>${eqUrls.length?`<section class="page"><h1>Equipment Photo Evidence</h1><p class="muted">Equipment photos for ${esc(e.serial||'this item')}.</p><div class="photos large">${eqUrls.map(u=>`<img src="${esc(u)}">`).join('')}</div></section>`:''}`;
    }
    return `<!doctype html><html><head><meta charset="utf-8"><title>Spray & Wash Certificate</title><style>${docCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div>${pages}</body></html>`;
  }
  function docCss(){return `body{font-family:Arial,sans-serif;margin:0;color:#0f172a;background:#f8fafc}.noPrint{position:sticky;top:0;padding:10px;background:white;border-bottom:1px solid #ddd;z-index:5}.page{background:white;max-width:920px;min-height:1120px;margin:20px auto;padding:34px;box-shadow:0 4px 20px #0001;page-break-after:always}.head{display:flex;justify-content:space-between;border-bottom:4px solid #0f766e;padding-bottom:14px;margin-bottom:20px}.brand{font-size:13px;font-weight:900;color:#0f766e;text-transform:uppercase;letter-spacing:.08em}h1{margin:4px 0;color:#0f172a}.meta,.muted{color:#64748b;font-size:13px}.grid{display:grid;grid-template-columns:190px 1fr;border-top:1px solid #e2e8f0}.label,.value{padding:10px;border-bottom:1px solid #e2e8f0}.label{font-weight:900;background:#f8fafc}.pill{border-radius:999px;padding:5px 10px;font-weight:900;display:inline-block}.pill.ok{background:#dcfce7;color:#166534}.pill.bad{background:#fee2e2;color:#991b1b}.pill.warn{background:#fef3c7;color:#92400e}.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px}.photos img{width:100%;height:230px;object-fit:contain;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}.photos.large img{height:420px}@media print{.noPrint{display:none}.page{box-shadow:none;margin:0;max-width:none;min-height:auto;page-break-after:always}}`;}
  function openDoc(html,name){ const w=window.open('','_blank'); if(w){w.document.open();w.document.write(html);w.document.close();} else {const blob=new Blob([html],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);} }
  function installCertUi(){
    const cert=$('certificates'); if(!cert) return;
    cert.innerHTML=`<div class="card"><div class="sw422-filter"><div class="sw422-grid"><label>Equipment type<select id="sw422CertType"><option value="">All types</option></select></label><label>Status<select id="sw422CertStatus"><option value="">All statuses</option></select></label><label>Inspection result<select id="sw422CertResult"><option value="">All results</option><option value="Pass">Completed OK</option><option value="Fail - Repair Required">Issue - repair required</option><option value="Fail - Remove From Service / Disposal">Remove from service</option></select></label><label>Due status<select id="sw422CertDue"><option value="">All due states</option><option value="due">Due / overdue</option><option value="ok">Not due</option><option value="no_inspection">No inspection history</option></select></label><label>Keyword search<input id="sw422CertQ" type="search" placeholder="Serial, type, manufacturer, model"></label></div><div class="sw422-actions"><button type="button" id="sw422CertClear">Clear filters</button></div><div id="sw422CertCount" class="muted" style="margin-top:6px"></div></div><div id="sw422CertList" class="sw422-cert-list"></div><div id="sw422CertSelected" class="sw422-selected">No items selected.</div><div class="card"><h3>Photo options</h3><label><input type="checkbox" id="sw422CertInspPhotos" checked style="width:auto"> Include latest inspection photos</label><label><input type="checkbox" id="sw422CertEqPhotos" checked style="width:auto"> Include equipment photos</label></div><div class="row"><button type="button" class="primary" id="sw422GenSeparate">Generate separate certificates</button><button type="button" class="primary" id="sw422GenCombined">Generate one combined certificate</button></div></div>`;
    renderCertList(); ['sw422CertType','sw422CertStatus','sw422CertResult','sw422CertDue'].forEach(id=>$(id)?.addEventListener('change',renderCertList)); $('sw422CertQ')?.addEventListener('input',renderCertList); $('sw422CertClear')?.addEventListener('click',()=>{['sw422CertType','sw422CertStatus','sw422CertResult','sw422CertDue','sw422CertQ'].forEach(id=>{const el=$(id); if(el) el.value='';}); renderCertList();}); $('sw422GenSeparate')?.addEventListener('click',genSeparate); $('sw422GenCombined')?.addEventListener('click',genCombined);
  }
  const certSel = new Set();
  async function renderCertList(){
    const list=$('sw422CertList'); if(!list) return; const data=await loadHeight(); const active=data.equipment.filter(e=>!isArchived(e)); const types=[...new Set(active.map(e=>e.type).filter(Boolean))].sort(); const statuses=[...new Set(active.map(e=>e.status).filter(Boolean))].sort(); const typeEl=$('sw422CertType'), statusEl=$('sw422CertStatus'); const oldT=typeEl?.value||'', oldS=statusEl?.value||''; if(typeEl && typeEl.options.length<=1){typeEl.innerHTML='<option value="">All types</option>'+types.map(t=>`<option>${esc(t)}</option>`).join(''); typeEl.value=oldT;} if(statusEl && statusEl.options.length<=1){statusEl.innerHTML='<option value="">All statuses</option>'+statuses.map(s=>`<option>${esc(s)}</option>`).join(''); statusEl.value=oldS;}
    const f={type:$('sw422CertType')?.value||'',status:$('sw422CertStatus')?.value||'',result:$('sw422CertResult')?.value||'',due:$('sw422CertDue')?.value||'',q:$('sw422CertQ')?.value||''}; const pairs=active.map(e=>({equipment:e,inspection:latestInspection(e,data.inspections)})).filter(p=>matchesPair(p,f)); const rows=pairs.map(p=>{const e=p.equipment,i=p.inspection; const disabled=i?'':'disabled'; return `<label><input type="checkbox" data-id="${esc(e.id)}" ${certSel.has(String(e.id))?'checked':''} ${disabled}><span><strong>${esc(e.serial||'No serial')} ${esc(e.type||'')}</strong><br><span class="muted">${esc(e.manufacturer||'')} ${esc(e.model||'')} · ${esc(e.status||'')} · Latest: ${i?`${nzDate(i.inspection_date)} ${statusLabel(i.result)}`:'No inspection history'}</span></span></label>`;}).join('')||'<p class="muted" style="padding:12px">No items match the current filters.</p>';
    list.innerHTML=rows; list.querySelectorAll('input[type="checkbox"]').forEach(ch=>ch.addEventListener('change',()=>{ if(ch.checked) certSel.add(String(ch.dataset.id)); else certSel.delete(String(ch.dataset.id)); updateCertSelected(); })); $('sw422CertCount') && ($('sw422CertCount').textContent=`${pairs.length} item${pairs.length===1?'':'s'} shown; ${pairs.filter(p=>p.inspection).length} with inspection history; ${certSel.size} selected.`); updateCertSelected(); }
  function updateCertSelected(){ const el=$('sw422CertSelected'); if(el) el.textContent = certSel.size ? `${certSel.size} selected.` : 'No items selected.'; }
  async function selectedPairs(){ const data=await loadHeight(); return data.equipment.filter(e=>certSel.has(String(e.id))).map(e=>({equipment:e,inspection:latestInspection(e,data.inspections)})).filter(p=>p.inspection).map(p=>Object.assign(p,{photos:data})); }
  async function genSeparate(){ const pairs=await selectedPairs(); if(!pairs.length) return alert('Select at least one item with inspection history.'); const data=pairs[0].photos; const html=await certHtml(pairs,data,'separate'); openDoc(html,'spray-wash-height-certificates.html'); }
  async function genCombined(){ const pairs=await selectedPairs(); if(!pairs.length) return alert('Select at least one item with inspection history.'); const rows=pairs.map(p=>`<tr><td>${esc(p.equipment.serial||'')}</td><td>${esc(p.equipment.type||'')}</td><td>${esc(p.equipment.manufacturer||'')} ${esc(p.equipment.model||'')}</td><td>${nzDate(p.inspection.inspection_date)}</td><td><span class="pill ${statusClass(p.inspection.result)}">${esc(statusLabel(p.inspection.result))}</span></td><td>${esc(p.inspection.inspector||'')}</td></tr>`).join(''); const html=`<!doctype html><html><head><meta charset="utf-8"><title>Combined Inspection Certificate</title><style>${docCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><h1>Combined Height Equipment Inspection Certificate</h1></div><div class="meta">Generated ${new Date().toLocaleDateString('en-NZ')}</div></div><table style="width:100%;border-collapse:collapse"><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer / model</th><th>Inspection date</th><th>Result</th><th>Inspector</th></tr></thead><tbody>${rows}</tbody></table></section></body></html>`; openDoc(html,'combined-height-equipment-certificate.html'); }
  function installReports(){ const panel=document.querySelector('#export .reportPanel'); if(panel){ panel.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{panel.querySelectorAll('button').forEach(x=>x.classList.remove('primary','sw422-report-active')); b.classList.add('primary','sw422-report-active');})); } const clear=$('sw421ReportClearFilters'); if(clear) clear.textContent='Clear filters'; }
  function closeAccountOutside(e){ const tray=$('signedIn'), panel=$('accountPanel'); if(panel && !panel.classList.contains('hidden') && tray && !tray.contains(e.target)) panel.classList.add('hidden'); }
  function installArchiveGuard(){ /* retained from previous version; no-op if already installed */ }
  function init(){ injectCss(); document.querySelector('.tagline') && (document.querySelector('.tagline').textContent='Version 4.0.63 • Height Safety • Vehicle Checks • Equipment • Maintenance'); installRecent(); /* equipment register is owned by app.js */ installReports(); document.removeEventListener('click',closeAccountOutside); document.addEventListener('click',closeAccountOutside); window.SWOperationsV4=Object.assign(api(),{renderRecentHistoryV422:renderRecent,renderEquipmentFilteredListV422:renderEqList}); /* app.js owns window.renderEquipment */ }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,1200)); else setTimeout(init,1200);
  document.addEventListener('click',e=>{ const tab=e.target?.closest?.('[data-tab]'); if(tab){ const name=tab.dataset.tab; setTimeout(()=>{ if(name==='dashboard') installRecent(); /* equipment tab handled by app.js */ if(name==='export') installReports(); },250); } });
  document.addEventListener('change',e=>{ if(e.target?.id==='heightRecentLimitLegacy') setTimeout(renderRecent,20); });
})();

/* V4.0.30 - app structure stabilisation marker and duplicate render guard */
(function(){
  const VERSION = '4.0.63';
  window.SW_OPERATIONS_BUILD = VERSION;
  function setVersion(){
    const tagline = document.querySelector('.tagline');
    if(tagline) tagline.textContent = 'Version 4.0.63 • Height Safety • Vehicle Checks • Equipment • Maintenance';
    document.documentElement.setAttribute('data-sw-version', VERSION);
  }
  function stabiliseOnce(){
    setVersion();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stabiliseOnce); else stabiliseOnce();
})();

/* V4.0.30 - Height UI Stabilisation, Qualifications, Admin Backup Cleanup */
(function(){
  const VERSION = '4.0.63';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = v => String(v || '').trim().toLowerCase();
  const nzDate = v => v ? new Date(v).toLocaleDateString('en-NZ') : '—';
  const client = () => {
    try{
      if(window.SWOperationsV4?.state?.sb) return window.SWOperationsV4.state.sb;
      if(window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY){
        if(!window.__sw424Client) window.__sw424Client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        return window.__sw424Client;
      }
    }catch(e){}
    return null;
  };
  const PHOTO_BUCKET = 'inspection-photos';

  function installCss(){
    if($('sw424Styles')) return;
    const st=document.createElement('style'); st.id='sw424Styles'; st.textContent = `
      html[data-sw-version="4.0.63"] .notifyBtn,
      html[data-sw-version="4.0.63"] #notifyBadge,
      html[data-sw-version="4.0.63"] #notificationPanel{display:none!important}
      .sw424-recent-box{max-height:370px;min-height:370px;overflow:auto;border:1px solid #e2e8f0;border-radius:14px;background:white;contain:layout paint;scrollbar-gutter:stable}
      .sw424-table{width:100%;border-collapse:collapse;font-size:13px}.sw424-table th,.sw424-table td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}.sw424-table tr[data-id],.sw424-table tr[data-eqid]{cursor:pointer}.sw424-table tr:hover{background:#f8fafc}
      .sw424-filter{background:#ecfdf5;border:1px solid #14b8a6;border-radius:16px;padding:14px;margin:12px 0}.sw424-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px}.sw424-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.sw424-muted{color:#64748b;font-size:13px}.sw424-results{border:1px solid #e2e8f0;border-radius:14px;overflow:auto;background:white}.sw424-pill{display:inline-block;border-radius:999px;padding:3px 8px;font-weight:800;font-size:12px}.sw424-pill.ok{background:#dcfce7;color:#166534}.sw424-pill.bad{background:#fee2e2;color:#991b1b}.sw424-pill.warn{background:#fef3c7;color:#92400e}
      #equipment .sw422-filter:not(#sw424EqFilter),#equipment #sw422EqFilter,#equipment .filterBar + .row{display:none!important}
      .sw424-cert{padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important}.sw424-cert-list{display:grid;gap:10px;margin:10px 0;background:transparent}.sw424-cert-list label{display:flex!important;justify-content:flex-start!important;align-items:flex-start!important;gap:10px;text-align:left!important;margin:0!important;padding:14px;border:1px solid #e2e8f0;border-radius:16px;background:white;width:100%;box-sizing:border-box;cursor:pointer;transition:.15s transform,.15s box-shadow}.sw424-cert-list label:hover{transform:translateY(-1px);box-shadow:0 10px 22px #0f172a12}.sw424-cert-list input{width:auto!important;margin-top:4px;flex:0 0 auto}.sw424-cert-list span{display:block;text-align:left!important}.sw424-selected{text-align:left!important;font-weight:800;margin:8px 0}
      .sw424-qual details{border:1px solid #e2e8f0;border-radius:16px;background:white;margin:12px 0}.sw424-qual summary{cursor:pointer;padding:14px;font-weight:900}.sw424-qual-body{padding:0 14px 14px}
    `; document.head.appendChild(st);
  }
  function setVersion(){
    document.documentElement.setAttribute('data-sw-version', VERSION);
    const t=document.querySelector('.tagline'); if(t) t.textContent='Version 4.0.63 • Height Safety • Vehicle Checks • Equipment • Maintenance';
  }
  async function loadHeight(){
    const sb=client(); if(!sb) throw new Error('Supabase client not available.');
    const [er,ir,epr,ipr]=await Promise.all([
      sb.from('equipment').select('*').order('type',{ascending:true}).order('serial',{ascending:true}),
      sb.from('inspections').select('*').order('inspection_date',{ascending:false}).order('created_at',{ascending:false}),
      sb.from('equipment_photos').select('*').order('created_at',{ascending:false}),
      sb.from('inspection_photos').select('*').order('created_at',{ascending:false})
    ]);
    [er,ir,epr,ipr].forEach(r=>{ if(r.error) throw r.error; });
    return {equipment:er.data||[], inspections:ir.data||[], equipmentPhotos:epr.data||[], inspectionPhotos:ipr.data||[]};
  }
  function latestInspection(e,inspections){
    const id=String(e.id||''), ser=norm(e.serial);
    return inspections.find(i=>String(i.equipment_id||'')===id || norm(i.serial)===ser) || null;
  }
  function resultClass(r){ const s=norm(r); if(s.includes('pass')||s.includes('completed')) return 'ok'; if(s.includes('fail')||s.includes('remove')||s.includes('quarant')) return 'bad'; return 'warn'; }
  function resultLabel(r){ const s=String(r||''); if(s==='Pass') return 'Completed OK'; if(/repair/i.test(s)) return 'Issue - repair required'; if(/remove|disposal/i.test(s)) return 'Remove from service'; return s || '—'; }
  function dueStatus(i){ if(!i) return 'no_inspection'; const d=i.next_due_date || i.next_inspection_due; if(!d) return 'ok'; const dt=new Date(d); if(Number.isNaN(dt.getTime())) return 'ok'; return dt < new Date() ? 'due' : 'ok'; }
  function isArchived(e){ return /archiv|retir|dispos/i.test(String(e.status||'')); }
  function pairText(p){ const e=p.equipment||{}, i=p.inspection||{}; return norm([e.serial,e.type,e.manufacturer,e.make,e.model,e.status,e.description,i.result,i.inspector].join(' ')); }
  function matches(p,f){
    const e=p.equipment, i=p.inspection;
    if(f.type && e.type!==f.type) return false;
    if(f.status && e.status!==f.status) return false;
    if(f.result && (!i || i.result!==f.result)) return false;
    if(f.due==='due' && dueStatus(i)!=='due') return false;
    if(f.due==='ok' && dueStatus(i)!=='ok') return false;
    if(f.due==='no_inspection' && i) return false;
    if(f.q && !pairText(p).includes(norm(f.q))) return false;
    return true;
  }

  let recentBusy=false;
  async function renderRecent(){
    const box=$('dashRecentLegacy'); if(!box || recentBusy) return;
    recentBusy=true;
    const oldHeight=box.offsetHeight || 370;
    box.style.minHeight = oldHeight ? Math.max(oldHeight,370)+'px' : '370px';
    try{
      const limit=Number($('heightRecentLimitLegacy')?.value||10);
      const data=await loadHeight();
      const idMap=new Map(data.equipment.map(e=>[String(e.id),e]));
      const serMap=new Map(data.equipment.map(e=>[norm(e.serial),e]));
      const rows=data.inspections.slice(0,limit).map(i=>{ const e=idMap.get(String(i.equipment_id||'')) || serMap.get(norm(i.serial)) || {}; return `<tr data-id="${esc(i.id||'')}"><td>${nzDate(i.inspection_date||i.created_at)}</td><td><strong>${esc(e.serial||i.serial||'')}</strong></td><td>${esc(e.type||i.type||'')}</td><td><span class="sw424-pill ${resultClass(i.result)}">${esc(resultLabel(i.result))}</span></td><td>${esc(i.inspector||'')}</td></tr>`; }).join('');
      box.innerHTML=`<div class="sw424-recent-box"><table class="sw424-table"><thead><tr><th>Date</th><th>Serial</th><th>Type</th><th>Result</th><th>Inspector</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No inspections found.</td></tr>'}</tbody></table></div>`;
      box.querySelectorAll('tr[data-id]').forEach(r=>r.addEventListener('click',()=>{ window.SWOperationsV4?.openInspectionRecord?.(r.dataset.id); }));
    }catch(e){ box.innerHTML='<p class="muted">Could not load recent inspections.</p>'; console.warn(e); }
    finally{ recentBusy=false; requestAnimationFrame(()=>{box.style.minHeight='';}); }
  }
  function installRecent(){
    const sel=$('heightRecentLimitLegacy');
    if(sel){ if(!sel.value) sel.value='10'; if(!sel.dataset.sw424){ sel.dataset.sw424='1'; sel.addEventListener('change',e=>{ e.stopImmediatePropagation(); renderRecent(); }, true); } }
    renderRecent();
  }

  let eqState={type:'',status:'',due:'',q:''}, eqBusy=false;
  function getEqFilter(){ return {type:$('sw424EqType')?.value||eqState.type||'',status:$('sw424EqStatus')?.value||eqState.status||'',due:$('sw424EqDue')?.value||eqState.due||'',q:$('sw424EqQ')?.value||eqState.q||''}; }
  async function renderEquipmentList(){
    const list=$('equipmentList'); if(!list || eqBusy) return;
    eqBusy=true; const scrollY=window.scrollY;
    try{
      document.querySelectorAll('#equipment #sw422EqFilter,#equipment .sw422-filter,#equipment .sw424-filter').forEach(el=>{ if(el.id!=='sw424EqFilter') el.remove(); });
      const data=await loadHeight(); const f=eqState=getEqFilter();
      const types=[...new Set(data.equipment.map(e=>e.type).filter(Boolean))].sort(); const statuses=[...new Set(data.equipment.map(e=>e.status).filter(Boolean))].sort();
      let panel=$('sw424EqFilter'); if(!panel){ panel=document.createElement('div'); panel.id='sw424EqFilter'; panel.className='sw424-filter'; list.parentElement.insertBefore(panel,list); }
      panel.innerHTML=`<h3 style="margin-top:0">Filter Equipment</h3><div class="sw424-grid"><label>Equipment type<select id="sw424EqType"><option value="">All types</option>${types.map(t=>`<option ${f.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label><label>Status<select id="sw424EqStatus"><option value="">All statuses</option>${statuses.map(s=>`<option ${f.status===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label><label>Due status<select id="sw424EqDue"><option value="">All due states</option><option value="due" ${f.due==='due'?'selected':''}>Due / overdue</option><option value="ok" ${f.due==='ok'?'selected':''}>Not due</option><option value="no_inspection" ${f.due==='no_inspection'?'selected':''}>No inspection history</option></select></label><label>Keyword search<input id="sw424EqQ" type="search" value="${esc(f.q)}" placeholder="Serial, type, manufacturer, model"></label></div><div class="sw424-actions"><button type="button" id="sw424EqClear">Clear filters</button></div><div id="sw424EqCount" class="sw424-muted" style="margin-top:6px"></div>`;
      const pairs=data.equipment.filter(e=>!isArchived(e)).map(e=>({equipment:e,inspection:latestInspection(e,data.inspections)})).filter(p=>matches(p,f));
      $('sw424EqCount').textContent=`${pairs.length} item${pairs.length===1?'':'s'} shown.`;
      list.innerHTML=`<div class="sw424-results"><table class="sw424-table"><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer / model</th><th>Status</th><th>Latest inspection</th></tr></thead><tbody>${pairs.map(p=>{ const e=p.equipment,i=p.inspection; return `<tr data-eqid="${esc(e.id)}"><td><strong>${esc(e.serial||'')}</strong></td><td>${esc(e.type||'')}</td><td>${esc(e.manufacturer||e.make||'')} ${esc(e.model||'')}</td><td>${esc(e.status||'')}</td><td>${i?`${nzDate(i.inspection_date)} <span class="sw424-pill ${resultClass(i.result)}">${esc(resultLabel(i.result))}</span>`:'No inspection history'}</td></tr>`; }).join('') || '<tr><td colspan="5">No items match the current filters.</td></tr>'}</tbody></table></div>`;
      ['sw424EqType','sw424EqStatus','sw424EqDue'].forEach(id=>$(id)?.addEventListener('change',ev=>{eqState=getEqFilter(); ev.stopImmediatePropagation(); renderEquipmentList();}, true));
      $('sw424EqQ')?.addEventListener('input',ev=>{eqState=getEqFilter(); ev.stopImmediatePropagation(); renderEquipmentList();}, true);
      $('sw424EqClear')?.addEventListener('click',()=>{eqState={type:'',status:'',due:'',q:''}; renderEquipmentList();});
      list.querySelectorAll('tr[data-eqid]').forEach(row=>row.addEventListener('click',()=>{ const y=window.scrollY; if(typeof window.openDetail==='function') window.openDetail(row.dataset.eqid); else window.showTab?.('detail'); setTimeout(()=>window.scrollTo({top:y,behavior:'auto'}),180); }));
      requestAnimationFrame(()=>window.scrollTo({top:scrollY,behavior:'auto'}));
    }catch(e){ console.warn(e); if(list) list.innerHTML='<div class="warning">Could not load equipment register.</div>'; }
    finally{ eqBusy=false; }
  }

  let certSel=new Set(), certInstallToken=0, certRenderToken=0;
  function getCertFilter(){ return {type:$('sw424CertType')?.value||'',status:$('sw424CertStatus')?.value||'',result:$('sw424CertResult')?.value||'',due:$('sw424CertDue')?.value||'',q:$('sw424CertQ')?.value||''}; }
  async function installCertificates(){
    const pane=$('certificates'); if(!pane) return;
    const installToken=++certInstallToken;
    pane.innerHTML=`<div class="registerFilterPanel"><div class="registerFilterHeader"><h3>Filter Certificates</h3></div><div class="registerFilterGrid"><label>Equipment Type<select id="sw424CertType"><option value="">All types</option></select></label><label>Status<select id="sw424CertStatus"><option value="">All statuses</option></select></label><label>Inspection Result<select id="sw424CertResult"><option value="">All results</option><option value="Pass">Completed OK</option><option value="Fail - Repair Required">Issue - repair required</option><option value="Fail - Remove From Service / Disposal">Remove from service</option></select></label><label>Due Status<select id="sw424CertDue"><option value="">All due states</option><option value="due">Due / overdue</option><option value="ok">Not due</option><option value="no_inspection">No inspection history</option></select></label><label>Keyword Search<input id="sw424CertQ" type="search" placeholder="Serial, type, manufacturer, model"></label></div><div class="registerFilterActions"><button type="button" id="sw424CertClear">Clear filters</button></div><div id="sw424CertCount" class="muted registerFilterCount"></div></div><div id="sw424CertList" class="sw424-cert-list"><p class="muted">Loading all certificate items...</p></div><div id="sw424CertSelected" class="sw424-selected">No items selected.</div><div class="sw424-filter" style="background:#fff;border-color:#e2e8f0"><h3 style="margin-top:0">Photo options</h3><label><input type="checkbox" id="sw424CertEqPhotos" checked style="width:auto"> Include the equipment image on the certificate details page</label><label><input type="checkbox" id="sw424CertInspPhotos" checked style="width:auto"> Include the most recent inspection images on a separate evidence page</label></div><div class="row"><button type="button" class="primary" id="sw424GenSeparate">Generate separate certificates</button><button type="button" class="primary" id="sw424GenCombined">Generate one combined certificate</button></div>`;
    await renderCertList();
    if(installToken!==certInstallToken) return;
    ['sw424CertType','sw424CertStatus','sw424CertResult','sw424CertDue'].forEach(id=>$(id)?.addEventListener('change',renderCertList));
    $('sw424CertQ')?.addEventListener('input',renderCertList);
    $('sw424CertClear')?.addEventListener('click',()=>{ ['sw424CertType','sw424CertStatus','sw424CertResult','sw424CertDue','sw424CertQ'].forEach(id=>{if($(id)) $(id).value='';}); certSel.clear(); renderCertList();});
    $('sw424GenSeparate')?.addEventListener('click',generateSeparate);
    $('sw424GenCombined')?.addEventListener('click',generateCombined);
  }
  async function renderCertList(){
    const list=$('sw424CertList'); if(!list) return;
    const renderToken=++certRenderToken, f=getCertFilter();
    list.innerHTML='<p class="muted">Loading certificate items...</p>';
    const data=await loadHeight();
    if(renderToken!==certRenderToken || list!==$('sw424CertList')) return;
    const active=data.equipment.filter(e=>!isArchived(e));
    const types=[...new Set(active.map(e=>e.type).filter(Boolean))].sort(), statuses=[...new Set(active.map(e=>e.status).filter(Boolean))].sort();
    const typeEl=$('sw424CertType'), statusEl=$('sw424CertStatus'); if(typeEl){ typeEl.innerHTML='<option value="">All types</option>'+types.map(t=>`<option ${f.type===t?'selected':''}>${esc(t)}</option>`).join(''); } if(statusEl){ statusEl.innerHTML='<option value="">All statuses</option>'+statuses.map(s=>`<option ${f.status===s?'selected':''}>${esc(s)}</option>`).join(''); }
    const pairs=active.map(e=>({equipment:e,inspection:latestInspection(e,data.inspections)})).filter(p=>matches(p,f));
    list.innerHTML=pairs.map(p=>{ const e=p.equipment,i=p.inspection; return `<label class="sw424-cert-item"><input type="checkbox" data-id="${esc(e.id)}" ${certSel.has(String(e.id))?'checked':''} ${i?'':'disabled'}><span><strong>${esc(e.serial||'No serial')} · ${esc(e.type||'')}</strong><span class="sw424-muted">${esc(e.manufacturer||e.make||'')} ${esc(e.model||'')} · ${esc(e.status||'')} · Latest: ${i?`${nzDate(i.inspection_date)} ${resultLabel(i.result)}`:'No inspection history'}</span></span></label>`; }).join('') || '<p class="sw424-muted" style="padding:12px">No items match the current filters.</p>';
    list.querySelectorAll('input[type="checkbox"]').forEach(ch=>ch.addEventListener('change',()=>{ if(ch.checked) certSel.add(String(ch.dataset.id)); else certSel.delete(String(ch.dataset.id)); updateCertCount(); }));
    const count=$('sw424CertCount'); if(count) count.textContent=`${pairs.length} item${pairs.length===1?'':'s'} shown; ${pairs.filter(p=>p.inspection).length} with inspection history.`; updateCertCount();
  }
  function updateCertCount(){ const el=$('sw424CertSelected'); if(el) el.textContent = certSel.size ? `${certSel.size} selected.` : 'No items selected.'; }
  function storagePath(row){ return row.storage_path || row.path || row.file_path || row.photo_path || row.url || ''; }
  async function signedUrl(bucket,path){ if(!path) return ''; try{ const r=await client().storage.from(bucket).createSignedUrl(path,3600); return r.error?'':r.data.signedUrl; }catch(e){ return ''; } }
  async function photoImgs(rows,bucket,max=4){ const out=[]; for(const r of rows.slice(0,max)){ const u=await signedUrl(bucket||r.bucket||PHOTO_BUCKET, storagePath(r)); if(u) out.push(`<img src="${esc(u)}">`); } return out.join(''); }
  async function certRecords(ids){ const data=await loadHeight(); const list=data.equipment.filter(e=>ids.has(String(e.id))).map(e=>({equipment:e,inspection:latestInspection(e,data.inspections)})).filter(p=>p.inspection); return {data,list}; }
  function photoRowsForInspection(photos, insp){ const id=String(insp.id||''), ser=norm(insp.serial); return photos.filter(p=>String(p.inspection_id||'')===id || norm(p.serial)===ser); }
  function photoRowsForEquipment(photos,e){ const id=String(e.id||''), ser=norm(e.serial); return photos.filter(p=>String(p.equipment_id||'')===id || norm(p.serial)===ser); }
  function certCss(){ return `@page{size:A4;margin:0}body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;background:#fff}.noPrint{padding:12px}.page{page-break-after:always;padding:14mm;box-sizing:border-box;min-height:100vh}.head{display:flex;justify-content:space-between;gap:18px;border-bottom:4px solid #0f766e;padding-bottom:10px;margin-bottom:12px}.certificate-brand{display:flex;align-items:center;gap:12px}.certificate-logo{display:block;width:70px;height:45px;object-fit:contain}.brand{font-weight:900;color:#0f766e;font-size:18px}.title{font-size:24px;font-weight:900;margin-top:4px}.meta{font-size:12px;color:#475569;text-align:right}.grid{display:grid;grid-template-columns:155px 1fr;gap:0;border:1px solid #dbe7ee;border-bottom:0}.label,.value{padding:6px 8px;border-bottom:1px solid #dbe7ee}.label{background:#f8fafc;font-weight:800}.pill{border-radius:999px;padding:4px 9px;font-weight:800}.ok{background:#dcfce7;color:#166534}.bad{background:#fee2e2;color:#991b1b}.warn{background:#fef3c7;color:#92400e}.item-photo{margin-top:10px;text-align:center;break-inside:avoid}.item-photo h3{font-size:15px;margin:0 0 6px;text-align:left}.item-photo img{display:block;width:100%;height:92mm;object-fit:contain;border:1px solid #dbe7ee;border-radius:8px;background:#f8fafc}.inspection-evidence .explanation{font-size:14px;color:#475569;margin:0 0 12px}.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}.inspection-evidence .photos img{width:100%;height:105mm;object-fit:contain;border:1px solid #dbe7ee;border-radius:8px;background:#f8fafc}.footer{margin-top:10px;font-size:11px;color:#64748b}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #dbe7ee;padding:8px;text-align:left}th{background:#f8fafc}@media print{.noPrint{display:none}.page{page-break-after:always;min-height:297mm}}`; }
  function certificateHeader(title,meta){
    const logo=window.companyLogoMarkup?.('certificate-logo')||'';
    const company=window.adminSettingsSnapshot?.().companyName||'Spray & Wash';
    return `<div class="head"><div class="certificate-brand">${logo}<div><div class="brand">${esc(company)}</div><div class="title">${esc(title)}</div></div></div><div class="meta">${meta||''}</div></div>`;
  }
  async function separateHtmlFor(ids, includeInsp=true, includeEq=true){
    const {data,list}=await certRecords(ids);
    if(!list.length) return '';
    let pages='';
    for(const p of list){
      const e=p.equipment, i=p.inspection;
      const eqImgs=includeEq?await photoImgs(photoRowsForEquipment(data.equipmentPhotos,e), 'equipment-photos', 1):'';
      const inspImgs=includeInsp?await photoImgs(photoRowsForInspection(data.inspectionPhotos,i), 'inspection-photos', 4):'';
      pages+=`<section class="page">${certificateHeader('Height Equipment Inspection Certificate',`Generated ${new Date().toLocaleDateString('en-NZ')}`)}<div class="grid"><div class="label">Serial</div><div class="value">${esc(e.serial||'—')}</div><div class="label">Type</div><div class="value">${esc(e.type||'—')}</div><div class="label">Manufacturer / model</div><div class="value">${esc(e.manufacturer||e.make||'')} ${esc(e.model||'')}</div><div class="label">Status</div><div class="value">${esc(e.status||'—')}</div><div class="label">Inspection date</div><div class="value">${nzDate(i.inspection_date)}</div><div class="label">Inspector</div><div class="value">${esc(i.inspector||'—')}</div><div class="label">Result</div><div class="value"><span class="pill ${resultClass(i.result)}">${esc(resultLabel(i.result))}</span></div><div class="label">Comments</div><div class="value">${esc(i.notes||i.defects||'—')}</div></div>${eqImgs?`<div class="item-photo"><h3>Equipment image</h3>${eqImgs}</div>`:''}<div class="footer">This certificate summarises the latest recorded inspection for this item.</div></section>`;
      if(inspImgs) pages+=`<section class="page inspection-evidence">${certificateHeader('Most Recent Inspection Images',esc(e.serial||''))}<p class="explanation">These images were recorded during the most recent inspection on ${nzDate(i.inspection_date)}${i.inspector?` by ${esc(i.inspector)}`:''}.</p><div class="photos">${inspImgs}</div></section>`;
    }
    return `<!doctype html><html><head><meta charset="utf-8"><title>Height Equipment Certificates</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div>${pages}</body></html>`;
  }
  async function separateHtml(){ return separateHtmlFor(certSel,$('sw424CertInspPhotos')?.checked!==false,$('sw424CertEqPhotos')?.checked!==false); }
  async function generateSeparate(){ if(!certSel.size) return alert('Select at least one item with inspection history.'); const html=await separateHtml(); if(!html) return alert('The selected item does not have inspection history.'); openDoc(html,'height-equipment-certificates.html'); }
  async function printEquipmentCertificate(id){ const html=await separateHtmlFor(new Set([String(id)]),true,true); if(!html) return alert('This item does not have inspection history.'); openDoc(html,'equipment-certificate.html'); }
  async function generateCombined(){ const {list}=await certRecords(certSel); if(!list.length) return alert('Select at least one item with inspection history.'); const rows=list.map(p=>`<tr><td>${esc(p.equipment.serial||'')}</td><td>${esc(p.equipment.type||'')}</td><td>${esc(p.equipment.manufacturer||p.equipment.make||'')} ${esc(p.equipment.model||'')}</td><td>${nzDate(p.inspection.inspection_date)}</td><td><span class="pill ${resultClass(p.inspection.result)}">${esc(resultLabel(p.inspection.result))}</span></td><td>${esc(p.inspection.inspector||'')}</td></tr>`).join(''); const html=`<!doctype html><html><head><meta charset="utf-8"><title>Combined Height Equipment Certificate</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page">${certificateHeader('Combined Height Equipment Inspection Certificate',`Generated ${new Date().toLocaleDateString('en-NZ')}`)}<table><thead><tr><th>Serial</th><th>Type</th><th>Manufacturer / model</th><th>Inspection date</th><th>Result</th><th>Inspector</th></tr></thead><tbody>${rows}</tbody></table></section></body></html>`; openDoc(html,'combined-height-equipment-certificate.html'); }
  function openDoc(html,name){ const w=window.open('', '_blank'); if(w){ w.document.open(); w.document.write(html); w.document.close(); } else { const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); } }

  async function loadQualifications(){ const sb=client(); if(!sb) return []; const r=await sb.from('height_inspector_qualifications').select('*').order('inspector_name',{ascending:true}); if(r.error) throw r.error; return r.data||[]; }
  async function fileUrlFromQual(q){ if(!q?.storage_path) return {url:'', type:'', note:'No file attached'}; try{ const dl=await client().storage.from(PHOTO_BUCKET).download(q.storage_path); if(dl.error) throw dl.error; const blob=dl.data; const url=URL.createObjectURL(blob); return {url,type:blob.type||q.file_name||'',note:q.file_name||q.storage_path,object:true}; }catch(e){ try{ const u=await signedUrl(PHOTO_BUCKET,q.storage_path); return {url:u,type:q.file_name||'',note:u?'Signed file link':'Could not open file'}; }catch(_){return {url:'',type:'',note:'Could not open file: '+(e.message||e)}} } }
  async function openQualFile(id){ const rows=await loadQualifications(); const q=rows.find(r=>String(r.id)===String(id)); if(!q) return alert('Qualification record not found.'); const f=await fileUrlFromQual(q); if(!f.url) return alert(f.note); const w=window.open(f.url,'_blank'); if(!w){ const a=document.createElement('a'); a.href=f.url; a.download=q.file_name||'qualification-file'; a.click(); } if(f.object) setTimeout(()=>URL.revokeObjectURL(f.url),60000); }
  async function printQual(id){ const rows=await loadQualifications(); const q=rows.find(r=>String(r.id)===String(id)); if(!q) return alert('Qualification record not found.'); const f=await fileUrlFromQual(q); let evidence=''; if(f.url){ if(String(f.type).toLowerCase().includes('pdf')) evidence=`<iframe src="${esc(f.url)}" style="width:100%;height:720px;border:1px solid #dbe7ee;border-radius:12px"></iframe><p><a href="${esc(f.url)}" target="_blank">Open uploaded qualification evidence</a></p>`; else evidence=`<img src="${esc(f.url)}" style="max-width:100%;max-height:720px;border:1px solid #dbe7ee;border-radius:12px" alt="Qualification evidence">`; } const html=`<!doctype html><html><head><meta charset="utf-8"><title>Inspector Qualification Details</title><style>${certCss()}</style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Inspector Qualification Details</div></div><div class="meta">Generated ${new Date().toLocaleDateString('en-NZ')}</div></div><div class="grid"><div class="label">Inspector</div><div class="value">${esc(q.inspector_name||'—')}</div><div class="label">Email</div><div class="value">${esc(q.email||'—')}</div><div class="label">Qualification</div><div class="value">${esc(q.qualification_type||'—')}</div><div class="label">Provider</div><div class="value">${esc(q.provider||'—')}</div><div class="label">Reference</div><div class="value">${esc(q.reference_number||'—')}</div><div class="label">Issue date</div><div class="value">${nzDate(q.issue_date)}</div><div class="label">Expiry date</div><div class="value">${nzDate(q.expiry_date)}</div><div class="label">Saved file</div><div class="value">${esc(f.note)}</div><div class="label">Notes</div><div class="value">${esc(q.notes||'—')}</div></div></section>${evidence?`<section class="page"><div class="head"><div><div class="brand">Spray &amp; Wash Operations</div><div class="title">Uploaded Qualification Evidence</div></div></div>${evidence}</section>`:''}</body></html>`; openDoc(html,'inspector-qualification-details.html'); setTimeout(()=>{ if(f.object) URL.revokeObjectURL(f.url); },60000); }

  async function downloadCsv(table, filename){ const sb=client(); if(!sb) return alert('Supabase not available.'); const r=await sb.from(table).select('*'); if(r.error) return alert(r.error.message); const rows=r.data||[]; const cols=[...new Set(rows.flatMap(x=>Object.keys(x)))]; const csv=[cols.join(',')].concat(rows.map(row=>cols.map(c=>`"${String(row[c]??'').replace(/"/g,'""')}"`).join(','))).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
  function install(){
    installCss(); setVersion();
    if($('dashboard')) installRecent();
    /* equipment register is owned by app.js */
    if($('certificates') && !$('certificates').classList.contains('hidden')) installCertificates();
    const old=window.SWOperationsV4 || {};
    window.SWOperationsV4 = Object.assign(old,{ renderRecentHistoryV424:renderRecent, renderEquipmentRegisterV424:renderEquipmentList, installCertificatesV424:installCertificates, openQualificationFileV424:openQualFile, printQualificationDetailsV424:printQual, downloadTableCsvV424:downloadCsv, generateSeparateCertificates:generateSeparate, generateCombinedCertificates:generateCombined, printEquipmentCertificateV433:printEquipmentCertificate });
    window.generateCertificates = generateSeparate;
    /* app.js owns window.renderEquipment */
    window.openAdminModule = (function(orig){ return function(view){ return orig ? orig(view || 'admin-users') : null; }; })(window.openAdminModule);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  document.addEventListener('change',e=>{ if(e.target?.id==='heightRecentLimitLegacy'){ e.stopImmediatePropagation(); renderRecent(); } }, true);
})();

/* V4.0.30 - Recent Inspection History is owned by app.js.
 * Legacy operations patches intentionally target *Legacy element ids and do not
 * bind to #heightRecentLimit or #dashRecent.
 */
(() => {
  const existing = window.SWOperationsV4 || {};
  window.SWOperationsV4 = Object.assign(existing, {
    recentInspectionRendererOwner: 'app.js',
    version: '4.0.63'
  });
})();


/* V4.0.30 - Equipment filter is owned exclusively by app.js. */
(() => {
  const VERSION='4.0.63';
  function cleanLegacyEquipmentFilters(){
    const pane=document.getElementById('equipment');
    if(!pane)return;
    pane.querySelectorAll('#heightEquipmentFilterPanel,#eqFilterPanel,#sw422EqFilter,#sw424EqFilter,.sw417-filter-panel,.sw422-filter,.sw424-filter').forEach(el=>{
      if(el.id!=='equipmentFilterCore') el.remove();
    });
    if(window.renderEquipmentCore) window.renderEquipment=window.renderEquipmentCore;
  }
  function install(){
    const style=document.createElement('style');
    style.id='sw427EquipmentOwnerStyle';
    style.textContent='#equipment #heightEquipmentFilterPanel,#equipment #eqFilterPanel,#equipment #sw422EqFilter,#equipment #sw424EqFilter,#equipment .sw417-filter-panel,#equipment .sw422-filter,#equipment .sw424-filter{display:none!important}';
    if(!document.getElementById(style.id)) document.head.appendChild(style);
    cleanLegacyEquipmentFilters();
    const pane=document.getElementById('equipment');
    if(pane && !pane.__sw427Observer){
      const observer=new MutationObserver(cleanLegacyEquipmentFilters);
      observer.observe(pane,{childList:true,subtree:false});
      pane.__sw427Observer=observer;
    }
    const t=document.querySelector('.tagline'); if(t)t.textContent='Version 4.0.63 • Height Safety • Vehicle Checks • Equipment • Maintenance';
    window.SW_OPERATIONS_BUILD=VERSION;
    window.SWOperationsV4=Object.assign(window.SWOperationsV4||{},{version:VERSION,equipmentRendererOwner:'app.js'});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,1500)); else setTimeout(install,1500);
  document.addEventListener('click',e=>{ if(e.target?.closest?.('[data-tab="equipment"]')) setTimeout(()=>{cleanLegacyEquipmentFilters();window.renderEquipmentCore?.();},50); },true);
})();


/* V4.0.30 - Certificate outer-wrapper layout cleanup.
 * CSS only: retains Search Filters, item list and Photo Options, while removing
 * the redundant large white parent panel regardless of which legacy renderer ran.
 */
(() => {
  const VERSION='4.0.63';
  function installCertificateLayoutCss(){
    let style=document.getElementById('sw-v428-cert-layout-css');
    if(!style){
      style=document.createElement('style');
      style.id='sw-v428-cert-layout-css';
      style.textContent=`
        #certificates > .card.sw421-cert-card,
        #certificates > .card,
        #certificates > .sw424-cert,
        #certificates .certificateControls{
          background:transparent!important;
          border:0!important;
          box-shadow:none!important;
          padding:0!important;
          margin:0!important;
        }
      `;
      document.head.appendChild(style);
    }
    document.documentElement.dataset.swVersion=VERSION;
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installCertificateLayoutCss,{once:true});
  else installCertificateLayoutCss();
  const existing=window.SWOperationsV4||{};
  window.SWOperationsV4=Object.assign(existing,{version:VERSION,installCertificateLayoutCssV428:installCertificateLayoutCss});
})();

/* V4.0.30 - verified inspector qualification uploads and replacement.
 * This is the single final owner of the Qualifications UI and file actions.
 */
(() => {
  'use strict';
  const VERSION = '4.0.63';
  const BUCKET = 'inspection-photos';
  const $ = id => document.getElementById(id);
  const api = () => window.SWOperationsV4 || {};
  const state = () => api().state || {};
  const client = () => state().sb || window.supabaseClient || window.sbClient || null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const titleCase = value => String(value || '').trim().toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  const nzDate = value => {
    if (!value) return '—';
    const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? esc(value) : date.toLocaleDateString('en-NZ');
  };
  const safeName = value => String(value || 'qualification-file').replace(/[^a-zA-Z0-9._-]/g, '_');

  function bytesMatch(bytes, pattern, offset = 0) {
    return pattern.every((value, index) => bytes[offset + index] === value);
  }

  async function identifyAndVerifyBlob(blob, filename = '') {
    if (!(blob instanceof Blob)) throw new Error('The selected file could not be read.');
    if (!Number.isFinite(blob.size) || blob.size <= 0) throw new Error('The selected file is empty (0 bytes). Choose the original file again.');
    if (blob.size > 20 * 1024 * 1024) throw new Error('The qualification file is larger than 20 MB.');

    const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    let mime = '';
    if (bytesMatch(header, [0xFF, 0xD8, 0xFF])) mime = 'image/jpeg';
    else if (bytesMatch(header, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) mime = 'image/png';
    else if (bytesMatch(header, [0x25, 0x50, 0x44, 0x46, 0x2D])) mime = 'application/pdf';
    else if (bytesMatch(header, [0x52, 0x49, 0x46, 0x46]) && bytesMatch(header, [0x57, 0x45, 0x42, 0x50], 8)) mime = 'image/webp';

    if (!mime) {
      const declared = String(blob.type || '').toLowerCase();
      if (['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(declared)) mime = declared;
    }
    if (!mime) throw new Error('Unsupported or unreadable file. Use JPG, PNG, WEBP or PDF.');

    if (mime.startsWith('image/')) {
      try {
        if ('createImageBitmap' in window) {
          const bitmap = await createImageBitmap(blob);
          if (!bitmap.width || !bitmap.height) throw new Error('Image has no dimensions.');
          bitmap.close();
        } else {
          await new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => { URL.revokeObjectURL(url); image.naturalWidth && image.naturalHeight ? resolve() : reject(new Error('Image has no dimensions.')); };
            image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The image cannot be decoded.')); };
            image.src = url;
          });
        }
      } catch (error) {
        throw new Error(`The image cannot be decoded: ${error.message || error}`);
      }
    }
    return { mime, size: blob.size, filename };
  }

  async function uploadAndVerify(file) {
    const sb = client();
    if (!sb) throw new Error('Supabase is not ready.');
    const local = await identifyAndVerifyBlob(file, file.name);
    const path = `height-inspector-qualifications/${Date.now()}-${safeName(file.name)}`;
    const upload = await sb.storage.from(BUCKET).upload(path, file, {
      upsert: false,
      cacheControl: '3600',
      contentType: local.mime
    });
    if (upload.error) throw upload.error;

    try {
      const downloaded = await sb.storage.from(BUCKET).download(path);
      if (downloaded.error) throw downloaded.error;
      const remote = await identifyAndVerifyBlob(downloaded.data, file.name);
      if (remote.size !== local.size) throw new Error(`Uploaded size mismatch (${local.size} bytes selected, ${remote.size} bytes stored).`);
      return { path, fileName: file.name, mime: remote.mime, size: remote.size };
    } catch (error) {
      await sb.storage.from(BUCKET).remove([path]);
      throw new Error(`Upload verification failed: ${error.message || error}`);
    }
  }

  async function refreshQualifications() {
    const sb = client();
    if (!sb) return [];
    const result = await sb.from('height_inspector_qualifications').select('*').order('inspector_name', { ascending: true });
    if (result.error) throw result.error;
    const rows = result.data || [];
    if (api().state) api().state.qualifications = rows;
    return rows;
  }

  async function verifiedQualificationBlob(record) {
    if (!record?.storage_path) throw new Error('No qualification file is attached.');
    const sb = client();
    if (!sb) throw new Error('Supabase is not ready.');
    const downloaded = await sb.storage.from(BUCKET).download(record.storage_path);
    if (downloaded.error) throw downloaded.error;
    const verified = await identifyAndVerifyBlob(downloaded.data, record.file_name || record.storage_path);
    return { blob: downloaded.data, ...verified };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not read the saved file.'));
      reader.readAsDataURL(blob);
    });
  }

  function qualificationFormHtml() {
    return `<form id="heightQualForm" class="ops-form">
      <label>Inspector name *<input id="heightQualName" required placeholder="e.g. Brendan Harris"></label>
      <label>Email<input id="heightQualEmail" type="email" placeholder="name@example.com"></label>
      <label>Qualification type *<input id="heightQualType" required placeholder="e.g. Height Safety Inspector"></label>
      <label>Provider<input id="heightQualProvider" placeholder="Training provider"></label>
      <label>Reference / certificate number<input id="heightQualRef"></label>
      <label>Issue date<input id="heightQualIssue" type="date"></label>
      <label>Expiry date<input id="heightQualExpiry" type="date"></label>
      <label>PDF / scan / photo<input id="heightQualFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></label>
      <label class="ops-span-2">Notes<textarea id="heightQualNotes"></textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save qualification</button></div>
    </form>`;
  }

  function renderQualifications(rows = state().qualifications || []) {
    const pane = $('heightQualifications');
    if (!pane) return;
    const active = rows.filter(row => row.active !== false);
    pane.innerHTML = `<div class="sw429-qualifications">
      <details>
        <summary>Saved Inspectors</summary>
        <div class="sw429-qual-body">${active.length ? `<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>Inspector</th><th>Qualification</th><th>Provider</th><th>Reference</th><th>Expiry</th><th>File status</th><th>Actions</th></tr></thead><tbody>${active.map(row => `<tr>
          <td>${esc(titleCase(row.inspector_name))}<br><span class="ops-subtle">${esc(row.email || '')}</span></td>
          <td>${esc(row.qualification_type || '—')}</td>
          <td>${esc(row.provider || '—')}</td>
          <td>${esc(row.reference_number || '—')}</td>
          <td>${nzDate(row.expiry_date)}</td>
          <td>${row.storage_path ? esc(row.file_name || 'File attached') : 'No file attached'}</td>
          <td><div class="sw429-actions">
            ${row.storage_path ? `<button type="button" class="ops-btn ghost" data-sw429-open="${esc(row.id)}">Open File</button>` : ''}
            <button type="button" class="ops-btn" data-sw429-replace="${esc(row.id)}">Replace Qualification File</button>
            <button type="button" class="ops-btn primary" data-sw429-print="${esc(row.id)}">Print Qualification Details</button>
          </div></td>
        </tr>`).join('')}</tbody></table></div>` : '<p class="muted">No inspectors saved yet.</p>'}</div>
      </details>
      <details>
        <summary>Add Inspector</summary>
        <div class="sw429-qual-body">${qualificationFormHtml()}</div>
      </details>
    </div>`;
    removeDuplicateInspectorPanels();
  }

  function removeDuplicateInspectorPanels() {
    $('qualificationCertPanel')?.remove();
    const cert = $('certificates');
    if (cert) {
      cert.querySelectorAll('.card,.ops-card,details,section').forEach(node => {
        const heading = node.querySelector(':scope > h2,:scope > h3,:scope > summary');
        if (heading && /^Add Inspector$/i.test((heading.textContent || '').trim())) node.remove();
      });
    }
  }

  async function refreshAndRenderQualifications() {
    renderQualifications(state().qualifications || []);
    try {
      const rows = await refreshQualifications();
      renderQualifications(rows);
    } catch (error) {
      console.warn('Could not refresh qualifications:', error);
    }
  }

  async function saveQualification(event) {
    event?.preventDefault?.();
    const sb = client();
    if (!sb) return alert('Supabase is not ready.');
    const file = $('heightQualFile')?.files?.[0] || null;
    let uploaded = null;
    try {
      if (file) uploaded = await uploadAndVerify(file);
      const row = {
        inspector_name: titleCase($('heightQualName')?.value),
        email: String($('heightQualEmail')?.value || '').trim().toLowerCase() || null,
        qualification_type: String($('heightQualType')?.value || '').trim(),
        provider: String($('heightQualProvider')?.value || '').trim() || null,
        reference_number: String($('heightQualRef')?.value || '').trim() || null,
        issue_date: $('heightQualIssue')?.value || null,
        expiry_date: $('heightQualExpiry')?.value || null,
        storage_path: uploaded?.path || null,
        file_name: uploaded?.fileName || null,
        notes: String($('heightQualNotes')?.value || '').trim() || null,
        created_by: state().user?.id || null
      };
      if (!row.inspector_name || !row.qualification_type) throw new Error('Inspector name and qualification type are required.');
      const inserted = await sb.from('height_inspector_qualifications').insert(row);
      if (inserted.error) throw inserted.error;
      const rows = await refreshQualifications();
      renderQualifications(rows);
      alert(uploaded ? `Inspector qualification saved and verified (${uploaded.size.toLocaleString()} bytes).` : 'Inspector qualification saved.');
    } catch (error) {
      if (uploaded?.path) await sb.storage.from(BUCKET).remove([uploaded.path]);
      alert(`Qualification was not saved: ${error.message || error}`);
    }
  }

  async function replaceQualificationFile(id, file) {
    const sb = client();
    if (!sb) return alert('Supabase is not ready.');
    const currentRows = state().qualifications || await refreshQualifications();
    const current = currentRows.find(row => String(row.id) === String(id));
    if (!current) return alert('Qualification record not found.');
    let uploaded = null;
    try {
      uploaded = await uploadAndVerify(file);
      const updated = await sb.from('height_inspector_qualifications').update({
        storage_path: uploaded.path,
        file_name: uploaded.fileName
      }).eq('id', id);
      if (updated.error) throw updated.error;
      if (current.storage_path && current.storage_path !== uploaded.path) {
        const removed = await sb.storage.from(BUCKET).remove([current.storage_path]);
        if (removed.error) console.warn('Old qualification object could not be removed:', removed.error.message);
      }
      const rows = await refreshQualifications();
      renderQualifications(rows);
      alert(`Qualification file replaced and verified (${uploaded.size.toLocaleString()} bytes).`);
    } catch (error) {
      if (uploaded?.path) await sb.storage.from(BUCKET).remove([uploaded.path]);
      alert(`Qualification file was not replaced: ${error.message || error}`);
    }
  }

  async function openQualificationFile(id) {
    try {
      const rows = state().qualifications || await refreshQualifications();
      const record = rows.find(row => String(row.id) === String(id));
      if (!record) throw new Error('Qualification record not found.');
      const verified = await verifiedQualificationBlob(record);
      const url = URL.createObjectURL(verified.blob);
      const popup = window.open(url, '_blank');
      if (!popup) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = record.file_name || 'qualification-file';
        anchor.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (error) {
      alert(`Could not open the qualification file: ${error.message || error}. Use Replace Qualification File to repair this record.`);
    }
  }

  async function printQualificationDetails(id) {
    try {
      const rows = state().qualifications || await refreshQualifications();
      const record = rows.find(row => String(row.id) === String(id));
      if (!record) throw new Error('Qualification record not found.');
      let evidence = '<p>No qualification file is attached.</p>';
      if (record.storage_path) {
        const verified = await verifiedQualificationBlob(record);
        const dataUrl = await blobToDataUrl(verified.blob);
        evidence = verified.mime.startsWith('image/')
          ? `<img class="qualification-evidence" src="${esc(dataUrl)}" alt="Qualification evidence">`
          : `<object class="qualification-evidence qualification-pdf" data="${esc(dataUrl)}" type="application/pdf"><p>The PDF preview is unavailable. Use Open File from the saved inspector record.</p></object>`;
      }
      const logo = window.companyLogoMarkup?.('certificate-logo') || '';
      const company = window.adminSettingsSnapshot?.().companyName || 'Spray & Wash';
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Inspector Qualification Details</title><style>
        @page{size:A4;margin:10mm}body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;background:#fff}.noPrint{padding:12px;background:#0f766e;text-align:center}.noPrint button{background:#fff;color:#0f766e;border:0;border-radius:10px;padding:9px 14px;font-weight:800}.page{padding:10mm;box-sizing:border-box}.head{display:flex;justify-content:space-between;gap:18px;border-bottom:4px solid #0f766e;padding-bottom:8px;margin-bottom:10px}.certificate-brand{display:flex;align-items:center;gap:11px}.certificate-logo{display:block;width:66px;height:42px;object-fit:contain}.brand{font-weight:900;color:#0f766e;font-size:17px}.title{font-size:22px;font-weight:900;margin-top:3px}.grid{display:grid;grid-template-columns:145px 1fr;border:1px solid #dbe7ee;border-bottom:0}.label,.value{padding:5px 7px;border-bottom:1px solid #dbe7ee;font-size:12px;line-height:1.25;overflow-wrap:anywhere}.label{background:#f8fafc;font-weight:800}.evidence-block{margin-top:9px;text-align:center;break-inside:avoid}.evidence-block h2{font-size:15px;text-align:left;margin:0 0 6px}.qualification-evidence{display:block;width:100%;max-width:100%;height:128mm;object-fit:contain;margin:0 auto;border:1px solid #dbe7ee;border-radius:10px;background:#f8fafc;box-sizing:border-box}.qualification-pdf{height:128mm}@media print{.noPrint{display:none}.page{padding:0}.evidence-block{break-inside:avoid}}
      </style></head><body><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><section class="page"><div class="head"><div class="certificate-brand">${logo}<div><div class="brand">${esc(company)}</div><div class="title">Inspector Qualification Details</div></div></div><div>${new Date().toLocaleDateString('en-NZ')}</div></div><div class="grid"><div class="label">Inspector</div><div class="value">${esc(titleCase(record.inspector_name))}</div><div class="label">Email</div><div class="value">${esc(record.email || '—')}</div><div class="label">Qualification</div><div class="value">${esc(record.qualification_type || '—')}</div><div class="label">Provider</div><div class="value">${esc(record.provider || '—')}</div><div class="label">Reference</div><div class="value">${esc(record.reference_number || '—')}</div><div class="label">Issue date</div><div class="value">${nzDate(record.issue_date)}</div><div class="label">Expiry date</div><div class="value">${nzDate(record.expiry_date)}</div><div class="label">File</div><div class="value">${esc(record.file_name || '—')}</div><div class="label">Notes</div><div class="value">${esc(record.notes || '—')}</div></div><div class="evidence-block"><h2>Uploaded Qualification Evidence</h2>${evidence}</div></section></body></html>`;
      const popup = window.open('', '_blank');
      if (popup) { popup.document.open(); popup.document.write(html); popup.document.close(); }
      else {
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        anchor.download = 'inspector-qualification-details.html';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
      }
    } catch (error) {
      alert(`Could not generate qualification details: ${error.message || error}. Use Replace Qualification File to repair this record.`);
    }
  }

  function chooseReplacementFile(id) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/jpeg,image/png,image/webp';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) replaceQualificationFile(id, file);
    }, { once: true });
    input.click();
  }

  function install() {
    const tagline = document.querySelector('.tagline');
    if (tagline) tagline.textContent = 'Version 4.0.63 • Height Safety • Vehicle Checks • Equipment • Maintenance';
    removeDuplicateInspectorPanels();
    if ($('heightQualifications') && !$('heightQualifications').classList.contains('hidden')) refreshAndRenderQualifications();
    window.SW_OPERATIONS_BUILD = VERSION;
    window.SWOperationsV4 = Object.assign(api(), {
      version: VERSION,
      saveHeightQualification: saveQualification,
      openQualificationFile,
      replaceQualificationFile,
      printQualificationDetailsV429: printQualificationDetails,
      generateQualificationCertificate: printQualificationDetails,
      renderHeightQualificationsV431: refreshAndRenderQualifications
    });
  }

  document.addEventListener('submit', event => {
    if (event.target?.id !== 'heightQualForm') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    saveQualification(event);
  }, true);

  document.addEventListener('click', event => {
    const open = event.target.closest('[data-sw429-open]');
    if (open) { event.preventDefault(); event.stopImmediatePropagation(); openQualificationFile(open.dataset.sw429Open); return; }
    const replace = event.target.closest('[data-sw429-replace]');
    if (replace) { event.preventDefault(); event.stopImmediatePropagation(); chooseReplacementFile(replace.dataset.sw429Replace); return; }
    const print = event.target.closest('[data-sw429-print]');
    if (print) { event.preventDefault(); event.stopImmediatePropagation(); printQualificationDetails(print.dataset.sw429Print); return; }
    if (event.target.closest('[data-tab="certificates"],#certificateTabButton')) {
      removeDuplicateInspectorPanels();
    }
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

/* Spray & Wash Operations App V4.0.11
   Additive module for height-safety-adjacent operations workflows: periodic vehicle checks,
   operations management, inspections, maintenance tasks, preventive schedules, and guides.
   Load after config.js, Supabase JS, and app.js. Do not replace config.js.
*/
(function(){
  'use strict';

  const VERSION = '4.0.11';
  const PHOTO_BUCKET = 'inspection-photos';
  const TASK_STATUSES = ['Open','In Progress','Waiting on Parts','Waiting on Someone','Completed','Deferred'];
  const PRIORITIES = ['Low','Medium','High','Critical'];
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
    pendingUsers: [],
    actualUsers: [],
    actualUserRoles: [],
    qualifications: [],
    assetFilterClass: '',
    assetFilterStatus: '',
    assetFilterDue: '',
    assetFilterTasks: '',
    currentView: 'vehicle-checks',
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
  function canUseManagement(){ return hasAny(['Equipment Manager','Office / Reports','Viewer']); }
  function canUseHeight(){ return hasAny(['Inspector','Equipment Manager','Office / Reports','Viewer','Certificate Approver']); }
  function canUseVehicleChecks(){ return hasAny(['Inspector','Equipment Manager']); }
  function isManagementView(view){ return ['management-dashboard','assets','history','tasks','schedules','guides'].includes(view) || ['vehicles','washing','maintenance'].includes(view); }
  function isAdminView(view){ return ['admin-dashboard','admin-users','admin-settings'].includes(view); }
  function displayStatusLabel(value){
    const v = String(value || '—');
    if(v === 'Pass') return 'Completed OK';
    if(v === 'Fail' || v === 'Problem') return 'Issue to report';
    return v;
  }
  function itemAllowsPhoto(item){
    const q = String(item?.question_text || '');
    return /Vehicle exterior washed/i.test(q);
  }

  function titleCaseName(value){
    return String(value || '').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  function inspectorDisplayName(){
    const p = state.profile || {};
    const name = p.display_name || p.full_name || p.name || '';
    if(name) return titleCaseName(name);
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
      .ops-user-row{border:1px solid #dbe3ec;border-radius:1rem;background:#fff;padding:.9rem;margin:.75rem 0}
      .ops-user-row-head{display:flex;justify-content:space-between;gap:.75rem;flex-wrap:wrap;align-items:flex-start}
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
      .ops-cert-generate-step { margin-top:1rem; }
      .ops-cert-generate-step button { width:100%; }
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
    window.openLegacyAdminTools = openLegacyAdminTools;
    window.openLegacyUserTools = openLegacyUserTools;
    window.openHeightQualifications = openHeightQualifications;
    setupLogoHomeClick();
    if(originalShowTab){
      window.showTab = function(id){
        if(id === 'users' || id === 'admin'){
          if(isAdmin()) return openAdminModule(id === 'users' ? 'admin-users' : 'admin-settings');
          return alert('Admin access is required.');
        }
        state.currentModule = 'height';
        originalShowTab(id);
        setTopTabsMode('height');
        hideLegacyUserAdminControls();
        refreshTopUserSummary();
        if(id === 'certificates') setTimeout(()=>{ enhanceCertificateSelector(); enhanceQualificationCertificatePanel(); installCertificateV405Patch(); }, 80);
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
    let btn = byId('moduleHomeTabButton');
    if(!btn){
      btn = document.createElement('button');
      btn.id = 'moduleHomeTabButton';
      btn.type = 'button';
      btn.className = 'tab ops-home-tab';
      btn.textContent = '← Home';
      btn.addEventListener('click', showModuleHome);
      tabs.insertBefore(btn, tabs.firstChild);
    }
    btn.style.display = '';
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
    pane.innerHTML = heightQualificationsHtml();
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    byId('heightQualTabButton')?.classList.add('active');
    byId('heightQualForm')?.addEventListener('submit', saveHeightQualification);
    setTimeout(() => window.scrollTo({top:0, behavior:'smooth'}), 10);
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
    if(!section || byId('qualificationCertPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'qualificationCertPanel';
    panel.className = 'card';
    panel.innerHTML = qualificationCertificatePanelHtml();
    if(history) section.insertBefore(panel, history);
    else section.appendChild(panel);
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

  function enhanceLegacyUserUI(){
    const users = byId('users');
    if(!users) return;
    if(!byId('opsLegacyUserNote')){
      const firstCard = users.querySelector('.card');
      const note = document.createElement('div');
      note.id = 'opsLegacyUserNote';
      note.className = 'permissionNote';
      note.innerHTML = `<b>Tip:</b> Users and permissions now sit in the <b>Admin</b> module. The role checkbox grid below remains available for advanced/manual changes.`;
      if(firstCard) firstCard.insertBefore(note, firstCard.children[1] || null);
    }
    users.querySelectorAll('.userCard .roleGrid').forEach((grid, idx) => {
      if(grid.closest('details.ops-legacy-roles')) return;
      const details = document.createElement('details');
      details.className = 'ops-legacy-roles';
      const summary = document.createElement('summary');
      summary.innerHTML = '<strong>Advanced role checkboxes</strong>';
      grid.parentNode.insertBefore(details, grid);
      details.appendChild(summary);
      details.appendChild(grid);
    });
  }

  function setTopTabsMode(mode){
    const tabs = document.querySelector('.tabs');
    if(!tabs) return;
    tabs.style.display = (mode === 'height' || mode === 'legacy-admin') ? 'flex' : 'none';
    if(mode === 'height'){
      ensureHeightHomeButton();
      ensureHeightQualificationTab();
      const homeBtn = byId('moduleHomeTabButton');
      if(homeBtn) homeBtn.style.display = '';
      tabs.querySelectorAll('.tab').forEach(btn => {
        if(btn.id === 'moduleHomeTabButton'){ btn.style.display = ''; return; }
        const tab = btn.dataset.tab || '';
        btn.style.display = ['dashboard','equipment','inspect','due','export','certificates','heightQualifications'].includes(tab) ? '' : 'none';
      });
    } else if(mode === 'legacy-admin'){
      ensureHeightHomeButton();
      tabs.querySelectorAll('.tab').forEach(btn => { btn.style.display = btn.id === 'moduleHomeTabButton' ? '' : 'none'; });
    } else {
      const homeBtn = byId('moduleHomeTabButton');
      if(homeBtn) homeBtn.style.display = 'none';
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
    setTimeout(() => window.scrollTo({top:0, behavior:'smooth'}), 10);
  }

  function openHeightModule(){
    hideLegacyUserAdminControls();
    if(!state.user) return alert('Sign in first.');
    if(!canUseHeight()) return alert('Your account does not have Height Safety access.');
    state.currentModule = 'height';
    setTopTabsMode('height');
    if(originalShowTab) originalShowTab('dashboard');
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
    if(!canUseManagement()) return alert('Operations Management requires Admin, Equipment Manager, Office / Reports, or Viewer access.');
    state.currentModule = 'ops-management';
    setTopTabsMode('none');
    showOperations('management-dashboard');
  }

  function openAdminModule(view){
    if(!state.user) return alert('Sign in first.');
    if(!isAdmin()) return alert('Admin access is required.');
    state.currentModule = 'admin';
    setTopTabsMode('none');
    showOperations(view || 'admin-dashboard');
  }

  function openLegacyAdminTools(){
    if(!isAdmin()) return alert('Admin access is required.');
    state.currentModule = 'admin';
    const adminPane = byId('admin');
    if(adminPane){ adminPane.classList.remove('legacyAdminOnly'); adminPane.style.display = ''; }
    if(originalShowTab){ originalShowTab('admin'); if(typeof window.renderAdmin === 'function') window.renderAdmin(); setTopTabsMode('legacy-admin'); }
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
      if(canUseHeight()) cards.push(moduleCard('Height Equipment', 'Height safety register, height-safety equipment, inspections, certificates and reports.', 'openHeightModule()'));
      if(canUseVehicleChecks()) cards.push(moduleCard('Vehicle Checks', 'Complete the staff Vehicle Inspection Checklist only.', 'openVehicleChecksModule()'));
      if(canUseManagement()) cards.push(moduleCard('Ops Management', 'Assets, tasks, preventive maintenance, guides and management reports.', 'openOpsManagementModule()'));
      if(isAdmin()) cards.push(moduleCard('Admin', 'Users, roles, permissions, settings, audit log and backup controls.', 'openAdminModule()'));
      if(!cards.length) cards.push(`<div class="ops-card"><h3>No app access yet</h3><p class="ops-subtle">Your account needs an assigned role before modules will appear.</p></div>`);
    }
    shell.innerHTML = `
      <div class="ops-header">
        <div class="ops-module-title"><h2>Spray &amp; Wash Operations</h2><div class="ops-subtle">Choose the area you need.</div></div>
      </div>
      <div class="ops-branch-grid">${cards.join('')}</div>`;
  }
  function moduleCard(title, body, action){
    const cls = /Height/i.test(title) ? 'ops-home-height' : /Vehicle/i.test(title) ? 'ops-home-vehicle' : /Ops/i.test(title) ? 'ops-home-management' : 'ops-home-admin';
    return `<button type="button" class="ops-branch-card ${cls}" onclick="${action}"><strong>${esc(title)}</strong><span class="ops-subtle">${esc(body)}</span></button>`;
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
    setTimeout(() => window.scrollTo({top:0, behavior:'smooth'}), 10);
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
      if(isAdmin()){
        try { state.pendingUsers = await loadTable('operations_preloaded_users','*',{column:'email'}); }
        catch(e){ console.warn('Preloaded users table unavailable:', e.message); state.pendingUsers = []; }
        try { state.actualUsers = await loadTable('profiles','*'); }
        catch(e){ console.warn('Profiles unavailable:', e.message); state.actualUsers = []; }
        try { state.actualUserRoles = await loadTable('user_roles','*'); }
        catch(e){ console.warn('User roles unavailable:', e.message); state.actualUserRoles = []; }
      } else { state.pendingUsers = []; state.actualUsers = []; state.actualUserRoles = []; }
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
  }

  function headerHtml(){
    const isVehicle = state.currentView === 'vehicle-checks';
    const isAdminModule = isAdminView(state.currentView);
    const managementNav = canUseManagement() && !isVehicle && !isAdminModule ? `
        ${navButton('management-dashboard','Dashboard')}
        ${navButton('assets','Assets')}
        ${navButton('history','Inspection History')}
        ${navButton('tasks','Tasks')}
        ${navButton('schedules','Preventive Maintenance')}
        ${navButton('guides','Guides')}` : '';
    const staffNav = isVehicle ? `${navButton('vehicle-checks','Vehicle Inspection Checklist')}` : (isAdminModule ? '' : managementNav);
    const title = isVehicle ? 'Vehicle Checks' : isAdminModule ? 'Admin' : 'Ops Management';
    const note = isVehicle ? 'Staff vehicle inspection checklist' : isAdminModule ? '' : 'Assets, tasks, schedules and guides';
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
    if(!state.user) return `<div class="ops-card"><h3>Sign in required</h3><p>Use the existing sign-in area first, then open Vehicle Checks or Operations Management.</p></div>`;
    if(!canView()) return `<div class="ops-card"><h3>No Operations access yet</h3><p>Your account needs one of these existing roles: Admin, Inspector, Equipment Manager, Office / Reports, or Viewer.</p></div>`;
    if(state.currentView === 'vehicle-checks') return periodicVehicleChecksHtml();
    if(isAdminView(state.currentView)){
      if(!isAdmin()) return `<div class="ops-card"><h3>Admin access required</h3><p>This module is only available to Admin users.</p></div>`;
      if(state.currentView === 'admin-users') return usersHtml();
      if(state.currentView === 'admin-settings') return adminSettingsHtml();
      return adminDashboardHtml();
    }
    if(isManagementView(state.currentView) && !canUseManagement()) return `<div class="ops-card"><h3>Ops Management access required</h3><p>Use Vehicle Checks for staff vehicle checks. Management views require Admin, Equipment Manager, Office / Reports, or Viewer access.</p></div>`;
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
    const vehicleDue = state.vehicles.filter(v => v.status === 'Active').filter(v => { const d = daysUntil(dueDateFor('vehicle',v)); return d === null || d <= 0; });
    const washDue = state.washEquipment.filter(w => ['Active','Quarantined'].includes(w.status)).filter(w => { const d = daysUntil(dueDateFor('washing_equipment',w)); return d === null || d <= 0; });
    const open = openTasks();
    const waiting = state.tasks.filter(t => t.status === 'Waiting on Parts');
    const scheduledDue = state.schedules.filter(s => s.is_active !== false).filter(s => scheduleIsDue(s));
    return `
      <div class="ops-grid">
        ${statCard('Vehicles due/overdue', vehicleDue.length, 'Fortnightly vehicle checks needing action','ops-stat-amber','assets-due-vehicles')}
        ${statCard('Washing gear due/overdue', washDue.length, 'Water blasters, pumps and gear needing checks','ops-stat-green','assets-due-washing')}
        ${statCard('Open tasks', open.length, 'Reactive, scheduled and manual work items','ops-stat-total','tasks-open')}
        ${statCard('Waiting on parts', waiting.length, 'Tasks blocked by parts or supplies','ops-stat-red','tasks-waiting')}
        ${statCard('Preventive services due', scheduledDue.length, 'Scheduled date-based maintenance','ops-stat-blue','schedules-due')}
      </div>
      <div class="ops-grid" style="margin-top:1rem">
        <div class="ops-card"><h3>Overdue / due inspections</h3>${dueListHtml()}</div>
        <div class="ops-card"><h3>Open tasks</h3>${taskMiniListHtml(open.slice(0,8))}</div>
      </div>`;
  }
  function statCard(title, value, note, variant, shortcut){ const attr = shortcut ? ` role="button" tabindex="0" data-ops-shortcut="${esc(shortcut)}"` : ''; return `<div class="ops-card ops-dashboard-stat ${variant || 'ops-stat-total'}"${attr}><div><div class="ops-subtle">${esc(title)}</div><div class="ops-stat">${esc(value)}</div></div><div class="ops-subtle">${esc(note)}</div></div>`; }
  function dueListHtml(){
    const rows = [];
    state.vehicles.filter(v=>v.status==='Active').forEach(v => rows.push({type:'Vehicle', name:v.rego || v.name, due:dueDateFor('vehicle',v)}));
    state.washEquipment.filter(w=>['Active','Quarantined'].includes(w.status)).forEach(w => rows.push({type:'Washing equipment', name:w.name, due:dueDateFor('washing_equipment',w)}));
    rows.sort((a,b)=> (a.due || '').localeCompare(b.due || '')).splice(10);
    if(!rows.length) return '<p class="ops-subtle">No registered active items yet.</p>';
    return `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Type</th><th>Item</th><th>Due</th><th>Status</th></tr>${rows.map(r=>`<tr><td>${esc(r.type)}</td><td>${esc(r.name || 'Unnamed')}</td><td>${nzDate(r.due)}</td><td>${targetDueStatus(daysUntil(r.due))}</td></tr>`).join('')}</table></div>`;
  }


  function handleDashboardShortcut(shortcut){
    state.currentModule = 'management';
    state.currentView = 'management-dashboard';
    if(shortcut === 'assets-due-vehicles'){
      state.currentView = 'assets';
      state.assetFilterClass = 'Vehicle';
      state.assetFilterDue = 'due';
      state.assetFilterStatus = '';
      state.assetFilterTasks = '';
      state.assetSearch = '';
    } else if(shortcut === 'assets-due-washing'){
      state.currentView = 'assets';
      state.assetFilterClass = '';
      state.assetFilterDue = 'due';
      state.assetFilterStatus = '';
      state.assetFilterTasks = '';
      state.assetSearch = '';
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
    setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}), 10);
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
  function vehicleTableHtml(rows){
    rows = rows || state.vehicles;
    if(!rows.length) return '<p class="ops-subtle">No vehicles added yet.</p>';
    return `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Rego</th><th>Name</th><th>Status</th><th>Last inspection</th><th>Next due</th><th>Actions</th></tr>${rows.map(v=>{ const latest=latestInspectionFor('vehicle',v.id); const due=dueDateFor('vehicle',v); return `<tr><td><strong>${esc(v.rego)}</strong></td><td>${esc(v.name||v.make_model||'')}</td><td>${statusPill(v.status)}</td><td>${latest?nzDate(latest.inspection_date):'—'}</td><td>${nzDate(due)} ${targetDueStatus(daysUntil(due))}</td><td>${canManage()?`<button class="ops-btn ghost" data-ops-edit-vehicle="${v.id}">Edit</button>`:''}</td></tr>`; }).join('')}</table></div>`;
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
      <label class="ops-span-2">Notes<textarea id="opsWashNotes">${esc(w.notes||'')}</textarea></label>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save washing equipment</button><button class="ops-btn ghost" type="button" data-ops-action="clearWash">Clear</button></div>
    </form>`;
  }
  function washingTableHtml(rows){
    rows = rows || state.washEquipment;
    if(!rows.length) return '<p class="ops-subtle">No washing equipment added yet.</p>';
    return `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Name</th><th>Type</th><th>Vehicle</th><th>Status</th><th>Engine / pump</th><th>Next due</th><th>Actions</th></tr>${rows.map(w=>{ const v=state.vehicles.find(x=>x.id===w.assigned_vehicle_id); const due=dueDateFor('washing_equipment',w); return `<tr><td><strong>${esc(w.name)}</strong><br><span class="ops-subtle">${esc(w.serial_number||'')}</span></td><td>${esc(w.equipment_type)}</td><td>${esc(v?.rego || v?.name || '—')}</td><td>${statusPill(w.status)}</td><td>${esc(w.engine_make_model||'—')}<br><span class="ops-subtle">${esc(w.pump_make_model||'—')}</span></td><td>${nzDate(due)} ${targetDueStatus(daysUntil(due))}</td><td>${canManage()?`<button class="ops-btn ghost" data-ops-edit-wash="${w.id}">Edit</button>`:''}</td></tr>`; }).join('')}</table></div>`;
  }


  function uniqueValues(values){ return Array.from(new Set(values.map(v=>String(v||'').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b)); }

  function assetSearchHaystack(kind, item){
    if(kind === 'vehicle') return [item.rego,item.name,item.make_model,item.year,item.status,item.assigned_driver,item.notes,'vehicle'].join(' ').toLowerCase();
    const v = state.vehicles.find(x=>x.id===item.assigned_vehicle_id);
    return [item.name,item.equipment_type,item.serial_number,item.status,item.engine_make_model,item.pump_make_model,item.notes,v?.rego,v?.name,'washing equipment','water blaster'].join(' ').toLowerCase();
  }
  function assetMatches(kind, item){
    const q = String(state.assetSearch || '').trim().toLowerCase();
    if(q && !assetSearchHaystack(kind, item).includes(q)) return false;
    const cls = state.assetFilterClass || '';
    if(cls){
      if(cls === 'Vehicle' && kind !== 'vehicle') return false;
      if(cls !== 'Vehicle' && kind === 'vehicle') return false;
      if(cls !== 'Vehicle' && kind === 'washing' && String(item.equipment_type || '') !== cls) return false;
    }
    const status = state.assetFilterStatus || '';
    if(status && String(item.status || '') !== status) return false;
    const due = state.assetFilterDue || '';
    if(due){
      const d = daysUntil(dueDateFor(kind === 'vehicle' ? 'vehicle' : 'washing_equipment', item));
      if(due === 'overdue' && !(d !== null && d < 0)) return false;
      if(due === 'due' && !(d === null || d <= 0)) return false;
      if(due === 'ok' && !(d !== null && d > 0)) return false;
      if(due === 'no-history' && d !== null) return false;
    }
    const taskFilter = state.assetFilterTasks || '';
    if(taskFilter){
      const itemTasks = openTasks().filter(t => kind === 'vehicle' ? t.vehicle_id === item.id : t.washing_equipment_id === item.id);
      if(taskFilter === 'open' && !itemTasks.length) return false;
      if(taskFilter === 'none' && itemTasks.length) return false;
      if(taskFilter === 'waiting' && !itemTasks.some(t=>t.status === 'Waiting on Parts' || t.status === 'Waiting on Someone')) return false;
    }
    return true;
  }
  function assetsHtml(){
    const assetClasses = ['Vehicle'].concat(uniqueValues(state.washEquipment.map(w=>w.equipment_type || 'Washing Equipment')));
    const statuses = uniqueValues(state.vehicles.map(v=>v.status).concat(state.washEquipment.map(w=>w.status)));
    const vehicleRows = state.vehicles.filter(v => assetMatches('vehicle', v));
    const washRows = state.washEquipment.filter(w => assetMatches('washing', w));
    return `<div class="ops-card">
      <div class="ops-section-title"><div><h3>Assets</h3><p class="ops-subtle">Filter the vehicle and washing equipment registers by asset class, status, due items and open tasks.</p></div></div>
      <div class="ops-filter-grid">
        <label>Asset class<select id="opsAssetFilterClass"><option value="">All asset classes</option>${assetClasses.map(v=>`<option value="${esc(v)}" ${state.assetFilterClass===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>
        <label>Status<select id="opsAssetFilterStatus"><option value="">All statuses</option>${statuses.map(v=>`<option value="${esc(v)}" ${state.assetFilterStatus===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>
        <label>Due status<select id="opsAssetFilterDue"><option value="">All due states</option><option value="due" ${state.assetFilterDue==='due'?'selected':''}>Due / overdue / no history</option><option value="overdue" ${state.assetFilterDue==='overdue'?'selected':''}>Overdue only</option><option value="no-history" ${state.assetFilterDue==='no-history'?'selected':''}>No history</option><option value="ok" ${state.assetFilterDue==='ok'?'selected':''}>Not due</option></select></label>
        <label>Tasks<select id="opsAssetFilterTasks"><option value="">All task states</option><option value="open" ${state.assetFilterTasks==='open'?'selected':''}>Has open tasks</option><option value="waiting" ${state.assetFilterTasks==='waiting'?'selected':''}>Waiting on someone/parts</option><option value="none" ${state.assetFilterTasks==='none'?'selected':''}>No open tasks</option></select></label>
        <label>Keyword<input id="opsAssetSearch" type="search" value="${esc(state.assetSearch||'')}" placeholder="Rego, serial, model, notes"></label>
      </div>
      <div class="ops-actions"><button class="ops-btn ghost" type="button" data-ops-action="clearAssetFilters">Clear filters</button></div>
      <div class="ops-subtle">${vehicleRows.length} vehicle${vehicleRows.length===1?'':'s'} and ${washRows.length} washing equipment item${washRows.length===1?'':'s'} shown.</div>
    </div>
    ${canManage() ? `<div class="ops-grid"><div class="ops-card"><details ${state.editingVehicleId?'open':''}><summary><strong>${state.editingVehicleId ? 'Edit vehicle' : 'Add vehicle'}</strong></summary><div style="margin-top:.8rem">${vehicleFormHtml()}</div></details></div><div class="ops-card"><details ${state.editingWashId?'open':''}><summary><strong>${state.editingWashId ? 'Edit washing equipment' : 'Add washing equipment'}</strong></summary><div style="margin-top:.8rem">${washingFormHtml()}</div></details></div></div>` : '<div class="ops-card"><p class="ops-subtle">Read-only. Ask an Admin or Equipment Manager to edit assets.</p></div>'}
    <div class="ops-card"><h3>Vehicles</h3>${vehicleTableHtml(vehicleRows)}</div>
    <div class="ops-card"><h3>Washing equipment</h3>${washingTableHtml(washRows)}</div>`;
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
      ${['washing_equipment','combined'].includes(type) ? `<label>Washing equipment<select id="opsInspectionWash"><option value="">Select washing equipment</option>${state.washEquipment.filter(w=>['Active','Quarantined'].includes(w.status)).map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>` : ''}
      <label>Odometer / mileage<input id="opsInspectionOdo" type="number" step="0.1"></label>
      <label class="ops-span-2">General notes<textarea id="opsInspectionNotes"></textarea></label>
      <div class="ops-span-2"><h3>Checklist</h3>${checklistQuestionsHtml(template.id)}</div>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Submit vehicle check</button></div>
    </form>`;
  }
  function checklistQuestionsHtml(templateId){
    const items = state.checklistItems.filter(i=>i.template_id===templateId && i.is_active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    if(!items.length) return '<p class="ops-subtle">No checklist questions found. Run the V4 SQL migration or add checklist items in Supabase.</p>';
    const groups = [];
    items.forEach(item => {
      const section = item.section || 'Checklist';
      let g = groups.find(x => x.section === section);
      if(!g){ g = { section, items: [] }; groups.push(g); }
      g.items.push(item);
    });
    return groups.map(g => `<div class="ops-check-section"><h4>${esc(g.section)}</h4>${g.items.map(item => `<div class="ops-question" data-item-id="${item.id}">
      <strong>${esc(item.question_text)}</strong>
      ${item.help_text ? `<div class="ops-subtle">${esc(item.help_text)}</div>` : ''}
      <div class="ops-form">
        <label>Status / response *${answerInputHtml(item)}</label>
        <label>Notes<input class="ops-answer-notes" placeholder="Notes if needed"></label>
      </div>
      ${itemAllowsPhoto(item) ? `<div class="ops-question-photo"><label><strong>Exterior cleaning photos</strong><input class="ops-item-photo" type="file" accept="image/*" multiple></label><div class="ops-subtle">Upload exterior vehicle photos here after washing. No other checklist boxes need photos.</div></div>` : ''}
    </div>`).join('')}</div>`).join('');
  }
  function answerInputHtml(item){
    const type = item.response_type;
    if(type === 'number') return `<input class="ops-answer-value" type="number" step="0.1" ${item.required?'required':''}>`;
    if(type === 'text') return `<input class="ops-answer-value" ${item.required?'required':''}>`;
    let opts = ['Completed OK','Issue to report','N/A'];
    if(type === 'choice' && Array.isArray(item.response_options) && item.response_options.length) opts = item.response_options;
    return `<select class="ops-answer-value" ${item.required?'required':''}><option value="">No response</option>${opts.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
  }


  function historyHtml(){
    const rows = state.inspections.slice(0,100);
    if(!rows.length) return '<div class="ops-card"><h3>Inspection history</h3><p>No Operations inspections submitted yet.</p></div>';
    return `<div class="ops-card"><h3>Inspection history</h3><div class="ops-table-wrap"><table class="ops-table"><tr><th>Date</th><th>Target</th><th>Inspector</th><th>Result</th><th>Problems</th><th>Notes</th></tr>${rows.map(i=>{ const problems=state.answers.filter(a=>a.inspection_id===i.id && a.is_problem).length; return `<tr><td>${nzDate(i.inspection_date)}</td><td>${esc(targetName(i))}</td><td>${esc(i.inspector_name||i.submitted_by_email||'')}</td><td>${statusPill(i.overall_result)}</td><td>${problems}</td><td>${esc(i.notes||'')}</td></tr>`; }).join('')}</table></div></div>`;
  }

  function tasksHtml(){
    const label = state.taskQuickFilter ? `<span class="badge">Filtered: ${esc(taskQuickFilterLabel())}</span> <button class="ops-btn ghost" type="button" data-ops-action="clearTaskFilter">Clear filter</button>` : '';
    return `<div class="ops-card"><div class="ops-section-title"><h3>Tasks</h3><div>${label}</div></div>${canMaintain()?manualTaskFormHtml():''}${taskTableHtml()}</div>${state.openTaskId ? taskDetailHtml(state.openTaskId) : ''}`;
  }
  function taskQuickFilterLabel(){ return ({open:'Open tasks', waiting:'Waiting on parts/someone'}[state.taskQuickFilter] || state.taskQuickFilter || 'Filtered'); }
  function manualTaskFormHtml(){
    return `<details><summary><strong>Add manual task</strong></summary><form id="opsManualTaskForm" class="ops-form" style="margin-top:.8rem">
      <label>Target type<select id="opsManualTargetType"><option value="washing_equipment">Washing equipment</option><option value="vehicle">Vehicle</option></select></label>
      <label>Washing equipment<select id="opsManualWash"><option value="">None</option>${state.washEquipment.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>
      <label>Vehicle<select id="opsManualVehicle"><option value="">None</option>${state.vehicles.map(v=>`<option value="${v.id}">${esc(v.rego || v.name)}</option>`).join('')}</select></label>
      <label>Title<input id="opsManualTitle" required></label>
      <label><span>Apply to matching equipment type</span><select id="opsManualApplyScope"><option value="single">Standalone/single task only</option><option value="same_type">Create one for all washing equipment of the same type</option></select></label>
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
      <label>Equipment<select id="opsStdWash">${state.washEquipment.map(w=>`<option value="${w.id}">${esc(w.name)} (${esc(w.equipment_type||'')})</option>`).join('')}</select></label>
      <label>Default next due date<input id="opsStdNextDate" type="date" value="${addDays(today(), 30)}"></label>
      <div class="ops-span-2"><div class="ops-subtle">These procedure templates will be attached as date-based schedules. Adding a new Water Blaster item also automatically receives these templates.</div>${standardProcedures().map(p=>`<label class="ops-check"><input type="checkbox" class="ops-std-proc" value="${p.id}" checked> ${esc(p.name)} ${p.frequency_days?`(${p.frequency_days} days)`:''}</label>`).join('') || '<p class="ops-subtle">No standard procedures found. Run the V4.0.4 migration.</p>'}</div>
      <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="button" data-ops-action="applyStdSelected">Apply to selected equipment</button><button class="ops-btn ghost" type="button" data-ops-action="applyStdSameType">Apply to all equipment of same type</button></div>
    </div></details>`;
  }
  function scheduleFormHtml(){
    return `<details><summary><strong>Add standalone maintenance schedule</strong></summary><form id="opsScheduleForm" class="ops-form" style="margin-top:.8rem">
      <label>Washing equipment<select id="opsScheduleWash" required>${state.washEquipment.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></label>
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
    return `<div class="ops-table-wrap" style="margin-top:1rem"><table class="ops-table"><tr><th>Equipment</th><th>Procedure</th><th>Frequency</th><th>Next due</th><th>Status</th></tr>${scheduleRows.map(s=>{ const w=state.washEquipment.find(x=>x.id===s.washing_equipment_id); const p=state.procedures.find(x=>x.id===s.procedure_id); return `<tr><td>${esc(w?.name||'Unknown')}</td><td>${esc(p?.name||'Unknown')}</td><td>${esc(s.frequency_days||p?.frequency_days||'—')} days</td><td>${nzDate(s.next_due_at)}</td><td>${scheduleIsDue(s)?'<span class="ops-pill ops-bad">Due</span>':'<span class="ops-pill ops-ok">Scheduled</span>'}</td></tr>`; }).join('')}</table></div>`;
  }
  function scheduleIsDue(s){
    if(s.is_active === false) return false;
    return !!(s.next_due_at && daysUntil(s.next_due_at) <= 0);
  }

  async function applyDefaultSchedulesForEquipment(wash){
    const w = typeof wash === 'string' ? (state.washEquipment.find(x=>x.id===wash) || {id:wash, equipment_type:''}) : (wash || {});
    if(!/water\s*blaster|engine|pump/i.test(String(w.equipment_type || ''))) return;
    const procs = standardProcedures();
    if(procs.length) await upsertSchedulesForWashIds([w.id], procs.map(p=>p.id), addDays(today(), 30));
  }
  async function applyStandardSchedules(scope){
    if(!canMaintain()) return alert('Only Admin or Equipment Manager users can apply schedules.');
    const washId = byId('opsStdWash')?.value;
    if(!washId) return alert('Choose equipment first.');
    const selectedProcIds = Array.from(document.querySelectorAll('.ops-std-proc:checked')).map(x=>x.value);
    if(!selectedProcIds.length) return alert('Choose at least one maintenance template.');
    let washIds = [washId];
    if(scope === 'same_type'){
      const base = state.washEquipment.find(w=>w.id===washId);
      if(base) washIds = state.washEquipment.filter(w=>w.equipment_type === base.equipment_type).map(w=>w.id);
    }
    await upsertSchedulesForWashIds(washIds, selectedProcIds, byId('opsStdNextDate')?.value || addDays(today(),30));
    alert(`Applied ${selectedProcIds.length} template${selectedProcIds.length===1?'':'s'} to ${washIds.length} equipment item${washIds.length===1?'':'s'}.`);
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



  function rolesForPreset(preset){ return ROLE_PRESETS[preset] || []; }
  function presetOptions(selected){ return Object.keys(ROLE_PRESETS).map(p=>`<option value="${esc(p)}" ${p===selected?'selected':''}>${esc(p)}</option>`).join(''); }
  function adminDashboardHtml(){
    return `<div class="ops-grid two">
      ${usersHtml()}
      ${adminSettingsHtml()}
    </div>`;
  }

  function adminSettingsHtml(){
    return `<div class="ops-card"><h3>Settings, audit log and backups</h3><p class="ops-subtle">Open the existing app settings, audit log and backup tools. These controls are visible only to Admin users.</p><div class="ops-actions"><button class="ops-btn primary" data-ops-action="legacyAdminTools">Open settings, audit log and backup tools</button></div></div>`;
  }

  function roleChips(roles){
    return (roles || []).map(r=>`<span class="ops-role-chip">${esc(r)}</span>`).join('') || '<span class="ops-subtle">No roles</span>';
  }

  function userIdOfProfile(u){ return u.user_id || u.id || ''; }
  function emailOfProfile(u){ return u.email || u.user_email || ''; }
  function displayNameOfProfile(u){
    return titleCaseName(u.display_name || u.full_name || u.name || [u.first_name,u.last_name].filter(Boolean).join(' ') || String(emailOfProfile(u)).split('@')[0] || 'User');
  }
  function rolesForActualUser(userId){
    return (state.actualUserRoles || []).filter(r => String(r.user_id) === String(userId)).map(r => r.role).filter(Boolean);
  }
  function roleCheckboxGridForUser(userId, roles){
    return ROLE_DEFS.map(role => `<label class="ops-permission-check"><input type="checkbox" data-ops-role-user="${esc(userId)}" value="${esc(role)}" ${roles.includes(role) ? 'checked' : ''}> ${esc(role)}</label>`).join('');
  }
  function actualUsersHtml(){
    const users = (state.actualUsers || []).slice().sort((a,b) => displayNameOfProfile(a).localeCompare(displayNameOfProfile(b)) || emailOfProfile(a).localeCompare(emailOfProfile(b)));
    if(!users.length) return '<p class="ops-subtle">No signed-in user profiles found yet.</p>';
    return users.map(u => {
      const id = userIdOfProfile(u);
      const email = emailOfProfile(u);
      const roles = rolesForActualUser(id);
      return `<div class="ops-user-row">
        <div class="ops-user-row-head">
          <div><strong>${esc(displayNameOfProfile(u))}</strong><div class="ops-subtle">${esc(email || id)}${u.last_seen ? ' · Last seen: ' + esc(nzDate(u.last_seen)) : ''}</div></div>
          <div>${roleChips(roles)}</div>
        </div>
        <div class="ops-form" style="margin-top:.75rem">
          <label>Apply permission preset<select data-ops-preset-for="${esc(id)}">${presetOptions('Field Staff')}</select></label>
          <div class="ops-actions" style="align-items:end"><button class="ops-btn" type="button" data-ops-apply-preset="${esc(id)}">Apply preset</button></div>
        </div>
        <details style="margin-top:.75rem"><summary><strong>Advanced role checkboxes</strong></summary>
          <div class="ops-permission-grid">${roleCheckboxGridForUser(id, roles)}</div>
          <div class="ops-actions"><button class="ops-btn primary" type="button" data-ops-save-user-roles="${esc(id)}">Save roles</button></div>
        </details>
      </div>`;
    }).join('');
  }

  function usersHtml(){
    if(!isAdmin()) return `<div class="ops-card"><h3>Users & permissions</h3><p>Only Admin users can pre-load and manage users.</p></div>`;
    const rows = state.pendingUsers || [];
    const rolePresetGuide = Object.entries(ROLE_PRESETS).map(([preset, roles]) => `<tr><td><strong>${esc(preset)}</strong></td><td>${roleChips(roles)}</td></tr>`).join('');
    return `<div class="ops-card">
      <h3>Users & permissions</h3>
      <p class="ops-subtle">This is the only user and permission management area. Pre-load staff before first sign-in, then manage signed-in users using the same standard roles.</p>
      <form id="opsPreloadUserForm" class="ops-form">
        <label>First name<input id="opsPreloadFirst" required placeholder="e.g. Jamie"></label>
        <label>Last name<input id="opsPreloadLast" required placeholder="e.g. Benioni"></label>
        <label>Email<input id="opsPreloadEmail" type="email" required placeholder="name@example.com"></label>
        <label>Permission preset<select id="opsPreloadPreset">${presetOptions('Field Staff')}</select></label>
        <label>Status<select id="opsPreloadActive"><option value="true">Active</option><option value="false">Inactive</option></select></label>
        <label class="ops-span-2">Notes<textarea id="opsPreloadNotes" placeholder="Optional setup notes"></textarea></label>
        <div class="ops-span-2"><strong>Roles applied by preset:</strong> <span id="opsPreloadRolePreview">${roleChips(rolesForPreset('Field Staff'))}</span></div>
        <details class="ops-span-2"><summary><strong>Role preset guide</strong></summary><div class="ops-table-wrap" style="margin-top:.75rem"><table class="ops-table"><tr><th>Preset</th><th>Standard roles applied</th></tr>${rolePresetGuide}</table></div></details>
        <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Pre-load user</button></div>
      </form>
    </div>
    <div class="ops-card">
      <h3>Signed-in users</h3>
      <p class="ops-subtle">Assign roles here. Role presets are shortcuts only; they apply the same standard roles shown in the advanced checkboxes.</p>
      ${actualUsersHtml()}
    </div>
    <div class="ops-card">
      <h3>Pre-loaded users</h3>
      ${rows.length ? `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Name</th><th>Email</th><th>Preset</th><th>Roles</th><th>Status</th><th>Claimed</th></tr>${rows.map(u=>`<tr><td>${esc(u.display_name || [u.first_name,u.last_name].filter(Boolean).join(' '))}</td><td>${esc(u.email)}</td><td>${esc(u.role_preset||'')}</td><td>${roleChips(u.roles||[])}</td><td>${u.active ? statusPill('Active') : statusPill('Inactive')}</td><td>${u.claimed_at ? nzDate(u.claimed_at) : 'Not yet'}</td></tr>`).join('')}</table></div>` : '<p class="ops-subtle">No pre-loaded users yet.</p>'}
    </div>`;
  }

  function updatePreloadRolePreview(){
    const el = byId('opsPreloadRolePreview');
    const preset = byId('opsPreloadPreset')?.value || 'Field Staff';
    if(el) el.innerHTML = roleChips(rolesForPreset(preset));
  }

  async function applyActualUserPreset(userId){
    if(!isAdmin()) return alert('Only Admin users can manage permissions.');
    const select = document.querySelector(`select[data-ops-preset-for="${CSS.escape(String(userId))}"]`);
    const preset = select?.value || 'Field Staff';
    const roles = rolesForPreset(preset);
    await writeActualUserRoles(userId, roles);
    alert(`Applied ${preset} permissions.`);
    await loadAll();
  }

  async function saveActualUserRoles(userId){
    if(!isAdmin()) return alert('Only Admin users can manage permissions.');
    const roles = Array.from(document.querySelectorAll('input[data-ops-role-user]'))
      .filter(i => String(i.dataset.opsRoleUser) === String(userId) && i.checked)
      .map(i => i.value);
    await writeActualUserRoles(userId, roles);
    alert('User roles saved.');
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
    const preset = byId('opsPreloadPreset')?.value || 'Field Staff';
    const roles = rolesForPreset(preset);
    if(!first || !last || !email) return alert('First name, last name and email are required.');
    const row = { first_name:first, last_name:last, display_name:`${first} ${last}`, email, role_preset:preset, roles, active: byId('opsPreloadActive')?.value !== 'false', notes: byId('opsPreloadNotes')?.value || null, created_by: state.user.id };
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



  function heightQualificationsHtml(){
    const rows = state.qualifications || [];
    return `<div class="card">
      <h2>Inspector Qualifications</h2>
      <p class="muted">Record height-safety inspector qualification details and upload a PDF, scan or photo. Files are stored in the existing inspection photos storage bucket under height-inspector-qualifications.</p>
      <form id="heightQualForm" class="ops-form">
        <label>Inspector name *<input id="heightQualName" required placeholder="e.g. Brendan Harris"></label>
        <label>Email<input id="heightQualEmail" type="email" placeholder="name@example.com"></label>
        <label>Qualification type *<input id="heightQualType" required placeholder="e.g. Height Safety Inspector"></label>
        <label>Provider<input id="heightQualProvider" placeholder="Training provider"></label>
        <label>Reference / certificate number<input id="heightQualRef"></label>
        <label>Issue date<input id="heightQualIssue" type="date"></label>
        <label>Expiry date<input id="heightQualExpiry" type="date"></label>
        <label>PDF / scan / photo<input id="heightQualFile" type="file" accept="application/pdf,image/*"></label>
        <label class="ops-span-2">Notes<textarea id="heightQualNotes"></textarea></label>
        <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Save qualification</button></div>
      </form>
    </div>
    <div class="card"><h2>Saved inspector qualifications</h2>
      ${rows.length ? `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Inspector</th><th>Qualification</th><th>Provider</th><th>Reference</th><th>Expiry</th><th>File</th><th>Notes</th></tr>${rows.map(r=>`<tr><td>${esc(r.inspector_name)}<br><span class="ops-subtle">${esc(r.email||'')}</span></td><td>${esc(r.qualification_type)}</td><td>${esc(r.provider||'—')}</td><td>${esc(r.reference_number||'—')}</td><td>${nzDate(r.expiry_date)}</td><td>${r.storage_path ? `<button type="button" class="ops-btn ghost" onclick="SWOperationsV4.openQualificationFile('${esc(r.storage_path)}')">Open file</button>` : '—'}</td><td>${esc(r.notes||'')}</td></tr>`).join('')}</table></div>` : '<p class="muted">No inspector qualifications saved yet.</p>'}
    </div>`;
  }

  async function saveHeightQualification(e){
    e.preventDefault();
    if(!state.user || !hasAny(['Admin','Equipment Manager','Office / Reports','Certificate Approver'])) return alert('You do not have permission to save qualifications.');
    const file = byId('heightQualFile')?.files?.[0] || null;
    let storagePath = null;
    let fileName = file?.name || null;
    if(file){
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      storagePath = `height-inspector-qualifications/${Date.now()}-${safeName}`;
      const up = await state.sb.storage.from(PHOTO_BUCKET).upload(storagePath, file, { upsert:false, contentType:file.type || undefined });
      if(up.error) return alert('File upload failed: ' + up.error.message);
    }
    const row = {
      inspector_name: titleCaseName(byId('heightQualName')?.value || ''),
      email: String(byId('heightQualEmail')?.value || '').trim().toLowerCase() || null,
      qualification_type: byId('heightQualType')?.value || '',
      provider: byId('heightQualProvider')?.value || null,
      reference_number: byId('heightQualRef')?.value || null,
      issue_date: byId('heightQualIssue')?.value || null,
      expiry_date: byId('heightQualExpiry')?.value || null,
      storage_path: storagePath,
      file_name: fileName,
      notes: byId('heightQualNotes')?.value || null,
      created_by: state.user.id
    };
    if(!row.inspector_name || !row.qualification_type) return alert('Inspector name and qualification type are required.');
    const r = await state.sb.from('height_inspector_qualifications').insert(row);
    if(r.error) return alert(r.error.message);
    alert('Inspector qualification saved.');
    state.qualifications = await loadTable('height_inspector_qualifications','*',{column:'expiry_date'});
    openHeightQualifications();
  }

  async function openQualificationFile(path){
    try{
      const r = await state.sb.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 10);
      if(r.error) throw r.error;
      window.open(r.data.signedUrl, '_blank');
    }catch(err){ alert('Could not open file: ' + (err.message || err)); }
  }

  function bindRenderedEvents(){
    document.querySelectorAll('[data-ops-view]').forEach(btn => btn.addEventListener('click', () => { state.currentView = btn.dataset.opsView; state.openTaskId=''; render(); }));
    document.querySelectorAll('[data-ops-shortcut]').forEach(card => {
      const go = () => handleDashboardShortcut(card.dataset.opsShortcut);
      card.addEventListener('click', go);
      card.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
    });
    byId('opsVehicleForm')?.addEventListener('submit', saveVehicle);
    byId('opsWashingForm')?.addEventListener('submit', saveWashing);
    byId('opsInspectionForm')?.addEventListener('submit', submitInspection);
    byId('opsManualTaskForm')?.addEventListener('submit', createManualTask);
    byId('opsTaskCompleteForm')?.addEventListener('submit', saveTaskUpdate);
    byId('opsTaskSimpleForm')?.addEventListener('submit', saveTaskUpdate);
    byId('opsScheduleForm')?.addEventListener('submit', saveSchedule);
    byId('opsPreloadUserForm')?.addEventListener('submit', savePreloadedUser);
    byId('opsPreloadPreset')?.addEventListener('change', updatePreloadRolePreview);
    document.querySelectorAll('[data-ops-save-user-roles]').forEach(b => b.addEventListener('click', () => saveActualUserRoles(b.dataset.opsSaveUserRoles)));
    document.querySelectorAll('[data-ops-apply-preset]').forEach(b => b.addEventListener('click', () => applyActualUserPreset(b.dataset.opsApplyPreset))); 
    byId('opsAssetSearch')?.addEventListener('input', e => { state.assetSearch = e.target.value; render(); });
    byId('opsAssetFilterClass')?.addEventListener('change', e => { state.assetFilterClass = e.target.value; render(); });
    byId('opsAssetFilterStatus')?.addEventListener('change', e => { state.assetFilterStatus = e.target.value; render(); });
    byId('opsAssetFilterDue')?.addEventListener('change', e => { state.assetFilterDue = e.target.value; render(); });
    byId('opsAssetFilterTasks')?.addEventListener('change', e => { state.assetFilterTasks = e.target.value; render(); });
    updatePreloadRolePreview();
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
    if(action === 'applyStdSelected'){ await applyStandardSchedules('selected'); }
    if(action === 'applyStdSameType'){ await applyStandardSchedules('same_type'); }
    if(action === 'legacyAdminTools'){ openLegacyAdminTools(); }
    if(action === 'legacyUserTools'){ openLegacyUserTools(); }
    if(action === 'clearAssetFilters'){ state.assetSearch=''; state.assetFilterClass=''; state.assetFilterStatus=''; state.assetFilterDue=''; state.assetFilterTasks=''; render(); }
    if(action === 'clearTaskFilter'){ state.taskQuickFilter=''; render(); }
    if(action === 'clearScheduleFilter'){ state.scheduleQuickFilter=''; render(); }
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
      notes: byId('opsWashNotes').value.trim() || null,
      created_by: state.user.id
    };
    if(!row.name) return alert('Name is required.');
    let r;
    if(id) r = await state.sb.from('operations_washing_equipment').update(row).eq('id', id).select().single();
    else r = await state.sb.from('operations_washing_equipment').insert(row).select().single();
    if(r.error) return alert(r.error.message);
    if(!id && r.data) await applyDefaultSchedulesForEquipment(r.data);
    state.editingWashId=''; await loadAll();
  }

  function itemIsProblem(item, answer){
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
      answerRows.push({ item, answer, notes, problem });
      q.querySelectorAll('.ops-item-photo').forEach(input => {
        Array.from(input.files || []).forEach(file => itemPhotos.push({ item, file }));
      });
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
    let rows = [row];
    const scope = byId('opsManualApplyScope')?.value || 'single';
    if(scope === 'same_type' && row.target_type === 'washing_equipment' && row.washing_equipment_id){
      const base = state.washEquipment.find(w=>w.id===row.washing_equipment_id);
      if(base){
        rows = state.washEquipment.filter(w=>w.equipment_type === base.equipment_type).map(w => ({...row, washing_equipment_id:w.id, vehicle_id:null, title: row.title}));
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
        procedure_id: s.procedure_id,
        schedule_id: s.id,
        title: `${p?.name || 'Scheduled maintenance'} - ${w?.name || 'Washing equipment'}`,
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

  function boot(){
    injectTab();
    installModulePortal();
    installShortCertificateNumberPatch();
    installCertificateV405Patch();
    initSupabase().catch(err => { state.lastError = err.message; render(); });
    window.SWOperationsV4 = { refresh: loadAll, show: showOperations, state, setAssetSearch: v => { state.assetSearch = v || ''; render(); }, openQualificationFile, generateQualificationCertificate, handleDashboardShortcut };
    setupLogoHomeClick();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

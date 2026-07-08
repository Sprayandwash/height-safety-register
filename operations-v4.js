/* Spray & Wash Operations App V4.0.6
   Additive module for height-safety-adjacent operations workflows: periodic vehicle checks,
   operations management, inspections, maintenance tasks, preventive schedules, and guides.
   Load after config.js, Supabase JS, and app.js. Do not replace config.js.
*/
(function(){
  'use strict';

  const VERSION = '4.0.6';
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
  function isManagementView(view){ return ['management-dashboard','vehicles','washing','history','maintenance','schedules','guides','users'].includes(view); }
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
      #users details.ops-legacy-roles { margin-top:.5rem; }
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
    if(originalShowTab){
      window.showTab = function(id){
        state.currentModule = 'height';
        originalShowTab(id);
        setTopTabsMode('height');
        if(id === 'certificates') setTimeout(()=>{ enhanceCertificateSelector(); installCertificateV405Patch(); }, 80);
        if(id === 'users') setTimeout(enhanceLegacyUserUI, 80);
      };
    }
    setTimeout(showModuleHome, 450);
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

  function enhanceLegacyUserUI(){
    const users = byId('users');
    if(!users) return;
    if(!byId('opsLegacyUserNote')){
      const firstCard = users.querySelector('.card');
      const note = document.createElement('div');
      note.id = 'opsLegacyUserNote';
      note.className = 'permissionNote';
      note.innerHTML = `<b>Tip:</b> Admins can now pre-load users from <b>Ops Management → Users</b> using compact role presets. The role checkbox grid below remains available for advanced/manual changes.`;
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
    tabs.style.display = mode === 'height' ? 'flex' : 'none';
    const homeBtn = byId('moduleHomeTabButton');
    if(homeBtn) homeBtn.style.display = mode === 'height' ? '' : 'none';
    if(mode === 'height'){
      ensureHeightHomeButton();
      tabs.querySelectorAll('.tab').forEach(btn => {
        const tab = btn.dataset.tab || '';
        btn.style.display = ['dashboard','equipment','inspect','export','certificates','users','admin'].includes(tab) || !tab ? '' : 'none';
      });
    }
  }

  function showModuleHome(){
    state.currentModule = 'home';
    setTopTabsMode('none');
    document.querySelectorAll('.tabpane').forEach(x => x.classList.add('hidden'));
    byId('moduleHome')?.classList.remove('hidden');
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    renderModuleHome();
    setTimeout(() => window.scrollTo({top:0, behavior:'smooth'}), 10);
  }

  function openHeightModule(){
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
      if(canUseManagement()) cards.push(moduleCard('Ops Management', 'Vehicles, washing equipment, maintenance tasks, preventive maintenance, guides and management reports.', 'openOpsManagementModule()'));
      if(!cards.length) cards.push(`<div class="ops-card"><h3>No app access yet</h3><p class="ops-subtle">Your account needs an assigned role before modules will appear.</p></div>`);
    }
    shell.innerHTML = `
      <div class="ops-header">
        <div><h2>Spray &amp; Wash Operations</h2><div class="ops-subtle">Choose the area you need.</div></div>
        <div class="ops-subtle">${state.user ? `Signed in as ${esc(state.user.email)}<br>Roles: ${esc(roleText())}` : 'Not signed in'}</div>
      </div>
      <div class="ops-branch-grid">${cards.join('')}</div>`;
  }
  function moduleCard(title, body, action){
    return `<button type="button" class="ops-branch-card" onclick="${action}"><strong>${esc(title)}</strong><span class="ops-subtle">${esc(body)}</span></button>`;
  }

  function showOperations(view){
    state.currentView = view || state.currentView || 'vehicle-checks';
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
      } else { state.pendingUsers = []; }
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
    if(state.currentModule === 'home') renderModuleHome();
  }

  function headerHtml(){
    const managementNav = canUseManagement() && state.currentView !== 'vehicle-checks' ? `
        ${navButton('management-dashboard','Management Dashboard')}
        ${navButton('vehicles','Vehicles')}
        ${navButton('washing','Washing Equipment')}
        ${navButton('history','Inspection History')}
        ${navButton('maintenance','Maintenance')}
        ${navButton('schedules','Preventive Maintenance')}
        ${navButton('guides','Guides')}
        ${isAdmin() ? navButton('users','Users') : ''}` : '';
    const staffNav = state.currentView === 'vehicle-checks' ? `${navButton('vehicle-checks','Vehicle Inspection Checklist')}` : managementNav;
    return `
      <div class="ops-header">
        <div>
          <button type="button" class="ops-btn ghost" onclick="showModuleHome()">← Home</button>
          <h2>${state.currentView === 'vehicle-checks' ? 'Vehicle Checks' : 'Operations Management'}</h2>
          <div class="ops-subtle">V${VERSION} • ${state.currentView === 'vehicle-checks' ? 'Staff vehicle inspection checklist' : 'Maintenance, schedules and management'}</div>
        </div>
        <div class="ops-subtle">${state.user ? `Signed in as ${esc(state.user.email)}<br>Roles: ${esc(roleText())}` : 'Sign in to use Operations.'}</div>
      </div>
      <div class="ops-nav" id="opsNav">${staffNav}</div>`;
  }

  function navButton(id, label){ return `<button type="button" class="${state.currentView===id?'active':''}" data-ops-view="${id}">${label}</button>`; }

  function bodyHtml(){
    if(!state.user) return `<div class="ops-card"><h3>Sign in required</h3><p>Use the existing sign-in area first, then open Vehicle Checks or Operations Management.</p></div>`;
    if(!canView()) return `<div class="ops-card"><h3>No Operations access yet</h3><p>Your account needs one of these existing roles: Admin, Inspector, Equipment Manager, Office / Reports, or Viewer.</p></div>`;
    if(state.currentView === 'vehicle-checks') return periodicVehicleChecksHtml();
    if(isManagementView(state.currentView) && !canUseManagement()) return `<div class="ops-card"><h3>Operations Management access required</h3><p>Use Periodic Vehicle Checks for staff vehicle checks. Management views require Admin, Equipment Manager, Office / Reports, or Viewer access.</p></div>`;
    if(state.currentView === 'vehicles') return vehiclesHtml();
    if(state.currentView === 'washing') return washingHtml();
    if(state.currentView === 'history') return historyHtml();
    if(state.currentView === 'maintenance') return maintenanceHtml();
    if(state.currentView === 'schedules') return schedulesHtml();
    if(state.currentView === 'guides') return guidesHtml();
    if(state.currentView === 'users') return usersHtml();
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
        ${statCard('Vehicles due/overdue', vehicleDue.length, 'Fortnightly vehicle checks needing action')}
        ${statCard('Washing gear due/overdue', washDue.length, 'Water blasters, pumps and gear needing checks')}
        ${statCard('Open maintenance', open.length, 'Reactive, scheduled and manual tasks')}
        ${statCard('Waiting on parts', waiting.length, 'Tasks blocked by parts or supplies')}
        ${statCard('Preventive services due', scheduledDue.length, 'Scheduled date-based maintenance')}
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

  function maintenanceHtml(){
    return `<div class="ops-card"><h3>Maintenance to-do list</h3>${canMaintain()?manualTaskFormHtml():''}${taskTableHtml()}</div>${state.openTaskId ? taskDetailHtml(state.openTaskId) : ''}`;
  }
  function manualTaskFormHtml(){
    return `<details><summary><strong>Add manual maintenance task</strong></summary><form id="opsManualTaskForm" class="ops-form" style="margin-top:.8rem">
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
    if(!rows.length) return '<p class="ops-subtle">No open maintenance items.</p>';
    return rows.map(t=>`<div class="ops-step"><strong>${esc(t.title)}</strong><br>${statusPill(t.status)} ${statusPill(t.priority)}<br><span class="ops-subtle">${esc(targetName(t))} · Due ${nzDate(t.due_date)}</span></div>`).join('');
  }
  function taskTableHtml(){
    const rows = state.tasks.slice().sort((a,b)=> statusRank(a.status)-statusRank(b.status) || String(a.due_date||'9999').localeCompare(String(b.due_date||'9999')));
    if(!rows.length) return '<p class="ops-subtle">No maintenance tasks yet.</p>';
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
    return `<div class="ops-card"><h3>Preventive maintenance</h3><p class="ops-subtle">Use standard templates for water blaster engines, pumps, hose reels and unloaders, or add a standalone schedule.</p>${canMaintain()?standardMaintenanceHtml()+scheduleFormHtml():''}${scheduleTableHtml()}${canMaintain()?'<div class="ops-actions"><button class="ops-btn primary" data-ops-action="generateDueTasks">Generate due tasks</button></div>':''}</div>`;
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
    if(!state.schedules.length) return '<p class="ops-subtle">No preventive maintenance schedules yet.</p>';
    return `<div class="ops-table-wrap" style="margin-top:1rem"><table class="ops-table"><tr><th>Equipment</th><th>Procedure</th><th>Frequency</th><th>Next due</th><th>Status</th></tr>${state.schedules.map(s=>{ const w=state.washEquipment.find(x=>x.id===s.washing_equipment_id); const p=state.procedures.find(x=>x.id===s.procedure_id); return `<tr><td>${esc(w?.name||'Unknown')}</td><td>${esc(p?.name||'Unknown')}</td><td>${esc(s.frequency_days||p?.frequency_days||'—')} days</td><td>${nzDate(s.next_due_at)}</td><td>${scheduleIsDue(s)?'<span class="ops-pill ops-bad">Due</span>':'<span class="ops-pill ops-ok">Scheduled</span>'}</td></tr>`; }).join('')}</table></div>`;
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
  function usersHtml(){
    if(!isAdmin()) return `<div class="ops-card"><h3>Users</h3><p>Only Admin users can pre-load and manage users.</p></div>`;
    const rows = state.pendingUsers || [];
    return `<div class="ops-card">
      <h3>User management</h3>
      <p class="ops-subtle">Pre-load staff so their role setup is ready before their first login. Supabase Auth still controls the actual login account; this prepares their app profile and roles.</p>
      <form id="opsPreloadUserForm" class="ops-form">
        <label>First name<input id="opsPreloadFirst" required placeholder="e.g. Jamie"></label>
        <label>Last name<input id="opsPreloadLast" required placeholder="e.g. Benioni"></label>
        <label>Email<input id="opsPreloadEmail" type="email" required placeholder="name@example.com"></label>
        <label>Role preset<select id="opsPreloadPreset">${presetOptions('Field Staff')}</select></label>
        <label>Status<select id="opsPreloadActive"><option value="true">Active</option><option value="false">Inactive</option></select></label>
        <label class="ops-span-2">Notes<textarea id="opsPreloadNotes" placeholder="Optional setup notes"></textarea></label>
        <div class="ops-span-2"><strong>Preset roles:</strong> <span id="opsPreloadRolePreview">${rolesForPreset('Field Staff').map(r=>`<span class="ops-role-chip">${esc(r)}</span>`).join('')}</span></div>
        <div class="ops-actions ops-span-2"><button class="ops-btn primary" type="submit">Pre-load user</button></div>
      </form>
    </div>
    <div class="ops-card">
      <h3>Pre-loaded users</h3>
      ${rows.length ? `<div class="ops-table-wrap"><table class="ops-table"><tr><th>Name</th><th>Email</th><th>Preset</th><th>Roles</th><th>Status</th><th>Claimed</th></tr>${rows.map(u=>`<tr><td>${esc(u.display_name || [u.first_name,u.last_name].filter(Boolean).join(' '))}</td><td>${esc(u.email)}</td><td>${esc(u.role_preset||'')}</td><td>${(u.roles||[]).map(r=>`<span class="ops-role-chip">${esc(r)}</span>`).join('')}</td><td>${u.active ? statusPill('Active') : statusPill('Inactive')}</td><td>${u.claimed_at ? nzDate(u.claimed_at) : 'Not yet'}</td></tr>`).join('')}</table></div>` : '<p class="ops-subtle">No pre-loaded users yet.</p>'}
    </div>`;
  }

  function updatePreloadRolePreview(){
    const el = byId('opsPreloadRolePreview');
    const preset = byId('opsPreloadPreset')?.value || 'Field Staff';
    if(el) el.innerHTML = rolesForPreset(preset).map(r=>`<span class="ops-role-chip">${esc(r)}</span>`).join('');
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


  function bindRenderedEvents(){
    byId('opsNav')?.querySelectorAll('[data-ops-view]').forEach(btn => btn.addEventListener('click', () => { state.currentView = btn.dataset.opsView; state.openTaskId=''; render(); }));
    byId('opsVehicleForm')?.addEventListener('submit', saveVehicle);
    byId('opsWashingForm')?.addEventListener('submit', saveWashing);
    byId('opsInspectionForm')?.addEventListener('submit', submitInspection);
    byId('opsManualTaskForm')?.addEventListener('submit', createManualTask);
    byId('opsTaskCompleteForm')?.addEventListener('submit', saveTaskUpdate);
    byId('opsTaskSimpleForm')?.addEventListener('submit', saveTaskUpdate);
    byId('opsScheduleForm')?.addEventListener('submit', saveSchedule);
    byId('opsPreloadUserForm')?.addEventListener('submit', savePreloadedUser);
    byId('opsPreloadPreset')?.addEventListener('change', updatePreloadRolePreview);
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
    e.preventDefault(); if(!canMaintain()) return alert('Only Admin or Equipment Manager users can update maintenance tasks.');
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
    alert(`Created ${created} due maintenance task${created===1?'':'s'}.`);
    state.currentView = 'maintenance';
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
    return 'No matching certificate items were found for the selected parameters.';
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
  }

  function boot(){
    injectTab();
    installModulePortal();
    installCertificateV405Patch();
    initSupabase().catch(err => { state.lastError = err.message; render(); });
    window.SWOperationsV4 = { refresh: loadAll, show: showOperations, state };
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

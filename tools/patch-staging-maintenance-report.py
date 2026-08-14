from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: patch-staging-maintenance-report.py <operations-v4.js>")

path = Path(sys.argv[1])
s = path.read_text(encoding="utf-8")

old_actions = '''    </div><div class="registerFilterActions"><button type="button" data-ops-action="clearMaintenanceLogFilters">Clear filters</button></div><div id="opsLogFilterCount" class="ops-subtle registerFilterCount">${resultCount} item${resultCount===1?'':'s'} shown.</div></div>`;
'''
new_actions = '''    </div><div class="registerFilterActions"><button type="button" data-ops-action="clearMaintenanceLogFilters">Clear filters</button><button type="button" id="opsMaintenanceReportPrint">Print / Save PDF</button><button type="button" id="opsMaintenanceReportCsv">Download CSV</button></div><div id="opsLogFilterCount" class="ops-subtle registerFilterCount">${resultCount} item${resultCount===1?'':'s'} shown.</div></div>`;
'''
if old_actions not in s:
    raise SystemExit("Could not locate Maintenance Log filter actions")
s = s.replace(old_actions, new_actions, 1)

old_render = '''  function renderMaintenanceLogResults(){
    const rows=maintenanceLogRecords().filter(maintenanceRecordMatches);
    const list=byId('opsMaintenanceLogList');
    if(list)list.innerHTML=rows.length?rows.map(maintenanceLogRecordHtml).join(''):'<p class="ops-subtle">No maintenance records match the current filters.</p>';
    const count=byId('opsLogFilterCount');
    if(count)count.textContent=`${rows.length} item${rows.length===1?'':'s'} shown.`;
  }
'''

new_render = r'''  function renderMaintenanceLogResults(){
    const rows=maintenanceLogRecords().filter(maintenanceRecordMatches);
    const list=byId('opsMaintenanceLogList');
    if(list)list.innerHTML=rows.length?rows.map(maintenanceLogRecordHtml).join(''):'<p class="ops-subtle">No maintenance records match the current filters.</p>';
    const count=byId('opsLogFilterCount');
    if(count)count.textContent=`${rows.length} item${rows.length===1?'':'s'} shown.`;
  }
  function maintenanceReportAsset(){
    if(state.logMachineryId){
      const machine=state.washEquipment.find(w=>String(w.id)===String(state.logMachineryId));
      const vehicle=state.vehicles.find(v=>String(v.id)===String(machine?.assigned_vehicle_id||state.logAssetId||''));
      return {
        label:[normalizeRego(vehicle?.rego)||vehicle?.name||'',machine?machineryIdentifier(machine):''].filter(Boolean).join(' / '),
        slug:machine?machineryIdentifier(machine):'machinery'
      };
    }
    if(state.logAssetId){
      const vehicle=state.vehicles.find(v=>String(v.id)===String(state.logAssetId));
      const label=normalizeRego(vehicle?.rego)||vehicle?.name||'Vehicle';
      return {label,slug:label};
    }
    return null;
  }
  function maintenanceReportRows(){
    const asset=maintenanceReportAsset();
    if(!asset){ alert('Select a vehicle or machinery item before generating an asset maintenance report.'); return null; }
    const rows=maintenanceLogRecords().filter(maintenanceRecordMatches);
    if(!rows.length){ alert('No maintenance records match the current filters for this asset.'); return null; }
    return {asset,rows};
  }
  function normalizeLegacyMaintenanceReportItem(record,detail){
    let type=String(record||'').trim();
    let description=String(detail||'').trim();
    const routineTypes=new Set([
      'Engine oil changed','Oil filter changed','Spark plug changed','Air filter changed','Fuel filter changed',
      'Coolant replaced','Brake fluid replaced','Transmission oil changed','Valves changed','Seals replaced'
    ]);
    if(type==='Oil changed'&&description==='Engine oil changed'){
      type='Engine oil changed'; description='';
    }else if(type==='Other maintenance'&&routineTypes.has(description)){
      type=description; description='';
    }else if(type==='Other maintenance'&&/^Repair:\s*/i.test(description)){
      type='Repair'; description=description.replace(/^Repair:\s*/i,'').trim();
    }
    return {record:type||'Maintenance',detail:description};
  }
  function maintenanceReportRowData(row){
    const source=row.sourceRow||{};
    const item=row.itemRow||{};
    if(row.source==='inspection'){
      return {
        date:row.date||'', target:row.target||'', record:'Periodic inspection',
        detail:displayStatusLabel(source.overall_result)||'', person:row.person||'',
        odometer:source.odometer??'', parts:'', notes:source.notes||'', followup:'', source:'Vehicle Checks'
      };
    }
    const normalized=normalizeLegacyMaintenanceReportItem(row.recordType||row.title||'Maintenance',item.description||source.description||'');
    return {
      date:row.date||'', target:row.target||'', record:normalized.record,
      detail:normalized.detail, person:source.performed_by||row.person||'',
      odometer:source.odometer??'', parts:item.parts_used||source.parts_used||'', notes:source.notes||'',
      followup:source.further_maintenance_required||'', source:'Maintenance'
    };
  }
  function maintenanceReportFilterSummary(){
    const bits=[];
    if(state.logType)bits.push(`Type: ${state.logType}`);
    if(state.logDateFrom)bits.push(`From: ${nzDate(state.logDateFrom)}`);
    if(state.logDateTo)bits.push(`To: ${nzDate(state.logDateTo)}`);
    if(String(state.logKeyword||'').trim())bits.push(`Keyword: ${String(state.logKeyword).trim()}`);
    return bits.length?bits.join(' · '):'All maintenance history for selected asset';
  }
  function maintenanceReportSlug(value){
    return String(value||'asset').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'asset';
  }
  function maintenanceCsvCell(value){
    const text=String(value??'').replace(/\r?\n/g,' ').replace(/"/g,'""');
    return `"${text}"`;
  }
  function downloadMaintenanceReportCsv(){
    const report=maintenanceReportRows(); if(!report)return;
    const headings=['Date','Asset','Source','Maintenance / record type','Description / result','Performed by / inspector','Odometer (km)','Parts or consumables','Notes','Further maintenance required'];
    const data=report.rows.map(maintenanceReportRowData);
    const lines=[headings.map(maintenanceCsvCell).join(',')].concat(data.map(r=>[
      r.date,r.target,r.source,r.record,r.detail,r.person,r.odometer,r.parts,r.notes,r.followup
    ].map(maintenanceCsvCell).join(',')));
    const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`spray-wash-maintenance-history-${maintenanceReportSlug(report.asset.slug)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function printMaintenanceReport(){
    const report=maintenanceReportRows(); if(!report)return;
    const data=report.rows.map(maintenanceReportRowData);
    const tableRows=data.map(r=>`<tr><td>${esc(nzDate(r.date))}</td><td>${esc(r.record)}</td><td>${esc(r.detail||'—')}</td><td>${esc(r.person||'—')}</td><td>${esc(r.odometer===''?'—':r.odometer)}</td><td>${esc(r.parts||'—')}</td><td>${esc(r.notes||'—')}</td><td>${esc(r.followup||'—')}</td></tr>`).join('');
    const html=`<!doctype html><html><head><meta charset="utf-8"><title></title><style>
      @page{size:A4 landscape;margin:0}html,body{margin:0;padding:0}body{font-family:Arial,sans-serif;color:#0f2740}.doc{box-sizing:border-box;width:100%;padding:12mm;max-width:none;margin:0}.head{border-bottom:3px solid #0b4f83;padding-bottom:12px;margin-bottom:14px}.brand{font-weight:800;color:#0b4f83;font-size:18px}.title{font-size:26px;font-weight:800;margin-top:4px}.muted{color:#64748b;font-size:12px}.summary{display:flex;gap:24px;flex-wrap:wrap;margin:12px 0 18px}.summary div{background:#f5f8fb;border:1px solid #dbe5ef;border-radius:8px;padding:8px 10px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #dbe5ef;padding:7px;vertical-align:top;text-align:left}th{background:#edf4f9;font-weight:800}thead{display:table-header-group}tr{break-inside:avoid}.noPrint{margin-bottom:14px}.noPrint button{background:#0b4f83;color:white;border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}@media print{.noPrint{display:none}.doc{padding:12mm}}
      </style></head><body><div class="doc"><div class="noPrint"><button onclick="print()">Print / Save as PDF</button></div><div class="head"><div class="brand">Spray &amp; Wash Operations</div><div class="title">Asset Maintenance History</div><div class="muted">Generated ${esc(new Date().toLocaleString('en-NZ'))}</div></div><div class="summary"><div><strong>Asset</strong><br>${esc(report.asset.label)}</div><div><strong>Records shown</strong><br>${data.length}</div><div><strong>Filters</strong><br>${esc(maintenanceReportFilterSummary())}</div></div><table><thead><tr><th>Date</th><th>Maintenance / record type</th><th>Description / result</th><th>Performed by / inspector</th><th>Odometer</th><th>Parts / consumables</th><th>Notes</th><th>Further maintenance</th></tr></thead><tbody>${tableRows}</tbody></table><p class="muted">This report reflects the Maintenance Log records matching the selected asset and filters at the time it was generated.</p></div></body></html>`;
    const w=window.open('', '_blank');
    if(w){w.document.open();w.document.write(html);w.document.close();}
    else{
      const blob=new Blob([html],{type:'text/html'}); const a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download=`spray-wash-maintenance-history-${maintenanceReportSlug(report.asset.slug)}.html`; a.click(); URL.revokeObjectURL(a.href);
      alert('Popup blocked. The printable report HTML has been downloaded instead.');
    }
  }
'''

if old_render not in s:
    raise SystemExit("Could not locate renderMaintenanceLogResults()")
s = s.replace(old_render, new_render, 1)

old_listener = "    byId('opsLogKeyword')?.addEventListener('input',e=>{state.logKeyword=e.target.value;renderMaintenanceLogResults();});\n"
new_listener = old_listener + "    byId('opsMaintenanceReportPrint')?.addEventListener('click',printMaintenanceReport);\n    byId('opsMaintenanceReportCsv')?.addEventListener('click',downloadMaintenanceReportCsv);\n"
if old_listener not in s:
    raise SystemExit("Could not locate Maintenance Log keyword listener")
s = s.replace(old_listener, new_listener, 1)

path.write_text(s, encoding="utf-8")

text = path.read_text(encoding="utf-8")
for marker in [
    'id="opsMaintenanceReportPrint"',
    'id="opsMaintenanceReportCsv"',
    'function printMaintenanceReport(){',
    'function downloadMaintenanceReportCsv(){',
    'function normalizeLegacyMaintenanceReportItem(record,detail){',
    "type==='Other maintenance'&&routineTypes.has(description)",
    '@page{size:A4 landscape;margin:0}',
    '<title></title>',
    "Select a vehicle or machinery item before generating an asset maintenance report.",
    "byId('opsMaintenanceReportPrint')?.addEventListener('click',printMaintenanceReport);",
]:
    if marker not in text:
        raise SystemExit("Maintenance report patch verification failed: " + marker)

print("Polished staging asset Maintenance reports: legacy type normalization plus header/footer-safe print layout.")

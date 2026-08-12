from pathlib import Path
import re
import sys

if len(sys.argv) != 3:
    raise SystemExit("Usage: patch-staging-route-diagnostics.py <app.js> <operations-v4.js>")

app_path = Path(sys.argv[1])
ops_path = Path(sys.argv[2])
app = app_path.read_text(encoding="utf-8")
ops = ops_path.read_text(encoding="utf-8")

bootstrap = r'''
// STAGING ROUTE DIAGNOSTICS - REMOVE BEFORE PRODUCTION.
(function(){
  if(window.SW_ROUTE_TRACE) return;
  window.SW_ROUTE_TRACE=[];
  window.swRouteTrace=function(label,extra){
    const item={time:new Date().toISOString(),label:String(label||''),extra:extra||null};
    window.SW_ROUTE_TRACE.push(item);
    if(window.SW_ROUTE_TRACE.length>80) window.SW_ROUTE_TRACE.shift();
    console.log('[SW ROUTE]',item.label,item.extra||'');
    const renderPanel=()=>{
      let panel=document.getElementById('swRouteTracePanel');
      if(!panel){
        panel=document.createElement('div');
        panel.id='swRouteTracePanel';
        panel.style.cssText='position:fixed;right:8px;bottom:8px;z-index:2147483647;width:min(460px,calc(100vw - 16px));max-height:42vh;overflow:auto;background:rgba(15,23,42,.96);color:#fff;border:2px solid #f59e0b;border-radius:10px;padding:8px;font:11px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace;box-shadow:0 8px 30px #0008;';
        document.body.appendChild(panel);
      }
      const rows=window.SW_ROUTE_TRACE.slice(-14).map((x,i)=>{
        const t=(x.time||'').slice(11,23);
        let extra='';
        try{extra=x.extra?(' '+JSON.stringify(x.extra)) : '';}catch(_){extra='';}
        return `${String(i+1).padStart(2,'0')} ${t} ${x.label}${extra}`;
      });
      panel.textContent='STAGING ROUTE TRACE\n'+rows.join('\n');
    };
    if(document.body) renderPanel(); else document.addEventListener('DOMContentLoaded',renderPanel,{once:true});
  };
  window.swRouteTrace('app.js diagnostic bootstrap');
})();
'''

app = bootstrap + "\n" + app

def instrument_function(text, name, label=None, extra=""):
    label = label or name
    patterns = [
        rf"(async\s+function\s+{re.escape(name)}\s*\([^)]*\)\s*\{{)",
        rf"(function\s+{re.escape(name)}\s*\([^)]*\)\s*\{{)"
    ]
    for pattern in patterns:
        repl = rf"\1\n  window.swRouteTrace?.('{label}'{extra});"
        text2, count = re.subn(pattern, repl, text, count=1)
        if count:
            return text2, True
    return text, False

# Legacy app lifecycle / routing functions.
for name in ['init','signIn','updateAuthUI','loadData','render','showTab']:
    app, _ = instrument_function(app, name, f'app.js {name}')

# Add explicit trace immediately before each Home handoff call produced by patch-staging-home.py.
app = app.replace('handoffToOperationsHome();', "window.swRouteTrace?.('app.js calling handoffToOperationsHome');handoffToOperationsHome();")
app, _ = instrument_function(app, 'handoffToOperationsHome', 'app.js handoffToOperationsHome')

# Operations module lifecycle / top-level route functions.
for name in ['boot','installModulePortal','initSupabase','refreshAuthAndData','render','showModuleHome','openHeightModule','openVehicleChecksModule','openOpsManagementModule','openAdminModule','setupLogoHomeClick']:
    ops, _ = instrument_function(ops, name, f'operations-v4.js {name}')

# Snapshot visible top-level panes after key route functions have had a chance to mutate the DOM.
ops_snapshot = r'''
  setTimeout(()=>{
    const ids=['moduleHome','dashboard','equipment','inspection','certificates','qualifications','reports','operations'];
    const visible=ids.filter(id=>{const el=document.getElementById(id);return el && !el.classList.contains('hidden') && getComputedStyle(el).display!=='none';});
    window.swRouteTrace?.('operations DOM snapshot',{module:state?.currentModule||'',view:state?.currentView||'',visible});
  },0);
'''

for name in ['showModuleHome','openHeightModule','openVehicleChecksModule','openOpsManagementModule','openAdminModule']:
    pattern = rf"((?:async\s+)?function\s+{re.escape(name)}\s*\([^)]*\)\s*\{{\n\s*window\.swRouteTrace\?\.\('[^']+'\);)"
    ops, _ = re.subn(pattern, rf"\1\n{ops_snapshot}", ops, count=1)

# Trace Supabase auth event name in operations-v4.js without changing behavior.
ops = ops.replace(
    "state.sb.auth.onAuthStateChange(async (_event, session) => {",
    "state.sb.auth.onAuthStateChange(async (_event, session) => { window.swRouteTrace?.('operations auth event',{event:_event,hasSession:!!session});",
    1
)

# Final post-load snapshots catch later route overrides.
ops += r'''

// STAGING ROUTE DIAGNOSTICS final snapshots.
[0,50,150,350,750,1500].forEach(ms=>setTimeout(()=>{
  try{
    const ids=['moduleHome','dashboard','equipment','inspection','certificates','qualifications','reports','operations'];
    const visible=ids.filter(id=>{const el=document.getElementById(id);return el && !el.classList.contains('hidden') && getComputedStyle(el).display!=='none';});
    window.swRouteTrace?.('post-load snapshot '+ms+'ms',{module:window.SWOperationsV4?.state?.currentModule||'',visible});
  }catch(err){console.warn('route diagnostic snapshot failed',err);}
},ms));
'''

app_path.write_text(app, encoding="utf-8")
ops_path.write_text(ops, encoding="utf-8")

if "STAGING ROUTE DIAGNOSTICS" not in app:
    raise SystemExit("Diagnostic bootstrap verification failed")
if "operations-v4.js showModuleHome" not in ops:
    raise SystemExit("showModuleHome instrumentation was not applied")
if "operations-v4.js openHeightModule" not in ops:
    raise SystemExit("openHeightModule instrumentation was not applied")

print("Installed staging-only route diagnostics in app.js and operations-v4.js")

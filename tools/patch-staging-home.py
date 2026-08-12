from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: patch-staging-home.py <path-to-app.js>")

path = Path(sys.argv[1])
s = path.read_text(encoding="utf-8")

helper_anchor = 'window.addEventListener("DOMContentLoaded",init);\nasync function init(){'
helper = '''function handoffToOperationsHome(){
  if(!currentUser) return;
  if(typeof window.showModuleHome === "function"){
    window.showModuleHome();
    return;
  }
  console.warn("Operations Home handler was not available after authentication.");
}
window.addEventListener("DOMContentLoaded",init);
async function init(){'''

if helper_anchor not in s:
    raise SystemExit("Could not locate legacy init anchor in app.js")
s = s.replace(helper_anchor, helper, 1)

init_old = '''  const {data:{session}}=await sb.auth.getSession(); currentUser=session?.user||null; updateAuthUI(); if(currentUser){await ensureCurrentProfile(); await loadRoles(); await loadAppSettings(); await loadData(); await refreshAuditLogs();}
}'''
init_new = '''  const {data:{session}}=await sb.auth.getSession(); currentUser=session?.user||null; updateAuthUI(); if(currentUser){await ensureCurrentProfile(); await loadRoles(); await loadAppSettings(); await loadData(); await refreshAuditLogs(); handoffToOperationsHome();}
}'''

if init_old not in s:
    raise SystemExit("Could not locate restored-session flow in app.js")
s = s.replace(init_old, init_new, 1)

signin_old = '''async function signIn(){let email=loginEmail.value.trim(),password=loginPassword.value;if(!email||!password)return alert("Enter email and password.");let {error}=await sb.auth.signInWithPassword({email,password});if(error)return alert(error.message);let {data:{session}}=await sb.auth.getSession();currentUser=session?.user||null;updateAuthUI();await ensureCurrentProfile();await loadRoles();await loadAppSettings();await loadData();await refreshAuditLogs();}'''
signin_new = '''async function signIn(){let email=loginEmail.value.trim(),password=loginPassword.value;if(!email||!password)return alert("Enter email and password.");let {error}=await sb.auth.signInWithPassword({email,password});if(error)return alert(error.message);let {data:{session}}=await sb.auth.getSession();currentUser=session?.user||null;updateAuthUI();await ensureCurrentProfile();await loadRoles();await loadAppSettings();await loadData();await refreshAuditLogs();handoffToOperationsHome();}'''

if signin_old not in s:
    raise SystemExit("Could not locate explicit sign-in flow in app.js")
s = s.replace(signin_old, signin_new, 1)

path.write_text(s, encoding="utf-8")

text = path.read_text(encoding="utf-8")
if "function handoffToOperationsHome()" not in text:
    raise SystemExit("Home handoff helper verification failed")
if text.count("handoffToOperationsHome();") != 2:
    raise SystemExit("Expected exactly two Home handoff calls")

print("Patched legacy auth/session flows to hand off to Operations Home.")

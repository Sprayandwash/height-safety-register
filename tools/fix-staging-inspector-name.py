from pathlib import Path
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: fix-staging-inspector-name.py <operations-v4.js>")

path = Path(sys.argv[1])
s = path.read_text(encoding="utf-8")

pattern = re.compile(r"  function inspectorDisplayName\(\)\{.*?\n  \}\n", re.S)
if not pattern.search(s):
    raise SystemExit("Could not locate inspectorDisplayName()")

replacement = r'''  function inspectorDisplayName(){
    const currentId=String(state.user?.id||'');
    const currentEmail=String(state.user?.email||'').trim().toLowerCase();
    const generic=new Set(['','info','inspector','admin','administrator','user']);
    const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
    const usable=value=>{ const v=clean(value); return v && !generic.has(v.toLowerCase()) ? titleCaseName(v) : ''; };

    const candidates=[
      (state.actualUsers||[]).find(u=>String(u?.id||'')===currentId),
      state.profile,
      (state.pendingUsers||[]).find(u=>String(u?.email||'').trim().toLowerCase()===currentEmail),
      state.user?.user_metadata
    ].filter(Boolean);

    for(const record of candidates){
      const direct=usable(record.display_name||record.full_name||record.name);
      if(direct) return direct;
      const combined=usable([record.first_name||record.firstName,record.last_name||record.lastName].filter(Boolean).join(' '));
      if(combined) return combined;
    }

    const prior=(state.inspections||[])
      .filter(i=>{
        const sameId=currentId && String(i?.submitted_by||'')===currentId;
        const sameEmail=currentEmail && String(i?.submitted_by_email||'').trim().toLowerCase()===currentEmail;
        return sameId||sameEmail;
      })
      .sort((a,b)=>String(b?.created_at||b?.inspection_date||'').localeCompare(String(a?.created_at||a?.inspection_date||'')))
      .map(i=>usable(i?.inspector_name))
      .find(Boolean);
    if(prior) return prior;

    const fallback=usable(maintenanceUserName(state.profile||{},state.user||{}));
    if(fallback) return fallback;

    const emailName=usable(currentEmail.split('@')[0]);
    return emailName||'Inspector';
  }
'''

s, count = pattern.subn(lambda _m: replacement, s, count=1)
if count != 1:
    raise SystemExit(f"Expected one inspectorDisplayName replacement, got {count}")

path.write_text(s, encoding="utf-8")
text = path.read_text(encoding="utf-8")
for marker in ["const prior=(state.inspections||[])", "submitted_by_email", "return emailName||'Inspector';"]:
    if marker not in text:
        raise SystemExit("Inspector-name repair verification failed: " + marker)
print("Patched staging inspector name resolution with profile and prior-inspection fallback.")

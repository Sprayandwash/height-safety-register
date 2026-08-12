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
    const currentProfile=(state.actualUsers||[]).find(u=>String(userIdOfProfile(u)||'')===currentId) || state.profile || null;
    const profileName=currentProfile ? displayNameOfProfile(currentProfile) : '';
    if(String(profileName||'').trim()) return titleCaseName(profileName);

    const fallback=maintenanceUserName(state.profile||{},state.user||{});
    if(String(fallback||'').trim()) return titleCaseName(fallback);

    const emailName=String(state.user?.email||'').split('@')[0];
    return titleCaseName(emailName)||'Inspector';
  }
'''

s, count = pattern.subn(lambda _m: replacement, s, count=1)
if count != 1:
    raise SystemExit(f"Expected one inspectorDisplayName replacement, got {count}")

path.write_text(s, encoding="utf-8")
text = path.read_text(encoding="utf-8")
for marker in [
    "userIdOfProfile(u)",
    "displayNameOfProfile(currentProfile)",
    "return titleCaseName(emailName)||'Inspector';",
]:
    if marker not in text:
        raise SystemExit("Inspector-name repair verification failed: " + marker)

print("Patched staging inspector name to use the canonical Admin/profile display name.")

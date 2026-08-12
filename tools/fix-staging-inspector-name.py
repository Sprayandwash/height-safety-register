from pathlib import Path
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: fix-staging-inspector-name.py <operations-v4.js>")

path = Path(sys.argv[1])
s = path.read_text(encoding="utf-8")

pattern = re.compile(r"  function inspectorDisplayName\(\)\{.*?\n  \}\n", re.S)
match = pattern.search(s)
if not match:
    raise SystemExit("Could not locate inspectorDisplayName()")

replacement = r'''  function inspectorDisplayName(){
    const currentId=String(state.user?.id||'');
    const currentEmail=String
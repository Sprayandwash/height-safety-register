from pathlib import Path
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: fix-staging-maintenance-save.py <operations-v4.js>")

path = Path(sys.argv[1])
s = path.read_text(encoding="utf-8")

old = """      const routineItems=Array.from(document.querySelectorAll('.ops-maintenance-routine:checked')).map(input=>({\n        maintenance_done:input.value,\n        description:null,\n        parts_used:null\n      }));"""

new = """      const routineItems=Array.from(document.querySelectorAll('.ops-maintenance-routine:checked')).map(input=>({\n        maintenance_done:input.value==='Engine oil changed'?'Oil changed':input.value,\n        description:input.value==='Engine oil changed'?'Vehicle engine oil changed':null,\n        parts_used:null\n      }));"""

if old not in s:
    raise SystemExit("Could not locate routine maintenance payload mapping")

s = s.replace(old, new, 1)
path.write_text(s, encoding="utf-8")

text = path.read_text(encoding="utf-8")
for marker in [
    "input.value==='Engine oil changed'?'Oil changed':input.value",
    "input.value==='Engine oil changed'?'Vehicle engine oil changed':null",
]:
    if marker not in text:
        raise SystemExit("Maintenance-save compatibility verification failed: " + marker)

print("Patched staging maintenance save to map vehicle engine oil changes to the database canonical value.")

from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: fix-staging-maintenance-save.py <operations-v4.js>")

path = Path(sys.argv[1])
s = path.read_text(encoding="utf-8")

old_routine = """      const routineItems=Array.from(document.querySelectorAll('.ops-maintenance-routine:checked')).map(input=>({\n        maintenance_done:input.value,\n        description:null,\n        parts_used:null\n      }));"""

new_routine = """      const routineItems=Array.from(document.querySelectorAll('.ops-maintenance-routine:checked')).map(input=>{\n        const uiValue=String(input.value||'').trim();\n        const canonical=uiValue==='Engine oil changed'||uiValue==='Oil changed'?'Oil changed':uiValue==='Spark plug changed'?'Spark plug changed':'Other maintenance';\n        return {\n          maintenance_done:canonical,\n          description:canonical===uiValue?null:uiValue,\n          parts_used:null\n        };\n      });"""

old_detailed = """      const detailedItems=Array.from(document.querySelectorAll('.ops-maintenance-detail-item')).map(row=>({\n        maintenance_done:row.dataset.maintenanceItemType||'',\n        description:row.querySelector('.ops-maintenance-item-description')?.value.trim()||null,\n        parts_used:row.querySelector('.ops-maintenance-item-parts')?.value.trim()||null\n      }));"""

new_detailed = """      const detailedItems=Array.from(document.querySelectorAll('.ops-maintenance-detail-item')).map(row=>{\n        const uiType=String(row.dataset.maintenanceItemType||'').trim();\n        const detail=row.querySelector('.ops-maintenance-item-description')?.value.trim()||'';\n        const description=uiType==='Repair'?`Repair: ${detail}`:detail;\n        return {\n          maintenance_done:'Other maintenance',\n          description:description||uiType||null,\n          parts_used:row.querySelector('.ops-maintenance-item-parts')?.value.trim()||null\n        };\n      });"""

if old_routine not in s:
    raise SystemExit("Could not locate routine maintenance payload mapping")
if old_detailed not in s:
    raise SystemExit("Could not locate detailed maintenance payload mapping")

s = s.replace(old_routine, new_routine, 1)
s = s.replace(old_detailed, new_detailed, 1)
path.write_text(s, encoding="utf-8")

text = path.read_text(encoding="utf-8")
for marker in [
    "uiValue==='Engine oil changed'||uiValue==='Oil changed'?'Oil changed'",
    "uiValue==='Spark plug changed'?'Spark plug changed':'Other maintenance'",
    "maintenance_done:'Other maintenance'",
    "uiType==='Repair'?`Repair: ${detail}`:detail",
]:
    if marker not in text:
        raise SystemExit("Maintenance-save compatibility verification failed: " + marker)

print("Patched staging maintenance save to normalize UI maintenance types to the database canonical values while preserving descriptions.")

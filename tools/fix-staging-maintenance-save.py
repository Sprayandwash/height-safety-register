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

old_followup = """      if(!performedBy)return alert('Enter the service agent name.');\n      const r=await state.sb.rpc('operations_add_maintenance_record_v4053',{\n        p_record_date:byId('opsLogEntryDate')?.value||today(),\n        p_vehicle_id:vehicleId,\n        p_machinery_id:machineryId,\n        p_items:maintenanceItems,\n        p_performed_by:performedBy,\n        p_odometer:numberOrNull('opsLogEntryOdometer'),\n        p_parts_used:textOrNull('opsLogEntryParts'),\n        p_notes:textOrNull('opsLogEntryNotes'),\n        p_further_maintenance_required:textOrNull('opsLogEntryFurtherMaintenance'),\n        p_created_by:state.user.id\n      });\n      if(r.error)return alert('Maintenance record could not be saved: '+r.error.message);\n      const taskCreated=Boolean(r.data?.task_id);\n      state.maintenanceEditorOpen=false;"""

new_followup = """      if(!performedBy)return alert('Enter the service agent name.');\n      const furtherMaintenance=textOrNull('opsLogEntryFurtherMaintenance');\n      const r=await state.sb.rpc('operations_add_maintenance_record_v4053',{\n        p_record_date:byId('opsLogEntryDate')?.value||today(),\n        p_vehicle_id:vehicleId,\n        p_machinery_id:machineryId,\n        p_items:maintenanceItems,\n        p_performed_by:performedBy,\n        p_odometer:numberOrNull('opsLogEntryOdometer'),\n        p_parts_used:textOrNull('opsLogEntryParts'),\n        p_notes:textOrNull('opsLogEntryNotes'),\n        p_further_maintenance_required:furtherMaintenance,\n        p_created_by:state.user.id\n      });\n      if(r.error)return alert('Maintenance record could not be saved: '+r.error.message);\n      const taskCreated=Boolean(r.data?.task_id);\n      if(taskCreated&&furtherMaintenance){\n        const cleanedTask=await state.sb.from('operations_maintenance_tasks').update({description:furtherMaintenance}).eq('id',r.data.task_id);\n        if(cleanedTask.error)return alert('Maintenance record saved, but follow-up Task text could not be cleaned up: '+cleanedTask.error.message);\n      }\n      state.maintenanceEditorOpen=false;"""

if old_followup not in s:
    raise SystemExit("Could not locate maintenance follow-up task save block")

s = s.replace(old_followup, new_followup, 1)
path.write_text(s, encoding="utf-8")

text = path.read_text(encoding="utf-8")
for marker in [
    "uiValue==='Engine oil changed'||uiValue==='Oil changed'?'Oil changed'",
    "uiValue==='Spark plug changed'?'Spark plug changed':'Other maintenance'",
    "maintenance_done:'Other maintenance'",
    "uiType==='Repair'?`Repair: ${detail}`:detail",
    "const furtherMaintenance=textOrNull('opsLogEntryFurtherMaintenance');",
    "update({description:furtherMaintenance}).eq('id',r.data.task_id)",
]:
    if marker not in text:
        raise SystemExit("Maintenance-save compatibility verification failed: " + marker)

print("Patched staging Maintenance save values and cleaned follow-up Task descriptions.")

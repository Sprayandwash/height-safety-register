-- Spray & Wash Operations App V4.0.1
-- Add-on seed: Periodic Vehicle Checks Google Form conversion
-- Source: Periodic Vehicle Checks - Google Forms.pdf uploaded by Brendan.
-- Safe to run after supabase-schema-v4.0-operations.sql. Additive and idempotent.

-- Seed vehicles from the Google Form dropdown.
insert into public.operations_vehicles (rego, name, make_model, status, inspection_frequency_days)
values
  ('MRT70', 'Navara - MRT70', 'Nissan Navara', 'Active', 14),
  ('RQJ369', 'Dyna - RQJ369', 'Toyota Dyna', 'Active', 14),
  ('QAN557', 'Dyna - QAN557', 'Toyota Dyna', 'Active', 14),
  ('KMT606', 'Hilux - KMT606', 'Toyota Hilux', 'Active', 14)
on conflict (rego) do update set
  name = excluded.name,
  make_model = coalesce(public.operations_vehicles.make_model, excluded.make_model),
  inspection_frequency_days = excluded.inspection_frequency_days;

-- Seed the exact replacement checklist. It is vehicle-targeted because the original form selects only a vehicle.
insert into public.operations_checklist_templates (name, target_type, frequency_days, is_active)
values ('Periodic Vehicle Checks - Google Form', 'vehicle', 14, true)
on conflict (name) do update set
  target_type = excluded.target_type,
  frequency_days = excluded.frequency_days,
  is_active = excluded.is_active;

with t as (select id from public.operations_checklist_templates where name = 'Periodic Vehicle Checks - Google Form')
insert into public.operations_checklist_items (template_id, section, question_text, response_type, required, sort_order, problem_values, creates_task_on_problem, default_task_title, default_severity, photo_required_on_problem, notes_required_on_problem, help_text)
select t.id, v.section, v.question_text, v.response_type, v.required, v.sort_order, v.problem_values::jsonb, v.creates_task_on_problem, v.default_task_title, v.default_severity, v.photo_required_on_problem, v.notes_required_on_problem, v.help_text
from t, (values
  ('Vehicle checks', 'Months until Warrant of Fitness is due', 'number', true, 10, '[]'::jsonb, false, null, 'Low', false, false, 'Enter the number of months remaining. If expired or due soon, create a maintenance task or note it for the Ops Manager.'),
  ('Vehicle checks', 'Months until Registration is due', 'number', true, 20, '[]'::jsonb, false, null, 'Low', false, false, 'Enter the number of months remaining. If expired or due soon, create a maintenance task or note it for the Ops Manager.'),
  ('Vehicle checks', 'Vehicle mileage / odometer reading', 'number', true, 30, '[]'::jsonb, false, null, 'Low', false, false, 'Record the vehicle mileage. You can also use the inspection odometer field.'),
  ('Vehicle checks', 'Kilometres remaining on Road User Charges - diesel vehicles only', 'number', false, 40, '[]'::jsonb, false, null, 'Low', false, false, 'Diesel vehicles only. Leave blank or mark N/A if not applicable.'),
  ('Vehicle checks', 'Wheel nuts checked with wheel spanner for tightness', 'pass_fail_na', true, 50, '["Fail"]'::jsonb, true, 'Check/tighten vehicle wheel nuts', 'High', true, true, 'Use a wheel spanner to check tightness of all wheel nuts.'),
  ('Vehicle checks', 'Vehicle checks - any other issue to note?', 'yes_no', true, 60, '["Yes"]'::jsonb, true, 'Review vehicle check note', 'Medium', true, true, 'Select Yes if anything needs the Ops Manager to review, and describe it in notes.'),
  ('Vehicle maintenance', 'Vehicle exterior washed - wash mix applied, painted surfaces brushed, and rinsed', 'pass_fail_na', true, 100, '["Fail"]'::jsonb, true, 'Complete exterior vehicle wash', 'Low', true, true, 'Regular cleaning task to keep the vehicle presentable and in good condition.'),
  ('Vehicle maintenance', 'Vehicle tray cleaned - items removed and tray pressure washed clean', 'pass_fail_na', true, 110, '["Fail"]'::jsonb, true, 'Clean vehicle tray', 'Low', true, true, 'Remove all items from the tray before pressure washing clean.'),
  ('Vehicle maintenance', 'Vehicle cab tidied - rubbish removed and interior surfaces wiped down', 'pass_fail_na', true, 120, '["Fail"]'::jsonb, true, 'Clean and tidy vehicle cab', 'Low', true, true, 'Remove rubbish, tidy the cab, and wipe down interior surfaces.'),
  ('Vehicle maintenance', 'Truck and tray photos uploaded after cleaning', 'pass_fail_na', true, 130, '["Fail"]'::jsonb, true, 'Upload truck/tray cleaning photos', 'Low', false, true, 'Use the inspection photo upload field to attach images after cleaning.'),
  ('Vehicle maintenance', 'Vehicle maintenance - any other issue to note?', 'yes_no', true, 140, '["Yes"]'::jsonb, true, 'Review vehicle maintenance note', 'Medium', true, true, 'Select Yes if anything needs the Ops Manager to review, and describe it in notes.'),
  ('Washing equipment - trigger guns', 'Trigger guns - minimum 2 on board and in good working condition', 'pass_fail_na', true, 200, '["Fail"]'::jsonb, true, 'Replace/repair missing or faulty trigger guns', 'High', true, true, null),
  ('Washing equipment - trigger guns', 'Trigger guns - spare O-rings for quick-connect fittings present', 'pass_fail_na', true, 210, '["Fail"]'::jsonb, true, 'Restock trigger gun quick-connect O-rings', 'Medium', false, true, null),
  ('Washing equipment - wands and poles', '2 x 1 metre wands on board and in good working condition', 'pass_fail_na', true, 2200, '["Fail"]'::jsonb, true, 'Restock/repair 1 metre wands', 'Medium', true, true, null),
  ('Washing equipment - wands and poles', '1 x 2 metre wand on board and in good working condition', 'pass_fail_na', true, 2210, '["Fail"]'::jsonb, true, 'Restock/repair 2 metre wand', 'Medium', true, true, null),
  ('Washing equipment - wands and poles', '1 x 0.5 metre wand on board and in good working condition', 'pass_fail_na', true, 2220, '["Fail"]'::jsonb, true, 'Restock/repair 0.5 metre wand', 'Medium', true, true, null),
  ('Washing equipment - wands and poles', '10m extendable brush on board and in good working condition', 'pass_fail_na', true, 2230, '["Fail"]'::jsonb, true, 'Restock/repair 10m extendable brush', 'Medium', true, true, null),
  ('Washing equipment - wands and poles', '12m carbon wash pole on board and in good working condition', 'pass_fail_na', true, 2240, '["Fail"]'::jsonb, true, 'Restock/repair 12m carbon wash pole', 'Medium', true, true, null),
  ('Washing equipment - wands and poles', '1 x stubby gutter attachment on board and in good working condition', 'pass_fail_na', true, 2250, '["Fail"]'::jsonb, true, 'Restock/repair stubby gutter attachment', 'Medium', true, true, null),
  ('Washing equipment - nozzles', '2 x White 90''s nozzles present', 'pass_fail_na', true, 300, '["Fail"]'::jsonb, true, 'Restock White 90''s nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x White 60''s nozzles present', 'pass_fail_na', true, 310, '["Fail"]'::jsonb, true, 'Restock White 60''s nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x White 45''s nozzles present', 'pass_fail_na', true, 320, '["Fail"]'::jsonb, true, 'Restock White 45''s nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x Red nozzles present', 'pass_fail_na', true, 330, '["Fail"]'::jsonb, true, 'Restock Red nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x Chem Jet nozzles present', 'pass_fail_na', true, 340, '["Fail"]'::jsonb, true, 'Restock Chem Jet nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x Chem fan nozzles present', 'pass_fail_na', true, 350, '["Fail"]'::jsonb, true, 'Restock Chem fan nozzles', 'Medium', false, true, null),
  ('Washing equipment - nozzles', '2 x Turbo nozzles present', 'pass_fail_na', true, 360, '["Fail"]'::jsonb, true, 'Restock Turbo nozzles', 'Medium', false, true, null),
  ('Washing equipment - plumbing fittings', 'Sufficient spare tap connectors present', 'pass_fail_na', true, 380, '["Fail"]'::jsonb, true, 'Restock spare tap connectors', 'Medium', false, true, null),
  ('Washing equipment - plumbing fittings', 'Sufficient spare end-of-hose fittings present', 'pass_fail_na', true, 390, '["Fail"]'::jsonb, true, 'Restock spare end-of-hose fittings', 'Medium', false, true, null),
  ('Washing equipment - ladders', 'Ladder levelling feet flushed with high-pressure water to remove dirt', 'pass_fail_na', true, 400, '["Fail"]'::jsonb, true, 'Clean ladder levelling feet', 'Medium', true, true, null),
  ('Washing equipment - ladders', 'Ladder levelling feet sliding areas lubricated with WD40', 'pass_fail_na', true, 410, '["Fail"]'::jsonb, true, 'Lubricate ladder levelling feet', 'Medium', true, true, null),
  ('Washing equipment - ladders', 'Ladders checked for damage', 'pass_fail_na', true, 420, '["Fail"]'::jsonb, true, 'Inspect/repair damaged ladder', 'High', true, true, 'If ladder damage is found, remove it from service and advise the Ops Manager.'),
  ('Washing equipment - surface cleaner', 'Surface cleaner working correctly with no damage, wear, or tear', 'pass_fail_na', true, 430, '["Fail"]'::jsonb, true, 'Repair or replace surface cleaner', 'High', true, true, null),
  ('Washing equipment - pure water system', 'Pure water system tested - water purity is 20ppm or below', 'pass_fail_na', true, 440, '["Fail"]'::jsonb, true, 'Investigate pure water reading above 20ppm', 'Medium', true, true, 'Original form says report if reading is above 20ppm.'),
  ('Washing equipment - pure water system', 'Pure water system hoses in good condition', 'pass_fail_na', true, 450, '["Fail"]'::jsonb, true, 'Repair/replace pure water system hoses', 'Medium', true, true, null),
  ('Washing equipment - pure water system', 'Water fed pole present and in good order', 'pass_fail_na', true, 460, '["Fail"]'::jsonb, true, 'Repair/replace water fed pole', 'Medium', true, true, null),
  ('Washing equipment - tools', 'Screwdrivers (+ and -) present', 'pass_fail_na', true, 500, '["Fail"]'::jsonb, true, 'Restock screwdrivers', 'Low', false, true, null),
  ('Washing equipment - tools', '22mm spanner present', 'pass_fail_na', true, 510, '["Fail"]'::jsonb, true, 'Restock 22mm spanner', 'Low', false, true, null),
  ('Washing equipment - tools', '24mm spanner present', 'pass_fail_na', true, 520, '["Fail"]'::jsonb, true, 'Restock 24mm spanner', 'Low', false, true, null),
  ('Washing equipment - tools', 'Large adjustable spanner present', 'pass_fail_na', true, 530, '["Fail"]'::jsonb, true, 'Restock large adjustable spanner', 'Low', false, true, null),
  ('Washing equipment - tools', 'Socket set present', 'pass_fail_na', true, 540, '["Fail"]'::jsonb, true, 'Restock socket set', 'Low', false, true, null),
  ('Washing equipment - tools', 'Dentist picks present', 'pass_fail_na', true, 550, '["Fail"]'::jsonb, true, 'Restock dentist picks', 'Low', false, true, null),
  ('Washing equipment - tools', 'Adjustable parrot grips present', 'pass_fail_na', true, 560, '["Fail"]'::jsonb, true, 'Restock adjustable parrot grips', 'Low', false, true, null),
  ('Washing equipment - tools', 'Thread tape present', 'pass_fail_na', true, 570, '["Fail"]'::jsonb, true, 'Restock thread tape', 'Low', false, true, null),
  ('Washing equipment - tools', 'WD40 or similar present', 'pass_fail_na', true, 580, '["Fail"]'::jsonb, true, 'Restock WD40 or equivalent', 'Low', false, true, null),
  ('Washing equipment', 'Washing equipment checks - any other issue to note?', 'yes_no', true, 590, '["Yes"]'::jsonb, true, 'Review washing equipment note', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'First Aid Kit present and in usable condition', 'pass_fail_na', true, 600, '["Fail"]'::jsonb, true, 'Restock/replace first aid kit', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Eye wash present and in usable condition', 'pass_fail_na', true, 610, '["Fail"]'::jsonb, true, 'Restock/replace eye wash', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Fire extinguisher pressure gauge is in the green', 'pass_fail_na', true, 620, '["Fail"]'::jsonb, true, 'Service/replace fire extinguisher', 'High', true, true, null),
  ('Safety equipment - PPE', 'Fire extinguisher plastic tag is in place', 'pass_fail_na', true, 630, '["Fail"]'::jsonb, true, 'Check fire extinguisher tag', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Safety glasses present and in good condition', 'pass_fail_na', true, 640, '["Fail"]'::jsonb, true, 'Restock/replace safety glasses', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Hearing protection present and in good condition', 'pass_fail_na', true, 650, '["Fail"]'::jsonb, true, 'Restock/replace hearing protection', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Rubber chemical gloves present and in good condition', 'pass_fail_na', true, 660, '["Fail"]'::jsonb, true, 'Restock/replace rubber chemical gloves', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Sign board and base present and in good condition', 'pass_fail_na', true, 670, '["Fail"]'::jsonb, true, 'Restock/replace sign board and base', 'Low', false, true, null),
  ('Safety equipment - PPE', 'Safety cones present and in good condition', 'pass_fail_na', true, 680, '["Fail"]'::jsonb, true, 'Restock/replace safety cones', 'Low', false, true, null),
  ('Safety equipment - PPE', 'MSDS sheet folder present', 'pass_fail_na', true, 690, '["Fail"]'::jsonb, true, 'Replace/update MSDS sheet folder', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Sunscreen present', 'pass_fail_na', true, 700, '["Fail"]'::jsonb, true, 'Restock sunscreen', 'Low', false, true, null),
  ('Safety equipment - PPE', 'Ladder pad present and in good condition', 'pass_fail_na', true, 710, '["Fail"]'::jsonb, true, 'Restock/replace ladder pad', 'Medium', true, true, null),
  ('Safety equipment - PPE', 'Gutter clamp present and in good condition', 'pass_fail_na', true, 720, '["Fail"]'::jsonb, true, 'Restock/replace gutter clamp', 'Medium', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Engine oil level OK', 'pass_fail_na', true, 800, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Check/top up engine oil', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Engine oil colour OK - golden and clear, not black or cloudy', 'pass_fail_na', true, 810, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Change/investigate engine oil condition', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Pump oil level OK', 'pass_fail_na', true, 820, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Check/top up pump oil', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Pump oil colour OK - golden and clear, not black or cloudy', 'pass_fail_na', true, 830, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Change/investigate pump oil condition', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Water and grit sucked out from fuel tank with syringe', 'pass_fail_na', true, 840, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Remove water/grit from fuel tank', 'Medium', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Pump and unloader valve checked for leaks', 'pass_fail_na', true, 850, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Investigate pump/unloader valve leak', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - Pressure hose and swivel checked for leaks', 'pass_fail_na', true, 860, '["Fail"]'::jsonb, true, 'Drivers side engine and pump - Investigate pressure hose or swivel leak', 'High', true, true, null),
  ('Drivers side engine and pump', 'Drivers side engine and pump - any other issue to note?', 'yes_no', true, 880, '["Yes"]'::jsonb, true, 'Review drivers side engine and pump note', 'Medium', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Engine oil level OK', 'pass_fail_na', true, 900, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Check/top up engine oil', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Engine oil colour OK - golden and clear, not black or cloudy', 'pass_fail_na', true, 910, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Change/investigate engine oil condition', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Pump oil level OK', 'pass_fail_na', true, 920, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Check/top up pump oil', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Pump oil colour OK - golden and clear, not black or cloudy', 'pass_fail_na', true, 930, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Change/investigate pump oil condition', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Water and grit sucked out from fuel tank with syringe', 'pass_fail_na', true, 940, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Remove water/grit from fuel tank', 'Medium', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Pump and unloader valve checked for leaks', 'pass_fail_na', true, 950, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Investigate pump/unloader valve leak', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - Pressure hose and swivel checked for leaks', 'pass_fail_na', true, 960, '["Fail"]'::jsonb, true, 'Passenger side engine and pump - Investigate pressure hose or swivel leak', 'High', true, true, null),
  ('Passenger side engine and pump', 'Passenger side engine and pump - any other issue to note?', 'yes_no', true, 980, '["Yes"]'::jsonb, true, 'Review passenger side engine and pump note', 'Medium', true, true, null)
) as v(section, question_text, response_type, required, sort_order, problem_values, creates_task_on_problem, default_task_title, default_severity, photo_required_on_problem, notes_required_on_problem, help_text)
on conflict (template_id, question_text) do update set
  section = excluded.section,
  response_type = excluded.response_type,
  required = excluded.required,
  sort_order = excluded.sort_order,
  problem_values = excluded.problem_values,
  creates_task_on_problem = excluded.creates_task_on_problem,
  default_task_title = excluded.default_task_title,
  default_severity = excluded.default_severity,
  photo_required_on_problem = excluded.photo_required_on_problem,
  notes_required_on_problem = excluded.notes_required_on_problem,
  help_text = excluded.help_text,
  is_active = true;

-- Additional procedures from the uploaded periodic check form.
insert into public.operations_maintenance_procedures
(name, category, target_type, description, frequency_days, frequency_hours, estimated_minutes, skill_level, requires_signoff, safety_summary, tools_required, parts_required, is_active)
values ('Fuel tank water/grit removal with syringe', 'Engine', 'washing_equipment', 'Basic check from the periodic vehicle form: remove visible water and grit from small petrol engine fuel tanks using a syringe or approved suction tool. Confirm the method is suitable for the actual engine/fuel tank before use.', 14, null, 10, 'Basic', false, 'Work outside or in a ventilated area, away from ignition sources. Stop engine and allow it to cool. Wear gloves and eye protection. Store/dispose of contaminated fuel safely.', 'Fuel-safe syringe or suction tool, clean container for contaminated fuel/water, rag, gloves, eye protection.', 'None unless fuel line/filter or cap seal is found damaged.', true)
on conflict (name) do update set
  category = excluded.category,
  target_type = excluded.target_type,
  description = excluded.description,
  frequency_days = excluded.frequency_days,
  frequency_hours = excluded.frequency_hours,
  estimated_minutes = excluded.estimated_minutes,
  skill_level = excluded.skill_level,
  requires_signoff = excluded.requires_signoff,
  safety_summary = excluded.safety_summary,
  tools_required = excluded.tools_required,
  parts_required = excluded.parts_required,
  is_active = true;

with p as (select id from public.operations_maintenance_procedures where name = 'Fuel tank water/grit removal with syringe')
insert into public.operations_maintenance_procedure_steps (procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading)
select p.id, v.step_number, v.title, v.instruction, v.safety_note, v.requires_photo, v.requires_reading
from p, (values
  (1, 'Prepare safely', 'Stop the engine, allow it to cool, keep ignition sources away, and place the machine on stable level ground.', 'Petrol vapour is flammable.', false, false),
  (2, 'Open and inspect tank', 'Open the fuel cap and inspect for visible water, grit, debris, or contamination.', 'Avoid dropping dirt into the tank.', true, false),
  (3, 'Remove contamination', 'Use the syringe or approved suction tool to remove visible water and grit from the lowest practical point in the tank.', 'Use only fuel-safe equipment and avoid spills.', false, false),
  (4, 'Store waste safely', 'Put contaminated fuel/water into a suitable container for safe disposal. Wipe any spills.', 'Do not pour contaminated fuel into drains or onto ground.', false, false),
  (5, 'Refit and test', 'Refit fuel cap, check for leaks, and test run only when safe.', 'Keep clear of hot/moving parts.', false, false),
  (6, 'Record completion', 'Record the inspection/maintenance completion, any contamination found, and whether further servicing is needed.', '', false, true)
) as v(step_number, title, instruction, safety_note, requires_photo, requires_reading)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading;

insert into public.operations_maintenance_procedures
(name, category, target_type, description, frequency_days, frequency_hours, estimated_minutes, skill_level, requires_signoff, safety_summary, tools_required, parts_required, is_active)
values ('Ladder levelling feet clean and lubricate', 'Ladders', 'vehicle', 'Clean ladder levelling feet with high-pressure water, lubricate sliding areas with WD40 or similar, and check for damage as required by the periodic vehicle form.', 14, null, 15, 'Basic', false, 'Place ladder securely on the ground before working. Do not use a damaged ladder. Keep hands clear of sliding/pinch points.', 'High-pressure water source, WD40 or similar, rag, eye protection.', 'Replacement levelling foot parts only if damage is found.', true)
on conflict (name) do update set
  category = excluded.category,
  target_type = excluded.target_type,
  description = excluded.description,
  frequency_days = excluded.frequency_days,
  frequency_hours = excluded.frequency_hours,
  estimated_minutes = excluded.estimated_minutes,
  skill_level = excluded.skill_level,
  requires_signoff = excluded.requires_signoff,
  safety_summary = excluded.safety_summary,
  tools_required = excluded.tools_required,
  parts_required = excluded.parts_required,
  is_active = true;

with p as (select id from public.operations_maintenance_procedures where name = 'Ladder levelling feet clean and lubricate')
insert into public.operations_maintenance_procedure_steps (procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading)
select p.id, v.step_number, v.title, v.instruction, v.safety_note, v.requires_photo, v.requires_reading
from p, (values
  (1, 'Inspect before cleaning', 'Place ladder securely and inspect levelling feet for obvious damage or excessive wear.', 'Remove damaged ladder from service.', true, false),
  (2, 'Flush dirt', 'Flush levelling feet and sliding areas with high-pressure water to remove dirt and grit.', 'Wear eye protection and avoid directing water at people.', false, false),
  (3, 'Dry and lubricate', 'Let excess water drain, wipe if needed, then lubricate sliding areas with WD40 or similar.', 'Keep hands clear of pinch points.', false, false),
  (4, 'Function check', 'Operate the levelling feet through their movement and confirm smooth operation.', 'Do not force damaged parts.', false, false),
  (5, 'Record completion', 'Record completion and any parts/damage requiring follow-up.', '', false, false)
) as v(step_number, title, instruction, safety_note, requires_photo, requires_reading)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading;

insert into public.operations_maintenance_procedures
(name, category, target_type, description, frequency_days, frequency_hours, estimated_minutes, skill_level, requires_signoff, safety_summary, tools_required, parts_required, is_active)
values ('Pure water TDS test', 'Pure Water', 'vehicle', 'Test pure water system quality and report if the reading is above 20ppm, matching the periodic vehicle check requirement.', 14, null, 5, 'Basic', false, 'Use clean sampling practices. Avoid splashes around electrical equipment.', 'TDS meter, clean sample container if required.', 'DI resin or filters if replacement is needed after high readings.', true)
on conflict (name) do update set
  category = excluded.category,
  target_type = excluded.target_type,
  description = excluded.description,
  frequency_days = excluded.frequency_days,
  frequency_hours = excluded.frequency_hours,
  estimated_minutes = excluded.estimated_minutes,
  skill_level = excluded.skill_level,
  requires_signoff = excluded.requires_signoff,
  safety_summary = excluded.safety_summary,
  tools_required = excluded.tools_required,
  parts_required = excluded.parts_required,
  is_active = true;

with p as (select id from public.operations_maintenance_procedures where name = 'Pure water TDS test')
insert into public.operations_maintenance_procedure_steps (procedure_id, step_number, title, instruction, safety_note, requires_photo, requires_reading)
select p.id, v.step_number, v.title, v.instruction, v.safety_note, v.requires_photo, v.requires_reading
from p, (values
  (1, 'Prepare meter', 'Confirm the TDS meter is clean and ready to use.', 'Follow meter instructions.', false, false),
  (2, 'Take sample', 'Run water briefly and take a representative sample from the pure water system.', 'Avoid contaminating the sample.', false, false),
  (3, 'Record reading', 'Measure and record the ppm reading. A reading above 20ppm must be reported.', '', false, true),
  (4, 'Create follow-up if high', 'If above 20ppm, create or complete a maintenance task to investigate resin/filter condition.', '', false, false),
  (5, 'Record completion', 'Save the reading and notes in the app.', '', false, false)
) as v(step_number, title, instruction, safety_note, requires_photo, requires_reading)
on conflict (procedure_id, step_number) do update set
  title = excluded.title,
  instruction = excluded.instruction,
  safety_note = excluded.safety_note,
  requires_photo = excluded.requires_photo,
  requires_reading = excluded.requires_reading;


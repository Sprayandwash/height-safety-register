-- Spray & Wash Operations App V4.0.3 corrective release
-- Run AFTER V4.0.1/V4.0.2. Additive/safe: no table/column deletes, no storage bucket changes.

begin;

-- 1) Rename the vehicle checklist and archive/merge the old Google-form naming if both exist.
do $$
declare
  old_id uuid;
  new_id uuid;
begin
  select id into old_id
  from public.operations_checklist_templates
  where name = 'Periodic Vehicle Checks - Google Form'
  order by created_at
  limit 1;

  select id into new_id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  order by created_at
  limit 1;

  if new_id is null and old_id is not null then
    update public.operations_checklist_templates
    set name = 'Vehicle Inspection Checklist', target_type = 'vehicle', is_active = true, frequency_days = 14
    where id = old_id;
    new_id := old_id;
  elsif new_id is not null and old_id is not null and new_id <> old_id then
    update public.operations_checklist_items
    set template_id = new_id
    where template_id = old_id
      and not exists (
        select 1 from public.operations_checklist_items existing
        where existing.template_id = new_id
          and existing.question_text = operations_checklist_items.question_text
      );
    update public.operations_checklist_templates
    set is_active = false,
        name = 'Periodic Vehicle Checks - Google Form - archived ' || left(old_id::text, 8)
    where id = old_id;
  elsif new_id is null then
    insert into public.operations_checklist_templates(name, target_type, frequency_days, is_active)
    values ('Vehicle Inspection Checklist', 'vehicle', 14, true)
    returning id into new_id;
  end if;

  update public.operations_checklist_templates
  set target_type = 'vehicle', is_active = true, frequency_days = 14
  where id = new_id;
end $$;

-- 2) Rework the vehicle checklist: one active checklist, grouped sections, blank UI default handled in JS.
with t as (
  select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1
)
update public.operations_checklist_items i
set
  required = true,
  pass_values = case when i.response_type in ('pass_fail','pass_fail_na','yes_no','choice') then '["Completed OK","N/A"]'::jsonb else i.pass_values end,
  problem_values = case when i.response_type in ('pass_fail','pass_fail_na','yes_no','choice') then '["Issue to report"]'::jsonb else i.problem_values end,
  response_type = case when i.response_type = 'yes_no' then 'pass_fail_na' else i.response_type end,
  photo_required_on_problem = false,
  notes_required_on_problem = case when i.creates_task_on_problem then true else i.notes_required_on_problem end
from t
where i.template_id = t.id;

-- Make RUC response text so petrol vehicles can answer N/A while still giving a response.
with t as (select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1)
update public.operations_checklist_items i
set response_type = 'text', required = true, help_text = 'Enter kilometres remaining for diesel vehicles, or N/A for petrol vehicles.'
from t
where i.template_id = t.id
  and i.question_text ilike '%Road User Charges%';

-- Deactivate separate cab/tray/photo items; replace them with a single combined cleaning item.
with t as (select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1)
update public.operations_checklist_items i
set is_active = false
from t
where i.template_id = t.id
  and (
    i.question_text ilike '%Vehicle tray cleaned%'
    or i.question_text ilike '%Vehicle cab tidied%'
    or i.question_text ilike '%Truck and tray photos uploaded%'
  );

with t as (select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1)
insert into public.operations_checklist_items
  (template_id, section, question_text, response_type, required, sort_order, pass_values, problem_values, creates_task_on_problem, default_task_title, default_severity, photo_required_on_problem, notes_required_on_problem, help_text, is_active)
select t.id,
  'Vehicle cleaning',
  'Vehicle cab and tray cleaned - rubbish removed, cab tidied, interior surfaces wiped down, tray items removed and tray pressure washed clean',
  'pass_fail_na',
  true,
  120,
  '["Completed OK","N/A"]'::jsonb,
  '["Issue to report"]'::jsonb,
  true,
  'Complete cab and tray cleaning',
  'Low',
  false,
  true,
  'This combines the old separate cab and tray cleaning boxes into one checklist item.',
  true
from t
on conflict (template_id, question_text) do update set
  section = excluded.section,
  response_type = excluded.response_type,
  required = excluded.required,
  sort_order = excluded.sort_order,
  pass_values = excluded.pass_values,
  problem_values = excluded.problem_values,
  creates_task_on_problem = excluded.creates_task_on_problem,
  default_task_title = excluded.default_task_title,
  default_severity = excluded.default_severity,
  photo_required_on_problem = excluded.photo_required_on_problem,
  notes_required_on_problem = excluded.notes_required_on_problem,
  help_text = excluded.help_text,
  is_active = true;

-- Only the exterior wash item should show an item-level photo upload portal.
with t as (select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1)
update public.operations_checklist_items i
set photo_required_on_problem = case when i.question_text ilike '%Vehicle exterior washed%' then true else false end,
    help_text = case when i.question_text ilike '%Vehicle exterior washed%' then 'Upload exterior vehicle photos here after washing.' else i.help_text end
from t
where i.template_id = t.id;

-- Group and order the checklist more logically.
with t as (select id from public.operations_checklist_templates where name = 'Vehicle Inspection Checklist' limit 1)
update public.operations_checklist_items i
set section = case
    when i.question_text ilike '%Warrant of Fitness%' or i.question_text ilike '%Registration%' or i.question_text ilike '%mileage%' or i.question_text ilike '%odometer%' or i.question_text ilike '%Road User Charges%' or i.question_text ilike '%Wheel nuts%' or i.question_text ilike 'Vehicle checks - any other%' then 'Vehicle checks'
    when i.question_text ilike '%Vehicle exterior washed%' or i.question_text ilike '%cab and tray cleaned%' or i.question_text ilike 'Vehicle maintenance - any other%' then 'Vehicle cleaning'
    when i.question_text ilike '%First Aid%' or i.question_text ilike '%Eye wash%' or i.question_text ilike '%Fire extinguisher%' or i.question_text ilike '%Safety glasses%' or i.question_text ilike '%Hearing protection%' or i.question_text ilike '%chemical gloves%' or i.question_text ilike '%Sign board%' or i.question_text ilike '%Safety cones%' or i.question_text ilike '%MSDS%' or i.question_text ilike '%Sunscreen%' or i.question_text ilike '%Ladder pad%' or i.question_text ilike '%Gutter clamp%' then 'Safety equipment / PPE'
    when i.question_text ilike '%Screwdrivers%' or i.question_text ilike '%spanner%' or i.question_text ilike '%Socket set%' or i.question_text ilike '%Dentist picks%' or i.question_text ilike '%parrot grips%' or i.question_text ilike '%Thread tape%' or i.question_text ilike '%WD40%' then 'Tools'
    when i.question_text ilike '%engine%' or i.question_text ilike '%pump%' or i.question_text ilike '%unloader%' or i.question_text ilike '%pressure hose%' or i.question_text ilike '%swivel%' or i.question_text ilike '%fuel tank%' then 'Engine, pump, hose reel and unloader checks'
    else 'Washing equipment checks'
  end,
  sort_order = case
    when i.question_text ilike '%Warrant of Fitness%' then 10
    when i.question_text ilike '%Registration%' then 20
    when i.question_text ilike '%mileage%' or i.question_text ilike '%odometer%' then 30
    when i.question_text ilike '%Road User Charges%' then 40
    when i.question_text ilike '%Wheel nuts%' then 50
    when i.question_text ilike 'Vehicle checks - any other%' then 60
    when i.question_text ilike '%Vehicle exterior washed%' then 100
    when i.question_text ilike '%cab and tray cleaned%' then 120
    when i.question_text ilike 'Vehicle maintenance - any other%' then 140
    when i.question_text ilike '%Trigger guns%' then 200
    when i.question_text ilike '%wand%' or i.question_text ilike '%pole%' or i.question_text ilike '%brush%' or i.question_text ilike '%gutter attachment%' then 220
    when i.question_text ilike '%nozzle%' then 300
    when i.question_text ilike '%tap connectors%' or i.question_text ilike '%end-of-hose%' then 380
    when i.question_text ilike '%Surface cleaner%' then 430
    when i.question_text ilike '%Pure water%' or i.question_text ilike '%Water fed pole%' then 440
    when i.question_text ilike '%Ladder levelling%' or i.question_text ilike '%Ladders checked%' then 470
    when i.question_text ilike '%Screwdrivers%' or i.question_text ilike '%spanner%' or i.question_text ilike '%Socket set%' or i.question_text ilike '%Dentist picks%' or i.question_text ilike '%parrot grips%' or i.question_text ilike '%Thread tape%' or i.question_text ilike '%WD40%' then 500
    when i.question_text ilike '%First Aid%' or i.question_text ilike '%Eye wash%' or i.question_text ilike '%Fire extinguisher%' or i.question_text ilike '%Safety glasses%' or i.question_text ilike '%Hearing protection%' or i.question_text ilike '%chemical gloves%' or i.question_text ilike '%Sign board%' or i.question_text ilike '%Safety cones%' or i.question_text ilike '%MSDS%' or i.question_text ilike '%Sunscreen%' or i.question_text ilike '%Ladder pad%' or i.question_text ilike '%Gutter clamp%' then 600
    when i.question_text ilike '%Drivers side%' then 800
    when i.question_text ilike '%Passenger side%' then 900
    else i.sort_order
  end
from t
where i.template_id = t.id;

-- 3) Standard preventive maintenance procedure templates.
insert into public.operations_maintenance_procedures
(name, category, target_type, description, frequency_days, frequency_hours, estimated_minutes, skill_level, requires_signoff, safety_summary, tools_required, parts_required, is_active)
values
('Air filter check/replacement','Engine','washing_equipment','Check and clean or replace the petrol engine air filter. Confirm the exact filter type from the engine manual.',90,null,10,'Basic',false,'Stop engine and allow hot parts to cool. Do not run the engine without the filter fitted.','Screwdriver/socket if required, clean rag.','Correct replacement air filter if required.',true),
('Spark plug inspection/replacement','Engine','washing_equipment','Inspect or replace the petrol engine spark plug. Confirm plug type and gap from the engine manual.',365,null,15,'Basic',false,'Stop engine, allow to cool, and disconnect ignition lead before removing plug.','Spark plug socket, gap tool if trained.','Correct spark plug from manufacturer manual.',true),
('Unloader valve check','Pump','washing_equipment','Check the unloader valve area for leaks, sticking, pressure cycling, or unusual behaviour.',90,null,15,'Intermediate',false,'Release pressure before touching fittings. Never inspect high-pressure leaks with your hand.','Torch, rag, suitable spanners if trained.','O-rings/fittings only if required.',true),
('Hose reel inspection','Hose Reel','washing_equipment','Inspect hose reel, swivel, reel frame and hose condition for leaks, wear, stiffness or damage.',30,null,10,'Basic',false,'Release pressure before inspecting or tightening fittings.','Torch, rag.','Replacement O-rings/fittings only if required.',true)
on conflict (name) do update set
  category = excluded.category,
  target_type = excluded.target_type,
  description = excluded.description,
  frequency_days = excluded.frequency_days,
  frequency_hours = null,
  estimated_minutes = excluded.estimated_minutes,
  skill_level = excluded.skill_level,
  requires_signoff = excluded.requires_signoff,
  safety_summary = excluded.safety_summary,
  tools_required = excluded.tools_required,
  parts_required = excluded.parts_required,
  is_active = true;

-- Remove hour wording from existing guide steps where possible.
update public.operations_maintenance_procedure_steps
set instruction = replace(instruction, 'Record hours, oil used, notes and next due schedule.', 'Record completion date, oil used, notes and next due schedule.')
where instruction ilike '%Record hours%';

update public.operations_maintenance_procedure_steps
set instruction = replace(instruction, 'Record engine hours, oil used, notes and next due schedule.', 'Record completion date, oil used, notes and next due schedule.')
where instruction ilike '%Record engine hours%';

-- 4) Version marker.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'key')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_settings' and column_name = 'value') then
    insert into public.app_settings(key, value)
    values ('operations_module_version', '4.0.3')
    on conflict (key) do update set value = excluded.value;
  end if;
exception when others then
  null;
end $$;

commit;

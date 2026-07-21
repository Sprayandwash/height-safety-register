-- Spray & Wash Operations V4.0.45
-- Additive, idempotent Mechanical Checks update and queued Tools addition.
-- Existing checklist rows and historical inspection answers are retained.

begin;

do $$
begin
  if not exists (
    select 1
    from public.operations_checklist_templates
    where name = 'Vehicle Inspection Checklist'
  ) then
    raise exception 'Vehicle Inspection Checklist template was not found. No changes were applied.';
  end if;
end
$$;

-- Add the queued Tools item after the V4.0.44 Tools list.
with template as (
  select id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  limit 1
)
insert into public.operations_checklist_items (
  template_id,
  section,
  question_text,
  response_type,
  required,
  sort_order,
  pass_values,
  problem_values,
  creates_task_on_problem,
  default_task_title,
  default_severity,
  photo_required_on_problem,
  notes_required_on_problem,
  help_text,
  is_active
)
select
  template.id,
  'Tools',
  'Fuel tank residue removal syringe',
  'pass_fail_na',
  true,
  560,
  '["Completed OK","N/A"]'::jsonb,
  '["Issue to report"]'::jsonb,
  true,
  'Restock fuel tank residue removal syringe',
  'Low',
  false,
  true,
  null,
  true
from template
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
  is_active = true,
  updated_at = now();

-- Retire the previous mechanical rows, including the earlier combined section.
-- Rerunning this migration also retires and then reactivates its own final rows.
with template as (
  select id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  limit 1
)
update public.operations_checklist_items item
set is_active = false,
    updated_at = now()
from template
where item.template_id = template.id
  and lower(trim(coalesce(item.section, ''))) in (
    'drivers side engine and pump',
    'driver side engine and pump',
    'passenger side engine and pump',
    'engine, pump, hose reel and unloader checks',
    'mechanical checks - driver side',
    'mechanical checks - passenger side'
  );

-- Create the final Driver side and Passenger side mechanical checks. Question
-- text includes the side so the existing unique checklist index is respected.
with template as (
  select id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  limit 1
), mechanical_items (
  section,
  question_text,
  response_type,
  response_options,
  sort_order,
  pass_values,
  problem_values,
  default_task_title,
  default_severity,
  help_text
) as (
  values
    ('Mechanical checks - Driver side', 'Driver side engine oil - What level is the oil?', 'choice', '["Oil level visible","Oil level not visible"]'::jsonb, 800, '["Oil level visible"]'::jsonb, '["Oil level not visible"]'::jsonb, 'Driver side - check or top up engine oil', 'High', 'Engine oil level should be visible just inside the dipstick hole.'),
    ('Mechanical checks - Driver side', 'Driver side engine oil - What colour is the oil?', 'choice', '["Golden and clear","Dark brown or black","Cloudy"]'::jsonb, 810, '["Golden and clear"]'::jsonb, '["Dark brown or black","Cloudy"]'::jsonb, 'Driver side - investigate engine oil condition', 'High', null),
    ('Mechanical checks - Driver side', 'Driver side pump oil - What level is the oil?', 'choice', '["Oil level visible","Oil level not visible"]'::jsonb, 820, '["Oil level visible"]'::jsonb, '["Oil level not visible"]'::jsonb, 'Driver side - check or top up pump oil', 'High', 'Pump oil level should be visible halfway up the sight glass.'),
    ('Mechanical checks - Driver side', 'Driver side pump oil - What colour is the oil?', 'choice', '["Golden and clear","Dark brown or black","Cloudy"]'::jsonb, 830, '["Golden and clear"]'::jsonb, '["Dark brown or black","Cloudy"]'::jsonb, 'Driver side - investigate pump oil condition', 'High', null),
    ('Mechanical checks - Driver side', 'Driver side fuel tank - Water and grit sucked out from fuel tank with syringe', 'pass_fail_na', '[]'::jsonb, 840, '["Completed OK","N/A"]'::jsonb, '["Issue to report"]'::jsonb, 'Driver side - remove water and grit from fuel tank', 'Medium', null),
    ('Mechanical checks - Driver side', 'Driver side - Check for leaks in the pump/unloader/hoses', 'pass_fail_na', '[]'::jsonb, 850, '["Completed OK","N/A"]'::jsonb, '["Issue to report"]'::jsonb, 'Driver side - investigate pump, unloader or hose leaks', 'High', null),
    ('Mechanical checks - Passenger side', 'Passenger side engine oil - What level is the oil?', 'choice', '["Oil level visible","Oil level not visible"]'::jsonb, 900, '["Oil level visible"]'::jsonb, '["Oil level not visible"]'::jsonb, 'Passenger side - check or top up engine oil', 'High', 'Engine oil level should be visible just inside the dipstick hole.'),
    ('Mechanical checks - Passenger side', 'Passenger side engine oil - What colour is the oil?', 'choice', '["Golden and clear","Dark brown or black","Cloudy"]'::jsonb, 910, '["Golden and clear"]'::jsonb, '["Dark brown or black","Cloudy"]'::jsonb, 'Passenger side - investigate engine oil condition', 'High', null),
    ('Mechanical checks - Passenger side', 'Passenger side pump oil - What level is the oil?', 'choice', '["Oil level visible","Oil level not visible"]'::jsonb, 920, '["Oil level visible"]'::jsonb, '["Oil level not visible"]'::jsonb, 'Passenger side - check or top up pump oil', 'High', 'Pump oil level should be visible halfway up the sight glass.'),
    ('Mechanical checks - Passenger side', 'Passenger side pump oil - What colour is the oil?', 'choice', '["Golden and clear","Dark brown or black","Cloudy"]'::jsonb, 930, '["Golden and clear"]'::jsonb, '["Dark brown or black","Cloudy"]'::jsonb, 'Passenger side - investigate pump oil condition', 'High', null),
    ('Mechanical checks - Passenger side', 'Passenger side fuel tank - Water and grit sucked out from fuel tank with syringe', 'pass_fail_na', '[]'::jsonb, 940, '["Completed OK","N/A"]'::jsonb, '["Issue to report"]'::jsonb, 'Passenger side - remove water and grit from fuel tank', 'Medium', null),
    ('Mechanical checks - Passenger side', 'Passenger side - Check for leaks in the pump/unloader/hoses', 'pass_fail_na', '[]'::jsonb, 950, '["Completed OK","N/A"]'::jsonb, '["Issue to report"]'::jsonb, 'Passenger side - investigate pump, unloader or hose leaks', 'High', null)
)
insert into public.operations_checklist_items (
  template_id,
  section,
  question_text,
  response_type,
  response_options,
  required,
  sort_order,
  pass_values,
  problem_values,
  creates_task_on_problem,
  default_task_title,
  default_severity,
  photo_required_on_problem,
  notes_required_on_problem,
  help_text,
  is_active
)
select
  template.id,
  mechanical_items.section,
  mechanical_items.question_text,
  mechanical_items.response_type,
  mechanical_items.response_options,
  true,
  mechanical_items.sort_order,
  mechanical_items.pass_values,
  mechanical_items.problem_values,
  true,
  mechanical_items.default_task_title,
  mechanical_items.default_severity,
  true,
  true,
  mechanical_items.help_text,
  true
from template
cross join mechanical_items
on conflict (template_id, question_text) do update set
  section = excluded.section,
  response_type = excluded.response_type,
  response_options = excluded.response_options,
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
  is_active = true,
  updated_at = now();

commit;

-- Spray & Wash Operations V4.0.47
-- Checklist wording and ordering changes collected after V4.0.46.
-- Run once in Supabase SQL Editor before uploading the V4.0.47 application files.

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

-- Retire the previous TDS wording while preserving it for inspection history.
with template as (
  select id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  limit 1
)
update public.operations_checklist_items item
set is_active = false,
    help_text = null,
    updated_at = now()
from template
where item.template_id = template.id
  and lower(trim(item.question_text)) = lower('Record reading from TDS Meter');

-- Add the renamed numeric entry immediately after the pure-water-system hose
-- question and before the ladder checks. The application creates a task only
-- when the entered reading is above 10ppm.
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
  'Washing equipment checks',
  'Measure pure water system',
  'number',
  '[]'::jsonb,
  true,
  395,
  '[]'::jsonb,
  '[]'::jsonb,
  true,
  'Investigate TDS meter reading above 10ppm',
  'Medium',
  false,
  true,
  'Enter the reading from the TDS meter.',
  true
from template
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

-- Retire the old tool wording and add the replacement in the same position.
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
  and lower(trim(item.question_text)) = lower('Dentist picks present');

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
  'Tools',
  'O-ring picks present',
  'pass_fail_na',
  '[]'::jsonb,
  true,
  530,
  '["Completed OK","N/A"]'::jsonb,
  '["Issue to report"]'::jsonb,
  true,
  'Restock O-ring picks',
  'Low',
  false,
  true,
  null,
  true
from template
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

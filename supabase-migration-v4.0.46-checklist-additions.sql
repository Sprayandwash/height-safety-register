-- Spray & Wash Operations V4.0.46
-- Checklist additions collected after the live V4.0.45 release.
-- Run once in Supabase SQL Editor before uploading the V4.0.46 application files.

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

-- Lower the TDS action threshold from 20ppm to 10ppm. The numeric comparison
-- is performed by the V4.0.46 application code when the inspection is submitted.
with template as (
  select id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  limit 1
)
update public.operations_checklist_items item
set response_type = 'number',
    response_options = '[]'::jsonb,
    pass_values = '[]'::jsonb,
    problem_values = '[]'::jsonb,
    creates_task_on_problem = true,
    default_task_title = 'Investigate TDS meter reading above 10ppm',
    default_severity = 'Medium',
    help_text = 'Readings above 10ppm must be reported so the pure water system resin can be changed before the reading reaches 20ppm.',
    is_active = true,
    updated_at = now()
from template
where item.template_id = template.id
  and item.question_text = 'Record reading from TDS Meter';

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
  'Washing equipment checks',
  'Small roof surface cleaner working correctly with no damage, wear, or tear',
  'pass_fail_na',
  true,
  375,
  '["Completed OK","N/A"]'::jsonb,
  '["Issue to report"]'::jsonb,
  true,
  'Repair or replace small roof surface cleaner',
  'High',
  true,
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

commit;

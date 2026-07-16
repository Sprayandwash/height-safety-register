-- Spray & Wash Operations V4.0.41
-- Additive, idempotent Vehicle Inspection Checklist update.
-- Existing checklist rows and historical inspection answers are retained.

begin;

-- Retire the old Vehicle checks and Vehicle cleaning/maintenance rows.
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
  and lower(trim(coalesce(item.section, ''))) in ('vehicle checks', 'vehicle cleaning', 'vehicle maintenance');

-- Add the replacement Vehicle maintenance section.
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
  'Vehicle maintenance',
  'Any damage or maintenance issues on the truck?',
  'pass_fail_na',
  true,
  100,
  '["Completed OK","N/A"]'::jsonb,
  '["Issue to report"]'::jsonb,
  true,
  'Review truck damage or maintenance issue',
  'Medium',
  false,
  true,
  null,
  true
from template
union all
select template.id, 'Vehicle maintenance', 'Wash vehicle exterior', 'pass_fail_na', true, 110, '["Completed OK","N/A"]'::jsonb, '["Issue to report"]'::jsonb, true, 'Complete exterior vehicle wash', 'Low', false, true, 'Apply wash mix and brush', true from template
union all
select template.id, 'Vehicle maintenance', 'Remove all items from the tray and wash', 'pass_fail_na', true, 120, '["Completed OK","N/A"]'::jsonb, '["Issue to report"]'::jsonb, true, 'Remove tray items and wash tray', 'Low', false, true, null, true from template
union all
select template.id, 'Vehicle maintenance', 'Clean interior of cab', 'pass_fail_na', true, 130, '["Completed OK","N/A"]'::jsonb, '["Issue to report"]'::jsonb, true, 'Clean vehicle cab interior', 'Low', false, true, null, true from template
union all
select template.id, 'Vehicle maintenance', 'Upload photos of cleaned vehicle and cab', 'pass_fail_na', true, 140, '["Completed OK"]'::jsonb, '[]'::jsonb, false, null, 'Low', false, false, 'Choose Camera or Gallery and upload at least one photo before submitting.', true from template
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

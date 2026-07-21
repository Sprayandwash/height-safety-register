-- Spray & Wash Operations V4.0.44
-- Additive, idempotent Ladder, Tools and Safety equipment / PPE checklist update.
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

-- Retire the previous Tools rows. This also retires the WD40 row before it is
-- reactivated below in Washing equipment checks with the ladder items.
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
  and lower(trim(coalesce(item.section, ''))) in ('tools', 'washing equipment - tools');

-- Replace the old pass/fail TDS question with the numeric reading requested for
-- V4.0.43. The application treats readings above 20ppm as an issue to report.
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
  and item.question_text = 'Pure water system tested - water purity is 20ppm or below';

-- Keep the three ladder checks together and move the final general washing
-- equipment question after them.
with template as (
  select id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  limit 1
)
update public.operations_checklist_items item
set sort_order = case item.question_text
      when 'Ladder levelling feet flushed with high-pressure water to remove dirt' then 400
      when 'Ladders checked for damage' then 420
      when 'Washing equipment checks - any other issue to note?' then 430
      else item.sort_order
    end,
    updated_at = now()
from template
where item.template_id = template.id
  and item.question_text in (
    'Ladder levelling feet flushed with high-pressure water to remove dirt',
    'Ladders checked for damage',
    'Washing equipment checks - any other issue to note?'
  );

-- Reactivate/add the ladder lubrication and numeric TDS rows in their final
-- positions within Washing equipment checks.
with template as (
  select id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  limit 1
), replacement (
  question_text,
  response_type,
  sort_order,
  pass_values,
  problem_values,
  default_task_title,
  default_severity,
  photo_required_on_problem,
  help_text
) as (
  values
    ('Record reading from TDS Meter', 'number', 380, '[]'::jsonb, '[]'::jsonb, 'Investigate TDS meter reading above 20ppm', 'Medium', true, 'Original form says report if reading is above 20ppm.'),
    ('Ladder levelling feet sliding areas lubricated with WD40', 'pass_fail_na', 410, '["Completed OK","N/A"]'::jsonb, '["Issue to report"]'::jsonb, 'Lubricate ladder levelling feet', 'Medium', true, null)
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
  replacement.question_text,
  replacement.response_type,
  true,
  replacement.sort_order,
  replacement.pass_values,
  replacement.problem_values,
  true,
  replacement.default_task_title,
  replacement.default_severity,
  replacement.photo_required_on_problem,
  true,
  replacement.help_text,
  true
from template
cross join replacement
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

-- Add the requested Tools list in its final display order. Matching rows are
-- reactivated and updated rather than duplicated.
with template as (
  select id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  limit 1
), tools (question_text, sort_order, default_task_title) as (
  values
    ('24mm spanner present', 500, 'Restock 24mm spanner'),
    ('22mm spanner present', 505, 'Restock 22mm spanner'),
    ('19mm Spanner', 510, 'Restock 19mm spanner'),
    ('Large adjustable spanner present', 515, 'Restock large adjustable spanner'),
    ('Small adjustable spanner present', 520, 'Restock small adjustable spanner'),
    ('Socket set present', 525, 'Restock socket set'),
    ('Dentist picks present', 530, 'Restock dentist picks'),
    ('Adjustable parrot grips present', 535, 'Restock adjustable parrot grips'),
    ('Thread tape present', 540, 'Restock thread tape'),
    ('Electical insulation tape present', 545, 'Restock electical insulation tape'),
    ('Silicone Spray', 550, 'Restock silicone spray'),
    ('Screwdrivers (+ and -) present', 555, 'Restock screwdrivers')
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
  tools.question_text,
  'pass_fail_na',
  true,
  tools.sort_order,
  '["Completed OK","N/A"]'::jsonb,
  '["Issue to report"]'::jsonb,
  true,
  tools.default_task_title,
  'Low',
  false,
  true,
  null,
  true
from template
cross join tools
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

-- Retire the previous Safety equipment / PPE rows, then reactivate the exact
-- requested list in its final display order.
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
  and lower(trim(coalesce(item.section, ''))) in ('safety equipment / ppe', 'safety equipment - ppe');

with template as (
  select id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  limit 1
), safety_items (
  question_text,
  sort_order,
  default_task_title,
  default_severity,
  photo_required_on_problem
) as (
  values
    ('First Aid Kit present and in usable condition', 600, 'Restock or replace first aid kit', 'Medium', true),
    ('Eye wash present and in usable condition', 610, 'Restock or replace eye wash', 'Medium', true),
    ('Sunscreen present', 620, 'Restock sunscreen', 'Low', false),
    ('Safety glasses present and in good condition', 630, 'Restock or replace safety glasses', 'Medium', true),
    ('Hearing protection present and in good condition', 640, 'Restock or replace hearing protection', 'Medium', true),
    ('Rubber chemical gloves present and in good condition', 650, 'Restock or replace rubber chemical gloves', 'Medium', true),
    ('Fire extinguisher pressure gauge is in the green', 660, 'Service or replace fire extinguisher', 'High', true),
    ('Fire extinguisher plastic tag is in place', 670, 'Check fire extinguisher tag', 'Medium', true),
    ('Sign board and base present and in good condition', 680, 'Restock or replace sign board and base', 'Low', false),
    ('Safety cones present and in good condition', 690, 'Restock or replace safety cones', 'Low', false),
    ('MSDS sheet folder present', 700, 'Replace or update MSDS sheet folder', 'Medium', true),
    ('Ladder pad present and in good condition', 710, 'Restock or replace ladder pad', 'Medium', true),
    ('Gutter clamp present and in good condition', 720, 'Restock or replace gutter clamp', 'Medium', true)
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
  'Safety equipment / PPE',
  safety_items.question_text,
  'pass_fail_na',
  true,
  safety_items.sort_order,
  '["Completed OK","N/A"]'::jsonb,
  '["Issue to report"]'::jsonb,
  true,
  safety_items.default_task_title,
  safety_items.default_severity,
  safety_items.photo_required_on_problem,
  true,
  null,
  true
from template
cross join safety_items
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

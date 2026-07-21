-- Spray & Wash Operations V4.0.43
-- Additive, idempotent Washing Equipment Checks update.
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

-- Retire only the previous Washing Equipment Checks rows. Other checklist
-- sections such as Vehicle maintenance, Tools and Safety equipment remain active.
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
  and (
    lower(trim(coalesce(item.section, ''))) in (
      'washing equipment checks',
      'washing equipment',
      'washing equipment - trigger guns',
      'washing equipment - wands and poles',
      'washing equipment - nozzles',
      'washing equipment - plumbing fittings',
      'washing equipment - ladders',
      'washing equipment - surface cleaner',
      'washing equipment - pure water system'
    )
  );

-- Insert the requested active list in its final display order. Existing matching
-- rows are reactivated and updated instead of duplicated.
with template as (
  select id
  from public.operations_checklist_templates
  where name = 'Vehicle Inspection Checklist'
  limit 1
), replacement (
  question_text,
  response_type,
  sort_order,
  default_task_title,
  default_severity,
  photo_required_on_problem,
  help_text
) as (
  values
    ('Trigger guns - spare O-rings for quick-connect fittings present', 'pass_fail_na', 200, 'Restock trigger gun quick-connect O-rings', 'Medium', false, null),
    ('Trigger guns - minimum 2 on board and in good working condition', 'pass_fail_na', 210, 'Replace or repair missing or faulty trigger guns', 'High', true, null),
    ('1 x 2 metre wand on board and in good working condition', 'pass_fail_na', 220, 'Restock or repair 2 metre wand', 'Medium', true, null),
    ('1 x 0.5 metre wand on board and in good working condition', 'pass_fail_na', 230, 'Restock or repair 0.5 metre wand', 'Medium', true, null),
    ('2 x 1 metre wands on board and in good working condition', 'pass_fail_na', 240, 'Restock or repair 1 metre wands', 'Medium', true, null),
    ('1 x stubby gutter attachment on board and in good working condition', 'pass_fail_na', 250, 'Restock or repair stubby gutter attachment', 'Medium', true, null),
    ('Water fed pole present and in good order', 'pass_fail_na', 260, 'Repair or replace water fed pole', 'Medium', true, null),
    ('12m carbon wash pole on board and in good working condition', 'pass_fail_na', 270, 'Restock or repair 12m carbon wash pole', 'Medium', true, null),
    ('2 x Chem Jet nozzles present', 'pass_fail_na', 280, 'Restock Chem Jet nozzles', 'Medium', false, null),
    ('2 x Chem fan nozzles present', 'pass_fail_na', 290, 'Restock Chem fan nozzles', 'Medium', false, null),
    ('2 x White 90''s nozzles present', 'pass_fail_na', 300, 'Restock White 90''s nozzles', 'Medium', false, null),
    ('2 x White 60''s nozzles present', 'pass_fail_na', 310, 'Restock White 60''s nozzles', 'Medium', false, null),
    ('2 x White 45''s nozzles present', 'pass_fail_na', 320, 'Restock White 45''s nozzles', 'Medium', false, null),
    ('2 x Red nozzles present', 'pass_fail_na', 330, 'Restock Red nozzles', 'Medium', false, null),
    ('2 x Turbo nozzles present', 'pass_fail_na', 340, 'Restock Turbo nozzles', 'Medium', false, null),
    ('Sufficient spare tap connectors present', 'pass_fail_na', 350, 'Restock spare tap connectors', 'Medium', false, null),
    ('Sufficient spare end-of-hose fittings present', 'pass_fail_na', 360, 'Restock spare end-of-hose fittings', 'Medium', false, null),
    ('Surface cleaner working correctly with no damage, wear, or tear', 'pass_fail_na', 370, 'Repair or replace surface cleaner', 'High', true, null),
    ('Pure water system tested - water purity is 20ppm or below', 'pass_fail_na', 380, 'Investigate pure water reading above 20ppm', 'Medium', true, 'Original form says report if reading is above 20ppm.'),
    ('Pure water system hoses in good condition', 'pass_fail_na', 390, 'Repair or replace pure water system hoses', 'Medium', true, null),
    ('Ladder levelling feet flushed with high-pressure water to remove dirt', 'pass_fail_na', 400, 'Clean ladder levelling feet', 'Medium', false, null),
    ('Ladders checked for damage', 'pass_fail_na', 410, 'Remove damaged ladder from service', 'High', true, 'If ladder damage is found, remove it from service and advise the Ops Manager.'),
    ('Washing equipment checks - any other issue to note?', 'yes_no', 420, 'Review washing equipment issue', 'Medium', true, null)
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
  '["Completed OK","N/A"]'::jsonb,
  '["Issue to report"]'::jsonb,
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

commit;

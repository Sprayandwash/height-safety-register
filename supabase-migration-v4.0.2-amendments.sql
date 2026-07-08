-- Spray & Wash Operations App V4.0.2 amendments
-- Run this AFTER V4.0.1 is already installed and tested.
-- Safe/additive approach: this does not drop or rename tables/columns and does not touch Storage buckets.
-- Main changes:
-- - Staff-facing wording: Completed OK / Issue to report / N/A
-- - Date-based preventive maintenance only in the app UI
-- - Clear old hour-based schedule values from existing Operations records so they are not accidentally used
-- - Keep existing columns in place for migration safety/backwards compatibility

begin;

-- Change default checklist wording for any future checklist items.
alter table public.operations_checklist_items
  alter column pass_values set default '["Completed OK","N/A","No"]'::jsonb;

alter table public.operations_checklist_items
  alter column problem_values set default '["Issue to report","Yes"]'::jsonb;

-- Update existing checklist items to use the new field wording.
-- Yes/No questions still treat Yes as the issue/reporting answer.
update public.operations_checklist_items
set
  pass_values = case
    when response_type = 'yes_no' then '["No"]'::jsonb
    when response_type = 'pass_fail' then '["Completed OK"]'::jsonb
    when response_type = 'pass_fail_na' then '["Completed OK","N/A"]'::jsonb
    else pass_values
  end,
  problem_values = case
    when response_type = 'yes_no' then '["Yes"]'::jsonb
    when response_type in ('pass_fail','pass_fail_na') then '["Issue to report"]'::jsonb
    else problem_values
  end
where response_type in ('pass_fail','pass_fail_na','yes_no');

-- Make the vehicle cab item explicitly support item-level photo uploads in the V4.0.2 UI.
-- This uses the existing operations_inspection_photos table via checklist_item_id.
update public.operations_checklist_items
set photo_required_on_problem = true,
    help_text = coalesce(help_text, 'Add cab photos here where useful. Photos are stored against this checklist item.')
where question_text ilike '%vehicle cab%';

-- Remove hour-based scheduling from active data without deleting columns.
-- The V4.0.2 UI no longer displays/uses pump or engine hours.
update public.operations_washing_equipment
set has_hour_meter = false,
    current_engine_hours = null,
    current_pump_hours = null
where has_hour_meter is distinct from false
   or current_engine_hours is not null
   or current_pump_hours is not null;

update public.operations_equipment_maintenance_schedules
set frequency_hours = null,
    last_completed_hours = null,
    next_due_hours = null
where frequency_hours is not null
   or last_completed_hours is not null
   or next_due_hours is not null;

update public.operations_maintenance_tasks
set due_engine_hours = null,
    completed_engine_hours = null,
    completed_pump_hours = null
where due_engine_hours is not null
   or completed_engine_hours is not null
   or completed_pump_hours is not null;

-- Keep a lightweight version marker if the existing app_settings table supports key/value style rows.
-- Wrapped defensively so it will not block install if app_settings has a different structure.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_settings' and column_name = 'key'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_settings' and column_name = 'value'
  ) then
    insert into public.app_settings(key, value)
    values ('operations_module_version', '4.0.2')
    on conflict (key) do update set value = excluded.value;
  end if;
exception when others then
  -- Ignore if app_settings has a different constraint/schema in the live V3 app.
  null;
end $$;

commit;

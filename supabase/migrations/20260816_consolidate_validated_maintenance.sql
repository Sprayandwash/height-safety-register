-- Consolidated from the staging-validated Maintenance DB repair.
-- Apply through the normal migration path only. This migration does not rewrite historical task rows.

CREATE OR REPLACE FUNCTION public.operations_add_maintenance_record_v4053(
  p_record_date date,
  p_vehicle_id uuid,
  p_machinery_id uuid,
  p_items jsonb,
  p_performed_by text,
  p_odometer numeric,
  p_parts_used text,
  p_notes text,
  p_further_maintenance_required text,
  p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_vehicle_rego text;
  v_asset_identifier text;
  v_record_type text;
  v_log_id uuid := gen_random_uuid();
  v_task_id uuid;
  v_item jsonb;
  v_item_name text;
  v_item_description text;
  v_item_count integer;
  v_item_summary text;
  v_has_repair boolean := false;
  v_has_other boolean := false;
  v_target_category text;
  v_procedure_id uuid;
  v_schedule record;
begin
  if auth.uid() is null or p_created_by is distinct from auth.uid() then
    raise exception 'The signed-in user does not match the maintenance record user.';
  end if;

  if not public.spray_wash_has_role(array['Admin', 'Maintenance manager']) then
    raise exception 'Only Admin or Maintenance manager users can add maintenance records.';
  end if;

  if p_record_date is null then
    raise exception 'A maintenance date is required.';
  end if;

  if p_vehicle_id is null then
    raise exception 'A vehicle is required.';
  end if;

  select upper(btrim(rego))
    into v_vehicle_rego
    from public.operations_vehicles
    where id = p_vehicle_id;

  if not found then
    raise exception 'Vehicle record not found.';
  end if;

  if p_machinery_id is not null then
    select asset_identifier, machinery_type
      into v_asset_identifier, v_target_category
      from public.operations_washing_equipment
      where id = p_machinery_id
        and assigned_vehicle_id = p_vehicle_id;

    if not found then
      raise exception 'The selected machinery is not currently installed on this vehicle.';
    end if;
  else
    v_asset_identifier := v_vehicle_rego;
    v_target_category := 'Vehicle';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one maintenance item.';
  end if;

  select
    count(*)::integer,
    string_agg(item.value ->> 'maintenance_done', ', ' order by item.ordinality)
  into v_item_count, v_item_summary
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality);

  for v_item in
    select item.value
    from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    v_item_name := v_item ->> 'maintenance_done';
    v_item_description := nullif(btrim(v_item ->> 'description'), '');

    if v_item_name is null or v_item_name not in (
      'Engine oil changed',
      'Oil filter changed',
      'Oil changed',
      'Spark plug changed',
      'Air filter changed',
      'Fuel filter changed',
      'Coolant replaced',
      'Brake fluid replaced',
      'Transmission oil changed',
      'Valves changed',
      'Seals replaced',
      'Repair',
      'Other maintenance'
    ) then
      raise exception 'Choose a valid maintenance type.';
    end if;

    if v_item_name in ('Repair', 'Other maintenance')
       and v_item_description is null then
      raise exception 'Every repair and other maintenance item requires a description.';
    end if;

    v_has_repair := v_has_repair or v_item_name = 'Repair';
    v_has_other := v_has_other or v_item_name = 'Other maintenance';
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    where item.value ->> 'maintenance_done' not in ('Repair', 'Other maintenance')
    group by item.value ->> 'maintenance_done'
    having count(*) > 1
  ) then
    raise exception 'Routine maintenance types can only be selected once per record.';
  end if;

  if nullif(btrim(p_performed_by), '') is null then
    raise exception 'The person or service agent is required.';
  end if;

  v_record_type := case
    when v_has_repair then 'Repair'
    when v_has_other then 'Other work'
    else 'Service'
  end;

  if nullif(btrim(p_further_maintenance_required), '') is not null then
    insert into public.operations_maintenance_tasks (
      source_type,
      source_module,
      source_record_type,
      source_record_id,
      target_type,
      target_record_id,
      target_label,
      vehicle_id,
      washing_equipment_id,
      title,
      description,
      status,
      priority,
      due_date,
      assigned_role,
      created_by
    ) values (
      'Manual',
      'maintenance',
      'maintenance_log',
      v_log_id,
      case when p_machinery_id is null then 'vehicle' else 'washing_equipment' end,
      coalesce(p_machinery_id, p_vehicle_id),
      upper(btrim(v_asset_identifier)),
      p_vehicle_id,
      p_machinery_id,
      'Further maintenance required',
      btrim(p_further_maintenance_required),
      'Open',
      'Medium',
      current_date,
      'Maintenance manager',
      p_created_by
    )
    returning id into v_task_id;
  end if;

  insert into public.operations_maintenance_log (
    id,
    record_type,
    record_date,
    vehicle_id,
    washing_equipment_id,
    title,
    maintenance_done,
    description,
    performed_by,
    odometer,
    parts_used,
    notes,
    further_maintenance_required,
    generated_task_id,
    asset_identifier_snapshot,
    vehicle_rego_snapshot,
    created_by
  ) values (
    v_log_id,
    v_record_type,
    p_record_date,
    p_vehicle_id,
    p_machinery_id,
    case when v_item_count = 1 then v_item_summary else v_item_count || ' maintenance items' end,
    case when v_item_count = 1 then v_item_summary else null end,
    null,
    btrim(p_performed_by),
    p_odometer,
    nullif(btrim(p_parts_used), ''),
    nullif(btrim(p_notes), ''),
    nullif(btrim(p_further_maintenance_required), ''),
    v_task_id,
    upper(btrim(v_asset_identifier)),
    v_vehicle_rego,
    p_created_by
  );

  insert into public.operations_maintenance_log_items (
    maintenance_log_id,
    maintenance_done,
    description,
    parts_used,
    sort_order
  )
  select
    v_log_id,
    item.value ->> 'maintenance_done',
    nullif(btrim(item.value ->> 'description'), ''),
    nullif(btrim(item.value ->> 'parts_used'), ''),
    item.ordinality::integer
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
  order by item.ordinality;

  for v_item in
    select item.value
    from jsonb_array_elements(p_items) with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    v_item_name := v_item ->> 'maintenance_done';
    if v_item_name not in ('Repair', 'Other maintenance') then
      select procedure.id
        into v_procedure_id
        from public.operations_maintenance_procedures procedure
        where procedure.name = 'PM - ' || v_target_category || ' - ' || v_item_name
          and coalesce(procedure.is_active, true)
        limit 1;

      if v_procedure_id is not null then
        for v_schedule in
          select schedule.id,
                 coalesce(schedule.frequency_days, procedure.frequency_days) as frequency_days
          from public.operations_equipment_maintenance_schedules schedule
          join public.operations_maintenance_procedures procedure
            on procedure.id = schedule.procedure_id
          where schedule.procedure_id = v_procedure_id
            and (
              (p_machinery_id is not null and schedule.washing_equipment_id = p_machinery_id)
              or
              (p_machinery_id is null and schedule.vehicle_id = p_vehicle_id)
            )
            and coalesce(schedule.is_active, true)
        loop
          update public.operations_equipment_maintenance_schedules
          set last_completed_at = p_record_date,
              next_due_at = case
                when v_schedule.frequency_days is null then null
                else p_record_date + v_schedule.frequency_days::integer
              end
          where id = v_schedule.id;

          update public.operations_maintenance_tasks
          set status = 'Completed',
              completed_at = p_record_date::timestamptz,
              completed_by = p_created_by,
              completion_notes = coalesce(
                nullif(btrim(p_notes), ''),
                'Completed through Record Maintenance.'
              )
          where schedule_id = v_schedule.id
            and status not in ('Completed', 'Deferred');
        end loop;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'log_id', v_log_id,
    'task_id', v_task_id,
    'item_count', v_item_count
  );
end;
$function$;

ALTER TABLE public.operations_maintenance_log_items
  DROP CONSTRAINT IF EXISTS operations_maintenance_log_items_maintenance_done_check;

ALTER TABLE public.operations_maintenance_log_items
  ADD CONSTRAINT operations_maintenance_log_items_maintenance_done_check
  CHECK (maintenance_done IN (
    'Engine oil changed',
    'Oil filter changed',
    'Oil changed',
    'Spark plug changed',
    'Air filter changed',
    'Fuel filter changed',
    'Coolant replaced',
    'Brake fluid replaced',
    'Transmission oil changed',
    'Valves changed',
    'Seals replaced',
    'Repair',
    'Other maintenance'
  ));

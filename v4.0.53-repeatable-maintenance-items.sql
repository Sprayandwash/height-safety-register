-- Spray & Wash Operations V4.0.53
-- Additive migration for repeatable Repair and Other maintenance items.
-- Run after v4.0.52-multiple-maintenance-items.sql.

begin;

alter table public.operations_maintenance_log_items
  add column if not exists parts_used text;

do $$
declare
  v_constraint_name text;
begin
  select constraint_row.conname
    into v_constraint_name
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.operations_maintenance_log_items'::regclass
      and constraint_row.contype = 'u'
      and (
        select array_agg(attribute_row.attname::text order by key_row.ordinality)
        from unnest(constraint_row.conkey) with ordinality as key_row(attnum, ordinality)
        join pg_attribute attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
         and attribute_row.attnum = key_row.attnum
      ) = array['maintenance_log_id', 'maintenance_done']
    limit 1;

  if v_constraint_name is not null then
    execute format(
      'alter table public.operations_maintenance_log_items drop constraint %I',
      v_constraint_name
    );
  end if;
end
$$;

create or replace function public.operations_add_maintenance_record_v4053(
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
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
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
begin
  if auth.uid() is null or p_created_by is distinct from auth.uid() then
    raise exception 'The signed-in user does not match the maintenance record user.';
  end if;

  if not exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('Admin', 'Equipment Manager')
  ) then
    raise exception 'Only Admin or Equipment Manager users can add maintenance records.';
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
    select asset_identifier
      into v_asset_identifier
      from public.operations_washing_equipment
      where id = p_machinery_id
        and assigned_vehicle_id = p_vehicle_id;

    if not found then
      raise exception 'The selected machinery is not currently installed on this vehicle.';
    end if;
  else
    v_asset_identifier := v_vehicle_rego;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Maintenance items must be supplied as a list.';
  end if;

  if jsonb_array_length(p_items) = 0 then
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
      'Oil changed',
      'Spark plug changed',
      'Air filter changed',
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
      target_type,
      vehicle_id,
      washing_equipment_id,
      title,
      description,
      status,
      priority,
      due_date,
      created_by
    ) values (
      'Manual',
      case when p_machinery_id is null then 'vehicle' else 'washing_equipment' end,
      p_vehicle_id,
      p_machinery_id,
      'Further maintenance required',
      'Identified while recording ' || v_item_summary || E':\n'
        || btrim(p_further_maintenance_required),
      'Open',
      'Medium',
      current_date,
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

  return jsonb_build_object(
    'log_id', v_log_id,
    'task_id', v_task_id,
    'item_count', v_item_count
  );
end;
$$;

grant execute on function public.operations_add_maintenance_record_v4053(
  date, uuid, uuid, jsonb, text, numeric, text, text, text, uuid
) to authenticated;

commit;

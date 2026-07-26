-- Spray & Wash Operations V4.0.51
-- Additive migration for structured maintenance records and linked follow-up tasks.
-- Run after v4.0.49-maintenance-log.sql.

begin;

alter table public.operations_maintenance_log
  add column if not exists maintenance_done text,
  add column if not exists further_maintenance_required text,
  add column if not exists generated_task_id uuid
    references public.operations_maintenance_tasks(id) on delete set null;

create or replace function public.operations_add_maintenance_record_v4051(
  p_record_date date,
  p_vehicle_id uuid,
  p_machinery_id uuid,
  p_maintenance_done text,
  p_description text,
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

  if p_maintenance_done is null or p_maintenance_done not in (
    'Oil changed',
    'Spark plug changed',
    'Air filter changed',
    'Repair',
    'Other maintenance'
  ) then
    raise exception 'Choose a valid maintenance type.';
  end if;

  if p_maintenance_done in ('Repair', 'Other maintenance')
     and nullif(btrim(p_description), '') is null then
    raise exception 'A description is required for repairs and other maintenance.';
  end if;

  if nullif(btrim(p_performed_by), '') is null then
    raise exception 'The person or service agent is required.';
  end if;

  v_record_type := case
    when p_maintenance_done = 'Repair' then 'Repair'
    when p_maintenance_done = 'Other maintenance' then 'Other work'
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
      'Identified while recording ' || p_maintenance_done || E':\n'
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
    p_maintenance_done,
    p_maintenance_done,
    nullif(btrim(p_description), ''),
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

  return jsonb_build_object(
    'log_id', v_log_id,
    'task_id', v_task_id
  );
end;
$$;

grant execute on function public.operations_add_maintenance_record_v4051(
  date, uuid, uuid, text, text, text, numeric, text, text, text, uuid
) to authenticated;

commit;

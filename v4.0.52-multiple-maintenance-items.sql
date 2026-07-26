-- Spray & Wash Operations V4.0.52
-- Additive migration for multiple searchable items within one maintenance record.
-- Run after v4.0.51-maintenance-records.sql.

begin;

create table if not exists public.operations_maintenance_log_items (
  id uuid primary key default gen_random_uuid(),
  maintenance_log_id uuid not null
    references public.operations_maintenance_log(id) on delete cascade,
  maintenance_done text not null
    check (maintenance_done in (
      'Oil changed',
      'Spark plug changed',
      'Air filter changed',
      'Repair',
      'Other maintenance'
    )),
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (maintenance_log_id, maintenance_done)
);

create index if not exists operations_maintenance_log_items_log_idx
  on public.operations_maintenance_log_items (maintenance_log_id, sort_order);

create index if not exists operations_maintenance_log_items_type_idx
  on public.operations_maintenance_log_items (maintenance_done);

alter table public.operations_maintenance_log_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'operations_maintenance_log_items'
      and policyname = 'Authenticated users can read maintenance log items'
  ) then
    create policy "Authenticated users can read maintenance log items"
      on public.operations_maintenance_log_items
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'operations_maintenance_log_items'
      and policyname = 'Maintenance managers can add maintenance log items'
  ) then
    create policy "Maintenance managers can add maintenance log items"
      on public.operations_maintenance_log_items
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.operations_maintenance_log log
          where log.id = maintenance_log_id
            and log.created_by = auth.uid()
        )
        and exists (
          select 1
          from public.user_roles
          where user_id = auth.uid()
            and role in ('Admin', 'Equipment Manager')
        )
      );
  end if;
end
$$;

grant select, insert on public.operations_maintenance_log_items to authenticated;

insert into public.operations_maintenance_log_items (
  maintenance_log_id,
  maintenance_done,
  description,
  sort_order
)
select
  log.id,
  log.maintenance_done,
  log.description,
  1
from public.operations_maintenance_log log
where log.maintenance_done in (
    'Oil changed',
    'Spark plug changed',
    'Air filter changed',
    'Repair',
    'Other maintenance'
  )
  and not exists (
    select 1
    from public.operations_maintenance_log_items item
    where item.maintenance_log_id = log.id
      and item.maintenance_done = log.maintenance_done
  );

create or replace function public.operations_add_maintenance_record_v4052(
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
  v_distinct_count integer;
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
    count(distinct item.value ->> 'maintenance_done')::integer,
    string_agg(item.value ->> 'maintenance_done', ', ' order by item.ordinality)
  into v_item_count, v_distinct_count, v_item_summary
  from jsonb_array_elements(p_items) with ordinality as item(value, ordinality);

  if v_item_count <> v_distinct_count then
    raise exception 'Each maintenance type can only be selected once per record.';
  end if;

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
      raise exception 'A description is required for repairs and other maintenance.';
    end if;

    v_has_repair := v_has_repair or v_item_name = 'Repair';
    v_has_other := v_has_other or v_item_name = 'Other maintenance';
  end loop;

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
    sort_order
  )
  select
    v_log_id,
    item.value ->> 'maintenance_done',
    nullif(btrim(item.value ->> 'description'), ''),
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

grant execute on function public.operations_add_maintenance_record_v4052(
  date, uuid, uuid, jsonb, text, numeric, text, text, text, uuid
) to authenticated;

commit;

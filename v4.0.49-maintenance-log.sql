-- Spray & Wash Operations V4.0.49
-- Additive migration for the consolidated Maintenance Log and machinery transfers.
-- Run v4.0.48-assets-machinery.sql first.

begin;

create table if not exists public.operations_maintenance_log (
  id uuid primary key default gen_random_uuid(),
  record_type text not null,
  record_date date not null default current_date,
  vehicle_id uuid references public.operations_vehicles(id) on delete set null,
  washing_equipment_id uuid references public.operations_washing_equipment(id) on delete set null,
  title text not null,
  description text,
  performed_by text,
  odometer numeric(12,1),
  parts_used text,
  notes text,
  asset_identifier_snapshot text,
  vehicle_rego_snapshot text,
  from_vehicle_id uuid references public.operations_vehicles(id) on delete set null,
  to_vehicle_id uuid references public.operations_vehicles(id) on delete set null,
  from_side text,
  to_side text,
  previous_identifier text,
  new_identifier text,
  created_by uuid,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'operations_maintenance_log_record_type_check'
      and conrelid = 'public.operations_maintenance_log'::regclass
  ) then
    alter table public.operations_maintenance_log
      add constraint operations_maintenance_log_record_type_check
      check (record_type in ('Inspection', 'Service', 'Repair', 'Other work'));
  end if;
end
$$;

create index if not exists operations_maintenance_log_record_date_idx
  on public.operations_maintenance_log (record_date desc);

create index if not exists operations_maintenance_log_vehicle_idx
  on public.operations_maintenance_log (vehicle_id, record_date desc);

create index if not exists operations_maintenance_log_machinery_idx
  on public.operations_maintenance_log (washing_equipment_id, record_date desc);

alter table public.operations_maintenance_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'operations_maintenance_log'
      and policyname = 'Authenticated users can read maintenance log'
  ) then
    create policy "Authenticated users can read maintenance log"
      on public.operations_maintenance_log
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'operations_maintenance_log'
      and policyname = 'Authenticated users can add maintenance log'
  ) then
    create policy "Authenticated users can add maintenance log"
      on public.operations_maintenance_log
      for insert
      to authenticated
      with check (
        created_by = auth.uid()
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

create or replace function public.operations_transfer_machinery_v4049(
  p_machinery_id uuid,
  p_to_vehicle_id uuid,
  p_to_side text,
  p_new_identifier text,
  p_transfer_date date,
  p_notes text,
  p_performed_by text,
  p_changed_by uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_old public.operations_washing_equipment%rowtype;
  v_old_rego text;
  v_new_rego text;
  v_type_label text;
  v_log_id uuid;
begin
  if auth.uid() is not null and p_changed_by is distinct from auth.uid() then
    raise exception 'The signed-in user does not match the transfer user.';
  end if;

  if not exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('Admin', 'Equipment Manager')
  ) then
    raise exception 'Only Admin or Equipment Manager users can transfer machinery.';
  end if;

  select *
    into v_old
    from public.operations_washing_equipment
    where id = p_machinery_id
    for update;

  if not found then
    raise exception 'Machinery record not found.';
  end if;

  if p_new_identifier is null or btrim(p_new_identifier) = '' then
    raise exception 'A new machinery identifier is required.';
  end if;

  if p_to_vehicle_id is not null and (p_to_side is null or p_to_side not in ('Driver', 'Passenger')) then
    raise exception 'Installed machinery must have a Driver or Passenger side.';
  end if;

  if p_to_vehicle_id is null and p_to_side is not null then
    raise exception 'Unassigned machinery cannot have an installation side.';
  end if;

  if p_to_vehicle_id is not distinct from v_old.assigned_vehicle_id
     and p_to_side is not distinct from v_old.mounting_side then
    raise exception 'Choose a different vehicle, side, or unassigned status.';
  end if;

  if p_to_vehicle_id is not null and exists (
    select 1
      from public.operations_washing_equipment other
      where other.id <> p_machinery_id
        and other.assigned_vehicle_id = p_to_vehicle_id
        and other.mounting_side = p_to_side
        and other.machinery_type = v_old.machinery_type
        and coalesce(other.status, 'Active') <> 'Retired'
  ) then
    raise exception 'The destination already contains this machinery type on that side.';
  end if;

  select rego into v_old_rego
    from public.operations_vehicles
    where id = v_old.assigned_vehicle_id;

  select rego into v_new_rego
    from public.operations_vehicles
    where id = p_to_vehicle_id;

  v_type_label := case v_old.machinery_type
    when 'Gearbox' then 'Reduction gearbox'
    when 'Pump' then 'Pump'
    else 'Engine'
  end;

  update public.operations_washing_equipment
    set assigned_vehicle_id = p_to_vehicle_id,
        mounting_side = p_to_side,
        asset_identifier = upper(btrim(p_new_identifier)),
        name = v_type_label || ' - ' || upper(btrim(p_new_identifier))
    where id = p_machinery_id;

  insert into public.operations_maintenance_log (
    record_type, record_date, vehicle_id, washing_equipment_id, title, description,
    performed_by, notes, asset_identifier_snapshot, vehicle_rego_snapshot,
    from_vehicle_id, to_vehicle_id, from_side, to_side,
    previous_identifier, new_identifier, created_by
  ) values (
    'Other work', coalesce(p_transfer_date, current_date), p_to_vehicle_id, p_machinery_id,
    'Machinery transfer',
    'Transferred machinery without changing its underlying asset record or linked maintenance history.',
    nullif(btrim(p_performed_by), ''), nullif(btrim(p_notes), ''),
    upper(btrim(p_new_identifier)), upper(v_new_rego),
    v_old.assigned_vehicle_id, p_to_vehicle_id, v_old.mounting_side, p_to_side,
    v_old.asset_identifier, upper(btrim(p_new_identifier)), p_changed_by
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.operations_transfer_machinery_v4049(
  uuid, uuid, text, text, date, text, text, uuid
) to authenticated;

commit;

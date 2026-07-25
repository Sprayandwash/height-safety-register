-- Spray & Wash Operations V4.0.48
-- Additive migration for vehicle service specifications and machinery hierarchy.
-- This migration does not delete or rename existing data, tables, or storage objects.

begin;

alter table public.operations_vehicles
  add column if not exists vin_chassis_number text,
  add column if not exists engine_code text,
  add column if not exists fuel_type text,
  add column if not exists current_odometer numeric(12,1),
  add column if not exists engine_oil_grade text,
  add column if not exists engine_oil_volume_l numeric(8,3),
  add column if not exists oil_filter_part_number text,
  add column if not exists engine_air_filter_part_number text,
  add column if not exists fuel_filter_part_number text,
  add column if not exists spark_plug_part_number text,
  add column if not exists service_interval_km integer,
  add column if not exists service_interval_months integer,
  add column if not exists coolant_type text,
  add column if not exists coolant_capacity_l numeric(8,3),
  add column if not exists transmission_fluid_grade text,
  add column if not exists transmission_fluid_capacity_l numeric(8,3),
  add column if not exists differential_oil_grade text,
  add column if not exists differential_oil_capacity_l numeric(8,3),
  add column if not exists brake_fluid_spec text,
  add column if not exists drive_belt_part_number text,
  add column if not exists battery_type_size text,
  add column if not exists front_tyre_size text,
  add column if not exists rear_tyre_size text,
  add column if not exists front_tyre_pressure_psi numeric(6,1),
  add column if not exists rear_tyre_pressure_psi numeric(6,1),
  add column if not exists front_wiper_size text,
  add column if not exists rear_wiper_size text,
  add column if not exists service_notes text;

alter table public.operations_washing_equipment
  add column if not exists asset_identifier text,
  add column if not exists machinery_type text,
  add column if not exists mounting_side text,
  add column if not exists make_model text,
  add column if not exists oil_grade text,
  add column if not exists oil_volume_l numeric(8,3),
  add column if not exists spark_plug_part_number text,
  add column if not exists air_filter_part_number text,
  add column if not exists pressure_psi numeric(10,1),
  add column if not exists max_output_lpm numeric(10,2),
  add column if not exists service_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'operations_machinery_type_check'
      and conrelid = 'public.operations_washing_equipment'::regclass
  ) then
    alter table public.operations_washing_equipment
      add constraint operations_machinery_type_check
      check (machinery_type is null or machinery_type in ('Engine', 'Gearbox', 'Pump'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'operations_machinery_side_check'
      and conrelid = 'public.operations_washing_equipment'::regclass
  ) then
    alter table public.operations_washing_equipment
      add constraint operations_machinery_side_check
      check (mounting_side is null or mounting_side in ('Driver', 'Passenger'));
  end if;
end
$$;

create unique index if not exists operations_machinery_asset_identifier_uidx
  on public.operations_washing_equipment (upper(asset_identifier))
  where asset_identifier is not null;

create unique index if not exists operations_machinery_vehicle_side_type_uidx
  on public.operations_washing_equipment (assigned_vehicle_id, mounting_side, machinery_type)
  where assigned_vehicle_id is not null
    and mounting_side is not null
    and machinery_type is not null
    and coalesce(status, 'Active') <> 'Retired';

commit;

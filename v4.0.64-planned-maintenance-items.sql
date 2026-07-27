-- V4.0.64: allow a preventive-maintenance schedule to be assigned to either
-- a primary vehicle asset or a machinery sub-asset.

alter table public.operations_equipment_maintenance_schedules
  add column if not exists vehicle_id uuid references public.operations_vehicles(id) on delete cascade;

alter table public.operations_equipment_maintenance_schedules
  alter column washing_equipment_id drop not null;

alter table public.operations_equipment_maintenance_schedules
  drop constraint if exists operations_maintenance_schedule_target_required;

alter table public.operations_equipment_maintenance_schedules
  add constraint operations_maintenance_schedule_target_required
  check (
    (vehicle_id is not null and washing_equipment_id is null)
    or
    (vehicle_id is null and washing_equipment_id is not null)
  );

create index if not exists operations_maintenance_schedules_vehicle_id_idx
  on public.operations_equipment_maintenance_schedules(vehicle_id);

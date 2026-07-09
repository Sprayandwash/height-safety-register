-- Spray & Wash Operations V4.0.13
-- Additive migration for asset photos.
-- Run after V4.0.12 has been installed.
-- This does not change config.js and does not create/modify storage buckets.

alter table if exists public.operations_vehicles
  add column if not exists photo_path text,
  add column if not exists photo_file_name text;

alter table if exists public.operations_washing_equipment
  add column if not exists photo_path text,
  add column if not exists photo_file_name text;

comment on column public.operations_vehicles.photo_path is 'Optional asset photo storage path. Uses existing inspection-photos bucket under operations-assets/vehicles.';
comment on column public.operations_washing_equipment.photo_path is 'Optional asset photo storage path. Uses existing inspection-photos bucket under operations-assets/washing-equipment.';

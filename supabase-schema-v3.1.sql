-- Spray & Wash Height Safety Register
-- Version 3.1 - Reports + Inspection Photos
-- Safe additive update. Existing equipment, inspections, equipment photos and roles are not deleted.

create table if not exists inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references inspections(id) on delete cascade,
  equipment_id uuid references equipment(id) on delete cascade,
  file_path text not null,
  file_name text,
  created_at timestamptz default now()
);

insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', false)
on conflict (id) do nothing;

alter table inspection_photos enable row level security;

drop policy if exists "inspection photos authenticated all" on inspection_photos;
create policy "inspection photos authenticated all" on inspection_photos
for all to authenticated using (true) with check (true);

drop policy if exists "storage inspection photos select" on storage.objects;
create policy "storage inspection photos select" on storage.objects
for select to authenticated using (bucket_id = 'inspection-photos');

drop policy if exists "storage inspection photos insert" on storage.objects;
create policy "storage inspection photos insert" on storage.objects
for insert to authenticated with check (bucket_id = 'inspection-photos');

drop policy if exists "storage inspection photos update" on storage.objects;
create policy "storage inspection photos update" on storage.objects
for update to authenticated using (bucket_id = 'inspection-photos') with check (bucket_id = 'inspection-photos');

drop policy if exists "storage inspection photos delete" on storage.objects;
create policy "storage inspection photos delete" on storage.objects
for delete to authenticated using (bucket_id = 'inspection-photos');

create index if not exists inspection_photos_inspection_id_idx on inspection_photos(inspection_id);
create index if not exists inspection_photos_equipment_id_idx on inspection_photos(equipment_id);

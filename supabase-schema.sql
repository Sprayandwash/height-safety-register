-- Spray & Wash Height Safety Register - Supabase schema
-- Already run this if your cloud app is syncing.

create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  serial text not null unique,
  type text not null,
  manufacturer text,
  model text,
  date_manufactured date,
  date_first_used date,
  retirement_date date,
  inspection_frequency text default '6 monthly',
  status text default 'In Service',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references equipment(id) on delete cascade,
  serial text not null,
  equipment_type text not null,
  inspection_date date not null,
  inspector text,
  result text not null check (result in ('Pass','Fail')),
  next_due date,
  checklist jsonb default '[]'::jsonb,
  notes text,
  created_at timestamptz default now()
);

alter table equipment enable row level security;
alter table inspections enable row level security;

drop policy if exists "equipment authenticated all" on equipment;
create policy "equipment authenticated all" on equipment
for all to authenticated using (true) with check (true);

drop policy if exists "inspections authenticated all" on inspections;
create policy "inspections authenticated all" on inspections
for all to authenticated using (true) with check (true);


-- Equipment photos support
create table if not exists equipment_photos (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references equipment(id) on delete cascade,
  file_path text not null,
  file_name text,
  created_at timestamptz default now()
);

insert into storage.buckets (id, name, public)
values ('equipment-photos', 'equipment-photos', false)
on conflict (id) do nothing;

alter table equipment_photos enable row level security;

drop policy if exists "equipment photos authenticated all" on equipment_photos;
create policy "equipment photos authenticated all" on equipment_photos
for all to authenticated using (true) with check (true);

drop policy if exists "storage equipment photos select" on storage.objects;
create policy "storage equipment photos select" on storage.objects
for select to authenticated using (bucket_id = 'equipment-photos');

drop policy if exists "storage equipment photos insert" on storage.objects;
create policy "storage equipment photos insert" on storage.objects
for insert to authenticated with check (bucket_id = 'equipment-photos');

drop policy if exists "storage equipment photos update" on storage.objects;
create policy "storage equipment photos update" on storage.objects
for update to authenticated using (bucket_id = 'equipment-photos') with check (bucket_id = 'equipment-photos');

drop policy if exists "storage equipment photos delete" on storage.objects;
create policy "storage equipment photos delete" on storage.objects
for delete to authenticated using (bucket_id = 'equipment-photos');

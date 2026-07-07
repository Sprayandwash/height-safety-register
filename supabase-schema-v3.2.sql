-- Spray & Wash Height Safety Register V3.2 - Certificates
-- Safe additive update: creates certificate history only.

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_number text not null,
  equipment_id uuid references equipment(id) on delete set null,
  inspection_id uuid references inspections(id) on delete set null,
  generated_by uuid references auth.users(id) on delete set null,
  generated_by_email text,
  filter_summary text,
  status text default 'Generated',
  created_at timestamptz default now()
);

create index if not exists certificates_equipment_id_idx on certificates(equipment_id);
create index if not exists certificates_inspection_id_idx on certificates(inspection_id);
create index if not exists certificates_created_at_idx on certificates(created_at desc);

alter table certificates enable row level security;

drop policy if exists "certificates authenticated all" on certificates;
create policy "certificates authenticated all" on certificates
for all to authenticated using (true) with check (true);

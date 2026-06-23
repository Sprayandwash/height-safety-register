-- Spray & Wash Height Safety Register - Supabase schema
-- Run this in Supabase SQL Editor.

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

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_equipment_updated_at on equipment;
create trigger set_equipment_updated_at
before update on equipment
for each row execute function set_updated_at();

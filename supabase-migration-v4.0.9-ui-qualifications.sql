-- Spray & Wash Operations App V4.0.9 UI, filters and height inspector qualifications
-- Run AFTER V4.0.8 / V4.0.7. Additive only.
-- Does not alter existing height equipment, inspection, certificate or operations data.
-- Does not create or alter storage buckets. Qualification files use the existing inspection-photos bucket.

begin;

create table if not exists public.height_inspector_qualifications (
  id uuid primary key default gen_random_uuid(),
  inspector_user_id uuid null,
  inspector_name text not null,
  email text null,
  qualification_type text not null,
  provider text null,
  reference_number text null,
  issue_date date null,
  expiry_date date null,
  storage_path text null,
  file_name text null,
  notes text null,
  active boolean not null default true,
  created_by uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_height_inspector_qualifications_expiry
  on public.height_inspector_qualifications(expiry_date);

create index if not exists idx_height_inspector_qualifications_email
  on public.height_inspector_qualifications(lower(email));

alter table public.height_inspector_qualifications enable row level security;

do $$
begin
  execute 'drop policy if exists "height inspector quals select approved" on public.height_inspector_qualifications';
  execute 'create policy "height inspector quals select approved" on public.height_inspector_qualifications for select to authenticated using (public.has_any_app_role(array[''Admin'',''Inspector'',''Equipment Manager'',''Office / Reports'',''Certificate Approver'',''Viewer'']::text[]))';

  execute 'drop policy if exists "height inspector quals insert approved" on public.height_inspector_qualifications';
  execute 'create policy "height inspector quals insert approved" on public.height_inspector_qualifications for insert to authenticated with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'',''Office / Reports'',''Certificate Approver'']::text[]))';

  execute 'drop policy if exists "height inspector quals update managers" on public.height_inspector_qualifications';
  execute 'create policy "height inspector quals update managers" on public.height_inspector_qualifications for update to authenticated using (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[])) with check (public.has_any_app_role(array[''Admin'',''Equipment Manager'']::text[]))';
end $$;

-- Keep updated_at current when rows are changed.
create or replace function public.set_height_inspector_qualifications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_height_inspector_qualifications_updated_at on public.height_inspector_qualifications;
create trigger trg_height_inspector_qualifications_updated_at
before update on public.height_inspector_qualifications
for each row execute function public.set_height_inspector_qualifications_updated_at();

commit;

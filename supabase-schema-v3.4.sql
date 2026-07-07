-- Spray & Wash Height Safety Register V3.4
-- Security, Audit Trail and Admin Controls
-- Run this after backing up. This update is additive for data and tightens role-based policies.

-- Helper: check if the signed-in user has any of the listed roles.
create or replace function public.has_any_app_role(check_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = any(check_roles)
  );
$$;

grant execute on function public.has_any_app_role(text[]) to authenticated;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id uuid,
  summary text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_user_id_idx on public.audit_logs(actor_user_id);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz default now()
);

insert into public.app_settings (key, value)
values
  ('notification_lead_days', '30'::jsonb),
  ('default_inspection_frequency', '"6 monthly"'::jsonb),
  ('certificate_photo_layout', '"photo_page"'::jsonb),
  ('company_name', '"Spray & Wash"'::jsonb),
  ('certificate_footer', '"This certificate was generated from the Spray & Wash Height Safety Register. Verify against the live register before relying on expired downloaded copies."'::jsonb)
on conflict (key) do nothing;

alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

-- Audit log policies.
drop policy if exists "audit logs select admin reports" on public.audit_logs;
create policy "audit logs select admin reports" on public.audit_logs
for select to authenticated
using (public.has_any_app_role(array['Admin','Office / Reports','Certificate Approver']::text[]));

drop policy if exists "audit logs insert approved users" on public.audit_logs;
create policy "audit logs insert approved users" on public.audit_logs
for insert to authenticated
with check (actor_user_id = auth.uid() and public.has_any_app_role(array['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports']::text[]));

-- Settings policies.
drop policy if exists "app settings select approved" on public.app_settings;
create policy "app settings select approved" on public.app_settings
for select to authenticated
using (public.has_any_app_role(array['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports','Viewer']::text[]));

drop policy if exists "app settings admin insert" on public.app_settings;
create policy "app settings admin insert" on public.app_settings
for insert to authenticated
with check (public.has_any_app_role(array['Admin']::text[]));

drop policy if exists "app settings admin update" on public.app_settings;
create policy "app settings admin update" on public.app_settings
for update to authenticated
using (public.has_any_app_role(array['Admin']::text[]))
with check (public.has_any_app_role(array['Admin']::text[]));

-- Role-based database hardening. Existing data is not deleted.
-- Equipment.
drop policy if exists "equipment authenticated all" on public.equipment;
drop policy if exists "equipment v34 select approved" on public.equipment;
create policy "equipment v34 select approved" on public.equipment
for select to authenticated
using (public.has_any_app_role(array['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports','Viewer']::text[]));

drop policy if exists "equipment v34 insert managers" on public.equipment;
create policy "equipment v34 insert managers" on public.equipment
for insert to authenticated
with check (public.has_any_app_role(array['Admin','Equipment Manager']::text[]));

drop policy if exists "equipment v34 update managers" on public.equipment;
create policy "equipment v34 update managers" on public.equipment
for update to authenticated
using (public.has_any_app_role(array['Admin','Equipment Manager']::text[]))
with check (public.has_any_app_role(array['Admin','Equipment Manager']::text[]));

drop policy if exists "equipment v34 delete admin" on public.equipment;
create policy "equipment v34 delete admin" on public.equipment
for delete to authenticated
using (public.has_any_app_role(array['Admin']::text[]));

-- Inspections.
drop policy if exists "inspections authenticated all" on public.inspections;
drop policy if exists "inspections v34 select approved" on public.inspections;
create policy "inspections v34 select approved" on public.inspections
for select to authenticated
using (public.has_any_app_role(array['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports','Viewer']::text[]));

drop policy if exists "inspections v34 insert inspectors" on public.inspections;
create policy "inspections v34 insert inspectors" on public.inspections
for insert to authenticated
with check (public.has_any_app_role(array['Admin','Inspector']::text[]));

drop policy if exists "inspections v34 update inspectors" on public.inspections;
create policy "inspections v34 update inspectors" on public.inspections
for update to authenticated
using (public.has_any_app_role(array['Admin','Inspector']::text[]))
with check (public.has_any_app_role(array['Admin','Inspector']::text[]));

drop policy if exists "inspections v34 delete admin" on public.inspections;
create policy "inspections v34 delete admin" on public.inspections
for delete to authenticated
using (public.has_any_app_role(array['Admin']::text[]));

-- Equipment photos metadata.
drop policy if exists "equipment photos authenticated all" on public.equipment_photos;
drop policy if exists "equipment photos v34 select approved" on public.equipment_photos;
create policy "equipment photos v34 select approved" on public.equipment_photos
for select to authenticated
using (public.has_any_app_role(array['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports','Viewer']::text[]));

drop policy if exists "equipment photos v34 insert photo roles" on public.equipment_photos;
create policy "equipment photos v34 insert photo roles" on public.equipment_photos
for insert to authenticated
with check (public.has_any_app_role(array['Admin','Inspector','Equipment Manager']::text[]));

drop policy if exists "equipment photos v34 update photo roles" on public.equipment_photos;
create policy "equipment photos v34 update photo roles" on public.equipment_photos
for update to authenticated
using (public.has_any_app_role(array['Admin','Inspector','Equipment Manager']::text[]))
with check (public.has_any_app_role(array['Admin','Inspector','Equipment Manager']::text[]));

drop policy if exists "equipment photos v34 delete photo roles" on public.equipment_photos;
create policy "equipment photos v34 delete photo roles" on public.equipment_photos
for delete to authenticated
using (public.has_any_app_role(array['Admin','Inspector','Equipment Manager']::text[]));

-- Inspection photos metadata.
drop policy if exists "inspection photos authenticated all" on public.inspection_photos;
drop policy if exists "inspection photos v34 select approved" on public.inspection_photos;
create policy "inspection photos v34 select approved" on public.inspection_photos
for select to authenticated
using (public.has_any_app_role(array['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports','Viewer']::text[]));

drop policy if exists "inspection photos v34 insert inspectors" on public.inspection_photos;
create policy "inspection photos v34 insert inspectors" on public.inspection_photos
for insert to authenticated
with check (public.has_any_app_role(array['Admin','Inspector']::text[]));

drop policy if exists "inspection photos v34 update inspectors" on public.inspection_photos;
create policy "inspection photos v34 update inspectors" on public.inspection_photos
for update to authenticated
using (public.has_any_app_role(array['Admin','Inspector']::text[]))
with check (public.has_any_app_role(array['Admin','Inspector']::text[]));

drop policy if exists "inspection photos v34 delete inspectors" on public.inspection_photos;
create policy "inspection photos v34 delete inspectors" on public.inspection_photos
for delete to authenticated
using (public.has_any_app_role(array['Admin','Inspector']::text[]));

-- Certificates.
drop policy if exists "certificates authenticated all" on public.certificates;
drop policy if exists "certificates v34 select approved" on public.certificates;
create policy "certificates v34 select approved" on public.certificates
for select to authenticated
using (public.has_any_app_role(array['Admin','Certificate Approver','Office / Reports','Viewer']::text[]));

drop policy if exists "certificates v34 insert cert roles" on public.certificates;
create policy "certificates v34 insert cert roles" on public.certificates
for insert to authenticated
with check (public.has_any_app_role(array['Admin','Certificate Approver','Office / Reports']::text[]));

drop policy if exists "certificates v34 update cert roles" on public.certificates;
create policy "certificates v34 update cert roles" on public.certificates
for update to authenticated
using (public.has_any_app_role(array['Admin','Certificate Approver']::text[]))
with check (public.has_any_app_role(array['Admin','Certificate Approver']::text[]));

drop policy if exists "certificates v34 delete admin" on public.certificates;
create policy "certificates v34 delete admin" on public.certificates
for delete to authenticated
using (public.has_any_app_role(array['Admin']::text[]));

-- Storage object role hardening for existing photo buckets.
drop policy if exists "storage equipment photos select" on storage.objects;
drop policy if exists "storage equipment photos insert" on storage.objects;
drop policy if exists "storage equipment photos update" on storage.objects;
drop policy if exists "storage equipment photos delete" on storage.objects;
drop policy if exists "storage equipment photos v34 select" on storage.objects;
create policy "storage equipment photos v34 select" on storage.objects
for select to authenticated
using (bucket_id = 'equipment-photos' and public.has_any_app_role(array['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports','Viewer']::text[]));

drop policy if exists "storage equipment photos v34 insert" on storage.objects;
create policy "storage equipment photos v34 insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'equipment-photos' and public.has_any_app_role(array['Admin','Inspector','Equipment Manager']::text[]));

drop policy if exists "storage equipment photos v34 update" on storage.objects;
create policy "storage equipment photos v34 update" on storage.objects
for update to authenticated
using (bucket_id = 'equipment-photos' and public.has_any_app_role(array['Admin','Inspector','Equipment Manager']::text[]))
with check (bucket_id = 'equipment-photos' and public.has_any_app_role(array['Admin','Inspector','Equipment Manager']::text[]));

drop policy if exists "storage equipment photos v34 delete" on storage.objects;
create policy "storage equipment photos v34 delete" on storage.objects
for delete to authenticated
using (bucket_id = 'equipment-photos' and public.has_any_app_role(array['Admin','Inspector','Equipment Manager']::text[]));

drop policy if exists "storage inspection photos select" on storage.objects;
drop policy if exists "storage inspection photos insert" on storage.objects;
drop policy if exists "storage inspection photos update" on storage.objects;
drop policy if exists "storage inspection photos delete" on storage.objects;
drop policy if exists "storage inspection photos v34 select" on storage.objects;
create policy "storage inspection photos v34 select" on storage.objects
for select to authenticated
using (bucket_id = 'inspection-photos' and public.has_any_app_role(array['Admin','Inspector','Equipment Manager','Certificate Approver','Office / Reports','Viewer']::text[]));

drop policy if exists "storage inspection photos v34 insert" on storage.objects;
create policy "storage inspection photos v34 insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'inspection-photos' and public.has_any_app_role(array['Admin','Inspector']::text[]));

drop policy if exists "storage inspection photos v34 update" on storage.objects;
create policy "storage inspection photos v34 update" on storage.objects
for update to authenticated
using (bucket_id = 'inspection-photos' and public.has_any_app_role(array['Admin','Inspector']::text[]))
with check (bucket_id = 'inspection-photos' and public.has_any_app_role(array['Admin','Inspector']::text[]));

drop policy if exists "storage inspection photos v34 delete" on storage.objects;
create policy "storage inspection photos v34 delete" on storage.objects
for delete to authenticated
using (bucket_id = 'inspection-photos' and public.has_any_app_role(array['Admin','Inspector']::text[]));

-- Make sure Brendan remains fully provisioned.
insert into public.user_roles (user_id, role, assigned_by)
select u.id, r.role, u.id
from auth.users u
cross join (
  values
    ('Admin'),
    ('Inspector'),
    ('Equipment Manager'),
    ('Certificate Approver'),
    ('Office / Reports')
) as r(role)
where lower(u.email) = lower('brendan@sprayandwash.co.nz')
on conflict (user_id, role) do nothing;

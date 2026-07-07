-- Spray & Wash Height Safety Register
-- V3 User Accounts & Multi-Role Support
-- Run this in Supabase SQL Editor before uploading the V3 app files.
-- This is additive and does not delete existing equipment, inspections or photos.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz default now(),
  last_seen_at timestamptz
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  role text not null check (role in (
    'Admin',
    'Inspector',
    'Equipment Manager',
    'Certificate Approver',
    'Office / Reports',
    'Viewer'
  )),
  assigned_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique (user_id, role)
);

-- Keep a profile row in sync when new users sign up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name, created_at, last_seen_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    now(),
    now()
  )
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      last_seen_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for existing users.
insert into public.profiles (user_id, email, display_name, created_at, last_seen_at)
select
  id,
  email,
  coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  created_at,
  now()
from auth.users
where email is not null
on conflict (user_id) do update
set email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    last_seen_at = now();

-- Helper used by policies and the app.
create or replace function public.has_app_role(check_role text)
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
      and ur.role = check_role
  );
$$;

grant execute on function public.has_app_role(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists "profiles select self or admin" on public.profiles;
create policy "profiles select self or admin" on public.profiles
for select to authenticated
using (user_id = auth.uid() or public.has_app_role('Admin'));

drop policy if exists "profiles insert self or admin" on public.profiles;
create policy "profiles insert self or admin" on public.profiles
for insert to authenticated
with check (user_id = auth.uid() or public.has_app_role('Admin'));

drop policy if exists "profiles update self or admin" on public.profiles;
create policy "profiles update self or admin" on public.profiles
for update to authenticated
using (user_id = auth.uid() or public.has_app_role('Admin'))
with check (user_id = auth.uid() or public.has_app_role('Admin'));

drop policy if exists "user roles select self or admin" on public.user_roles;
create policy "user roles select self or admin" on public.user_roles
for select to authenticated
using (user_id = auth.uid() or public.has_app_role('Admin'));

drop policy if exists "user roles insert admin" on public.user_roles;
create policy "user roles insert admin" on public.user_roles
for insert to authenticated
with check (public.has_app_role('Admin'));

drop policy if exists "user roles update admin" on public.user_roles;
create policy "user roles update admin" on public.user_roles
for update to authenticated
using (public.has_app_role('Admin'))
with check (public.has_app_role('Admin'));

drop policy if exists "user roles delete admin" on public.user_roles;
create policy "user roles delete admin" on public.user_roles
for delete to authenticated
using (public.has_app_role('Admin'));

-- Bootstrap Brendan as Admin and operational roles.
-- If your login email is different, change the email below before running.
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

-- Private staff accounts: access status, first-password gate, and last-Admin protection.
create table if not exists public.app_user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'Active' check (status in ('Active','Blocked')),
  must_change_password boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.app_user_access(user_id,status,must_change_password)
select id,'Active',false from auth.users
on conflict (user_id) do nothing;

create or replace function public.app_user_is_active(p_user_id uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.app_user_access a where a.user_id=p_user_id and a.status='Active');
$$;
create or replace function public.has_app_role(check_role text) returns boolean language sql stable security definer set search_path=public as $$
  select public.app_user_is_active(auth.uid()) and exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role=check_role);
$$;
create or replace function public.has_any_app_role(check_roles text[]) returns boolean language sql stable security definer set search_path=public as $$
  select public.app_user_is_active(auth.uid()) and exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role=any(check_roles));
$$;
grant execute on function public.app_user_is_active(uuid), public.has_app_role(text), public.has_any_app_role(text[]) to authenticated;

alter table public.app_user_access enable row level security;
drop policy if exists "account access self or admin select" on public.app_user_access;
create policy "account access self or admin select" on public.app_user_access for select to authenticated using (user_id=auth.uid() or public.has_app_role('Admin'));

create or replace function public.enforce_admin_role_safety() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid:=coalesce(old.user_id,new.user_id); remaining integer;
begin
  if auth.uid() is not null and auth.uid()=target and tg_op in ('DELETE','UPDATE') then raise exception 'You cannot change your own permissions'; end if;
  if (tg_op='DELETE' and old.role='Admin') or (tg_op='UPDATE' and old.role='Admin' and new.role<>'Admin') then
    select count(*) into remaining from public.user_roles r join public.app_user_access a on a.user_id=r.user_id where r.role='Admin' and a.status='Active' and r.user_id<>old.user_id;
    if remaining=0 then raise exception 'Cannot remove the final active Admin role'; end if;
  end if;
  return coalesce(new,old);
end; $$;
drop trigger if exists user_roles_admin_safety on public.user_roles;
create trigger user_roles_admin_safety before delete or update on public.user_roles for each row execute function public.enforce_admin_role_safety();

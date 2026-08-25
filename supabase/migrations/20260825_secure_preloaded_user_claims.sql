-- REG-049: Pre-loaded accounts are a one-time, auditable invitation template.
-- This migration does not grant a role to a self-registered user unless that user
-- matches an active, unclaimed pre-loaded record by their authenticated email.

do $$
declare
  v_bad_roles text;
begin
  if to_regclass('public.operations_preloaded_users') is null then
    raise exception 'operations_preloaded_users is required before securing pre-loaded account claims';
  end if;

  select string_agg(distinct role, ', ' order by role)
  into v_bad_roles
  from public.operations_preloaded_users u
  cross join lateral unnest(coalesce(u.roles, array[]::text[])) role
  where role <> all (array['Admin','Height equipment manager','Height equipment user','Maintenance manager','Vehicle inspector']::text[]);

  if v_bad_roles is not null then
    raise exception 'Pre-loaded user rows contain unsupported roles: %', v_bad_roles;
  end if;
end $$;

alter table public.operations_preloaded_users
  alter column roles set default array[]::text[];

-- Claimed templates are retained as an audit record.  They cannot be edited,
-- deleted or re-used to overwrite live permissions after the first sign-in.
create or replace function public.operations_preloaded_users_protect_claimed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and (
    old.claimed_user_id is not null
    or old.claimed_at is not null
    or old.status = 'Claimed'
  ) then
    raise exception 'Claimed pre-loaded users are audit records and cannot be deleted';
  end if;

  if tg_op = 'UPDATE' and (
    old.claimed_user_id is not null
    or old.claimed_at is not null
    or old.status = 'Claimed'
  ) and (
    new.email is distinct from old.email
    or new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.display_name is distinct from old.display_name
    or new.role_preset is distinct from old.role_preset
    or new.roles is distinct from old.roles
    or new.active is distinct from old.active
    or new.status is distinct from old.status
    or new.claimed_user_id is distinct from old.claimed_user_id
    or new.claimed_at is distinct from old.claimed_at
    or new.notes is distinct from old.notes
  ) then
    raise exception 'Claimed pre-loaded users are audit records and cannot be changed';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists operations_preloaded_users_protect_claimed on public.operations_preloaded_users;
create trigger operations_preloaded_users_protect_claimed
before update or delete on public.operations_preloaded_users
for each row execute function public.operations_preloaded_users_protect_claimed();

create or replace function public.claim_preloaded_user_setup()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_pre public.operations_preloaded_users%rowtype;
  v_role text;
begin
  if v_user is null or v_email = '' then
    return;
  end if;

  -- Lock exactly one pending template.  The claimed_user_id/status condition makes
  -- the operation one-time even though the app calls this function on later sign-ins.
  select * into v_pre
  from public.operations_preloaded_users
  where lower(trim(email)) = v_email
    and active is true
    and status = 'Pending'
    and claimed_user_id is null
    and claimed_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    return;
  end if;

  insert into public.profiles(user_id, email, display_name, last_seen_at)
  values (v_user, v_email, coalesce(nullif(v_pre.display_name, ''), v_email), now())
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
        last_seen_at = now();

  foreach v_role in array coalesce(v_pre.roles, array[]::text[]) loop
    if v_role = any (array['Admin','Height equipment manager','Height equipment user','Maintenance manager','Vehicle inspector']::text[]) then
      insert into public.user_roles(user_id, role, assigned_by)
      select v_user, v_role, v_pre.created_by
      where not exists (
        select 1
        from public.user_roles ur
        where ur.user_id = v_user and ur.role = v_role
      );
    end if;
  end loop;

  update public.operations_preloaded_users
  set claimed_user_id = v_user,
      claimed_at = now(),
      status = 'Claimed'
  where id = v_pre.id
    and claimed_user_id is null
    and claimed_at is null
    and status = 'Pending';
end;
$$;

grant execute on function public.claim_preloaded_user_setup() to authenticated;

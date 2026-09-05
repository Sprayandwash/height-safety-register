-- Production notification foundation. This migration creates only the durable
-- data structures and no-send assignment queue. It deliberately does not create
-- a scheduler or enable any provider delivery flag.

create extension if not exists pg_net with schema extensions;

create table if not exists public.operations_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default false,
  weekly_email_enabled boolean not null default false,
  timezone text not null default 'Pacific/Auckland',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.operations_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription_json jsonb not null,
  device_label text,
  permission_state text not null default 'granted'
    check (permission_state in ('granted','denied','prompt','unsubscribed','expired')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.operations_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.operations_maintenance_tasks(id) on delete cascade,
  event_type text not null check (event_type in (
    'task_assigned','vehicle_issue_created','due_soon','overdue','critical_escalation','weekly_summary'
  )),
  escalation_stage text not null default 'standard',
  severity text not null default 'Medium' check (severity in ('Low','Medium','High','Critical')),
  title text not null,
  body text not null,
  deep_link text,
  state text not null default 'pending' check (state in ('pending','processing','sent','failed','suppressed')),
  eligible_at timestamptz not null default now(),
  sent_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.operations_notifications(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('push','email')),
  subscription_id uuid references public.operations_push_subscriptions(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','suppressed')),
  provider_message_id text,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists operations_notifications_pending_idx
  on public.operations_notifications (state, eligible_at)
  where state in ('pending','failed');
create index if not exists operations_notifications_recipient_idx
  on public.operations_notifications (recipient_user_id, created_at desc);
create index if not exists operations_notifications_task_idx
  on public.operations_notifications (task_id, event_type)
  where task_id is not null;
create index if not exists operations_notification_deliveries_recipient_idx
  on public.operations_notification_deliveries (recipient_user_id, attempted_at desc);
create unique index if not exists operations_notification_deliveries_once_idx
  on public.operations_notification_deliveries (
    notification_id, channel, coalesce(subscription_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.operations_notification_preferences enable row level security;
alter table public.operations_push_subscriptions enable row level security;
alter table public.operations_notifications enable row level security;
alter table public.operations_notification_deliveries enable row level security;

drop policy if exists "notification preferences select self or admin" on public.operations_notification_preferences;
create policy "notification preferences select self or admin"
  on public.operations_notification_preferences for select to authenticated
  using ((select auth.uid()) = user_id or public.spray_wash_has_role(array['Admin']));

drop policy if exists "push subscriptions select self or admin" on public.operations_push_subscriptions;
create policy "push subscriptions select self or admin"
  on public.operations_push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id or public.spray_wash_has_role(array['Admin']));

drop policy if exists "notifications select recipient or admin" on public.operations_notifications;
create policy "notifications select recipient or admin"
  on public.operations_notifications for select to authenticated
  using ((select auth.uid()) = recipient_user_id or public.spray_wash_has_role(array['Admin']));

drop policy if exists "notification deliveries select recipient or admin" on public.operations_notification_deliveries;
create policy "notification deliveries select recipient or admin"
  on public.operations_notification_deliveries for select to authenticated
  using ((select auth.uid()) = recipient_user_id or public.spray_wash_has_role(array['Admin']));

create or replace function public.queue_operations_task_assignment_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient_id uuid;
begin
  if new.status in ('Completed','Deferred') then return new; end if;
  if tg_op = 'UPDATE'
     and new.assigned_user_id is not distinct from old.assigned_user_id
     and new.assigned_role is not distinct from old.assigned_role then
    return new;
  end if;
  for recipient_id in
    select distinct access_row.user_id
    from public.app_user_access access_row
    left join public.user_roles role_row on role_row.user_id = access_row.user_id
    where access_row.status = 'Active'
      and coalesce(access_row.must_change_password, false) = false
      and (
        access_row.user_id = new.assigned_user_id
        or (new.assigned_role is not null and role_row.role = new.assigned_role)
      )
  loop
    insert into public.operations_notifications (
      recipient_user_id, task_id, event_type, escalation_stage, severity, title, body,
      deep_link, state, eligible_at, idempotency_key, metadata
    ) values (
      recipient_id, new.id, 'task_assigned', 'standard', coalesce(new.priority,'Medium'),
      'New task assigned', new.title || case when new.due_date is null then '' else ' — due ' || new.due_date end,
      './', 'pending', now(), 'task:' || new.id || ':' || recipient_id || ':task_assigned:once',
      jsonb_build_object('source','routine-push','channel','push','task_status',new.status,'due_date',new.due_date)
    ) on conflict (idempotency_key) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists operations_maintenance_tasks_queue_assignment_push
  on public.operations_maintenance_tasks;
create trigger operations_maintenance_tasks_queue_assignment_push
after insert or update of assigned_user_id, assigned_role
on public.operations_maintenance_tasks
for each row execute function public.queue_operations_task_assignment_push();

-- Delivery remains disabled: no cron job is created by this migration.

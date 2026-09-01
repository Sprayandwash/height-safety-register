-- Employee notification foundation for Spray & Wash Operations.
-- This migration deliberately creates no scheduled jobs and sends no notifications.
-- Delivery can only be performed later by a server-side Edge Function.

create table if not exists public.operations_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default false,
  weekly_email_enabled boolean not null default true,
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
    check (permission_state in ('granted', 'denied', 'prompt', 'unsubscribed', 'expired')),
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
    'task_assigned',
    'vehicle_issue_created',
    'due_soon',
    'overdue',
    'critical_escalation',
    'weekly_summary'
  )),
  escalation_stage text not null default 'standard',
  severity text not null default 'Medium'
    check (severity in ('Low', 'Medium', 'High', 'Critical')),
  title text not null,
  body text not null,
  deep_link text,
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'sent', 'failed', 'suppressed')),
  eligible_at timestamptz not null default now(),
  sent_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_notifications_pending_idx
  on public.operations_notifications (state, eligible_at)
  where state in ('pending', 'failed');

create index if not exists operations_notifications_recipient_idx
  on public.operations_notifications (recipient_user_id, created_at desc);

create index if not exists operations_notifications_task_idx
  on public.operations_notifications (task_id, event_type)
  where task_id is not null;

create table if not exists public.operations_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.operations_notifications(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('push', 'email')),
  subscription_id uuid references public.operations_push_subscriptions(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'failed', 'suppressed')),
  provider_message_id text,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists operations_notification_deliveries_once_idx
  on public.operations_notification_deliveries (notification_id, channel, coalesce(subscription_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists operations_notification_deliveries_recipient_idx
  on public.operations_notification_deliveries (recipient_user_id, attempted_at desc);

alter table public.operations_notification_preferences enable row level security;
alter table public.operations_push_subscriptions enable row level security;
alter table public.operations_notifications enable row level security;
alter table public.operations_notification_deliveries enable row level security;

-- Notification enrolment and delivery are handled by narrowly scoped Edge Functions.
-- There are intentionally no browser write policies for subscription payloads or preferences.
-- Employees may only see their own notification history; Admins can inspect delivery diagnostics.
create policy "notification preferences select self or admin"
  on public.operations_notification_preferences
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or public.spray_wash_has_role(array['Admin'])
  );

create policy "push subscriptions select self or admin"
  on public.operations_push_subscriptions
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or public.spray_wash_has_role(array['Admin'])
  );

create policy "notifications select recipient or admin"
  on public.operations_notifications
  for select to authenticated
  using (
    (select auth.uid()) = recipient_user_id
    or public.spray_wash_has_role(array['Admin'])
  );

create policy "notification deliveries select recipient or admin"
  on public.operations_notification_deliveries
  for select to authenticated
  using (
    (select auth.uid()) = recipient_user_id
    or public.spray_wash_has_role(array['Admin'])
  );

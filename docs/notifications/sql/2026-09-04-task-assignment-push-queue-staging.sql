-- Staging source record: task-assignment push candidate trigger
-- Applied directly to isolated staging on 2026-09-04; this trigger queues records only.
-- It does not call any provider or deliver any notification.

create or replace function public.queue_operations_task_assignment_push()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient_id uuid;
begin
  if new.status in ('Completed', 'Deferred') then return new; end if;
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
      recipient_id, new.id, 'task_assigned', 'standard', coalesce(new.priority, 'Medium'),
      'New task assigned', new.title || case when new.due_date is null then '' else ' — due ' || new.due_date end,
      './', 'pending', now(), 'task:' || new.id || ':' || recipient_id || ':task_assigned:once',
      jsonb_build_object('source', 'routine-push', 'channel', 'push', 'task_status', new.status, 'due_date', new.due_date)
    ) on conflict (idempotency_key) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists operations_maintenance_tasks_queue_assignment_push on public.operations_maintenance_tasks;
create trigger operations_maintenance_tasks_queue_assignment_push
after insert or update of assigned_user_id, assigned_role on public.operations_maintenance_tasks
for each row execute function public.queue_operations_task_assignment_push();

revoke all on function public.queue_operations_task_assignment_push() from public;

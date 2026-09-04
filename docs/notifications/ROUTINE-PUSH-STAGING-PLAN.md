# Routine task push — staging plan

**Status:** Step 9A no-send staging preflight passed on 2026-09-04 (run 33842212511). Delivery remains **disabled** and no routine push scheduler is installed or active.

## Delivery policy

- **Channel:** Web Push only; weekly email remains a separate, currently inactive routine.
- **Candidates:** A newly assigned task queues a push candidate immediately; open assigned tasks also generate due-soon and overdue candidates.
- **Recipients:** Active assigned users or active users in the assigned role, excluding accounts that must change password.
- **Timing:** A future scheduler may call the function every 15 minutes. The function itself permits delivery only on Pacific/Auckland weekdays, 6:30 am–7:00 pm.
- **Deduplication:** Due-soon reminders are one per task/recipient; overdue reminders are one per task/recipient/NZ day.
- **Stale candidates:** Suppressed if the task is completed, deferred, or no longer qualifies by its due date.

## Required staging controls

1. The Edge Function action is `run_task_push_delivery`.
2. It requires a custom `x-spray-wash-task-push-secret` that matches `TASK_PUSH_SCHEDULER_SECRET`.
3. It also requires `TASK_PUSH_DELIVERY_ENABLED=true`; otherwise it runs a no-write preview only.
4. Only candidates tagged `source: routine-push` and `channel: push` can be dispatched.
5. The test or future scheduler must target the isolated staging project only. Production is excluded.

## Step 9A result

- The reviewed function was deployed to the isolated staging project and accepted the separate task-push scheduler secret.
- The guarded preview completed with delivery disabled. No push, email, SMS, cron activation or production action occurred.
- The staging task table now has a queue-only assignment trigger. It creates `task_assigned` candidates for active recipients only, without provider delivery.

## Before Step 9B

- Deploy the reviewed function to the staging project.
- Set the scheduler secret and keep `TASK_PUSH_DELIVERY_ENABLED=false`.
- Execute the read-only guarded preview and verify it creates no notifications or delivery records.
- Configure any staging cron job as inactive.
- Run the controlled single-device Step 9B test only after the user approves that external push delivery.

## Later design item

New-task assignment can be made truly immediate by queuing a `task_assigned` candidate from the task-write path. The current routine dispatcher covers due-soon and overdue reminders; the 15-minute scheduler cadence is the prompt fallback until that event hook is added.

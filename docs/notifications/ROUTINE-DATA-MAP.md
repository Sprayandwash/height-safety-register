# Routine notification data map

**Stage:** Step 2 — source mapping only. No routine candidate, schedule or provider delivery is enabled.

## Source mapping

| Report content | Source | Selection |
|---|---|---|
| Pending tasks | `operations_maintenance_tasks` | Exclude `Completed` and `Deferred`; group by overdue, due within 48 hours and later due. Use title, priority, due date, assigned user/role and source module. |
| Employee task eligibility | `assigned_user_id`, `assigned_role`, `user_roles`, `app_user_access` | Include direct assignment and role assignment only for active users. |
| Task activity | `operations_maintenance_tasks` | Tasks created, completed and deferred within the preceding NZ calendar week. |
| Vehicle-check activity and issues | `operations_inspections` and associated answers | Checks submitted in the preceding NZ calendar week; highlight non-OK outcomes only. |
| Maintenance activity | `operations_maintenance_log` | Maintenance records created in the preceding NZ calendar week. |
| Height Equipment activity | `inspections` | Height inspections created in the preceding NZ calendar week. |
| Admin recipients | `user_roles`, `app_user_access`, Auth user email resolved only within the Edge Function | Active Admins at send time. Never hard-code an address. |
| Employee email preference | `operations_notification_preferences.weekly_email_enabled` | Employee-only, explicit opt-in. |

## Required safety correction before any email work

The existing preference column currently defaults `weekly_email_enabled` to `true`. That is incompatible with optional employee emails because a push-enrolment preference row could otherwise silently make an employee email-eligible.

Before an email provider, scheduler or delivery action is introduced, the notification migration must:

1. change the column default to `false`; and
2. set existing employee preference rows to `false` unless that person has explicitly opted in through the new setting.

The Admin weekly report is independent of the employee setting: it is sent only to active Admins when the approved scheduler runs.

## Candidate requirements

- Use stable idempotency keys for each task/recipient/window and each weekly report/week/recipient.
- Candidate generation returns only aggregate counts and safe task descriptors in preview mode.
- Actual recipient email lookup and provider calls occur only in the later, explicitly controlled delivery action.
- A task change or completion must suppress stale unsent candidates.

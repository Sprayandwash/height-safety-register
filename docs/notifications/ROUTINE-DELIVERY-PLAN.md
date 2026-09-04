# Routine notification delivery plan

**Status:** One controlled staging weekly-email delivery completed on 2026-09-04; recurring delivery remains disabled. See [the delivery record](../testing/history/step-9b/2026-09-04-one-staging-weekly-delivery-33829310943.md).  
**Timezone:** Pacific/Auckland  
**Primary channel:** Android PWA push  
**Secondary channel:** Weekly email summary

## Delivery rules proposed for review

| Situation | Push | Email | Guardrails |
|---|---|---|---|
| A task is newly assigned to a named employee | One immediate push | None | Send only while the task remains open. Outside routine hours, hold until the next workday. |
| An open task becomes due within 48 hours | One push at 8:00 am on the relevant workday | None | One due-soon reminder per task and recipient. |
| A task is overdue | One push at 8:00 am each workday | None | Stop immediately when completed, deferred or unassigned. One per task, recipient and NZ calendar day. |
| Weekly Admin operations update | None | One email Monday at 7:30 am to each active Admin | Covers the prior NZ calendar week plus every current pending task. |
| Optional employee task update | None | One email Monday at 7:30 am to an opted-in employee | Contains only that employee's own current tasks; no team, customer or other-employee work. |

## Working-hours policy

Routine push delivery is allowed Monday to Friday, 6:30 am–7:00 pm NZ time. It is not sent on weekends or public holidays. Critical-event escalation is deliberately excluded from this phase and will need its own rule and approval.

## Channel and privacy boundaries

- In-app lists remain the authoritative source of work.
- Push content contains only the task title, concise due status and a link back into the app; no customer address, credentials or sensitive job notes.
- Email is a weekly summary, not an immediate fallback for every push. Active Admins receive the operations report; employees may independently opt into their own task-only update. With five employees the expected volume remains comfortably within the intended free-tier allowance.
- SMS is not included.
- Push and email preferences are respected independently. A disabled channel is never retried through another channel automatically.

## Weekly Admin operations update

The Monday email covers the preceding Monday–Sunday NZ time period and then lists the current workload requiring attention.

| Section | Content |
|---|---|
| Activity summary | Tasks created, completed and deferred; vehicle checks completed and any reported issues; maintenance records created; and Height Equipment inspections completed. |
| Pending tasks | Every open task, grouped by overdue, due within 48 hours and later-due. Each line shows the title, assigned employee or role, due date and priority. |
| Exceptions | Unassigned tasks, overdue vehicle checks and records that could not be delivered are clearly highlighted. |

The update is sent to the current active **Admin** role at send time, rather than a hard-coded address. It is a management report and does not alter task ownership or create new tasks.

## Optional employee task update

An employee can enable or disable their own weekly email preference in the app. When enabled, the Monday summary contains only their current open tasks:

- tasks assigned directly to that user; and
- tasks assigned to a role that user currently holds.

It groups their tasks by overdue, due within 48 hours and later-due, and includes title, due date and priority. It never includes other employees' tasks, the Admin activity report, customer address details or management-only exceptions. An employee with no open tasks receives no weekly email.

## Delivery architecture

1. Task writes create or update idempotent notification candidates; they do not call external providers directly.
2. A staging-only scheduled Edge Function evaluates due-soon and overdue candidates, prepares one weekly Admin operations update, and prepares opted-in employee task-only updates.
3. The existing delivery ledger records every queued, sent, failed or suppressed attempt.
4. Supabase Vault holds the scheduler invocation credentials. Edge Function secrets hold provider credentials only.
5. The production scheduler, email provider credentials, and production delivery remain absent until a separate production approval.

## Delivery-phase milestones

| Milestone | Outcome | Delivery status |
|---|---|---|
| Step 1 | Confirm this policy and acceptance criteria | Disabled |
| Steps 2–4 | Add candidate generation, suppression and idempotency tests | Disabled |
| Steps 5–8 | Build scheduled staging evaluator and weekly-email renderer | Completed; disabled |
| Step 9A | Read-only staging review of candidates and schedule configuration | Disabled |
| Step 9B | Controlled staging records and up to one explicitly approved delivery per channel | Email test completed; recurring delivery disabled |
| Step 10 | Separate production review and approval | Not authorised |

## Acceptance criteria

- No duplicate push for the same task, recipient and reminder window.
- Completion/deferment suppresses unsent reminders.
- No routine delivery outside the agreed hours.
- Each active Admin receives at most one weekly operations update in a calendar week.
- An employee can independently opt into or out of one weekly task-only update in a calendar week.
- An employee update contains only tasks assigned directly to them or to a role they hold.
- The Admin update contains the agreed activity sections and every current pending task, with no hard-coded recipient address.
- Failed external delivery is recorded without exposing endpoint, address, token or provider response body.
- Staging tests prove push and email separately before any production consideration.

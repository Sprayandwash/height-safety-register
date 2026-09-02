# Routine notification delivery plan

**Status:** Step 1 — design only. Routine delivery remains disabled.  
**Timezone:** Pacific/Auckland  
**Primary channel:** Android PWA push  
**Secondary channel:** Weekly email summary

## Delivery rules proposed for review

| Situation | Push | Email | Guardrails |
|---|---|---|---|
| A task is newly assigned to a named employee | One immediate push | None | Send only while the task remains open. Outside routine hours, hold until the next workday. |
| An open task becomes due within 48 hours | One push at 8:00 am on the relevant workday | None | One due-soon reminder per task and recipient. |
| A task is overdue | One push at 8:00 am each workday | None | Stop immediately when completed, deferred or unassigned. One per task, recipient and NZ calendar day. |
| Weekly outstanding-items summary | None | One email Monday at 7:30 am | Send only to users who have opted into weekly email and have outstanding items. |

## Working-hours policy

Routine push delivery is allowed Monday to Friday, 6:30 am–7:00 pm NZ time. It is not sent on weekends or public holidays. Critical-event escalation is deliberately excluded from this phase and will need its own rule and approval.

## Channel and privacy boundaries

- In-app lists remain the authoritative source of work.
- Push content contains only the task title, concise due status and a link back into the app; no customer address, credentials or sensitive job notes.
- Email is summary-only, not an immediate fallback for every push. With five employees this should remain around five messages per week, comfortably within the intended free-tier allowance.
- SMS is not included.
- Push and email preferences are respected independently. A disabled channel is never retried through another channel automatically.

## Delivery architecture

1. Task writes create or update idempotent notification candidates; they do not call external providers directly.
2. A staging-only scheduled Edge Function evaluates due-soon, overdue and weekly-summary candidates.
3. The existing delivery ledger records every queued, sent, failed or suppressed attempt.
4. Supabase Vault holds the scheduler invocation credentials. Edge Function secrets hold provider credentials only.
5. The production scheduler, email provider credentials, and production delivery remain absent until a separate production approval.

## Delivery-phase milestones

| Milestone | Outcome | Delivery status |
|---|---|---|
| Step 1 | Confirm this policy and acceptance criteria | Disabled |
| Steps 2–4 | Add candidate generation, suppression and idempotency tests | Disabled |
| Steps 5–8 | Build scheduled staging evaluator and weekly-email renderer | Disabled |
| Step 9A | Read-only staging review of candidates and schedule configuration | Disabled |
| Step 9B | Controlled staging records and up to one explicitly approved delivery per channel | Explicit test only |
| Step 10 | Separate production review and approval | Not authorised |

## Acceptance criteria

- No duplicate push for the same task, recipient and reminder window.
- Completion/deferment suppresses unsent reminders.
- No routine delivery outside the agreed hours.
- Each weekly email recipient receives at most one summary in a calendar week.
- Failed external delivery is recorded without exposing endpoint, address, token or provider response body.
- Staging tests prove push and email separately before any production consideration.

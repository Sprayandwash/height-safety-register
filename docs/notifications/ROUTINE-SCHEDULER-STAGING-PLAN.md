# Routine weekly scheduler — staging plan

**Status:** The staging-only scheduler is configured but **inactive**. A one-off weekly email delivery was successfully tested on 2026-09-04; recurring delivery remains disabled. See [the controlled delivery record](../testing/history/step-9b/2026-09-04-one-staging-weekly-delivery-33829310943.md).

- **Timezone:** Pacific/Auckland
- **Routine:** Monday at 7:30 am local time
- **Cron schedule:** `30 18 * * 0` UTC
- **Admin recipients:** Active Admin users at run time
- **Employee recipients:** Active users with an explicit weekly-email opt-in; task-only
- **Idempotency:** One candidate per recipient and preceding NZ week

## Current staging configuration

1. A staging-only Vault secret holds the scheduler invocation value.
2. A staging-only cron job named `spray-and-wash-weekly-routine-staging` is configured and marked **inactive**.
3. If explicitly enabled later, the job makes a `pg_net` POST to the deployed `employee-notifications` function with action `run_weekly_routine_delivery` and its custom secret header.
4. The Edge Function requires both the matching scheduler secret and the temporary delivery-enabled switch before it can call the email provider.

## Safeguards

- The cron job is currently disabled and has no scheduler executions.
- The one-off test enabled delivery only for the duration of that controlled workflow and automatically reset it afterwards.
- Active Admin recipients are resolved at send time; no address is stored in the scheduler.
- Employees receive a summary only after they independently opt in, and only of their own tasks.
- Recipient-week idempotency prevents a duplicate weekly summary.
- No production scheduler or routine delivery is authorised.

Enabling recurring staging delivery or considering production remains a separate, explicit approval.

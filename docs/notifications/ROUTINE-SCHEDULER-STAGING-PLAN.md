# Routine weekly scheduler — staging plan

**Status:** Step 9B completed on 2026-09-04: the staging-only cron job is configured and inactive. No routine delivery is active. See [the Step 9B record](../testing/history/step-9b/2026-09-04-inactive-weekly-scheduler-33821491212.md).

- **Timezone:** Pacific/Auckland
- **Routine:** Monday at 7:30 am local time
- **Admin recipients:** Active Admin users at run time
- **Employee recipients:** Active users with an explicit weekly-email opt-in; task-only
- **Idempotency:** One candidate per recipient and preceding NZ week

## Step 9B configuration boundary

Step 9B created the following, all **inactive**:

1. A staging-only Vault secret holding a random scheduler invocation value.
2. A staging-only cron job named for the weekly routine, scheduled as `30 18 * * 0` UTC and marked inactive.
3. A `pg_net` POST to the deployed `employee-notifications` function with action `run_weekly_routine_preview`, the custom secret header, and no delivery action.

The endpoint accepts this action only when the custom secret matches its Edge Function environment secret. It returns the same disabled, no-write preview used in Step 9A. It does not resolve email addresses, call Resend, write notification or delivery records, or activate the cron job.

The Step 9B record will document the staging job ID and its inactive state without recording any secret values. A later, separately approved delivery phase is required before emails can ever be scheduled or sent.

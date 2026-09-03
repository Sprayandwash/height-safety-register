# Routine weekly scheduler — staging plan

**Status:** Read-only evaluator only. No cron job or routine delivery is active.

- **Timezone:** Pacific/Auckland
- **Routine:** Monday at 7:30 am local time
- **Admin recipients:** Active Admin users at run time
- **Employee recipients:** Active users with an explicit weekly-email opt-in; task-only
- **Idempotency:** One candidate per recipient and preceding NZ week

The preview does not resolve email addresses, call Resend, write notification or delivery records, or create a scheduler job. The next controlled staging step will configure an inactive scheduler with Vault-held invocation credentials, then review it before any later delivery approval.

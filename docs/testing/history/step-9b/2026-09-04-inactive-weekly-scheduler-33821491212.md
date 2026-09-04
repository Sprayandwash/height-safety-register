# Step 9B — inactive weekly routine scheduler (staging)

**Date:** 2026-09-04 UTC  
**Workflow run:** [33821491212](https://github.com/Sprayandwash/spray-and-wash-operations-app/actions/runs/33821491212)  
**Target:** Spray & Wash Staging only (`tsnmbvezrweciaitkquf`)

## Result

Configured successfully.

- Guarded scheduler-preview endpoint deployed to staging.
- Vault secret `weekly_routine_scheduler_secret` exists; its value is not recorded here.
- Cron job: `spray-and-wash-weekly-routine-staging`.
- Schedule: `30 18 * * 0` UTC — Monday 7:30am Pacific/Auckland.
- State: **inactive**.
- Cron execution count: **0**.
- Weekly-summary notification records: **0**.
- Weekly-summary delivery records: **0**.

No email, push notification, provider call, or routine-delivery record was created. Production was not changed.

## Verification

The workflow passed its explicit staging-target guard and completed successfully. A follow-up database audit confirmed the job, schedule, inactive state, stored endpoint command, Vault secret presence, and zero executions.

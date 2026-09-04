# Step 9B — controlled scheduled routine push

- **Date:** 2026-09-04
- **Environment:** isolated Staging only (`tsnmbvezrweciaitkquf`)
- **Workflow run:** [33926383683](https://github.com/Sprayandwash/spray-and-wash-operations-app/actions/runs/33926383683)
- **Candidate:** one synthetic, isolated staging candidate only

## Result

Passed. The candidate was delivered through the database scheduler route: `pg_net` → guarded Edge Function → enrolled Android PWA device. The candidate recorded `sent` and exactly one push delivery.

## Recovery finding

The first controlled run failed before delivery because `pg_net` was not installed in Staging. It returned delivery controls to disabled. Installing `pg_net` and rerunning the same candidate resolved the configuration issue.

## Safeguards verified

- Production was not accessed.
- The recurring Staging cron job remained inactive.
- The workflow accepted only the exact confirmation and candidate UUID.
- Delivery controls were reset to disabled after the run.
- The synthetic task, candidate and delivery rows were removed after verification.

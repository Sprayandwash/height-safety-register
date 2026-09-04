# Controlled staging weekly email delivery

**Date:** 2026-09-04 UTC  
**Workflow run:** [33829310943](https://github.com/Sprayandwash/spray-and-wash-operations-app/actions/runs/33829310943)  
**Target:** Spray & Wash Staging only (`tsnmbvezrweciaitkquf`)

## Completed

- Ran the explicitly approved one-off staging weekly delivery.
- Sent the Admin weekly operations update to **2** current active Admin recipients.
- Sent **0** employee summaries because no employee had opted in.
- The report covered the preceding NZ calendar week: 2026-08-24 to 2026-08-30.
- Delivery was recorded through the notification ledger with recipient-week idempotency keys.

## Audit

- Weekly-summary notification records: **2**.
- Weekly-summary sent email-delivery records: **2**.
- Recipient types: **2 Admin**, **0 employee**.
- Cron schedule remains `30 18 * * 0` UTC (Monday 7:30 am Pacific/Auckland) and **inactive**.
- Scheduler execution count remains **0**; this was a one-off manual delivery, not a scheduled run.
- The workflow reset the temporary delivery enablement immediately after the test.
- Production was not changed.

Any recurring staging delivery or production delivery requires separate, explicit approval.

# Notification system — Step 8 changeset

Date: 1 September 2026 (NZ)

## Purpose

Build a staging-only reconciliation path that creates auditable notification records for assigned maintenance tasks. Delivery remains disabled.

## Implemented

- `employee-notifications` Edge Function, staging version 3.
- Admin-only `reconcile_staging` action.
- Preview mode: identifies due-soon (within two NZ days) and overdue open tasks without writing records.
- Record mode: requires the literal `STAGING_RECORDS_ONLY` confirmation and creates only `operations_notifications` records.
- Recipient resolution: an active explicitly assigned user, plus active users holding an assigned role.
- Idempotency: one due-soon record per recipient/task and one overdue record per recipient/task/NZ day.

## Explicit exclusions

- No scheduler or cron job.
- No VAPID private key, provider integration, push send, email send, SMS, or production deployment.
- No immediate-assignment trigger yet; that is a later delivery-rule change.

## Verification completed

- Edge Function deployment: staging version 3, active, JWT required.
- Unauthenticated reconciliation request: rejected with HTTP 401.
- JavaScript/format checks passed locally for the accompanying PWA enrolment component and service worker.
- Supabase advisor review completed. Its reported warnings pre-exist this changeset; no database function or policy was added in Step 8.

## Step 9a entry criteria

- Use an active staging Admin account.
- Run preview and then controlled record mode against one deliberately assigned test task.
- Confirm a single pending notification record appears and no delivery record or external message is produced.

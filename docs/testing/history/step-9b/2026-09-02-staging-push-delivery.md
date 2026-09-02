# Step 9B — controlled Android staging push delivery

**Date:** 2 September 2026 (NZST)  
**Environment:** Isolated Staging Supabase only  
**Scope:** One manual push test to the enrolled Android PWA device

## Purpose

Prove that the approved staging-only sender can deliver exactly one visible Android PWA push notification after the device enrolment and VAPID setup work.

## Controls in force

- Signed-in active administrator required.
- Exactly one granted subscription required.
- Explicit request confirmation required.
- Staging-only server gate required.
- A delivery attempt for that device is refused after the first attempt.
- No scheduler, email, SMS, task batch or production configuration was used.

## Result

The final controlled test passed.

- The push provider accepted the message with HTTP `201`.
- The Android device displayed the **S&W App STAGING** notification.
- The staging ledger contains one notification record and one push-delivery record with status `sent`.
- The record is marked with metadata source `manual-staging-test`.
- No email or SMS delivery occurred.
- Production Supabase and production hosting were not accessed or changed.

## Remediation during the controlled test

The first button press was rejected before a notification record was created because the sender used record labels outside the existing database constraints. The sender was corrected to use established notification values while preserving explicit test metadata. The correction passed the regression suite and browser smoke tests before redeployment. The subsequent press produced the successful result above.

## Evidence retained

- Screenshot of the Android notification received by the user.
- Staging database delivery status: `push`, `sent`, provider response `201`.
- Sender source: PR #125, corrected by PR #127.
- Staging-only configuration workflow: run `33592570188`.

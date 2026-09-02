# Step 9B record — Android PWA push enrolment

**Date:** 2 September 2026 (NZST)  
**Environment:** Isolated Staging Supabase `tsnmbvezrweciaitkquf`  
**Status:** Passed

## Purpose

Confirm that an installed Android version of the isolated Staging PWA can enrol for job reminders after the employee explicitly enables the feature and grants Android notification permission.

## Controlled scope

- A separately managed Staging Admin account opened the dedicated Staging PWA.
- The PWA showed its permanent **STAGING — TEST DATA ONLY — NOT PRODUCTION** banner.
- The user installed the PWA, opened **Account → Job reminders**, selected **Enable phone reminders**, and accepted the device notification permission.
- The test did not create a notification record, dispatch a push, send email or SMS, add a scheduler, access Production, or change VAPID keys.

## Evidence

The installed Android PWA displayed **Enabled on 1 device**.

A direct read-only verification of Staging then confirmed:

| Check | Result |
| --- | --- |
| Push-subscription records | 1 |
| Granted push subscriptions | 1 |
| Users with push enabled | 1 |
| Notification-delivery records | 0 |
| Push, email or SMS delivery records | 0 |

## Outcome

Android PWA enrolment is working end-to-end through secure browser permission, subscription registration and persisted user preference. The device is enrolled but delivery remains deliberately inactive.

## Safety confirmation

- Production Supabase `twkgfmctuffmkvkmdkct` was not accessed.
- No credentials, subscription endpoint, public-key value, account address or other test-account data are recorded here.
- The temporary public staging PWA is isolated from Production and remains visibly marked as test-only.

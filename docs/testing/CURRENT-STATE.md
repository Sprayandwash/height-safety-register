# Testing and debugging current state

**Checkpoint date:** 2 September 2026 (NZST)  
**Application:** Spray and Wash Operations App  
**Repository:** `Sprayandwash/spray-and-wash-operations-app`

## Current programme position

The agreed regression programmes for Height Equipment, Vehicle Checks, Maintenance and Admin are complete. The full mobile UI audit was also completed through its read-only coverage and follow-up fixes.

The latest verified production source is commit `4e7c652c1dee66193f0cd3f8129cef09bea4ea4f` (**Further centre app shortcut swirl**). GitHub Actions staging build, browser review preflight and protected production release all passed on 30 August 2026; production release run `33306935360` completed successfully.

The latest mobile work delivered:

- the PWA shortcut swirl visually centred; and
- a phone-only Vehicle Checks attention list with asset name and colour-coded due/overdue status, where tapping the asset starts its inspection. The desktop/web table is unchanged.

No Supabase migration, database data change or `config.js` change was included in these releases.

The notification foundation is now verified in isolated Staging. Controlled Step 9B run `33545502753` passed after the notification Edge Function authentication path was corrected. It created 10 notification records and 0 delivery records. Controlled Step 9B run `33571260467` then created the initial staging-only VAPID key pair, verified the secret names, and recorded no subscription or delivery. A subsequent Android PWA Step 9B enrolment confirmed one granted Staging push subscription and one enabled preference. A controlled manual Android staging push test then received one visible notification and recorded one successful push delivery. Email, SMS, routine scheduling and production remain out of scope.

## Testing history status

The permanent `testing-history` branch remains the archive route for its existing Admin controlled workflow. The notification Step 9B records are maintained on `main` at [notification records review](history/step-9b/2026-09-01-run-33545502753.md) and [staging VAPID setup](history/step-9b/2026-09-01-run-33571260467.md) and [Android PWA enrolment](history/step-9b/2026-09-02-android-push-enrolment.md), and indexed in the run ledger.

## Notification delivery working instruction

For this notification programme, proceed autonomously through ordinary design, build, automated test, no-send Staging verification, documentation and recovery work. Do not stop for routine approval until the next external-send **Step 9B** is fully prepared. At that point, report the exact proposed recipient, channel and safeguards and wait for explicit Step 9B approval.

## Next safe action

For any new app change, start at **Step 1 — Define change**, identify the affected journeys, run the relevant automated checks, then complete read-only Staging review where applicable. The controlled Staging delivery phase has now proven one Android PWA push end-to-end through both the direct dispatcher and the inactive database scheduler route. The scheduler remains inactive and routine delivery flags remain off. Any routine assignment, due-soon, overdue or weekly-email delivery design remains a separate approved phase; production must not be used until its controls have been reviewed.

## Safety boundaries

- Production Supabase `twkgfmctuffmkvkmdkct` must not be accessed, queried, changed or tested without explicit user approval.
- Isolated Staging Supabase is `tsnmbvezrweciaitkquf`.
- Never expose passwords, tokens, secret values or raw test-account addresses.
- Do not change `config.js` unless specifically requested.
- Production Pages deployment is manual and protected; a merge to `main` is not authority to publish.

## Related records

- [Run ledger](RUN-LEDGER.md)
- [Recovery guide](RECOVERY-GUIDE.md)
- [Access and recovery handover](ACCESS-AND-RECOVERY-HANDOVER.md)
- [Mobile UI audit plan](MOBILE-UI-AUDIT-PLAN.md)
- [Master regression catalogue](../regression-catalogue.md)

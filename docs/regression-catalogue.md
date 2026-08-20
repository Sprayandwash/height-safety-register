# Regression catalogue

This is the source of truth for bugs discovered during Spray & Wash development and staging testing. Every future confirmed bug must receive an ID here before its fix is promoted. Where practical, the matching automated test must be added in the same pull request.

| ID | Confirmed regression | Expected behaviour | Coverage | Status |
| --- | --- | --- | --- | --- |
| REG-001 | A passed periodic vehicle check could create maintenance tasks. | A check with only `Completed OK` / `N/A` answers creates zero follow-up tasks. | `operations-rules.test.cjs` | Automated |
| REG-002 | A vehicle check could create too many tasks. | Create one follow-up task for each reported issue, and none for passed lines. | `operations-rules.test.cjs` | Automated |
| REG-003 | Vehicle checks were marked Due soon for the whole 14-day inspection interval. | Only show a vehicle check as Due soon when it is due within seven days; overdue remains critical. | `operations-rules.test.cjs` | Automated |
| REG-004 | Maintenance schedules were created for incompatible sub-assets. | Only compatible procedure categories can be assigned to Engine, Pump, Gearbox, Hose Reel, Pressure System, or whole Water Blaster assets. | `operations-rules.test.cjs` and Supabase migration guard | Automated / live migration verification pending |
| REG-005 | Historical invalid schedules inflated the Home maintenance counts. | Invalid/misassigned schedules are excluded from Home attention counts. | `operations-rules.test.cjs` + staging check | Automated / staging data check pending |
| REG-006 | Historic/test tasks polluted the Open Tasks list. | Deferred and completed tasks are excluded from open-task counts and lists. | `operations-rules.test.cjs` | Automated |
| REG-007 | Vehicle-check alerts did not lead directly to a usable check form. | Selecting an alert opens Vehicle Checks with the correct vehicle preselected. | Staging workflow | Manual staging check passed |
| REG-008 | Staging and production could be confused during testing. | Staging build shows a persistent test-data-only banner and uses the staging Supabase configuration. | `Build staging app` workflow | Automated / manual banner check passed |

## Rules for future bugs

1. Record the bug here with its expected behaviour and a clear reproduction scenario.
2. Add an automated test where the result is deterministic; otherwise add a concise manual staging check.
3. The fix and its new regression test travel in the same pull request.
4. The regression workflow must pass before the pull request is ready for production review.

## Coverage limits

Visual layout, browser/device-specific behaviour, and live Supabase migration execution still require manual staging checks. Automated tests must never use production data or production credentials.

## Mobile test phase — not started

This app is also used as a mobile/PWA app. Mobile regression coverage has **not** yet been started and no desktop/web result should be treated as proof of mobile behaviour. When mobile debugging begins, each mobile bug will use this same catalogue and receive a `MOB-` ID. The initial mobile checklist will cover installation/update behaviour, service-worker/cache updates, small-screen layout, touch targets, scrolling, camera/photo upload, offline/reconnect behaviour, and the core Vehicle Checks and Maintenance workflows on supported phones.

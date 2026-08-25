# Staging browser testing

The automated browser tests are split deliberately:

- `npm run test:ui` is the safe local browser suite. It never signs in or writes data.
- `npm run test:staging:preflight` is a staging-only read-only access check. It verifies the staging banner and a dedicated staging test-account sign-in. It does not create, change, or remove app records.
- **Create staging Vehicle Checks review records** is a separately confirmed review run. It creates two temporary records beginning with `E2E REVIEW —` and leaves them in place until the Operations manager has refreshed their already-open staging tab and confirmed the result.
- **Create staging Maintenance review record** is a separately confirmed review run. It creates one labelled maintenance log record and one linked task in staging only, and leaves them in place for review.

## One-time GitHub setup

Create a dedicated account in the **Spray and Wash Staging** app. Do not use a personal or production account. Give it only the roles required by the staged test journeys.

In the repository's `staging` GitHub Environment, add these secrets:

| Secret | Value |
| --- | --- |
| `E2E_STAGING_TEST_EMAIL` | The dedicated staging test-account email. |
| `E2E_STAGING_TEST_PASSWORD` | Its password. |
| `E2E_STAGING_HEIGHT_READONLY_EMAIL` | A separate staging account with **only** the `Height equipment user` role. |
| `E2E_STAGING_HEIGHT_READONLY_PASSWORD` | That account's password. |

The preflight retrieves the staging project ref and temporary browser URL itself from the latest `spray-wash-staging-app` artifact. Do not add a local `127.0.0.1` URL as a GitHub secret: that address only exists on your own computer.

## Automatic build and access preflight

When an approved change is merged to the repository's `main` branch, GitHub automatically runs **Build staging app**. A successful build automatically starts **Staging browser review preflight**. The preflight uses the newly built isolated staging bundle and verifies that the test harness can safely serve it and sign in.

Both runs are read-only with respect to the staging database: the build creates an artifact only, and the preflight creates, changes, and removes no app records. A missing secret, absent bundle, production ref/configuration, or absent staging banner stops the process.

The two workflows can still be started manually from **Actions** when a recheck is needed without merging another change. Manual builds require the existing exact confirmation `BUILD STAGING APP`.

## Height read-only security verification

**Verify staging Height read-only security** is a separate manually confirmed staging test. It requires the exact confirmation `VERIFY STAGING HEIGHT READONLY SECURITY` and signs in with the dedicated **Height equipment user-only** account—not the manager-level staging test account.

It attempts two fully-labelled direct writes through the authenticated Supabase client: one new Height Equipment record and one tiny equipment-photo upload. Both requests must be rejected by Row Level Security (RLS), and the test then confirms that neither record nor file exists. It does not modify production.

If either request is accepted, the run fails and retains clear `E2E SECURITY — HEIGHT READONLY —` evidence in isolated staging for investigation; it does not silently clean up a security failure.

## Review workflow contract

Every future staging review test must:

1. Use only the dedicated staging test-account secrets above, discover the project ref and temporary browser URL from the staging artifact, and refuse production configuration.
2. Prefix temporary labels with `E2E REVIEW —`.
3. State the records it creates, the pages to refresh and inspect, and the expected result in the GitHub Actions summary.
4. Never silently delete review records; cleanup is a separate, explicitly triggered action after review.

## Vehicle Checks browser review journey

Use **Actions → Create staging Vehicle Checks review records** only when fresh visible review evidence is wanted. It requires the exact confirmation `CREATE STAGING REVIEW RECORDS` and runs only against the isolated staging bundle.

It deliberately retains two labelled records so they can be inspected after refreshing the staging browser tab:

- one completed vehicle check, verified to create **zero** tasks;
- one check with a single reported issue, verified to create **exactly one** task.

This write journey runs on one desktop browser only. Mobile coverage will be added separately without duplicating staging review records.

## Maintenance browser review journey

Use **Actions → Create staging Maintenance review record** only when fresh visible Maintenance evidence is wanted. It requires the exact confirmation `CREATE STAGING MAINTENANCE REVIEW RECORD` and runs only against the isolated staging bundle.

It first creates an active vehicle with registration `E2E-MAINT-TEST` if that target does not already exist. The workflow creates **no schedules, machinery, sub-assets, or future maintenance attention** for that vehicle.

It then retains one labelled `E2E REVIEW —` **Other maintenance** record on the vehicle itself, with parts, notes, and a further-maintenance requirement. The test verifies that the record has exactly one linked open task whose description is exactly the follow-up requirement. Review it in **Maintenance → Log** and **Maintenance → Tasks** after opening the current staging bundle and refreshing the page.

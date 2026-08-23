# Staging browser testing

The automated browser tests are split deliberately:

- `npm run test:ui` is the safe local browser suite. It never signs in or writes data.
- `npm run test:staging:preflight` is a manually triggered staging-only access check. It verifies the staging banner and a dedicated staging test-account sign-in. It does not create, change, or remove app records.
- **Create staging Vehicle Checks review records** is a separately confirmed review run. It creates two temporary records beginning with `E2E REVIEW —` and leaves them in place until the Operations manager has refreshed their already-open staging tab and confirmed the result.
- **Create staging Maintenance review record** is a separately confirmed review run. It creates one labelled maintenance log record and one linked task in staging only, and leaves them in place for review.

## One-time GitHub setup

Create a dedicated account in the **Spray and Wash Staging** app. Do not use a personal or production account. Give it only the roles required by the staged test journeys.

In the repository's `staging` GitHub Environment, add these secrets:

| Secret | Value |
| --- | --- |
| `E2E_STAGING_TEST_EMAIL` | The dedicated staging test-account email. |
| `E2E_STAGING_TEST_PASSWORD` | Its password. |

The preflight retrieves the staging project ref and temporary browser URL itself from the latest `spray-wash-staging-app` artifact. Do not add a local `127.0.0.1` URL as a GitHub secret: that address only exists on your own computer.

## Running the access preflight

First run **Build staging app** to create a current `spray-wash-staging-app` artifact. Then open **Actions** → **Staging browser review preflight** → **Run workflow**. A successful run confirms that the test harness can safely serve the isolated staging bundle and sign in. A missing secret, absent bundle, production ref/configuration, or absent staging banner stops the run.

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

# Staging browser testing

The automated browser tests are split deliberately:

- `npm run test:ui` is the safe local browser suite. It never signs in or writes data.
- `npm run test:staging:preflight` is a manually triggered staging-only access check. It verifies the staging banner and a dedicated staging test-account sign-in. It does not create, change, or remove app records.
- Future **review runs** will use the same staging-only configuration to create temporary records beginning with `E2E REVIEW —`. They will leave those records in place until the Operations manager has refreshed their already-open staging tab and confirmed the result.

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

1. Use only the four staging secrets above and refuse production configuration.
2. Prefix temporary labels with `E2E REVIEW —`.
3. State the records it creates, the pages to refresh and inspect, and the expected result in the GitHub Actions summary.
4. Never silently delete review records; cleanup is a separate, explicitly triggered action after review.

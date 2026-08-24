# Production release control

## Purpose

Merging a pull request to `main` must not, by itself, publish the live Spray & Wash application. `main` is the reviewed source branch; the live GitHub Pages site is published only by the **Deploy production app** GitHub Actions workflow.

## Required sequence

1. Merge the approved pull request into `main`.
2. GitHub automatically runs regression checks and builds a separate staging bundle.
3. Complete staging and, where relevant, mobile review.
4. Start **Actions → Deploy production app → Run workflow** from `main`.
5. Type the exact confirmation: `RELEASE PRODUCTION APP`.
6. GitHub prepares the static Pages artifact, but does not publish it yet.
7. The workflow pauses at the protected `production` environment. The configured reviewer must approve the deployment in GitHub.
8. GitHub Pages publishes the approved artifact.

## Safety boundaries

- The release workflow is manual-only; it has no `push` trigger.
- It rejects runs that are not from `main` or whose confirmation text is incorrect.
- It rejects a source bundle marked as staging.
- It publishes the application files only. It never applies Supabase migrations or writes database records.
- Any database change remains a separate **Step 10B** decision with its own backup, migration, and verification process.

## GitHub configuration

The repository’s **Pages** source must be set to **GitHub Actions**, not branch publishing. The repository’s `production` Environment must require the designated Sprayandwash reviewer before deployment.

These two GitHub settings make approval a real technical gate rather than a process convention.

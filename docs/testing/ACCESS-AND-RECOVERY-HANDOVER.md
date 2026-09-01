# Spray & Wash Operations App — Access and recovery handover

**Last verified:** 30 August 2026 (NZST)  
**Purpose:** Give a new chat or engineer the safest practical route to regain the working access needed for this project. This is an operational map, not a credential store.

## Canonical project locations

| Resource | Canonical location | Use |
| --- | --- | --- |
| Source repository | `Sprayandwash/spray-and-wash-operations-app` | Code, documentation, pull requests and Actions |
| Production application | `https://sprayandwash.github.io/spray-and-wash-operations-app/` | Live static web/PWA app |
| Production Supabase | `twkgfmctuffmkvkmdkct` | Protected data, Auth and Storage — no access or tests without explicit approval |
| Staging Supabase | `tsnmbvezrweciaitkquf` | Isolated test environment only |
| Testing history | `testing-history` branch, `docs/testing/history/step-9b/` | Secret-free controlled-test records |

## Access available in a prepared Codex chat

### GitHub

The GitHub connector is the primary route. It has been used successfully for:

- reading repositories, branches, files, commits, pull requests and Action results;
- creating branches, blobs, trees, commits and pull requests;
- updating a branch reference, merging an approved pull request and retrieving Action logs/artifacts; and
- checking deployment runs and the current production source commit.

Start with read-only checks: repository details, `main`, open pull requests, workflow results, and the files in `docs/testing/`. Do not assume a local checkout is current.

**Recovery order if the connector is absent or incomplete:**

1. Inspect the available tools for a GitHub connector and use it first.
2. Inspect the workspace for a checked-out repository and its configured remotes. Treat it as a working copy only until compared with remote `main`.
3. Check whether an authenticated GitHub CLI configuration is supplied in the workspace. Use harmless read-only commands first.
4. If a browser session is already authenticated to the Sprayandwash GitHub account, use it for Actions pages and protected deployment approval.
5. Only after those routes fail, report the exact failed capability. Never ask for a personal token or secret in chat.

### GitHub Actions and staging browser tests

GitHub Actions is the preferred authenticated test runner. Staging credentials are held as Actions secrets and must never be copied into chat, source, logs or documentation.

Available workflow categories include JavaScript/regression checks, staging builds, read-only browser review, controlled Step 9B tests, mobile-audit fixture/bootstrap work, and protected production Pages release.

**Recovery order:** inspect workflow files in `.github/workflows/`, then recent Action runs and their logs. Confirm the current workflow inputs and secrets by their *names only*. If a required secret is genuinely missing, report the missing secret name and the blocked test; do not request its value in chat.

### Browser control

An authenticated cloud browser session has been used to open GitHub Actions, dispatch the protected production workflow and approve the `production` environment. Browser access may not persist into a new chat.

**Workflow-dispatch recovery (verified 2 September 2026 NZST):** if the GitHub connector can read and change repository content but does not expose a new-workflow dispatch operation, use the already-authenticated cloud browser for the Actions page. Open the required workflow in a **fresh tab**, select **Run workflow**, and allow the form a few seconds to finish loading before treating it as unavailable. The form may briefly show `Loading`; once ready it exposes the branch selector, required confirmation input and **Run workflow** button. This delay is not evidence that the GitHub connection or repository permissions need to be reconnected. Do not submit a controlled Step 9B workflow without the required fresh approval.

**Recovery order:** use the browser-control capability if present; otherwise rely on the GitHub connector for all read/write repository work. A browser is required only for a GitHub action that the connector cannot perform, such as a protected deployment approval.

Never enter credentials, one-time codes, tokens or passwords into a browser without the necessary user confirmation at that time.

### Supabase

Supabase provides Auth, database and Storage. The normal test path is through the deployed Staging UI and GitHub Actions; direct Supabase access is rarely necessary.

**Rules:**

- Staging only: `tsnmbvezrweciaitkquf`.
- Production: `twkgfmctuffmkvkmdkct`; prohibited unless the user explicitly approves the exact operation.
- Never print, copy, commit or request tokens, database URLs, passwords, service-role keys or test-account credentials.

**Recovery order:**

1. Inspect the Supabase skill/tools and the existing repository configuration.
2. Prefer the existing Actions-secret backed staging workflow or read-only staging UI route.
3. If direct access is essential, use only an already-authenticated Supabase connection and perform a read-only staging check.
4. If OAuth/tool access is unavailable, explain the required safe authentication step without requesting a token in chat. The user can restore the configured connection or secret themselves.

The repository's `docs/SUPABASE-RECOVERY-AUTOMATION.md` describes the separate backup/staging-project workflows. It names required secret *identifiers* but intentionally contains no values.

## Release and safety controls

- A merge to `main` does not publish production.
- The only production route is **Deploy production app** in GitHub Actions, launched from `main` with confirmation text `RELEASE PRODUCTION APP` and then approved at the protected `production` environment.
- The release publishes static app files only; it does not change Supabase data or run migrations.
- A database change is a separate Step 10B decision with its own backup, migration and verification.
- Do not alter `config.js` unless the user has specifically requested it.
- Preserve unrelated local changes; never use destructive cleanup/reset operations to recover a workspace.

## New-chat start checklist

1. Read `docs/testing/CURRENT-STATE.md`, `RUN-LEDGER.md`, `RECOVERY-GUIDE.md` and this file from the current `main` branch.
2. Confirm remote `main`, recent Actions and any open pull requests before proposing work.
3. Check which GitHub, browser and Supabase tools are already available before asking the user to do anything.
4. Start each change at Step 1. Use Step 9A whenever a read-only review can answer the question.
5. Obtain a fresh explicit approval immediately before every Step 9B run. Confirm cleanup after any such run.

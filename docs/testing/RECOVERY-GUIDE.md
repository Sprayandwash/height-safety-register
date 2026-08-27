# Recovery guide for a new chat or engineer

## Start here

1. Read [CURRENT-STATE.md](CURRENT-STATE.md).
2. Read [RUN-LEDGER.md](RUN-LEDGER.md), then the latest relevant Step 9B history record.
3. Read the [master regression catalogue](../regression-catalogue.md) and [controlled Admin test plan](../admin-controlled-staging-test-plan.md).
4. Check the current state of `main`, the relevant GitHub Actions runs and open pull requests before proposing any work.

## Required operating rules

- Use the named change-flow steps in every recommendation, request and completion report.
- Treat production as prohibited unless the user gives explicit approval for the exact production action.
- Never treat a previous Step 9B approval as permission for another run. Obtain fresh, immediate approval every time.
- A Step 9B failure is not complete until the mandatory cleanup job has been checked.
- Prefer read-only review at Step 9A whenever it can answer the question.
- Do not expose or commit credentials, secrets, tokens, raw mailbox addresses or test passwords.

## Current controlled test

Workflow: **Verify staging pre-loaded account claims**  
Source test: `tests/e2e/staging/preloaded-user-claim-review.spec.cjs`

It is staging-only and refuses the known production project reference. It uses dedicated monitored mailboxes, creates temporary records marked for the run, verifies the Admin role-edit journey, and has an `always()` cleanup path.

## Safe resumption template

Before a new Step 9B run, state:

> Step 9B will create two temporary staging identities, exercise the Admin role-edit journey, and remove the temporary records whether the assertions pass or fail. Production is excluded. Fresh approval is required for this one run.

After the run, record: GitHub run ID, tested commit, result, exact failure cause if any, and cleanup result. Update `CURRENT-STATE.md`, `RUN-LEDGER.md` and add a detailed Step 9B record.


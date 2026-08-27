# Step 9B history automation

## What it does

After every execution of **Verify staging pre-loaded account claims**, GitHub Actions writes one small, secret-free Markdown record to the `testing-history` branch.

It records the run ID, tested commit, GitHub run URL, overall outcome, controlled-test-step outcome and mandatory-cleanup outcome. It does not write to `main` and it does not retain credentials, passwords, tokens, raw mailbox addresses or log contents.

## Where records go

On branch `testing-history`:

`docs/testing/history/step-9b/YYYY-MM-DD-run-<run-id>-attempt-<attempt>.md`

Each execution creates a new file. Existing records are never overwritten. The normal repository contents on `main` are not changed by the archive job.

## Controls and safety

- The original workflow still requires the exact Step 9B confirmation input and fresh user approval before it can create temporary Staging identities.
- The archive job starts only after the controlled job has ended, including its `always()` cleanup step.
- Workflow runs are serialized so two controlled tests cannot overlap or race to write history.
- The archive job has write permission only for repository contents so it can commit the record; it has no Supabase credentials or Staging environment access.

## First-run verification

The first approved Step 9B run after this automation is merged must be checked for two results: the controlled test/cleanup outcome and a successful **Archive controlled-run result** job. If the archive job cannot push, review the repository Actions setting that controls whether the `GITHUB_TOKEN` has read-and-write workflow permissions.


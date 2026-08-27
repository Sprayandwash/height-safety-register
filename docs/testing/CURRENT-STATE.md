# Testing and debugging current state

**Checkpoint date:** 27 August 2026 (NZST)  
**Application:** Spray & Wash Operations  
**Repository:** `Sprayandwash/height-safety-register`

## Purpose of this file

This is the quickest safe starting point for a new chat or engineer. It is a summary, not a source of credentials or a replacement for the permanent regression catalogue.

## Current programme position

Height Equipment, Vehicle Checks, Maintenance and Admin regression testing have been completed through their agreed test journeys.

The Admin read-only desktop and phone-size journey passed in GitHub Actions run `33060709477` on 27 August 2026. It opened Admin, Current Users, the pre-load form, Settings and Backup without submitting, saving, downloading or writing any data.

The controlled Admin claim-and-role test passed in GitHub Actions run `33105862362` on 27 August 2026. It verified the temporary pre-load claim, an Admin removal of the temporary user's Vehicle inspector role, the persisted post-sign-in role result, and a separate self-sign-up with no roles. Its mandatory cleanup passed.

## Completed Admin test outcome

The test-only 120-second allowance merged in PR #48 (`11fcf512638f812353e63eef2b7e5a0d19b53488`) accommodated the genuine confirmation-email response time. The new automatic archive job also passed and created a permanent, secret-free result record on the `testing-history` branch.

The earlier email-rate failures remain recorded in the run ledger as test-environment evidence. They do not invalidate the final passing controlled run.

## Next safe action for future regression work

For a future Admin regression run, dispatch **Verify staging pre-loaded account claims** from `main` only after fresh immediate **Step 9B** approval. Verify the controlled-test result, mandatory cleanup and automatic archive job.

## Non-negotiable safety boundaries

- Production Supabase project `twkgfmctuffmkvkmdkct` must not be accessed, queried, changed, or used for tests without explicit user approval.
- The isolated Staging project is `tsnmbvezrweciaitkquf`.
- Step 9B creates temporary Staging identities and changes a temporary user's role. Each run needs its own fresh approval, even if earlier steps were approved.
- Do not put passwords, access tokens, secrets or raw temporary mailbox addresses in repository documentation.
- Do not change `config.js` unless the user specifically requests it.

## Change-flow vocabulary

1. Define change
2. Branch
3. Local checks
4. Draft PR
5. GitHub checks
6. Approval/merge gate
7. Staging build
8. Browser review
9A. Read-only staging test
9B. Controlled staging write test
10A. Release-live gate
10B. Database-migration gate
11. Closeout / documentation checkpoint

## Related documents

- [Master regression catalogue](../regression-catalogue.md)
- [Controlled Admin test plan](../admin-controlled-staging-test-plan.md)
- [Run ledger](RUN-LEDGER.md)
- [Recovery guide](RECOVERY-GUIDE.md)
- [Step 9B history automation](STEP-9B-HISTORY-AUTOMATION.md)

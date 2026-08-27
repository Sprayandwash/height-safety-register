# Testing and debugging current state

**Checkpoint date:** 27 August 2026 (NZST)  
**Application:** Spray & Wash Operations  
**Repository:** `Sprayandwash/height-safety-register`

## Purpose of this file

This is the quickest safe starting point for a new chat or engineer. It is a summary, not a source of credentials or a replacement for the permanent regression catalogue.

## Current programme position

Height Equipment, Vehicle Checks and Maintenance regression testing have been completed through their agreed test journeys. The current focus is the Admin module.

The Admin read-only desktop and phone-size journey passed in GitHub Actions run `33060709477` on 27 August 2026. It opened Admin, Current Users, the pre-load form, Settings and Backup without submitting, saving, downloading or writing any data.

The controlled Admin claim-and-role test is implemented and has a test-only timing correction merged in PR #48 (`11fcf512638f812353e63eef2b7e5a0d19b53488`). It has not yet completed a full successful end-to-end run.

## Current blocker

The latest controlled run, `33061479194`, stopped at its first temporary signup because Supabase returned `email rate limit exceeded`. Its cleanup job passed. This confirms that the currently configured email provider rate limit applies to the dedicated real test mailboxes as well.

Do not retry automatically. A future controlled run requires fresh, immediate **Step 9B** approval. Review `RUN-LEDGER.md` and the most recent record under `history/step-9b/` first.

## Next safe action

After the email-provider window has reset and the user gives fresh immediate approval, run the existing workflow **Verify staging pre-loaded account claims** exactly once. It must be dispatched from `main` using its required confirmation value. Monitor the run to completion and confirm its cleanup result.

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


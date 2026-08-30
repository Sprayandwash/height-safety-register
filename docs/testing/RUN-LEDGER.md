# Admin testing run ledger

This is a compact, append-only index of meaningful Admin test runs and fixes. It contains no credentials or raw temporary mailbox addresses.

| Date (UTC) | Run / change | Step | Outcome | Evidence / follow-up |
| --- | --- | --- | --- | --- |
| 27 Aug 2026 | PR #46, merge `533f81f` | 1–6 | Merged | Improved the controlled Admin journey after Current Users did not expose the edit control. |
| 27 Aug 2026 | Staging build `33047485334` | 7 | Passed | Built the PR #46 revision for isolated Staging. |
| 27 Aug 2026 | Controlled run `33047669143` | 9B | Failed; cleanup passed | The edit control was still not visible. |
| 27 Aug 2026 | PR #47, merge `5b2b3a3` | 1–6 | Merged | Waited for the temporary Current Users row, opened the exact section and asserted the edit control was visible. |
| 27 Aug 2026 | Staging build `33048181196` | 7 | Passed | Built the PR #47 revision for isolated Staging. |
| 27 Aug 2026 | Controlled run `33049488615` | 9B | Failed; cleanup passed | Supabase returned `email rate limit exceeded` before the Admin role-edit assertion. |
| 27 Aug 2026 | Controlled run `33059755479` | 9B | Failed; cleanup passed | Both signup requests were accepted, but the second confirmation response arrived too close to Playwright's former 30-second overall test limit. |
| 27 Aug 2026 | PR #48, merge `11fcf512` | 1–6 | Merged | Extended only the controlled claim test to 120 seconds. No application, database, role or email configuration changed. |
| 27 Aug 2026 | Staging build `33060604851` | 7 | Passed | Built the PR #48 revision for isolated Staging. |
| 27 Aug 2026 | Admin read-only review `33060709477` | 8–9A | Passed | Desktop and phone-size Admin browser review completed without writes. |
| 27 Aug 2026 | Controlled run `33061479194` | 9B | Failed; cleanup passed | First temporary signup showed `email rate limit exceeded`; the 120-second timing correction was not reached. See [detailed record](history/step-9b/2026-08-27-run-33061479194.md). |
| 27 Aug 2026 | Controlled run `33105862362` | 9B | Passed; cleanup and automatic archive passed | Temporary claim, Admin role edit, persisted re-sign-in role and self-sign-up-with-no-roles checks passed. [Automated history record](https://github.com/Sprayandwash/height-safety-register/blob/testing-history/docs/testing/history/step-9b/2026-08-27-run-33105862362-attempt-1.md). |
| 28 Aug 2026 | Controlled run `33214850826` | 9B | Failed; cleanup passed | A newly unblocked Vehicle Inspector remained on the previous Admin screen. Confirmed application defect. |
| 28 Aug 2026 | PRs #74–#75 | 1–6 | Merged | Reset a different signed-in user to Home while preserving the compulsory first-password screen for an invited user. |
| 28 Aug 2026 | Controlled runs `33215978901`, `33220601154`, `33222649650`, `33224012685` | 9B | Failed; cleanup passed | Each run exposed a test synchronization race around route and Current Users panel rendering; no residual temporary account remained. |
| 29 Aug 2026 | PRs #76–#78 | 1–6 | Merged | Hardened only the controlled browser test to wait for Home routing, loaded Current Users controls and panel visibility. |
| 29 Aug 2026 | Staging build `33224259443`; preflight `33224275701`; Admin read-only review `33224338327` | 7–9A | Passed | Final isolated Staging build and read-only browser review passed. |
| 29 Aug 2026 | Controlled run `33225362362` | 9B | Passed; cleanup passed | Full private-account lifecycle passed: invite, first password, block, unblock, Home, Vehicle Checks and deletion. |
| 29 Aug 2026 | Production release `33231501728` | 10A | Passed | Tested application files published through the protected GitHub Pages production gate; no database migration was required. |

| 29 Aug 2026 | Complete mobile UI audit plan and audit harness | 1–9A | Completed | Formal inventory, two-viewport audit controls and evidence requirements added. |
| 30 Aug 2026 | Mobile UI fixes | 1–10A | Released | Mobile header/layout, attention-list navigation and PWA icon/cache issues addressed. |
| 30 Aug 2026 | Vehicle Checks mobile attention-list and icon-centering release | 1–10A | Passed | Regression/browser smoke, staging build/preflight and production release `33300910215` passed. Desktop Vehicle Checks table unchanged. |
| 30 Aug 2026 | Final shortcut-swirl alignment | 1–10A | Passed | Commit `4e7c652c1dee66193f0cd3f8129cef09bea4ea4f`; staging build `33306913523`, preflight `33306926329` and production release `33306935360` all passed. |

## Recording rule

Add one short row for each meaningful controlled run, staging build, read-only review, PR merge, or confirmed new defect. Add a detailed file under `history/step-9b/` only for Step 9B runs.

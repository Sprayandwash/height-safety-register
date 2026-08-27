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

## Recording rule

Add one short row for each meaningful controlled run, staging build, read-only review, PR merge, or confirmed new defect. Add a detailed file under `history/step-9b/` only for Step 9B runs.


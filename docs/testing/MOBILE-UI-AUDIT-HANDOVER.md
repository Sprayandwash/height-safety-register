# Spray & Wash Operations App — Current new-chat handover

Use the current repository records as the source of truth before taking any action.

## Current project location

- Repository: `https://github.com/Sprayandwash/spray-and-wash-operations-app`
- Production app: `https://sprayandwash.github.io/spray-and-wash-operations-app/`
- Current source branch: `main`
- Latest verified production deployment: Actions run `33306935360`, successful, from commit `4e7c652c1dee66193f0cd3f8129cef09bea4ea4f` on 30 August 2026.

## Start here

Read these current files from `main`:

1. `docs/testing/CURRENT-STATE.md`
2. `docs/testing/RUN-LEDGER.md`
3. `docs/testing/RECOVERY-GUIDE.md`
4. `docs/testing/ACCESS-AND-RECOVERY-HANDOVER.md`
5. `docs/testing/MOBILE-UI-AUDIT-PLAN.md` when mobile work is involved.

The completed mobile-audit programme now includes two targeted production fixes: centred PWA icon artwork and a compact, non-side-scrolling Vehicle Checks attention list on phone widths. The desktop/web Vehicle Checks table remains unchanged.

## Safety and approvals

- Production Supabase (`twkgfmctuffmkvkmdkct`) is prohibited unless the user approves the exact operation.
- Staging Supabase is `tsnmbvezrweciaitkquf`.
- Never expose secrets, test credentials, database URLs, tokens or passwords.
- Start every new change at Step 1. A Step 9B run needs fresh explicit approval immediately before it starts; verify its cleanup afterward.
- Production deployment is the protected manual GitHub Actions release. A merge alone is not a deployment.

## Access recovery

Before asking the user to reconnect anything, inspect and use the existing GitHub connector, repository workspace, authenticated GitHub CLI (if supplied), browser-control session and Supabase tools. For the ordered recovery process and release instructions, read `docs/testing/ACCESS-AND-RECOVERY-HANDOVER.md`.


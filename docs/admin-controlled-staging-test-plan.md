# Controlled Staging Admin test plan

This is the design boundary for future **write-capable** Admin regression tests. It is not an executable workflow and must not create, edit, delete, or grant permissions by itself.

## Purpose

Exercise the Admin operations that a read-only browser review cannot prove, while preserving normal Staging users, normal Admin access, and all production data.

## Required safety rules

1. It runs only against the isolated Staging Supabase project. The workflow must refuse the production project reference `twkgfmctuffmkvkmdkct` before any database or browser write.
2. It uses separately named, real monitored test mailboxes. It must never manufacture email addresses that could bounce.
3. Every temporary record receives a unique `E2E ADMIN` marker and is removed in an `always()` cleanup step.
4. It must never edit, delete, demote, or depend on a normal staff account, including the designated read-only Admin review account.
5. It must never download a real backup, upload a logo, or save App Settings.
6. It requires a separate Stage 9B approval immediately before each run.

## Proposed controlled checks

| Check | Expected result | Temporary data | Cleanup |
| --- | --- | --- | --- |
| Unclaimed preload lifecycle | Admin can create, edit, then delete an unclaimed pre-load. | One tagged pre-load row. | Delete tagged row. |
| Claimed-preload boundary | A claimed pre-load is an audit record; live roles are managed only through Current Users. | One tagged, controlled identity and pre-load. | Delete tagged role/profile/auth/pre-load rows under a guarded maintenance procedure. |
| Other-user role edit | A separate temporary Admin can change a separate temporary user's permitted roles and the edit persists after sign-in. | Two tagged controlled identities. | Remove roles, profiles, auth users and pre-load rows. |
| Final-Admin protection | Attempting to remove the final Admin role is rejected without persisting a change. | A rollback-only database fixture or isolated disposable role matrix. | Database transaction must roll back; no normal Admin is touched. |

## Prerequisites before implementation

- Confirm the Staging database-level rule that protects the final active Admin and its exact error/return behaviour.
- Provide any additional dedicated, monitored test mailboxes needed for temporary Admin identities.
- Review the cleanup SQL with the actual Staging schema.
- Obtain explicit approval to build the executable controlled workflow, then a separate Stage 9B approval to run it.

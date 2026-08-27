# Regression catalogue index and current testing state

The permanent, complete catalogue is [../regression-catalogue.md](../regression-catalogue.md). This file exists to preserve current testing context without copying the catalogue and creating competing versions.

## Current module state

| Module | Current position | Evidence |
| --- | --- | --- |
| Height Equipment | Agreed regression testing completed for this programme phase. | Existing browser/read-only and controlled test evidence is retained in the master catalogue and workflows. |
| Vehicle Checks | Agreed regression testing completed for this programme phase. | Existing browser/read-only and controlled test evidence is retained in the master catalogue and workflows. |
| Maintenance | Agreed regression testing completed for this programme phase. | Existing browser/read-only and controlled test evidence is retained in the master catalogue and workflows. |
| Admin | Read-only desktop/mobile review passed; controlled claim-and-role test awaits a successful run. | Run `33060709477` passed. Latest controlled attempt `33061479194` was blocked by the email rate limit and cleaned up. |

## Naming note

The executable controlled Admin workflow and test use the historic label `REG-049` in their filenames, marker and test title. The master catalogue's numerical labels arose from earlier work and are not guaranteed to map one-to-one with that legacy workflow label. When reporting or resuming this work, identify the test by its full name—**Verify staging pre-loaded account claims**—as well as its GitHub run ID, rather than relying on the label alone.

## Admin coverage currently in place

- **Read-only:** Desktop and phone-size Admin journey; Current Users, pre-load form, Settings and Backup open without writes.
- **Controlled:** A real temporary pre-load is claimed; its initial roles are verified; the Admin UI removes the temporary user's Vehicle inspector role; the account signs in again and verifies the changed role; a separate self-sign-up verifies it receives no roles.
- **Cleanup:** The workflow removes its tagged pre-load data, roles and temporary identities regardless of test result.

The controlled coverage is useful only after a complete passing run. See [RUN-LEDGER.md](RUN-LEDGER.md) for the current state.


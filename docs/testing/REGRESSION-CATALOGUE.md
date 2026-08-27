# Regression catalogue index and current testing state

The permanent, complete catalogue is [../regression-catalogue.md](../regression-catalogue.md). This file exists to preserve current testing context without copying the catalogue and creating competing versions.

## Current module state

| Module | Current position | Evidence |
| --- | --- | --- |
| Height Equipment | Agreed regression testing completed for this programme phase. | Existing browser/read-only and controlled test evidence is retained in the master catalogue and workflows. |
| Vehicle Checks | Agreed regression testing completed for this programme phase. | Existing browser/read-only and controlled test evidence is retained in the master catalogue and workflows. |
| Maintenance | Agreed regression testing completed for this programme phase. | Existing browser/read-only and controlled test evidence is retained in the master catalogue and workflows. |
| Admin | Agreed Admin regression testing completed. | Read-only run `33060709477` passed; controlled claim-and-role run `33105862362` passed with cleanup and automatic history archive. |

## Naming note

The executable controlled Admin workflow and test use the historic label `REG-049` in their filenames, marker and test title. The master catalogue's numerical labels arose from earlier work and are not guaranteed to map one-to-one with that legacy workflow label. When reporting or resuming this work, identify the test by its full name—**Verify staging pre-loaded account claims**—as well as its GitHub run ID, rather than relying on the label alone.

## Admin coverage currently in place

- **Read-only:** Desktop and phone-size Admin journey; Current Users, pre-load form, Settings and Backup open without writes.
- **Controlled:** A real temporary pre-load is claimed; its initial roles are verified; the Admin UI removes the temporary user's Vehicle inspector role; the account signs in again and verifies the changed role; a separate self-sign-up verifies it receives no roles.
- **Cleanup:** The workflow removes its tagged pre-load data, roles and temporary identities regardless of test result.

The controlled coverage completed successfully in run `33105862362`. See [RUN-LEDGER.md](RUN-LEDGER.md) for the full sequence, including earlier failed attempts and their cleanup results.

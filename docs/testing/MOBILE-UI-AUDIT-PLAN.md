# Mobile UI audit plan

**Status:** Redesigned audit contract. A run is not complete unless every
inventory item below has been captured at both target viewports.

## Purpose and safety boundary

This plan defines a complete, read-only mobile UI audit for the Spray & Wash
Operations Staging build. It does not authorise application changes, form
submissions, test-data creation, uploads, downloads, emails, account changes,
or direct Supabase access. Production Supabase is out of scope.

Each inventory item must be recorded as **tested** or **not applicable** with
an approved reason. An unavailable page, role, account or fixture is an
**audit-readiness failure**, not a successful partial-audit result. A parent
screen loading is not evidence that its child states were audited.

## Mandatory audit-readiness gate

Before any authenticated browser audit starts, the workflow must confirm all
of the following. If any requirement is absent, it must stop before collecting
partial evidence and produce a clear list of what is missing.

| Requirement | Purpose | Required proof before dispatch |
| --- | --- | --- |
| Primary manager account | Height, Vehicle and Maintenance manager screens | `E2E_STAGING_TEST_EMAIL/PASSWORD` secrets and successful role landing |
| Admin account | All Admin screens | `E2E_STAGING_ADMIN_EMAIL/PASSWORD` secrets and successful Admin landing |
| Height read-only account | Permission-limited Height view and hidden write actions | `E2E_STAGING_HEIGHT_READONLY_EMAIL/PASSWORD` secrets and a successful read-only landing |
| First-password account | AUTH-02 without changing an account | `E2E_STAGING_FIRST_PASSWORD_EMAIL/PASSWORD` secrets and the existing first-password screen |
| Blocked account | AUTH-03 without blocking an account | `E2E_STAGING_BLOCKED_EMAIL/PASSWORD` secrets and the existing blocked-account screen |
| Safe Staging fixture | Attention destinations, vehicle alert/history states, empty states and existing records | A named, non-production fixture checklist confirming every data-dependent inventory item is present |
| Real-device/PWA evidence | PWA install/offline/update/camera behaviour | A separately controlled device session; browser emulation cannot pass this item |

The dispatcher must explicitly confirm readiness. The harness then signs in to
the specialised accounts and verifies their expected state before it begins
the page audit. No account is created, changed, blocked, unblocked, reset or
saved by the audit.

## Viewports and screenshot rules

| ID | Emulation | Viewport | Reason |
| --- | --- | --- | --- |
| `pixel-7` | Existing Playwright Pixel 7 project | Project default | Established Android coverage |
| `iphone-narrow` | Narrow iPhone-size Playwright project | 375 × 667 CSS px | Finds tighter wrapping, clipping and tap-target problems |

At normal zoom, capture both a settled viewport screenshot and a full-page
screenshot for every inventory item at both widths. Capture an additional
focused screenshot for each confirmed issue. Every screenshot name must follow:

`<sequence>-<viewport>-<area>-<state>.png`

The manifest must map each file to its inventory ID, route/module, signed-in
role, viewport, result, intentional-scroll exception (if any), and issue ID
(if any). Test output and the final report must contain no credentials,
tokens, email addresses, or secret values.

## Pass criteria

For each item, verify that text is legible and contained, controls are
unobscured and tappable, dialogs/panels remain usable, and the document has no
page-level horizontal overflow. The harness must fail on: visible semantic
elements outside the viewport; text/control clipping inside a non-scrollable
container; and unintended overlap between controls and headings/account text.
A wide table/list may scroll horizontally only inside a visibly bounded
wrapper; record that wrapper in the manifest. Automated geometry checks do not
replace final screenshot review: the final report must identify the reviewer
and link every issue screenshot.

## Formal page and state inventory

The audit must first reconcile this inventory with the currently authorised
Staging roles and the existing data. `Open only` means a form or control may
be displayed but never submitted or used to cause a write.

| ID | Area | Page or state to inspect | Safe review action / expected gap rule |
| --- | --- | --- | --- |
| AUTH-01 | Authentication | Signed-out sign-in form, validation layout and staging banner | Open only; do not submit invalid credentials or request a reset. |
| AUTH-02 | Authentication | First-personal-password screen | Inspect only if already available without changing an account; otherwise unavailable. |
| AUTH-03 | Authentication | Blocked-account screen | Inspect only if an existing authorised blocked fixture exists; never block an account. |
| HOME-01 | Home | Role landing cards, header/logo, account controls and normal Home | Inspect for every available authorised role. |
| HOME-02 | Home | Attention list closed, each available Critical/Due soon/Open tasks filter, clear filter and return-home reset | Toggle only; no record action or form submission. |
| HOME-03 | Home | Attention item destination screens | Follow only existing item links and return; record absent attention groups as unavailable. |
| HEIGHT-01 | Height Equipment | Dashboard and tab strip | Inspect manager and read-only variants where those roles are available. |
| HEIGHT-02 | Height Equipment | Equipment register: initial list, search, every available filter, clear filters and zero-result state | Filter only; inspect bounded table/list scrolling separately. |
| HEIGHT-03 | Height Equipment | Equipment detail, inspection history, history-limit selector and return-to-register state | Open existing record only; do not start or save an inspection. |
| HEIGHT-04 | Height Equipment | Add Equipment form | Open only; inspect fields, photo control and cancel/return. |
| HEIGHT-05 | Height Equipment | Inspection form and photo/crop modal | Open only if it can be reached without a record-changing action; do not select/upload a file. |
| HEIGHT-06 | Height Equipment | Certificates landing, filters, selection list, validation/empty states and existing certificate history | Do not generate, print, or download certificates. |
| HEIGHT-07 | Height Equipment | Inspector Qualifications list, collapsed/expanded panels, saved qualification detail and add/edit form | Open only; do not upload, replace, open/download a file, or save. |
| VEH-01 | Vehicle Checks | Checklist landing: header, vehicle selector, odometer and all question sections | Do not submit a check. |
| VEH-02 | Vehicle Checks | Alerts/attention entry point, preselected vehicle check and no-alert state | Follow only current data; record unavailable groups. |
| VEH-03 | Vehicle Checks | Check-history/list and available filters or empty state | Browse/filter only. |
| VEH-04 | Vehicle Checks | Required-answer, photo, and issue-input layout | Open only; do not enter values that create or alter a check. |
| MAINT-01 | Maintenance | Dashboard: summary cards, shortcuts, attention lists and Record Maintenance entry control | Navigate/open only. |
| MAINT-02 | Maintenance | Assets list, vehicle/machinery expansion, standalone machinery and filters/empty state | Browse/filter only. |
| MAINT-03 | Maintenance | Add/Edit Asset, vehicle, machinery and transfer forms | Open only, then cancel. |
| MAINT-04 | Maintenance | Maintenance Items list, all three filters, clear filters and zero-result state | Filter only. |
| MAINT-05 | Maintenance | Add/Edit Maintenance Item and standard-item edit forms | Open only, then return. |
| MAINT-06 | Maintenance | Tasks list, quick filters, task detail and read-only task variant | Do not add, update, complete or save a task. |
| MAINT-07 | Maintenance | Add Manual Task form | Open only, then cancel. |
| MAINT-08 | Maintenance | Maintenance Log list, all filters, clear filters and empty state | Filter only; do not print or download/export. |
| MAINT-09 | Maintenance | Record Maintenance form: vehicle/target selectors, routine and other-maintenance layouts | Open only; do not select a combination that alters data or submit. |
| ADMIN-01 | Admin | Admin landing, persistent navigation and single Home control | Existing Admin account only; no writes. |
| ADMIN-02 | Admin | Users & Permissions: Current Users collapsed/expanded, user detail/edit control, and no-results state | Inspect only; never save/block/unblock/delete/reset. |
| ADMIN-03 | Admin | Single Create staff account route, permissions controls and absence of the legacy Add User route | Open only; do not submit. |
| ADMIN-04 | Admin | Settings and logo preview/upload controls | Inspect only; do not save or select/upload a file. |
| ADMIN-05 | Admin | Backup page and download/create controls | Inspect only; do not create or download a backup. |
| PERM-01 | Permission states | Height read-only, role-limited action visibility, and no-Admin landing | Use existing authorised role accounts only. |
| SHELL-01 | Global shell | Sticky headers, tabs, mobile navigation, account popover, page scroll and document overflow | Recheck after every module navigation. |
| SHELL-02 | Global shell | Loading, empty and error/blocked messages | Capture when naturally present; otherwise mark unavailable with the required trigger. |
| PWA-01 | PWA shell | Manifest/app shell visual behaviour available in emulation | Installation, offline/update and device camera behaviour require a separate real-device or controlled test; do not claim them tested here. |

## Planned audit harness

1. Extend the existing authenticated Staging Playwright approach with a new,
   explicitly read-only mobile-audit suite. It will use the existing Staging
   build artifact and secrets in GitHub Actions, which already reject a build
   that identifies Production.
2. Add the `iphone-narrow` project alongside the established Pixel 7 project.
3. Run the mandatory readiness gate before browser review. It must verify every
   required secret, account state and role; it must not begin the page audit if
   any required state is missing.
4. Build a route/state runner that captures viewport and full-page screenshots
   after each settled, non-writing state. It must check document overflow,
   viewport clipping, text/control clipping and unintended overlap. It will
   record contained table/list scrolling as an exception, not a defect.
5. Make the workflow upload the screenshot directory, manifest, Playwright
   report, traces and focused issue evidence as a GitHub Actions artifact.
6. Do not attempt inventory entries that require a new fixture, a submission,
   a database change, an email, an upload or a download. Stop at readiness and
   request the necessary authorised fixture/account instead of issuing a
   partial-audit pass.

## Approval sequence after this plan

The next action, if approved, is **Step 3 — Local checks**. It may validate
only the audit-plan syntax/structure and existing test wiring; it will not run
an authenticated Staging browser test. The Staging browser audit itself
remains **Step 9A** and requires its own later approval.

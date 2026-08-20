# Spray & Wash regression catalogue

This is the single source of truth for confirmed bugs found during Spray & Wash development and staging testing. It consolidates the five historical-chat extracts and the current Operations regression suite.

IDs are permanent. A fixed bug remains here so that it cannot silently return. `Automated` means a deterministic CI test is practical; it does **not** mean every listed test has already been implemented.

## Current automated suite

The first eight Operations regressions are implemented in `tests/regression/operations-rules.test.cjs` and run in the **Regression tests** GitHub Actions workflow.

| ID | Confirmed regression | Expected behaviour | Coverage target | Current state |
| --- | --- | --- | --- | --- |
| REG-001 | A passed periodic vehicle check could create maintenance tasks. | A check containing only `Completed OK` / `N/A` creates no follow-up task. | Unit + staging integration | Automated |
| REG-002 | A vehicle check could create too many tasks. | Create one task for each reported issue and none for passed lines. | Unit + staging integration | Automated |
| REG-003 | Vehicle checks became Due soon for the entire 14-day interval. | Show Due soon only in the final seven days; overdue stays critical. | Unit + browser | Automated |
| REG-004 | Maintenance schedules were assigned to incompatible sub-assets. | A procedure category must match the machinery type. | Unit + database guard | Automated; migration verification pending |
| REG-005 | Historical invalid schedules inflated Home attention counts. | Invalid or misassigned schedules do not appear in Home attention. | Unit + staging data check | Automated; staging data check pending |
| REG-006 | Historic/test tasks polluted Open Tasks. | Completed and Deferred tasks are excluded from open-task counts and lists. | Unit | Automated |
| REG-007 | Vehicle-check alerts did not open a usable preselected form. | Selecting an alert opens Vehicle Checks with the correct vehicle selected. | Staging browser check | Manual staging check passed |
| REG-008 | Staging and production could be confused. | Staging has a persistent test-data banner and staging Supabase configuration. | Build workflow + browser | Automated; banner check passed |

## Consolidated backlog

### Application, identity, and navigation

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-009 | A syntax error in `operations-v4.js` stopped Operations from loading and masqueraded as a routing failure. | All active JavaScript parses; authenticated users can reach Home and return through the logo. | `node --check` for all runtime files + browser smoke test | Automated syntax; browser pending |
| REG-010 | Vehicle inspection identity could fall back to an email-derived name instead of the profile name. | Form and saved inspection use `profiles.display_name` when present. | Staging browser/database integration | Pending |
| REG-011 | Vehicle Checks and Operations/Maintenance could show duplicated content. | Vehicle Checks contains the periodic checklist; Maintenance contains assets/tasks/maintenance management. | Role-aware browser test | Pending |
| REG-012 | The Account popover did not close when clicking outside it. | Outside pointer interaction dismisses the menu without blocking the page. | Browser test | Pending |
| REG-013 | A visible app version could remain at an old release number. | Header/build metadata comes from the current release source of truth. | Static release test | Pending |

### Vehicle Checks

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-014 | Same-day inspections could display in non-deterministic order. | Order by inspection date, then creation time, then stable ID—newest first. | Database/browser integration | Pending |
| REG-015 | Vehicle-check dropdowns offered `No response` as a selectable answer. | Required fields start blank; blank is invalid; `No response` is never a selectable response. | Checklist schema/browser test | Pending |

### Maintenance, schedules, tasks, and reports

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-016 | Valid maintenance types were rejected by the maintenance-log database constraint. | Every approved UI/RPC type persists successfully. | Staging database matrix | Pending |
| REG-017 | Compatibility mapping changed valid maintenance types into generic/legacy values. | Stored `maintenance_done` exactly matches the selected legitimate type. | Staging database integration | Pending |
| REG-018 | Generated follow-up task descriptions contained a verbose/duplicated maintenance prefix. | Task description is exactly the entered follow-up requirement. | Staging RPC integration | Pending |
| REG-019 | A maintenance save depended on a browser-side task update that normal permissions rejected. | The security-definer RPC creates the final correct task without a client PATCH/UPDATE. | Staging permission integration | Pending |
| REG-020 | A custom on-demand maintenance item could not be saved without a positive frequency. | Blank frequency means on-demand, with no date-driven alert or task. | Browser/database integration | Pending |
| REG-021 | Task status could save while steps/parts failed, and retrying could duplicate detail rows. | Task, steps, and parts save atomically and retries are idempotent. | Transaction/database test | Pending |
| REG-022 | A passing Height inspection could close unrelated or newer Height tasks. | Close only the qualifying earlier failure task; never manual or newer failures. | SQL trigger test | Pending |
| REG-023 | Due-soon maintenance attention navigated to overdue results. | Due-soon opens due-soon; overdue opens overdue. | Browser routing test | Pending |
| REG-024 | Height overdue attention could show a blank due date. | Every dated alert displays its formatted due date. | Unit/browser test | Pending |
| REG-025 | Historic maintenance report records were misleadingly labelled after compatibility fixes. | CSV/PDF presentation normalises known legacy forms without changing source data. | CSV integration + PDF spot check | Pending |
| REG-026 | Maintenance print/PDF output contained browser URL/date/page chrome. | Reports have only intended report content, clean margins, and readable pagination. | Print CSS test + manual browser/PDF check | Pending |

### Certificates, qualifications, and Height Equipment

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-027 | Certificate selectors, filters, or matching lists did not populate correctly. | Eligible in-service items appear for each filter combination, including default All types. | Seeded browser test | Pending |
| REG-028 | Individually selected certificate items were ignored. | Generation uses exactly the selected eligible IDs. | Browser/PDF integration | Pending |
| REG-029 | Certificate selection count and Generate state drifted out of sync. | Count equals selected eligible rows; buttons enable/disable correctly. | Browser test | Pending |
| REG-030 | Inspector selection for qualification details did not populate or retain a selection. | Saved inspector names load and selection drives the correct output. | Browser integration | Pending |
| REG-031 | Qualification uploads could be empty, corrupt, or unreadable. | Reject invalid files; verify non-zero readable stored objects before saving records. | Isolated staging Storage test | Pending |
| REG-032 | Qualification evidence was absent from generated Inspector/Qualification Details. | Verified image renders in output; PDF evidence has a valid view/download path. | Generated-document + manual visual test | Pending |
| REG-033 | Qualification panels were duplicated or legacy qualification content flashed first. | One Saved Inspectors and one Add Inspector area, rendered directly in final layout. | DOM mutation/browser test | Pending |
| REG-034 | Saved Inspectors had the wrong initial expanded/collapsed state. | Saved Inspectors and Add Inspector begin collapsed. | Browser test | Pending |
| REG-035 | Recent Inspection History ignored the selected 10/20/30/50 record limit. | The requested number of rows is loaded into a scrollable list. | Seeded browser test | Pending |
| REG-036 | Recent Inspection History changes caused whole-page twitching. | Only the history list updates; no module replacement, scroll jump, or layout shift. | DOM/layout-shift + manual visual test | Pending |
| REG-037 | Equipment had duplicate/missing filter controls, including a missing Inspection Result filter. | One filter panel with every canonical field; Clear Filters works. | Browser test | Pending |
| REG-038 | Equipment filtering transiently showed wrong records or re-rendered the tab. | Only the results list updates and unrelated records never become visible. | Delayed-response browser mutation test | Pending |
| REG-039 | Equipment filtering or item navigation reset page scroll. | Filter and record return preserve relevant scroll position and filter state. | Browser test | Pending |
| REG-040 | Height dashboard could show duplicate or transiently different Start Inspection cards. | One canonical card from first paint through settled state. | DOM mutation/browser test | Pending |
| REG-041 | Certificate item rows were not consistently left aligned. | Rows use the canonical left-aligned list layout. | CSS/browser visual baseline | Pending |
| REG-042 | Certificate photo provenance and pagination were wrong. | Equipment photo remains distinct; only latest inspection photos appear in their intended output section. | Generated-document + manual visual test | Pending |

### Admin, permissions, and security

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-043 | User management was inaccessible or Edit user collapsed the Current Users section. | Admin can reach the canonical UI and edit a user without collapsing the working area. | Admin browser test | Pending |
| REG-044 | User changes could remove the active Admin's role or access. | Editing users does not remove the current Admin's permissions; preserve last-Admin protection. | Disposable Admin integration | Pending |
| REG-045 | Profile name displays could omit a user surname. | User choices show full, canonical first-and-last names. | Browser fixture test | Pending |
| REG-046 | Height and Admin showed conflicting role definitions or duplicate management controls. | One canonical role source and user-management UI, in Admin only. | Role-matrix/browser test | Pending |
| REG-047 | Height read-only access was only hidden in UI, not enforced in database/storage policies. | Read-only roles cannot directly write tables or storage. | Authenticated Supabase role-matrix test | Pending; live policies need baseline |
| REG-048 | Admin could duplicate Home controls or visibly reposition after opening. | One Home control; final Admin layout renders once without delayed movement. | DOM/layout-shift + manual visual test | Pending |

### Shared styling, releases, PWA, and source of truth

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-049 | Logo could load late, wrong, blank, or distorted before authentication. | The packaged logo is correct and proportionate from first paint. | Screenshot/browser test | Pending |
| REG-050 | Shared palette and dashboard/action layouts drifted between modules. | Shared tokens, active states, spacing, and card alignment remain consistent. | CSS token + visual baseline | Pending |
| REG-051 | Browser/PWA icons could remain obsolete after an icon release. | Manifest/favicons reference approved assets; clean installs use them. | Static manifest + manual device test | Pending |
| REG-052 | Service-worker/browser caching could keep an old release active or omit critical assets. | Upgrade uses the new complete asset set; service worker cache includes critical files. | Static manifest + controlled upgrade/offline test | Pending |
| REG-053 | Release assets and version references could be inconsistent or installation instructions could omit changed runtime files. | All active asset/version/cache references agree and release manifest lists every changed runtime file. | CI release-integrity test | Pending |
| REG-054 | GitHub could not reproduce the deployed database schema/migrations. | All applied migrations are version-controlled and clean migration output matches an approved snapshot. | Clean database migration/schema test | Pending; live schema export needed |

### Regression-system safeguards

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-055 | A verifier treated a successful non-200 `2xx` response as failure. | Defined successful `2xx` responses pass; `4xx`/`5xx` fail. | Verifier unit test | Pending |
| REG-056 | A verifier treated optional blank completion notes as failure. | A completed task can have blank notes if completion identity and timestamp exist. | Verifier integration | Pending |

## Manual release checklist

Run these in **staging only** before production review. They are important but require visual, device, or print confirmation beyond deterministic CI assertions.

1. Certificate, Inspector Details, and Maintenance PDF appearance: no browser print chrome, clipping, wrong page placement, or unreadable images.
2. Real-device PWA install/update, icon refresh, offline/reconnect, camera/photo upload, touch targets, and small-screen scrolling.
3. Visual smoothness while changing Height history/equipment filters, opening Admin, and opening Qualifications.
4. Shared palette, responsive layout, dashboard spacing, and pre-login logo quality.
5. Production migration preflight: schema/policy comparison and a reviewed backup/rollback plan. Never point automated tests at production.

## Implementation plan

The catalogue deliberately distinguishes coverage that can be added immediately from coverage that needs an isolated staging fixture/database.

1. **Phase A — expand static/unit coverage:** all JavaScript syntax, release/service-worker integrity, schedule/task/vehicle rules, and verifier helpers.
2. **Phase B — browser regression harness:** Playwright with deterministic fixture data for navigation, filters, selections, counts, blank required inputs, DOM uniqueness, ordering, and scroll preservation.
3. **Phase C — isolated Supabase staging tests:** role matrix, migrations, RPC/task lifecycle, Storage file verification, and generated report data. Use disposable records and test-only prefixes.
4. **Phase D — visual and mobile/PWA:** screenshot baselines, generated-document rendering, and an explicit supported-phone testing matrix.

## Rules for future bugs

1. Record every **confirmed** bug here before its fix is promoted.
2. Keep the concrete expected behaviour and one reproducible test scenario.
3. Add the deterministic automated test in the same PR whenever practical; otherwise add a concise staging/manual check.
4. Update the entry's status when the test is implemented—do not delete fixed bugs.
5. The regression workflow must pass, and required staging/manual checks must be recorded, before a PR is ready for production review.

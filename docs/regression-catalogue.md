# Spray & Wash regression catalogue

This is the single source of truth for confirmed bugs found during Spray & Wash development and staging testing. It consolidates the five historical-chat extracts and the current Operations regression suite.

IDs are permanent. A fixed bug remains here so that it cannot silently return. `Automated` means a deterministic CI test is practical; it does **not** mean every listed test has already been implemented.

## Current automated suite

The first eight Operations regressions are implemented in `tests/regression/operations-rules.test.cjs` and run in the **Regression tests** GitHub Actions workflow.

## Browser smoke suite

The first Playwright browser checks live in `tests/e2e/` and run in the **Browser smoke tests** GitHub Actions job. They use a local static server and do not sign in, write to Supabase, or use production data.

| ID | Check | Status |
| --- | --- | --- |
| REG-UI-001 | A visitor can load the application and see the sign-in form. | Automated in Chromium |
| REG-UI-002 | The PWA manifest and the approved 192px/512px app icons load. | Automated in Chromium |

Run locally after installing the test dependencies and Chromium:

```bash
npm ci
npx playwright install chromium
npm run test:ui
```

On failure, Playwright keeps an HTML report, screenshot, video, and execution trace locally; GitHub Actions uploads these as a 14-day PR artifact.

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
| REG-015 | Vehicle-check dropdowns offered `No response` as a selectable answer. | Required fields start blank; blank is invalid; `No response` is never a selectable response. | Static checklist guard + browser test | Automated static guard; browser pending |

### Maintenance, schedules, tasks, and reports

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-016 | Valid maintenance types were rejected by the maintenance-log database constraint. | Every approved UI/RPC type persists successfully. | Staging database matrix | Automated for `Other maintenance`; broader matrix pending |
| REG-017 | Compatibility mapping changed valid maintenance types into generic/legacy values. | Stored `maintenance_done` exactly matches the selected legitimate type. | Staging database integration | Automated for `Other maintenance`; broader matrix pending |
| REG-018 | Generated follow-up task descriptions contained a verbose/duplicated maintenance prefix. | Task description is exactly the entered follow-up requirement. | Staging RPC integration | Automated; first staging review run pending |
| REG-019 | A maintenance save depended on a browser-side task update that normal permissions rejected. | The security-definer RPC creates the final correct task without a client PATCH/UPDATE. | Staging permission integration | Automated; first staging review run pending |
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
| REG-051 | Browser/PWA icons could remain obsolete after an icon release. | Manifest/favicons reference approved assets; clean installs use them. | Static manifest + manual device test | Automated static guard; device test pending |
| REG-052 | Service-worker/browser caching could keep an old release active or omit critical assets. | Upgrade uses the new complete asset set; service worker cache includes critical files. | Static service-worker guard + controlled upgrade/offline test | Automated static guard; upgrade test pending |
| REG-053 | Release assets and version references could be inconsistent or installation instructions could omit changed runtime files. | All active asset/version/cache references agree and release manifest lists every changed runtime file. | CI release-integrity test | Automated entry-script guard; full release metadata check pending |
| REG-054 | GitHub could not reproduce the deployed database schema/migrations. | All applied migrations are version-controlled and clean migration output matches an approved snapshot. | Clean database migration/schema test | Pending; live schema export needed |

### Regression-system safeguards

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-055 | A verifier treated a successful non-200 `2xx` response as failure. | Defined successful `2xx` responses pass; `4xx`/`5xx` fail. | Verifier unit test | Automated |
| REG-056 | A verifier treated optional blank completion notes as failure. | A completed task can have blank notes if completion identity and timestamp exist. | Verifier helper + integration | Automated helper; integration pending |

## Module coverage map

This map covers the normal operational journeys in every app module. It complements the bug-by-bug catalogue above: a journey can pass its individual regression tests yet still fail when its screens, permissions, and saved data are used together.

`CI` tests are safe deterministic checks with no Supabase writes. `Staging` tests use labelled, disposable records in the isolated staging project. `Review` tests leave labelled staging records temporarily so that the Operations manager can refresh an already-open, signed-in staging browser tab and inspect the outcome. `Device` tests require a real supported phone/tablet or print dialog.

| Module | Priority journey | Expected result | Coverage type | Initial status |
| --- | --- | --- | --- | --- |
| Global / Home | Sign in, role landing, Home navigation, dashboard attention counts | User reaches only permitted modules; Home counts match the underlying visible records | CI + Staging browser | CI sign-in shell only; integration pending |
| Global / Home | Staging identity and cache/update behaviour | Persistent staging banner; no production configuration; new release assets install correctly | CI + Device | Banner/static checks automated; device update pending |
| Height Equipment | Find an asset, open it, record an inspection, return to preserved filters/history | Correct record is saved; list, scroll position and filters remain stable | Staging browser + Review | Pending |
| Height Equipment | Certificates and Inspector Details | Eligible selections, counts and generated documents match selected records and evidence | Staging browser + Review + Device/PDF | Pending |
| Height Equipment | Qualification upload/replacement | Valid evidence is readable and retained; bad files are rejected | Isolated staging Storage + Review | Pending |
| Vehicle Checks | See due/overdue attention and start the correct vehicle check | Alert opens one usable preselected check; completion advances its next due date | Staging browser + Review | Alert routing manually passed; lifecycle pending |
| Vehicle Checks | Complete a check with all pass/N/A answers | Check saves, produces no maintenance tasks, and updates due/overdue attention | Staging browser + Review | Rule automated; end-to-end pending |
| Vehicle Checks | Report one or more issues | Exactly one follow-up task is created per issue; passes create none | Staging browser + Review | Rule automated; end-to-end pending |
| Maintenance | Add/edit vehicle and compatible machinery/sub-assets | Only compatible maintenance procedures can be assigned; active schedules appear in the appropriate attention list | Staging browser | Pending |
| Maintenance | Record vehicle-only `Other maintenance` with parts and a follow-up | One valid maintenance log item; required task is created by the approved RPC with exact text; no schedules or sub-assets are seeded | Controlled staging browser review | Automated; first staging review run pending |
| Maintenance | Open, update and complete tasks | Status, steps, parts, responsible role and completion evidence save atomically without duplicates | Staging browser | Pending |
| Maintenance | Filter/export maintenance history | Filters match exported CSV/PDF; print/PDF is readable and has no browser chrome | CI + Staging browser + Device/PDF | Pending |
| Admin | Create/edit users and roles | Canonical roles display once; edits retain the working page and never remove the final active Admin | Disposable staging role matrix + Review | Pending |
| Admin | Enforce permissions | Hidden controls and direct Supabase writes both respect role restrictions | Authenticated staging role matrix | Pending |
| Mobile / PWA | Critical Home, Height, Vehicle Checks, Maintenance and Admin journeys at phone widths | Controls remain usable; no clipping, scroll traps, unusable dialogs or accidental desktop-only behaviour | Playwright mobile project + Device | Pending |

### Delivery order

1. Build shared authenticated staging fixtures and cleanup helpers once, with a dedicated staging-only test account and the `E2E REVIEW —` prefix.
2. Add the critical Vehicle Checks review journey first: one pass, one reported issue, exact task verification, and user-visible staging review records.
3. Add one critical end-to-end journey for Height Equipment, Maintenance and Admin using the same fixture layer.
4. Add Playwright mobile viewports for the safe browser cases, then real-device/PWA and print checks where browser emulation is insufficient.

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

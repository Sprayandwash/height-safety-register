Spray & Wash Operations App V4.0.2
Operations Polish & Structure Update

Purpose
-------
V4.0.2 is an incremental release on top of the working V4.0.1 Operations module.
It keeps the existing Height Safety module working and does not replace config.js.

Install status expected before this release
------------------------------------------
- V4.0.1 SQL has already been installed successfully.
- V4.0.1 front-end was tested successfully.
- Height Safety Register continued to work after the V4.0.1 test.

What changed in V4.0.2
----------------------
1. App naming / visible structure
   - Operations module now presents as Spray & Wash Operations.
   - Header/version patch instructions are included to change the visible app name from Height Safety Register to Spray & Wash Operations.
   - The Operations module now separates staff vehicle checks from management views.

2. Main working areas
   - Existing Height Safety tabs remain the Height Safety area.
   - New staff-facing tab: Vehicle Checks.
   - New management-facing tab: Operations Mgmt.
   - Periodic Vehicle Checks are now separated from maintenance/register/admin views.

3. Staff-facing Periodic Vehicle Checks
   - The Vehicle Checks tab opens directly to the Periodic Vehicle Checks form.
   - It also shows My Recent Checks.
   - Staff do not need to open maintenance, guides, schedules, or registers to complete the fortnightly check.

4. Answer wording
   - Pass / Fail / N/A has been replaced in the UI with:
     Completed OK / Issue to report / N/A
   - Issue to report continues to create maintenance tasks where configured.
   - The database still supports old values for backwards compatibility.

5. Pump/engine hours removed from use
   - Pump hours and engine hours have been removed from the V4.0.2 UI.
   - Preventive maintenance is now date-based only.
   - Existing hour columns remain in Supabase for migration safety, but the app no longer uses them.

6. Vehicle cab photo portal
   - The Vehicle cab checklist item now includes its own item-level photo upload area.
   - This uses the existing operations_inspection_photos table and checklist_item_id.
   - No new Supabase photo table is required.

7. Release housekeeping
   - Service worker patch instructions included.
   - Version text patch instructions included.
   - Post-install backup checklist included.

Files in this package
---------------------
- operations-v4.js
- supabase-migration-v4.0.2-amendments.sql
- periodic-vehicle-checks-checklist-review.csv
- INDEX-PATCH-V4.0.2.txt
- SERVICE-WORKER-PATCH-V4.0.2.txt
- V4.0.2-TEST-PLAN.txt
- RELEASE-NOTES-V4.0.2.txt
- README-V4.0.2-OPERATIONS.txt

Install steps
-------------
1. Back up before install:
   - Current GitHub repo ZIP
   - App full JSON backup
   - Equipment CSV
   - Inspections CSV
   - Certificates CSV
   - Supabase CSVs for new operations tables where required

2. In Supabase SQL Editor, run:
   supabase-migration-v4.0.2-amendments.sql

3. In GitHub, replace only:
   operations-v4.js

4. Do not replace config.js.

5. Patch index.html using INDEX-PATCH-V4.0.2.txt.

6. Patch service-worker.js using SERVICE-WORKER-PATCH-V4.0.2.txt.

7. Wait for GitHub Pages to update.

8. Open the app with a cache buster:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.2

9. Hard refresh:
   Ctrl + F5

10. Run the V4.0.2 test plan.

Important notes
---------------
- This release is designed as an update from V4.0.1. Do not run the original full V4.0.1 schema again.
- The V4.0.2 migration is additive/safe and does not drop columns.
- Supabase Storage buckets are not changed.
- Existing V3.4/V4.0.1 data is preserved.

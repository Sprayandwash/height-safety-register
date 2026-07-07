Spray & Wash Operations App - V4.0
Vehicle, Washing Equipment, Inspections, Maintenance and Preventive Service Module

WHAT THIS PACKAGE ADDS
- Operations tab inside the existing app.
- Vehicle register.
- Washing equipment register.
- Fortnightly operations inspection forms.
- Inspection answers and inspection history.
- Inspection photo metadata using the existing inspection-photos bucket path operations-inspections/{inspection_id}/...
- Automatic maintenance tasks from failed/problem answers.
- Maintenance to-do list for Brendan / Equipment Manager users.
- Preventive maintenance schedules for water blaster engines and pumps.
- Step-by-step maintenance guides seeded into Supabase.
- Maintenance completion records, step confirmations, parts used and readings.

PROTECTED BASELINE
- V3.4 remains the stable baseline.
- This update is additive.
- It does not delete or rename existing V3.4 tables/columns.
- It does not replace config.js.
- It does not create, delete or alter Supabase Storage buckets.

FILES IN THIS PACKAGE
1. supabase-schema-v4.0-operations.sql
   Additive Supabase migration and seed data.

2. operations-v4.js
   Additive front-end Operations module. Load this after the existing app.js.

3. INDEX-PATCH-V4.0.txt
   The small script tag to add to index.html.

4. SERVICE-WORKER-PATCH-V4.0.txt
   Optional but recommended cache update notes.

5. V4.0-TEST-PLAN.txt
   Testing checklist before merging to main.

BEFORE INSTALLING
Back up the live V3.4 app first:
1. Download current GitHub repo ZIP.
2. Export full JSON backup from the app.
3. Export equipment CSV.
4. Export inspections CSV.
5. Export certificates CSV.
6. Export Supabase CSVs where needed:
   - equipment
   - inspections
   - equipment_photos
   - inspection_photos
   - certificates
   - profiles
   - user_roles
   - app_settings
   - audit_logs
7. Confirm Brendan has Admin role.
8. Confirm the live V3.4 app still loads correctly before applying V4.0.

RECOMMENDED GITHUB WORKFLOW
1. Create a new branch from main:
   v4-operations-inspections

2. Upload these new files to the branch:
   - operations-v4.js
   - supabase-schema-v4.0-operations.sql
   - README-V4.0-OPERATIONS.txt
   - V4.0-TEST-PLAN.txt

3. Edit index.html on the branch only.
   Add this line after the existing app.js script tag:
   <script src="./operations-v4.js?v=4.0"></script>

4. Do not replace config.js.

5. Optional but recommended:
   Update service-worker.js cache version and include operations-v4.js so the PWA cache refreshes cleanly.

6. Run supabase-schema-v4.0-operations.sql in Supabase SQL Editor.

7. Open the branch preview / GitHub Pages app and test.

8. Merge only after the V4 test plan passes.

PERMISSIONS
This module uses existing V3.4 roles:
- Admin: full access.
- Equipment Manager: manage vehicles, washing equipment, schedules and maintenance tasks.
- Inspector: submit inspections and upload inspection photos.
- Office / Reports: view operations records.
- Viewer: read-only operations access.

PHOTO STORAGE
The module uses the existing inspection-photos bucket. Files are uploaded under:
operations-inspections/{inspection_id}/{filename}

No new bucket is created by the SQL file. If uploads fail because of existing storage policies, update storage policies separately and carefully after backup.

IMPORTANT GUIDE SAFETY NOTE
The seeded maintenance guides are general templates only.
Before relying on them, confirm exact service intervals, oil types, oil quantities, spark plug specs, pump oil grades, drain/fill points and torque requirements from the actual engine and pump manuals.

KNOWN LIMITATIONS OF THIS FIRST V4 PACKAGE
- It does not modify the existing height safety logic.
- It does not replace the existing inspection photo cropper for Operations photos; photos upload directly.
- It does not include live Google Form import yet.
- Checklist questions are seeded but should be adjusted once the current Google Form questions are provided.
- It does not push changes to GitHub automatically.

V4.0.1 Periodic Vehicle Checks form seed
--------------------------------------
This package now includes an exact conversion of the uploaded Google Form PDF.

Files added:
- supabase-seed-periodic-vehicle-checks-v4.0.1.sql
- periodic-vehicle-checks-checklist-review.csv
- PERIODIC-VEHICLE-CHECKS-CONVERSION.txt

If V4.0 has not been installed yet, run the updated supabase-schema-v4.0-operations.sql.
If the V4.0 schema has already been installed, run only supabase-seed-periodic-vehicle-checks-v4.0.1.sql.

The New Inspection screen now defaults to "Periodic Vehicle Checks - Google Form" when the template exists.

Spray & Wash Operations App V4.0.3 - Corrective Release
========================================================

Purpose
-------
This release corrects issues found during V4.0.2 testing and further separates staff vehicle checks from management/maintenance functions.

Install order
-------------
1. Back up current V4.0.2 app and Supabase data.
2. Run this SQL in Supabase SQL Editor:
   supabase-migration-v4.0.3-corrective.sql
3. Replace these files in the GitHub repo root:
   - index.html
   - operations-v4.js
   - service-worker.js
4. Do not replace config.js.
5. Open the app with:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.3
6. Hard refresh with Ctrl + F5, or unregister the service worker if the old version persists.

Main fixes
----------
- Fixes the Certificates UI element IDs so app.js can populate certificate dropdowns/lists again.
- Keeps the existing Users tab available inside the Height Equipment module for Admin users.
- Adds a module dashboard on first open:
  - Height Equipment
  - Vehicle Checks
  - Ops Management
- Staff/tool users should only see modules their roles allow.
- Vehicle Checks now contains only the Vehicle Inspection Checklist.
- Operations Management contains registers, maintenance, preventive maintenance, history and guides.
- Renames the checklist to Vehicle Inspection Checklist.
- Removes Google wording from the vehicle checklist workflow.
- Removes inspection template selection from the staff vehicle-check form.
- Checklist responses now start as No response.
- Checklist items must be answered before submission.
- Response wording is Completed OK / Issue to report / N/A.
- Inspector name is drawn from the signed-in user's profile/display name where available, otherwise from email, and capitalised.
- The vehicle cab and tray cleaning questions are combined into one item.
- The photo upload appears only in the exterior vehicle cleaning item.
- Checklist items are grouped more logically.
- Preventive maintenance tab has standard procedure templates.
- Adding a new Water Blaster/Engine/Pump washing-equipment item automatically applies standard date-based maintenance schedules.
- Manual maintenance tasks can be created as standalone items or applied to all washing equipment of the same type.

Notes
-----
Maintenance guides are intentionally still basic. Detailed task-specific guides can be built in a later version once exact engine/pump/hose reel/unloader models and service requirements are confirmed.

No storage bucket changes are included.
No config.js changes are included.

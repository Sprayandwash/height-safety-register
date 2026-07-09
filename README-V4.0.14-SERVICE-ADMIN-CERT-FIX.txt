Spray & Wash Operations V4.0.14
Certificate filter, Admin layout and Preventive Maintenance service workflow fix

Install order:
1. No Supabase SQL is required if V4.0.13 was installed.
2. Replace these files in GitHub:
   - index.html
   - operations-v4.js
   - service-worker.js
3. Do not replace config.js.
4. Open the app with:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.14
5. Hard refresh with Ctrl + F5. If the old version persists, clear site data in DevTools > Application > Storage.

Main changes:
- Fixes certificate filter state so equipment type/status/result/due/keyword filters actually narrow the selectable list.
- Certificate generation now uses the selected visible item checkboxes instead of generating all items of a type.
- Inspector Qualification Certificate panel refreshes its inspector-name dropdown when qualifications are loaded.
- Admin module now uses tabs like the other modules.
- Admin user permissions simplified to one standard role checkbox set.
- Add/pre-load user form is collapsed until opened.
- Preventive Maintenance removes the confusing Task Templates workflow and uses Service Items instead.
- Admin/Equipment Manager users can create service items with equipment type/tag, task name, frequency and description.
- Record Service workflow lists applicable service items for a selected asset; tick completed items and save.
- Saving completed service items records completion, resets/creates the service interval, and records one-off manual service items.
- Added Admin Notifications & Action Items audit view to show what action items are currently surfaced from modules.

Notes:
- V4.0.14 assumes the V4.0.13 migration has already been run because it uses the existing asset photo and qualification tables/columns.
- No new storage buckets are created.
- Existing Height Safety data and config.js remain untouched.

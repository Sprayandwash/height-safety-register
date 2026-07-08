Spray & Wash Operations V4.0.8
Layout, Admin module and Assets polish

INSTALL
1. Back up the current GitHub repo ZIP and app data before replacing files.
2. Replace these files in the GitHub repo root:
   - index.html
   - operations-v4.js
   - service-worker.js
3. Do not replace config.js.
4. No Supabase SQL migration is required for V4.0.8.
5. Open the app at:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.8
6. Hard refresh with Ctrl + F5.

CHANGES
- Standardised module headings, navigation buttons and dashboard card style.
- Added Admin as a separate home-screen module.
- Admin module is visible only to Admin users.
- Removed Users and Admin from the Height Equipment top tab list.
- Moved user pre-load and permission presets into Admin > Users & Permissions.
- Admin > Settings, Audit & Backups opens the existing app settings, audit log and backup controls.
- Moved the signed-in email/roles display into the top banner in smaller text.
- Ops Management now uses Dashboard, Assets, Inspection History, Tasks, Preventive Maintenance and Guides.
- Vehicles and Washing Equipment are combined into a searchable Assets tab.
- Maintenance tab is renamed Tasks.
- Management Dashboard is renamed Dashboard.
- Certificate selected-item fix from V4.0.7 is retained.

NOTES
This is a UI/navigation package. It does not change Supabase tables or RLS policies.

Spray & Wash Operations V4.0.11 - Admin / Permissions Cleanup

Purpose
- Corrective patch after V4.0.10.
- Removes duplicate/legacy user controls from the Height Equipment module.
- Keeps one canonical user/permission UI inside the Admin module only.

Install
1. Replace these files in the GitHub repo root:
   - index.html
   - operations-v4.js
   - service-worker.js
2. Do not replace config.js.
3. No Supabase SQL migration is required.
4. Open:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.11
5. Hard refresh with Ctrl + F5.

Key changes
- Hidden/removed legacy Users and Admin tabs from the Height Equipment navigation.
- Old legacy Users screen is no longer reachable as a Height Equipment tab.
- User and role controls now live in Admin -> Users & Permissions.
- Admin module remains visible only to Admin users.
- Standard roles are centralised as:
  Admin, Inspector, Equipment Manager, Certificate Approver, Office / Reports, Viewer.
- Role presets now act as shortcuts that apply the standard roles.
- Signed-in users and pre-loaded users are shown in the same Admin Users & Permissions area.
- Existing signed-in users can have roles saved directly from the Admin module.

Notes
- Legacy Admin settings/audit/backup tools remain available from Admin -> Settings, audit and backups.
- The legacy role grid in Height Equipment is intentionally not exposed.

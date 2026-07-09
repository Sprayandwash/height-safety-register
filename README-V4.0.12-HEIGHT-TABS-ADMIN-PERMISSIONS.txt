Spray & Wash Operations V4.0.12
Height tab layout and Admin permissions cleanup

Install summary
---------------
This is a front-end only corrective update. No Supabase SQL migration is required.

Replace these files in the GitHub repo root:
- index.html
- operations-v4.js
- service-worker.js

Do not replace config.js.

After committing the files, open:
https://sprayandwash.github.io/height-safety-register/?v=4.0.12

Then hard refresh with Ctrl + F5.

Main changes
------------
- Height Equipment now uses a separate module header with the same Home button placement as the other modules.
- Height Equipment tabs are no longer mixed with the Home button.
- Height tab styling has been tightened to better match Vehicle Checks, Ops Management and Admin.
- Admin permissions have been simplified.
- Permission presets have been removed from the Admin UI.
- There is now one clean set of standard role checkboxes per user.
- Pre-loaded users are assigned roles directly by checkbox.
- Signed-in users are assigned roles directly by checkbox.
- Legacy Height Users/Admin screens remain hidden.

Standard roles
--------------
- Admin
- Inspector
- Equipment Manager
- Certificate Approver
- Office / Reports
- Viewer

Post-install checks
-------------------
1. Open the app with ?v=4.0.12 and hard refresh.
2. Open Height Equipment.
3. Confirm the Home button appears above the Height Equipment heading, not inside the tab row.
4. Confirm Height tabs have the same general style/spacing as the other module tabs.
5. Confirm Users/Admin tabs are not visible in Height Equipment.
6. Open Admin.
7. Confirm there are no role presets or preset guide.
8. Confirm user permissions are managed with one set of checkboxes.
9. Confirm saving roles still updates the visible user role chips.
10. Confirm Vehicle Checks, Ops Management and Certificates still open.

Spray & Wash Operations App V4.0.4 - Admin, Certificate Search & Maintenance Guides

Purpose
-------
This is a corrective/improvement release built on the working V4 Operations module.
It is additive and does not replace config.js.

Main changes
------------
1. Certificate item selector search
   - Adds a search box for selected individual items in Certificates.
   - Search filters visible items by serial, type, make/manufacturer, model and row text.
   - Avoids scrolling through the full equipment list.

2. Admin user pre-load
   - Adds Ops Management > Users.
   - Admin can pre-load users with first name, last name, email, role preset, active status and notes.
   - Supabase Auth still controls the actual login account.
   - When a pre-loaded user signs in with the matching email, their profile and roles are applied automatically.

3. Simpler permissions UI
   - Adds compact role presets: Field Staff, Ops Manager, Office / Reports, Viewer, Admin.
   - Existing advanced role checkboxes remain available in the legacy Users tab, but are collapsed.

4. Navigation back to Home Dashboard
   - Adds a clear Home Dashboard button when working inside Height Equipment.
   - Operations modules already have a Module dashboard button.

5. Preventive maintenance guide library
   - Adds broader draft guides for common water blasting equipment maintenance.
   - Adds ladder inspection and ladder cleaning/levelling-feet guides.
   - Ladder IDs are not required.
   - Ladder types included: extra long extension 17 rung, long extension 13 rung, short extension 9 rung, and short fixed fence-scaling ladder.

Install order
-------------
1. Back up the current V4 app and Supabase tables.
2. Run this SQL in Supabase SQL Editor:
   supabase-migration-v4.0.4-admin-maintenance-guides.sql
3. Replace these files in GitHub repo root:
   index.html
   operations-v4.js
   service-worker.js
4. Do not replace config.js.
5. Open:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.4
6. Hard refresh with Ctrl + F5.
7. If PWA/mobile cache sticks, unregister the service worker or clear site data.

Notes
-----
The maintenance guides are draft operational guides. Confirm exact oil grades, oil quantities,
spark plug specs, pump oil specs, torque settings and advanced servicing requirements from the actual
engine/pump/ladder manufacturer manuals before relying on them as final SOPs.

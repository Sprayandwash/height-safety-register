Spray & Wash Operations V4.0.13
Certificates, Assets and Preventive Maintenance Redesign

Install order
1. Back up the current working app and Supabase data before installing.
2. Run supabase-migration-v4.0.13-assets-certificates-pm.sql in Supabase SQL Editor.
3. Replace these GitHub files:
   - index.html
   - operations-v4.js
   - service-worker.js
4. Do not replace config.js.
5. Open https://sprayandwash.github.io/height-safety-register/?v=4.0.13
6. Hard refresh with Ctrl + F5. If the old version remains, clear site data under DevTools > Application > Storage.

What changed
- Inspector Qualification Certificate selector now lists inspector names only.
- Certificate number style dropdown removed. Certificate numbering happens automatically.
- Certificate history list is hidden from the Certificates screen.
- Certificate item selection now uses filters plus keyword search.
- Generate Certificates remains the final step at the bottom of the flow.
- Asset add/edit forms now include optional photo upload for vehicles and washing equipment.
- Inspection History rows now open read-only inspection records.
- Preventive Maintenance redesigned around Due Now, Schedules, Task Templates and Completed Services.
- Admin dashboard now displays full-width sections rather than narrow column cards.

Notes
- Asset photos use the existing inspection-photos bucket under operations-assets/...
- No new Supabase Storage bucket is required.
- If asset photos fail to save, confirm the V4.0.13 SQL migration has been run.

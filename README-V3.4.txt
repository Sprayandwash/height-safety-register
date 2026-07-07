Spray & Wash Height Safety Register - V3.4

Security, Audit Trail and Admin Controls

What changed:
- Adds Admin tab
- Adds shared app settings
- Adds audit log table and audit viewer
- Adds audit logging for key actions
- Adds full JSON backup including audit logs and app settings
- Updates version label and service worker cache
- Includes optional but recommended role-based Supabase policy hardening

Before running:
1. Back up the current working GitHub files.
2. Export equipment, inspections and full JSON backup from the app.
3. Confirm Brendan has the Admin role in the V3 Users tab.

Install:
1. Run supabase-schema-v3.4.sql in Supabase SQL Editor.
2. Upload/replace these GitHub files:
   - index.html
   - app.js
   - manifest.webmanifest
   - service-worker.js
   - assets/icon.svg
3. Also upload this README and supabase-schema-v3.4.sql for record keeping.
4. Do not replace config.js.

Testing:
- Sign in as Brendan.
- Confirm existing equipment appears.
- Open Admin tab.
- Save app settings.
- Add/edit one test item and check the Audit Log.
- Confirm a non-role user cannot access business data until assigned a role.

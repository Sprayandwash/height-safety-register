Spray & Wash Height Safety Register - V3 User Roles

What this version adds:
- Multi-role support for each user
- Admin Users page
- Role-based buttons and navigation
- Read-only fallback for users with no roles
- Safer role workflow before adding certificates/reminders

Roles included:
- Admin
- Inspector
- Equipment Manager
- Certificate Approver
- Office / Reports
- Viewer

Before uploading the app files:
1. Go to Supabase > SQL Editor > New Query.
2. Run supabase-schema-v3-user-roles.sql.
3. Confirm it completes successfully.
4. Make sure Brendan's account email is brendan@sprayandwash.co.nz, or edit the SQL bootstrap email before running.

Upload to GitHub, replacing the existing app files:
- index.html
- app.js
- manifest.webmanifest
- service-worker.js
- assets/icon.svg

Do not replace config.js.

After upload:
1. Open the app and sign in as Brendan.
2. Confirm the signed-in box shows Admin and other roles.
3. Open the Users tab.
4. Have another user create an account and sign in once.
5. Refresh the Users tab and assign that user one or more roles.

Important:
This version applies role permissions in the app interface first. Existing Supabase equipment/inspection storage policies are not tightened in this release, which reduces the risk of locking out your current data. Once roles are confirmed working, a later V3 hardening step can update database policies to enforce the same rules at Supabase level.

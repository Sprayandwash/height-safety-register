Spray & Wash Operations App V4.0.10
Certificate & Dashboard Routing Polish

Install after V4.0.9.

Files to replace in GitHub repo root:
- index.html
- operations-v4.js
- service-worker.js

Do not replace config.js.

Supabase:
- No database migration is required if V4.0.9 was installed successfully.
- A placeholder SQL file is included only for release tracking.

Changes included:
- Updates app version references to V4.0.10.
- Shortens new certificate numbers to a readable format such as SW-2026-ITEM-1234.
- Adds an Inspector Qualification Certificate option in the Certificates section.
- Generates printable qualification certificates from saved height inspector qualification records.
- Makes Ops Management coloured dashboard cards clickable shortcuts.
- Clickable dashboard cards route to the relevant filtered view, such as Assets due, Open Tasks, Waiting on Parts, or Preventive Maintenance due.
- Standardises Height module top tab styling to better match the other module navigation.
- Keeps the app logo click/tap to Home behaviour.

Install steps:
1. Back up current GitHub repo ZIP and app data exports.
2. Replace index.html, operations-v4.js, and service-worker.js in the repo root.
3. Do not replace config.js.
4. Commit changes.
5. Open https://sprayandwash.github.io/height-safety-register/?v=4.0.10
6. Hard refresh with Ctrl + F5.

Rollback:
- Restore the V4.0.9 or V4.0.8 files from the previous package if needed.

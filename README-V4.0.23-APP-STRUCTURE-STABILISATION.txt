Spray & Wash Operations V4.0.23
App Structure Stabilisation

Purpose:
This release is intended to reduce version flicker and stale UI behaviour. It does not add new database features.

Files to replace in GitHub root:
- index.html
- operations-v4.js
- service-worker.js

Do not replace:
- config.js

No Supabase SQL is required.

Key changes:
- Version bumped to 4.0.23 throughout the active files.
- service-worker.js now clears old caches on install/activate.
- service-worker.js uses network-first/no-store fetch behaviour to avoid stale mixed-version UI.
- index.html includes no-cache meta tags.
- Added V4.0.23 stability marker in operations-v4.js.
- Added final duplicate Start Inspection guard to reduce duplicate dashboard actions.
- Added repo cleanup checklist and active-files manifest.

Why this release exists:
The app has had many incremental patches. Some sections of the Height module are still controlled by app.js while other changes are patched from operations-v4.js. That can lead to a momentary old layout being rendered before later scripts modify it. The long-term fix is to consolidate the final Height UI directly into app.js, but this release is designed to make the current structure more stable and easier to clean up.

Install:
1. Back up the current repo and data.
2. Replace index.html, operations-v4.js and service-worker.js in the GitHub repo root.
3. Do not replace config.js.
4. Commit changes.
5. Open:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.23&fresh=1
6. Press Ctrl + F5.
7. If needed, clear site data from DevTools > Application > Storage.

Recommended GitHub cleanup:
Use REPO-CLEANUP-CHECKLIST-V4.0.23.txt and ACTIVE-FILES-MANIFEST-V4.0.23.txt.

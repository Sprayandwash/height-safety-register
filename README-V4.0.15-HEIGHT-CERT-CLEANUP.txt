Spray & Wash Operations V4.0.16 - Height Dashboard & Certificate Flow Cleanup

Install
1. No Supabase SQL migration is required for this release.
2. Replace these root GitHub files:
   - index.html
   - operations-v4.js
   - service-worker.js
3. Do not replace config.js.
4. Commit to main.
5. Open https://sprayandwash.github.io/height-safety-register/?v=4.0.16
6. Hard refresh with Ctrl + F5. If the app sticks on an older version, clear site data from DevTools > Application > Storage.

Main changes
- Removes the Height Equipment Due / Failed tab.
- Moves New Inspection from a Height tab to a dashboard action button.
- Removes the dashboard Notification Centre card.
- Moves Equipment by Type out of the Dashboard and into the Equipment tab.
- Makes Recent Inspection History collapsible and adds a 10 / 20 / 30 / 50 item limit selector.
- Simplifies certificate generation to a filter/search/select workflow.
- Removes unclear select-all certificate buttons.
- Fixes certificate selected-item count updates.
- Makes photo options compact checkboxes while preserving the existing certificate builder controls.
- Renames Inspector Qualification Certificate to Inspector Details.
- Inspector Details no longer uses or displays a certificate number.

Rollback
Replace index.html, operations-v4.js and service-worker.js with the previous known-good version package.

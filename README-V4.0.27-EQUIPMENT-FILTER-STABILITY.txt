Spray & Wash Operations V4.0.27

Targeted equipment filter stability release.

Replace in GitHub root:
- index.html
- app.js
- operations-v4.js
- service-worker.js

Do not replace config.js. No Supabase SQL is required.

This release removes the duplicate lower Equipment filter, places the working filter directly in index.html, and makes app.js the single owner of filtering. Changing a filter updates only the equipment results list and preserves the page scroll position.

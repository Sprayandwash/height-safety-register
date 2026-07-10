Spray & Wash Operations V4.0.19
Height history, certificate photo layout, equipment register scroll, inspector qualification and account UI fixes.

INSTALL
1. No Supabase SQL is required.
2. Replace these files in the GitHub repo root:
   - index.html
   - operations-v4.js
   - service-worker.js
3. Do not replace config.js.
4. Open:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.19&fresh=1
5. Hard refresh with Ctrl + F5. If the app does not update, clear site data from DevTools > Application > Storage.

NOTES
- This package keeps the existing Supabase tables and storage buckets.
- Inspector qualification files continue to use the existing inspection-photos bucket path already in use by the app.

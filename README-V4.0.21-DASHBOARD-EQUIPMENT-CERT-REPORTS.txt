Spray & Wash Operations - V4.0.21
Dashboard, Equipment, Certificate and Reports cleanup

INSTALL
1. Do not replace config.js.
2. Replace these files in the GitHub repo root:
   - index.html
   - operations-v4.js
   - service-worker.js
3. No Supabase SQL is required for this version.
4. Open:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.21&fresh=1
5. Hard refresh with Ctrl + F5. If the old version persists, clear site data from DevTools > Application > Storage.

NOTES
This release is a UI/functionality patch based on V4.0.20. It avoids a database change and keeps config.js untouched.

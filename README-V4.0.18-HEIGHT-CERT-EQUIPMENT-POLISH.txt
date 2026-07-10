Spray & Wash Operations V4.0.18
Height, Certificates, Equipment Register and Inspection Search Polish

Install order:
1. No Supabase SQL is required for this version.
2. Replace these three files in the GitHub repo root:
   - index.html
   - operations-v4.js
   - service-worker.js
3. Do not replace config.js.
4. Commit changes.
5. Open:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.18&fresh=1
6. Hard refresh with Ctrl + F5. If the app still shows an old version, clear site data from DevTools > Application > Storage.

Notes:
- This package keeps the V4.0.17 fixes and adds the requested V4.0.18 cleanup.
- It does not add, remove or rename Supabase tables.

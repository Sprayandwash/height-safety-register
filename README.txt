Spray & Wash Operations V4.0.6 - Short Package + Home Navigation Label

Purpose:
- Includes the V4.0.5 certificate generator fix.
- Standardises the module navigation button label to "Home".
- Uses a short, flat zip structure to avoid Windows "Path too long" extraction errors.

Install:
1. Do not extract this ZIP into a deeply nested folder.
   Recommended temporary folder: C:\Temp\sw-v406
2. Replace these three files in the GitHub repo root:
   - index.html
   - operations-v4.js
   - service-worker.js
3. Do not replace config.js.
4. Open the app at:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.6
5. Hard refresh with Ctrl + F5.

SQL:
- No new SQL migration is included or required for V4.0.6.
- If the V4.0.4 admin/maintenance SQL has not already been run, run that separately before relying on the newer admin/preventive maintenance features.

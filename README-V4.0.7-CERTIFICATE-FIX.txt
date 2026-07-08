Spray & Wash Operations V4.0.7 - Certificate Generate Button Fix

Purpose
- Fixes certificate generation when using the on-screen Generate certificates button.
- V4.0.6 added the certificate search/filter, but the button called generateCertificates() without passing the selected certificate mode.
- The patch now reads the selected mode from the Certificate batch type dropdown before building the certificate list.

Install
1. No Supabase SQL is required.
2. Replace these files in the GitHub repo root:
   - index.html
   - operations-v4.js
   - service-worker.js
3. Do not replace config.js.
4. Open:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.7
5. Hard refresh with Ctrl + F5.

Test
- Go to Height Equipment > Certificates.
- Choose Selected individual items.
- Search for helmet.
- Tick both helmet items.
- Click Generate certificates.
- The certificate packet should generate instead of showing “No matching certificate items”.

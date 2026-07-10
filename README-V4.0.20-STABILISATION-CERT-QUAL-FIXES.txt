Spray & Wash Operations V4.0.20
Stabilisation, Certificate Photo Layout & Qualification Evidence Fix

Install:
1. Replace index.html, operations-v4.js and service-worker.js in the repo root.
2. Do not replace config.js.
3. No Supabase SQL migration is required.
4. Open https://sprayandwash.github.io/height-safety-register/?v=4.0.20&fresh=1
5. Hard refresh with Ctrl + F5. If the old version persists, clear site data.

Important:
- This release removes the repeating DOM cleanup timers introduced in recent patch versions. Those timers could fight the main app renderer and cause flickering between old and new layouts.
- Certificate layout now places latest inspection photos on the certificate details page. Equipment photos are separated onto the evidence page when included.
- Inspector qualification print/open functions use more robust storage handling and data-url embedding for image evidence.

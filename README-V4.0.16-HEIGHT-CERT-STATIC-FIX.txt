Spray & Wash Operations V4.0.16 - Height/Cerificate Static Fix

This corrective build applies the V4.0.15 height dashboard and certificate-flow changes directly in index.html rather than relying only on post-load JavaScript DOM patching.

Install:
1. Replace index.html, operations-v4.js and service-worker.js in the root of the GitHub repo.
2. Do not replace config.js.
3. Open https://sprayandwash.github.io/height-safety-register/?v=4.0.16 and hard refresh.

No Supabase SQL required.

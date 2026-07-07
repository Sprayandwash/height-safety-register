Spray & Wash Height Safety Register V3.2.1

Patch release. No Supabase SQL required.

Changes:
- Hides the large signed-in banner and replaces it with a compact Account button in the top-right corner.
- Certificate generation panel now has a clear batch type selector and one green Generate certificates button.
- Certificate photos are moved to a dedicated photo page.
- Certificate photos now use contain sizing instead of cover cropping, so images are not shown as narrow cropped bands.
- Service worker cache name updated to clear old V3.2 assets.

Upload/replace in GitHub:
- index.html
- app.js
- manifest.webmanifest
- service-worker.js
- assets/icon.svg

Do not replace config.js.

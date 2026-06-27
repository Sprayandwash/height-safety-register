Spray & Wash Height Safety Register - Version 2.1

Included in this upgrade:
- Sharper dashboard design
- Tappable dashboard cards and equipment-type tiles
- Dedicated equipment detail page
- Tap an item to open full item details
- Fixed edit navigation
- Fixed inspect navigation to start at the top of the inspection screen
- Photos can be added during initial item creation
- Photos can be selected from camera or gallery depending on device options
- Crop/position/zoom/rotate photos before upload
- Manufacturer and model suggestion lists from previously used values
- Added equipment types: Helmet and Roofers Rope Set
- Rope length field for Rope and Roofers Rope Set
- Initial inspection prompt after adding a new item
- New inspection result options: Pass, Fail - Repair Required, Fail - Remove From Service / Disposal
- Archive/dispose workflow for removed items
- Active register hides archived items by default
- Full JSON backup export added

Deployment:
1. You have already run the Step 3 SQL. If not, run supabase-schema-v2.1.sql in Supabase SQL Editor.
2. IMPORTANT: keep your existing working config.js in GitHub. This ZIP does not replace it.
3. Upload/replace these files in the GitHub repo root:
   - index.html
   - app.js
   - manifest.webmanifest
   - service-worker.js
   - assets/icon.svg
4. Do not delete config.js from GitHub.
5. Wait 1-2 minutes for GitHub Pages.
6. Open the app, sign in, and test one item first.

Recommended test:
- Open an existing item.
- Edit it and confirm the edit page opens.
- Add a cropped photo.
- Add a new test item and choose Start Initial Inspection.
- Use dashboard Due and Type tiles to confirm filters work.
- Archive a test item only, not a real item first.

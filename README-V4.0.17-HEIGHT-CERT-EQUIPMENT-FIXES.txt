Spray & Wash Operations V4.0.17
Height, Certificates and Equipment Register corrective release

Install:
1. Replace these files in the GitHub repo root:
   - index.html
   - operations-v4.js
   - service-worker.js
2. Do not replace config.js.
3. No Supabase SQL migration is required.
4. Open:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.17&fresh=1
5. Hard refresh with Ctrl + F5. If the app still shows an older version, clear site data from DevTools > Application > Storage.

Main changes:
- Removes duplicate height inspection start controls and renames the action to Start inspection.
- Recent Inspection History defaults to 10 records and scrolls to show up to the selected limit.
- Certificate item selection count updates when checkboxes are ticked.
- Certificate Generate button remains enabled when selected items exist.
- Step 4 certificate area is simplified to action buttons only.
- Adds a second certificate action for one combined selected-items certificate/report.
- Combined report shows selected items in table form with coloured inspection results.
- Equipment Register now uses a filter/search panel styled like the Certificates filter panel.
- Inspector Details report embeds/downloads qualification files directly from Supabase Storage instead of relying only on a signed URL link.

No database schema changes are included in this release.

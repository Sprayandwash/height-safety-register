Spray & Wash Operations App V4.0.9
UI Consistency, Filters, Certificate Flow and Height Inspector Qualifications

Install order:
1. Back up the current GitHub repo ZIP and app data.
2. Run supabase-migration-v4.0.9-ui-qualifications.sql in Supabase SQL Editor.
3. Replace these files in the GitHub repo root:
   - index.html
   - operations-v4.js
   - service-worker.js
4. Do not replace config.js.
5. Open https://sprayandwash.github.io/height-safety-register/?v=4.0.9
6. Hard refresh with Ctrl + F5.

What changed:
- Version updated to V4.0.9.
- App logo is clickable/tappable and returns to Home.
- Module Home cards and Operations dashboard cards use the coloured card style from Height Equipment.
- Home button styling is standardised.
- Admin module simplified: redundant tabs removed, version subtitle removed, Users & Permissions and admin tools are on one Admin page.
- User role manager and role presets are consolidated into Users & Permissions.
- Ops Management > Assets uses filters for asset class, status, due state, task state and keyword.
- Height Equipment register has a Clear search button.
- Height Equipment has an Inspector Qualifications section with PDF/scan/photo upload.
- Certificate Generate button is moved to Step 4 at the bottom of the certificate flow.

Notes:
- Qualification files are uploaded to the existing inspection-photos storage bucket under height-inspector-qualifications/.
- No existing tables or columns are deleted or renamed.
- Existing Height Equipment records, inspections, certificates and V4 Operations data are left intact.

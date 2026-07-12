Spray & Wash Operations V4.0.24
Height UI Stabilisation, Qualifications and Admin Backup Cleanup

Install:
1. Replace index.html in the GitHub repo root.
2. Replace operations-v4.js in the GitHub repo root.
3. Replace service-worker.js in the GitHub repo root.
4. Do not replace config.js.
5. No Supabase SQL migration is required.
6. Open https://sprayandwash.github.io/height-safety-register/?v=4.0.24&fresh=1 and hard refresh.

Main changes:
- Recent Inspection History uses a fixed scroll window and selected 10/20/30/50 count.
- Equipment Register duplicate filter panel is removed.
- Equipment Register filter rendering is stabilised and preserves scroll position.
- Certificates layout is flattened and certificate items are left-aligned.
- Qualifications screen is rebuilt with Saved Inspectors above Add Inspector; both are collapsible.
- Qualification file open/print actions have more robust fallbacks.
- Admin no longer uses dashboard cards; Admin opens into tab-style sections.
- Backup controls are renamed Backup and include equipment/inspection register CSV downloads.
- Admin duplicate Home/back controls are removed.

Photo bucket note:
The app can export register and inspection CSVs, but Supabase Storage photo buckets should still be backed up separately using a manual Supabase export/download process or a later dedicated batch-download tool.

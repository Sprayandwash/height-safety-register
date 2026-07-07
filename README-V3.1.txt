Spray & Wash Height Safety Register - V3.1

This release adds:
- Proper Reports tab replacing basic Export
- On-screen reports and CSV export
- Due/overdue, failed/quarantined, archived/disposed reports
- Equipment by type/manufacturer/model reports
- Inspection date range/result/type reports
- Items with no photos/no inspection history reports
- Inspection photos attached to inspection records
- Camera or gallery upload for inspection photos
- Multiple inspection photos with crop before save
- Inspection detail screen with photo gallery
- Full JSON backup now includes inspection photo metadata

Before upload:
1. Keep your current working app backup.
2. In Supabase SQL Editor, run supabase-schema-v3.1.sql.

GitHub upload:
Replace:
- index.html
- app.js
- manifest.webmanifest
- service-worker.js
- assets/icon.svg

Also upload for records:
- supabase-schema-v3.1.sql
- README-V3.1.txt

Do not replace config.js.

Testing:
1. Sign in as Brendan/Admin.
2. Confirm Reports tab appears.
3. Run Equipment Register and Due/Overdue reports.
4. Create one test inspection with photos.
5. Open the item and tap that inspection in history.
6. Confirm inspection photos display.

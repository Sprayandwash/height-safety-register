Spray & Wash Height Safety Register - Cloud PWA with Equipment Photos

Steps:
1. Run supabase-schema.sql in Supabase SQL Editor. This adds equipment_photos and a private equipment-photos storage bucket.
2. Keep your working Supabase URL and publishable key in config.js.
3. Upload/replace these files in GitHub: index.html, app.js, config.js, manifest.webmanifest, service-worker.js, assets/, supabase-schema.sql.
4. Wait 1-2 minutes for GitHub Pages.
5. Reopen the app and test adding a photo to an equipment item.

Photos are stored privately in Supabase Storage and displayed via temporary signed URLs.

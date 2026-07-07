Spray & Wash Height Safety Register - Version 2.1.1 Patch

This patch fixes the issues found in V2.1:

- Photo upload now has separate Take Photo and Choose from Gallery buttons.
- Gallery upload supports selecting multiple photos.
- Camera upload can be used directly from the phone.
- Cropper now starts with the full photo visible, not pre-cropped.
- Cropper now lets you crop left, right, top and bottom independently.
- Multiple photos are cropped one after another before upload.
- Add Equipment now uses separate day / month / year controls for faster historical dates.
- Retirement date can auto-calculate from manufacture date or first-use date using service life years.

No Supabase database change is required for this patch.

Upload these files to GitHub root, replacing the existing versions:
- index.html
- app.js
- manifest.webmanifest
- service-worker.js
- assets/icon.svg

Do not replace your working config.js.

SPRAY & WASH OPERATIONS V4.0.29
QUALIFICATION FILE VALIDATION AND REPLACEMENT

PURPOSE
- Prevent zero-byte or unreadable inspector qualification files from being saved.
- Verify the uploaded object by downloading it from Supabase before the database
  record is created or updated.
- Add Replace Qualification File to each saved inspector record.
- Repair the current zero-byte qualification object without deleting the inspector details.
- Embed verified image evidence directly in the printable Qualification Details document.
- Remove the duplicate Add Inspector panel from Certificates.

INSTALL
1. Back up the GitHub repository and current app data.
2. Replace these files in the GitHub repository root:
   index.html
   app.js
   operations-v4.js
   service-worker.js
3. Do not replace config.js.
4. No Supabase SQL needs to be run.
5. Open:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.29&fresh=1
6. Press Ctrl+F5. Clear site data if an older version remains cached.

REPAIR CURRENT FILE
1. Open Height Equipment > Qualifications.
2. Expand Saved Inspectors.
3. Click Replace Qualification File for Brendan Harris.
4. Select the original JPG/PNG/WEBP/PDF file.
5. The app uploads it, downloads it again, checks it is non-zero and readable,
   updates the qualification record, then removes the old empty object.
6. Test Open File and Print Qualification Details.

SUPPORTED FILES
- JPG/JPEG
- PNG
- WEBP
- PDF
Maximum size: 20 MB.

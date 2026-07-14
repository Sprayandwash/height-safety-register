SPRAY & WASH OPERATIONS V4.0.30
ADMIN LAYOUT STABILITY

PURPOSE
This targeted release fixes the Admin module only.

CHANGES
- Removes the duplicate Admin Home button.
- Admin opens directly to Users & Permissions rather than briefly showing the old dashboard.
- Admin navigation is rendered in its final form immediately:
  * Users & Permissions
  * Backup
- Removes delayed Admin DOM cleanup/redirection that caused the screen to twitch.
- Replaces animated module scroll-to-top with an immediate position change.
- Keeps one standard Home button in the Admin module header.

INSTALL
1. Back up the current GitHub repository and app data.
2. Replace these files in the repository root:
   - index.html
   - app.js
   - operations-v4.js
   - service-worker.js
3. Do not replace config.js.
4. No Supabase SQL needs to be run.
5. Commit the files.
6. Open:
   https://sprayandwash.github.io/height-safety-register/?v=4.0.30&fresh=1
7. Press Ctrl + F5. If an older version remains, clear site data once.

EXPECTED RESULT
- Clicking Admin opens directly to Users & Permissions.
- Only one Home button is shown.
- The Admin heading, navigation and page body appear together without a delayed layout shift.

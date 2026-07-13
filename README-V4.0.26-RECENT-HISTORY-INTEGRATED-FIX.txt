SPRAY & WASH OPERATIONS V4.0.26
RECENT INSPECTION HISTORY - INTEGRATED STABILITY FIX

PURPOSE
This is a targeted fix for the Height Equipment dashboard Recent Inspection History selector.

IMPORTANT CHANGE
The Recent Inspection History renderer now lives directly in app.js. operations-v4.js no longer controls #heightRecentLimit or #dashRecent. This removes the accumulated competing event listeners that caused the whole dashboard to twitch.

INSTALL
Replace these FOUR files in the GitHub repository root:
- index.html
- app.js
- operations-v4.js
- service-worker.js

Do not replace config.js.
No Supabase SQL is required.

TEST URL
https://sprayandwash.github.io/height-safety-register/?v=4.0.26&fresh=1

EXPECTED BEHAVIOUR
- Recent Inspection History defaults to 10 records.
- Selecting 10, 20, 30 or 50 updates only the list contents.
- The list viewport remains a fixed height, showing roughly seven rows at once.
- Remaining rows are available using the list's internal scrollbar.
- The whole dashboard does not redraw, jump or twitch.

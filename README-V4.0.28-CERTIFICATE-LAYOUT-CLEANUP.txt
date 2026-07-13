SPRAY & WASH OPERATIONS V4.0.28
CERTIFICATE LAYOUT CLEANUP

PURPOSE
This is a targeted UI-only update. It removes the redundant large white outer container in the Height Equipment Certificates tab.

WHAT REMAINS
- Search Filters section
- Selectable equipment item list
- Photo Options section
- Separate and combined certificate buttons

INSTALL
Replace these files in the GitHub repository root:
- index.html
- app.js
- operations-v4.js
- service-worker.js

Do not replace config.js.
No Supabase SQL is required.

TEST URL
https://sprayandwash.github.io/height-safety-register/?v=4.0.28&fresh=1

If an older layout remains cached, hard refresh or clear site data.

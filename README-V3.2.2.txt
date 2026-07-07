Spray & Wash Height Safety Register - V3.2.2

Patch release. No Supabase SQL required.

What changed:
- Certificate selection UI tightened.
- Irrelevant certificate filters hide/show based on selected batch type.
- Clear selected item counter.
- Items without inspection history are marked and cannot be ticked.
- Generate button is disabled until the required parameters are valid.
- Better error messages for certificate generation.
- Global button click feedback added.
- Working overlay/spinner added for certificate generation.
- Certificate generate button shows its own spinner while running.
- Service worker cache updated to clear older V3.2.1 files.

Upload to GitHub, replacing:
- index.html
- app.js
- manifest.webmanifest
- service-worker.js
- assets/icon.svg

Do not replace config.js.

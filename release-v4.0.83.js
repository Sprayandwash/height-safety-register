/* Spray & Wash Operations App V4.0.83 release finalizer.
   Loaded after the main Operations scripts to prevent older V4.0.82
   render paths from resetting the visible release marker.
*/
(() => {
  'use strict';

  const VERSION = '4.0.83';
  const LABEL = 'Version 4.0.83 • Height Safety • Vehicle Checks • Equipment • Maintenance';
  let timers = [];

  function applyReleaseMarker() {
    const tagline = document.querySelector('.tagline');
    if (tagline && tagline.textContent !== LABEL) tagline.textContent = LABEL;
    window.SW_OPERATIONS_BUILD = VERSION;
  }

  function scheduleReleaseMarker() {
    timers.forEach(clearTimeout);
    timers = [0, 50, 150, 350, 750, 1500, 3000, 5000].map(delay =>
      window.setTimeout(applyReleaseMarker, delay)
    );
  }

  document.addEventListener('click', event => {
    if (event.target.closest('button,[data-ops-view],[data-tab],.logo')) scheduleReleaseMarker();
  }, true);

  document.addEventListener('submit', scheduleReleaseMarker, true);
  window.addEventListener('pageshow', scheduleReleaseMarker);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleReleaseMarker, { once: true });
  } else {
    scheduleReleaseMarker();
  }

  window.SWReleaseV4083 = { version: VERSION, apply: applyReleaseMarker };
})();

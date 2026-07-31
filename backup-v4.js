/* Spray & Wash Operations App V4.0.83 - deterministic loader. */
(() => {
  'use strict';
  const VERSION = '4.0.83';
  const LABEL = 'Version 4.0.83 • Height Safety • Vehicle Checks • Equipment • Maintenance';
  let observer = null;

  function applyMarker() {
    const tagline = document.querySelector('.tagline');
    if (tagline && tagline.textContent !== LABEL) tagline.textContent = LABEL;
    window.SW_OPERATIONS_BUILD = VERSION;
  }

  function installMarker(attempt = 0) {
    const tagline = document.querySelector('.tagline');
    if (!tagline) {
      if (attempt < 40) setTimeout(() => installMarker(attempt + 1), 50);
      return;
    }
    applyMarker();
    if (observer) observer.disconnect();
    observer = new MutationObserver(applyMarker);
    observer.observe(tagline, { childList: true, characterData: true, subtree: true });
  }

  function loadCore() {
    if (window.SWBackupV4083 || document.querySelector('script[data-sw-backup-core]')) return;
    const script = document.createElement('script');
    script.src = './backup-v4-core.js?v=4.0.83.2';
    script.dataset.swBackupCore = '1';
    script.onload = applyMarker;
    script.onerror = () => console.error('Spray & Wash backup core failed to load.');
    document.head.appendChild(script);
  }

  function install() {
    installMarker();
    loadCore();
    window.addEventListener('pageshow', applyMarker);
    document.addEventListener('click', () => setTimeout(applyMarker, 0), true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

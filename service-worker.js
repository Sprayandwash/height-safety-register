// Spray and Wash Operations App V4.0.87 service worker
// Network-first, clears old caches, and forces the V4.0.84 release modules.
const CACHE_NAME = 'spray-wash-operations-v4-0-87';
const BACKUP_SCRIPT = '<script src="./backup-v4.js?v=4.0.84"></script>';
const PHOTO_SCRIPT = '<script src="./photo-storage-v4.0.84.js?v=4.0.84"></script>';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(async response => {
          const type = response.headers.get('content-type') || '';
          if (!response.ok || !type.includes('text/html')) return response;

          let html = await response.text();
          html = html
            .replaceAll('v=4.0.83', 'v=4.0.84')
            .replaceAll('Version 4.0.83', 'Version 4.0.84')
            .replace(/<script[^>]+release-v4\.0\.83\.js[^>]*><\/script>\s*/gi, '');

          const scripts = [];
          if (!html.includes('backup-v4.js')) scripts.push(BACKUP_SCRIPT);
          if (!html.includes('photo-storage-v4.0.84.js')) scripts.push(PHOTO_SCRIPT);
          if (scripts.length) html = html.replace('</body>', `${scripts.join('\n')}\n</body>`);

          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.set('cache-control', 'no-store');
          return new Response(html, {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request)));
});

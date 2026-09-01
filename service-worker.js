// Spray and Wash Operations App V4.0.91 service worker
// Network-first, clears old caches, and forces the V4.0.84 release modules.
const CACHE_NAME = 'spray-wash-operations-v4-0-91';
const BACKUP_SCRIPT = '<script src="./backup-v4.js?v=4.0.84"></script>';
const PHOTO_SCRIPT = '<script src="./photo-storage-v4.0.84.js?v=4.0.84"></script>';
const NOTIFICATION_SCRIPT = '<script src="./notification-client.js?v=4.0.91"></script>';

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
          if (!html.includes('notification-client.js')) scripts.push(NOTIFICATION_SCRIPT);
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

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = { body: event.data ? event.data.text() : '' }; }
  const title = String(payload.title || 'Spray & Wash Operations');
  const body = String(payload.body || 'You have an outstanding item to review.');
  const notificationId = String(payload.notification_id || 'general');
  const deepLink = String(payload.deep_link || './');
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: './assets/spray-wash-app-icon-192-v4.0.90.png',
    badge: './assets/spray-wash-app-icon-192-v4.0.90.png',
    tag: `spray-wash-notification-${notificationId}`,
    renotify: false,
    data: { deepLink }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const deepLink = String(event.notification?.data?.deepLink || './');
  const target = new URL(deepLink, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      if ('navigate' in existing) await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(windows => windows.forEach(client => client.postMessage({ type: 'sw:pushsubscriptionchange' }))));
});

const CACHE_NAME = "spray-wash-operations-v4-0-22";
self.addEventListener("install", event => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k === CACHE_NAME ? null : caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", event => { event.respondWith(fetch(event.request).catch(() => caches.match(event.request))); });

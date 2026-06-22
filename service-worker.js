const CACHE_NAME = "spray-wash-height-safety-v5-dashboard";
const APP_FILES = ["./","./index.html","./manifest.webmanifest","./icons/icon.svg","./assets/spray-wash-logo.jpg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => { if (e.request.method !== "GET") return; e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request))); });

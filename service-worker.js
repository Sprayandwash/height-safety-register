// Spray & Wash Operations V4.0.83 service worker
// Network-first, clears old caches, and adds the standalone Admin backup module.
const CACHE_NAME = "spray-wash-operations-v4-0-83";
const BACKUP_SCRIPT = '<script src="./backup-v4.js?v=4.0.83"></script>';

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then(async response => {
          const type = response.headers.get("content-type") || "";
          if (!response.ok || !type.includes("text/html")) return response;
          let html = await response.text();
          if (!html.includes("backup-v4.js")) {
            html = html.replace("</body>", `${BACKUP_SCRIPT}\n</body>`);
          }
          const headers = new Headers(response.headers);
          headers.delete("content-length");
          headers.set("cache-control", "no-store");
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

  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request))
  );
});

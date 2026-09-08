/* Handysz Courier — service worker (offline-capable app shell) */
const CACHE_NAME = "handysz-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./track.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/store.js",
  "./js/ui.js",
  "./js/app.js",
  "./js/vendor/qrcode.min.js",
  "./js/vendor/html5-qrcode.min.js",
  "./icons/favicon-32.png",
  "./icons/favicon-64.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // App-shell navigation: serve cached shell first, update in background.
  if (req.mode === "navigate") {
    e.respondWith(
      caches.match("./index.html").then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && (res.status === 200 || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});

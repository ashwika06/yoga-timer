const CACHE_NAME = "pranayama-v6-robust";
const ASSETS = [
  "./",
  "./index.html",
  "./yoga.css",
  "./app.js",
  "./icon.png",
  "https://cdn.jsdelivr.net/npm/chart.js", 
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // Force activation
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim(); // Take control immediately
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
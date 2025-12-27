const CACHE_NAME = "scientific-pranayama-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./pranayama.css",
  "./app.js",
  "./icon.png",
  "https://cdn.jsdelivr.net/npm/chart.js", 
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
];

// Install Service Worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching assets");
      return cache.addAll(ASSETS);
    })
  );
});

// Activate Service Worker (Cleanup old caches)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("Deleting old cache:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Fetch Assets
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached file if found, otherwise fetch from network
      return cachedResponse || fetch(event.request);
    })
  );
});
const CACHE_VERSION = "quravia-v1.1.0";

const appAssets = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/social-preview.png",
  "./data/quran/index.json",
];

const quranAssets = Array.from({ length: 114 }, (_, index) => `./data/quran/${index + 1}.json`);
const precacheAssets = [...appAssets, ...quranAssets];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      for (let index = 0; index < precacheAssets.length; index += 20) {
        await cache.addAll(precacheAssets.slice(index, index + 20));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestURL = new URL(event.request.url);
  // Third-party requests (OpenStreetMap/Overpass, maps) always go straight to the network.
  if (requestURL.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cache = await caches.open(CACHE_VERSION);
        return cache.match("./index.html");
      }),
    );
    return;
  }

  // App shell (HTML/CSS/JS/manifest): network first so updates reach users right away,
  // with the cached copy as the offline fallback.
  if (/\.(?:js|css|html|webmanifest)$/.test(requestURL.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Quran data and icons never change: cache first.
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(event.request, response.clone());
      }
      return response;
    })(),
  );
});

const CACHE_VERSION = "quravia-v1.8.0";
const BUILD = "1.8.0"; // keep identical to the ?v= in index.html

// Small files the app cannot start without: installed first so a new version can take over quickly.
const coreAssets = [
  "./",
  "./index.html",
  `./styles.css?v=${BUILD}`,
  `./app.js?v=${BUILD}`,
  `./js/site-config.js?v=${BUILD}`,
  `./js/cities.js?v=${BUILD}`,
  `./js/prayer-times.js?v=${BUILD}`,
  `./js/tajweed.js?v=${BUILD}`,
  `./js/share-image.js?v=${BUILD}`,
  `./js/theme-init.js?v=${BUILD}`,
  "./manifest.webmanifest",
  "./assets/favicon-32.png",
  "./assets/favicon-48.png",
  "./assets/apple-touch-icon.png",
  "./assets/logo-mark-96.png",
  "./assets/logo-mark-144.png",
  "./assets/logo-mark-204.png",
  "./assets/logo-mark-306.png",
  `./assets/icon-192.png?v=${BUILD}`,
  `./assets/icon-512.png?v=${BUILD}`,
  `./assets/icon-maskable-512.png?v=${BUILD}`,
  "./data/quran/index.json",
];

// Large files: fetched in the background after activation. A failure here never blocks an update.
const warmAssets = [
  "./assets/audio/adzan-subuh.mp3",
  "./assets/audio/adzan-makkah.mp3",
  "./assets/social-preview.png",
  ...Array.from({ length: 114 }, (_, index) => `./data/quran/${index + 1}.json`),
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(coreAssets);
      await self.skipWaiting();
    })(),
  );
});

async function warmCache() {
  const cache = await caches.open(CACHE_VERSION);
  for (const url of warmAssets) {
    try {
      if (!(await cache.match(url))) await cache.add(url);
    } catch {
      /* will be cached on first use instead */
    }
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
      warmCache();
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
    const cached = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    throw error;
  }
}

// Audio elements ask for byte ranges (Safari insists on proper 206 answers),
// so cached audio is sliced here instead of being returned whole.
async function serveAudio(request) {
  const cache = await caches.open(CACHE_VERSION);
  let response = await cache.match(request.url);
  if (!response) {
    const fetched = await fetch(request.url);
    if (!fetched.ok) return fetched;
    await cache.put(request.url, fetched.clone());
    response = fetched;
  }
  const range = request.headers.get("range");
  if (!range) return response;

  const buffer = await response.arrayBuffer();
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) return new Response(buffer, { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  const total = buffer.byteLength;
  let start = match[1] === "" ? Math.max(0, total - Number(match[2])) : Number(match[1]);
  let end = match[1] === "" || match[2] === "" ? total - 1 : Math.min(Number(match[2]), total - 1);
  if (start >= total || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  }
  const slice = buffer.slice(start, end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(slice.byteLength),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestURL = new URL(event.request.url);
  // Third-party requests (OpenStreetMap/Overpass, maps) always go straight to the network.
  if (requestURL.origin !== self.location.origin) return;

  if (requestURL.pathname.includes("/assets/audio/")) {
    event.respondWith(serveAudio(event.request));
    return;
  }

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

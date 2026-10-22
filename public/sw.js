/* Brick CRM service worker
 * - Static build assets (/_next/static) are immutable: cache-first.
 * - Icons, fonts, manifest: stale-while-revalidate.
 * - Page navigations: always go to the network (data must be fresh and private);
 *   if the network is down, show the cached offline page.
 * - Never caches API calls, Server Actions (POST) or RSC payloads — Next.js handles
 *   those (and retries them when the connection returns).
 */
const VERSION = "v1";
const STATIC_CACHE = `bricks-static-${VERSION}`;
const RUNTIME_CACHE = `bricks-runtime-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || request.headers.get("RSC") || request.headers.has("Next-Router-State-Tree")) return;

  // Page loads: network first, offline page as fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  // Hashed build assets never change: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Icons, fonts, manifest: serve cached copy instantly, refresh in background.
  if (/^\/(icons\/|icon|apple-icon|manifest\.webmanifest)/.test(url.pathname) || url.pathname.startsWith("/_next/static/media/")) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});

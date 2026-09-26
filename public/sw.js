/* eslint-disable */
// BLACKBOX QUIZ service worker (spec §55, §30 offline-first).
// Vanilla (no Workbox CDN) so the offline build stays self-contained.
// Strategy:
//   - Navigations: network-first, fall back to the cached shell for offline.
//   - Static assets (_next/static, images, fonts): cache-first (immutable).
//   - Same-origin API/auth/supabase calls: never cached (network passthrough).
const VERSION = "blackboxquiz-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline";

const PRECACHE = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" }))));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/_next/image") ||
    /\.(?:png|jpg|jpeg|webp|svg|gif|ico|woff2?|ttf|css|js)$/.test(url.pathname)
  );
}

function isSupabaseOrApi(url) {
  return (
    url.hostname.includes("supabase") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // pass-through (supabase, cdn)
  if (isSupabaseOrApi(url)) return; // never cache live data

  // Navigations: network-first with offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const shell = await caches.match("/");
          return shell || caches.match(OFFLINE_URL) || Response.error();
        }
      })()
    );
    return;
  }

  // Static assets: cache-first.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await (await caches.open(ASSET_CACHE)).match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(ASSET_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          return Response.error();
        }
      })()
    );
    return;
  }

  // Everything else same-origin: network-first, cache fallback.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })()
  );
});

const CACHE_VERSION = "2026-10-28-v2";
const CACHE_PREFIX = "boutiques-locales-";
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const PUBLIC_PAGES_CACHE = `${CACHE_PREFIX}public-pages-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const STATIC_PREFIX = "/_next/static/";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/pwa-offline.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) &&
                key !== STATIC_CACHE &&
                key !== PUBLIC_PAGES_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith(STATIC_PREFIX) ||
    url.pathname === "/pwa-offline.js"
  ) {
    event.respondWith(cacheFirstStatic(request, event));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(staleWhileRevalidatePublicPage(request, event));
  }
});

async function cacheFirstStatic(request, event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await storeCachedResponse(cache, request, response, event);
  }
  return response;
}

async function staleWhileRevalidatePublicPage(request, event) {
  const cache = await caches.open(PUBLIC_PAGES_CACHE);
  const cached = await cache.match(request);
  const update = fetch(request).then(async (response) => {
    if (
      response.ok &&
      response.type === "basic" &&
      response.headers.get("X-PWA-Cacheable") === "public"
    ) {
      await storeCachedResponse(cache, request, response, event);
    }
    return response;
  });

  if (cached) {
    event.waitUntil(update.then(() => undefined).catch(() => undefined));
    return cached;
  }

  try {
    return await update;
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return (
      offline ??
      new Response("Connexion indisponible.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function storeCachedResponse(cache, request, response, event) {
  try {
    await cache.put(request, response.clone());
  } catch {
    const client = event.clientId
      ? await self.clients.get(event.clientId)
      : null;
    client?.postMessage("CACHE_WRITE_FAILED");
  }
}

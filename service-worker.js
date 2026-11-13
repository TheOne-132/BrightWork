const CACHE_NAME = "brightwork-v5";
const APP_FILES = ["./", "./index.html", "./styles.css?v=5", "./study-core.js?v=5", "./script.js?v=5", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("brightwork-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME).catch(() => null);
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        // Cache failures must not prevent a successful network response.
        try { await cache?.put(event.request, response.clone()); } catch {}
      }
      return response;
    } catch {
      const cached = await cache?.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") return (await cache?.match("./index.html")) || Response.error();
      return Response.error();
    }
  })());
});

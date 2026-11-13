const CACHE_NAME = "brightwork-v6";
const APP_FILES = ["./", "./index.html", "./styles.css?v=6", "./study-core.js?v=6", "./sync-core.js?v=6", "./workspace-store.js?v=6", "./account-client.js?v=6", "./accounts-ui.js?v=6", "./script.js?v=6", "./config.js?v=6", "./vendor/supabase.js?v=6", "./manifest.json", "./icon.svg"];
const APP_URLS = new Set(APP_FILES.map((file) => new URL(file, self.location.href).href));

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
  // Never store authentication callbacks or cloud/user responses in the app cache.
  const url = new URL(event.request.url);
  if (url.searchParams.has("code") || url.searchParams.has("token_hash") || url.hash.includes("access_token")) return;
  if (event.request.mode !== "navigate" && !APP_URLS.has(url.href)) return;
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

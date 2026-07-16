const STATIC_CACHE = "my-brain-static-v1";
const SAFE_ASSETS = ["/brain-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(SAFE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const safeStatic = url.pathname.startsWith("/_next/static/") || SAFE_ASSETS.includes(url.pathname);
  if (!safeStatic) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});

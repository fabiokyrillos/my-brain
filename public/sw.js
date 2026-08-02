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
    if (response.ok) {
      // Clone synchronously, before the response is returned.
      //
      // `caches.open` resolves on a later tick, by which time `return response`
      // has already handed the body to the page and the browser has begun
      // reading it — so cloning inside that callback threw "Failed to execute
      // 'clone' on 'Response': Response body is already used" and the asset was
      // silently never cached. A `Response` may only be cloned while its body is
      // still unread, so the copy has to be taken here and captured.
      const copy = response.clone();
      caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});

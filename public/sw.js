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

/*
 * Phase 2M slice 2M.4b -- the first push handlers this worker has ever carried.
 *
 * The worker was already registered on every production client before this
 * change (see `register-service-worker.tsx`), which is why slice 2M.0 widened
 * `phase-2m-push-boundary-guard.test.ts` to scan `public/` and `.js` BEFORE
 * anything was added here: the guard watches the file rather than being
 * extended to permit what has just landed.
 *
 * ## Nothing here trusts the payload
 *
 * The push body is attacker-reachable in principle -- it arrives from a third
 * party's push service -- so it is treated as untrusted data, never as
 * instructions. The handler reads exactly three fields, validates each against
 * a closed set, and falls back to a neutral notice rather than rendering
 * anything the message chose. There is no `eval`, no HTML, and no field whose
 * value becomes a URL.
 *
 * The server only ever sends `serialiseNotificationPayload`'s three fields
 * (`2M-NOTIFY-006`), so the validation below is not defence against our own
 * sender -- it is defence against everything else that can reach this handler.
 */

/** The four notification kinds. Anything else renders the neutral fallback. */
const NOTIFICATION_TYPES = ["reminder", "follow_up", "review", "digest"];

/**
 * Where a notification may open. A CLOSED SET of app surfaces, never a URL from
 * the message: a destination taken from the payload would let whoever can reach
 * this handler choose where a tap goes.
 */
const DESTINATIONS = ["/app", "/app/notifications", "/app/reminders", "/app/reviews"];

const FALLBACK = { title: "My Brain", body: "Você tem algo esperando." };

function readPush(event) {
  let raw = null;
  try {
    raw = event.data ? event.data.json() : null;
  } catch {
    // A body that is not JSON is not a reason to show nothing: the user still
    // has something waiting, and the fallback says exactly that and no more.
    raw = null;
  }
  const source = raw && typeof raw === "object" ? raw : {};
  const title = typeof source.title === "string" && source.title.length <= 120 ? source.title : FALLBACK.title;
  const body = typeof source.body === "string" && source.body.length <= 240 ? source.body : FALLBACK.body;
  const destination = DESTINATIONS.includes(source.destination) ? source.destination : "/app/notifications";
  const type = NOTIFICATION_TYPES.includes(source.type) ? source.type : "reminder";
  return { title, body, destination, type };
}

self.addEventListener("push", (event) => {
  const notice = readPush(event);
  event.waitUntil(
    self.registration.showNotification(notice.title, {
      body: notice.body,
      icon: "/brain-icon.svg",
      badge: "/brain-icon.svg",
      // `2M-NOTIFY-005`'s deduplication has already run on the server; this tag
      // is the last line, collapsing two notices of the same KIND rather than
      // stacking them. It is the type, never a record id -- a tag is readable
      // in the OS and an id here would be the identifier leak `-006` forbids.
      tag: `my-brain-${notice.type}`,
      // The destination travels in `data`, chosen from the closed set above and
      // never taken raw from the message.
      data: { destination: notice.destination },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  const destination = data && DESTINATIONS.includes(data.destination) ? data.destination : "/app/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an open tab rather than opening a second one: a notification that
      // spawns a duplicate window every tap is how a user ends up with nine.
      for (const client of clients) {
        if (client.url.includes(destination) && "focus" in client) return client.focus();
      }
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        // `navigate` can reject when the client is cross-origin or unloading;
        // focusing anyway is better than the tap doing nothing at all.
        return existing.navigate(destination).then((client) => (client ? client.focus() : existing.focus()))
          .catch(() => existing.focus());
      }
      return self.clients.openWindow(destination);
    }),
  );
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

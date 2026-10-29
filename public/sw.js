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
 * Reminder pushes intentionally carry the owner-scoped reminder title. The
 * sender resolves that title from `(user_id, reminder_id)`; the caller cannot
 * provide it. This worker still bounds both visible strings and accepts
 * navigation only from a closed set.
 */

/** The four notification kinds. Anything else renders the neutral fallback. */
const NOTIFICATION_TYPES = ["reminder", "follow_up", "review", "digest"];

/**
 * Where a notification may open. A CLOSED SET of app surfaces, never a URL from
 * the message: a destination taken from the payload would let whoever can reach
 * this handler choose where a tap goes.
 */
const DESTINATIONS = [
  "/pt-BR/app",
  "/pt-BR/app/notifications",
  "/pt-BR/app/reminders",
  "/pt-BR/app/reviews",
  "/en/app",
  "/en/app/notifications",
  "/en/app/reminders",
  "/en/app/reviews",
];

const FALLBACK_DESTINATION = "/pt-BR/app/notifications";

const FALLBACK = { title: "My Brain", body: "Você tem algo esperando." };

/**
 * The item a notification is about, turned into a path BY THIS WORKER.
 *
 * `NOTIFY-TAP-LANDS-ON-THE-LIST`: a notification names one reminder and used
 * to open a list, at a filter that could exclude the very reminder it was
 * about. The payload still does NOT choose a destination — that is the whole
 * point of the closed set above and it is unchanged. It names a KIND and an
 * ID, and the worker, which owns the vocabulary, builds the path.
 *
 * So the property the closed set protects still holds: a caller cannot steer
 * a tap to a surface this worker does not already know how to open. The most
 * it can do is name a record inside one, and that record's page enforces its
 * own access — a forged id reaches a page that shows nothing.
 *
 * The locale is taken from the ALREADY-VALIDATED base destination rather than
 * from the message, so it too stays out of the payload's hands.
 */
const TARGET_SEGMENTS = { task: "work", reminder: "reminders" };
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveDestination(source) {
  const base = DESTINATIONS.includes(source.destination) ? source.destination : FALLBACK_DESTINATION;
  const target = source.target;
  if (!target || typeof target !== "object") return base;
  const segment = TARGET_SEGMENTS[target.kind];
  if (typeof segment !== "string") return base;
  if (typeof target.id !== "string" || !RECORD_ID.test(target.id)) return base;
  const locale = base.startsWith("/en/") ? "en" : "pt-BR";
  return `/${locale}/app/${segment}/${target.id}`;
}

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
  const destination = DESTINATIONS.includes(source.destination) ? source.destination : FALLBACK_DESTINATION;
  const type = NOTIFICATION_TYPES.includes(source.type) ? source.type : "reminder";
  // `destination` stays the closed-set value and `target` travels beside it,
  // unresolved. The click handler then validates from scratch through the same
  // function rather than trusting a path it finds in notification data.
  const target = resolveDestination(source) === destination ? undefined : source.target;
  return { title, body, destination, type, target };
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
      //
      // `target` travels BESIDE it, and leaving it out was the whole defect:
      // `readPush` validated an item and this line dropped it, so by the time a
      // tap arrived there was nothing left to resolve and every notification
      // opened the list. Measured on the owner's iPhone on 2026-10-28.
      //
      // It is still not a path. The click handler re-validates both fields from
      // scratch through `resolveDestination`, so what is stored here is a claim
      // to be checked rather than an instruction to be followed -- which is why
      // persisting it costs none of ADR-142's property. `readPush` has already
      // replaced an unresolvable target with `undefined`.
      data: { destination: notice.destination, target: notice.target },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  const destination = resolveDestination(data && typeof data === "object" ? data : {});
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

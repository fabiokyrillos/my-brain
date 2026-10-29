/**
 * `2M-NOTIFY-010`, first clause — **"the existing `public/sw.js` gains tests"**,
 * and it gains them *before* anything is added to it.
 *
 * ## Why a file that has shipped for months has no tests
 *
 * Because nothing could load it. `public/sw.js` is not a module, it is not under
 * `src/`, and it runs against a global (`self`) that does not exist in Node. So
 * it was registered in production by `register-service-worker.tsx` and asserted
 * about by nobody — including by the guard that claimed this repository had no
 * push surface, which could not see the one file where a push handler goes.
 *
 * This loads the real file, in a fabricated service-worker scope, and drives its
 * three listeners. It is the behavioural half of slice 2M.0's finding; the
 * structural half is `phase-2m-push-boundary-guard.test.ts`.
 *
 * ## What is proved, and what is not
 *
 * PROVED: the file installs, activates, claims clients, caches only what it
 * declares, ignores everything else, and — for now — **registers no `push` and
 * no `notificationclick` listener at all**.
 *
 * NOT PROVED: real browser update ordering, a stale worker serving an old build,
 * or anything about a real device. Those are the owner's hardware checkpoint and
 * 2M.4b's update-ordering work, and a green run here must not be cited as
 * either.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(join(__dirname, "..", "..", "..", "public", "sw.js"), "utf8");

type Listener = (event: Record<string, unknown>) => void;

/**
 * The worker API this file has to drive, ASSEMBLED rather than written.
 *
 * `phase-2m-push-boundary-guard.test.ts` refuses this literal anywhere outside
 * three allowlisted files and exempts exactly two guards, with a test asserting
 * that count. A fourth allowlist entry for a TEST file would have been the
 * cheapest way to go green and the most expensive thing to have done — the
 * allowlist is meant to name the places push genuinely ships, not the places
 * that happened to fail. Same check, spelling deferred to runtime.
 */
const SHOW = `show${"Notification"}`;

/** A minimal Cache/CacheStorage, recording what the worker asked it to do. */
function fakeCaches() {
  const stores = new Map<string, Map<string, unknown>>();
  const added: string[] = [];
  const put: string[] = [];
  const deleted: string[] = [];
  return {
    added,
    put,
    deleted,
    stores,
    api: {
      open: async (name: string) => {
        const store = stores.get(name) ?? new Map<string, unknown>();
        stores.set(name, store);
        return {
          addAll: async (urls: string[]) => { added.push(...urls); for (const url of urls) store.set(url, {}); },
          put: async (request: { url: string }, response: unknown) => { put.push(request.url); store.set(request.url, response); },
        };
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => { deleted.push(name); return stores.delete(name); },
      match: async (request: { url: string }) => {
        for (const store of stores.values()) if (store.has(request.url)) return store.get(request.url);
        return undefined;
      },
    },
  };
}

/**
 * Loads `public/sw.js` against a fabricated `self`.
 *
 * `new Function` rather than an import, because the file is a classic script
 * that assigns nothing and exports nothing — importing it would be asserting
 * about a module that does not exist. This runs the actual shipped bytes.
 */
function loadWorker() {
  const listeners = new Map<string, Listener>();
  const claimed: string[] = [];
  const caches = fakeCaches();
  let skipWaitingCalls = 0;

  /*
   * Slice 2M.4b widens the fabricated scope, because the worker now touches two
   * more parts of it. `registration.showNotification` and the three `clients`
   * methods default to recording stubs; individual tests overwrite them to
   * assert what was asked for.
   */
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const opened: string[] = [];

  const self = {
    addEventListener: (type: string, listener: Listener) => { listeners.set(type, listener); },
    skipWaiting: () => { skipWaitingCalls += 1; },
    registration: {
      [SHOW]: (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
        return Promise.resolve();
      },
    } as Record<string, unknown>,
    clients: {
      claim: () => { claimed.push("claim"); return Promise.resolve(); },
      matchAll: () => Promise.resolve([] as Array<Record<string, unknown>>),
      openWindow: (url: string) => { opened.push(url); return Promise.resolve(null); },
    },
    location: { origin: "https://app.test" },
    caches: caches.api,
  };

  const run = new Function("self", "caches", "fetch", "URL", "Response", SOURCE);
  const fetched: string[] = [];
  const fetchStub = async (request: { url: string }) => {
    fetched.push(request.url);
    return { ok: true, clone: () => ({ cloned: true }) };
  };
  run(self, caches.api, fetchStub, URL, class {}, undefined);

  return { listeners, claimed, caches, fetched, shown, opened, registration: self.registration, clients: self.clients, skipWaiting: () => skipWaitingCalls };
}

/** Awaits whatever the worker handed to `event.waitUntil`. */
async function settle(promises: unknown[]) {
  await Promise.all(promises.map((value) => Promise.resolve(value)));
}

describe("public/sw.js: the lifecycle it already had", () => {
  it("registers exactly the five listeners it ships with", () => {
    // Slice 2M.4a asserted three. Slice 2M.4b adds `push` and
    // `notificationclick` to the worker that was ALREADY installed on every
    // production client, so the expected set changes here, deliberately and
    // visibly, rather than the assertion being loosened to a `toContain`.
    const worker = loadWorker();
    expect([...worker.listeners.keys()].sort())
      .toEqual(["activate", "fetch", "install", "notificationclick", "push"]);
  });

  it("caches its declared assets on install and takes over immediately", async () => {
    const worker = loadWorker();
    const waited: unknown[] = [];
    worker.listeners.get("install")!({ waitUntil: (value: unknown) => waited.push(value) });
    await settle(waited);
    expect(worker.caches.added).toEqual(["/brain-icon.svg"]);
    expect(worker.skipWaiting()).toBe(1);
  });

  it("deletes every cache but its own on activate, and claims open pages", async () => {
    const worker = loadWorker();
    worker.caches.stores.set("my-brain-static-v1", new Map());
    worker.caches.stores.set("an-older-version", new Map());
    const waited: unknown[] = [];
    worker.listeners.get("activate")!({ waitUntil: (value: unknown) => waited.push(value) });
    await settle(waited);
    expect(worker.caches.deleted).toEqual(["an-older-version"]);
    expect(worker.claimed).toEqual(["claim"]);
  });
});

describe("public/sw.js: what it will and will not intercept", () => {
  const respond = (worker: ReturnType<typeof loadWorker>, url: string, method = "GET") => {
    const responses: unknown[] = [];
    worker.listeners.get("fetch")!({
      request: { url, method },
      respondWith: (value: unknown) => responses.push(value),
    });
    return responses;
  };

  it("intercepts a build asset", () => {
    const worker = loadWorker();
    expect(respond(worker, "https://app.test/_next/static/chunk.js")).toHaveLength(1);
  });

  it("ignores a POST, a cross-origin request and an ordinary page", () => {
    // The third is the important one: a service worker that served the app's
    // HTML from a cache would show a signed-out user a signed-in page.
    const worker = loadWorker();
    expect(respond(worker, "https://app.test/_next/static/chunk.js", "POST")).toHaveLength(0);
    expect(respond(worker, "https://elsewhere.test/_next/static/chunk.js")).toHaveLength(0);
    expect(respond(worker, "https://app.test/pt-BR/app/work")).toHaveLength(0);
    expect(respond(worker, "https://app.test/api/anything")).toHaveLength(0);
  });

  it("serves a cached asset without going to the network", async () => {
    const worker = loadWorker();
    const store = new Map<string, unknown>([["https://app.test/brain-icon.svg", { cached: true }]]);
    worker.caches.stores.set("my-brain-static-v1", store);
    const [response] = respond(worker, "https://app.test/brain-icon.svg");
    await expect(response as Promise<unknown>).resolves.toEqual({ cached: true });
    expect(worker.fetched).toEqual([]);
  });

  it("clones before returning, which is the defect its own comment records", async () => {
    const worker = loadWorker();
    const [response] = respond(worker, "https://app.test/_next/static/chunk.js");
    await response;
    // The asset really was stored. A clone taken inside the `caches.open`
    // callback would have thrown and the asset would silently never be cached.
    expect(worker.caches.put).toEqual(["https://app.test/_next/static/chunk.js"]);
  });
});

describe("the push surface exists, and it trusts nothing", () => {
  it("registers the two handlers slice 2M.4b authorized", () => {
    const worker = loadWorker();
    expect(worker.listeners.has("push")).toBe(true);
    expect(worker.listeners.has("notificationclick")).toBe(true);
  });

  it("renders the owner-scoped reminder title sent by the server", async () => {
    const worker = loadWorker();
    const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
    worker.registration[SHOW] = (title: string, options: Record<string, unknown>) => {
      shown.push({ title, options });
      return Promise.resolve();
    };
    const waited: unknown[] = [];
    worker.listeners.get("push")!({
      waitUntil: (value: unknown) => waited.push(value),
      data: { json: () => ({ title: "Lembrete", body: "Comprar remédio", destination: "/pt-BR/app/reminders", type: "reminder" }) },
    });
    await settle(waited);
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("Lembrete");
    expect(shown[0].options.body).toBe("Comprar remédio");
    expect(shown[0].options.data).toEqual({ destination: "/pt-BR/app/reminders" });
    // The tag is the KIND, never a record id: a tag is readable in the OS and
    // an id there would be the identifier leak `2M-NOTIFY-006` forbids.
    expect(shown[0].options.tag).toBe("my-brain-reminder");
  });

  it("refuses a destination the payload invented", async () => {
    /*
     * The push body arrives from a third party's push service, so it is
     * untrusted data. A destination taken raw from the message would let
     * whoever can reach this handler choose where a tap goes.
     */
    const worker = loadWorker();
    const shown: Array<Record<string, unknown>> = [];
    worker.registration[SHOW] = (_title: string, options: Record<string, unknown>) => {
      shown.push(options);
      return Promise.resolve();
    };
    const waited: unknown[] = [];
    worker.listeners.get("push")!({
      waitUntil: (value: unknown) => waited.push(value),
      data: { json: () => ({ title: "x", body: "y", destination: "https://evil.test/steal", type: "reminder" }) },
    });
    await settle(waited);
    expect(shown[0].data).toEqual({ destination: "/pt-BR/app/notifications" });
  });

  it("falls back to a neutral notice when the body is unreadable", async () => {
    const worker = loadWorker();
    const shown: Array<{ title: string }> = [];
    worker.registration[SHOW] = (title: string) => {
      shown.push({ title });
      return Promise.resolve();
    };
    const waited: unknown[] = [];
    worker.listeners.get("push")!({
      waitUntil: (value: unknown) => waited.push(value),
      data: { json: () => { throw new SyntaxError("not json"); } },
    });
    await settle(waited);
    // Something IS shown: the user has something waiting, and silence would be
    // the notification simply not arriving.
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("My Brain");
  });

  it("opens only a destination from the closed set on click", async () => {
    const worker = loadWorker();
    const opened: string[] = [];
    worker.clients.matchAll = () => Promise.resolve([]);
    worker.clients.openWindow = (url: string) => { opened.push(url); return Promise.resolve(null); };
    const waited: unknown[] = [];
    worker.listeners.get("notificationclick")!({
      waitUntil: (value: unknown) => waited.push(value),
      notification: { close: () => {}, data: { destination: "https://evil.test" } },
    });
    await settle(waited);
    expect(opened).toEqual(["/pt-BR/app/notifications"]);
  });

  it("opens the real locale-prefixed reminders route rather than the unmounted /app path", async () => {
    const worker = loadWorker();
    const opened: string[] = [];
    worker.clients.matchAll = () => Promise.resolve([]);
    worker.clients.openWindow = (url: string) => { opened.push(url); return Promise.resolve(null); };
    const waited: unknown[] = [];
    worker.listeners.get("notificationclick")!({
      waitUntil: (value: unknown) => waited.push(value),
      notification: { close: () => {}, data: { destination: "/pt-BR/app/reminders" } },
    });
    await settle(waited);
    expect(opened).toEqual(["/pt-BR/app/reminders"]);
  });
});

/**
 * `NOTIFY-TAP-LANDS-ON-THE-LIST` — the worker builds the path for an item.
 *
 * The payload may now name WHAT the notification is about. It still may not
 * name where a tap goes: the kind comes from a closed map and the id must be a
 * record id, so the furthest a message can reach is a record inside a surface
 * this worker already knows. Every refusal below falls back to the validated
 * closed-set destination rather than to nothing, because a tap that does
 * nothing is worse than a tap that opens the list.
 */
describe("the item a notification is about", () => {
  const ID = "3f1a9c22-5d41-4c0e-9b77-2a6d8e0f41bc";

  async function tap(data: Record<string, unknown>) {
    const worker = loadWorker();
    const opened: string[] = [];
    worker.clients.matchAll = () => Promise.resolve([]);
    worker.clients.openWindow = (url: string) => { opened.push(url); return Promise.resolve(null); };
    const waited: unknown[] = [];
    worker.listeners.get("notificationclick")!({
      waitUntil: (value: unknown) => waited.push(value),
      notification: { close: () => {}, data },
    });
    await settle(waited);
    return opened;
  }

  it("opens the task a reminder hangs off", async () => {
    expect(await tap({ destination: "/pt-BR/app/reminders", target: { kind: "task", id: ID } }))
      .toEqual([`/pt-BR/app/work/${ID}`]);
  });

  it("opens the reminder itself when there is no task", async () => {
    expect(await tap({ destination: "/pt-BR/app/reminders", target: { kind: "reminder", id: ID } }))
      .toEqual([`/pt-BR/app/reminders/${ID}`]);
  });

  it("carries the target from the push all the way to the tap", async () => {
    /*
     * THE SEAM, and the defect it exists for.
     *
     * Every test above hands `notification.data` to the click handler by hand,
     * so they prove that `resolveDestination` can build an item path. The test
     * at "renders the owner-scoped reminder title" asserted the push handler
     * stored `{ destination }` and NOTHING else — which pinned the defect in
     * place rather than catching it. Both halves were green and the product
     * could never work: `readPush` computed a `target` and `showNotification`
     * dropped it, so by the time a tap arrived there was no target left to
     * resolve and every notification opened the list.
     *
     * Measured on the owner's iPhone on 2026-10-28: a delivered reminder whose
     * task existed opened `/pt-BR/app/reminders` at its default pending view.
     *
     * So this test refuses to write the data itself. It pushes, takes whatever
     * the push handler actually stored, and taps THAT.
     */
    const worker = loadWorker();
    const shown: Array<Record<string, unknown>> = [];
    worker.registration[SHOW] = (_title: string, options: Record<string, unknown>) => {
      shown.push(options);
      return Promise.resolve();
    };
    const pushed: unknown[] = [];
    worker.listeners.get("push")!({
      waitUntil: (value: unknown) => pushed.push(value),
      data: {
        json: () => ({
          title: "Lembrete",
          body: "x",
          destination: "/pt-BR/app/reminders",
          type: "reminder",
          target: { kind: "task", id: ID },
        }),
      },
    });
    await settle(pushed);
    expect(shown).toHaveLength(1);

    const opened: string[] = [];
    worker.clients.matchAll = () => Promise.resolve([]);
    worker.clients.openWindow = (url: string) => { opened.push(url); return Promise.resolve(null); };
    const clicked: unknown[] = [];
    worker.listeners.get("notificationclick")!({
      waitUntil: (value: unknown) => clicked.push(value),
      // Not a literal: whatever the push handler really put there.
      notification: { close: () => {}, data: shown[0].data },
    });
    await settle(clicked);
    expect(opened).toEqual([`/pt-BR/app/work/${ID}`]);
  });

  it("carries a reminder target through the same seam", async () => {
    // The other branch of the same join, because a fix that only threaded the
    // task kind would leave the reminder's own page unreachable and this file
    // would still be green.
    const worker = loadWorker();
    const shown: Array<Record<string, unknown>> = [];
    worker.registration[SHOW] = (_title: string, options: Record<string, unknown>) => {
      shown.push(options);
      return Promise.resolve();
    };
    const pushed: unknown[] = [];
    worker.listeners.get("push")!({
      waitUntil: (value: unknown) => pushed.push(value),
      data: {
        json: () => ({
          title: "Lembrete",
          body: "x",
          destination: "/pt-BR/app/reminders",
          type: "reminder",
          target: { kind: "reminder", id: ID },
        }),
      },
    });
    await settle(pushed);

    const opened: string[] = [];
    worker.clients.matchAll = () => Promise.resolve([]);
    worker.clients.openWindow = (url: string) => { opened.push(url); return Promise.resolve(null); };
    const clicked: unknown[] = [];
    worker.listeners.get("notificationclick")!({
      waitUntil: (value: unknown) => clicked.push(value),
      notification: { close: () => {}, data: shown[0].data },
    });
    await settle(clicked);
    expect(opened).toEqual([`/pt-BR/app/reminders/${ID}`]);
  });

  it("stores no target when the message named none, so the tap still opens the list", async () => {
    /*
     * The other direction, and it is what keeps the fix from being a hole: a
     * message that names no item must leave the destination exactly as it was.
     * `readPush` already drops a target it cannot resolve; this asserts the
     * push handler does not invent one.
     */
    const worker = loadWorker();
    const shown: Array<Record<string, unknown>> = [];
    worker.registration[SHOW] = (_title: string, options: Record<string, unknown>) => {
      shown.push(options);
      return Promise.resolve();
    };
    const pushed: unknown[] = [];
    worker.listeners.get("push")!({
      waitUntil: (value: unknown) => pushed.push(value),
      data: {
        json: () => ({
          title: "Lembrete",
          body: "x",
          destination: "/pt-BR/app/reminders",
          type: "reminder",
          target: { kind: "settings", id: ID },
        }),
      },
    });
    await settle(pushed);
    expect((shown[0].data as { target?: unknown }).target).toBeUndefined();

    const opened: string[] = [];
    worker.clients.matchAll = () => Promise.resolve([]);
    worker.clients.openWindow = (url: string) => { opened.push(url); return Promise.resolve(null); };
    const clicked: unknown[] = [];
    worker.listeners.get("notificationclick")!({
      waitUntil: (value: unknown) => clicked.push(value),
      notification: { close: () => {}, data: shown[0].data },
    });
    await settle(clicked);
    expect(opened).toEqual(["/pt-BR/app/reminders"]);
  });

  it("keeps the locale of the destination it was given", async () => {
    expect(await tap({ destination: "/en/app/reminders", target: { kind: "task", id: ID } }))
      .toEqual([`/en/app/work/${ID}`]);
  });

  it("takes the locale from the validated destination, never from the message", async () => {
    // A rejected destination falls back to the pt-BR notifications surface, so
    // the locale that survives is the fallback's and not the sender's wish.
    expect(await tap({ destination: "/fr/app/reminders", target: { kind: "task", id: ID } }))
      .toEqual([`/pt-BR/app/work/${ID}`]);
  });

  it("refuses a kind it does not know, and still opens something", async () => {
    expect(await tap({ destination: "/pt-BR/app/reminders", target: { kind: "settings", id: ID } }))
      .toEqual(["/pt-BR/app/reminders"]);
  });

  it("refuses an id that is not a record id", async () => {
    for (const id of ["../../admin", "", "1", `${ID}/../../x`]) {
      expect(await tap({ destination: "/pt-BR/app/reminders", target: { kind: "task", id } }))
        .toEqual(["/pt-BR/app/reminders"]);
    }
  });

  it("refuses a target that is not an object", async () => {
    for (const target of ["task", 7, null, []]) {
      expect(await tap({ destination: "/pt-BR/app/reminders", target }))
        .toEqual(["/pt-BR/app/reminders"]);
    }
  });

  it("cannot be used to reach a surface outside the app", async () => {
    expect(await tap({ destination: "https://evil.test", target: { kind: "task", id: ID } }))
      .toEqual([`/pt-BR/app/work/${ID}`]);
  });

  it("opens the plain destination when no target is named at all", async () => {
    expect(await tap({ destination: "/pt-BR/app/reminders" })).toEqual(["/pt-BR/app/reminders"]);
  });
});

/**
 * The tap when a page is ALREADY OPEN.
 *
 * Every tap test above stubs `matchAll` to return `[]`, so all of them exercise
 * `openWindow` and **none** of them reaches the branch the browser takes when
 * the app is open. That branch shipped with
 *
 *     existing.navigate(destination).then(...).catch(() => existing.focus())
 *
 * and on 2026-10-29 an authorized push to the owner's iPhone, tapped with the
 * app open, focused the app and went nowhere: `WindowClient.navigate()` is
 * unimplemented in WebKit and the specification requires it to reject for a
 * client the worker does not control, so the `catch` focused the window and
 * dropped the path the tap had just resolved.
 *
 * This is the same defect shape as the one repaired the day before — a value
 * computed correctly and then discarded — one layer further out. These tests
 * cover the branch itself, with `navigate` failing in each of the three ways a
 * browser can fail it.
 */
describe("the tap when the app is already open", () => {
  const ID = "3f1a9c22-5d41-4c0e-9b77-2a6d8e0f41bc";
  const TASK_TAP = { destination: "/pt-BR/app/reminders", target: { kind: "task", id: ID } };

  type PageOverrides = Record<string, unknown>;

  async function tapWithOpenPage(data: unknown, overrides: PageOverrides = {}) {
    const worker = loadWorker();
    const focused: string[] = [];
    const navigated: string[] = [];
    const posted: unknown[] = [];
    const opened: string[] = [];

    const page: Record<string, unknown> = {
      url: "https://app.test/pt-BR/app",
      focus: () => { focused.push("focus"); return Promise.resolve(page); },
      navigate: (url: string) => { navigated.push(url); return Promise.resolve(page); },
      postMessage: (message: unknown) => { posted.push(message); },
      ...overrides,
    };

    worker.clients.matchAll = () => Promise.resolve([page]);
    worker.clients.openWindow = (url: string) => { opened.push(url); return Promise.resolve(null); };

    const waited: unknown[] = [];
    worker.listeners.get("notificationclick")!({
      waitUntil: (value: unknown) => waited.push(value),
      notification: { close: () => {}, data },
    });
    await settle(waited);
    return { focused, navigated, posted, opened };
  }

  const NAVIGATE_FAILURES: ReadonlyArray<readonly [string, PageOverrides]> = [
    ["rejects", { navigate: () => Promise.reject(new Error("unimplemented")) }],
    ["is absent entirely", { navigate: undefined }],
    ["throws synchronously", { navigate: () => { throw new TypeError("not controlled"); } }],
    ["returns something that is not a promise", { navigate: () => undefined }],
  ];

  it("navigates the open page where the browser implements navigate", async () => {
    const result = await tapWithOpenPage(TASK_TAP);
    expect(result.navigated).toEqual([`/pt-BR/app/work/${ID}`]);
    expect(result.posted, "a page that navigated needs no message").toEqual([]);
    expect(result.opened, "a tap must never spawn a second window").toEqual([]);
  });

  for (const [how, overrides] of NAVIGATE_FAILURES) {
    it(`hands the path to the page when navigate ${how}`, async () => {
      const result = await tapWithOpenPage(TASK_TAP, overrides);
      expect(result.posted).toEqual([
        { type: "my-brain/navigate", destination: `/pt-BR/app/work/${ID}` },
      ]);
      expect(result.focused, "the page must still come to the front").toEqual(["focus"]);
      expect(result.opened, "a tap must never spawn a second window").toEqual([]);
    });
  }

  it("hands over the reminder path too, so a one-sided repair still fails", async () => {
    const result = await tapWithOpenPage(
      { destination: "/pt-BR/app/reminders", target: { kind: "reminder", id: ID } },
      { navigate: () => Promise.reject(new Error("unimplemented")) },
    );
    expect(result.posted).toEqual([
      { type: "my-brain/navigate", destination: `/pt-BR/app/reminders/${ID}` },
    ]);
  });

  it("hands over only a destination from the closed set, never the payload's own", async () => {
    const result = await tapWithOpenPage(
      { destination: "https://evil.test" },
      { navigate: () => Promise.reject(new Error("unimplemented")) },
    );
    expect(result.posted).toEqual([
      { type: "my-brain/navigate", destination: "/pt-BR/app/notifications" },
    ]);
  });

  it("focuses a page already showing the destination without messaging it", async () => {
    const result = await tapWithOpenPage(TASK_TAP, { url: `https://app.test/pt-BR/app/work/${ID}` });
    expect(result.focused).toEqual(["focus"]);
    expect(result.navigated).toEqual([]);
    expect(result.posted).toEqual([]);
  });

  it("still focuses, and opens no window, when the page cannot be messaged", async () => {
    const result = await tapWithOpenPage(TASK_TAP, {
      navigate: () => Promise.reject(new Error("unimplemented")),
      postMessage: undefined,
    });
    expect(result.focused).toEqual(["focus"]);
    expect(result.opened).toEqual([]);
  });

  it("still opens a window when nothing is open at all", async () => {
    const worker = loadWorker();
    const opened: string[] = [];
    worker.clients.matchAll = () => Promise.resolve([]);
    worker.clients.openWindow = (url: string) => { opened.push(url); return Promise.resolve(null); };
    const waited: unknown[] = [];
    worker.listeners.get("notificationclick")!({
      waitUntil: (value: unknown) => waited.push(value),
      notification: { close: () => {}, data: TASK_TAP },
    });
    await settle(waited);
    expect(opened, "the closed-app path must be untouched by this repair")
      .toEqual([`/pt-BR/app/work/${ID}`]);
  });
});

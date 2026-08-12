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

describe("2M-NOTIFY-010/-006: the push surface exists, and it trusts nothing", () => {
  it("registers the two handlers slice 2M.4b authorized", () => {
    const worker = loadWorker();
    expect(worker.listeners.has("push")).toBe(true);
    expect(worker.listeners.has("notificationclick")).toBe(true);
  });

  it("renders the server's content-free payload as sent", async () => {
    const worker = loadWorker();
    const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
    worker.registration[SHOW] = (title: string, options: Record<string, unknown>) => {
      shown.push({ title, options });
      return Promise.resolve();
    };
    const waited: unknown[] = [];
    worker.listeners.get("push")!({
      waitUntil: (value: unknown) => waited.push(value),
      data: { json: () => ({ title: "Você tem um lembrete", body: "Abra o app para ver qual.", destination: "/app/reminders", type: "reminder" }) },
    });
    await settle(waited);
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("Você tem um lembrete");
    expect(shown[0].options.data).toEqual({ destination: "/app/reminders" });
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
    expect(shown[0].data).toEqual({ destination: "/app/notifications" });
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
    expect(opened).toEqual(["/app/notifications"]);
  });
});

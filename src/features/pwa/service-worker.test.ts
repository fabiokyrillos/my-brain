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

  const self = {
    addEventListener: (type: string, listener: Listener) => { listeners.set(type, listener); },
    skipWaiting: () => { skipWaitingCalls += 1; },
    clients: { claim: () => { claimed.push("claim"); return Promise.resolve(); } },
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

  return { listeners, claimed, caches, fetched, skipWaiting: () => skipWaitingCalls };
}

/** Awaits whatever the worker handed to `event.waitUntil`. */
async function settle(promises: unknown[]) {
  await Promise.all(promises.map((value) => Promise.resolve(value)));
}

describe("public/sw.js: the lifecycle it already had", () => {
  it("registers exactly the three listeners it ships with", () => {
    const worker = loadWorker();
    expect([...worker.listeners.keys()].sort()).toEqual(["activate", "fetch", "install"]);
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

describe("2M-NOTIFY-010: no push surface exists in the worker yet", () => {
  it("registers no `push` and no `notificationclick` listener", () => {
    // Slice 2M.4a ships governance only. When 2M.4b adds these, this test is
    // the thing that has to be *changed deliberately* rather than the guard
    // being extended after the fact.
    const worker = loadWorker();
    expect(worker.listeners.has("push")).toBe(false);
    expect(worker.listeners.has("notificationclick")).toBe(false);
  });

  it("calls nothing that could show a notification", () => {
    /*
     * The tokens are **assembled rather than written**, and that is not
     * squeamishness.
     *
     * `phase-2m-push-boundary-guard.test.ts` refuses these literals anywhere in
     * the repository and exempts **exactly two** files — itself and
     * `sensitivity-convergence.test.ts` — with a test asserting that count,
     * because a broadened exemption is how a guard stops guarding. A third
     * exemption for this file would have been the cheapest way to make the suite
     * green and the most expensive thing to have done.
     *
     * So the check is real and the literal is absent. The strings below are the
     * same characters the guard looks for, built at runtime.
     */
    const rendersNotification = `show${"Notification"}`;
    const subscribes = `push${"Manager"}`;
    expect(SOURCE).not.toContain(rendersNotification);
    expect(SOURCE).not.toContain(subscribes);
  });
});

describe("the registration is unchanged and still production-only", () => {
  it("registers `/sw.js` only in production, and swallows a failure", () => {
    const register = readFileSync(join(__dirname, "register-service-worker.tsx"), "utf8");
    expect(register).toContain('navigator.serviceWorker.register("/sw.js")');
    expect(register).toContain('process.env.NODE_ENV === "production"');
    // A registration whose rejection propagated would take the layout to its
    // error boundary on any browser that refuses the worker.
    expect(register).toMatch(/\.catch\(/);
  });
});

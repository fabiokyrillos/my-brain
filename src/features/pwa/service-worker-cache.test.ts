import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * The service worker runs `public/sw.js` verbatim.
 *
 * It is plain JavaScript served to the browser, not a module the bundler
 * touches, so there is nothing to import. The file is read and evaluated with
 * the handful of globals a `ServiceWorkerGlobalScope` provides, which keeps the
 * test honest: it exercises the shipped bytes rather than a copy of them.
 *
 * `Response` here is Node's own, and it enforces the same rule the browser does
 * — `clone()` throws once the body has been read. That is the whole reason this
 * test can reproduce the defect at all.
 */
function loadServiceWorker({
  fetchImpl,
  openCache,
  matchResult = undefined,
}: {
  fetchImpl: typeof fetch;
  openCache: () => Promise<{ put: (request: Request, response: Response) => Promise<void> }>;
  matchResult?: Response;
}) {
  const source = readFileSync(
    path.join(process.cwd(), "public", "sw.js"),
    "utf8",
  );
  const listeners = new Map<string, (event: unknown) => void>();
  const scope = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      listeners.set(type, handler);
    },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    location: { origin: "https://app.test" },
  };
  const caches = {
    open: vi.fn(openCache),
    match: vi.fn(async () => matchResult),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  };

  new Function("self", "caches", "fetch", source)(scope, caches, fetchImpl);

  const fetchListener = listeners.get("fetch");
  if (!fetchListener) throw new Error("sw.js registered no fetch listener");
  return { fetchListener, caches };
}

function fetchEvent(url: string) {
  let responded: Promise<Response> | null = null;
  return {
    event: {
      request: new Request(url),
      respondWith: (value: Promise<Response>) => {
        responded = value;
      },
    },
    settled: () => {
      if (!responded) throw new Error("sw.js did not call respondWith");
      return responded;
    },
    handled: () => responded !== null,
  };
}

describe("the static-asset cache in public/sw.js", () => {
  /**
   * The regression. `caches.open` resolves on a later tick, so by the time its
   * callback runs the page has already been handed the response and may have
   * read it. Cloning there threw "Response body is already used", the asset was
   * silently never cached, and the error surfaced in the console on every
   * navigation that fetched an uncached chunk.
   */
  it("caches the asset even when the page consumes the body first", async () => {
    const put = vi.fn<(request: Request, response: Response) => Promise<void>>(async () => {});
    let releaseCache = () => {};
    const cacheOpened = new Promise<void>((resolve) => {
      releaseCache = resolve;
    });

    const { fetchListener } = loadServiceWorker({
      fetchImpl: async () => new Response("chunk-bytes", { status: 200 }),
      openCache: async () => {
        await cacheOpened;
        return { put };
      },
    });

    const probe = fetchEvent("https://app.test/_next/static/chunk.js");
    fetchListener(probe.event);
    const response = await probe.settled();

    // The page reads the body before the cache is ready — the exact ordering
    // that made the old code throw.
    expect(await response.text()).toBe("chunk-bytes");

    releaseCache();
    await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));

    const cached = put.mock.calls[0][1];
    expect(cached).not.toBe(response);
    expect(await cached.text()).toBe("chunk-bytes");
  });

  it("returns the network response to the page unchanged", async () => {
    const { fetchListener } = loadServiceWorker({
      fetchImpl: async () => new Response("chunk-bytes", { status: 200 }),
      openCache: async () => ({ put: vi.fn(async () => {}) }),
    });

    const probe = fetchEvent("https://app.test/_next/static/chunk.js");
    fetchListener(probe.event);

    expect((await probe.settled()).status).toBe(200);
  });

  it("serves a cached asset without going to the network", async () => {
    const fetchImpl = vi.fn(async () => new Response("network", { status: 200 }));
    const { fetchListener } = loadServiceWorker({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      openCache: async () => ({ put: vi.fn(async () => {}) }),
      matchResult: new Response("cached", { status: 200 }),
    });

    const probe = fetchEvent("https://app.test/_next/static/chunk.js");
    fetchListener(probe.event);

    expect(await (await probe.settled()).text()).toBe("cached");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not cache a failed response", async () => {
    const put = vi.fn(async () => {});
    const { fetchListener } = loadServiceWorker({
      fetchImpl: async () => new Response("nope", { status: 500 }),
      openCache: async () => ({ put }),
    });

    const probe = fetchEvent("https://app.test/_next/static/chunk.js");
    fetchListener(probe.event);
    await probe.settled();

    expect(put).not.toHaveBeenCalled();
  });

  /**
   * The boundary that keeps this worker out of the product's way. It must never
   * answer for an authenticated page, a Server Action, or another origin —
   * caching any of those would serve one owner's data to the next session.
   */
  it.each([
    ["an application route", "https://app.test/pt-BR/app/inbox"],
    ["a cross-origin asset", "https://cdn.other.test/_next/static/chunk.js"],
  ])("does not answer for %s", (_label, url) => {
    const { fetchListener } = loadServiceWorker({
      fetchImpl: async () => new Response("", { status: 200 }),
      openCache: async () => ({ put: vi.fn(async () => {}) }),
    });

    const probe = fetchEvent(url);
    fetchListener(probe.event);

    expect(probe.handled()).toBe(false);
  });
});

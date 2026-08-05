/**
 * The request-edge auth boundary, and the cache posture it now carries.
 *
 * `proxy.ts` had no unit coverage until Slice D3 gave it a second job. The
 * redirect halves were exercised only through browser journeys; the
 * `Cache-Control` half is a security-relevant guarantee — "browser Back must not
 * restore usable authenticated content" — and a guarantee that lives in one
 * header should not depend on a browser test to notice it disappearing.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { proxy } from "./proxy";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

const ORIGINAL_ENV = { ...process.env };

/**
 * A session as the two verifiers see it.
 *
 * `claims` is what local JWT verification reports and `providerUser` is what a
 * network `getUser()` reports. They are separate on purpose: a token revoked
 * while still unexpired makes them **disagree**, which is the case the redirect
 * loop lived in.
 */
function session(
  subject: string | null,
  options: { readonly providerUser?: string | null } = {},
) {
  const signOutSpy = vi.fn(async () => ({ error: null }));
  // `in` rather than `??`, because the interesting case *is* an explicit null:
  // `null ?? subject` would silently hand the provider the very user the test is
  // asserting it cannot see.
  const providerUser = "providerUser" in options ? options.providerUser ?? null : subject;
  vi.mocked(createServerClient).mockReturnValue({
    auth: {
      getClaims: vi.fn(async () => ({
        data: subject === null ? null : { claims: { sub: subject } },
      })),
      getUser: vi.fn(async () => ({
        data: { user: providerUser === null ? null : { id: providerUser } },
      })),
      signOut: signOutSpy,
    },
  } as never);
  return signOutSpy;
}

function request(path: string) {
  return new NextRequest(new URL(`http://localhost:3000${path}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  };
});

describe("the authenticated boundary", () => {
  it("redirects an unauthenticated in-app request to the localized login", async () => {
    session(null);
    const response = await proxy(request("/pt-BR/app/work"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/pt-BR/auth/login");
  });

  it("keeps the locale of the route it refused", async () => {
    session(null);
    const response = await proxy(request("/en/app/settings"));
    expect(response.headers.get("location")).toContain("/en/auth/login");
  });

  it("sends an authenticated user away from the auth routes", async () => {
    session("user-1");
    const response = await proxy(request("/pt-BR/auth/login"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/pt-BR/app");
  });

  it("lets an authenticated in-app request through", async () => {
    session("user-1");
    const response = await proxy(request("/pt-BR/app"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("a revoked-but-unexpired session cannot become a redirect loop", () => {
  it("clears the stale session and lets login render, instead of bouncing back", async () => {
    // The defect this closes: `getClaims()` verifies the JWT locally and says
    // yes, `requireUser` asks the provider and says no. The page redirected to
    // login, this rule redirected back to the app, and the browser gave up with
    // ERR_TOO_MANY_REDIRECTS — for as long as the access token had left to live.
    const signOut = session("user-1", { providerUser: null });
    const response = await proxy(request("/pt-BR/auth/login"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
    // Cleared, not merely ignored: otherwise the next app request passes local
    // verification again and the loop resumes.
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("still redirects a genuinely signed-in visitor away from the auth routes", async () => {
    const signOut = session("user-1", { providerUser: "user-1" });
    const response = await proxy(request("/pt-BR/auth/login"));

    expect(response.headers.get("location")).toContain("/pt-BR/app");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("asks the provider only on the auth routes, never on an app request", async () => {
    // The hot path stays local-only; confirming every app request over the
    // network is the cost this deliberately does not pay.
    session("user-1");
    const client = vi.mocked(createServerClient).mock.results;
    await proxy(request("/pt-BR/app/work"));

    const instance = client[client.length - 1]?.value as { auth: { getUser: ReturnType<typeof vi.fn> } };
    expect(instance.auth.getUser).not.toHaveBeenCalled();
  });

  it("does not ask the provider when there is no claim to confirm", async () => {
    session(null);
    await proxy(request("/pt-BR/auth/login"));

    const results = vi.mocked(createServerClient).mock.results;
    const instance = results[results.length - 1]?.value as { auth: { getUser: ReturnType<typeof vi.fn> } };
    expect(instance.auth.getUser).not.toHaveBeenCalled();
  });
});

describe("no authenticated response may be stored (UX-26, requirement 4)", () => {
  it("marks an authenticated in-app response no-store", async () => {
    // The mechanism behind "Back does not restore authenticated content": a
    // `no-store` main document is ineligible for the back/forward cache, so the
    // entry is re-fetched and this function refuses it.
    session("user-1");
    const response = await proxy(request("/pt-BR/app/work"));

    const header = response.headers.get("cache-control") ?? "";
    expect(header).toContain("no-store");
    expect(header).toContain("max-age=0");
    expect(header).toContain("must-revalidate");
  });

  it("marks the refusal itself no-store, so a redirect cannot outlive its cause", async () => {
    session(null);
    const response = await proxy(request("/pt-BR/app"));
    expect(response.headers.get("cache-control") ?? "").toContain("no-store");
  });

  it("covers every in-app path, not only the page routes", async () => {
    // An RSC payload for a protected route is the same content in a different
    // envelope, and the matcher sends it through here too.
    session("user-1");
    for (const path of ["/pt-BR/app", "/en/app/work/abc", "/pt-BR/app/settings"]) {
      const response = await proxy(request(path));
      expect(response.headers.get("cache-control") ?? "", path).toContain("no-store");
    }
  });

  it("adds no cache posture to routes outside the authenticated shell", async () => {
    // The marketing page and the auth routes are not this rule's business, and
    // silently making the whole site uncacheable would be a performance change
    // smuggled in behind a security fix.
    session(null);
    for (const path of ["/", "/pt-BR/auth/login", "/pt-BR/auth/register"]) {
      const response = await proxy(request(path));
      expect(response.headers.get("cache-control"), path).toBeNull();
    }
  });
});

/**
 * SH-EXPOSURE-006 — the fail-open, bounded to development.
 *
 * The old behaviour was one branch for both modes, and it was written for the
 * development case: start the server before filling in `.env.local` and the
 * shell still renders. Applied to production it is the entire auth boundary
 * disappearing because an environment variable was missing — the most ordinary
 * deployment mistake there is, and one that produces no error, just an open
 * door.
 */
function unconfigure(mode: "development" | "production") {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // `NODE_ENV` is read-only in the ambient types but writable on the object.
  Object.defineProperty(process.env, "NODE_ENV", { value: mode, configurable: true });
}

describe("without provider configuration, in development", () => {
  it("passes the request through rather than locking the developer out", async () => {
    unconfigure("development");

    const response = await proxy(request("/pt-BR/app"));
    expect(response.status).toBe(200);
    expect(vi.mocked(createServerClient)).not.toHaveBeenCalled();
  });
});

describe("without provider configuration, in production", () => {
  it("refuses app routes instead of serving them unauthenticated", async () => {
    unconfigure("production");

    const response = await proxy(request("/pt-BR/app"));
    expect(response.status).toBe(503);
    expect(vi.mocked(createServerClient)).not.toHaveBeenCalled();
  });

  it("refuses every app route, not only the shell root", async () => {
    unconfigure("production");
    for (const path of ["/pt-BR/app/settings", "/en/app/work/abc", "/en/app/costs"]) {
      expect((await proxy(request(path))).status, path).toBe(503);
    }
  });

  it("still serves login, legal and the marketing page", async () => {
    // A misconfigured deployment that refused everything could not display that
    // it is misconfigured, and the login page cannot work either way — so the
    // refusal is scoped to the surface that would otherwise leak.
    unconfigure("production");
    for (const path of ["/", "/pt-BR/auth/login", "/pt-BR/legal/privacy"]) {
      expect((await proxy(request(path))).status, path).toBe(200);
    }
  });

  it("does not let the refusal be cached", async () => {
    // A cached 503 would outlive the misconfiguration that produced it.
    unconfigure("production");
    const response = await proxy(request("/pt-BR/app"));
    expect(response.headers.get("cache-control") ?? "").toContain("no-store");
  });

  it("names no environment variable in what it returns", async () => {
    unconfigure("production");
    const body = await (await proxy(request("/pt-BR/app"))).text();
    expect(body).not.toContain("SUPABASE");
    expect(body).not.toContain("NEXT_PUBLIC");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SH-THROTTLE-002/003/007 and ADR-080 Decision 3 — the application half of the
 * throttle, exercised rather than described.
 *
 * `next/headers` is mocked because `clientIpFromRequest` reads the proxy header
 * and there is no request here. Everything else is real: the real HMAC from the
 * crypto core, the real canonicalization, and a Supabase client stubbed only at
 * `.rpc()`, so the argument shape this module sends is the thing under test.
 */

// The suite runs under jsdom, where `server-only` resolves to its client build
// and throws on import. The idiom `ip.test.ts` established.
vi.mock("server-only", () => ({}));

const forwardedFor = { value: null as string | null };

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "x-forwarded-for" ? forwardedFor.value : null),
  }),
}));

const { admitAuthEvent, finalizeAuthEvent, hashAuthIdentifier, hashAuthIp } = await import(
  "./throttle"
);
const { hashClientIp } = await import("@/lib/byok/ip");
const { AUTH_EVENT_CEILINGS } = await import("./throttle-policy");

/** A pepper for the tests. Never a real one; the value is irrelevant, its fixity is not. */
const PEPPER = new Uint8Array(32).fill(7);

type RpcCall = { name: string; args: Record<string, unknown> };

function fakeSupabase(reply: (call: RpcCall) => { data?: unknown; error?: unknown }) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        const { data = null, error = null } = reply({ name, args });
        return Promise.resolve({ data, error });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

beforeEach(() => {
  forwardedFor.value = null;
  process.env.BYOK_RATE_LIMIT_PEPPER = Buffer.from(PEPPER).toString("base64");
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ADR-080 Decision 3: the auth hashes cannot be joined to BYOK's", () => {
  it("hashes the same address to a different value than the BYOK ledger does", async () => {
    // Without the domain tag both features would write the SAME digest for the
    // same address under the same pepper, and anyone reading both tables could
    // correlate a NAMED BYOK user with an ANONYMOUS auth attempt -- the join the
    // pepper exists to prevent, reintroduced by reusing it.
    const address = "203.0.113.7";
    const auth = await hashAuthIp(address, PEPPER);
    const byok = await hashClientIp(address, PEPPER);

    expect(auth).not.toBe(byok);
    expect(auth).toMatch(/^[0-9a-f]{64}$/);
  });

  it("separates the identifier and address domains from each other too", async () => {
    // A pathological input could otherwise collide across the two tags.
    const value = "203.0.113.7";
    expect(await hashAuthIdentifier(value, PEPPER)).not.toBe(await hashAuthIp(value, PEPPER));
  });

  it("produces the shape the CHECK accepts, and never the input", async () => {
    const digest = await hashAuthIdentifier("Someone@Example.COM", PEPPER);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain("example");
    expect(digest).not.toContain("@");
  });

  it("folds one mailbox into one bucket, so the ceiling counts something", async () => {
    const canonical = await hashAuthIdentifier("user@example.com", PEPPER);
    expect(await hashAuthIdentifier("  User@Example.COM ", PEPPER)).toBe(canonical);
  });
});

describe("SH-THROTTLE-003: what the claim actually sends", () => {
  it("sends the kind's ceilings and window, never a default", async () => {
    const { client, calls } = fakeSupabase(() => ({ data: "att-1" }));
    forwardedFor.value = "203.0.113.7";

    const result = await admitAuthEvent(client, "recovery", "user@example.com");

    expect(result).toEqual({ admitted: true, attemptId: "att-1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("claim_auth_event_slot");
    expect(calls[0].args.p_kind).toBe("recovery");
    expect(calls[0].args.p_identifier_ceiling).toBe(AUTH_EVENT_CEILINGS.recovery.identifier);
    expect(calls[0].args.p_ip_ceiling).toBe(AUTH_EVENT_CEILINGS.recovery.ip);
    expect(calls[0].args.p_window).toBe(`${AUTH_EVENT_CEILINGS.recovery.windowSeconds} seconds`);
  });

  it("SH-THROTTLE-007: sends hashes, never the address or the raw IP", async () => {
    const { client, calls } = fakeSupabase(() => ({ data: "att-1" }));
    forwardedFor.value = "203.0.113.7";

    await admitAuthEvent(client, "signup", "victim@example.test");

    const serialized = JSON.stringify(calls[0].args);
    expect(serialized).not.toContain("victim@example.test");
    expect(serialized).not.toContain("203.0.113.7");
    expect(calls[0].args.p_identifier_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0].args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("takes the FIRST forwarded hop, not the nearest proxy", async () => {
    // The last entry is the proxy closest to us. Throttling on it would put
    // every caller on earth in one bucket.
    const { client, calls } = fakeSupabase(() => ({ data: "att-1" }));
    forwardedFor.value = "203.0.113.7, 198.51.100.1, 10.0.0.1";
    await admitAuthEvent(client, "signup", null);
    const viaFirst = await hashAuthIp("203.0.113.7", PEPPER);
    expect(calls[0].args.p_ip_hash).toBe(viaFirst);
  });

  it("sends a null address rather than inventing one", async () => {
    const { client, calls } = fakeSupabase(() => ({ data: "att-1" }));
    forwardedFor.value = null;
    await admitAuthEvent(client, "signup", null);
    // An invented value is a bucket an attacker can aim for; null is a real
    // state the migration documents and the column allows.
    expect(calls[0].args.p_ip_hash).toBeNull();
    expect(calls[0].args.p_identifier_hash).toBeNull();
  });
});

describe("SH-THROTTLE-003: an unreachable throttle refuses", () => {
  it("reports a ceiling refusal as throttled, by the declared detail", async () => {
    const { client } = fakeSupabase(() => ({
      error: { code: "P0001", message: "Auth event ceiling reached", details: "AUTH_EVENT_THROTTLED" },
    }));
    expect(await admitAuthEvent(client, "recovery", "user@example.com")).toEqual({
      admitted: false,
      reason: "throttled",
    });
  });

  it("does NOT treat an arbitrary provider error as a ceiling", async () => {
    // The dangerous confusion runs the other way too: reporting a fault as
    // "throttled" would tell a user to wait for a limit that does not exist.
    const { client } = fakeSupabase(() => ({
      error: { code: "42883", message: "function does not exist" },
    }));
    expect(await admitAuthEvent(client, "recovery", "user@example.com")).toEqual({
      admitted: false,
      reason: "unavailable",
    });
  });

  it("fails CLOSED when the RPC is missing entirely", async () => {
    // This is the case that decides whether the control is real. Proceeding
    // here would mean an attacker who can induce errors switches the throttle
    // off, and nothing reports it.
    const { client } = fakeSupabase(() => ({
      error: { code: "PGRST202", message: "Could not find the function" },
    }));
    const result = await admitAuthEvent(client, "signup", "user@example.com");
    expect(result.admitted).toBe(false);
  });

  it("fails closed when the pepper is absent", async () => {
    delete process.env.BYOK_RATE_LIMIT_PEPPER;
    const { client, calls } = fakeSupabase(() => ({ data: "att-1" }));
    const result = await admitAuthEvent(client, "signup", "user@example.com");
    expect(result).toEqual({ admitted: false, reason: "unavailable" });
    // And it never reached the provider-facing RPC at all.
    expect(calls).toHaveLength(0);
  });

  it("fails closed when the claim returns no attempt id", async () => {
    const { client } = fakeSupabase(() => ({ data: null }));
    expect(await admitAuthEvent(client, "signup", "user@example.com")).toEqual({
      admitted: false,
      reason: "unavailable",
    });
  });

  it("never forwards the provider's message to the caller", async () => {
    const { client } = fakeSupabase(() => ({
      error: { code: "42501", message: "permission denied for function claim_auth_event_slot" },
    }));
    const result = await admitAuthEvent(client, "signup", "user@example.com");
    expect(JSON.stringify(result)).not.toMatch(/permission|function|claim_auth_event_slot/);
  });
});

describe("finalize records the outcome and never blocks the caller", () => {
  it("sends the attempt id and outcome", async () => {
    const { client, calls } = fakeSupabase(() => ({}));
    await finalizeAuthEvent(client, "att-9", "succeeded");
    expect(calls[0]).toEqual({
      name: "finalize_auth_event_attempt",
      args: { p_attempt_id: "att-9", p_outcome: "succeeded" },
    });
  });

  it("swallows a finalize failure, because the slot already counts", async () => {
    // The row stays at its provisional `unknown`, which still counts against
    // the ceiling. The failure direction is toward MORE throttling, so there is
    // nothing for the caller to do about it.
    const { client } = fakeSupabase(() => ({ error: { code: "XX000", message: "boom" } }));
    await expect(finalizeAuthEvent(client, "att-9", "refused")).resolves.toBeUndefined();
  });
});

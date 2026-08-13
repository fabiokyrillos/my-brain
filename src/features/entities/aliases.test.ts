import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ALIAS_ENTITY_TYPES, aliasIsInForce, escapeLikePattern, loadAliasesForEntity, resolveAliasMatches } =
  await import("./aliases");

/**
 * `2N-IDENTITY-004`, `2N-IDENTITY-009` — the first reader's proofs.
 *
 * Three properties carry the requirement, and each is asserted in the way it can
 * actually fail: the **validity window** as behaviour, the **owner scope** as the
 * absence of any parameter or client that could widen it, and the **query shape**
 * as what was really sent — because a window enforced only after the rows arrive
 * is a window that already loaded them.
 */

type Result = { data: unknown; error: unknown };

/** Records the whole PostgREST chain so the query itself can be asserted. */
function aliasStub(result: Result) {
  const calls: { method: string; args: unknown[] }[] = [];
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "or", "ilike", "order"]) {
    stub[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return stub;
    });
  }
  // Both terminals resolve, so one stub serves the `order`-ended and the
  // `limit`-ended chain without the test having to know which ran.
  stub.limit = vi.fn((...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve(result);
  });
  stub.then = (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve);
  return { stub, calls };
}

function supabase(stub: Record<string, unknown>) {
  return { from: vi.fn(() => stub) } as never;
}

const AT = new Date("2026-08-13T12:00:00.000Z");

const row = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "alias-1",
  alias: "Bea",
  entity_type: "person",
  entity_id: "person-1",
  valid_from: null,
  valid_to: null,
  ...overrides,
});

describe("2N-IDENTITY-009: the validity window", () => {
  const alias = (validFrom: string | null, validTo: string | null) => ({
    id: "a",
    alias: "Bea",
    entityType: "person",
    entityId: "person-1",
    validFrom,
    validTo,
  });

  it("is in force when both endpoints are open", () => {
    expect(aliasIsInForce(alias(null, null), AT)).toBe(true);
  });

  it("is not yet in force before valid_from", () => {
    expect(aliasIsInForce(alias("2026-08-14T00:00:00.000Z", null), AT)).toBe(false);
  });

  it("is in force from valid_from onward", () => {
    expect(aliasIsInForce(alias("2026-08-12T00:00:00.000Z", null), AT)).toBe(true);
  });

  it("is no longer in force after valid_to", () => {
    expect(aliasIsInForce(alias(null, "2026-08-12T00:00:00.000Z"), AT)).toBe(false);
  });

  it("is in force up to and including valid_to", () => {
    // Inclusive on both ends, mirroring `resolve_owned_entity_exact` exactly.
    // A half-open interval would be cleaner and would disagree with the database
    // at precisely one instant, which is the divergence this phase removes.
    expect(aliasIsInForce(alias(null, AT.toISOString()), AT)).toBe(true);
    expect(aliasIsInForce(alias(AT.toISOString(), null), AT)).toBe(true);
  });

  it("is in force inside a closed window and outside it on both sides", () => {
    const bounded = alias("2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z");
    expect(aliasIsInForce(bounded, AT)).toBe(true);
    expect(aliasIsInForce(bounded, new Date("2026-07-31T23:59:59.000Z"))).toBe(false);
    expect(aliasIsInForce(bounded, new Date("2026-09-01T00:00:00.000Z"))).toBe(false);
  });
});

describe("2N-IDENTITY-004: loadAliasesForEntity", () => {
  it("filters the window in the query, not only after the rows arrive", async () => {
    const { stub, calls } = aliasStub({ data: [row()], error: null });
    await loadAliasesForEntity(supabase(stub), "person", "person-1", AT);

    const ors = calls.filter((call) => call.method === "or").map((call) => String(call.args[0]));
    expect(ors).toContain(`valid_from.is.null,valid_from.lte.${AT.toISOString()}`);
    expect(ors).toContain(`valid_to.is.null,valid_to.gte.${AT.toISOString()}`);
  });

  it("scopes to the entity it was asked about", async () => {
    const { stub, calls } = aliasStub({ data: [row()], error: null });
    await loadAliasesForEntity(supabase(stub), "person", "person-1", AT);

    const eqs = calls.filter((call) => call.method === "eq").map((call) => call.args);
    expect(eqs).toContainEqual(["entity_type", "person"]);
    expect(eqs).toContainEqual(["entity_id", "person-1"]);
  });

  it("drops a row the database returned that is out of force anyway", async () => {
    // Belt and braces on purpose: the filter is the bound, this is the proof.
    // If the `or` chain were ever mis-built, the rows would still be rejected
    // here rather than rendered.
    const expired = row({ id: "alias-2", valid_to: "2026-01-01T00:00:00.000Z" });
    const { stub } = aliasStub({ data: [row(), expired], error: null });
    const aliases = await loadAliasesForEntity(supabase(stub), "person", "person-1", AT);
    expect(aliases.map((alias) => alias.id)).toEqual(["alias-1"]);
  });

  it("degrades to an empty list when the read fails", async () => {
    const { stub } = aliasStub({ data: null, error: { message: "boom" } });
    expect(await loadAliasesForEntity(supabase(stub), "person", "person-1", AT)).toEqual([]);
  });

  it("maps the row to the product's own shape", async () => {
    const { stub } = aliasStub({ data: [row()], error: null });
    const [alias] = await loadAliasesForEntity(supabase(stub), "person", "person-1", AT);
    expect(alias).toEqual({
      id: "alias-1",
      alias: "Bea",
      entityType: "person",
      entityId: "person-1",
      validFrom: null,
      validTo: null,
    });
  });
});

describe("2N-IDENTITY-004: resolveAliasMatches", () => {
  it("returns the entity ids a nickname names", async () => {
    const { stub } = aliasStub({ data: [row(), row({ id: "alias-2", entity_id: "person-2" })], error: null });
    const ids = await resolveAliasMatches(supabase(stub), "person", "Bea", AT);
    expect(ids).toEqual(["person-1", "person-2"]);
  });

  it("de-duplicates two aliases pointing at one person", async () => {
    const { stub } = aliasStub({ data: [row(), row({ id: "alias-2", alias: "Bia" })], error: null });
    expect(await resolveAliasMatches(supabase(stub), "person", "B", AT)).toEqual(["person-1"]);
  });

  it("never queries for an empty needle", async () => {
    const { stub } = aliasStub({ data: [row()], error: null });
    const client = supabase(stub);
    expect(await resolveAliasMatches(client, "person", "   ", AT)).toEqual([]);
    expect((client as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("applies the same window it applies everywhere else", async () => {
    const { stub, calls } = aliasStub({ data: [row()], error: null });
    await resolveAliasMatches(supabase(stub), "person", "Bea", AT);
    const ors = calls.filter((call) => call.method === "or").map((call) => String(call.args[0]));
    expect(ors).toContain(`valid_from.is.null,valid_from.lte.${AT.toISOString()}`);
    expect(ors).toContain(`valid_to.is.null,valid_to.gte.${AT.toISOString()}`);
  });

  it("is bounded", async () => {
    const { stub, calls } = aliasStub({ data: [row()], error: null });
    await resolveAliasMatches(supabase(stub), "person", "Bea", AT);
    const limits = calls.filter((call) => call.method === "limit");
    expect(limits).toHaveLength(1);
    expect(Number(limits[0].args[0])).toBeGreaterThan(0);
  });

  it("degrades to no matches when the read fails, rather than to every person", async () => {
    // The direction matters. A failed alias read that returned "no ids" narrows
    // nothing and shows the ordinary result set; one that threw or returned a
    // wildcard would change what search means.
    const { stub } = aliasStub({ data: null, error: { message: "boom" } });
    expect(await resolveAliasMatches(supabase(stub), "person", "Bea", AT)).toEqual([]);
  });

  it("escapes wildcards the owner typed rather than executing them", async () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("plain")).toBe("plain");
  });
});

describe("2N-SEC-002: the reader cannot widen a scope", () => {
  it("takes no user id on any exported function", () => {
    // Ownership is RLS-and-query only. A `user_id` parameter is the shape that
    // would let a caller ask about somebody else, and the absence is the proof.
    expect(loadAliasesForEntity.length).toBe(4);
    expect(resolveAliasMatches.length).toBe(4);
  });

  it("admits only the entity types the CHECK constraint admits", () => {
    expect([...ALIAS_ENTITY_TYPES]).toEqual(["context", "organization", "project", "person"]);
  });
});

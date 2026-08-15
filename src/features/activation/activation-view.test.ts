import { describe, expect, it, vi } from "vitest";

import { loadActivationProgress } from "./activation-view";

vi.mock("server-only", () => ({}));

type Rows = { data: unknown; error: unknown };

/** A `.select().eq().limit()` chain — the existence reads. */
function listStub(result: Rows) {
  const stub: Record<string, unknown> = {};
  stub.select = vi.fn(() => stub);
  stub.eq = vi.fn(() => stub);
  stub.limit = vi.fn(async () => result);
  return stub;
}

/** A `.select().eq().maybeSingle()` chain — the single-row reads. */
function singleStub(result: Rows) {
  const stub: Record<string, unknown> = {};
  stub.select = vi.fn(() => stub);
  stub.eq = vi.fn(() => stub);
  stub.maybeSingle = vi.fn(async () => result);
  return stub;
}

const SET_PROFILE = { locale: "pt-BR", timezone: "America/Sao_Paulo" };

function client(overrides: Record<string, Record<string, unknown>> = {}) {
  const stubs: Record<string, Record<string, unknown>> = {
    profiles: singleStub({ data: SET_PROFILE, error: null }),
    user_ai_credentials: singleStub({ data: { status: "active" }, error: null }),
    entries: listStub({ data: [{ user_id: "user-1" }], error: null }),
    entry_task_candidate_resolutions: listStub({ data: [{ user_id: "user-1" }], error: null }),
    tasks: listStub({ data: [{ user_id: "user-1" }], error: null }),
    ...overrides,
  };
  const from = vi.fn((table: string) => {
    const stub = stubs[table];
    if (!stub) throw new Error(`unexpected table: ${table}`);
    return stub;
  });
  return { supabase: { from } as never, stubs, from };
}

describe("loadActivationProgress: owner scope and derivation", () => {
  it("scopes every read to the requesting user", async () => {
    const { supabase, stubs } = client();
    await loadActivationProgress(supabase, "user-1");
    for (const [table, stub] of Object.entries(stubs)) {
      expect(stub.eq, `${table} is not owner-scoped`).toHaveBeenCalledWith("user_id", "user-1");
    }
  });

  it("reads every declared fact and nothing else", async () => {
    const { supabase, from } = client();
    await loadActivationProgress(supabase, "user-1");
    expect(new Set(from.mock.calls.map(([table]) => table))).toEqual(
      new Set(["profiles", "user_ai_credentials", "entries", "entry_task_candidate_resolutions", "tasks"]),
    );
  });

  it("reports a fully activated account as complete", async () => {
    const { supabase } = client();
    const progress = await loadActivationProgress(supabase, "user-1");
    expect(progress.complete).toBe("yes");
    expect(progress.satisfiedCount).toBe(5);
    expect(progress.unreadableCount).toBe(0);
  });

  it("reports an empty account as incomplete rather than unreadable", async () => {
    const { supabase } = client({
      profiles: singleStub({ data: null, error: null }),
      user_ai_credentials: singleStub({ data: null, error: null }),
      entries: listStub({ data: [], error: null }),
      entry_task_candidate_resolutions: listStub({ data: [], error: null }),
      tasks: listStub({ data: [], error: null }),
    });
    const progress = await loadActivationProgress(supabase, "user-1");
    expect(progress.complete).toBe("no");
    expect(progress.satisfiedCount).toBe(0);
    // An absent row is an answer. Only a failed read is unreadable.
    expect(progress.unreadableCount).toBe(0);
  });
});

describe("2O-ACTIVATION-003: a failed read is unreadable, and it is contained", () => {
  it("marks only the failed fact unreadable and answers the rest", async () => {
    const { supabase } = client({
      entries: listStub({ data: null, error: { code: "57014" } }),
    });
    const progress = await loadActivationProgress(supabase, "user-1");
    const byKey = Object.fromEntries(progress.facts.map((fact) => [fact.key, fact.state]));
    expect(byKey.entry_captured).toBe("unreadable");
    expect(byKey.locale_and_timezone).toBe("satisfied");
    expect(byKey.task_confirmed).toBe("satisfied");
    expect(progress.unreadableCount).toBe(1);
  });

  it("does not let one failed read make the others unreadable", async () => {
    // The failure mode a single `Promise.all` over unwrapped reads would have:
    // one rejection and the whole list is lost.
    const { supabase } = client({
      user_ai_credentials: singleStub({ data: null, error: { code: "42501" } }),
    });
    const progress = await loadActivationProgress(supabase, "user-1");
    expect(progress.unreadableCount).toBe(1);
    expect(progress.satisfiedCount).toBe(4);
  });

  it("treats a thrown read as unreadable rather than propagating it", async () => {
    const throwing: Record<string, unknown> = {};
    throwing.select = vi.fn(() => throwing);
    throwing.eq = vi.fn(() => throwing);
    throwing.limit = vi.fn(async () => {
      throw new Error("connection reset");
    });
    const { supabase } = client({ tasks: throwing });
    const progress = await loadActivationProgress(supabase, "user-1");
    expect(progress.facts.find((fact) => fact.key === "task_confirmed")?.state).toBe("unreadable");
    expect(progress.complete).toBe("unknown");
  });

  it("never reports a failed read as an unsatisfied fact", async () => {
    const { supabase } = client({
      entries: listStub({ data: null, error: { code: "57014" } }),
    });
    const progress = await loadActivationProgress(supabase, "user-1");
    expect(progress.facts.find((fact) => fact.key === "entry_captured")?.state).not.toBe("unsatisfied");
  });
});

describe("the credential fact follows BYOK's own gate", () => {
  it.each(["invalid", "removed"])("does not call %s configured", async (status) => {
    // `BYOK-LIFECYCLE-001` gates AI identically for `invalid` and `removed`, so
    // an activation list that called either "done" would send the owner past the
    // one step that unblocks the product.
    const { supabase } = client({
      user_ai_credentials: singleStub({ data: { status }, error: null }),
    });
    const progress = await loadActivationProgress(supabase, "user-1");
    expect(progress.facts.find((fact) => fact.key === "ai_credential")?.state).toBe("unsatisfied");
  });
});

describe("the locale and timezone fact needs both halves", () => {
  it.each([
    ["locale", { locale: null, timezone: "America/Sao_Paulo" }],
    ["timezone", { locale: "pt-BR", timezone: null }],
  ])("is unsatisfied when %s is unset", async (_half, row) => {
    const { supabase } = client({ profiles: singleStub({ data: row, error: null }) });
    const progress = await loadActivationProgress(supabase, "user-1");
    expect(progress.facts.find((fact) => fact.key === "locale_and_timezone")?.state).toBe("unsatisfied");
  });
});

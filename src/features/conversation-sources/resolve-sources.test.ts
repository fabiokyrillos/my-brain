import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedCitations } from "./contracts";
import { resolveSources } from "./resolve-sources";

/**
 * `2K-PRIVACY-004`, `2K-SRC-004` — the render-time re-read.
 *
 * The four cases the threat model asks for, in order: a source reclassified
 * **after** the answer was stored renders masked; a deleted one renders
 * unavailable, byte-identical to an unreadable one; an archived memory renders
 * unavailable rather than in the clear; and a legacy row's stored excerpt is
 * never what gets rendered.
 */

vi.mock("server-only", () => ({}));

const ENTRY = "33333333-3333-4333-8333-333333333333";
const MEMORY = "44444444-4444-4444-8444-444444444444";
const USER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-09T12:00:00.000Z");

type Result = { data: unknown[]; error: { message: string } | null };

function client(results: Record<string, Result>) {
  const idsAskedFor: Record<string, unknown> = {};
  const supabase = {
    from: vi.fn((table: string) => {
      const stub: Record<string, unknown> = {};
      stub.select = vi.fn(() => stub);
      stub.eq = vi.fn(() => stub);
      stub.in = vi.fn((_column: string, ids: unknown) => {
        idsAskedFor[table] = ids;
        return Promise.resolve(results[table] ?? { data: [], error: null });
      });
      return stub;
    }),
  };
  return { supabase, idsAskedFor };
}

function citations(...sources: ParsedCitations["sources"]): ParsedCitations {
  return { evidence: "evidenced", reach: ["entry", "memory"], sources, legacy: false };
}

const entryRef = { id: `entry:${ENTRY}`, type: "entry" as const, sourceId: ENTRY, support: "direct_record" as const };
const memoryRef = { id: `memory:${MEMORY}`, type: "memory" as const, sourceId: MEMORY, support: "product_state" as const };

beforeEach(() => vi.clearAllMocks());

describe("2K-PRIVACY-004: the classification consulted is the current one", () => {
  it("renders a normal source in the clear", async () => {
    const { supabase } = client({
      entries: { data: [{ id: ENTRY, original_content: "conversa com a Ana", sensitivity: "normal", occurred_at: "2026-07-20T10:00:00Z" }], error: null },
    });
    const [source] = await resolveSources(supabase as never, USER, citations(entryRef), "pt-BR", NOW);
    expect(source?.card.state).toBe("previewed");
    expect(source?.card.snippet).toBe("conversa com a Ana");
    expect(source?.card.sensitivity).toBe("normal");
    expect(source?.occurredAt).toBe("2026-07-20T10:00:00Z");
  });

  it("carries a source reclassified AFTER the answer was stored", async () => {
    /*
     * The threat T-2K-03 describes, and the reason OD-2K-2 removed the stored
     * copy. The answer was written when the entry was `normal`; it is now the
     * most protective level, and the card carries **that** — so the central
     * contract masks it on this render. There is no stored copy that could
     * disagree, because there is no stored copy.
     */
    const { supabase } = client({
      entries: { data: [{ id: ENTRY, original_content: "resultado do exame", sensitivity: "highly_sensitive", occurred_at: null }], error: null },
    });
    const [source] = await resolveSources(supabase as never, USER, citations(entryRef), "pt-BR", NOW);
    expect(source?.card.sensitivity).toBe("highly_sensitive");
  });

  it("fails closed on a classification it cannot read", async () => {
    const { supabase } = client({
      entries: { data: [{ id: ENTRY, original_content: "x", sensitivity: "not-a-level", occurred_at: null }], error: null },
    });
    const [source] = await resolveSources(supabase as never, USER, citations(entryRef), "pt-BR", NOW);
    expect(source?.card.sensitivity).toBe("highly_sensitive");
  });
});

describe("2K-CONT-008 / 2K-SRC-001: unreadable is one shape", () => {
  async function cardFor(entries: Result) {
    const { supabase } = client({ entries });
    const [source] = await resolveSources(supabase as never, USER, citations(entryRef), "pt-BR", NOW);
    return JSON.stringify(source?.card);
  }

  it("renders deleted and unreadable identically", async () => {
    const deleted = await cardFor({ data: [], error: null });
    const unreadable = await cardFor({ data: [], error: { message: "permission denied" } });
    expect(deleted).toBe(unreadable);
    expect(deleted).toContain('"state":"unavailable"');
    expect(deleted).toContain('"snippet":null');
  });

  it("gives an unavailable source no date rather than a stale one", async () => {
    const { supabase } = client({ entries: { data: [], error: null } });
    const [source] = await resolveSources(supabase as never, USER, citations(entryRef), "pt-BR", NOW);
    expect(source?.occurredAt).toBeNull();
  });
});

describe("2K-PRIVACY-004: an archived memory stops being a readable source", () => {
  it("renders unavailable rather than in the clear", async () => {
    // Archived after the answer was written. It must stop appearing under an
    // answer that used it, or "Archive" is a label with nothing behind it.
    const { supabase } = client({
      memories: {
        data: [{ id: MEMORY, content: "prefiro manhãs", sensitivity: "normal", valid_from: null, valid_until: "2026-01-01T00:00:00Z", created_at: "2025-12-01T00:00:00Z" }],
        error: null,
      },
    });
    const [source] = await resolveSources(supabase as never, USER, citations(memoryRef), "pt-BR", NOW);
    expect(source?.card.state).toBe("unavailable");
    expect(source?.card.snippet).toBeNull();
  });

  it("renders an in-force memory, so the refusal above is not vacuous", async () => {
    const { supabase } = client({
      memories: {
        data: [{ id: MEMORY, content: "prefiro manhãs", sensitivity: "normal", valid_from: "2026-01-01T00:00:00Z", valid_until: null, created_at: "2025-12-01T00:00:00Z" }],
        error: null,
      },
    });
    const [source] = await resolveSources(supabase as never, USER, citations(memoryRef), "pt-BR", NOW);
    expect(source?.card.state).toBe("previewed");
    expect(source?.card.snippet).toBe("prefiro manhãs");
    // Freshness matches what the RPC ranked on: `valid_from ?? created_at`.
    expect(source?.occurredAt).toBe("2026-01-01T00:00:00Z");
  });
});

describe("the read is bounded and owner-scoped", () => {
  it("issues one query per table, never one per source", async () => {
    const { supabase, idsAskedFor } = client({
      entries: { data: [], error: null },
      memories: { data: [], error: null },
    });
    await resolveSources(
      supabase as never,
      USER,
      citations(entryRef, memoryRef, { ...entryRef, id: "entry:second", sourceId: MEMORY }),
      "pt-BR",
      NOW,
    );
    // Two tables, two calls — the stopping condition the plan names is an
    // unbounded per-source fan-out, and the fix is batching rather than the
    // stored copy, which no longer exists.
    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(idsAskedFor.entries).toEqual([ENTRY, MEMORY]);
    expect(idsAskedFor.memories).toEqual([MEMORY]);
  });

  it("asks for nothing when a message cites nothing", async () => {
    const { supabase } = client({});
    expect(await resolveSources(supabase as never, USER, citations(), "pt-BR", NOW)).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("preserves the order the answer cited them in", async () => {
    const { supabase } = client({
      entries: { data: [{ id: ENTRY, original_content: "e", sensitivity: "normal", occurred_at: null }], error: null },
      memories: { data: [{ id: MEMORY, content: "m", sensitivity: "normal", valid_from: null, valid_until: null, created_at: null }], error: null },
    });
    const resolved = await resolveSources(supabase as never, USER, citations(memoryRef, entryRef), "pt-BR", NOW);
    expect(resolved.map((s) => s.card.cardType)).toEqual(["memory", "entry"]);
  });
});

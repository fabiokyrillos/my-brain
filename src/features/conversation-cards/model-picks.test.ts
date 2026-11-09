/**
 * Life Brain B.8 (ADR-163) — the model's pick of today's suggestions.
 *
 * What these pin: no call when there is nothing to choose or today already has
 * an answer; no call and no write without a key; the ledger written before the
 * cache; only `{category, id}` pairs reaching the writer, mapped from the
 * provider's positions; and a failed call caching an empty answer, so a
 * provider that is down is asked once a day rather than once a visit.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const gate = vi.fn();
const pickSuggestions = vi.fn();
const getAIProvider = vi.fn(() => ({ pickSuggestions }));
const recordAIUsage = vi.fn();

vi.mock("@/lib/byok/gate", () => ({ openAiGate: (...args: unknown[]) => gate(...args) }));
vi.mock("@/lib/ai", () => ({ getAIProvider: (...args: unknown[]) => getAIProvider(...(args as [])) }));
vi.mock("@/lib/ai/usage", () => ({ recordAIUsage: (...args: unknown[]) => recordAIUsage(...args) }));

import { pickTodaysSuggestions, readTodaysPicks } from "./model-picks";
import type { ConversationSuggestion } from "./suggestions";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const FIVE: readonly ConversationSuggestion[] = [
  { category: "overdue_task", id: ID(1), name: "Renovar passaporte" },
  { category: "due_today", id: ID(2), name: "Mercado" },
  { category: "person", id: ID(3), name: "Marina" },
  { category: "person", id: ID(4), name: "Ana" },
  { category: "project", id: ID(5), name: "Aurora" },
];

type CacheRow = { local_day: string; picks: unknown } | null;

function fakeSupabase(cache: CacheRow, order: string[]) {
  const rpc = vi.fn(async (name: string, args: unknown) => {
    order.push(`rpc:${name}`);
    return { data: null, error: null, args };
  });
  const from = vi.fn((table: string) => {
    if (table === "conversation_suggestion_picks") {
      return { select: () => ({ maybeSingle: async () => ({ data: cache, error: null }) }) };
    }
    if (table === "agent_preferences") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { background_model: "gpt-5-mini" }, error: null }) }) }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { client: { from, rpc } as never, rpc };
}

function run(supabase: never, candidates: readonly ConversationSuggestion[] = FIVE) {
  return pickTodaysSuggestions({ supabase, userId: "u1", locale: "pt-BR", localDay: "2026-11-09", candidates });
}

beforeEach(() => {
  gate.mockReset();
  pickSuggestions.mockReset();
  getAIProvider.mockClear();
  recordAIUsage.mockReset();
  gate.mockResolvedValue({ ok: true, credential: { secret: "secret" } });
});

describe("pickTodaysSuggestions", () => {
  it("does not call when three or fewer candidates leave nothing to choose", async () => {
    const { client, rpc } = fakeSupabase(null, []);
    expect(await run(client, FIVE.slice(0, 3))).toBe("nothing_to_choose");
    expect(gate).not.toHaveBeenCalled();
    expect(pickSuggestions).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not call when today already has an answer, even an empty one", async () => {
    const { client } = fakeSupabase({ local_day: "2026-11-09", picks: [] }, []);
    expect(await run(client)).toBe("already_picked");
    expect(pickSuggestions).not.toHaveBeenCalled();
  });

  it("asks again when the cached answer is from another day", async () => {
    pickSuggestions.mockResolvedValue({ indexes: [], model: "gpt-5-mini", inputTokens: 1, outputTokens: 1 });
    const { client } = fakeSupabase({ local_day: "2026-11-08", picks: [] }, []);
    expect(await run(client)).toBe("picked");
  });

  it("neither calls nor writes without a key", async () => {
    gate.mockResolvedValue({ ok: false, reason: "credential_required" });
    const { client, rpc } = fakeSupabase(null, []);
    expect(await run(client)).toBe("no_key");
    expect(pickSuggestions).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends kinds and labels only, routes through the background model, and writes the ledger first", async () => {
    const order: string[] = [];
    recordAIUsage.mockImplementation(async () => {
      order.push("ledger");
      return true;
    });
    pickSuggestions.mockResolvedValue({ indexes: [4, 0], model: "gpt-5-mini", inputTokens: 10, outputTokens: 2 });
    const { client, rpc } = fakeSupabase(null, order);

    expect(await run(client)).toBe("picked");

    expect(getAIProvider).toHaveBeenCalledWith({ credential: "secret", model: "gpt-5-mini" });
    expect(pickSuggestions).toHaveBeenCalledWith({
      locale: "pt-BR",
      localDay: "2026-11-09",
      candidates: FIVE.map((candidate) => ({ kind: candidate.category, label: candidate.name })),
    });
    expect(recordAIUsage.mock.calls[0]![1]).toMatchObject({ operation: "background", userId: "u1", sourceType: null });
    expect(order).toEqual(["ledger", "rpc:record_conversation_suggestion_picks"]);
    expect(rpc.mock.calls[0]![1]).toEqual({
      p_local_day: "2026-11-09",
      p_picks: [
        { category: "project", id: ID(5) },
        { category: "overdue_task", id: ID(1) },
      ],
      p_model: "gpt-5-mini",
      p_prompt_version: expect.any(String),
    });
  });

  it("caches an empty answer when the call fails, and reports nothing to the owner", async () => {
    pickSuggestions.mockRejectedValue(new Error("429 rate limited"));
    const { client, rpc } = fakeSupabase(null, []);
    expect(await run(client)).toBe("failed");
    expect(recordAIUsage).not.toHaveBeenCalled();
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_picks: [] });
  });
});

describe("readTodaysPicks", () => {
  it("returns null when there is no row, or the row is another day's", async () => {
    expect(await readTodaysPicks(fakeSupabase(null, []).client, "2026-11-09")).toBeNull();
    expect(
      await readTodaysPicks(fakeSupabase({ local_day: "2026-11-08", picks: [] }, []).client, "2026-11-09"),
    ).toBeNull();
  });

  it("returns today's pairs", async () => {
    const picks = [{ category: "person", id: ID(3) }];
    expect(await readTodaysPicks(fakeSupabase({ local_day: "2026-11-09", picks }, []).client, "2026-11-09"))
      .toEqual(picks);
  });

  it("keeps only the pair from a tampered row, and refuses an unknown category", async () => {
    const tampered = [{ category: "person", id: ID(3), sentence: "Fale com Marina" }];
    expect(
      await readTodaysPicks(fakeSupabase({ local_day: "2026-11-09", picks: tampered }, []).client, "2026-11-09"),
    ).toEqual([{ category: "person", id: ID(3) }]);
    const invented = [{ category: "invented", id: ID(3) }];
    expect(
      await readTodaysPicks(fakeSupabase({ local_day: "2026-11-09", picks: invented }, []).client, "2026-11-09"),
    ).toEqual([]);
  });
});

describe("an unreadable cache — a deployment ahead of its migration", () => {
  it("is neither a pick nor an empty answer, and is never followed by a call", async () => {
    const failing = {
      from: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: "42P01" } }) }) }),
      rpc: vi.fn(),
    } as never;
    expect(await readTodaysPicks(failing, "2026-11-09")).toBeUndefined();
    expect(await run(failing)).toBe("cache_unavailable");
    expect(gate).not.toHaveBeenCalled();
    expect(pickSuggestions).not.toHaveBeenCalled();
  });
});

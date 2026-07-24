import { describe, expect, it, vi } from "vitest";
import { loadQuestionSurfacingDecision } from "./question-surfacing-data";

vi.mock("server-only", () => ({}));

type Result = { data?: unknown; error?: unknown; count?: number | null };

// A chainable query stub that resolves to a queued result. Every builder method
// returns the same stub; `maybeSingle` and a bare await both resolve through
// the same thenable, so count-head reads and single-row reads share one shape.
function tableQueue(results: Result[]) {
  let index = 0;
  return () => {
    const result = results[Math.min(index, results.length - 1)];
    index += 1;
    const stub: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "gte", "order", "limit"]) {
      stub[method] = vi.fn(() => stub);
    }
    stub.maybeSingle = vi.fn(() => Promise.resolve(result));
    stub.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected);
    return stub;
  };
}

function clientMock(tables: Partial<Record<"agent_preferences" | "profiles" | "pending_questions" | "notifications", Result[]>>) {
  const factories = {
    agent_preferences: tableQueue(tables.agent_preferences ?? [{ data: null, error: null }]),
    profiles: tableQueue(tables.profiles ?? [{ data: { timezone: "America/Sao_Paulo" }, error: null }]),
    pending_questions: tableQueue(tables.pending_questions ?? [{ count: 1, error: null }]),
    notifications: tableQueue(tables.notifications ?? [{ count: 0, error: null }, { data: null, error: null }]),
  };
  const from = vi.fn((table: string) => factories[table as keyof typeof factories]());
  return { from } as never;
}

const userId = "11111111-1111-4111-8111-111111111111";
// 14:00 in America/Sao_Paulo — outside the default quiet window.
const daytime = new Date("2026-07-24T17:00:00Z");

describe("loadQuestionSurfacingDecision", () => {
  it("surfaces during the day with an open question, default prefs, and no recent nudge", async () => {
    const decision = await loadQuestionSurfacingDecision(clientMock({}), userId, daytime);
    expect(decision).toEqual({ surface: true, reason: "surface", openQuestionCount: 1 });
  });

  it("suppresses when there are no open questions and skips the notifications reads", async () => {
    const client = clientMock({ pending_questions: [{ count: 0, error: null }] });
    const decision = await loadQuestionSurfacingDecision(client, userId, daytime);
    expect(decision).toEqual({ surface: false, reason: "no_open_questions", openQuestionCount: 0 });
  });

  it("fails closed (no surface) when a preference read errors", async () => {
    const client = clientMock({ agent_preferences: [{ data: null, error: { message: "boom" } }] });
    const decision = await loadQuestionSurfacingDecision(client, userId, daytime);
    expect(decision.surface).toBe(false);
  });

  it("fails closed when a notifications read errors", async () => {
    const client = clientMock({ notifications: [{ count: null, error: { message: "boom" } }, { data: null, error: null }] });
    const decision = await loadQuestionSurfacingDecision(client, userId, daytime);
    expect(decision.surface).toBe(false);
  });

  it("suppresses once today's delivered nudges reach the user's cap", async () => {
    const client = clientMock({
      agent_preferences: [{ data: { quiet_start: "22:30:00", quiet_end: "07:00:00", max_followups_per_day: 2, important_reminder_override: false }, error: null }],
      notifications: [{ count: 2, error: null }, { data: { created_at: "2026-07-20T00:00:00Z" }, error: null }],
    });
    const decision = await loadQuestionSurfacingDecision(client, userId, daytime);
    expect(decision).toEqual({ surface: false, reason: "daily_cap_reached", openQuestionCount: 1 });
  });

  it("suppresses within the rolling cooldown after a recent nudge", async () => {
    const client = clientMock({
      notifications: [{ count: 0, error: null }, { data: { created_at: "2026-07-24T15:00:00Z" }, error: null }],
    });
    const decision = await loadQuestionSurfacingDecision(client, userId, daytime);
    expect(decision).toEqual({ surface: false, reason: "cooldown", openQuestionCount: 1 });
  });

  it("suppresses inside the user's local quiet hours", async () => {
    // 04:00 in São Paulo is inside the default 22:30–07:00 window.
    const decision = await loadQuestionSurfacingDecision(clientMock({}), userId, new Date("2026-07-24T07:00:00Z"));
    expect(decision).toEqual({ surface: false, reason: "quiet_hours", openQuestionCount: 1 });
  });
});

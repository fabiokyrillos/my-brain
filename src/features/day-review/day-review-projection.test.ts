import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { DayReviewProjection } from "./day-review-projection";

type Result = { data: unknown; error: unknown };

type ProjectionModule = {
  loadDayReviewProjection?: (supabase: unknown, input: Record<string, unknown>) => Promise<DayReviewProjection>;
  captureExcerpt?: (content: string) => string;
  DAY_REVIEW_ITEM_LIMIT?: number;
};

const modulePath = `./${"day-review-projection"}.ts`;
const projection = await vi.importActual<ProjectionModule>(modulePath).catch(() => ({})) as ProjectionModule;

/**
 * Table- and column-addressed, exactly like the calendar's.
 *
 * `tasks` is read **three** times here — by `completed_at`, by `planned_at` and
 * by `due_at` — and a stub that answered the same rows to all three would make
 * the three sections indistinguishable, which is most of what these tests are
 * about. `entries` is read twice, once for captures and once for the
 * classification map, and the select tells them apart.
 */
function client(tables: Record<string, Result | ((column: string, select: string) => Result)>) {
  return {
    from(table: string) {
      const entry = tables[table] ?? { data: [], error: null };
      let column = "";
      let select = "";
      const stub: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "lt", "lte", "gte", "is", "order", "range", "limit", "maybeSingle"]) {
        stub[method] = vi.fn((first: unknown) => {
          if (method === "select" && typeof first === "string") select = first;
          if (method === "gte" && typeof first === "string" && !column) column = first;
          return stub;
        });
      }
      stub.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const result = typeof entry === "function" ? entry(column, select) : entry;
        return Promise.resolve(result).then(onFulfilled, onRejected);
      };
      return stub;
    },
  };
}

function entriesStub(options: { levels?: Result; captures?: Result }) {
  return (_column: string, select: string): Result => (
    select.includes("original_content")
      ? options.captures ?? { data: [], error: null }
      : options.levels ?? { data: [], error: null }
  );
}

const ZONE = "America/Sao_Paulo";
const DAY = { year: 2026, month: 8, day: 11 } as const;

const task = (overrides: Record<string, unknown> = {}) => ({
  id: "t1",
  title: "Entregar relatório",
  status: "todo",
  due_at: null,
  planned_at: null,
  completed_at: null,
  source_entry_id: null,
  ...overrides,
});

const load = (supabase: unknown, overrides: Record<string, unknown> = {}) =>
  projection.loadDayReviewProjection!(supabase, {
    userId: "user-1",
    locale: "pt-BR",
    timezone: ZONE,
    day: DAY,
    today: DAY,
    scope: "day",
    nowLocalMinutes: 23 * 60,
    ...overrides,
  });

describe("2M-REVIEW-001: composed from records that already exist", () => {
  it("separates what was completed, what was intended and what was due", async () => {
    const result = await load(client({
      tasks: (column) => {
        if (column === "completed_at") {
          return { data: [task({ id: "done", status: "completed", completed_at: "2026-08-11T20:00:00.000Z" })], error: null };
        }
        if (column === "planned_at") {
          return { data: [task({ id: "intended", planned_at: "2026-08-11T13:00:00.000Z" })], error: null };
        }
        return { data: [task({ id: "committed", due_at: "2026-08-11T18:00:00.000Z" })], error: null };
      },
    }));

    expect(result.completed.map((item) => item.taskId)).toEqual(["done"]);
    expect(result.planned.map((item) => item.taskId)).toEqual(["intended"]);
    expect(result.due.map((item) => item.taskId)).toEqual(["committed"]);
  });

  it("calls no model — the projection module imports no provider", async () => {
    const source = readFileSync(join(__dirname, "day-review-projection.ts"), "utf8");
    // The implementation plan is explicit: review generation is an existing
    // provider call and is unchanged, and a new model call in this slice stops
    // and asks. This is that stop, as a test.
    for (const token of ["@/lib/ai", "openai", "AIProvider", "embedText", "answerFromKnowledge"]) {
      expect(source, `the day review reached for ${token}`).not.toContain(token);
    }
  });

  it("has no writer: no insert, no update, no delete, no rpc", async () => {
    const source = readFileSync(join(__dirname, "day-review-projection.ts"), "utf8");
    for (const token of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
      expect(source, `the day review projection reached for ${token}`).not.toContain(token);
    }
  });
});

describe("2M-REVIEW-001: it states plainly what it could not read", () => {
  it("marks a failed source unavailable and names it", async () => {
    const result = await load(client({
      tasks: (column) => (column === "completed_at"
        ? { data: null, error: { message: "permission denied" } }
        : { data: [], error: null }),
    }));

    expect(result.sourceStates.completed).toBe("unavailable");
    expect(result.unreadable).toContain("completed");
  });

  it("does NOT report an unreadable source as an empty one — the negative control", async () => {
    // The whole point. `completed: []` is true of both a quiet day and a failed
    // query, so the list alone cannot tell them apart; `sourceStates` is what
    // stops the surface saying "nothing was completed" about a read that failed.
    const failed = await load(client({
      tasks: (column) => (column === "completed_at"
        ? { data: null, error: { message: "permission denied" } }
        : { data: [], error: null }),
    }));
    const quiet = await load(client({ tasks: { data: [], error: null } }));

    expect(failed.completed).toEqual([]);
    expect(quiet.completed).toEqual([]);
    expect(failed.sourceStates.completed).not.toBe(quiet.sourceStates.completed);
    expect(quiet.unreadable).toEqual([]);
  });

  it("survives one failed source rather than taking the whole review down", async () => {
    const result = await load(client({
      tasks: (column) => (column === "planned_at"
        ? { data: null, error: { message: "boom" } }
        : { data: [task({ id: "done", status: "completed", completed_at: "2026-08-11T20:00:00.000Z" })], error: null }),
    }));
    expect(result.unreadable).toEqual(["planned"]);
    expect(result.completed).toHaveLength(1);
  });

  it("reports every source as read when every read succeeded", async () => {
    const result = await load(client({}));
    expect(result.unreadable).toEqual([]);
    expect(Object.values(result.sourceStates).every((state) => state === "read")).toBe(true);
  });
});

describe("2M-PRIVACY: classification is derived, and fails closed", () => {
  it("gives a task with an unreadable source the most protective level", async () => {
    const result = await load(client({
      tasks: (column) => (column === "completed_at"
        ? { data: [task({ id: "done", status: "completed", completed_at: "2026-08-11T20:00:00.000Z", source_entry_id: "e-missing" })], error: null }
        : { data: [], error: null }),
      entries: entriesStub({ levels: { data: [], error: null } }),
    }));
    expect(result.completed[0].sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("gives a hand-made task with no source `undetermined`", async () => {
    const result = await load(client({
      tasks: (column) => (column === "completed_at"
        ? { data: [task({ id: "done", status: "completed", completed_at: "2026-08-11T20:00:00.000Z" })], error: null }
        : { data: [], error: null }),
    }));
    expect(result.completed[0].sensitivity).toEqual({ kind: "undetermined" });
  });

  it("derives a capture's classification from the entry's own column", async () => {
    const result = await load(client({
      entries: entriesStub({
        captures: {
          data: [{ id: "e1", original_content: "algo pessoal", created_at: "2026-08-11T14:00:00.000Z", sensitivity: "private" }],
          error: null,
        },
      }),
    }));
    expect(result.captured[0].sensitivity).toEqual({ kind: "derived", level: "private" });
  });

  it("fails closed on an entry whose classification is outside the vocabulary", async () => {
    const result = await load(client({
      entries: entriesStub({
        captures: {
          data: [{ id: "e1", original_content: "x", created_at: "2026-08-11T14:00:00.000Z", sensitivity: "made-up" }],
          error: null,
        },
      }),
    }));
    expect(result.captured[0].sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });
});

describe("the shape a review action needs", () => {
  it("offers each row the verbs its own status admits", async () => {
    const result = await load(client({
      tasks: (column) => (column === "planned_at"
        ? { data: [task({ id: "open", status: "todo", planned_at: "2026-08-11T13:00:00.000Z" })], error: null }
        : { data: [task({ id: "closed", status: "completed", completed_at: "2026-08-11T20:00:00.000Z" })], error: null }),
    }));
    expect(result.planned[0].verbs.map((verb) => verb.kind)).toContain("carry_forward");
    // A completed task is in the review and can be acted on by nothing, which is
    // the taxonomy's answer rather than the surface's.
    expect(result.completed[0].verbs).toEqual([]);
  });

  it("names the next day for `carry_forward`, computed on the calendar date", async () => {
    const result = await load(client({}));
    expect(result.day).toBe("2026-08-11");
    expect(result.nextDay).toBe("2026-08-12");
  });

  it("crosses a month boundary without arithmetic on milliseconds", async () => {
    const result = await load(client({}), { day: { year: 2026, month: 8, day: 31 }, today: { year: 2026, month: 8, day: 31 } });
    expect(result.nextDay).toBe("2026-09-01");
  });
});

describe("2M-REVIEW-002: the next-day scope reads the same shapes and proposes nothing", () => {
  it("carries the scope through to the projection", async () => {
    const result = await load(client({}), { scope: "next_day", day: { year: 2026, month: 8, day: 12 } });
    expect(result.scope).toBe("next_day");
    expect(result.day).toBe("2026-08-12");
    expect(result.isToday).toBe(false);
  });
});

describe("bounds are stated rather than silent", () => {
  it("truncates at the ceiling and reports which source was cut", async () => {
    const many = Array.from({ length: projection.DAY_REVIEW_ITEM_LIMIT! + 5 }, (_unused, index) =>
      task({ id: `t${index}`, planned_at: "2026-08-11T13:00:00.000Z" }));
    const result = await load(client({
      tasks: (column) => (column === "planned_at" ? { data: many, error: null } : { data: [], error: null }),
    }));
    expect(result.planned).toHaveLength(projection.DAY_REVIEW_ITEM_LIMIT!);
    expect(result.truncated).toContain("planned");
  });

  it("reports nothing truncated when nothing was", async () => {
    const result = await load(client({}));
    expect(result.truncated).toEqual([]);
  });
});

/*
 * These stubs said `reviews`, and that is how the defect survived.
 *
 * The projection queried `.from("reviews")` — a table that has **never existed
 * in any schema** — and this file's fake client is keyed by table name, so it
 * answered to the same wrong key. The unit test and the code agreed with each
 * other and both disagreed with the database, which is the one arrangement a
 * stub can produce and a real query cannot.
 *
 * The stubs now say `summaries`, which is the table that exists.
 * `online-phase-2p-reviews.spec.ts` is what closes the gap for good: it runs
 * against the real database, where a wrong table name cannot be agreed with.
 */
describe("2M-REVIEW-008: a stored review renders through the presentation contract", () => {
  it("returns the contract's own view for a readable row", async () => {
    const result = await load(client({
      summaries: {
        data: [{
          id: "r1",
          title: "Resumo",
          content: "corpo",
          period_type: "daily",
          period_start: "2026-08-11",
          period_end: "2026-08-11",
          status: "generated",
        }],
        error: null,
      },
    }));
    expect(result.generated?.periodLabel).toBe("Resumo do dia");
    expect(result.generated?.statusTone).toBe("positive");
  });

  it("returns null rather than a half-rendered card when the row fails the contract", async () => {
    const result = await load(client({
      summaries: { data: [{ id: "r1", title: "Resumo", content: "corpo", period_type: "invented", period_start: "2026-08-11", period_end: "2026-08-11", status: "generated" }], error: null },
    }));
    expect(result.generated).toBeNull();
  });
});

describe("captureExcerpt", () => {
  it("collapses whitespace and bounds the length", () => {
    expect(projection.captureExcerpt!("  a\n\n b  ")).toBe("a b");
    const long = "x".repeat(400);
    const excerpt = projection.captureExcerpt!(long);
    expect(excerpt.length).toBeLessThanOrEqual(140);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});

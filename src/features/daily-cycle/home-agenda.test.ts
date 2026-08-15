import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
  Imported directly, not through `vi.importActual(...).catch(() => ({}))`.

  That shim appears elsewhere in this repository and it is a trap: a module that
  fails to load resolves to `{}`, every `expect` below is skipped by an early
  `if (!loadHomeAgendaProjection) return`, and the file reports green while
  testing nothing. A broken import must break this file.
*/
import { HOME_AGENDA_LIMIT, loadHomeAgendaProjection } from "./home-agenda";

type Result = { data: unknown; error: unknown };

/**
 * The same table-addressed stub `calendar-projection.test.ts` uses, and for the
 * same reason: `tasks` is read twice — once filtered on `due_at`, once on
 * `planned_at` — so a stub keyed only by table name cannot tell the deadline
 * lane from the intention lane.
 */
function client(tables: Record<string, Result | ((column: string, select: string) => Result)>) {
  return {
    from(table: string) {
      const entry = tables[table] ?? { data: [], error: null };
      let column = "";
      let select = "";
      const stub: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "lt", "gte", "neq", "not", "is", "order", "range", "maybeSingle"]) {
        stub[method] = vi.fn((first: unknown) => {
          if (method === "select" && typeof first === "string") select = first;
          if ((method === "gte" || method === "lt") && typeof first === "string" && !column) column = first;
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

const ZONE = "America/Sao_Paulo";
/** 12:00 local on 15 August 2026. */
const NOW = new Date("2026-08-15T15:00:00.000Z");

function taskRows(column: string): Result {
  if (column !== "due_at") return { data: [], error: null };
  return {
    data: [
      { id: "task-past", title: "Já passou", due_at: "2026-08-15T13:00:00.000Z", planned_at: null, status: "pending", source_entry_id: null },
      { id: "task-later", title: "Orçamento com o João", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "pending", source_entry_id: null },
      { id: "task-next-week", title: "Comitê da temporada", due_at: "2026-08-21T14:00:00.000Z", planned_at: null, status: "pending", source_entry_id: null },
    ],
    error: null,
  };
}

async function load(overrides: Partial<{
  excludeTaskIds: ReadonlySet<string>;
  limit: number;
}> = {}) {
  return loadHomeAgendaProjection(
    client({ tasks: (column) => taskRows(column) }) as never,
    { userId: "user-1", locale: "pt-BR", now: NOW, timezone: ZONE, ...overrides },
  );
}

describe("Hoje's agenda panel", () => {
  it("shows what is still ahead and drops what already elapsed", async () => {
    const projection = await load();

    const ids = projection.items.map((item) => item.key);
    expect(ids).toContain("deadline:task-later");
    expect(ids).toContain("deadline:task-next-week");
    /* 13:00Z is behind 15:00Z. "Hoje e atrasado" already says that item is
       late; repeating it under "Adiante" would contradict that section. */
    expect(ids).not.toContain("deadline:task-past");
  });

  it("orders by instant, so the next thing is first", async () => {
    const projection = await load();
    const instants = projection.items.map((item) => item.at);
    expect([...instants].sort()).toEqual(instants);
  });

  it("omits a task the day's own list is already rendering", async () => {
    const projection = await load({ excludeTaskIds: new Set(["task-later"]) });

    expect(projection.items.map((item) => item.key)).not.toContain("deadline:task-later");
    expect(projection.items.map((item) => item.key)).toContain("deadline:task-next-week");
  });

  it("reports that more exists rather than silently truncating", async () => {
    const projection = await load({ limit: 1 });

    expect(projection.items).toHaveLength(1);
    expect(projection.hasMore).toBe(true);
  });

  it("carries the owner's zone and each item's classification", async () => {
    const projection = await load();

    expect(projection.timezone).toBe(ZONE);
    for (const item of projection.items) {
      expect(item.sensitivity).toBeDefined();
    }
  });

  it("marks today's own anchors as today", async () => {
    const projection = await load();
    const today = projection.items.find((item) => item.key === "deadline:task-later");

    expect(today?.isToday).toBe(true);
    expect(projection.items.find((item) => item.key === "deadline:task-next-week")?.isToday).toBe(false);
  });

  it("keeps the panel to a glance by default", () => {
    expect(HOME_AGENDA_LIMIT).toBeLessThanOrEqual(6);
  });
});

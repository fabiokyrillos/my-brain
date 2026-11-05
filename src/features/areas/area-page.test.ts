import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { loadAreaCounts, loadAreaEvents, loadAreaOpenTasks, loadAreaPeople, loadAreaRecords, loadIdeas, AREA_COUNT_LINK_LIMIT, AREA_LINK_LIMIT, IDEAS_LIMIT } = await import("./area-page");

type Answer = { data: unknown; error: unknown };

/**
 * A PostgREST double: every builder method records itself and returns the
 * builder; awaiting it takes the next answer queued for that table.
 */
function client(queues: Record<string, Answer[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const supabase = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "is", "not", "or", "order", "limit", "contains"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      builder.then = (resolve: (value: Answer) => unknown) => resolve(queues[table]?.shift() ?? { data: [], error: null });
      return builder;
    },
  };
  return { calls, supabase: supabase as unknown as Parameters<typeof loadAreaRecords>[0] };
}

const USER = "u1";
const AREA = "ctx-health";

describe("loadAreaRecords — the records the CURRENT reading files under the area", () => {
  it("keeps a record only while its current interpretation is the one that links it", async () => {
    const { supabase, calls } = client({
      entry_entities: [{
        data: [
          { entry_id: "e1", interpretation_id: "i1" },
          { entry_id: "e2", interpretation_id: "i2-old" },
          { entry_id: "e3", interpretation_id: "i3" },
        ],
        error: null,
      }],
      entries: [{
        data: [
          { id: "e1", original_content: "Consulta com o cardiologista", occurred_at: "2026-11-01T12:00:00Z", sensitivity: "private", current_interpretation_id: "i1" },
          { id: "e2", original_content: "Re-lido fora da área", occurred_at: "2026-11-03T12:00:00Z", sensitivity: "normal", current_interpretation_id: "i2-new" },
          { id: "e3", original_content: "Exame de sangue", occurred_at: "2026-11-04T12:00:00Z", sensitivity: "highly_sensitive", current_interpretation_id: "i3" },
        ],
        error: null,
      }],
    });
    const result = await loadAreaRecords(supabase, USER, AREA);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.records.map((record) => record.id)).toEqual(["e3", "e1"]);
    expect(result.total).toBe(2);
    expect(result.bounded).toBe(false);
    expect(result.records[0].sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
    expect(result.interpretationIds).toEqual(["i3", "i1"]);
    // Owner-scoped explicitly, on both reads.
    expect(calls.filter((call) => call.method === "eq" && call.args[0] === "user_id").map((call) => call.table))
      .toEqual(["entry_entities", "entries"]);
    expect(calls).toContainEqual({ table: "entry_entities", method: "eq", args: ["entity_id", AREA] });
  });

  it("fails closed on a sensitivity outside the vocabulary", async () => {
    const { supabase } = client({
      entry_entities: [{ data: [{ entry_id: "e1", interpretation_id: "i1" }], error: null }],
      entries: [{ data: [{ id: "e1", original_content: "x", occurred_at: "2026-11-01T00:00:00Z", sensitivity: "weird", current_interpretation_id: "i1" }], error: null }],
    });
    const result = await loadAreaRecords(supabase, USER, AREA);
    expect(result.status === "ok" && result.records[0].sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("says bounded when the link read filled", async () => {
    const links = Array.from({ length: AREA_LINK_LIMIT }, (_, index) => ({ entry_id: `e${index}`, interpretation_id: `i${index}` }));
    const { supabase } = client({ entry_entities: [{ data: links, error: null }] });
    const result = await loadAreaRecords(supabase, USER, AREA);
    expect(result.status === "ok" && result.bounded).toBe(true);
  });

  it("reports a failed read as failed, never as an empty area", async () => {
    const { supabase } = client({ entry_entities: [{ data: null, error: { code: "42501" } }] });
    expect(await loadAreaRecords(supabase, USER, AREA)).toEqual({ status: "failed" });
  });
});

describe("loadAreaEvents — next events, and what happened inside a trip", () => {
  const records = [
    { id: "r-before", preview: "antes", occurredAt: "2026-12-01T12:00:00.000Z", sensitivity: { kind: "derived", level: "normal" } as const },
    { id: "r-inside", preview: "durante", occurredAt: "2026-12-05T12:00:00.000Z", sensitivity: { kind: "derived", level: "normal" } as const },
    { id: "src", preview: "origem", occurredAt: "2026-12-04T12:00:00.000Z", sensitivity: { kind: "derived", level: "normal" } as const },
  ];

  it("lists the area's records inside the event's period, except the one that proposed it", async () => {
    const { supabase, calls } = client({
      events: [{
        data: [{ id: "ev1", title: "Viagem a Lisboa", starts_at: "2026-12-03T03:00:00.000Z", ends_at: "2026-12-11T02:59:59.000Z", all_day: true, source_entry_id: "src" }],
        error: null,
      }],
      entries: [{ data: [{ id: "src", sensitivity: "private" }], error: null }],
    });
    const result = await loadAreaEvents(supabase, USER, AREA, new Date("2026-11-05T00:00:00Z"), records);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.events[0].inPeriod.map((record) => record.id)).toEqual(["r-inside"]);
    expect(result.events[0].sensitivity).toEqual({ kind: "derived", level: "private" });
    expect(calls).toContainEqual({ table: "events", method: "eq", args: ["status", "confirmed"] });
    expect(calls).toContainEqual({ table: "events", method: "eq", args: ["context_id", AREA] });
  });

  it("derives the most protective level when the source cannot be read", async () => {
    const { supabase } = client({
      events: [{ data: [{ id: "ev1", title: "Dentista", starts_at: "2026-12-12T18:00:00.000Z", ends_at: null, all_day: false, source_entry_id: "gone" }], error: null }],
      entries: [{ data: null, error: { code: "500" } }],
    });
    const result = await loadAreaEvents(supabase, USER, AREA, new Date("2026-11-05T00:00:00Z"), []);
    expect(result.status === "ok" && result.events[0].sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
    expect(result.status === "ok" && result.events[0].inPeriod).toEqual([]);
  });
});

describe("loadAreaOpenTasks and loadAreaPeople", () => {
  it("asks only for tasks that are not completed or cancelled", async () => {
    const { supabase, calls } = client({
      task_contexts: [{ data: [{ task_id: "t1" }], error: null }],
      tasks: [{ data: [{ id: "t1", title: "Marcar retorno", status: "todo", source_entry_id: null }], error: null }],
    });
    const tasks = await loadAreaOpenTasks(supabase, USER, AREA);
    expect(tasks).toEqual([{ id: "t1", title: "Marcar retorno", status: "todo", sensitivity: { kind: "undetermined" } }]);
    expect(calls).toContainEqual({ table: "tasks", method: "not", args: ["status", "in", "(completed,cancelled)"] });
  });

  it("joins the people linked to the area and the people its current readings name", async () => {
    const { supabase } = client({
      person_contexts: [{ data: [{ person_id: "p1" }], error: null }],
      entry_entities: [{ data: [{ entity_id: "p2" }, { entity_id: "p1" }], error: null }],
      people: [{ data: [{ id: "p2", name: "Dr. Silva" }, { id: "p1", name: "Ana" }], error: null }],
    });
    expect(await loadAreaPeople(supabase, USER, AREA, ["i1"])).toEqual([{ id: "p1", name: "Ana" }, { id: "p2", name: "Dr. Silva" }]);
  });

  it("returns null, never an empty list, when a read fails", async () => {
    const { supabase } = client({ person_contexts: [{ data: null, error: { code: "42501" } }] });
    expect(await loadAreaPeople(supabase, USER, AREA, [])).toBeNull();
  });
});

describe("loadAreaCounts — real counts, by the timeline's own rule (LB-C-009)", () => {
  it("counts distinct records whose current reading links the area, per area", async () => {
    const { supabase } = client({
      entry_entities: [{
        data: [
          { entity_id: "a", entry_id: "e1", interpretation_id: "i1" },
          { entity_id: "a", entry_id: "e1", interpretation_id: "i1-old" },
          { entity_id: "a", entry_id: "e2", interpretation_id: "i2-old" },
          { entity_id: "b", entry_id: "e3", interpretation_id: "i3" },
        ],
        error: null,
      }],
      entries: [{ data: [
        { id: "e1", current_interpretation_id: "i1" },
        { id: "e2", current_interpretation_id: "i2-new" },
        { id: "e3", current_interpretation_id: "i3" },
      ], error: null }],
    });
    const counts = await loadAreaCounts(supabase, USER, ["a", "b", "c"]);
    expect(counts?.get("a")).toEqual({ count: 1, atLeast: false });
    expect(counts?.get("b")).toEqual({ count: 1, atLeast: false });
    expect(counts?.get("c")).toEqual({ count: 0, atLeast: false });
  });

  it("marks every count 'at least' when the link read filled, and null on failure", async () => {
    const rows = Array.from({ length: AREA_COUNT_LINK_LIMIT }, (_, index) => ({ entity_id: "a", entry_id: `e${index}`, interpretation_id: `i${index}` }));
    const filled = client({ entry_entities: [{ data: rows, error: null }], entries: Array.from({ length: 20 }, () => ({ data: [], error: null })) });
    expect((await loadAreaCounts(filled.supabase, USER, ["a"]))?.get("a")?.atLeast).toBe(true);
    const failed = client({ entry_entities: [{ data: null, error: { code: "500" } }] });
    expect(await loadAreaCounts(failed.supabase, USER, ["a"])).toBeNull();
  });
});

describe("loadIdeas — Ideias as a lens over the records (LB-C-011)", () => {
  it("asks for readings with the idea concept and keeps only the current ones, newest first", async () => {
    const { supabase, calls } = client({
      entry_interpretations: [{ data: [
        { id: "i1", entry_id: "e1" },
        { id: "i2-old", entry_id: "e2" },
        { id: "i3", entry_id: "e3" },
      ], error: null }],
      entries: [{ data: [
        { id: "e1", original_content: "Ideia: um app de receitas", occurred_at: "2026-11-01T12:00:00Z", sensitivity: "normal", current_interpretation_id: "i1" },
        { id: "e2", original_content: "Re-lido sem ideia", occurred_at: "2026-11-02T12:00:00Z", sensitivity: "normal", current_interpretation_id: "i2-new" },
        { id: "e3", original_content: "E se a horta fosse no telhado?", occurred_at: "2026-11-03T12:00:00Z", sensitivity: "normal", current_interpretation_id: "i3" },
      ], error: null }],
    });
    const result = await loadIdeas(supabase, USER);
    expect(calls).toContainEqual({ table: "entry_interpretations", method: "contains", args: ["concepts", ["idea"]] });
    expect(result.status === "ok" && result.records.map((record) => record.id)).toEqual(["e3", "e1"]);
    expect(IDEAS_LIMIT).toBeGreaterThan(0);
  });

  it("reports a failed read as failed", async () => {
    const { supabase } = client({ entry_interpretations: [{ data: null, error: { code: "500" } }] });
    expect(await loadIdeas(supabase, USER)).toEqual({ status: "failed" });
  });
});

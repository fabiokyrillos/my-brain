/**
 * Life Brain B.7 (T7) — the read half, asserted against recorded queries.
 *
 * What matters here is exactly what matters in `conflict-projection.test.ts`:
 * **which columns are read, under what bound, and what the rows become.** All
 * three are visible in the builder calls, so this needs no live client.
 *
 * The case that earns this file its length is the mask. A task's classification
 * lives on its source entry, so "a highly sensitive task is never named on the
 * opening screen" is a property of *this* file plus `suggestions.ts`, and only
 * this half can get it wrong by failing to read the entry at all.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BIRTHDAY_HORIZON_DAYS,
  REMINDER_HORIZON_HOURS,
  loadSuggestionInputs,
  nextBirthdayOccurrence,
} from "./suggestion-sources";

const TIME_ZONE = "America/Sao_Paulo";
/** 12:00 on 5 November 2026, in the owner's own day. */
const NOW = new Date("2026-11-05T15:00:00.000Z");

type Recorded = { table: string; select: string; filters: string[]; limit: number | null };

type Fixtures = {
  people?: unknown[];
  projects?: unknown[];
  tasks?: unknown[];
  reminders?: unknown[];
  questions?: unknown[];
  birthdays?: unknown[];
  attention?: unknown[];
  entries?: unknown[];
  /** Reads that answer with an error instead of rows. */
  failing?: readonly string[];
};

function fakeClient(fixtures: Fixtures) {
  const calls: Recorded[] = [];

  function key(table: string, select: string): keyof Fixtures {
    if (table === "people") return select.includes("birthday") ? "birthdays" : "people";
    if (table === "pending_questions") return "questions";
    return table as keyof Fixtures;
  }

  function builder(table: string) {
    const record: Recorded = { table, select: "", filters: [], limit: null };
    let name: keyof Fixtures = table as keyof Fixtures;

    const chain = {
      select(select: string) {
        record.select = select;
        name = key(table, select);
        calls.push(record);
        return chain;
      },
      eq(column: string, value: unknown) {
        record.filters.push(`eq:${column}=${String(value)}`);
        return chain;
      },
      not(column: string, operator: string) {
        record.filters.push(`not:${column}:${operator}`);
        return chain;
      },
      lt(column: string, value: unknown) {
        record.filters.push(`lt:${column}=${String(value)}`);
        return chain;
      },
      gte(column: string, value: unknown) {
        record.filters.push(`gte:${column}=${String(value)}`);
        return chain;
      },
      in(column: string, values: readonly unknown[]) {
        record.filters.push(`in:${column}=${values.join("|")}`);
        return chain;
      },
      or(filter: string) {
        record.filters.push(`or:${filter}`);
        return chain;
      },
      order(column: string) {
        record.filters.push(`order:${column}`);
        return chain;
      },
      limit(count: number) {
        record.limit = count;
        return chain;
      },
      then(resolve: (value: { data: unknown[] | null; error: unknown }) => unknown) {
        const failed = (fixtures.failing ?? []).includes(name);
        return Promise.resolve(
          failed
            ? { data: null, error: { message: `${String(name)} unavailable` } }
            : { data: (fixtures[name] as unknown[] | undefined) ?? [], error: null },
        ).then(resolve);
      },
    };
    return chain;
  }

  const supabase = {
    from: (table: string) => builder(table),
    rpc: (rpcName: string) => {
      calls.push({ table: `rpc:${rpcName}`, select: "", filters: [], limit: null });
      const failed = (fixtures.failing ?? []).includes("attention");
      return Promise.resolve(
        failed
          ? { data: null, error: { message: "attention unavailable" } }
          : { data: fixtures.attention ?? [], error: null },
      );
    },
  };

  return { supabase: supabase as never, calls };
}

function load(fixtures: Fixtures, scope: Parameters<typeof loadSuggestionInputs>[1]["scope"] = null) {
  const { supabase, calls } = fakeClient(fixtures);
  return loadSuggestionInputs(supabase, { now: NOW, timeZone: TIME_ZONE, scope })
    .then((inputs) => ({ inputs, calls }));
}

function recorded(calls: readonly Recorded[], table: string): Recorded | undefined {
  return calls.find((call) => call.table === table);
}

describe("nextBirthdayOccurrence: the owner's own calendar, never a subtraction of hours", () => {
  it("keeps a birthday still to come this year", () => {
    expect(nextBirthdayOccurrence({ year: 2026, month: 11, day: 5 }, 11, 20))
      .toEqual({ year: 2026, month: 11, day: 20 });
  });

  it("counts today as still to come, so a birthday is not hidden on the day", () => {
    expect(nextBirthdayOccurrence({ year: 2026, month: 11, day: 5 }, 11, 5))
      .toEqual({ year: 2026, month: 11, day: 5 });
  });

  it("crosses the year, which is the case a month comparison gets wrong", () => {
    expect(nextBirthdayOccurrence({ year: 2026, month: 12, day: 28 }, 1, 2))
      .toEqual({ year: 2027, month: 1, day: 2 });
  });
});

describe("the reads: owner-scoped, bounded, and each one small", () => {
  it("asks for open tasks dated no later than the end of the owner's own day", async () => {
    const { calls } = await load({});
    const tasks = recorded(calls, "tasks")!;
    expect(tasks.select).toBe("id,title,due_at,source_entry_id");
    expect(tasks.filters).toContain("eq:status=open");
    expect(tasks.filters).toContain("not:due_at:is");
    // 00:00 on 6 November in America/Sao_Paulo is 03:00Z, which is the whole
    // reason this bound is computed rather than written as "today + 1 day".
    expect(tasks.filters).toContain("lt:due_at=2026-11-06T03:00:00.000Z");
    expect(tasks.limit).toBe(6);
  });

  it("asks for reminders inside the declared horizon and no further", async () => {
    const { calls } = await load({});
    const reminders = recorded(calls, "reminders")!;
    expect(REMINDER_HORIZON_HOURS).toBe(48);
    expect(reminders.filters).toContain("eq:status=scheduled");
    expect(reminders.filters).toContain("gte:remind_at=2026-11-05T15:00:00.000Z");
    expect(reminders.filters).toContain("lt:remind_at=2026-11-07T15:00:00.000Z");
  });

  it("asks for questions through the same visibility rule the question list uses", async () => {
    const { calls } = await load({});
    const questions = recorded(calls, "pending_questions")!;
    // A snoozed question may not reappear as a suggestion before it reappears
    // as a question.
    expect(questions.filters.some((filter) => filter.startsWith("or:status.eq.open"))).toBe(true);
    expect(questions.filters.some((filter) => filter.includes("snoozed_until.lte."))).toBe(true);
  });

  it("asks only for the months a birthday horizon can touch", async () => {
    const { calls } = await load({});
    const birthdays = calls.find((call) => call.select.includes("birthday"))!;
    expect(BIRTHDAY_HORIZON_DAYS).toBe(14);
    expect(birthdays.filters).toContain("in:birthday_month=11");
    expect(birthdays.filters).toContain("not:birthday_day:is");
  });

  it("reads no entry at all when nothing on the page has a source", async () => {
    // The dependent read is the only one that is not free, so it does not run
    // for an owner with nothing dated.
    const { calls } = await load({});
    expect(recorded(calls, "entries")).toBeUndefined();
  });
});

describe("the buckets: late and today are a comparison, not a second query", () => {
  const tasks = [
    { id: "t1", title: "Pagar a escola", due_at: "2026-11-04T12:00:00.000Z", source_entry_id: null },
    { id: "t2", title: "Levar o carro", due_at: "2026-11-05T17:00:00.000Z", source_entry_id: null },
  ];

  it("splits on the start of the owner's local day", async () => {
    const { inputs } = await load({ tasks });
    expect(inputs.overdueTasks?.map((item) => item.name)).toEqual(["Pagar a escola"]);
    expect(inputs.tasksDueToday?.map((item) => item.name)).toEqual(["Levar o carro"]);
  });

  it("keeps the due date as the ordering instant and nothing else", async () => {
    const { inputs } = await load({ tasks });
    expect(inputs.overdueTasks?.[0]?.at).toBe("2026-11-04T12:00:00.000Z");
  });

  it("drops a row whose date cannot be read, rather than placing it somewhere", async () => {
    const { inputs } = await load({
      tasks: [{ id: "t3", title: "Sem data legível", due_at: "não é uma data", source_entry_id: null }],
    });
    expect(inputs.overdueTasks).toEqual([]);
    expect(inputs.tasksDueToday).toEqual([]);
  });

  it("keeps only the birthdays inside the horizon, in the owner's calendar", async () => {
    const { inputs } = await load({
      birthdays: [
        { id: "p1", name: "Ana", birthday_month: 11, birthday_day: 7 },
        { id: "p2", name: "Bruno", birthday_month: 11, birthday_day: 1 },
        { id: "p3", name: "Sem dia", birthday_month: 11, birthday_day: null },
      ],
    });
    expect(inputs.birthdaysSoon?.map((item) => item.name)).toEqual(["Ana"]);
    expect(inputs.birthdaysSoon?.[0]?.at).toBe("2026-11-07");
  });

  it("keeps only the attention reasons that mean `you have not looked at this`", async () => {
    const { inputs } = await load({
      attention: [
        { entry_id: "e1", reason: "review_interpretation", occurred_at: "2026-11-03T12:00:00.000Z" },
        { entry_id: "e2", reason: "answer_existing_question", occurred_at: "2026-11-02T12:00:00.000Z" },
        { entry_id: "e3", reason: "retry_processing", occurred_at: "2026-11-01T12:00:00.000Z" },
      ],
      entries: [
        { id: "e1", original_content: "Fui ao mercado e esqueci o pão", sensitivity: "normal" },
        { id: "e2", original_content: "Outra coisa", sensitivity: "normal" },
      ],
    });
    // A question already has its own category; a stuck job is not "unreviewed".
    expect(inputs.unreviewedEntries?.map((item) => item.id)).toEqual(["e1"]);
    expect(inputs.unreviewedEntries?.[0]?.name).toBe("Fui ao mercado e esqueci o pão");
  });

  it("passes the scope straight through", async () => {
    const scope = { type: "context", id: "c1" } as const;
    const { inputs } = await load({}, scope);
    expect(inputs.scope).toEqual(scope);
  });
});

describe("LB-SUGG-002: the classification is read here, so the mask can be kept there", () => {
  it("derives a task's level from its source entry", async () => {
    const { inputs } = await load({
      tasks: [{ id: "t1", title: "Resultado da biópsia", due_at: "2026-11-04T12:00:00.000Z", source_entry_id: "e1" }],
      entries: [{ id: "e1", original_content: "…", sensitivity: "highly_sensitive" }],
    });
    expect(inputs.overdueTasks?.[0]?.sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("reads the source entries of tasks, reminders, questions and records in ONE read", async () => {
    const { calls } = await load({
      tasks: [{ id: "t1", title: "T", due_at: "2026-11-04T12:00:00.000Z", source_entry_id: "e1" }],
      reminders: [{ id: "r1", title: "R", remind_at: "2026-11-06T12:00:00.000Z", entry_id: "e2" }],
      questions: [{ id: "q1", question: "Q?", created_at: "2026-11-01T12:00:00.000Z", entry_id: "e3" }],
      attention: [{ entry_id: "e4", reason: "review_interpretation", occurred_at: "2026-11-03T12:00:00.000Z" }],
      entries: [],
    });
    const entries = calls.filter((call) => call.table === "entries");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.select).toBe("id,original_content,sensitivity");
    expect(entries[0]!.filters).toContain("in:id=e1|e2|e3|e4");
  });

  it("treats an unreadable source as the most protective level", async () => {
    // A removed entry, a foreign entry and an entry the read could not return
    // are one thing here: absent from the map. There is no branch that could
    // distinguish them, so none that could leak which it was.
    const { inputs } = await load({
      tasks: [{ id: "t1", title: "Oculto", due_at: "2026-11-04T12:00:00.000Z", source_entry_id: "gone" }],
      entries: [],
    });
    expect(inputs.overdueTasks?.[0]?.sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("leaves a hand-made task undetermined rather than calling it normal", async () => {
    const { inputs } = await load({
      tasks: [{ id: "t1", title: "Levar o carro", due_at: "2026-11-05T17:00:00.000Z", source_entry_id: null }],
    });
    expect(inputs.tasksDueToday?.[0]?.sensitivity).toEqual({ kind: "undetermined" });
  });

  it("gives an entry its OWN level, not one derived from itself", async () => {
    const { inputs } = await load({
      attention: [{ entry_id: "e1", reason: "confirm_existing_candidates", occurred_at: "2026-11-03T12:00:00.000Z" }],
      entries: [{ id: "e1", original_content: "Consulta", sensitivity: "private" }],
    });
    expect(inputs.unreviewedEntries?.[0]?.sensitivity).toEqual({ kind: "derived", level: "private" });
  });

  it("leaves a birthday read from `people` undetermined: there was no column to read", async () => {
    const { inputs } = await load({
      birthdays: [{ id: "p1", name: "Ana", birthday_month: 11, birthday_day: 7 }],
    });
    expect(inputs.birthdaysSoon?.[0]?.sensitivity).toEqual({ kind: "undetermined" });
  });
});

describe("failure: a suggestion is never worth failing the field for", () => {
  it("answers with an empty bucket when one of the six reads fails", async () => {
    const { inputs } = await load({ failing: ["tasks", "reminders", "questions", "birthdays", "attention"] });
    expect(inputs.overdueTasks).toEqual([]);
    expect(inputs.remindersSoon).toEqual([]);
    expect(inputs.openQuestions).toEqual([]);
    expect(inputs.birthdaysSoon).toEqual([]);
    expect(inputs.unreviewedEntries).toEqual([]);
  });

  it("names nothing it could not classify, when the entry read fails", async () => {
    // The dependent read failing must not degrade into "no classification", so
    // it degrades into the most protective one through the same absent-from-map
    // path.
    const { inputs } = await load({
      tasks: [{ id: "t1", title: "Oculto", due_at: "2026-11-04T12:00:00.000Z", source_entry_id: "e1" }],
      failing: ["entries"],
    });
    expect(inputs.overdueTasks?.[0]?.sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("still fails loudly when people or projects cannot be read", async () => {
    // The posture those two reads shipped with in Phase 2K, unchanged by this
    // slice: `requireSupabaseData` throws, and B.7 did not come to rewrite an
    // error contract.
    await expect(load({ failing: ["people"] })).rejects.toThrow(/load suggestion people/);
  });
});

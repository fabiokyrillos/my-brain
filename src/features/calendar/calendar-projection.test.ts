import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEFAULT_CALENDAR_LANES, type CalendarLane, type CalendarQuery } from "./calendar-query";
import { POSITION_FORBIDDEN_FIELDS, parseCalendarPosition } from "./calendar-position";
import {
  TASK_COMMAND_ACTIONS,
  actionPolicy,
  isEligibleStatus,
} from "@/features/task-commands/taxonomy";

type Result = { data: unknown; error: unknown };

type ItemView = {
  id: string;
  lane: CalendarLane;
  commitment: string;
  at: string;
  date: string;
  title: string | null;
  sensitivity: { kind: string; level?: string };
  href: string | null;
  elapsed: boolean;
  reschedule: { taskId: string; controls: readonly { action: string }[] } | null;
  /** Slice 2R.3 — the rule in words, for a recurring occurrence. */
  repeats: string | null;
};

type ProjectionResult = {
  days: readonly { date: string; isToday: boolean; items: readonly ItemView[] }[];
  failedLanes: readonly { lane: CalendarLane }[];
  itemCount: number;
  timezone: string;
  rangeStart: { year: number; month: number; day: number };
  rangeEnd: { year: number; month: number; day: number };
};

type ProjectionModule = {
  loadCalendarProjection?: (supabase: unknown, input: Record<string, unknown>) => Promise<ProjectionResult>;
};

const modulePath = `./${"calendar-projection"}.ts`;
const projection = await vi.importActual<ProjectionModule>(modulePath)
  .catch(() => ({})) as ProjectionModule;

/**
 * A table-addressed stub.
 *
 * Keyed by table AND by which column the query filtered on, because `tasks` is
 * read **twice** — once for `due_at` and once for `planned_at` — and a stub that
 * answered the same rows to both would make the deadline and intention lanes
 * indistinguishable, which is the one thing these tests are about.
 */
function client(tables: Record<string, Result | ((column: string, select: string) => Result)>) {
  return {
    from(table: string) {
      const entry = tables[table] ?? { data: [], error: null };
      let column = "";
      let select = "";
      const stub: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "lt", "gte", "neq", "not", "is", "order", "range"]) {
        stub[method] = vi.fn((first: unknown) => {
          if (method === "select" && typeof first === "string") select = first;
          if ((method === "gte" || method === "lt") && typeof first === "string" && !column) {
            column = first;
          }
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

/**
 * The `entries` table is read **twice** and for two different questions: once as
 * the suggestion lane, once as the owner-scoped classification map. Keying the
 * stub on the select is what tells them apart — and the first draft that did
 * not was how the projection's missing guard against an unreadable instant was
 * found, because the classification rows reached the lane and had no date.
 */
function entriesStub(options: { levels?: Result; suggestions?: Result }) {
  return (_column: string, select: string): Result => (
    select.includes("sensitivity")
      ? options.levels ?? { data: [], error: null }
      : options.suggestions ?? { data: [], error: null }
  );
}

const ZONE = "America/Sao_Paulo";
const NOW = new Date("2026-08-15T15:00:00.000Z"); // 12:00 local
const ANCHOR = { year: 2026, month: 8, day: 15 };

function query(overrides: Partial<CalendarQuery> = {}): CalendarQuery {
  return { orientation: "day", anchor: ANCHOR, lanes: DEFAULT_CALENDAR_LANES, ...overrides };
}

const load = (supabase: unknown, overrides: Partial<CalendarQuery> = {}) =>
  projection.loadCalendarProjection!(supabase, {
    userId: "user-1", locale: "pt-BR", timezone: ZONE, query: query(overrides), now: NOW,
  });

describe("2M-CAL-002: five lanes over sources that already exist", () => {
  it("renders a deadline, an intention, a reminder, a review and a suggestion", async () => {
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "Entregar relatório", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: null }], error: null }
        : { data: [{ id: "t2", title: "Escrever rascunho", due_at: null, planned_at: "2026-08-15T13:00:00.000Z", status: "todo", source_entry_id: null }], error: null }),
      reminders: { data: [{ id: "r1", title: "Ligar para a Ana", remind_at: "2026-08-15T20:00:00.000Z", status: "pending", entry_id: null, task_id: null }], error: null },
      summaries: { data: [{ id: "s1", period_start: "2026-08-15T03:00:00.000Z", period_end: "2026-08-16T02:59:00.000Z", period_type: "daily" }], error: null },
      entries: entriesStub({ suggestions: { data: [{ id: "e1", occurred_at: "2026-08-15T14:00:00.000Z", status: "ready" }], error: null } }),
    }));

    expect(result.days).toHaveLength(1);
    const lanes = result.days[0].items.map((item) => item.lane);
    expect([...lanes].sort()).toEqual(["deadline", "intention", "reminder", "review", "suggestion"]);
    expect(result.itemCount).toBe(5);
  });

  it("derives commitment from the lane, and never paints an intention as a commitment", async () => {
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "Deadline", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: null }], error: null }
        : { data: [{ id: "t2", title: "Intention", due_at: null, planned_at: "2026-08-15T13:00:00.000Z", status: "todo", source_entry_id: null }], error: null }),
    }));
    const byLane = Object.fromEntries(result.days[0].items.map((item) => [item.lane, item.commitment]));
    expect(byLane.deadline).toBe("committed");
    expect(byLane.intention).toBe("intended");
    expect(byLane.intention).not.toBe(byLane.deadline);
  });

  it("shows no cancelled or completed work, so an empty day means nothing is scheduled", async () => {
    // The status filter is what makes "empty" mean something, and it is asserted
    // on the query rather than on the result -- a stub returns whatever it is
    // told, so the only honest check is which statuses were asked for.
    const statuses: unknown[] = [];
    const supabase = {
      from() {
        const stub: Record<string, unknown> = {};
        for (const method of ["select", "eq", "in", "lt", "gte", "order", "range"]) {
          stub[method] = vi.fn((first: unknown, second: unknown) => {
            if (method === "in" && first === "status") statuses.push(second);
            return stub;
          });
        }
        stub.then = (onFulfilled: (value: Result) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled);
        return stub;
      },
    };
    await load(supabase);
    for (const asked of statuses) {
      expect(asked).not.toContain("cancelled");
      expect(asked).not.toContain("completed");
    }
    expect(statuses.length).toBeGreaterThan(0);
  });
});

describe("2M-CAL-011: a lane that fails is named, and the rest still render", () => {
  it("keeps the other lanes and reports the failure rather than showing an empty day", async () => {
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "Survives", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: null }], error: null }
        : { data: [], error: null }),
      reminders: { data: null, error: { message: "boom" } },
    }));
    expect(result.failedLanes.map((failure) => failure.lane)).toEqual(["reminder"]);
    expect(result.days[0].items.map((item) => item.lane)).toEqual(["deadline"]);
  });

  it("reports nothing when every lane succeeded and the day is genuinely empty", async () => {
    const result = await load(client({}));
    expect(result.failedLanes).toEqual([]);
    expect(result.itemCount).toBe(0);
    expect(result.days[0].items).toEqual([]);
  });

  it("reports a lane whose row carries an unreadable instant, rather than dropping it", async () => {
    /*
     * Every column read is `not null` in the schema, so this should be
     * impossible — and "should be impossible" is the class of assumption that
     * takes a surface down. The honest behaviour is the same as a failed read:
     * the lane is named, the others render, and the day does not quietly look
     * emptier than it is.
     *
     * This case is here because the first draft of this file found it: the
     * classification rows reached the suggestion lane and had no date, and the
     * projection threw rather than degrading.
     */
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "Survives", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: null }], error: null }
        : { data: [], error: null }),
      reminders: { data: [{ id: "r1", title: "Broken", remind_at: "not-an-instant", status: "pending", entry_id: null, task_id: null }], error: null },
    }));
    expect(result.failedLanes.map((failure) => failure.lane)).toEqual(["reminder"]);
    expect(result.days[0].items.map((item) => item.lane)).toEqual(["deadline"]);
    expect(result.itemCount).toBe(1);
  });

  it("never reports a lane the user did not ask for", async () => {
    const result = await load(
      client({ reminders: { data: null, error: { message: "boom" } } }),
      { lanes: ["deadline"] },
    );
    expect(result.failedLanes).toEqual([]);
  });
});

describe("2M-PRIVACY-001/-003/-005: both subjects derive, and absence is most protective", () => {
  it("derives a task's level from its source entry", async () => {
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "Sensitive", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: "e-secret" }], error: null }
        : { data: [], error: null }),
      entries: entriesStub({ levels: { data: [{ id: "e-secret", sensitivity: "highly_sensitive" }], error: null } }),
    }));
    expect(result.days[0].items[0].sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("derives a REMINDER's level through reminders.entry_id — OD-2M-1 option A", async () => {
    // The finding the audit made and nobody had acted on. Without this a
    // calendar would mask a task title and print the reminder title beside it.
    const result = await load(client({
      reminders: { data: [{ id: "r1", title: "Consulta", remind_at: "2026-08-15T18:00:00.000Z", status: "pending", entry_id: "e-secret", task_id: null }], error: null },
      entries: entriesStub({ levels: { data: [{ id: "e-secret", sensitivity: "highly_sensitive" }], error: null } }),
    }), { lanes: ["reminder"] });
    expect(result.days[0].items[0].lane).toBe("reminder");
    expect(result.days[0].items[0].sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("takes the most protective level when a source is absent from the map", async () => {
    // Removed, foreign and unreadable are one thing here, and there is no
    // branch that could tell a reader which (`2M-PRIVACY-003`).
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "Orphan", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: "e-gone" }], error: null }
        : { data: [], error: null }),
      entries: entriesStub({ levels: { data: [], error: null } }),
    }));
    expect(result.days[0].items[0].sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("fails closed when the classification read itself fails", async () => {
    // An unreadable map is an EMPTY map, not an absent question: every item
    // resolves to the most protective level rather than to `undetermined`.
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "Unknown", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: "e-1" }], error: null }
        : { data: [], error: null }),
      entries: entriesStub({ levels: { data: null, error: { message: "boom" } } }),
    }));
    expect(result.days[0].items[0].sensitivity).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("leaves a manual task undetermined, and never reads that as normal", async () => {
    // `2M-PRIVACY-002`. `undetermined` carries no `level` field at all, which is
    // what stops "never classified" decaying into "normal" by a destructure.
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "Manual", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: null }], error: null }
        : { data: [], error: null }),
    }));
    expect(result.days[0].items[0].sensitivity).toEqual({ kind: "undetermined" });
    expect(result.days[0].items[0].sensitivity).not.toHaveProperty("level");
  });

  it("renders no title at all for the two lanes that have no user text", async () => {
    const result = await load(client({
      summaries: { data: [{ id: "s1", period_start: "2026-08-15T13:00:00.000Z", period_end: "2026-08-15T20:00:00.000Z", period_type: "daily" }], error: null },
      entries: entriesStub({ suggestions: { data: [{ id: "e1", occurred_at: "2026-08-15T14:00:00.000Z", status: "ready" }], error: null } }),
    }), { lanes: ["review", "suggestion"] });
    for (const item of result.days[0].items) expect(item.title).toBeNull();
  });

  it("counts everything, masked or not, so a count is never an oracle", async () => {
    // `2M-PRIVACY-006`.
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [
          { id: "t1", title: "Open", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: null },
          { id: "t2", title: "Masked", due_at: "2026-08-15T19:00:00.000Z", planned_at: null, status: "todo", source_entry_id: "e-secret" },
        ], error: null }
        : { data: [], error: null }),
      entries: entriesStub({ levels: { data: [{ id: "e-secret", sensitivity: "highly_sensitive" }], error: null } }),
    }));
    expect(result.itemCount).toBe(2);
    expect(result.days[0].items).toHaveLength(2);
  });
});

describe("2M-TIME-002/-003: the range is the local-day contract's, never the host's", () => {
  it("builds one column per day and marks today", async () => {
    const result = await load(client({}), { orientation: "week", anchor: ANCHOR });
    expect(result.days).toHaveLength(7);
    // 2026-08-15 is a Saturday, so a Monday-based week runs the 10th to the 16th.
    expect(result.days[0].date).toBe("2026-08-10");
    expect(result.days[6].date).toBe("2026-08-16");
    expect(result.days.filter((day) => day.isToday).map((day) => day.date)).toEqual(["2026-08-15"]);
  });

  it("puts an item on the day it falls on in the USER's zone", async () => {
    // 2026-08-16T02:00Z is still the 15th in São Paulo. A calendar that grouped
    // by the ISO string's date would put it on the 16th for everybody.
    const result = await load(client({
      reminders: { data: [{ id: "r1", title: "Late", remind_at: "2026-08-16T02:00:00.000Z", status: "pending", entry_id: null, task_id: null }], error: null },
    }), { lanes: ["reminder"] });
    expect(result.days[0].date).toBe("2026-08-15");
    expect(result.days[0].items).toHaveLength(1);
  });

  it("refuses an unsupported zone rather than defaulting to one", async () => {
    await expect(projection.loadCalendarProjection!(client({}), {
      userId: "user-1", locale: "pt-BR", timezone: "EST", query: query(), now: NOW,
    })).rejects.toThrow(/unsupported time zone/);
  });

  it("marks an item elapsed from the server clock, never the browser's", async () => {
    const result = await load(client({
      reminders: { data: [
        { id: "past", title: "Past", remind_at: "2026-08-15T10:00:00.000Z", status: "pending", entry_id: null, task_id: null },
        { id: "future", title: "Future", remind_at: "2026-08-15T20:00:00.000Z", status: "pending", entry_id: null, task_id: null },
      ], error: null },
    }), { lanes: ["reminder"] });
    const byId = Object.fromEntries(result.days[0].items.map((item) => [item.id, item.elapsed]));
    expect(byId["reminder:past"]).toBe(true);
    expect(byId["reminder:future"]).toBe(false);
  });
});

describe("2M-CAL-008: opening an item goes to the surface that already exists", () => {
  it("links a task to its Work detail and a reminder to Reminders", async () => {
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "T", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: null }], error: null }
        : { data: [], error: null }),
      reminders: { data: [{ id: "r1", title: "R", remind_at: "2026-08-15T19:00:00.000Z", status: "pending", entry_id: null, task_id: null }], error: null },
    }), { lanes: ["deadline", "reminder"] });
    const byLane = Object.fromEntries(result.days[0].items.map((item) => [item.lane, item.href]));
    // The **path** is the existing surface. The query carries the return
    // position added by part 3, which is `2M-CAL-008`'s other half and is
    // asserted for what it decodes to rather than for its bytes below.
    expect(byLane.deadline?.split("?")[0]).toBe("/pt-BR/app/work/t1");
    expect(byLane.reminder?.split("?")[0]).toBe("/pt-BR/app/reminders");
    // No calendar-owned detail route: `2M-CAL-008` requires the existing one.
    for (const href of Object.values(byLane)) expect(href).not.toContain("/app/calendar/");
  });

  it("carries the caller's own position back, decoded rather than trusted", async () => {
    /*
     * `2M-CAL-008`. The evidence that matters is not that a `from=` appeared —
     * it is that the payload **round-trips to the position the user was at**.
     * Asserting the base64 would pin an encoding; asserting the decode pins the
     * property, and it fails if the projection ever serializes a stale query.
     */
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "T", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: null }], error: null }
        : { data: [], error: null }),
    }), { lanes: ["deadline", "reminder"], orientation: "week" });

    const href = result.days.flatMap((day) => day.items).map((item) => item.href)[0];
    const from = new URL(href ?? "", "https://example.test").searchParams.get("from");
    expect(from, "the item link carries no return position").toBeTruthy();

    const decoded = parseCalendarPosition(from ?? undefined);
    expect(decoded).toEqual({
      orientation: "week",
      anchor: { year: 2026, month: 8, day: 15 },
      lanes: ["deadline", "reminder"],
    });
  });

  it("never puts a subject, a title or a classification in the return position", async () => {
    /*
     * `2L-RETURN-003`, inherited. A return position describes **where**, and the
     * subject is already in the path — a payload that also named the task would
     * put an owned id in a link for no reason, and one that named a title would
     * put content there. Read from the decoded JSON rather than from the type,
     * because the type is what a future edit would change first.
     */
    const result = await load(client({
      tasks: (column) => (column === "due_at"
        ? { data: [{ id: "t1", title: "Um título sensível", due_at: "2026-08-15T18:00:00.000Z", planned_at: null, status: "todo", source_entry_id: null }], error: null }
        : { data: [], error: null }),
    }), { lanes: ["deadline"] });

    const href = result.days.flatMap((day) => day.items).map((item) => item.href)[0] ?? "";
    const from = new URL(href, "https://example.test").searchParams.get("from") ?? "";
    const payload = JSON.parse(Buffer.from(from, "base64url").toString("utf8")) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual(["d", "l", "o", "v"]);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("t1");
    expect(serialized).not.toContain("título");
    for (const forbidden of POSITION_FORBIDDEN_FIELDS) {
      expect(Object.keys(payload), `the return position carries ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("2M-CAL-009: what a calendar item can be rescheduled with", () => {
  const task = (status: string) => ({
    id: "t1", title: "T", due_at: "2026-08-15T18:00:00.000Z", planned_at: null,
    status, source_entry_id: null,
  });

  it("offers only the scheduling verbs, derived from the taxonomy", async () => {
    const result = await load(client({
      tasks: (column) => (column === "due_at" ? { data: [task("todo")], error: null } : { data: [], error: null }),
    }), { lanes: ["deadline"] });

    const target = result.days.flatMap((day) => day.items)[0]?.reschedule;
    expect(target?.taskId).toBe("t1");
    const actions = (target?.controls ?? []).map((control) => control.action).sort();
    /*
     * Derived rather than typed: the expectation is recomputed here from the
     * same policies the projection consulted, so this fails when a verb's
     * `changedFields` change and passes when a new scheduling verb is added —
     * which is exactly what `clear_planned` will be in slice 2M.2.
     */
    const expected = TASK_COMMAND_ACTIONS
      .filter((action) => isEligibleStatus(action, "todo"))
      .filter((action) => actionPolicy(action).changedFields
        .some((field) => field === "due_at" || field === "planned_at"))
      .slice()
      .sort();
    expect(actions).toEqual(expected);
    // The property the derivation exists for, stated once so a reader does not
    // have to run the filter in their head.
    expect(actions).toContain("reschedule_due");
    expect(actions).toContain("set_planned");
    // Not a scheduling verb, and the most likely thing a hand-written list
    // would have let through.
    expect(actions).not.toContain("rename_task");
    expect(actions).not.toContain("cancel_task");
    // `clear_planned` arrived in slice 2M.2 (`2M-PLAN-002`). This line was an
    // asserted absence with its destination named; it failed on the day the
    // verb was added, which is what forced the question of whether the calendar
    // should offer it. It should: a surface that puts an intention on a day has
    // to be able to take it off.
    expect(actions).toContain("clear_planned");
  });

  it("offers nothing on an item that is not a task", async () => {
    const result = await load(client({
      reminders: { data: [{ id: "r1", title: "R", remind_at: "2026-08-15T19:00:00.000Z", status: "pending", entry_id: null, task_id: null }], error: null },
      summaries: { data: [{ id: "s1", period_start: "2026-08-15T00:00:00.000Z", period_end: "2026-08-16T00:00:00.000Z", period_type: "daily" }], error: null },
    }), { lanes: ["reminder", "review"] });

    for (const item of result.days.flatMap((day) => day.items)) {
      expect(item.reschedule, `${item.lane} offered a task reschedule`).toBeNull();
    }
  });

  it("carries the answer and never the status the answer came from", async () => {
    /*
     * The boundary property. A client handed a status would be deciding
     * eligibility in a place that cannot re-check it, which is the second
     * authority `2M-CAL-009` forbids — and `humanState`'s lossiness on Work is
     * the same lesson one surface over.
     */
    const result = await load(client({
      tasks: (column) => (column === "due_at" ? { data: [task("todo")], error: null } : { data: [], error: null }),
    }), { lanes: ["deadline"] });

    const item = result.days.flatMap((day) => day.items)[0];
    expect(Object.keys(item ?? {})).not.toContain("status");
    expect(Object.keys(item?.reschedule ?? {}).sort()).toEqual(["controls", "taskId"]);
  });
});

/**
 * `2R-SURFACE-003`/`-005` — a recurring occurrence on the calendar. Slice 2R.3.
 *
 * ## Why `-005` needed proving rather than building
 *
 * *"Recurring occurrences appear on the calendar and the agenda"* was already
 * true when the slice began, and true **by construction**: a materialised
 * occurrence is an ordinary `reminders` row, this projection selects reminders
 * by status and date window, and no predicate here excludes one. The re-audit
 * found that before any code was written, so the work was to assert it rather
 * than to add a path -- and an unasserted "already true" is one refactor away
 * from being false.
 *
 * ## Why the label lookup is mocked rather than driven
 *
 * ADR-132 Decision 1's lift is "strictly limited to reminders", and
 * `phase-2m-recurrence-guard.test.ts` enforces that by refusing the recurrence
 * vocabulary anywhere under `src/features/calendar/`. That applies to this file
 * as much as to the module it tests: driving the lookup from here would mean
 * writing the rule's own column names into a calendar test, which is the same
 * boundary crossing one step removed.
 *
 * So the calendar is tested for exactly its own responsibility -- that it asks
 * the reminders feature and renders what it is told -- and the lookup itself is
 * proved in `src/features/reminders/repeat-labels.test.ts`, where it belongs.
 */
vi.mock("@/features/reminders/repeat-labels", () => ({
  loadReminderRepeatLabels: vi.fn(async () => repeatLabels),
}));

let repeatLabels: ReadonlyMap<string, string> = new Map();

describe("2R-SURFACE-005: a series occurrence is on the calendar like any reminder", () => {
  const occurrence = {
    id: "r-occ",
    title: "Tomar o remédio",
    remind_at: "2026-08-15T12:00:00.000Z",
    status: "scheduled",
    entry_id: null,
    task_id: null,
  };

  const found = async (labels: ReadonlyMap<string, string>) => {
    repeatLabels = labels;
    const result = await load(client({ reminders: { data: [occurrence], error: null } }));
    return result.days.flatMap((day) => day.items).find((item) => item.id === "reminder:r-occ");
  };

  it("places it on its day, in the reminder lane", async () => {
    const item = await found(new Map([["r-occ", "Todo dia"]]));
    expect(item, "the occurrence did not reach the calendar").toBeDefined();
    expect(item?.lane).toBe("reminder");
    expect(item?.date).toBe("2026-08-15");
  });

  it("says how it repeats, in the owner's words", async () => {
    const item = await found(new Map([["r-occ", "Todo sábado"]]));
    expect(item?.repeats).toBe("Todo sábado");
  });

  it("says nothing about repeating for an ordinary reminder", async () => {
    // The label map simply has no entry for it, which is what the reminders
    // feature returns for a reminder that carries no rule.
    const item = await found(new Map());
    expect(item).toBeDefined();
    expect(item?.repeats).toBeNull();
  });

  it("still places the occurrence when no label came back", async () => {
    /*
      A degradation, not a dropped item. The occurrence is a real reminder and
      belongs on its day whether or not the label lookup answered; losing the
      note costs the owner a label, and losing the row would cost them the
      reminder.
    */
    const item = await found(new Map());
    expect(item?.title).toBe("Tomar o remédio");
    expect(item?.repeats).toBeNull();
  });
});

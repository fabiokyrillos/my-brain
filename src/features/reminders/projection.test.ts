import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { asReminderView, loadReminderPage } from "./projection";

/**
 * The read half (UX-12).
 *
 * The cases worth having here are the ones where being wrong costs the owner
 * something: a view whose ordering buries the next reminder under a year of
 * delivered ones, a link to a row the reader cannot open, and a status the
 * database produced that the surface does not recognise — which decides which
 * controls render, so failing open there would offer actions on a row nobody
 * can reason about.
 */

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-12-01T12:00:00Z");

type Row = Record<string, unknown>;

type Call = {
  table: string;
  order?: [string, boolean];
  in?: [string, unknown[]];
  eq: [string, unknown][];
  is: [string, unknown][];
};

/**
 * Records the query it was asked to build, so ordering and filters are
 * assertable.
 *
 * ## Why the dataset is not keyed by table name alone
 *
 * Slice 2R.2 made `reminders` the target of **two** different queries in one
 * load: the page itself, and the owner-scoped probe for which series still hold
 * a live occurrence. A stub that answered `tables["reminders"]` to both would
 * hand the probe the page's rows — so a probe that filtered wrongly, or did not
 * filter at all, would still produce a plausible answer and the test would
 * defend the bug instead of finding it.
 *
 * So the live-occurrence probe is recognised by its own filters and answered
 * from its own dataset, and `calls` still records everything for the assertions
 * that check the filters were the intended ones.
 */
function client(tables: Readonly<Record<string, Row[]>>) {
  const calls: Call[] = [];
  const supabase = {
    from(table: string) {
      const call: Call = { table, eq: [], is: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        call.eq.push([column, value]);
        return builder;
      };
      builder.is = (column: string, value: unknown) => {
        call.is.push([column, value]);
        return builder;
      };
      builder.in = (column: string, values: unknown[]) => {
        call.in = [column, values];
        return builder;
      };
      builder.order = (column: string, options?: { ascending?: boolean }) => {
        call.order = [column, options?.ascending !== false];
        return builder;
      };
      builder.range = () => builder;
      // Both a terminal `range(...)` and a bare `select(...)` are awaited, so the
      // builder itself resolves.
      builder.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: tables[datasetFor(call)] ?? [], error: null });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

/** The live-occurrence probe is `reminders` filtered by both of its own predicates. */
export function isLiveOccurrenceProbe(call: Call): boolean {
  return (
    call.table === "reminders"
    && call.eq.some(([column, value]) => column === "status" && value === "scheduled")
    && call.is.some(([column, value]) => column === "detached_at" && value === null)
  );
}

function datasetFor(call: Call): string {
  return isLiveOccurrenceProbe(call) ? "live_occurrences" : call.table;
}

function reminder(overrides: Row = {}): Row {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    title: "Ligar para o contador",
    remind_at: "2026-12-05T09:00:00+00:00",
    important: false,
    status: "scheduled",
    task_id: null,
    entry_id: null,
    sent_at: null,
    ...overrides,
  };
}

async function load(rows: Row[], view: Parameters<typeof loadReminderPage>[1]["view"], extra: Record<string, Row[]> = {}) {
  const { supabase, calls } = client({ reminders: rows, ...extra });
  const page = await loadReminderPage(supabase, {
    userId: USER_ID,
    locale: "pt-BR",
    page: 1,
    view,
    now: NOW,
  });
  return { page, calls };
}

describe("the view selector", () => {
  it("falls back to pending for anything unrecognised", () => {
    expect(asReminderView("cancelled")).toBe("cancelled");
    expect(asReminderView("nonsense")).toBe("pending");
    expect(asReminderView(undefined)).toBe("pending");
    expect(asReminderView(42)).toBe("pending");
  });

  it("orders pending soonest-first and every other view most-recent-first", async () => {
    // One order for both would be wrong for one of them: the next reminder is
    // the interesting one, the most recent delivery is.
    const pending = await load([reminder()], "pending");
    expect(pending.calls[0].order).toEqual(["remind_at", true]);

    const delivered = await load([reminder({ status: "sent" })], "delivered");
    expect(delivered.calls[0].order).toEqual(["remind_at", false]);
  });

  it("filters each view to its own statuses and leaves `all` unfiltered", async () => {
    expect((await load([reminder()], "pending")).calls[0].in).toEqual([
      "status",
      ["scheduled", "snoozed"],
    ]);
    expect((await load([], "cancelled")).calls[0].in).toEqual(["status", ["cancelled"]]);
    expect((await load([], "all")).calls[0].in).toBeUndefined();
  });
});

describe("what each row decides", () => {
  it("offers the live commands on a scheduled independent reminder", async () => {
    const { page } = await load([reminder()], "pending");
    expect(page.reminders[0].actions).toEqual(["snooze", "reschedule", "edit", "cancel"]);
    expect(page.reminders[0].hasPendingDelivery).toBe(true);
  });

  it("offers nothing on a delivered one", async () => {
    const { page } = await load([reminder({ status: "sent", sent_at: NOW.toISOString() })], "delivered");
    expect(page.reminders[0].actions).toEqual([]);
    expect(page.reminders[0].hasPendingDelivery).toBe(false);
  });

  it("marks a scheduled reminder whose time has passed as overdue", async () => {
    const { page } = await load([reminder({ remind_at: "2026-11-01T09:00:00+00:00" })], "pending");
    expect(page.reminders[0].overdue).toBe(true);
  });

  it("never marks a cancelled reminder overdue, however old", async () => {
    // "Overdue" means "will fire on the next check". A cancelled row will not.
    const { page } = await load(
      [reminder({ status: "cancelled", remind_at: "2020-01-01T09:00:00+00:00" })],
      "cancelled",
    );
    expect(page.reminders[0].overdue).toBe(false);
  });

  it("fails closed on a status the CHECK constraint does not admit", async () => {
    // Folding to the state that accepts nothing turns a data fault into "no
    // actions offered" rather than "every action offered".
    const { page } = await load([reminder({ status: "corrupted" })], "all");
    expect(page.reminders[0].status).toBe("snoozed");
    expect(page.reminders[0].actions).toEqual([]);
  });

  it("echoes the four scalars exactly as this render saw them", async () => {
    const { page } = await load([reminder()], "pending");
    expect(page.reminders[0].expectedState).toEqual({
      status: "scheduled",
      remindAt: "2026-12-05T09:00:00+00:00",
      title: "Ligar para o contador",
      important: false,
    });
  });

  it("links each reminder to its own audit trail", async () => {
    const { page } = await load([reminder()], "pending");
    expect(page.reminders[0].historyHref).toBe(
      "/pt-BR/app/history?entity=reminder&subject=44444444-4444-4444-8444-444444444444",
    );
  });
});

describe("the linked subject", () => {
  const TASK_ID = "55555555-5555-4555-8555-555555555555";

  it("links to a task whose label came back from an owner-scoped query", async () => {
    const { page } = await load([reminder({ task_id: TASK_ID })], "pending", {
      tasks: [{ id: TASK_ID, title: "Fechar o balanço" }],
    });
    expect(page.reminders[0].link).toEqual({
      kind: "task",
      href: `/pt-BR/app/work/${TASK_ID}`,
      label: "Fechar o balanço",
    });
  });

  it("renders no link when the label did not come back", async () => {
    // A `task_id` alone would happily produce an href to a row this reader
    // cannot open. The label having returned is what proves it exists for them.
    const { page } = await load([reminder({ task_id: TASK_ID })], "pending", { tasks: [] });
    expect(page.reminders[0].link).toBeNull();
  });

  it("says nothing at all about a reminder with no subject", async () => {
    const { page } = await load([reminder()], "pending");
    expect(page.reminders[0].link).toBeNull();
  });

  it("does not query for labels when no row has a subject", async () => {
    const { calls } = await load([reminder(), reminder({ id: "x" })], "pending");
    expect(calls.filter((call) => call.table !== "reminders")).toHaveLength(0);
  });

  it("truncates a long entry excerpt rather than printing a whole capture", async () => {
    const ENTRY_ID = "66666666-6666-4666-8666-666666666666";
    const { page } = await load([reminder({ entry_id: ENTRY_ID })], "pending", {
      entries: [{ id: ENTRY_ID, original_content: "a".repeat(300) }],
    });
    expect(page.reminders[0].link?.label.length).toBeLessThanOrEqual(70);
    expect(page.reminders[0].link?.label.endsWith("…")).toBe(true);
  });
});

/**
 * The rule behind a row — slice 2R.2.
 *
 * Each case here is one the surface would get wrong in a way the owner could
 * see: a scope chooser offered on a rule that has ended, a detached occurrence
 * that looks like every other one, or a second query issued for a page with no
 * repeating reminder on it at all.
 */
describe("the series a row came from", () => {
  const SERIES_ID = "77777777-7777-4777-8777-777777777777";

  const occurrence = (overrides: Row = {}) =>
    reminder({ series_id: SERIES_ID, series_sequence: 3, detached_at: null, ...overrides });

  it("carries the rule's own status, not the occurrence's", async () => {
    // An ended series can still own a `scheduled` detached occurrence — pgTAP
    // asserts exactly that pair — so reading `active` off the row's status would
    // report the opposite of the truth for the interesting case.
    const { page } = await load([occurrence({ status: "scheduled" })], "pending", {
      reminder_series: [{ id: SERIES_ID, status: "ended" }],
    });
    expect(page.reminders[0].series).toEqual({
      id: SERIES_ID,
      active: false,
      detached: false,
      sequence: 3,
    });
  });

  it("marks a detached occurrence detached while keeping its provenance", async () => {
    // `series_id` survives detachment on purpose (`202608230101:619`). Reading
    // detachment as "no series" would lose the provenance and hide the badge
    // `2R-SERIES-004` needs on screen.
    const { page } = await load(
      [occurrence({ detached_at: "2026-12-02T10:00:00+00:00" })],
      "pending",
      { reminder_series: [{ id: SERIES_ID, status: "active" }] },
    );
    expect(page.reminders[0].series).toEqual({
      id: SERIES_ID,
      active: true,
      detached: true,
      sequence: 3,
    });
  });

  it("treats a series that did not come back as absent rather than as active", async () => {
    // `public.reminder_series` is behind an owner policy, so somebody else's row
    // simply is not returned. Defaulting to `active: true` would point a scope
    // chooser at a rule this reader cannot see.
    const { page } = await load([occurrence()], "pending", { reminder_series: [] });
    expect(page.reminders[0].series).toBeNull();
  });

  it("says nothing about a reminder that carries no rule", async () => {
    const { page } = await load([reminder()], "pending");
    expect(page.reminders[0].series).toBeNull();
  });

  it("asks for exactly the series ids on the page, once, owner-scoped", async () => {
    const OTHER = "88888888-8888-4888-8888-888888888888";
    const { calls } = await load(
      [occurrence(), occurrence({ id: "b" }), occurrence({ id: "c", series_id: OTHER })],
      "pending",
      { reminder_series: [{ id: SERIES_ID, status: "active" }] },
    );
    const seriesCalls = calls.filter((call) => call.table === "reminder_series");
    expect(seriesCalls).toHaveLength(1);
    // Deduplicated: two rows of one series ask for it once.
    expect(seriesCalls[0].in).toEqual(["id", [SERIES_ID, OTHER]]);
  });

  it("issues no series query at all when nothing on the page repeats", async () => {
    /*
      The regression this case exists for.

      The filter was `id !== null`, and a fixture row that predates the column
      carries `undefined`, which passes that predicate — so a page of ordinary
      reminders issued `in("id", [undefined])`. `typeof id === "string"` is the
      predicate that means what the guard intended.
    */
    const { calls } = await load([reminder(), reminder({ id: "x" })], "pending");
    expect(calls.filter((call) => call.table === "reminder_series")).toHaveLength(0);
  });
});

/**
 * `2R-OCCURRENCE-CANCEL-IRREVERSIBLE` — withholding a control that cannot work.
 *
 * Cancelling an attached occurrence materialises the replacement, the
 * replacement takes the one live slot
 * `reminders_one_live_occurrence_per_series` permits, and `restore` is then
 * refused by that index with a bare `23505`. Proved by execution against the
 * deployed database in both directions, which is what the two "still offers it"
 * cases below encode: the failure is narrow, and a wider predicate would
 * withhold a control that works.
 */
describe("reactivating a cancelled occurrence", () => {
  const SERIES_ID = "77777777-7777-4777-8777-777777777777";

  const cancelled = (overrides: Row = {}) =>
    reminder({
      status: "cancelled",
      series_id: SERIES_ID,
      series_sequence: 1,
      detached_at: null,
      ...overrides,
    });

  const series = { reminder_series: [{ id: SERIES_ID, status: "active" }] };
  const withLiveReplacement = {
    ...series,
    live_occurrences: [{ series_id: SERIES_ID }],
  };

  it("withholds restore when the replacement already holds the live slot", async () => {
    const { page } = await load([cancelled()], "cancelled", withLiveReplacement);
    expect(page.reminders[0].actions).toEqual([]);
  });

  it("still offers restore when the series has no live occurrence", async () => {
    // An ended series materialises nothing, so the slot is free and the restore
    // succeeds — proved against the deployed database.
    const { page } = await load([cancelled()], "cancelled", {
      reminder_series: [{ id: SERIES_ID, status: "ended" }],
      live_occurrences: [],
    });
    expect(page.reminders[0].actions).toEqual(["restore"]);
  });

  it("still offers restore for a detached occurrence", async () => {
    // The materialisation trigger skips a detached row, so no replacement was
    // ever created for it and the index has nothing to refuse.
    const { page } = await load(
      [cancelled({ detached_at: "2026-12-02T10:00:00+00:00" })],
      "cancelled",
      withLiveReplacement,
    );
    expect(page.reminders[0].actions).toEqual(["restore"]);
  });

  it("leaves an ordinary cancelled reminder exactly as it was", async () => {
    // `2R-MODEL-004`: a reminder without a rule behaves as it does today.
    const { page } = await load([reminder({ status: "cancelled" })], "cancelled");
    expect(page.reminders[0].actions).toEqual(["restore"]);
  });

  it("asks the database which series are live rather than scanning the page", async () => {
    /*
      The replacement is very often NOT on this page — the cancelled occurrence
      is in the `cancelled` view while its replacement is in `pending`. Deriving
      this from the rows in hand would report "no live occurrence" for exactly
      the case the flag exists to catch.
    */
    const { calls } = await load([cancelled()], "cancelled", withLiveReplacement);
    const probe = calls.find(isLiveOccurrenceProbe);
    expect(probe).toBeDefined();
    expect(probe?.in).toEqual(["series_id", [SERIES_ID]]);
    expect(probe?.eq).toContainEqual(["user_id", USER_ID]);
  });
});

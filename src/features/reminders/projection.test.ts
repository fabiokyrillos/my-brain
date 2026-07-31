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

/** Records the query it was asked to build, so ordering and filters are assertable. */
function client(tables: Readonly<Record<string, Row[]>>) {
  const calls: { table: string; order?: [string, boolean]; in?: [string, unknown[]] }[] = [];
  const supabase = {
    from(table: string) {
      const call: (typeof calls)[number] = { table };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
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
        resolve({ data: tables[table] ?? [], error: null });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
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

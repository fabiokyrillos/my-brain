import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { loadReminderRepeatLabels } = await import("./repeat-labels");

/**
 * The lookup that moved here so a boundary would not have to move — slice 2R.3.
 *
 * ## Why this module is in the reminders feature at all
 *
 * `2R-SURFACE-003` asks **every** surface that lists a recurring reminder to say
 * that it repeats and how, and the calendar is one of them. The first
 * implementation had the calendar select the rule's own columns and join the
 * series table, and `phase-2m-recurrence-guard.test.ts` refused it — ADR-132
 * Decision 1's lift is *"strictly limited to reminders"* and enumerates the
 * files it authorizes.
 *
 * Widening that list to admit `src/features/calendar/**` would have been the
 * quiet act the enumeration exists to prevent. So the code moved: the calendar
 * asks a question in its own terms and receives sentences, and every line that
 * knows what a rule is lives on this side of the line. These cases are the
 * coverage that came with it.
 *
 * ## The stub distinguishes the two reads
 *
 * `reminders` and `reminder_series` are both queried, and a stub keyed only by
 * table would answer the same rows to both. Keying on the table is enough here
 * because the two tables differ — but the ids asked for are recorded, because
 * "owner-scoped and bounded to what was asked" is a claim about the query rather
 * than about the answer.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const DAILY = { version: 1, frequency: "daily" };

type Row = Record<string, unknown>;

function client(tables: Readonly<Record<string, { data: Row[] | null; error: unknown }>>) {
  const calls: { table: string; in?: [string, unknown[]]; eq: [string, unknown][] }[] = [];
  const supabase = {
    from(table: string) {
      const call: (typeof calls)[number] = { table, eq: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "not", "is"]) builder[method] = () => builder;
      builder.eq = (column: string, value: unknown) => {
        call.eq.push([column, value]);
        return builder;
      };
      builder.in = (column: string, values: unknown[]) => {
        call.in = [column, values];
        return builder;
      };
      builder.then = (resolve: (value: unknown) => unknown) =>
        resolve(tables[table] ?? { data: [], error: null });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

describe("asking by reminder id, and answering in words", () => {
  it("labels an occurrence with its rule, in the reader's locale", async () => {
    const { supabase } = client({
      reminders: { data: [{ id: "r1", series_id: "s1" }], error: null },
      reminder_series: { data: [{ id: "s1", rule: DAILY }], error: null },
    });
    const labels = await loadReminderRepeatLabels(supabase, USER, ["r1"], "pt-BR");
    expect(labels.get("r1")).toBe("Todo dia");

    const { supabase: english } = client({
      reminders: { data: [{ id: "r1", series_id: "s1" }], error: null },
      reminder_series: { data: [{ id: "s1", rule: DAILY }], error: null },
    });
    expect((await loadReminderRepeatLabels(english, USER, ["r1"], "en")).get("r1"))
      .toBe("Every day");
  });

  it("labels every occurrence of one series from a single rule read", async () => {
    // Two occurrences, one rule. Grouping by series is what keeps this one query
    // rather than one per row.
    const { supabase, calls } = client({
      reminders: {
        data: [{ id: "r1", series_id: "s1" }, { id: "r2", series_id: "s1" }],
        error: null,
      },
      reminder_series: { data: [{ id: "s1", rule: DAILY }], error: null },
    });
    const labels = await loadReminderRepeatLabels(supabase, USER, ["r1", "r2"], "pt-BR");
    expect(labels.get("r1")).toBe("Todo dia");
    expect(labels.get("r2")).toBe("Todo dia");
    expect(calls.filter((call) => call.table === "reminder_series")).toHaveLength(1);
  });

  it("says nothing about a reminder that carries no rule", async () => {
    const { supabase } = client({
      reminders: { data: [], error: null },
      reminder_series: { data: [], error: null },
    });
    expect((await loadReminderRepeatLabels(supabase, USER, ["r1"], "pt-BR")).size).toBe(0);
  });

  it("asks nothing at all when there are no ids", async () => {
    const { supabase, calls } = client({});
    expect((await loadReminderRepeatLabels(supabase, USER, [], "pt-BR")).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("issues no rule query when none of the ids repeat", async () => {
    // The second read is skipped rather than issued with an empty list, which is
    // the difference between "nothing repeats here" and a wasted round trip on
    // every calendar load in an account that has no recurring reminder.
    const { supabase, calls } = client({
      reminders: { data: [], error: null },
    });
    await loadReminderRepeatLabels(supabase, USER, ["r1", "r2"], "pt-BR");
    expect(calls.filter((call) => call.table === "reminder_series")).toHaveLength(0);
  });

  it("is owner-scoped and bounded to the ids it was asked about", async () => {
    const { supabase, calls } = client({
      reminders: { data: [{ id: "r1", series_id: "s1" }], error: null },
      reminder_series: { data: [{ id: "s1", rule: DAILY }], error: null },
    });
    await loadReminderRepeatLabels(supabase, USER, ["r1", "r1", "r2"], "pt-BR");

    const occurrences = calls.find((call) => call.table === "reminders");
    // Deduplicated, and the owner stated in the query rather than left to RLS
    // alone — the belt to RLS's braces that this repository applies everywhere.
    expect(occurrences?.in).toEqual(["id", ["r1", "r2"]]);
    expect(occurrences?.eq).toContainEqual(["user_id", USER]);

    const series = calls.find((call) => call.table === "reminder_series");
    expect(series?.eq).toContainEqual(["user_id", USER]);
  });

  it("returns nothing rather than throwing when a read fails", async () => {
    /*
      A degradation, not an exception. The caller is a calendar or a list that
      has real reminders to render; losing the "repeats" note costs a label, and
      throwing would cost the whole surface.
    */
    const failed = client({ reminders: { data: null, error: { message: "denied" } } });
    expect((await loadReminderRepeatLabels(failed.supabase, USER, ["r1"], "pt-BR")).size).toBe(0);

    const halfFailed = client({
      reminders: { data: [{ id: "r1", series_id: "s1" }], error: null },
      reminder_series: { data: null, error: { message: "denied" } },
    });
    expect((await loadReminderRepeatLabels(halfFailed.supabase, USER, ["r1"], "pt-BR")).size)
      .toBe(0);
  });

  it("withholds the label when the stored rule does not parse", async () => {
    // The CHECK constraint makes this unreachable through the product. If it
    // ever is reached, no label is better than a wrong one — the surface still
    // says the row repeats through its own badge.
    const { supabase } = client({
      reminders: { data: [{ id: "r1", series_id: "s1" }], error: null },
      reminder_series: { data: [{ id: "s1", rule: { version: 9, frequency: "hourly" } }], error: null },
    });
    expect((await loadReminderRepeatLabels(supabase, USER, ["r1"], "pt-BR")).size).toBe(0);
  });

  it("never returns a rule, only a sentence", async () => {
    const { supabase } = client({
      reminders: { data: [{ id: "r1", series_id: "s1" }], error: null },
      reminder_series: {
        data: [{ id: "s1", rule: { version: 1, frequency: "monthlyWeekday", ordinal: -1, weekday: 6 } }],
        error: null,
      },
    });
    const label = await loadReminderRepeatLabels(supabase, USER, ["r1"], "pt-BR");
    // `sábado` is masculine, so "Todo último sábado" — the agreement every
    // surface inherits by calling one formatter.
    expect(label.get("r1")).toBe("Todo último sábado do mês");
    expect(label.get("r1")).not.toContain("monthlyWeekday");
    expect(label.get("r1")).not.toContain("-1");
  });
});

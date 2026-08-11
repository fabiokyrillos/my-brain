import { describe, expect, it } from "vitest";

import { findPlannerConflicts, PLANNER_CONFLICT_KINDS, type PlannerConflictInput } from "./planner-conflicts";
import { parseLocalDate } from "@/lib/time/local-day";

/**
 * `2M-PLAN-007`/`-008` and `2M-TIME-004`.
 *
 * Table-driven, as the implementation plan's "tests first" clause asks, and with
 * the DST cases in **both directions and both hemispheres** — because two of the
 * three conflicts are questions about which local day an instant falls on, and a
 * transition is where a day is 23 or 25 hours long.
 *
 * The `-008` half is asserted as an absence: this module returns statements and
 * has no writer, so a conflict cannot be resolved by finding one.
 */

const SAO_PAULO = "America/Sao_Paulo";
const NEW_YORK = "America/New_York";
const TODAY = parseLocalDate("2026-08-15")!;

function item(overrides: Partial<PlannerConflictInput> & Pick<PlannerConflictInput, "taskId" | "commitment" | "at">): PlannerConflictInput {
  return { dueAt: null, ...overrides };
}

const find = (items: readonly PlannerConflictInput[], today = TODAY, timeZone = SAO_PAULO) =>
  findPlannerConflicts({ items, today, timeZone });

describe("the vocabulary is closed and each member is reachable", () => {
  it("declares three kinds", () => {
    expect([...PLANNER_CONFLICT_KINDS]).toEqual([
      "double_booking",
      "intention_after_deadline",
      "intention_in_the_past",
    ]);
  });

  it("produces every one of them, so none is a member nothing can reach", () => {
    const conflicts = find([
      item({ taskId: "a", commitment: "committed", at: "2026-08-15T17:00:00.000Z" }),
      item({ taskId: "b", commitment: "committed", at: "2026-08-15T17:00:00.000Z" }),
      item({ taskId: "c", commitment: "intended", at: "2026-08-20T13:00:00.000Z", dueAt: "2026-08-18T13:00:00.000Z" }),
      item({ taskId: "d", commitment: "intended", at: "2026-08-10T13:00:00.000Z" }),
    ]);
    expect(new Set(conflicts.map((conflict) => conflict.kind)))
      .toEqual(new Set(PLANNER_CONFLICT_KINDS));
  });
});

describe("double booking is about two commitments at one instant", () => {
  it("reports the pair, sorted, once", () => {
    const conflicts = find([
      item({ taskId: "b", commitment: "committed", at: "2026-08-15T17:00:00.000Z" }),
      item({ taskId: "a", commitment: "committed", at: "2026-08-15T17:00:00.000Z" }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe("double_booking");
    expect(conflicts[0].taskIds).toEqual(["a", "b"]);
  });

  it("says nothing about two commitments on the same day at different times", () => {
    // Two deadlines on one day is ordinary. Comparing on the day rather than the
    // instant would report every busy Tuesday as a conflict.
    expect(find([
      item({ taskId: "a", commitment: "committed", at: "2026-08-15T17:00:00.000Z" }),
      item({ taskId: "b", commitment: "committed", at: "2026-08-15T19:00:00.000Z" }),
    ])).toEqual([]);
  });

  it("says nothing about two intentions at the same instant", () => {
    // An intention reserves no time (OD-2M-3 A), so two of them cannot collide —
    // and reporting them would be exactly the reclassification option B was
    // refused for.
    expect(find([
      item({ taskId: "a", commitment: "intended", at: "2026-08-20T17:00:00.000Z" }),
      item({ taskId: "b", commitment: "intended", at: "2026-08-20T17:00:00.000Z" }),
    ])).toEqual([]);
  });
});

describe("an intention after its own deadline", () => {
  it("is reported when the planned day is later than the due day", () => {
    const conflicts = find([
      item({ taskId: "a", commitment: "intended", at: "2026-08-20T13:00:00.000Z", dueAt: "2026-08-18T13:00:00.000Z" }),
    ]);
    expect(conflicts.map((conflict) => conflict.kind)).toEqual(["intention_after_deadline"]);
    expect(conflicts[0].day).toBe("2026-08-20");
  });

  it("is not reported when they fall on the same local day", () => {
    // Compared as days, not instants: intending to work on something at 09:00 on
    // the day it is due at 17:00 is the ordinary case, and an instant comparison
    // would report the reverse pair as a conflict too.
    expect(find([
      item({ taskId: "a", commitment: "intended", at: "2026-08-18T21:00:00.000Z", dueAt: "2026-08-18T13:00:00.000Z" }),
    ])).toEqual([]);
  });

  it("is not reported for a task with no deadline at all", () => {
    expect(find([
      item({ taskId: "a", commitment: "intended", at: "2026-08-20T13:00:00.000Z", dueAt: null }),
    ])).toEqual([]);
  });
});

describe("an intention whose day has passed", () => {
  it("is a fact about a day, reported once", () => {
    const conflicts = find([
      item({ taskId: "a", commitment: "intended", at: "2026-08-10T13:00:00.000Z" }),
    ]);
    expect(conflicts.map((conflict) => conflict.kind)).toEqual(["intention_in_the_past"]);
    expect(conflicts[0].day).toBe("2026-08-10");
  });

  it("is not reported for today, which has not passed", () => {
    expect(find([
      item({ taskId: "a", commitment: "intended", at: "2026-08-15T13:00:00.000Z" }),
    ])).toEqual([]);
  });

  it("reports both facts when both are true, rather than collapsing them", () => {
    // A plan for last Tuesday on a task that was due last Monday is two separate
    // things the user might act on.
    const conflicts = find([
      item({ taskId: "a", commitment: "intended", at: "2026-08-11T13:00:00.000Z", dueAt: "2026-08-10T13:00:00.000Z" }),
    ]);
    expect(conflicts.map((conflict) => conflict.kind))
      .toEqual(["intention_after_deadline", "intention_in_the_past"]);
  });
});

describe("2M-TIME-004 — both directions, both hemispheres", () => {
  /*
   * The transitions, and why each pair is the one that matters:
   *
   *   São Paulo, southern, DST *starts* 2026-10-18 (a 23-hour day) and *ends*
   *   2026-02-15 (a 25-hour day). New York, northern, DST starts 2026-03-08 and
   *   ends 2026-11-01.
   *
   * Each case pins an instant on the near side of local midnight, where a UTC
   * slice and an offset-aware reduction disagree, and asserts which day the
   * conflict is reported for. A comparator that added or subtracted a fixed 24
   * hours would land on the wrong side on exactly these days.
   */

  it("São Paulo, at the spring transition: a late-evening intention stays on its own day", () => {
    // 21:00 local on 17 Oct is 00:00 UTC on 18 Oct.
    const conflicts = find(
      [item({ taskId: "a", commitment: "intended", at: "2026-10-18T00:00:00.000Z" })],
      parseLocalDate("2026-10-19")!,
      SAO_PAULO,
    );
    expect(conflicts.map((conflict) => conflict.day)).toEqual(["2026-10-17"]);
  });

  it("São Paulo, at the autumn transition: the same, on the 25-hour side", () => {
    const conflicts = find(
      [item({ taskId: "a", commitment: "intended", at: "2026-02-15T01:30:00.000Z" })],
      parseLocalDate("2026-02-20")!,
      SAO_PAULO,
    );
    // 01:30 UTC on the 15th is 22:30 local on the 14th in a UTC-3 zone.
    expect(conflicts.map((conflict) => conflict.day)).toEqual(["2026-02-14"]);
  });

  it("New York, at the spring transition: an intention that has not passed is not reported", () => {
    // 20:00 local on 8 Mar is 00:00 UTC on 9 Mar. Today is the 8th locally, so
    // this must NOT be reported — a UTC reduction would call it the 9th, which
    // is the future, and a naive "yesterday" comparison would call it past.
    expect(find(
      [item({ taskId: "a", commitment: "intended", at: "2026-03-09T00:00:00.000Z" })],
      parseLocalDate("2026-03-08")!,
      NEW_YORK,
    )).toEqual([]);
  });

  it("New York, at the autumn transition: a past intention is still reported", () => {
    const conflicts = find(
      [item({ taskId: "a", commitment: "intended", at: "2026-11-02T02:00:00.000Z" })],
      parseLocalDate("2026-11-05")!,
      NEW_YORK,
    );
    // 02:00 UTC on 2 Nov is 21:00 local on 1 Nov, after the fall back to UTC-5.
    expect(conflicts.map((conflict) => conflict.day)).toEqual(["2026-11-01"]);
  });
});

describe("2M-PLAN-008 — nothing is resolved by looking", () => {
  it("returns statements and mutates nothing it was given", () => {
    const items: PlannerConflictInput[] = [
      item({ taskId: "a", commitment: "intended", at: "2026-08-10T13:00:00.000Z", dueAt: "2026-08-09T13:00:00.000Z" }),
    ];
    const snapshot = JSON.parse(JSON.stringify(items));
    const conflicts = find(items);
    expect(items).toEqual(snapshot);
    // Every field is a statement: a kind, the ids it is about, and a day. There
    // is no suggested value, no proposed patch and no resolution.
    for (const conflict of conflicts) {
      expect(Object.keys(conflict).sort()).toEqual(["day", "kind", "taskIds"]);
    }
  });

  it("is stable across two identical calls, so an announcement is about a change", () => {
    const items: PlannerConflictInput[] = [
      item({ taskId: "b", commitment: "intended", at: "2026-08-10T13:00:00.000Z" }),
      item({ taskId: "a", commitment: "intended", at: "2026-08-11T13:00:00.000Z" }),
    ];
    expect(find(items)).toEqual(find(items));
  });

  it("ignores an unreadable instant instead of inventing a day for it", () => {
    expect(find([item({ taskId: "a", commitment: "intended", at: "" })])).toEqual([]);
  });
});

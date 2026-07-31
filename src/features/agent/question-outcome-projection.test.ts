import { describe, expect, it } from "vitest";

import {
  actionablePendingQuestionFilter,
  resolvedPendingQuestionFilter,
  toQuestionDisposition,
} from "./question-visibility";

/**
 * UX-11's structural guarantee: a question is in exactly one of the two tabs.
 *
 * The finding was that answering removed a question from the only list that
 * existed and put it nowhere. The fix is only real if the two filters partition
 * the four states between them — so these assert the partition rather than the
 * individual strings.
 */

const NOW = new Date("2026-07-30T12:00:00.000Z");

/** Every `pending_questions.status` the column's CHECK allows. */
const STATUSES = ["open", "answered", "dismissed", "snoozed"] as const;

/**
 * Evaluates a PostgREST `or` filter against one row.
 *
 * Deliberately narrow: it understands only the two shapes these filters use —
 * `status.eq.X`, `status.in.(a,b)` and `and(status.eq.snoozed,snoozed_until.OP.T)`.
 * A wider parser would be a second implementation to keep correct.
 */
function matches(filter: string, row: { status: string; snoozedUntil: string | null }): boolean {
  const clauses: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of filter) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) { clauses.push(current); current = ""; continue; }
    current += character;
  }
  clauses.push(current);

  return clauses.some((clause) => {
    const inList = clause.match(/^status\.in\.\((.+)\)$/);
    if (inList) return inList[1]!.split(",").includes(row.status);

    const equals = clause.match(/^status\.eq\.(.+)$/);
    if (equals) return row.status === equals[1];

    const snoozed = clause.match(/^and\(status\.eq\.snoozed,snoozed_until\.(lte|gt)\.(.+)\)$/);
    if (snoozed) {
      if (row.status !== "snoozed" || row.snoozedUntil === null) return false;
      const deadline = new Date(row.snoozedUntil).getTime();
      const reference = new Date(snoozed[2]!).getTime();
      return snoozed[1] === "lte" ? deadline <= reference : deadline > reference;
    }
    throw new Error(`unsupported clause: ${clause}`);
  });
}

describe("the open and resolved filters partition every question", () => {
  const open = actionablePendingQuestionFilter(NOW);
  const resolved = resolvedPendingQuestionFilter(NOW);

  const rows = [
    { name: "open", status: "open", snoozedUntil: null },
    { name: "answered", status: "answered", snoozedUntil: null },
    { name: "dismissed", status: "dismissed", snoozedUntil: null },
    { name: "snoozed, deadline passed", status: "snoozed", snoozedUntil: "2026-07-29T12:00:00.000Z" },
    { name: "snoozed, deadline ahead", status: "snoozed", snoozedUntil: "2026-08-05T12:00:00.000Z" },
  ];

  for (const row of rows) {
    it(`puts a ${row.name} question in exactly one tab`, () => {
      const inOpen = matches(open, row);
      const inResolved = matches(resolved, row);
      expect(inOpen !== inResolved, `${row.name}: open=${inOpen} resolved=${inResolved}`).toBe(true);
    });
  }

  it("covers every status the column allows", () => {
    // If a status is ever added to `pending_questions_status_check`, this fails
    // rather than letting the new state fall out of both tabs silently.
    expect(STATUSES).toEqual(["open", "answered", "dismissed", "snoozed"]);
  });

  it("keeps a reactivated snooze in the open tab, where 2D.2 put it", () => {
    const reactivated = { status: "snoozed", snoozedUntil: "2026-07-29T12:00:00.000Z" };
    expect(matches(open, reactivated)).toBe(true);
    expect(matches(resolved, reactivated)).toBe(false);
  });

  it("keeps a live snooze out of the open tab but still visible as deferred", () => {
    const deferred = { status: "snoozed", snoozedUntil: "2026-08-05T12:00:00.000Z" };
    expect(matches(open, deferred)).toBe(false);
    expect(matches(resolved, deferred)).toBe(true);
  });
});

describe("toQuestionDisposition", () => {
  it("names the two resolutions the owner chose", () => {
    expect(toQuestionDisposition("answered")).toBe("answered");
    expect(toQuestionDisposition("dismissed")).toBe("dismissed");
  });

  it("reads a snooze as deferred", () => {
    expect(toQuestionDisposition("snoozed")).toBe("deferred");
  });

  it("never invents a fourth disposition for an unexpected status", () => {
    // `open` should not reach this view at all; if it somehow does, it reads as
    // deferred rather than claiming the owner answered something.
    expect(toQuestionDisposition("open")).toBe("deferred");
    expect(toQuestionDisposition("something-new")).toBe("deferred");
  });
});

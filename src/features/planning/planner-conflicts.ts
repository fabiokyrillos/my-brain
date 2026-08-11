/**
 * `2M-PLAN-007`/`-008` — the conflicts a day can hold, named and never resolved.
 *
 * ## The requirement's own words, and the two halves of it
 *
 * `-007`: "Conflicts are visible and named — two committed items at the same
 * instant, an intention on a day whose deadline has passed, an intention in the
 * past — and each is stated as a fact rather than as a correction the product
 * has already applied."
 *
 * `-008`: "A conflict is never auto-resolved. Resolving one is an explicit,
 * confirmed operation with a truthful result and an undo."
 *
 * So this module **detects and returns**. It has no writer, no clock of its own,
 * and no notion of a fix. Everything it produces is rendered as a statement; the
 * only way anything moves is the user pressing one of the taxonomy's own
 * controls, which is `2M-PLAN-005` and is enforced elsewhere by a guard.
 *
 * ## Why it is pure, table-driven and takes its "today" as an argument
 *
 * Two of the three conflicts are questions about *which local day* an instant
 * falls on, and this repository has now paid three times for a local day derived
 * somewhere other than the one contract. Passing `today` in — a `LocalDate` the
 * caller resolved from `profiles.timezone` — is what stops this file growing a
 * fourth implementation, and what makes the DST cases in its test file
 * assertions rather than aspirations.
 *
 * ## Why "conflict" is not "error"
 *
 * None of these is the user doing something wrong, and the copy never says so.
 * An intention whose day has passed is the most common of the three and the most
 * ordinary: it means a day went by. `2M-PLAN-007` asks for a *fact*, and the
 * distinction is load-bearing — a product that framed it as a mistake would be
 * pressing the user to clear a plan the product itself has no opinion about.
 */

import {
  compareLocalDates,
  formatLocalDate,
  type LocalDate,
} from "@/lib/time/local-day";

import { plannedLocalDate } from "./planned-at";

/**
 * The three kinds, closed.
 *
 * `double_booking` is the only one about two items; the other two are about one
 * item's two dates, or one item's date and today. Keeping them in one vocabulary
 * is what lets the surface render them in one region with one announcement.
 */
export const PLANNER_CONFLICT_KINDS = [
  /** Two committed items claim the same instant. Neither is an intention. */
  "double_booking",
  /** An intention for a day *after* the task's own deadline. */
  "intention_after_deadline",
  /** An intention for a day that has already gone by. */
  "intention_in_the_past",
] as const;

export type PlannerConflictKind = (typeof PLANNER_CONFLICT_KINDS)[number];

/**
 * One item a day holds, reduced to what a conflict can be decided from.
 *
 * **No title and no content.** A conflict is reported by task id, and the
 * surface joins it back to a row it has already put through the sensitivity
 * derivation. A shape carrying a title would make it possible to render one from
 * here without that derivation, which is the divergence `2L` found on Hoje and
 * `2M-PRIVACY-*` exists to prevent.
 */
export type PlannerConflictInput = {
  readonly taskId: string;
  /** `committed` for a deadline or a reminder, `intended` for a planned day. */
  readonly commitment: "committed" | "intended";
  /** The instant this item claims, as stored. */
  readonly at: string;
  /** The task's own deadline, when it has one. */
  readonly dueAt?: string | null;
};

export type PlannerConflict = {
  readonly kind: PlannerConflictKind;
  /** Every task the statement is about — two for a double booking, one otherwise. */
  readonly taskIds: readonly string[];
  /**
   * The local day the statement is about, `YYYY-MM-DD`.
   *
   * A day and never an instant: `2M-PLAN-007` is about days a user planned, and
   * an instant here would invite a surface to render a time the user never
   * chose (`2M-PLAN-001`, consequence 1).
   */
  readonly day: string;
};

/**
 * Every conflict a set of items holds, in a stable order.
 *
 * Stable because the surface announces the count and lists them: an unstable
 * order would make two identical loads look like a change, and `2M-ACCESS-004`
 * requires the announcement to be about something that actually happened.
 */
export function findPlannerConflicts(input: {
  readonly items: readonly PlannerConflictInput[];
  readonly today: LocalDate;
  readonly timeZone: string;
}): readonly PlannerConflict[] {
  const { items, today, timeZone } = input;
  const conflicts: PlannerConflict[] = [];

  /*
   * 1. Two committed items at the same instant.
   *
   * Compared on the *instant*, not on the day — two deadlines on one day are
   * ordinary and two at 14:00 are not. Intentions are excluded by the
   * requirement's own wording ("two committed items"), and correctly: an
   * intention reserves no time (OD-2M-3 A), so two of them cannot collide.
   */
  const committed = items.filter((item) => item.commitment === "committed");
  const byInstant = new Map<string, string[]>();
  for (const item of committed) {
    const held = byInstant.get(item.at);
    if (held) held.push(item.taskId);
    else byInstant.set(item.at, [item.taskId]);
  }
  for (const [at, taskIds] of byInstant) {
    if (taskIds.length < 2) continue;
    const day = plannedLocalDate(at, timeZone);
    if (day === null) continue;
    conflicts.push({
      kind: "double_booking",
      // Sorted so the pair reads the same on every load.
      taskIds: [...taskIds].sort(),
      day: formatLocalDate(day),
    });
  }

  /*
   * 2 and 3, both about one intention.
   *
   * Ordered by task id for the same stability reason, and each item may produce
   * both: a plan for last Tuesday on a task that was due last Monday is two
   * separate facts, and collapsing them would hide one of the two things the
   * user might act on.
   */
  const intentions = [...items]
    .filter((item) => item.commitment === "intended")
    .sort((left, right) => (left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0));

  for (const item of intentions) {
    const plannedDay = plannedLocalDate(item.at, timeZone);
    if (plannedDay === null) continue;
    const day = formatLocalDate(plannedDay);

    const dueDay = plannedLocalDate(item.dueAt ?? null, timeZone);
    if (dueDay !== null && compareLocalDates(plannedDay, dueDay) > 0) {
      conflicts.push({ kind: "intention_after_deadline", taskIds: [item.taskId], day });
    }

    if (compareLocalDates(plannedDay, today) < 0) {
      conflicts.push({ kind: "intention_in_the_past", taskIds: [item.taskId], day });
    }
  }

  return conflicts;
}

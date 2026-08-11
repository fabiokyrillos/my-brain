/**
 * `2M-PLAN-001` — what `tasks.planned_at` **means**, declared once.
 *
 * ## The requirement, and why a module rather than a paragraph
 *
 * "`planned_at` has one declared meaning, stated in one module, and every
 * surface that renders or edits it reads that declaration rather than restating
 * it."
 *
 * The audit that opened this phase found the column **write-then-display**: it
 * was stored, audited, editable by command and rendered on two surfaces, and a
 * search over every PostgREST predicate and ordering position found **no read of
 * it anywhere**. What a column with no reader accumulates is not a bug — it is
 * an unstated meaning, and each surface that later needs one invents its own.
 * Two surfaces had already begun: the Work list rendered it with an inline
 * `pt ? "Planejado: " : "Planned: "`, and the calendar decided independently
 * that it belonged in a lane called `intention`.
 *
 * ## The declaration
 *
 * **OD-2M-3 option A, signed in ADR-105:** `planned_at` is *the intention to
 * work on something that day*.
 *
 * It is **not a commitment** — that is `due_at` — and it is **not a reserved
 * time**. Option B, redefining it as a commitment, was refused because it would
 * silently reclassify data users had already entered under the other meaning.
 * Option C, a separate event entity with a duration and participants, was
 * deferred with its trigger named.
 *
 * Three consequences follow, and they are the whole reason the meaning has to be
 * written down:
 *
 *  1. **The time of day is not part of the intention.** The column is a
 *     `timestamptz` because that is what the schema had; what the user chose is a
 *     *day*, in their own zone. Every read here therefore reduces the instant to
 *     a local day, and no surface may present the clock component as a plan.
 *  2. **Nothing may treat it as a deadline.** It arms no reminder, it makes
 *     nothing overdue, and a day that has passed with the task still open is not
 *     a failure — `clear_planned` and `set_planned` are how a user says so.
 *  3. **It is always the user's own statement.** Nothing in this product may
 *     write it without a confirmed command (`2M-PLAN-005`), which is why the two
 *     verbs below are read from the taxonomy rather than listed.
 *
 * ## What this module deliberately does not own
 *
 * It does not own every *word* a surface uses. The calendar calls its lane
 * "Intenção" and history calls the column "Data planejada"; those are two
 * different things being named — a lane and a column — and collapsing them would
 * be a worse product, not a more consistent one. What is unified is the
 * **semantics**: the commitment class, the two write verbs, the reduction to a
 * local day, and the ordering. `planned-at-declaration.test.ts` is what stops a
 * second copy of any of those appearing.
 */

import type { CalendarCommitment } from "@/features/calendar/calendar-query";
import {
  TASK_COMMAND_ACTIONS,
  actionPolicy,
  type TaskCommandAction,
} from "@/features/task-commands/taxonomy";
import {
  compareLocalDates,
  formatLocalDate,
  localDateOf,
  type LocalDate,
} from "@/lib/time/local-day";

/**
 * The signed meaning, as a value rather than as prose.
 *
 * `intended`, and never `committed`. Read by the calendar's lane mapping and by
 * the planner, so a surface cannot decide on its own that a plan is a promise.
 */
export const PLANNED_AT_COMMITMENT: CalendarCommitment = "intended";

/** The column, named once so a query cannot misspell it into a silent 42703. */
export const PLANNED_AT_COLUMN = "planned_at";

/**
 * Every action that writes the column, **derived** from the taxonomy.
 *
 * `set_planned` and `clear_planned` today. Derived rather than listed because
 * the second of those did not exist three commits ago, and the surfaces that
 * consume this were written before it did: a list would have needed editing in
 * as many places as there are readers, and a missed one is a surface that
 * silently stops offering a verb the user has.
 */
export const PLANNED_AT_WRITE_ACTIONS: readonly TaskCommandAction[] =
  TASK_COMMAND_ACTIONS.filter((action) =>
    actionPolicy(action).changedFields.includes("planned_at"));

/**
 * The day a stored instant means, in the user's own zone.
 *
 * The single most important function here, because it is the one every surface
 * would otherwise write for itself — and `new Date(iso).toISOString().slice(0, 10)`
 * is the version they would write. That version is wrong for exactly the users
 * this product has: an intention stored at 23:00 in São Paulo is 02:00 UTC the
 * next day, so a UTC slice reports a plan the user made for Thursday as a plan
 * for Friday. The online calendar journey found that defect in a probe five days
 * ago; this is the same defect one layer down, and it is prevented by there
 * being nowhere else to compute it.
 *
 * Returns null for an absent or unparseable instant, so a caller cannot get a
 * plausible wrong day out of a broken value.
 */
export function plannedLocalDate(instant: string | null | undefined, timeZone: string): LocalDate | null {
  if (typeof instant !== "string" || instant === "") return null;
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return null;
  return localDateOf(parsed, timeZone);
}

/** `YYYY-MM-DD` in the user's zone, or null. The form a URL and a key use. */
export function plannedDayKey(instant: string | null | undefined, timeZone: string): string | null {
  const date = plannedLocalDate(instant, timeZone);
  return date === null ? null : formatLocalDate(date);
}

/** Whether a stored instant is the user's intention for exactly this local day. */
export function isPlannedOnLocalDate(
  instant: string | null | undefined,
  day: LocalDate,
  timeZone: string,
): boolean {
  const planned = plannedLocalDate(instant, timeZone);
  return planned !== null && compareLocalDates(planned, day) === 0;
}

/**
 * How a *planned day* compares to another, earliest first.
 *
 * **An absent plan sorts last, in both directions.** That is a deliberate
 * asymmetry and not an oversight: "no intention" is not a very late intention,
 * and a descending sort that floated every unplanned task to the top would bury
 * the planned ones the ordering was chosen to surface. PostgREST expresses the
 * same rule with `nullsFirst: false` on both directions, and
 * `planned-at-declaration.test.ts` pins the two against each other.
 */
export function comparePlannedAt(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: "asc" | "desc" = "asc",
): number {
  const a = typeof left === "string" && left !== "" ? left : null;
  const b = typeof right === "string" && right !== "" ? right : null;
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a === b) return 0;
  return (a < b ? -1 : 1) * (direction === "asc" ? 1 : -1);
}

/**
 * The words for a task's own planned day, in the two locales.
 *
 * Here rather than in each surface's `copy.ts` because these three strings are
 * the *declaration* being rendered — "planned", "not planned", and the fact that
 * the value is a day. A surface that wrote its own would be free to write
 * "Agendado para", which claims a commitment the column does not carry.
 */
export type PlannedAtCopy = {
  /** Field label: what the value is. */
  readonly label: string;
  /** Inline prefix, for a list row that shows the day beside other metadata. */
  readonly prefix: string;
  /** What to say when there is none. Never an empty string. */
  readonly none: string;
  /** The action of removing it, for an affordance that is not a taxonomy button. */
  readonly clear: string;
};

const PT_BR: PlannedAtCopy = {
  label: "Dia planejado",
  prefix: "Planejado para",
  none: "Sem dia planejado",
  clear: "Tirar o dia planejado",
};

const EN: PlannedAtCopy = {
  label: "Planned day",
  prefix: "Planned for",
  none: "No planned day",
  clear: "Remove the planned day",
};

export function getPlannedAtCopy(locale: string): PlannedAtCopy {
  return locale === "en" ? EN : PT_BR;
}

/**
 * The declared day, formatted for a reader — **a date, never a time**.
 *
 * Consequence 1 of the declaration, made unavoidable: a surface that wanted to
 * show "14/08 09:00" would have to build its own formatter, and the guard test
 * fails a `timeStyle` applied to this column anywhere.
 */
export function formatPlannedDay(
  instant: string | null | undefined,
  locale: string,
  timeZone: string,
): string | null {
  const parsed = typeof instant === "string" && instant !== "" ? new Date(instant) : null;
  if (parsed === null || Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(parsed);
}

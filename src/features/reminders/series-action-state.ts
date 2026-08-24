import type { ReminderSeriesScope } from "./series-schema";

/**
 * The repeating reminder's form state, and its idle value.
 *
 * ## Why this is not in `series-actions.ts`
 *
 * That module carries `"use server"`, and **a `"use server"` module may export
 * nothing but async functions**. Exporting the idle constant alongside the
 * Server Action compiles, typechecks, passes every unit test, and then throws
 * at request time:
 *
 *     A "use server" file can only export async functions, found object.
 *
 * `action-state.ts` and `memories/edit-state.ts` exist for the same reason.
 * This is a framework constraint, not a stylistic preference.
 *
 * ## Why `scope` is on the state
 *
 * `2R-SERIES-009` requires the surface to state **which scope was applied**,
 * and to state the one the database applied rather than the one that was asked
 * for. Carrying it here rather than deriving it from the submitted form is what
 * makes that difference expressible: if the two ever disagreed, a surface
 * reading its own request would report the disagreement away.
 */
export type ReminderSeriesActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
  /** The series that now exists, or the one that was changed. */
  readonly seriesId: string | null;
  /** The scope the database reports it applied. `null` for a create or an end. */
  readonly scope: ReminderSeriesScope | null;
  /**
   * `2R-SERIES-007`/`-008` — the ledger row this operation wrote, or `null`.
   *
   * **The offer of an undo is this field being non-null, and nothing else.**
   * There is no branch in the surface that can decide an operation is
   * reversible: the id arrives because `apply_reminder_series_command_v1`
   * returned one, which it does exactly when it inserted a compensable row.
   * An operation with no real compensation therefore cannot be given a button
   * that claims one — which is what `2R-SERIES-008` asks for, expressed as a
   * type rather than as a rule somebody has to remember.
   *
   * `null` for a create (slice 2R.3's surface has its own affordance to build)
   * and for every failure.
   */
  readonly undoId: string | null;
};

export const IDLE_REMINDER_SERIES_STATE: ReminderSeriesActionState = {
  status: "idle",
  message: "",
  seriesId: null,
  scope: null,
  undoId: null,
};

/**
 * `2R-SURFACE-002` — the next occurrences, before saving.
 *
 * ## Why the dates are strings and not instants
 *
 * They arrive from `public.reminder_series_preview`, which resolves the rule in
 * the **owner's** profile zone, and they are formatted on the server by the same
 * `Intl` instance bound to that zone. Handing a component an ISO string and a
 * formatter would put a second zone decision in the browser, which is the whole
 * of what `2R-TIME-006` forbids — and the browser's zone is very often right,
 * which is what makes the mistake survive review.
 *
 * ## Why an empty list is a state rather than an error
 *
 * `2R-TRUST-006`: a horizon the rule never reaches produces no row and no guess.
 * A yearly rule anchored beyond the RPC's scan simply has nothing to show, and
 * saying so is different from failing.
 */
export type ReminderSeriesPreviewState = {
  readonly status: "idle" | "ready" | "error";
  /** Already formatted in the owner's zone and locale. Never an ISO instant. */
  readonly occurrences: readonly string[];
  /** A sentence for the owner when the preview could not be produced. */
  readonly message: string;
  /** The rule in words, so the preview can be checked against what was derived. */
  readonly description: string | null;
};

export const IDLE_REMINDER_SERIES_PREVIEW: ReminderSeriesPreviewState = {
  status: "idle",
  occurrences: [],
  message: "",
  description: null,
};

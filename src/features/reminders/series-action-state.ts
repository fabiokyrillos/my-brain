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

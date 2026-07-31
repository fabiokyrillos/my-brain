import type { ReminderAction } from "./lifecycle";

/**
 * The reminder command's form state, and its idle value.
 *
 * ## Why this is not in `actions.ts`
 *
 * `actions.ts` carries `"use server"`, and **a `"use server"` module may export
 * nothing but async functions**. Exporting the idle constant alongside the
 * Server Action compiles, typechecks, passes every unit test, and then throws at
 * request time:
 *
 *     A "use server" file can only export async functions, found object.
 *
 * The page renders its error boundary, so the failure looks like a data problem
 * rather than a module-shape one. `memories/edit-state.ts` exists for the same
 * reason and this file follows it — the split is a framework constraint, not a
 * stylistic preference, which is why it is written down here rather than left to
 * be rediscovered.
 *
 * The type would be erased at build time and could technically stay in
 * `actions.ts`; it lives here so the state's shape and its initial value are
 * read in one place.
 */
export type ReminderActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
  /** Which row the message belongs to, so one banner cannot label another row. */
  readonly reminderId: string | null;
  readonly action: ReminderAction | null;
};

export const IDLE_REMINDER_ACTION_STATE: ReminderActionState = {
  status: "idle",
  message: "",
  reminderId: null,
  action: null,
};

/**
 * The entity edit surface's state contract.
 *
 * Separate from `actions.ts` for the reason `task-commands/console-state.ts`
 * and `operations/work-action-state.ts` already record: a `"use server"` module
 * may export **only** async functions. Next refuses the build otherwise, since
 * every export of such a module becomes a callable server reference and a plain
 * object cannot be one.
 *
 * It is also the module the client component imports, which keeps the form from
 * importing the action module for a value and dragging the server graph behind
 * it.
 */

/**
 * What the owner submitted, echoed back on a failed round.
 *
 * React 19 **resets an uncontrolled form after a Server Action completes**. On a
 * refused save that is destructive: the field snaps back to the stored value and
 * the edit the user just typed is gone, with an error message above it telling
 * them to fix something they can no longer see.
 *
 * So a failing round returns its own input and the fields default to it. Only on
 * failure — a success should show what was stored, which is now the same thing.
 */
export type EntityEditSubmission = Readonly<Record<string, string>>;

export type EntityEditState = {
  status: "idle" | "success" | "error";
  message: string;
  submitted?: EntityEditSubmission | null;
};

export const idleEntityEditState: EntityEditState = { status: "idle", message: "", submitted: null };

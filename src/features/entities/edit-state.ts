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

/*
 * There is no `createdId` here, and its absence was a correction rather than an
 * omission (EGC.1 adversarial review, finding 11).
 *
 * It existed briefly, carrying the id a creating action had just made, with a
 * comment saying the create-and-select affordance used it to pre-select without
 * re-querying. Nothing read it. What actually selects the new company is
 * `revalidatePath` re-rendering the server component with the stored
 * `organization_id`, which changes the `key` on the company `<select>` and
 * remounts it with the new default — a round trip through the database, which
 * is the stronger mechanism, since a value that never reached storage cannot
 * appear selected. A field whose only consumer was the test asserting it is
 * exactly the consumer-less contract this repository removes on sight.
 */

export const idleEntityEditState: EntityEditState = { status: "idle", message: "", submitted: null };

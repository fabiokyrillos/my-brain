/**
 * The Memories write surfaces' state contracts.
 *
 * Separate from `actions.ts` for the reason `entities/edit-state.ts` and
 * `operations/work-action-state.ts` already record: a `"use server"` module may
 * export **only** async functions. Next refuses the build otherwise, since every
 * export of such a module becomes a callable server reference and a plain object
 * cannot be one.
 *
 * It is also what the client components import, which keeps the forms from
 * pulling the action module in for a value and dragging the server graph — and
 * the `server-only` AI provider behind it — into the browser bundle.
 */

/**
 * What the owner submitted, echoed back on a failed round.
 *
 * React 19 **resets an uncontrolled form once a Server Action completes**. On a
 * refused save that is destructive: the fields snap back to the stored values
 * and the edit the owner just typed is gone, with an error message above it
 * telling them to fix something they can no longer see.
 */
export type MemoryEditSubmission = Readonly<Record<string, string>>;

export type MemoryEditState = {
  status: "idle" | "success" | "error";
  message: string;
  submitted?: MemoryEditSubmission | null;
};

export const idleMemoryEditState: MemoryEditState = { status: "idle", message: "", submitted: null };

/**
 * The proposal's own state (DEC-5).
 *
 * `duplicate` is a success for the owner and a non-write for the database: the
 * sentence they asked to keep is already kept. It carries the existing row's id
 * so the surface can point at it, which is the only useful thing to do with the
 * information — reporting it as a failure would invite a retry that can never
 * succeed and should not.
 */
export type MemoryProposalState = {
  status: "idle" | "success" | "duplicate" | "error";
  message: string;
  memoryId: string | null;
};

export const idleMemoryProposalState: MemoryProposalState = {
  status: "idle",
  message: "",
  memoryId: null,
};

/**
 * `2L-EDIT-008`/`-009` — the undo affordance's own contract.
 *
 * ## Why this is a shared module and not two fields on two states
 *
 * Both Work surfaces can reach an undoable operation, through two different
 * Server Actions with two different result states. The *affordance* is one
 * thing, so its shape is declared once here and both states carry it. A copy
 * per state would be two chances for one of them to keep offering undo after
 * the other stopped.
 *
 * A module of its own rather than an export of a `"use server"` file, for the
 * reason `work-action-state.ts` and `detail-action-state.ts` both give: a
 * Client Component importing a type from an action module pulls the server
 * graph into the browser.
 *
 * ## Why an offer is a value and its absence is `null`
 *
 * `2L-EDIT-009` says an operation the domain cannot reverse **never** offers
 * undo. That is already true at the source: `apply_task_command` returns an
 * `undoId` on `applied` and `undoId: null` on `no_change`, because 2E-UPDATE-009
 * requires a no-change to write no undo row at all. So the affordance is offered
 * exactly when the database wrote something to reverse, and the surface has no
 * decision of its own to get wrong.
 */

/** The window `undo_operations.expires_at` declares, mirrored for copy only. */
export const TASK_UNDO_WINDOW_HOURS = 24;

export type TaskUndoOffer = {
  readonly undoId: string;
  /**
   * When the row stops being undoable, as the database recorded it.
   *
   * Carried so the surface can stop offering a control the router would refuse,
   * rather than discovering it by trying. It is **not** the authority: the
   * router re-reads the row, and a client that ignored this still gets a
   * refusal.
   */
  readonly expiresAt: string;
};

/** What one undo round comes to rest at. */
export type TaskUndoStatus = "idle" | "undone" | "unavailable" | "expired" | "failed";

export type TaskUndoState = {
  readonly status: TaskUndoStatus;
  readonly message: string;
  readonly announcement: string;
};

export const idleTaskUndoState: TaskUndoState = {
  status: "idle",
  message: "",
  announcement: "",
};

/**
 * The rendered state one task-detail edit comes to rest at.
 *
 * A module of its own rather than an export of `detail-actions.ts`, following
 * `console-state.ts` and `operations/work-action-state.ts`: `detail-actions.ts`
 * is `"use server"` and reaches `@/lib/supabase/server`, which carries the
 * `server-only` guard. A Client Component importing the state type from there
 * would pull the server module into the browser graph, and the jsdom gate could
 * not import it at all.
 */

import type { TaskCommandAction } from "./taxonomy";
import type { TaskUndoOffer } from "./task-undo-state";

export type TaskDetailCommandStatus =
  | "idle"
  | "applied"
  | "no_change"
  /** Confirmation was issued for a destructive edit; the user has not spent it. */
  | "awaiting_confirmation"
  /** The row, the transition or the value was refused before any write. */
  | "refused"
  /** The write was attempted and the contract declined it. */
  | "failed";

/**
 * What the Confirm control must send back so the second call reproduces the
 * first call's fingerprint.
 *
 * `apply_task_command` resolves a confirmation by `(auth.uid(), operation key)`
 * and requires the digest of the *same seven values* the issuing call hashed —
 * and one of the seven is `observedBefore`. So the instant the resolution ran
 * against has to travel with the operation key, or the confirm step derives a
 * different digest and the database refuses a cancellation the user genuinely
 * confirmed (`2E_CONFIRMATION_REQUIRED`).
 *
 * Nothing here is authorization and none of it is trusted. A tampered instant
 * or key produces a digest that matches no issued row, and a tampered task id
 * resolves against `auth.uid()` or not at all — so the worst a forged envelope
 * achieves is a refusal. `detail-actions.ts` bounds the instant anyway, because
 * a client-chosen observation instant would otherwise be recorded as fact in
 * the audit trail.
 */
export type TaskDetailPendingConfirmation = {
  readonly action: TaskCommandAction;
  readonly operationKey: string;
  readonly observedBefore: string;
  /** The title resolution returned, so the dialog names what will change. */
  readonly title: string;
};

/**
 * Flat and serializable, because it crosses the Server Action boundary on every
 * round.
 */
export type TaskDetailCommandState = {
  readonly status: TaskDetailCommandStatus;
  readonly action: TaskCommandAction | null;
  readonly heading: string;
  readonly detail: string;
  /** The declared reason behind a refusal or a failure. Never a thrown message. */
  readonly reason: string | null;
  readonly announcement: string;
  readonly pending: TaskDetailPendingConfirmation | null;
  /** A refusal the user acts on by reloading the page. */
  readonly refreshable: boolean;
  readonly retryable: boolean;
  /**
   * `2L-EDIT-008`/`-009` — the reversal the database wrote, or null.
   *
   * The same field the Work list's state carries, declared from the same shared
   * type: the affordance is one thing, and two copies of its shape would be two
   * chances for one surface to keep offering undo after the other stopped.
   */
  readonly undo: TaskUndoOffer | null;
};

export const idleTaskDetailCommandState: TaskDetailCommandState = {
  status: "idle",
  action: null,
  heading: "",
  detail: "",
  reason: null,
  announcement: "",
  pending: null,
  refreshable: false,
  retryable: false,
  undo: null,
};

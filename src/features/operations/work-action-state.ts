/**
 * The rendered state one Work-surface click comes to rest at.
 *
 * A module of its own rather than an export of `actions.ts`, following
 * `task-commands/console-state.ts`: `actions.ts` is `"use server"` and reaches
 * `@/lib/supabase/server`, which carries the `server-only` guard. A Client
 * Component importing the state type from there would pull the server module
 * into the browser graph, and the jsdom gate could not import it at all.
 */

import type { WorkSurfaceAction } from "@/features/task-commands/taxonomy";
import type { TaskUndoOffer } from "@/features/task-commands/task-undo-state";

export type WorkItemActionStatus = "idle" | "applied" | "no_change" | "refused" | "failed";

/**
 * Flat and serializable, because it crosses the Server Action boundary on every
 * round.
 *
 * `title` is the **current** title from click-time resolution (2F-SURFACE-004),
 * and is null whenever no row was resolved — a refusal carries no task content,
 * the same discipline `staleShell` follows in the preview.
 */
export type WorkItemActionState = {
  readonly status: WorkItemActionStatus;
  readonly taskId: string | null;
  readonly action: WorkSurfaceAction | null;
  readonly title: string | null;
  readonly heading: string;
  readonly detail: string;
  readonly announcement: string;
  /** A refusal the user can act on by reloading the list. */
  readonly refreshable: boolean;
  readonly retryable: boolean;
  /**
   * `2L-EDIT-008`/`-009` — the reversal the database wrote, or null.
   *
   * Populated straight from `apply_task_command`'s own answer, which returns an
   * `undoId` on `applied` and `null` on `no_change`. So an operation with no
   * domain reversal cannot offer one, and the surface takes no decision it
   * could take wrongly.
   */
  readonly undo: TaskUndoOffer | null;
};

export const idleWorkItemActionState: WorkItemActionState = {
  status: "idle",
  taskId: null,
  action: null,
  title: null,
  heading: "",
  detail: "",
  announcement: "",
  refreshable: false,
  retryable: false,
  undo: null,
};

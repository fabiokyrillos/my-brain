/**
 * The deletion flow's state, kept OUT of `actions.ts` on purpose.
 *
 * A `"use server"` module may export **async functions and nothing else**. A
 * constant or a type exported beside the actions builds locally, passes
 * typecheck, and then fails where it is most expensive to discover — at the
 * RSC boundary, in a production build or on first render. This repository has
 * already shipped two surfaces that were green everywhere except the place they
 * actually ran, which is why `memories/edit-state.ts` exists in the same shape.
 *
 * So the idle state and the state type live here, and `actions.ts` exports four
 * async functions and nothing else.
 */

import type { DeletionOutcome } from "./contracts";
import type { ParsedDeletionConfirmation, ParsedDeletionPreview } from "./schema";

export type DeletionState = {
  readonly status: "idle" | "previewed" | "confirmed" | "deleted" | "undone" | "error";
  readonly outcome: DeletionOutcome | null;
  readonly message: string | null;
  readonly preview: ParsedDeletionPreview | ParsedDeletionConfirmation | null;
  readonly undoId: string | null;
};

export const IDLE_DELETION_STATE: DeletionState = {
  status: "idle",
  outcome: null,
  message: null,
  preview: null,
  undoId: null,
};

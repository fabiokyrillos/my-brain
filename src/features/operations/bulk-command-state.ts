/**
 * The rendered state one bulk operation comes to rest at.
 *
 * A module of its own rather than an export of `actions.ts`, following
 * `work-action-state.ts` and `detail-action-state.ts`: `actions.ts` is
 * `"use server"` and reaches `@/lib/supabase/server`, whose `server-only` guard
 * throws the moment a Client Component module imports it.
 *
 * The `summary` is carried whole rather than flattened to counts, because
 * `2L-BULK-009` requires the result to say **why each item did not apply** and
 * `2L-BULK-012` requires undo to be offered for the applied subset only — both
 * of which are per-item facts that a pair of numbers cannot hold.
 */

import type { BulkSummary } from "./bulk-result";

export type BulkCommandState = {
  readonly status: "idle" | "settled" | "refused";
  /** The verb that was applied, for the result's own sentence. */
  readonly action: string | null;
  readonly message: string;
  readonly announcement: string;
  /** Null until a run actually happened; a refusal never invents one. */
  readonly summary: BulkSummary | null;
};

export const idleBulkCommandState: BulkCommandState = {
  status: "idle",
  action: null,
  message: "",
  announcement: "",
  summary: null,
};

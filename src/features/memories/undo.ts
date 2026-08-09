/**
 * `2K-ACT-008` / `2K-ACT-009` — the conversational undo of a confirmed memory.
 *
 * ## What OD-2K-3 decided, and what it forbids
 *
 * The undo **archives**. It does not physically remove. Provenance is
 * preserved, the memory leaves the active context, authorization and owner
 * scope are unchanged, and the UI says **explicitly** that the memory was
 * archived or withdrawn from use — and **never** that it was deleted.
 *
 * The one outcome the decision forbids is the comfortable lie: a control
 * labelled "undo" that leaves the row in place while letting the user believe
 * it is gone. That lie would be told in exactly two places — in the words, and
 * in which transition is reused — so this module owns both, and `undo.test.ts`
 * asserts the words **negatively** in both locales.
 *
 * ## Why this costs no migration
 *
 * `setMemoryLifecycle` already implements the archive transition: it stamps
 * `valid_until`, writes an audit row with before and after states, and is
 * owner-scoped by an explicit `user_id` predicate on top of forced RLS. It is
 * also already the product's signed answer to "this stopped being true" —
 * `memories` has no delete path by standing product decision, even though
 * `authenticated` holds `delete`. Registering a handler in `undo_operation`
 * *would* cost a migration and is out under OD-2K-C.
 *
 * ## Why the archive really does withdraw the memory from use
 *
 * `chat/actions.ts` filters retrieved memories through `isMemoryInForce`, which
 * reads the same `valid_from`/`valid_until` window the Memories badge reads.
 * So an archived memory stops being retrievable as a source rather than merely
 * leaving a list — which is the property that makes "undo" true rather than
 * decorative, and it is asserted in `undo.test.ts` and in
 * `supabase/tests/phase_2k_memory_undo.sql`.
 */

import type { ConversationCardReversal, ConversationCardState } from "@/features/conversation-cards/contracts";

import type { MemoryProposalState } from "./edit-state";

/**
 * The transition the undo reuses.
 *
 * A named constant rather than a string at the call site, so a drift to
 * anything resembling a delete is a one-line diff a reviewer cannot miss and a
 * test catches.
 */
export const MEMORY_UNDO_TRANSITION = "archive" as const;

/** `2K-CARD-009`: the memory's own reversal, never the task card's window. */
export const MEMORY_UNDO_REVERSAL: ConversationCardReversal = { kind: "archival" };

/**
 * `2K-ACT-009` — whether an undo-of-the-undo may be offered.
 *
 * It may. `setMemoryLifecycle`'s `restore` transition is the audited,
 * owner-scoped inverse: it clears `valid_until`, writes its own audit row with
 * before and after states, and returns the memory to force. The requirement's
 * condition — "only if the current domain can prove it safely" — is met, so
 * declaring its absence would be the inaccuracy rather than the caution.
 *
 * A function rather than a boolean constant because the answer is a claim about
 * the domain, and a function is where the reason lives next to it.
 */
export function memoryUndoIsReversible(): boolean {
  return true;
}

/**
 * `2K-ACT-006` — the proposal's outcome, as a card state.
 *
 * Exhaustive over the status union, so a fifth status added later fails the
 * build here rather than falling through to a default that would quietly
 * report it as something else.
 *
 * `duplicate` maps to `no_change` and not to `accepted`, and that distinction
 * is the whole requirement: the sentence the owner asked to keep is kept, but
 * **this turn created nothing**. Reporting it as `accepted` would claim a write
 * that did not happen — and it is also why the undo control is withheld for a
 * duplicate: archiving a memory this turn did not create would act on
 * something the user never asked about.
 */
export function memoryProposalCardState(
  status: MemoryProposalState["status"],
): ConversationCardState {
  switch (status) {
    case "idle":
      return "requires_confirmation";
    case "success":
      return "accepted";
    case "duplicate":
      return "no_change";
    case "error":
      return "failed";
  }
}

/** True exactly when this turn created the memory, so undoing it is honest. */
export function memoryUndoIsOffered(state: MemoryProposalState): boolean {
  return state.status === "success" && state.memoryId !== null;
}

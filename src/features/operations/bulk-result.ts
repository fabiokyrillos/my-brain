/**
 * `2L-BULK-008`/`-009`/`-011`/`-012` — what a bulk operation says afterwards.
 *
 * ## The failure this shape exists to make impossible
 *
 * "A bulk action that reports a partial as a success" is the phase's signature
 * failure mode and a release blocker. So the summary has **four kinds**, not a
 * boolean, and `partial` is reachable from exactly one condition: something
 * succeeded and something did not. There is no arm that rounds either way.
 *
 * ## Why `no_change` is counted apart from both
 *
 * Three different facts. An applied item changed. A `no_change` item already
 * held what was asked for, so nothing was written — but nothing was refused
 * either, and reporting it as a refusal would be false while folding it into
 * "applied" would claim a change that did not happen. A run that is entirely
 * no-change is therefore **complete**, not a failure: nothing went wrong.
 *
 * ## Why undo is derived from the offer and not from the outcome
 *
 * `2L-BULK-012` forbids claiming to reverse an item that was not applied. The
 * safest form of that is not to check the outcome but to check whether the
 * database handed back something to reverse: `apply_task_command` returns an
 * `undoId` exactly when it wrote an undo row, and `no_change` writes none
 * (2E-UPDATE-009). An item with no offer cannot appear in `undoable` even if
 * its outcome were mislabelled.
 */

import type { TaskUndoOffer } from "@/features/task-commands/task-undo-state";

/**
 * Why one item did not apply.
 *
 * `unresolvable` deliberately covers **foreign, deleted and never-existed** as
 * one value. All three resolve identically on the command path — an owner-scoped
 * candidate query returns none of them — so there is no branch that could tell
 * them apart and therefore none that could leak which it was
 * (`2L-BULK-011`).
 *
 * `ineligible` is kept distinct, and it reveals nothing: it is reachable only
 * for a row that *did* come back from the caller's own resolution, which means
 * the caller already knew it existed and was theirs. Collapsing it would cost
 * the user the one refusal they can act on — "this task changed while you were
 * choosing" — to protect a fact they already have.
 */
export type BulkItemReason = "unresolvable" | "ineligible" | "invalid_value" | "failed";

export type BulkItemOutcome = {
  readonly taskId: string;
  readonly outcome: "applied" | "no_change" | "refused" | "failed";
  readonly reason?: BulkItemReason;
  /** Present only when the database wrote something to reverse. */
  readonly undo?: TaskUndoOffer;
};

export type BulkSummary = {
  /**
   * `empty` — nothing was attempted.
   * `all_applied` — nothing was refused and nothing failed.
   * `partial` — some items landed and some did not.
   * `none_applied` — something was attempted and nothing landed.
   */
  readonly kind: "empty" | "all_applied" | "partial" | "none_applied";
  readonly appliedCount: number;
  readonly unchangedCount: number;
  readonly refusedCount: number;
  readonly applied: readonly BulkItemOutcome[];
  /** Refused and failed items, in the order they were attempted. */
  readonly notApplied: readonly BulkItemOutcome[];
  /** The applied subset that carries a real reversal — never more. */
  readonly undoable: readonly (BulkItemOutcome & { readonly undo: TaskUndoOffer })[];
  readonly items: readonly BulkItemOutcome[];
};

export function summariseBulk(items: readonly BulkItemOutcome[]): BulkSummary {
  const applied = items.filter((item) => item.outcome === "applied");
  const unchanged = items.filter((item) => item.outcome === "no_change");
  const notApplied = items.filter(
    (item) => item.outcome === "refused" || item.outcome === "failed",
  );

  const landed = applied.length + unchanged.length;
  const kind: BulkSummary["kind"] = items.length === 0
    ? "empty"
    : notApplied.length === 0
      ? "all_applied"
      : landed === 0
        ? "none_applied"
        : "partial";

  return {
    kind,
    appliedCount: applied.length,
    unchangedCount: unchanged.length,
    refusedCount: notApplied.length,
    applied,
    notApplied,
    undoable: applied.filter(
      (item): item is BulkItemOutcome & { undo: TaskUndoOffer } => item.undo !== undefined,
    ),
    items,
  };
}

import type { ReminderAction } from "./lifecycle";
import type { ExpectedReminderState } from "./schema";

/**
 * The operation key a rendered control submits — derived, never random.
 *
 * ## The property that has to hold
 *
 * `apply_reminder_command_v1` reserves `(user_id, operation_key)` in
 * `undo_operations`, so the *same key with the same payload* replays and the
 * same key with a *different* payload is refused. That makes the key the thing
 * that decides whether a double-submitted button applies once or twice, and it
 * has to satisfy two requirements that pull in opposite directions:
 *
 * 1. **A double click must not apply twice.** Two submits of the same control
 *    over the same row state must carry the same key, so the second replays.
 * 2. **A deliberate second action must not be swallowed.** Snoozing twice in a
 *    row must apply twice, so the second must carry a *different* key.
 *
 * A random key per submit satisfies (2) and fails (1). A key fixed per render
 * satisfies (1) and fails (2) — the second snooze would silently no-op.
 *
 * ## Why deriving from the pre-state satisfies both
 *
 * The key is a function of the row's state *as this render saw it*. A double
 * click happens before any re-render, so both submits carry the identical
 * pre-state and therefore the identical key: the second replays. A deliberate
 * second action happens after the row re-rendered with the state the first one
 * produced, so its pre-state differs and so does its key: it applies.
 *
 * This also means the key needs no nonce, no counter and no clock — it is pure,
 * so it can be computed identically on the server if it ever needs to be.
 *
 * ## Why the title is hashed rather than included
 *
 * `title` can be 500 characters and the stored key is bounded at 260
 * (`undo_operations_operation_key_check`, minus the RPC's `reminder-v1:`
 * prefix). Dropping it instead of hashing was written and rejected: two
 * consecutive `edit`s that change only the title would then share a key, and the
 * second would replay the first — the exact failure requirement (2) names.
 */

/**
 * djb2, base36. Not a security primitive and not used as one: the key is
 * owner-scoped by the database, so a collision costs at most one replayed action
 * for the owner who caused it, and only within a single unchanged row state.
 */
function shortHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * The same doctrine for a series command — slice 2R.2.
 *
 * `apply_reminder_series_command_v1` reserves `(user_id, operation_key)` exactly
 * as its single-reminder sibling does, so the two requirements above apply
 * unchanged and are satisfied the same way: derive from the state **this render
 * saw**, never from a clock or a nonce.
 *
 * The pre-state is the live occurrence — its id, its instant, and whether it is
 * already detached — because that is what every one of the three commands reads
 * before it decides. After any of them succeeds the row re-renders with a
 * different one (a detach sets `detached_at` and materialises a replacement, an
 * `edit_future` moves the instant, an end withdraws the control entirely), so a
 * deliberate second command carries a different key while a double click before
 * any re-render carries the same one and replays.
 *
 * **The typed values are deliberately not in the key.** An `edit_future`
 * resubmitted with a different title under the same key is refused by the RPC as
 * *"Operation key reused with a different request"* rather than silently applied
 * — which is the correct outcome for a form submitted twice from one render,
 * and a refusal the owner can act on rather than a second undetected write.
 */
export function reminderSeriesOperationKey(
  seriesId: string,
  intent: "occurrence" | "future" | "end",
  occurrence: { readonly id: string; readonly remindAt: string; readonly detached: boolean },
): string {
  const state = [occurrence.id, occurrence.remindAt, occurrence.detached ? "1" : "0"].join("|");
  // `r2` names the slice, as `r5` does above; the RPC adds `series-cmd-v1:`.
  return `r2-${intent}-${seriesId}-${shortHash(state)}`;
}

/**
 * The key a **creation** carries — slice 2R.3.
 *
 * Creation has no pre-state to derive from, which is the difference from the two
 * above: there is no row yet. What stands in for it is the request itself, and
 * that satisfies the same two requirements. Two submits of one dialog carry
 * identical fields and therefore an identical key, so the second replays rather
 * than creating a second series. A deliberate second recurring reminder differs
 * in its title or its instant — otherwise it is not a second reminder, it is the
 * same one asked for twice.
 *
 * The owner id is folded in even though `undo_operations` scopes the key by
 * `user_id` already: it costs nothing and it makes the hash meaningful on its
 * own when one turns up in a log.
 */
export function reminderSeriesCreationKey(
  userId: string,
  title: string,
  anchorLocal: string,
  choice: string,
): string {
  return `r3-create-${choice}-${shortHash([userId, title, anchorLocal].join("|"))}`;
}

export function reminderOperationKey(
  reminderId: string,
  action: ReminderAction,
  expected: ExpectedReminderState,
): string {
  const state = [
    expected.status,
    expected.remindAt,
    expected.important ? "1" : "0",
    shortHash(expected.title),
  ].join("|");
  // `r5` names the slice, so a key read out of `undo_operations` during an
  // incident is traceable to the surface that minted it. The RPC prefixes its
  // own `reminder-v1:` namespace on top; both together stay inside 260.
  return `r5-${action}-${reminderId}-${shortHash(state)}`;
}

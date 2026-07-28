import "server-only";

/**
 * The task-scoped undo projection (PRD 2E-UNDO-005/006/007).
 *
 * 2E-UNDO-005 is explicit about why this exists rather than reusing what is
 * already there: "Phase 2E operations are task-scoped, not entry-scoped, so
 * they need their own owner-scoped, task-scoped undo listing. The existing
 * entry-scoped gate in `loadInterpretationReview` is left unchanged rather than
 * stretched to carry operations that have no entry." A Phase 2E operation has
 * no `source_entry_id` at all, so that gate would filter every one of them out.
 *
 * **This is also how 2E-UNDO-007 is answered without widening the SQL error
 * vocabulary.** `public.undo_operation` reports "no longer available" and
 * "expired" as two `P0001` raises that carry *message text* and no errcode
 * detail, and this repository's mapper keys on the DETAIL token and never on
 * the message (`apply.ts:326-328`). Rather than reintroduce message matching —
 * or widen a closed vocabulary that Slice 2E.7 has no mandate to touch — the
 * distinction is read from the row itself: a `status` that is not `available`
 * is unavailable, and an `expires_at` at or before the caller's instant is
 * expired. Both are data, both are owner-scoped, and both are the same facts
 * the router itself decides on.
 *
 * Reading the row first is also what makes a client-supplied `undoId`
 * trustworthy. Without it, the surface would render an Undo control from
 * whatever id came back in a form field; with it, an id that is not the
 * caller's, not a Phase 2E operation, or already spent never reaches the
 * router.
 */

import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";

import type { TaskCommandUndoState } from "./outcomes";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The three `action_type` values Phase 2E registers in
 * `private.undo_operation_handlers`.
 *
 * `apply_task_command` and `apply_task_command_relation` are registered by
 * `202607260058:2051-2055`; `create_task_command` by `202607270060:2842-2848`.
 * Listed here so the projection selects Phase 2E's own operations and nothing
 * else — an entry-scoped `confirm_entry_task_candidates_v6` row also carries
 * `entity_type = 'task'` and would otherwise appear under a task-scoped
 * listing, offering the user an undo this surface did not produce and cannot
 * describe.
 */
export const TASK_COMMAND_UNDO_ACTION_TYPES = [
  "apply_task_command",
  "apply_task_command_relation",
  "create_task_command",
] as const;

export type TaskCommandUndoActionType = (typeof TASK_COMMAND_UNDO_ACTION_TYPES)[number];

/**
 * Whether an undo can still be offered, and if not, why.
 *
 * The vocabulary is declared in `outcomes.ts` with the others — a surface has
 * to localize it, and `copy.ts` is bundled for the client while this module is
 * not. 2E-UNDO-007 requires expired and no-longer-available to be *distinct*
 * localized outcomes; 2E-UNDO-006 requires the affordance not to be rendered
 * for an expired operation. One classification answers both.
 */
export type { TaskCommandUndoState };

export type TaskCommandUndoOperation = {
  readonly undoId: string;
  readonly actionType: TaskCommandUndoActionType;
  readonly taskId: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly state: TaskCommandUndoState;
};

type UndoRow = {
  id: string;
  action_type: string;
  entity_ids: string[] | null;
  created_at: string;
  expires_at: string;
  status: string;
};

function isTaskCommandUndoActionType(value: string): value is TaskCommandUndoActionType {
  return (TASK_COMMAND_UNDO_ACTION_TYPES as readonly string[]).includes(value);
}

/**
 * Classifies one row against an explicitly injected instant.
 *
 * The clock is a parameter, not `Date.now()`. Expiry is the whole question this
 * function answers, and a projection that read the ambient clock could not be
 * tested at the boundary — which is exactly where the interesting cases are.
 *
 * Order matters: a row that is both spent and expired is reported as
 * `unavailable`, because "you already undid this" is the truer sentence and
 * telling the user it expired invites them to wonder what they missed.
 */
export function classifyTaskCommandUndo(
  row: { readonly status: string; readonly expiresAt: string },
  now: string | Date,
): TaskCommandUndoState {
  if (row.status !== "available") return "unavailable";
  const expiry = Date.parse(row.expiresAt);
  const instant = now instanceof Date ? now.getTime() : Date.parse(now);
  // An unparseable expiry is treated as expired rather than as available. The
  // column is `not null` with a default, so this is unreachable through the
  // database — and if it ever became reachable, refusing to offer an undo is
  // the failure that costs the user nothing.
  if (!Number.isFinite(expiry) || !Number.isFinite(instant)) return "expired";
  return expiry > instant ? "available" : "expired";
}

function toOperation(row: UndoRow, now: string | Date): TaskCommandUndoOperation | null {
  if (!isTaskCommandUndoActionType(row.action_type)) return null;
  return {
    undoId: row.id,
    actionType: row.action_type,
    // `entity_ids` carries the task the operation touched. A creation whose
    // undo already ran can legitimately hold none, so this is nullable rather
    // than defaulted to an empty string.
    taskId: row.entity_ids?.[0] ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    state: classifyTaskCommandUndo({ status: row.status, expiresAt: row.expires_at }, now),
  };
}

const UNDO_COLUMNS = "id,action_type,entity_ids,created_at,expires_at,status";

/**
 * One Phase 2E operation, re-read before it is trusted.
 *
 * Returns null when the id names nothing the caller owns, or names an
 * operation that is not Phase 2E's. Both collapse to the same answer on
 * purpose: 2E-OWNERSHIP-002 requires another owner's row to be
 * indistinguishable from a nonexistent one, and RLS has already made the query
 * return nothing in the first case.
 */
export async function loadTaskCommandUndoOperation(
  supabase: SupabaseClient,
  input: { readonly undoId: string; readonly now: string | Date },
): Promise<TaskCommandUndoOperation | null> {
  const result = await supabase
    .from("undo_operations")
    .select(UNDO_COLUMNS)
    .eq("id", input.undoId)
    .maybeSingle();
  const row = requireSupabaseData(result, "load task command undo operation");
  if (!row) return null;
  return toOperation(row as UndoRow, input.now);
}

/**
 * Every Phase 2E operation touching the given tasks, newest first.
 *
 * Owner-scoping is RLS's, not a `user_id` predicate written here: the select
 * policy on `undo_operations` is the boundary, and restating it in the query
 * would make this code look like the control when it is not. The task filter is
 * an `overlaps` on `entity_ids`, which is where the RPCs record the task they
 * touched.
 */
export async function loadTaskCommandUndoOperations(
  supabase: SupabaseClient,
  input: {
    readonly taskIds: readonly string[];
    readonly now: string | Date;
    readonly limit?: number;
  },
): Promise<readonly TaskCommandUndoOperation[]> {
  if (input.taskIds.length === 0) return [];
  const result = await supabase
    .from("undo_operations")
    .select(UNDO_COLUMNS)
    .in("action_type", [...TASK_COMMAND_UNDO_ACTION_TYPES])
    .overlaps("entity_ids", [...input.taskIds])
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 20);
  const rows = requireSupabaseData(result, "list task command undo operations") ?? [];
  return (rows as UndoRow[])
    .map((row) => toOperation(row, input.now))
    .filter((operation): operation is TaskCommandUndoOperation => operation !== null);
}

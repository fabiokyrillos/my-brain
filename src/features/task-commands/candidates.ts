/**
 * The data-access half of Phase 2E matching: it calls
 * `public.list_task_command_candidates` and validates what comes back.
 *
 * Deliberately free of `import "server-only"`. Slice 2E.1 shipped
 * `AIProvider.parseTaskCommand` inside the server-only provider and had to
 * record "no behavioural test is possible" as a deferral; the fix is to keep
 * the Supabase client an injected parameter, so the whole path from arguments
 * to validated rows is exercisable by Vitest without a database and without a
 * network.
 *
 * The RPC's arguments are assembled here and nowhere else, from the taxonomy
 * and the validated command. Nothing in this file decides a match.
 */

import { z } from "zod";

import { eligibleStatusesFor, type TaskCandidateRow } from "./matching";
import { TASK_MATCH_LIMITS } from "./match-policy";
import type { ValidatedTaskCommand } from "./schema";

/**
 * The narrowest shape of a Supabase client this needs.
 *
 * A structural type rather than `SupabaseClient<Database>`: the caller passes
 * the real client, a test passes a recorded double, and neither has to know
 * about the other.
 */
export type TaskCandidateQueryClient = {
  rpc(
    fn: "list_task_command_candidates",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export class TaskCandidateQueryError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "TaskCandidateQueryError";
    this.code = code;
  }
}

/**
 * The row contract, validated rather than trusted.
 *
 * The rows are our own RPC's, not an untrusted boundary in the
 * `ENGINEERING_STANDARDS` sense — but `prefilterTier`, `tokenOverlap` and
 * `queryTokenCount` are load-bearing numbers that a signature change could
 * silently reorder or drop, and a `null` arriving where a count is expected
 * would score as "no signal" instead of failing. Parsing is what turns that
 * into a caught error at the boundary.
 */
const rowSchema = z
  .object({
    task_id: z.string().uuid(),
    owner_id: z.string().uuid(),
    title: z.string(),
    status: z.string(),
    due_at: z.string().nullable(),
    planned_at: z.string().nullable(),
    manual_priority: z.string().nullable(),
    created_at: z.string(),
    project_names: z.array(z.string()),
    context_names: z.array(z.string()),
    person_names: z.array(z.string()),
    project_hint_matched: z.boolean(),
    context_hint_matched: z.boolean(),
    person_hint_matched: z.boolean(),
    last_audited_at: z.string().nullable(),
    prefilter_tier: z.number().int().min(0).max(3),
    token_overlap: z.number().int().min(0),
    query_token_count: z.number().int().min(0),
    effective_limit: z.number().int().min(1),
  })
  .strict();

const rowsSchema = z.array(rowSchema);

function toCandidateRow(row: z.infer<typeof rowSchema>): TaskCandidateRow {
  return {
    taskId: row.task_id,
    ownerId: row.owner_id,
    title: row.title,
    status: row.status,
    dueAt: row.due_at,
    plannedAt: row.planned_at,
    manualPriority: row.manual_priority,
    createdAt: row.created_at,
    projectNames: row.project_names,
    contextNames: row.context_names,
    personNames: row.person_names,
    projectHintMatched: row.project_hint_matched,
    contextHintMatched: row.context_hint_matched,
    personHintMatched: row.person_hint_matched,
    lastAuditedAt: row.last_audited_at,
    prefilterTier: row.prefilter_tier,
    tokenOverlap: row.token_overlap,
    queryTokenCount: row.query_token_count,
    effectiveLimit: row.effective_limit,
  };
}

/**
 * The title hint as one string for the authoritative normalizer to reduce.
 *
 * Joined with a space and nothing else: `normalize_entity_alias` collapses
 * every non-alphanumeric run to a single space anyway, so any separator chosen
 * here would be erased. Choosing the one that is already erased keeps this
 * function from being a second, quieter normalizer.
 */
function titleQueryOf(command: ValidatedTaskCommand): string {
  const words = command.targetHints.titleWords ?? [];
  return words.join(" ").trim();
}

export type LoadTaskCandidatesInput = {
  readonly client: TaskCandidateQueryClient;
  readonly command: ValidatedTaskCommand;
  /** The authenticated caller. Cross-owner rows are an integrity failure here. */
  readonly ownerId: string;
  /** Explicitly injected; this module never reads the ambient clock. */
  readonly now: string | Date;
  readonly limit?: number;
};

export async function loadTaskCandidates(
  input: LoadTaskCandidatesInput,
): Promise<readonly TaskCandidateRow[]> {
  const { client, command, ownerId, now } = input;
  // Parsed before it is formatted: `new Date("not a date").toISOString()` throws
  // a bare RangeError, and an unclassified crash on the way to a candidate
  // query is not a failure a caller can map to copy.
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    throw new TaskCandidateQueryError("injected instant is not a valid date", "invalid_clock");
  }
  const observedBefore = new Date(nowMs).toISOString();

  const result = await client.rpc("list_task_command_candidates", {
    // Straight from PRD §11.2 as data. `restore_task` is the only action that
    // sends `cancelled`, and `reopen_task` the only one that sends `completed`
    // alone — 2E-MATCH-002 is this argument and nothing else.
    p_eligible_statuses: [...eligibleStatusesFor(command.action)],
    p_title_query: titleQueryOf(command) || null,
    p_project_hint: command.targetHints.project ?? null,
    p_context_hint: command.targetHints.context ?? null,
    p_person_hint: command.targetHints.person ?? null,
    p_observed_before: observedBefore,
    p_limit: input.limit ?? TASK_MATCH_LIMITS.candidates,
  });

  if (result.error) {
    throw new TaskCandidateQueryError(
      "list_task_command_candidates failed",
      result.error.code ?? "rpc_failed",
    );
  }

  const parsed = rowsSchema.safeParse(result.data ?? []);
  if (!parsed.success) {
    throw new TaskCandidateQueryError(
      "list_task_command_candidates returned an unexpected row shape",
      "invalid_row_shape",
    );
  }

  const rows = parsed.data.map(toCandidateRow);

  // 2E-MATCH-001 and 2E-OWNERSHIP-001. The RPC predicates on `auth.uid()` and
  // runs as the caller so forced RLS applies too; a foreign row reaching here
  // would mean both failed, which is a failure to raise rather than to filter.
  // `rankTaskCandidates` filters as well — that layer protects a future caller
  // that did not come through this function.
  if (rows.some((row) => row.ownerId !== ownerId)) {
    throw new TaskCandidateQueryError(
      "list_task_command_candidates returned a row owned by another user",
      "cross_owner_row",
    );
  }

  return rows;
}

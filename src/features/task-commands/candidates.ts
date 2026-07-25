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

import type { Database } from "@/lib/supabase/database.types";

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
type CandidateArgs =
  Database["public"]["Functions"]["list_task_command_candidates"]["Args"];

export type TaskCandidateQueryClient = {
  rpc(
    fn: "list_task_command_candidates",
    args: CandidateArgs,
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
    description: z.string().nullable(),
    status: z.string(),
    due_at: z.string().nullable(),
    planned_at: z.string().nullable(),
    manual_priority: z.string().nullable(),
    completed_at: z.string().nullable(),
    cancelled_at: z.string().nullable(),
    intentional_no_due: z.boolean(),
    no_due_reason: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    project_ids: z.array(z.string()),
    project_names: z.array(z.string()),
    context_ids: z.array(z.string()),
    context_names: z.array(z.string()),
    person_ids: z.array(z.string()),
    person_names: z.array(z.string()),
    person_roles: z.array(z.string()),
    project_hint_matched: z.boolean(),
    context_hint_matched: z.boolean(),
    person_hint_matched: z.boolean(),
    last_audited_at: z.string().nullable(),
    observed_before: z.string(),
    prefilter_tier: z.number().int().min(0).max(3),
    token_overlap: z.number().int().min(0),
    query_token_count: z.number().int().min(0),
    effective_limit: z.number().int().min(1),
  })
  .strict()
  // Position n of the three person arrays describes one `task_people` row. SQL
  // builds them under one shared ORDER BY so they cannot drift, but the
  // preview reads them pairwise and a silent misalignment would attribute a
  // role to the wrong person.
  .refine(
    (row) =>
      row.person_ids.length === row.person_names.length
      && row.person_ids.length === row.person_roles.length
      && row.project_ids.length === row.project_names.length
      && row.context_ids.length === row.context_names.length,
    { message: "relation id, name and role arrays are not aligned" },
  );

const rowsSchema = z.array(rowSchema);

function toCandidateRow(row: z.infer<typeof rowSchema>): TaskCandidateRow {
  return {
    taskId: row.task_id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description,
    status: row.status,
    dueAt: row.due_at,
    plannedAt: row.planned_at,
    manualPriority: row.manual_priority,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    intentionalNoDue: row.intentional_no_due,
    noDueReason: row.no_due_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projectIds: row.project_ids,
    projectNames: row.project_names,
    contextIds: row.context_ids,
    contextNames: row.context_names,
    personIds: row.person_ids,
    personNames: row.person_names,
    personRoles: row.person_roles,
    projectHintMatched: row.project_hint_matched,
    contextHintMatched: row.context_hint_matched,
    personHintMatched: row.person_hint_matched,
    lastAuditedAt: row.last_audited_at,
    observedBefore: row.observed_before,
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
    // `undefined`, not `null`: the generated argument type says these are
    // optional strings, and JSON.stringify drops an undefined value, so the key
    // is omitted and the function's own `default null` applies. Sending `null`
    // would mean the same thing to Postgres and a type error here.
    p_title_query: titleQueryOf(command) || undefined,
    p_project_hint: command.targetHints.project ?? undefined,
    p_context_hint: command.targetHints.context ?? undefined,
    p_person_hint: command.targetHints.person ?? undefined,
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
    // The offending path travels with the error. A bare "unexpected row shape"
    // against a thirty-column projection tells whoever is paged nothing, and
    // the most likely cause is a migration that landed ahead of this code.
    const issue = parsed.error.issues[0];
    const path = (issue?.path ?? []).join(".");
    throw new TaskCandidateQueryError(
      `list_task_command_candidates returned an unexpected row shape at ${path || "<root>"}`,
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

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

import {
  ISO_INSTANT,
  describeUnreachableCandidates,
  eligibleStatusesFor,
  type TaskCandidateRow,
} from "./matching";
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
    // Query-scalars like `observed_before` and `effective_limit`: resolved once
    // by the `refs` CTE and cross-joined onto every row. Nullable on purpose —
    // null is "no owned entity of that name, or more than one", which
    // `resolve_owned_entity_exact` collapses — but a *non-uuid* string is not
    // that, it is a column the RPC stopped returning as an id, and a preview
    // that bound a relation to it would name the wrong thing.
    project_ref_id: z.string().uuid().nullable(),
    context_ref_id: z.string().uuid().nullable(),
    person_ref_id: z.string().uuid().nullable(),
    // The resolved entity's stored name, query-scalar alongside its id and
    // nullable on exactly the same terms. Not narrowed beyond `string`: this is
    // a user-authored `projects.name`/`contexts.name`/`people.name`, so any
    // shape rule here would be a second, quieter copy of a column constraint
    // that already holds — and would reject a legal name rather than catching a
    // projection change.
    project_ref_name: z.string().nullable(),
    context_ref_name: z.string().nullable(),
    person_ref_name: z.string().nullable(),
    // Per-row, and non-null: SQL coalesces the count to 0, so a null here means
    // the projection changed. Parsed as a non-negative integer for the same
    // reason the other counts are — an undefined arriving where a count is
    // expected would render "no reminders" rather than failing.
    scheduled_reminder_count: z.number().int().min(0),
    next_reminder_at: z.string().nullable(),
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
    projectRefId: row.project_ref_id,
    contextRefId: row.context_ref_id,
    personRefId: row.person_ref_id,
    projectRefName: row.project_ref_name,
    contextRefName: row.context_ref_name,
    personRefName: row.person_ref_name,
    scheduledReminderCount: row.scheduled_reminder_count,
    nextReminderAt: row.next_reminder_at,
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
  //
  // A string must carry a timezone designator, exactly as `rankTaskCandidates`
  // requires. `Date.parse("2026-07-26T00:30")` is defined to be *local* time, so
  // without this check the instant this function sends as `p_observed_before` —
  // and therefore the recency window, the audit cut-off and the observation
  // instant echoed back for a later TOCTOU gate — depend on the machine. That
  // the ranker throws afterwards is no defence: the query has already run
  // against the wrong instant, and a caller using this function alone gets a
  // silently host-dependent answer.
  if (typeof now === "string" && !ISO_INSTANT.test(now)) {
    throw new TaskCandidateQueryError(
      "injected instant must be ISO-8601 with a timezone designator",
      "invalid_clock",
    );
  }
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
    // The *patch's* references, not the target hints above. The hints say which
    // task the user meant; these say what the command wants to assign to it, and
    // conflating them would make "add the invoice task to Acme" rank the task
    // already in Acme above the one the user named.
    //
    // They are sent so SQL can resolve each to an owned entity id under the
    // authoritative normalizer (2E-MATCH-007). Resolving them here would mean
    // `normalizeEntityName`, whose divergence 2E-MATCH-008 characterizes — a
    // preview could report "will add Acme" where the Slice 2E.4 RPC then
    // computes `no_change`.
    //
    // `undefined` rather than `null`, exactly as the hints are and for the same
    // reason: the key is dropped by JSON.stringify and the function's own
    // `default null` applies.
    p_project_ref: command.patch.projectRef ?? undefined,
    p_context_ref: command.patch.contextRef ?? undefined,
    p_person_ref: command.patch.personRef ?? undefined,
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
    // against a thirty-eight-column projection tells whoever is paged nothing,
    // and the most likely cause is a migration that landed ahead of this code.
    const issue = parsed.error.issues[0];
    const path = (issue?.path ?? []).join(".");
    throw new TaskCandidateQueryError(
      `list_task_command_candidates returned an unexpected row shape at ${path || "<root>"}`,
      "invalid_row_shape",
    );
  }

  const rows = parsed.data.map(toCandidateRow);

  // The row shape is legal; this asks whether the *values* are ones the query
  // could have produced. `rowSchema` cannot: a tier of 0 alongside an overlap of
  // 0 passes every field-level rule and is still a combination no execution of
  // `list_task_command_candidates` can emit. Raising rather than scoring keeps a
  // migration that landed ahead of this code visible.
  const unreachable = describeUnreachableCandidates(rows);
  if (unreachable !== null) {
    throw new TaskCandidateQueryError(
      `list_task_command_candidates returned rows it could not have produced: ${unreachable}`,
      "unreachable_row_shape",
    );
  }

  // 2E-MATCH-001 and 2E-OWNERSHIP-001. The RPC is `security definer` — it has
  // to be, because `normalize_entity_alias` is not executable by
  // `authenticated` — so RLS is *not* a second wall inside it and its
  // `auth.uid()` predicate is the whole control. That is exactly why a foreign
  // row reaching here is raised rather than filtered: quietly dropping it would
  // hide the failure of the only control there is. `rankTaskCandidates` filters
  // as well, for a future caller that did not come through this function.
  if (rows.some((row) => row.ownerId !== ownerId)) {
    throw new TaskCandidateQueryError(
      "list_task_command_candidates returned a row owned by another user",
      "cross_owner_row",
    );
  }

  return rows;
}

/**
 * Phase 2F Slice 2F.2 — the Work surface's click-time resolution.
 *
 * Before this module, the four Work buttons wrote to `public.tasks` with a
 * direct `UPDATE` that proved nothing, audited itself as whatever the trigger
 * defaulted to, could not be undone, and blindly overwrote whatever it found.
 * This module is the whole of what replaces it: a click resolves through the
 * deployed `public.list_task_command_candidates` and applies through the
 * deployed `public.apply_task_command`. **No new SQL, no new RPC, no migration**
 * — Gate 3 proved none was needed (PRD §5, 2F-SURFACE-001).
 *
 * ## One honest instant
 *
 * The single load-bearing property is that the pre-state and the observation
 * instant come from **one row of one read** (2F-SURFACE-003). The Work
 * projection supplies the clicked id, the rendered title *as a query hint*, and
 * the action — and nothing else. It cannot supply the pre-state: Gate 3's static
 * half proves the task select is ten keys short, that seven of those ten are
 * relation arrays no lengthening of a column list can close, that `personRoles`
 * has no carrier in the DTO at all, and — the objection that actually decides it
 * — that the projection's relations arrive in *separate round trips at separate
 * instants*, while `apply_task_command` hashes a single `p_observed_before`
 * alongside the pre-state it is supposed to describe. A witness assembled from
 * five reads has no honest instant to declare, whatever its column count.
 *
 * ## Why the ranker is not on this path
 *
 * `rankTaskCandidates` and `buildTaskCommandPreview` both select through
 * `result.candidates`, which is floored at `TASK_MATCH_THRESHOLDS.minCandidateScore`
 * and capped at `TASK_MATCH_LIMITS.ranked`. Those bounds are correct for their
 * job — choosing a target out of ambiguous natural language — and wrong for
 * this one, where the target is already known. Routing a click through them
 * would refuse a legitimate click whenever the row scored below the floor (the
 * title-drift case 2F-SURFACE-004 says must *not* refuse) or fell outside the top
 * five (six tasks sharing a title). 2F-SURFACE-004 states the rule this module
 * follows instead: the clicked `task_id` is authoritative and the row is selected
 * by id **wherever it appears in the resolution result**. Selection is therefore
 * from `rows`.
 *
 * Everything else is reused rather than rebuilt: `validateTaskCommand` builds the
 * command, `loadTaskCandidates` performs the read, `toTaskPreState` projects the
 * nineteen keys, `buildCanonicalPatch` derives the patch, `buildApplyPayload`
 * assembles the seven arguments and `applyTaskCommand` calls the RPC and maps
 * its failures. This module adds a mapping and a selection, and decides nothing
 * else.
 */

import {
  applyTaskCommand,
  type TaskCommandApplyClient,
  type TaskCommandApplyResult,
} from "./apply";
import { loadTaskCandidates, type TaskCandidateQueryClient } from "./candidates";
import { toTaskPreState, type TaskCandidateRow, type TaskPreState } from "./matching";
import { buildCanonicalPatch } from "./preview";
import { MAX_HINT_LENGTH, MAX_TITLE_WORDS, validateTaskCommand } from "./schema";
import {
  WORK_ACTION_MAPPING,
  isEligibleStatus,
  type TaskCommandAction,
  type WorkSurfaceAction,
} from "./taxonomy";
import type { ValidatedTaskCommand } from "./schema";

/**
 * The rendered title, reduced to the hint shape `targetHintsSchema` accepts.
 *
 * Split on whitespace and capped at `MAX_TITLE_WORDS`, because a longer title
 * would fail validation outright and refuse a click that is perfectly legal.
 * Truncation is safe *because the clicked id is authoritative*: a shorter query
 * widens the candidate set rather than narrowing it, and the row is then found
 * by id. Each word is clamped to `MAX_HINT_LENGTH` for the same reason.
 *
 * No normalization happens here and none may. `normalize_entity_alias` is the
 * authoritative normalizer and it runs in SQL; a second reduction in TypeScript
 * is exactly the divergence `normalizer-divergence.test.ts` forbids across this
 * directory.
 */
export function titleWordsFor(title: string): readonly string[] {
  return title
    .split(/\s+/)
    .map((word) => word.trim().slice(0, MAX_HINT_LENGTH))
    .filter((word) => word.length > 0)
    .slice(0, MAX_TITLE_WORDS);
}

/** Why a click could not be resolved. Both render a refresh affordance. */
export type WorkCommandRefusal =
  /** The clicked id is not in the resolution result at all. */
  | "unresolvable"
  /** The row came back but no longer admits the action. */
  | "ineligible";

export type WorkCommandResolution =
  | {
      readonly status: "resolved";
      readonly command: ValidatedTaskCommand;
      readonly row: TaskCandidateRow;
      readonly preState: TaskPreState;
      readonly observedBefore: string;
      readonly canonicalPatch: ReturnType<typeof buildCanonicalPatch>;
      readonly taxonomyAction: TaskCommandAction;
    }
  | { readonly status: "refused"; readonly refusal: WorkCommandRefusal };

/** A precondition this module's caller violated, not a product outcome. */
export class WorkCommandInputError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "WorkCommandInputError";
    this.code = code;
  }
}

export type ResolveWorkCommandInput = {
  readonly client: TaskCandidateQueryClient;
  /** The authenticated caller. Cross-owner rows are raised by `loadTaskCandidates`. */
  readonly ownerId: string;
  /** The clicked row's id. Authoritative (2F-SURFACE-004). */
  readonly taskId: string;
  /** The title as rendered. A query hint only — never a gate. */
  readonly title: string;
  readonly action: WorkSurfaceAction;
  readonly operationKey: string;
  /** Explicitly injected; this module never reads the ambient clock. */
  readonly now: string | Date;
  readonly timeZone: string;
};

/**
 * Resolves a click to a row, a nineteen-key pre-state and one observed instant.
 *
 * Ownership is not re-checked here and does not need to be:
 * `list_task_command_candidates` is `auth.uid()`-scoped and `loadTaskCandidates`
 * additionally *raises* on any row that came back owned by someone else rather
 * than filtering it, because quietly dropping it would hide the failure of the
 * only control there is. A stranger's task therefore cannot appear in `rows`, and
 * a stranger's clicked id resolves to `unresolvable`.
 */
export async function resolveWorkCommand(
  input: ResolveWorkCommandInput,
): Promise<WorkCommandResolution> {
  const mapping = WORK_ACTION_MAPPING[input.action];
  const validation = validateTaskCommand(
    {
      action: mapping.taxonomy,
      targetHints: { titleWords: titleWordsFor(input.title) },
      patch: { ...mapping.patch },
      operationKey: input.operationKey,
    },
    { now: input.now, timeZone: input.timeZone },
  );
  if (validation.status !== "ok") {
    // Unreachable from the product: the mapping is pinned data and the operation
    // key is a uuid this process minted. Reaching it means the surface and the
    // taxonomy disagree, which is a defect rather than something to tell a user.
    throw new WorkCommandInputError(
      `the Work action ${input.action} did not validate as ${mapping.taxonomy}: ${validation.status}`,
      "invalid_work_command",
    );
  }
  const command = validation.command;

  const rows = await loadTaskCandidates({
    client: input.client,
    command,
    ownerId: input.ownerId,
    now: input.now,
  });

  // 2F-SURFACE-004: by id, out of the *whole* result — not out of a ranked,
  // floored, capped subset of it.
  const row = rows.find((candidate) => candidate.taskId === input.taskId);
  if (row === undefined) return { status: "refused", refusal: "unresolvable" };

  // Defence in depth rather than a second opinion: `p_eligible_statuses` already
  // filters, so an ineligible row cannot come back and this branch is
  // unreachable through the RPC. It exists so that a future change which widened
  // the query — or a hand-assembled row set in a test — refuses instead of
  // sending an ineligible command the RPC would reject with a raw SQLSTATE.
  if (!isEligibleStatus(command.action, row.status)) {
    return { status: "refused", refusal: "ineligible" };
  }

  const preState = toTaskPreState(row);
  return {
    status: "resolved",
    command,
    row,
    preState,
    // The database's own instant, cross-joined onto every row by the `refs` CTE.
    // Never a client clock, and never a second read's instant.
    observedBefore: row.observedBefore,
    canonicalPatch: buildCanonicalPatch({ command, pre: preState, resolvedId: null }),
    taxonomyAction: command.action,
  };
}

export type WorkCommandOutcome =
  | {
      readonly status: "applied";
      readonly result: TaskCommandApplyResult;
      readonly resolution: Extract<WorkCommandResolution, { status: "resolved" }>;
    }
  | { readonly status: "refused"; readonly refusal: WorkCommandRefusal };

/**
 * Resolves a click and applies it, in one pass over one observation.
 *
 * The client is one object satisfying both narrow shapes, so the read and the
 * write provably happen on the same session — an `auth.uid()` that differed
 * between them would make the resolution's ownership proof describe a different
 * caller than the one that wrote.
 */
export async function applyWorkCommand(
  client: TaskCandidateQueryClient & TaskCommandApplyClient,
  input: Omit<ResolveWorkCommandInput, "client">,
): Promise<WorkCommandOutcome> {
  const resolution = await resolveWorkCommand({ ...input, client });
  if (resolution.status === "refused") {
    return { status: "refused", refusal: resolution.refusal };
  }
  const result = await applyTaskCommand(client, {
    source: {
      task: { taskId: resolution.row.taskId },
      action: resolution.taxonomyAction,
      canonicalPatch: resolution.canonicalPatch,
      observedBefore: resolution.observedBefore,
      policyVersion: resolution.command.policyVersion,
    },
    preState: resolution.preState,
    operationKey: input.operationKey,
  });
  return { status: "applied", result, resolution };
}

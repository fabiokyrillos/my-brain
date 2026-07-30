/**
 * Slice D2 — the task detail surface's click-time resolution.
 *
 * `work-command.ts` is this module's sibling and its shape is copied
 * deliberately: resolve through the deployed `list_task_command_candidates`,
 * select the row **by id out of the whole result** (2F-SURFACE-004), project the
 * nineteen-key pre-state, derive the canonical patch, apply through the deployed
 * `apply_task_command`. **No new SQL, no new RPC, no migration, no direct task
 * write.**
 *
 * ## The one thing it generalises
 *
 * `resolveWorkCommand` builds its command from `WORK_ACTION_MAPPING[action].patch`
 * — a *fixed* patch, which is why it serves exactly the four status verbs. Every
 * other verb in the taxonomy carries a value: a title, a note, a date, a
 * priority, a relation. This module takes that patch from its caller instead.
 *
 * ## Why validation failure is an outcome here and a throw there
 *
 * In `work-command.ts` a failed `validateTaskCommand` is unreachable from the
 * product — the mapping is pinned data and the key is a uuid the server minted —
 * so it throws as a caller defect. Here the values come from **a person filling
 * in a control**, so the same failure is an ordinary thing to be told: a date
 * beyond the temporal lexicon's ±730-day bound, a title longer than the contract
 * admits, a relation naming nothing they own. Those return a declared refusal
 * carrying the schema's own reason code, and never a thrown error.
 *
 * ## What it deliberately does not do
 *
 * It does not rank. `rankTaskCandidates` chooses a target out of ambiguous
 * natural language; the detail page already knows which task it is showing, and
 * routing a known target through a floored, capped ranker would refuse a
 * legitimate edit whenever the row scored below `minCandidateScore` or fell
 * outside the top five. Selection is by id, from `rows`.
 *
 * It does not decide whether an action needs confirmation. `cancel_task` is
 * `destructive` in the taxonomy and its confirmation is issued and checked by
 * the same contract the console uses; this module only refuses to resolve an
 * action the row's status does not admit.
 */

import {
  applyTaskCommand,
  type TaskCommandApplyClient,
  type TaskCommandApplyResult,
} from "./apply";
import { loadTaskCandidates, type TaskCandidateQueryClient } from "./candidates";
import { toTaskPreState, type TaskCandidateRow, type TaskPreState } from "./matching";
import { buildCanonicalPatch, resolveRelationReference } from "./preview";
import {
  validateTaskCommand,
  type TaskCommandPatch,
  type TaskCommandValidationReason,
  type ValidatedTaskCommand,
} from "./schema";
import {
  isEligibleStatus,
  type TaskCommandAction,
  type TaskCommandUnsupportedReason,
} from "./taxonomy";
import { titleWordsFor } from "./work-command";

/** Why a detail edit could not be resolved or was refused before any write. */
export type DetailCommandRefusal =
  /** The row is not in the resolution result — deleted, or never the caller's. */
  | { readonly kind: "unresolvable" }
  /** The row came back but its current status does not admit this action. */
  | { readonly kind: "ineligible" }
  /** The submitted value does not satisfy the closed schema or the action policy. */
  | { readonly kind: "invalid"; readonly reason: TaskCommandValidationReason; readonly field?: string }
  /** The action, or the value for it, is outside what the taxonomy permits. */
  | { readonly kind: "unsupported"; readonly reason: TaskCommandUnsupportedReason; readonly field?: string }
  /** A temporal value the lexicon could not resolve — out of range, or not a date. */
  | { readonly kind: "needs_clarification"; readonly field: string }
  /**
   * The relation the action writes names no single owned entity.
   *
   * `resolve_owned_entity_exact` runs inside `list_task_command_candidates` and
   * returns null both when nothing matches and when more than one does. The
   * detail page's pickers are built from the caller's own entities, so this is
   * reachable mainly when the entity was renamed or deleted in another tab, or
   * when two of them share a name — and in every case the honest answer is that
   * we could not tell which one was meant, not a silent write of nothing.
   */
  | { readonly kind: "relation_unresolved" };

export type DetailCommandResolution =
  | {
      readonly status: "resolved";
      readonly command: ValidatedTaskCommand;
      readonly row: TaskCandidateRow;
      readonly preState: TaskPreState;
      readonly observedBefore: string;
      readonly canonicalPatch: ReturnType<typeof buildCanonicalPatch>;
    }
  | { readonly status: "refused"; readonly refusal: DetailCommandRefusal };

export type ResolveDetailCommandInput = {
  readonly client: TaskCandidateQueryClient;
  /** The authenticated caller. Cross-owner rows are raised by `loadTaskCandidates`. */
  readonly ownerId: string;
  /** The opened task's id. Authoritative, exactly as a Work click's is. */
  readonly taskId: string;
  /** The rendered title, carried only as a query hint — never as a gate. */
  readonly title: string;
  readonly action: TaskCommandAction;
  /** The caller's values, still untrusted: `validateTaskCommand` is the gate. */
  readonly patch: TaskCommandPatch;
  readonly operationKey: string;
  /** Explicitly injected; this module never reads the ambient clock. */
  readonly now: string | Date;
  readonly timeZone: string;
};

export async function resolveDetailCommand(
  input: ResolveDetailCommandInput,
): Promise<DetailCommandResolution> {
  const validation = validateTaskCommand(
    {
      action: input.action,
      // The same reduction `work-command.ts` performs, and safe for the same
      // reason: a shorter query widens the candidate set rather than narrowing
      // it, and the row is then found by id.
      targetHints: { titleWords: titleWordsFor(input.title) },
      patch: input.patch,
      operationKey: input.operationKey,
    },
    { now: input.now, timeZone: input.timeZone },
  );

  if (validation.status === "invalid") {
    return { status: "refused", refusal: { kind: "invalid", reason: validation.reason, field: validation.field } };
  }
  if (validation.status === "unsupported") {
    return { status: "refused", refusal: { kind: "unsupported", reason: validation.reason, field: validation.field } };
  }
  if (validation.status === "needs_clarification") {
    return { status: "refused", refusal: { kind: "needs_clarification", field: validation.field } };
  }

  const command = validation.command;
  const rows = await loadTaskCandidates({
    client: input.client,
    command,
    ownerId: input.ownerId,
    now: input.now,
  });

  const row = rows.find((candidate) => candidate.taskId === input.taskId);
  if (row === undefined) return { status: "refused", refusal: { kind: "unresolvable" } };

  // Defence in depth: `p_eligible_statuses` already filters, so an ineligible
  // row cannot come back. This exists so a future widening of the query — or a
  // hand-assembled row set in a test — refuses rather than sending a command the
  // RPC would reject with a raw SQLSTATE.
  if (!isEligibleStatus(command.action, row.status)) {
    return { status: "refused", refusal: { kind: "ineligible" } };
  }

  // The relation the action writes, resolved **in SQL** against the caller's own
  // entities and carried back on the row. `work-command.ts` passes a hardcoded
  // `null` here and is right to: no Work verb writes a relation. Four detail
  // verbs do, and a null would build a canonical patch with no `projectId`,
  // `contextId` or `personId` in it at all — so the RPC would receive a patch
  // asking for nothing, report `no_change`, and the user would be told their
  // edit made no difference when in fact it was never sent.
  const relation = resolveRelationReference(command.action, row);
  if (relation.status === "unresolved") {
    return { status: "refused", refusal: { kind: "relation_unresolved" } };
  }

  const preState = toTaskPreState(row);
  return {
    status: "resolved",
    command,
    row,
    preState,
    // The instant this resolution ran against, echoed back on every row by the
    // query's `refs` CTE. One observation, one instant.
    observedBefore: row.observedBefore,
    canonicalPatch: buildCanonicalPatch({
      command,
      pre: preState,
      resolvedId: relation.status === "resolved" ? relation.entityId : null,
    }),
  };
}

export type DetailCommandOutcome =
  | {
      readonly status: "applied";
      readonly result: TaskCommandApplyResult;
      readonly resolution: Extract<DetailCommandResolution, { status: "resolved" }>;
    }
  | { readonly status: "refused"; readonly refusal: DetailCommandRefusal };

/**
 * Resolves an edit and applies it, in one pass over one observation.
 *
 * The client is one object satisfying both narrow shapes, so the read and the
 * write provably happen on the same session — an `auth.uid()` that differed
 * between them would make the resolution's ownership proof describe a different
 * caller than the one that wrote.
 */
export async function applyDetailCommand(
  client: TaskCandidateQueryClient & TaskCommandApplyClient,
  input: Omit<ResolveDetailCommandInput, "client">,
): Promise<DetailCommandOutcome> {
  const resolution = await resolveDetailCommand({ ...input, client });
  if (resolution.status === "refused") {
    return { status: "refused", refusal: resolution.refusal };
  }
  const result = await applyTaskCommand(client, {
    source: {
      task: { taskId: resolution.row.taskId },
      action: resolution.command.action,
      canonicalPatch: resolution.canonicalPatch,
      observedBefore: resolution.observedBefore,
      policyVersion: resolution.command.policyVersion,
    },
    preState: resolution.preState,
    operationKey: input.operationKey,
  });
  return { status: "applied", result, resolution };
}

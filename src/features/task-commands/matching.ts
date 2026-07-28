/**
 * Deterministic task matching (PRD §13.2, Epic 2E-B).
 *
 * This module scores, orders and classifies candidates that SQL has already
 * selected. It is the "system decides" half of PRD §6.1: the model produced
 * bounded hints and nothing else, and every judgement that leads to a write is
 * made here or in the database.
 *
 * 2E-MATCH-017: pure. No AI call, no network call, no clock read, no Supabase
 * client. The current instant and the caller's timezone are injected, so the
 * same command against the same rows produces the same result on any machine
 * at any moment — which is what makes the adversarial fixtures of §19.1 worth
 * anything. That promise is now enforced rather than asserted: an instant
 * without a timezone designator is refused, because `Date.parse` reads such a
 * string in the *host's* zone and a review proved the same command then
 * resolved to `matched`/one-step on one machine and `ambiguous` on another.
 *
 * There is deliberately no normalizer in this file. 2E-MATCH-007 makes
 * `public.normalize_entity_alias` authoritative because it is the only
 * index-expressible one, and every lexical decision — exact title, phrase
 * containment, token overlap, relation-name matching — has already been made by
 * it in SQL and arrives here as a tier, a count and three booleans. Re-deriving
 * any of that with `normalizeEntityName` would reintroduce exactly the
 * divergence 2E-MATCH-008 exists to characterize, and would let a row qualify
 * in SQL and then score as unrelated in TypeScript.
 */

import { calculateCandidateMargin } from "../interpretations/trust-policy";
import {
  TASK_MATCH_LIMITS,
  TASK_MATCH_POLICY_VERSION,
  TASK_MATCH_PREFILTER_TIERS,
  TASK_MATCH_THRESHOLDS,
  TASK_MATCH_WEIGHTS,
  roundScore,
  type TaskMatchEvidence,
} from "./match-policy";
import { isEligibleStatus, type TaskCommandAction, actionPolicy } from "./taxonomy";
import { resolveTemporalPhrase } from "./temporal";
import type { ValidatedTaskCommand } from "./schema";

/** A precondition the caller violated, not a product outcome the user sees. */
export class TaskMatchInputError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "TaskMatchInputError";
    this.code = code;
  }
}

/**
 * The observed pre-state of a task, as `list_task_command_candidates` saw it.
 *
 * Every field the §11.2 taxonomy can change is here so that 2E-PREVIEW-002 can
 * render before/after and 2E-UPDATE-003 can gate on a pre-state observed at the
 * same instant that produced the match — rather than at a later one, which is a
 * TOCTOU window the injected `observedBefore` exists to close.
 */
export type TaskPreState = {
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly dueAt: string | null;
  readonly plannedAt: string | null;
  readonly manualPriority: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly intentionalNoDue: boolean;
  readonly noDueReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly projectIds: readonly string[];
  readonly projectNames: readonly string[];
  readonly contextIds: readonly string[];
  readonly contextNames: readonly string[];
  readonly personIds: readonly string[];
  readonly personNames: readonly string[];
  readonly personRoles: readonly string[];
};

/**
 * One row of `public.list_task_command_candidates`, camel-cased.
 *
 * `prefilterTier`, `tokenOverlap` and `queryTokenCount` are the authoritative
 * normalizer's verdict, not raw text to re-analyse. `effectiveLimit` is the
 * limit SQL actually applied after clamping, so overflow is read from the data
 * rather than assumed from the constant this process asked for.
 */
export type TaskCandidateRow = TaskPreState & {
  readonly taskId: string;
  readonly ownerId: string;
  readonly projectHintMatched: boolean;
  readonly contextHintMatched: boolean;
  readonly personHintMatched: boolean;
  readonly lastAuditedAt: string | null;
  /** The instant SQL resolved the pre-state against. */
  readonly observedBefore: string;
  /** 0 exact title, 1 phrase containment, 2 some connection, 3 none. */
  readonly prefilterTier: number;
  readonly tokenOverlap: number;
  readonly queryTokenCount: number;
  readonly effectiveLimit: number;
  /**
   * The patch's `projectRef`, `contextRef` and `personRef` resolved to an owned
   * entity id — or null, meaning no owned entity carries that name at
   * `observedBefore`, *or* more than one does.
   *
   * `public.resolve_owned_entity_exact` collapses those two failures
   * deliberately, and the preview does not pretend to tell them apart: both mean
   * it cannot name the thing the user asked for, and both produce the same
   * truthful copy.
   *
   * Outside `TaskPreState` on purpose. These describe what the command wants to
   * *assign*, not what the task currently holds — the pre-state is already
   * carrying the latter as `projectIds`/`contextIds`/`personIds`. 2E-PREVIEW-005
   * has to tell "the task already holds this relation" from "this relation will
   * be added", and comparing a resolved id against those arrays is the only way
   * to answer it without re-normalizing a name in TypeScript, which is exactly
   * the divergence 2E-MATCH-008 characterizes and `normalizer-divergence.test.ts`
   * forbids structurally in this directory.
   *
   * Outside `scoreRow` on the same evidence that produced `writesRelation`: a
   * review proved that letting the relation an action is *adding* boost the task
   * that already holds it reached a one-step apply on the wrong task. Feeding the
   * resolved id back into scoring would rebuild that defect from the other side.
   */
  readonly projectRefId: string | null;
  readonly contextRefId: string | null;
  readonly personRefId: string | null;
  /**
   * The resolved entity's *stored* name — what the database holds, not what the
   * command carried. Null exactly when its id is null.
   *
   * Projected because the id alone cannot name the thing the preview is about to
   * add. A review proved the consequence: `relationAfter` was looking the
   * resolved id up in the arrays of relations the task *already holds*, so the
   * name resolved only in the `no_change` case — the one case where it is not
   * needed — and the real addition rendered a bare "+1". 2E-PREVIEW-002 asks for
   * the proposed value, and "+1" is not a value.
   *
   * The stored name rather than `patch.projectRef` for the same reason the id is
   * bound rather than the words: `normalize_entity_alias` folds case, accents and
   * punctuation, so a reference of "acme corp" legitimately resolves a project
   * stored as "ACME Corp." and echoing the typing back would confirm something
   * the user's data does not say. Reading it off the row is also the only way to
   * get it without re-normalizing a name in TypeScript, which is the divergence
   * 2E-MATCH-008 characterizes.
   *
   * Query-scalar and outside scoring on exactly the same evidence as the three
   * ids above: `writesRelation` exists because the relation a command is *adding*
   * must never boost the task that already holds it, and a name is no safer to
   * score on than an id.
   */
  readonly projectRefName: string | null;
  readonly contextRefName: string | null;
  readonly personRefName: string | null;
  /**
   * The task's live reminders — how many are `scheduled`, and when the next one
   * fires (null when none is).
   *
   * `scheduled` is the whole live population: every heartbeat path selects that
   * status and no other, so a `snoozed`, `sent` or `cancelled` row can never
   * fire. 2E-PREVIEW-003 asks for the linked effect, and `dueAt !== null` is not
   * a substitute for observing it — `create_due_task_reminder` is `after insert
   * on public.tasks`, so a due date set by any later update has no reminder at
   * all, and `authenticated` may delete reminders directly. A preview promising
   * to cancel a reminder that does not exist is not disclosing an effect, it is
   * inventing one.
   *
   * Kept out of `TaskPreState`, and that exclusion is load-bearing rather than
   * tidiness. The pre-state is what 2E-PREVIEW-004's fingerprint hashes and what
   * 2E-UPDATE-003's gate compares, while the heartbeat flips `scheduled` to
   * `sent` hourly with no user act — so a fingerprint over reminder state would
   * manufacture a stale-preview refusal on a cron tick, one the user could
   * neither predict nor avoid by acting faster.
   */
  readonly scheduledReminderCount: number;
  readonly nextReminderAt: string | null;
};

export type RankedTaskCandidate = {
  readonly taskId: string;
  readonly preState: TaskPreState;
  readonly score: number;
  readonly evidence: readonly TaskMatchEvidence[];
};

/**
 * The closed outcome vocabulary of the *match* step (PRD §11.1).
 *
 * `unmatched` is where 2E-NOMATCH's creation-or-clarification branch begins in
 * Slice 2E.6; the `still_unmatched`, `clarification_requested` and
 * `creation_offered` states of 2E-UX-001 are that branch's outcomes, not this
 * one's. `ambiguous_overflow` is the refinement §11.1 folds into `ambiguous`
 * and 2E-UX-001 names separately, because "too many to choose between" and
 * "two that look alike" need different copy.
 */
export const TASK_MATCH_OUTCOMES = [
  "matched",
  "matched_requires_confirmation",
  "ambiguous",
  "ambiguous_overflow",
  "unmatched",
] as const;

export type TaskMatchOutcome = (typeof TASK_MATCH_OUTCOMES)[number];

export type TaskMatchResult = {
  readonly outcome: TaskMatchOutcome;
  /** Ranked, capped at `TASK_MATCH_LIMITS.ranked`, in the deterministic order. */
  readonly candidates: readonly RankedTaskCandidate[];
  readonly topScore: number;
  readonly margin: number;
  /**
   * Whether SQL truncated the candidate set.
   *
   * Reported even when the outcome is not `ambiguous_overflow`, so a caller can
   * say "and there were more than we could look at" alongside whatever verdict
   * the candidates that *did* arrive support.
   */
  readonly overflowed: boolean;
  /**
   * Whether a single Apply control is permitted (2E-MATCH-012/013).
   *
   * False for every non-`matched` outcome, for every destructive action, and
   * for `restore_task` — which requires no token but is not one-step either,
   * because undoing a deliberate cancellation deserves the deliberateness the
   * cancellation had.
   */
  readonly oneStep: boolean;
  readonly requiresConfirmation: boolean;
  readonly destructive: boolean;
  /**
   * How many candidates cleared the floor, before the presentation cap.
   *
   * Load-bearing for the surface, not diagnostic: an `ambiguous` result with
   * exactly one candidate is "I found one but I am not sure it is the one", and
   * 2E-MATCH-012 forbids rendering that as a disambiguation list of one. Slice
   * 2E.3 reads this to choose between a confirm-this-one prompt and a list.
   */
  readonly qualifyingCount: number;
  /** Echoed so 2E-PREVIEW-004's fingerprint has every input without re-reading. */
  readonly ownerId: string;
  readonly observedBefore: string | null;
  readonly matchPolicyVersion: string;
};

export type TaskMatchInput = {
  readonly command: ValidatedTaskCommand;
  readonly rows: readonly TaskCandidateRow[];
  /** The authenticated caller, re-checked here as 2E-MATCH-001's third layer. */
  readonly ownerId: string;
  /**
   * Explicitly injected, and required to carry a timezone designator.
   *
   * A `Date` is unambiguous. A string is not: `Date.parse("2026-07-25T12:00")`
   * is defined to be *local* time, so the same command scored on a machine in
   * Kiritimati and one in UTC produced different outcomes — which is exactly
   * what 2E-MATCH-017 forbids, and what `TemporalContext` already refuses one
   * layer down.
   */
  readonly now: string | Date;
  readonly timeZone: string;
};

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * Full ISO-8601 with an explicit offset or `Z`. Mirrors `temporal.ts`.
 *
 * Exported so `candidates.ts` applies the identical rule rather than writing a
 * third copy: the data-access layer must refuse a zone-less instant for the same
 * reason this module does, and a second regex that drifted would leave one of
 * the two layers host-dependent.
 */
export const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function instantMs(value: string | Date | null): number | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireInstantMs(value: string | Date): number {
  if (value instanceof Date) {
    const parsed = value.getTime();
    if (!Number.isFinite(parsed)) {
      throw new TaskMatchInputError("injected instant is an invalid Date", "invalid_clock");
    }
    return parsed;
  }
  if (!ISO_INSTANT.test(value)) {
    throw new TaskMatchInputError(
      "injected instant must be ISO-8601 with a timezone designator",
      "invalid_clock",
    );
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new TaskMatchInputError("injected instant is not a valid date", "invalid_clock");
  }
  return parsed;
}

/**
 * The temporal hint resolved once per match.
 *
 * A phrase outside the lexicon yields no signal at all — never a guessed date
 * (2E-COMMAND-016). Ranking is allowed to lose a signal; it is not allowed to
 * invent one.
 */
function resolveHintInstant(
  phrase: string | undefined,
  now: string | Date,
  timeZone: string,
): number | null {
  if (typeof phrase !== "string" || phrase.trim() === "") return null;
  const resolved = resolveTemporalPhrase(phrase, { now, timeZone });
  return resolved.status === "resolved" ? instantMs(resolved.instant) : null;
}

/**
 * Whether a relation signal would reward the task the action is about to write
 * that very relation onto.
 *
 * `assign_project` with a project hint of "Acme" and a patch of "Acme" scored
 * the task that is *already* in Acme above the one the user meant. For
 * `set_waiting_on` that is worse than a no-op: the candidate query joins
 * `task_people` without filtering the role, so a person merely `involved`
 * boosted a task that then received a real `waiting_on` row — one step,
 * unconfirmed. The taxonomy already knows which relation each action writes, so
 * the fix reads it rather than restating it.
 */
function writesRelation(action: TaskCommandAction, field: "project" | "context" | "person"): boolean {
  const changed = actionPolicy(action).changedFields;
  if (field === "project") return changed.includes("task_projects");
  if (field === "context") return changed.includes("task_contexts");
  return changed.includes("task_people:involved") || changed.includes("task_people:waiting_on");
}

/**
 * The earliest instant any row was observed against, or null for no rows.
 *
 * An unparseable value is not silently skipped: it makes the whole answer
 * unknown, because "the earliest of the ones I could read" is a stronger claim
 * than the data supports and this value guards a write.
 */
function earliestObservation(rows: readonly TaskCandidateRow[]): string | null {
  let earliest: { value: string; ms: number } | null = null;
  for (const row of rows) {
    const ms = instantMs(row.observedBefore);
    if (ms === null) return null;
    if (earliest === null || ms < earliest.ms) earliest = { value: row.observedBefore, ms };
  }
  return earliest?.value ?? null;
}

type ScoredCandidate = RankedTaskCandidate & { readonly rawScore: number };

function scoreRow(input: {
  row: TaskCandidateRow;
  command: ValidatedTaskCommand;
  hintInstantMs: number | null;
  nowMs: number;
}): ScoredCandidate {
  const { row, command, hintInstantMs, nowMs } = input;
  const evidence: TaskMatchEvidence[] = [];
  let score = 0;

  // The title ladder: graded, so a title that *is* the hint is not also
  // credited with containing it.
  if (row.prefilterTier === TASK_MATCH_PREFILTER_TIERS.exactTitle) {
    score += TASK_MATCH_WEIGHTS.exactTitle;
    evidence.push("normalized_exact_title");
  } else if (row.prefilterTier === TASK_MATCH_PREFILTER_TIERS.titlePhrase) {
    score += TASK_MATCH_WEIGHTS.titlePhrase;
    evidence.push("normalized_title_phrase");
  }

  if (row.queryTokenCount > 0 && row.tokenOverlap > 0) {
    const fraction = Math.min(1, row.tokenOverlap / row.queryTokenCount);
    score += TASK_MATCH_WEIGHTS.tokenOverlap * fraction;
    evidence.push("normalized_token_overlap");
  }

  if (row.projectHintMatched && !writesRelation(command.action, "project")) {
    score += TASK_MATCH_WEIGHTS.referencedProject;
    evidence.push("referenced_project");
  }
  if (row.contextHintMatched && !writesRelation(command.action, "context")) {
    score += TASK_MATCH_WEIGHTS.referencedContext;
    evidence.push("referenced_context");
  }
  if (row.personHintMatched && !writesRelation(command.action, "person")) {
    score += TASK_MATCH_WEIGHTS.referencedPerson;
    evidence.push("referenced_person");
  }

  // The status hint was canonicalized to one of the eight literals by
  // `validateTaskCommand`, so this is a comparison and never a parse.
  //
  // It is skipped in two cases, both of which are hints that cannot separate one
  // candidate from another:
  //
  //   1. the hint names the status the patch is about to set, so it describes
  //      the destination rather than the current state;
  //   2. the action has a single eligible source status. `isEligibleStatus`
  //      already guarantees every candidate holds it, so the hint fires on all
  //      of them, discriminates nothing, and only inflates the score against a
  //      threshold. A review proved the consequence: under `reopen_task`, "the
  //      completed report task" reached a one-step apply that "the report task"
  //      did not, on a word that excluded no candidate.
  const statusHint = command.targetHints.status;
  const eligible = actionPolicy(command.action).eligibleFrom;
  const describesDestination = statusHint !== undefined && command.patch.status === statusHint;
  const canSeparateCandidates = eligible.length > 1;
  if (
    statusHint !== undefined
    && statusHint === row.status
    && !describesDestination
    && canSeparateCandidates
  ) {
    score += TASK_MATCH_WEIGHTS.statusMatch;
    evidence.push("status_match");
  }

  if (hintInstantMs !== null) {
    // The *nearer* of the two, not "due, else planned": a task planned for the
    // hinted day but due next year is exactly what "move my dentist thing"
    // means, and preferring `due_at` unconditionally lost it to a task merely
    // due that day.
    const distances = [instantMs(row.dueAt), instantMs(row.plannedAt)]
      .filter((value): value is number => value !== null)
      .map((value) => Math.abs(value - hintInstantMs) / MS_PER_HOUR);
    const distanceHours = distances.length > 0 ? Math.min(...distances) : null;
    if (distanceHours !== null && distanceHours <= TASK_MATCH_LIMITS.temporalExactHours) {
      score += TASK_MATCH_WEIGHTS.temporalProximity;
      evidence.push("temporal_proximity");
    } else if (distanceHours !== null && distanceHours <= TASK_MATCH_LIMITS.temporalNearHours) {
      score += TASK_MATCH_WEIGHTS.temporalProximity / 2;
      evidence.push("temporal_proximity_near");
    }
  }

  const auditedMs = instantMs(row.lastAuditedAt);
  // An audit row newer than the observation instant is a data-integrity signal,
  // not a maximally-recent one. Clamping its age to zero is how a garbage clock
  // used to award every task full recency.
  if (auditedMs !== null && auditedMs <= nowMs) {
    const ageDays = (nowMs - auditedMs) / MS_PER_DAY;
    const contribution =
      TASK_MATCH_WEIGHTS.recency * (1 - ageDays / TASK_MATCH_LIMITS.recencyWindowDays);
    // Labelled only when the contribution survives rounding: 2E-DISAMBIG-001
    // renders these to the user, and "recently active" against a contribution
    // of zero is a claim the score does not support.
    if (ageDays < TASK_MATCH_LIMITS.recencyWindowDays && roundScore(contribution) > 0) {
      score += contribution;
      evidence.push("recent_activity");
    }
  }

  const preState: TaskPreState = {
    title: row.title,
    description: row.description,
    status: row.status,
    dueAt: row.dueAt,
    plannedAt: row.plannedAt,
    manualPriority: row.manualPriority,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    intentionalNoDue: row.intentionalNoDue,
    noDueReason: row.noDueReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    projectIds: row.projectIds,
    projectNames: row.projectNames,
    contextIds: row.contextIds,
    contextNames: row.contextNames,
    personIds: row.personIds,
    personNames: row.personNames,
    personRoles: row.personRoles,
  };

  return {
    taskId: row.taskId,
    preState,
    // Published capped, ordered uncapped. The weights can sum past 1, and
    // clamping made a candidate with eight fired signals tie with one that had
    // six — which can only ever *cause* ambiguity, never a false match, but it
    // also reversed their order in the disambiguation list. `rawScore` keeps the
    // order truthful while `score` keeps the 0..1 contract of PRD §7.
    score: roundScore(Math.min(1, score)),
    rawScore: score,
    evidence,
  };
}

/**
 * 2E-MATCH-009: total and deterministic.
 *
 * Plain code-unit comparison on the title, not `localeCompare`, which
 * `rankEntityCandidates` uses and which resolves against the *host's* ICU data
 * — the same two candidates can order differently on a developer's machine and
 * on the deployment, which is not a tie-break a fixture can pin. `taskId` is
 * unique, so the order is total whatever the titles do.
 */
function compareCandidates(left: ScoredCandidate, right: ScoredCandidate): number {
  if (right.rawScore !== left.rawScore) return right.rawScore - left.rawScore;
  if (left.preState.title !== right.preState.title) {
    return left.preState.title < right.preState.title ? -1 : 1;
  }
  return left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0;
}

function publish(candidate: ScoredCandidate): RankedTaskCandidate {
  return {
    taskId: candidate.taskId,
    preState: candidate.preState,
    score: candidate.score,
    evidence: candidate.evidence,
  };
}

export function rankTaskCandidates(input: TaskMatchInput): TaskMatchResult {
  const { command, rows, ownerId, now, timeZone } = input;
  const policy = actionPolicy(command.action);
  const nowMs = requireInstantMs(now);

  // 2E-MATCH-004. Read from the row count against the limit SQL reports having
  // applied, before anything is filtered away: the probe row proves the set was
  // truncated regardless of whether it would have scored.
  //
  // The *smallest* limit any row reports, not the first row's: a disagreeing
  // first row would otherwise hide a truncation, and the value guards a
  // one-step apply.
  const declaredLimit =
    rows.length > 0
      ? Math.min(...rows.map((row) => row.effectiveLimit))
      : TASK_MATCH_LIMITS.candidates;
  const overflowed = rows.length > declaredLimit;

  // Truncating here is safe in a way `rankEntityCandidates` is not: SQL already
  // applied a total deterministic order, so the rows being dropped are exactly
  // the probe rows beyond the limit, not an arbitrary slice of an unordered
  // array.
  const selected = rows.slice(0, declaredLimit);
  const hintInstantMs = resolveHintInstant(command.targetHints.temporalPhrase, now, timeZone);

  const scored = selected
    // 2E-MATCH-001, third layer. The RPC predicates on `auth.uid()`; this is
    // the one that survives a future caller passing rows from somewhere else.
    .filter((row) => row.ownerId === ownerId)
    // 2E-MATCH-002, defence in depth. Eligibility is the taxonomy's, and the
    // RPC filters on the array this process sent it — so an argument built from
    // the wrong action would otherwise rank a task the action cannot legally
    // touch.
    .filter((row) => isEligibleStatus(command.action, row.status))
    .map((row) => scoreRow({ row, command, hintInstantMs, nowMs }))
    .sort(compareCandidates);

  // 2E-MATCH-015: a row below the floor is not a weak candidate, it is not a
  // candidate. Nothing downstream may fall back to "the first one".
  const qualifying = scored.filter(
    (candidate) => candidate.score >= TASK_MATCH_THRESHOLDS.minCandidateScore,
  );

  const margin = calculateCandidateMargin(qualifying.map((candidate) => candidate.score));
  const topScore = qualifying.length > 0 ? qualifying[0].score : 0;
  const candidates = qualifying.slice(0, TASK_MATCH_LIMITS.ranked).map(publish);

  const base = {
    candidates,
    topScore,
    margin,
    overflowed,
    requiresConfirmation: policy.requiresConfirmation,
    destructive: policy.destructive,
    qualifyingCount: qualifying.length,
    ownerId,
    // The *earliest* observation, not the first row's.
    //
    // SQL cross-joins one `observed_before` onto every row, so in practice they
    // agree — `loadTaskCandidates` raises if they do not. But this value is what
    // 2E-UPDATE-003's TOCTOU gate will compare against and what 2E-PREVIEW-004
    // will hash, and it was being read from `rows[0]` on trust, even when that
    // row is dropped moments later as cross-owner or ineligible. The same
    // argument that makes `effectiveLimit` a minimum applies here and more
    // sharply: of two disagreeing instants the earlier is the weaker claim, and
    // a gate should be built on the weaker one.
    observedBefore: earliestObservation(rows),
    matchPolicyVersion: TASK_MATCH_POLICY_VERSION,
  } as const;

  // Order matters. A truncated set cannot support "nothing matched" — the row
  // that would have won may be the one that was cut — so 2E-MATCH-004's "never
  // one-step applied" outranks even a confident verdict.
  //
  // But `ambiguous_overflow` also has to be *renderable*: 2E-DISAMBIG-001
  // presents competing candidates, and returning "too many, narrow this down"
  // with an empty list is unsatisfiable copy. When the set was truncated and
  // nothing qualified, the truthful outcome is `unmatched` — which routes to
  // 2E.6's clarification — with `overflowed` still true so the surface can say
  // there was more than it could look at.
  if (overflowed && qualifying.length > 0) {
    return { ...base, outcome: "ambiguous_overflow", oneStep: false };
  }
  if (qualifying.length === 0) {
    return { ...base, outcome: "unmatched", oneStep: false };
  }
  if (topScore < TASK_MATCH_THRESHOLDS.topScore || margin < TASK_MATCH_THRESHOLDS.minMargin) {
    return { ...base, outcome: "ambiguous", oneStep: false };
  }

  // 2E-MATCH-012: identification confidence is settled above; action gravity
  // decides presentation, and only here. Collapsing the two would show the user
  // a disambiguation list of exactly one entry for every cancellation.
  if (policy.requiresConfirmation) {
    return { ...base, outcome: "matched_requires_confirmation", oneStep: false };
  }
  // 2E-MATCH-013: `oneStepEligible` is false for every destructive action in
  // the taxonomy, and the invariant is pinned by test rather than restated here.
  return { ...base, outcome: "matched", oneStep: policy.oneStepEligible };
}

/**
 * The eligible statuses the candidate query must filter on, straight from the
 * taxonomy (2E-MATCH-002).
 *
 * Exported so the data-access layer never assembles this list itself: PRD §11.2
 * having one executable form is the whole point of `taxonomy.ts`.
 */
export function eligibleStatusesFor(action: TaskCommandAction): readonly string[] {
  return actionPolicy(action).eligibleFrom;
}

/**
 * The bound `list_task_command_candidates` puts on the hint's token array.
 *
 * Mirrors `limit 16` in the migration's `hint_query` CTE. Deliberately *not* in
 * `match-policy.ts`: it is a query bound rather than a scoring knob — no
 * well-formed command can reach it, because 2E-COMMAND-005 caps `titleWords` at
 * 12 — and putting it inside the policy digest would make a SQL-side query
 * change look like a scoring change and force a `TASK_MATCH_POLICY_VERSION` bump
 * that misattributes every past match. `sql-reachability.test.ts` pins it
 * against the migration text instead, which is the same cross-file technique
 * `status-vocabulary-parity.test.ts` uses for the status literals.
 */
const SQL_MAX_QUERY_TOKENS = 16;

/** Mirrors `least(greatest(coalesce(p_limit, 25), 1), 100)` in the migration. */
const SQL_MAX_EFFECTIVE_LIMIT = 100;

/**
 * Stands in for an unresolved `*_ref_id` or `*_ref_name` in the cross-row
 * agreement check below.
 *
 * The check keys on value identity, and the six reference columns are the only
 * query-scalars that are nullable. Dropping the nulls instead would make a set of
 * one resolved and one unresolved row *agree* — which is precisely the
 * disagreement worth catching — so they are folded to a value that cannot be
 * mistaken for one `resolve_owned_entity_exact` returns, since that function
 * returns a uuid or nothing.
 *
 * A stored *name* could in principle be this string, unlike a uuid. That costs
 * nothing here: the folding only ever *creates* agreement between a null and a
 * literal `<unresolved>`, and a set mixing those two carries one resolved
 * reference and one unresolved one — which the id columns, resolved by the same
 * CTE from the same argument, already report as a disagreement.
 */
const UNRESOLVED_REF = "<unresolved>";

/**
 * The part of a candidate row whose values SQL derives rather than reads.
 *
 * `TaskCandidateRow` satisfies this structurally; naming the subset keeps the
 * reachability rules from appearing to depend on the pre-state columns, which
 * are projected verbatim from `public.tasks` and constrain nothing.
 */
export type TaskCandidateShape = {
  readonly prefilterTier: number;
  readonly tokenOverlap: number;
  readonly queryTokenCount: number;
  readonly projectHintMatched: boolean;
  readonly contextHintMatched: boolean;
  readonly personHintMatched: boolean;
  readonly effectiveLimit: number;
  readonly observedBefore: string;
};

/**
 * The patch's resolved relation references, as a shape the set-level check can
 * read without them entering `TaskCandidateShape`.
 *
 * They are query-scalars like `effectiveLimit` and `observedBefore`, so the
 * *set* constrains them — but they are not per-row derivations, so no rule in
 * `describeUnreachableRow` may consult them and they are kept out of the type
 * that names its inputs. Optional, and deliberately so: `TaskCandidateRow`
 * satisfies this with all three present, while a caller holding only the derived
 * columns has no values to disagree about and should not be required to invent
 * them.
 */
export type TaskCandidateRefScalars = {
  readonly projectRefId?: string | null;
  readonly contextRefId?: string | null;
  readonly personRefId?: string | null;
  /**
   * The resolved entities' stored names, checked on exactly the same ground as
   * the ids: the `refs` CTE derives them from `ref_ids` in the same single-row
   * cross join, so a result set whose rows disagree about one is a broken
   * contract rather than an unusual query.
   *
   * Not redundant with the ids. A set could agree on `projectRefId` and disagree
   * on `projectRefName` only if the name subqueries stopped being keyed on the
   * id — a projection that had started reading a name from somewhere else — and
   * that is precisely the failure a preview would render as the wrong label
   * beside the right assignment.
   */
  readonly projectRefName?: string | null;
  readonly contextRefName?: string | null;
  readonly personRefName?: string | null;
};

function describeUnreachableRow(row: TaskCandidateShape): string | null {
  const tiers: readonly number[] = Object.values(TASK_MATCH_PREFILTER_TIERS);
  if (!Number.isInteger(row.prefilterTier) || !tiers.includes(row.prefilterTier)) {
    return `prefilter tier ${row.prefilterTier} is not one of the declared tiers`;
  }
  if (!Number.isInteger(row.tokenOverlap) || row.tokenOverlap < 0) {
    return `token overlap ${row.tokenOverlap} is not a non-negative integer`;
  }
  if (!Number.isInteger(row.queryTokenCount) || row.queryTokenCount < 0) {
    return `query token count ${row.queryTokenCount} is not a non-negative integer`;
  }
  if (row.queryTokenCount > SQL_MAX_QUERY_TOKENS) {
    return `query token count ${row.queryTokenCount} exceeds the ${SQL_MAX_QUERY_TOKENS}-token bound the hint CTE applies`;
  }
  // `overlap` counts a subset of `q.tokens`, so it can never exceed its
  // cardinality. A row claiming otherwise would score a fraction above 1.
  if (row.tokenOverlap > row.queryTokenCount) {
    return `token overlap ${row.tokenOverlap} exceeds the query's ${row.queryTokenCount} tokens`;
  }
  if (
    !Number.isInteger(row.effectiveLimit)
    || row.effectiveLimit < 1
    || row.effectiveLimit > SQL_MAX_EFFECTIVE_LIMIT
  ) {
    return `effective limit ${row.effectiveLimit} is outside the clamp SQL applies`;
  }

  const anyRelationHit =
    row.projectHintMatched || row.contextHintMatched || row.personHintMatched;

  // Tiers 0 and 1 both mean "the whole normalized hint is present in the title
  // as complete words", so every one of the hint's tokens is in the title and
  // the overlap is necessarily total. A tier-0 row reporting partial overlap is
  // a contradiction SQL cannot produce, and scoring it would credit an exact
  // title with a fractional token bonus no query could have justified.
  if (
    row.prefilterTier === TASK_MATCH_PREFILTER_TIERS.exactTitle
    || row.prefilterTier === TASK_MATCH_PREFILTER_TIERS.titlePhrase
  ) {
    if (row.queryTokenCount < 1) {
      return `tier ${row.prefilterTier} requires a non-empty normalized hint, so it cannot report zero query tokens`;
    }
    if (row.tokenOverlap !== row.queryTokenCount) {
      return `tier ${row.prefilterTier} carries every hint token, so overlap must equal the query's ${row.queryTokenCount} tokens, not ${row.tokenOverlap}`;
    }
    return null;
  }

  if (row.prefilterTier === TASK_MATCH_PREFILTER_TIERS.connected) {
    if (row.tokenOverlap === 0 && !anyRelationHit) {
      return "tier 2 is reached by a shared token or a relation hit, and this row reports neither";
    }
    return null;
  }

  // Tier 3 is computed for any unconnected row, but the `ranked` CTE only
  // *returns* one when every hint was empty — so a returned tier-3 row cannot
  // carry a relation hit or a token count.
  if (anyRelationHit) {
    return "tier 3 cannot carry a relation hit, which would have qualified the row as tier 2";
  }
  if (row.queryTokenCount !== 0 || row.tokenOverlap !== 0) {
    return "tier 3 is only returned when the command carried no hint at all, so it cannot report query tokens";
  }
  return null;
}

/**
 * Why this result set could not have come from `list_task_command_candidates`,
 * or null when it could have.
 *
 * The scorer reads `prefilterTier`, `tokenOverlap` and `queryTokenCount` as the
 * authoritative normalizer's verdict and never re-derives them (2E-MATCH-007),
 * which means it trusts combinations it has no way to check. Some of those
 * combinations are not merely unlikely, they are unproducible: a tier-0 row
 * with partial token overlap, a tier-3 row carrying a relation hit, an overlap
 * larger than the token array it counts. Left unstated, a fixture could assert
 * behaviour against an input SQL cannot emit — and a migration that started
 * emitting one would be scored rather than caught.
 *
 * Consumed by `loadTaskCandidates`, which raises on a violation for the same
 * reason it raises on a cross-owner row: the likeliest cause is a migration that
 * landed ahead of this code, and scoring it quietly would hide that.
 * `rankTaskCandidates` deliberately does *not* call this — it must stay total
 * for callers that did not come through the data-access layer, and its own
 * filters already refuse to act on a row it cannot justify.
 */
export function describeUnreachableCandidates(
  rows: readonly (TaskCandidateShape & TaskCandidateRefScalars)[],
): string | null {
  for (const [index, row] of rows.entries()) {
    const reason = describeUnreachableRow(row);
    if (reason !== null) return `row ${index}: ${reason}`;
  }
  // Nine values are computed once per query and cross-joined onto every row —
  // `cardinality(q.tokens)`, `b.lim`, `b.observed_before`, the three
  // `rf.*_ref_id` the `refs` CTE resolves and the three `rf.*_ref_name` it reads
  // for them — so a result set carrying two of any of them is a broken contract
  // rather than an unusual query. All nine are checked, because a review found
  // the defence applied to one and not the others, and `observed_before` is the
  // one that will guard a write in Slice 2E.4.
  const disagreement = (label: string, values: readonly (string | number)[]): string | null => {
    const distinct = [...new Set(values)];
    if (distinct.length <= 1) return null;
    return `${label} differs across one result set (${distinct.slice(0, 4).map(String).sort().join(", ")}), and SQL computes it once per query`;
  };

  // The reference columns are the only nullable members of that set, and the
  // helper above keys on value identity. Folding null to `UNRESOLVED_REF` rather
  // than filtering it out is what keeps "one row resolved Acme, the other
  // resolved nothing" a disagreement — the case that matters most, because Slice
  // 2E.4 binds the resolved *id* rather than the user's words, so two ids in one
  // set means the preview and the apply could name different projects.
  const references = (
    pick: (row: TaskCandidateRefScalars) => string | null | undefined,
  ): readonly string[] => rows.map((row) => pick(row) ?? UNRESOLVED_REF);

  // The names are checked as well as the ids, and not as a formality. They are
  // what 2E-PREVIEW-002 renders as the proposed value of a relation, so a set
  // carrying two of them means one candidate's preview would name a different
  // project from another's — while the ids, and therefore the write, agreed.
  return (
    disagreement("query token count", rows.map((row) => row.queryTokenCount))
    ?? disagreement("effective limit", rows.map((row) => row.effectiveLimit))
    ?? disagreement("observation instant", rows.map((row) => row.observedBefore))
    ?? disagreement("resolved project reference", references((row) => row.projectRefId))
    ?? disagreement("resolved context reference", references((row) => row.contextRefId))
    ?? disagreement("resolved person reference", references((row) => row.personRefId))
    ?? disagreement("resolved project reference name", references((row) => row.projectRefName))
    ?? disagreement("resolved context reference name", references((row) => row.contextRefName))
    ?? disagreement("resolved person reference name", references((row) => row.personRefName))
  );
}

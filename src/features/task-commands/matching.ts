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
 * anything.
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
  TASK_MATCH_THRESHOLDS,
  TASK_MATCH_WEIGHTS,
  roundScore,
  type TaskMatchEvidence,
} from "./match-policy";
import { isEligibleStatus, type TaskCommandAction, actionPolicy } from "./taxonomy";
import { resolveTemporalPhrase } from "./temporal";
import type { ValidatedTaskCommand } from "./schema";

/**
 * One row of `public.list_task_command_candidates`, camel-cased.
 *
 * `prefilterTier`, `tokenOverlap` and `queryTokenCount` are the authoritative
 * normalizer's verdict, not raw text to re-analyse. `effectiveLimit` is the
 * limit SQL actually applied after clamping, so overflow is read from the data
 * rather than assumed from the constant this process asked for.
 */
export type TaskCandidateRow = {
  readonly taskId: string;
  readonly ownerId: string;
  readonly title: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly plannedAt: string | null;
  readonly manualPriority: string | null;
  readonly createdAt: string;
  readonly projectNames: readonly string[];
  readonly contextNames: readonly string[];
  readonly personNames: readonly string[];
  readonly projectHintMatched: boolean;
  readonly contextHintMatched: boolean;
  readonly personHintMatched: boolean;
  readonly lastAuditedAt: string | null;
  /** 0 exact title, 1 phrase containment, 2 some connection, 3 none. */
  readonly prefilterTier: number;
  readonly tokenOverlap: number;
  readonly queryTokenCount: number;
  readonly effectiveLimit: number;
};

export type RankedTaskCandidate = {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly plannedAt: string | null;
  readonly manualPriority: string | null;
  readonly projectNames: readonly string[];
  readonly contextNames: readonly string[];
  readonly personNames: readonly string[];
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
  /** How many candidates cleared the floor, before the presentation cap. */
  readonly qualifyingCount: number;
  readonly matchPolicyVersion: string;
};

export type TaskMatchInput = {
  readonly command: ValidatedTaskCommand;
  readonly rows: readonly TaskCandidateRow[];
  /** The authenticated caller, re-checked here as 2E-MATCH-001's third layer. */
  readonly ownerId: string;
  readonly now: string | Date;
  readonly timeZone: string;
};

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

function instantMs(value: string | Date | null): number | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The temporal hint resolved once per match rather than once per candidate.
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

function scoreRow(input: {
  row: TaskCandidateRow;
  command: ValidatedTaskCommand;
  hintInstantMs: number | null;
  nowMs: number;
}): RankedTaskCandidate {
  const { row, command, hintInstantMs, nowMs } = input;
  const evidence: TaskMatchEvidence[] = [];
  let score = 0;

  // The title ladder: graded, so a title that *is* the hint is not also
  // credited with containing it.
  if (row.prefilterTier === 0) {
    score += TASK_MATCH_WEIGHTS.exactTitle;
    evidence.push("normalized_exact_title");
  } else if (row.prefilterTier === 1) {
    score += TASK_MATCH_WEIGHTS.titlePhrase;
    evidence.push("normalized_title_phrase");
  }

  if (row.queryTokenCount > 0 && row.tokenOverlap > 0) {
    const fraction = Math.min(1, row.tokenOverlap / row.queryTokenCount);
    score += TASK_MATCH_WEIGHTS.tokenOverlap * fraction;
    evidence.push("normalized_token_overlap");
  }

  if (row.projectHintMatched) {
    score += TASK_MATCH_WEIGHTS.referencedProject;
    evidence.push("referenced_project");
  }
  if (row.contextHintMatched) {
    score += TASK_MATCH_WEIGHTS.referencedContext;
    evidence.push("referenced_context");
  }
  if (row.personHintMatched) {
    score += TASK_MATCH_WEIGHTS.referencedPerson;
    evidence.push("referenced_person");
  }

  // The status hint was canonicalized to one of the eight literals by
  // `validateTaskCommand`, so this is a comparison and never a parse.
  if (command.targetHints.status !== undefined && command.targetHints.status === row.status) {
    score += TASK_MATCH_WEIGHTS.statusMatch;
    evidence.push("status_match");
  }

  if (hintInstantMs !== null) {
    const taskInstant = instantMs(row.dueAt) ?? instantMs(row.plannedAt);
    if (taskInstant !== null) {
      const distanceHours = Math.abs(taskInstant - hintInstantMs) / MS_PER_HOUR;
      if (distanceHours <= TASK_MATCH_LIMITS.temporalExactHours) {
        score += TASK_MATCH_WEIGHTS.temporalProximity;
        evidence.push("temporal_proximity");
      } else if (distanceHours <= TASK_MATCH_LIMITS.temporalNearHours) {
        score += TASK_MATCH_WEIGHTS.temporalProximity / 2;
        evidence.push("temporal_proximity");
      }
    }
  }

  const auditedMs = instantMs(row.lastAuditedAt);
  if (auditedMs !== null) {
    const ageDays = Math.max(0, nowMs - auditedMs) / MS_PER_DAY;
    if (ageDays < TASK_MATCH_LIMITS.recencyWindowDays) {
      score += TASK_MATCH_WEIGHTS.recency * (1 - ageDays / TASK_MATCH_LIMITS.recencyWindowDays);
      evidence.push("recent_activity");
    }
  }

  return {
    taskId: row.taskId,
    title: row.title,
    status: row.status,
    dueAt: row.dueAt,
    plannedAt: row.plannedAt,
    manualPriority: row.manualPriority,
    projectNames: row.projectNames,
    contextNames: row.contextNames,
    personNames: row.personNames,
    score: roundScore(Math.min(1, score)),
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
function compareCandidates(left: RankedTaskCandidate, right: RankedTaskCandidate): number {
  if (right.score !== left.score) return right.score - left.score;
  if (left.title !== right.title) return left.title < right.title ? -1 : 1;
  return left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0;
}

export function rankTaskCandidates(input: TaskMatchInput): TaskMatchResult {
  const { command, rows, ownerId, now, timeZone } = input;
  const policy = actionPolicy(command.action);
  const nowMs = instantMs(now) ?? 0;

  // 2E-MATCH-004. Read from the row count against the limit SQL reports having
  // applied, before anything is filtered away: the probe row proves the set was
  // truncated regardless of whether it would have scored.
  const declaredLimit = rows.length > 0 ? rows[0].effectiveLimit : TASK_MATCH_LIMITS.candidates;
  const overflowed = rows.length > declaredLimit;

  // Truncating here is safe in a way `rankEntityCandidates` is not: SQL already
  // applied a total deterministic order, so the rows being dropped are exactly
  // the probe rows beyond the limit, not an arbitrary slice of an unordered
  // array.
  const selected = rows.slice(0, declaredLimit);

  const scored = selected
    // 2E-MATCH-001, third layer. The RPC predicates on `auth.uid()` and forced
    // RLS re-applies the same boundary; this is the one that survives a future
    // caller passing rows from somewhere else.
    .filter((row) => row.ownerId === ownerId)
    // 2E-MATCH-002, defence in depth. Eligibility is the taxonomy's, and the
    // RPC filters on the array this process sent it — so an argument built from
    // the wrong action would otherwise rank a task the action cannot legally
    // touch.
    .filter((row) => isEligibleStatus(command.action, row.status))
    .map((row) =>
      scoreRow({
        row,
        command,
        hintInstantMs: resolveHintInstant(command.targetHints.temporalPhrase, now, timeZone),
        nowMs,
      }),
    )
    .sort(compareCandidates);

  // 2E-MATCH-015: a row below the floor is not a weak candidate, it is not a
  // candidate. Nothing downstream may fall back to "the first one".
  const qualifying = scored.filter(
    (candidate) => candidate.score >= TASK_MATCH_THRESHOLDS.minCandidateScore,
  );

  const margin = calculateCandidateMargin(qualifying.map((candidate) => candidate.score));
  const topScore = qualifying.length > 0 ? qualifying[0].score : 0;
  const candidates = qualifying.slice(0, TASK_MATCH_LIMITS.ranked);

  const base = {
    candidates,
    topScore,
    margin,
    overflowed,
    requiresConfirmation: policy.requiresConfirmation,
    destructive: policy.destructive,
    qualifyingCount: qualifying.length,
    matchPolicyVersion: TASK_MATCH_POLICY_VERSION,
  } as const;

  // Order matters, and overflow comes first on purpose. A truncated set cannot
  // support "nothing matched" — the row that would have won may be the one that
  // was cut — so 2E-MATCH-004's "never one-step applied" outranks even the
  // no-match verdict.
  if (overflowed) {
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

/**
 * Content-free analytics for the command surface (PRD §18, 2E-ANALYTICS).
 *
 * 2E-ANALYTICS-001 names exactly seven things a Phase 2E event may carry:
 * candidate count, policy version, signal categories, score and margin bands,
 * outcome category, one-step boolean, confirmation boolean. This module is the
 * only place those are assembled, and every builder here is a pure function
 * from already-computed decisions to a bounded record — it never reads a task,
 * a title, a command string, a prompt, or an id.
 *
 * 2E-ANALYTICS-003 is enforced structurally rather than by review: none of the
 * builders below accepts a `TaskCandidateRow`, a `TaskPreState`, a
 * `TaskCommandPreview` or a `ValidatedTaskCommand`. What they cannot see, they
 * cannot leak.
 *
 * **The band boundaries are derived from the declared match policy, not
 * invented here.** 2E-ANALYTICS-002 required the band *vocabulary*
 * (`TASK_MATCH_SCORE_BANDS`) to be settled before it entered a CHECK
 * constraint, because a band literal in a constraint is permanent. The
 * boundaries that assign a score to a band were deliberately left out of
 * `match-policy.ts` until a caller existed (`match-policy.ts:183-191`); this is
 * that caller. They are expressed as arithmetic over `TASK_MATCH_THRESHOLDS`
 * so that re-tuning the policy moves the bands with it and no fourth magic
 * number ever has to agree with the other three.
 */

import {
  TASK_MATCH_EVIDENCE,
  TASK_MATCH_THRESHOLDS,
  type TaskMatchEvidence,
  type TaskMatchScoreBand,
} from "./match-policy";
import { TASK_COMMAND_POLICY_VERSION } from "./taxonomy";
import { TASK_COMMAND_OUTCOMES, type TaskCommandOutcome } from "./outcomes";

/**
 * A score's band.
 *
 * - `none` — below `minCandidateScore`, so not even a candidate.
 * - `low` — a candidate, but under the confidence threshold.
 * - `medium` — over the confidence threshold.
 * - `high` — over it by a full minimum margin.
 *
 * Every boundary is a declared threshold or a sum of two, so the four bands
 * stay meaningful if the policy is re-tuned. `high` in particular means
 * something a reader can check: the score cleared `topScore` with margin to
 * spare, in the units the margin rule already uses.
 */
export function scoreBand(score: number): TaskMatchScoreBand {
  if (!Number.isFinite(score) || score < TASK_MATCH_THRESHOLDS.minCandidateScore) return "none";
  if (score < TASK_MATCH_THRESHOLDS.topScore) return "low";
  if (score < TASK_MATCH_THRESHOLDS.topScore + TASK_MATCH_THRESHOLDS.minMargin) return "medium";
  return "high";
}

/**
 * A margin's band, in the same vocabulary and on the same rule.
 *
 * `minMargin` is the separation 2E-MATCH-011 requires, so `low` is exactly
 * "too close to separate" and `high` is "separated by twice what we demand".
 * The zero case lands in `none` without a special branch: a margin at or below
 * zero is under every threshold.
 */
export function marginBand(margin: number): TaskMatchScoreBand {
  if (!Number.isFinite(margin) || margin <= 0) return "none";
  if (margin < TASK_MATCH_THRESHOLDS.minMargin) return "low";
  if (margin < TASK_MATCH_THRESHOLDS.minMargin * 2) return "medium";
  return "high";
}

/**
 * The evidence labels that fired, deduplicated and in the declared order.
 *
 * Ordered by `TASK_MATCH_EVIDENCE` rather than sorted lexically: the declared
 * order is the one the policy module owns, so two payloads describing the same
 * signals are byte-identical without a second ordering rule that could drift
 * from it. Labels only — 2E-ANALYTICS-001 says "signal categories", and a
 * category names which signal fired, never what it matched on.
 */
export function signalCategories(
  evidence: readonly (readonly TaskMatchEvidence[])[],
): readonly TaskMatchEvidence[] {
  const seen = new Set<TaskMatchEvidence>();
  for (const list of evidence) for (const signal of list) seen.add(signal);
  return TASK_MATCH_EVIDENCE.filter((signal) => seen.has(signal));
}

/**
 * Where a command was driven from.
 *
 * Bounded to the two surfaces Slice 2E.7 mounts. It is a *category*, not a
 * route: adding a third mount adds a literal here and in the migration, which
 * is the same discipline `productSurfaces` follows.
 */
export const TASK_COMMAND_ORIGINS = ["chat", "work"] as const;
export type TaskCommandOrigin = (typeof TASK_COMMAND_ORIGINS)[number];

/**
 * Which action performed the write.
 *
 * `direct` is an apply from a preview that needed no separate confirmation
 * step; it is deliberately *not* named `one_step`, because a one-step-eligible
 * match and a preview reached through an explicit disambiguation both apply
 * through that route, and only the first is "one step". Whether the match was
 * one-step eligible is already carried on the preview event, where it is
 * truthful.
 */
export const TASK_COMMAND_APPLY_ROUTES = ["direct", "confirmed", "created"] as const;
export type TaskCommandApplyRoute = (typeof TASK_COMMAND_APPLY_ROUTES)[number];

/**
 * 2E-UX-001's twelve outcomes plus `previewed`.
 *
 * `previewed` is the one `TASK_COMMAND_PREVIEW_DISPOSITIONS` member the outcome
 * vocabulary deliberately excludes, and the preview event is exactly where it
 * has to be reportable: a one-step-eligible match rests there, and folding it
 * onto another category would make PRD §18's first question — how often a
 * command matched in one step — unanswerable from the event that exists to
 * answer it. The twelve are unchanged; this adds one and invents none.
 */
export const TASK_COMMAND_PREVIEWED_OUTCOMES = [
  ...TASK_COMMAND_OUTCOMES,
  "previewed",
] as const;

export type TaskCommandPreviewedOutcome = (typeof TASK_COMMAND_PREVIEWED_OUTCOMES)[number];

export type TaskCommandPreviewedProperties = {
  readonly commandOrigin: TaskCommandOrigin;
  readonly outcomeCategory: TaskCommandPreviewedOutcome;
  readonly candidateCount: number;
  readonly scoreBand: TaskMatchScoreBand;
  readonly marginBand: TaskMatchScoreBand;
  readonly signalCategories: readonly TaskMatchEvidence[];
  readonly oneStep: boolean;
  readonly requiresConfirmation: boolean;
  readonly policyVersion: string;
};

/**
 * The parse-match-preview round, as a measurement.
 *
 * `candidateCount` is how many were *shown*, which is what "how often was it
 * ambiguous" is asked about. It is a count and never an identity.
 */
export function buildTaskCommandPreviewedProperties(input: {
  readonly origin: TaskCommandOrigin;
  readonly outcome: TaskCommandPreviewedOutcome;
  readonly candidateCount: number;
  readonly topScore: number;
  readonly margin: number;
  readonly evidence: readonly (readonly TaskMatchEvidence[])[];
  readonly oneStep: boolean;
  readonly requiresConfirmation: boolean;
}): TaskCommandPreviewedProperties {
  return {
    commandOrigin: input.origin,
    outcomeCategory: input.outcome,
    candidateCount: Math.max(0, Math.trunc(input.candidateCount)),
    scoreBand: scoreBand(input.topScore),
    marginBand: marginBand(input.margin),
    signalCategories: signalCategories(input.evidence),
    oneStep: input.oneStep,
    requiresConfirmation: input.requiresConfirmation,
    policyVersion: TASK_COMMAND_POLICY_VERSION,
  };
}

export type TaskCommandDisambiguatedProperties = {
  readonly commandOrigin: TaskCommandOrigin;
  readonly candidateCount: number;
  /**
   * The 1-based rank of what the user picked, or 0 when the pick was not in the
   * list this process ranked.
   *
   * PRD §18 asks "how often the user's selection differed from the top-ranked
   * candidate" — that is exactly `selectedRank > 1`, and a rank is a position
   * rather than an identity, so it discloses nothing about the task.
   */
  readonly selectedRank: number;
  readonly policyVersion: string;
};

export function buildTaskCommandDisambiguatedProperties(input: {
  readonly origin: TaskCommandOrigin;
  readonly candidateCount: number;
  readonly selectedRank: number;
}): TaskCommandDisambiguatedProperties {
  return {
    commandOrigin: input.origin,
    candidateCount: Math.max(0, Math.trunc(input.candidateCount)),
    selectedRank: Math.max(0, Math.trunc(input.selectedRank)),
    policyVersion: TASK_COMMAND_POLICY_VERSION,
  };
}

export type TaskCommandAppliedProperties = {
  readonly commandOrigin: TaskCommandOrigin;
  readonly outcomeCategory: TaskCommandOutcome;
  readonly applyRoute: TaskCommandApplyRoute;
  readonly replayed: boolean;
  readonly policyVersion: string;
};

/**
 * A write attempt that came to rest — applied, replayed, or refused.
 *
 * `outcomeCategory` is 2E-UX-001's own vocabulary, so "how often did a preview
 * go stale" and "how often was there nothing to change" are answerable without
 * a second failure taxonomy. The declared `2E_*` failure token is deliberately
 * *not* carried: it is a database contract rather than a product measurement,
 * and the outcome is the category §18 asks about.
 */
export function buildTaskCommandAppliedProperties(input: {
  readonly origin: TaskCommandOrigin;
  readonly outcome: TaskCommandOutcome;
  readonly route: TaskCommandApplyRoute;
  readonly replayed: boolean;
}): TaskCommandAppliedProperties {
  return {
    commandOrigin: input.origin,
    outcomeCategory: input.outcome,
    applyRoute: input.route,
    replayed: input.replayed,
    policyVersion: TASK_COMMAND_POLICY_VERSION,
  };
}

/** What an undo attempt resolved to. Bounded, and never a message. */
export const TASK_COMMAND_UNDO_RESULTS = ["undone", "unavailable", "expired", "refused"] as const;
export type TaskCommandUndoResult = (typeof TASK_COMMAND_UNDO_RESULTS)[number];

export type TaskCommandUndoneProperties = {
  readonly commandOrigin: TaskCommandOrigin;
  readonly undoResult: TaskCommandUndoResult;
  readonly policyVersion: string;
};

export function buildTaskCommandUndoneProperties(input: {
  readonly origin: TaskCommandOrigin;
  readonly result: TaskCommandUndoResult;
}): TaskCommandUndoneProperties {
  return {
    commandOrigin: input.origin,
    undoResult: input.result,
    policyVersion: TASK_COMMAND_POLICY_VERSION,
  };
}

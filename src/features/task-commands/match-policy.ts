/**
 * The one module that declares every weight, threshold, limit and band Phase 2E
 * matching uses (PRD 2E-MATCH-016).
 *
 * "In one module" is not tidiness. A weight that lives beside the code that
 * applies it gets tuned in place, and a decision recorded three weeks earlier
 * stops being attributable to the rules that produced it. Everything here is
 * pinned by a digest in `policy-lock.test.ts`, so changing any number moves the
 * digest and the commit cannot land until the author has been asked whether
 * `TASK_MATCH_POLICY_VERSION` moved with it (§10.4).
 *
 * Pure data. No clock, no I/O, no Supabase, no model.
 */

/**
 * Bumped whenever any number in this module changes.
 *
 * Distinct from `TASK_COMMAND_POLICY_VERSION` in `taxonomy.ts` on purpose:
 * §10.4 records a `match_policy_version` on every match decision and the
 * command-contract version on every proposal, and collapsing them would force a
 * prompt change to invalidate the attribution of every past match.
 */
export const TASK_MATCH_POLICY_VERSION = "2026-07-25.1";

/**
 * How much each deterministic signal contributes (2E-MATCH-005).
 *
 * The title ladder is graded rather than additive — `exactTitle` and
 * `titlePhrase` are mutually exclusive — because a title that *is* the hint has
 * not also separately "contained" it, and double-counting would push a single
 * strong signal past the threshold that two independent ones are meant to
 * clear.
 *
 * The calibration that matters, and the reason `recency` is the smallest
 * number here: the canonical ambiguity case of PRD §12.2 is two tasks with the
 * same title, and recency must never be able to resolve it on its own. At
 * 0.06 it cannot — the largest gap it can open is below `minMargin`, so two
 * otherwise-identical candidates stay ambiguous however recently one was
 * touched.
 */
export const TASK_MATCH_WEIGHTS = {
  /** The normalized title equals the normalized hint. */
  exactTitle: 0.6,
  /** The whole normalized hint appears in the title as complete words. */
  titlePhrase: 0.4,
  /** Scaled by the fraction of the hint's tokens the title carries. */
  tokenOverlap: 0.22,
  referencedProject: 0.12,
  referencedContext: 0.1,
  referencedPerson: 0.12,
  /** The task holds the status the hint named. */
  statusMatch: 0.08,
  /** The task's due (or planned) instant sits near the hint's temporal phrase. */
  temporalProximity: 0.1,
  /** Decayed distance from the last audited state change. */
  recency: 0.06,
} as const;

export const TASK_MATCH_THRESHOLDS = {
  /** 2E-MATCH-011: below this, the top candidate is not confident enough. */
  topScore: 0.55,
  /** 2E-MATCH-010/011: below this, the top two are too close to separate. */
  minMargin: 0.12,
  /**
   * Below this a row is not a candidate at all.
   *
   * 2E-MATCH-015 forbids a fallback to "first result", and a floor is how that
   * is enforced rather than asserted: a row that merely shares one token out of
   * five scores 0.044 and is dropped, so an empty qualifying set becomes
   * `unmatched` instead of an arbitrary pick.
   */
  minCandidateScore: 0.1,
} as const;

export const TASK_MATCH_LIMITS = {
  /**
   * How many candidates the SQL query may return before it is truncating.
   *
   * The query asks for this plus one (2E-MATCH-004); the extra row is a probe,
   * never a candidate.
   */
  candidates: 25,
  /** How many ranked candidates a disambiguation list may present. */
  ranked: 5,
  /**
   * The window over which an audited state change still counts as recent, and
   * within which its contribution decays linearly to zero.
   */
  recencyWindowDays: 14,
  /** A due/planned instant this close to the hint scores the full weight. */
  temporalExactHours: 24,
  /** ...and this close scores half of it. */
  temporalNearHours: 72,
} as const;

/**
 * The closed evidence vocabulary (2E-MATCH-014).
 *
 * A declared list rather than free-form strings, because 2E-DISAMBIG-001 renders
 * these to the user and 2E-I18N-003's exhaustiveness test needs something to
 * iterate. Each label names the signal that fired, never a value: an evidence
 * label is safe to log, a title is not.
 */
export const TASK_MATCH_EVIDENCE = [
  "normalized_exact_title",
  "normalized_title_phrase",
  "normalized_token_overlap",
  "referenced_project",
  "referenced_context",
  "referenced_person",
  "status_match",
  "temporal_proximity",
  "recent_activity",
] as const;

export type TaskMatchEvidence = (typeof TASK_MATCH_EVIDENCE)[number];

/**
 * Score and margin bands (2E-ANALYTICS-002).
 *
 * Declared here, before any migration, deliberately: a band literal inside a
 * CHECK constraint is permanent, and the vocabulary that ends up in the
 * database must be the one the PRD-governed policy module already committed to.
 * Nothing emits these yet — the first emitting code is Slice 2E.7.
 */
export const TASK_MATCH_SCORE_BANDS = ["none", "low", "medium", "high"] as const;

export type TaskMatchScoreBand = (typeof TASK_MATCH_SCORE_BANDS)[number];

export function scoreBand(score: number): TaskMatchScoreBand {
  if (!Number.isFinite(score) || score <= 0) return "none";
  if (score < TASK_MATCH_THRESHOLDS.minCandidateScore) return "low";
  if (score < TASK_MATCH_THRESHOLDS.topScore) return "medium";
  return "high";
}

export function marginBand(margin: number): TaskMatchScoreBand {
  if (!Number.isFinite(margin) || margin <= 0) return "none";
  if (margin < TASK_MATCH_THRESHOLDS.minMargin) return "low";
  if (margin < TASK_MATCH_THRESHOLDS.minMargin * 2) return "medium";
  return "high";
}

/** Three decimals, matching `calculateCandidateMargin`'s own rounding. */
export function roundScore(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

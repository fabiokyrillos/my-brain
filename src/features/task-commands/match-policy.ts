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
export const TASK_MATCH_POLICY_VERSION = "2026-07-25.2";

/**
 * How much each deterministic signal contributes (2E-MATCH-005).
 *
 * The title ladder is graded rather than additive — `exactTitle` and
 * `titlePhrase` are mutually exclusive — because a title that *is* the hint has
 * not also separately "contained" it, and double-counting would push a single
 * strong signal past the threshold that two independent ones are meant to
 * clear.
 *
 * The calibration that matters: **no single non-lexical signal may reach
 * `minMargin`**, so none of them can resolve the canonical ambiguity case of
 * PRD §12.2 — two tasks with the same title — on its own. `referencedProject`
 * and `referencedPerson` were 0.12, exactly `minMargin`, and a review proved
 * that let one relation hint carry a pair from ambiguous straight to a one-step
 * apply. Worse, for `assign_project` and `set_waiting_on` the hint names the
 * relation the command is about to *add*, so the boost landed on the task that
 * already had it. They are now 0.1, and `scoreRow` additionally refuses to
 * score the relation the requested action writes.
 */
export const TASK_MATCH_WEIGHTS = {
  /** The normalized title equals the normalized hint. */
  exactTitle: 0.6,
  /** The whole normalized hint appears in the title as complete words. */
  titlePhrase: 0.4,
  /** Scaled by the fraction of the hint's tokens the title carries. */
  tokenOverlap: 0.22,
  referencedProject: 0.1,
  referencedContext: 0.1,
  referencedPerson: 0.1,
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
  /**
   * Decimal places every published score and margin is rounded to.
   *
   * Declared here rather than inlined in `roundScore` so it is inside the
   * digest: a review demonstrated that changing it to two left every pinned
   * score in the suite unchanged, which made a real precision change invisible.
   */
  scoreDecimals: 3,
} as const;

/**
 * The tier vocabulary `list_task_command_candidates` assigns and `scoreRow`
 * decodes.
 *
 * A cross-language contract carried by bare integers is the same defect class
 * as the normalizer divergence of 2E-MATCH-008, in a place the PRD did not
 * anticipate: inserting a tier in the SQL `case` would silently re-score every
 * match. Declaring it here puts it inside the policy digest, and
 * `status-vocabulary-parity.test.ts` holds the migration to it.
 */
export const TASK_MATCH_PREFILTER_TIERS = {
  /** The normalized title equals the normalized hint. */
  exactTitle: 0,
  /** The whole normalized hint appears in the title as complete words. */
  titlePhrase: 1,
  /** Some lexical or relational connection exists. */
  connected: 2,
  /** None does. Only reachable when the command carried no hint at all. */
  unconnected: 3,
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
  /** The due or planned instant is within `temporalExactHours` of the hint. */
  "temporal_proximity",
  /** ...or within `temporalNearHours`, which scores half. A review noted the
   * single label could not tell the user which band fired, and 2E-DISAMBIG-001
   * renders exactly this to distinguish competing candidates. */
  "temporal_proximity_near",
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

/**
 * The mapping from a score to a band deliberately does not live here yet.
 *
 * 2E-ANALYTICS-002 requires the *vocabulary* to be settled before it reaches a
 * CHECK constraint, and it is. The functions that assign a band were written
 * and removed: they had no caller, no test, and no emitting code until Slice
 * 2E.7, and Slice 2E.1's review had already removed one consumer-less export
 * for the same reason. They arrive with the analytics payload that needs them.
 */

/** Rounded to `TASK_MATCH_LIMITS.scoreDecimals`, matching `calculateCandidateMargin`. */
export function roundScore(value: number): number {
  const factor = 10 ** TASK_MATCH_LIMITS.scoreDecimals;
  return Math.round(value * factor) / factor;
}

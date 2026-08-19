/**
 * Phase 2P slice 2P.4 — the per-category automation contract, in TypeScript.
 *
 * The authority lives in the database
 * (`private.automation_category_decision`); this module is the typed mirror the
 * product reads and renders, and `automation-policy-parity.test.ts` fails the
 * build if the two ever disagree. That split is deliberate and follows
 * `src/lib/ai/extraction-schema.ts`: a contract that must be enforced where the
 * data lives, and understood where the interface is drawn.
 *
 * WHAT THIS MODULE IS NOT
 *
 * It is not an authorization. Nothing here decides that a write may happen —
 * `eligible` arrives from the database, which re-measures on every read. A
 * consumer that computed eligibility from these constants would be a second
 * authority, which is the defect slice 2P.1 spent a whole migration removing.
 */

/**
 * The six categories the owner signed. A seventh is a schema change, not an
 * addition here: the database carries the same list in a CHECK constraint.
 */
export const AUTOMATION_CATEGORIES = [
  "task",
  "person",
  "project",
  "organization",
  "memory",
  "relation",
] as const;

export type AutomationCategory = (typeof AUTOMATION_CATEGORIES)[number];

/**
 * The three states.
 *
 * `automatic_when_eligible` is an arming, not an authorization — the name says
 * so on purpose. The owner may arm a category whose calibration is short, and
 * the gate still refuses; that keeps the switch honest and keeps the evidence,
 * rather than the switch, in charge.
 */
export const AUTOMATION_POLICY_STATES = [
  "disabled",
  "suggest_only",
  "automatic_when_eligible",
] as const;

export type AutomationPolicyState = (typeof AUTOMATION_POLICY_STATES)[number];

/**
 * The state an absent row computes to.
 *
 * No policy row is written by the migration, so this is what every category
 * reads until the owner chooses otherwise. It is a computed default rather than
 * a stored one precisely because `agent_preferences.autonomy_level` already
 * shows what a stored default becomes: a value nobody chose that a later reader
 * can mistake for consent.
 */
export const AUTOMATION_DEFAULT_STATE: AutomationPolicyState = "suggest_only";

/** The closed reason vocabulary. Exactly one of them permits a write. */
export const AUTOMATION_DECISION_REASONS = [
  "automation_disabled_by_owner",
  "suggest_only_by_owner",
  "insufficient_calibration",
  "blocked_by_recent_undo",
  "automatic",
] as const;

export type AutomationDecisionReason = (typeof AUTOMATION_DECISION_REASONS)[number];

export const AUTOMATION_ELIGIBLE_REASON: AutomationDecisionReason = "automatic";

/** The four calibration outcomes, distinct as the owner required. */
export const CALIBRATION_OUTCOMES = ["approved", "corrected", "rejected", "undone"] as const;

export type CalibrationOutcome = (typeof CALIBRATION_OUTCOMES)[number];

/**
 * Where a calibration observation can come from.
 *
 * Two of the six categories have a producer, because two of them have a review
 * flow. `project`, `organization`, `memory` and `relation` have none, and that
 * is a measured fact about the product rather than an omission here — the
 * status surface reports it as such.
 */
export const CALIBRATION_SOURCE_KINDS = [
  "task_candidate",
  "person_candidate",
  "acceptance_undone",
] as const;

export type CalibrationSourceKind = (typeof CALIBRATION_SOURCE_KINDS)[number];

export type CalibrationThreshold = Readonly<{
  minimumReviewed: number;
  minimumPrecision: number;
}>;

/**
 * The proposed thresholds, per category, with the reasoning in prose beside
 * them. They are constants rather than data on purpose: a threshold the running
 * system can write is a threshold the running system can lower.
 *
 * They are a PROPOSAL. No category reaches any of them today, and this slice
 * enables nothing.
 */
export const CALIBRATION_THRESHOLDS: Readonly<Record<AutomationCategory, CalibrationThreshold>> = {
  // Fully reversible — cancellation plus a registered undo — the smallest blast
  // radius of the six, and the only category with real review volume.
  task: { minimumReviewed: 50, minimumPrecision: 0.9 },
  // Identity collision is the dominant risk, and no merge exists: a wrong
  // person fragments the graph permanently.
  person: { minimumReviewed: 80, minimumPrecision: 0.97 },
  // Nominal duplication propagates through associations.
  project: { minimumReviewed: 60, minimumPrecision: 0.95 },
  // Company names collide across contexts; a duplicate splits an affiliation.
  organization: { minimumReviewed: 60, minimumPrecision: 0.95 },
  // A memory is durable by definition and enters retrieval, so a wrong durable
  // fact contaminates answers indefinitely.
  memory: { minimumReviewed: 80, minimumPrecision: 0.97 },
  // `2N-RELATION-TRIGGER` is a hard boundary; a relation asserted as
  // owner-authored is the highest-cost error the product can make.
  relation: { minimumReviewed: 100, minimumPrecision: 0.98 },
};

/** Freshness and blocking, shared by every category. */
export const CALIBRATION_FRESHNESS = {
  /** Reviewed subjects required inside `recentWindowDays`. */
  minimumRecentReviewed: 10,
  recentWindowDays: 90,
  /** The newest reviewed subject may be no older than this. */
  newestWithinDays: 30,
  /** An `undone` among this many most recent observations blocks the category. */
  undoBlockWindow: 20,
} as const;

export type CalibrationSummary = Readonly<{
  reviewed: number;
  approved: number;
  corrected: number;
  rejected: number;
  undone: number;
  precision: number | null;
  recentReviewed: number;
  newestObservedAt: string | null;
  recentUndo: boolean;
  hasProducer: boolean;
}>;

export type AutomationCategoryDecision = Readonly<{
  category: AutomationCategory;
  state: AutomationPolicyState;
  eligible: boolean;
  reason: AutomationDecisionReason;
  calibration: CalibrationSummary;
  requiredReviewed: number;
  requiredPrecision: number;
}>;

export function isAutomationCategory(value: unknown): value is AutomationCategory {
  return typeof value === "string" && (AUTOMATION_CATEGORIES as readonly string[]).includes(value);
}

export function isAutomationPolicyState(value: unknown): value is AutomationPolicyState {
  return typeof value === "string" && (AUTOMATION_POLICY_STATES as readonly string[]).includes(value);
}

/**
 * Normalizes a stored state for display.
 *
 * An unrecognized value degrades to the default rather than throwing, matching
 * the database function exactly. Throwing would deny the owner the very screen
 * that explains why automation is refused, which is the opposite of
 * fail-closed: the refusal must remain *legible*.
 */
export function normalizePolicyState(value: unknown): AutomationPolicyState {
  return isAutomationPolicyState(value) ? value : AUTOMATION_DEFAULT_STATE;
}

/**
 * The one place the product may ask "may this write happen automatically?".
 *
 * It reads the decision the database produced and refuses anything that is not
 * literally the single eligible reason. It deliberately does NOT recompute from
 * the calibration numbers: a second computation is a second authority.
 */
export function permitsAutomaticWrite(decision: AutomationCategoryDecision | null | undefined): boolean {
  if (!decision) return false;
  return decision.eligible === true && decision.reason === AUTOMATION_ELIGIBLE_REASON;
}

/**
 * What is still missing before a category could be eligible, for the owner to
 * read. Returns `null` when the category is not armed, because a shortfall is
 * not the reason a disabled category refuses.
 */
export function calibrationShortfall(
  decision: AutomationCategoryDecision,
): Readonly<{ reviewed: number; precision: number | null }> | null {
  if (decision.state !== "automatic_when_eligible") return null;
  const reviewed = Math.max(0, decision.requiredReviewed - decision.calibration.reviewed);
  const precision =
    decision.calibration.precision === null
      ? null
      : Math.max(0, Math.round((decision.requiredPrecision - decision.calibration.precision) * 1000) / 1000);
  return { reviewed, precision };
}

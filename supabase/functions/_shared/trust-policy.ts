// Deno-runtime copy of src/features/interpretations/trust-policy.ts.
// This module has zero Node/Next.js-specific imports in the Node original
// (no "server-only", no path aliases), so the algorithm here is kept
// byte-for-byte identical to the Node source; only relative-import
// extensions were adapted for Deno's module resolution. Keep both copies
// in sync — see docs/DECISIONS.md ADR-021.

export const TRUST_WEIGHTS = {
  modelConfidence: 0.2,
  candidateMargin: 0.2,
  entityExactness: 0.15,
  semanticSimilarity: 0.1,
  dateClarity: 0.1,
  contextConsistency: 0.1,
  reversibility: 0.05,
  autonomyAllowed: 0.05,
  correctionHistoryAgreement: 0.05,
} as const;

export const TRUST_THRESHOLDS = {
  autoApply: 0.9,
  applyAndFlag: 0.78,
  requestReview: 0.55,
} as const;

export type TrustSignals = Record<keyof typeof TRUST_WEIGHTS, number>;
export type TrustPolicy = "auto_apply" | "apply_and_flag" | "request_review" | "block_until_confirmation";
export type HardOverride =
  | "destructive_action"
  | "cancellation"
  | "deletion"
  | "irreversible"
  | "ownership_conflict"
  | "material_ambiguity"
  | "date_conflict"
  | "cross_user_entity"
  | "low_candidate_margin"
  | "insufficient_evidence";

export type TrustDecision = {
  score: number;
  policy: TrustPolicy;
  signals: TrustSignals;
  overrides: string[];
  evidence: string[];
};

function normalize(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function roundScore(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export function calculateCandidateMargin(scores: number[]) {
  const sorted = scores.map(normalize).sort((left, right) => right - left);
  if (sorted.length === 0) return 0;
  return roundScore(sorted[0] - (sorted[1] ?? 0));
}

export function scoreDateClarity(value: string | null) {
  if (!value) return 0;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return 1;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 0.8;
  return 0;
}

export function calculateTrustPolicy(input: {
  signals: TrustSignals;
  overrides?: string[];
  evidence?: string[];
  lowImpact?: boolean;
  reversible?: boolean;
  autonomyAllowed?: boolean;
  userConfirmed?: boolean;
}): TrustDecision {
  const signals = Object.fromEntries(
    Object.keys(TRUST_WEIGHTS).map((key) => [key, normalize(input.signals[key as keyof TrustSignals])]),
  ) as TrustSignals;
  const score = roundScore(
    (Object.keys(TRUST_WEIGHTS) as Array<keyof TrustSignals>)
      .reduce((total, key) => total + signals[key] * TRUST_WEIGHTS[key], 0),
  );
  const overrides = [...new Set(input.overrides ?? [])];
  let policy: TrustPolicy;

  if (overrides.length > 0) {
    policy = "block_until_confirmation";
  } else if (input.userConfirmed === true) {
    policy = "apply_and_flag";
  } else if (score >= TRUST_THRESHOLDS.autoApply) {
    policy = input.lowImpact === true && input.reversible === true && input.autonomyAllowed === true
      ? "auto_apply"
      : "request_review";
  } else if (score >= TRUST_THRESHOLDS.applyAndFlag) {
    policy = input.lowImpact !== false && input.reversible !== false ? "apply_and_flag" : "request_review";
  } else if (score >= TRUST_THRESHOLDS.requestReview) {
    policy = "request_review";
  } else {
    policy = "block_until_confirmation";
  }

  return { score, policy, signals, overrides, evidence: [...new Set(input.evidence ?? [])].slice(0, 12) };
}

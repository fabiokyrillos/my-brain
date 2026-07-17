import { describe, expect, it, vi } from "vitest";

type TrustSignals = {
  modelConfidence: number;
  candidateMargin: number;
  entityExactness: number;
  semanticSimilarity: number;
  dateClarity: number;
  contextConsistency: number;
  reversibility: number;
  autonomyAllowed: number;
  correctionHistoryAgreement: number;
};

type TrustDecision = {
  score: number;
  policy: "auto_apply" | "apply_and_flag" | "request_review" | "block_until_confirmation";
  overrides: string[];
  signals: TrustSignals;
};

type TrustModule = {
  TRUST_THRESHOLDS?: { autoApply: number; applyAndFlag: number; requestReview: number };
  TRUST_WEIGHTS?: Record<keyof TrustSignals, number>;
  calculateCandidateMargin?: (scores: number[]) => number;
  calculateTrustPolicy?: (input: {
    signals: TrustSignals;
    overrides?: string[];
    lowImpact?: boolean;
    reversible?: boolean;
    autonomyAllowed?: boolean;
  }) => TrustDecision;
  scoreDateClarity?: (value: string | null) => number;
};

const modulePath = `./trust-${"policy"}.ts`;
const trust = await vi.importActual<TrustModule>(modulePath).catch(() => ({}));

const allSignals = (value: number): TrustSignals => ({
  modelConfidence: value,
  candidateMargin: value,
  entityExactness: value,
  semanticSimilarity: value,
  dateClarity: value,
  contextConsistency: value,
  reversibility: value,
  autonomyAllowed: value,
  correctionHistoryAgreement: value,
});

describe("interpretation trust policy", () => {
  it("centralizes the documented weights and thresholds", () => {
    expect(trust.TRUST_WEIGHTS).toEqual({
      modelConfidence: 0.2,
      candidateMargin: 0.2,
      entityExactness: 0.15,
      semanticSimilarity: 0.1,
      dateClarity: 0.1,
      contextConsistency: 0.1,
      reversibility: 0.05,
      autonomyAllowed: 0.05,
      correctionHistoryAgreement: 0.05,
    });
    expect(trust.TRUST_THRESHOLDS).toEqual({ autoApply: 0.9, applyAndFlag: 0.78, requestReview: 0.55 });
  });

  it.each([
    [0.9, "auto_apply"],
    [0.899, "apply_and_flag"],
    [0.78, "apply_and_flag"],
    [0.779, "request_review"],
    [0.55, "request_review"],
    [0.549, "block_until_confirmation"],
  ] as const)("classifies a normalized score of %s as %s", (score, policy) => {
    expect(trust.calculateTrustPolicy).toBeTypeOf("function");
    expect(trust.calculateTrustPolicy?.({
      signals: allSignals(score),
      lowImpact: true,
      reversible: true,
      autonomyAllowed: true,
    })).toMatchObject({ score, policy });
  });

  it.each([
    "destructive_action",
    "cancellation",
    "deletion",
    "irreversible",
    "ownership_conflict",
    "material_ambiguity",
    "date_conflict",
    "cross_user_entity",
    "low_candidate_margin",
    "insufficient_evidence",
  ])("blocks the %s hard override regardless of score", (override) => {
    const decision = trust.calculateTrustPolicy?.({
      signals: allSignals(1),
      overrides: [override],
      lowImpact: true,
      reversible: true,
      autonomyAllowed: true,
    });
    expect(decision).toMatchObject({ score: 1, policy: "block_until_confirmation", overrides: [override] });
  });

  it("does not auto-apply outside low-impact reversible user autonomy", () => {
    const decision = trust.calculateTrustPolicy?.({
      signals: allSignals(1),
      lowImpact: true,
      reversible: true,
      autonomyAllowed: false,
    });
    expect(decision?.policy).toBe("request_review");
  });

  it("uses recurring correction agreement as the documented five-percent signal", () => {
    const baseline = trust.calculateTrustPolicy?.({
      signals: { ...allSignals(0), modelConfidence: 1 },
    });
    const recurring = trust.calculateTrustPolicy?.({
      signals: { ...allSignals(0), modelConfidence: 1, correctionHistoryAgreement: 1 },
    });
    expect(baseline?.score).toBe(0.2);
    expect(recurring?.score).toBe(0.25);
  });

  it("normalizes top-versus-second candidate margin", () => {
    expect(trust.calculateCandidateMargin?.([0.9, 0.4])).toBe(0.5);
    expect(trust.calculateCandidateMargin?.([0.9])).toBe(0.9);
    expect(trust.calculateCandidateMargin?.([])).toBe(0);
  });

  it("scores explicit offset dates higher than date-only or ambiguous text", () => {
    expect(trust.scoreDateClarity?.("2026-07-17T15:00:00-03:00")).toBe(1);
    expect(trust.scoreDateClarity?.("2026-07-17")).toBe(0.8);
    expect(trust.scoreDateClarity?.("sexta à tarde")).toBe(0);
    expect(trust.scoreDateClarity?.(null)).toBe(0);
  });
});

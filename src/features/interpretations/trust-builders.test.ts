import { describe, expect, it } from "vitest";
import { buildCorrectionElementTrust, buildExtractionElementTrust } from "./trust-builders";

describe("trust builders", () => {
  it("records explicit user confirmation without pretending model or semantic evidence exists", () => {
    const trust = buildCorrectionElementTrust({
      occurredAt: "2026-07-17T14:00:00.000Z",
      hasEntities: true,
      priorCorrectionAgreement: 0.4,
    });

    expect(trust.summary.signals.modelConfidence).toBe(0);
    expect(trust.summary.signals.semanticSimilarity).toBe(0);
    expect(trust.summary.evidence).toContain("explicit_user_confirmation");
    expect(trust.summary.evidence).toContain("semantic_similarity_not_available");
    expect(trust.summary.policy).toBe("apply_and_flag");
    expect(trust.occurredAt.signals.dateClarity).toBe(1);
  });

  it("blocks ambiguous entity resolution while keeping exact evidence auditable", () => {
    const trust = buildExtractionElementTrust({
      modelConfidence: 0.86,
      occurredAt: "2026-07-17T14:00:00.000Z",
      entityResolutions: [
        { query: "Marina", topScore: 0.7, margin: 0.03, ambiguous: true, evidence: ["normalized_exact_name"] },
      ],
      priorCorrectionAgreement: 0,
    });

    expect(trust.entities.overrides).toEqual(expect.arrayContaining(["material_ambiguity", "low_candidate_margin"]));
    expect(trust.entities.policy).toBe("block_until_confirmation");
    expect(trust.entities.evidence).toEqual(expect.arrayContaining(["normalized_exact_name", "semantic_similarity_not_available"]));
    expect(trust.summary.signals.modelConfidence).toBe(0.86);
  });
});

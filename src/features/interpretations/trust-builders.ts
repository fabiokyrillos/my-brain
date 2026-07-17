import type { ElementTrustDecision } from "./schema";
import {
  calculateTrustPolicy,
  scoreDateClarity,
  type TrustSignals,
} from "./trust-policy";

type ElementTrust = Record<"summary" | "concepts" | "occurredAt" | "extractedDates" | "entities", ElementTrustDecision>;

type ResolutionEvidence = {
  query: string;
  topScore: number;
  margin: number;
  ambiguous: boolean;
  evidence: string[];
};

function average(values: number[], fallback = 0) {
  if (values.length === 0) return fallback;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function signals(overrides: Partial<TrustSignals>): TrustSignals {
  return {
    modelConfidence: 0,
    candidateMargin: 0,
    entityExactness: 0,
    semanticSimilarity: 0,
    dateClarity: 0,
    contextConsistency: 0,
    reversibility: 1,
    autonomyAllowed: 1,
    correctionHistoryAgreement: 0,
    ...overrides,
  };
}

export function buildCorrectionElementTrust(input: {
  occurredAt: string;
  hasEntities: boolean;
  priorCorrectionAgreement: number;
}): ElementTrust {
  const evidence = ["explicit_user_confirmation", "semantic_similarity_not_available"];
  const common = signals({
    candidateMargin: 1,
    entityExactness: input.hasEntities ? 1 : 0,
    contextConsistency: 1,
    correctionHistoryAgreement: input.priorCorrectionAgreement,
  });
  const decide = (elementSignals: TrustSignals) => calculateTrustPolicy({
    signals: elementSignals,
    evidence,
    lowImpact: true,
    reversible: true,
    autonomyAllowed: true,
    userConfirmed: true,
  });
  const generic = decide(common);
  const date = decide({ ...common, dateClarity: scoreDateClarity(input.occurredAt) });
  return {
    summary: generic,
    concepts: generic,
    occurredAt: date,
    extractedDates: date,
    entities: decide({ ...common, entityExactness: input.hasEntities ? 1 : 1 }),
  };
}

export function buildExtractionElementTrust(input: {
  modelConfidence: number;
  occurredAt: string;
  entityResolutions: ResolutionEvidence[];
  priorCorrectionAgreement: number;
}): ElementTrust {
  const baseEvidence = ["model_structured_output", "semantic_similarity_not_available"];
  const base = signals({
    modelConfidence: input.modelConfidence,
    dateClarity: scoreDateClarity(input.occurredAt),
    contextConsistency: 0.5,
    correctionHistoryAgreement: input.priorCorrectionAgreement,
  });
  const decide = (elementSignals: TrustSignals, overrides: string[] = [], evidence = baseEvidence) => calculateTrustPolicy({
    signals: elementSignals,
    overrides,
    evidence,
    lowImpact: true,
    reversible: true,
    autonomyAllowed: true,
  });
  const generic = decide(base);
  const entityOverrides = [
    ...(input.entityResolutions.some((resolution) => resolution.ambiguous) ? ["material_ambiguity"] : []),
    ...(input.entityResolutions.some((resolution) => resolution.margin < 0.12) ? ["low_candidate_margin"] : []),
  ];
  const entityEvidence = [
    ...baseEvidence,
    ...input.entityResolutions.flatMap((resolution) => resolution.evidence),
  ];
  const entitySignals = signals({
    modelConfidence: input.modelConfidence,
    candidateMargin: average(input.entityResolutions.map((resolution) => resolution.margin), 1),
    entityExactness: average(input.entityResolutions.map((resolution) => resolution.topScore), 1),
    contextConsistency: input.entityResolutions.length === 0 ? 1 : 0.5,
    correctionHistoryAgreement: input.priorCorrectionAgreement,
  });
  return {
    summary: generic,
    concepts: generic,
    occurredAt: generic,
    extractedDates: generic,
    entities: decide(entitySignals, entityOverrides, entityEvidence),
  };
}

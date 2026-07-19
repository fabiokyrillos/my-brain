// Deno-runtime copy of src/features/interpretations/entity-resolution.ts.
// This module has zero Node/Next.js-specific imports in the Node original,
// so the algorithm here is kept byte-for-byte identical to the Node
// source; only the relative-import extension was adapted for Deno's
// module resolution. Keep both copies in sync — see docs/DECISIONS.md
// ADR-021.

import { calculateCandidateMargin } from "./trust-policy.ts";

export const MAX_ENTITY_CANDIDATES = 50;
export const MAX_RANKED_ENTITY_CANDIDATES = 5;

export type EntityType = "context" | "organization" | "project" | "person";
export type EntityAlias = { value: string; validFrom?: string | null; validTo?: string | null };
export type EntityCandidate = {
  id: string;
  userId: string;
  type: EntityType;
  name: string;
  aliases?: EntityAlias[];
  historicalMatches?: number;
  organizationId?: string | null;
  semanticSimilarity?: number;
  validFrom?: string | null;
  validTo?: string | null;
};
export type RankedEntityCandidate = EntityCandidate & { score: number; evidence: string[] };

export function normalizeEntityName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isTemporallyValid(
  occurredAt: string | undefined,
  validFrom?: string | null,
  validTo?: string | null,
) {
  if (!occurredAt) return true;
  const occurred = Date.parse(occurredAt);
  if (!Number.isFinite(occurred)) return false;
  if (validFrom && occurred < Date.parse(validFrom)) return false;
  if (validTo && occurred > Date.parse(validTo) + (validTo.length === 10 ? 86_399_999 : 0)) return false;
  return true;
}

function scoreCandidate(input: {
  query: string;
  candidate: EntityCandidate;
  occurredAt?: string;
  organizationId?: string | null;
}): RankedEntityCandidate {
  const query = normalizeEntityName(input.query);
  const name = normalizeEntityName(input.candidate.name);
  const evidence: string[] = [];
  let score = 0;

  if (query && name === query) {
    score += 0.65;
    evidence.push("normalized_exact_name");
  } else if (query && (name.startsWith(`${query} `) || name.includes(` ${query} `) || name.endsWith(` ${query}`))) {
    score += 0.2;
    evidence.push("normalized_name_overlap");
  }

  const validAlias = input.candidate.aliases?.some((alias) =>
    normalizeEntityName(alias.value) === query
    && isTemporallyValid(input.occurredAt, alias.validFrom, alias.validTo));
  if (validAlias) {
    score += 0.55;
    evidence.push("exact_alias");
  }

  if ((input.candidate.historicalMatches ?? 0) > 0) {
    score += Math.min(input.candidate.historicalMatches ?? 0, 5) / 50;
    evidence.push("historical_recurrence");
  }
  if (input.organizationId && input.candidate.organizationId === input.organizationId) {
    score += 0.1;
    evidence.push("organization_context");
  }
  if ((input.candidate.semanticSimilarity ?? 0) > 0) {
    score += Math.min(1, Math.max(0, input.candidate.semanticSimilarity ?? 0)) * 0.1;
    evidence.push("semantic_similarity");
  }
  if (input.occurredAt && isTemporallyValid(input.occurredAt, input.candidate.validFrom, input.candidate.validTo)) {
    score += 0.05;
    evidence.push("temporal_validity");
  }

  return { ...input.candidate, score: Math.round(Math.min(1, score) * 1_000) / 1_000, evidence };
}

export function rankEntityCandidates(input: {
  query: string;
  type: EntityType;
  userId: string;
  candidates: EntityCandidate[];
  occurredAt?: string;
  organizationId?: string | null;
  limit?: number;
}) {
  const limit = Math.min(MAX_RANKED_ENTITY_CANDIDATES, Math.max(1, input.limit ?? MAX_RANKED_ENTITY_CANDIDATES));
  const candidates = input.candidates
    .filter((candidate) => candidate.userId === input.userId && candidate.type === input.type)
    .slice(0, MAX_ENTITY_CANDIDATES)
    .map((candidate) => scoreCandidate({
      query: input.query,
      candidate,
      occurredAt: input.occurredAt,
      organizationId: input.organizationId,
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .slice(0, limit);
  const margin = calculateCandidateMargin(candidates.map((candidate) => candidate.score));
  const ambiguous = candidates.length === 0 || candidates[0].score < 0.55 || (candidates.length > 1 && margin < 0.12);
  return { candidates, margin, ambiguous };
}

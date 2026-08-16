export const PERSON_CANDIDATE_NAME_MAX_LENGTH = 160;
export const PERSON_CANDIDATE_EVIDENCE_MAX_LENGTH = 500;
export const PERSON_CANDIDATE_BATCH_LIMIT = 20;

export type PersonCandidateDisposition = "confirmed" | "rejected";

export type PersonCandidateResolutionInput = {
  candidateIndex: number;
  disposition: PersonCandidateDisposition;
  resolvedName?: string;
};

export type PersonCandidateResolutionView = {
  candidateIndex: number;
  disposition: PersonCandidateDisposition;
  personId: string | null;
  resolvedName: string | null;
};

export type ExtractedPersonCandidate = {
  candidateIndex: number;
  name: string;
  evidence: string;
  confidence: number;
};

export type PendingPersonCandidate = {
  candidateIndex: number;
  originalName: string;
  proposedName: string;
  evidence: string;
  confidence: number;
};

function collapseWhitespace(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function normalizePersonCandidateName(value: string): string {
  return collapseWhitespace(value).toLocaleLowerCase("und");
}

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return collapseWhitespace(value).slice(0, maxLength);
}

export function parseExtractedPeople(value: unknown): ExtractedPersonCandidate[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate, candidateIndex) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const record = candidate as Record<string, unknown>;
    const name = boundedText(record.name, PERSON_CANDIDATE_NAME_MAX_LENGTH);
    if (!name) return [];

    const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? Math.min(1, Math.max(0, record.confidence))
      : 0;

    return [{
      candidateIndex,
      name,
      evidence: boundedText(record.evidence, PERSON_CANDIDATE_EVIDENCE_MAX_LENGTH),
      confidence,
    }];
  });
}

export function derivePendingPersonCandidates(input: {
  extractedPeople: unknown;
  resolvedCandidateIndexes: ReadonlySet<number>;
  linkedNormalizedNames: ReadonlySet<string>;
}): PendingPersonCandidate[] {
  const linkedNames = new Set(
    [...input.linkedNormalizedNames].map(normalizePersonCandidateName),
  );
  const seen = new Set<string>();

  return parseExtractedPeople(input.extractedPeople).flatMap((candidate) => {
    const normalizedName = normalizePersonCandidateName(candidate.name);
    if (
      input.resolvedCandidateIndexes.has(candidate.candidateIndex)
      || linkedNames.has(normalizedName)
      || seen.has(normalizedName)
    ) {
      return [];
    }

    seen.add(normalizedName);
    return [{
      candidateIndex: candidate.candidateIndex,
      originalName: candidate.name,
      proposedName: candidate.name,
      evidence: candidate.evidence,
      confidence: candidate.confidence,
    }];
  });
}

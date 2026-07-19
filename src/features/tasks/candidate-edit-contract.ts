import { z } from "zod";

export type CandidateEditableField = "title" | "description" | "dueAt";

export type CandidateChanges = {
  title?: string;
  description?: string | null;
  dueAt?: string | null;
};

export type CandidateEditCommand = {
  candidateIndex: number;
  changes: CandidateChanges;
};

export type CandidateEditSuggestion = {
  candidateIndex: number;
  title: string;
  description: string | null;
  dueAt: string | null;
};

export type CanonicalCandidateEdits = {
  edits: CandidateEditCommand[];
  editedCandidateCount: number;
  editedFieldCount: number;
};

export const candidateEditArraySchema = z.array(z.unknown());

export function normalizeCandidateEdits(_input: {
  edits: unknown;
  selectedCandidateIndexes: readonly number[];
  suggestions: readonly CandidateEditSuggestion[];
}): CanonicalCandidateEdits {
  void _input;
  return {
    edits: [{ candidateIndex: -1, changes: { title: "__PHASE_2C_NOT_IMPLEMENTED__" } }],
    editedCandidateCount: -1,
    editedFieldCount: -1,
  };
}

export function serializeCandidateEdits(_edits: readonly CandidateEditCommand[]): string {
  void _edits;
  throw new Error("Phase 2C.1 candidate edit serialization is not implemented");
}

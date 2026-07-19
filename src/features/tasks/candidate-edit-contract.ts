import { z } from "zod";

const MAX_CANDIDATE_COUNT = 50;
const MAX_TITLE_LENGTH = 240;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_SERIALIZED_BYTES = 131_072;

const candidateIndexSchema = z.number().int().nonnegative();
const dueAtSchema = z.string().datetime({ offset: true });

const candidateChangesSchema = z.strictObject({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
  description: z
    .string()
    .trim()
    .max(MAX_DESCRIPTION_LENGTH)
    .transform((description) => description || null)
    .nullable()
    .optional(),
  dueAt: dueAtSchema.nullable().optional(),
});

const candidateEditCommandSchema = z.strictObject({
  candidateIndex: candidateIndexSchema,
  changes: candidateChangesSchema,
});

const selectedCandidateIndexesSchema = z
  .array(candidateIndexSchema)
  .min(1)
  .max(MAX_CANDIDATE_COUNT)
  .superRefine((candidateIndexes, context) => {
    if (new Set(candidateIndexes).size !== candidateIndexes.length) {
      context.addIssue({
        code: "custom",
        message: "Selected candidate indices must be unique",
      });
    }
  });

const candidateEditSuggestionSchema = z.strictObject({
  candidateIndex: candidateIndexSchema,
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).nullable(),
  dueAt: dueAtSchema.nullable(),
});

const candidateEditSuggestionsSchema = z
  .array(candidateEditSuggestionSchema)
  .superRefine((suggestions, context) => {
    const candidateIndexes = suggestions.map(({ candidateIndex }) => candidateIndex);

    if (new Set(candidateIndexes).size !== candidateIndexes.length) {
      context.addIssue({
        code: "custom",
        message: "Suggestion candidate indices must be unique",
      });
    }
  });

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

export const candidateEditArraySchema = z
  .array(candidateEditCommandSchema)
  .max(MAX_CANDIDATE_COUNT)
  .superRefine((edits, context) => {
    const candidateIndexes = edits.map(({ candidateIndex }) => candidateIndex);

    if (new Set(candidateIndexes).size !== candidateIndexes.length) {
      context.addIssue({
        code: "custom",
        message: "Candidate edit indices must be unique",
      });
    }
  });

export function normalizeCandidateEdits(input: {
  edits: unknown;
  selectedCandidateIndexes: readonly number[];
  suggestions: readonly CandidateEditSuggestion[];
}): CanonicalCandidateEdits {
  const edits = candidateEditArraySchema.parse(input.edits);
  const selectedCandidateIndexes = selectedCandidateIndexesSchema.parse(
    input.selectedCandidateIndexes,
  );
  const suggestions = candidateEditSuggestionsSchema.parse(input.suggestions);
  const selectedCandidateIndexSet = new Set(selectedCandidateIndexes);
  const suggestionByCandidateIndex = new Map(
    suggestions.map((suggestion) => [suggestion.candidateIndex, suggestion]),
  );

  for (const candidateIndex of selectedCandidateIndexes) {
    if (!suggestionByCandidateIndex.has(candidateIndex)) {
      throw new Error(`Missing immutable suggestion for candidate ${candidateIndex}`);
    }
  }

  const canonicalEdits: CandidateEditCommand[] = [];
  let editedFieldCount = 0;

  for (const edit of [...edits].sort(
    (left, right) => left.candidateIndex - right.candidateIndex,
  )) {
    if (!selectedCandidateIndexSet.has(edit.candidateIndex)) {
      throw new Error(`Candidate ${edit.candidateIndex} is not selected`);
    }

    const suggestion = suggestionByCandidateIndex.get(edit.candidateIndex);
    if (!suggestion) {
      throw new Error(`Missing immutable suggestion for candidate ${edit.candidateIndex}`);
    }

    const changes: CandidateChanges = {};

    if (edit.changes.title !== undefined && edit.changes.title !== suggestion.title) {
      changes.title = edit.changes.title;
      editedFieldCount += 1;
    }

    if (
      edit.changes.description !== undefined
      && edit.changes.description !== suggestion.description
    ) {
      changes.description = edit.changes.description;
      editedFieldCount += 1;
    }

    if (edit.changes.dueAt !== undefined && edit.changes.dueAt !== suggestion.dueAt) {
      changes.dueAt = edit.changes.dueAt;
      editedFieldCount += 1;
    }

    if (Object.keys(changes).length > 0) {
      canonicalEdits.push({ candidateIndex: edit.candidateIndex, changes });
    }
  }

  return {
    edits: canonicalEdits,
    editedCandidateCount: canonicalEdits.length,
    editedFieldCount,
  };
}

export function serializeCandidateEdits(edits: readonly CandidateEditCommand[]): string {
  const parsedEdits = candidateEditArraySchema.parse(edits);
  const canonicalEdits = [...parsedEdits]
    .sort((left, right) => left.candidateIndex - right.candidateIndex)
    .map((edit) => {
      const changes: CandidateChanges = {};

      if (edit.changes.title !== undefined) {
        changes.title = edit.changes.title;
      }
      if (edit.changes.description !== undefined) {
        changes.description = edit.changes.description;
      }
      if (edit.changes.dueAt !== undefined) {
        changes.dueAt = edit.changes.dueAt;
      }

      return { candidateIndex: edit.candidateIndex, changes };
    });
  const serializedEdits = JSON.stringify(canonicalEdits);
  const serializedByteLength = utf8ByteLength(serializedEdits);

  if (serializedByteLength > MAX_SERIALIZED_BYTES) {
    throw new Error(
      `Candidate edits exceed the ${MAX_SERIALIZED_BYTES}-byte serialized size limit`,
    );
  }

  return serializedEdits;
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit <= 0x7f) {
      byteLength += 1;
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2;
    } else if (
      codeUnit >= 0xd800
      && codeUnit <= 0xdbff
      && index + 1 < value.length
    ) {
      const nextCodeUnit = value.charCodeAt(index + 1);

      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        byteLength += 4;
        index += 1;
      } else {
        byteLength += 3;
      }
    } else {
      byteLength += 3;
    }
  }

  return byteLength;
}

import { z } from "zod";

const MAX_CANDIDATE_COUNT = 50;
const MAX_TITLE_LENGTH = 240;
const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_NO_DUE_REASON_LENGTH = 2_000;
const MAX_SERIALIZED_BYTES = 131_072;

export const manualPriorityValues = ["low", "medium", "high", "urgent"] as const;
export type ManualPriority = (typeof manualPriorityValues)[number];

const MAX_RELATION_IDS = 20;

const MAX_DEPENDENCIES = 20;

const candidateIndexSchema = z.number().int().nonnegative();
const dueAtSchema = z.string().datetime({ offset: true });
const manualPrioritySchema = z.enum(manualPriorityValues);
const relationIdArraySchema = z
  .array(z.string().uuid())
  .max(MAX_RELATION_IDS)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Relation IDs must be unique" });
    }
  });

export const dependencyTypeValues = ["blocks", "requires", "related"] as const;
export type DependencyType = (typeof dependencyTypeValues)[number];

const graphReferenceSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("candidateIndex"), value: candidateIndexSchema }),
  z.strictObject({ type: z.literal("taskId"), value: z.string().uuid() }),
]);

export type GraphReference =
  | { type: "candidateIndex"; value: number }
  | { type: "taskId"; value: string };

const dependencyEntrySchema = z.strictObject({
  target: graphReferenceSchema,
  type: z.enum(dependencyTypeValues),
});

export type DependencyEntry = {
  target: GraphReference;
  type: DependencyType;
};

const dependsOnArraySchema = z
  .array(dependencyEntrySchema)
  .max(MAX_DEPENDENCIES)
  .superRefine((entries, context) => {
    const signatures = entries.map((entry) => JSON.stringify(entry.target));
    if (new Set(signatures).size !== signatures.length) {
      context.addIssue({ code: "custom", message: "Dependency targets must be unique" });
    }
  });

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
  plannedAt: dueAtSchema.nullable().optional(),
  manualPriority: manualPrioritySchema.nullable().optional(),
  intentionalNoDue: z.boolean().optional(),
  noDueReason: z
    .string()
    .trim()
    .max(MAX_NO_DUE_REASON_LENGTH)
    .transform((reason) => reason || null)
    .nullable()
    .optional(),
  projectIds: relationIdArraySchema.optional(),
  contextIds: relationIdArraySchema.optional(),
  personIds: relationIdArraySchema.optional(),
  waitingOnPersonIds: relationIdArraySchema.optional(),
  parentRef: graphReferenceSchema.nullable().optional(),
  dependsOn: dependsOnArraySchema.optional(),
});

const candidateEditCommandSchema = z.strictObject({
  candidateIndex: candidateIndexSchema,
  changes: candidateChangesSchema,
});

export const selectedCandidateIndexesSchema = z
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

export type CandidateEditableField =
  | "title"
  | "description"
  | "dueAt"
  | "plannedAt"
  | "manualPriority"
  | "intentionalNoDue"
  | "noDueReason"
  | "projectIds"
  | "contextIds"
  | "personIds"
  | "waitingOnPersonIds"
  | "parentRef"
  | "dependsOn";

export type CandidateChanges = {
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  plannedAt?: string | null;
  manualPriority?: ManualPriority | null;
  intentionalNoDue?: boolean;
  noDueReason?: string | null;
  projectIds?: string[];
  contextIds?: string[];
  personIds?: string[];
  waitingOnPersonIds?: string[];
  parentRef?: GraphReference | null;
  dependsOn?: DependencyEntry[];
};

function sortedUniqueDependencies(entries: readonly DependencyEntry[]): DependencyEntry[] {
  const bySignature = new Map(
    entries.map((entry) => [JSON.stringify(entry.target) + entry.type, entry] as const),
  );
  return [...bySignature.values()].sort((left, right) => (
    JSON.stringify(left.target).localeCompare(JSON.stringify(right.target))
    || left.type.localeCompare(right.type)
  ));
}

function sortedUniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

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

    // The AI never suggests planned date, priority, or no-due metadata; the
    // immutable suggestion baseline for these fields is always the neutral
    // state (null/null/false/null), so "reset" for them means "clear".
    if (edit.changes.plannedAt !== undefined && edit.changes.plannedAt !== null) {
      changes.plannedAt = edit.changes.plannedAt;
      editedFieldCount += 1;
    }

    if (edit.changes.manualPriority !== undefined && edit.changes.manualPriority !== null) {
      changes.manualPriority = edit.changes.manualPriority;
      editedFieldCount += 1;
    }

    if (edit.changes.intentionalNoDue !== undefined && edit.changes.intentionalNoDue !== false) {
      changes.intentionalNoDue = edit.changes.intentionalNoDue;
      editedFieldCount += 1;
    }

    if (edit.changes.noDueReason !== undefined && edit.changes.noDueReason !== null) {
      changes.noDueReason = edit.changes.noDueReason;
      editedFieldCount += 1;
    }

    // The AI never suggests relations either; the immutable baseline is
    // always the empty set, so any non-empty relation array is an edit.
    if (edit.changes.projectIds !== undefined) {
      const projectIds = sortedUniqueIds(edit.changes.projectIds);
      if (projectIds.length > 0) {
        changes.projectIds = projectIds;
        editedFieldCount += 1;
      }
    }
    if (edit.changes.contextIds !== undefined) {
      const contextIds = sortedUniqueIds(edit.changes.contextIds);
      if (contextIds.length > 0) {
        changes.contextIds = contextIds;
        editedFieldCount += 1;
      }
    }
    if (edit.changes.personIds !== undefined) {
      const personIds = sortedUniqueIds(edit.changes.personIds);
      if (personIds.length > 0) {
        changes.personIds = personIds;
        editedFieldCount += 1;
      }
    }
    if (edit.changes.waitingOnPersonIds !== undefined) {
      const waitingOnPersonIds = sortedUniqueIds(edit.changes.waitingOnPersonIds);
      if (waitingOnPersonIds.length > 0) {
        changes.waitingOnPersonIds = waitingOnPersonIds;
        editedFieldCount += 1;
      }
    }

    // The AI never suggests a parent or dependency either; the immutable
    // baseline is always null/empty, so any non-null/non-empty value is an
    // edit.
    if (edit.changes.parentRef !== undefined && edit.changes.parentRef !== null) {
      changes.parentRef = edit.changes.parentRef;
      editedFieldCount += 1;
    }
    if (edit.changes.dependsOn !== undefined) {
      const dependsOn = sortedUniqueDependencies(edit.changes.dependsOn);
      if (dependsOn.length > 0) {
        changes.dependsOn = dependsOn;
        editedFieldCount += 1;
      }
    }

    const effectiveDueAt = edit.changes.dueAt !== undefined ? edit.changes.dueAt : suggestion.dueAt;
    const effectiveIntentionalNoDue = edit.changes.intentionalNoDue ?? false;
    const effectiveNoDueReason = edit.changes.noDueReason ?? null;
    if (effectiveIntentionalNoDue && effectiveDueAt !== null) {
      throw new Error(`Candidate ${edit.candidateIndex} cannot have both a due date and an intentional no-due state`);
    }
    if (effectiveNoDueReason !== null && !effectiveIntentionalNoDue) {
      throw new Error(`Candidate ${edit.candidateIndex} cannot have a no-due reason without an intentional no-due state`);
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
      if (edit.changes.plannedAt !== undefined) {
        changes.plannedAt = edit.changes.plannedAt;
      }
      if (edit.changes.manualPriority !== undefined) {
        changes.manualPriority = edit.changes.manualPriority;
      }
      if (edit.changes.intentionalNoDue !== undefined) {
        changes.intentionalNoDue = edit.changes.intentionalNoDue;
      }
      if (edit.changes.noDueReason !== undefined) {
        changes.noDueReason = edit.changes.noDueReason;
      }
      if (edit.changes.projectIds !== undefined) {
        changes.projectIds = sortedUniqueIds(edit.changes.projectIds);
      }
      if (edit.changes.contextIds !== undefined) {
        changes.contextIds = sortedUniqueIds(edit.changes.contextIds);
      }
      if (edit.changes.personIds !== undefined) {
        changes.personIds = sortedUniqueIds(edit.changes.personIds);
      }
      if (edit.changes.waitingOnPersonIds !== undefined) {
        changes.waitingOnPersonIds = sortedUniqueIds(edit.changes.waitingOnPersonIds);
      }
      if (edit.changes.parentRef !== undefined) {
        changes.parentRef = edit.changes.parentRef;
      }
      if (edit.changes.dependsOn !== undefined) {
        changes.dependsOn = sortedUniqueDependencies(edit.changes.dependsOn);
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

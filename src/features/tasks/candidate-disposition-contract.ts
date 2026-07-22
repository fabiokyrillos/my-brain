import { z } from "zod";
import {
  candidateEditArraySchema,
  serializeCandidateEdits,
  type CandidateEditCommand,
} from "./candidate-edit-contract";

const MAX_CANDIDATE_COUNT = 50;

export const candidateDispositionValues = [
  "confirmed",
  "rejected",
  "retained",
  "dismissed",
] as const;

export type CandidateDisposition = (typeof candidateDispositionValues)[number];

const candidateResolutionSchema = z.strictObject({
  candidateIndex: z.number().int().nonnegative(),
  disposition: z.enum(candidateDispositionValues),
});

export type CandidateResolution = z.infer<typeof candidateResolutionSchema>;

export const candidateResolutionArraySchema = z
  .array(candidateResolutionSchema)
  .min(1)
  .max(MAX_CANDIDATE_COUNT)
  .superRefine((resolutions, context) => {
    const candidateIndexes = resolutions.map(({ candidateIndex }) => candidateIndex);
    if (new Set(candidateIndexes).size !== candidateIndexes.length) {
      context.addIssue({
        code: "custom",
        message: "Candidate resolution indices must be unique",
      });
    }
  });

const candidateResolutionCommandSchema = z.strictObject({
  resolutions: candidateResolutionArraySchema,
  edits: candidateEditArraySchema,
});

export type CanonicalCandidateResolutionCommand = {
  resolutions: CandidateResolution[];
  edits: CandidateEditCommand[];
};

export function normalizeCandidateResolutionCommand(input: {
  resolutions: unknown;
  edits: unknown;
}): CanonicalCandidateResolutionCommand {
  const command = candidateResolutionCommandSchema.parse(input);
  const resolutionByCandidateIndex = new Map(
    command.resolutions.map((resolution) => [resolution.candidateIndex, resolution]),
  );

  for (const edit of command.edits) {
    const resolution = resolutionByCandidateIndex.get(edit.candidateIndex);
    if (!resolution) {
      throw new Error(`Candidate ${edit.candidateIndex} has no resolution`);
    }
    if (resolution.disposition !== "confirmed") {
      throw new Error(`Candidate ${edit.candidateIndex} must be confirmed to accept edits`);
    }
  }

  return {
    resolutions: [...command.resolutions].sort(
      (left, right) => left.candidateIndex - right.candidateIndex,
    ),
    edits: JSON.parse(serializeCandidateEdits(command.edits)) as CandidateEditCommand[],
  };
}

export function serializeCandidateResolutions(
  resolutions: readonly CandidateResolution[],
): string {
  const parsed = candidateResolutionArraySchema.parse(resolutions);
  return JSON.stringify(
    [...parsed]
      .sort((left, right) => left.candidateIndex - right.candidateIndex)
      .map(({ candidateIndex, disposition }) => ({ candidateIndex, disposition })),
  );
}

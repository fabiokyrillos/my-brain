import { z } from "zod";
import { conceptSchema, pendingQuestionSchema } from "@/lib/ai/extraction-schema";

export const interpretationOriginSchema = z.enum([
  "ai_generated",
  "user_corrected",
  "ai_reprocessed",
  "question_resolved",
]);
export const interpretationClassificationSchema = z.enum(["fact", "interpretation", "inference", "suggestion"]);
export const entityTypeSchema = z.enum(["context", "organization", "project", "person"]);
export const trustPolicySchema = z.enum(["auto_apply", "apply_and_flag", "request_review", "block_until_confirmation"]);

const extractedDateSchema = z.object({
  value: z.string().trim().refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) || z.string().datetime({ offset: true }).safeParse(value).success,
    "Use an ISO date or offset date-time.",
  ),
  label: z.string().trim().max(160).nullable().optional(),
});

const entityLinkSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.uuid(),
  mention: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

const trustSignalSchema = z.object({
  modelConfidence: z.number().min(0).max(1),
  candidateMargin: z.number().min(0).max(1),
  entityExactness: z.number().min(0).max(1),
  semanticSimilarity: z.number().min(0).max(1),
  dateClarity: z.number().min(0).max(1),
  contextConsistency: z.number().min(0).max(1),
  reversibility: z.number().min(0).max(1),
  autonomyAllowed: z.number().min(0).max(1),
  correctionHistoryAgreement: z.number().min(0).max(1),
});
export const elementTrustDecisionSchema = z.object({
  score: z.number().min(0).max(1),
  policy: trustPolicySchema,
  signals: trustSignalSchema,
  overrides: z.array(z.string().trim().min(1).max(80)).max(10),
  evidence: z.array(z.string().trim().min(1).max(160)).max(12),
});

export const interpretationPatchSchema = z.object({
  entryId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  operationKey: z.uuid(),
  summary: z.string().trim().min(1).max(2000),
  concepts: z.array(conceptSchema).min(1).max(30),
  occurredAt: z.string().datetime({ offset: true }),
  extractedDates: z.array(extractedDateSchema).max(30),
  entityLinks: z.array(entityLinkSchema).max(100),
  classifications: z.object({
    summary: interpretationClassificationSchema,
    concepts: interpretationClassificationSchema,
    occurredAt: interpretationClassificationSchema,
    entities: interpretationClassificationSchema,
  }),
  pendingQuestions: z.array(pendingQuestionSchema).max(30),
  elementTrust: z.record(z.string(), elementTrustDecisionSchema).optional(),
  correctionReason: z.string().trim().max(500).optional(),
  recordOnly: z.boolean(),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.entityLinks.forEach((link, index) => {
    const key = `${link.entityType}:${link.entityId}`;
    if (seen.has(key)) {
      context.addIssue({ code: "custom", message: "Duplicate entity link.", path: ["entityLinks", index] });
    }
    seen.add(key);
  });
});

export type InterpretationPatch = z.infer<typeof interpretationPatchSchema>;
export type ElementTrustDecision = z.infer<typeof elementTrustDecisionSchema>;

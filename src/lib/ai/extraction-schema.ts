import { z } from "zod";

// Every instant in this contract is destined for a `timestamptz` column, and
// PostgreSQL only accepts a UTC offset up to ±15:59 — beyond that the cast
// raises 22009. Zod's own `datetime({ offset: true })` grammar allows up to
// ±23:59, so without this bound the schema would accept instants the database
// cannot store: the worker would persist happily and the write would fail late,
// burning the job's retry budget on an error it cannot fix.
//
// Mirrored by `isIsoInstant` in
// supabase/functions/_shared/extraction-validation.ts and held to it by
// src/lib/ai/extraction-parity.test.ts.
const OFFSET_SUFFIX = /(?:Z|([+-])(\d{2}):(\d{2}))$/;
const MAX_OFFSET_MINUTES = 15 * 60 + 59;

export function isStorableInstant(value: string): boolean {
  const match = OFFSET_SUFFIX.exec(value);
  if (!match || match[1] === undefined) return true;
  return Number(match[2]) * 60 + Number(match[3]) <= MAX_OFFSET_MINUTES;
}

const storableInstant = z
  .string()
  .datetime({ offset: true })
  .refine(isStorableInstant, { message: "UTC offset must be within ±15:59" });

export const conceptSchema = z.enum([
  "raw_record",
  "completed_activity",
  "task",
  "subtask",
  "reminder",
  "appointment",
  "reference",
  "decision",
  "idea",
  "person_note",
  "project_note",
  "pending_question",
  "blocker",
  "dependency",
  "status_update",
  "lasting_preference",
  "personal_memory",
  "request_received",
  "waiting_for_third_party",
]);

export const entityCandidateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  confidence: z.number().min(0).max(1),
  evidence: z.string().trim().min(1).max(500),
  inferred: z.boolean(),
});

export const taskCandidateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(2000).nullable(),
  dueAt: storableInstant.nullable(),
  waitingOn: z.string().trim().max(160).nullable(),
  parentIndex: z.number().int().min(0).nullable(),
  confidence: z.number().min(0).max(1),
  explicit: z.boolean(),
});

export const pendingQuestionSchema = z.object({
  question: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

export const entryExtractionSchema = z.object({
  language: z.enum(["pt-BR", "en"]),
  occurredAt: storableInstant,
  isRetroactive: z.boolean(),
  summary: z.string().trim().min(1).max(2000),
  concepts: z.array(conceptSchema).min(1),
  contexts: z.array(entityCandidateSchema),
  organizations: z.array(entityCandidateSchema),
  projects: z.array(entityCandidateSchema),
  people: z.array(entityCandidateSchema),
  taskCandidates: z.array(taskCandidateSchema),
  pendingQuestions: z.array(pendingQuestionSchema),
  confidence: z.number().min(0).max(1),
});

export type EntryExtraction = z.infer<typeof entryExtractionSchema>;
export type EntityCandidate = z.infer<typeof entityCandidateSchema>;
export type TaskCandidate = z.infer<typeof taskCandidateSchema>;

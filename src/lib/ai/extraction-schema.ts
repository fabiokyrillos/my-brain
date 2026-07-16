import { z } from "zod";

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
  dueAt: z.string().datetime({ offset: true }).nullable(),
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
  occurredAt: z.string().datetime({ offset: true }),
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

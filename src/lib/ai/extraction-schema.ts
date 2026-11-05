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
//
// This refinement is deliberately NOT visible to the model. `zodTextFormat`
// converts this schema for OpenAI Structured Outputs and silently drops
// `.refine()` — the emitted `pattern` is Zod's own datetime regex, which still
// allows up to ±23:59 (verified, and the conversion does not throw). So the
// provider may still return an unstorable offset; what changed is that the
// worker validator now refuses it before any write instead of the database
// refusing it after one. Enforcement lives in the two validators, not in the
// response schema — do not read the generated JSON Schema as the guarantee.
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

/**
 * Life Brain C.2 (`LB-C-005`, ADR-151) — a person, with what they are to the
 * owner when the entry says it ("cardiologista", "irmã", "chefe"). Required and
 * nullable, like every optional fact in a strict schema. Only people carry a
 * role; contexts, organizations and projects keep the plain candidate shape.
 */
/**
 * Backlog item 3 (ADR-158): a person's birthday when the entry states it ("a
 * Ana faz aniversário em 5 de maio"). Month and day are required, the year is
 * null unless the entry gives it; the date must exist (29 February only with
 * no year or a leap year) — the rule `set_person_birthday` applies. A proposal
 * for the owner to confirm, never written by the model.
 */
export const personBirthdaySchema = z
  .object({
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    year: z.number().int().min(1900).max(2100).nullable(),
  })
  .refine(
    (value) => value.day <= new Date(Date.UTC(value.year ?? 2000, value.month, 0)).getUTCDate(),
    { message: "not a real date" },
  );

export const personCandidateSchema = entityCandidateSchema.extend({
  role: z.string().trim().min(1).max(80).nullable(),
  birthday: personBirthdaySchema.nullable(),
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

/**
 * Life Brain C.3 (`LB-C-003`, ADR-152) — something that happens from X to Y,
 * proposed for the agenda: a consultation at 15:00, a trip from the 3rd to the
 * 10th. Confirmed by the owner like a task candidate, never written by the
 * model. `endsAt` is null for an instant; never before `startsAt`.
 */
export const MAX_EVENT_CANDIDATES = 20;

export const eventCandidateSchema = z.object({
  title: z.string().trim().min(1).max(240),
  startsAt: storableInstant,
  endsAt: storableInstant.nullable(),
  allDay: z.boolean(),
  location: z.string().trim().min(1).max(240).nullable(),
  confidence: z.number().min(0).max(1),
  explicit: z.boolean(),
}).refine(
  (candidate) => candidate.endsAt === null || Date.parse(candidate.endsAt) >= Date.parse(candidate.startsAt),
  { path: ["endsAt"], message: "endsAt is before startsAt" },
);

export const pendingQuestionSchema = z.object({
  question: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

/**
 * Life Brain C.1 (`LB-C-001`/`-002`, ADR-148) — the area of life an entry is
 * mostly about. A closed vocabulary: the first nine are areas a context can
 * have (`contexts.kind`, migration LB-M1); `other` is the honest answer when
 * none fits, and links nothing. The legacy kinds `personal` and `custom` are
 * not areas and the model may not return them.
 */
export const LIFE_AREAS = [
  "health", "family", "home", "finance", "travel", "work", "study", "leisure", "ideas", "other",
] as const;
export type LifeArea = (typeof LIFE_AREAS)[number];

export const lifeAreaSchema = z.object({
  kind: z.enum(LIFE_AREAS),
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
  people: z.array(personCandidateSchema),
  taskCandidates: z.array(taskCandidateSchema),
  // Life Brain C.3: required, possibly empty.
  eventCandidates: z.array(eventCandidateSchema).max(MAX_EVENT_CANDIDATES),
  pendingQuestions: z.array(pendingQuestionSchema),
  // Required and nullable: the provider's strict schema requires every key.
  lifeArea: lifeAreaSchema.nullable(),
  confidence: z.number().min(0).max(1),
});

/**
 * The same contract for reading what is **already stored**. Every
 * `raw_output` written before C.1 lacks `lifeArea`; reading one must yield
 * "no area", not a failed parse that would hide the rest of the reading.
 * Never used for provider output, which must carry the key.
 */
export const storedEntryExtractionSchema = entryExtractionSchema.extend({
  lifeArea: lifeAreaSchema.nullable().default(null),
  // C.3: every reading stored before it has no `eventCandidates`.
  eventCandidates: z.array(eventCandidateSchema).max(MAX_EVENT_CANDIDATES).default([]),
  // C.2: every reading stored before it has people without `role`.
  // Backlog item 3: and every reading stored before it has people without `birthday`.
  people: z.array(personCandidateSchema.extend({
    role: personCandidateSchema.shape.role.default(null),
    birthday: personCandidateSchema.shape.birthday.default(null),
  })),
});

export type EntryExtraction = z.infer<typeof entryExtractionSchema>;
export type EntityCandidate = z.infer<typeof entityCandidateSchema>;
export type PersonCandidate = z.infer<typeof personCandidateSchema>;
export type EventCandidate = z.infer<typeof eventCandidateSchema>;
export type TaskCandidate = z.infer<typeof taskCandidateSchema>;

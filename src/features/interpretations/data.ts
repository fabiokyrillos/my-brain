import "server-only";
import { z } from "zod";
import { conceptSchema, entryExtractionSchema, pendingQuestionSchema, taskCandidateSchema } from "@/lib/ai/extraction-schema";
import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";
import {
  candidateDispositionValues,
  type CandidateDisposition,
} from "@/features/tasks/candidate-disposition-contract";
import type { EntityOption } from "./revision-editor";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type EntryRow = Database["public"]["Tables"]["entries"]["Row"];
type InterpretationRow = Database["public"]["Tables"]["entry_interpretations"]["Row"];
type EntryEntityRow = Database["public"]["Tables"]["entry_entities"]["Row"];

const classificationsSchema = z.object({
  summary: z.enum(["fact", "interpretation", "inference", "suggestion"]),
  concepts: z.enum(["fact", "interpretation", "inference", "suggestion"]),
  occurredAt: z.enum(["fact", "interpretation", "inference", "suggestion"]),
  entities: z.enum(["fact", "interpretation", "inference", "suggestion"]),
});
const extractedDatesSchema = z.array(z.object({
  value: z.string(),
  label: z.string().nullable().optional(),
})).max(30);
const policySchema = z.enum(["auto_apply", "apply_and_flag", "request_review", "block_until_confirmation"]);
const entityTypeSchema = z.enum(["context", "organization", "project", "person"]);

type TrustView = {
  score: number;
  policy: z.infer<typeof policySchema>;
  signals: Record<string, number>;
  overrides: string[];
  evidence: string[];
};

export type InterpretationRevision = {
  id: string;
  version: number;
  summary: string;
  concepts: z.infer<typeof conceptSchema>[];
  occurredAt: string;
  extractedDates: Array<{ value: string; label?: string | null }>;
  entityLinks: Array<{ entityType: z.infer<typeof entityTypeSchema>; entityId: string; mention: string; name: string; confidence: number }>;
  classifications: z.infer<typeof classificationsSchema>;
  pendingQuestions: z.infer<typeof pendingQuestionSchema>[];
  trust: Record<string, TrustView>;
  origin: string;
  model: string;
  confidence: number;
  correctionReason: string | null;
  createdAt: string;
  parentInterpretationId: string | null;
  isRecordOnly: boolean;
};

type InterpretationSource = Pick<
  InterpretationRow,
  "id" | "version" | "summary" | "concepts" | "extracted_dates" | "element_classifications" | "element_confidence" | "element_policy" | "resolution_evidence" | "pending_questions" | "origin" | "model" | "confidence" | "correction_reason" | "created_at" | "parent_interpretation_id" | "is_record_only"
> & Partial<Pick<InterpretationRow, "raw_output">>;

export type CandidateResolutionRow = {
  interpretation_id: string;
  candidate_index: number;
  disposition: string;
  created_at?: string;
};

export type CandidateResolutionHistoryItem = {
  key: string;
  interpretationId: string;
  candidateIndex: number;
  title: string;
  disposition: CandidateDisposition;
  createdAt: string;
};

const candidateDispositionSchema = z.enum(candidateDispositionValues);

/**
 * A candidate's own index carries no proof of which interpretation produced
 * it (COH-001/COH-011). A task is only safely re-confirmable for the
 * current interpretation when its provenance is either that exact
 * interpretation or, conservatively, entirely unproven (legacy rows created
 * before candidate provenance existed) — in which case consistency cannot
 * be verified either way, so the candidate is hidden rather than risking a
 * duplicate or an unhandled database conflict.
 */
export function computeUnavailableCandidateIndexes(
  currentInterpretationId: string | null,
  tasks: ReadonlyArray<{ candidate_index: number | null; source_interpretation_id: string | null }>,
  resolutions: ReadonlyArray<Pick<CandidateResolutionRow, "interpretation_id" | "candidate_index" | "disposition">> = [],
): number[] {
  if (!currentInterpretationId) return [];
  const indexes = new Set<number>();
  for (const task of tasks) {
    if (task.candidate_index === null) continue;
    if (task.source_interpretation_id === currentInterpretationId || task.source_interpretation_id === null) {
      indexes.add(task.candidate_index);
    }
  }
  for (const resolution of resolutions) {
    if (resolution.interpretation_id !== currentInterpretationId) continue;
    if (!candidateDispositionSchema.safeParse(resolution.disposition).success) continue;
    indexes.add(resolution.candidate_index);
  }
  return [...indexes].sort((left, right) => left - right);
}

export function projectCandidateResolutionHistory(
  interpretations: ReadonlyArray<{ id: string; task_candidates: unknown }>,
  resolutions: ReadonlyArray<CandidateResolutionRow>,
): CandidateResolutionHistoryItem[] {
  const candidatesByInterpretation = new Map(interpretations.flatMap((interpretation) => {
    const candidates = taskCandidateSchema.array().safeParse(interpretation.task_candidates);
    return candidates.success ? [[interpretation.id, candidates.data] as const] : [];
  }));

  return resolutions.flatMap((resolution) => {
    const disposition = candidateDispositionSchema.safeParse(resolution.disposition);
    const candidate = candidatesByInterpretation.get(resolution.interpretation_id)?.[resolution.candidate_index];
    if (!disposition.success || !candidate || !resolution.created_at) return [];
    return [{
      key: `${resolution.interpretation_id}:${resolution.candidate_index}`,
      interpretationId: resolution.interpretation_id,
      candidateIndex: resolution.candidate_index,
      title: candidate.title,
      disposition: disposition.data,
      createdAt: resolution.created_at,
    }];
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * The lifecycle mapper needs one fact: does the current interpretation still
 * have an actionable candidate nothing has covered yet? "Some task exists for
 * this entry" is not that fact — a candidate is only covered when its own
 * index is in `unavailableCandidateIndexes` (computed above from the current
 * interpretation's provenance, not from entry-wide task existence).
 */
export function hasUnconfirmedTaskCandidates(
  candidateCount: number,
  unavailableCandidateIndexes: ReadonlyArray<number>,
): boolean {
  if (candidateCount <= 0) return false;
  const unavailable = new Set(unavailableCandidateIndexes);
  for (let index = 0; index < candidateCount; index += 1) {
    if (!unavailable.has(index)) return true;
  }
  return false;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseTrust(row: InterpretationSource) {
  const scores = objectValue(row.element_confidence);
  const policies = objectValue(row.element_policy);
  const resolution = objectValue(row.resolution_evidence);
  const keys = new Set([...Object.keys(scores), ...Object.keys(policies), ...Object.keys(resolution)]);
  return Object.fromEntries([...keys].flatMap((key) => {
    const score = typeof scores[key] === "number" ? scores[key] : Number(scores[key]);
    const policy = policySchema.safeParse(policies[key]);
    if (!Number.isFinite(score) || !policy.success) return [];
    const detail = objectValue(resolution[key]);
    const rawSignals = objectValue(detail.signals);
    const signals = Object.fromEntries(Object.entries(rawSignals).flatMap(([signal, value]) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? [[signal, numeric]] : [];
    }));
    return [[key, {
      score,
      policy: policy.data,
      signals,
      overrides: stringArray(detail.overrides),
      evidence: stringArray(detail.evidence),
    } satisfies TrustView]];
  }));
}

export function selectCurrentInterpretation<T extends { id: string; version: number }>(
  entry: { current_interpretation_id: string | null },
  interpretations: T[],
) {
  return interpretations.find((item) => item.id === entry.current_interpretation_id)
    ?? [...interpretations].sort((left, right) => right.version - left.version)[0]
    ?? null;
}

export function parseInterpretationRevision(
  row: InterpretationSource,
  links: Array<Pick<EntryEntityRow, "interpretation_id" | "entity_type" | "entity_id" | "mention" | "confidence">>,
  names: Map<string, string>,
  occurredAt: string,
): InterpretationRevision {
  const rawOutput = objectValue(row.raw_output);
  const interpretedOccurredAt = typeof rawOutput.occurredAt === "string" ? rawOutput.occurredAt : occurredAt;
  const concepts = conceptSchema.array().safeParse(row.concepts);
  const dates = extractedDatesSchema.safeParse(row.extracted_dates);
  const classifications = classificationsSchema.safeParse(row.element_classifications);
  const questions = pendingQuestionSchema.array().safeParse(row.pending_questions);
  return {
    id: row.id,
    version: row.version,
    summary: row.summary,
    concepts: concepts.success ? concepts.data : ["raw_record"],
    occurredAt: interpretedOccurredAt,
    extractedDates: dates.success ? dates.data : [],
    entityLinks: links.flatMap((link) => {
      if (link.interpretation_id !== row.id) return [];
      const type = entityTypeSchema.safeParse(link.entity_type);
      if (!type.success) return [];
      return [{
        entityType: type.data,
        entityId: link.entity_id,
        mention: link.mention,
        name: names.get(`${type.data}:${link.entity_id}`) ?? link.mention,
        confidence: link.confidence,
      }];
    }),
    classifications: classifications.success ? classifications.data : {
      summary: "interpretation", concepts: "interpretation", occurredAt: "fact", entities: "inference",
    },
    pendingQuestions: questions.success ? questions.data : [],
    trust: parseTrust(row),
    origin: row.origin,
    model: row.model,
    confidence: row.confidence,
    correctionReason: row.correction_reason,
    createdAt: row.created_at,
    parentInterpretationId: row.parent_interpretation_id,
    isRecordOnly: row.is_record_only,
  };
}

export async function loadInterpretationReview(supabase: SupabaseClient, entryId: string) {
  const candidateResolutionQuery = supabase.from("entry_task_candidate_resolutions")
    .select("interpretation_id,candidate_index,disposition,created_at")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .limit(500);
  const [entryResult, interpretationsResult, linksResult, taskResult, candidateResolutionsResult, taskUndoResult, correctionUndoResult, contextsResult, organizationsResult, projectsResult, peopleResult] = await Promise.all([
    supabase.from("entries").select("*").eq("id", entryId).maybeSingle(),
    supabase.from("entry_interpretations").select("*").eq("entry_id", entryId).order("version", { ascending: false }).limit(50),
    supabase.from("entry_entities").select("interpretation_id,entity_type,entity_id,mention,confidence").eq("entry_id", entryId).limit(500),
    supabase.from("tasks").select("id,title,status,due_at,candidate_index,source_interpretation_id").eq("source_entry_id", entryId).neq("status", "cancelled").order("candidate_index").limit(100),
    candidateResolutionQuery,
    supabase.from("undo_operations").select("id").in("action_type", ["confirm_entry_tasks", "confirm_entry_task_candidates", "confirm_entry_task_candidates_v5", "confirm_entry_task_candidates_v6"]).eq("status", "available").contains("after_state", { entry_id: entryId }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("undo_operations").select("id").eq("action_type", "correct_entry_interpretation").eq("status", "available").contains("after_state", { entry_id: entryId }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("contexts").select("id,name").order("updated_at", { ascending: false }).limit(50),
    supabase.from("organizations").select("id,name").order("updated_at", { ascending: false }).limit(50),
    supabase.from("projects").select("id,name").order("updated_at", { ascending: false }).limit(50),
    supabase.from("people").select("id,name").order("updated_at", { ascending: false }).limit(50),
  ]);
  const entry = requireSupabaseData(entryResult, "load entry") as EntryRow | null;
  const interpretationRows = (requireSupabaseData(interpretationsResult, "load interpretation history") ?? []) as InterpretationRow[];
  const links = (requireSupabaseData(linksResult, "load interpretation entity links") ?? []) as EntryEntityRow[];
  const tasks = requireSupabaseData(taskResult, "load entry tasks") ?? [];
  const candidateResolutions = (requireSupabaseData(candidateResolutionsResult as never, "load candidate resolutions") ?? []) as CandidateResolutionRow[];
  const taskUndo = requireSupabaseData(taskUndoResult, "load entry task undo");
  const correctionUndo = requireSupabaseData(correctionUndoResult, "load interpretation correction undo");
  const groups: Array<[EntityOption["entityType"], Array<{ id: string; name: string }>]> = [
    ["context", requireSupabaseData(contextsResult, "load context options") ?? []],
    ["organization", requireSupabaseData(organizationsResult, "load organization options") ?? []],
    ["project", requireSupabaseData(projectsResult, "load project options") ?? []],
    ["person", requireSupabaseData(peopleResult, "load people options") ?? []],
  ];
  if (!entry) return null;

  const entityOptions = groups.flatMap(([entityType, rows]) => rows.map((row) => ({ entityType, entityId: row.id, name: row.name })));
  const names = new Map(entityOptions.map((option) => [`${option.entityType}:${option.entityId}`, option.name]));
  const currentRow = selectCurrentInterpretation(entry, interpretationRows);
  const revisions = interpretationRows.map((row) => parseInterpretationRevision(row, links, names, entry.occurred_at));
  const current = currentRow ? revisions.find((revision) => revision.id === currentRow.id) ?? null : null;
  const extraction = currentRow ? entryExtractionSchema.safeParse(currentRow.raw_output) : null;
  const candidateResolutionHistory = projectCandidateResolutionHistory(interpretationRows, candidateResolutions);
  return {
    entry,
    current,
    revisions,
    extraction: extraction?.success ? extraction.data : null,
    entityOptions,
    tasks,
    taskUndoId: taskUndo?.id ?? null,
    correctionUndoId: correctionUndo?.id ?? null,
    ...(candidateResolutionHistory.length > 0 ? { candidateResolutionHistory } : {}),
    unavailableCandidateIndexes: computeUnavailableCandidateIndexes(current?.id ?? null, tasks, candidateResolutions),
  };
}

/**
 * Internal infrastructure (Slice 2X.8): this loader is no longer imported
 * directly by page components. `daily-cycle/review-projection.ts` and
 * `daily-cycle/technical-details-projection.ts` are the only intended
 * consumers, each projecting a narrower, page-appropriate DTO from this
 * shared result.
 */
export type InterpretationReviewData = NonNullable<Awaited<ReturnType<typeof loadInterpretationReview>>>;

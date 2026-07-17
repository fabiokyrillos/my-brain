import { z } from "zod";
import { conceptSchema, entryExtractionSchema, pendingQuestionSchema } from "@/lib/ai/extraction-schema";
import type { Database } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";
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
};

type InterpretationSource = Pick<
  InterpretationRow,
  "id" | "version" | "summary" | "concepts" | "extracted_dates" | "element_classifications" | "element_confidence" | "element_policy" | "resolution_evidence" | "pending_questions" | "origin" | "model" | "confidence" | "correction_reason" | "created_at" | "parent_interpretation_id"
> & Partial<Pick<InterpretationRow, "raw_output">>;

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
  };
}

export async function loadInterpretationReview(supabase: SupabaseClient, entryId: string) {
  const [entryResult, interpretationsResult, linksResult, taskResult, taskUndoResult, correctionUndoResult, contextsResult, organizationsResult, projectsResult, peopleResult] = await Promise.all([
    supabase.from("entries").select("*").eq("id", entryId).maybeSingle(),
    supabase.from("entry_interpretations").select("*").eq("entry_id", entryId).order("version", { ascending: false }).limit(50),
    supabase.from("entry_entities").select("interpretation_id,entity_type,entity_id,mention,confidence").eq("entry_id", entryId).limit(500),
    supabase.from("tasks").select("id,title,status,due_at").eq("source_entry_id", entryId).neq("status", "cancelled").order("candidate_index").limit(100),
    supabase.from("undo_operations").select("id").eq("action_type", "confirm_entry_tasks").eq("status", "available").contains("after_state", { entry_id: entryId }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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
  return {
    entry,
    current,
    revisions,
    extraction: extraction?.success ? extraction.data : null,
    entityOptions,
    tasks,
    taskUndoId: taskUndo?.id ?? null,
    correctionUndoId: correctionUndo?.id ?? null,
  };
}

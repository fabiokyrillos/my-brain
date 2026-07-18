import "server-only";
import { compareInterpretationVersions, type InterpretationSnapshot } from "@/features/interpretations/version-comparison";
import type { InterpretationReviewData, InterpretationRevision } from "@/features/interpretations/data";
import { loadInterpretationReview } from "@/features/interpretations/data";
import type { EntryExtraction } from "@/lib/ai/extraction-schema";
import type { createClient } from "@/lib/supabase/server";
import type { InterpretationTechnicalDetailsView, SerializableValue } from "./contracts";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type EntryTechnicalDetailsInput = {
  entryId: string;
  current: InterpretationRevision | null;
  revisions: readonly InterpretationRevision[];
  extraction: EntryExtraction | null;
  tasks: InterpretationReviewData["tasks"];
};

function toSerializableValue(value: unknown): SerializableValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toSerializableValue);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toSerializableValue(item)]));
  }
  return String(value);
}

function toSnapshot(revision: InterpretationRevision): InterpretationSnapshot {
  return {
    version: revision.version,
    summary: revision.summary,
    concepts: revision.concepts,
    occurredAt: revision.occurredAt,
    extractedDates: revision.extractedDates,
    entityLinks: revision.entityLinks.map((link) => ({ entityType: link.entityType, entityId: link.entityId, name: link.name })),
    classifications: revision.classifications,
  };
}

export function toEntryTechnicalDetailsView(input: EntryTechnicalDetailsInput): InterpretationTechnicalDetailsView | null {
  const { entryId, current, revisions, extraction, tasks } = input;
  if (!current) return null;

  const scores: Record<string, number> = {};
  const policies: Record<string, string> = {};
  const signals: Record<string, Record<string, number>> = {};
  const evidence: Record<string, string[]> = {};
  const overrides: Record<string, string[]> = {};
  for (const [element, trust] of Object.entries(current.trust)) {
    scores[element] = trust.score;
    policies[element] = trust.policy;
    signals[element] = trust.signals;
    evidence[element] = trust.evidence;
    overrides[element] = trust.overrides;
  }

  const ascending = [...revisions].sort((left, right) => left.version - right.version);
  const comparisons: Record<string, SerializableValue> = {};
  for (let index = 1; index < ascending.length; index += 1) {
    const previous = ascending[index - 1];
    const revision = ascending[index];
    const changes = compareInterpretationVersions(toSnapshot(previous), toSnapshot(revision));
    comparisons[`${previous.version}-${revision.version}`] = changes.map((change) => ({
      field: change.field,
      before: toSerializableValue(change.before),
      after: toSerializableValue(change.after),
    }));
  }

  const provenance: Record<string, SerializableValue> = {};
  for (const task of tasks) {
    provenance[task.id] = {
      candidateIndex: task.candidate_index,
      sourceInterpretationId: task.source_interpretation_id,
    };
  }

  const source: Record<string, SerializableValue> = extraction
    ? { language: extraction.language, overallConfidence: extraction.confidence }
    : {};

  return Object.freeze({
    entryId,
    versions: revisions.map((revision) => ({ id: revision.id, version: revision.version, createdAt: revision.createdAt })),
    source,
    model: current.model,
    scores,
    policies,
    signals,
    evidence,
    overrides,
    comparisons,
    provenance,
  });
}

export async function loadEntryTechnicalDetailsProjection(
  supabase: SupabaseClient,
  entryId: string,
): Promise<InterpretationTechnicalDetailsView | null> {
  const data = await loadInterpretationReview(supabase, entryId);
  if (!data) return null;

  return toEntryTechnicalDetailsView({
    entryId,
    current: data.current,
    revisions: data.revisions,
    extraction: data.extraction,
    tasks: data.tasks,
  });
}

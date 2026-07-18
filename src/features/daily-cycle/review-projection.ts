import "server-only";
import type { EntryExtraction, TaskCandidate } from "@/lib/ai/extraction-schema";
import type { InterpretationReviewData, InterpretationRevision } from "@/features/interpretations/data";
import { loadInterpretationReview } from "@/features/interpretations/data";
import type { EntityOption } from "@/features/interpretations/revision-editor";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";
import type {
  ActionableCandidateView,
  AttentionItemView,
  AvailableAction,
  DailyCycleAction,
  HumanFieldView,
  InterpretationReviewView,
  MaterializedTaskView,
} from "./contracts";
import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";
import { resolveDailyCycleLifecycle, type DailyCycleLifecycleInput } from "./lifecycle";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type EntryReviewEditableCurrent = {
  interpretationId: string;
  version: number;
  summary: string;
  concepts: InterpretationRevision["concepts"];
  occurredAt: string;
  extractedDates: InterpretationRevision["extractedDates"];
  entityLinks: InterpretationRevision["entityLinks"];
  classifications: InterpretationRevision["classifications"];
  pendingQuestions: InterpretationRevision["pendingQuestions"];
  isRecordOnly: boolean;
};

export type EntryReviewHistoryItem = {
  interpretationId: string;
  version: number;
  origin: string;
  summary: string;
  correctionReason: string | null;
  createdAt: string;
  isCurrent: boolean;
};

export type EntryReviewProjection = {
  view: InterpretationReviewView;
  errorMessage: string | null;
  editableCurrent: EntryReviewEditableCurrent | null;
  entityOptions: EntityOption[];
  taskCandidates: TaskCandidate[];
  extractedMentions: Array<{ name: string; evidence: string; confidence: number }>;
  history: EntryReviewHistoryItem[];
  taskUndoId: string | null;
  correctionUndoId: string | null;
  unavailableCandidateIndexes: readonly number[];
};

export type EntryReviewProjectionInput = {
  entryId: string;
  originalContent: string;
  errorMessage: string | null;
  entryOccurredAt: string;
  isRetroactive: boolean;
  current: InterpretationRevision | null;
  revisions: InterpretationRevision[];
  extraction: EntryExtraction | null;
  entityOptions: EntityOption[];
  tasks: InterpretationReviewData["tasks"];
  taskUndoId: string | null;
  correctionUndoId: string | null;
  unavailableCandidateIndexes: readonly number[];
  lifecycle: DailyCycleLifecycleInput;
  locale: DailyCycleLocale;
};

const understandingFallback: Record<DailyCycleLocale, string> = {
  "pt-BR": "Ainda não há interpretação para este registro.",
  en: "There is no interpretation for this record yet.",
};

const occurredAtFieldLabel: Record<DailyCycleLocale, string> = {
  "pt-BR": "Data do acontecimento",
  en: "Event date",
};

const classificationFieldLabels: Record<DailyCycleLocale, Record<string, string>> = {
  "pt-BR": {
    summary: "Classificação do resumo",
    concepts: "Classificação dos conceitos",
    occurredAt: "Classificação da data",
    entities: "Classificação dos vínculos",
  },
  en: {
    summary: "Summary classification",
    concepts: "Concepts classification",
    occurredAt: "Date classification",
    entities: "Links classification",
  },
};

function action(id: DailyCycleAction): AvailableAction {
  return Object.freeze({ id });
}

function attentionActionId(reason: NonNullable<ReturnType<typeof resolveDailyCycleLifecycle>["attentionReason"]>): DailyCycleAction {
  switch (reason) {
    case "review_interpretation": return "correct_interpretation";
    case "confirm_existing_candidates": return "confirm_existing_candidates";
    case "answer_existing_question": return "answer_existing_question";
    case "retry_processing": return "retry_processing";
    case "resolve_consistency": return "resolve_consistency";
  }
}

export function toEntryReviewProjection(input: EntryReviewProjectionInput): EntryReviewProjection {
  const { productState, attentionReason } = resolveDailyCycleLifecycle(input.lifecycle);
  const copy = getDailyCycleCopy(input.locale);
  const current = input.current;

  const availableActions: AvailableAction[] = [];
  if (current) availableActions.push(action("correct_interpretation"));
  if (input.correctionUndoId) availableActions.push(action("undo_correction"));
  if (input.taskUndoId) availableActions.push(action("undo_task_creation"));

  const actionableCandidates: ActionableCandidateView[] = [];
  if (input.extraction && current && !current.isRecordOnly) {
    input.extraction.taskCandidates.forEach((candidate, index) => {
      if (input.unavailableCandidateIndexes.includes(index)) return;
      actionableCandidates.push({
        key: String(index),
        title: candidate.title,
        ...(candidate.description ? { description: candidate.description } : {}),
        ...(candidate.dueAt ? { dueAt: candidate.dueAt } : {}),
      });
    });
  }
  if (actionableCandidates.length > 0) availableActions.push(action("confirm_existing_candidates"));
  if (productState === "could_not_organize") availableActions.push(action("retry_processing"));

  const materializedTasks: MaterializedTaskView[] = current
    ? input.tasks
      .filter((task) => task.source_interpretation_id === current.id)
      .map((task) => ({
        taskId: task.id,
        title: task.title,
        ...(task.due_at ? { dueAt: task.due_at } : {}),
      }))
    : [];

  const humanFields: HumanFieldView[] = [];
  if (current) {
    humanFields.push({
      key: "occurredAt",
      label: occurredAtFieldLabel[input.locale],
      value: current.occurredAt,
      editable: true,
    });
    for (const [field, classification] of Object.entries(current.classifications)) {
      humanFields.push({
        key: `classification:${field}`,
        label: classificationFieldLabels[input.locale][field] ?? field,
        value: classification,
        editable: false,
      });
    }
  }

  const attentionItems: AttentionItemView[] = [];
  if (attentionReason) {
    const reasonCopy = copy.attentionReasons[attentionReason];
    attentionItems.push({
      key: `${input.entryId}:${attentionReason}`,
      reason: attentionReason,
      title: reasonCopy.title,
      explanation: reasonCopy.description,
      availableActions: [action(attentionActionId(attentionReason))],
    });
  }

  const view: InterpretationReviewView = Object.freeze({
    entryId: input.entryId,
    productState,
    understanding: current?.summary ?? understandingFallback[input.locale],
    humanFields: Object.freeze(humanFields),
    attentionItems: Object.freeze(attentionItems),
    actionableCandidates: Object.freeze(actionableCandidates),
    materializedTasks: Object.freeze(materializedTasks),
    availableActions: Object.freeze(availableActions),
    original: Object.freeze({
      content: input.originalContent,
      occurredAt: input.entryOccurredAt,
      isRetroactive: input.isRetroactive,
    }),
    hasTechnicalDetails: Boolean(current),
  });

  const editableCurrent: EntryReviewEditableCurrent | null = current
    ? {
      interpretationId: current.id,
      version: current.version,
      summary: current.summary,
      concepts: current.concepts,
      occurredAt: current.occurredAt,
      extractedDates: current.extractedDates,
      entityLinks: current.entityLinks,
      classifications: current.classifications,
      pendingQuestions: current.pendingQuestions,
      isRecordOnly: current.isRecordOnly,
    }
    : null;

  const history: EntryReviewHistoryItem[] = input.revisions.map((revision) => ({
    interpretationId: revision.id,
    version: revision.version,
    origin: revision.origin,
    summary: revision.summary,
    correctionReason: revision.correctionReason,
    createdAt: revision.createdAt,
    isCurrent: revision.id === current?.id,
  }));

  const extractedMentions = input.extraction
    ? [...input.extraction.contexts, ...input.extraction.organizations, ...input.extraction.projects, ...input.extraction.people]
      .map((mention) => ({ name: mention.name, evidence: mention.evidence, confidence: mention.confidence }))
    : [];

  return {
    view,
    errorMessage: input.errorMessage,
    editableCurrent,
    entityOptions: input.entityOptions,
    taskCandidates: input.extraction?.taskCandidates ?? [],
    extractedMentions,
    history,
    taskUndoId: input.taskUndoId,
    correctionUndoId: input.correctionUndoId,
    unavailableCandidateIndexes: input.unavailableCandidateIndexes,
  };
}

export async function loadEntryReviewProjection(
  supabase: SupabaseClient,
  { entryId, locale }: { entryId: string; locale: DailyCycleLocale },
): Promise<EntryReviewProjection | null> {
  const data = await loadInterpretationReview(supabase, entryId);
  if (!data) return null;

  const [jobResult, questionsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("status,next_attempt_at")
      .eq("type", "interpret_entry")
      .eq("payload->>entry_id", entryId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pending_questions")
      .select("id")
      .eq("entry_id", entryId)
      .eq("status", "open")
      .limit(1),
  ]);
  const job = requireSupabaseData(jobResult, "load entry interpretation job") as { status: string; next_attempt_at: string | null } | null;
  const openQuestions = requireSupabaseData(questionsResult, "load entry open questions") ?? [];

  return toEntryReviewProjection({
    entryId,
    originalContent: data.entry.original_content,
    errorMessage: data.entry.processing_error,
    entryOccurredAt: data.entry.occurred_at,
    isRetroactive: data.extraction?.isRetroactive ?? false,
    current: data.current,
    revisions: data.revisions,
    extraction: data.extraction,
    entityOptions: data.entityOptions,
    tasks: data.tasks,
    taskUndoId: data.taskUndoId,
    correctionUndoId: data.correctionUndoId,
    unavailableCandidateIndexes: data.unavailableCandidateIndexes,
    locale,
    lifecycle: {
      entryLifecycle: data.entry.status,
      job: job ? { status: job.status, retryAt: job.next_attempt_at } : undefined,
      hasValidTaskCandidates: (data.extraction?.taskCandidates.length ?? 0) > 0,
      hasOpenQuestion: openQuestions.length > 0,
      recordOnly: data.current?.isRecordOnly ?? false,
      hasMaterializedTaskForCandidates: data.tasks.length > 0,
      hasConsistencyIssue: false,
      now: new Date().toISOString(),
    },
  });
}

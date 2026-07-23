import "server-only";
import { actionablePendingQuestionFilter } from "@/features/agent/question-visibility";
import { computeUnavailableCandidateIndexes, hasUnconfirmedTaskCandidates } from "@/features/interpretations/data";
import { pageRange, paginateRows } from "@/lib/pagination";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { InboxItemView } from "./contracts";
import { toInboxItemView, type InboxItemSource } from "./projection-mappers";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type InboxProjectionPage = {
  items: readonly InboxItemView[];
  hasNext: boolean;
};

const ORIGINAL_PREVIEW_LENGTH = 240;

function toOriginalPreview(content: string) {
  const trimmed = content.trim();
  return trimmed.length > ORIGINAL_PREVIEW_LENGTH
    ? `${trimmed.slice(0, ORIGINAL_PREVIEW_LENGTH).trimEnd()}…`
    : trimmed;
}

function extractPayloadEntryId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).entry_id;
  return typeof value === "string" ? value : null;
}

// The mapper is fail-closed by design (Slice 2X.1): an unrecognized internal
// combination returns null rather than guessing a product state. The loader
// must still surface the entry — the original is always preserved — so an
// unmapped entry becomes an explicit "review this" item instead of vanishing
// from the Caixa.
function toFailClosedInboxItemView(
  entryId: string,
  title: string,
  originalPreview: string,
  significantAt: string,
  availableActions: InboxItemView["availableActions"],
): InboxItemView {
  return Object.freeze({
    entryId,
    title,
    originalPreview,
    productState: "could_not_organize" as const,
    attentionReason: "resolve_consistency" as const,
    significantAt,
    availableActions,
    originalPreserved: true,
  });
}

export async function loadInboxProjection(
  supabase: SupabaseClient,
  { locale, page }: { locale: "pt-BR" | "en"; page: number },
): Promise<InboxProjectionPage> {
  const { from, to } = pageRange(page);
  const entriesResult = await supabase
    .from("entries")
    .select("id,original_content,status,occurred_at,created_at,current_interpretation_id")
    .order("created_at", { ascending: false })
    .range(from, to);
  const rows = requireSupabaseData(entriesResult, "load inbox entries") ?? [];
  const paginated = paginateRows(rows);
  if (paginated.items.length === 0) return { items: [], hasNext: false };

  const entryIds = paginated.items.map((entry) => entry.id);
  const interpretationIds = paginated.items.flatMap((entry) =>
    entry.current_interpretation_id ? [entry.current_interpretation_id] : []);
  const candidateResolutionsQuery = supabase.from("entry_task_candidate_resolutions")
    .select("entry_id,interpretation_id,candidate_index,disposition")
    .in("entry_id", entryIds);

  const [jobsResult, interpretationsResult, questionsResult, tasksResult, candidateResolutionsResult] = await Promise.all([
    supabase.from("jobs").select("status,next_attempt_at,payload").eq("type", "interpret_entry").in("payload->>entry_id", entryIds).order("created_at", { ascending: false }),
    interpretationIds.length
      ? supabase.from("entry_interpretations").select("id,summary,task_candidates").in("id", interpretationIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("pending_questions").select("entry_id").or(actionablePendingQuestionFilter()).in("entry_id", entryIds),
    supabase.from("tasks").select("source_entry_id,source_interpretation_id,candidate_index").neq("status", "cancelled").in("source_entry_id", entryIds),
    candidateResolutionsQuery,
  ]);
  const jobs = requireSupabaseData(jobsResult, "load inbox interpretation jobs") ?? [];
  const interpretations = requireSupabaseData(interpretationsResult, "load inbox current interpretations") ?? [];
  const openQuestions = requireSupabaseData(questionsResult, "load inbox open questions") ?? [];
  const materializedTasks = requireSupabaseData(tasksResult, "load inbox materialized tasks") ?? [];
  const candidateResolutions = (requireSupabaseData(candidateResolutionsResult as never, "load inbox candidate resolutions") ?? []) as Array<{
    entry_id: string;
    interpretation_id: string;
    candidate_index: number;
    disposition: string;
  }>;

  const latestJobByEntryId = new Map<string, { status: string; next_attempt_at: string | null }>();
  for (const job of jobs) {
    const entryId = extractPayloadEntryId(job.payload);
    if (entryId && !latestJobByEntryId.has(entryId)) latestJobByEntryId.set(entryId, job);
  }
  const interpretationById = new Map(interpretations.map((row) => [row.id, row]));
  const openQuestionEntryIds = new Set(openQuestions.map((row) => row.entry_id));
  const tasksByEntryId = new Map<string, typeof materializedTasks>();
  for (const task of materializedTasks) {
    const tasksForEntry = tasksByEntryId.get(task.source_entry_id);
    if (tasksForEntry) tasksForEntry.push(task);
    else tasksByEntryId.set(task.source_entry_id, [task]);
  }
  const candidateResolutionsByEntryId = new Map<string, typeof candidateResolutions>();
  for (const resolution of candidateResolutions) {
    const resolutionsForEntry = candidateResolutionsByEntryId.get(resolution.entry_id);
    if (resolutionsForEntry) resolutionsForEntry.push(resolution);
    else candidateResolutionsByEntryId.set(resolution.entry_id, [resolution]);
  }
  const now = new Date().toISOString();

  const items = paginated.items.map((entry) => {
    const interpretation = entry.current_interpretation_id
      ? interpretationById.get(entry.current_interpretation_id)
      : undefined;
    const job = latestJobByEntryId.get(entry.id);
    const originalPreview = toOriginalPreview(entry.original_content);
    const title = interpretation?.summary?.trim() || originalPreview;
    const availableActions = [{ id: "open_entry" as const, href: `/${locale}/app/inbox/${entry.id}` }];
    const taskCandidateCount = interpretation !== undefined && Array.isArray(interpretation.task_candidates)
      ? interpretation.task_candidates.length
      : 0;
    const hasValidTaskCandidates = taskCandidateCount > 0;
    const unavailableCandidateIndexes = computeUnavailableCandidateIndexes(
      entry.current_interpretation_id,
      tasksByEntryId.get(entry.id) ?? [],
      candidateResolutionsByEntryId.get(entry.id) ?? [],
    );

    const source: InboxItemSource = {
      entryId: entry.id,
      title,
      originalPreview,
      significantAt: entry.occurred_at,
      originalPreserved: true,
      availableActions,
      lifecycle: {
        entryLifecycle: entry.status,
        job: job ? { status: job.status, retryAt: job.next_attempt_at } : undefined,
        hasValidTaskCandidates,
        hasOpenQuestion: openQuestionEntryIds.has(entry.id),
        recordOnly: false,
        hasMaterializedTaskForCandidates: !hasUnconfirmedTaskCandidates(taskCandidateCount, unavailableCandidateIndexes),
        hasConsistencyIssue: false,
        now,
      },
    };

    return toInboxItemView(source)
      ?? toFailClosedInboxItemView(entry.id, title, originalPreview, entry.occurred_at, availableActions);
  });

  return { items, hasNext: paginated.hasNext };
}

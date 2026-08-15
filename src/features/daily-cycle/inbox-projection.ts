import "server-only";
import { actionablePendingQuestionFilter } from "@/features/agent/question-visibility";
import { computeUnavailableCandidateIndexes, hasUnconfirmedTaskCandidates } from "@/features/interpretations/data";
import { pageRange, paginateRows } from "@/lib/pagination";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";
import { byokSettingsHref } from "@/features/byok/routes";
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
// from Registros.
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
    // An entry the mapper could not read is emphatically not "read and proposed
    // nothing" — that is a claim about a successful interpretation.
    isRecordOnly: false,
  });
}

/**
 * The queue's views (`02-arquitetura-e-rotas.md`: `?view=`).
 *
 * `needs-you` is deliberately **absent**: it is not a filter over this
 * projection, it is `list_needs_attention` — a different read with its own
 * ordering and its own cursor — and the page routes to it before reaching here.
 * Listing it as a value would invite someone to implement it as a filter, which
 * is how one queue would end up with two definitions of "needs you".
 *
 * `awaiting-ai` is here for the opposite reason: it is a state the product
 * *already* resolves to `needs_attention`, and `list_needs_attention` cannot
 * return it — that RPC's `candidate_entries` never selects
 * `awaiting_ai_configuration`, and widening it needs a migration this initiative
 * does not have. While the archive was the default view the state still reached
 * the owner; once the default became needs-you it reached nobody without typing
 * a URL. A view of its own is the honest repair available from this side of the
 * boundary: the same projection, the same mapper, the same actions.
 */
export const inboxViews = ["all", "organizing", "failed", "record-only", "awaiting-ai"] as const;
export type InboxView = (typeof inboxViews)[number];

export function isInboxView(value: unknown): value is InboxView {
  return typeof value === "string" && (inboxViews as readonly string[]).includes(value);
}

/**
 * The entry statuses a view can possibly contain.
 *
 * A **superset**, and only a pre-filter. The product state is decided by
 * `resolveDailyCycleLifecycle` from the entry status, the job, the open
 * questions and the candidates together — so no SQL predicate can be exact, and
 * a filter that pretended to be would drop rows that belong. Narrowing here just
 * stops the page from being mostly rows the post-filter will discard; the
 * post-filter below is what actually decides.
 */
const STATUSES_BY_VIEW: Record<Exclude<InboxView, "all">, readonly string[]> = {
  /*
    `saved` is here because an entry whose job is pending reads as organizing
    while its own status has not moved yet — and `recoverable_error` for the
    mirror-image reason, which the independent review caught.

    `fail_entry_interpretation` writes `recoverable_error` on a **non-terminal**
    failure and the job keeps a future `next_attempt_at`; `resolveDailyCycleLifecycle`
    reads that live retry and answers `organizing`, because from the owner's side
    a retry that has not run yet is still the assistant working. The superset
    omitted the status, so the row was discarded before the post-filter ever ran:
    an entry that is genuinely being retried appeared in "Tudo" and nowhere else.
    It is not in `failed` either — that view's post-filter demands
    `could_not_organize`, which an active retry is not.
  */
  organizing: ["saved", "interpreting", "reprocessing", "recoverable_error"],
  failed: ["saved", "recoverable_error", "terminal_error", "completed"],
  "record-only": ["completed"],
  /*
    `BYOK-CAPTURE-002`. The one view whose superset is exact rather than a
    superset: this state is written by `capture_entry_async` and
    `mark_entry_awaiting_ai_configuration` alone, and `resolveDailyCycleLifecycle`
    branches on the entry status **above** every job-derived branch, so status and
    product state cannot disagree here. The post-filter still runs, because a
    filter that is exact today is a filter nobody re-checks tomorrow.
  */
  "awaiting-ai": ["awaiting_ai_configuration"],
};

const STATE_BY_VIEW: Record<Exclude<InboxView, "all">, (item: InboxItemView) => boolean> = {
  organizing: (item) => item.productState === "organizing",
  failed: (item) => item.productState === "could_not_organize",
  "record-only": (item) => item.isRecordOnly,
  "awaiting-ai": (item) => item.attentionReason === "configure_ai_credential",
};

export async function loadInboxProjection(
  supabase: SupabaseClient,
  { locale, page, view = "all" }: { locale: "pt-BR" | "en"; page: number; view?: InboxView },
): Promise<InboxProjectionPage> {
  const { from, to } = pageRange(page);
  const query = supabase
    .from("entries")
    .select("id,original_content,status,occurred_at,created_at,current_interpretation_id");
  const scoped = view === "all" ? query : query.in("status", STATUSES_BY_VIEW[view]);
  const entriesResult = await scoped
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
    // `BYOK-CAPTURE-002`. An entry stored with no usable AI credential gets a
    // second action, and it is the only one that resolves the state: opening the
    // record shows the original and says why nothing happened, but the fix is in
    // Settings. Offered here rather than only on the detail page because the
    // Inbox is where a user with several such entries actually notices them.
    const availableActions = entry.status === "awaiting_ai_configuration"
      ? [
          { id: "open_entry" as const, href: `/${locale}/app/inbox/${entry.id}` },
          { id: "configure_ai_credential" as const, href: byokSettingsHref(locale) },
        ]
      : [{ id: "open_entry" as const, href: `/${locale}/app/inbox/${entry.id}` }];
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

  /*
    The post-filter, and the only thing that decides membership.

    `hasNext` stays the SQL page's answer rather than being recomputed from the
    filtered list. It means "there are more rows in this view's source", which is
    exactly what the next-page link does, and a `hasNext` derived from a filtered
    page would stop the user one page short of rows that exist.
  */
  const scopedItems = view === "all" ? items : items.filter(STATE_BY_VIEW[view]);

  return { items: scopedItems, hasNext: paginated.hasNext };
}

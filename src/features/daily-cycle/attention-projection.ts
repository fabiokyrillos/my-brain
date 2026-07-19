import "server-only";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";
import { attentionReasons, type AttentionReason, type NeedsAttentionItemView } from "./contracts";
import { type DailyCycleLocale, getDailyCycleCopy } from "./copy";
import { toNeedsAttentionItemView, type NeedsAttentionItemSource } from "./projection-mappers";
import { attentionActionId } from "./review-projection";

function isAttentionReason(value: string): value is AttentionReason {
  return (attentionReasons as readonly string[]).includes(value);
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export const ATTENTION_PAGE_SIZE = 20;

export type AttentionCursor = {
  readonly occurredAt: string;
  readonly entryId: string;
};

export type AttentionProjectionPage = {
  readonly items: readonly NeedsAttentionItemView[];
  readonly hasNext: boolean;
  readonly nextCursor: AttentionCursor | null;
};

type AttentionRpcRow = {
  entry_id: string;
  reason: string;
  occurred_at: string;
  current_interpretation_id: string | null;
  job_id: string | null;
  open_question_id: string | null;
};

const ORIGINAL_PREVIEW_LENGTH = 240;

function toOriginalPreview(content: string) {
  const trimmed = content.trim();
  return trimmed.length > ORIGINAL_PREVIEW_LENGTH
    ? `${trimmed.slice(0, ORIGINAL_PREVIEW_LENGTH).trimEnd()}…`
    : trimmed;
}

export async function loadAttentionProjection(
  supabase: SupabaseClient,
  { locale, cursor, limit = ATTENTION_PAGE_SIZE }: { locale: DailyCycleLocale; cursor?: AttentionCursor | null; limit?: number },
): Promise<AttentionProjectionPage> {
  const rpcResult = await supabase.rpc("list_needs_attention", {
    p_limit: limit + 1,
    p_cursor_occurred_at: cursor?.occurredAt ?? null,
    p_cursor_entry_id: cursor?.entryId ?? null,
  });
  const rows = (requireSupabaseData(rpcResult, "load needs-attention queue") ?? []) as AttentionRpcRow[];
  const page = rows.slice(0, limit);
  const hasNext = rows.length > limit;
  if (page.length === 0) return { items: [], hasNext: false, nextCursor: null };

  const entryIds = page.map((row) => row.entry_id);
  const interpretationIds = page.flatMap((row) => (row.current_interpretation_id ? [row.current_interpretation_id] : []));

  const [entriesResult, interpretationsResult] = await Promise.all([
    supabase.from("entries").select("id,original_content").in("id", entryIds),
    interpretationIds.length
      ? supabase.from("entry_interpretations").select("id,summary").in("id", interpretationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const entries = requireSupabaseData(entriesResult, "load needs-attention entry originals") ?? [];
  const interpretations = requireSupabaseData(interpretationsResult, "load needs-attention interpretation summaries") ?? [];
  const originalByEntryId = new Map(entries.map((entry) => [entry.id, entry.original_content]));
  const summaryByInterpretationId = new Map(interpretations.map((interpretation) => [interpretation.id, interpretation.summary]));

  const copy = getDailyCycleCopy(locale);

  // A row the RPC just returned might, in principle, no longer resolve to a
  // hydratable original a few milliseconds later (case 11: resolved between
  // list load and hydration). Entries are never deleted in this schema, so
  // this is effectively unreachable today, but the loader still fails closed
  // by dropping the row rather than fabricating a title for it.
  const items = page.flatMap((row) => {
    const originalContent = originalByEntryId.get(row.entry_id);
    if (originalContent === undefined) return [];
    if (!isAttentionReason(row.reason)) return [];

    const originalPreview = toOriginalPreview(originalContent);
    const summary = row.current_interpretation_id ? summaryByInterpretationId.get(row.current_interpretation_id) : undefined;
    const title = summary?.trim() || originalPreview;
    const reasonCopy = copy.attentionReasons[row.reason];

    const source: NeedsAttentionItemSource = {
      key: `${row.entry_id}:${row.reason}`,
      kind: row.reason,
      entryId: row.entry_id,
      title,
      explanation: reasonCopy.description,
      primaryAction: {
        id: attentionActionId(row.reason),
        href: `/${locale}/app/inbox/${row.entry_id}`,
      },
      occurredAt: row.occurred_at,
      groupKey: row.entry_id,
    };

    const view = toNeedsAttentionItemView(source);
    return view ? [view] : [];
  });

  const lastRow = page[page.length - 1];
  return {
    items,
    hasNext,
    nextCursor: hasNext ? { occurredAt: lastRow.occurred_at, entryId: lastRow.entry_id } : null,
  };
}

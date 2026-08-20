import "server-only";
import { pageRange, paginateRows } from "@/lib/pagination";
import type { Locale } from "@/lib/preferences";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";

import { periodTypesFor, type ReviewTab } from "./review-periods";
import { toReviewSummaryView, type ReviewSummaryView } from "./review-presentation";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ReviewListProjection = Readonly<{
  items: readonly ReviewSummaryView[];
  hasNext: boolean;
}>;

/**
 * The history of one tab — **previous** reviews of the selected kind.
 *
 * ## Three changes from the list this replaces, each with a reason
 *
 * **1. `content` is no longer selected.** The list renders type, period, state
 * and a link; under OD-2J-1 the words are masked anyway, so reading them served
 * only to put masked prose into the RSC payload of a page that never shows it.
 *
 * **2. Filtered by the tab's `period_type` values.** The owner's decision is that
 * each tab shows "o histórico das revisões anteriores daquele mesmo tipo", and
 * Semana carries two types rather than one — see `review-periods.ts`.
 *
 * **3. The current period is excluded.** It is rendered above, as Part A. A page
 * that showed it in both places would be the duplication the owner reported, and
 * excluding by `period_start` rather than by id also removes the *earlier
 * snapshots* of the running period, which belong beside the current one and not
 * in a list headed "anteriores".
 *
 * Pagination is unchanged and still bounds the read; the exclusion is a query
 * predicate rather than a filter applied afterwards, so a page of results cannot
 * silently come back short.
 */
export async function loadReviewListProjection(
  supabase: SupabaseClient,
  {
    userId,
    locale,
    page,
    tab,
    excludePeriodStart,
  }: {
    userId: string;
    locale: Locale;
    page: number;
    tab: ReviewTab;
    /** `YYYY-MM-DD` of the period shown as Part A, kept out of the history below it. */
    excludePeriodStart: string;
  },
): Promise<ReviewListProjection> {
  const { from, to } = pageRange(page);
  const result = await supabase
    .from("summaries")
    .select("id,title,period_type,period_start,period_end,status")
    .eq("user_id", userId)
    .in("period_type", periodTypesFor(tab))
    .neq("period_start", excludePeriodStart)
    .order("period_start", { ascending: false })
    .order("period_end", { ascending: false })
    .range(from, to);
  const paginated = paginateRows(requireSupabaseData(result, "load review list") ?? []);
  return Object.freeze({
    items: paginated.items
      .map((row) => toReviewSummaryView(row, locale))
      .filter((item): item is ReviewSummaryView => item !== null),
    hasNext: paginated.hasNext,
  });
}

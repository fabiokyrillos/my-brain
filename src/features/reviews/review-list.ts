import "server-only";
import { pageRange, paginateRows } from "@/lib/pagination";
import type { Locale } from "@/lib/preferences";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";
import { toReviewListItemView, type ReviewListItemView } from "./review-presentation";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ReviewListProjection = Readonly<{
  items: readonly ReviewListItemView[];
  hasNext: boolean;
}>;

export async function loadReviewListProjection(
  supabase: SupabaseClient,
  { userId, locale, page }: { userId: string; locale: Locale; page: number },
): Promise<ReviewListProjection> {
  const { from, to } = pageRange(page);
  const result = await supabase
    .from("summaries")
    .select("id,title,content,period_type,period_start,period_end,status")
    .eq("user_id", userId)
    .order("period_end", { ascending: false })
    .range(from, to);
  const paginated = paginateRows(requireSupabaseData(result, "load review list") ?? []);
  return Object.freeze({
    items: paginated.items
      .map((row) => toReviewListItemView(row, locale))
      .filter((item): item is ReviewListItemView => item !== null),
    hasNext: paginated.hasNext,
  });
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { loadAttentionProjection, type AttentionCursor, type AttentionProjectionPage } from "./attention-projection";
import type { DailyCycleLocale } from "./copy";

export type LoadMoreNeedsAttentionResult =
  | { ok: true; page: AttentionProjectionPage }
  | { ok: false; code: "session_expired" | "action_failed" };

export async function loadMoreNeedsAttention(
  cursor: AttentionCursor,
  locale: DailyCycleLocale,
): Promise<LoadMoreNeedsAttentionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "session_expired" };

  try {
    const page = await loadAttentionProjection(supabase, { locale, cursor });
    return { ok: true, page };
  } catch {
    return { ok: false, code: "action_failed" };
  }
}

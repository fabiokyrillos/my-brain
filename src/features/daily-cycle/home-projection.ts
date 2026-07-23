import "server-only";
import { actionablePendingQuestionFilter } from "@/features/agent/question-visibility";
import { requireSupabaseData, requireSupabaseSuccess } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type HomeSupplementalProjection = {
  readonly waitingCount: number;
  readonly openQuestionPreview: string | null;
};

/**
 * Owns the two Home panels ("Aguardando terceiros"/"Perguntas pendentes")
 * that have no product-state or lifecycle rule of their own to reuse from
 * an existing daily-cycle projection (unlike the priority panel, which
 * reuses work-projection.ts's "today" definition). Kept minimal per
 * PROJ-007/PROJ-008 rather than folded into a heavier, speculative
 * abstraction with a single consumer.
 */
export async function loadHomeSupplementalProjection(
  supabase: SupabaseClient,
  userId: string,
): Promise<HomeSupplementalProjection> {
  const [waitingResult, questionsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "waiting"),
    supabase
      .from("pending_questions")
      .select("question")
      .eq("user_id", userId)
      .or(actionablePendingQuestionFilter())
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  requireSupabaseSuccess(waitingResult, "load Home waiting count");
  const questions = requireSupabaseData(questionsResult, "load Home open question preview") ?? [];

  return {
    waitingCount: waitingResult.count ?? 0,
    openQuestionPreview: questions[0]?.question ?? null,
  };
}

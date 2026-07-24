import "server-only";
import { localDateTimeToOffsetInstant } from "@/features/tasks/candidate-due-date";
import { resolveProfileTimezone } from "@/features/daily-cycle/review-projection";
import type { createClient } from "@/lib/supabase/server";
import { actionablePendingQuestionFilter } from "./question-visibility";
import { decideQuestionSurfacing, type QuestionSurfacingDecision } from "./question-surfacing";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Heartbeat parity defaults: the same fallbacks `run_user_heartbeat` coalesces
// missing preference columns to, so the pull surfaces and the deterministic
// heartbeat evaluate the same quiet-hours / cap discipline.
const DEFAULT_QUIET_START = "22:30:00";
const DEFAULT_QUIET_END = "07:00:00";
const DEFAULT_MAX_FOLLOWUPS = 5;

// A proactive nudge must fail toward silence: if any owner-scoped read throws,
// we return "do not surface" rather than nagging on incomplete data. The
// questions themselves stay reachable through /questions and the conversational
// panel regardless — this only governs the attention-grabbing emphasis.
function suppressedDecision(openQuestionCount = 0): QuestionSurfacingDecision {
  return { surface: false, reason: "no_open_questions", openQuestionCount };
}

// Start-of-local-day as a UTC instant, used to count today's nudges the same
// way the heartbeat's `local_day_start` does. A DST-gap midnight (rare) throws
// inside the wall-time converter; we fall back to a rolling 24h window so the
// cap still applies without ever crashing the decision.
function localDayStartIso(now: Date, timezone: string): string {
  try {
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const instant = localDateTimeToOffsetInstant(`${localDate}T00:00`, timezone);
    if (instant) return new Date(instant).toISOString();
  } catch {
    // fall through to the rolling window
  }
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Loads the deterministic proactive-surfacing decision for the authenticated
 * owner. Reuses the heartbeat's `notifications` ledger read-only as the shared
 * nudge budget (delivered-today count + last-nudge cooldown anchor), so no new
 * cron, channel, or persisted surfacing state is introduced — surfacing stays
 * pull-based per ADR-033.
 */
export async function loadQuestionSurfacingDecision(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<QuestionSurfacingDecision> {
  try {
    const [preferencesResult, profileResult, openQuestionsResult] = await Promise.all([
      supabase
        .from("agent_preferences")
        .select("quiet_start,quiet_end,max_followups_per_day,important_reminder_override")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
      supabase
        .from("pending_questions")
        .select("id", { count: "exact", head: true })
        .or(actionablePendingQuestionFilter(now)),
    ]);

    if (preferencesResult.error || profileResult.error || openQuestionsResult.error) {
      return suppressedDecision();
    }

    const openQuestionCount = openQuestionsResult.count ?? 0;
    if (openQuestionCount <= 0) return suppressedDecision();

    const preferences = preferencesResult.data;
    const timezone = resolveProfileTimezone(
      (profileResult.data as { timezone?: unknown } | null)?.timezone,
    );

    const dayStartIso = localDayStartIso(now, timezone);
    const [deliveredTodayResult, lastNudgeResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", dayStartIso),
      supabase
        .from("notifications")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (deliveredTodayResult.error || lastNudgeResult.error) return suppressedDecision(openQuestionCount);

    return decideQuestionSurfacing({
      now,
      timezone,
      quietStart: preferences?.quiet_start ?? DEFAULT_QUIET_START,
      quietEnd: preferences?.quiet_end ?? DEFAULT_QUIET_END,
      maxFollowupsPerDay: preferences?.max_followups_per_day ?? DEFAULT_MAX_FOLLOWUPS,
      importantReminderOverride: preferences?.important_reminder_override ?? false,
      openQuestionCount,
      deliveredToday: deliveredTodayResult.count ?? 0,
      lastProactiveNudgeAt: lastNudgeResult.data?.created_at ?? null,
    });
  } catch {
    return suppressedDecision();
  }
}

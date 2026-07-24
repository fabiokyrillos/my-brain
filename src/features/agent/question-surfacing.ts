// Phase 2D Slice 2D.5 — deterministic surfacing / cooldown for proactive
// pending-question nudges.
//
// This module is the single, pure, LLM-free decision the PRD's 2D-COOLDOWN
// requirements demand: whether an open pending question may be *proactively*
// surfaced (a nudge), honoring the user's local quiet hours, daily cap, rolling
// cooldown, and the important-reminder override. It deliberately mirrors the
// deterministic heartbeat discipline (`run_user_heartbeat`) — quiet hours in
// the user's own timezone, a per-local-day cap, a 24h cooldown, and an override
// that only an *important* item may use — so the two never nag past one shared
// budget. It never decides *whether questions are reachable*: the queue, the
// questions page, and Chat always let a user pull up and resolve open
// questions. It only gates the proactive emphasis, so nothing is ever
// permanently hidden.
//
// The quiet-hours predicate reuses the heartbeat helper verbatim so both paths
// share exactly one definition of "the user's night".
import { isWithinQuietHours } from "@/lib/agent/heartbeat";

export const questionSurfacingReasons = [
  "surface",
  "no_open_questions",
  "quiet_hours",
  "daily_cap_reached",
  "cooldown",
] as const;

export type QuestionSurfacingReason = (typeof questionSurfacingReasons)[number];

export type QuestionSurfacingDecision = {
  readonly surface: boolean;
  readonly reason: QuestionSurfacingReason;
  readonly openQuestionCount: number;
};

export type QuestionSurfacingInput = {
  /** The instant the decision is evaluated at. */
  readonly now: Date;
  /** IANA timezone used to place `now` in the user's local day. */
  readonly timezone: string;
  /** Quiet-hours window bounds as `HH:mm` or `HH:mm:ss` (seconds ignored). */
  readonly quietStart: string;
  readonly quietEnd: string;
  /** `agent_preferences.max_followups_per_day`; 0 disables proactive nudges. */
  readonly maxFollowupsPerDay: number;
  /** `agent_preferences.important_reminder_override`. */
  readonly importantReminderOverride: boolean;
  /** Count of currently-actionable (open) pending questions. */
  readonly openQuestionCount: number;
  /** Whether any actionable question is important (reserved; false today). */
  readonly hasImportantQuestion?: boolean;
  /** Proactive nudges already delivered in the user's local day. */
  readonly deliveredToday: number;
  /** ISO instant of the most recent proactive nudge, or null. */
  readonly lastProactiveNudgeAt: string | null;
  /** Rolling cooldown window; defaults to 24h to match the heartbeat. */
  readonly cooldownMs?: number;
};

const DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Local wall-clock `HH:mm` for `now` in the given timezone, using a 24h cycle
// so the heartbeat's minute-based quiet-hours comparison lines up. Falls back
// to the UTC wall clock if the timezone is unusable, so a bad profile value can
// never throw inside a fail-open decision.
function localTimeOfDay(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    return `${hour}:${minute}`;
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

function suppressed(reason: QuestionSurfacingReason, openQuestionCount: number): QuestionSurfacingDecision {
  return { surface: false, reason, openQuestionCount };
}

export function decideQuestionSurfacing(input: QuestionSurfacingInput): QuestionSurfacingDecision {
  const count = Math.max(0, Math.trunc(input.openQuestionCount));
  if (count <= 0) return suppressed("no_open_questions", 0);

  // Only an important question may use the override to escape the quiet-hours /
  // cap / cooldown gates, mirroring the heartbeat's `allow_important AND
  // reminder.important`. No question carries importance today, so the override
  // is inert by default — the module stays faithful and future-ready.
  const canBypass = (input.hasImportantQuestion ?? false) && input.importantReminderOverride;

  const inQuietHours = isWithinQuietHours(
    localTimeOfDay(input.now, input.timezone),
    input.quietStart,
    input.quietEnd,
  );
  if (inQuietHours && !canBypass) return suppressed("quiet_hours", count);

  const cap = Math.trunc(input.maxFollowupsPerDay);
  const availableSlots = Math.max(cap - Math.max(0, Math.trunc(input.deliveredToday)), 0);
  if (availableSlots <= 0 && !canBypass) return suppressed("daily_cap_reached", count);

  const cooldownMs = input.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  if (!canBypass && input.lastProactiveNudgeAt) {
    const lastMs = Date.parse(input.lastProactiveNudgeAt);
    if (Number.isFinite(lastMs) && input.now.getTime() - lastMs < cooldownMs) {
      return suppressed("cooldown", count);
    }
  }

  return { surface: true, reason: "surface", openQuestionCount: count };
}

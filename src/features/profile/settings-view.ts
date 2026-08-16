import "server-only";
import { isTextModelId, type AIRoutingProfile, type TextModelId } from "@/lib/ai/model-routing";
import { defaultAgentPreferences } from "@/lib/preferences";
import type { createClient } from "@/lib/supabase/server";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { SettingsFormValues } from "./settings-contracts";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function timeValue(value: string | null | undefined, fallback: string) {
  return String(value ?? fallback).slice(0, 5);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

/** 0–6, Sunday-based — the same range `parseReviewWeekday` accepts. */
function weekday(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6
    ? value
    : fallback;
}

function model(value: unknown, fallback: TextModelId): TextModelId {
  return isTextModelId(value) ? value : fallback;
}

export async function loadSettingsFormValues(supabase: SupabaseClient, userId: string): Promise<SettingsFormValues> {
  const [profileResult, preferencesResult] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
    supabase.from("agent_preferences").select("agent_name,personality,tone,quiet_start,quiet_end,important_reminder_override,max_followups_per_day,response_detail,daily_review_time,weekly_review_time,weekly_review_day,ai_profile,chat_model,extraction_model,review_model,file_model").eq("user_id", userId).maybeSingle(),
  ]);
  const profile = requireSupabaseData(profileResult, "load operational profile settings");
  const preferences = requireSupabaseData(preferencesResult, "load operational agent settings");

  return Object.freeze({
    timezone: profile?.timezone ?? "America/Sao_Paulo",
    agentName: preferences?.agent_name?.trim() || defaultAgentPreferences.agentName,
    personality: oneOf(preferences?.personality, ["direct", "proactive", "warm", "analytical"] as const, "proactive"),
    tone: oneOf(preferences?.tone, ["direct", "informal", "natural", "professional"] as const, "direct"),
    quietStart: timeValue(preferences?.quiet_start, "22:30"),
    quietEnd: timeValue(preferences?.quiet_end, "07:00"),
    importantReminderOverride: preferences?.important_reminder_override ?? true,
    maxFollowupsPerDay: preferences?.max_followups_per_day ?? 3,
    responseDetail: oneOf(preferences?.response_detail, ["short", "balanced", "detailed"] as const, "short"),
    /*
     * `2O-PREF-004`. The fallbacks match the ones `buildSettingsPayload` has
     * been sending since before this slice — 22:00, 19:00 and Friday — so a form
     * opened against a row that predates the controls renders the value that was
     * already being written, rather than proposing a change nobody asked for.
     *
     * `weeklyReviewDay` is bounded rather than defaulted blindly: the column has
     * no CHECK the application can rely on, and `parseReviewWeekday` refuses
     * anything outside 0–6, so the form must not offer a value the consumer will
     * then decline to read.
     */
    dailyReviewTime: timeValue(preferences?.daily_review_time, "22:00"),
    weeklyReviewTime: timeValue(preferences?.weekly_review_time, "19:00"),
    weeklyReviewDay: weekday(preferences?.weekly_review_day, 5),
    aiProfile: oneOf(preferences?.ai_profile, ["quality", "balanced", "economy", "custom"] as const satisfies readonly AIRoutingProfile[], "quality"),
    chatModel: model(preferences?.chat_model, "gpt-5.6-terra"),
    extractionModel: model(preferences?.extraction_model, "gpt-5.6-luna"),
    reviewModel: model(preferences?.review_model, "gpt-5.6-terra"),
    fileModel: model(preferences?.file_model, "gpt-5.6-luna"),
  });
}

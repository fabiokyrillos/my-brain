import "server-only";
import { isTextModelId, type AIRoutingProfile, type TextModelId } from "@/lib/ai/model-routing";
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

function model(value: unknown, fallback: TextModelId): TextModelId {
  return isTextModelId(value) ? value : fallback;
}

export async function loadSettingsFormValues(supabase: SupabaseClient, userId: string): Promise<SettingsFormValues> {
  const [profileResult, preferencesResult] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
    supabase.from("agent_preferences").select("personality,tone,quiet_start,quiet_end,important_reminder_override,max_followups_per_day,response_detail,ai_profile,chat_model,extraction_model,review_model,file_model").eq("user_id", userId).maybeSingle(),
  ]);
  const profile = requireSupabaseData(profileResult, "load operational profile settings");
  const preferences = requireSupabaseData(preferencesResult, "load operational agent settings");

  return Object.freeze({
    timezone: profile?.timezone ?? "America/Sao_Paulo",
    personality: oneOf(preferences?.personality, ["direct", "proactive", "warm", "analytical"] as const, "proactive"),
    tone: oneOf(preferences?.tone, ["direct", "informal", "natural", "professional"] as const, "direct"),
    quietStart: timeValue(preferences?.quiet_start, "22:30"),
    quietEnd: timeValue(preferences?.quiet_end, "07:00"),
    importantReminderOverride: preferences?.important_reminder_override ?? true,
    maxFollowupsPerDay: preferences?.max_followups_per_day ?? 3,
    responseDetail: oneOf(preferences?.response_detail, ["short", "balanced", "detailed"] as const, "short"),
    aiProfile: oneOf(preferences?.ai_profile, ["quality", "balanced", "economy", "custom"] as const satisfies readonly AIRoutingProfile[], "quality"),
    chatModel: model(preferences?.chat_model, "gpt-5.6-terra"),
    extractionModel: model(preferences?.extraction_model, "gpt-5.6-luna"),
    reviewModel: model(preferences?.review_model, "gpt-5.6-terra"),
    fileModel: model(preferences?.file_model, "gpt-5.6-luna"),
  });
}

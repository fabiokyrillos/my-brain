import { MODEL_PROFILES } from "@/lib/ai/model-routing";
import type { Locale } from "@/lib/preferences";
import type { ProfileInput } from "./schema";

type StoredProfile = { display_name: string | null; locale: string | null } | null;
type StoredPreferences = Partial<{
  agent_name: string;
  follow_up_intensity: string;
  daily_review_time: string;
  autonomy_level: string;
  weekly_review_day: number;
  weekly_review_time: string;
  planning_day: number;
  planning_time: string;
  ai_provider: string;
  reasoning_model: string;
  background_model: string;
  embedding_model: string;
  privacy_default: string;
}> | null;

export type SettingsPersistenceSnapshot = Readonly<{
  fallbackDisplayName: string;
  profile: StoredProfile;
  preferences: StoredPreferences;
}>;

function shortTime(value: string | undefined, fallback: string) {
  return (value ?? fallback).slice(0, 5);
}

function storedLocale(value: string | null | undefined, fallback: Locale): Locale {
  return value === "pt-BR" || value === "en" ? value : fallback;
}

export function buildSettingsPayload(input: ProfileInput, snapshot: SettingsPersistenceSnapshot) {
  const current = snapshot.preferences;
  const preset = input.aiProfile === "custom" ? null : MODEL_PROFILES[input.aiProfile];
  return {
    profile: {
      displayName: snapshot.profile?.display_name?.trim() || snapshot.fallbackDisplayName,
      locale: storedLocale(snapshot.profile?.locale, input.locale),
      timezone: input.timezone,
    },
    preferences: {
      agentName: current?.agent_name ?? "Brain",
      followUpIntensity: current?.follow_up_intensity ?? "balanced",
      dailyReviewTime: shortTime(current?.daily_review_time, "22:00"),
      personality: input.personality,
      tone: input.tone,
      autonomyLevel: current?.autonomy_level ?? "autonomous",
      weeklyReviewDay: current?.weekly_review_day ?? 5,
      weeklyReviewTime: shortTime(current?.weekly_review_time, "19:00"),
      planningDay: current?.planning_day ?? 1,
      planningTime: shortTime(current?.planning_time, "08:00"),
      quietStart: input.quietStart,
      quietEnd: input.quietEnd,
      importantReminderOverride: input.importantReminderOverride,
      maxFollowupsPerDay: input.maxFollowupsPerDay,
      responseDetail: input.responseDetail,
      aiProvider: "openai",
      aiProfile: input.aiProfile,
      chatModel: preset?.chatModel ?? input.chatModel,
      extractionModel: preset?.extractionModel ?? input.extractionModel,
      reasoningModel: preset?.reasoningModel ?? current?.reasoning_model ?? MODEL_PROFILES.quality.reasoningModel,
      reviewModel: preset?.reviewModel ?? input.reviewModel,
      fileModel: preset?.fileModel ?? input.fileModel,
      backgroundModel: preset?.backgroundModel ?? current?.background_model ?? MODEL_PROFILES.quality.backgroundModel,
      embeddingModel: "text-embedding-3-small",
      privacyDefault: current?.privacy_default ?? "normal",
    },
  };
}

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
      // Submitted, no longer passed through. Until Slice F1 the form rendered
      // no input for this, so the only safe thing to send was whatever was
      // already stored — which is exactly why the column never changed.
      agentName: input.agentName,
      followUpIntensity: current?.follow_up_intensity ?? "balanced",
      /*
       * `2O-PREF-004`: submitted, no longer passed through.
       *
       * These three were read from `current` and written straight back, which is
       * why `2M-AUDIT-005` found them unchangeable — the payload was a
       * round-trip. They now carry what the form sent, which is the whole of
       * giving a column a control.
       *
       * The pairing below is the point: `planningDay` and `planningTime` stay
       * passed through, because `2O-PREF-007` gives them no control and
       * `2M-AUDIT-005` retired them. Two columns on the same table, written by
       * the same payload, deliberately treated differently — and
       * `settings-payload.test.ts` asserts both halves, so removing either
       * distinction fails.
       */
      dailyReviewTime: input.dailyReviewTime,
      personality: input.personality,
      tone: input.tone,
      autonomyLevel: current?.autonomy_level ?? "autonomous",
      weeklyReviewDay: input.weeklyReviewDay,
      weeklyReviewTime: input.weeklyReviewTime,
      planningDay: current?.planning_day ?? 1,
      planningTime: shortTime(current?.planning_time, "08:00"),
      quietStart: input.quietStart,
      quietEnd: input.quietEnd,
      importantReminderOverride: input.importantReminderOverride,
      maxFollowupsPerDay: input.maxFollowupsPerDay,
      responseDetail: input.responseDetail,
      /*
       * `2O-ACTIVATION-007`'s *"no save wipes a value"*, made true for this
       * column — carried from slice 2O.0 and repaired here.
       *
       * It was the literal `"openai"`, so every save overwrote whatever the row
       * held. Nothing reads the column, so nothing behaved differently today —
       * but *today* is not the guarantee the requirement asks for, and a write
       * that discards a stored value is the defect whether or not anyone has
       * noticed the loss yet. It now matches every other consumer-less column on
       * this payload: pass the stored value through, and fall back only when
       * there is nothing to pass.
       *
       * **Repairing it here rather than in 2O.0 is ADR-118's own routing.** Its
       * alternatives rejected *"correct `ai_provider`'s hardcoded write while
       * cataloguing it"* because the finding *"belongs to `2O-AICONFIG`'s
       * slice"*. This is that slice.
       *
       * `embedding_model` below is the same shape and is **deliberately not
       * touched**: ADR-117 Decision 4 forbids removing, altering, renaming,
       * re-defaulting or migrating it, and passing a stored value through where
       * a literal stands today is a change to how the column is written. The
       * shortfall stays named rather than absorbed.
       */
      aiProvider: current?.ai_provider ?? "openai",
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

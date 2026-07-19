import { describe, expect, it } from "vitest";
import type { ProfileInput } from "./schema";
import { buildSettingsPayload, type SettingsPersistenceSnapshot } from "./settings-payload";

const input: ProfileInput = {
  locale: "pt-BR",
  timezone: "America/Sao_Paulo",
  personality: "warm",
  tone: "natural",
  quietStart: "23:00",
  quietEnd: "06:00",
  importantReminderOverride: true,
  maxFollowupsPerDay: 4,
  responseDetail: "balanced",
  aiProfile: "custom",
  chatModel: "gpt-5.6-luna",
  extractionModel: "gpt-5-mini",
  reviewModel: "gpt-5.6-terra",
  fileModel: "gpt-5-mini",
};

const snapshot: SettingsPersistenceSnapshot = {
  fallbackDisplayName: "Fábio",
  profile: { display_name: "Fabin", locale: "en" },
  preferences: {
    agent_name: "Brain local",
    follow_up_intensity: "calm",
    daily_review_time: "21:30:00",
    autonomy_level: "suggestive",
    weekly_review_day: 4,
    weekly_review_time: "18:30:00",
    planning_day: 0,
    planning_time: "09:00:00",
    ai_provider: "openai",
    reasoning_model: "gpt-5.6-luna",
    background_model: "gpt-5-mini",
    embedding_model: "text-embedding-3-small",
    privacy_default: "private",
  },
};

describe("buildSettingsPayload", () => {
  it("merges visible settings with the owner-scoped snapshot and preserves hidden preferences", () => {
    const payload = buildSettingsPayload(input, snapshot);
    expect(payload.profile).toEqual({ displayName: "Fabin", locale: "en", timezone: "America/Sao_Paulo" });
    expect(payload.preferences).toMatchObject({
      agentName: "Brain local",
      followUpIntensity: "calm",
      dailyReviewTime: "21:30",
      autonomyLevel: "suggestive",
      weeklyReviewDay: 4,
      weeklyReviewTime: "18:30",
      planningDay: 0,
      planningTime: "09:00",
      personality: "warm",
      tone: "natural",
      responseDetail: "balanced",
      privacyDefault: "private",
      reasoningModel: "gpt-5.6-luna",
      backgroundModel: "gpt-5-mini",
    });
  });

  it("applies the complete preset server-side without accepting hidden model fields", () => {
    const payload = buildSettingsPayload({ ...input, aiProfile: "economy" }, snapshot);
    expect(payload.preferences).toMatchObject({
      aiProfile: "economy",
      chatModel: "gpt-5-mini",
      extractionModel: "gpt-5-mini",
      reasoningModel: "gpt-5.6-luna",
      reviewModel: "gpt-5-mini",
      fileModel: "gpt-5-mini",
      backgroundModel: "gpt-5-mini",
      embeddingModel: "text-embedding-3-small",
    });
  });
});

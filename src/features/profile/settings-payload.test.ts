import { describe, expect, it } from "vitest";
import type { ProfileInput } from "./schema";
import { buildSettingsPayload } from "./settings-payload";

const input: ProfileInput = {
  displayName: "Fabin",
  agentName: "Brain",
  locale: "pt-BR",
  timezone: "America/Sao_Paulo",
  followUpIntensity: "balanced",
  dailyReviewTime: "22:00",
  personality: "proactive",
  tone: "direct",
  autonomyLevel: "autonomous",
  weeklyReviewDay: 5,
  weeklyReviewTime: "19:00",
  planningDay: 1,
  planningTime: "08:00",
  quietStart: "22:30",
  quietEnd: "07:00",
  importantReminderOverride: true,
  maxFollowupsPerDay: 3,
  responseDetail: "short",
  aiProvider: "openai",
  aiProfile: "quality",
  chatModel: "gpt-5.6-terra",
  extractionModel: "gpt-5.6-luna",
  reasoningModel: "gpt-5.6-terra",
  reviewModel: "gpt-5.6-terra",
  fileModel: "gpt-5.6-luna",
  backgroundModel: "gpt-5-mini",
  embeddingModel: "text-embedding-3-small",
  privacyDefault: "normal",
};

describe("buildSettingsPayload", () => {
  it("separates profile identity from the atomic preference payload", () => {
    const payload = buildSettingsPayload(input);
    expect(payload.profile).toEqual({
      displayName: "Fabin",
      locale: "pt-BR",
      timezone: "America/Sao_Paulo",
    });
    expect(payload.preferences).not.toHaveProperty("displayName");
    expect(payload.preferences).not.toHaveProperty("locale");
    expect(payload.preferences).not.toHaveProperty("timezone");
    expect(payload.preferences).toMatchObject({
      agentName: "Brain",
      aiProfile: "quality",
      extractionModel: "gpt-5.6-luna",
      importantReminderOverride: true,
    });
  });
});

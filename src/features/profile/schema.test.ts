import { describe, expect, it } from "vitest";
import { profileSchema } from "./schema";

const valid = {
  displayName: "Fabin", agentName: "Brain", locale: "pt-BR", timezone: "America/Sao_Paulo",
  followUpIntensity: "balanced", dailyReviewTime: "22:00", personality: "proactive", tone: "direct",
  autonomyLevel: "autonomous", weeklyReviewDay: "5", weeklyReviewTime: "19:00", planningDay: "1",
  planningTime: "08:00", quietStart: "22:30", quietEnd: "07:00", maxFollowupsPerDay: "3",
  responseDetail: "short", aiProvider: "openai", aiProfile: "quality",
  chatModel: "gpt-5.6-terra", extractionModel: "gpt-5.6-luna", reasoningModel: "gpt-5.6-terra",
  reviewModel: "gpt-5.6-terra", fileModel: "gpt-5.6-luna", backgroundModel: "gpt-5-mini",
  embeddingModel: "text-embedding-3-small", privacyDefault: "normal",
  importantReminderOverride: "on",
};

describe("profileSchema", () => {
  it("accepts an IANA timezone and supported preferences", () => expect(profileSchema.safeParse(valid).success).toBe(true));
  it("rejects an invalid timezone", () => expect(profileSchema.safeParse({ ...valid, timezone: "GMT-3" }).success).toBe(false));
  it("rejects an unsupported locale", () => expect(profileSchema.safeParse({ ...valid, locale: "fr" }).success).toBe(false));
  it("rejects an invalid quiet-period time", () => expect(profileSchema.safeParse({ ...valid, quietStart: "25:00" }).success).toBe(false));
  it("rejects a model that is not in the configured provider catalog", () => expect(profileSchema.safeParse({ ...valid, chatModel: "gpt-5.6-sol" }).success).toBe(false));
});

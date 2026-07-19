import { describe, expect, it } from "vitest";
import { profileSchema } from "./schema";

const valid = {
  locale: "pt-BR",
  timezone: "America/Sao_Paulo",
  personality: "proactive",
  tone: "direct",
  quietStart: "22:30",
  quietEnd: "07:00",
  importantReminderOverride: "on",
  maxFollowupsPerDay: "3",
  responseDetail: "short",
  aiProfile: "quality",
  chatModel: "gpt-5.6-terra",
  extractionModel: "gpt-5.6-luna",
  reviewModel: "gpt-5.6-terra",
  fileModel: "gpt-5.6-luna",
};

describe("profileSchema", () => {
  it("accepts only currently operational visible settings", () => expect(profileSchema.safeParse(valid).success).toBe(true));
  it("rejects an invalid timezone", () => expect(profileSchema.safeParse({ ...valid, timezone: "GMT-3" }).success).toBe(false));
  it("rejects an unsupported locale context", () => expect(profileSchema.safeParse({ ...valid, locale: "fr" }).success).toBe(false));
  it("rejects an invalid quiet-period time", () => expect(profileSchema.safeParse({ ...valid, quietStart: "25:00" }).success).toBe(false));
  it("rejects a model that is not in the configured provider catalog", () => expect(profileSchema.safeParse({ ...valid, chatModel: "gpt-5.6-sol" }).success).toBe(false));

  it.each(["displayName", "agentName", "dailyReviewTime", "weeklyReviewTime", "autonomyLevel", "followUpIntensity", "privacyDefault", "reasoningModel", "backgroundModel"])(
    "rejects the hidden or future field %s instead of accepting a forged control",
    (field) => expect(profileSchema.safeParse({ ...valid, [field]: "forged" }).success).toBe(false),
  );
});

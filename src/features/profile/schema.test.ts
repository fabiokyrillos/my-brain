import { describe, expect, it } from "vitest";
import { profileSchema } from "./schema";

const valid = {
  locale: "pt-BR",
  agentName: "Brain",
  timezone: "America/Sao_Paulo",
  personality: "proactive",
  tone: "direct",
  quietStart: "22:30",
  quietEnd: "07:00",
  importantReminderOverride: "on",
  maxFollowupsPerDay: "3",
  responseDetail: "short",
  // `2O-PREF-004`. Strings, because this fixture is what a `FormData` actually
  // yields — `weeklyReviewDay` is coerced from a `<select>`'s string value.
  dailyReviewTime: "22:00",
  weeklyReviewTime: "19:00",
  weeklyReviewDay: "5",
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

  // `agentName` has moved out of this list, which is the point of Slice F1: it
  // was rejected here precisely because the form rendered no control for it, so
  // any value arriving under that key could only have been forged. It now has a
  // control, so it is accepted — and bounded to the column's own check instead.
  it.each(["displayName", "dailyReviewTime", "weeklyReviewTime", "autonomyLevel", "followUpIntensity", "privacyDefault", "reasoningModel", "backgroundModel"])(
    "rejects the hidden or future field %s instead of accepting a forged control",
    (field) => expect(profileSchema.safeParse({ ...valid, [field]: "forged" }).success).toBe(false),
  );

  it("accepts an assistant name and trims it", () => {
    const parsed = profileSchema.safeParse({ ...valid, agentName: "  Ada  " });
    expect(parsed.success && parsed.data.agentName).toBe("Ada");
  });

  it("bounds the assistant name to what the column accepts", () => {
    // `agent_preferences_agent_name_check` allows 1–60 characters. A looser
    // bound would turn a typo into a database error the form cannot explain.
    expect(profileSchema.safeParse({ ...valid, agentName: "a".repeat(60) }).success).toBe(true);
    expect(profileSchema.safeParse({ ...valid, agentName: "a".repeat(61) }).success).toBe(false);
    expect(profileSchema.safeParse({ ...valid, agentName: "   " }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { profileSchema } from "./schema";

const valid = { displayName: "Fabin", agentName: "Brain", locale: "pt-BR", timezone: "America/Sao_Paulo", followUpIntensity: "balanced", dailyReviewTime: "22:00" };

describe("profileSchema", () => {
  it("accepts an IANA timezone and supported preferences", () => expect(profileSchema.safeParse(valid).success).toBe(true));
  it("rejects an invalid timezone", () => expect(profileSchema.safeParse({ ...valid, timezone: "GMT-3" }).success).toBe(false));
  it("rejects an unsupported locale", () => expect(profileSchema.safeParse({ ...valid, locale: "fr" }).success).toBe(false));
});

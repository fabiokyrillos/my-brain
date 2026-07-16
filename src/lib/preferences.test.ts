import { describe, expect, it } from "vitest";
import { defaultAgentPreferences, isLocale, resolveLocale } from "./preferences";

describe("preferences", () => {
  it("accepts only supported locales", () => {
    expect(isLocale("pt-BR")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("pt")).toBe(false);
  });

  it("falls back to Brazilian Portuguese", () => {
    expect(resolveLocale("fr")).toBe("pt-BR");
    expect(resolveLocale(undefined)).toBe("pt-BR");
  });

  it("starts with the approved agent defaults", () => {
    expect(defaultAgentPreferences).toMatchObject({
      agentName: "Brain",
      locale: "pt-BR",
      followUpIntensity: "balanced",
      dailyReviewTime: "22:00",
    });
  });
});

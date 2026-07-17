import { describe, expect, it } from "vitest";
import { MODEL_PROFILES, resolveAIRoutes } from "./model-routing";

describe("AI model routing", () => {
  it("uses Terra for user-facing reasoning and cheaper models for bounded work in maximum quality", () => {
    expect(resolveAIRoutes("quality")).toEqual({
      chatModel: "gpt-5.6-terra",
      extractionModel: "gpt-5.6-luna",
      reasoningModel: "gpt-5.6-terra",
      reviewModel: "gpt-5.6-terra",
      fileModel: "gpt-5.6-luna",
      backgroundModel: "gpt-5-mini",
      embeddingModel: "text-embedding-3-small",
    });
  });

  it("keeps all preset routes explicit", () => {
    expect(MODEL_PROFILES.balanced.chatModel).toBe("gpt-5.6-luna");
    expect(MODEL_PROFILES.balanced.reasoningModel).toBe("gpt-5.6-terra");
    expect(MODEL_PROFILES.economy.chatModel).toBe("gpt-5-mini");
    expect(MODEL_PROFILES.economy.reviewModel).toBe("gpt-5-mini");
  });

  it("applies validated custom overrides without mutating a preset", () => {
    const custom = resolveAIRoutes("quality", {
      extractionModel: "gpt-5-mini",
      fileModel: "gpt-5.6-terra",
    });

    expect(custom.extractionModel).toBe("gpt-5-mini");
    expect(custom.fileModel).toBe("gpt-5.6-terra");
    expect(MODEL_PROFILES.quality.extractionModel).toBe("gpt-5.6-luna");
  });
});

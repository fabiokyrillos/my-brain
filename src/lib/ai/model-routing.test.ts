import { describe, expect, it } from "vitest";
import { MODEL_PROFILES, isTextModelId } from "./model-routing";

// `resolveAIRoutes` and its tests were removed in the pre-2E hardening pass:
// the function had no production caller. `MODEL_PROFILES` is live (Settings
// reads it), so its presets stay covered.
describe("AI model routing", () => {
  it("keeps all preset routes explicit", () => {
    expect(MODEL_PROFILES.quality.chatModel).toBe("gpt-5.6-terra");
    expect(MODEL_PROFILES.quality.extractionModel).toBe("gpt-5.6-luna");
    expect(MODEL_PROFILES.quality.reasoningModel).toBe("gpt-5.6-terra");
    expect(MODEL_PROFILES.quality.reviewModel).toBe("gpt-5.6-terra");
    expect(MODEL_PROFILES.quality.fileModel).toBe("gpt-5.6-luna");
    expect(MODEL_PROFILES.quality.backgroundModel).toBe("gpt-5-mini");
    expect(MODEL_PROFILES.quality.embeddingModel).toBe("text-embedding-3-small");
    expect(MODEL_PROFILES.balanced.chatModel).toBe("gpt-5.6-luna");
    expect(MODEL_PROFILES.balanced.reasoningModel).toBe("gpt-5.6-terra");
    expect(MODEL_PROFILES.economy.chatModel).toBe("gpt-5-mini");
    expect(MODEL_PROFILES.economy.reviewModel).toBe("gpt-5-mini");
  });

  it("recognizes only the declared text models", () => {
    expect(isTextModelId("gpt-5.6-terra")).toBe(true);
    expect(isTextModelId("gpt-5-mini")).toBe(true);
    expect(isTextModelId("text-embedding-3-small")).toBe(false);
    expect(isTextModelId("gpt-4o")).toBe(false);
    expect(isTextModelId(null)).toBe(false);
  });
});

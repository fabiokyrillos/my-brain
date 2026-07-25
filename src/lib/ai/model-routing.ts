export const TEXT_MODEL_IDS = ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5-mini"] as const;
export const EMBEDDING_MODEL_IDS = ["text-embedding-3-small"] as const;

export type TextModelId = (typeof TEXT_MODEL_IDS)[number];
export type EmbeddingModelId = (typeof EMBEDDING_MODEL_IDS)[number];
export type AIModelId = TextModelId | EmbeddingModelId;
export type AIRoutingProfile = "quality" | "balanced" | "economy" | "custom";
export type AIProfilePreset = Exclude<AIRoutingProfile, "custom">;

export type AIRoutes = {
  chatModel: TextModelId;
  extractionModel: TextModelId;
  reasoningModel: TextModelId;
  reviewModel: TextModelId;
  fileModel: TextModelId;
  backgroundModel: TextModelId;
  embeddingModel: EmbeddingModelId;
};

export const MODEL_PROFILES: Record<AIProfilePreset, Readonly<AIRoutes>> = {
  quality: {
    chatModel: "gpt-5.6-terra",
    extractionModel: "gpt-5.6-luna",
    reasoningModel: "gpt-5.6-terra",
    reviewModel: "gpt-5.6-terra",
    fileModel: "gpt-5.6-luna",
    backgroundModel: "gpt-5-mini",
    embeddingModel: "text-embedding-3-small",
  },
  balanced: {
    chatModel: "gpt-5.6-luna",
    extractionModel: "gpt-5-mini",
    reasoningModel: "gpt-5.6-terra",
    reviewModel: "gpt-5.6-luna",
    fileModel: "gpt-5-mini",
    backgroundModel: "gpt-5-mini",
    embeddingModel: "text-embedding-3-small",
  },
  economy: {
    chatModel: "gpt-5-mini",
    extractionModel: "gpt-5-mini",
    reasoningModel: "gpt-5.6-luna",
    reviewModel: "gpt-5-mini",
    fileModel: "gpt-5-mini",
    backgroundModel: "gpt-5-mini",
    embeddingModel: "text-embedding-3-small",
  },
};

export const TEXT_MODEL_LABELS: Record<TextModelId, string> = {
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-5-mini": "GPT-5 mini",
};

// `resolveAIRoutes` was removed in the pre-2E hardening pass: it had no
// production caller. The five real call sites each resolve their own model with
// `preferences?.<operation>_model ?? "<default>"`, and consolidating them
// behind one helper needs a Deno-side mirror for the worker to use the same
// rule — that belongs to the AI-layer work Phase 2E folds in, not to a
// hardening pass keeping a consumer-less abstraction alive.

export function isTextModelId(value: unknown): value is TextModelId {
  return typeof value === "string" && TEXT_MODEL_IDS.includes(value as TextModelId);
}

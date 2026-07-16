import "server-only";

import type { AIProvider } from "./provider";
import { OpenAIProvider } from "./openai-provider";

export function getAIProvider(options?: { model?: string }): AIProvider {
  return new OpenAIProvider(options);
}

export type { AIProvider } from "./provider";
export type { EntryExtraction } from "./extraction-schema";
export type { ChatInput, ChatResult, ChatSource, EmbeddingResult, ExtractionInput, ExtractionResult } from "./types";

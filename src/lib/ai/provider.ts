import type { ChatInput, ChatResult, EmbeddingResult, ExtractionInput, ExtractionResult } from "./types";

export interface AIProvider {
  readonly id: string;
  extractEntry(input: ExtractionInput): Promise<ExtractionResult>;
  embedText(input: string): Promise<EmbeddingResult>;
  answerFromKnowledge(input: ChatInput): Promise<ChatResult>;
}

import type {
  ChatInput,
  ChatResult,
  EmbeddingResult,
  ExtractionInput,
  ExtractionResult,
  TaskCommandParseInput,
  TaskCommandParseResult,
} from "./types";

export interface AIProvider {
  readonly id: string;
  extractEntry(input: ExtractionInput): Promise<ExtractionResult>;
  embedText(input: string): Promise<EmbeddingResult>;
  answerFromKnowledge(input: ChatInput): Promise<ChatResult>;
  /**
   * Turns one user sentence into a bounded command proposal. It selects
   * nothing and authorizes nothing: matching, eligibility, confirmation and
   * the write all live outside the provider (PRD §6.1).
   */
  parseTaskCommand(input: TaskCommandParseInput): Promise<TaskCommandParseResult>;
}

import type { EntryExtraction } from "./extraction-schema";
import type { TaskCommandProposal } from "./task-command-schema";
import type { AIUsageDetails } from "./usage-details";

export type ExtractionInput = {
  content: string;
  locale: "pt-BR" | "en";
  timezone: string;
  currentTime: string;
  knownContext?: string;
};

export type ExtractionResult = AIUsageDetails & {
  extraction: EntryExtraction;
  model: string;
  rawOutput: unknown;
};

export type EmbeddingResult = AIUsageDetails & {
  embedding: number[];
  model: string;
};

export type ChatSource = {
  id: string;
  type: "entry" | "memory";
  content: string;
  occurredAt: string;
  similarity: number;
};

export type ChatInput = {
  question: string;
  locale: "pt-BR" | "en";
  timezone: string;
  sources: ChatSource[];
  responseDetail?: "short" | "balanced" | "detailed";
  agentStyle?: string;
};

export type ChatResult = AIUsageDetails & {
  answer: string;
  citedSourceIds: string[];
  model: string;
};

/**
 * Everything the command parser is given. Notably absent: any task, any task
 * id, any candidate list, and the operation key. The model receives the user's
 * own sentence and nothing else about their data (PRD §12.7, 2E-OWNERSHIP-005).
 */
export type TaskCommandParseInput = {
  commandText: string;
  locale: "pt-BR" | "en";
};

export type TaskCommandParseResult = AIUsageDetails & {
  proposal: TaskCommandProposal;
  model: string;
  /**
   * Carried out of the provider because `ai_usage_events` has no column for
   * either, and 2E-COMMAND-012 requires both to be recorded on the operation
   * the proposal eventually produces.
   */
  promptVersion: string;
  strategyVersion: string;
};

import type { EntryExtraction } from "./extraction-schema";
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

import type { EntryExtraction } from "./extraction-schema";

export type ExtractionInput = {
  content: string;
  locale: "pt-BR" | "en";
  timezone: string;
  currentTime: string;
  knownContext?: string;
};

export type ExtractionResult = {
  extraction: EntryExtraction;
  model: string;
  inputTokens: number;
  outputTokens: number;
  rawOutput: unknown;
};

export type EmbeddingResult = {
  embedding: number[];
  model: string;
  inputTokens: number;
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

export type ChatResult = {
  answer: string;
  citedSourceIds: string[];
  model: string;
  inputTokens: number;
  outputTokens: number;
};

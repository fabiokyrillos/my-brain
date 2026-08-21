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
  /**
   * `OD-2Q-1`, signed as option A — **one vocabulary, not two.**
   *
   * `task` is here because `generateReview` retrieves tasks and used to label
   * them `memory:`. That is not cosmetic: `resolve-sources.ts` looks a `memory`
   * up in the `memories` table, so a task uuid stored under that type resolves
   * to "unavailable" for **every** task citation while every entry citation
   * passes — a feature that ships green and silently answers none of the
   * owner's actual questions. `2Q-FOUNDATION-003` executes that failure.
   *
   * The provider is generic in this field: it interpolates it into the source
   * envelope and filters returned ids against the set it was given. Widening it
   * therefore costs no prompt change and no migration.
   */
  type: "entry" | "memory" | "task";
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

/**
 * `2J-VOICE-003`. What the provider is given to transcribe.
 *
 * Deliberately minimal. No entry id, no task, no user content beyond the audio
 * itself, and no prompt: the provider receives a recording and returns text.
 * Authorization, confirmation and the write all live outside it, exactly as
 * they do for every other method on this interface.
 */
export type TranscriptionInput = {
  /** The recording. Never persisted anywhere by this repository. */
  audio: Blob;
  /**
   * The container the browser produced -- `audio/webm` on Chromium,
   * `audio/mp4` on Safari. Carried explicitly rather than inferred, because a
   * pipeline that assumes one container fails on half the target devices.
   */
  mimeType: string;
  locale: "pt-BR" | "en";
};

export type TranscriptionResult = AIUsageDetails & {
  /** The transcript. A draft for the user to edit -- never an entry. */
  text: string;
  model: string;
};

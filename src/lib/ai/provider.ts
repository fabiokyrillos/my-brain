import type {
  ChatInput,
  ChatResult,
  EmbeddingResult,
  ExtractionInput,
  ExtractionResult,
  SuggestionPickInput,
  SuggestionPickResult,
  TaskCommandParseInput,
  TaskCommandParseResult,
  TranscriptionInput,
  TranscriptionResult,
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
  /**
   * `2J-VOICE-003`. Turns a recording into text and returns it. That is all.
   *
   * It stores nothing, interprets nothing and creates nothing: the transcript
   * is a draft the user edits and confirms, and confirmation goes through
   * `captureEntry` like any other text. Keeping this on the interface rather
   * than in a call site is what keeps the provider swappable -- and what keeps
   * the audio-discard contract a property of the caller rather than a habit of
   * one implementation.
   */
  transcribeAudio(input: TranscriptionInput): Promise<TranscriptionResult>;
  /**
   * Life Brain B.8 (ADR-163). Chooses up to three of the given candidates by
   * position. It writes no text: the caller builds every sentence from its own
   * copy, so a provider cannot put a word on the owner's screen.
   */
  pickSuggestions(input: SuggestionPickInput): Promise<SuggestionPickResult>;
}

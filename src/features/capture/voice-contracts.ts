/**
 * `2J-VOICE-014`'s constants, and the reason they are not in the action file.
 *
 * A `"use server"` module may export **only async functions** — Next.js turns
 * every export into a callable server reference, so a constant there is a
 * build-time error, and `reminders/actions.test.ts` enforces that across the
 * whole repository. The first draft of `transcribe-action.ts` exported the size
 * ceiling and the accepted MIME list alongside the action; that guard caught it.
 *
 * They live here because both the browser and the server need them: the client
 * refuses an oversized recording before uploading it, and the action refuses it
 * again on arrival. A client check is a courtesy; the server check is the
 * control. Sharing one definition is what keeps the two from disagreeing.
 */

/**
 * The ceiling, in bytes.
 *
 * Below the provider's own documented request ceiling with room for multipart
 * overhead, and at speech bitrates far more audio than the "one thought out
 * loud" this feature exists for.
 */
export const MAX_RECORDING_BYTES = 20 * 1024 * 1024;

/**
 * The containers a supported browser actually produces.
 *
 * Chromium emits `audio/webm` (Opus); Safari — including every browser on iOS —
 * emits `audio/mp4`. The list is closed rather than permissive because an
 * unvalidated MIME string reaches a provider request, and "whatever the browser
 * said" is not a validated boundary.
 *
 * NOTE: this list is what the repository *accepts*, derived from the SDK's
 * documented input formats. It is **not** a claim about what each device emits
 * in practice — gate G-2J.4b requires that measured on real hardware.
 */
export const ACCEPTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
] as const;

export const transcribeFailureCodes = [
  "unauthenticated",
  /** OD-2J-2. No usable AI credential — the one refusal with a way forward. */
  "no_credential",
  "too_large",
  "unsupported_format",
  "transcription_failed",
] as const;
export type TranscribeFailureCode = (typeof transcribeFailureCodes)[number];

export type TranscribeState =
  | { status: "idle" }
  | { status: "success"; text: string }
  /** `2J-VOICE-011`. The caller keeps its draft; this never clears it. */
  | { status: "error"; code: TranscribeFailureCode; message: string };

/** The MIME type without its codec parameters, lowercased. */
export function baseAudioType(mimeType: string): string {
  return mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function isAcceptedAudioType(mimeType: string): boolean {
  return (ACCEPTED_AUDIO_TYPES as readonly string[]).includes(baseAudioType(mimeType));
}

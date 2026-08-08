import type { Locale } from "@/lib/preferences";

/**
 * `2J-VOICE-*` copy, as a typed module rather than scattered locale ternaries
 * (`ENGINEERING_STANDARDS`, ADR-036).
 *
 * Every failure string here is written to be true when the user is holding a
 * draft they care about: none of them says or implies that anything was lost,
 * because `2J-VOICE-011` requires the draft to survive every failure and the
 * copy is the only part of that the user can see.
 */
export type TranscriptionCopy = {
  readonly recordLabel: string;
  readonly recording: string;
  readonly pause: string;
  readonly resume: string;
  readonly finish: string;
  readonly cancel: string;
  readonly transcribing: string;
  readonly retry: string;
  readonly addSegment: string;
  readonly permissionDenied: string;
  readonly permissionHelp: string;
  readonly unsupported: string;
  readonly sessionExpired: string;
  readonly unsupportedFormat: string;
  readonly tooLarge: string;
  readonly failed: string;
  readonly draftLabel: string;
  readonly draftHint: string;
  readonly discardedNotice: string;
};

export const transcriptionCopy: Record<Locale, TranscriptionCopy> = {
  "pt-BR": {
    recordLabel: "Gravar",
    recording: "Gravando",
    pause: "Pausar",
    resume: "Continuar",
    finish: "Concluir",
    cancel: "Cancelar",
    transcribing: "Transcrevendo…",
    retry: "Tentar transcrever de novo",
    addSegment: "Gravar mais um trecho",
    permissionDenied: "O microfone está bloqueado.",
    permissionHelp: "Libere o microfone nas permissões do navegador e tente de novo.",
    unsupported: "Este navegador não grava áudio. Você ainda pode escrever.",
    sessionExpired: "Sua sessão expirou. Entre novamente.",
    unsupportedFormat: "Não foi possível usar esta gravação.",
    tooLarge: "A gravação ficou longa demais. Grave um trecho mais curto.",
    // Says what survived, because that is the part the user is worried about.
    failed: "Não foi possível transcrever agora. Seu texto continua aqui.",
    draftLabel: "Rascunho",
    draftHint: "Edite à vontade. Nada é capturado até você confirmar.",
    // `2J-VOICE-013`, told to the user before they confirm.
    discardedNotice: "O áudio é descartado depois da transcrição. Só o texto é guardado.",
  },
  en: {
    recordLabel: "Record",
    recording: "Recording",
    pause: "Pause",
    resume: "Resume",
    finish: "Finish",
    cancel: "Cancel",
    transcribing: "Transcribing…",
    retry: "Try transcribing again",
    addSegment: "Record another part",
    permissionDenied: "The microphone is blocked.",
    permissionHelp: "Allow the microphone in your browser permissions and try again.",
    unsupported: "This browser cannot record audio. You can still write.",
    sessionExpired: "Your session expired. Sign in again.",
    unsupportedFormat: "That recording could not be used.",
    tooLarge: "That recording got too long. Record a shorter part.",
    failed: "Could not transcribe right now. Your text is still here.",
    draftLabel: "Draft",
    draftHint: "Edit freely. Nothing is captured until you confirm.",
    discardedNotice: "The audio is discarded after transcription. Only the text is kept.",
  },
};

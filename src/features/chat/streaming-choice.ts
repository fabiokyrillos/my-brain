import { decideAssistantRoute } from "@/features/assistant/routing";
import { AI_INPUT_BOUNDS } from "@/lib/ai-input-bounds";
import type { Locale } from "@/lib/preferences";

/**
 * Life Brain E.5 part 2 (ADR-175) — which composer turns stream.
 *
 * Only a turn the pure router already sends straight to the grounded answer
 * (`knowledge`: a plain question, or text too long to be a command). Every
 * other turn keeps the `runAssistantTurn` Server Action exactly as before:
 * memory and capture intents write nothing through chat, a command needs its
 * preview, an agenda question is answered without a model and so has nothing
 * to stream, and a sentence that is tried as a command first only reaches the
 * answer after that model call — so it goes to the action first, and ADR-182
 * has the action hand its answer back as `stream_answer` when the command path
 * declines it, which this composer then streams. Deciding this on the client is a choice of
 * transport, never of authority: the route re-validates and re-authenticates,
 * and runs the same pipeline the action does.
 */
export function shouldStreamChatTurn(text: string): boolean {
  const question = text.trim();
  if (question === "" || question.length > AI_INPUT_BOUNDS.chatQuestion) return false;
  return decideAssistantRoute(question).kind === "knowledge";
}

export type ChatStreamCopy = Readonly<{
  /** The stream ended with neither an answer nor an error, and the thread is unknown. */
  interrupted: string;
  /** The route answered with something that is not the stream. */
  unavailable: string;
}>;

const copy = {
  "pt-BR": {
    interrupted: "A conexão caiu antes da resposta. Envie de novo quando quiser.",
    unavailable: "Não foi possível responder agora. Tente de novo.",
  },
  en: {
    interrupted: "The connection dropped before the answer. Send it again whenever you like.",
    unavailable: "We could not answer right now. Try again.",
  },
} satisfies Record<Locale, ChatStreamCopy>;

export function getChatStreamCopy(locale: Locale): ChatStreamCopy {
  return copy[locale];
}

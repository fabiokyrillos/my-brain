/**
 * Life Brain E.5 part 1 (ADR-173) — a question still being answered survives a
 * reload, without a status column.
 *
 * `sendChatMessage` inserts the question into `conversation_messages` BEFORE it
 * calls the model, and the answer only after. So a thread whose last message is
 * the owner's is a turn in flight — or one that failed and wrote no answer. Age
 * tells the two apart: inside `PENDING_TURN_WINDOW_MS` the page says the
 * assistant is thinking and refreshes itself until the answer lands; past it,
 * the page says the question went unanswered, so it never spins forever.
 *
 * Pure, and holding every word, so it is tested with no database and no clock.
 */

export const PENDING_TURN_WINDOW_MS = 3 * 60_000;

export type PendingTurn =
  | Readonly<{ state: "thinking"; deadline: number }>
  | Readonly<{ state: "unanswered" }>
  | null;

export function pendingTurn(
  messages: readonly { readonly role: string; readonly created_at: string }[],
  now: Date,
): PendingTurn {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return null;
  const askedAt = Date.parse(last.created_at);
  if (Number.isNaN(askedAt)) return null;
  const deadline = askedAt + PENDING_TURN_WINDOW_MS;
  return now.getTime() < deadline ? { state: "thinking", deadline } : { state: "unanswered" };
}

export type PendingTurnCopy = Readonly<{
  thinking: (agent: string) => string;
  unanswered: string;
}>;

const copy: Readonly<Record<"pt-BR" | "en", PendingTurnCopy>> = {
  "pt-BR": {
    thinking: (agent) => `${agent} está pensando…`,
    unanswered: "Esta pergunta ficou sem resposta. Envie de novo quando quiser.",
  },
  en: {
    thinking: (agent) => `${agent} is thinking…`,
    unanswered: "This question went unanswered. Send it again whenever you like.",
  },
};

export function getPendingTurnCopy(locale: string): PendingTurnCopy {
  return locale === "en" ? copy.en : copy["pt-BR"];
}

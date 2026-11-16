"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ChatState } from "./chat-state";
import { openChatTurn, plainAnswer, runChatTurn } from "./chat-turn";

/**
 * The grounded chat turn as a Server Action — the non-streaming path, and the
 * fallback whenever the composer does not stream (Life Brain E.5 part 2,
 * ADR-175).
 *
 * The whole pipeline lives in `chat-turn.ts`, shared with the streaming route
 * handler (`app/[locale]/api/chat/route.ts`), so the two cannot diverge: the
 * same validation, authentication, gates, retrieval, ledger order, citation
 * stripping, persistence and audit. What stays here is the transport — the
 * whole answer in one provider call, then a revalidation and a redirect into
 * the thread that holds it.
 */
export async function sendChatMessage(_state: ChatState, formData: FormData): Promise<ChatState> {
  const opened = await openChatTurn(Object.fromEntries(formData));
  if (!opened.ok) return opened.state;

  const outcome = await runChatTurn(opened.turn, plainAnswer);
  if (outcome.status === "failed") return outcome.state;

  revalidatePath(`/${outcome.locale}/app/chat/${outcome.conversationId}`);
  redirect(`/${outcome.locale}/app/chat/${outcome.conversationId}`);
}

"use client";

import { useActionState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";

export type ChatState = { status: "idle" | "error"; message: string };
export type ChatAction = (state: ChatState, formData: FormData) => Promise<ChatState>;
const idleState: ChatState = { status: "idle", message: "" };

export function ChatForm({ action, conversationId, locale }: { action: ChatAction; conversationId?: string; locale: "pt-BR" | "en" }) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const pt = locale === "pt-BR";
  return (
    <form action={formAction} className="chat-form">
      <input type="hidden" name="locale" value={locale}/>
      {conversationId && <input type="hidden" name="conversationId" value={conversationId}/>} 
      <label htmlFor="chat-question" className="sr-only">{pt ? "Pergunte ao Brain" : "Ask Brain"}</label>
      <textarea id="chat-question" name="question" required maxLength={12000} disabled={pending} placeholder={pt ? "Pergunte sobre seus registros, pessoas, projetos ou pendências…" : "Ask about your entries, people, projects, or open work…"}/>
      <button type="submit" disabled={pending} aria-label={pt ? "Enviar pergunta" : "Send question"}>{pending ? <LoaderCircle className="spin" size={18}/> : <ArrowUp size={18}/>}</button>
      {state.status === "error" && <p role="alert">{state.message}</p>}
    </form>
  );
}

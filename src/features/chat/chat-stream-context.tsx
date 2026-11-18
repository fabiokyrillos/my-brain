"use client";

import { LoaderCircle } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { getAssistantCopy } from "@/features/assistant/copy";
import type { Locale } from "@/lib/preferences";

import { getPendingTurnCopy } from "./pending-turn";
import { Prose } from "./prose";
import { useChatStream, type ChatDraft } from "./use-chat-stream";

export type SharedChatStream = ReturnType<typeof useChatStream>;

const ChatStreamContext = createContext<SharedChatStream | null>(null);

/**
 * Editorial calmo — where the thread draws the outcome of a turn that was not
 * a streamed answer (a proposed memory, a command's preview, a failure).
 *
 * The composer owns that state and used to draw it under its own field, inside
 * the dock that is pinned to the bottom of the screen: a proposal pushed the
 * field to the top of the phone and sat below it. The outcome is the turn's
 * answer, so it belongs where answers are read. The thread mounts an element,
 * the composer portals into it; the state, the forms and the actions do not
 * move.
 */
const ChatOutcomeElementContext = createContext<HTMLElement | null>(null);
/** The setter the thread hands to its element as a callback ref; `null` outside a provider. */
const ChatOutcomeMountContext = createContext<((element: HTMLElement | null) => void) | null>(null);

/**
 * Life Brain E.6 (ADR-176) — one streamed turn shared by the whole Conversar
 * surface.
 *
 * The composer sits at the bottom of the screen and the thread above it, so
 * the draft of an answer being written belongs in the thread, not under the
 * field. The provider owns the stream; the composer sends through it and the
 * thread draws its draft through `ChatDraftSlot`. Without a provider the
 * composer keeps its own stream and draws the draft itself, as in ADR-175.
 */
export function ChatStreamProvider({
  children,
  conversationId,
  locale,
}: {
  children: ReactNode;
  conversationId?: string;
  locale: Locale;
}) {
  const stream = useChatStream({ locale, conversationId });
  const [element, mount] = useState<HTMLElement | null>(null);
  return (
    <ChatStreamContext.Provider value={stream}>
      <ChatOutcomeMountContext.Provider value={mount}>
        <ChatOutcomeElementContext.Provider value={element}>{children}</ChatOutcomeElementContext.Provider>
      </ChatOutcomeMountContext.Provider>
    </ChatStreamContext.Provider>
  );
}

/** The surface's stream, or `null` outside a `ChatStreamProvider`. */
export function useSharedChatStream(): SharedChatStream | null {
  return useContext(ChatStreamContext);
}

/** The thread's element for a turn's outcome, or `null` where no thread has mounted one. */
export function useChatOutcomeTarget(): HTMLElement | null {
  return useContext(ChatOutcomeElementContext);
}

/** How close to the end the owner must be for the thread to follow a growing answer. */
const FOLLOW_THRESHOLD_PX = 160;

function scrollToEnd(): void {
  window.scrollTo({ top: document.documentElement.scrollHeight });
}

/**
 * Where the thread draws the turn being streamed. Renders nothing between turns.
 *
 * ADR-176: the thread opens at its end, as a conversation does, unless the
 * address names a message (a return to a source's position, 2K-CONT); and while
 * an answer is written it follows the text, unless the owner has scrolled up.
 */
export function ChatDraftSlot({ agentName, locale }: { agentName: string; locale: Locale }) {
  const stream = useContext(ChatStreamContext);
  const mountOutcome = useContext(ChatOutcomeMountContext);
  const draft = stream?.draft ?? null;
  const length = draft === null ? -1 : draft.question.length + draft.text.length;

  useEffect(() => {
    if (window.location.hash === "") scrollToEnd();
  }, []);

  useEffect(() => {
    if (length < 0) return;
    const fromEnd = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    if (fromEnd < FOLLOW_THRESHOLD_PX + window.innerHeight / 2) scrollToEnd();
  }, [length]);

  return (
    <>
      {draft === null ? null : <StreamedDraft agentName={agentName} draft={draft} locale={locale} />}
      {/* Empty between turns, and then it takes no room (`:empty`). */}
      {mountOutcome === null ? null : <div className="chat-outcome" data-chat-outcome="" ref={mountOutcome} />}
    </>
  );
}

/**
 * Life Brain E.5 part 2 (ADR-175): the streamed turn, drawn as the thread draws
 * a turn — the question, then the answer as it is written. A draft: no time,
 * no sources, no model line, because none of that exists until the validated
 * answer is persisted, and then the thread's own message replaces this.
 *
 * `data-draft-role`, not `data-role` or the `assistant`/`user` classes, so no
 * selector that addresses persisted messages ever counts a draft.
 */
export function StreamedDraft({ agentName, draft, locale }: { agentName: string; draft: ChatDraft; locale: Locale }) {
  const copy = getAssistantCopy(locale);
  return (
    <div className="chat-draft" data-chat-draft="">
      <article className="chat-message" data-draft-role="user">
        <p className="chat-message-meta">
          <span className="chat-message-speaker">{copy.speakerYou}</span>
        </p>
        {/* Owner content, rendered as text. */}
        <Prose className="chat-message-body" text={draft.question} />
      </article>
      <article aria-busy="true" className="chat-message" data-draft-role="assistant">
        <p className="chat-message-meta">
          <span className="chat-message-speaker">{agentName}</span>
        </p>
        {draft.text === "" ? (
          <p className="chat-message-waiting" role="status">
            <LoaderCircle aria-hidden="true" className="spin" size={16} /> {getPendingTurnCopy(locale).thinking(agentName)}
          </p>
        ) : (
          // Model output, rendered as text — never markup.
          <Prose className="chat-message-body" text={draft.text} />
        )}
      </article>
    </div>
  );
}

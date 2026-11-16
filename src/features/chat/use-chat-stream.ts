"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";

import type { Locale } from "@/lib/preferences";

import { CHAT_STREAM_PATH, readChatStream } from "./stream-protocol";
import { getChatStreamCopy } from "./streaming-choice";

/** The turn being streamed: the owner's question, and the answer written so far. */
export type ChatDraft = Readonly<{ question: string; text: string }>;

/**
 * A streamed turn that ended without an answer; `echo` goes back into the
 * field. `seq` tells two equal failures apart, so the field is restored again.
 */
export type ChatStreamFailure = Readonly<{ message: string; echo: string; seq: number }>;

/**
 * Life Brain E.5 part 2 (ADR-175) — the composer's side of the streamed turn.
 *
 * It posts the question to the streaming route and keeps a DRAFT: the
 * question, and the answer's text as it arrives. The draft is never the
 * message. When the route says `done` — the validated answer is persisted —
 * the draft is cleared in the same transition as the refresh to the thread, so
 * the persisted message replaces it in one commit and the answer is never on
 * screen twice. When it says `error`, the draft is dropped and the owner's
 * text comes back to the field, as a failed Server Action turn does.
 *
 * A stream that just stops (the network dropped) is not treated as a failure
 * of the turn: the server keeps working (see `stream-route.ts`), so the
 * thread is refreshed and its own "pensando" state (ADR-173) takes over.
 */
export function useChatStream({ locale, conversationId }: { locale: Locale; conversationId?: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ChatDraft | null>(null);
  const [failure, setFailure] = useState<ChatStreamFailure | null>(null);
  const [settling, startTransition] = useTransition();
  const busy = useRef(false);
  const failures = useRef(0);
  /** Forgets a streamed failure, when the next turn goes through the action instead. */
  const dismiss = useCallback(() => setFailure(null), []);

  const land = useCallback(
    (href: string, sameThread: boolean) => {
      startTransition(() => {
        setDraft(null);
        if (sameThread) router.refresh();
        /*
          Life Brain E.6 (ADR-176): a new conversation is not "entered". The
          thread page draws the same surface, so replacing the route inside the
          transition swaps the draft for the persisted turn in one commit, and
          the back button does not return to an empty new-conversation screen.
        */
        else router.replace(href, { scroll: false });
      });
    },
    [router],
  );

  const send = useCallback(
    async (question: string) => {
      if (busy.current) return;
      busy.current = true;
      const copy = getChatStreamCopy(locale);
      const fail = (message: string) => {
        setDraft(null);
        failures.current += 1;
        setFailure({ message, echo: question, seq: failures.current });
      };
      setFailure(null);
      setDraft({ question, text: "" });
      try {
        const response = await fetch(CHAT_STREAM_PATH(locale), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question, locale, conversationId: conversationId ?? "" }),
          credentials: "same-origin",
        });
        // The account gate redirects, as it does for the action.
        if (response.redirected) {
          window.location.assign(response.url);
          return;
        }
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !type.includes("application/x-ndjson") || response.body === null) {
          let message = copy.unavailable;
          try {
            const body: unknown = await response.json();
            if (typeof body === "object" && body !== null && typeof (body as { message?: unknown }).message === "string") {
              message = (body as { message: string }).message;
            }
          } catch {
            // Not JSON; the generic sentence stands.
          }
          fail(message);
          return;
        }

        let thread: string | null = conversationId ?? null;
        let ended = false;
        await readChatStream(response.body, (event) => {
          if (ended) return;
          if (event.type === "conversation") {
            thread = event.conversationId;
            /*
              ADR-176: the address becomes the conversation's as soon as it
              exists, without a navigation (Next integrates the native history
              API). A reload mid-answer then lands on the thread, where the
              "pensando" state of ADR-173 takes over.
            */
            if (conversationId === undefined && typeof window !== "undefined") {
              window.history.replaceState(null, "", `/${locale}/app/chat/${event.conversationId}`);
            }
          } else if (event.type === "delta") {
            setDraft((current) => (current === null ? current : { ...current, text: current.text + event.text }));
          } else if (event.type === "done") {
            ended = true;
            land(event.href, event.conversationId === conversationId);
          } else {
            ended = true;
            fail(event.message);
          }
        });
        if (!ended) {
          if (thread !== null) land(`/${locale}/app/chat/${thread}`, thread === conversationId);
          else fail(copy.interrupted);
        }
      } catch {
        fail(copy.interrupted);
      } finally {
        busy.current = false;
      }
    },
    [conversationId, land, locale],
  );

  return { draft, failure, streaming: draft !== null || settling, send, dismiss };
}

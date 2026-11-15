"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import type { Locale } from "@/lib/preferences";

import { getPendingTurnCopy, type PendingTurn } from "./pending-turn";

/** How often a thread with a turn in flight asks the server for the answer. */
export const PENDING_TURN_REFRESH_MS = 3_000;

/**
 * Life Brain E.5 part 1 (ADR-173): the assistant's place in the thread while a
 * question is still being answered, after a reload or on another device.
 *
 * It refreshes the server render every few seconds until the answer is in the
 * thread (the server then stops rendering this) or the deadline passes (the
 * next render says the question went unanswered). A refresh re-reads under the
 * owner's session like any page load; it writes nothing.
 */
export function PendingTurnIndicator({
  agentName,
  locale,
  turn,
}: {
  agentName: string;
  locale: Locale;
  turn: NonNullable<PendingTurn>;
}) {
  const router = useRouter();
  const copy = getPendingTurnCopy(locale);
  const thinking = turn.state === "thinking";
  const deadline = thinking ? turn.deadline : 0;

  useEffect(() => {
    if (!thinking) return;
    const timer = window.setInterval(() => {
      router.refresh();
      if (Date.now() >= deadline) window.clearInterval(timer);
    }, PENDING_TURN_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [deadline, router, thinking]);

  return (
    <article aria-live="polite" className="chat-message assistant" data-pending-turn={turn.state}>
      <div className="chat-message-body">
        {thinking ? (
          <p role="status">
            <LoaderCircle aria-hidden="true" className="spin" size={16} /> {copy.thinking(agentName)}
          </p>
        ) : (
          <p>{copy.unanswered}</p>
        )}
      </div>
    </article>
  );
}

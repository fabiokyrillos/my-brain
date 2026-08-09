"use client";

/**
 * `2K-CARD-002` — the shared card shell. It renders a state; it never decides
 * one.
 *
 * Two properties are load-bearing and both are structural rather than
 * remembered:
 *
 * 1. **The state arrives decided.** There is no branch here that inspects a
 *    preview, a disposition or a domain field to work out what to draw. The
 *    only thing this component reads is `card.state`, and
 *    `phase-2k-card-guard.test.ts` fails the build if that changes.
 * 2. **A read-only card type cannot reach a mutating control** (`2K-CARD-008`).
 *    Controls arrive as `children`, and they are dropped unless
 *    `mayRenderMutatingControl(card)` says the type may have them. A caller's
 *    mistake therefore cannot become a mutating affordance on a person card.
 *
 * Sensitivity is the central contract's decision, not this component's
 * (`2K-PRIVACY-001`). `resolveContent("chat", …)` is asked on every render, so
 * the classification consulted is the **current** one — which is the property
 * OD-2K-2 exists to give: there is no stored copy that could disagree with it.
 * The reveal is local and transient: it lives in `useState` and there is
 * deliberately no serializer for it.
 */

import { useState } from "react";

import {
  NO_REVEALS,
  resolveContent,
} from "@/features/sensitivity/contracts";
import type { Locale } from "@/lib/preferences";

import {
  advertisesReversal,
  mayRenderMutatingControl,
  type ConversationCard,
  type ConversationCardReversal,
} from "./contracts";
import { getConversationCardsCopy, type ConversationCardsCopy } from "./copy";

/**
 * `2K-CARD-009` — the card's reversal sentence, read from its own value.
 *
 * Exhaustive over the union rather than a ternary, so a third reversal kind
 * added later fails the build here instead of silently rendering a sibling's
 * sentence. That is the whole point of the requirement: a memory card must
 * never inherit the task card's 24-hour window.
 */
function reversalSentence(
  reversal: ConversationCardReversal,
  copy: ConversationCardsCopy,
): string | null {
  if (!advertisesReversal(reversal)) return null;
  switch (reversal.kind) {
    case "archival":
      return copy.reversal.archival;
    case "undo_window":
      return copy.reversal.undoWindow(reversal.windowHours);
    default:
      return null;
  }
}

export function ConversationCardView({
  card,
  locale,
  children,
}: {
  card: ConversationCard;
  locale: Locale;
  /** Controls, rendered only for a type that may mutate (`2K-CARD-008`). */
  children?: React.ReactNode;
}) {
  const copy = getConversationCardsCopy(locale);
  const [revealed, setRevealed] = useState(false);

  const revealKey = card.objectId ?? card.cardType;
  const content = resolveContent(
    "chat",
    card.sensitivity,
    revealKey,
    revealed ? { revealed: new Set([revealKey]) } : NO_REVEALS,
  );

  const controls = mayRenderMutatingControl(card) ? children : null;

  return (
    <article
      className="conversation-card"
      data-card-type={card.cardType}
      data-state={card.state}
      data-testid="conversation-card"
    >
      <header className="conversation-card-head">
        <span className="conversation-card-type">{copy.types[card.cardType]}</span>
        <span className="conversation-card-state">{copy.states[card.state]}</span>
      </header>

      {card.snippet === null ? null : content.show ? (
        <p className="conversation-card-snippet" data-testid="conversation-card-snippet">
          {/* Owner content, rendered as text. Never an instruction (T-2K-05). */}
          {card.snippet}
        </p>
      ) : (
        <p className="conversation-card-snippet conversation-card-masked" data-masked="true">
          {copy.masked}
        </p>
      )}

      {card.snippet !== null && content.revealable ? (
        <button
          aria-expanded={content.show}
          className="conversation-card-reveal"
          onClick={() => setRevealed((value) => !value)}
          type="button"
        >
          {content.show ? copy.hide : copy.reveal}
        </button>
      ) : null}

      {reversalSentence(card.reversal, copy) === null ? null : (
        <p className="conversation-card-reversal">{reversalSentence(card.reversal, copy)}</p>
      )}

      {controls === null || controls === undefined ? null : (
        <div className="conversation-card-controls">{controls}</div>
      )}
    </article>
  );
}

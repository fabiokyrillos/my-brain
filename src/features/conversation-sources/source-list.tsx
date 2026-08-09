"use client";

/**
 * `2K-SRC-001` … `2K-SRC-006` — what the answer says about where it came from.
 *
 * ## The four things this renders that the product never said
 *
 * 1. **Insufficiency**, visually distinct from an evidenced answer. Before this
 *    slice the block was drawn only when citations existed, so "I found nothing
 *    of yours" and "here is what I found" looked identical.
 * 2. **Support kind** per source — the user's own record, or something the
 *    product holds as true. Decided server-side; the model cannot widen it.
 * 3. **Freshness**, from `occurred_at`. It was retrieved, handed to the model,
 *    and thrown away before it ever reached a `.tsx`.
 * 4. **Reach** — records and memories, and nothing else. The limit is stated
 *    rather than hidden.
 *
 * ## It renders cards; it does not decide them
 *
 * Every source is a `ConversationCard` already resolved by
 * `resolve-sources.ts`, carrying the **current** classification. Masking,
 * revealing and the `unavailable` shape all belong to `ConversationCardView`,
 * so this component holds no sensitivity logic of its own — which is what
 * `sensitivity-boundary.test.ts` requires and what stops a second answer to
 * "what may be shown" appearing here.
 */

import Link from "next/link";

import { ConversationCardView } from "@/features/conversation-cards/card";
import {
  CONTINUITY_HANDLE_VERSION,
  serializeContinuityHandle,
} from "@/features/conversation-cards/continuity";
import { getConversationCardsCopy } from "@/features/conversation-cards/copy";
import { ConversationAnswerShown } from "@/features/product-analytics/interaction-events";
import type { Locale } from "@/lib/preferences";

import type { ParsedCitations } from "./contracts";
import { getConversationSourcesCopy } from "./copy";
import { ExplanationPanel } from "./explanation-panel";
import type { ResolvedSource } from "./resolve-sources";

function Freshness({ locale, occurredAt }: { locale: Locale; occurredAt: string | null }) {
  const copy = getConversationSourcesCopy(locale);
  if (occurredAt === null) {
    // Absent, never fabricated. A made-up date on a source is the preview's
    // first lie wearing a different costume.
    return <span className="conversation-source-freshness">{copy.freshnessUnknown}</span>;
  }
  return (
    <span className="conversation-source-freshness">
      {copy.freshnessLabel}{" "}
      <time dateTime={occurredAt}>
        {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(occurredAt))}
      </time>
    </span>
  );
}

/**
 * `2K-CONT-002` — the handle the "open" link carries.
 *
 * Built here rather than passed in, from the two identifiers the message
 * already knows. It stays a closed set: conversation, message, object type,
 * object. Nothing about the answer, the sources or the user's authority
 * travels with it, and `continuity.ts`'s strict schema is what enforces that
 * rather than this call site remembering.
 */
function openHref(
  card: ResolvedSource["card"],
  continuity: { conversationId: string; messageId: string } | null,
): string | null {
  if (card.href === null) return null;
  if (continuity === null || card.objectId === null) return card.href;
  if (card.cardType !== "entry" && card.cardType !== "memory") return card.href;
  const handle = serializeContinuityHandle({
    v: CONTINUITY_HANDLE_VERSION,
    c: continuity.conversationId,
    m: continuity.messageId,
    t: card.cardType,
    o: card.objectId,
  });
  return `${card.href}?from=${handle}`;
}

export function SourceList({
  citations,
  continuity = null,
  locale,
  messageId = null,
  sources,
}: {
  citations: ParsedCitations;
  /** Present in a thread, absent wherever a source list has no position. */
  continuity?: { conversationId: string; messageId: string } | null;
  locale: Locale;
  /** Keys the answer event, so one answer counts once rather than once per scroll. */
  messageId?: string | null;
  sources: readonly ResolvedSource[];
}) {
  const copy = getConversationSourcesCopy(locale);
  const cardCopy = getConversationCardsCopy(locale);

  /*
   * `2K-SRC-005`. Read from what **retrieval** found, never from
   * `sources.length` — an empty list is produced both by "nothing was
   * retrieved" and by "sources were retrieved and the model cited none",
   * and those are different facts (measured in slice 2K.0).
   */
  const insufficient = citations.evidence === "no_qualifying_evidence";

  // An old row recorded neither. It gets the honest "I do not know" rather than
  // either claim, and nothing else — no reach, no insufficiency.
  if (citations.legacy && sources.length === 0) {
    return (
      <div className="conversation-sources" data-evidence="unknown">
        <p className="conversation-sources-legacy">{copy.legacyUnknown}</p>
      </div>
    );
  }

  return (
    <div
      className="conversation-sources"
      data-evidence={insufficient ? "insufficient" : citations.legacy ? "unknown" : "evidenced"}
    >
      {insufficient ? (
        <p className="conversation-sources-insufficient">{copy.insufficient}</p>
      ) : (
        <>
          <strong className="conversation-sources-title">{copy.title}</strong>
          <ul className="conversation-sources-list">
            {sources.map((source) => (
              <li key={source.key}>
                <span className="conversation-source-support">
                  {copy.supportKinds[source.support]}
                </span>
                <ConversationCardView card={source.card} locale={locale} />
                <Freshness locale={locale} occurredAt={source.occurredAt} />
                {openHref(source.card, continuity) === null ? null : (
                  <Link className="conversation-card-open" href={openHref(source.card, continuity)!}>
                    {cardCopy.open}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        `2K-SRC-006`. Shown on both branches — an answer with nothing to cite
        still owes the user the shape of where it looked, and that is the
        sentence that turns "I found nothing" from a shrug into information.
        Withheld only for a legacy row, which never recorded a reach.
      */}
      {citations.legacy ? null : <p className="conversation-sources-reach">{copy.reach}</p>}

      {/*
        `2K-EXPL-001`. Last, closed, and drawn only when there is something to
        say — the answer is above it and stays readable whether or not this is
        ever opened.
      */}
      <ExplanationPanel explanation={citations.explanation} locale={locale} />

      {/*
        `2K-METRICS-002`. The evidence state and whether anything was excluded —
        a closed enum and a boolean. No question, no answer, no excerpt.
      */}
      {messageId === null ? null : (
        <ConversationAnswerShown
          evidence={citations.evidence}
          explained={citations.explanation !== null}
          locale={locale === "en" ? "en" : "pt-BR"}
          messageId={messageId}
        />
      )}
    </div>
  );
}

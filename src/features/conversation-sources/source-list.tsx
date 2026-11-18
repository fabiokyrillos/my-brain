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
 * ## One quiet line, closed (Editorial calmo, ADR-180; chips since ADR-177)
 *
 * Under the answer the block is a row of closed disclosures: how many sources
 * the answer stands on, and where it looked. Opened, each source is a row —
 * its type and its date, "Registro · 5 nov." — that opens the source. The
 * answer above already says what the source says; the row says where it came
 * from and takes the owner there. The support kind is read to assistive
 * technology inside the row's name, and an inference is drawn differently.
 * (`conversation-source-chip` is still the row's class name: three lanes
 * address it.) The honest "I found nothing" is never behind a disclosure.
 *
 * A chip carries **no content** — no snippet — so this component still holds no
 * sensitivity logic of its own (`sensitivity-boundary.test.ts`): there is
 * nothing in it to mask. The `unavailable` shape is the card's own state,
 * decided by `resolve-sources.ts`, and an unavailable source has no link.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import {
  CONTINUITY_HANDLE_VERSION,
  serializeContinuityHandle,
} from "@/features/conversation-cards/continuity";
import { getConversationCardsCopy } from "@/features/conversation-cards/copy";
import { ConversationAnswerShown } from "@/features/product-analytics/interaction-events";
import type { Locale } from "@/lib/preferences";

import { reachScope, type ParsedCitations } from "./contracts";
import { formatInstant } from "@/lib/time/instant-format";
import { getConversationSourcesCopy } from "./copy";
import { ExplanationPanel } from "./explanation-panel";
import type { ResolvedSource } from "./resolve-sources";

function Freshness({ locale, occurredAt, timeZone }: { locale: Locale; occurredAt: string | null; timeZone: string }) {
  const copy = getConversationSourcesCopy(locale);
  if (occurredAt === null) {
    // Absent, never fabricated. A made-up date on a source is the preview's
    // first lie wearing a different costume.
    return <span className="conversation-source-freshness"> · {copy.freshnessUnknown}</span>;
  }
  return (
    <span className="conversation-source-freshness">
      {" · "}
      <span className="sr-only">{copy.freshnessLabel} </span>
      <time dateTime={occurredAt}>
        {formatInstant(occurredAt, "day", locale, timeZone)}
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
  children,
  citations,
  continuity = null,
  locale,
  messageId = null,
  sources,
  timeZone,
}: {
  /** Bookkeeping the host files behind "where I looked" — never content. */
  children?: ReactNode;
  citations: ParsedCitations;
  /** Present in a thread, absent wherever a source list has no position. */
  continuity?: { conversationId: string; messageId: string } | null;
  locale: Locale;
  /** Keys the answer event, so one answer counts once rather than once per scroll. */
  messageId?: string | null;
  sources: readonly ResolvedSource[];
  /** The owner's zone (`LDC-SEARCH-001`). A cited source must not be dated
   *  differently from the page it cites. */
  timeZone: string;
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
  // Life Brain B.1/B.2. Which pair of sentences describes where this answer
  // looked, from its own envelope — one per era of reach, so an older answer
  // keeps the sentence that was true for it.
  const scope = reachScope(citations.reach);
  const where = {
    knowledge: { reach: copy.reach, insufficient: copy.insufficient },
    knowledge_wide: { reach: copy.wideReach, insufficient: copy.wideInsufficient },
    agenda: { reach: copy.agendaReach, insufficient: copy.agendaInsufficient },
  }[scope];

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
        <p className="conversation-sources-insufficient">{where.insufficient}</p>
      ) : sources.length === 0 ? null : (
        /*
          Editorial calmo: one quiet line under the answer, closed. It says how
          many sources the answer stands on; opened, each is a row that leads to
          its record. They were a stack of chips, drawn open under every answer.
        */
        <details className="conversation-sources-used">
          <summary>
            <span className="conversation-sources-title sr-only">{copy.title}: </span>
            {copy.sourcesSummary(sources.length)}
          </summary>
          <ul className="conversation-sources-list">
            {sources.map((source) => {
              const href = openHref(source.card, continuity);
              const unavailable = source.card.state === "unavailable";
              const label = (
                <>
                  <span className="conversation-source-support sr-only">{copy.supportKinds[source.support]}: </span>
                  <span className="conversation-source-type">
                    {cardCopy.types[source.card.cardType]}
                    {unavailable ? ` · ${cardCopy.states.unavailable}` : null}
                  </span>
                  {unavailable ? null : (
                    <Freshness locale={locale} occurredAt={source.occurredAt} timeZone={timeZone} />
                  )}
                </>
              );
              return (
                <li data-support={source.support} key={source.key}>
                  {href === null || unavailable ? (
                    <span className="conversation-source-chip" data-unavailable={unavailable ? "" : undefined}>
                      {label}
                    </span>
                  ) : (
                    <Link className="conversation-source-chip" href={href}>
                      {label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/*
        `2K-SRC-006`. Present on both branches — an answer with nothing to cite
        still owes the user the shape of where it looked, and that is the
        sentence that turns "I found nothing" from a shrug into information.
        Withheld only for a legacy row, which never recorded a reach.

        Editorial calmo: it is the same sentence under every answer, so it sits
        behind its own closed line ("Onde procurei") instead of being drawn
        each time. `children` is what else the thread files there — the model
        that answered.
      */}
      {citations.legacy ? null : (
        <details className="conversation-sources-where">
          <summary>{copy.reachSummary}</summary>
          <p className="conversation-sources-reach">{where.reach}</p>
          {children}
        </details>
      )}

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

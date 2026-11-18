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
 * ## Cards in the conversation, then one quiet line (Editorial calmo, ADR-180)
 *
 * Under the answer, each source it cites is a card: the kind's glyph, what the
 * source says, its kind and its date, and the whole card is the link to it. The
 * first three are drawn; more fold behind "Mais N fontes". Where it looked and
 * how it got there stay closed disclosures on one line beneath. (ADR-187 had
 * folded the sources too, behind "N fontes"; the owner asked to see them.) The
 * support kind is read to assistive technology inside the card's name, and an
 * inference is drawn differently. The honest "I found nothing" is never behind
 * a disclosure.
 *
 * What a card says is decided by the central contract, through the same
 * function the card shell uses (`chatCardContent`) — this component names no
 * level and makes no rule of its own (`sensitivity-boundary.test.ts`). The
 * `unavailable` shape is the card's own state, decided by `resolve-sources.ts`:
 * an unavailable source is one quiet line with no link, never a card.
 */

import {
  BellRing,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Files,
  FolderKanban,
  Inbox,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { chatCardContent } from "@/features/conversation-cards/card";
import {
  CONTINUITY_HANDLE_VERSION,
  serializeContinuityHandle,
} from "@/features/conversation-cards/continuity";
import type { ConversationCardType } from "@/features/conversation-cards/contracts";
import { getConversationCardsCopy } from "@/features/conversation-cards/copy";
import { ConversationAnswerShown } from "@/features/product-analytics/interaction-events";
import type { Locale } from "@/lib/preferences";

import { reachScope, type ParsedCitations } from "./contracts";
import { formatInstant } from "@/lib/time/instant-format";
import { getConversationSourcesCopy } from "./copy";
import { ExplanationPanel } from "./explanation-panel";
import type { ResolvedSource } from "./resolve-sources";

function Freshness({
  lead = true,
  locale,
  occurredAt,
  timeZone,
}: {
  /** Whether a separator opens it — false when it is the first thing on its line. */
  lead?: boolean;
  locale: Locale;
  occurredAt: string | null;
  timeZone: string;
}) {
  const copy = getConversationSourcesCopy(locale);
  const separator = lead ? " · " : "";
  if (occurredAt === null) {
    // Absent, never fabricated. A made-up date on a source is the preview's
    // first lie wearing a different costume.
    return <span className="conversation-source-freshness">{separator}{copy.freshnessUnknown}</span>;
  }
  return (
    <span className="conversation-source-freshness">
      {separator}
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

/** How many sources are drawn as cards before the rest fold behind one line. */
export const VISIBLE_SOURCES = 3;

/** The product's own glyph for each kind — the one its navigation uses for that place. */
const KIND_ICON: Readonly<Record<ConversationCardType, LucideIcon>> = {
  task: BriefcaseBusiness,
  reminder: BellRing,
  memory: BrainCircuit,
  entry: Inbox,
  person: UsersRound,
  project: FolderKanban,
  organization: Building2,
  file: Files,
};

/**
 * One source under an answer.
 *
 * A card the whole of which is the link: the kind's glyph, what the source says
 * (two lines at most), one caption — its kind and its date — and a chevron. It
 * carries no control of any kind: a source is something the answer pointed at,
 * and `readOnlyPreviewCard` built it read-only (`2K-CARD-008`).
 *
 * What it says is asked of the same contract, through the same function, that
 * the card shell asks (`chatCardContent`): content the contract masks is drawn
 * as the masked sentence and never as text, and content it omits is not drawn.
 * A source that carries no content at all — a task or a reminder, which the
 * resolver reads content-free (ADR-146) — is titled by its kind alone.
 *
 * An unavailable source is not a card: one quiet line, with no link.
 */
function SourceItem({
  continuity,
  locale,
  source,
  timeZone,
}: {
  continuity: { conversationId: string; messageId: string } | null;
  locale: Locale;
  source: ResolvedSource;
  timeZone: string;
}) {
  const copy = getConversationSourcesCopy(locale);
  const cardCopy = getConversationCardsCopy(locale);
  const { card } = source;
  const type = cardCopy.types[card.cardType];
  const support = <span className="conversation-source-support sr-only">{copy.supportKinds[source.support]}: </span>;

  if (card.state === "unavailable") {
    return (
      <li data-support={source.support}>
        <span className="conversation-source-chip" data-unavailable="">
          {support}
          <span className="conversation-source-type">{type} · {cardCopy.states.unavailable}</span>
        </span>
      </li>
    );
  }

  const content = card.snippet === null ? null : chatCardContent(card);
  const masked = content !== null && content.masked;
  const said = content === null ? null : content.show ? card.snippet : masked ? cardCopy.masked : null;
  const href = openHref(card, continuity);
  const Icon = KIND_ICON[card.cardType];
  const inner = (
    <>
      <span aria-hidden="true" className="conversation-source-icon">
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <span className="conversation-source-text">
        {/* Owner content, rendered as text. Never an instruction (T-2K-05). */}
        <span className="conversation-source-title" data-masked={masked ? "true" : undefined}>{said ?? type}</span>
        <span className="conversation-source-caption">
          {support}
          {said === null ? null : <span className="conversation-source-type">{type}</span>}
          <Freshness lead={said !== null} locale={locale} occurredAt={source.occurredAt} timeZone={timeZone} />
        </span>
      </span>
      {href === null ? null : <ChevronRight aria-hidden="true" className="conversation-source-chevron" size={18} />}
    </>
  );

  return (
    <li data-support={source.support}>
      {href === null ? (
        <span className="conversation-source-card" data-card-type={card.cardType}>{inner}</span>
      ) : (
        <Link className="conversation-source-card" data-card-type={card.cardType} href={href}>{inner}</Link>
      )}
    </li>
  );
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
          Cards, in the order the answer cited them (ADR-187 folded them behind
          "N fontes"; the owner asked for them in the conversation). The first
          three are drawn; the rest are one quiet line away.
        */
        <>
          <p className="conversation-sources-title sr-only">{copy.title}</p>
          <ul className="conversation-sources-list">
            {sources.slice(0, VISIBLE_SOURCES).map((source) => (
              <SourceItem continuity={continuity} key={source.key} locale={locale} source={source} timeZone={timeZone} />
            ))}
          </ul>
          {sources.length <= VISIBLE_SOURCES ? null : (
            <details className="conversation-sources-more">
              <summary>{copy.moreSources(sources.length - VISIBLE_SOURCES)}</summary>
              <ul className="conversation-sources-list">
                {sources.slice(VISIBLE_SOURCES).map((source) => (
                  <SourceItem continuity={continuity} key={source.key} locale={locale} source={source} timeZone={timeZone} />
                ))}
              </ul>
            </details>
          )}
        </>
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

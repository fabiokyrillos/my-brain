import { AgentSpeaker } from "@/features/chat/agent-speaker";
import { isFailedTurn } from "@/features/chat/failed-turn";
import { pendingTurn } from "@/features/chat/pending-turn";
import { PendingTurnIndicator } from "@/features/chat/pending-turn-indicator";
import { ChatFrame } from "@/features/chat/chat-frame";
import { ChatDraftSlot, ChatStreamProvider } from "@/features/chat/chat-stream-context";
import { Prose } from "@/features/chat/prose";
import { loadConversationMenu } from "@/features/chat/conversation-menu";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { runAssistantTurn } from "@/features/assistant/actions";
import { Composer } from "@/features/capture/composer";
import { transcribeRecording } from "@/features/capture/transcribe-action";
import { getAssistantCopy } from "@/features/assistant/copy";
import { messageAnchorId } from "@/features/conversation-cards/continuity";
import { resumeConversationCard } from "@/features/conversation-cards/resume";
import { ResumedCard } from "@/features/conversation-cards/resumed-card";
import { parseCitations, type ParsedCitations } from "@/features/conversation-sources/contracts";
import { resolveSources, type ResolvedSource } from "@/features/conversation-sources/resolve-sources";
import { SourceList } from "@/features/conversation-sources/source-list";
import { createProposedMemory, undoProposedMemory } from "@/features/memories/actions";
import { getAgentName } from "@/features/profile/agent-identity";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { formatInstant } from "@/lib/time/instant-format";
import { isLocale, type Locale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

/**
 * `2K-CONT-001` / `2K-CONT-002` — one message, with a position a link can name.
 *
 * The thread used to render as a single expression, and that was not a style
 * complaint: G-1's fix needs somewhere to **return to**, and a position needs a
 * per-message identity. So each message is an `<article>` whose `id` comes from
 * `messageAnchorId` — derived, never inlined, so the anchor the thread paints
 * and the anchor a handle resolves cannot drift apart.
 *
 * That is the whole decomposition. A thread redesign belongs to no authorized
 * phase.
 */
function ThreadMessage({
  agentName,
  citations,
  content,
  conversationId,
  createdAt,
  failed,
  locale,
  messageId,
  model,
  role,
  sources,
  timeZone,
}: {
  agentName: string;
  citations: ParsedCitations;
  content: string;
  conversationId: string;
  /**
   * When the turn happened.
   *
   * The query has selected `created_at` since the thread existed and nothing
   * ever rendered it — a transcript with no times, in which a conversation
   * resumed three weeks later reads as one continuous exchange. Stamped in the
   * owner's zone from the same accessor the citations use, so a message and the
   * source it cites can never be dated differently.
   */
  createdAt: string;
  /** ADR-194: this assistant row is a failure mark, not an answer. */
  failed: boolean;
  locale: Locale;
  messageId: string;
  model: string | null;
  role: string;
  /** Already re-read against the current classification (`2K-PRIVACY-004`). */
  sources: readonly ResolvedSource[];
  /** The owner's zone (`LDC-SEARCH-001`), so a citation and its page agree. */
  timeZone: string;
}) {
  /*
   * `2K-SRC-005`. The block is drawn whenever the message **recorded** anything
   * about its sources — including when what it recorded is "I found nothing".
   * The old condition was `citations.length > 0`, which is exactly why an
   * answer with no personal evidence was indistinguishable from an evidenced
   * one: the honest case rendered nothing at all.
   */
  const hasSourceBlock = role !== "user"
    && (sources.length > 0 || citations.evidence !== "unknown" || citations.legacy);

  /*
    Two sides, as in every conversation with an assistant (Editorial calmo,
    ADR-180; the owner's direction of 18 November 2026).

    The owner's question sits on the right: a quiet filled shape in the UI face,
    the hour it was asked under it. The answer sits on the left with no shape
    around it: the Brain's name beside the product's mark, then prose in the
    reading face at the reading measure, then the sources it cites as cards, and
    one quiet closed line — where it looked, how it got there.

    The speaker and the instant stay in the document for assistive technology
    on every turn, in that order, ahead of what was said: the question's hour is
    the one instant drawn, so it is a line of its own after the question, and
    the day is said once above the first turn of that day (`ThreadDay`).

    The model that answered is bookkeeping: it is filed behind "Onde procurei"
    with the reach sentence, and an answer that recorded no sources at all
    shows none.

    `data-role` carries the styling. The `chat-message assistant`/`user` classes
    are kept because three Playwright lanes address messages by them.
  */
  const copy = getAssistantCopy(locale);
  const asked = role === "user";
  const stamp = <time dateTime={createdAt}>{formatInstant(createdAt, "time", locale, timeZone)}</time>;
  return (
    <article className={`chat-message ${role}`} data-role={role} data-turn={failed ? "failed" : undefined} id={messageAnchorId(messageId)}>
      <p className="chat-message-meta">
        {asked ? <span className="chat-message-speaker">{copy.speakerYou}</span> : <AgentSpeaker agentName={agentName} />}
        {asked ? null : stamp}
      </p>
      {/* Owner content and model output, rendered as text — never markup. */}
      <Prose className="chat-message-body" text={content} />
      {asked ? <p className="chat-message-when">{stamp}</p> : null}
      {hasSourceBlock && (
        <div className="message-sources">
          <SourceList
            citations={citations}
            continuity={{ conversationId, messageId }}
            locale={locale}
            messageId={messageId}
            sources={sources}
            timeZone={timeZone}
          >
            {model ? (
              <p className="chat-message-model">
                {copy.modelDetail}: {model}
              </p>
            ) : null}
          </SourceList>
        </div>
      )}
    </article>
  );
}

/**
 * The day, said once.
 *
 * Every turn used to carry its full date and hour on a line of its own. A
 * conversation happens on a day: the day is a heading over a hairline above the
 * first turn of it, so a thread resumed three weeks later still says so, and a
 * thread held in one sitting says it once.
 */
function ThreadDay({ createdAt, label }: { createdAt: string; label: string }) {
  return (
    <p className="chat-day">
      <time dateTime={createdAt}>{label}</time>
    </p>
  );
}

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; conversationId: string }>;
  searchParams: Promise<{ resume?: string | string[] }>;
}) {
  const { locale: candidate, conversationId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const { supabase, user } = await requireUser(locale);
  const agentName = await getAgentName();
  // `LDC-SEARCH-001`. A cited source must not be dated differently from the page
  // it cites.
  const timeZone = await getOwnerTimeZone();
  const [conversationResult, messageResult] = await Promise.all([
    supabase.from("conversations").select("id,title").eq("id", conversationId).maybeSingle(),
    supabase
      .from("conversation_messages")
      .select("id,role,content,citations,model,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const conversation = requireSupabaseData(conversationResult, "load conversation");
  const messages = (requireSupabaseData(messageResult, "load conversation messages") ?? []).reverse();
  if (!conversation) notFound();

  /*
   * `2K-CONT-004` … `2K-CONT-007`. The user came back.
   *
   * Everything is re-derived server-side with a **new** clock, and a fresh
   * confirmation is always required — there is no branch here that reuses an
   * earlier one, and `ContinuityResumption`'s type makes that unreachable
   * rather than merely unwritten. Nothing is auto-reapplied, because nothing
   * here can write.
   */
  const raw = (await searchParams).resume;
  const resumed = await resumeConversationCard(Array.isArray(raw) ? raw[0] : raw, locale);

  /*
   * `2K-PRIVACY-004`, `2K-SRC-004`. Every cited source is **re-read now**,
   * against its current classification, because OD-2K-2 removed the stored
   * excerpt — there is no copy left to render.
   *
   * Resolved per message and awaited together, so the thread costs one round
   * of two batched queries per message rather than one query per source. The
   * plan's stopping condition is an unbounded per-source fan-out; the fix is
   * more batching, never the stored copy.
   */
  const turn = pendingTurn(messages, new Date());
  // The owner's local day of each turn, as the heading says it; a turn whose
  // day differs from the one before it opens a new day in the thread.
  const days = messages.map((message) => formatInstant(message.created_at, "day", locale, timeZone));
  const parsed = messages.map((message) => parseCitations(message.citations));
  const [resolved, menu] = await Promise.all([
    Promise.all(parsed.map((citations) => resolveSources(supabase, user.id, citations, locale))),
    // Life Brain E.6 (ADR-176): the other conversations, behind the menu.
    loadConversationMenu(supabase, locale, timeZone),
  ]);

  return (
    <ChatStreamProvider conversationId={conversationId} locale={locale}>
      {/*
        Life Brain E.6 (ADR-176): the thread is the same surface as a new
        conversation — the menu (☰) holds the others, the title is the
        conversation's, and the field stays at the bottom.
      */}
      <ChatFrame activeId={conversationId} groups={menu.groups} limited={menu.limited} locale={locale} title={conversation.title}>
      {/* `data-thread`: a conversation starts at the top, under the header, however short it is. */}
      <div className="chat-stage" data-thread="">
      {resumed === null ? null : <ResumedCard locale={locale} resumption={resumed} />}

      <div className="message-stream">
        {messages.map((message, index) => (
          <Fragment key={message.id}>
            {days[index] === days[index - 1] ? null : <ThreadDay createdAt={message.created_at} label={days[index]!} />}
            <ThreadMessage
              agentName={agentName}
              timeZone={timeZone}
              citations={parsed[index]!}
              content={message.content}
              conversationId={conversationId}
              createdAt={message.created_at}
              failed={message.role === "assistant" && isFailedTurn(message.citations)}
              locale={locale}
              messageId={message.id}
              model={message.model}
              role={message.role}
              sources={resolved[index]!}
            />
          </Fragment>
        ))}
        {/*
          Life Brain E.5 part 1 (ADR-173): a question still being answered —
          the last message is the owner's — keeps its "pensando" across a
          reload and refreshes until the answer lands; an old one says it went
          unanswered.
        */}
        {turn ? <PendingTurnIndicator agentName={agentName} locale={locale} turn={turn} /> : null}
        <ChatDraftSlot agentName={agentName} locale={locale} />
      </div>
      </div>

      <div className="chat-dock">
      <Composer
        mode="chat"
        transcribeAction={transcribeRecording}
        action={runAssistantTurn}
        agentName={agentName}
        conversationId={conversationId}
        locale={locale}
        memoryAction={createProposedMemory}
        memoryUndoAction={undoProposedMemory}
      />
      </div>
      </ChatFrame>
    </ChatStreamProvider>
  );
}

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { runAssistantTurn } from "@/features/assistant/actions";
import { AssistantComposer } from "@/features/assistant/assistant-composer";
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
  locale: Locale;
  messageId: string;
  model: string | null;
  role: string;
  /** Already re-read against the current classification (`2K-PRIVACY-004`). */
  sources: readonly ResolvedSource[];
  /** The owner's zone (`LDC-SEARCH-001`), so a citation and its page agree. */
  timeZone: string;
}) {
  const pt = locale === "pt-BR";
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
    A transcript, not a chat log.

    The stream used to render as opposing bubbles — 82% width, the user's turn
    right-aligned on a solid dark fill — which is the generic assistant layout
    the direction exists to not be. Both halves are **sentences somebody wrote**,
    so both are set in the reading face in one column, and what separates them is
    a mono speaker line and a rule, exactly as an interview is set on paper.

    `data-role` carries it. The `chat-message assistant`/`user` classes are kept
    because three Playwright lanes address messages by them, and renaming them
    to suit a stylesheet would have broken those for no gain.
  */
  return (
    <article className={`chat-message ${role}`} data-role={role} id={messageAnchorId(messageId)}>
      <p className="chat-message-meta">
        <span className="chat-message-speaker">{role === "user" ? (pt ? "Você" : "You") : agentName}</span>
        <time dateTime={createdAt}>{formatInstant(createdAt, "dayAndTime", locale, timeZone)}</time>
      </p>
      <p className="chat-message-body">{content}</p>
      {hasSourceBlock && (
        <div className="message-sources">
          <SourceList
            citations={citations}
            continuity={{ conversationId, messageId }}
            locale={locale}
            messageId={messageId}
            sources={sources}
            timeZone={timeZone}
          />
        </div>
      )}
      {model && <small>{model}</small>}
    </article>
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
  const pt = locale === "pt-BR";
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
  const parsed = messages.map((message) => parseCitations(message.citations));
  const resolved = await Promise.all(
    parsed.map((citations) => resolveSources(supabase, user.id, citations, locale)),
  );

  return (
    <div className="content-page chat-thread">
      <Link href={`/${locale}/app/chat`} className="back-link">
        <ArrowLeft size={16} />{pt ? "Conversas" : "Conversations"}
      </Link>
      <header>
        <p className="eyebrow">{pt ? "BRAIN COM FONTES" : "BRAIN WITH SOURCES"}</p>
        <h1>{conversation.title}</h1>
      </header>

      {resumed === null ? null : <ResumedCard locale={locale} resumption={resumed} />}

      <div className="message-stream">
        {messages.map((message, index) => (
          <ThreadMessage
            agentName={agentName}
            timeZone={timeZone}
            citations={parsed[index]!}
            content={message.content}
            conversationId={conversationId}
            createdAt={message.created_at}
            key={message.id}
            locale={locale}
            messageId={message.id}
            model={message.model}
            role={message.role}
            sources={resolved[index]!}
          />
        ))}
      </div>

      <AssistantComposer
        action={runAssistantTurn}
        agentName={agentName}
        conversationId={conversationId}
        locale={locale}
        memoryAction={createProposedMemory}
        memoryUndoAction={undoProposedMemory}
      />
    </div>
  );
}

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
  locale,
  messageId,
  model,
  role,
  sources,
}: {
  agentName: string;
  citations: ParsedCitations;
  content: string;
  conversationId: string;
  locale: Locale;
  messageId: string;
  model: string | null;
  role: string;
  /** Already re-read against the current classification (`2K-PRIVACY-004`). */
  sources: readonly ResolvedSource[];
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

  return (
    <article className={`chat-message ${role}`} id={messageAnchorId(messageId)}>
      <span>{role === "user" ? (pt ? "Você" : "You") : agentName}</span>
      <p>{content}</p>
      {hasSourceBlock && (
        <div className="message-sources">
          <SourceList
            citations={citations}
            continuity={{ conversationId, messageId }}
            locale={locale}
            messageId={messageId}
            sources={sources}
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
            citations={parsed[index]!}
            content={message.content}
            conversationId={conversationId}
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

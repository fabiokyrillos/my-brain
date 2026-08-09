import { ArrowLeft, BookOpenText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { runAssistantTurn } from "@/features/assistant/actions";
import { AssistantComposer } from "@/features/assistant/assistant-composer";
import {
  CONTINUITY_HANDLE_VERSION,
  messageAnchorId,
  serializeContinuityHandle,
  type ContinuityObjectType,
} from "@/features/conversation-cards/continuity";
import { resumeConversationCard } from "@/features/conversation-cards/resume";
import { ResumedCard } from "@/features/conversation-cards/resumed-card";
import { createProposedMemory, undoProposedMemory } from "@/features/memories/actions";
import { getAgentName } from "@/features/profile/agent-identity";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale, type Locale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

type Citation = { id: string; type: "entry" | "memory"; sourceId: string; excerpt: string };

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
}: {
  agentName: string;
  citations: readonly Citation[];
  content: string;
  conversationId: string;
  locale: Locale;
  messageId: string;
  model: string | null;
  role: string;
}) {
  const pt = locale === "pt-BR";
  return (
    <article className={`chat-message ${role}`} id={messageAnchorId(messageId)}>
      <span>{role === "user" ? (pt ? "Você" : "You") : agentName}</span>
      <p>{content}</p>
      {citations.length > 0 && (
        <div className="message-sources">
          <strong><BookOpenText size={14} />{pt ? "Fontes internas" : "Internal sources"}</strong>
          {citations.map((citation) => {
            /*
             * `2K-CONT-002`. The link records exactly enough to come back:
             * which conversation, which message, which object. Nothing else —
             * the handle is a closed set of identifiers and is **incapable** of
             * authorizing anything (ADR-100, R17). Replaying this URL produces
             * a re-derivation prompt, never a write.
             */
            const handle = serializeContinuityHandle({
              v: CONTINUITY_HANDLE_VERSION,
              c: conversationId,
              m: messageId,
              t: citation.type as ContinuityObjectType,
              o: citation.sourceId,
            });
            const base = citation.type === "entry"
              ? `/${locale}/app/inbox/${citation.sourceId}`
              : `/${locale}/app/memories/${citation.sourceId}`;
            return (
              <Link href={`${base}?from=${handle}`} key={citation.id}>
                {citation.excerpt}
              </Link>
            );
          })}
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
  const { supabase } = await requireUser(locale);
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
        {messages.map((message) => (
          <ThreadMessage
            agentName={agentName}
            citations={Array.isArray(message.citations) ? (message.citations as Citation[]) : []}
            content={message.content}
            conversationId={conversationId}
            key={message.id}
            locale={locale}
            messageId={message.id}
            model={message.model}
            role={message.role}
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

import { MessageCircleMore } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationalQuestions } from "@/features/agent/conversational-questions";
import { runAssistantTurn } from "@/features/assistant/actions";
import { AssistantComposer } from "@/features/assistant/assistant-composer";
import { getAssistantCopy } from "@/features/assistant/copy";
import { createProposedMemory, undoProposedMemory } from "@/features/memories/actions";
import { getAgentName } from "@/features/profile/agent-identity";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { pageRange, paginateRows, parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

export default async function ChatPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const copy = getAssistantCopy(locale);
  const agentName = await getAgentName();
  const page = parsePage((await searchParams).page);
  const { from, to } = pageRange(page);
  const { supabase, user } = await requireUser(locale);
  const result = await supabase.from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load conversations") ?? []);

  return (
    <div className="content-page chat-page">
      <header className="list-header">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title(agentName)}</h1>
          <p>{copy.description}</p>
        </div>
      </header>

      {/*
        The composer is the first interactive element on the page, which is the
        whole of UX-07's fix: one field, no mode to choose, and nothing above it
        competing for the first thing the user types into.
      */}
      <AssistantComposer
        action={runAssistantTurn}
        agentName={agentName}
        locale={locale}
        memoryAction={createProposedMemory}
        memoryUndoAction={undoProposedMemory}
      />

      {/*
        Proactive questions stay — they are the agent's own open loops and
        deleting them would lose a lifecycle. They move *below* the composer and
        read as secondary so their answer fields no longer compete with it. The
        surfacing decision, the resolution contract and the undo are untouched;
        the rest of the lifecycle is Slice G.
      */}
      <ConversationalQuestions supabase={supabase} userId={user.id} locale={locale} mode="proactive" />

      {items.length ? (
        <section className="conversation-list">
          <h2>{pt ? "Conversas recentes" : "Recent conversations"}</h2>
          {items.map((conversation) => (
            <Link href={`/${locale}/app/chat/${conversation.id}`} className="list-row" key={conversation.id}>
              <div className="list-row-main">
                <strong>{conversation.title}</strong>
                <p>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(conversation.updated_at))}</p>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <div className="chat-empty">
          <MessageCircleMore size={32} />
          <strong>{pt ? "Seu histórico responde junto" : "Your history answers with you"}</strong>
          <p>{pt ? "Experimente: “O que combinei com Marina?”" : "Try: “What did I agree with Marina?”"}</p>
        </div>
      )}

      <PaginationLinks locale={locale} path="chat" page={page} hasNext={hasNext} />
    </div>
  );
}

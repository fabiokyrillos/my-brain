import { MessageCircleMore } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationalQuestions } from "@/features/agent/conversational-questions";
import { runAssistantTurn } from "@/features/assistant/actions";
import { AssistantComposer } from "@/features/assistant/assistant-composer";
import { getAssistantCopy } from "@/features/assistant/copy";
import { deriveConversationSuggestions } from "@/features/conversation-cards/suggestions";
import { SuggestionRow } from "@/features/conversation-cards/suggestion-row";
import { createProposedMemory, undoProposedMemory } from "@/features/memories/actions";
import { getAgentName } from "@/features/profile/agent-identity";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { formatInstant } from "@/lib/time/instant-format";
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
  // `LDC-CONTEXT-001`. One accessor, cached per request: this page and every
  // other contextual surface stamp instants from the same source.
  const timeZone = await getOwnerTimeZone();
  /*
   * `2K-SUGG-001/002`. Two small reads under RLS, alongside the one this page
   * already made, and **no model call** — T-2K-10 is that "contextual
   * suggestions" invites a billed provider call per page load, spending the
   * user's own credential on something they did not ask for.
   *
   * Ordered by `updated_at` so the input is already deterministic, and bounded
   * at the cap: three suggestions can never need more than three of each.
   */
  const [result, peopleResult, projectsResult] = await Promise.all([
    supabase.from("conversations").select("id,title,updated_at").order("updated_at", { ascending: false }).range(from, to),
    supabase.from("people").select("id,name").order("updated_at", { ascending: false }).limit(3),
    supabase.from("projects").select("id,name").order("updated_at", { ascending: false }).limit(3),
  ]);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load conversations") ?? []);
  const suggestions = deriveConversationSuggestions({
    people: requireSupabaseData(peopleResult, "load suggestion people") ?? [],
    projects: requireSupabaseData(projectsResult, "load suggestion projects") ?? [],
  });

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
                <p>{formatInstant(conversation.updated_at, "dayAndTime", locale, timeZone)}</p>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <div className="chat-empty">
          <MessageCircleMore size={32} />
          <strong>{pt ? "Seu histórico responde junto" : "Your history answers with you"}</strong>
          {/*
            `2K-SUGG-003`. The hard-coded example that used to live here named a
            person the user may not have, taught exactly one question shape, and
            never changed. It is replaced by at most three suggestions derived
            from the user's own people and projects — and by **nothing at all**
            when they have neither, which is OD-2K-4's "show none rather than
            invent one".
          */}
          <SuggestionRow locale={locale} suggestions={suggestions} />
        </div>
      )}

      <PaginationLinks locale={locale} path="chat" page={page} hasNext={hasNext} />
    </div>
  );
}

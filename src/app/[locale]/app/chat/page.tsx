import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationalQuestions } from "@/features/agent/conversational-questions";
import { UniversalStateView } from "@/features/experience/universal-state";
import { BrainLensTabs } from "@/features/library/brain-lenses";
import { runAssistantTurn } from "@/features/assistant/actions";
import { AssistantComposer } from "@/features/assistant/assistant-composer";
import { getAssistantCopy } from "@/features/assistant/copy";
import { askAboutCopy, parseAskAbout } from "@/features/conversation-cards/ask-about";
import { AskingAboutBanner } from "@/features/conversation-cards/asking-about-banner";
import { resolveAskAboutSubject } from "@/features/conversation-cards/resolve-ask-about";
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

export default async function ChatPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ page?: string | string[]; about?: string | string[] }> }) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const copy = getAssistantCopy(locale);
  const agentName = await getAgentName();
  const query = await searchParams;
  const page = parsePage(query.page);
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

  /*
   * `2P-CHAT-005`. The owner arrived from a contextual page.
   *
   * The handle is parsed and the name is read here, under this caller's own
   * client and therefore under RLS — a subject somebody else owns resolves to
   * null and renders exactly like a subject that does not exist, so the link is
   * not an existence oracle. `resolveAskAboutSubject` never throws: the banner
   * is additive context and must not be able to fail the page whose composer
   * still works without it.
   */
  const askingAbout = await resolveAskAboutSubject(supabase, parseAskAbout(query.about));

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
      {/*
        `2P-CHAT-005`. Above the composer, because it is the context the next
        thing typed belongs to — and it carries the way back, so arriving here
        from a person's page is a step rather than a departure.
      */}
      {askingAbout === null ? null : (
        <AskingAboutBanner locale={locale} resolved={askingAbout} />
      )}

      <AssistantComposer
        action={runAssistantTurn}
        agentName={agentName}
        initialText={askingAbout === null ? undefined : askAboutCopy(locale).seed(askingAbout.name)}
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

      {/*
        Conversar is Brain's Conversas lens, and the strip says so — **below**
        the composer, not above it.

        UX-07's fix is that the composer is the first interactive element with
        nothing above it competing for the first thing the user types into. A
        strip of nine links across the top would be nine interactive elements
        above it, which is the exact shape that requirement removed. So the lens
        strip sits here, where it still makes the space continuous — you can see
        that you are inside Brain and step to any other lens — without taking the
        first focus stop away from the field this page exists for.
      */}
      <BrainLensTabs active="chat" locale={locale} />

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
        <UniversalStateView
          className="chat-empty"
          description={pt ? "Pergunte sobre o que você já registrou." : "Ask about what you have already recorded."}
          locale={locale}
          state="empty"
          title={pt ? "Seu histórico responde junto" : "Your history answers with you"}
        >
          {/*
            `2K-SUGG-003`. The hard-coded example that used to live here named a
            person the user may not have, taught exactly one question shape, and
            never changed. It is replaced by at most three suggestions derived
            from the user's own people and projects — and by **nothing at all**
            when they have neither, which is OD-2K-4's "show none rather than
            invent one".
          */}
          <SuggestionRow locale={locale} suggestions={suggestions} />
        </UniversalStateView>
      )}

      <PaginationLinks locale={locale} path="chat" page={page} hasNext={hasNext} />
    </div>
  );
}

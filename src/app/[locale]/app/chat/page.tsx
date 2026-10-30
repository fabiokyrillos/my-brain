import { notFound } from "next/navigation";
import { ButtonLink, EmptyState, List, ListItem, PageHeader } from "@/components/ui";
import { ConversationalQuestions } from "@/features/agent/conversational-questions";
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

/** The longest question a starter chip may seed; anything else is ignored. */
const MAX_SEED_LENGTH = 240;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[]; about?: string | string[]; q?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getAssistantCopy(locale);
  const agentName = await getAgentName();
  const query = await searchParams;
  const page = parsePage(query.page);
  const { from, to } = pageRange(page);
  const { supabase, user } = await requireUser(locale);
  // `LDC-CONTEXT-001`. One accessor, cached per request: this page and every
  // other contextual surface stamp instants from the same source.
  const timeZone = await getOwnerTimeZone();

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
    `2P-CHAT-005` — arriving from a person's or project's page seeds the
    composer with that subject. Life Brain A.1 adds a second seed: a starter
    question chosen on this page (`?q=`). Both are text the user will see in
    the field before anything is sent; neither is an instruction to the model.
  */
  const askingAbout = await resolveAskAboutSubject(supabase, parseAskAbout(query.about));
  const seededQuestion = firstParam(query.q)?.trim().slice(0, MAX_SEED_LENGTH) || undefined;
  const initialText = askingAbout === null
    ? seededQuestion
    : askAboutCopy(locale).seed(askingAbout.name);

  return (
    <div className="content-page chat-page">
      {/*
        Life Brain A.1 (ADR-145 Decision 4). The page used to open with an
        eyebrow, a display title and a lead — a third of an iPhone screen before
        the field. Now: one compact header, then the composer, which stays the
        first interactive element (UX-07).
      */}
      <PageHeader description={copy.description} size="compact" title={copy.title(agentName)} />

      {askingAbout === null ? null : (
        <AskingAboutBanner locale={locale} resolved={askingAbout} />
      )}

      <AssistantComposer
        action={runAssistantTurn}
        agentName={agentName}
        initialText={initialText}
        locale={locale}
        memoryAction={createProposedMemory}
        memoryUndoAction={undoProposedMemory}
      />

      {items.length === 0 ? (
        <EmptyState
          description={copy.emptyDescription}
          size="compact"
          title={copy.emptyTitle(agentName)}
          action={
            <div className="chat-starters" role="group" aria-label={copy.startersLabel}>
              {copy.starters.map((question) => (
                <ButtonLink
                  href={`/${locale}/app/chat?q=${encodeURIComponent(question)}`}
                  key={question}
                  size="sm"
                  variant="secondary"
                >
                  {question}
                </ButtonLink>
              ))}
            </div>
          }
        />
      ) : null}

      {/*
        Proactive questions stay — they are the agent's own open loops and
        deleting them would lose a lifecycle. They sit below the composer and
        read as secondary so their answer fields do not compete with it.
      */}
      <ConversationalQuestions supabase={supabase} userId={user.id} locale={locale} mode="proactive" />

      {/*
        `2K-SUGG-003`. At most three suggestions derived from the user's own
        people and projects — and nothing at all when they have neither.
      */}
      {items.length === 0 ? <SuggestionRow locale={locale} suggestions={suggestions} /> : null}

      {/*
        Conversar is Brain's Conversas lens, and the strip says so — below the
        composer, so the first focus stop stays on the field (UX-07).
      */}
      <BrainLensTabs active="chat" locale={locale} />

      {items.length ? (
        <section className="conversation-list" aria-labelledby="chat-recent-title">
          <h2 id="chat-recent-title">{copy.recentTitle}</h2>
          <List>
            {items.map((conversation) => (
              <ListItem
                href={`/${locale}/app/chat/${conversation.id}`}
                key={conversation.id}
                meta={formatInstant(conversation.updated_at, "dayAndTime", locale, timeZone)}
                title={conversation.title}
              />
            ))}
          </List>
        </section>
      ) : null}

      <PaginationLinks locale={locale} path="chat" page={page} hasNext={hasNext} />
    </div>
  );
}

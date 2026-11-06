import { notFound } from "next/navigation";
import { EmptyState, List, ListItem, PageHeader } from "@/components/ui";
import { ConversationalQuestions } from "@/features/agent/conversational-questions";
import { runAssistantTurn } from "@/features/assistant/actions";
import { Composer } from "@/features/capture/composer";
import { ComposerSeedProvider, MAX_SEED_LENGTH } from "@/features/capture/composer-seed";
import { transcribeRecording } from "@/features/capture/transcribe-action";
import { getAssistantCopy } from "@/features/assistant/copy";
import { askAboutCopy, parseAskAbout } from "@/features/conversation-cards/ask-about";
import { AskingAboutBanner } from "@/features/conversation-cards/asking-about-banner";
import { getConversationCardsCopy } from "@/features/conversation-cards/copy";
import { resolveAskAboutSubject } from "@/features/conversation-cards/resolve-ask-about";
import { SeedChip } from "@/features/conversation-cards/seed-chip";
import { loadSuggestionInputs } from "@/features/conversation-cards/suggestion-sources";
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
  const chipCopy = getConversationCardsCopy(locale).suggestions;
  const agentName = await getAgentName();
  const query = await searchParams;
  const page = parsePage(query.page);
  const { from, to } = pageRange(page);
  const { supabase, user } = await requireUser(locale);
  // `LDC-CONTEXT-001`. One accessor, cached per request: this page and every
  // other contextual surface stamp instants from the same source.
  const timeZone = await getOwnerTimeZone();

  const result = await supabase
    .from("conversations")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .range(from, to);
  const { items, hasNext } = paginateRows(requireSupabaseData(result, "load conversations") ?? []);

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

  /*
    Life Brain B.7 (T7). The suggestions are read **only when they will be
    drawn**, which is the empty conversation surface — the same condition
    `2K-SUGG-003` shipped with. An owner who already has conversations pays for
    none of these reads, which is why they can afford to be six.

    A scoped conversation hands its subject down: the owner found "Perguntando
    sobre Família" offering "Quando fui ao médico pela última vez?", and a
    suggestion that ignores the scope the banner announces is worse than no
    suggestion at all.
  */
  const suggestions = items.length === 0
    ? deriveConversationSuggestions(await loadSuggestionInputs(supabase, {
      now: new Date(),
      scope: askingAbout === null ? null : askingAbout.subject,
      timeZone,
    }))
    : [];

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

      {/*
        Life Brain B.7. Everything that can put a question **in** the field is
        inside this provider, which is the whole mechanism: the composer
        registers its field, a chip calls the filler, and nothing between them
        submits. The owner's rule, in his words: "é preencher, não enviar."
      */}
      <ComposerSeedProvider>
        <Composer
          mode="chat"
          transcribeAction={transcribeRecording}
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
              /*
                Defect 3 of 5 November: in a scoped conversation these four
                generic life questions were exactly the chips the owner quoted
                as having nothing to do with "Família". The banner above already
                says what the conversation is about, and the field is already
                seeded with it, so the generic starters stand down.
              */
              askingAbout !== null ? undefined : (
                <div className="chat-starters" role="group" aria-label={copy.startersLabel}>
                  {copy.starters.map((question) => (
                    <SeedChip
                      fillLabel={chipCopy.fill(question)}
                      /*
                        The path with no JavaScript, and the behaviour this
                        replaced: a full navigation that re-rendered the page to
                        put four words in a field. Kept only as the degraded
                        route, never as the one a hydrated page takes.
                      */
                      href={`/${locale}/app/chat?q=${encodeURIComponent(question)}`}
                      key={question}
                      question={question}
                    />
                  ))}
                </div>
              )
            }
          />
        ) : null}

        {/*
          `2K-SUGG-003`, extended by B.7. At most three suggestions derived from
          the owner's own people, projects, dates and open loops — and nothing at
          all when none is honestly appropriate.
        */}
        <SuggestionRow locale={locale} suggestions={suggestions} />
      </ComposerSeedProvider>

      {/*
        Proactive questions stay — they are the agent's own open loops and
        deleting them would lose a lifecycle. They sit below the composer and
        read as secondary so their answer fields do not compete with it.
      */}
      <ConversationalQuestions supabase={supabase} userId={user.id} locale={locale} mode="proactive" />

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

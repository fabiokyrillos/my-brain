import { notFound } from "next/navigation";
import { ConversationalQuestions } from "@/features/agent/conversational-questions";
import { runAssistantTurn } from "@/features/assistant/actions";
import { Composer } from "@/features/capture/composer";
import { ComposerSeedProvider, MAX_SEED_LENGTH } from "@/features/capture/composer-seed";
import { transcribeRecording } from "@/features/capture/transcribe-action";
import { getAssistantCopy } from "@/features/assistant/copy";
import { ChatFrame } from "@/features/chat/chat-frame";
import { ChatDraftSlot, ChatStreamProvider } from "@/features/chat/chat-stream-context";
import { loadConversationMenu } from "@/features/chat/conversation-menu";
import { getChatSurfaceCopy } from "@/features/chat/surface-copy";
import { askAboutCopy, parseAskAbout } from "@/features/conversation-cards/ask-about";
import { AskingAboutBanner } from "@/features/conversation-cards/asking-about-banner";
import { getConversationCardsCopy } from "@/features/conversation-cards/copy";
import { resolveAskAboutSubject } from "@/features/conversation-cards/resolve-ask-about";
import { SeedChip } from "@/features/conversation-cards/seed-chip";
import { readTodaysPicks } from "@/features/conversation-cards/model-picks";
import { SuggestionPickTrigger } from "@/features/conversation-cards/suggestion-pick-trigger";
import { loadSuggestionInputs } from "@/features/conversation-cards/suggestion-sources";
import {
  deriveConversationSuggestions,
  suggestionCandidates,
  suggestionsFromPicks,
  type ConversationSuggestion,
} from "@/features/conversation-cards/suggestions";
import { SuggestionRow } from "@/features/conversation-cards/suggestion-row";
import { formatLocalDate, isSupportedTimeZone, localDateOf } from "@/lib/time/local-day";
import { createProposedMemory, undoProposedMemory } from "@/features/memories/actions";
import { getAgentName } from "@/features/profile/agent-identity";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnerTimeZone } from "@/features/profile/owner-timezone";
import { isLocale } from "@/lib/preferences";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Life Brain E.6 (ADR-176) — a new conversation, the whole screen.
 *
 * The owner's reference is ChatGPT: the screen is the conversation, the field
 * sits at the bottom, the suggestions sit above it, and the other
 * conversations are behind the menu (☰) rather than listed here. Asking a
 * plain question streams the answer into this same screen, and the address
 * becomes the conversation's without the owner "entering" anything
 * (`use-chat-stream.ts`).
 */
export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ about?: string | string[]; q?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getAssistantCopy(locale);
  const surface = getChatSurfaceCopy(locale);
  const chipCopy = getConversationCardsCopy(locale).suggestions;
  const agentName = await getAgentName();
  const query = await searchParams;
  const { supabase, user } = await requireUser(locale);
  // `LDC-CONTEXT-001`. One accessor, cached per request: this page and every
  // other contextual surface stamp instants from the same source.
  const timeZone = await getOwnerTimeZone();
  const menu = await loadConversationMenu(supabase, locale, timeZone);

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
    Life Brain B.7 (T7), changed by E.6 (ADR-176). The suggestions are read on
    every new conversation now, not only while the owner has none: this screen
    is where every conversation starts, and the owner asked for the
    suggestions to stay on it. The reads are the derivation's own, owner-scoped
    and model-free; the model pick is still at most one call a day (B.8).

    A scoped conversation hands its subject down: the owner found "Perguntando
    sobre Família" offering "Quando fui ao médico pela última vez?", and a
    suggestion that ignores the scope the banner announces is worse than no
    suggestion at all.
  */
  let suggestions: readonly ConversationSuggestion[] = [];
  let suggestionSource: "derived" | "model" = "derived";
  let pickPending = false;
  const now = new Date();
  const inputs = await loadSuggestionInputs(supabase, {
    now,
    scope: askingAbout === null ? null : askingAbout.subject,
    timeZone,
  });
  suggestions = deriveConversationSuggestions(inputs);
  /*
    Life Brain B.8 (ADR-163). Today's model pick, when there is one, replaces
    the derived three; it is only ever `{category, id}` pairs resolved against
    today's own candidates, so the sentences are still ours. A scoped
    conversation keeps the derivation: its one subject leaves nothing to pick.
    When today has no pick yet, the trigger below asks for one after render,
    and this visit shows the derivation.
  */
  if (askingAbout === null && isSupportedTimeZone(timeZone)) {
    const picks = await readTodaysPicks(supabase, formatLocalDate(localDateOf(now, timeZone)));
    const chosen = picks ? suggestionsFromPicks(picks, suggestionCandidates(inputs)) : [];
    if (chosen.length > 0) {
      suggestions = chosen;
      suggestionSource = "model";
    }
    // `undefined` is an unreadable cache: no trigger, because nothing could be stored.
    pickPending = picks === null;
  }

  return (
    <ChatStreamProvider locale={locale}>
      <ChatFrame activeId={null} groups={menu.groups} limited={menu.limited} locale={locale} title={agentName}>
        {/*
          Life Brain B.7. Everything that can put a question **in** the field is
          inside this provider, which is the whole mechanism: the composer
          registers its field, a chip calls the filler, and nothing between them
          submits. The owner's rule, in his words: "é preencher, não enviar."
        */}
        <ComposerSeedProvider>
          <div className="chat-stage">
            {/* Hidden by CSS once a turn is being streamed into this screen. */}
            <div className="chat-intro">
              <div className="chat-hello">
                <h2>{surface.hello}</h2>
                <p>{surface.helloDescription(agentName)}</p>
              </div>

              {askingAbout === null ? null : (
                <AskingAboutBanner locale={locale} resolved={askingAbout} />
              )}

              {/*
                Proactive questions stay — they are the agent's own open loops and
                deleting them would lose a lifecycle. Here they are one line that
                leads to where they are answered.
              */}
              <ConversationalQuestions compact supabase={supabase} userId={user.id} locale={locale} mode="proactive" />

              {/*
                `2K-SUGG-003`, extended by B.7. At most three suggestions derived from
                the owner's own people, projects, dates and open loops — and nothing at
                all when none is honestly appropriate.
              */}
              <SuggestionRow locale={locale} source={suggestionSource} suggestions={suggestions} />
              {pickPending ? <SuggestionPickTrigger locale={locale} /> : null}

              {/*
                When the owner's records offer nothing to suggest, the four life
                questions do. In a scoped conversation they stand down (defect 3
                of 5 November): the banner already says what it is about, and
                the field is already seeded with it.
              */}
              {suggestions.length > 0 || askingAbout !== null ? null : (
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
              )}
            </div>

            <div className="message-stream">
              <ChatDraftSlot agentName={agentName} locale={locale} />
            </div>
          </div>

          <div className="chat-dock">
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
          </div>
        </ComposerSeedProvider>
      </ChatFrame>
    </ChatStreamProvider>
  );
}

import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getByokCopy } from "@/features/byok/copy";
import { admitRateLimitedOperation } from "@/features/rate-limits/server";
import { gateMessageKey, openAiGate } from "@/lib/byok/gate";
import { getAIProvider, type AIProvider, type ChatInput, type ChatSource } from "@/lib/ai";
import { chatAnswerSchema } from "@/lib/ai/chat-schema";
import { CHAT_HISTORY_TURNS } from "@/lib/ai/knowledge-prompt";
import { BilledAnswerStreamFailure } from "@/lib/ai/answer-stream";
import type { ChatTurn, StreamedChatAnswer } from "@/lib/ai/types";
import type { AIUsageDetails } from "@/lib/ai/usage-details";
import { defaultAgentPreferences, locales, resolveLocale, type Locale } from "@/lib/preferences";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { recordAIUsage } from "@/lib/ai/usage";
import { requireSupabaseData, requireSupabaseSuccess } from "@/lib/supabase/result";
import { recordErrorEvent, type ErrorOperation, type ErrorSurface } from "@/lib/observability/error-sink";
import { chatFailureMessage, classifyChatFailure, withChatFailureReference } from "./diagnostics";
import { needsAskForChatPrompt } from "@/features/sensitivity/contracts";
import { admitsSource, readSensitiveAsk } from "./sensitive-admission";
import { classifyKnowledgeSources, FAIL_CLOSED, sourceKey, type ClassificationClient } from "./source-classification";
import {
  buildCitationsEnvelope,
  CHAT_REACH,
  supportKindForSource,
} from "@/features/conversation-sources/contracts";
import { buildAnswerExplanation } from "@/features/conversation-sources/explanation";
import { isMemoryInForce } from "@/features/memories/lifecycle";
import { detectAgendaQuestion, type AgendaSpan } from "@/features/assistant/agenda-intent";
import { loadAgendaAnswer } from "@/features/assistant/agenda-answer";
import type { ChatState } from "./chat-state";
import { loadStructuredSources, type StructuredSourceClient } from "./structured-sources";
import { retrieveKnowledge, type KnowledgeRpcClient } from "./knowledge-retrieval";
import { byRecency, readTemporalQuestion, temporalWindowFor } from "./temporal-window";
import { isSupportedTimeZone, localDateOf } from "@/lib/time/local-day";
import { AI_INPUT_BOUNDS } from "@/lib/ai-input-bounds";

/**
 * Life Brain E.5 part 2 (ADR-175) — ONE grounded-chat pipeline, two callers.
 *
 * Everything `sendChatMessage` used to do inline lives here now, unchanged in
 * order: validation, authentication, the account gate, the conversation, the
 * question row, the agenda route, the BYOK gate, rate admission, the embedding
 * and its ledger row, retrieval, sensitive admission, structured sources, the
 * model call and its ledger row, citation stripping, persistence and audit.
 *
 * The one thing a caller chooses is HOW the model is asked — the
 * `AnswerGenerator`. The Server Action asks for the whole answer at once
 * (`plainAnswer`); the streaming route handler asks for it streamed and
 * forwards the `answer` string's characters as they arrive. Both return the
 * same thing — the bill and the complete, unvalidated output — and from there
 * the order is the same for both: record usage, validate with
 * `chatAnswerSchema`, strip citation ids that were not provided, persist.
 *
 * It is a plain server module, not a `"use server"` one, on purpose: every
 * async export of a `"use server"` module is a callable endpoint, and this one
 * takes a function argument no client should be able to supply.
 */

export const chatInputSchema = z.object({
  question: z.string().trim().min(1).max(AI_INPUT_BOUNDS.chatQuestion),
  locale: z.enum(locales),
  conversationId: z.union([z.string().uuid(), z.literal("")]).optional(),
});

type ChatCopy = {
  invalidQuestion: string;
  sessionExpired: string;
  conversationUnavailable: string;
  conversationNotFound: string;
  conversationNotStarted: string;
  questionNotSaved: string;
  /**
   * Life Brain B.1 (`LB-B-008`). What the answer says when retrieval found
   * nothing and the conversation has no earlier turn to lean on — written here,
   * not by a model, because the model's own instruction for that case is
   * "say that plainly", and a fixed sentence says it for free. It points at the
   * one composer route that would make the next answer different.
   */
  noEvidenceAnswer: string;
  /**
   * `answerUnavailable` is gone (`2P-CHAT-002`).
   *
   * It was one sentence for every fault inside the provider block — credential,
   * quota, retrieval, provider and timeout all reached the owner as *"could not
   * answer right now"*. `diagnostics.ts` replaces it with one sentence per
   * class, each carrying the correlation id of the row the failure wrote, and
   * removing the key is what stops a future caller from reaching for the
   * flattened version again.
   */
};

// Canonical localization mechanism (ADR-036): one typed copy record per
// feature, `satisfies Record<Locale, …>` so a missing key or a missing locale
// is a compile error. Before this, every message below was Portuguese-only and
// reached English users verbatim.
const chatCopy = {
  "pt-BR": {
    invalidQuestion: "Escreva uma pergunta válida.",
    sessionExpired: "Sua sessão expirou.",
    conversationUnavailable: "Não foi possível abrir a conversa.",
    conversationNotFound: "Conversa não encontrada.",
    conversationNotStarted: "Não foi possível iniciar a conversa.",
    questionNotSaved: "Não foi possível salvar sua pergunta.",
    noEvidenceAnswer:
      "Não encontrei nada seu sobre isso nos seus registros, memórias, tarefas ou lembretes. Se ainda não registrou, escreva \"registre que…\" e eu guardo.",
  },
  en: {
    invalidQuestion: "Write a valid question.",
    sessionExpired: "Your session expired.",
    conversationUnavailable: "We could not open this conversation.",
    conversationNotFound: "Conversation not found.",
    conversationNotStarted: "We could not start the conversation.",
    questionNotSaved: "We could not save your question.",
    noEvidenceAnswer:
      "I found nothing of yours about this in your records, memories, tasks or reminders. If you have not recorded it yet, write \"note that…\" and I will keep it.",
  },
} satisfies Record<Locale, ChatCopy>;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type KnowledgeRow = {
  source_type: "entry" | "memory";
  source_id: string;
  content: string;
  similarity: number;
  occurred_at: string;
};

/**
 * How the model is asked. Returns the bill and the complete output,
 * unvalidated — the pipeline records the first before it trusts the second.
 */
export type AnswerGenerator = (provider: AIProvider, input: ChatInput) => Promise<StreamedChatAnswer>;

/** The Server Action's generator: the whole answer in one call, as before ADR-175. */
export const plainAnswer: AnswerGenerator = async (provider, input) => {
  const { answer, citedSourceIds, model, ...usage } = await provider.answerFromKnowledge(input);
  return { ...usage, model, output: { answer, citedSourceIds } };
};

/** A validated, authenticated turn, ready to run. */
export type OpenedChatTurn = Readonly<{
  supabase: SupabaseServerClient;
  userId: string;
  question: string;
  locale: Locale;
  conversationId: string | undefined;
}>;

export type OpenChatTurnResult =
  | Readonly<{ ok: true; turn: OpenedChatTurn }>
  | Readonly<{ ok: false; reason: "invalid" | "unauthenticated"; state: ChatState }>;

export type ChatTurnOutcome =
  | Readonly<{ status: "answered"; conversationId: string; locale: Locale }>
  | Readonly<{ status: "failed"; state: ChatState; conversationId: string | null }>;

/**
 * Validation, authentication and the account gate — what both callers must
 * settle before anything is written, and before the route opens a stream.
 * `assertActiveAccount` may `redirect()`, exactly as it did inside the action.
 */
export async function openChatTurn(raw: Readonly<Record<string, unknown>>): Promise<OpenChatTurnResult> {
  // Resolve the locale first and independently: the validation failure below
  // has to be localized too, and it happens before the input schema succeeds.
  const copy = chatCopy[resolveLocale(raw.locale)];

  const parsed = chatInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid", state: { status: "error", message: copy.invalidQuestion } };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated", state: { status: "error", message: copy.sessionExpired } };
  await assertActiveAccount(supabase, user.id, parsed.data.locale);
  return {
    ok: true,
    turn: {
      supabase,
      userId: user.id,
      question: parsed.data.question,
      locale: parsed.data.locale,
      conversationId: parsed.data.conversationId || undefined,
    },
  };
}

/**
 * Which of the matched memories are actually in force right now.
 *
 * Returns the ids the assistant may cite. A memory whose row cannot be read is
 * **excluded**, deliberately: the failure mode to avoid is citing something the
 * owner archived, and staying silent about one memory is recoverable in a way
 * that quoting a retracted fact back at them is not.
 *
 * `entry` matches never reach here — entries have no validity window, and
 * filtering them against a table they are not in would drop every one.
 */
async function memoriesInForce(
  supabase: SupabaseServerClient,
  matches: readonly KnowledgeRow[],
): Promise<Set<string>> {
  const ids = matches.filter((match) => match.source_type === "memory").map((match) => match.source_id);
  if (ids.length === 0) return new Set();

  const { data, error } = await supabase
    .from("memories")
    .select("id,valid_from,valid_until")
    .in("id", ids);
  if (error) {
    console.error("Memory validity lookup failed", error.message);
    return new Set();
  }

  const now = new Date();
  return new Set((data ?? []).filter((row) => isMemoryInForce(row, now)).map((row) => row.id));
}

/**
 * Life Brain B.1 (`LB-B-005`) — the agenda answer, persisted and audited.
 *
 * It lives in this module, not beside `agenda-answer.ts`, because this module is
 * the declared `audit_logs` writer for chat (`audit-log-writers.test.ts`) and
 * the one place a conversation message is written. What it deliberately does
 * NOT do is what the knowledge path below does first: no BYOK gate, no
 * rate-limit slot, no provider and no `recordAIUsage` — nothing here is an AI
 * operation, so there is nothing to admit and nothing to charge.
 *
 * A fault is recorded and reported exactly like the knowledge path's, through
 * the same classifier and sink, so a projection that cannot read the zone is
 * a quotable failure rather than an answer claiming the day is empty.
 */
async function answerAgendaTurn(
  supabase: SupabaseServerClient,
  input: { userId: string; conversationId: string; locale: Locale; span: AgendaSpan; surface: ErrorSurface },
): Promise<ChatState | null> {
  try {
    const answer = await loadAgendaAnswer(supabase, {
      userId: input.userId,
      locale: input.locale,
      span: input.span,
      now: new Date(),
    });
    const { error: answerError } = await supabase.from("conversation_messages").insert({
      user_id: input.userId,
      conversation_id: input.conversationId,
      role: "assistant",
      content: answer.content,
      citations: answer.citations,
      model: null,
    });
    if (answerError) throw answerError;

    const [conversationUpdate, auditInsert] = await Promise.all([
      supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", input.conversationId),
      supabase.from("audit_logs").insert({
        user_id: input.userId,
        action_type: "chat_answered",
        entity_type: "conversation",
        entity_id: input.conversationId,
        actor: "agent",
        after_state: { cited_source_ids: [...answer.citedSourceIds], model: null, route: "agenda" },
        reason: "Deterministic agenda answer from the calendar projection; no model call",
      }),
    ]);
    requireSupabaseSuccess(conversationUpdate, "update conversation timestamp");
    requireSupabaseSuccess(auditInsert, "record chat audit");
    return null;
  } catch (error) {
    unstable_rethrow(error);
    const { reason, failure } = classifyChatFailure(error);
    const { correlationId } = await recordErrorEvent(supabase, {
      surface: input.surface,
      operation: "chat_answer",
      reason,
    });
    console.error("Agenda answer failed", { reason, correlationId });
    return {
      status: "error",
      message: chatFailureMessage(input.locale, failure, correlationId),
      failure,
      reference: correlationId,
    };
  }
}

export type RunChatTurnHooks = {
  /**
   * Called once the conversation exists and the question row is written, so a
   * streaming caller can tell the client which thread the turn belongs to
   * before the answer arrives. Never called on a turn refused before that.
   */
  onConversation?: (conversationId: string) => void;
  /** Which transport the `error_events` rows name. The Server Action's by default. */
  surface?: ErrorSurface;
};

/**
 * The turn itself. Never redirects and never revalidates — the caller does
 * whichever its transport needs once it reads `answered`.
 */
export async function runChatTurn(
  turn: OpenedChatTurn,
  generate: AnswerGenerator,
  hooks: RunChatTurnHooks = {},
): Promise<ChatTurnOutcome> {
  const { supabase, userId, question, locale } = turn;
  const copy = chatCopy[locale];
  const surface = hooks.surface ?? "server_action";
  /** A refusal before the conversation is settled names only the id the caller sent. */
  const refuse = (state: ChatState): ChatTurnOutcome => ({ status: "failed", state, conversationId: turn.conversationId ?? null });

  /**
   * Life Brain B.0 (`LB-B-004`). The earlier turns of this conversation, read
   * BEFORE the new question is inserted so the question is never its own
   * history. Bounded to the last `CHAT_HISTORY_TURNS` and oldest-first, which
   * is the order a reader — and the model — expects. A read failure here is
   * not fatal: the answer is worse without context, not wrong, so the turn
   * proceeds with no history rather than refusing.
   */
  let history: ChatTurn[] = [];
  let conversationId: string;
  if (turn.conversationId) {
    conversationId = turn.conversationId;
    const { data: ownedConversation, error: conversationError } = await supabase.from("conversations").select("id").eq("id", conversationId).maybeSingle();
    if (conversationError) return refuse({ status: "error", message: copy.conversationUnavailable });
    if (!ownedConversation) return refuse({ status: "error", message: copy.conversationNotFound });
    const { data: earlierTurns } = await supabase
      .from("conversation_messages")
      .select("role,content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(CHAT_HISTORY_TURNS);
    history = (earlierTurns ?? [])
      .filter((turn): turn is { role: "user" | "assistant"; content: string } => turn.role === "user" || turn.role === "assistant")
      .reverse()
      .map((turn) => ({ role: turn.role, content: turn.content }));
  } else {
    const { data: conversation, error } = await supabase.from("conversations").insert({
      user_id: userId,
      title: question.slice(0, 100),
      locale,
    }).select("id").single();
    if (error || !conversation) return refuse({ status: "error", message: copy.conversationNotStarted });
    conversationId = conversation.id;
  }

  const { error: userMessageError } = await supabase.from("conversation_messages").insert({
    user_id: userId,
    conversation_id: conversationId,
    role: "user",
    content: question,
  });
  const fail = (state: ChatState): ChatTurnOutcome => ({ status: "failed", state, conversationId });
  if (userMessageError) return fail({ status: "error", message: copy.questionNotSaved });
  hooks.onConversation?.(conversationId);

  /*
   * Life Brain B.1. Decided again here, from the text, rather than trusted from
   * the composer's routing: the decision is pure and cheap, and re-deriving it
   * means no form field can steer a turn onto the route that skips the gate.
   */
  const agendaSpan = detectAgendaQuestion(question);
  if (agendaSpan !== null) {
    const failed = await answerAgendaTurn(supabase, { userId, conversationId, locale, span: agendaSpan, surface });
    if (failed) return fail(failed);
    return { status: "answered", conversationId, locale };
  }

  /**
   * `2P-CHAT-002`. Which provider call was in flight when a fault arrived.
   *
   * The try below spans two provider calls — the embedding and the answer — and
   * `error_events` has a distinct `operation` for each (`embed_text`,
   * `chat_answer`). Filing both under one operation would make the sink unable
   * to answer "is retrieval failing, or is generation failing", which is the
   * first question anyone reading it would ask. It is a `let` because the phase
   * genuinely changes as the turn proceeds; the catch reads whichever value was
   * current.
   */
  let operation: ErrorOperation = "chat_answer";

  try {
    // BYOK gate, before any preference read and before any provider call. A
    // gated user costs nothing and reaches no network; the project key is not
    // consulted because no code path can consult one any more.
    const gate = await openAiGate(supabase, userId);
    if (!gate.ok) {
      /*
       * `2P-CHAT-003`. Recorded, and the existing BYOK sentence is kept.
       *
       * The gate's own copy distinguishes "no credential" from "credential
       * unreadable", which is finer than this module's `credential` class, so
       * replacing it with the generic sentence would lose information the owner
       * can act on. What was missing is the record: before this, a gated
       * conversation left nothing behind at all. `permission_denied` is the
       * reason both gate outcomes classify to.
       */
      const { correlationId } = await recordErrorEvent(supabase, {
        surface,
        operation: "chat_answer",
        reason: "permission_denied",
      });
      return fail({
        status: "error",
        message: withChatFailureReference(
          locale,
          getByokCopy(locale).messages[gateMessageKey(gate.reason)],
          correlationId,
        ),
        failure: "credential",
        reference: correlationId,
      });
    }

    // 2H-RATE-001. One turn is one AI operation, admitted once: the embedding
    // and the answer below are two provider calls serving a single thing the
    // person asked for, and charging two slots for one question would make the
    // signed ceiling mean half of what it says. Admission sits after the BYOK
    // gate so a user who cannot reach a provider at all never spends a slot,
    // and before the first provider call so a refusal reaches no network.
    const admission = await admitRateLimitedOperation({
      client: supabase,
      bucket: "ai",
      locale,
      operation: "chat_answer",
    });
    // Already recorded by `admitRateLimitedOperation`, which writes its own
    // `rate_limit_refused` product event and its own sink row on a database
    // fault — so this path must not record a second one. What it gains here is
    // the class, so a caller can route the owner to their usage.
    if (!admission.ok) {
      return fail({ status: "error", message: admission.message, failure: "quota", reference: null });
    }

    const preferencesResult = await supabase.from("agent_preferences").select("chat_model,embedding_model,personality,tone,response_detail").eq("user_id", userId).maybeSingle();
    const preferences = requireSupabaseData(preferencesResult, "load chat preferences");
    const provider = getAIProvider({
      credential: gate.credential.secret,
      model: preferences?.chat_model ?? "gpt-5.6-terra",
      embeddingModel: preferences?.embedding_model ?? "text-embedding-3-small",
    });
    operation = "embed_text";
    const embedded = await provider.embedText(question);
    operation = "chat_answer";
    await recordAIUsage(supabase, {
      operation: "semantic_search",
      model: embedded.model,
      userId,
      usage: embedded,
      sourceType: "conversation",
      sourceId: conversationId,
    });
    /*
     * Life Brain B.3 (`LB-B-007`, ADR-150). The zone is read before retrieval
     * now, because a question about "semana passada" or "março" is retrieved
     * inside that period of the OWNER's days. Tasks and reminders below use the
     * same zone for their sentences.
     */
    const profileResult = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const profile = requireSupabaseData(profileResult, "load chat profile");
    const timezone = profile?.timezone ?? defaultAgentPreferences.timezone;
    const temporal = readTemporalQuestion(question);
    const window = temporal.span === null || !isSupportedTimeZone(timezone)
      ? null
      : temporalWindowFor(temporal.span, localDateOf(new Date(), timezone), timezone);
    const { matches: retrieved, matchError } = await retrieveKnowledge(supabase as unknown as KnowledgeRpcClient, {
      embedding: embedded.embedding,
      window,
      // Recency re-orders what came back, so it asks for the RPC's whole bound
      // and keeps the newest eight that clear the floor (below).
      count: temporal.recency ? 20 : 8,
    });
    if (matchError) throw matchError;
    const matches = (retrieved ?? []) as KnowledgeRow[];

    // A memory the owner archived must stop being used, or "Archive" on the
    // Memories page is a label with nothing behind it (UX-10).
    //
    // **The enforcement moved into the database in Phase 2N slice 2N.3
    // (`202608130093`, migration M1, `2N-CORRECT-003`).**
    // `match_internal_knowledge` now applies the validity window INSIDE the
    // union, ahead of `order by` and the bound, so an out-of-force memory is
    // never returned and — the part this filter could never fix — never
    // displaces a live one. The RPC is asked for 8 rows; before M1 an archived
    // memory ranking in the top 8 consumed a slot, and no code here could
    // recover a row the database did not send.
    //
    // This filter is deliberately KEPT, and it is no longer the enforcement.
    // It is the same predicate applied a second time, one layer out, for one
    // reason: M1's documented rollback is "re-declare the prior definition",
    // and a rollback that also silently re-admitted archived memories into
    // citations would cost more than the displacement fix it was meant to undo.
    // It costs one indexed lookup over at most 20 ids, and it shares
    // `isMemoryInForce` with both the badge the owner reads and the SQL
    // predicate, which `phase-2n-knowledge-guard.test.ts` holds together.
    const relevant = matches.filter((match) => match.similarity >= 0.2);
    const inForce = await memoriesInForce(supabase, relevant);
    /*
      Life Brain B.4 (`LB-B-010`, ADR-155). A `highly_sensitive` record or
      memory enters the prompt only when the owner asked for it in words or the
      question names its area of life; every other level is unchanged. In the
      application, after retrieval, so the RPC and its bound are untouched.
      The exclusion is silent (`2K-EXPL-005`); the inclusion is marked.
    */
    const sensitiveAsk = readSensitiveAsk(question);
    const classifications = await classifyKnowledgeSources(supabase as unknown as ClassificationClient, userId, relevant);
    const classificationOf = (match: KnowledgeRow) => classifications.get(sourceKey(match.source_type, match.source_id)) ?? FAIL_CLOSED;
    const admitted = relevant
      .filter((match) => match.source_type !== "memory" || inForce.has(match.source_id))
      .filter((match) => admitsSource(classificationOf(match), sensitiveAsk));
    const ranked: ChatSource[] = admitted
      .map((match) => ({
        id: `${match.source_type}:${match.source_id}`,
        type: match.source_type,
        content: match.content,
        occurredAt: match.occurred_at,
        similarity: match.similarity,
      }));
    // "Última vez", "recentemente", "quando foi": newest first, never fewer rows.
    const vectorSources = temporal.recency ? byRecency(ranked).slice(0, 8) : ranked;
    // Over what actually reaches the prompt, after the recency cut.
    const readSensitive = vectorSources.some((source) => {
      const classification = classifications.get(source.id);
      return classification !== undefined && needsAskForChatPrompt(classification.level);
    });

    /*
     * Life Brain B.2 (`LB-B-006`, ADR-147). Tasks and reminders have no vector,
     * so they are matched by their titles and appended after the ranked
     * sources. Their sentences carry local dates, in the zone read above
     * (since B.3, before retrieval). A highly sensitive or
     * unreadable source never reaches this list (`structured-sources.ts`).
     */
    const structured = await loadStructuredSources(supabase as unknown as StructuredSourceClient, {
      userId,
      question,
      locale,
      timezone,
    });
    const sources: ChatSource[] = [...vectorSources, ...structured.sources];
    /*
     * Life Brain B.1 (`LB-B-008`). Nothing qualified and nothing earlier in the
     * conversation: the model's instruction for this case is to say the sources
     * are insufficient, so the fixed sentence says it without the call and
     * without a `chat` row in the ledger. The embedding row above stays — it is
     * how "nothing" was learned.
     *
     * The history condition is B.0's, and it is the deliberate difference from
     * the PRD's one-line rule: a follow-up such as "e o segundo?" retrieves
     * nothing by itself and is answerable from the turns above it, so refusing
     * it would undo `LB-B-004` for exactly the questions it exists for.
     */
    const answeredWithoutModel = sources.length === 0 && history.length === 0;
    let answer: { answer: string; citedSourceIds: string[]; model: string | null; inputTokens?: number; outputTokens?: number };
    if (answeredWithoutModel) {
      answer = { answer: copy.noEvidenceAnswer, citedSourceIds: [], model: null };
    } else {
      const recordChatUsage = (billed: AIUsageDetails & { readonly model: string }) =>
        recordAIUsage(supabase, {
          operation: "chat",
          model: billed.model,
          userId,
          usage: {
            providerRequestId: billed.providerRequestId,
            transportRequestId: billed.transportRequestId,
            inputTokens: billed.inputTokens,
            cachedInputTokens: billed.cachedInputTokens,
            outputTokens: billed.outputTokens,
            reasoningTokens: billed.reasoningTokens,
          },
          sourceType: "conversation",
          sourceId: conversationId,
        });
      let generated: StreamedChatAnswer;
      try {
        generated = await generate(provider, {
          question,
          locale,
          timezone,
          // `LB-B-003`: the model finally learns what day it is.
          now: new Date().toISOString(),
          history,
          sources,
          responseDetail: preferences?.response_detail ?? "short",
          agentStyle: `${preferences?.personality ?? "proactive"}, ${preferences?.tone ?? "direct"}`,
        });
      } catch (error) {
        // ADR-181: a provider response that failed after reporting its bill is
        // still a call that was paid for, so it is recorded before the turn
        // fails. Every other failure carries no usage and records nothing.
        if (error instanceof BilledAnswerStreamFailure) await recordChatUsage(error.billed);
        throw error;
      }
      /*
       * ADR-175. The bill first, then the trust. The usage row is written as
       * soon as the call has completed and BEFORE the output is validated, so a
       * defective or truncated output still has its cost in the ledger; and
       * before any dependent write, as every AI call here does.
       */
      await recordChatUsage(generated);
      // The complete object, validated here whatever the transport was. A
      // failure throws into the catch below: classified, recorded, and nothing
      // persisted — a half or malformed answer never becomes a message.
      const validated = chatAnswerSchema.parse(generated.output);
      const providedIds = new Set(sources.map((source) => source.id));
      answer = {
        answer: validated.answer,
        citedSourceIds: validated.citedSourceIds.filter((id) => providedIds.has(id)),
        model: generated.model,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
      };
    }
    // The provider strips fabricated ids deterministically, but that invariant
    // crosses the AIProvider portability seam and is not encoded in ChatResult.
    // A non-null assertion here turned any weakening of that filter into a
    // TypeError mid-conversation; dropping an unmatched id keeps the hydration
    // total instead, preserving order and shape.
    /**
     * `2K-PRIVACY-003` (OD-2K-2) — a **structured reference only**.
     *
     * This used to write a 220-character copy of the source's content. That
     * copy of the user's content in a second table did not carry the source
     * row's `sensitivity` with it — so reclassifying an entry or archiving a
     * memory left the quote in the thread, in the clear, forever. It was the
     * sharpest finding in the phase audit and it was live.
     *
     * Carrying the classification alongside the copy was considered and
     * rejected: it keeps two copies of one fact in sync by convention, which is
     * the shape of defect `202608080087` had to delete. Removing the copy
     * removes the thing that can diverge. `resolve-sources.ts` re-reads the
     * source at render time against its **current** classification.
     *
     * The fabricated-id stripping is unchanged and still a `flatMap`: weakening
     * the provider-side filter must keep degrading to a missing citation rather
     * than to a mid-conversation `TypeError` (`2K-SRC-002`).
     */
    const references = answer.citedSourceIds.flatMap((id) => {
      const source = sources.find((item) => item.id === id);
      const sourceId = id.split(":")[1];
      if (!source || !sourceId) return [];
      return [{ id, type: source.type, sourceId, support: supportKindForSource(source.type) }];
    });

    /**
     * `2K-SRC-005` — insufficiency comes from **retrieval**, not from the count.
     *
     * Slice 2K.0 measured why: an empty citation array is produced both by
     * "nothing was retrieved" and by "sources were retrieved and the model
     * cited none of them". Those are different facts, and `sources` is the one
     * that answers "did the Brain have anything to work with".
     */
    /**
     * `2K-EXPL-003/004` — the two exclusions this path already computed and
     * threw away.
     *
     * Everything below the similarity floor was dropped at `relevant`, and
     * every archived memory was dropped by `inForce`. The user was told
     * neither, so they could not distinguish "the Brain found nothing" from
     * "the Brain found three things and rejected all of them". Nothing new is
     * computed here; two facts that already existed reach the surface.
     *
     * Counts go **in** and booleans come **out**: `buildAnswerExplanation` is
     * the one place the numbers stop travelling, because a rate is a count over
     * repeated queries (T-2K-04).
     */
    const aboveFloorMemories = relevant.filter((match) => match.source_type === "memory");
    const explanation = buildAnswerExplanation({
      retrieved: matches.length,
      aboveFloor: relevant.length,
      aboveFloorMemories: aboveFloorMemories.length,
      inForceMemories: aboveFloorMemories.filter((match) => inForce.has(match.source_id)).length,
    });

    const citations = buildCitationsEnvelope({
      retrievedAnyQualifyingSource: sources.length > 0,
      sources: references,
      explanation,
      /*
       * Chat's own reach, unchanged. `OD-2Q-1` widened the citation **type**
       * vocabulary to admit `task`; it did not widen what chat retrieves, and
       * `conversation-sources/copy.ts` still tells the owner *"those two places
       * only"*. Passing the caller's reach rather than spreading a shared
       * constant is what keeps those two facts from drifting: a review declares
       * `REVIEW_REACH`, and neither surface can silently inherit the other's
       * sentence.
       */
      reach: CHAT_REACH,
      // `LB-B-010`: only when a highly sensitive source reached the prompt.
      readSensitive: readSensitive && !answeredWithoutModel,
    });

    const { error: answerError } = await supabase.from("conversation_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "assistant",
      content: answer.answer,
      citations,
      model: answer.model,
      // A fixed answer used no tokens; the columns keep their defaults.
      ...(answer.inputTokens === undefined ? {} : { input_tokens: answer.inputTokens }),
      ...(answer.outputTokens === undefined ? {} : { output_tokens: answer.outputTokens }),
    });
    if (answerError) throw answerError;

    const [conversationUpdate, auditInsert] = await Promise.all([
      supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId),
      supabase.from("audit_logs").insert({
        user_id: userId,
        action_type: "chat_answered",
        entity_type: "conversation",
        entity_id: conversationId,
        actor: "agent",
        after_state: answeredWithoutModel
          ? { cited_source_ids: [], model: null, route: "no_evidence" }
          : { cited_source_ids: answer.citedSourceIds, model: answer.model },
        reason: answeredWithoutModel
          ? "No qualifying source and no earlier turn; fixed answer without a model call"
          : "Grounded answer generated from internal knowledge",
      }),
    ]);
    requireSupabaseSuccess(conversationUpdate, "update conversation timestamp");
    requireSupabaseSuccess(auditInsert, "record chat audit");
  } catch (error) {
    /*
     * `2P-CHAT-001`, `-002`, `-003`. One catch, five answers, and a record.
     *
     * `unstable_rethrow` first, at the top of the block, which is where Next's
     * own documentation puts it. Nothing inside this try redirects today, but a
     * catch this broad is exactly where a future `notFound()` or `redirect()`
     * would be swallowed, and the failure mode is invisible: the framework's
     * navigation silently becomes a rendered error state. Guarding it costs one
     * line and removes the whole class.
     *
     * Then one call to `classifyChatFailure`, whose reason goes to the sink and
     * whose class chooses the sentence — so the row and what the owner reads
     * cannot disagree. The sink never throws and always returns a correlation
     * id, so there is no branch here where the owner is left with nothing to
     * quote.
     *
     * ADR-175: an aborted stream lands here too — the owner closed the page or
     * the transport dropped — and so does an output that fails validation. In
     * both, nothing after the question row was written.
     */
    unstable_rethrow(error);

    const { reason, failure } = classifyChatFailure(error);
    const { correlationId } = await recordErrorEvent(supabase, {
      surface,
      operation,
      reason,
    });
    /*
     * The console line prints only the classification and the correlation id.
     * Printing `error.message` was the one place a provider string or a
     * fragment of the owner's own question could reach a host log from this
     * path — the same rule the sink itself follows, and the reason
     * `error_events` has no free-text column.
     */
    console.error("Grounded chat failed", { operation, reason, correlationId });
    return fail({
      status: "error",
      message: chatFailureMessage(locale, failure, correlationId),
      failure,
      reference: correlationId,
    });
  }

  return { status: "answered", conversationId, locale };
}

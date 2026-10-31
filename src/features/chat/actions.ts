"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getByokCopy } from "@/features/byok/copy";
import { admitRateLimitedOperation } from "@/features/rate-limits/server";
import { gateMessageKey, openAiGate } from "@/lib/byok/gate";
import { getAIProvider, type ChatSource } from "@/lib/ai";
import { CHAT_HISTORY_TURNS } from "@/lib/ai/knowledge-prompt";
import type { ChatTurn } from "@/lib/ai/types";
import { defaultAgentPreferences, locales, resolveLocale, type Locale } from "@/lib/preferences";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { recordAIUsage } from "@/lib/ai/usage";
import { requireSupabaseData, requireSupabaseSuccess } from "@/lib/supabase/result";
import { recordErrorEvent, type ErrorOperation } from "@/lib/observability/error-sink";
import { chatFailureMessage, classifyChatFailure, withChatFailureReference } from "./diagnostics";
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
import { AI_INPUT_BOUNDS } from "@/lib/ai-input-bounds";

const chatInputSchema = z.object({
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
      "Não encontrei nada seu sobre isso nos seus registros nem nas suas memórias. Se ainda não registrou, escreva \"registre que…\" e eu guardo.",
  },
  en: {
    invalidQuestion: "Write a valid question.",
    sessionExpired: "Your session expired.",
    conversationUnavailable: "We could not open this conversation.",
    conversationNotFound: "Conversation not found.",
    conversationNotStarted: "We could not start the conversation.",
    questionNotSaved: "We could not save your question.",
    noEvidenceAnswer:
      "I found nothing of yours about this in your records or your memories. If you have not recorded it yet, write \"note that…\" and I will keep it.",
  },
} satisfies Record<Locale, ChatCopy>;

type KnowledgeRow = {
  source_type: "entry" | "memory";
  source_id: string;
  content: string;
  similarity: number;
  occurred_at: string;
};

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
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { userId: string; conversationId: string; locale: Locale; span: AgendaSpan },
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
      surface: "server_action",
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

export async function sendChatMessage(_state: ChatState, formData: FormData): Promise<ChatState> {
  // Resolve the locale first and independently: the validation failure below
  // has to be localized too, and it happens before the input schema succeeds.
  const copy = chatCopy[resolveLocale(formData.get("locale"))];

  const parsed = chatInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: copy.invalidQuestion };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: copy.sessionExpired };
  await assertActiveAccount(supabase, user.id, parsed.data.locale);
  let conversationId = parsed.data.conversationId || undefined;

  /**
   * Life Brain B.0 (`LB-B-004`). The earlier turns of this conversation, read
   * BEFORE the new question is inserted so the question is never its own
   * history. Bounded to the last `CHAT_HISTORY_TURNS` and oldest-first, which
   * is the order a reader — and the model — expects. A read failure here is
   * not fatal: the answer is worse without context, not wrong, so the turn
   * proceeds with no history rather than refusing.
   */
  let history: ChatTurn[] = [];
  if (conversationId) {
    const { data: ownedConversation, error: conversationError } = await supabase.from("conversations").select("id").eq("id", conversationId).maybeSingle();
    if (conversationError) return { status: "error", message: copy.conversationUnavailable };
    if (!ownedConversation) return { status: "error", message: copy.conversationNotFound };
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
      user_id: user.id,
      title: parsed.data.question.slice(0, 100),
      locale: parsed.data.locale,
    }).select("id").single();
    if (error || !conversation) return { status: "error", message: copy.conversationNotStarted };
    conversationId = conversation.id;
  }

  const { error: userMessageError } = await supabase.from("conversation_messages").insert({
    user_id: user.id,
    conversation_id: conversationId,
    role: "user",
    content: parsed.data.question,
  });
  if (userMessageError) return { status: "error", message: copy.questionNotSaved };

  /*
   * Life Brain B.1. Decided again here, from the text, rather than trusted from
   * the composer's routing: the decision is pure and cheap, and re-deriving it
   * means no form field can steer a turn onto the route that skips the gate.
   */
  const agendaSpan = detectAgendaQuestion(parsed.data.question);
  if (agendaSpan !== null && conversationId) {
    const failed = await answerAgendaTurn(supabase, {
      userId: user.id,
      conversationId,
      locale: parsed.data.locale,
      span: agendaSpan,
    });
    if (failed) return failed;
    revalidatePath(`/${parsed.data.locale}/app/chat/${conversationId}`);
    redirect(`/${parsed.data.locale}/app/chat/${conversationId}`);
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
    const gate = await openAiGate(supabase, user.id);
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
        surface: "server_action",
        operation: "chat_answer",
        reason: "permission_denied",
      });
      return {
        status: "error",
        message: withChatFailureReference(
          parsed.data.locale,
          getByokCopy(formData.get("locale")).messages[gateMessageKey(gate.reason)],
          correlationId,
        ),
        failure: "credential",
        reference: correlationId,
      };
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
      locale: parsed.data.locale,
      operation: "chat_answer",
    });
    // Already recorded by `admitRateLimitedOperation`, which writes its own
    // `rate_limit_refused` product event and its own sink row on a database
    // fault — so this path must not record a second one. What it gains here is
    // the class, so a caller can route the owner to their usage.
    if (!admission.ok) {
      return { status: "error", message: admission.message, failure: "quota", reference: null };
    }

    const preferencesResult = await supabase.from("agent_preferences").select("chat_model,embedding_model,personality,tone,response_detail").eq("user_id", user.id).maybeSingle();
    const preferences = requireSupabaseData(preferencesResult, "load chat preferences");
    const provider = getAIProvider({
      credential: gate.credential.secret,
      model: preferences?.chat_model ?? "gpt-5.6-terra",
      embeddingModel: preferences?.embedding_model ?? "text-embedding-3-small",
    });
    operation = "embed_text";
    const embedded = await provider.embedText(parsed.data.question);
    operation = "chat_answer";
    await recordAIUsage(supabase, {
      operation: "semantic_search",
      model: embedded.model,
      userId: user.id,
      usage: embedded,
      sourceType: "conversation",
      sourceId: conversationId,
    });
    const { data: matches, error: matchError } = await supabase.rpc("match_internal_knowledge", {
      p_query_embedding: embedded.embedding,
      p_match_count: 8,
    });
    if (matchError) throw matchError;

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
    const relevant = ((matches ?? []) as KnowledgeRow[]).filter((match) => match.similarity >= 0.2);
    const inForce = await memoriesInForce(supabase, relevant);
    const sources: ChatSource[] = relevant
      .filter((match) => match.source_type !== "memory" || inForce.has(match.source_id))
      .map((match) => ({
        id: `${match.source_type}:${match.source_id}`,
        type: match.source_type,
        content: match.content,
        occurredAt: match.occurred_at,
        similarity: match.similarity,
      }));
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
      const profileResult = await supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
      const profile = requireSupabaseData(profileResult, "load chat profile");
      const answered = await provider.answerFromKnowledge({
        question: parsed.data.question,
        locale: parsed.data.locale,
        timezone: profile?.timezone ?? defaultAgentPreferences.timezone,
        // `LB-B-003`: the model finally learns what day it is.
        now: new Date().toISOString(),
        history,
        sources,
        responseDetail: preferences?.response_detail ?? "short",
        agentStyle: `${preferences?.personality ?? "proactive"}, ${preferences?.tone ?? "direct"}`,
      });
      await recordAIUsage(supabase, {
        operation: "chat",
        model: answered.model,
        userId: user.id,
        usage: answered,
        sourceType: "conversation",
        sourceId: conversationId,
      });
      answer = answered;
    }
    // The provider strips fabricated ids deterministically, but that invariant
    // crosses the AIProvider portability seam and is not encoded in ChatResult.
    // A non-null assertion here turned any weakening of that filter into a
    // TypeError mid-conversation; dropping an unmatched id keeps the hydration
    // total instead, preserving order and shape.
    /**
     * `2K-PRIVACY-003` (OD-2K-2) — a **structured reference only**.
     *
     * This used to write `excerpt: source.content.slice(0, 220)`. That excerpt
     * was a copy of the user's content in a second table, and the source row's
     * `sensitivity` did not travel with it — so reclassifying an entry or
     * archiving a memory left the quote in the thread, in the clear, forever.
     * It was the sharpest finding in the phase audit and it was live.
     *
     * Carrying the classification alongside the excerpt was considered and
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
      retrieved: (matches ?? []).length,
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
    });

    const { error: answerError } = await supabase.from("conversation_messages").insert({
      user_id: user.id,
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
        user_id: user.id,
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
     * own documentation puts it. Nothing inside this try redirects today —
     * `assertActiveAccount` runs above it and `redirect()` runs below it — but a
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
     * What used to be here was `console.error` plus one sentence for every
     * fault. The log reached a host and nothing else; the sentence flattened a
     * credential problem, a quota ceiling, a retrieval fault, a provider outage
     * and a timeout into the same words. Slice 2P.0 measured that
     * `public.error_events` held one row, dated 2026-08-07, and that the chat
     * path had never written to it.
     */
    unstable_rethrow(error);

    const { reason, failure } = classifyChatFailure(error);
    const { correlationId } = await recordErrorEvent(supabase, {
      surface: "server_action",
      operation,
      reason,
    });
    /*
     * The console line stays, and now prints only the classification and the
     * correlation id. Printing `error.message` was the one place a provider
     * string or a fragment of the owner's own question could reach a host log
     * from this path — the same rule the sink itself follows, and the reason
     * `error_events` has no free-text column.
     */
    console.error("Grounded chat failed", { operation, reason, correlationId });
    return {
      status: "error",
      message: chatFailureMessage(parsed.data.locale, failure, correlationId),
      failure,
      reference: correlationId,
    };
  }

  revalidatePath(`/${parsed.data.locale}/app/chat/${conversationId}`);
  redirect(`/${parsed.data.locale}/app/chat/${conversationId}`);
}

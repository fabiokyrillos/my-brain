"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getByokCopy } from "@/features/byok/copy";
import { admitRateLimitedOperation } from "@/features/rate-limits/server";
import { gateMessageKey, openAiGate } from "@/lib/byok/gate";
import { getAIProvider, type ChatSource } from "@/lib/ai";
import { defaultAgentPreferences, locales, resolveLocale, type Locale } from "@/lib/preferences";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { recordAIUsage } from "@/lib/ai/usage";
import { requireSupabaseData, requireSupabaseSuccess } from "@/lib/supabase/result";
import {
  buildCitationsEnvelope,
  supportKindForSource,
} from "@/features/conversation-sources/contracts";
import { buildAnswerExplanation } from "@/features/conversation-sources/explanation";
import { isMemoryInForce } from "@/features/memories/lifecycle";
import type { ChatState } from "./chat-state";
import { getAgentName } from "@/features/profile/agent-identity";
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
  answerUnavailable: (agent: string) => string;
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
    answerUnavailable: (agent: string) => `O ${agent} não conseguiu responder agora. Sua pergunta ficou salva.`,
  },
  en: {
    invalidQuestion: "Write a valid question.",
    sessionExpired: "Your session expired.",
    conversationUnavailable: "We could not open this conversation.",
    conversationNotFound: "Conversation not found.",
    conversationNotStarted: "We could not start the conversation.",
    questionNotSaved: "We could not save your question.",
    answerUnavailable: (agent: string) => `${agent} could not answer right now. Your question was saved.`,
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

  if (conversationId) {
    const { data: ownedConversation, error: conversationError } = await supabase.from("conversations").select("id").eq("id", conversationId).maybeSingle();
    if (conversationError) return { status: "error", message: copy.conversationUnavailable };
    if (!ownedConversation) return { status: "error", message: copy.conversationNotFound };
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

  try {
    // BYOK gate, before any preference read and before any provider call. A
    // gated user costs nothing and reaches no network; the project key is not
    // consulted because no code path can consult one any more.
    const gate = await openAiGate(supabase, user.id);
    if (!gate.ok) {
      return {
        status: "error",
        message: getByokCopy(formData.get("locale")).messages[gateMessageKey(gate.reason)],
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
    if (!admission.ok) return { status: "error", message: admission.message };

    const preferencesResult = await supabase.from("agent_preferences").select("chat_model,embedding_model,personality,tone,response_detail").eq("user_id", user.id).maybeSingle();
    const preferences = requireSupabaseData(preferencesResult, "load chat preferences");
    const provider = getAIProvider({
      credential: gate.credential.secret,
      model: preferences?.chat_model ?? "gpt-5.6-terra",
      embeddingModel: preferences?.embedding_model ?? "text-embedding-3-small",
    });
    const embedded = await provider.embedText(parsed.data.question);
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
    // `match_internal_knowledge` selects memories on `embedding is not null`
    // alone (`202607160006:116-117`) — it has never read `valid_from` or
    // `valid_until`, and teaching it to would mean a migration this slice is not
    // authorized to make. Filtering here is the read-only equivalent: the RPC
    // returns at most 20 rows, so this is one indexed lookup over a handful of
    // ids, and it shares `isMemoryInForce` with the badge the owner reads, so
    // the page and the retrieval provably cannot disagree.
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
    const profileResult = await supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
    const profile = requireSupabaseData(profileResult, "load chat profile");
    const answer = await provider.answerFromKnowledge({
      question: parsed.data.question,
      locale: parsed.data.locale,
      timezone: profile?.timezone ?? defaultAgentPreferences.timezone,
      sources,
      responseDetail: preferences?.response_detail ?? "short",
      agentStyle: `${preferences?.personality ?? "proactive"}, ${preferences?.tone ?? "direct"}`,
    });
    await recordAIUsage(supabase, {
      operation: "chat",
      model: answer.model,
      userId: user.id,
      usage: answer,
      sourceType: "conversation",
      sourceId: conversationId,
    });
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
    });

    const { error: answerError } = await supabase.from("conversation_messages").insert({
      user_id: user.id,
      conversation_id: conversationId,
      role: "assistant",
      content: answer.answer,
      citations,
      model: answer.model,
      input_tokens: answer.inputTokens,
      output_tokens: answer.outputTokens,
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
        after_state: { cited_source_ids: answer.citedSourceIds, model: answer.model },
        reason: "Grounded answer generated from internal knowledge",
      }),
    ]);
    requireSupabaseSuccess(conversationUpdate, "update conversation timestamp");
    requireSupabaseSuccess(auditInsert, "record chat audit");
  } catch (error) {
    console.error("Grounded chat failed", error instanceof Error ? error.message : "unknown error");
    return { status: "error", message: copy.answerUnavailable(await getAgentName()) };
  }

  revalidatePath(`/${parsed.data.locale}/app/chat/${conversationId}`);
  redirect(`/${parsed.data.locale}/app/chat/${conversationId}`);
}

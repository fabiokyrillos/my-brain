"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAIProvider, type ChatSource } from "@/lib/ai";
import { defaultAgentPreferences } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import type { ChatState } from "./chat-form";

const chatInputSchema = z.object({
  question: z.string().trim().min(1).max(12000),
  locale: z.enum(["pt-BR", "en"]),
  conversationId: z.union([z.string().uuid(), z.literal("")]).optional(),
});

type KnowledgeRow = {
  source_type: "entry" | "memory";
  source_id: string;
  content: string;
  similarity: number;
  occurred_at: string;
};

export async function sendChatMessage(_state: ChatState, formData: FormData): Promise<ChatState> {
  const parsed = chatInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Escreva uma pergunta válida." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sua sessão expirou." };
  let conversationId = parsed.data.conversationId || undefined;

  if (conversationId) {
    const { data: ownedConversation } = await supabase.from("conversations").select("id").eq("id", conversationId).maybeSingle();
    if (!ownedConversation) return { status: "error", message: "Conversa não encontrada." };
  } else {
    const { data: conversation, error } = await supabase.from("conversations").insert({
      user_id: user.id,
      title: parsed.data.question.slice(0, 100),
      locale: parsed.data.locale,
    }).select("id").single();
    if (error || !conversation) return { status: "error", message: "Não foi possível iniciar a conversa." };
    conversationId = conversation.id;
  }

  const { error: userMessageError } = await supabase.from("conversation_messages").insert({
    user_id: user.id,
    conversation_id: conversationId,
    role: "user",
    content: parsed.data.question,
  });
  if (userMessageError) return { status: "error", message: "Não foi possível salvar sua pergunta." };

  try {
    const { data: preferences } = await supabase.from("agent_preferences").select("ai_model,personality,tone,response_detail").eq("user_id", user.id).maybeSingle();
    const provider = getAIProvider({ model: preferences?.ai_model ?? undefined });
    const embedded = await provider.embedText(parsed.data.question);
    const { data: matches, error: matchError } = await supabase.rpc("match_internal_knowledge", {
      p_query_embedding: embedded.embedding,
      p_match_count: 8,
    });
    if (matchError) throw matchError;

    const sources: ChatSource[] = ((matches ?? []) as KnowledgeRow[])
      .filter((match) => match.similarity >= 0.2)
      .map((match) => ({
        id: `${match.source_type}:${match.source_id}`,
        type: match.source_type,
        content: match.content,
        occurredAt: match.occurred_at,
        similarity: match.similarity,
      }));
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
    const answer = await provider.answerFromKnowledge({
      question: parsed.data.question,
      locale: parsed.data.locale,
      timezone: profile?.timezone ?? defaultAgentPreferences.timezone,
      sources,
      responseDetail: preferences?.response_detail ?? "short",
      agentStyle: `${preferences?.personality ?? "proactive"}, ${preferences?.tone ?? "direct"}`,
    });
    const citations = answer.citedSourceIds.map((id) => {
      const source = sources.find((item) => item.id === id)!;
      return { id, type: source.type, sourceId: id.split(":")[1], excerpt: source.content.slice(0, 220) };
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

    await Promise.all([
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
  } catch (error) {
    console.error("Grounded chat failed", error instanceof Error ? error.message : "unknown error");
    return { status: "error", message: "O Brain não conseguiu responder agora. Sua pergunta ficou salva." };
  }

  revalidatePath(`/${parsed.data.locale}/app/chat/${conversationId}`);
  redirect(`/${parsed.data.locale}/app/chat/${conversationId}`);
}

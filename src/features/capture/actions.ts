"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_STRATEGY_VERSION,
} from "@/lib/ai/openai-provider";
import { getAIProvider } from "@/lib/ai";
import { defaultAgentPreferences } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { captureEntrySchema } from "./schema";
import type { CaptureState } from "./quick-capture-form";

type NamedRecord = { name: string };

function formatKnownContext(groups: Array<[string, NamedRecord[] | null]>) {
  const lines = groups
    .filter(([, items]) => items && items.length > 0)
    .map(([label, items]) => `${label}: ${items?.map((item) => item.name).join(", ")}`);
  return lines.join("\n");
}

export async function captureEntry(
  _state: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  const parsed = captureEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Revise a entrada." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sua sessão expirou. Entre novamente." };

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      user_id: user.id,
      original_content: parsed.data.content,
      locale: parsed.data.locale,
      source: parsed.data.source,
      status: "processing",
    })
    .select("id")
    .single();

  if (entryError || !entry) {
    return { status: "error", message: "Não foi possível salvar a entrada." };
  }

  const [profileResult, preferencesResult, contextsResult, organizationsResult, projectsResult, peopleResult] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
    supabase.from("agent_preferences").select("ai_model").eq("user_id", user.id).maybeSingle(),
    supabase.from("contexts").select("name").order("updated_at", { ascending: false }).limit(30),
    supabase.from("organizations").select("name").order("updated_at", { ascending: false }).limit(30),
    supabase.from("projects").select("name").eq("status", "active").order("updated_at", { ascending: false }).limit(30),
    supabase.from("people").select("name").order("updated_at", { ascending: false }).limit(30),
  ]);

  try {
    const provider = getAIProvider({ model: preferencesResult.data?.ai_model ?? undefined });
    const result = await provider.extractEntry({
      content: parsed.data.content,
      locale: parsed.data.locale,
      timezone: profileResult.data?.timezone ?? defaultAgentPreferences.timezone,
      currentTime: new Date().toISOString(),
      knownContext: formatKnownContext([
        ["Contexts", contextsResult.data],
        ["Organizations", organizationsResult.data],
        ["Projects", projectsResult.data],
        ["People", peopleResult.data],
      ]),
    });

    const { error: persistError } = await supabase.rpc("persist_entry_interpretation", {
      p_entry_id: entry.id,
      p_extraction: result.extraction,
      p_model: result.model,
      p_strategy_version: EXTRACTION_STRATEGY_VERSION,
      p_prompt_version: EXTRACTION_PROMPT_VERSION,
      p_input_tokens: result.inputTokens,
      p_output_tokens: result.outputTokens,
    });
    if (persistError) throw persistError;

    try {
      const embeddingContent = `${result.extraction.summary}\n\n${parsed.data.content}`;
      const embedded = await provider.embedText(embeddingContent);
      const { error: embeddingError } = await supabase.from("entry_embeddings").upsert({
        user_id: user.id,
        entry_id: entry.id,
        content: embeddingContent,
        embedding: embedded.embedding,
        model: embedded.model,
        input_tokens: embedded.inputTokens,
      }, { onConflict: "entry_id" });
      if (embeddingError) throw embeddingError;
    } catch (embeddingError) {
      console.error("Entry embedding failed", embeddingError instanceof Error ? embeddingError.message : "unknown error");
    }
  } catch (error) {
    console.error("Entry interpretation failed", error instanceof Error ? error.message : "unknown error");
    await supabase.from("entries").update({
      status: "failed",
      processing_error: "Interpretação indisponível. O original foi preservado.",
    }).eq("id", entry.id);
    return {
      status: "error",
      message: "A entrada foi salva, mas não pôde ser interpretada agora. Ela está na Caixa de entrada.",
    };
  }

  revalidatePath(`/${parsed.data.locale}/app`);
  revalidatePath(`/${parsed.data.locale}/app/inbox`);
  redirect(`/${parsed.data.locale}/app/inbox/${entry.id}`);
}

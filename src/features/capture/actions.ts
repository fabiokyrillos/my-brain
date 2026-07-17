"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_STRATEGY_VERSION } from "@/lib/ai/openai-provider";
import { extractEntryForUser, persistEntryEmbedding } from "@/features/interpretations/interpret-entry";
import { createClient } from "@/lib/supabase/server";
import { captureEntrySchema } from "./schema";
import type { CaptureState } from "./quick-capture-form";

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
      status: "saved",
    })
    .select("id")
    .single();

  if (entryError || !entry) {
    return { status: "error", message: "Não foi possível salvar a entrada." };
  }

  try {
    const begin = await supabase.rpc("begin_entry_interpretation", { p_entry_id: entry.id });
    if (begin.error) throw begin.error;
    const extraction = await extractEntryForUser({
      supabase,
      userId: user.id,
      entryId: entry.id,
      content: parsed.data.content,
      locale: parsed.data.locale,
    });
    const { error: persistError } = await supabase.rpc("persist_entry_interpretation", {
      p_entry_id: entry.id,
      p_extraction: extraction.result.extraction,
      p_model: extraction.result.model,
      p_strategy_version: EXTRACTION_STRATEGY_VERSION,
      p_prompt_version: EXTRACTION_PROMPT_VERSION,
      p_input_tokens: extraction.result.inputTokens,
      p_output_tokens: extraction.result.outputTokens,
    });
    if (persistError) throw persistError;

    try {
      await persistEntryEmbedding({
        supabase,
        userId: user.id,
        entryId: entry.id,
        content: parsed.data.content,
        summary: extraction.result.extraction.summary,
        provider: extraction.provider,
      });
    } catch (embeddingError) {
      console.error("Entry embedding failed", embeddingError instanceof Error ? embeddingError.message : "unknown error");
    }
  } catch (error) {
    console.error("Entry interpretation failed", error instanceof Error ? error.message : "unknown error");
    const failureUpdate = await supabase.rpc("fail_entry_interpretation", {
      p_entry_id: entry.id,
      p_error: "Interpretation unavailable. The original was preserved.",
      p_terminal: false,
    });
    if (failureUpdate.error) console.error("Entry failure state update failed", failureUpdate.error.code);
    return {
      status: "error",
      message: "A entrada foi salva, mas não pôde ser interpretada agora. Ela está na Caixa de entrada.",
    };
  }

  revalidatePath(`/${parsed.data.locale}/app`);
  revalidatePath(`/${parsed.data.locale}/app/inbox`);
  redirect(`/${parsed.data.locale}/app/inbox/${entry.id}`);
}

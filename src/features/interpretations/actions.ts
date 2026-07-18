"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDailyCycleCopy } from "@/features/daily-cycle/copy";
import { recordProductEvent } from "@/features/product-analytics/server";
import { kickEntryInterpretationWorker } from "@/lib/jobs/entry-worker";
import { createClient } from "@/lib/supabase/server";
import type { RevisionActionState } from "./revision-editor";
import { parseCorrectionFormData } from "./form-parser";
import { buildCorrectionElementTrust } from "./trust-builders";

const localeSchema = z.enum(["pt-BR", "en"]);
const uuidSchema = z.string().uuid();

function localized(locale: "pt-BR" | "en", pt: string, en: string) {
  return locale === "pt-BR" ? pt : en;
}

function refreshEntry(locale: "pt-BR" | "en", entryId: string) {
  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/inbox`);
  revalidatePath(`/${locale}/app/inbox/${entryId}`);
}

export async function correctInterpretation(
  _state: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  const parsed = parseCorrectionFormData(formData);
  const locale = localeSchema.safeParse(formData.get("locale"));
  if (!parsed.success || !locale.success) {
    return { status: "error", message: "Revise os campos da correção." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: localized(locale.data, "Sua sessão expirou. Entre novamente.", "Your session expired. Sign in again.") };
  }

  const { entryId, expectedVersion, operationKey, correctionReason, ...patch } = parsed.data;
  const correctionHistory = await supabase
    .from("entry_interpretations")
    .select("id", { count: "exact", head: true })
    .eq("entry_id", entryId)
    .eq("origin", "user_corrected");
  if (correctionHistory.error) {
    return { status: "error", message: localized(locale.data, "Não foi possível validar o histórico da correção.", "Could not validate correction history.") };
  }
  const elementTrust = buildCorrectionElementTrust({
    occurredAt: patch.occurredAt,
    hasEntities: patch.entityLinks.length > 0,
    priorCorrectionAgreement: Math.min(1, (correctionHistory.count ?? 0) / 5),
  });
  const { error } = await supabase.rpc("correct_entry_interpretation", {
    p_entry_id: entryId,
    p_expected_version: expectedVersion,
    p_operation_key: operationKey,
    p_patch: { ...patch, elementTrust },
    p_reason: correctionReason,
  });
  if (error) {
    const conflict = error.code === "55P03" || /version|concurrent/i.test(error.message ?? "");
    return {
      status: "error",
      message: conflict
        ? localized(locale.data, "A interpretação mudou. Recarregue antes de corrigir novamente.", "The interpretation changed. Reload before correcting it again.")
        : localized(locale.data, "Não foi possível salvar a nova versão.", "Could not save the new version."),
    };
  }
  refreshEntry(locale.data, entryId);
  return { status: "success", message: localized(locale.data, "Nova versão salva.", "New version saved.") };
}

export async function undoInterpretationCorrection(
  _state: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  const entryId = uuidSchema.safeParse(formData.get("entryId"));
  const undoId = uuidSchema.safeParse(formData.get("undoId"));
  const locale = localeSchema.safeParse(formData.get("locale"));
  if (!entryId.success || !undoId.success || !locale.success) {
    return { status: "error", message: "Ação inválida." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: localized(locale.data, "Sua sessão expirou.", "Your session expired.") };
  const { error } = await supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  if (error) return { status: "error", message: localized(locale.data, "Não foi possível desfazer.", "Could not undo.") };
  refreshEntry(locale.data, entryId.data);
  return { status: "success", message: localized(locale.data, "Correção desfeita como uma nova versão.", "Correction undone as a new version.") };
}

export async function reprocessEntry(
  _state: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  const entryId = uuidSchema.safeParse(formData.get("entryId"));
  const operationKey = uuidSchema.safeParse(formData.get("operationKey"));
  const locale = localeSchema.safeParse(formData.get("locale"));
  if (!entryId.success || !operationKey.success || !locale.success) {
    return { status: "error", message: "Ação inválida." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: localized(locale.data, "Sua sessão expirou.", "Your session expired.") };

  const { data, error } = await supabase.rpc("enqueue_entry_reprocessing", {
    p_entry_id: entryId.data,
    p_operation_key: operationKey.data,
  });
  if (error || !data) {
    return {
      status: "error",
      message: localized(locale.data, "Não foi possível reinterpretar agora. O original foi preservado.", "Could not reinterpret now. The original was preserved."),
    };
  }

  const jobKey = `entry-reprocess:${entryId.data}:${operationKey.data}`;
  const jobLookup = await supabase.from("jobs").select("id,status").eq("user_id", user.id).eq("idempotency_key", jobKey).maybeSingle();
  const job = jobLookup.data;

  after(async () => {
    if (job?.id && (job.status === "pending" || job.status === "failed")) {
      await kickEntryInterpretationWorker(supabase, job.id);
    }
    await recordProductEvent({
      name: "capture_processing_enqueued",
      surface: "interpretation_review",
      locale: locale.data,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: crypto.randomUUID(),
      subject: { type: "entry", id: entryId.data },
      properties: { processingMode: "reprocess" },
    }).catch(() => {});
  });

  refreshEntry(locale.data, entryId.data);
  return { status: "success", message: getDailyCycleCopy(locale.data).messages.reprocessing_queued };
}

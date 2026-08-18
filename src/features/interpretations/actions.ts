"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDailyCycleCopy } from "@/features/daily-cycle/copy";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { kickEntryInterpretationWorker } from "@/lib/jobs/entry-worker";
import { resolveLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import type { RevisionActionState } from "./revision-editor";
import type { ConfirmationActionState } from "./confirmation-panel";
import { parseCorrectionFormData } from "./form-parser";
import { buildCorrectionElementTrust } from "./trust-builders";
import { getAgentName } from "@/features/profile/agent-identity";

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
    // The strict locale parse may itself have failed, so fall back to the
    // resolved locale instead of hardcoding Portuguese for English users.
    return {
      status: "error",
      message: localized(
        resolveLocale(formData.get("locale")),
        "Revise os campos da correção.",
        "Review the correction fields.",
      ),
    };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: localized(locale.data, "Sua sessão expirou. Entre novamente.", "Your session expired. Sign in again.") };
  }
  await assertActiveAccount(supabase, user.id, locale.data);

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
  after(() => recordProductEvent({
    name: "interpretation_corrected",
    surface: "interpretation_review",
    locale: locale.data,
    viewportClass: "unknown",
    appVersion: "server",
    idempotencyKey: createProductEventIdempotencyKey("interpretation_corrected", operationKey),
    subject: { type: "entry", id: entryId },
    properties: { fieldCount: Object.keys(patch).length },
  }).catch(() => {}));
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
    return {
      status: "error",
      message: localized(resolveLocale(formData.get("locale")), "Ação inválida.", "Invalid action."),
    };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: localized(locale.data, "Sua sessão expirou.", "Your session expired.") };
  await assertActiveAccount(supabase, user.id, locale.data);
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
    return {
      status: "error",
      message: localized(resolveLocale(formData.get("locale")), "Ação inválida.", "Invalid action."),
    };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: localized(locale.data, "Sua sessão expirou.", "Your session expired.") };
  await assertActiveAccount(supabase, user.id, locale.data);

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
    const sideEffects: Promise<unknown>[] = [];
    if (job?.id && (job.status === "pending" || job.status === "failed")) {
      sideEffects.push(kickEntryInterpretationWorker(supabase, job.id));
    }
    sideEffects.push(recordProductEvent({
      name: "capture_processing_enqueued",
      surface: "interpretation_review",
      locale: locale.data,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey("capture_processing_enqueued", operationKey.data),
      subject: { type: "entry", id: entryId.data },
      properties: { processingMode: "reprocess" },
    }));
    await Promise.allSettled(sideEffects);
  });

  refreshEntry(locale.data, entryId.data);
  return { status: "success", message: getDailyCycleCopy(locale.data, await getAgentName()).messages.reprocessing_queued };
}

/**
 * Slice 2P.1 — the owner's positive act on an interpretation that has nothing
 * left to decide.
 *
 * There is no client-side status write and no second authority: this hands the
 * decision to `confirm_entry_interpretation`, which re-derives the entry's
 * lifecycle through the one central contract and refuses while any other
 * decision remains. The action never invents a status of its own.
 */
export async function confirmInterpretation(
  _state: ConfirmationActionState,
  formData: FormData,
): Promise<ConfirmationActionState> {
  const entryId = uuidSchema.safeParse(formData.get("entryId"));
  const interpretationId = uuidSchema.safeParse(formData.get("interpretationId"));
  const operationKey = z.string().min(8).max(260).safeParse(formData.get("operationKey"));
  const locale = localeSchema.safeParse(formData.get("locale"));
  if (!entryId.success || !interpretationId.success || !operationKey.success || !locale.success) {
    return {
      status: "error",
      message: localized(resolveLocale(formData.get("locale")), "Ação inválida.", "Invalid action."),
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: localized(locale.data, "Sua sessão expirou.", "Your session expired.") };
  }
  await assertActiveAccount(supabase, user.id, locale.data);

  const { data, error } = await supabase.rpc("confirm_entry_interpretation", {
    p_entry_id: entryId.data,
    p_expected_interpretation_id: interpretationId.data,
    p_operation_key: operationKey.data,
  });
  if (error) {
    // 55P03 is the only refusal the owner can act on, and it means either the
    // interpretation moved underneath them or a real decision is still open.
    const stale = error.code === "55P03";
    return {
      status: "error",
      message: stale
        ? localized(locale.data, "Ainda há algo a decidir nesta entrada.", "Something here still needs a decision.")
        : localized(locale.data, "Não foi possível confirmar.", "Could not confirm."),
    };
  }

  const result = (data ?? {}) as { undoId?: string; status?: string };
  // Deliberately NOT revalidating this entry's own page: refreshing the page
  // the owner is standing on destroys the undo control before it can be
  // pressed. The queue the entry has just left is refreshed; the terminal
  // state is reported here.
  revalidatePath(`/${locale.data}/app`);
  revalidatePath(`/${locale.data}/app/inbox`);
  return {
    status: "success",
    message: localized(locale.data, "Tudo resolvido nesta entrada.", "Everything here is resolved."),
    undoId: typeof result.undoId === "string" ? result.undoId : undefined,
  };
}

export async function undoInterpretationConfirmation(
  _state: ConfirmationActionState,
  formData: FormData,
): Promise<ConfirmationActionState> {
  const entryId = uuidSchema.safeParse(formData.get("entryId"));
  const undoId = uuidSchema.safeParse(formData.get("undoId"));
  const locale = localeSchema.safeParse(formData.get("locale"));
  if (!entryId.success || !undoId.success || !locale.success) {
    return {
      status: "error",
      message: localized(resolveLocale(formData.get("locale")), "Ação inválida.", "Invalid action."),
    };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: localized(locale.data, "Sua sessão expirou.", "Your session expired.") };
  }
  await assertActiveAccount(supabase, user.id, locale.data);
  const { error } = await supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  if (error) {
    return { status: "error", message: localized(locale.data, "Não foi possível desfazer.", "Could not undo.") };
  }
  refreshEntry(locale.data, entryId.data);
  return {
    status: "success",
    message: localized(locale.data, "Confirmação desfeita.", "Confirmation undone."),
  };
}

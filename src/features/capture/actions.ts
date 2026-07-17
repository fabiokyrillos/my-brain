"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { resolveDailyCycleLifecycle } from "@/features/daily-cycle/lifecycle";
import { toCaptureReceipt } from "@/features/daily-cycle/projection-mappers";
import { recordProductEvent } from "@/features/product-analytics/server";
import { kickEntryInterpretationWorker } from "@/lib/jobs/entry-worker";
import { createClient } from "@/lib/supabase/server";
import { captureEntrySchema } from "./schema";
import type { CaptureState } from "./quick-capture-form";

const captureRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  captureSource: z.enum(["home", "capture_page"]),
});

const sessionExpiredMessage = { "pt-BR": "Sua sessão expirou. Entre novamente.", en: "Your session expired. Sign in again." } as const;
const actionFailedMessage = { "pt-BR": "Não foi possível concluir esta ação agora.", en: "This action could not be completed right now." } as const;

type CaptureAsyncRow = { entry_id: string; status: string; replayed: boolean };

function isCaptureAsyncRow(value: unknown): value is CaptureAsyncRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.entry_id === "string" && typeof row.status === "string" && typeof row.replayed === "boolean";
}

export async function captureEntry(
  _state: CaptureState,
  formData: FormData,
): Promise<CaptureState> {
  const parsedEntry = captureEntrySchema.safeParse(Object.fromEntries(formData));
  const parsedRequest = captureRequestSchema.safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
    captureSource: formData.get("captureSource"),
  });
  if (!parsedEntry.success || !parsedRequest.success) {
    return {
      status: "error",
      code: "validation_failed",
      message: parsedEntry.error?.issues[0]?.message ?? "Revise a entrada.",
    };
  }
  const { content, locale, source } = parsedEntry.data;
  const { idempotencyKey, captureSource } = parsedRequest.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", code: "unauthenticated", message: sessionExpiredMessage[locale] };

  const startedAt = Date.now();
  const { data, error } = await supabase.rpc("capture_entry_async", {
    p_original_content: content,
    p_locale: locale,
    p_source: source,
    p_idempotency_key: idempotencyKey,
  });

  if (error || !isCaptureAsyncRow(data)) {
    after(() => {
      recordProductEvent({
        name: "capture_save_failed",
        surface: "capture",
        locale,
        viewportClass: "unknown",
        appVersion: "server",
        idempotencyKey: crypto.randomUUID(),
        properties: { captureSource, durationMs: Date.now() - startedAt, failureKind: "storage" },
      }).catch(() => {});
    });
    return { status: "error", code: "operation_failed", message: actionFailedMessage[locale] };
  }

  const { entry_id: entryId, replayed } = data;
  const jobKey = `entry-capture:${idempotencyKey}`;
  const [entrySnapshot, jobSnapshot] = await Promise.all([
    supabase.from("entries").select("status").eq("id", entryId).maybeSingle(),
    supabase.from("jobs").select("id,status,next_attempt_at").eq("user_id", user.id).eq("idempotency_key", jobKey).maybeSingle(),
  ]);

  const job = jobSnapshot.data;
  const lifecycle = resolveDailyCycleLifecycle({
    entryLifecycle: entrySnapshot.data?.status ?? "saved",
    job: job ? { status: job.status, retryAt: job.next_attempt_at } : null,
    now: new Date().toISOString(),
  });

  const receipt = toCaptureReceipt({
    entryId,
    persisted: true,
    productState: lifecycle.productState,
    messageKey: replayed ? "capture_replayed" : "capture_saved",
    safeHref: captureSource === "capture_page" ? `/${locale}/app/inbox/${entryId}` : undefined,
    replayed,
  });
  if (!receipt) return { status: "error", code: "operation_failed", message: actionFailedMessage[locale] };

  after(async () => {
    if (job?.id && (job.status === "pending" || job.status === "failed")) {
      await kickEntryInterpretationWorker(supabase, job.id);
    }
    await recordProductEvent({
      name: "capture_save_succeeded",
      surface: "capture",
      locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: crypto.randomUUID(),
      subject: { type: "entry", id: entryId },
      properties: { captureSource, durationMs: Date.now() - startedAt },
    }).catch(() => {});
    if (!replayed) {
      await recordProductEvent({
        name: "capture_processing_enqueued",
        surface: "capture",
        locale,
        viewportClass: "unknown",
        appVersion: "server",
        idempotencyKey: crypto.randomUUID(),
        subject: { type: "entry", id: entryId },
        properties: { processingMode: "initial" },
      }).catch(() => {});
    }
  });

  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/inbox`);
  return { status: "success", receipt };
}

"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { resolveDailyCycleLifecycle } from "@/features/daily-cycle/lifecycle";
import { toCaptureReceipt } from "@/features/daily-cycle/projection-mappers";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { quotaRefusalMessage } from "@/features/quotas/copy";
import { quotaRefusal } from "@/features/quotas/refusal";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { kickEntryInterpretationWorker } from "@/lib/jobs/entry-worker";
import { resolveLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { captureEntrySchema } from "./schema";
import type { CaptureState } from "./quick-capture-form";

const captureRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  // `composer` joins the two form surfaces with Slice 2G.3 (2G-CAPTURE-003).
  // It is its own value rather than a reuse of `global`: the funnel's whole
  // purpose is to say *where* a capture came from, and a composer capture and
  // a global-shortcut capture answer that question differently.
  captureSource: z.enum(["home", "capture_page", "composer"]),
});

const sessionExpiredMessage = { "pt-BR": "Sua sessão expirou. Entre novamente.", en: "Your session expired. Sign in again." } as const;
const actionFailedMessage = { "pt-BR": "Não foi possível concluir esta ação agora.", en: "This action could not be completed right now." } as const;
// `capture/schema.ts` writes its Zod messages in Portuguese only, so surfacing
// `issues[0].message` verbatim leaked Portuguese into the English product. The
// localized message is the fallback AND the ceiling: a raw validator message is
// never shown (ADR-036).
const invalidEntryMessage = { "pt-BR": "Revise a entrada.", en: "Review the entry." } as const;

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
      message: invalidEntryMessage[resolveLocale(formData.get("locale"))],
    };
  }
  const { content, locale, source } = parsedEntry.data;
  const { idempotencyKey, captureSource } = parsedRequest.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", code: "unauthenticated", message: sessionExpiredMessage[locale] };
  await assertActiveAccount(supabase, user.id, locale);

  const startedAt = Date.now();
  const { data, error } = await supabase.rpc("capture_entry_async", {
    p_original_content: content,
    p_locale: locale,
    p_source: source,
    p_idempotency_key: idempotencyKey,
  });

  if (error || !isCaptureAsyncRow(data)) {
    const saveDurationMs = Math.min(Date.now() - startedAt, 86_400_000);
    // SH-QUOTA-001/009. A ceiling firing is a normal outcome with its own
    // honest copy, not the generic failure — telling someone "this could not be
    // completed right now" when they have simply reached today's limit is the
    // product lying by vagueness.
    //
    // The product event stays content-free either way: `failureKind` is a
    // closed vocabulary and carries no text, no ceiling and no entry.
    const refusal = quotaRefusal(error);
    after(() => {
      recordProductEvent({
        name: "capture_save_failed",
        surface: "capture",
        locale,
        viewportClass: "unknown",
        appVersion: "server",
        idempotencyKey: createProductEventIdempotencyKey("capture_save_failed", idempotencyKey),
        properties: {
          captureSource,
          durationMs: saveDurationMs,
          failureKind: refusal ? "quota" : "storage",
        },
      }).catch(() => {});
    });
    if (refusal) {
      return {
        status: "error",
        code: "quota_exceeded",
        message: quotaRefusalMessage(locale, refusal),
      };
    }
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
    // The composer gets the link for the same reason the capture page does:
    // both leave the user somewhere other than the entry they just created, so
    // without it the entry is stored and unreachable from the acknowledgment
    // that announced it (2G-CAPTURE-001).
    safeHref:
      captureSource === "capture_page" || captureSource === "composer"
        ? `/${locale}/app/inbox/${entryId}`
        : undefined,
    replayed,
  });
  if (!receipt) return { status: "error", code: "operation_failed", message: actionFailedMessage[locale] };
  const saveDurationMs = Math.min(Date.now() - startedAt, 86_400_000);

  after(async () => {
    const sideEffects: Promise<unknown>[] = [];
    if (job?.id && (job.status === "pending" || job.status === "failed")) {
      sideEffects.push(kickEntryInterpretationWorker(supabase, job.id));
    }
    sideEffects.push(recordProductEvent({
      name: "capture_save_succeeded",
      surface: "capture",
      locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey("capture_save_succeeded", idempotencyKey),
      subject: { type: "entry", id: entryId },
      properties: { captureSource, durationMs: saveDurationMs },
    }));
    if (!replayed) {
      sideEffects.push(recordProductEvent({
        name: "capture_processing_enqueued",
        surface: "capture",
        locale,
        viewportClass: "unknown",
        appVersion: "server",
        idempotencyKey: createProductEventIdempotencyKey("capture_processing_enqueued", idempotencyKey),
        subject: { type: "entry", id: entryId },
        properties: { processingMode: "initial" },
      }));
    }
    await Promise.allSettled(sideEffects);
  });

  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/inbox`);
  return { status: "success", receipt };
}

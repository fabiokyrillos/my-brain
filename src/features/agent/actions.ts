"use server";

import { revalidatePath } from "next/cache";
import { formatInstant } from "@/lib/time/instant-format";
import { resolveOwnerTimeZone } from "@/lib/time/owner-timezone";
import { after } from "next/server";
import { z } from "zod";
import {
  buildCitationsEnvelope,
  REVIEW_REACH,
  supportKindForSource,
} from "@/features/conversation-sources/contracts";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { getTaskCommandCopy } from "@/features/task-commands/copy";
import { taskCommandUndoErrorDetailFor } from "@/features/task-commands/errors";
import { getByokCopy } from "@/features/byok/copy";
import { quotaRefusalMessage } from "@/features/quotas/copy";
import { quotaRefusal, type QuotaDetail } from "@/features/quotas/refusal";
import { admitRateLimitedOperation } from "@/features/rate-limits/server";
import { gateMessageKey, openAiGate } from "@/lib/byok/gate";
import { ATTACHMENT_LIMITS, QUOTAS } from "@/lib/quotas";
import { getAIProvider, type ChatSource } from "@/lib/ai";
import { resolveLocale, type Locale } from "@/lib/preferences";
import { assertActiveAccount } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { requireSupabaseSuccess } from "@/lib/supabase/result";
import { recordAIUsage } from "@/lib/ai/usage";
import type { Json } from "@/lib/supabase/database.types";
import { loadQuestionSuggestions } from "./question-preview-projection";
import { reviewWindow } from "./review-period";
import { findPresentedSuggestion } from "./question-suggestions";
import {
  normalizeQuestionResolutionCommand,
  parseSubmittedSuggestionId,
  serializeQuestionResolution,
  type QuestionAnswerOrigin,
  type QuestionConsequence,
  type QuestionResolutionCommand,
} from "./question-resolution-contract";
import type {
  AgentFormState,
  QuestionConsequenceStatus,
  QuestionResolutionCode,
  QuestionResolutionState,
  QuestionUndoState,
} from "./forms";

const localeSchema = z.enum(["pt-BR", "en"]);


type UploadCopy = {
  selectFile: string;
  tooLarge: string;
  unsupported: string;
  session: string;
  uploadFailed: string;
  registerFailed: string;
  notQueued: string;
  queued: string;
  analyzed: string;
};


const uploadCopy = {
  "pt-BR": {
    selectFile: "Selecione um arquivo.",
    tooLarge: "O arquivo ultrapassa 25 MB.",
    unsupported: "Formato não permitido.",
    session: "Sua sessão expirou.",
    uploadFailed: "Não foi possível enviar.",
    registerFailed: "Não foi possível registrar o arquivo.",
    notQueued: "O arquivo foi salvo, mas não entrou na fila de análise.",
    queued: "Arquivo privado enviado e enfileirado para nova tentativa.",
    analyzed: "Arquivo privado enviado e analisado.",
  },
  en: {
    selectFile: "Select a file.",
    tooLarge: "The file is larger than 25 MB.",
    unsupported: "This format is not allowed.",
    session: "Your session expired.",
    uploadFailed: "We could not upload it.",
    registerFailed: "We could not register the file.",
    notQueued: "The file was saved but did not enter the analysis queue.",
    queued: "Private file uploaded and queued for another attempt.",
    analyzed: "Private file uploaded and analyzed.",
  },
} satisfies Record<Locale, UploadCopy>;

/*
 * `createReminder` moved to `features/reminders/actions.ts` in slice 2P.7.
 *
 * Not a relocation for tidiness. The version that stood here converted its
 * `datetime-local` value with a bare `new Date(...)`, which resolves a
 * wall-clock string in the HOST zone — UTC on the server — so a reminder set
 * for 14:00 in Sao Paulo was stored as 14:00Z and would have fired three hours
 * early. The reschedule command had been resolving the same kind of value
 * against `profiles.timezone` since DEC-6, and `2P-REMINDER-003` requires the
 * two flows to share that validation rather than each keep its own.
 *
 * Deleted rather than left dormant: two ways to create a reminder is the
 * duplicated write path this repository removes on sight, and the one that
 * stayed is the one beside the converter.
 */

// Phase 2D — question resolution flows through the versioned, audited,
// undoable resolve_pending_question_vN family instead of a plain owner
// UPDATE (Slice 2D.1). Slice 2D.2 cuts the consumer over to
// resolve_pending_question_v2, which adds the deferred / dismissed /
// not_relevant dispositions to the same closed discriminated contract.
// Database outcomes map to stable localized codes; raw SQL text is never
// surfaced.
const questionOperationKeySchema = z.string().trim().min(8).max(240);

const questionResolutionKindSchema = z.enum(["answer", "deferred", "dismissed", "not_relevant"]);

const questionResolutionCopy = {
  "pt-BR": {
    validation: "Escreva uma resposta com até 4000 caracteres.",
    deferValidation: "Escolha uma data futura, em até um ano, para adiar.",
    invalid: "Ação inválida.",
    session: "Sua sessão expirou. Entre novamente.",
    stale: "A interpretação desta pergunta mudou. Atualize a página antes de resolver.",
    notOpen: "Esta pergunta não está mais aberta.",
    mismatch: "Esta tentativa não corresponde mais à resolução atual. Revise e tente novamente.",
    consequenceUnavailable: "Este registro já está sendo reinterpretado. Nada foi alterado — tente novamente depois.",
    failed: "Não foi possível concluir agora. Tente novamente.",
    answered: "Resposta registrada.",
    answeredWithReinterpretation: "Resposta registrada. A reinterpretação deste registro foi enfileirada.",
    deferred: "Pergunta adiada.",
    dismissed: "Pergunta descartada.",
    notRelevant: "Pergunta marcada como não relevante.",
    replayed: "Esta resolução já estava registrada.",
    undoInvalid: "Ação inválida.",
    undoFailed: "Não foi possível desfazer.",
    undoneAnswer: "Resposta desfeita. A pergunta voltou para a fila.",
    undoneResolution: "Resolução desfeita. A pergunta voltou para a fila.",
  },
  en: {
    validation: "Write an answer with up to 4000 characters.",
    deferValidation: "Pick a future date, within one year, to defer.",
    invalid: "Invalid action.",
    session: "Your session expired. Sign in again.",
    stale: "This question's interpretation changed. Refresh the page before resolving.",
    notOpen: "This question is no longer open.",
    mismatch: "This attempt no longer matches the current resolution. Review it and try again.",
    consequenceUnavailable: "This record is already being re-interpreted. Nothing changed — try again later.",
    failed: "Could not complete right now. Try again.",
    answered: "Answer recorded.",
    answeredWithReinterpretation: "Answer recorded. Re-interpretation of this record is queued.",
    deferred: "Question deferred.",
    dismissed: "Question dismissed.",
    notRelevant: "Question marked as not relevant.",
    replayed: "This resolution was already recorded.",
    undoInvalid: "Invalid action.",
    undoFailed: "Could not undo.",
    undoneAnswer: "Answer undone. The question returned to the queue.",
    undoneResolution: "Resolution undone. The question returned to the queue.",
  },
} as const;

type QuestionRpcError = { code?: string; message?: string; details?: string };

function questionResolutionFailure(
  code: Exclude<QuestionResolutionCode, "resolution_succeeded">,
  message: string,
  retryable: boolean,
): QuestionResolutionState {
  return {
    status: "error",
    code,
    message,
    resolution: null,
    snoozedUntil: null,
    consequence: null,
    consequenceStatus: null,
    undoId: null,
    replayed: false,
    retryable,
  };
}

function mapQuestionResolutionError(
  error: QuestionRpcError,
  copy: (typeof questionResolutionCopy)["pt-BR" | "en"],
  validationMessage: string,
): QuestionResolutionState {
  if (error.code === "42501" && error.message === "Authentication required") {
    return questionResolutionFailure("session_expired", copy.session, false);
  }
  if (error.code === "55P03") {
    return questionResolutionFailure("stale_interpretation", copy.stale, false);
  }
  if (error.code === "55000" || error.code === "P0002") {
    return questionResolutionFailure("not_open", copy.notOpen, false);
  }
  if (error.code === "P0001" && error.details === "2D_IDEMPOTENCY_MISMATCH") {
    return questionResolutionFailure("idempotency_mismatch", copy.mismatch, false);
  }
  // Slice 2D.4 — the confirmed consequence could not be applied truthfully
  // (reprocessing already queued/running for this entry). The whole
  // resolution rolled back, so nothing was answered and nothing was queued.
  if (error.code === "P0001" && error.details === "2D_CONSEQUENCE_UNAVAILABLE") {
    return questionResolutionFailure("consequence_unavailable", copy.consequenceUnavailable, true);
  }
  if (error.code === "22023") {
    return questionResolutionFailure("validation_error", validationMessage, false);
  }
  return questionResolutionFailure("retryable_failure", copy.failed, true);
}

const questionResolutionOutcomeSchema = z.enum(["answered", "deferred", "dismissed", "not_relevant"]);
const questionConsequenceSchema = z.enum(["none", "reinterpret"]);
const questionConsequenceStatusSchema = z.enum(["none", "reinterpretation_queued"]);

function readQuestionResolutionResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const resolution = questionResolutionOutcomeSchema.safeParse(result.resolution);
  const consequence = questionConsequenceSchema.safeParse(result.consequence);
  const consequenceStatus = questionConsequenceStatusSchema.safeParse(result.consequence_status);
  if (
    !resolution.success
    || !consequence.success
    || !consequenceStatus.success
    || typeof result.undo_id !== "string"
    || !z.string().uuid().safeParse(result.undo_id).success
    || typeof result.idempotent !== "boolean"
    || (result.snoozed_until !== undefined && typeof result.snoozed_until !== "string")
  ) {
    return null;
  }
  return {
    resolution: resolution.data,
    consequence: consequence.data,
    consequenceStatus: consequenceStatus.data,
    undoId: result.undo_id,
    idempotent: result.idempotent,
    snoozedUntil: typeof result.snoozed_until === "string" ? result.snoozed_until : null,
  };
}

// The answer action intentionally performs NO revalidation: any revalidatePath
// re-renders the current route in the same action response, which would drop
// the just-answered card from the open-questions list and unmount its undo
// control. Every question surface is dynamic (rendered per request), so the
// next navigation reflects the resolved queue anyway. Undo revalidates
// everything, returning the restored question to every surface immediately.
function refreshQuestionSurfaces() {
  for (const locale of ["pt-BR", "en"] as const) {
    revalidatePath(`/${locale}/app/questions`);
    revalidatePath(`/${locale}/app`);
    revalidatePath(`/${locale}/app/inbox`);
  }
}

export async function resolvePendingQuestion(
  _state: QuestionResolutionState,
  formData: FormData,
): Promise<QuestionResolutionState> {
  const localeResult = localeSchema.safeParse(formData.get("locale"));
  const locale = localeResult.success ? localeResult.data : "pt-BR";
  const copy = questionResolutionCopy[locale];

  const kindResult = questionResolutionKindSchema.safeParse(formData.get("kind"));
  if (!kindResult.success) {
    return questionResolutionFailure("validation_error", copy.invalid, false);
  }
  const kind = kindResult.data;
  const validationMessage = kind === "answer"
    ? copy.validation
    : kind === "deferred"
      ? copy.deferValidation
      : copy.invalid;

  const operationKey = questionOperationKeySchema.safeParse(formData.get("operationKey"));
  let command: QuestionResolutionCommand | null = null;
  try {
    const questionId = formData.get("questionId");
    // Slice 2D.4 — the consequence is validated here against the same closed
    // enum the database enforces. An absent field means `none`: answering
    // never applies a consequence implicitly. An unknown value is a
    // validation error, never a silent downgrade, so a tampered request can
    // never resolve the question under a consequence the user did not
    // confirm.
    const submittedConsequence = formData.get("consequence");
    command = normalizeQuestionResolutionCommand(
      kind === "answer"
        ? {
          questionId,
          kind,
          answer: formData.get("answer"),
          ...(submittedConsequence === null ? {} : { consequence: submittedConsequence }),
        }
        : kind === "deferred"
          ? { questionId, kind, snoozedUntil: formData.get("snoozedUntil") }
          : { questionId, kind },
    );
  } catch {
    command = null;
  }
  if (!localeResult.success || !operationKey.success || !command) {
    return questionResolutionFailure("validation_error", validationMessage, false);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return questionResolutionFailure("session_expired", copy.session, false);
  await assertActiveAccount(supabase, user.id, locale);

  // Slice 2D.3 — server-owned suggestion provenance. The browser submits only
  // a bounded suggestion id; the deterministic options are regenerated here
  // from owner-scoped data and the id must both have been presented for this
  // question and carry exactly the submitted answer. Anything else (forged id,
  // stale id, answer edited away from the chip) is recorded as `typed`. This
  // read performs no mutation and never changes the resolution itself.
  let answerOrigin: QuestionAnswerOrigin = "typed";
  if (command.kind === "answer") {
    const submittedSuggestionId = parseSubmittedSuggestionId(formData.get("suggestionId"));
    if (submittedSuggestionId) {
      const presented = await loadQuestionSuggestions(supabase, user.id, command.questionId, locale);
      if (findPresentedSuggestion(presented, submittedSuggestionId, command.answer)) {
        answerOrigin = "suggested";
      }
    }
  }

  // Slice 2D.4 cuts the consumer over to resolve_pending_question_v3, the
  // third version of the same long-lived family. `_v1` and `_v2` stay
  // byte-identical and callable, so reverting this application commit alone
  // is a complete rollback.
  const { data, error } = await supabase.rpc("resolve_pending_question_v3", {
    p_question_id: command.questionId,
    p_resolution: JSON.parse(serializeQuestionResolution(command)) as Json,
    p_operation_key: operationKey.data,
  });
  if (error) return mapQuestionResolutionError(error, copy, validationMessage);

  const result = readQuestionResolutionResult(data);
  if (!result) return questionResolutionFailure("retryable_failure", copy.failed, true);

  if (!result.idempotent) {
    const eventQuestionId = command.questionId;
    const eventOperationKey = operationKey.data;
    const eventResolution = result.resolution;
    const eventOrigin = answerOrigin;
    const consequenceApplied = result.consequenceStatus === "reinterpretation_queued";
    after(async () => {
      const observations: Promise<unknown>[] = [recordProductEvent(
        eventResolution === "answered"
          ? {
            name: "question_answered_basic",
            surface: "server",
            locale,
            viewportClass: "unknown",
            appVersion: "server",
            idempotencyKey: createProductEventIdempotencyKey("question_answered_basic", eventOperationKey),
            subject: { type: "pending_question", id: eventQuestionId },
            properties: { origin: eventOrigin },
          }
          : {
            name: "question_resolved",
            surface: "server",
            locale,
            viewportClass: "unknown",
            appVersion: "server",
            idempotencyKey: createProductEventIdempotencyKey("question_resolved", eventOperationKey),
            subject: { type: "pending_question", id: eventQuestionId },
            properties: { kind: eventResolution },
          },
      ).catch(() => {})];
      // Boolean-by-existence: the event carries no properties at all, so it
      // records only *that* a resolution applied the bounded reinterpretation
      // consequence — never the question, answer, interpretation, entry, or
      // job. Emitted only after the RPC persisted, and only for a genuinely
      // new (non-replayed) operation, keyed by the operation key.
      if (consequenceApplied) {
        observations.push(recordProductEvent({
          name: "question_reinterpret_applied",
          surface: "server",
          locale,
          viewportClass: "unknown",
          appVersion: "server",
          idempotencyKey: createProductEventIdempotencyKey("question_reinterpret_applied", eventOperationKey),
          subject: { type: "pending_question", id: eventQuestionId },
          properties: {},
        }).catch(() => {}));
      }
      await Promise.allSettled(observations);
    });
  }

  const successMessage = result.idempotent
    ? copy.replayed
    : result.resolution === "answered"
      ? result.consequenceStatus === "reinterpretation_queued"
        ? copy.answeredWithReinterpretation
        : copy.answered
      : result.resolution === "deferred"
        ? copy.deferred
        : result.resolution === "dismissed"
          ? copy.dismissed
          : copy.notRelevant;

  return {
    status: "success",
    code: "resolution_succeeded",
    message: successMessage,
    resolution: result.resolution,
    snoozedUntil: result.snoozedUntil,
    consequence: result.consequence satisfies QuestionConsequence,
    consequenceStatus: result.consequenceStatus satisfies QuestionConsequenceStatus,
    undoId: result.undoId,
    replayed: result.idempotent,
    retryable: false,
  };
}

// Retained export from Slice 2D.1: the answer flow is the same discriminated
// resolution contract with kind fixed to "answer".
export async function answerPendingQuestion(
  state: QuestionResolutionState,
  formData: FormData,
): Promise<QuestionResolutionState> {
  formData.set("kind", "answer");
  return resolvePendingQuestion(state, formData);
}

/**
 * The reason a `public.undo_operation` call failed, localized (PRD 2E-UPDATE-017).
 *
 * `public.undo_operation` is a shared router: it loads the operation by id, looks
 * its `action_type` up in `private.undo_operation_handlers` and calls whichever
 * private handler is registered. Migration `202607260058` registered two more —
 * `apply_task_command` and `apply_task_command_relation` — so from Slice 2E.4
 * onwards an undo submitted here can come back carrying a Phase 2E detail token
 * even though this action was written for pending questions. Without this branch
 * both of them collapse onto `copy.undoFailed` ("Could not undo."), which is the
 * one thing the user cannot act on: `2E_UNDO_RESTORE_INTEGRITY` means a newer
 * change would have been silently discarded (2E-UNDO-004), and the honest answer
 * names that rather than inviting a retry that will fail identically.
 *
 * The sentence comes from `task-commands/copy.ts`, keyed by the declared token, so
 * there is no second copy of the Phase 2E failure vocabulary here (2E-I18N-003).
 * Every other error keeps the pre-existing generic message — including `P0002` and
 * the router's three errcode-less raises — because none of them belongs to a
 * declared vocabulary this action could speak more precisely about.
 *
 * That this action can compensate a task-command operation at all is a property of
 * the shared router, not something introduced here. PRD 2E-UNDO-005 assigns Phase
 * 2E its own owner-scoped, task-scoped undo listing rather than stretching an
 * entry- or question-scoped surface to carry operations that have no question, and
 * this stays a faithful report either way.
 */
function mapUndoOperationFailure(
  error: { code?: string; details?: string },
  locale: Locale,
  fallback: string,
): string {
  const detail = taskCommandUndoErrorDetailFor(error.code, error.details);
  if (detail === null) return fallback;
  return getTaskCommandCopy(locale).failures[detail];
}

export async function undoQuestionResolution(
  _state: QuestionUndoState,
  formData: FormData,
): Promise<QuestionUndoState> {
  const localeResult = localeSchema.safeParse(formData.get("locale"));
  const locale = localeResult.success ? localeResult.data : "pt-BR";
  const copy = questionResolutionCopy[locale];
  const undoId = z.string().uuid().safeParse(formData.get("undoId"));
  if (!localeResult.success || !undoId.success) {
    return { status: "error", message: copy.undoInvalid };
  }
  // The undone resolution's kind only localizes the confirmation copy; it
  // never drives authorization or state (the database validates the stored
  // operation itself).
  const undoneKind = questionResolutionOutcomeSchema.safeParse(formData.get("resolution"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: copy.session };
  await assertActiveAccount(supabase, user.id, locale);

  const { error } = await supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  if (error) return { status: "error", message: mapUndoOperationFailure(error, locale, copy.undoFailed) };

  refreshQuestionSurfaces();
  return {
    status: "success",
    message: !undoneKind.success || undoneKind.data === "answered"
      ? copy.undoneAnswer
      : copy.undoneResolution,
  };
}

export async function markNotification(formData: FormData) {
  const parsed = z
    .object({
      locale: localeSchema,
      notificationId: z.string().uuid(),
      status: z.enum(["read", "dismissed"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await assertActiveAccount(supabase, user.id, parsed.data.locale);
  const result = await supabase
    .from("notifications")
    .update({
      status: parsed.data.status,
      read_at: parsed.data.status === "read" ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.notificationId)
    .eq("user_id", user.id);
  requireSupabaseSuccess(result, "update notification status");
  /*
    THE ROUTE PATTERN for the surface this slice changed, and the resolved path
    for the one it did not.

    `/app/notifications` lives under a dynamic `[locale]` segment, and the Next
    documentation is explicit that such a path needs the `type` parameter:
    without it the invalidation matches nothing, the row stays "unread" after
    the owner marks it read, and the count above the list does not move. Slice
    2P.4 measured exactly that failure on `/app/settings`.

    `/app` keeps its resolved form deliberately. Slice 2P.5's surfaces are
    Settings and Notifications; the cockpit is not one of them, and repairing a
    call site this slice cannot prove is a change nobody in this slice can
    defend. It is recorded with the other seventy-odd in the acceptance record's
    debt list instead.
  */
  revalidatePath("/[locale]/app/notifications", "page");
  revalidatePath(`/${parsed.data.locale}/app`);
  /*
    Slice 2S.3 adds the THIRD surface, and its absence was a real gap.
    `/app/inbox?view=needs-you` now holds the unanswered notices too, so an
    action taken on the history page left that queue showing a row the owner had
    already answered. `2S-ATTENTION-008` is exactly the property that forbids
    it: neither surface may hold a state the other contradicts.
  */
  revalidatePath(`/${parsed.data.locale}/app/inbox`);
}

// SH-QUOTA-006: the allowlist is not defined here any more. `ATTACHMENT_LIMITS`
// is the source, and `attachment-limits-parity.test.ts` proves the bucket and
// the CHECK constraint still agree with it.
const allowedMimeTypes = new Set<string>(ATTACHMENT_LIMITS.mimeAllowlist);
export async function uploadAttachment(
  _state: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const locale = localeSchema.safeParse(formData.get("locale"));
  const uploadMessages = uploadCopy[resolveLocale(formData.get("locale"))];
  const file = formData.get("file");
  if (!locale.success || !(file instanceof File) || file.size === 0)
    return { status: "error", message: uploadMessages.selectFile };
  if (file.size > ATTACHMENT_LIMITS.maxBytes)
    return { status: "error", message: uploadMessages.tooLarge };
  if (!allowedMimeTypes.has(file.type))
    return { status: "error", message: uploadMessages.unsupported };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: uploadMessages.session };
  await assertActiveAccount(supabase, user.id, locale.data);

  // SH-QUOTA-004: the refusal PRECEDES the storage write, which is the half of
  // the ceiling a database trigger cannot deliver. The trigger on `attachments`
  // would refuse the metadata row a moment later, but by then the object is
  // already in the bucket and only the compensation below removes it — and a
  // compensation that fails leaves exactly the orphan SH-DELETE-015 had to
  // clean up by hand. Refusing before the bytes move means there is nothing to
  // compensate.
  //
  // The aggregate is read from `attachments`, the same table the trigger counts,
  // so the two cannot disagree about what is stored. It is a check, not a lock:
  // two simultaneous uploads could both pass here, and the trigger — which does
  // hold an advisory lock — is what makes the ceiling true under concurrency.
  // This one exists to stop the ordinary case from writing an object it will
  // have to delete.
  const usage = await supabase
    .from("attachments")
    .select("size_bytes, created_at")
    .eq("user_id", user.id);
  if (usage.error) return { status: "error", message: uploadMessages.uploadFailed };
  const rows = usage.data ?? [];
  const utcDayStart = new Date();
  utcDayStart.setUTCHours(0, 0, 0, 0);
  const storedBytes = rows.reduce((total, row) => total + (row.size_bytes ?? 0), 0);
  const today = rows.filter((row) => new Date(row.created_at) >= utcDayStart).length;

  const refusedBy: QuotaDetail | null =
    storedBytes + file.size > QUOTAS.storageBytesPerUser
      ? "QUOTA_STORAGE_BYTES"
      : rows.length >= QUOTAS.storageObjectsPerUser
        ? "QUOTA_STORAGE_OBJECTS"
        : today >= QUOTAS.attachmentsPerDay
          ? "QUOTA_ATTACHMENTS_PER_DAY"
          : null;
  if (refusedBy)
    return { status: "error", message: quotaRefusalMessage(locale.data, refusedBy) };

  // 2H-RATE-001, PRD §14.2 V-2. "Accepted upload request" is what the signed
  // ceiling counts, so admission sits **here**: after everything that decides
  // whether this request is acceptable at all (size, type, session, lifecycle
  // and SH.6's storage ceilings) and before the bytes move. A request refused
  // above never reaches the limiter and spends nothing; a request refused here
  // leaves no Storage object and no `attachments` row, because neither has been
  // written yet — which is the same property SH-QUOTA-004 wanted from refusing
  // before the write, obtained for the same reason.
  const uploadAdmission = await admitRateLimitedOperation({
    client: supabase,
    bucket: "upload",
    locale: locale.data,
    operation: "file_upload",
  });
  if (!uploadAdmission.ok)
    return { status: "error", message: uploadAdmission.message };

  const safeName = file.name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-120);
  const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: storageError } = await supabase.storage
    .from("user-files")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (storageError)
    return { status: "error", message: uploadMessages.uploadFailed };
  const { data: attachment, error } = await supabase
    .from("attachments")
    .insert({
      user_id: user.id,
      storage_path: path,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      status: "uploaded",
    })
    .select("id")
    .single();
  if (error || !attachment) {
    // SH-QUOTA-004's compensation, verified rather than assumed: a failed
    // metadata write must not leave the object behind, and a failed *cleanup*
    // must be loud, because that is the only moment at which an orphan is
    // created and the only moment at which it is cheap to notice.
    const cleanup = await supabase.storage.from("user-files").remove([path]);
    if (cleanup.error)
      console.error("Attachment cleanup failed", { path, code: cleanup.error.name });

    // The trigger refuses under a race the pre-check could not see. Saying so
    // is more honest than "could not register the file".
    const refusal = quotaRefusal(error);
    return {
      status: "error",
      message: refusal
        ? quotaRefusalMessage(locale.data, refusal)
        : uploadMessages.registerFailed,
    };
  }
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      type: "process_attachment",
      payload: { attachment_id: attachment.id },
      idempotency_key: `attachment:${attachment.id}:process:v1`,
    })
    .select("id")
    .single();
  if (jobError || !job) {
    // SH-QUOTA-002 reaches this insert too — `jobs` carries the same trigger —
    // so a full queue reads as a full queue rather than as a failure to queue.
    const refusal = quotaRefusal(jobError);
    return {
      status: "error",
      message: refusal
        ? quotaRefusalMessage(locale.data, refusal)
        : uploadMessages.notQueued,
    };
  }
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) {
    revalidatePath(`/${locale.data}/app/files`);
    return {
      status: "success",
      message: uploadMessages.queued,
    };
  }
  const { error: invokeError } = await supabase.functions.invoke(
    "process-jobs",
    {
      body: { jobId: job.id },
      headers: session
        ? { authorization: `Bearer ${session.access_token}` }
        : {},
    },
  );
  revalidatePath(`/${locale.data}/app/files`);
  return {
    status: "success",
    message: invokeError ? uploadMessages.queued : uploadMessages.analyzed,
  };
}

const jobRetryMessages = {
  "pt-BR": {
    invalid: "Não foi possível tentar novamente.",
    session: "Sua sessão expirou.",
    unavailable: "O processamento não está disponível.",
    exhausted: "O limite de tentativas foi atingido.",
    completed: "Análise concluída.",
    processing: "A análise continua em processamento.",
    scheduled: "A tentativa falhou e uma nova janela foi programada.",
    retryAt: "Nova tentativa disponível em",
  },
  en: {
    invalid: "Could not retry.",
    session: "Your session expired.",
    unavailable: "Job is not available.",
    exhausted: "The retry limit has been reached.",
    completed: "Analysis completed.",
    processing: "Analysis is still processing.",
    scheduled: "The attempt failed and another retry window was scheduled.",
    retryAt: "Retry available",
  },
} as const;

export async function retryAttachmentJob(
  _state: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const parsed = z
    .object({
      locale: localeSchema,
      jobId: z.string().uuid(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      status: "error",
      message: jobRetryMessages["pt-BR"].invalid,
    };

  const messages = jobRetryMessages[parsed.data.locale];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: messages.session };
  await assertActiveAccount(supabase, user.id, parsed.data.locale);

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id,status,attempts,max_attempts,next_attempt_at")
    .eq("id", parsed.data.jobId)
    .eq("user_id", user.id)
    .eq("type", "process_attachment")
    .maybeSingle();
  if (jobError || !job)
    return { status: "error", message: messages.unavailable };
  if (job.status === "completed")
    return { status: "success", message: messages.completed };
  if (job.status === "exhausted" || job.attempts >= job.max_attempts)
    return { status: "error", message: messages.exhausted };
  if (job.status !== "failed")
    return { status: "success", message: messages.processing };

  const retryAt = new Date(job.next_attempt_at);
  if (retryAt.getTime() > Date.now()) {
    // `LDC-AGENT-001`. The sentence tells a user when to come back, so it has
    // to be their clock. It was the host's, which on a server is UTC.
    /*
     * `LDC-AGENT-001`. The sentence tells a user when to come back, so it has to
     * be their clock; it was the host's, which on a server is UTC.
     *
     * Read inline through the PURE resolver rather than through
     * `getOwnerTimeZone()`: that accessor imports `server-only`, and this module
     * is reached by tests running under the client condition, where that throws.
     * The client and the user are already in hand, so the read costs one query
     * on a path that has already made several.
     */
    const profile = await supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle();
    const formatted = formatInstant(
      job.next_attempt_at,
      "dayAndTime",
      parsed.data.locale,
      resolveOwnerTimeZone(profile.data?.timezone),
    ) ?? "";
    return {
      status: "error",
      message: `${messages.retryAt} ${formatted}.`,
    };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session)
    return { status: "error", message: messages.session };

  // 2H-RATE-001, PRD §14.2 V-4. This is a **user-initiated** retry, and V-4 is
  // explicit that those consume a new slot while bounded automatic worker
  // retries do not. The distinction is not "was it a retry" but "did a person
  // ask for it": an automatic attempt is the queue finishing work it was already
  // admitted for, and a person pressing the button is a new request for provider
  // time. Attachment claims deliberately carry no admission of their own, so
  // this is the only place the file-analysis path can be bounded.
  const retryAdmission = await admitRateLimitedOperation({
    client: supabase,
    bucket: "ai",
    locale: parsed.data.locale,
    operation: "process_attachment",
  });
  if (!retryAdmission.ok)
    return { status: "error", message: retryAdmission.message };

  const { error: invokeError } = await supabase.functions.invoke(
    "process-jobs",
    {
      body: { jobId: job.id },
      headers: { authorization: `Bearer ${session.access_token}` },
    },
  );
  revalidatePath(`/${parsed.data.locale}/app/files`);

  const { data: refreshed, error: refreshError } = await supabase
    .from("jobs")
    .select("status,next_attempt_at")
    .eq("id", job.id)
    .eq("user_id", user.id)
    .eq("type", "process_attachment")
    .maybeSingle();
  if (refreshError || !refreshed)
    return { status: "error", message: messages.unavailable };
  if (refreshed.status === "completed")
    return { status: "success", message: messages.completed };
  if (refreshed.status === "exhausted")
    return { status: "error", message: messages.exhausted };
  if (refreshed.status === "running")
    return { status: "success", message: messages.processing };
  if (invokeError || refreshed.status === "failed")
    return { status: "error", message: messages.scheduled };
  return { status: "error", message: messages.unavailable };
}

export async function generateReview(
  _state: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const requestedLocale = formData.get("locale") === "en" ? "en" : "pt-BR";
  const messages = requestedLocale === "pt-BR"
    ? {
        invalid: "Revisão inválida.",
        session: "Sua sessão expirou.",
        load: "Não foi possível carregar os dados da revisão.",
        empty: "Ainda não há atividade suficiente nesse período.",
        failed: "Não foi possível gerar a revisão agora.",
        completed: "Revisão concluída.",
      }
    : {
        invalid: "Invalid review.",
        session: "Your session expired.",
        load: "Could not load the review data.",
        empty: "There is not enough activity in this period yet.",
        failed: "Could not generate the review right now.",
        completed: "Review completed.",
      };
  const parsed = z
    .object({
      locale: localeSchema,
      period: z.enum(["daily", "weekly_review", "weekly_plan", "monthly"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: messages.invalid };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: messages.session };
  await assertActiveAccount(supabase, user.id, parsed.data.locale);
  const now = new Date();

  /*
   * `LDC-AGENT-002` — the period is **the owner's**, not the host's.
   *
   * This used to compute `start` with `setHours(0, 0, 0, 0)`, `getDay()`,
   * `getDate()`, `getFullYear()` and `getMonth()`: seven reads of the *host's*
   * calendar, which on a server is UTC. The owner's zone was fetched eleven
   * lines below, in the same batch, and used only to build the prompt — so the
   * review was told which zone the user lived in while being given the wrong
   * days to summarise.
   *
   * The profile is therefore read **first** now, and the window comes from the
   * contract rather than from arithmetic. Two round trips instead of one, which
   * is the honest cost of needing the zone before the query it parameterises.
   *
   * **This changes what a review contains**, and ADR-111 Decision 6 signed that
   * in advance: a daily review generated at 22:00 in São Paulo now covers that
   * day instead of tomorrow. No stored summary is rewritten or reprocessed.
   */
  const [profileResult, preferencesResult] = await Promise.all([
    supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("agent_preferences")
      .select("review_model,personality,tone,response_detail")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const timeZone = resolveOwnerTimeZone(profileResult.data?.timezone);
  /*
   * Monday-based weeks and day 1 of the owner's local month, both through the
   * contract — so a period beginning on a day whose local midnight does not
   * exist starts at the first instant that does.
   *
   * The computation lives in `review-period.ts` rather than here because
   * `"use server"` makes every export in this file an async Server Action: the
   * window could not be exported, so it could not be called with a fixed `now`,
   * so the one behaviour change ADR-111 signed had no test able to contradict
   * it. `review-period.test.ts` is that test, and it fails on both halves of a
   * regression to the host's calendar.
   */
  const { start, startDate, endDate } = reviewWindow(now, timeZone, parsed.data.period);

  const [entriesResult, tasksResult] = await Promise.all([
    supabase
      .from("entries")
      .select("id,original_content,occurred_at")
      .gte("occurred_at", start.toISOString())
      .lte("occurred_at", now.toISOString())
      .order("occurred_at")
      .limit(100),
    supabase
      .from("tasks")
      .select("id,title,status,due_at,updated_at")
      .gte("updated_at", start.toISOString())
      .order("updated_at")
      .limit(100),
  ]);
  if (
    entriesResult.error ||
    tasksResult.error ||
    profileResult.error ||
    preferencesResult.error
  ) {
    return {
      status: "error",
      message: messages.load,
    };
  }
  if (!(entriesResult.data?.length || tasksResult.data?.length))
    return {
      status: "error",
      message: messages.empty,
    };
  const sources: ChatSource[] = [
    ...(entriesResult.data ?? []).map((item) => ({
      id: `entry:${item.id}`,
      type: "entry" as const,
      content: item.original_content,
      occurredAt: item.occurred_at,
      similarity: 1,
    })),
    /*
     * `2Q-CITE-007` — **a task stops being called a memory.**
     *
     * This label used to read `memory:`, and the Phase 2P specification that
     * proposed persisting these references noted it in passing as "a misnomer"
     * without following it through. Followed through: `resolve-sources.ts`
     * resolves `memory` against the **`memories`** table, so persisting a task
     * uuid under that type makes every task citation degrade to "unavailable"
     * while every entry citation passes — the feature ships green and never
     * answers the one question the owner asked it to.
     *
     * The id prefix and the declared type are asserted **as a pair** by
     * `2Q-CITE-007`, because either one alone would satisfy the letter and lose
     * the behaviour.
     */
    ...(tasksResult.data ?? []).map((item) => ({
      id: `task:${item.id}`,
      type: "task" as const,
      content: `Tarefa: ${item.title}. Status: ${item.status}. Prazo: ${item.due_at ?? "sem prazo"}.`,
      occurredAt: item.updated_at,
      similarity: 1,
    })),
  ];
  const prompts = {
    daily:
      "Crie um resumo diário executivo com atividades, decisões, tarefas, pendências, bloqueios, itens aguardando e próximos passos.",
    weekly_review:
      "Crie uma revisão da semana com entregas, tarefas concluídas e abertas, bloqueios, projetos movimentados, pessoas com pendências e melhorias.",
    weekly_plan:
      "Crie um planejamento semanal com prioridades, prazos próximos, pendências, itens aguardando, riscos e foco sugerido.",
    monthly:
      "Crie uma revisão mensal com entregas, projetos, tarefas abertas, assuntos, bloqueios recorrentes e objetivos para o próximo mês.",
  };
  try {
    const preferences = preferencesResult.data;

    // BYOK gate. Review generation is the most expensive operation in the
    // product, so a gated user must reach it before the prompt is assembled and
    // before any network call — not after.
    const gate = await openAiGate(supabase, user.id);
    if (!gate.ok) {
      return {
        status: "error",
        message: getByokCopy(parsed.data.locale).messages[gateMessageKey(gate.reason)],
      };
    }

    // 2H-RATE-001. Immediately after the gate and before the prompt is
    // assembled, for the reason stated above it: a refusal must reach no
    // network, and the most expensive operation in the product is the one whose
    // ceiling matters most.
    const reviewAdmission = await admitRateLimitedOperation({
      client: supabase,
      bucket: "ai",
      locale: parsed.data.locale,
      operation: "chat_answer",
    });
    if (!reviewAdmission.ok)
      return { status: "error", message: reviewAdmission.message };

    const answer = await getAIProvider({
      credential: gate.credential.secret,
      model: preferences?.review_model ?? "gpt-5.6-terra",
    }).answerFromKnowledge({
      question: prompts[parsed.data.period],
      locale: parsed.data.locale,
      // The same resolved zone the window was built from, so the prompt cannot
      // describe a zone the period was not computed in.
      timezone: timeZone,
      sources,
      responseDetail: preferences?.response_detail ?? "short",
      agentStyle: `${preferences?.personality ?? "proactive"}, ${preferences?.tone ?? "direct"}`,
    });
    await recordAIUsage(supabase, {
      operation: "review",
      model: answer.model,
      userId: user.id,
      usage: answer,
      sourceType: "summary",
    });
    /*
     * `LDC-AGENT-002`. The summary's own dates were the **UTC** calendar days of
     * the two instants — so a review covering the owner's Tuesday could be
     * stored as Wednesday's. They now come from `reviewWindow` above, which is
     * the same computation the window itself came from: the labels and the
     * period they describe cannot drift apart.
     */
    const titleMap = parsed.data.locale === "pt-BR"
      ? { daily: "Resumo diário", weekly_review: "Revisão semanal", weekly_plan: "Planejamento semanal", monthly: "Revisão mensal" }
      : { daily: "Daily summary", weekly_review: "Weekly review", weekly_plan: "Weekly plan", monthly: "Monthly review" };
    /*
     * `2Q-CITE-004` — the references survive the write.
     *
     * Until Phase 2Q this action held `answer.citedSourceIds` and dropped them
     * here, so the review page had nothing to vouch for and passed an empty
     * allow-set: every link the model wrote collapsed into plain text, and the
     * page had to tell the owner it could not name the records.
     *
     * ## Three properties this shape carries, none of them incidental
     *
     * 1. **A fabricated id cannot get here.** `openai-provider.ts` filters the
     *    model's returned ids against `availableIds` — the set built from the
     *    rows *this request* read under RLS — before they reach this function.
     *    The `flatMap` below is the second, independent gate: an id with no
     *    matching source in `sources` produces no reference at all
     *    (`2Q-CITE-005`).
     * 2. **Nothing content-bearing is stored.** The reference is
     *    `{id, type, sourceId, support}` and `referenceSchema` is `.strict()`,
     *    so there is nowhere in the shape to put a title or an excerpt. That
     *    absence is the control, not a convention (`2Q-CITE-006`) — and it is
     *    why archiving or reclassifying a cited record cannot leave its text
     *    behind, which is the residual the legacy chat shape had to delete.
     * 3. **The write is the same write.** The envelope goes into the upsert
     *    that stores the review, so a review can never exist without the
     *    references it was written from, and regenerating **replaces** the
     *    envelope rather than accumulating envelopes — the conflict target is
     *    the same four columns as before (`2Q-CITE-009`).
     *
     * `REVIEW_REACH` rather than chat's: this action retrieves entries and
     * tasks (`OD-2Q-2`, signed option A). Stamping chat's reach would tell the
     * owner the Brain looked in their memories when it did not.
     */
    const references = answer.citedSourceIds.flatMap((id) => {
      const source = sources.find((item) => item.id === id);
      const sourceId = id.split(":")[1];
      if (!source || !sourceId) return [];
      return [{ id, type: source.type, sourceId, support: supportKindForSource(source.type) }];
    });
    const { error } = await supabase
      .from("summaries")
      .upsert(
        {
          user_id: user.id,
          period_type: parsed.data.period,
          period_start: startDate,
          period_end: endDate,
          title: titleMap[parsed.data.period],
          content: answer.answer,
          original_content: answer.answer,
          status: "generated",
          model: answer.model,
          input_tokens: answer.inputTokens,
          output_tokens: answer.outputTokens,
          generated_at: new Date().toISOString(),
          citations: buildCitationsEnvelope({
            // `2K-SRC-005`'s rule, applied here: insufficiency is a fact about
            // **retrieval**, never about how many sources the model chose to
            // cite. `sources` is non-empty by the time this line runs — the
            // action returns `messages.empty` above when neither query found
            // anything — so a review with zero citations honestly means "the
            // Brain had material and cited none of it".
            retrievedAnyQualifyingSource: sources.length > 0,
            sources: references,
            reach: REVIEW_REACH,
          }),
        },
        { onConflict: "user_id,period_type,period_start,period_end" },
      );
    if (error) throw error;
  } catch (error) {
    console.error(
      "Review generation failed",
      error instanceof Error ? error.message : "unknown error",
    );
    return {
      status: "error",
      message: messages.failed,
    };
  }
  revalidatePath(`/${parsed.data.locale}/app/reviews`);
  return { status: "success", message: messages.completed };
}

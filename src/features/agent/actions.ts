"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { getAIProvider, type ChatSource } from "@/lib/ai";
import { defaultAgentPreferences, resolveLocale } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { requireSupabaseSuccess } from "@/lib/supabase/result";
import { recordAIUsage } from "@/lib/ai/usage";
import type { Json } from "@/lib/supabase/database.types";
import { loadQuestionSuggestions } from "./question-preview-projection";
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

// Canonical localization mechanism (ADR-036): locale-keyed typed copy records,
// matching this file's existing `jobRetryMessages`. Reminder creation and
// attachment upload previously returned Portuguese-only results to English
// users even though both had already resolved the locale.
const reminderCopy = {
  "pt-BR": {
    invalid: "Revise o lembrete.",
    invalidDate: "Data inválida.",
    session: "Sua sessão expirou.",
    failed: "Não foi possível criar.",
    created: "Lembrete criado.",
  },
  en: {
    invalid: "Review the reminder.",
    invalidDate: "Invalid date.",
    session: "Your session expired.",
    failed: "We could not create it.",
    created: "Reminder created.",
  },
} as const;

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
} as const;

export async function createReminder(
  _state: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const parsed = z
    .object({
      locale: localeSchema,
      title: z.string().trim().min(1).max(500),
      remindAt: z.string().min(1),
      important: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  const reminderMessages = reminderCopy[resolveLocale(formData.get("locale"))];
  if (!parsed.success)
    return { status: "error", message: reminderMessages.invalid };
  const when = new Date(parsed.data.remindAt);
  if (Number.isNaN(when.getTime()))
    return { status: "error", message: reminderMessages.invalidDate };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: reminderMessages.session };
  const { error } = await supabase
    .from("reminders")
    .insert({
      user_id: user.id,
      title: parsed.data.title,
      remind_at: when.toISOString(),
      important: parsed.data.important === "on",
    });
  if (error) return { status: "error", message: reminderMessages.failed };
  revalidatePath(`/${parsed.data.locale}/app/reminders`);
  return { status: "success", message: reminderMessages.created };
}

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

  const { error } = await supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  if (error) return { status: "error", message: copy.undoFailed };

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
  const result = await supabase
    .from("notifications")
    .update({
      status: parsed.data.status,
      read_at: parsed.data.status === "read" ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.notificationId)
    .eq("user_id", user.id);
  requireSupabaseSuccess(result, "update notification status");
  revalidatePath(`/${parsed.data.locale}/app/notifications`);
  revalidatePath(`/${parsed.data.locale}/app`);
}

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
export async function uploadAttachment(
  _state: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const locale = localeSchema.safeParse(formData.get("locale"));
  const uploadMessages = uploadCopy[resolveLocale(formData.get("locale"))];
  const file = formData.get("file");
  if (!locale.success || !(file instanceof File) || file.size === 0)
    return { status: "error", message: uploadMessages.selectFile };
  if (file.size > 26214400)
    return { status: "error", message: uploadMessages.tooLarge };
  if (!allowedMimeTypes.has(file.type))
    return { status: "error", message: uploadMessages.unsupported };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: uploadMessages.session };
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
    const cleanup = await supabase.storage.from("user-files").remove([path]);
    if (cleanup.error) console.error("Attachment cleanup failed", cleanup.error.message);
    return {
      status: "error",
      message: uploadMessages.registerFailed,
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
  if (jobError || !job)
    return {
      status: "error",
      message: uploadMessages.notQueued,
    };
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
    const formatted = new Intl.DateTimeFormat(parsed.data.locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(retryAt);
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
  const now = new Date();
  let start = new Date(now);
  if (parsed.data.period === "daily") start.setHours(0, 0, 0, 0);
  else if (parsed.data.period.startsWith("weekly")) {
    const day = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const [entriesResult, tasksResult, profileResult, preferencesResult] =
    await Promise.all([
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
      supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("agent_preferences")
        .select("review_model,personality,tone,response_detail")
        .eq("user_id", user.id)
        .maybeSingle(),
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
    ...(tasksResult.data ?? []).map((item) => ({
      id: `memory:${item.id}`,
      type: "memory" as const,
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
    const answer = await getAIProvider({
      model: preferences?.review_model ?? "gpt-5.6-terra",
    }).answerFromKnowledge({
      question: prompts[parsed.data.period],
      locale: parsed.data.locale,
      timezone:
        profileResult.data?.timezone ?? defaultAgentPreferences.timezone,
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
    const startDate = start.toISOString().slice(0, 10);
    const endDate = now.toISOString().slice(0, 10);
    const titleMap = parsed.data.locale === "pt-BR"
      ? { daily: "Resumo diário", weekly_review: "Revisão semanal", weekly_plan: "Planejamento semanal", monthly: "Revisão mensal" }
      : { daily: "Daily summary", weekly_review: "Weekly review", weekly_plan: "Weekly plan", monthly: "Monthly review" };
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

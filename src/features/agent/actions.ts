"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import {
  createDailyCycleActionFailure,
  createDailyCycleActionSuccess,
  type DailyCycleActionResult,
} from "@/features/daily-cycle/action-result";
import { getAIProvider, type ChatSource } from "@/lib/ai";
import { kickEntryInterpretationWorker } from "@/lib/jobs/entry-worker";
import { defaultAgentPreferences } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";
import { requireSupabaseSuccess } from "@/lib/supabase/result";
import { recordAIUsage } from "@/lib/ai/usage";
import type { Json } from "@/lib/supabase/database.types";
import {
  normalizeQuestionResolutionCommand,
  serializeQuestionResolution,
  type QuestionResolutionCommand,
} from "./question-resolution-contract";
import type {
  AgentFormState,
  QuestionResolutionCode,
  QuestionResolutionState,
  QuestionUndoState,
} from "./forms";

const localeSchema = z.enum(["pt-BR", "en"]);

const retryProcessingJobSchema = z.object({
  locale: localeSchema,
  entryId: z.string().uuid(),
});

function refreshDailyCycleSurfaces(locale: "pt-BR" | "en", entryId: string) {
  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/inbox`);
  revalidatePath(`/${locale}/app/inbox/${entryId}`);
}

// Generalizes retry to interpret_entry jobs alongside the existing,
// attachment-only retryAttachmentJob below (left unchanged). Entries have
// automatic per-minute dispatch (Slice 2X.4), so an eligible failed job
// only needs a non-blocking kick; an exhausted job needs a fresh
// enqueue_entry_reprocessing job, since exhausted work is never re-claimed.
export async function retryProcessingJob(
  _state: DailyCycleActionResult | undefined,
  formData: FormData,
): Promise<DailyCycleActionResult> {
  const parsed = retryProcessingJobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return createDailyCycleActionFailure({ code: "validation_failed", messageKey: "validation_failed", retryable: false });
  }
  const { locale, entryId } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return createDailyCycleActionFailure({ code: "unauthenticated", messageKey: "session_expired", retryable: false });

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id,status,attempts,max_attempts,next_attempt_at")
    .eq("user_id", user.id)
    .eq("type", "interpret_entry")
    .eq("payload->>entry_id", entryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobError || !job) {
    return createDailyCycleActionFailure({ code: "not_found", messageKey: "item_not_found", retryable: false });
  }

  if (job.status === "exhausted") {
    const operationKey = crypto.randomUUID();
    const { error } = await supabase.rpc("enqueue_entry_reprocessing", {
      p_entry_id: entryId,
      p_operation_key: operationKey,
    });
    if (error) return createDailyCycleActionFailure({ code: "operation_failed", messageKey: "action_failed", retryable: true });

    const jobKey = `entry-reprocess:${entryId}:${operationKey}`;
    const freshJob = await supabase.from("jobs").select("id").eq("user_id", user.id).eq("idempotency_key", jobKey).maybeSingle();
    after(async () => {
      const sideEffects: Promise<unknown>[] = [recordProductEvent({
        name: "processing_retry_requested",
        surface: "interpretation_review",
        locale,
        viewportClass: "unknown",
        appVersion: "server",
        idempotencyKey: createProductEventIdempotencyKey("processing_retry_requested", job.id, String(job.attempts), "user"),
        subject: { type: "entry", id: entryId },
        properties: { retrySource: "user" },
      })];
      if (freshJob.data?.id) sideEffects.push(kickEntryInterpretationWorker(supabase, freshJob.data.id));
      await Promise.allSettled(sideEffects);
    });
    refreshDailyCycleSurfaces(locale, entryId);
    return createDailyCycleActionSuccess({ code: "retry_scheduled", messageKey: "retry_scheduled", entityId: entryId });
  }

  if (job.status === "failed") {
    const retryAt = job.next_attempt_at ? Date.parse(job.next_attempt_at) : Number.NaN;
    if (Number.isFinite(retryAt) && retryAt > Date.now()) {
      return createDailyCycleActionFailure({ code: "retry_not_available", messageKey: "retry_not_available", retryable: true });
    }
    after(async () => {
      await Promise.allSettled([
        kickEntryInterpretationWorker(supabase, job.id),
        recordProductEvent({
          name: "processing_retry_requested",
          surface: "interpretation_review",
          locale,
          viewportClass: "unknown",
          appVersion: "server",
          idempotencyKey: createProductEventIdempotencyKey("processing_retry_requested", job.id, String(job.attempts), "user"),
          subject: { type: "entry", id: entryId },
          properties: { retrySource: "user" },
        }),
      ]);
    });
    refreshDailyCycleSurfaces(locale, entryId);
    return createDailyCycleActionSuccess({ code: "retry_scheduled", messageKey: "retry_scheduled", entityId: entryId });
  }

  return createDailyCycleActionFailure({ code: "action_unavailable", messageKey: "action_unavailable", retryable: false });
}

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
  if (!parsed.success)
    return { status: "error", message: "Revise o lembrete." };
  const when = new Date(parsed.data.remindAt);
  if (Number.isNaN(when.getTime()))
    return { status: "error", message: "Data inválida." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sua sessão expirou." };
  const { error } = await supabase
    .from("reminders")
    .insert({
      user_id: user.id,
      title: parsed.data.title,
      remind_at: when.toISOString(),
      important: parsed.data.important === "on",
    });
  if (error) return { status: "error", message: "Não foi possível criar." };
  revalidatePath(`/${parsed.data.locale}/app/reminders`);
  return { status: "success", message: "Lembrete criado." };
}

// Phase 2D Slice 2D.1 — answering flows through the versioned, audited,
// undoable resolve_pending_question_v1 transition instead of a plain owner
// UPDATE. Database outcomes map to stable localized codes; raw SQL text is
// never surfaced.
const questionOperationKeySchema = z.string().trim().min(8).max(240);

const questionResolutionCopy = {
  "pt-BR": {
    validation: "Escreva uma resposta com até 4000 caracteres.",
    session: "Sua sessão expirou. Entre novamente.",
    stale: "A interpretação desta pergunta mudou. Atualize a página antes de responder.",
    notOpen: "Esta pergunta não está mais aberta.",
    mismatch: "Esta tentativa não corresponde mais à resposta atual. Revise e tente novamente.",
    failed: "Não foi possível responder agora. Tente novamente.",
    answered: "Resposta registrada.",
    replayed: "Esta resposta já estava registrada.",
    undoInvalid: "Ação inválida.",
    undoFailed: "Não foi possível desfazer.",
    undone: "Resposta desfeita. A pergunta voltou para a fila.",
  },
  en: {
    validation: "Write an answer with up to 4000 characters.",
    session: "Your session expired. Sign in again.",
    stale: "This question's interpretation changed. Refresh the page before answering.",
    notOpen: "This question is no longer open.",
    mismatch: "This attempt no longer matches the current answer. Review it and try again.",
    failed: "Could not answer right now. Try again.",
    answered: "Answer recorded.",
    replayed: "This answer was already recorded.",
    undoInvalid: "Invalid action.",
    undoFailed: "Could not undo.",
    undone: "Answer undone. The question returned to the queue.",
  },
} as const;

type QuestionRpcError = { code?: string; message?: string; details?: string };

function questionResolutionFailure(
  code: Exclude<QuestionResolutionCode, "resolution_succeeded">,
  message: string,
  retryable: boolean,
): QuestionResolutionState {
  return { status: "error", code, message, undoId: null, replayed: false, retryable };
}

function mapQuestionResolutionError(
  error: QuestionRpcError,
  copy: (typeof questionResolutionCopy)["pt-BR" | "en"],
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
  if (error.code === "22023") {
    return questionResolutionFailure("validation_error", copy.validation, false);
  }
  return questionResolutionFailure("retryable_failure", copy.failed, true);
}

function readQuestionResolutionResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (
    result.resolution !== "answered"
    || typeof result.undo_id !== "string"
    || !z.string().uuid().safeParse(result.undo_id).success
    || typeof result.idempotent !== "boolean"
  ) {
    return null;
  }
  return { undoId: result.undo_id, idempotent: result.idempotent };
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

export async function answerPendingQuestion(
  _state: QuestionResolutionState,
  formData: FormData,
): Promise<QuestionResolutionState> {
  const localeResult = localeSchema.safeParse(formData.get("locale"));
  const locale = localeResult.success ? localeResult.data : "pt-BR";
  const copy = questionResolutionCopy[locale];

  const operationKey = questionOperationKeySchema.safeParse(formData.get("operationKey"));
  let command: QuestionResolutionCommand | null = null;
  try {
    command = normalizeQuestionResolutionCommand({
      questionId: formData.get("questionId"),
      kind: "answer",
      answer: formData.get("answer"),
    });
  } catch {
    command = null;
  }
  if (!localeResult.success || !operationKey.success || !command) {
    return questionResolutionFailure("validation_error", copy.validation, false);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return questionResolutionFailure("session_expired", copy.session, false);

  const { data, error } = await supabase.rpc("resolve_pending_question_v1", {
    p_question_id: command.questionId,
    p_resolution: JSON.parse(serializeQuestionResolution(command)) as Json,
    p_operation_key: operationKey.data,
  });
  if (error) return mapQuestionResolutionError(error, copy);

  const result = readQuestionResolutionResult(data);
  if (!result) return questionResolutionFailure("retryable_failure", copy.failed, true);

  if (!result.idempotent) {
    const eventQuestionId = command.questionId;
    const eventOperationKey = operationKey.data;
    after(() => recordProductEvent({
      name: "question_answered_basic",
      surface: "server",
      locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey("question_answered_basic", eventOperationKey),
      subject: { type: "pending_question", id: eventQuestionId },
      properties: {},
    }).catch(() => {}));
  }

  return {
    status: "success",
    code: "resolution_succeeded",
    message: result.idempotent ? copy.replayed : copy.answered,
    undoId: result.undoId,
    replayed: result.idempotent,
    retryable: false,
  };
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: copy.session };

  const { error } = await supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  if (error) return { status: "error", message: copy.undoFailed };

  refreshQuestionSurfaces();
  return { status: "success", message: copy.undone };
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
  const file = formData.get("file");
  if (!locale.success || !(file instanceof File) || file.size === 0)
    return { status: "error", message: "Selecione um arquivo." };
  if (file.size > 26214400)
    return { status: "error", message: "O arquivo ultrapassa 25 MB." };
  if (!allowedMimeTypes.has(file.type))
    return { status: "error", message: "Formato não permitido." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sua sessão expirou." };
  const safeName = file.name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-120);
  const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: storageError } = await supabase.storage
    .from("user-files")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (storageError)
    return { status: "error", message: "Não foi possível enviar." };
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
      message: "Não foi possível registrar o arquivo.",
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
      message: "O arquivo foi salvo, mas não entrou na fila de análise.",
    };
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) {
    revalidatePath(`/${locale.data}/app/files`);
    return {
      status: "success",
      message: "Arquivo privado enviado e enfileirado para nova tentativa.",
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
    message: invokeError
      ? "Arquivo privado enviado e enfileirado para nova tentativa."
      : "Arquivo privado enviado e analisado.",
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

"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import {
  candidateEditArraySchema,
  selectedCandidateIndexesSchema,
  serializeCandidateEdits,
  type CandidateEditCommand,
} from "./candidate-edit-contract";
import {
  candidateResolutionArraySchema,
  normalizeCandidateResolutionCommand,
  serializeCandidateResolutions,
} from "./candidate-disposition-contract";
import type {
  ConfirmTasksCode,
  ConfirmTasksState,
  UndoTasksState,
} from "./task-candidate-form";

const entryIdSchema = z.string().uuid();
const interpretationIdSchema = z.string().uuid();
const operationKeySchema = z.string().uuid();
const localeSchema = z.enum(["pt-BR", "en"]);
const undoIdSchema = z.string().uuid();
const candidateIndexFormValueSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

type Locale = z.infer<typeof localeSchema>;
type RpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type ConfirmationRpcResult = {
  taskIds: string[];
  undoId: string;
  idempotent: boolean;
};

const confirmationCopy = {
  "pt-BR": {
    validation: "Revise as tarefas selecionadas e as edições.",
    unauthenticated: "Sua sessão expirou. Entre novamente.",
    stale: "A interpretação mudou. Atualize a página antes de confirmar.",
    contended: "A interpretação está sendo alterada. Atualize a página antes de confirmar.",
    mismatch: "Esta tentativa não corresponde mais às edições atuais. Revise e tente novamente.",
    materialized: "Uma destas tarefas já foi criada. Atualize a página antes de confirmar.",
    invalidRelation: "Um dos projetos, contextos ou pessoas selecionados não está mais disponível. Atualize a página e tente novamente.",
    recordOnly: "Esta versão é somente registro; não há tarefas para confirmar.",
    notFound: "Não encontramos este registro para confirmação.",
    failed: "Não foi possível criar as tarefas agora.",
    created: (count: number) => (
      count === 1 ? "1 tarefa criada." : `${count} tarefas criadas.`
    ),
  },
  en: {
    validation: "Review the selected tasks and edits.",
    unauthenticated: "Your session expired. Sign in again.",
    stale: "The interpretation changed. Refresh the page before confirming.",
    contended: "The interpretation is being changed. Refresh the page before confirming.",
    mismatch: "This attempt no longer matches the current edits. Review them and try again.",
    materialized: "One of these tasks was already created. Refresh the page before confirming.",
    invalidRelation: "One of the selected projects, contexts, or people is no longer available. Refresh the page and try again.",
    recordOnly: "This version is record-only; there are no tasks to confirm.",
    notFound: "We could not find this record for confirmation.",
    failed: "The tasks could not be created right now.",
    created: (count: number) => (
      count === 1 ? "1 task created." : `${count} tasks created.`
    ),
  },
} as const;

const resolutionCopy = {
  "pt-BR": {
    validation: "Revise as sugestões selecionadas e as decisões.",
    unauthenticated: "Sua sessão expirou. Entre novamente.",
    stale: "A interpretação mudou. Atualize a página antes de continuar.",
    contended: "A interpretação está sendo alterada. Atualize a página antes de continuar.",
    mismatch: "Esta tentativa não corresponde mais às decisões atuais. Revise e tente novamente.",
    resolved: "Uma destas sugestões já foi resolvida. Atualize a página antes de continuar.",
    invalidRelation: "Um dos projetos, contextos ou pessoas selecionados não está mais disponível. Atualize a página e tente novamente.",
    recordOnly: "Esta versão é somente registro; não há sugestões para resolver.",
    notFound: "Não encontramos este registro.",
    failed: "Não foi possível resolver as sugestões agora.",
    succeeded: (resolutionCount: number, taskCount: number) => {
      const resolutions = resolutionCount === 1
        ? "1 sugestão resolvida."
        : `${resolutionCount} sugestões resolvidas.`;
      const tasks = taskCount === 0
        ? "Nenhuma tarefa criada."
        : taskCount === 1
          ? "1 tarefa criada."
          : `${taskCount} tarefas criadas.`;
      return `${resolutions} ${tasks}`;
    },
  },
  en: {
    validation: "Review the selected suggestions and decisions.",
    unauthenticated: "Your session expired. Sign in again.",
    stale: "The interpretation changed. Refresh the page before continuing.",
    contended: "The interpretation is being changed. Refresh the page before continuing.",
    mismatch: "This attempt no longer matches the current decisions. Review them and try again.",
    resolved: "One of these suggestions was already resolved. Refresh the page before continuing.",
    invalidRelation: "One of the selected projects, contexts, or people is no longer available. Refresh the page and try again.",
    recordOnly: "This version is record-only; there are no suggestions to resolve.",
    notFound: "We could not find this record.",
    failed: "The suggestions could not be resolved right now.",
    succeeded: (resolutionCount: number, taskCount: number) => {
      const resolutions = resolutionCount === 1
        ? "1 suggestion resolved."
        : `${resolutionCount} suggestions resolved.`;
      const tasks = taskCount === 0
        ? "No tasks created."
        : taskCount === 1
          ? "1 task created."
          : `${taskCount} tasks created.`;
      return `${resolutions} ${tasks}`;
    },
  },
} as const;

function refreshTaskSurfaces(entryId: string) {
  revalidatePath("/pt-BR/app/work");
  revalidatePath("/en/app/work");
  revalidatePath("/pt-BR/app/tasks");
  revalidatePath("/en/app/tasks");
  revalidatePath("/pt-BR/app/inbox");
  revalidatePath("/en/app/inbox");
  revalidatePath(`/pt-BR/app/inbox/${entryId}`);
  revalidatePath(`/en/app/inbox/${entryId}`);
}

export async function confirmEntryTasks(
  _state: ConfirmTasksState,
  formData: FormData,
): Promise<ConfirmTasksState> {
  const localeResult = localeSchema.safeParse(formData.get("locale") ?? "pt-BR");
  const locale = localeResult.success ? localeResult.data : "pt-BR";
  const parsed = parseConfirmationForm(formData);

  if (!localeResult.success || !parsed.success) {
    return confirmationFailure(
      "validation_failed",
      confirmationCopy[locale].validation,
      false,
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return confirmationFailure(
      "unauthenticated",
      confirmationCopy[locale].unauthenticated,
      false,
    );
  }

  const { data, error } = await supabase.rpc("confirm_entry_task_candidates_v4", {
    p_entry_id: parsed.data.entryId,
    p_expected_interpretation_id: parsed.data.interpretationId,
    p_candidate_indexes: parsed.data.candidateIndexes,
    p_candidate_edits: parsed.data.candidateEdits,
    p_operation_key: parsed.data.operationKey,
  });

  if (error) {
    return mapConfirmationRpcError(error, locale);
  }

  const confirmation = readConfirmationRpcResult(data);
  if (!confirmation) {
    return confirmationFailure(
      "operation_failed",
      confirmationCopy[locale].failed,
      true,
    );
  }

  if (!confirmation.idempotent) {
    after(() => recordProductEvent({
      name: "task_candidates_confirmed",
      surface: "interpretation_review",
      locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey(
        "task_candidates_confirmed",
        parsed.data.operationKey,
      ),
      subject: { type: "entry", id: parsed.data.entryId },
      properties: {
        candidateCount: parsed.data.candidateIndexes.length,
        editedCandidateCount: parsed.data.editedCandidateCount,
        editedFieldCount: parsed.data.editedFieldCount,
      },
    }).catch(() => {}));
  }

  refreshTaskSurfaces(parsed.data.entryId);
  return {
    status: "success",
    code: "confirmed",
    message: confirmationCopy[locale].created(confirmation.taskIds.length),
    undoId: confirmation.undoId,
    replayed: confirmation.idempotent,
    retryable: false,
  };
}

export async function resolveEntryTaskCandidates(
  _state: ConfirmTasksState,
  formData: FormData,
): Promise<ConfirmTasksState> {
  const localeResult = localeSchema.safeParse(formData.get("locale") ?? "pt-BR");
  const locale = localeResult.success ? localeResult.data : "pt-BR";
  const parsed = parseResolutionForm(formData);

  if (!localeResult.success || !parsed.success) {
    return confirmationFailure(
      "validation_failed",
      resolutionCopy[locale].validation,
      false,
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return confirmationFailure(
      "unauthenticated",
      resolutionCopy[locale].unauthenticated,
      false,
    );
  }

  const { data, error } = await supabase.rpc("confirm_entry_task_candidates_v5", {
    p_entry_id: parsed.data.entryId,
    p_expected_interpretation_id: parsed.data.interpretationId,
    p_candidate_resolutions: parsed.data.candidateResolutions,
    p_candidate_edits: parsed.data.candidateEdits,
    p_operation_key: parsed.data.operationKey,
  });

  if (error) {
    return mapResolutionRpcError(error, locale);
  }

  const resolution = readConfirmationRpcResult(data, true);
  if (!resolution) {
    return confirmationFailure(
      "operation_failed",
      resolutionCopy[locale].failed,
      true,
    );
  }

  if (!resolution.idempotent && parsed.data.confirmedCandidateCount > 0) {
    after(() => recordProductEvent({
      name: "task_candidates_confirmed",
      surface: "interpretation_review",
      locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey(
        "task_candidates_confirmed",
        parsed.data.operationKey,
      ),
      subject: { type: "entry", id: parsed.data.entryId },
      properties: {
        candidateCount: parsed.data.confirmedCandidateCount,
        editedCandidateCount: parsed.data.editedCandidateCount,
        editedFieldCount: parsed.data.editedFieldCount,
      },
    }).catch(() => {}));
  }

  refreshTaskSurfaces(parsed.data.entryId);
  return {
    status: "success",
    code: "resolved",
    message: resolutionCopy[locale].succeeded(
      parsed.data.candidateResolutionCount,
      resolution.taskIds.length,
    ),
    undoId: resolution.undoId,
    replayed: resolution.idempotent,
    retryable: false,
  };
}

export async function undoAgentAction(
  _state: UndoTasksState,
  formData: FormData,
): Promise<UndoTasksState> {
  const undoId = undoIdSchema.safeParse(formData.get("undoId"));
  const rawEntryId = formData.get("entryId");
  const entryId = rawEntryId === null ? null : entryIdSchema.safeParse(rawEntryId);
  const localeResult = localeSchema.safeParse(formData.get("locale") ?? "pt-BR");
  const locale = localeResult.success ? localeResult.data : "pt-BR";
  const pt = locale === "pt-BR";
  if (
    !undoId.success
    || !localeResult.success
    || (entryId !== null && !entryId.success)
  ) {
    return { status: "error", message: pt ? "Ação inválida." : "Invalid action." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      status: "error",
      message: pt ? "Sua sessão expirou. Entre novamente." : "Your session expired. Sign in again.",
    };
  }

  const { error } = await supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  if (error) {
    return {
      status: "error",
      message: pt ? "Não foi possível desfazer." : "Could not undo.",
    };
  }

  revalidatePath("/pt-BR/app/tasks");
  revalidatePath("/en/app/tasks");
  revalidatePath("/pt-BR/app/work");
  revalidatePath("/en/app/work");
  revalidatePath("/pt-BR/app/inbox");
  revalidatePath("/en/app/inbox");
  if (entryId?.success) {
    revalidatePath(`/pt-BR/app/inbox/${entryId.data}`);
    revalidatePath(`/en/app/inbox/${entryId.data}`);
  }
  return {
    status: "success",
    message: pt ? "Alteração desfeita." : "Change undone.",
  };
}

function parseConfirmationForm(formData: FormData) {
  const entryId = entryIdSchema.safeParse(formData.get("entryId"));
  const interpretationId = interpretationIdSchema.safeParse(
    formData.get("interpretationId"),
  );
  const operationKey = operationKeySchema.safeParse(formData.get("operationKey"));
  const candidateIndexes = parseCandidateIndexes(formData.getAll("candidateIndex"));
  const candidateEdits = parseCandidateEdits(formData.get("candidateEdits"));

  if (
    !entryId.success
    || !interpretationId.success
    || !operationKey.success
    || !candidateIndexes.success
    || !candidateEdits.success
  ) {
    return { success: false as const };
  }

  const selectedIndexSet = new Set(candidateIndexes.data);
  if (candidateEdits.data.some((edit) => !selectedIndexSet.has(edit.candidateIndex))) {
    return { success: false as const };
  }

  const editCounts = computeCandidateEditCounts(candidateEdits.data);

  return {
    success: true as const,
    data: {
      entryId: entryId.data,
      interpretationId: interpretationId.data,
      operationKey: operationKey.data,
      candidateIndexes: candidateIndexes.data,
      candidateEdits: JSON.parse(serializeCandidateEdits(candidateEdits.data)) as Json,
      editedCandidateCount: editCounts.editedCandidateCount,
      editedFieldCount: editCounts.editedFieldCount,
    },
  };
}

function parseResolutionForm(formData: FormData) {
  const entryId = entryIdSchema.safeParse(formData.get("entryId"));
  const interpretationId = interpretationIdSchema.safeParse(
    formData.get("interpretationId"),
  );
  const operationKey = operationKeySchema.safeParse(formData.get("operationKey"));
  const candidateResolutions = parseJsonArray(
    formData.get("candidateResolutions"),
    candidateResolutionArraySchema,
  );
  const candidateEdits = parseCandidateEdits(formData.get("candidateEdits"));

  if (
    !entryId.success
    || !interpretationId.success
    || !operationKey.success
    || !candidateResolutions.success
    || !candidateEdits.success
  ) {
    return { success: false as const };
  }

  try {
    const canonical = normalizeCandidateResolutionCommand({
      resolutions: candidateResolutions.data,
      edits: candidateEdits.data,
    });
    const editCounts = computeCandidateEditCounts(canonical.edits);
    return {
      success: true as const,
      data: {
        entryId: entryId.data,
        interpretationId: interpretationId.data,
        operationKey: operationKey.data,
        candidateResolutionCount: canonical.resolutions.length,
        confirmedCandidateCount: canonical.resolutions.filter(
          ({ disposition }) => disposition === "confirmed",
        ).length,
        ...editCounts,
        candidateResolutions: JSON.parse(
          serializeCandidateResolutions(canonical.resolutions),
        ) as Json,
        candidateEdits: JSON.parse(serializeCandidateEdits(canonical.edits)) as Json,
      },
    };
  } catch {
    return { success: false as const };
  }
}

function computeCandidateEditCounts(
  edits: readonly CandidateEditCommand[],
): { editedCandidateCount: number; editedFieldCount: number } {
  let editedCandidateCount = 0;
  let editedFieldCount = 0;

  for (const edit of edits) {
    const fieldCount = Object.keys(edit.changes).length;
    if (fieldCount > 0) {
      editedCandidateCount += 1;
      editedFieldCount += fieldCount;
    }
  }

  return { editedCandidateCount, editedFieldCount };
}

function parseCandidateIndexes(values: FormDataEntryValue[]) {
  const parsedValues = values.map((value) => candidateIndexFormValueSchema.safeParse(value));
  if (parsedValues.some((result) => !result.success)) {
    return { success: false as const };
  }

  const parsed = selectedCandidateIndexesSchema.safeParse(
    parsedValues.map((result) => result.data),
  );
  if (!parsed.success) {
    return { success: false as const };
  }

  return {
    success: true as const,
    data: [...parsed.data].sort((left, right) => left - right),
  };
}

function parseCandidateEdits(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return { success: false as const };
  }

  try {
    const parsedJson: unknown = JSON.parse(value);
    const parsed = candidateEditArraySchema.safeParse(parsedJson);
    return parsed.success
      ? { success: true as const, data: parsed.data }
      : { success: false as const };
  } catch {
    return { success: false as const };
  }
}

function parseJsonArray<T>(
  value: FormDataEntryValue | null,
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false } },
) {
  if (typeof value !== "string") {
    return { success: false as const };
  }

  try {
    return schema.safeParse(JSON.parse(value) as unknown);
  } catch {
    return { success: false as const };
  }
}

function readConfirmationRpcResult(
  value: unknown,
  allowEmptyTaskIds = false,
): ConfirmationRpcResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const result = value as Record<string, unknown>;
  if (
    !Array.isArray(result.task_ids)
    || !result.task_ids.every((taskId) => typeof taskId === "string")
    || (!allowEmptyTaskIds && result.task_ids.length === 0)
    || typeof result.undo_id !== "string"
    || !undoIdSchema.safeParse(result.undo_id).success
    || typeof result.idempotent !== "boolean"
  ) {
    return null;
  }

  return {
    taskIds: result.task_ids,
    undoId: result.undo_id,
    idempotent: result.idempotent,
  };
}

function mapResolutionRpcError(
  error: RpcError,
  locale: Locale,
): ConfirmTasksState {
  const localized = resolutionCopy[locale];

  if (error.code === "55P03" && error.message === "Interpretation is no longer current") {
    return confirmationFailure("stale_interpretation", localized.stale, false);
  }
  if (
    error.code === "55P03"
    && error.message === "Interpretation changed; reload before saving"
  ) {
    return confirmationFailure("confirmation_contended", localized.contended, false);
  }
  if (error.code === "P0001" && error.details === "2C_IDEMPOTENCY_MISMATCH") {
    return confirmationFailure("idempotency_mismatch", localized.mismatch, false);
  }
  if (
    error.code === "P0001"
    && (
      error.details === "2C_TERMINAL_DISPOSITION"
      || error.details === "2C_ALREADY_RESOLVED"
      || error.details === "2C_ALREADY_MATERIALIZED"
    )
  ) {
    return confirmationFailure("already_materialized", localized.resolved, false);
  }
  if (error.code === "22023" && error.details === "2C_INVALID_RELATION") {
    return confirmationFailure("invalid_relation", localized.invalidRelation, false);
  }
  if (error.code === "22023") {
    return confirmationFailure("invalid_payload", localized.validation, false);
  }
  if (error.code === "55000" && error.message === "Interpretation is record-only") {
    return confirmationFailure("record_only", localized.recordOnly, false);
  }
  if (error.code === "P0002" && error.message === "Entry or interpretation not found") {
    return confirmationFailure("not_found", localized.notFound, false);
  }
  if (error.code === "42501" && error.message === "Authentication required") {
    return confirmationFailure("unauthenticated", localized.unauthenticated, false);
  }

  return confirmationFailure("operation_failed", localized.failed, true);
}

function mapConfirmationRpcError(
  error: RpcError,
  locale: Locale,
): ConfirmTasksState {
  const localized = confirmationCopy[locale];

  if (
    error.code === "55P03"
    && error.message === "Interpretation is no longer current"
  ) {
    return confirmationFailure("stale_interpretation", localized.stale, false);
  }
  if (
    error.code === "55P03"
    && error.message === "Interpretation changed; reload before saving"
  ) {
    return confirmationFailure("confirmation_contended", localized.contended, false);
  }
  if (
    error.code === "P0001"
    && error.details === "2C_IDEMPOTENCY_MISMATCH"
  ) {
    return confirmationFailure("idempotency_mismatch", localized.mismatch, false);
  }
  if (
    error.code === "P0001"
    && error.details === "2C_ALREADY_MATERIALIZED"
  ) {
    return confirmationFailure("already_materialized", localized.materialized, false);
  }
  if (
    error.code === "22023"
    && error.details === "2C_INVALID_RELATION"
  ) {
    return confirmationFailure("invalid_relation", localized.invalidRelation, false);
  }
  if (error.code === "22023") {
    return confirmationFailure("invalid_payload", localized.validation, false);
  }
  if (
    error.code === "55000"
    && error.message === "Interpretation is record-only"
  ) {
    return confirmationFailure("record_only", localized.recordOnly, false);
  }
  if (
    error.code === "P0002"
    && error.message === "Entry or interpretation not found"
  ) {
    return confirmationFailure("not_found", localized.notFound, false);
  }
  if (error.code === "42501" && error.message === "Authentication required") {
    return confirmationFailure("unauthenticated", localized.unauthenticated, false);
  }

  return confirmationFailure("operation_failed", localized.failed, true);
}

function confirmationFailure(
  code: Exclude<ConfirmTasksCode, "confirmed">,
  message: string,
  retryable: boolean,
): ConfirmTasksState {
  return {
    status: "error",
    code,
    message,
    undoId: null,
    retryable,
  };
}

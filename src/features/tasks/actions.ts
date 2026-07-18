"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type {
  ConfirmTasksState,
  UndoTasksState,
} from "./task-candidate-form";

const entryIdSchema = z.string().uuid();
const interpretationIdSchema = z.string().uuid();
const operationKeySchema = z.string().min(8).max(240);
const undoIdSchema = z.string().uuid();

function refreshTaskSurfaces(entryId: string) {
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
  const entryId = entryIdSchema.safeParse(formData.get("entryId"));
  const interpretationId = interpretationIdSchema.safeParse(formData.get("interpretationId"));
  const operationKey = operationKeySchema.safeParse(formData.get("operationKey"));
  const candidateIndexes = [...new Set(
    formData.getAll("candidateIndex")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0),
  )];

  if (!entryId.success || !interpretationId.success || !operationKey.success || candidateIndexes.length === 0) {
    return { status: "error", message: "Selecione pelo menos uma tarefa.", undoId: null };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Sua sessão expirou. Entre novamente.", undoId: null };
  }

  const { data, error } = await supabase.rpc("confirm_entry_task_candidates", {
    p_entry_id: entryId.data,
    p_expected_interpretation_id: interpretationId.data,
    p_candidate_indexes: candidateIndexes,
    p_operation_key: operationKey.data,
  });

  if (error) {
    // 55P03 (lock_not_available), not 40001: raising 40001 from this RPC was
    // found to hang until gateway timeout on the linked project, a platform
    // behavior unrelated to this code (see the migration 028 header comment
    // and DECISIONS.md).
    if (error.code === "55P03") {
      return { status: "error", message: "A interpretação mudou. Atualize a página antes de confirmar.", undoId: null };
    }
    if (error.code === "55000") {
      return { status: "error", message: "Esta versão é somente registro; não há tarefas para confirmar.", undoId: null };
    }
    return { status: "error", message: "Não foi possível criar as tarefas.", undoId: null };
  }

  const taskIds = data && typeof data === "object" && "task_ids" in data && Array.isArray(data.task_ids)
    ? data.task_ids
    : [];

  refreshTaskSurfaces(entryId.data);
  return {
    status: "success",
    message: taskIds.length === 1 ? "1 tarefa criada." : `${taskIds.length} tarefas criadas.`,
    undoId: data && typeof data === "object" && "undo_id" in data && typeof data.undo_id === "string"
      ? data.undo_id
      : null,
  };
}

export async function undoAgentAction(
  _state: UndoTasksState,
  formData: FormData,
): Promise<UndoTasksState> {
  const undoId = undoIdSchema.safeParse(formData.get("undoId"));
  if (!undoId.success) return { status: "error", message: "Ação inválida." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sua sessão expirou. Entre novamente." };

  const { error } = await supabase.rpc("undo_operation", { p_undo_id: undoId.data });
  if (error) return { status: "error", message: "Não foi possível desfazer." };

  revalidatePath("/pt-BR/app/tasks");
  revalidatePath("/en/app/tasks");
  return { status: "success", message: "Criação desfeita." };
}

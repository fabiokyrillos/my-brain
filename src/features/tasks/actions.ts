"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type {
  ConfirmTasksState,
  UndoTasksState,
} from "./task-candidate-form";

const entryIdSchema = z.string().uuid();
const undoIdSchema = z.string().uuid();

export async function confirmEntryTasks(
  _state: ConfirmTasksState,
  formData: FormData,
): Promise<ConfirmTasksState> {
  const entryId = entryIdSchema.safeParse(formData.get("entryId"));
  const candidateIndexes = formData.getAll("candidateIndex")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0);

  if (!entryId.success || candidateIndexes.length === 0) {
    return { status: "error", message: "Selecione pelo menos uma tarefa.", undoId: null };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Sua sessão expirou. Entre novamente.", undoId: null };
  }

  const { data, error } = await supabase.rpc("confirm_entry_tasks", {
    p_entry_id: entryId.data,
    p_candidate_indexes: [...new Set(candidateIndexes)],
  });

  if (error) {
    return { status: "error", message: "Não foi possível criar as tarefas.", undoId: null };
  }

  revalidatePath("/pt-BR/app/tasks");
  revalidatePath("/en/app/tasks");
  return {
    status: "success",
    message: candidateIndexes.length === 1 ? "1 tarefa criada." : `${candidateIndexes.length} tarefas criadas.`,
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

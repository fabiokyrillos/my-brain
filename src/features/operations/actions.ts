"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { createClient } from "@/lib/supabase/server";
import { requireSupabaseData, requireSupabaseSuccess } from "@/lib/supabase/result";
import type { CreateRecordState } from "./inline-create-form";

const createSchema = z.object({
  kind: z.enum(["task", "project", "person", "memory"]),
  locale: z.enum(["pt-BR", "en"]),
  name: z.string().trim().min(1).max(240),
});

export async function createRecord(
  _state: CreateRecordState,
  formData: FormData,
): Promise<CreateRecordState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Revise o nome." };
  if (parsed.data.kind !== "task" && parsed.data.kind !== "memory" && parsed.data.name.length > 160) {
    return { status: "error", message: "Use no máximo 160 caracteres." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sua sessão expirou." };

  let error: { message: string } | null = null;
  if (parsed.data.kind === "task") {
    ({ error } = await supabase.from("tasks").insert({
      user_id: user.id,
      title: parsed.data.name,
      status: "inbox",
      confidence: 1,
      created_by: "user",
    }));
  } else if (parsed.data.kind === "project") {
    ({ error } = await supabase.from("projects").insert({ user_id: user.id, name: parsed.data.name }));
  } else if (parsed.data.kind === "person") {
    ({ error } = await supabase.from("people").insert({ user_id: user.id, name: parsed.data.name }));
  } else {
    const { getAIProvider } = await import("@/lib/ai");
    const { recordAIUsage } = await import("@/lib/ai/usage");
    let embedding: number[] | null = null;
    let embeddingModel: string | null = null;
    try {
      const preferencesResult = await supabase.from("agent_preferences").select("embedding_model").eq("user_id", user.id).maybeSingle();
      const preferences = requireSupabaseData(preferencesResult, "load embedding preference");
      const result = await getAIProvider({ embeddingModel: preferences?.embedding_model ?? "text-embedding-3-small" }).embedText(parsed.data.name);
      embedding = result.embedding;
      embeddingModel = result.model;
      await recordAIUsage(supabase, { operation: "semantic_search", model: result.model, userId: user.id, usage: result, sourceType: "memory" });
    } catch (embeddingError) {
      console.error("Memory embedding failed", embeddingError instanceof Error ? embeddingError.message : "unknown error");
    }
    ({ error } = await supabase.from("memories").insert({
      user_id: user.id,
      content: parsed.data.name,
      kind: "fact",
      confidence: 1,
      embedding,
      embedding_model: embeddingModel,
    }));
  }

  if (error) {
    const duplicate = error.message.includes("duplicate") || error.message.includes("unique");
    return { status: "error", message: duplicate ? "Esse nome já existe." : "Não foi possível adicionar." };
  }

  const route = parsed.data.kind === "task" ? "tasks" : parsed.data.kind === "project" ? "projects" : parsed.data.kind === "person" ? "people" : "memories";
  revalidatePath(`/${parsed.data.locale}/app/${route}`);
  revalidatePath(`/${parsed.data.locale}/app`);
  if (parsed.data.kind === "task") {
    revalidatePath("/pt-BR/app/work");
    revalidatePath("/en/app/work");
  }
  return { status: "success", message: "Adicionado." };
}

const statusSchema = z.object({
  taskId: z.string().uuid(),
  locale: z.enum(["pt-BR", "en"]),
  status: z.enum(["inbox", "todo", "in_progress", "waiting", "blocked", "deferred", "completed", "cancelled"]),
  operationKey: z.string().uuid().optional(),
});

const workItemActionSchema = z.object({
  taskId: z.string().uuid(),
  locale: z.enum(["pt-BR", "en"]),
  action: z.enum(["complete_task", "wait_task", "resume_task", "reopen_task"]),
  operationKey: z.string().uuid(),
});

const statusByWorkItemAction = {
  complete_task: "completed",
  wait_task: "waiting",
  resume_task: "todo",
  reopen_task: "todo",
} as const;

async function persistTaskStatus(input: z.infer<typeof statusSchema> & { operationKey: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const currentResult = await supabase.from("tasks").select("status").eq("id", input.taskId).eq("user_id", user.id).maybeSingle();
  const currentStatus = statusSchema.shape.status.safeParse(currentResult.data?.status);

  const result = await supabase.from("tasks").update({
    status: input.status,
    completed_at: input.status === "completed" ? new Date().toISOString() : null,
    cancelled_at: input.status === "cancelled" ? new Date().toISOString() : null,
  }).eq("id", input.taskId).eq("user_id", user.id).select("id").maybeSingle();
  requireSupabaseSuccess(result, "update task status");

  if (result.data && currentStatus.success && currentStatus.data !== input.status) {
    after(() => recordProductEvent({
      name: "task_status_changed",
      surface: "work",
      locale: input.locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey("task_status_changed", input.operationKey),
      subject: { type: "task", id: input.taskId },
      properties: { fromStatus: currentStatus.data, toStatus: input.status },
    }).catch(() => {}));
  }

  for (const route of ["", "/today", "/tasks", "/waiting"]) {
    revalidatePath(`/${input.locale}/app${route}`);
  }
  revalidatePath("/pt-BR/app/work");
  revalidatePath("/en/app/work");
}

export async function updateTaskStatus(formData: FormData) {
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await persistTaskStatus({ ...parsed.data, operationKey: parsed.data.operationKey ?? crypto.randomUUID() });
}

export async function applyWorkItemAction(formData: FormData) {
  const parsed = workItemActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await persistTaskStatus({
    taskId: parsed.data.taskId,
    locale: parsed.data.locale,
    status: statusByWorkItemAction[parsed.data.action],
    operationKey: parsed.data.operationKey,
  });
}

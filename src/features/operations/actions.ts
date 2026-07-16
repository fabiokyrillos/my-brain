"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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
    let embedding: number[] | null = null;
    let embeddingModel: string | null = null;
    try {
      const result = await getAIProvider().embedText(parsed.data.name);
      embedding = result.embedding;
      embeddingModel = result.model;
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
  return { status: "success", message: "Adicionado." };
}

const statusSchema = z.object({
  taskId: z.string().uuid(),
  locale: z.enum(["pt-BR", "en"]),
  status: z.enum(["inbox", "todo", "in_progress", "waiting", "blocked", "deferred", "completed", "cancelled"]),
});

export async function updateTaskStatus(formData: FormData) {
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("tasks").update({
    status: parsed.data.status,
    completed_at: parsed.data.status === "completed" ? new Date().toISOString() : null,
    cancelled_at: parsed.data.status === "cancelled" ? new Date().toISOString() : null,
  }).eq("id", parsed.data.taskId).eq("user_id", user.id);

  for (const route of ["", "/today", "/tasks", "/waiting"]) {
    revalidatePath(`/${parsed.data.locale}/app${route}`);
  }
}

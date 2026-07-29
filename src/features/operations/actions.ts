"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createProductEventIdempotencyKey, recordProductEvent } from "@/features/product-analytics/server";
import { buildTaskCommandAppliedProperties } from "@/features/task-commands/analytics";
import { TaskCommandApplyError } from "@/features/task-commands/apply";
import { TaskCandidateQueryError } from "@/features/task-commands/candidates";
import { getTaskCommandCopy } from "@/features/task-commands/copy";
import type { TaskCommandOutcome } from "@/features/task-commands/outcomes";
import { WORK_SURFACE_ACTIONS } from "@/features/task-commands/taxonomy";
import { WorkCommandInputError, applyWorkCommand } from "@/features/task-commands/work-command";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentPreferences, locales, resolveLocale, type Locale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { CreateRecordState } from "./inline-create-form";
import { idleWorkItemActionState, type WorkItemActionState } from "./work-action-state";
import { getWorkActionsCopy } from "./work-actions-copy";

const createSchema = z.object({
  kind: z.enum(["task", "project", "person", "memory"]),
  locale: z.enum(locales),
  name: z.string().trim().min(1).max(240),
});

type CreateRecordCopy = {
  invalidName: string;
  nameTooLong: string;
  sessionExpired: string;
  duplicateName: string;
  createFailed: string;
  created: string;
};

// Canonical localization mechanism (ADR-036). Every message below used to be
// Portuguese-only and reached English users verbatim.
const createRecordCopy = {
  "pt-BR": {
    invalidName: "Revise o nome.",
    nameTooLong: "Use no máximo 160 caracteres.",
    sessionExpired: "Sua sessão expirou.",
    duplicateName: "Esse nome já existe.",
    createFailed: "Não foi possível adicionar.",
    created: "Adicionado.",
  },
  en: {
    invalidName: "Review the name.",
    nameTooLong: "Use at most 160 characters.",
    sessionExpired: "Your session expired.",
    duplicateName: "That name already exists.",
    createFailed: "We could not add this.",
    created: "Added.",
  },
} satisfies Record<Locale, CreateRecordCopy>;

export async function createRecord(
  _state: CreateRecordState,
  formData: FormData,
): Promise<CreateRecordState> {
  // Resolved first and independently so the validation failure below is
  // localized too — it happens before the input schema succeeds.
  const copy = createRecordCopy[resolveLocale(formData.get("locale"))];

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: copy.invalidName };
  if (parsed.data.kind !== "task" && parsed.data.kind !== "memory" && parsed.data.name.length > 160) {
    return { status: "error", message: copy.nameTooLong };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: copy.sessionExpired };

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
    return { status: "error", message: duplicate ? copy.duplicateName : copy.createFailed };
  }

  const route = parsed.data.kind === "task" ? "tasks" : parsed.data.kind === "project" ? "projects" : parsed.data.kind === "person" ? "people" : "memories";
  revalidatePath(`/${parsed.data.locale}/app/${route}`);
  revalidatePath(`/${parsed.data.locale}/app`);
  if (parsed.data.kind === "task") {
    revalidatePath("/pt-BR/app/work");
    revalidatePath("/en/app/work");
  }
  return { status: "success", message: copy.created };
}

/**
 * The Work surface's four buttons, as a validated request (2F-SURFACE-001).
 *
 * `title` is the row's rendered title, carried as the resolution *query hint*
 * and nothing else — never as a gate. 2F-SURFACE-004 makes the clicked
 * `task_id` authoritative, so a title that drifted since render does not by
 * itself refuse, and the outcome renders the title resolution returned rather
 * than this one.
 *
 * There is no `status` field, and that is the point. The deleted `statusSchema`
 * admitted all eight statuses including `cancelled`, which made the Work surface
 * an unconfirmed route to the transition `cancel_task` exists to guard
 * (2F-SURFACE-012). The destination is now decided by the taxonomy through
 * `WORK_ACTION_MAPPING`, and `set_status`'s `allowedTargetValues` closes the
 * route structurally.
 */
const workItemActionSchema = z.object({
  taskId: z.string().uuid(),
  locale: z.enum(locales),
  action: z.enum(WORK_SURFACE_ACTIONS),
  title: z.string().max(4000),
  operationKey: z.string().uuid(),
});

function settled(
  partial: Partial<WorkItemActionState> & Pick<WorkItemActionState, "status" | "heading" | "detail">,
): WorkItemActionState {
  return {
    ...idleWorkItemActionState,
    ...partial,
    // The heading and the detail together are what a screen-reader user needs:
    // the outcome, and why. Overridden only where the visual text alone would be
    // ambiguous read aloud.
    announcement: partial.announcement ?? `${partial.heading}. ${partial.detail}`,
  };
}

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies one Work-surface click through `public.apply_task_command`.
 *
 * **Every branch resolves to a rendered state; nothing throws out of here**
 * (2F-SURFACE-011). The modules this calls signal a caller defect by throwing —
 * `work-command.ts`, `candidates.ts` and `apply.ts` all do — and an escaped throw
 * would render the error boundary and take the user's whole list with it. Known
 * precondition faults become the honest "something went wrong, nothing changed"
 * state; anything unknown is re-thrown, because swallowing it would hide a real
 * defect behind a product message.
 */
export async function applyWorkItemAction(
  _previous: WorkItemActionState,
  formData: FormData,
): Promise<WorkItemActionState> {
  const locale = resolveLocale(formData.get("locale"));
  const copy = getWorkActionsCopy(locale);
  const commandCopy = getTaskCommandCopy(locale);

  const parsed = workItemActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return settled({
      status: "failed",
      heading: commandCopy.outcomes.refused.title,
      detail: copy.unexpected,
      retryable: true,
    });
  }
  const request = parsed.data;

  const { supabase, user } = await requireUser(locale);
  // The caller's own zone, read the way `work-projection.ts` and
  // `task-commands/actions.ts` read it. Required by `validateTaskCommand`; no
  // Work verb carries a temporal phrase, but a zone this process guessed would
  // still be a guess recorded in a validated command.
  const profile = await supabase.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
  const timeZone = isValidTimeZone(profile.data?.timezone)
    ? profile.data.timezone
    : defaultAgentPreferences.timezone;

  let outcome: Awaited<ReturnType<typeof applyWorkCommand>>;
  try {
    outcome = await applyWorkCommand(supabase, {
      ownerId: user.id,
      taskId: request.taskId,
      title: request.title,
      action: request.action,
      operationKey: request.operationKey,
      now: new Date(),
      timeZone,
    });
  } catch (error) {
    const known =
      error instanceof WorkCommandInputError
      || error instanceof TaskCommandApplyError
      || error instanceof TaskCandidateQueryError;
    if (!known) throw error;
    return settled({
      status: "failed",
      taskId: request.taskId,
      action: request.action,
      heading: commandCopy.outcomes.refused.title,
      detail: copy.unexpected,
      retryable: true,
    });
  }

  if (outcome.status === "refused") {
    // 2F-SURFACE-005: the clicked id was not in the resolution result, or the row
    // no longer admits the action. Blind overwrite is retired — this is the
    // localized refresh affordance in its place.
    const refusal = copy.refusals[outcome.refusal];
    return settled({
      status: "refused",
      taskId: request.taskId,
      action: request.action,
      heading: refusal.title,
      detail: refusal.description,
      refreshable: true,
      retryable: true,
    });
  }

  const { result, resolution } = outcome;
  // 2F-SURFACE-004: the title resolution returned, never the one the row was
  // rendered with.
  const title = resolution.preState.title;

  if (result.outcome === "applied" || result.outcome === "no_change") {
    emitApplied(locale, request.operationKey, result.outcome, result.outcome === "applied" && result.replayed);
    if (result.outcome === "applied") {
      emitStatusChanged(locale, request, resolution.preState.status, resolution.canonicalPatch.status);
      refreshWorkSurfaces(locale);
    }
    const outcomeCopy = commandCopy.outcomes[result.outcome];
    return settled({
      status: result.outcome,
      taskId: request.taskId,
      action: request.action,
      title,
      heading: outcomeCopy.title,
      detail: outcomeCopy.description,
    });
  }

  emitApplied(locale, request.operationKey, result.outcome, false);
  return settled({
    status: "failed",
    taskId: request.taskId,
    action: request.action,
    heading: commandCopy.outcomes[result.outcome].title,
    detail: commandCopy.failures[result.failure],
    // A staleness failure is a refusal the user acts on by reloading, so it
    // carries the same affordance the resolution refusals do.
    refreshable: result.failure === "stale_pre_state" || result.failure === "task_not_found",
    retryable: result.retryable,
  });
}

/**
 * 2F-ANALYTICS-002 — the surface reports through the **existing**
 * `task_command_applied` event with `commandOrigin: 'work'`.
 *
 * `202607280061:434` already constrains that property to `array['chat','work']`,
 * so no allowlist is widened, no event is invented and no migration exists on
 * this path. The `surface` stays `task_command`, the same value the chat mount
 * sends: `surface` names the *event family* and `commandOrigin` names the mount,
 * and splitting the family by surface would make 2F.5's reader query two places
 * for one measurement.
 *
 * `applyRoute` is `direct` because there is no separate confirmation step —
 * none of the four Work verbs is destructive.
 */
function emitApplied(
  locale: Locale,
  operationKey: string,
  outcome: TaskCommandOutcome,
  replayed: boolean,
): void {
  after(() => {
    recordProductEvent({
      name: "task_command_applied",
      surface: "task_command",
      locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey("task_command_applied", `${operationKey}:direct`),
      properties: buildTaskCommandAppliedProperties({
        origin: "work",
        outcome,
        route: "direct",
        replayed,
      }) as unknown as Record<string, unknown>,
    }).catch(() => {});
  });
}

/**
 * 2F-ANALYTICS-001 — `task_status_changed` continues from the consolidated path
 * with its current allowlisted shape (`{fromStatus, toStatus}`, surface `work`,
 * subject the task).
 *
 * `fromStatus` is the click-time resolved pre-state rather than a separate read,
 * and `toStatus` is the canonical patch's status — so the pair the event reports
 * is the pair the fingerprint bound. Emitted only on `applied`: a `no_change`
 * moved nothing, and the pre-2F path likewise emitted nothing when the status was
 * already what was asked for.
 */
function emitStatusChanged(
  locale: Locale,
  request: { readonly taskId: string; readonly operationKey: string },
  fromStatus: string,
  toStatus: string | undefined,
): void {
  if (toStatus === undefined || fromStatus === toStatus) return;
  after(() => {
    recordProductEvent({
      name: "task_status_changed",
      surface: "work",
      locale,
      viewportClass: "unknown",
      appVersion: "server",
      idempotencyKey: createProductEventIdempotencyKey("task_status_changed", request.operationKey),
      subject: { type: "task", id: request.taskId },
      properties: { fromStatus, toStatus },
    }).catch(() => {});
  });
}

/** The same six routes `persistTaskStatus` revalidated, unchanged. */
function refreshWorkSurfaces(locale: Locale): void {
  for (const route of ["", "/today", "/tasks", "/waiting"]) {
    revalidatePath(`/${locale}/app${route}`);
  }
  revalidatePath("/pt-BR/app/work");
  revalidatePath("/en/app/work");
}

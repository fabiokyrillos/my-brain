import "server-only";
import type { Locale } from "@/lib/preferences";
import { defaultAgentPreferences } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";
import type { WorkItemView } from "./contracts";
import { toWorkItemView } from "./projection-mappers";
import { loadTaskRelations, taskDetailHref } from "./work-projection";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** One recorded change to this task, already reduced to something a person reads. */
export type TaskHistoryEntry = {
  readonly id: string;
  readonly actionType: string;
  /** Who caused it. Rendered as a named actor, never as the raw column value. */
  readonly actor: "you" | "brain" | "system";
  readonly reason: string | null;
  readonly occurredAt: string;
};

export type TaskProvenance = {
  readonly entryId: string;
  readonly preview: string;
  readonly occurredAt: string;
};

export type TaskDetailProjection = {
  readonly task: WorkItemView;
  /**
   * The task's own `tasks.status`, alongside the projected `humanState`.
   *
   * Both, because they answer different questions and neither substitutes for
   * the other. `humanState` is what a person reads and is deliberately lossy —
   * `inbox` and `todo` both render as "not started", and there is no member for
   * `cancelled` at all. `detailControlsFor` asks the taxonomy which actions a
   * status admits, and that question can only be answered against the literal
   * the eligibility table is written in. Reconstructing it from `humanState`
   * would be guessing at exactly the point where a wrong guess offers a control
   * the RPC will refuse.
   */
  readonly status: string;
  readonly timezone: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  /** What the user originally wrote, when the task came from a capture. */
  readonly provenance: TaskProvenance | null;
  readonly history: readonly TaskHistoryEntry[];
};

const HISTORY_LIMIT = 25;
const PREVIEW_LENGTH = 400;

/**
 * `audit_logs.actor` reduced to the three the product actually distinguishes.
 *
 * The column is free text written by several call sites, so an unrecognised
 * value becomes `system` rather than being printed. Rendering the raw value is
 * what UX-21 is about, and "who changed this" is exactly the question where a
 * leaked internal token is least acceptable.
 */
function toActor(value: unknown): TaskHistoryEntry["actor"] {
  if (value === "user") return "you";
  if (value === "agent" || value === "brain") return "brain";
  return "system";
}

function toPreview(content: unknown): string {
  const text = typeof content === "string" ? content.trim() : "";
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
}

/**
 * One task, everything already recorded about it, and nothing it cannot prove.
 *
 * Read-only by construction: this slice adds **no write path**. The four status
 * actions the detail surface offers are the same `applyWorkItemAction` the Work
 * list already uses, which resolves through `list_task_command_candidates` and
 * applies through `apply_task_command`.
 *
 * Ownership is enforced twice over: every query is `user_id`-scoped *and* runs
 * under the caller's RLS session. A task belonging to someone else returns null,
 * which the route turns into a 404 rather than a message confirming it exists.
 */
export async function loadTaskDetailProjection(
  supabase: SupabaseClient,
  options: { readonly taskId: string; readonly userId: string; readonly locale: Locale },
): Promise<TaskDetailProjection | null> {
  const [taskResult, profileResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id,title,description,status,due_at,planned_at,manual_priority,intentional_no_due,no_due_reason,created_by,parent_task_id,source_entry_id,created_at,updated_at,completed_at,cancelled_at",
      )
      .eq("user_id", options.userId)
      .eq("id", options.taskId)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").eq("user_id", options.userId).maybeSingle(),
  ]);

  const row = requireSupabaseData(taskResult, "load task detail");
  if (!row) return null;

  const profile = requireSupabaseData(profileResult, "load task detail timezone");
  const timezone = typeof profile?.timezone === "string" && profile.timezone !== ""
    ? profile.timezone
    : defaultAgentPreferences.timezone;

  const [relationsByTaskId, entryResult, historyResult] = await Promise.all([
    loadTaskRelations(supabase, options.userId, [{ id: row.id, parent_task_id: row.parent_task_id }]),
    row.source_entry_id
      ? supabase
          .from("entries")
          .select("id,original_content,occurred_at")
          .eq("user_id", options.userId)
          .eq("id", row.source_entry_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("audit_logs")
      .select("id,action_type,actor,reason,created_at")
      .eq("user_id", options.userId)
      .eq("entity_type", "task")
      .eq("entity_id", options.taskId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const relations = relationsByTaskId.get(row.id);
  const task = toWorkItemView({
    taskId: row.id,
    title: row.title,
    description: row.description,
    dueAt: row.due_at,
    plannedAt: row.planned_at,
    priority: row.manual_priority,
    intentionalNoDue: row.intentional_no_due,
    noDueReason: row.no_due_reason,
    status: row.status,
    createdBy: row.created_by,
    // The detail surface is the destination, so it does not offer to open itself.
    availableActions: statusActions(row.status),
    projects: relations?.projects,
    contexts: relations?.contexts,
    people: relations?.people,
    waitingOnPeople: relations?.waitingOnPeople,
    parent: relations?.parent,
    dependsOn: relations?.dependsOn,
  });
  if (!task) return null;

  const entry = requireSupabaseData(entryResult, "load task provenance") as
    | { id: string; original_content: string; occurred_at: string }
    | null;
  const history = (requireSupabaseData(historyResult, "load task history") ?? []) as {
    id: string;
    action_type: string;
    actor: string;
    reason: string | null;
    created_at: string;
  }[];

  return {
    task,
    status: row.status,
    timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    provenance: entry
      ? { entryId: entry.id, preview: toPreview(entry.original_content), occurredAt: entry.occurred_at }
      : null,
    history: history.map((item) => ({
      id: item.id,
      actionType: item.action_type,
      actor: toActor(item.actor),
      reason: item.reason,
      occurredAt: item.created_at,
    })),
  };
}

/** The same eligibility the Work list derives, minus `open_task`. */
function statusActions(status: string) {
  if (status === "completed") return [{ id: "reopen_task" as const }];
  if (status === "waiting") return [{ id: "complete_task" as const }, { id: "resume_task" as const }];
  if (status === "cancelled") return [];
  return [{ id: "complete_task" as const }, { id: "wait_task" as const }];
}

export { taskDetailHref };

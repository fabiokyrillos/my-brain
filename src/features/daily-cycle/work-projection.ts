import "server-only";
import { deriveTaskSensitivity } from "@/features/sensitivity/task-derivation";
import { detailControlsFor, type DetailControl } from "@/features/task-commands/detail-controls";
import { pageRange, paginateRows } from "@/lib/pagination";
import { defaultAgentPreferences, type Locale } from "@/lib/preferences";
import type { Database } from "@/lib/supabase/database.types";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";
import type { WorkItemView } from "./contracts";
import { toWorkItemView, type ProjectionActionSource } from "./projection-mappers";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type TaskRow = Pick<
  Database["public"]["Tables"]["tasks"]["Row"],
  | "id" | "user_id" | "title" | "description" | "status" | "due_at" | "created_by" | "updated_at"
  | "planned_at" | "manual_priority" | "intentional_no_due" | "no_due_reason" | "parent_task_id"
  | "source_entry_id"
>;

export const WORK_PAGE_SIZE = 50;
export const workViews = ["today", "all", "waiting"] as const;
export type WorkViewId = (typeof workViews)[number];

export type WorkProjectionPage = {
  readonly items: readonly WorkItemView[];
  readonly hasNext: boolean;
  readonly timezone: string;
  /**
   * `2L-EDIT-001` — which edit controls each row admits, derived here.
   *
   * Computed on the server from `detailControlsFor(row.status)`, because this
   * is the only place the row's **real** status exists. `WorkItemView` carries
   * `humanState`, which is deliberately lossy — `inbox` and `todo` are both
   * "not started" — and an eligibility question answered from it would offer
   * controls the command path refuses.
   *
   * A record rather than a `Map`, because it crosses the server/client boundary
   * and a plain object is the shape that has always crossed it here.
   */
  readonly editControlsByTaskId: Readonly<Record<string, readonly DetailControl[]>>;
};

export function parseWorkView(value: string | string[] | undefined): WorkViewId {
  return typeof value === "string" && workViews.includes(value as WorkViewId)
    ? value as WorkViewId
    : "today";
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function timezoneOffsetAt(instant: number, timezone: string) {
  const parts = zonedParts(new Date(instant), timezone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant;
}

function localMidnightUtc(year: number, month: number, day: number, timezone: string) {
  const target = Date.UTC(year, month - 1, day);
  let instant = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const candidate = target - timezoneOffsetAt(instant, timezone);
    if (candidate === instant) break;
    instant = candidate;
  }
  return new Date(instant);
}

function startOfNextLocalDay(now: Date, timezone: string) {
  const current = zonedParts(now, timezone);
  const nextDate = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  return localMidnightUtc(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
    timezone,
  );
}

/**
 * `open_task` leads, and every other action follows it.
 *
 * The action was declared in `contracts.ts` and localized in `copy.ts` from the
 * beginning, but **nothing ever produced it and no route could satisfy it**
 * (UX-19): the contract anticipated a task detail view that was never built.
 * This is the producer, and `/work/[taskId]` is the destination.
 *
 * It is not a `WorkSurfaceAction`, so `task-list.tsx` filters it out of the
 * button row — it addresses the row itself, not a state transition.
 */
function availableActions(status: string, detailHref: string): readonly ProjectionActionSource[] {
  const open: ProjectionActionSource = { id: "open_task", href: detailHref };
  if (status === "completed") return [open, { id: "reopen_task" }];
  if (status === "waiting") return [open, { id: "complete_task" }, { id: "resume_task" }];
  return [open, { id: "complete_task" }, { id: "wait_task" }];
}

export function taskDetailHref(locale: Locale, taskId: string): string {
  return `/${locale}/app/work/${taskId}`;
}

export async function loadWorkProjection(
  supabase: SupabaseClient,
  options: {
    userId: string;
    locale: Locale;
    view: WorkViewId;
    page: number;
    now?: Date;
  },
): Promise<WorkProjectionPage> {
  const profileResult = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", options.userId)
    .maybeSingle();
  const profile = requireSupabaseData(profileResult, "load Work profile timezone");
  const timezone = validTimezone(profile?.timezone)
    ? profile.timezone
    : defaultAgentPreferences.timezone;

  let query = supabase
    .from("tasks")
    // `source_entry_id` joined the projection in Phase 2L: it is the only input
    // OD-2L-1 option B's derivation takes, and reading it here is what keeps the
    // classification a per-page read rather than a per-task one.
    .select("id,user_id,title,description,status,due_at,created_by,updated_at,planned_at,manual_priority,intentional_no_due,no_due_reason,parent_task_id,source_entry_id")
    .eq("user_id", options.userId);

  if (options.view === "today") {
    query = query
      .not("due_at", "is", null)
      .lt("due_at", startOfNextLocalDay(options.now ?? new Date(), timezone).toISOString())
      .not("status", "in", "(completed,cancelled)")
      .order("due_at", { ascending: true })
      .order("id", { ascending: true });
  } else if (options.view === "waiting") {
    query = query
      .eq("status", "waiting")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true });
  } else {
    query = query
      .neq("status", "cancelled")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true });
  }

  const { from, to } = pageRange(options.page, WORK_PAGE_SIZE);
  const result = await query.range(from, to);
  const rows = (requireSupabaseData(result, `load Work ${options.view} tasks`) ?? []) as TaskRow[];
  const { items: pageRows, hasNext } = paginateRows(rows, WORK_PAGE_SIZE);
  const [relationsByTaskId, sourceLevels] = await Promise.all([
    loadTaskRelations(supabase, options.userId, pageRows),
    loadSourceEntrySensitivity(supabase, options.userId, pageRows),
  ]);
  const items = pageRows.flatMap((row) => {
    const relations = relationsByTaskId.get(row.id);
    const item = toWorkItemView({
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
      availableActions: availableActions(row.status, taskDetailHref(options.locale, row.id)),
      projects: relations?.projects,
      contexts: relations?.contexts,
      people: relations?.people,
      waitingOnPeople: relations?.waitingOnPeople,
      parent: relations?.parent,
      dependsOn: relations?.dependsOn,
      sensitivity: deriveTaskSensitivity(row.source_entry_id, sourceLevels),
    });
    return item ? [item] : [];
  });

  const editControlsByTaskId: Record<string, readonly DetailControl[]> = {};
  for (const row of pageRows) editControlsByTaskId[row.id] = detailControlsFor(row.status);

  return { items, hasNext, timezone, editControlsByTaskId };
}

/**
 * `2L-PRIVACY-006` — the source classifications for one page, in one read.
 *
 * OD-2L-1 option B says a task's sensitivity is derived from its source entry
 * and re-read at presentation time. This is the read, and its three properties
 * are the requirement rather than an optimisation:
 *
 *  - **Owner-scoped in the query**, not only under RLS. RLS is the boundary and
 *    stays the boundary; stating `user_id` here means the map cannot contain a
 *    row from another account even if a future policy were loosened, and it
 *    matches how every other query in this module is written.
 *  - **Bounded to the ids on the page**, so the cost is one round trip per page
 *    rather than one per task and never a per-user scan.
 *  - **Absence is the answer.** Whatever the query does not return — a removed
 *    entry, a foreign one, one a policy declines — is simply not in the map, and
 *    `deriveTaskSensitivity` resolves all of those to the most protective level
 *    through the same branch. There is deliberately nothing here that could tell
 *    the three apart (`2L-PRIVACY-005`).
 *
 * It adds no grant, no `security definer` helper and no service-role client: it
 * is the caller's own session reading the caller's own rows.
 */
async function loadSourceEntrySensitivity(
  supabase: SupabaseClient,
  userId: string,
  pageRows: readonly Pick<TaskRow, "source_entry_id">[],
): Promise<ReadonlyMap<string, string | null>> {
  const sourceIds = [...new Set(
    pageRows.flatMap((row) => (row.source_entry_id ? [row.source_entry_id] : [])),
  )];
  if (sourceIds.length === 0) return new Map();

  const result = await supabase
    .from("entries")
    .select("id,sensitivity")
    .eq("user_id", userId)
    .in("id", sourceIds);
  const rows = (requireSupabaseData(result, "load Work source classifications") ?? []) as {
    id: string;
    sensitivity: string | null;
  }[];
  return new Map(rows.map((row) => [row.id, row.sensitivity] as const));
}

export type TaskRelations = {
  readonly projects: readonly { id: string; label: string }[];
  readonly contexts: readonly { id: string; label: string }[];
  readonly people: readonly { id: string; label: string }[];
  readonly waitingOnPeople: readonly { id: string; label: string }[];
  readonly parent?: { id: string; label: string };
  readonly dependsOn: readonly { id: string; label: string }[];
};

// Bounded per-page hydration (never an unbounded per-user scan): only the
// task IDs actually returned by the page's own query are ever looked up,
// mirroring the two-step flat-select join pattern already used by the
// projects/people detail pages (no Supabase embedded-resource select syntax).
export async function loadTaskRelations(
  supabase: SupabaseClient,
  userId: string,
  pageRows: readonly Pick<TaskRow, "id" | "parent_task_id">[],
): Promise<Map<string, TaskRelations>> {
  const relationsByTaskId = new Map<string, TaskRelations>();
  const taskIds = pageRows.map((row) => row.id);
  if (taskIds.length === 0) return relationsByTaskId;

  const [taskProjectsResult, taskContextsResult, taskPeopleResult, taskDependenciesResult] = await Promise.all([
    supabase.from("task_projects").select("task_id,project_id").eq("user_id", userId).in("task_id", taskIds),
    supabase.from("task_contexts").select("task_id,context_id").eq("user_id", userId).in("task_id", taskIds),
    supabase.from("task_people").select("task_id,person_id,role").eq("user_id", userId).in("task_id", taskIds),
    supabase.from("task_dependencies").select("task_id,depends_on_task_id").eq("user_id", userId).in("task_id", taskIds),
  ]);
  const taskProjects = (requireSupabaseData(taskProjectsResult, "load Work task project relations") ?? []) as { task_id: string; project_id: string }[];
  const taskContexts = (requireSupabaseData(taskContextsResult, "load Work task context relations") ?? []) as { task_id: string; context_id: string }[];
  const taskPeople = (requireSupabaseData(taskPeopleResult, "load Work task person relations") ?? []) as { task_id: string; person_id: string; role: string }[];
  const taskDependencies = (requireSupabaseData(taskDependenciesResult, "load Work task dependency relations") ?? []) as { task_id: string; depends_on_task_id: string }[];

  const projectIds = [...new Set(taskProjects.map((row) => row.project_id))];
  const contextIds = [...new Set(taskContexts.map((row) => row.context_id))];
  const personIds = [...new Set(taskPeople.map((row) => row.person_id))];
  const parentTaskIds = [...new Set(
    pageRows.flatMap((row) => (row.parent_task_id ? [row.parent_task_id] : [])),
  )];
  const relatedTaskIds = [...new Set([
    ...parentTaskIds,
    ...taskDependencies.map((row) => row.depends_on_task_id),
  ])];

  const [projectsResult, contextsResult, peopleResult, relatedTasksResult] = await Promise.all([
    projectIds.length
      ? supabase.from("projects").select("id,name").eq("user_id", userId).in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    contextIds.length
      ? supabase.from("contexts").select("id,name").eq("user_id", userId).in("id", contextIds)
      : Promise.resolve({ data: [], error: null }),
    personIds.length
      ? supabase.from("people").select("id,name").eq("user_id", userId).in("id", personIds)
      : Promise.resolve({ data: [], error: null }),
    relatedTaskIds.length
      ? supabase.from("tasks").select("id,title").eq("user_id", userId).in("id", relatedTaskIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const projectNameById = new Map(
    (requireSupabaseData(projectsResult, "load Work related projects") ?? [] as { id: string; name: string }[])
      .map((row) => [row.id, row.name] as const),
  );
  const contextNameById = new Map(
    (requireSupabaseData(contextsResult, "load Work related contexts") ?? [] as { id: string; name: string }[])
      .map((row) => [row.id, row.name] as const),
  );
  const personNameById = new Map(
    (requireSupabaseData(peopleResult, "load Work related people") ?? [] as { id: string; name: string }[])
      .map((row) => [row.id, row.name] as const),
  );
  const relatedTaskTitleById = new Map(
    (requireSupabaseData(relatedTasksResult, "load Work related tasks") ?? [] as { id: string; title: string }[])
      .map((row) => [row.id, row.title] as const),
  );

  const parentTaskIdByTaskId = new Map(
    pageRows.flatMap((row) => (row.parent_task_id ? [[row.id, row.parent_task_id] as const] : [])),
  );

  for (const taskId of taskIds) {
    const parentTaskId = parentTaskIdByTaskId.get(taskId);
    relationsByTaskId.set(taskId, {
      projects: taskProjects
        .filter((row) => row.task_id === taskId && projectNameById.has(row.project_id))
        .map((row) => ({ id: row.project_id, label: projectNameById.get(row.project_id)! })),
      contexts: taskContexts
        .filter((row) => row.task_id === taskId && contextNameById.has(row.context_id))
        .map((row) => ({ id: row.context_id, label: contextNameById.get(row.context_id)! })),
      people: taskPeople
        .filter((row) => row.task_id === taskId && row.role === "involved" && personNameById.has(row.person_id))
        .map((row) => ({ id: row.person_id, label: personNameById.get(row.person_id)! })),
      waitingOnPeople: taskPeople
        .filter((row) => row.task_id === taskId && row.role === "waiting_on" && personNameById.has(row.person_id))
        .map((row) => ({ id: row.person_id, label: personNameById.get(row.person_id)! })),
      ...(parentTaskId && relatedTaskTitleById.has(parentTaskId)
        ? { parent: { id: parentTaskId, label: relatedTaskTitleById.get(parentTaskId)! } }
        : {}),
      dependsOn: taskDependencies
        .filter((row) => row.task_id === taskId && relatedTaskTitleById.has(row.depends_on_task_id))
        .map((row) => ({ id: row.depends_on_task_id, label: relatedTaskTitleById.get(row.depends_on_task_id)! })),
    });
  }

  return relationsByTaskId;
}

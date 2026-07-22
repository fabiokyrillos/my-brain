import "server-only";
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
  | "planned_at" | "manual_priority" | "intentional_no_due" | "no_due_reason"
>;

export const WORK_PAGE_SIZE = 50;
export const workViews = ["today", "all", "waiting"] as const;
export type WorkViewId = (typeof workViews)[number];

export type WorkProjectionPage = {
  readonly items: readonly WorkItemView[];
  readonly hasNext: boolean;
  readonly timezone: string;
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

function availableActions(status: string): readonly ProjectionActionSource[] {
  if (status === "completed") return [{ id: "reopen_task" }];
  if (status === "waiting") return [{ id: "complete_task" }, { id: "resume_task" }];
  return [{ id: "complete_task" }, { id: "wait_task" }];
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
    .select("id,user_id,title,description,status,due_at,created_by,updated_at,planned_at,manual_priority,intentional_no_due,no_due_reason")
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
  const relationsByTaskId = await loadTaskRelations(supabase, options.userId, pageRows.map((row) => row.id));
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
      availableActions: availableActions(row.status),
      projects: relations?.projects,
      contexts: relations?.contexts,
      people: relations?.people,
      waitingOnPeople: relations?.waitingOnPeople,
    });
    return item ? [item] : [];
  });

  return { items, hasNext, timezone };
}

type TaskRelations = {
  readonly projects: readonly { id: string; label: string }[];
  readonly contexts: readonly { id: string; label: string }[];
  readonly people: readonly { id: string; label: string }[];
  readonly waitingOnPeople: readonly { id: string; label: string }[];
};

// Bounded per-page hydration (never an unbounded per-user scan): only the
// task IDs actually returned by the page's own query are ever looked up,
// mirroring the two-step flat-select join pattern already used by the
// projects/people detail pages (no Supabase embedded-resource select syntax).
async function loadTaskRelations(
  supabase: SupabaseClient,
  userId: string,
  taskIds: readonly string[],
): Promise<Map<string, TaskRelations>> {
  const relationsByTaskId = new Map<string, TaskRelations>();
  if (taskIds.length === 0) return relationsByTaskId;

  const [taskProjectsResult, taskContextsResult, taskPeopleResult] = await Promise.all([
    supabase.from("task_projects").select("task_id,project_id").eq("user_id", userId).in("task_id", taskIds),
    supabase.from("task_contexts").select("task_id,context_id").eq("user_id", userId).in("task_id", taskIds),
    supabase.from("task_people").select("task_id,person_id,role").eq("user_id", userId).in("task_id", taskIds),
  ]);
  const taskProjects = (requireSupabaseData(taskProjectsResult, "load Work task project relations") ?? []) as { task_id: string; project_id: string }[];
  const taskContexts = (requireSupabaseData(taskContextsResult, "load Work task context relations") ?? []) as { task_id: string; context_id: string }[];
  const taskPeople = (requireSupabaseData(taskPeopleResult, "load Work task person relations") ?? []) as { task_id: string; person_id: string; role: string }[];

  const projectIds = [...new Set(taskProjects.map((row) => row.project_id))];
  const contextIds = [...new Set(taskContexts.map((row) => row.context_id))];
  const personIds = [...new Set(taskPeople.map((row) => row.person_id))];

  const [projectsResult, contextsResult, peopleResult] = await Promise.all([
    projectIds.length
      ? supabase.from("projects").select("id,name").eq("user_id", userId).in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    contextIds.length
      ? supabase.from("contexts").select("id,name").eq("user_id", userId).in("id", contextIds)
      : Promise.resolve({ data: [], error: null }),
    personIds.length
      ? supabase.from("people").select("id,name").eq("user_id", userId).in("id", personIds)
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

  for (const taskId of taskIds) {
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
    });
  }

  return relationsByTaskId;
}

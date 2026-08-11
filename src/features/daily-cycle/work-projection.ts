import "server-only";
import { deriveTaskSensitivity } from "@/features/sensitivity/task-derivation";
import { WORK_PAGE_SIZE } from "./work-page-size";
import { detailControlsFor, type DetailControl } from "@/features/task-commands/detail-controls";
import { pageRange, paginateRows } from "@/lib/pagination";
import { isSupportedTimeZone, localDayBounds } from "@/lib/time/local-day";
import { defaultAgentPreferences, type Locale } from "@/lib/preferences";
import type { Database } from "@/lib/supabase/database.types";
import { requireSupabaseData } from "@/lib/supabase/result";
import type { createClient } from "@/lib/supabase/server";
import type { WorkItemView } from "./contracts";
import { toWorkItemView, type ProjectionActionSource } from "./projection-mappers";
import { serializeWorkPosition } from "@/features/operations/work-position";
import { DEFAULT_WORK_QUERY, type WorkOrder, type WorkQuery } from "./work-query";
import { WORK_VIEWS, workViews, type WorkViewId } from "./work-views";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type TaskRow = Pick<
  Database["public"]["Tables"]["tasks"]["Row"],
  | "id" | "user_id" | "title" | "description" | "status" | "due_at" | "created_by" | "updated_at"
  | "planned_at" | "manual_priority" | "intentional_no_due" | "no_due_reason" | "parent_task_id"
  | "source_entry_id"
>;

// Re-exported so existing importers are unchanged; the declarations themselves
// live in client-safe modules, because the selection ceiling derives from the
// page size and the tabs render the taxonomy in the browser.
export { WORK_PAGE_SIZE };
export { workViews, type WorkViewId };


/**
 * `2L-VIEW-004`/`-005` — the narrowing this projection accepts.
 *
 * Every member narrows a `tasks` column the page query was already selecting,
 * which is what `2L-VIEW-004` means by "the attributes the projection already
 * loads" — except the two relation filters, which are the one deliberate
 * two-step and are bounded per relation rather than per user.
 */
export type WorkFilters = Pick<
  WorkQuery,
  "state" | "due" | "planned" | "priority" | "origin" | "projectId" | "contextId" | "order"
>;

const DEFAULT_WORK_FILTERS: WorkFilters = {
  state: DEFAULT_WORK_QUERY.state,
  due: DEFAULT_WORK_QUERY.due,
  planned: DEFAULT_WORK_QUERY.planned,
  priority: DEFAULT_WORK_QUERY.priority,
  origin: DEFAULT_WORK_QUERY.origin,
  projectId: DEFAULT_WORK_QUERY.projectId,
  contextId: DEFAULT_WORK_QUERY.contextId,
  order: DEFAULT_WORK_QUERY.order,
};

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
  /**
   * `2L-BULK-005` — each row's **real** status.
   *
   * The bulk preview partitions by eligibility, which is a question about the
   * status literal the taxonomy's tables are written in. `WorkItemView` carries
   * `humanState`, which is lossy on purpose, so the answer has to travel from
   * here — the same reason `editControlsByTaskId` does.
   */
  readonly statusByTaskId: Readonly<Record<string, string>>;
};

export function parseWorkView(value: string | string[] | undefined): WorkViewId {
  return typeof value === "string" && workViews.includes(value as WorkViewId)
    ? value as WorkViewId
    : "today";
}

/*
 * The zone rule is the local-day contract's, not a third copy of it. It was
 * identical here in behaviour, and two identical rules are one rule waiting to
 * diverge — which is precisely how this module and Hoje came to disagree about
 * what a day is.
 */

/*
 * The local-day helpers this module used to own were deleted by `2M-TIME-001`.
 *
 * They were the *second* implementation of the user's local day, and they were
 * wrong in the mirror-image way to the first: `startOfToday` was derived as
 * `startOfNextLocalDay − 24h`, so today's **start** was an hour off on exactly
 * the two days a year when a local day is not 24 hours long — moving the
 * `today` view and the `overdue`/`today`/`upcoming` due filters onto the wrong
 * boundary. Their fixed-point resolution also landed in the *previous* day in a
 * zone whose local midnight does not exist, which `src/lib/time/local-day.ts`
 * documents and refuses.
 */

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

/**
 * `2L-RETURN-001`/`-002` — the link to a task, carrying where the user was.
 *
 * The position travels **with the link** rather than in history or in storage,
 * so a task opened from `?view=all&priority=high&page=3` returns there after a
 * refresh, from a shared link, and on a device that has no history for it.
 *
 * `from` is omitted when the position is the default: a parameter that says
 * "the default" is a longer URL describing the same thing, and one state should
 * have one URL.
 */
export function taskDetailHref(locale: Locale, taskId: string, from?: string): string {
  const base = `/${locale}/app/work/${taskId}`;
  return from ? `${base}?from=${from}` : base;
}

export async function loadWorkProjection(
  supabase: SupabaseClient,
  options: {
    userId: string;
    locale: Locale;
    view: WorkViewId;
    page: number;
    now?: Date;
    /**
     * `2L-VIEW-004`/`-005`. Absent means the declared defaults — the page
     * exactly as it was before this slice, which is what lets Hoje keep calling
     * this with a view and a page and nothing else.
     */
    filters?: WorkFilters;
  },
): Promise<WorkProjectionPage> {
  const profileResult = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", options.userId)
    .maybeSingle();
  const profile = requireSupabaseData(profileResult, "load Work profile timezone");
  const timezone = isSupportedTimeZone(profile?.timezone)
    ? profile.timezone
    : defaultAgentPreferences.timezone;

  const filters: WorkFilters = options.filters ?? DEFAULT_WORK_FILTERS;
  const now = options.now ?? new Date();
  // `2M-TIME-001`: both edges come from the one local-day contract. Deriving
  // either from the other by subtracting 24 hours is the defect this replaced.
  const day = localDayBounds(now, timezone);
  const startOfToday = new Date(day.start);
  const nextDay = new Date(day.end);

  /*
   * The relation filters are resolved **first**, so the page query can be
   * bounded by their ids. An empty result means no task matches, which is a
   * narrower answer and never a wider one — and it costs the page query
   * nothing, because there is nothing left to ask for.
   */
  /*
   * The position each row's link carries back. Serialized once per page rather
   * than per row: it is the same value for every row on the page, and fifty
   * identical encodings would be fifty chances for one to differ.
   */
  const returnPosition = options.filters
    ? serializeWorkPosition({ ...DEFAULT_WORK_QUERY, ...filters, view: options.view, page: options.page })
    : undefined;

  const relationTaskIds = await loadRelationFilterTaskIds(supabase, options.userId, filters);
  if (relationTaskIds !== null && relationTaskIds.length === 0) {
    return { items: [], hasNext: false, timezone, editControlsByTaskId: {}, statusByTaskId: {} };
  }

  let query = supabase
    .from("tasks")
    // `source_entry_id` joined the projection in Phase 2L: it is the only input
    // OD-2L-1 option B's derivation takes, and reading it here is what keeps the
    // classification a per-page read rather than a per-task one.
    .select("id,user_id,title,description,status,due_at,created_by,updated_at,planned_at,manual_priority,intentional_no_due,no_due_reason,parent_task_id,source_entry_id")
    .eq("user_id", options.userId);

  // The view's own shape, unchanged from before this slice.
  if (options.view === "today") {
    query = query.not("due_at", "is", null).lt("due_at", nextDay.toISOString());
  } else if (options.view === "waiting") {
    query = query.eq("status", "waiting");
  }

  /*
   * The status predicate: each view's own default, or the **narrower** one
   * `state` names.
   *
   * `open` reproduces exactly what each view did before this slice, so the
   * default page is byte-for-byte the page it was. `completed` and `cancelled`
   * *replace* that predicate rather than adding to it, which is why no value of
   * `state` can widen a view — the property `2L-VIEW-008` is about.
   */
  if (filters.state === "completed") {
    query = query.eq("status", "completed");
  } else if (filters.state === "cancelled") {
    query = query.eq("status", "cancelled");
  } else if (options.view === "today") {
    query = query.not("status", "in", "(completed,cancelled)");
  } else if (options.view === "all") {
    query = query.neq("status", "cancelled");
  }

  if (filters.due === "overdue") {
    query = query.not("due_at", "is", null).lt("due_at", startOfToday.toISOString());
  } else if (filters.due === "today") {
    query = query.gte("due_at", startOfToday.toISOString()).lt("due_at", nextDay.toISOString());
  } else if (filters.due === "upcoming") {
    query = query.gte("due_at", nextDay.toISOString());
  } else if (filters.due === "none") {
    query = query.is("due_at", null);
  }

  /*
   * `2M-PLAN-003` — the predicate `planned_at` never had.
   *
   * Both edges come from `localDayBounds`, the same one contract the view and
   * the `due` filter use (`2M-TIME-001`); deriving either by adding 24 hours is
   * the defect slice 2M.0 removed, and a plan filter written independently
   * would have reintroduced it on exactly the two days a year a local day is
   * not 24 hours long.
   *
   * `overdue` here means "I meant to do this and have not", never "this is
   * late": `planned_at` arms nothing and makes nothing fail (OD-2M-3 A). It
   * narrows like every other member — no value of `planned` can widen the view,
   * because every branch adds a predicate and `any` adds none.
   */
  if (filters.planned === "overdue") {
    query = query.not("planned_at", "is", null).lt("planned_at", startOfToday.toISOString());
  } else if (filters.planned === "today") {
    query = query.gte("planned_at", startOfToday.toISOString()).lt("planned_at", nextDay.toISOString());
  } else if (filters.planned === "upcoming") {
    query = query.gte("planned_at", nextDay.toISOString());
  } else if (filters.planned === "none") {
    query = query.is("planned_at", null);
  }

  if (filters.priority !== "any") query = query.eq("manual_priority", filters.priority);
  // `created_by` holds the persisted provenance; `origin` is what a user reads.
  if (filters.origin === "you") query = query.eq("created_by", "user");
  if (filters.origin === "brain") query = query.eq("created_by", "agent");
  if (relationTaskIds !== null) query = query.in("id", relationTaskIds);

  query = applyOrder(query, filters.order, options.view);

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
      availableActions: availableActions(
        row.status,
        taskDetailHref(options.locale, row.id, returnPosition),
      ),
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
  const statusByTaskId: Record<string, string> = {};
  for (const row of pageRows) {
    editControlsByTaskId[row.id] = detailControlsFor(row.status);
    statusByTaskId[row.id] = row.status;
  }

  return { items, hasNext, timezone, editControlsByTaskId, statusByTaskId };
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

/**
 * The ordering, from the user's choice or from the view's declared default.
 *
 * `id` is always the last key. Without it a page boundary is unstable when two
 * rows share a due date or an update instant, and the same row can appear on
 * two pages or on none — which would make `2L-VIEW-009`'s "pagination composes"
 * false in exactly the case nobody checks.
 */
function applyOrder<
  T extends { order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => T },
>(
  query: T,
  order: WorkOrder,
  view: WorkViewId,
): T {
  const resolved = order === "default" ? WORK_VIEWS[view].defaultOrder : order;
  // `nullsFirst: false` on BOTH planned directions, which is the asymmetry
  // `comparePlannedAt` declares and the reason these two cannot be written as a
  // plain ascending/descending pair: a task with no intention is not a task
  // with a very late one, and a descending order that put every unplanned row
  // first would bury exactly the rows the control was chosen to surface.
  // PostgREST defaults to nulls last for ascending and nulls FIRST for
  // descending, so the second is a correction and not decoration.
  const ordered = resolved === "due_asc"
    ? query.order("due_at", { ascending: true })
    : resolved === "due_desc"
      ? query.order("due_at", { ascending: false })
      : resolved === "planned_asc"
        ? query.order("planned_at", { ascending: true, nullsFirst: false })
        : resolved === "planned_desc"
          ? query.order("planned_at", { ascending: false, nullsFirst: false })
          : resolved === "updated_asc"
            ? query.order("updated_at", { ascending: true })
            : query.order("updated_at", { ascending: false });
  return ordered.order("id", { ascending: true });
}

/**
 * The task ids a relation filter admits, or null when none was asked for.
 *
 * `task_projects` and `task_contexts` are separate tables, so this is the one
 * two-step in the page load. It is owner-scoped **and** bounded to the single
 * relation, so the read grows with the size of that project or context rather
 * than with the size of the user's whole task set — the property
 * `2L-VIEW-006` demands of grouping and which a filter has no excuse to lack.
 *
 * Two filters compose by **intersection**, which is the only reading of "in
 * this project and this context" that cannot silently widen.
 */
async function loadRelationFilterTaskIds(
  supabase: SupabaseClient,
  userId: string,
  filters: WorkFilters,
): Promise<string[] | null> {
  if (!filters.projectId && !filters.contextId) return null;

  const sets: string[][] = [];
  if (filters.projectId) {
    const result = await supabase
      .from("task_projects")
      .select("task_id")
      .eq("user_id", userId)
      .eq("project_id", filters.projectId);
    const rows = (requireSupabaseData(result, "load Work project filter") ?? []) as { task_id: string }[];
    sets.push(rows.map((row) => row.task_id));
  }
  if (filters.contextId) {
    const result = await supabase
      .from("task_contexts")
      .select("task_id")
      .eq("user_id", userId)
      .eq("context_id", filters.contextId);
    const rows = (requireSupabaseData(result, "load Work context filter") ?? []) as { task_id: string }[];
    sets.push(rows.map((row) => row.task_id));
  }

  return sets.reduce((left, right) => left.filter((id) => right.includes(id)));
}

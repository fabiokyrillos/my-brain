import "server-only";

/**
 * `2M-PLAN-004` — the daily planner's data, read owner-scoped at presentation
 * time.
 *
 * "A daily planner surface lets a user choose what they will do today from tasks
 * and commitments that already exist. **It creates nothing implicitly.**"
 *
 * So this module reads. It has no insert, no update, no RPC and no Server
 * Action; the only writes the planner can cause are the ones the user presses,
 * through the taxonomy's own command path, and
 * `phase-2m-planner-authority-guard.test.ts` fails the build if that stops being
 * literally true of the whole feature directory.
 *
 * ## Two lists, and why the second is the point
 *
 * **Planned for this day** is what the user already said. **Available to plan**
 * is every open task with no planned day at all — the pool a plan is made from.
 * A planner without the second list would be a viewer: the user could see their
 * intentions and could not form one without leaving for another surface.
 *
 * The available list is bounded at `PLANNER_AVAILABLE_LIMIT` and says so; it is
 * a pool to choose from, not an inbox to clear, and an unbounded read of every
 * open task a long-lived account holds would be a slow page that helps nobody.
 *
 * ## Everything content-bearing goes through the derivation
 *
 * Titles are never rendered directly. Each row carries a `sensitivity` resolved
 * from its source entry by the same `task-derivation.ts` the calendar and Work
 * use, with the same fail-closed absence rule — an unreadable classification map
 * is an EMPTY map, which resolves to the most protective level rather than to
 * `undetermined` (OD-2L-1 B, `2M-PRIVACY-*`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveTaskSensitivity, type TaskSensitivity } from "@/features/sensitivity/task-derivation";
import type { Locale } from "@/lib/preferences";
import {
  formatLocalDate,
  localDayBoundsForDate,
  type LocalDate,
} from "@/lib/time/local-day";

import { computePlannerCapacity, type PlannerCapacity } from "./planner-capacity";
import { findPlannerConflicts, type PlannerConflict, type PlannerConflictInput } from "./planner-conflicts";

/**
 * The pool's ceiling.
 *
 * **50, and the same 50 OD-2L-4 signed for bulk selection.** Not a coincidence
 * and not a coupling to be broken: the whole pool is selectable, so a pool
 * larger than the selection ceiling would offer the user rows they could not act
 * on together — a control whose only possible outcome, past the fiftieth row, is
 * a refusal.
 */
export const PLANNER_AVAILABLE_LIMIT = 50;

const OPEN_TASK_STATUSES = ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"];

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  planned_at: string | null;
  source_entry_id: string | null;
};

export type PlannerItem = {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly plannedAt: string | null;
  readonly sensitivity: TaskSensitivity;
  /** Where the task detail is, carrying the return to this exact day. */
  readonly href: string;
};

export type PlannerProjection = {
  /** `YYYY-MM-DD`, the day being planned, in the user's own zone. */
  readonly day: string;
  readonly isToday: boolean;
  readonly timezone: string;
  readonly planned: readonly PlannerItem[];
  readonly available: readonly PlannerItem[];
  /** True when the pool was cut off, so the surface can say so rather than imply completeness. */
  readonly availableTruncated: boolean;
  readonly capacity: PlannerCapacity;
  readonly conflicts: readonly PlannerConflict[];
};

async function loadSourceLevels(
  supabase: SupabaseClient,
  userId: string,
  entryIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string | null>> {
  const ids = [...new Set(entryIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const result = await supabase
    .from("entries")
    .select("id,sensitivity")
    .eq("user_id", userId)
    .in("id", ids);
  // Fail closed. An unreadable map is an empty one, which is the most
  // protective answer rather than the most convenient.
  if (result.error) return new Map();
  const rows = (result.data ?? []) as { id: string; sensitivity: string | null }[];
  return new Map(rows.map((row) => [row.id, row.sensitivity] as const));
}

export async function loadPlannerProjection(
  supabase: SupabaseClient,
  input: {
    readonly userId: string;
    readonly locale: Locale;
    readonly timezone: string;
    readonly day: LocalDate;
    readonly today: LocalDate;
  },
): Promise<PlannerProjection> {
  const { userId, locale, timezone, day, today } = input;

  /*
   * `2M-TIME-001`/`-002`. Both edges from the one local-day contract, for the
   * *requested* day rather than for now — a planner is the surface most likely
   * to be looking at a day that is not today, and a bounds helper that only
   * knew "now" would have been the reason to write a second one.
   */
  const bounds = localDayBoundsForDate(day, timezone);
  const startIso = new Date(bounds.start).toISOString();
  const endIso = new Date(bounds.end).toISOString();

  const [plannedResult, availableResult, deadlineResult, preferencesResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id,title,status,due_at,planned_at,source_entry_id")
      .eq("user_id", userId)
      .in("status", OPEN_TASK_STATUSES)
      .gte("planned_at", startIso)
      .lt("planned_at", endIso)
      .order("planned_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("tasks")
      .select("id,title,status,due_at,planned_at,source_entry_id")
      .eq("user_id", userId)
      .in("status", OPEN_TASK_STATUSES)
      .is("planned_at", null)
      // Soonest deadline first, and an undated task after every dated one: the
      // pool is ordered by what is most likely to want a day, and `nullsFirst:
      // false` is what stops the undated majority burying the dated few.
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(0, PLANNER_AVAILABLE_LIMIT),
    /*
     * The day's *commitments*, which is what `2M-PLAN-007`'s double-booking
     * conflict is about. Deadlines only: a reminder is derived from a deadline
     * by `tasks_create_due_reminder`, so counting both would report every dated
     * task as colliding with its own reminder.
     */
    supabase
      .from("tasks")
      .select("id,title,status,due_at,planned_at,source_entry_id")
      .eq("user_id", userId)
      .in("status", OPEN_TASK_STATUSES)
      .gte("due_at", startIso)
      .lt("due_at", endIso),
    supabase
      .from("agent_preferences")
      .select("quiet_start,quiet_end")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const plannedRows = (plannedResult.data ?? []) as TaskRow[];
  const availableRowsRaw = (availableResult.data ?? []) as TaskRow[];
  const deadlineRows = (deadlineResult.data ?? []) as TaskRow[];
  const availableTruncated = availableRowsRaw.length > PLANNER_AVAILABLE_LIMIT;
  const availableRows = availableRowsRaw.slice(0, PLANNER_AVAILABLE_LIMIT);

  const sourceLevels = await loadSourceLevels(
    supabase,
    userId,
    [...plannedRows, ...availableRows, ...deadlineRows].map((row) => row.source_entry_id),
  );

  const dayKey = formatLocalDate(day);
  const toItem = (row: TaskRow): PlannerItem => ({
    taskId: row.id,
    title: row.title,
    status: row.status,
    dueAt: row.due_at,
    plannedAt: row.planned_at,
    sensitivity: deriveTaskSensitivity(row.source_entry_id, sourceLevels),
    href: `/${locale}/app/work/${row.id}`,
  });

  const conflictInputs: PlannerConflictInput[] = [
    ...plannedRows.map((row) => ({
      taskId: row.id,
      commitment: "intended" as const,
      at: row.planned_at ?? "",
      dueAt: row.due_at,
    })),
    ...deadlineRows.map((row) => ({
      taskId: row.id,
      commitment: "committed" as const,
      at: row.due_at ?? "",
      dueAt: row.due_at,
    })),
  ];

  const preferences = (preferencesResult.data ?? null) as
    | { quiet_start: string | null; quiet_end: string | null }
    | null;

  return {
    day: dayKey,
    isToday: dayKey === formatLocalDate(today),
    timezone,
    planned: plannedRows.map(toItem),
    available: availableRows.map(toItem),
    availableTruncated,
    capacity: computePlannerCapacity({
      // Both lanes, because both are things the user put on the day. An
      // intention and a deadline occupy the same finite day.
      plannedCount: plannedRows.length + deadlineRows.length,
      quietStart: preferences?.quiet_start,
      quietEnd: preferences?.quiet_end,
      defaultQuietStart: "22:30:00",
      defaultQuietEnd: "07:00:00",
    }),
    conflicts: findPlannerConflicts({ items: conflictInputs, today, timeZone: timezone }),
  };
}

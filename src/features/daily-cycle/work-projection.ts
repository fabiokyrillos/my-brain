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
  "id" | "user_id" | "title" | "description" | "status" | "due_at" | "created_by" | "updated_at"
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
    .select("id,user_id,title,description,status,due_at,created_by,updated_at")
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
  const items = pageRows.flatMap((row) => {
    const item = toWorkItemView({
      taskId: row.id,
      title: row.title,
      description: row.description,
      dueAt: row.due_at,
      status: row.status,
      createdBy: row.created_by,
      availableActions: availableActions(row.status),
    });
    return item ? [item] : [];
  });

  return { items, hasNext, timezone };
}

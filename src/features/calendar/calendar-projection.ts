import "server-only";

import {
  deriveReminderSensitivity,
  deriveTaskSensitivity,
  UNDETERMINED,
} from "@/features/sensitivity/task-derivation";
import {
  addLocalDays,
  compareLocalDates,
  formatLocalDate,
  isSupportedTimeZone,
  localDateOf,
  localDayBoundsForDate,
  localRangeBounds,
  type LocalDate,
} from "@/lib/time/local-day";
import type { createClient } from "@/lib/supabase/server";

import type {
  CalendarDayView,
  CalendarItemView,
  CalendarLaneFailure,
  CalendarProjection,
} from "./calendar-contracts";
import {
  COMMITMENT_BY_LANE,
  DAYS_BY_ORIENTATION,
  rangeStart,
  type CalendarLane,
  type CalendarQuery,
} from "./calendar-query";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * `2M-CAL-002` — the calendar, over the five sources that already exist.
 *
 * ## Zero schema, and that is the design rather than a constraint
 *
 * The audit's §6.1 found that every lane the parent PRD's slice 4.4 asks for is
 * already representable: `tasks.due_at` is a deadline, `tasks.planned_at` is an
 * intention, `reminders.remind_at` is a commitment, `summaries` record a period,
 * and an entry the user has not confirmed carries a suggested date. So there is
 * **no event entity** (OD-2M-3 A refused one), no new table, no new column and
 * no migration — the calendar is a *reading*.
 *
 * ## Why each lane is its own query
 *
 * Five reads rather than one view, because the alternative is a database view,
 * which is a migration this phase's budget does not have and would not spend on
 * a join it can do in memory. Each read is:
 *
 *  - **owner-scoped in the query**, not only under RLS — RLS is and stays the
 *    boundary, and stating `user_id` means a loosened policy could not widen
 *    this;
 *  - **bounded to the requested range**, so cost follows what is on screen;
 *  - **independently fallible.** A lane that fails is named in `failedLanes`
 *    and the others still render (`2M-CAL-011`). A calendar that dropped a
 *    failed lane silently would show a day that *looks empty*, which is the
 *    same lie masking-rather-than-excluding exists to avoid.
 *
 * ## Sensitivity, for two subjects rather than one
 *
 * OD-2M-1 option A: tasks derive through `deriveTaskSensitivity` and reminders
 * through `deriveReminderSensitivity` — the same mechanism, via
 * `reminders.entry_id`, which the audit found nobody had ever used. Both read
 * one owner-scoped map keyed by entry id, bounded to the ids in range, and
 * **absence is the answer**: a removed entry, a foreign one and one a policy
 * declines are one thing here, resolving to the most protective level through a
 * single branch (`2M-PRIVACY-003`).
 *
 * **Nothing is persisted** (`2M-PRIVACY-004`). No table gains a column, and the
 * classification is re-read on every load.
 */

/** Rows the projection reads, narrowed to what it renders. */
type TaskRow = {
  id: string;
  title: string;
  due_at: string | null;
  planned_at: string | null;
  status: string;
  source_entry_id: string | null;
};

type ReminderRow = {
  id: string;
  title: string;
  remind_at: string;
  status: string;
  entry_id: string | null;
  task_id: string | null;
};

type SummaryRow = {
  id: string;
  period_start: string;
  period_end: string;
  period_type: string;
};

type SuggestionRow = {
  id: string;
  occurred_at: string;
  status: string;
};

/**
 * The statuses a calendar shows.
 *
 * A cancelled task's deadline is not a thing the user has to do, and a completed
 * one is not either — showing both would make every past week look full of work
 * that is already dealt with. `2M-CAL-011` distinguishes *empty* from *failed*,
 * and this is what makes "empty" mean something: nothing is scheduled, rather
 * than nothing is left.
 */
const OPEN_TASK_STATUSES = ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"];
const OPEN_REMINDER_STATUSES = ["pending", "scheduled", "snoozed"];

/**
 * One lane's read, with its failure isolated.
 *
 * Returning `null` rather than throwing is what makes a partial result possible:
 * the caller records the lane as failed and renders the rest. A thrown error
 * would take the whole day with it.
 */
async function readLane<Row>(
  run: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<readonly Row[] | null> {
  try {
    const result = await run();
    if (result.error) return null;
    return (result.data ?? []) as Row[];
  } catch {
    return null;
  }
}

/**
 * The source classifications for everything in range, in one read.
 *
 * The same three properties `loadSourceEntrySensitivity` has on Work, and the
 * same single branch for every kind of absence — see the module header. It adds
 * no grant, no `security definer` helper and no service-role client: the
 * caller's own session reading the caller's own rows.
 */
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
  if (result.error) {
    // Fail closed: an unreadable map is an EMPTY map, which resolves every item
    // to the most protective level rather than to `undetermined`. The two are
    // different claims and only one of them is safe to guess.
    return new Map();
  }
  const rows = (result.data ?? []) as { id: string; sensitivity: string | null }[];
  return new Map(rows.map((row) => [row.id, row.sensitivity] as const));
}

/**
 * The user's zone, from `profiles` — **and a caller error when it cannot be
 * read** (`2M-TIME-003`).
 *
 * `profiles.timezone` is `not null default 'America/Sao_Paulo'`, so the only way
 * this fails is a missing profile row or a value outside the supported set. The
 * Work projection falls back to the default in that case; the calendar does
 * **not**, because the requirement says so and because the failure modes
 * differ: a Work list computed in the wrong zone is a slightly wrong "today"
 * filter, while a calendar computed in the wrong zone puts every item on the
 * wrong column and looks entirely convincing doing it.
 *
 * The zone is resolved **here** rather than in the route, so no caller can pass
 * one in — a page that read the browser's zone and handed it over would satisfy
 * every type in this module.
 */
export async function requireProfileTimeZone(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const result = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw new Error("the calendar could not read the profile time zone");
  const timezone = (result.data as { timezone?: unknown } | null)?.timezone;
  if (!isSupportedTimeZone(timezone)) {
    throw new Error(`unsupported time zone: ${String(timezone)}`);
  }
  return timezone;
}

export async function loadCalendarProjection(
  supabase: SupabaseClient,
  input: {
    readonly userId: string;
    readonly locale: string;
    readonly query: CalendarQuery;
    readonly now: Date;
    /** Test seam only. Production resolves the zone from `profiles`. */
    readonly timezone?: string;
  },
): Promise<CalendarProjection> {
  const { userId, locale, query, now } = input;
  const timezone = input.timezone ?? await requireProfileTimeZone(supabase, userId);
  if (!isSupportedTimeZone(timezone)) {
    // `2M-TIME-003`: a day nobody could compute is reported, never answered.
    throw new Error(`unsupported time zone: ${String(timezone)}`);
  }

  const first = rangeStart(query);
  const dayCount = DAYS_BY_ORIENTATION[query.orientation];
  const bounds = localRangeBounds(first, dayCount, timezone);
  const last = addLocalDays(first, dayCount - 1);
  const startIso = new Date(bounds.start).toISOString();
  const endIso = new Date(bounds.end).toISOString();
  const wanted = new Set<CalendarLane>(query.lanes);
  const failedLanes: CalendarLaneFailure[] = [];

  const [deadlines, intentions, reminders, reviews, suggestions] = await Promise.all([
    wanted.has("deadline")
      ? readLane<TaskRow>(() => supabase
        .from("tasks")
        .select("id,title,due_at,planned_at,status,source_entry_id")
        .eq("user_id", userId)
        .in("status", OPEN_TASK_STATUSES)
        .gte("due_at", startIso)
        .lt("due_at", endIso))
      : Promise.resolve([] as readonly TaskRow[]),
    wanted.has("intention")
      ? readLane<TaskRow>(() => supabase
        .from("tasks")
        .select("id,title,due_at,planned_at,status,source_entry_id")
        .eq("user_id", userId)
        .in("status", OPEN_TASK_STATUSES)
        .gte("planned_at", startIso)
        .lt("planned_at", endIso))
      : Promise.resolve([] as readonly TaskRow[]),
    wanted.has("reminder")
      ? readLane<ReminderRow>(() => supabase
        .from("reminders")
        .select("id,title,remind_at,status,entry_id,task_id")
        .eq("user_id", userId)
        .in("status", OPEN_REMINDER_STATUSES)
        .gte("remind_at", startIso)
        .lt("remind_at", endIso))
      : Promise.resolve([] as readonly ReminderRow[]),
    wanted.has("review")
      ? readLane<SummaryRow>(() => supabase
        .from("summaries")
        .select("id,period_start,period_end,period_type")
        .eq("user_id", userId)
        .lt("period_start", endIso)
        .gte("period_end", startIso))
      : Promise.resolve([] as readonly SummaryRow[]),
    wanted.has("suggestion")
      ? readLane<SuggestionRow>(() => supabase
        .from("entries")
        .select("id,occurred_at,status")
        .eq("user_id", userId)
        .eq("is_retroactive", true)
        .gte("occurred_at", startIso)
        .lt("occurred_at", endIso))
      : Promise.resolve([] as readonly SuggestionRow[]),
  ]);

  for (const [lane, rows] of [
    ["deadline", deadlines], ["intention", intentions], ["reminder", reminders],
    ["review", reviews], ["suggestion", suggestions],
  ] as const) {
    if (rows === null && wanted.has(lane)) failedLanes.push({ lane });
  }

  const taskRows = [...(deadlines ?? []), ...(intentions ?? [])];
  const reminderRows = reminders ?? [];
  const sourceLevels = await loadSourceLevels(supabase, userId, [
    ...taskRows.map((row) => row.source_entry_id),
    ...reminderRows.map((row) => row.entry_id),
  ]);

  const nowMs = now.getTime();
  const items: CalendarItemView[] = [];

  /**
   * Places one item on its local day, or reports its lane as failed.
   *
   * Every column read below is `not null` in the schema, so an unreadable
   * instant should be impossible — and "should be impossible" is exactly the
   * class of assumption that takes a whole surface down when it turns out to be
   * wrong. A row whose instant will not parse is **not silently dropped**: its
   * lane joins `failedLanes`, so the day says "this lane could not be read"
   * rather than showing a day that looks emptier than it is. That is the same
   * distinction `2M-CAL-011` draws between empty and failed, applied to the one
   * case where the read succeeded and the data did not.
   */
  const push = (item: Omit<CalendarItemView, "date" | "elapsed" | "commitment">) => {
    const at = new Date(item.at);
    if (!Number.isFinite(at.getTime())) {
      if (!failedLanes.some((failure) => failure.lane === item.lane)) {
        failedLanes.push({ lane: item.lane });
      }
      return;
    }
    items.push({
      ...item,
      commitment: COMMITMENT_BY_LANE[item.lane],
      date: formatLocalDate(localDateOf(at, timezone)),
      elapsed: at.getTime() < nowMs,
    });
  };

  for (const row of deadlines ?? []) {
    if (!row.due_at) continue;
    push({
      id: `deadline:${row.id}`,
      lane: "deadline",
      at: row.due_at,
      title: row.title,
      sensitivity: deriveTaskSensitivity(row.source_entry_id, sourceLevels),
      href: `/${locale}/app/work/${row.id}`,
    });
  }

  for (const row of intentions ?? []) {
    if (!row.planned_at) continue;
    push({
      id: `intention:${row.id}`,
      lane: "intention",
      at: row.planned_at,
      title: row.title,
      sensitivity: deriveTaskSensitivity(row.source_entry_id, sourceLevels),
      href: `/${locale}/app/work/${row.id}`,
    });
  }

  for (const row of reminderRows) {
    push({
      id: `reminder:${row.id}`,
      lane: "reminder",
      at: row.remind_at,
      title: row.title,
      // OD-2M-1 A. The same derivation, through the relationship nobody had used.
      sensitivity: deriveReminderSensitivity(row.entry_id, sourceLevels),
      href: `/${locale}/app/reminders`,
    });
  }

  for (const row of reviews ?? []) {
    push({
      id: `review:${row.id}`,
      lane: "review",
      at: row.period_start,
      // A review carries a title and a body, and neither belongs on a grid.
      // `2M-REVIEW-008` requires review content to render through the
      // `review_summary` contract, which is the reviews surface — so the
      // calendar shows that a period was reviewed and links to it.
      title: null,
      sensitivity: UNDETERMINED,
      href: `/${locale}/app/reviews`,
    });
  }

  for (const row of suggestions ?? []) {
    push({
      id: `suggestion:${row.id}`,
      lane: "suggestion",
      at: row.occurred_at,
      // A date the Brain extracted and the user has not confirmed. The entry's
      // text is not shown here: the suggestion IS the date, and rendering the
      // content would put an unconfirmed interpretation on a timeline.
      title: null,
      sensitivity: UNDETERMINED,
      href: `/${locale}/app/inbox/${row.id}`,
    });
  }

  items.sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : left.id.localeCompare(right.id)));

  const today = localDateOf(now, timezone);
  const days: CalendarDayView[] = [];
  for (let index = 0; index < dayCount; index += 1) {
    const date = addLocalDays(first, index);
    const key = formatLocalDate(date);
    days.push({
      date: key,
      isToday: compareLocalDates(date, today) === 0,
      items: items.filter((item) => item.date === key),
    });
  }

  return {
    days,
    timezone,
    rangeStart: first,
    rangeEnd: last,
    failedLanes,
    // Counted over everything, masked or not (`2M-PRIVACY-006`).
    itemCount: items.length,
  };
}

/** Re-exported so a caller needs one import to render a day boundary. */
export { localDayBoundsForDate };
export type { LocalDate };

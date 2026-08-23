import type { SupabaseClient } from "@supabase/supabase-js";

import { pageRange, paginateRows } from "@/lib/pagination";
import type { Locale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";

import {
  availableReminderActions,
  hasPendingDelivery,
  toReminderStatus,
  type ReminderAction,
  type ReminderStatus,
} from "./lifecycle";
import type { ExpectedReminderState } from "./schema";

/**
 * The reminders surface's read half (UX-12).
 *
 * ## What changed, and why the page needed a filter to change it
 *
 * The old query was `.neq("status", "cancelled").order("remind_at")` — cancelled
 * reminders were invisible, which was defensible while nothing could restore
 * them. Now `restore` exists, so hiding them would hide the only rows one of the
 * five commands applies to.
 *
 * Simply dropping the `neq` would have been worse than the bug it fixed:
 * `remind_at` ascending puts every long-past delivered reminder at the top of
 * page one, so the owner's *pending* reminders — the reason the page exists —
 * would be pushed past the pagination boundary by their own history. PostgREST
 * cannot order by a `CASE`, so "pending first, then the rest" is not one query.
 *
 * The answer is a view selector, which is also what makes each view's ordering
 * honest: pending reminders read soonest-first because the next one is the
 * interesting one, while delivered and cancelled read most-recent-first because
 * the recent one is. One order for both would be wrong for one of them.
 */

export const REMINDER_VIEWS = ["pending", "delivered", "cancelled", "all"] as const;
export type ReminderView = (typeof REMINDER_VIEWS)[number];

export const DEFAULT_REMINDER_VIEW: ReminderView = "pending";

export function asReminderView(value: unknown): ReminderView {
  return typeof value === "string" && (REMINDER_VIEWS as readonly string[]).includes(value)
    ? (value as ReminderView)
    : DEFAULT_REMINDER_VIEW;
}

/** The statuses each view admits. `all` is `null` — no predicate at all. */
const VIEW_STATUSES: Readonly<Record<ReminderView, readonly ReminderStatus[] | null>> = {
  // `snoozed` rides with `pending` rather than getting a view of its own: it is
  // dormant vocabulary that nothing produces (DEC-7), and a view whose only
  // purpose is to display zero rows forever is a menu entry that lies.
  pending: ["scheduled", "snoozed"],
  delivered: ["sent"],
  cancelled: ["cancelled"],
  all: null,
};

const SELECT =
  "id,title,remind_at,important,status,task_id,entry_id,sent_at,series_id,series_sequence,detached_at";

type ReminderRow = {
  readonly id: string;
  readonly title: string;
  readonly remind_at: string;
  readonly important: boolean;
  readonly status: string;
  readonly task_id: string | null;
  readonly entry_id: string | null;
  readonly sent_at: string | null;
  readonly series_id: string | null;
  readonly series_sequence: number | null;
  readonly detached_at: string | null;
};

/** What the surface links to, when the reminder has a subject at all. */
export type ReminderLink = {
  readonly kind: "task" | "entry";
  readonly href: string;
  readonly label: string;
};

/**
 * What a row needs to know about the rule behind it — slice 2R.2.
 *
 * ## `detached` is carried, not derived from `series === null`
 *
 * A detached occurrence **keeps its `series_id`**: the column is provenance, and
 * `202608230101:619` says so in terms. Reading detachment as "no series" would
 * therefore be wrong twice — it would lose the provenance the migration went out
 * of its way to keep, and it would hide the badge `2R-SERIES-004` needs on
 * screen for "a later series edit did not reclaim it" to be a fact the owner can
 * observe rather than one a test asserts privately.
 *
 * ## `active` comes from the series row, never from the occurrence's status
 *
 * An ended series can still own a `scheduled` detached occurrence — pgTAP
 * asserts exactly that pair — so inferring the rule's state from any one
 * occurrence would report the opposite of the truth for the interesting case.
 */
export type ReminderSeriesRef = {
  readonly id: string;
  /** `status = 'active'` on `public.reminder_series`. An ended rule offers no scope choice. */
  readonly active: boolean;
  /** This occurrence has been pulled out of the rule and will not be reclaimed. */
  readonly detached: boolean;
  readonly sequence: number | null;
};

export type ReminderViewModel = {
  readonly id: string;
  readonly title: string;
  readonly status: ReminderStatus;
  readonly important: boolean;
  /** The raw instant, kept for the expected-state echo. Never rendered directly. */
  readonly remindAt: string;
  readonly sentAt: string | null;
  readonly hasPendingDelivery: boolean;
  /** True when a scheduled reminder's time has already passed. */
  readonly overdue: boolean;
  readonly link: ReminderLink | null;
  /** The rule this occurrence came from, or `null` for an ordinary reminder. */
  readonly series: ReminderSeriesRef | null;
  readonly actions: readonly ReminderAction[];
  /** The four scalars the RPC compares, exactly as this render saw them. */
  readonly expectedState: ExpectedReminderState;
  readonly historyHref: string;
};

export type ReminderPage = {
  readonly reminders: readonly ReminderViewModel[];
  readonly hasNext: boolean;
};

function truncate(value: string, limit = 70): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit - 1)}…`;
}

/**
 * Loads one page of reminders, already decided.
 *
 * Ownership is proved twice, the posture Slice F2 established: RLS is the trust
 * boundary, and the explicit `user_id` predicate is the belt to its braces. A
 * subject belonging to someone else simply does not come back from the label
 * queries, so its reminder renders without a link rather than disclosing that
 * the row exists.
 */
export async function loadReminderPage(
  supabase: SupabaseClient,
  options: {
    readonly userId: string;
    readonly locale: Locale;
    readonly page: number;
    readonly view: ReminderView;
    readonly now: Date;
  },
): Promise<ReminderPage> {
  const { from, to } = pageRange(options.page);
  const statuses = VIEW_STATUSES[options.view];
  const ascending = options.view === "pending";

  let query = supabase
    .from("reminders")
    .select(SELECT)
    .eq("user_id", options.userId)
    .order("remind_at", { ascending })
    .range(from, to);
  if (statuses !== null) query = query.in("status", [...statuses]);

  const result = await query;
  const { items, hasNext } = paginateRows(
    (requireSupabaseData(result, "load reminders") ?? []) as ReminderRow[],
  );

  const labels = await loadSubjectLabels(supabase, options.userId, items);
  const seriesStatus = await loadSeriesStatuses(supabase, options.userId, items);
  const seriesWithLiveOccurrence = await loadSeriesWithLiveOccurrence(
    supabase,
    options.userId,
    items,
  );
  const at = options.now.getTime();

  /**
   * `2R-OCCURRENCE-CANCEL-IRREVERSIBLE` — is `restore` reachable for this row?
   *
   * True only for a **cancelled, still-attached** occurrence whose series has a
   * live one. Each conjunct is load-bearing and each was proved by execution:
   * a detached occurrence restores (the trigger skips it, so no replacement
   * exists), and an occurrence of an ended series restores (the trigger returns
   * early). Widening the predicate would withhold a control that works.
   */
  const slotTaken = (row: ReminderRow): boolean =>
    row.status === "cancelled"
    && typeof row.series_id === "string"
    && row.detached_at === null
    && seriesWithLiveOccurrence.has(row.series_id);

  const reminders = items.map((row): ReminderViewModel => {
    // A status outside the CHECK constraint cannot exist, but the row arrives as
    // JSON over PostgREST and this decides which controls render. Folding an
    // unknown value to `snoozed` — the state that accepts nothing — fails closed:
    // a data fault becomes "no actions offered", never "every action offered".
    const status = toReminderStatus(row.status) ?? "snoozed";
    const remindAtMs = Date.parse(row.remind_at);
    return {
      id: row.id,
      title: row.title,
      status,
      important: row.important,
      remindAt: row.remind_at,
      sentAt: row.sent_at,
      hasPendingDelivery: hasPendingDelivery(status),
      overdue:
        hasPendingDelivery(status) && !Number.isNaN(remindAtMs) && remindAtMs <= at,
      link: buildLink(row, labels, options),
      series: buildSeriesRef(row, seriesStatus),
      actions: availableReminderActions({
        status,
        taskId: row.task_id,
        seriesSlotTaken: slotTaken(row),
      }),
      expectedState: {
        status,
        remindAt: row.remind_at,
        title: row.title,
        important: row.important,
      },
      // The per-reminder audit trail (UX-12's "history where practical"), using
      // the filter surface Slice G4 already shipped rather than a second one.
      historyHref: `/${options.locale}/app/history?entity=reminder&subject=${row.id}`,
    };
  });

  return { reminders, hasNext };
}

/**
 * The rules behind this page's rows, in one owner-scoped query.
 *
 * One query for the page rather than one per row, the same discipline
 * `loadSubjectLabels` follows and for the same reason. Skipped entirely when no
 * row on the page carries a `series_id`, which is every page in an account that
 * has never created a repeating reminder — so the read half of slice 2R.1's
 * table costs nothing until something uses it.
 *
 * **A series that does not come back is treated as absent, never as active.**
 * `public.reminder_series` grants `authenticated` select behind an owner policy,
 * so a row belonging to somebody else simply is not returned — and the fallback
 * has to be the one that offers no controls. Defaulting a missing row to
 * `active: true` would turn a row this reader cannot see into a scope chooser
 * pointed at it.
 */
async function loadSeriesStatuses(
  supabase: SupabaseClient,
  userId: string,
  rows: readonly ReminderRow[],
): Promise<ReadonlyMap<string, string>> {
  /*
    `typeof === "string"`, not `!== null`.

    A row that predates this column — or any caller handing over a projection
    fixture built before slice 2R.2 — carries `undefined` rather than `null`, and
    `undefined !== null` is true. The looser predicate therefore let a page of
    reminders with no series at all issue a query for `in(id, [undefined])`, and
    `projection.test.ts`'s "does not query for labels when no row has a subject"
    is what caught it. `buildSeriesRef` below is guarded the same way.
  */
  const ids = [
    ...new Set(rows.map((row) => row.series_id).filter((id): id is string => typeof id === "string")),
  ];
  if (ids.length === 0) return new Map();

  const result = await supabase
    .from("reminder_series")
    .select("id,status")
    .eq("user_id", userId)
    .in("id", ids);

  const statuses = new Map<string, string>();
  for (const row of (requireSupabaseData(result, "load reminder series") ?? []) as {
    id: string;
    status: string;
  }[]) {
    statuses.set(row.id, row.status);
  }
  return statuses;
}

/**
 * Which of this page's series currently hold a live occurrence.
 *
 * A second query rather than a scan of `items`, and the difference is the whole
 * point: the replacement occurrence is very often **not on this page**. A
 * cancelled occurrence sits in the `cancelled` view while its replacement sits
 * in `pending`, so deriving this from the rows in hand would report "no live
 * occurrence" for exactly the case the flag exists to catch — and the surface
 * would offer a Reactivate that raises `23505`.
 *
 * Owner-scoped and bounded to the series already on the page. Skipped entirely
 * when no row carries a rule.
 */
async function loadSeriesWithLiveOccurrence(
  supabase: SupabaseClient,
  userId: string,
  rows: readonly ReminderRow[],
): Promise<ReadonlySet<string>> {
  const ids = [
    ...new Set(rows.map((row) => row.series_id).filter((id): id is string => typeof id === "string")),
  ];
  if (ids.length === 0) return new Set();

  const result = await supabase
    .from("reminders")
    .select("series_id")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .is("detached_at", null)
    .in("series_id", ids);

  const live = new Set<string>();
  for (const row of (requireSupabaseData(result, "load live series occurrences") ?? []) as {
    series_id: string | null;
  }[]) {
    if (typeof row.series_id === "string") live.add(row.series_id);
  }
  return live;
}

function buildSeriesRef(
  row: ReminderRow,
  statuses: ReadonlyMap<string, string>,
): ReminderSeriesRef | null {
  if (typeof row.series_id !== "string") return null;
  const status = statuses.get(row.series_id);
  if (status === undefined) return null;
  return {
    id: row.series_id,
    active: status === "active",
    detached: row.detached_at !== null,
    sequence: row.series_sequence,
  };
}

type SubjectLabels = {
  readonly tasks: ReadonlyMap<string, string>;
  readonly entries: ReadonlyMap<string, string>;
};

async function loadSubjectLabels(
  supabase: SupabaseClient,
  userId: string,
  rows: readonly ReminderRow[],
): Promise<SubjectLabels> {
  const taskIds = [...new Set(rows.map((row) => row.task_id).filter((id): id is string => id !== null))];
  const entryIds = [...new Set(rows.map((row) => row.entry_id).filter((id): id is string => id !== null))];

  // Two batched queries for the whole page, never one per row. `entry_id` is
  // never set by any writer in this build, so that query is usually skipped
  // entirely rather than issued and discarded.
  const [taskResult, entryResult] = await Promise.all([
    taskIds.length === 0
      ? null
      : supabase.from("tasks").select("id,title").eq("user_id", userId).in("id", taskIds),
    entryIds.length === 0
      ? null
      : supabase
          .from("entries")
          .select("id,original_content")
          .eq("user_id", userId)
          .in("id", entryIds),
  ]);

  const tasks = new Map<string, string>();
  for (const row of (taskResult === null
    ? []
    : (requireSupabaseData(taskResult, "load reminder task labels") ?? [])) as {
    id: string;
    title: string;
  }[]) {
    tasks.set(row.id, truncate(row.title));
  }

  const entries = new Map<string, string>();
  for (const row of (entryResult === null
    ? []
    : (requireSupabaseData(entryResult, "load reminder entry labels") ?? [])) as {
    id: string;
    original_content: string;
  }[]) {
    entries.set(row.id, truncate(row.original_content));
  }

  return { tasks, entries };
}

function buildLink(
  row: ReminderRow,
  labels: SubjectLabels,
  options: { readonly locale: Locale },
): ReminderLink | null {
  // A link is a promise that the destination exists. The label having come back
  // from an owner-scoped query is what proves it — a `task_id` alone would
  // happily produce an href to a row this reader cannot open.
  if (row.task_id !== null) {
    const label = labels.tasks.get(row.task_id);
    if (label === undefined) return null;
    return { kind: "task", href: `/${options.locale}/app/work/${row.task_id}`, label };
  }
  if (row.entry_id !== null) {
    const label = labels.entries.get(row.entry_id);
    if (label === undefined) return null;
    return { kind: "entry", href: `/${options.locale}/app/inbox/${row.entry_id}`, label };
  }
  return null;
}

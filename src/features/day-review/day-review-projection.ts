import "server-only";

/**
 * `2M-REVIEW-001` and `-002` — the day review's data.
 *
 * "A daily review flow exists that composes what the user's day actually
 * contained **from records that already exist**, and **states plainly what it
 * could not read**." And its forward half: "what is committed and what is
 * intended for the following day, **without proposing changes the user has not
 * asked for**."
 *
 * ## Composed, never generated
 *
 * Nothing here calls a model. The implementation plan is explicit that review
 * *generation* is an existing provider call and is unchanged, and that a new
 * model call in this slice stops and asks. So this is five owner-scoped reads and
 * a projection: completed tasks, declared intentions, deadlines, captured
 * entries, and any already-generated `summaries` row whose period covers the day.
 * The generated row is rendered through `toReviewListItemView` — the
 * `review_summary` presentation contract, not around it (`2M-REVIEW-008`).
 *
 * ## Why every source is scored individually
 *
 * `requireSupabaseData` throws, which is right for a surface that cannot be drawn
 * without its data. It is wrong here. A review is a *claim about a day*, and the
 * difference between "nothing was completed" and "I could not read what was
 * completed" is the difference between a report and a fabrication. So each read
 * is scored `read` or `unavailable` on its own, one failure does not take the
 * page down, and `unreadable` is rendered as its own section instead of being
 * folded into four empty ones.
 *
 * `day-review-projection.test.ts` proves the distinction with a negative control:
 * a source that errored must **not** produce the empty-section sentence.
 *
 * ## The next-day scope proposes nothing
 *
 * `2M-REVIEW-002` says the forward flow presents what is committed and intended
 * "without proposing changes the user has not asked for", so the next-day scope
 * reads exactly the same shapes for tomorrow and adds no suggestion, no ranking
 * and no default action. The verbs it offers are the same five, on the same
 * command path, pressed by the same user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { periodTypesFor, type ReviewTab } from "@/features/reviews/review-periods";
import { toReviewSummaryView, type ReviewSummaryView } from "@/features/reviews/review-presentation";
import { deriveTaskSensitivity, type TaskSensitivity } from "@/features/sensitivity/task-derivation";
import type { DayReviewScope } from "@/features/product-analytics/contracts";
import type { Locale } from "@/lib/preferences";
import { addLocalDays, formatLocalDate, type LocalDate } from "@/lib/time/local-day";

import {
  DAY_REVIEW_SOURCES,
  dayReviewVerbsFor,
  type DayReviewSource,
  type DayReviewSourceState,
  type DayReviewVerb,
} from "./contracts";
import { reviewPeriodWindow, type ReviewPeriodWindow } from "./period-window";
import { readReviewSchedule, type ReviewScheduleReading } from "./review-schedule";

const OPEN_TASK_STATUSES = ["inbox", "todo", "in_progress", "waiting", "blocked", "deferred"];

/**
 * The ceiling on every list this surface renders.
 *
 * A review is a report on one day, so an unbounded read would only ever be
 * unbounded for an account whose day went wrong. Stated to the user when it
 * bites, for the same reason the planner states its own.
 */
export const DAY_REVIEW_ITEM_LIMIT = 50;

type TaskRow = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  planned_at: string | null;
  completed_at: string | null;
  source_entry_id: string | null;
};

type EntryRow = { id: string; original_content: string; created_at: string; sensitivity: string | null };

export type DayReviewItem = {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly dueAt: string | null;
  readonly plannedAt: string | null;
  readonly completedAt: string | null;
  readonly sensitivity: TaskSensitivity;
  readonly href: string;
  /** The verbs this row's *current status* admits, derived from the taxonomy. */
  readonly verbs: readonly DayReviewVerb[];
};

export type DayReviewCapture = {
  readonly entryId: string;
  readonly excerpt: string;
  readonly capturedAt: string;
  readonly sensitivity: TaskSensitivity;
  readonly href: string;
};

export type DayReviewProjection = {
  readonly scope: DayReviewScope;
  /** Which of Dia/Semana/Mês this projection covers. */
  readonly tab: ReviewTab;
  /** The span actually read, from the local-day contract. */
  readonly window: ReviewPeriodWindow;
  /**
   * The scope to attribute an applied action to, or **`null` for "do not
   * record"**.
   *
   * `dayReviewScopes` is `["day", "next_day"]` and the deployed `product_events`
   * validator refuses anything else — silently, which this repository has
   * already been caught by once. Widening it is a migration, and this unit
   * spends none.
   *
   * So the week and month tabs record nothing rather than recording
   * `scope: "day"` for an action taken on a month. Q3's funnel keeps measuring
   * exactly the day review it was defined to measure, and the alternative would
   * have been a false row in an append-only ledger.
   */
  readonly telemetryScope: DayReviewScope | null;
  /** `YYYY-MM-DD` — the day being reviewed, in the user's own zone. */
  readonly day: string;
  readonly isToday: boolean;
  readonly timezone: string;
  /** The day `carry_forward` moves an item to: always the day after `day`. */
  readonly nextDay: string;
  readonly completed: readonly DayReviewItem[];
  readonly planned: readonly DayReviewItem[];
  readonly due: readonly DayReviewItem[];
  readonly captured: readonly DayReviewCapture[];
  /**
   * The reviews **written about this exact period**, newest first.
   *
   * A list rather than one row, and scoped to the tab's own `period_type`
   * values. Both changes fix real defects in what this replaced:
   *
   * - It read *"any review whose period covers this day"*, so the **Dia** tab
   *   could render the **weekly** review as its own — the two tie on
   *   `period_end` when the weekly one was generated today, and the order was
   *   decided by nothing.
   * - `generateReview` stores `period_end` as the day it ran, and upserts on all
   *   four key columns, so regenerating on a later day of the same week inserts
   *   a second row. Those are snapshots of one period and belong together here,
   *   not scattered into a list headed "anteriores".
   */
  readonly generated: readonly ReviewSummaryView[];
  /** Per-source outcome. `2M-REVIEW-001`'s "states plainly what it could not read". */
  readonly sourceStates: Readonly<Record<DayReviewSource, DayReviewSourceState>>;
  readonly unreadable: readonly DayReviewSource[];
  readonly truncated: readonly DayReviewSource[];
  readonly schedule: ReviewScheduleReading;
};

/**
 * `2M-PRIVACY-*` and OD-2L-1 B, inherited exactly: an unreadable classification
 * map is an EMPTY map, which resolves to the most protective level rather than
 * to `undetermined`.
 */
async function loadSourceLevels(
  supabase: SupabaseClient<Database>,
  userId: string,
  entryIds: readonly (string | null)[],
): Promise<ReadonlyMap<string, string | null>> {
  const ids = [...new Set(entryIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();
  const result = await supabase.from("entries").select("id,sensitivity").eq("user_id", userId).in("id", ids);
  if (result.error) return new Map();
  const rows = (result.data ?? []) as { id: string; sensitivity: string | null }[];
  return new Map(rows.map((row) => [row.id, row.sensitivity] as const));
}

/** A capture's excerpt: never the whole entry, and never rendered unmasked. */
export function captureExcerpt(content: string): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  return collapsed.length <= 140 ? collapsed : `${collapsed.slice(0, 139)}…`;
}

export async function loadDayReviewProjection(
  supabase: SupabaseClient<Database>,
  input: {
    readonly userId: string;
    readonly locale: Locale;
    readonly timezone: string;
    /**
     * The day the review is anchored to — today for every tab, or tomorrow for
     * the Dia tab's `next_day` scope. The **window** is derived from it and the
     * tab; `carry_forward` still means the day after this one.
     */
    readonly day: LocalDate;
    readonly today: LocalDate;
    readonly scope: DayReviewScope;
    /** Dia, Semana or Mês. `day` reads exactly what it always read. */
    readonly tab: ReviewTab;
    /** Minutes since local midnight in the user's zone, from the caller's clock. */
    readonly nowLocalMinutes: number;
  },
): Promise<DayReviewProjection> {
  const { userId, locale, timezone, day, today, scope, tab } = input;

  const window = reviewPeriodWindow(tab, day, timezone);
  const startIso = window.startIso;
  const endIso = window.endIso;
  const dayKey = formatLocalDate(day);
  const nextDayKey = formatLocalDate(addLocalDays(day, 1));

  const columns = "id,title,status,due_at,planned_at,completed_at,source_entry_id";
  const range = DAY_REVIEW_ITEM_LIMIT;

  const [completedResult, plannedResult, dueResult, capturedResult, generatedResult, preferencesResult] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(columns)
        .eq("user_id", userId)
        .eq("status", "completed")
        .gte("completed_at", startIso)
        .lt("completed_at", endIso)
        .order("completed_at", { ascending: true })
        .range(0, range),
      supabase
        .from("tasks")
        .select(columns)
        .eq("user_id", userId)
        .in("status", OPEN_TASK_STATUSES)
        .gte("planned_at", startIso)
        .lt("planned_at", endIso)
        .order("planned_at", { ascending: true })
        .range(0, range),
      supabase
        .from("tasks")
        .select(columns)
        .eq("user_id", userId)
        .in("status", OPEN_TASK_STATUSES)
        .gte("due_at", startIso)
        .lt("due_at", endIso)
        .order("due_at", { ascending: true })
        .range(0, range),
      supabase
        .from("entries")
        .select("id,original_content,created_at,sensitivity")
        .eq("user_id", userId)
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("created_at", { ascending: true })
        .range(0, range),
      /*
       * The generated review whose period covers this day, if one exists. Read
       * with the raw row shape `toReviewListItemView` declares, so the
       * presentation contract is the only thing that turns a row into words.
       */
      /*
       * `summaries`, not `reviews` — corrected on 2026-08-20.
       *
       * **`reviews` has never existed.** `information_schema` returns nothing
       * matching `%review%` in any schema, and `database.types.ts` has no such
       * key. The table this reads is `summaries`, which carries **exactly** the
       * seven columns selected below, and which `loadReviewListProjection` —
       * the list on the same page — has been reading correctly all along.
       *
       * So this query has always failed, `sourceStates.generated` has always
       * been `"unavailable"`, and the day review has always rendered *"Não foi
       * possível ler: Revisão gerada"* — **twice**, once in the partial-read
       * notice and once in the section itself. The owner reported the page as
       * *"visualmente muito ruim"*; a permanent error banner on every visit is
       * a large part of why.
       *
       * **How it escaped every gate:** the parameter above is typed
       * `SupabaseClient` with **no `<Database>` generic**, so `.from("reviews")`
       * is checked against `any`. `tsc` had nothing to object to. The generic is
       * now applied, which is what makes a wrong table name a build error
       * instead of a silent runtime failure.
       */
      /*
       * Scoped to **this tab's period types** and to the period's own start.
       *
       * The predicate it replaces was `period_start <= today <= period_end`,
       * which is "any review that covers today" — so a weekly review generated
       * today satisfied it just as a daily one did, both ended on the same date,
       * and `order by period_end desc limit 1` chose between them by nothing at
       * all. The Dia tab could show the week's review under its own heading.
       *
       * `period_start` alone identifies the period, because `period_end` records
       * the day the review was *written* rather than the period's last day —
       * see `period-window.ts`. `content` is not selected: the card shows the
       * period, the state and a way in, and the words live on the review's own
       * page behind the OD-2J-1 disclosure.
       */
      supabase
        .from("summaries")
        .select("id,title,period_type,period_start,period_end,status")
        .eq("user_id", userId)
        .in("period_type", periodTypesFor(tab))
        .eq("period_start", window.startKey)
        .order("period_end", { ascending: false })
        .limit(DAY_REVIEW_ITEM_LIMIT),
      supabase
        .from("agent_preferences")
        .select("daily_review_time,weekly_review_time,weekly_review_day")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

  const sourceStates: Record<DayReviewSource, DayReviewSourceState> = {
    completed: completedResult.error ? "unavailable" : "read",
    planned: plannedResult.error ? "unavailable" : "read",
    due: dueResult.error ? "unavailable" : "read",
    captured: capturedResult.error ? "unavailable" : "read",
    generated: generatedResult.error ? "unavailable" : "read",
  };

  const completedRowsRaw = (completedResult.data ?? []) as TaskRow[];
  const plannedRowsRaw = (plannedResult.data ?? []) as TaskRow[];
  const dueRowsRaw = (dueResult.data ?? []) as TaskRow[];
  const capturedRowsRaw = (capturedResult.data ?? []) as EntryRow[];

  const truncated: DayReviewSource[] = [];
  const cut = <Row>(rows: readonly Row[], source: DayReviewSource): readonly Row[] => {
    if (rows.length > DAY_REVIEW_ITEM_LIMIT) truncated.push(source);
    return rows.slice(0, DAY_REVIEW_ITEM_LIMIT);
  };

  const completedRows = cut(completedRowsRaw, "completed");
  const plannedRows = cut(plannedRowsRaw, "planned");
  const dueRows = cut(dueRowsRaw, "due");
  const capturedRows = cut(capturedRowsRaw, "captured");

  const sourceLevels = await loadSourceLevels(
    supabase,
    userId,
    [...completedRows, ...plannedRows, ...dueRows].map((row) => row.source_entry_id),
  );

  const toItem = (row: TaskRow): DayReviewItem => ({
    taskId: row.id,
    title: row.title,
    status: row.status,
    dueAt: row.due_at,
    plannedAt: row.planned_at,
    completedAt: row.completed_at,
    sensitivity: deriveTaskSensitivity(row.source_entry_id, sourceLevels),
    href: `/${locale}/app/work/${row.id}`,
    verbs: dayReviewVerbsFor(row.status),
  });

  const generated = ((generatedResult.data ?? []) as Record<string, unknown>[])
    .map((row) =>
      toReviewSummaryView(
        {
          id: row.id,
          title: row.title,
          period_type: row.period_type,
          period_start: row.period_start,
          period_end: row.period_end,
          status: row.status,
        },
        locale,
      ))
    .filter((view): view is ReviewSummaryView => view !== null);

  const preferences = (preferencesResult.data ?? null) as
    | { daily_review_time: unknown; weekly_review_time: unknown; weekly_review_day: unknown }
    | null;

  return Object.freeze({
    scope,
    tab,
    window,
    // `null` for week and month — see the field's own note. The alternative was
    // a row in an append-only ledger claiming a monthly action happened on a day.
    telemetryScope: tab === "day" ? scope : null,
    day: dayKey,
    isToday: dayKey === formatLocalDate(today),
    timezone,
    nextDay: nextDayKey,
    completed: completedRows.map(toItem),
    planned: plannedRows.map(toItem),
    due: dueRows.map(toItem),
    captured: capturedRows.map((row) => ({
      entryId: row.id,
      excerpt: captureExcerpt(row.original_content),
      capturedAt: row.created_at,
      /*
       * An entry is its own source, so the derivation is the *same* function
       * with a one-entry map rather than a second rule. Writing
       * `{ kind: "derived", level: row.sensitivity }` here would have been a
       * second classification path with its own fail-open — the map form
       * inherits `deriveTaskSensitivity`'s closed vocabulary and its
       * most-protective answer for an unrecognised value.
       */
      sensitivity: deriveTaskSensitivity(row.id, new Map([[row.id, row.sensitivity]])),
      href: `/${locale}/app/inbox/${row.id}`,
    })),
    generated,
    sourceStates: Object.freeze(sourceStates),
    unreadable: Object.freeze(DAY_REVIEW_SOURCES.filter((source) => sourceStates[source] === "unavailable")),
    truncated: Object.freeze(truncated),
    schedule: readReviewSchedule({
      dailyReviewTime: preferences?.daily_review_time,
      weeklyReviewTime: preferences?.weekly_review_time,
      weeklyReviewDay: preferences?.weekly_review_day,
      nowLocalMinutes: input.nowLocalMinutes,
      today,
    }),
  });
}

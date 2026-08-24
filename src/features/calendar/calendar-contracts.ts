/**
 * What the calendar renders, as a value — the boundary between the projection
 * (server-only, owner-scoped) and the surface (client, renders nothing it was
 * not handed).
 *
 * Client-safe by construction: no `server-only` import, no Supabase type, no
 * query. That is what lets `calendar-view.tsx` be a client component without
 * dragging the projection into the browser bundle.
 */

import type { TaskSensitivity } from "@/features/sensitivity/task-derivation";
import type { DetailControl } from "@/features/task-commands/detail-controls";
import type { LocalDate } from "@/lib/time/local-day";

import type { CalendarCommitment, CalendarLane } from "./calendar-query";

/**
 * What an item needs to be rescheduled **in place** (`2M-CAL-009`).
 *
 * ## Why the controls travel already derived, and the status does not
 *
 * The projection is the only thing that has read the task, so it is the only
 * thing that knows the row's real `status` — and `detailControlsFor(status)`, the
 * single authority on which verbs that status admits, runs there. What crosses
 * the boundary is therefore the **answer**, not the input.
 *
 * That is not a style preference. Sending the status instead would mean the
 * client decides which verbs to offer, which is a second eligibility decision in
 * a place that cannot re-check it — and `humanState`'s lossiness on Work is the
 * same lesson one surface over (`2L-EDIT-001`).
 *
 * `null` means *this item is not a reschedulable task*: a reminder, a review, an
 * unconfirmed date, or a task whose status admits no scheduling verb. It is not
 * a permission signal — a task the caller does not own never reaches the
 * projection at all, because every read is owner-scoped.
 */
export type CalendarRescheduleTarget = {
  /** The task's own id, which is what `apply_task_command` resolves against. */
  readonly taskId: string;
  /**
   * The scheduling controls this task's status admits, derived by
   * `schedulingControlsFor` from the taxonomy — never a list written by hand.
   */
  readonly controls: readonly DetailControl[];
};

/**
 * One thing on one day.
 *
 * ## Why the title is `string | null` and the classification travels beside it
 *
 * `2M-PRIVACY-001` requires the *surface* to withhold, which means the surface
 * has to receive something to withhold. So a task's and a reminder's title
 * travel, with `sensitivity` next to them, and `ProtectedContent` decides.
 * That is the shape Phase 2L settled on for Work, and repeating it is the point:
 * a second shape would be a second answer.
 *
 * `title` is `null` for the two lanes that have no user text — a review is
 * rendered as its period and an unconfirmed date as a date. `null` here means
 * *there is nothing to render*, never *there is something and we are hiding it*;
 * the second is what `sensitivity` says.
 */
export type CalendarItemView = {
  readonly id: string;
  readonly lane: CalendarLane;
  readonly commitment: CalendarCommitment;
  /** The instant this item sits at, ISO-8601. Rendered in the user's zone. */
  readonly at: string;
  /** The local date it belongs to, so grouping never re-derives a boundary. */
  readonly date: string;
  readonly title: string | null;
  readonly sensitivity: TaskSensitivity;
  /**
   * Where opening this item goes, or `null` when nothing can be opened.
   *
   * `2M-CAL-008` requires the existing detail surface and the existing return
   * contract rather than a second one, so this is a link into a route that
   * already exists — never a calendar-owned modal with its own state.
   */
  readonly href: string | null;
  /**
   * `2M-CAL-003`. Whether the item is already past its instant, derived at
   * projection time from the same clock the day boundaries use — never from the
   * browser's, which `2M-TIME-003` forbids.
   */
  readonly elapsed: boolean;
  /**
   * `2M-CAL-009`. What this item can be rescheduled with, or `null`.
   *
   * Deliberately **not** `readonly status: string`: see `CalendarRescheduleTarget`.
   */
  readonly reschedule: CalendarRescheduleTarget | null;
  /**
   * `2R-SURFACE-003` — that this occurrence repeats, and how. Slice 2R.3.
   *
   * **A sentence, never a rule.** It is produced by
   * `describeRecurrenceRule`, the reminders feature's single formatter, and the
   * calendar imports that rather than describing a rule itself. Two surfaces
   * phrasing one rule differently is `2R-TZ-SECOND-AUTHORITY`'s shape one level
   * down, and the requirement asks *every* surface that lists a recurring
   * reminder to say the same thing.
   *
   * `null` for everything that is not a repeating reminder's occurrence, which
   * is every other lane and most reminders.
   */
  readonly repeats: string | null;
};

/** One day column, whether or not anything is in it. */
export type CalendarDayView = {
  readonly date: string;
  readonly isToday: boolean;
  /**
   * `2P-CALENDAR-001`. Whether this day belongs to the period being viewed, as
   * opposed to sitting in the grid only to complete a week.
   *
   * Only a month can answer `false`: its grid runs from a Monday to a Sunday and
   * therefore carries up to six days of its neighbours. Every other orientation
   * shows exactly its period, so this is `true` for all of their days and the
   * three existing views are unchanged by its arrival.
   *
   * It is **not** a visibility signal — a trailing day's items are the owner's
   * items and are rendered. It says *this square is context*, which is what lets
   * the surface distinguish it by more than colour.
   */
  readonly inPeriod: boolean;
  readonly items: readonly CalendarItemView[];
};

/**
 * A lane that could not be read.
 *
 * `2M-CAL-011` requires **partial** to be a real state: some lanes loaded and
 * some did not. A calendar that silently dropped a failed lane would show a day
 * that looks empty, which is the same lie masking-rather-than-excluding exists
 * to avoid — so a lane that failed is named, and the surface says so.
 */
export type CalendarLaneFailure = {
  readonly lane: CalendarLane;
};

export type CalendarProjection = {
  readonly days: readonly CalendarDayView[];
  readonly timezone: string;
  readonly rangeStart: LocalDate;
  readonly rangeEnd: LocalDate;
  /** Lanes the user asked for that could not be read. Empty is the ordinary case. */
  readonly failedLanes: readonly CalendarLaneFailure[];
  /**
   * The number of items across every lane, **masked or not** (`2M-PRIVACY-006`).
   *
   * Computed over everything so a count can never become an oracle for what a
   * reader may not see. It exists as a field rather than as a `.length` at the
   * call site for the same reason `visibleCount` exists: the rule most easily
   * broken by a well-meaning `.filter()` three refactors from now.
   */
  readonly itemCount: number;
};

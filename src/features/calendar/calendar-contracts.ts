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
import type { LocalDate } from "@/lib/time/local-day";

import type { CalendarCommitment, CalendarLane } from "./calendar-query";

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
};

/** One day column, whether or not anything is in it. */
export type CalendarDayView = {
  readonly date: string;
  readonly isToday: boolean;
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

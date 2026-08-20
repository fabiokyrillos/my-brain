import { notFound } from "next/navigation";

import { CalendarView } from "@/features/calendar/calendar-view";
import { loadCalendarProjection, requireProfileTimeZone } from "@/features/calendar/calendar-projection";
import { parseCalendarQuery } from "@/features/calendar/calendar-query";
import { getCalendarCopy } from "@/features/calendar/copy";
import { CalendarViewed } from "@/features/product-analytics/interaction-events";
import { undoWorkOperation } from "@/features/task-commands/actions";
import { applyTaskDetailCommand } from "@/features/task-commands/detail-actions";
import { dateBounds } from "@/features/task-commands/detail-controls";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { localDateOf } from "@/lib/time/local-day";

/**
 * `2M-CAL-001` — the calendar, at its own route.
 *
 * **Outside `/app/work`, and not a `workView` value.** OD-2L-2 A signed Work as
 * exactly three views and everything else as a filter within them; a calendar is
 * neither a filter nor a fourth view, so it is a destination of its own. Nothing
 * in `calendar-query.ts` can express a Work position, and nothing here reads
 * one.
 *
 * ## Every load is a fresh owner-scoped read
 *
 * There is no cache of a previous render to replay: returning to this page runs
 * this function again, against the caller's own session, at the current instant.
 * That is what makes `2M-PRIVACY-004`'s "no classification is persisted" and
 * OD-2L-1 B's "re-read at presentation time" true rather than approximately
 * true — a cached calendar would be a calendar showing a classification that had
 * since changed.
 */
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;

  const { supabase, user } = await requireUser(locale);

  /*
   * `2M-TIME-003`. The zone comes from `profiles`, never from the server's
   * environment and never from the browser: two devices in two places must
   * agree about which day an item is on, and only the stored zone can make them.
   *
   * It is resolved **inside** the projection rather than here, so this page has
   * no zone to pass and therefore no way to pass the wrong one. A missing or
   * unsupported zone throws, and the route group's error boundary reports it —
   * which is what `2M-TIME-003` means by "a caller error rather than a silent
   * default".
   */
  const now = new Date();

  /*
   * `2M-CAL-004`/`-005`. The whole description of what the user is looking at is
   * parsed from the URL in one place, and every parameter it cannot recognise
   * resolves to the declared default — never to a wider result set and never to
   * a wider date range.
   */
  /*
   * The zone is read before the URL, because the URL is read *against it*:
   * `2M-CAL-005` resolves an out-of-range or malformed anchor to **today**, and
   * which day that is depends on the zone. Reading the URL first would compare a
   * user's anchor against the host's today, which is wrong for eleven hours a
   * day in São Paulo and wrong differently everywhere else.
   */
  const timezone = await requireProfileTimeZone(supabase, user.id);
  const today = localDateOf(now, timezone);
  const query = parseCalendarQuery(await searchParams, today);

  const projection = await loadCalendarProjection(supabase, {
    userId: user.id,
    locale,
    timezone,
    query,
    now,
  });

  return (
    <>
      <CalendarView
        /*
         * `2M-CAL-009`. The **existing** command path, injected — not a calendar
         * one. `applyTaskDetailCommand` is the same Server Action the task detail
         * and the Work list submit to, and `undoWorkOperation` is the same undo
         * router `undo_operations` has had since Phase 2E. Nothing in
         * `src/features/calendar/` writes to `tasks`, and the direct-write guard's
         * empty `tasks` allowlist is what keeps that true rather than customary.
         */
        dateBounds={dateBounds(now, timezone)}
        locale={locale}
        projection={projection}
        query={query}
        rescheduleAction={applyTaskDetailCommand}
        today={today}
        undoAction={undoWorkOperation}
      />
      {/*
        Q1's producer. It ships after the vocabulary was deployed, not before —
        and `2P-CALENDAR-MONTH-TELEMETRY` is the case where the vocabulary was
        deployed and the orientation is newer than it.

        `private.validate_product_event_properties` admits exactly
        `['day','week','agenda']` for this event, read live against the hosted
        database. Widening it is a third Phase 2P migration, which is a stop
        condition, so `month` is a period the surface shows and the ledger does
        not hear about.

        **Silence is chosen over a refusal nobody would see.** `recordProductEvent`
        maps the validator's `22023` to `invalid_payload` and returns rather than
        throwing, so emitting anyway would produce an event that is accepted by
        the client, refused by the database, and lost with nothing anywhere
        saying so. Relabelling a month as `agenda` to fit the enum was the other
        option and is worse: it would put a false statement in an append-only
        ledger.

        The narrowing is what makes this explicit rather than accidental —
        `CalendarViewed` takes the telemetry vocabulary, so deleting this guard
        does not silently start emitting, it stops the build.
      */}
      {query.orientation === "month" ? null : (
        <CalendarViewed locale={locale} orientation={query.orientation} />
      )}
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: candidate } = await params;
  const locale = isLocale(candidate) ? candidate : "pt-BR";
  return { title: getCalendarCopy(locale).title };
}

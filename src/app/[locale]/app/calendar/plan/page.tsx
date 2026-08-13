import { notFound } from "next/navigation";

import { requireProfileTimeZone } from "@/features/calendar/calendar-projection";
import { applyBulkWorkCommand } from "@/features/operations/actions";
import { getPlannerCopy } from "@/features/planning/copy";
import { loadPlannerProjection } from "@/features/planning/planner-projection";
import { PlannerView } from "@/features/planning/planner-view";
import { undoWorkOperation } from "@/features/task-commands/actions";
import { applyTaskDetailCommand } from "@/features/task-commands/detail-actions";
import { dateBounds } from "@/features/task-commands/detail-controls";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { localDateOf, parseLocalDate } from "@/lib/time/local-day";

/**
 * `2M-PLAN-004` — the daily planner, under `/app/calendar`.
 *
 * **Under the calendar and not beside it**, which is a governance fact rather
 * than a routing preference: migration 1 declared `calendar` as the surface for
 * this phase's events and named the calendar, the planner and the day review as
 * its three residents. A `/app/plan` route would have needed a `planner` surface
 * value the deployed CHECK does not admit — a migration, in a phase whose three
 * are allocated by name.
 *
 * **The day review took the other lawful option** in slice 2M.3: it mounts on
 * `/app/reviews`, the surface reviews already had, and keeps attributing to
 * `calendar`. Both routes are lawful because neither adds a surface value; what
 * is unlawful is a *new* one, and that is what this comment is really about.
 *
 * Every load is a fresh owner-scoped read at the current instant, for the same
 * reason the calendar's is: a cached planner would show a classification, a
 * conflict or a capacity that had since changed.
 */
export default async function PlannerPage({
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
   * The zone before the URL, because the URL is read against it: an absent or
   * unparseable `?date=` resolves to **today**, and which day that is depends on
   * the zone. Reading the URL first would compare the user's day against the
   * host's — wrong for eleven hours a day in São Paulo, and wrong differently
   * everywhere else.
   */
  const now = new Date();
  const timezone = await requireProfileTimeZone(supabase, user.id);
  const today = localDateOf(now, timezone);

  const requested = (await searchParams).date;
  // Fail-closed to today, never to a wider or an arbitrary day. A repeated
  // parameter arrives as an array and is refused for the same reason the Work
  // query refuses one: two values is a malformed request, and picking one would
  // be guessing which the user meant.
  const day = (typeof requested === "string" ? parseLocalDate(requested) : null) ?? today;

  const projection = await loadPlannerProjection(supabase, {
    userId: user.id,
    locale,
    timezone,
    day,
    today,
  });

  return (
    <PlannerView
      /*
       * `2M-PLAN-005`/`-010`. The **existing** command paths, injected — not
       * planner ones. `applyTaskDetailCommand` is the Server Action the task
       * detail, the Work list and the calendar already submit to;
       * `applyBulkWorkCommand` is Phase 2L's, with its own ceiling of 50 and its
       * own partial-result contract; `undoWorkOperation` is the undo router
       * `undo_operations` has had since Phase 2E. Nothing under
       * `src/features/planning/` writes to `tasks`, and the direct-write guard
       * is what keeps that true rather than customary.
       */
      action={applyTaskDetailCommand}
      bulkAction={applyBulkWorkCommand}
      dateBounds={dateBounds(now, timezone)}
      dayHrefBase={`/${locale}/app/calendar/plan`}
      locale={locale}
      projection={projection}
      undoAction={undoWorkOperation}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: candidate } = await params;
  const locale = isLocale(candidate) ? candidate : "pt-BR";
  return { title: getPlannerCopy(locale).title };
}

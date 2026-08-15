import { NotebookTabs } from "lucide-react";
import { notFound } from "next/navigation";
import { generateReview } from "@/features/agent/actions";
import { ReviewButton } from "@/features/agent/forms";
import { requireProfileTimeZone } from "@/features/calendar/calendar-projection";
import { DayReviewView } from "@/features/day-review/day-review-view";
import { loadDayReviewProjection } from "@/features/day-review/day-review-projection";
import { DayReviewOpened } from "@/features/product-analytics/interaction-events";
import { ReviewBody } from "@/features/reviews/review-body";
import { loadReviewListProjection } from "@/features/reviews/review-list";
import { PaginationLinks } from "@/features/shell/pagination-links";
import { undoWorkOperation } from "@/features/task-commands/actions";
import { applyTaskDetailCommand } from "@/features/task-commands/detail-actions";
import { dateBounds } from "@/features/task-commands/detail-controls";
import { requireUser } from "@/lib/auth/require-user";
import { parsePage } from "@/lib/pagination";
import { isLocale } from "@/lib/preferences";
import { addLocalDays, localDateOf, localDayBoundsForDate } from "@/lib/time/local-day";

/**
 * `2M-REVIEW-001` … `-008` — the day review, **on the surface reviews already
 * had**.
 *
 * The generated-review list, its four period buttons and its pagination are
 * untouched below; the day review is composed above them from records that
 * already exist. One destination for "closing a period", rather than a second
 * review surface the user has to know about — and `review-presentation.ts` is
 * the only thing that turns a stored review row into words on either half
 * (`2M-REVIEW-008`).
 *
 * **The events attribute to `calendar`.** That is the surface migration
 * `202608110090` deployed for this phase, and its declaration names the
 * calendar, the planner and the day review as its three residents. A `reviews`
 * surface value the deployed CHECK does not admit would be a fourth migration in
 * a phase whose three are allocated by name — a stop condition, not a routing
 * detail. Attribution by product area rather than by route is the shape
 * `task_command` has had since Phase 2E.
 */
export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[]; scope?: string | string[] }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const query = await searchParams;
  const page = parsePage(query.page);
  // Fail-closed to the day, never to an arbitrary scope: a repeated parameter
  // arrives as an array and is refused for the same reason the planner refuses
  // one — two values is a malformed request, and picking one would be guessing.
  const scope = query.scope === "next_day" ? "next_day" : "day";

  const { supabase, user } = await requireUser(locale);

  /*
   * The zone before the day, because the day is computed against it. Reading the
   * clock first would compare the user's day against the host's — wrong for
   * eleven hours a day in São Paulo, and wrong differently everywhere else.
   */
  const now = new Date();
  const timezone = await requireProfileTimeZone(supabase, user.id);
  const today = localDateOf(now, timezone);
  const day = scope === "next_day" ? addLocalDays(today, 1) : today;

  /*
   * Minutes since local midnight, from the one local-day contract. Computed here
   * rather than inside the projection so the projection stays a pure read with a
   * clock handed to it, and so there is no second implementation of "what time is
   * it where the user is".
   */
  const todayBounds = localDayBoundsForDate(today, timezone);
  const nowLocalMinutes = Math.max(0, Math.floor((now.getTime() - todayBounds.start) / 60_000));

  const [projection, { items, hasNext }] = await Promise.all([
    loadDayReviewProjection(supabase, {
      userId: user.id,
      locale,
      timezone,
      day,
      today,
      scope,
      nowLocalMinutes,
    }),
    loadReviewListProjection(supabase, { userId: user.id, locale, page }),
  ]);

  return <div className="content-page reviews-page">
    <DayReviewOpened locale={locale} scope={scope} />
    {/*
      The page's own name, **first**.

      It used to sit below the day review, so `/app/reviews` opened on a heading
      two levels down and the `<h1>` arrived after several screens of content.
      One `<h1>` was already true; the *order* was the half the count did not
      check, and the outline is what a screen-reader user navigates by.
    */}
    <header className="reviews-header">
      <p className="eyebrow">{pt ? "FECHAMENTO SOB DEMANDA" : "ON-DEMAND REVIEW"}</p>
      <h1>{pt ? "Revisões" : "Reviews"}</h1>
      <p className="reviews-lead">{pt ? "Gere uma revisão quando quiser; nada é executado por horário configurado." : "Generate a review when you choose; nothing runs from a configured schedule."}</p>
    </header>

    <DayReviewView
      /*
       * `2M-REVIEW-003`/`-004`. The **existing** command paths, injected — not
       * review ones. `applyTaskDetailCommand` is the Server Action the task
       * detail, the Work list, the calendar and the planner already submit to;
       * `undoWorkOperation` is the undo router `undo_operations` has had since
       * Phase 2E. Nothing under `src/features/day-review/` writes to `tasks`, and
       * the direct-write guard is what keeps that true rather than customary.
       */
      action={applyTaskDetailCommand}
      dateBounds={dateBounds(now, timezone)}
      locale={locale}
      projection={projection}
      reviewsHref={`/${locale}/app/reviews`}
      undoAction={undoWorkOperation}
    />

    <section aria-labelledby="reviews-history" className="reviews-history">
      <h2 id="reviews-history">{pt ? "Revisões geradas" : "Generated reviews"}</h2>
      {/*
        The section says what its four buttons do before offering them. It read
        as a toolbar with no subject: the day review above closes a day from
        records that already exist, and these ask the assistant to write a
        period up — a different act, and the only one on this page that spends
        anything.
      */}
      <p className="reviews-history-lead">
        {pt
          ? "Cada botão pede ao Brain uma síntese escrita do período. Nada aqui roda sozinho — e nada é alterado por gerar uma revisão."
          : "Each button asks Brain to write up a period. Nothing here runs on its own, and generating a review changes nothing."}
      </p>
      <div className="review-buttons"><ReviewButton action={generateReview} locale={locale} period="daily" /><ReviewButton action={generateReview} locale={locale} period="weekly_review" /><ReviewButton action={generateReview} locale={locale} period="weekly_plan" /><ReviewButton action={generateReview} locale={locale} period="monthly" /></div>
      {items.length ? <div className="review-list">{items.map((review) => <article className="review-card" key={review.id}><header><div><span>{review.periodLabel}</span><h3>{review.title}</h3></div><span className="status-badge" data-tone={review.statusTone}>{review.statusLabel}</span></header><ReviewBody reviewId={review.id} content={review.content} locale={locale} /><footer>{review.periodLabelRange}</footer></article>)}</div> : <div className="empty-list"><NotebookTabs size={30} /><strong>{pt ? "Nenhuma revisão ainda" : "No reviews yet"}</strong><p>{pt ? "Gere uma revisão quando houver atividade no período." : "Generate a review when there is activity in the period."}</p></div>}
      <PaginationLinks locale={locale} path="reviews" page={page} hasNext={hasNext} />
    </section>
  </div>;
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { generateReview } from "@/features/agent/actions";
import { UniversalStateView } from "@/features/experience/universal-state";
import { ReviewButton } from "@/features/agent/forms";
import { requireProfileTimeZone } from "@/features/calendar/calendar-projection";
import { DayReviewView } from "@/features/day-review/day-review-view";
import { getDayReviewCopy } from "@/features/day-review/copy";
import { loadDayReviewProjection } from "@/features/day-review/day-review-projection";
import { reviewPeriodWindow } from "@/features/day-review/period-window";
import { DayReviewOpened } from "@/features/product-analytics/interaction-events";
import { formatReviewPeriodRange } from "@/features/reviews/period-format";
import { parseReviewTab, periodTypesFor, REVIEW_TABS } from "@/features/reviews/review-periods";
import { ReviewTabs } from "@/features/reviews/review-tabs";
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
 * `/app/reviews` — Dia · Semana · Mês.
 *
 * ## The shape the owner signed
 *
 * *"Cada aba mostra a revisão do período atual, suas ações e, abaixo, o
 * histórico das revisões anteriores daquele mesmo tipo."* So the page is two
 * parts and a tab strip, and each part answers one question:
 *
 * - **Parte A** — what this period contained, what was written about it, and
 *   what can be done about either. Composed from records that already exist.
 * - **Parte B** — the same kind of review, for periods that have passed. Type,
 *   period, state, and a way in. Nothing else.
 *
 * ## Why the tab is a URL parameter
 *
 * "Recarregar, voltar e avançar no navegador deve preservar a opção
 * selecionada" is a property of the address bar. The three controls are links,
 * the selection is read from `searchParams`, and there is no component state
 * that could fall out of step with what the URL says.
 *
 * Both parameters **fail closed**: `period` to `day`, `scope` to `day`. A
 * repeated parameter arrives as an array and is refused for the same reason
 * either way — two values is a malformed request, and choosing one would mean
 * showing a period the URL does not name.
 *
 * ## The events attribute to `calendar`
 *
 * That is the surface migration `202608110090` deployed for this phase, and its
 * declaration names the calendar, the planner and the day review as its three
 * residents. A `reviews` surface value the deployed CHECK does not admit would
 * be a migration, and this unit spends none. `DayReviewOpened` also mounts only
 * on the **Dia** tab: `dayReviewScopes` is `["day", "next_day"]`, so a week or a
 * month has no legal value to report, and no row is more honest than a wrong one.
 */
export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string | string[];
    period?: string | string[];
    scope?: string | string[];
  }>;
}) {
  const { locale: candidate } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const pt = locale === "pt-BR";
  const query = await searchParams;
  const page = parsePage(query.page);
  const tab = parseReviewTab(query.period);
  // The day/next-day scope belongs to the Dia tab. On the other two it is
  // forced back to `day` rather than merely ignored, so nothing downstream can
  // read a scope the visible controls do not offer.
  const scope = tab === "day" && query.scope === "next_day" ? "next_day" : "day";

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

  /*
   * Both reads at once, and the measurement is why.
   *
   * The history used to `await` the whole projection just to learn the window's
   * start date — so the page ran **four** sequential waves against the database
   * (`requireUser`, the timezone, the projection's six queries, then this one)
   * where three were enough. Nothing about the exclusion needed the projection:
   * `reviewPeriodWindow` is pure, takes `(tab, day, timezone)`, and the
   * projection derives its own window from the same three values.
   *
   * Computing it here and passing it to both is what removes the wave. It also
   * makes the two agree by construction rather than by both being right: if the
   * window the history excludes ever differed from the window the projection
   * read, the running period would appear twice — the exact defect this page was
   * redesigned to remove.
   */
  const window = reviewPeriodWindow(tab, day, timezone);

  const [projection, { items, hasNext }] = await Promise.all([
    loadDayReviewProjection(supabase, {
      userId: user.id,
      locale,
      timezone,
      day,
      today,
      scope,
      tab,
      nowLocalMinutes,
    }),
    loadReviewListProjection(supabase, {
      userId: user.id,
      locale,
      page,
      tab,
      excludePeriodStart: window.startKey,
    }),
  ]);

  const copy = getDayReviewCopy(locale);
  /*
   * A plain record rather than a function: `ReviewTabs` is a client component,
   * and a function prop cannot cross that boundary — React throws at render, and
   * `client-boundary-serializability-guard.test.ts` fails the build. This branch
   * has already paid for that lesson once.
   */
  const hrefFor = Object.fromEntries(
    REVIEW_TABS.map((value) => [value, `/${locale}/app/reviews?period=${value}`]),
  ) as Record<(typeof REVIEW_TABS)[number], string>;

  return <div className="content-page reviews-page">
    {/*
      Only on the Dia tab. See the header note: the scope vocabulary is closed
      and deployed, so the week and month tabs have nothing legal to say.
    */}
    {tab === "day" ? <DayReviewOpened locale={locale} scope={scope} /> : null}

    <header className="reviews-header">
      <p className="eyebrow">{pt ? "FECHAMENTO SOB DEMANDA" : "ON-DEMAND REVIEW"}</p>
      <h1>{pt ? "Revisões" : "Reviews"}</h1>
      <p className="reviews-lead">{pt ? "Gere uma revisão quando quiser; nada é executado por horário configurado." : "Generate a review when you choose; nothing runs from a configured schedule."}</p>
    </header>

    {/*
      The tab strip — the page's primary navigation, immediately under its own
      name. Still links, so the browser's back and forward move between periods
      and a shared URL opens the period it names.

      `aria-current="page"` is still derived on the **server** from
      `searchParams`, which is what a screen reader announces and what keeps the
      URL the only source of truth. What moved into a client component is the
      **pending** indicator: measured against the production build, the control
      took 1 476ms (desktop), 1 427ms (Pixel 7) and 1 643ms (iPhone WebKit) to
      look selected, because the selected state could not move until the server
      render arrived. See `review-tabs.tsx`.
    */}
    <ReviewTabs
      currentTab={tab}
      hrefFor={hrefFor}
      label={copy.tabsLabel}
      labels={copy.tabs}
    />

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
      /*
       * One control per `period_type` this tab owns: Dia writes `daily`, Semana
       * writes `weekly_review` and `weekly_plan`, Mês writes `monthly`. Derived
       * from `periodTypesFor` rather than listed here, so a tab can never offer
       * a button whose output files under a different tab.
       *
       * `generateReview` itself is untouched — same gate, same rate limit, same
       * ledger, same upsert. What changed is which button is on screen.
       */
      generateControls={periodTypesFor(tab).map((periodType) => (
        <ReviewButton action={generateReview} key={periodType} locale={locale} period={periodType} />
      ))}
      locale={locale}
      periodRange={formatReviewPeriodRange(projection.window, locale)}
      projection={projection}
      reviewsHref={`/${locale}/app/reviews`}
      undoAction={undoWorkOperation}
    />

    {/*
      Parte B. Below the current period, visually quieter, and holding only what
      the owner's decision names: type, period, state, and "Abrir revisão".

      There is **no preview and no expander**. `ReviewBody` used to mount per row
      and disclose the summary inside the list; under OD-2J-1 every summary is
      masked, so a preview here would be the *"conteúdo mascarado exposto por
      meio de prévias"* the instruction forbids. The words live on the review's
      own page, behind the same disclosure, which is also the only place they are
      read from the database at all.
    */}
    <section aria-labelledby="reviews-history" className="reviews-history">
      <h2 id="reviews-history">{copy.historyHeading(tab)}</h2>
      <p className="reviews-history-lead">{copy.historyLead(tab)}</p>
      {items.length ? (
        <ul className="review-history-list">
          {items.map((review) => (
            <li className="review-history-item" key={review.id}>
              <div>
                <span className="review-card-period">{review.periodLabel}</span>
                <h3>{review.title}</h3>
                <p className="review-card-range">{review.periodLabelRange}</p>
              </div>
              <span className="status-badge" data-tone={review.statusTone}>{review.statusLabel}</span>
              {/* Named by period, for the reason the card above is: a list of
                  links all called "Abrir revisão" is one a screen reader
                  cannot tell apart. Structural labels only — never the
                  review's words. */}
              <Link
                aria-label={`${copy.openReview}: ${review.periodLabel}, ${review.periodLabelRange}`}
                className="review-open"
                href={`/${locale}/app/reviews/${review.id}`}
              >
                {copy.openReview}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <UniversalStateView
          description={copy.historyEmptyDescription(tab)}
          locale={locale}
          state="empty"
          title={copy.historyEmptyTitle(tab)}
        />
      )}
      {/*
        The whole page state travels with the page number. Without the tab, page
        2 of the month history would silently return to the day; without the
        scope, paging while reviewing tomorrow would silently return to today.
      */}
      <PaginationLinks
        locale={locale}
        path="reviews"
        page={page}
        hasNext={hasNext}
        query={scope === "next_day" ? { period: tab, scope } : { period: tab }}
      />
    </section>
  </div>;
}

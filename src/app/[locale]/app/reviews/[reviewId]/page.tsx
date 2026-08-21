import { ArrowLeft, ScrollText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { generateReview } from "@/features/agent/actions";
import { ReviewButton } from "@/features/agent/forms";
import { calendarHref, CALENDAR_LANES } from "@/features/calendar/calendar-query";
import { requireProfileTimeZone } from "@/features/calendar/calendar-projection";
import { belongsToCurrentPeriod, reviewPeriodWindow } from "@/features/day-review/period-window";
import { UniversalStateLine } from "@/features/experience/universal-state";
import { getReviewDetailCopy } from "@/features/reviews/copy";
import { parseReviewMarkdown } from "@/features/reviews/markdown";
import { formatReviewPeriodRange } from "@/features/reviews/period-format";
import { RenderedReviewContent } from "@/features/reviews/rendered-markdown";
import { resolveReviewSources, vouchedFrom } from "@/features/reviews/review-sources";
import { ReviewSourcesList } from "@/features/reviews/review-sources-list";
import { calendarOrientationFor } from "@/features/reviews/review-periods";
import { toReviewDetailView } from "@/features/reviews/review-presentation";
import { requireUser } from "@/lib/auth/require-user";
import { isLocale } from "@/lib/preferences";
import { requireSupabaseData } from "@/lib/supabase/result";
import { formatInstant } from "@/lib/time/instant-format";
import { localDateOf, parseLocalDate } from "@/lib/time/local-day";

/**
 * A generated review, on a page of its own.
 *
 * ## Why this route exists
 *
 * A review had no surface. Its words were disclosed inside a list row, which
 * meant the only way to read a monthly review was to expand it inside a page
 * about something else, with no address of its own to return to or share.
 *
 * `reviewId` is `summaries.id` — the model's existing identity, following
 * `memories/[memoryId]`, `people/[personId]`, `projects/[projectId]` and
 * `inbox/[entryId]`. No second identity system is introduced, and none is
 * needed: the row already has a primary key.
 *
 * ## Isolation is one arm, on purpose
 *
 * The read is by id under RLS, and `notFound()` covers **removed, foreign and
 * never-existed alike**. There is deliberately no branch that could tell them
 * apart, and therefore no way to use this page to learn whether another
 * account's review id is real — a "this review was deleted" message would be
 * exactly that probe, because it would answer differently for a foreign id than
 * for a missing one.
 *
 * ## This page writes nothing by being opened
 *
 * It reads one row and formats it. The only control that reaches a Server Action
 * is the regenerate button, it is pressed by the owner, and it is rendered only
 * for the period that is currently running — see below. The authority guard
 * (`phase-2m-review-authority-guard.test.ts`) walks this directory and fails the
 * build on a direct write, an RPC, a privileged client or a `"use server"`
 * declaration here.
 */
export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ locale: string; reviewId: string }>;
}) {
  const { locale: candidate, reviewId } = await params;
  if (!isLocale(candidate)) notFound();
  const locale = candidate;
  const copy = getReviewDetailCopy(locale);

  const { supabase, user } = await requireUser(locale);

  const result = await supabase
    .from("summaries")
    .select("id,title,content,period_type,period_start,period_end,status,generated_at,model,citations")
    .eq("user_id", user.id)
    .eq("id", reviewId)
    .maybeSingle();
  const row = requireSupabaseData(result, "load review");
  if (!row) notFound();

  const review = toReviewDetailView(row, locale);
  // Unreachable for a row the deployed CHECK constraints admit, and refused
  // rather than rendered around: a review whose `period_type` or `status` this
  // build does not know is a row the page cannot describe truthfully.
  if (!review) notFound();

  const timezone = await requireProfileTimeZone(supabase, user.id);
  const now = new Date();
  const today = localDateOf(now, timezone);

  /*
   * The window this review is *about*, rebuilt from its own stored start date
   * rather than from today — so a review of March renders March's span, and the
   * calendar link below points at March.
   *
   * `parseLocalDate` can refuse, and the fallback is today's window: the value
   * came out of a `date` column and through `toReviewDetailView`'s own
   * `YYYY-MM-DD` check, so a refusal here means the date is unusable, and the
   * page states the stored range from the presentation contract regardless.
   */
  const storedStart = parseLocalDate(review.periodStart) ?? today;
  const window = reviewPeriodWindow(review.tab, storedStart, timezone);
  const currentWindow = reviewPeriodWindow(review.tab, today, timezone);

  /*
   * Whether "generate again" would update **this** review or write a different
   * one.
   *
   * `generateReview` upserts on `(user_id, period_type, period_start,
   * period_end)` computed from *now*. Offering the control on a past review's
   * page would silently create a row for the current period while appearing to
   * refresh the one on screen — so it is rendered only for the running period,
   * and the page says plainly why it is absent otherwise.
   */
  const isCurrent = belongsToCurrentPeriod(currentWindow, review.periodStart);

  /*
   * `2N-KNOWS-003`'s posture, finally satisfiable — `2Q-LINK-001`.
   *
   * The allow-set used to be `new Set<string>()` because `summaries` carried
   * nothing to vouch for. Since `202608210100` it carries `citations`, so the
   * page derives its allow-set **from the stored envelope and from nothing
   * else** — and only after **re-reading every cited record now**, under this
   * reader's own session (`2Q-TRUST-001`). A stored reference is a claim about
   * what was cited; it is never evidence the row still exists.
   *
   * Three properties follow, and none of them is incidental:
   *
   *   - a link exists only where a canonical, owner-scoped identifier was
   *     recorded at generation time — **never** because a name in the Markdown
   *     looked like a record (`2Q-LINK-004`);
   *   - the gate binds the **pair** `(type, id)`, so an entry id cannot
   *     authorize a task route (`2Q-LINK-002`);
   *   - a refused link becomes **text**, never nothing, so the model's sentence
   *     survives intact (`2Q-LINK-003`).
   */
  const sources = await resolveReviewSources(supabase, user.id, row.citations, locale);
  const blocks = parseReviewMarkdown(review.content, { vouchedFor: vouchedFrom(sources) });
  const periodHref = calendarHref(locale, {
    orientation: calendarOrientationFor(review.tab),
    anchor: window.startDate,
    lanes: CALENDAR_LANES,
  });
  const tabHref = `/${locale}/app/reviews?period=${review.tab}`;

  return (
    <div className="content-page entity-detail review-detail">
      <Link className="back-link" href={tabHref}>
        <ArrowLeft size={16} />
        {copy.back}
      </Link>

      <header className="entity-hero review-hero">
        <ScrollText size={28} />
        <div>
          <p className="eyebrow">{review.periodLabel.toUpperCase()}</p>
          <h1>{review.title}</h1>
          <p className="review-detail-range">{formatReviewPeriodRange(window, locale)}</p>
          <p className="review-detail-meta">
            <span className="status-badge" data-tone={review.statusTone}>{review.statusLabel}</span>
            <span>{copy.generatedAt(formatInstant(row.generated_at, "dayAndTime", locale, timezone) ?? "—")}</span>
          </p>
        </div>
      </header>

      {/*
        The words, shown — **an owner amendment to OD-2J-1, signed 2026-08-20**.

        This page used to open masked, behind a "Mostrar resumo" control. The
        owner's reasoning for removing it is on the record and is about *this*
        page specifically: a person who has already signed in and deliberately
        opened a review **that belongs to their own account** should not have to
        click again to see it.

        ## What the amendment did NOT change

        The masking rule itself is untouched: `review_summary` still resolves
        `{ normal: SHOW, private: SHOW, highly_sensitive: MASK }` in
        `sensitivity/contracts.ts`, exactly as `hoje`, `attention` and `chat` do.
        **The mask never came from that rule.** It came from `review-body.tsx`
        hard-coding `highly_sensitive` as the level of every summary, because
        `summaries` carries no classification to read. Fabricating the most
        protective level for a row that has none is what the owner overruled.

        The listing still carries **no content at all** — `loadReviewListProjection`
        does not select the column and `toReviewSummaryView` has no such field —
        so "visible by default" reaches exactly one place: an authenticated
        owner's own review, on its own page. Access control is unchanged: the
        read is `eq("user_id", user.id)` under RLS, and a row that is not the
        reader's simply does not come back.
      */}
      <section aria-labelledby="review-content" className="review-detail-content">
        <h2 id="review-content">{copy.contentHeading}</h2>
        {blocks.length === 0 ? (
          <UniversalStateLine description={copy.contentEmpty} locale={locale} state="empty" />
        ) : (
          <RenderedReviewContent blocks={blocks} />
        )}
      </section>

      {/*
        Where this came from — and since `202608210100`, **which records**.

        `OD-2Q-5` is signed as **option C**: every cited record is reachable by a
        canonical link, identified by its kind and its date, and **no content of
        it appears here**. No preview, no excerpt, no title. The review's own
        prose above already says what it is about; this area exists to point at
        the object, and opening the link is what shows it — under the destination
        page's own rules, not this page's.

        A review whose references were never recorded says so **honestly**
        (`2Q-LINK-007`) rather than showing an empty container: ADR-125
        Decision 4 already ruled that a "Fontes" section without canonical links
        in it is not delivery, and that ruling is inherited.
      */}
      <section aria-labelledby="review-sources" className="review-detail-sources">
        <h2 id="review-sources">{copy.sourcesHeading}</h2>
        <p className="section-explainer">{copy.sourcesExplainer}</p>
        {sources.rows.length > 0 ? (
          <>
            <h3 className="review-cited-heading">{copy.sourcesListHeading}</h3>
            <ReviewSourcesList copy={copy} locale={locale} rows={sources.rows} timezone={timezone} />
          </>
        ) : null}
        <dl className="review-source-facts">
          <div>
            <dt>{copy.periodLabel}</dt>
            <dd>{review.periodLabelRange}</dd>
          </div>
          <div>
            <dt>{copy.modelLabel}</dt>
            <dd>{typeof row.model === "string" && row.model ? row.model : copy.modelUnknown}</dd>
          </div>
          <div>
            <dt>{copy.kindLabel}</dt>
            <dd>{review.periodLabel}</dd>
          </div>
        </dl>
        {sources.rows.length === 0 ? (
          <p className="review-detail-unlinked">{copy.sourcesNotLinked}</p>
        ) : null}
      </section>

      {/*
        Actions on real, identified objects — and no others.

        The row itself identifies exactly one thing: its own period. So the links
        are to that period in the calendar and to the tab it files under, both
        built from canonical columns through the calendar's own href builder.

        The task-level verbs are **not** duplicated here. They live on the tab's
        Parte A, where a task is a row with an id read this request under RLS; a
        copy of them on this page would have nothing real to act on, since the
        stored review names no task.
      */}
      <section aria-labelledby="review-actions" className="review-detail-actions">
        <h2 id="review-actions">{copy.actionsHeading}</h2>
        <ul className="review-action-links">
          <li><Link className="row-action" href={periodHref}>{copy.openPeriod}</Link></li>
          <li><Link className="row-action" href={tabHref}>{copy.openTab(review.tab)}</Link></li>
        </ul>
        {isCurrent ? (
          <div className="review-regenerate">
            <p>{copy.regenerateExplainer}</p>
            <div className="review-buttons">
              <ReviewButton action={generateReview} locale={locale} period={review.periodType} />
            </div>
          </div>
        ) : (
          <p className="review-detail-past">{copy.regenerateUnavailable}</p>
        )}
      </section>
    </div>
  );
}

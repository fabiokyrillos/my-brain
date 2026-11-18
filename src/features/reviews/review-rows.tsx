import Link from "next/link";

import type { ReviewSummaryView } from "./review-presentation";

/**
 * Written reviews as rows — the period's own on the tab's first part, and the
 * earlier ones in the history under it.
 *
 * ## Why one component
 *
 * The two lists were the same row built twice, and each had grown its own
 * shape: an eyebrow, a serif title, a range, a badge and a full-width "Abrir
 * revisão" button, five of them a screen tall on a phone. On the Dia tab every
 * one of those rows read "Resumo do dia / Resumo diário" — the tab's own name,
 * twice — above the only thing that told them apart, the dates.
 *
 * So the dates are the row and the row is the link. The kind sits under them as
 * a caption, because on the Semana tab it does distinguish a review from a
 * plan; the stored title is not repeated here (it is the heading of the
 * review's own page); and the state is a word at the end of the row, which is
 * the fourth thing the owner's decision asks a history row to carry.
 *
 * ## What it cannot show
 *
 * `ReviewSummaryView` has no content field, so there is no preview to render
 * and nothing a row could leak (`2M-REVIEW-008`, OD-2J-1). Every string here is
 * the presentation contract's own; this component formats nothing.
 *
 * ## The accessible name says WHICH review
 *
 * Several rows stand on one screen, and a list of links all named "Abrir
 * revisão" is one a screen reader cannot tell apart. The name is built from the
 * period label and range — structural, never the review's words.
 */
export function ReviewRows({
  baseHref,
  className,
  openLabel,
  reviews,
}: {
  /** The reviews route; a review's page is `${baseHref}/${id}`. */
  readonly baseHref: string;
  /** The list's own class, kept so each list stays addressable by name. */
  readonly className: string;
  readonly openLabel: string;
  readonly reviews: readonly ReviewSummaryView[];
}) {
  return (
    <ul className={`review-rows ${className}`}>
      {reviews.map((review) => (
        <li className="review-row" key={review.id}>
          <Link
            aria-label={`${openLabel}: ${review.periodLabel}, ${review.periodLabelRange}`}
            className="review-row-link"
            href={`${baseHref}/${review.id}`}
          >
            <span className="review-row-range">{review.periodLabelRange}</span>
            <span className="review-row-kind">{review.periodLabel}</span>
          </Link>
          <span className="review-row-status" data-tone={review.statusTone}>{review.statusLabel}</span>
        </li>
      ))}
    </ul>
  );
}

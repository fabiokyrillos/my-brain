import Link from "next/link";

import { formatInstant } from "@/lib/time/instant-format";
import type { Locale } from "@/lib/preferences";

import type { ReviewDetailCopy } from "./copy";
import type { ReviewSourceRow } from "./review-sources";

/**
 * The cited items on a review page — **identification and a link, no content.**
 *
 * `OD-2Q-5`, signed as **option C**. Every row carries a kind, a date and a
 * canonical link, and it carries them **the same way for every citation**.
 *
 * ## What this component cannot do, by shape
 *
 * It receives `ReviewSourceRow`, which has no `title`, `snippet`, `excerpt`,
 * `preview` or `sensitivity` field. So there is no title to print, no excerpt to
 * truncate and no classification to branch on. `2Q-LINK-008` asks that the shape
 * have nowhere to put content; this is the renderer of that shape, and it could
 * not disobey without a visible type change upstream.
 *
 * ## Why there is no reveal control
 *
 * `2Q-TRUST-009`. The owner forbade one by name, and the shared `MASK`
 * presentation carries `revealable: true` — so honouring "no reveal" through the
 * rules table would have meant either a new presentation variant or an edit to
 * `RULES`, both forbidden by ADR-124 Decision 2. Option C avoids the conflict
 * entirely: nothing maskable is rendered, so there is nothing to reveal. **The
 * only interactive element in a row is the link itself**, and that is asserted.
 *
 * ## An unavailable row is not a broken link, and not a probe
 *
 * Removed, unreadable and foreign produce the identical row: same kind word,
 * same sentence, **no anchor**. The page cannot be used to learn which of the
 * three happened, or whether another account's id is real.
 */
export function ReviewSourcesList({
  copy,
  locale,
  rows,
  timezone,
}: {
  readonly copy: ReviewDetailCopy;
  readonly locale: Locale;
  readonly rows: readonly ReviewSourceRow[];
  readonly timezone: string;
}) {
  return (
    <ul className="review-cited-list">
      {rows.map((row) => {
        const kind = copy.sourceKind(row.type);
        // `day`, never `dayAndTime`: a time of day is a finer fact about the
        // owner's life than the sources area needs to identify an object, and
        // this list exists to point rather than to describe.
        const when = row.occurredAt
          ? formatInstant(row.occurredAt, "day", locale, timezone)
          : null;
        return (
          <li className="review-cited-row" key={row.key}>
            {/*
              The kind is a `data-` attribute rather than a class per type, so a
              future stylesheet cannot give one classification's row a different
              look without that being a visible, deliberate edit. The rendered
              text is identical machinery for every type.
            */}
            <span className="review-cited-kind" data-kind={row.type}>{kind}</span>
            <span className="review-cited-when">{when ?? "—"}</span>
            {row.href ? (
              <Link className="review-cited-link" href={row.href}>
                {copy.sourceOpen(kind, when)}
              </Link>
            ) : (
              <span className="review-cited-gone">{copy.sourceUnavailable}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

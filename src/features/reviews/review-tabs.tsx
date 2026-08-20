"use client";

import Link, { useLinkStatus } from "next/link";

import type { ReviewTab } from "./review-periods";
import { REVIEW_TABS } from "./review-periods";

/**
 * Dia · Semana · Mês — the same three links, now with an answer to the tap.
 *
 * ## The measurement this exists to fix
 *
 * Against the **production** build (`next start`, because `link.md` says
 * "Prefetching is only enabled in production"), the tap-to-selected-state time
 * was measured at **1 476 ms desktop, 1 427 ms Pixel 7, 1 643 ms iPhone
 * WebKit** — and content arrived at 1 882 / 1 865 / 2 021 ms. The
 * `loading.tsx` skeleton never appeared (`skeletonShown: false` on every hop),
 * so nothing at all changed on screen for roughly a second and a half after the
 * finger came off the glass. That is the owner's *"pequena demora perceptível"*,
 * and the interesting half is the FIRST number: the control did not even look
 * pressed.
 *
 * ## Why it was slow to *look* selected, which is a different bug from being slow
 *
 * `aria-current` is derived on the **server** from `searchParams`. That is the
 * right design — the URL is the source of truth and this component must not
 * become a second one — but it means the selected state cannot move until the
 * new server render lands. The control was correct and mute.
 *
 * `useLinkStatus` is Next's own answer for exactly this shape, and its docs name
 * the case: *"The destination route is dynamic and doesn't include a loading.js
 * file that would allow an instant navigation."* The hook must be called from a
 * **descendant** of the `Link`, so the indicator is a child element and the
 * anchor picks up its own pending styling through `:has()`.
 *
 * ## What is deliberately NOT done here
 *
 * **The pending state is presentational and nothing reads it back.**
 * `aria-current` still comes from the server, so a screen reader is never told a
 * period is current before it is, and no local state becomes the source of
 * truth. The indicator is `aria-hidden`.
 *
 * **No content is rendered optimistically.** Nothing of another period — or
 * another account — can appear during the transition, because nothing is shown
 * that did not come from the server render for the URL being navigated to.
 *
 * ## `prefetch` is explicit, and the measurement reversed the guess
 *
 * The first reading of `link.md` suggested `prefetch` would be expensive here:
 * the strip sits at the top of the page, so all three links are in the viewport
 * at once, and each is a full server render of a dynamic route. Measured against
 * the production build, that was **wrong in both directions**:
 *
 * | | default (`auto`) | `prefetch` |
 * |---|---|---|
 * | prefetch requests on load | **11** | **8** |
 * | tap -> content | ~1 365ms | **39 / 231 / 48ms** |
 * | requests caused by the tap | 3 | **0** / 2 / 2 |
 *
 * Fewer requests, not more — the default was already issuing partial prefetches
 * for every link on the page, and for a dynamic route those reach only "the
 * partial route down to the nearest segment with a `loading.js` boundary", which
 * is a shell that buys nothing. `prefetch` fetches the route **and its data**,
 * and a tap then costs zero requests.
 *
 * Safe for the reason the owner's condition asks about: a prefetch is an
 * ordinary RSC render of the **same route**, under the **same session**, for the
 * **same owner** — it reaches no other account, and nothing it returns is shown
 * until the navigation it belongs to commits.
 */
function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden className="review-tab-pending" data-pending="true" /> : null;
}

export function ReviewTabs({
  currentTab,
  hrefFor,
  label,
  labels,
}: {
  currentTab: ReviewTab;
  /** Built by the page, so the URL shape stays where the route lives. */
  hrefFor: Readonly<Record<ReviewTab, string>>;
  label: string;
  labels: Readonly<Record<ReviewTab, string>>;
}) {
  return (
    <nav aria-label={label} className="review-tabs">
      {REVIEW_TABS.map((value) => (
        <Link
          aria-current={currentTab === value ? "page" : undefined}
          className="review-tab"
          href={hrefFor[value]}
          prefetch
          key={value}
        >
          {labels[value]}
          <PendingIndicator />
        </Link>
      ))}
    </nav>
  );
}

"use client";

/**
 * `2K-CONT-004` / `2K-CONT-006` — what the user sees on coming back.
 *
 * ## Rendered as normal, not as an error
 *
 * ADR-100 is explicit about this. An unchanged object still requires a fresh
 * confirmation, and presenting that as a fault would train the user to read a
 * correct outcome as a failure. So the copy says what happened — the preview
 * was recomputed, so it has to be asked again — and the card renders in the
 * ordinary `previewed` state.
 *
 * ## It invents nothing
 *
 * The continuity handle carries no command, no patch and no clock, so the
 * *earlier* preview is not reconstructible. That is by design (T-2K-02), and
 * `2K-CONT-006`'s third branch is what it produces: say generically that the
 * earlier preview no longer applies, show what the object looks like **now**,
 * and require the action to be stated again. There is deliberately no attempt
 * here to describe a difference, because describing one would require having
 * kept the thing that is forbidden to keep.
 *
 * ## It has no controls, and cannot grow one
 *
 * The card is built by `readOnlyPreviewCard` or `unavailableCard`, and
 * `ConversationCardView` drops any control passed for a read-only type. So the
 * return path is incapable of applying anything — `2K-CONT-007` holds by
 * construction rather than by this component remembering not to.
 */

import { useEffect, useRef } from "react";

import type { Locale } from "@/lib/preferences";

import { ConversationCardView } from "./card";
import type { ContinuityResumption } from "./continuity";
import { getConversationCardsCopy } from "./copy";

export function ResumedCard({
  locale,
  resumption,
}: {
  locale: Locale;
  resumption: ContinuityResumption;
}) {
  const copy = getConversationCardsCopy(locale);
  const region = useRef<HTMLDivElement | null>(null);

  /*
   * `2K-A11Y-006`: exactly one focus move per resolved turn. The user arrived
   * by navigation expecting to be put back where they were, so the resumption
   * is where focus belongs — and it is the only thing on this page that moves
   * it, since the composer's own effect fires only on an action round.
   */
  useEffect(() => {
    region.current?.focus();
  }, []);

  return (
    <div
      aria-label={copy.resumed.regionLabel}
      className="conversation-resumed"
      ref={region}
      role="region"
      tabIndex={-1}
    >
      <p className="conversation-resumed-note">{copy.resumed.note}</p>
      <ConversationCardView card={resumption.card} locale={locale} />
      {/*
        The position, as a link rather than a scroll side effect: it works
        without JavaScript, it is announceable, and it says where it goes.
      */}
      <a className="conversation-resumed-anchor" href={`#${resumption.anchor}`}>
        {copy.resumed.backToMessage}
      </a>
    </div>
  );
}

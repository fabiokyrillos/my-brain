"use client";

/**
 * `2J-PRIVACY-001`, the review-summary clause.
 *
 * ## Why this masks unconditionally
 *
 * OD-2J-1 says review summaries are "hidden/masked by default, explicit reveal
 * required", and that sensitive content is never silently folded into ordinary
 * review copy.
 *
 * Every other governed surface keys its masking on a row's `sensitivity`. This
 * one cannot: **`summaries` has no sensitivity column.** A review is generated
 * *over a period*, so it can contain anything the period contained — a
 * `highly_sensitive` entry's substance can end up inside a paragraph that
 * carries no classification of its own, which is precisely the "silently
 * summarized into ordinary review copy" the decision names.
 *
 * There were three ways out and only one is available:
 *
 *   1. classify summaries — a new column, a third migration, a **stop
 *      condition** under ADR-095's budget;
 *   2. mask nothing and hope — the decision forbids it;
 *   3. **treat every summary as potentially sensitive** and mask by default.
 *
 * (3) needs no schema and is the conservative reading. The cost is real and
 * worth stating: a user who has nothing sensitive still taps to read their own
 * review. That is the price of a summary the product cannot classify, and it is
 * cheaper than the alternative.
 *
 * The reveal is **local and transient**, like every other reveal in this
 * contract — no preference is written, and reopening the page hides it again.
 */

import { useState } from "react";

import { NO_REVEALS, resolveContent } from "@/features/sensitivity/contracts";
import type { Locale } from "@/lib/preferences";

const copy = {
  "pt-BR": {
    hidden: "Resumo oculto por padrão.",
    reveal: "Mostrar resumo",
    hide: "Ocultar resumo",
  },
  en: {
    hidden: "Summary hidden by default.",
    reveal: "Show summary",
    hide: "Hide summary",
  },
} as const;

export function ReviewBody({
  reviewId,
  content,
  locale,
}: {
  reviewId: string;
  content: string;
  locale: Locale;
}) {
  const [revealed, setRevealed] = useState(false);
  const text = copy[locale];

  /*
    Routed through the central contract rather than an `if` here, so this
    surface cannot drift from Hoje and the attention queue -- `2J-PRIVACY-001`
    is about there being ONE decision, and a component that reasons about
    visibility on its own has already broken it even if it happens to agree.

    `highly_sensitive` is passed because that is this surface's posture for
    every summary: the level is the surface's, not the row's.
  */
  const state = resolveContent(
    "review_summary",
    "highly_sensitive",
    reviewId,
    revealed ? { revealed: new Set([reviewId]) } : NO_REVEALS,
  );

  return (
    <div className="review-body">
      {state.show ? (
        <p>{content}</p>
      ) : (
        <p className="review-masked" data-masked="true">{text.hidden}</p>
      )}
      {state.revealable ? (
        <button
          type="button"
          className="review-reveal"
          aria-expanded={state.show}
          onClick={() => setRevealed((value) => !value)}
        >
          {state.show ? text.hide : text.reveal}
        </button>
      ) : null}
    </div>
  );
}

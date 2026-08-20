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
 *   1. classify summaries — a new column, a migration, a **stop condition**;
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
 *
 * ## What changed when reviews got their own page
 *
 * This used to take `content: string` and render `<p>{content}</p>`, which is
 * how the stored Markdown reached the screen with its `##`, `###` and `**`
 * intact and its newlines collapsed. It now takes **`children`** — the caller
 * parses and renders, this decides only whether the reader may see it.
 *
 * That is the same division `ProtectedContent` uses, and it is deliberate: a
 * disclosure that also formats is a disclosure with an opinion about what it is
 * withholding. It is not `ProtectedContent` itself because that component
 * resolves a **row's** classification, and this surface's level belongs to the
 * surface — every summary, always, whatever the row says.
 *
 * The control also moved: the history list no longer discloses anything, so the
 * only place this mounts is a review's own page.
 */

import { useState, type ReactNode } from "react";

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

export function ReviewDisclosure({
  children,
  reviewId,
  locale,
}: {
  /** What the page would have rendered. Never read here, only withheld or passed through. */
  children: ReactNode;
  reviewId: string;
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
      {state.show ? children : (
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

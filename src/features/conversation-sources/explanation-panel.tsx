"use client";

/**
 * `2K-EXPL-001` … `2K-EXPL-007` — the disclosure panel.
 *
 * ## Progressive, and never blocking
 *
 * A native `<details>`, closed. The answer is above it and stays readable
 * whether or not this is ever opened — `2K-EXPL-001`'s whole point is that
 * explanation is available, not imposed. Native rather than a custom
 * disclosure because `<details>`/`<summary>` is keyboard-operable, announced,
 * and works before hydration; a `useState` toggle would be three of those
 * things at best.
 *
 * ## It renders facts, and only the two it has
 *
 * There is no count here because there is no count in the payload. `2K-EXPL-003`
 * asks for a bounded statement, and the boundary is the shape of
 * `AnswerExplanation` — two booleans — rather than this component's restraint.
 *
 * ## It is not drawn when there is nothing to say
 *
 * An empty panel invites the user to open it and find out that nothing was
 * excluded, which is a worse experience than not offering it. `hasDisclosure`
 * decides, and an answer written before this slice recorded no explanation at
 * all — that is `null`, not "nothing was excluded", and it draws nothing.
 *
 * ## The two correction paths, told apart honestly (`2K-EXPL-007`)
 *
 * Correcting the **source** works and always has: every source in the block
 * links to its object, and memory edit and archive ship. Correcting the
 * **interpretation** has no domain behind it this phase — no table records it,
 * no action consumes it. So the panel **says that** instead of offering a
 * control that records nothing. A button that quietly does nothing is exactly
 * the failure this requirement exists to prevent.
 */

import type { Locale } from "@/lib/preferences";

import { getConversationSourcesCopy } from "./copy";
import {
  hasDisclosure,
  interpretationCorrectionHasDomainEffect,
  type AnswerExplanation,
} from "./explanation";

export function ExplanationPanel({
  explanation,
  locale,
}: {
  explanation: AnswerExplanation | null;
  locale: Locale;
}) {
  const copy = getConversationSourcesCopy(locale).explanation;
  if (!hasDisclosure(explanation)) return null;

  return (
    <details className="conversation-explanation">
      <summary>{copy.summary}</summary>
      <div className="conversation-explanation-body">
        <ul>
          {explanation?.weakMatchesExcluded ? <li>{copy.weakMatches}</li> : null}
          {explanation?.archivedMemoriesExcluded ? <li>{copy.archivedMemories}</li> : null}
        </ul>
        <p className="conversation-explanation-correct-title">{copy.correctSourceTitle}</p>
        <p>{copy.correctSource}</p>
        {interpretationCorrectionHasDomainEffect() ? null : (
          <p className="conversation-explanation-no-effect">{copy.interpretationNoEffect}</p>
        )}
      </div>
    </details>
  );
}

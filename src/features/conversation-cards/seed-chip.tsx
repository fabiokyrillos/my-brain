"use client";

/**
 * Life Brain B.7 — one chip, shared by the starters and the suggestions.
 *
 * ## The principle this does not revoke
 *
 * `suggestion-row.tsx` has always said why a suggestion was text and not a
 * control: *"Making it a control that submitted a question on their behalf would
 * put words in their mouth and turn a hint into an action."* That objection is
 * to **submitting**, and it still stands. What the owner asked for on 5 November
 * 2026 is the other half — *"para eu clicar, e já preencher isso embaixo. Mas
 * lembre que é preencher, não enviar."*
 *
 * So the distinction the codebase now holds is sharper than "text or control":
 *
 *   - **filling** the field is the owner's question arriving where they can read
 *     it, edit it or delete it, with the send button still unpressed;
 *   - **sending** it is the product speaking for them, and nothing here does
 *     that.
 *
 * There is no `<form>`, no `formAction`, no `type="submit"` and no
 * `requestSubmit` on this path, and `phase-2k-suggestion-guard.test.ts` fails
 * the build if one appears.
 *
 * ## The cost, declared
 *
 * `SuggestionRow` was a server component — *"it adds nothing to the client
 * bundle of a page that renders it"*. Filling a field needs client state, so
 * that sentence is no longer true, and this is the file that spends it. One
 * small client component shared by both chip surfaces, rather than two.
 *
 * ## Why there is still a path with no button
 *
 * When no composer is listening — no provider above, or the client has not
 * hydrated — a button would look live and do nothing, which is precisely the
 * defect the owner reported. So the chip degrades honestly: to its link where
 * one exists (the starters keep `?q=`, which has always worked without
 * JavaScript), and to plain text where one does not (a suggestion never had a
 * link and does not gain one here).
 */

import { Button, ButtonLink } from "@/components/ui";
import { useComposerSeed } from "@/features/capture/composer-seed";

export function SeedChip({
  question,
  fillLabel,
  href,
}: {
  /** The sentence that lands in the field, and the chip's visible text. */
  question: string;
  /** What the control announces it does — never "ask", always "put in the field". */
  fillLabel: string;
  /**
   * Where the chip points when no composer is listening. Omitted for a
   * suggestion, which degrades to text rather than inventing a destination.
   */
  href?: string;
}) {
  const seed = useComposerSeed();

  if (seed === null || !seed.ready) {
    return href === undefined ? (
      <span className="conversation-suggestion-text">{question}</span>
    ) : (
      <ButtonLink href={href} size="sm" variant="secondary">
        {question}
      </ButtonLink>
    );
  }

  return (
    <Button
      aria-label={fillLabel}
      data-seed-chip="fill"
      onClick={() => seed.fill(question)}
      size="sm"
      type="button"
      variant="secondary"
    >
      {question}
    </Button>
  );
}

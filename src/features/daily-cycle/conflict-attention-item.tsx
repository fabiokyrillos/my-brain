"use client";

/**
 * A conflict row inside the existing "Precisa de você" queue
 * (`2N-CONFLICT-002`/`003`/`006`).
 *
 * ## It fires no analytics event, and that is required twice over
 *
 * `NeedsAttentionItemRow` records `needs_attention_item_opened` on click. That
 * event validates `attentionReason` against a **five-member enum inside
 * Postgres** (`202607170024:206-212`), so a row bearing a sixth reason would
 * raise `22023` at runtime rather than fail a type check. Independently:
 * telemetry for this family belongs to 2N.7, whose migration M2 is the only one
 * left in the phase's budget. So there is no emitter here, and adding one is a
 * migration before it is a line of TypeScript.
 *
 * ## It shows both dates and picks neither
 *
 * `2N-CONFLICT-002` forbids implicit precedence. The row prints `valid_from` and
 * `valid_until` side by side, in the owner's zone and locale, says in plain words
 * why the assistant did not decide, and offers one labelled action that states
 * what it will change. Nothing here reads `confidence`, and nothing here shows an
 * id, a table name or a fingerprint.
 */

import { formatInstant } from "@/lib/time/instant-format";
import { presentationFor } from "@/features/sensitivity/contracts";

import type { ConflictAttentionItemView } from "./contracts";
import { getConflictSectionCopy, getDailyCycleCopy, type DailyCycleLocale } from "./copy";

export function ConflictAttentionItemRow({ item, locale, agentName, surface, timeZone }: {
  item: ConflictAttentionItemView;
  locale: DailyCycleLocale;
  agentName: string;
  /**
   * Which governed surface is rendering this row (`2J-PRIVACY-001`).
   *
   * **Required, and not a constant inside this file.** The whole point of
   * `GOVERNED_SURFACES` is that the *surface* decides what may be shown, and
   * `NeedsAttentionItemRow` takes this prop for exactly the same reason. `hoje`
   * and `attention` happen to carry identical rules today; hardcoding one of
   * them would make this row obey the wrong one silently on the day they
   * diverge, and nothing would fail.
   */
  surface: "home" | "needs_attention";
  /** The owner's zone (`LDC-DAILY-001`). Required, never defaulted to the device's. */
  timeZone: string;
}) {
  const copy = getDailyCycleCopy(locale, agentName);
  const text = getConflictSectionCopy(locale);
  const reason = copy.attentionReasons[item.reason];
  const masked = presentationFor(surface === "home" ? "hoje" : "attention", item.sensitivity).outcome === "mask";

  return (
    <a className="list-row needs-attention-row conflict-row" href={item.action.href}>
      <div className="list-row-main">
        <strong>{reason.title}</strong>
        <p>{reason.description}</p>

        {/*
          The two dates, as a description list rather than a sentence: they are
          the evidence, and a screen reader should be able to reach each label
          with its value rather than parse them out of prose.
        */}
        <dl className="conflict-dates">
          <div>
            <dt>{text.validFromLabel}</dt>
            <dd>{formatInstant(item.validFrom, "dayAndTime", locale, timeZone)}</dd>
          </div>
          <div>
            <dt>{text.validUntilLabel}</dt>
            <dd>{formatInstant(item.validUntil, "dayAndTime", locale, timeZone)}</dd>
          </div>
        </dl>

        {/*
          Masked in place, exactly as the entry rows beside it are: the row stays,
          so the count and the queue keep telling the truth, and only the memory's
          own words are withheld. The dates above are not content — they are the
          fault being reported, and hiding them would leave an item that cannot
          explain itself.
        */}
        {masked ? (
          <p className="home-masked" data-masked="true">{text.masked}</p>
        ) : (
          <p className="conflict-content">{item.content}</p>
        )}

        <p className="conflict-why">{text.whyNotDecided}</p>
        <p className="conflict-what">{text.whatYouCanDo}</p>
      </div>
      <div className="list-meta">
        <span className="needs-attention-action-hint">{copy.actions[item.action.id]}</span>
      </div>
    </a>
  );
}

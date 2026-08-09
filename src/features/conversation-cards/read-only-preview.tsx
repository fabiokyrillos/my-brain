"use client";

/**
 * `2K-CARD-007` — a read-only preview of an object the conversation referred to.
 *
 * Entries, people, projects, organizations and files. OD-2K-B keeps all five
 * out of mutation this phase, and this component is what that looks like in
 * the product: a type label, an optional bounded snippet under the central
 * sensitivity contract, and a link. There is no form, no submit and no action
 * — not because none was passed, but because none can be written here without
 * failing `phase-2k-card-guard.test.ts`.
 *
 * The one control it can render is the mask's reveal, which belongs to
 * `ConversationCardView`. A reveal is a *disclosure* control: it writes
 * nothing, persists nothing, and lasts one render.
 */

import Link from "next/link";

import type { Locale } from "@/lib/preferences";

import { ConversationCardView } from "./card";
import type { ConversationCard } from "./contracts";
import { getConversationCardsCopy } from "./copy";

export function ReadOnlyPreview({
  card,
  locale,
}: {
  card: ConversationCard;
  locale: Locale;
}) {
  const copy = getConversationCardsCopy(locale);

  return (
    <div className="conversation-card-readonly">
      <ConversationCardView card={card} locale={locale} />
      {card.href === null ? null : (
        <Link className="conversation-card-open" href={card.href}>
          {copy.open}
        </Link>
      )}
    </div>
  );
}

"use client";

import { recordNeedsAttentionItemOpened } from "@/features/product-analytics/interaction-events";
import { formatInstant } from "@/lib/time/instant-format";
import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";
import type { NeedsAttentionItemView } from "./contracts";

export function NeedsAttentionItemRow({ item, locale, agentName, surface, timeZone }: {
  item: NeedsAttentionItemView;
  locale: DailyCycleLocale;
  agentName: string;
  surface: "home" | "needs_attention";
  /**
   * The owner's zone (`LDC-DAILY-001`). Required, never defaulted — and this is
   * a client component, so the zone it fell back to was the *device's*, which
   * made the same row read differently on a phone in another country.
   */
  timeZone: string;
}) {
  const copy = getDailyCycleCopy(locale, agentName);
  const actionLabel = copy.actions[item.primaryAction.id];
  const timestamp = formatInstant(item.occurredAt, "dayAndTime", locale, timeZone);

  return (
    <a
      href={item.primaryAction.href ?? "#"}
      className="list-row needs-attention-row"
      onClick={() => recordNeedsAttentionItemOpened({
        entryId: item.entryId,
        attentionReason: item.kind,
        surface,
        locale,
      })}
    >
      <div className="list-row-main">
        <strong>{item.title}</strong>
        <p>{item.explanation}</p>
      </div>
      <div className="list-meta">
        <span>{timestamp}</span>
        <span className="needs-attention-action-hint">{actionLabel}</span>
      </div>
    </a>
  );
}

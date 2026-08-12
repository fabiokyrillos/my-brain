import Link from "next/link";
import { formatInstant } from "@/lib/time/instant-format";
import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";
import type { InboxItemView } from "./contracts";

export function InboxItemRow({ item, locale, agentName, timeZone }: {
  item: InboxItemView;
  locale: DailyCycleLocale;
  agentName: string;
  /**
   * The owner's zone (`LDC-DAILY-001`). Required, never defaulted: this row
   * rendered in the host's zone until this initiative, which on a server is UTC
   * — so a São Paulo owner saw tomorrow's date from 21:00 onward, every day.
   */
  timeZone: string;
}) {
  const copy = getDailyCycleCopy(locale, agentName);
  const stateCopy = copy.productStates[item.productState];
  const attentionCopy = item.attentionReason ? copy.attentionReasons[item.attentionReason] : null;
  const openHref = item.availableActions.find((action) => action.id === "open_entry")?.href ?? "#";
  const timestamp = formatInstant(item.significantAt, "dayAndTime", locale, timeZone);

  return (
    <Link href={openHref} className="list-row">
      <div className="list-row-main">
        <strong>{item.title}</strong>
        <p>{item.originalPreview}</p>
      </div>
      <div className="list-meta">
        <span>{timestamp}</span>
        {attentionCopy && <span className="list-attention-hint">{attentionCopy.title}</span>}
        <span className={`status-badge ${item.productState}`}>{stateCopy.label}</span>
      </div>
    </Link>
  );
}

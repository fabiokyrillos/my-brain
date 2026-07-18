import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";
import type { InboxItemView } from "./contracts";

export function InboxItemRow({ item, locale }: { item: InboxItemView; locale: DailyCycleLocale }) {
  const copy = getDailyCycleCopy(locale);
  const stateCopy = copy.productStates[item.productState];
  const attentionCopy = item.attentionReason ? copy.attentionReasons[item.attentionReason] : null;
  const openHref = item.availableActions.find((action) => action.id === "open_entry")?.href ?? "#";
  const timestamp = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(item.significantAt));

  return (
    <a href={openHref} className="list-row">
      <div className="list-row-main">
        <strong>{item.title}</strong>
        <p>{item.originalPreview}</p>
      </div>
      <div className="list-meta">
        <span>{timestamp}</span>
        {attentionCopy && <span className="list-attention-hint">{attentionCopy.title}</span>}
        <span className={`status-badge ${item.productState}`}>{stateCopy.label}</span>
      </div>
    </a>
  );
}

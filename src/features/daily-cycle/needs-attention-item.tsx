import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";
import type { NeedsAttentionItemView } from "./contracts";

export function NeedsAttentionItemRow({ item, locale }: { item: NeedsAttentionItemView; locale: DailyCycleLocale }) {
  const copy = getDailyCycleCopy(locale);
  const actionLabel = copy.actions[item.primaryAction.id];
  const timestamp = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(item.occurredAt));

  return (
    <a href={item.primaryAction.href ?? "#"} className="list-row needs-attention-row">
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

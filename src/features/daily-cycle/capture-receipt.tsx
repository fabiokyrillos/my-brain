import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";
import type { CaptureReceipt } from "./contracts";

export function CaptureReceiptView({
  receipt,
  locale,
}: {
  receipt: CaptureReceipt;
  locale: DailyCycleLocale;
}) {
  const copy = getDailyCycleCopy(locale);

  return (
    <div className="capture-receipt" role="status">
      <p>{copy.messages[receipt.messageKey]}</p>
      {receipt.safeHref && (
        <a href={receipt.safeHref}>{locale === "pt-BR" ? "Ver registro" : "View record"}</a>
      )}
    </div>
  );
}

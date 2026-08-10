import Link from "next/link";
import { getDailyCycleCopy, type DailyCycleLocale } from "./copy";
import type { CaptureReceipt } from "./contracts";

export function CaptureReceiptView({
  receipt,
  locale,
  agentName,
}: {
  receipt: CaptureReceipt;
  locale: DailyCycleLocale;
  agentName: string;
}) {
  const copy = getDailyCycleCopy(locale, agentName);

  return (
    <div className="capture-receipt" role="status">
      <p>{copy.messages[receipt.messageKey]}</p>
      {receipt.safeHref && (
        <Link href={receipt.safeHref}>{locale === "pt-BR" ? "Ver registro" : "View record"}</Link>
      )}
    </div>
  );
}
